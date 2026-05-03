/**
 * Build-time prefetch — generates `public/data/elections/{id}.json`
 * from the elections submodule's PxWeb client + normalizer.
 *
 * For each election in `src/data/catalog.ts`:
 *   - Map our `ElectionTypeId` ("ek"|"kunta"|…) to the submodule's
 *     `ElectionType` ("parliamentary"|"municipal"|…).
 *   - Call `loadPartyResults(year, undefined, electionType)` to get
 *     party-by-area rows for every region in one query.
 *   - Aggregate into one `RegionResult` per (level, area) pair at
 *     vaalipiiri / kunta / hyvinvointialue level. Drop äänestysalue
 *     (level 3 is out of scope for v1) and koko_suomi (the country
 *     total is computed by the UI from the visible regions).
 *   - Translate the submodule's area_id to a canonical id that the
 *     geometry layer can join on:
 *       VP## → 2-digit vp code (matches `data/fi-vaalipiirit.json` `code`)
 *       HV## → 2-digit hv code (regional elections only)
 *       KU### or 3-digit → 3-digit kuntakoodi (matches geometry)
 *
 * Failures (no PxWeb table, 403 cell-count, future elections) are
 * caught and written as `{ status: "no_data" }` so the UI can render
 * the .nodata crosshatch instead of a fatal error.
 *
 * Phase 1 first cut: party shares + total votes only. Turnout and
 * candidate lists are deferred to follow-up phases (see BACKLOG.md).
 */

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ELECTIONS } from "../src/data/catalog";
import type { ElectionTypeId, RegionResult } from "../src/types/elections";
import type { FixtureFile } from "../src/data/elections-source";

import { loadPartyResults } from "../submodules/elections/src/data/loaders";
import { pxwebClient } from "../submodules/elections/src/api/pxweb-client";
import { normalizePartyTable } from "../submodules/elections/src/data/normalizer";
import {
  findPartyTableForType,
  getDatabasePath,
} from "../submodules/elections/src/data/election-tables";
import type {
  ElectionRecord,
  ElectionType,
} from "../submodules/elections/src/data/types";

/* ─── Election-type bridge ──────────────────────────────────── */

const TYPE_MAP: Record<ElectionTypeId, ElectionType> = {
  ek: "parliamentary",
  kunta: "municipal",
  alue: "regional",
  eu: "eu_parliament",
  pres: "presidential",
};

/* ─── Area-id translation (PxWeb → geometry) ────────────────── */

/** Normalise PxWeb area codes to our fixture form.
 *
 *  Year-specific tables (13t2 / 14vm / 14h2) use the `vp_ku_prefix`
 *  format with letters: `VP01`, `KU091`, `HV02`. Strip the prefix.
 *
 *  Multi-year tables — used for kunta2021 (14z7) and eu2019 (14gv)
 *  via the year-filtered fallback — use numeric-only codes:
 *
 *  - 6-digit (municipal, parliamentary): `<vp:2><sub:1><kuntakoodi:3>`.
 *    Aggregate rows end in `0000` and represent the vp; everything
 *    else is a kunta and the last 3 digits are the kuntakoodi we
 *    have in `data/fi-kunnat.json`.
 *  - 5-digit (EU): `<vp:2><kuntakoodi:3>`. Last 3 digits = `000`
 *    means vp aggregate; otherwise = kuntakoodi.
 *
 *  Output: 2-digit string for vp/hv, 3-digit kuntakoodi for kunta. */
function canonicalizeAreaId(rawId: string): string {
  if (rawId.startsWith("VP") || rawId.startsWith("HV")) return rawId.slice(2);
  if (rawId.startsWith("KU")) return rawId.slice(2);

  if (/^\d{6}$/.test(rawId)) {
    if (rawId.endsWith("0000")) return rawId.slice(0, 2);
    return rawId.slice(-3);
  }
  if (/^\d{5}$/.test(rawId)) {
    if (rawId.endsWith("000")) return rawId.slice(0, 2);
    return rawId.slice(-3);
  }
  return rawId;
}

/* ─── Aggregate-row filter ──────────────────────────────────── */

/** PxWeb tables include "all parties" aggregate rows alongside the
 *  per-party rows. The schemas declare these via `party_total_code`
 *  ("SSS" for parliamentary/municipal/regional, "00" for EU). We
 *  drop them so they don't end up as a 100%-share fake "party"
 *  in the fixture (which would dominate `pickWinner` and break
 *  every coloring mode that reads `shares`). */
