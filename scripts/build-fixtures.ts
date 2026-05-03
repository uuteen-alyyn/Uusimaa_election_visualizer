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
import type { Candidate, ElectionTypeId, RegionResult } from "../src/types/elections";
import type { FixtureFile } from "../src/data/elections-source";

import { loadPartyResults } from "../submodules/elections/src/data/loaders";
import { pxwebClient } from "../submodules/elections/src/api/pxweb-client";
import { withCache } from "../submodules/elections/src/cache/cache";
import {
  normalizeCandidateByAanestysalue,
  normalizePartyTable,
} from "../submodules/elections/src/data/normalizer";
import {
  ALL_ELECTION_TABLES,
  findPartyTableForType,
  getDatabasePath,
} from "../submodules/elections/src/data/election-tables";
import type {
  ElectionRecord,
  ElectionType,
} from "../submodules/elections/src/data/types";

/* ─── 429 retry wrapper ─────────────────────────────────────── */

/** PxWeb's public throttle is more aggressive than the submodule's
 *  10 req/10 s client-side limiter — once we trip it, every call
 *  returns 429 for some minutes. Wrap each fetch in a backoff so a
 *  single warm-up run still completes; cached entries cover repeats. */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  const delays = [3000, 8000, 20000, 45000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const is429 = /\b429\b/.test(msg);
      if (!is429 || attempt === delays.length) throw e;
      const delay = delays[attempt]!;
      console.warn(
        `[prefetch]   ${label}: 429 — retry ${attempt + 1}/${delays.length} in ${(
          delay / 1000
        ).toFixed(0)}s`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

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
      r.area_level !== "hyvinvointialue" &&
      r.area_level !== "aanestysalue"
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

    const result: RegionResult = {
      regionId: canonicalizeAreaId(first.area_id),
      electionId,
      votes: totalVotes,
      voters: 0,
      turnout: 0,
      shares,
    };

    if (first.area_level === "aanestysalue") {
      const parentKunta = parseParentKunta(first.area_id);
      if (parentKunta) result.parentKunta = parentKunta;
      // Carry the friendly label (e.g. "001 Eteläinen") through —
      // the front-end has no geometry for äänestysalueet, so the
      // label has to ride on the data row.
      if (first.area_name) result.label = first.area_name;
      // For aa rows, keep the full PxWeb code as regionId
      // (canonicalize would have stripped the wrong things);
      // they're unique already so no canonicalisation needed.
      result.regionId = first.area_id;
    }

    out.push(result);
  }
  return out;
}

/** Extract the 3-digit kuntakoodi from an aa code.
 *
 *  - vp_ku_prefix format (parliamentary 13t2, municipal 14vm,
 *    EU 14h2): `01091001A` → vp 01 + kunta 091 + aa 001A → "091"
 *  - vp_prefix format (regional 14y2): `091001A` → kunta 091 +
 *    aa 001A → "091"
 *
 *  Returns null for codes that don't match either shape. */