const AGGREGATE_PARTY_IDS = new Set([
  "SSS",
  "00",
  "TOTAL",
  "00000",
]);

const AGGREGATE_NAME_PATTERNS: RegExp[] = [
  /^puolueet\s+yhteens/i,
  /^yhteens(?:ä|a)$/i,
  /^kaikki\s+puolueet/i,
  /^all\s+parties$/i,
];

function isAggregateParty(
  partyId: string | undefined,
  partyName: string | undefined,
): boolean {
  if (partyId && AGGREGATE_PARTY_IDS.has(partyId)) return true;
  if (partyName) {
    for (const re of AGGREGATE_NAME_PATTERNS) {
      if (re.test(partyName)) return true;
    }
  }
  return false;
}

/* ─── Party-name → slug translation ─────────────────────────── */

/** PxWeb returns party_id as a table-internal code (e.g. "01", "02")
 *  whose meaning shifts between elections. We match on `party_name`
 *  (the human text) which IS stable across years.
 *
 *  Patterns are checked in order; first match wins. */
const PARTY_NAME_MATCHERS: ReadonlyArray<{ re: RegExp; slug: string }> = [
  { re: /kokoomus|\bkok\.?\b/i, slug: "kok" },
  { re: /sosialidemokraat|\bsdp\b/i, slug: "sdp" },
  { re: /perussuomalaiset|\bps\b/i, slug: "ps" },
  { re: /\bkeskusta\b|\bkesk\.?\b/i, slug: "kesk" },
  { re: /\bvihr/i, slug: "vihr" },
  { re: /vasemmistoliitto|\bvas\.?\b/i, slug: "vas" },
  { re: /ruotsalainen kansanpuolue|\brkp\b/i, slug: "rkp" },
  { re: /kristillisdemokraatit|\bkd\b/i, slug: "kd" },
];

function partyKey(partyName: string | undefined, partyId: string | undefined): string | null {
  const name = (partyName ?? "").trim();
  if (!name && !partyId) return null;
  for (const { re, slug } of PARTY_NAME_MATCHERS) {
    if (re.test(name)) return slug;
  }
  // Smaller / historical parties: derive a stable key from the name
  // (lowercase, alpha-only, max 12 chars), prefixed `_` so consumers
  // can spot non-canonical entries. Keeps party identity across years.
  if (name) {
    const slug = "_" + name.toLowerCase().replace(/[^a-zåäö]/g, "").slice(0, 12);
    if (slug.length > 1) return slug;
  }
  return partyId ?? null;
}

/* ─── Aggregation ───────────────────────────────────────────── */

/** ElectionRecord rows for one (year, electionType) call → array of
 *  `RegionResult`, one per vp/kunta/hv area present. */