function parseParentKunta(aaCode: string): string | null {
  // vp_ku_prefix: 2-digit vp + 3-digit kunta + …
  const m1 = /^\d{2}(\d{3})/.exec(aaCode);
  if (m1) return m1[1] ?? null;
  // vp_prefix: 3-digit kunta + …
  const m2 = /^(\d{3})\D/.exec(aaCode);
  if (m2) return m2[1] ?? null;
  return null;
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
    const res = await withRetry(
      () => loadPartyResults(year, undefined, electionType),
      `party-results ${electionId}`,
    );
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

  // Attach top-N candidates per vp + kunta when the election has
  // per-vp/hv candidate tables. Failures are non-fatal — fixture
  // ships without candidates and the Ledger renders an empty list.
  const unitKeys = unitKeysForCandidateTables(electionType, year);
  if (unitKeys.length > 0) {
    let totalCandRows = 0;
    for (const unitKey of unitKeys) {
      const candRows = await loadCandidatesForUnit(
        unitKey,
        electionType,
        year,
      );
      totalCandRows += candRows.length;
      attachCandidates(areas, candRows);
    }
    const withCands = areas.filter((a) => (a.candidates?.length ?? 0) > 0).length;
    console.log(
      `[prefetch]   ${electionId}: candidates ${totalCandRows} rows → ${withCands} regions`,
    );
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
  const metadata = await withRetry(
    () => pxwebClient.getTableMetadata(dbPath, tableId),
    `party-meta ${tableId}`,
  );

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

  const response = await withRetry(
    () =>
      pxwebClient.queryTable(dbPath, tableId, {
        query: filters,
        response: { format: "json" as const },
      }),
    `party-query ${tableId}`,
  );
  return normalizePartyTable(response, metadata, year, electionType, schema);
}

/* ─── Candidates (top-N per region) ─────────────────────────── */

/** Top-N cap per region. 90 is generous enough for the largest
 *  vp (Uusimaa, ~250 candidates) without filling the Ledger with
 *  three-vote stragglers. Same cap for vp + kunta — small kuntat
 *  naturally have fewer candidates with nonzero votes, so the
 *  effective list shortens itself. Keeps fixture payload under
 *  the 10 MB budget. */
const TOP_N_PER_REGION = 90;

/** Vp/hv-keyed list of candidate tables for an (electionType, year),
 *  e.g. `["helsinki", "uusimaa", …]` for parliamentary 2023.
 *  Empty array if the election has no per-unit candidate tables. */
function unitKeysForCandidateTables(
  electionType: ElectionType,
  year: number,
): string[] {
  const tables = ALL_ELECTION_TABLES.find(
    (t) => t.election_type === electionType && t.year === year,
  );
  if (!tables?.candidate_by_aanestysalue) return [];
  return Object.keys(tables.candidate_by_aanestysalue);
}

/** Fetch candidate rows for one vp/hv unit, filtered to vp + kunta
 *  aggregates (no aa-level rows) and votes-only (no share column).
 *
 *  This bypasses the submodule's `loadCandidateResults` because that
 *  helper requests every aa-level area code, which exceeds PxWeb's
 *  ~12 000-cell limit for the larger vp tables (Helsinki, Uusimaa).
 *  Filtering server-side to ~30 area codes × ~250 candidates × 1
 *  measure stays well under the limit. */
async function loadCandidatesForUnit(
  unitKey: string,
  electionType: ElectionType,
  year: number,
): Promise<ElectionRecord[]> {
  const tables = ALL_ELECTION_TABLES.find(
    (t) => t.election_type === electionType && t.year === year,
  );
  const tableId = tables?.candidate_by_aanestysalue?.[unitKey];
  if (!tables || !tableId) return [];

  const dbPath = getDatabasePath(tables);
  let metadata;
  try {
    metadata = await withRetry(
      () => pxwebClient.getTableMetadata(dbPath, tableId),
      `cand-meta ${tableId} (${unitKey})`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[prefetch]   candidates ${tableId} (${unitKey}) meta: ${msg}`);
    return [];
  }

  const AREA_VAR_CANDIDATES = [
    "Alue/Äänestysalue",
    "Äänestysalue",
    "Alue",
    "Vaalipiiri",
  ];
  const areaVar = metadata.variables.find((v) =>
    AREA_VAR_CANDIDATES.includes(v.code),
  );
  if (!areaVar) return [];

  // Keep vp/hv aggregates + 3-digit kunta codes; drop aa rows.
  const wantedAreas = areaVar.values.filter(
    (c) =>
      c.startsWith("VP") ||
      c.startsWith("HV") ||
      c.startsWith("KU") ||
      /^\d{3}$/.test(c),
  );
  if (wantedAreas.length === 0) return [];

  const tiedotVar = metadata.variables.find(
    (v) =>
      v.code === "Tiedot" ||
      v.code === "Äänestystiedot" ||
      v.code === "Puolueiden kannatus",
  );
  if (!tiedotVar) return [];
  const votesIdx = tiedotVar.values.findIndex(
    (_, i) =>
      (tiedotVar.valueTexts[i] ?? "").toLowerCase().includes("äänimäärä") ||
      (tiedotVar.valueTexts[i] ?? "").toLowerCase().includes("äänet"),
  );
  if (votesIdx < 0) return [];
  const votesCode = tiedotVar.values[votesIdx]!;

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
  filters.push({
    code: areaVar.code,
    selection: { filter: "item", values: wantedAreas },
  });
  filters.push({
    code: "Ehdokas",
    selection: { filter: "all", values: ["*"] },
  });
  // Use the SSS aggregate when available — drops 3× row count without
  // changing totals (each candidate sits in exactly one Valintatieto).
  const valintaVar = metadata.variables.find((v) => v.code === "Valintatieto");
  if (valintaVar) {
    const useSss = valintaVar.values.includes("SSS");
    filters.push({
      code: "Valintatieto",
      selection: {
        filter: "item",
        values: useSss ? ["SSS"] : ["1", "2", "3"],
      },
    });
  }
  if (metadata.variables.some((v) => v.code === "Kierros")) {
    filters.push({
      code: "Kierros",
      selection: { filter: "all", values: ["*"] },
    });
  }
  filters.push({
    code: tiedotVar.code,
    selection: { filter: "item", values: [votesCode] },
  });

  const cacheKey = `vaalit:cand:${tableId}:${electionType}:${year}:${unitKey}`;
  let response;
  try {
    const wrapped = await withCache(
      cacheKey,
      () =>
        withRetry(
          () =>
            pxwebClient.queryTable(dbPath, tableId, {
              query: filters,
              response: { format: "json" as const },
            }),
          `cand-query ${tableId} (${unitKey})`,
        ),
      24 * 60 * 60 * 1000,
    );
    response = wrapped.value;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[prefetch]   candidates ${tableId} (${unitKey}) query: ${msg}`,
    );
    return [];
  }
  return normalizeCandidateByAanestysalue(
    response,
    metadata,
    year,
    electionType,
  );
}

/** Group candidate rows by canonical region id (vp / kunta / hv),
 *  sort by votes desc within each group, take top N, attach to the
 *  matching `RegionResult` entries. Mutates `areas` in place. */
function attachCandidates(
  areas: RegionResult[],
  rows: ElectionRecord[],
): void {
  // Build canonical-id → top-N candidate list.
  const groups = new Map<string, ElectionRecord[]>();
  for (const r of rows) {
    if (
      r.area_level !== "vaalipiiri" &&
      r.area_level !== "kunta" &&
      r.area_level !== "hyvinvointialue"
    ) {
      continue;
    }
    if (!r.candidate_id || !r.votes) continue;
    const canon = canonicalizeAreaId(r.area_id);
    const arr = groups.get(canon);
    if (arr) arr.push(r);
    else groups.set(canon, [r]);
  }

  const aggregated = new Map<string, Candidate[]>();
  for (const [canon, recs] of groups.entries()) {
    // PxWeb may emit one row per (candidate, valintatieto, round);
    // sum votes per candidate so the top-N sort is correct.
    const byCand = new Map<string, Candidate>();
    for (const r of recs) {
      const id = r.candidate_id!;
      const existing = byCand.get(id);
      if (existing) {
        existing.votes += r.votes;
      } else {
        const slug =
          partyKey(r.party_name, r.party_id) ?? `_unknown`;
        byCand.set(id, {
          id,
          name: r.candidate_name ?? "",
          party: slug,
          votes: r.votes,
        });
      }
    }
    const sorted = Array.from(byCand.values())
      .filter((c) => c.votes > 0)
      .sort((a, b) => b.votes - a.votes);

    aggregated.set(canon, sorted.slice(0, TOP_N_PER_REGION));
  }

  for (const region of areas) {
    const list = aggregated.get(region.regionId);
    if (list && list.length > 0) region.candidates = list;
  }
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
    const resp = await withRetry(
      () =>
        pxwebClient.queryTable(
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
        ),
      `pres ${electionId}`,
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
/** Total fixture-payload budget. Each election is lazy-loaded
 *  on demand, so the per-page-load weight is bounded by the
 *  largest single fixture (currently ~2.6 MB for ek2023). The
 *  total only matters for cold-load over a slow link if the user
 *  hops between every election. 15 MB leaves headroom for adding
 *  EU + presidential candidate data. */
const SIZE_BUDGET_BYTES = 15 * 1024 * 1024;

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