function aggregateRows(
  rows: ElectionRecord[],
  electionId: string,
): RegionResult[] {
  const groups = new Map<string, ElectionRecord[]>();
  for (const r of rows) {
    if (
      r.area_level !== "vaalipiiri" &&
      r.area_level !== "kunta" &&
      r.area_level !== "hyvinvointialue"
    ) {
      continue;
    }
    const key = `${r.area_level}|${r.area_id}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const out: RegionResult[] = [];
  for (const records of groups.values()) {
    const first = records[0]!;
    // Sum across all party rows for the area's total vote count.
    // Skip aggregate rows ("Puolueet yhteensä") — counting them
    // would double the totalVotes.
    const partyOnly = records.filter(
      (r) => !isAggregateParty(r.party_id, r.party_name),
    );
    const totalVotes = partyOnly.reduce((s, r) => s + (r.votes || 0), 0);
    const shares: Record<string, number> = {};
    for (const r of partyOnly) {
      const key = partyKey(r.party_name, r.party_id);
      if (!key) continue;
      // Some PxWeb tables emit duplicate party rows (e.g. by gender);
      // sum shares within a slug. The submodule normalizer should
      // already collapse these, but defensive sum is cheap.
      shares[key] = (shares[key] ?? 0) + (r.vote_share ?? 0);
    }
    out.push({
      regionId: canonicalizeAreaId(first.area_id),
      electionId,
      votes: totalVotes,
      voters: 0, // TODO Phase 1.x: fetch from turnout_by_aanestysalue table
      turnout: 0,
      shares,
    });
  }
  return out;
}

/* ─── Per-election builder ─────────────────────────────────── */

async function buildFixture(
  electionId: string,
  typeId: ElectionTypeId,
  year: number,
): Promise<FixtureFile> {
  const electionType = TYPE_MAP[typeId];

  if (electionType === "presidential") {
    // Round is encoded in the electionId suffix ("pres2024r1" → 1).
    const round = electionId.endsWith("r2") ? 2 : 1;
    return buildPresidentialFixture(electionId, year, round);
  }

  // Try the submodule's loader first. For multi-year tables that
  // don't have a year-specific equivalent (kunta2021's 14z7,
  // eu2019's 14gv) it fetches *all years* in one query and 403s
  // on the cell-count limit. Catch that and fall back to a
  // year-filtered direct query.
  let rows: ElectionRecord[];
  try {
    const res = await loadPartyResults(year, undefined, electionType);
    rows = res.rows;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("403")) {
      console.warn(`[prefetch]   ${electionId}: ${msg} → status:no_data`);
      return { electionId, status: "no_data" };
    }
    console.warn(`[prefetch]   ${electionId}: 403 on multi-year fetch — retrying year-filtered`);
    try {
      rows = await loadPartyResultsYearFiltered(year, electionType);
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      console.warn(`[prefetch]   ${electionId}: year-filtered retry failed: ${msg2} → status:no_data`);
      return { electionId, status: "no_data" };
    }
  }

  const areas = aggregateRows(rows, electionId);
  if (areas.length === 0) {
    console.warn(`[prefetch]   ${electionId}: 0 areas after aggregation → status:no_data`);
    return { electionId, status: "no_data" };
  }
  return { electionId, areas };
}

/** Direct query that always passes a Vuosi filter, regardless of
 *  whether the table is multi-year. The submodule's loader skips
 *  the year filter for multi-year tables (so the cache holds the
 *  full multi-year response), which makes all-areas queries 403.
 *  Filtering by year drops cell count enough to stay under the
 *  ~12,000-cell limit. */
async function loadPartyResultsYearFiltered(
  year: number,
  electionType: ElectionType,
): Promise<ElectionRecord[]> {
  const tables = findPartyTableForType(electionType);
  if (!tables?.party_by_kunta || !tables.party_schema) {
    throw new Error(`No party table for ${electionType}`);
  }
  const schema = tables.party_schema;
  const dbPath = getDatabasePath(tables);
  const tableId = tables.party_by_kunta;
  const metadata = await pxwebClient.getTableMetadata(dbPath, tableId);

  type FilterItem = {
    code: string;
    selection: { filter: "item" | "all"; values: string[] };
  };
  const filters: FilterItem[] = [];

  if (metadata.variables.some((v) => v.code === "Vuosi")) {
    filters.push({
      code: "Vuosi",
      selection: { filter: "item", values: [String(year)] },
    });
  }
  if (schema.gender_var && schema.gender_total_code) {
    filters.push({
      code: schema.gender_var,
      selection: { filter: "item", values: [schema.gender_total_code] },
    });
  }
  filters.push({
    code: schema.party_var,
    selection: { filter: "all", values: ["*"] },
  });
  filters.push({
    code: schema.area_var,
    selection: { filter: "all", values: ["*"] },
  });
  filters.push({
    code: schema.measure_var,
    selection: {
      filter: "item",
      values: [schema.votes_code, schema.share_code],
    },
  });

  const response = await pxwebClient.queryTable(
    dbPath,
    tableId,
    { query: filters, response: { format: "json" as const } },
  );
  return normalizePartyTable(response, metadata, year, electionType, schema);
}

/** Hardcoded candidate-id → party-slug mapping for table 14db.
 *
 *  Why hardcoded: PxWeb's 14db gives candidate_id × area × votes
 *  but no party affiliation. Affiliations are stable across the
 *  candidate's career, so a static lookup is correct + small.
 *
 *  Independents and minor-party candidates fall through to a
 *  derived `_<lastname>` slug so they're preserved as distinct
 *  entries in `shares` (consistent with the parliamentary path). */
const PRESIDENTIAL_CANDIDATE_PARTY: Record<string, string> = {
  // Pre-2018 candidates we keep around for completeness even though
  // their vp-boundary mapping is rough (see year filter below).
  "01": "sdp",   // Martti Ahtisaari
  "02": "rkp",   // Elisabeth Rehn
  "03": "kesk",  // Paavo Väyrynen
  "06": "vas",   // Claes Andersson
  "12": "sdp",   // Tarja Halonen
  "13": "kesk",  // Esko Aho
  "18": "kok",   // Sauli Niinistö
  "19": "kesk",  // Matti Vanhanen
  "20": "ps",    // Timo Soini
  "21": "kd",    // Bjarne Kallis
  "22": "rkp",   // Henrik Lax
  "24": "vihr",  // Pekka Haavisto
  "25": "sdp",   // Paavo Lipponen
  "26": "vas",   // Paavo Arhinmäki
  "27": "rkp",   // Eva Biaudet
  "28": "kd",    // Sari Essayah
  "29": "ps",    // Laura Huhtasaari
  "30": "sdp",   // Tuula Haatainen
  "31": "vas",   // Merja Kyllönen
  "32": "rkp",   // Nils Torvalds
  "33": "kok",   // Alexander Stubb
  "34": "ps",    // Jussi Halla-aho
  "35": "kesk",  // Olli Rehn (independent in 2024, but Keskusta-supported and former Kesk MEP — bucket as kesk for the map)
  "36": "vas",   // Li Andersson
  "37": "sdp",   // Jutta Urpilainen
  "38": "_aalt", // Mika Aaltola — independent
  "39": "_liike",// Harry Harkimo — Liike Nyt
};

/** Convert PxWeb 6-digit vp code (used by pres table 14db) to our
 *  canonical 2-digit form. `010000` → `"01"`.
 *
 *  Handles the 2013 vp reform by aggregating pre-2013 codes onto
 *  their post-2013 successors:
 *  - `810000` Kymi          → `08` Kaakkois-Suomi (renamed only)
 *  - `820000` Etelä-Savo    →
 *  - `910000` Pohjois-Savo  → `09` Savo-Karjala (3-vp merger)
 *  - `920000` Pohjois-Karjala →
 *
 *  Multiple old vps mapping to the same canonical naturally
 *  aggregate downstream (rows are grouped by canonical id, then
 *  votes summed by candidate-party). */
const PRE_2013_VP_REMAP: Record<string, string> = {
  "810000": "08",
  "820000": "09",
  "910000": "09",
  "920000": "09",
};

function presVpCodeToCanonical(code: string): string | null {
  if (!/^\d{6}$/.test(code)) return null;
  if (PRE_2013_VP_REMAP[code]) return PRE_2013_VP_REMAP[code]!;
  const prefix = code.slice(0, 2);
  if (parseInt(prefix, 10) > 13) return null; // unrecognised legacy code
  return prefix;
}

/** Build a presidential-election fixture from table 14db
 *  (candidate × vaalipiiri × year × round).
 *
 *  Direct PxWeb query — bypasses the submodule's
 *  `loadPresidentialByVaalipiiri` because that helper uses the
 *  wrong variable name (`Ehdokas` vs the actual `Ehdokkaat`).
 *  Tracked in BACKLOG: upstream patch needed.
 *
 *  Coverage: vaalipiiri-level only (the table doesn't break down
 *  by kunta). Drilling into a vp shows crosshatch on every kunta.
 *  Pre-2013 elections use the older 15-vp boundary set (Pohjois-
 *  Savo, Etelä-Savo, etc. as separate vps), which doesn't map
 *  onto our 2026 geometry — those years return no_data and are
 *  hidden from the picker. */
async function buildPresidentialFixture(
  electionId: string,
  year: number,
  round: 1 | 2,
): Promise<FixtureFile> {
  try {
    const resp = await pxwebClient.queryTable(
      "StatFin",
      "statfin_pvaa_pxt_14db",
      {
        query: [
          { code: "Vuosi", selection: { filter: "item", values: [String(year)] } },
          { code: "Ehdokkaat", selection: { filter: "all", values: ["*"] } },
          { code: "Vaalipiiri", selection: { filter: "all", values: ["*"] } },
          { code: "Kierros", selection: { filter: "item", values: [String(round)] } },
          { code: "Tiedot", selection: { filter: "item", values: ["pvaa_aanet"] } },
        ],
        response: { format: "json" as const },
      },
      "pvaa",
    );

    // Parse: each row's `key` is [Vuosi, Ehdokkaat, Vaalipiiri, Kierros].
    // Group by vaalipiiri, sum candidate votes by party slug.
    interface Row {
      candidateId: string;
      vpCode: string;
      votes: number;
    }
    const rows: Row[] = [];
    for (const r of resp.data) {
      const candidateId = String(r.key[1] ?? "");
      const vpCode = String(r.key[2] ?? "");
      const v = Number(r.values[0]);
      if (!Number.isFinite(v) || v <= 0) continue;
      // Skip the "Hyväksytyt äänet" / "Hylätyt äänet" aggregate rows.
      if (candidateId === "98" || candidateId === "99") continue;
      rows.push({ candidateId, vpCode, votes: v });
    }

    // Aggregate per vp.
    const byVp = new Map<string, Row[]>();
    for (const row of rows) {
      const canon = presVpCodeToCanonical(row.vpCode);
      if (!canon) continue;
      const arr = byVp.get(canon);
      if (arr) arr.push(row);
      else byVp.set(canon, [row]);
    }

    const areas: RegionResult[] = [];
    for (const [vpId, recs] of byVp.entries()) {
      const partyVotes = new Map<string, number>();
      let totalVotes = 0;
      for (const rec of recs) {
        const slug =
          PRESIDENTIAL_CANDIDATE_PARTY[rec.candidateId] ??
          `_cand${rec.candidateId}`;
        partyVotes.set(slug, (partyVotes.get(slug) ?? 0) + rec.votes);
        totalVotes += rec.votes;
      }
      if (totalVotes === 0) continue;

      const shares: Record<string, number> = {};
      for (const [party, votes] of partyVotes.entries()) {
        shares[party] = (votes / totalVotes) * 100;
      }
      areas.push({
        regionId: vpId,
        electionId,
        votes: totalVotes,
        voters: 0,
        turnout: 0,
        shares,
      });
    }

    if (areas.length === 0) {
      console.warn(`[prefetch]   ${electionId}: 0 areas after aggregation → status:no_data`);
      return { electionId, status: "no_data" };
    }
    return { electionId, areas };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[prefetch]   ${electionId}: ${msg} → status:no_data`);
    return { electionId, status: "no_data" };
  }
}


/* ─── Main ──────────────────────────────────────────────────── */

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const OUT_DIR = resolve(REPO_ROOT, "public/data/elections");
const PUBLIC_DATA = resolve(REPO_ROOT, "public/data");
const GEOMETRY_FILES = ["fi-vaalipiirit.json", "fi-kunnat.json"];
const SIZE_BUDGET_BYTES = 10 * 1024 * 1024;

/** Copy geometry files from `/data/` (source of truth) into
 *  `/public/data/` so Vite serves them at `/data/fi-*.json`. The
 *  prototype keeps its own copy under `data/` for file:// loading. */
async function copyGeometry(): Promise<void> {
  await mkdir(PUBLIC_DATA, { recursive: true });
  for (const f of GEOMETRY_FILES) {
    await copyFile(resolve(REPO_ROOT, "data", f), resolve(PUBLIC_DATA, f));
  }
  console.log(`[prefetch] copied ${GEOMETRY_FILES.length} geometry files into public/data/`);
}

async function main(): Promise<void> {
  await copyGeometry();
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`[prefetch] writing fixtures to ${OUT_DIR}`);

  let totalBytes = 0;
  let withData = 0;
  let withoutData = 0;

  for (const e of ELECTIONS) {
    const fixture = await buildFixture(e.id, e.typeId, e.year);
    const json = JSON.stringify(fixture);
    const path = resolve(OUT_DIR, `${e.id}.json`);
    await writeFile(path, json, "utf8");
    totalBytes += json.length;

    if (fixture.status === "no_data") {
      withoutData += 1;
    } else {
      withData += 1;
      const areaCount = fixture.areas?.length ?? 0;
      console.log(`[prefetch]   ${e.id}: ${areaCount} areas, ${(json.length / 1024).toFixed(1)} KB`);
    }
  }

  const totalKb = (totalBytes / 1024).toFixed(1);
  console.log(
    `[prefetch] done — ${withData} with data, ${withoutData} no_data, ${totalKb} KB total`,
  );

  if (totalBytes > SIZE_BUDGET_BYTES) {
    console.warn(
      `[prefetch] WARNING: output ${(totalBytes / 1024 / 1024).toFixed(2)} MB exceeds 10 MB budget`,
    );
  }
}

await main();
