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

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
      // Jittered exponential backoff — spreads concurrent retries so a
      // burst of AA-candidate chunk queries doesn't all wake up at the
      // same instant and re-trip PxWeb's throttle. Math.random is fine
      // in a one-shot build script.
      const base = delays[attempt]!;
      const delay = base + Math.floor(Math.random() * (base / 2));
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

/* ─── Gentle pacing ─────────────────────────────────────────── */

/** Minimum gap between consecutive (uncached) PxWeb candidate/AA
 *  queries. PxWeb's public throttle is stricter than the submodule's
 *  10 req/10 s client limiter; firing as fast as allowed trips 429s and
 *  forces 28–45 s backoffs. A small proactive gap keeps us under the
 *  limit, so the high-volume municipal path mostly avoids 429s entirely
 *  — usually faster end-to-end despite looking slower per query. */
const PACE_MS = 250;
let lastPaceAt = 0;
async function pace(): Promise<void> {
  const wait = PACE_MS - (Date.now() - lastPaceAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastPaceAt = Date.now();
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
  hvaMapping: HvaMapping | null,
): Promise<FixtureFile> {
  const electionType = TYPE_MAP[typeId];

  if (electionType === "presidential") {
    // Round is encoded in the electionId suffix ("pres2024r1" → 1).
    const round = electionId.endsWith("r2") ? 2 : 1;
    const fixture = await buildPresidentialFixture(electionId, year, round);
    // Pres takes a separate code path; still attach turnout + HVA
    // aggregates so the new HVA view works for presidential
    // elections too.
    if (fixture.areas) {
      await attachTurnout(fixture.areas, electionType, year, electionId);
      if (hvaMapping) {
        attachHvaAggregates(fixture.areas, electionId, hvaMapping);
      }
    }
    return fixture;
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
  } else if (electionType === "eu_parliament") {
    // EU has no per-aanestysalue candidate tables; fall back to the
    // single national candidate_by_vaalipiiri table (14gx) to fill
    // candidate lists at vp level.
    await attachEuCandidates(year, areas);
    const withCands = areas.filter((a) => (a.candidates?.length ?? 0) > 0).length;
    console.log(
      `[prefetch]   ${electionId}: eu candidates → ${withCands} regions`,
    );
  }

  // Äänestysalue-level candidates → per-kunta lazy side files. Kept
  // out of the monolith so the eager page load stays light; the app
  // fetches one kunta's file on drill-down. Only the depth elections
  // (ek / kunta / alue with per-vp candidate tables) take this path;
  // eu/pres carry their AA candidates inline on the row.
  //
  // Guard: only fetch AA candidates when the monolith actually has an
  // äänestysalue level (AA party rows). Some elections (kunta2021,
  // alue2022, eu2019) draw party data from kunta-level multi-year
  // tables, so they have no AA level for the user to drill into —
  // candidates would have nothing to attach to. Their candidate AA
  // tables exist (alue2022/kunta2021 in PxWeb), but giving them an AA
  // level first needs an AA party-data backfill (see BACKLOG).
  let hasAaLevel = areas.some((a) => a.parentKunta);
  // eu2019: no candidate-AA table in PxWeb, but the party-AA table 620
  // has 1943 äänestysalue rows — add them for a drillable party map.
  if (!hasAaLevel && electionType === "eu_parliament" && year === 2019) {
    const aaRows = await buildEu2019AaParty(electionId);
    if (aaRows.length > 0) {
      areas.push(...aaRows);
      hasAaLevel = true;
      console.log(
        `[prefetch]   ${electionId}: added ${aaRows.length} äänestysalue party rows from table 620`,
      );
    }
  }
  // Backfill a missing AA level by synthesising per-AA party rows from
  // the candidate-AA tables (kunta2021, alue2022 — their party data came
  // from kunta-level multi-year tables, so the monolith had no AA level).
  if (!hasAaLevel && unitKeys.length > 0) {
    const aaRows = await synthesizeAaPartyRows(
      electionId,
      unitKeys,
      electionType,
      year,
    );
    if (aaRows.length > 0) {
      areas.push(...aaRows);
      hasAaLevel = true;
      console.log(
        `[prefetch]   ${electionId}: synthesised ${aaRows.length} äänestysalue party rows from candidate data`,
      );
    }
  }
  if (unitKeys.length > 0 && hasAaLevel) {
    await buildAaCandidateSideFiles(electionId, unitKeys, electionType, year);
  } else if (unitKeys.length > 0) {
    console.log(
      `[prefetch]   ${electionId}: candidate tables exist but no äänestysalue level could be built — skipping aa side files`,
    );
  }

  // Attach äänestysprosentti + äänioikeutetut from PxWeb. Runs
  // before the HVA / vp-aggregate steps so their summed-voters
  // computations cascade up correctly.
  await attachTurnout(areas, electionType, year, electionId);

  if (electionType === "regional") {
    // Aluevaalit's 2-digit fixture rows are hyvinvointialueet
    // (HV01..HV21), not vaalipiirit. Replace them with per-vp
    // aggregates synthesised from the kunta-level rows so the App's
    // vp-level coloring (geometry vp codes 01..13) matches the data.
    // The pre-existing HV rows are preserved as `hv<NN>` for the
    // HVA view — that's the alvaa election's natural grouping.
    await rewriteAlueVpAggregates(areas, electionId);
  } else if (hvaMapping) {
    // Non-alue elections: synthesise per-HVA rows by summing kunta
    // rows. Mathematically equivalent to "what would PxWeb give us
    // if it grouped by HVA?" — the user spec'd this as the way to
    // power the HVA view for ek/kunta/eu/pres elections.
    attachHvaAggregates(areas, electionId, hvaMapping);
  }

  return { electionId, areas };
}

/** Fetch eligible-voter count + turnout % per area from PxWeb and
 *  merge into the existing `areas` rows. Looks up the election's
 *  dedicated turnout-by-aanestysalue table when available, else
 *  falls back to the multi-measure all-areas party table. The
 *  Tiedot codes are discovered from metadata by valueText
 *  ("äänioikeutet…" → eligible voters, "äänestysprosent…" →
 *  turnout %), so this works across the per-table-suffix variation
 *  (evaa / kvaa / euvaa / pvaa / alvaa) without hard-coding.
 *
 *  Silent no-op when the election has no Tiedot variable carrying
 *  these codes — older Passiivi tables and EU/regional don't all
 *  expose them. */
async function attachTurnout(
  areas: RegionResult[],
  electionType: ElectionType,
  year: number,
  electionId: string,
): Promise<void> {
  const tables = ALL_ELECTION_TABLES.find(
    (t) => t.election_type === electionType && t.year === year,
  );
  if (!tables) return;

  const tableId =
    tables.turnout_by_aanestysalue ??
    tables.party_by_aanestysalue ??
    tables.party_by_kunta;
  if (!tableId) {
    console.warn(`[prefetch]   ${electionId}: no turnout-capable table → leaving turnout=0`);
    return;
  }
  const dbPath = getDatabasePath(tables);

  let metadata;
  try {
    metadata = await withRetry(
      () => pxwebClient.getTableMetadata(dbPath, tableId),
      `turnout-meta ${electionId}`,
    );
  } catch (e) {
    console.warn(`[prefetch]   ${electionId}: turnout metadata failed: ${e}`);
    return;
  }

  // Locate Tiedot variable + the codes for eligible voters /
  // turnout % by valueText scan. PxWeb labels are stable Finnish
  // strings ("Äänioikeutettuja", "Äänestysprosentti, %") across
  // tables, so a substring match works.
  const tiedot = metadata.variables.find(
    (v) =>
      v.code === "Tiedot" ||
      v.code === "Äänestystiedot" ||
      v.code === "Puolueiden kannatus",
  );
  if (!tiedot) return;

  let votersCode: string | null = null;
  let turnoutCode: string | null = null;
  for (let i = 0; i < tiedot.values.length; i++) {
    const c = tiedot.values[i] ?? "";
    const text = (tiedot.valueTexts[i] ?? "").toLowerCase();
    if (!votersCode && /äänioikeutet|aanioikeutet/.test(text)) votersCode = c;
    if (!turnoutCode && /äänestysprosent|aanestysprosent/.test(text))
      turnoutCode = c;
  }
  if (!votersCode || !turnoutCode) {
    console.warn(
      `[prefetch]   ${electionId}: turnout codes missing from ${tableId}`,
    );
    return;
  }

  // Build the query — pin gender / party / round / year to their
  // total codes; let the area dimension fan out.
  type FilterItem = {
    code: string;
    selection: { filter: "item" | "all"; values: string[] };
  };
  const filters: FilterItem[] = [];
  let areaCode: string | null = null;
  for (const v of metadata.variables) {
    if (v.code === tiedot.code) {
      filters.push({
        code: v.code,
        selection: { filter: "item", values: [votersCode, turnoutCode] },
      });
    } else if (v.code === "Vuosi") {
      filters.push({
        code: v.code,
        selection: { filter: "item", values: [String(year)] },
      });
    } else if (
      v.code === "Sukupuoli" ||
      v.code === "Ehdokkaan sukupuoli"
    ) {
      const total = v.values.includes("SSS")
        ? "SSS"
        : v.values.includes("S")
          ? "S"
          : v.values[0]!;
      filters.push({ code: v.code, selection: { filter: "item", values: [total] } });
    } else if (v.code === "Puolue") {
      const total = v.values.includes("SSS")
        ? "SSS"
        : v.values.includes("00")
          ? "00"
          : v.values[0]!;
      filters.push({ code: v.code, selection: { filter: "item", values: [total] } });
    } else if (v.code === "Kierros") {
      // Round 1 by default. Pres r2 is a separate fixture; its
      // electionId carries `r2`, so use that to pick the round.
      const round = electionId.endsWith("r2") ? "2" : "1";
      filters.push({ code: v.code, selection: { filter: "item", values: [round] } });
    } else {
      // Anything else: assume it's the area variable (the loaders
      // call it "Alue", "Vaalipiiri ja kunta vaalivuonna",
      // "Alue/Äänestysalue", "Äänestysalue", …). Keep the first
      // such variable as our area dimension.
      if (areaCode == null) areaCode = v.code;
      filters.push({ code: v.code, selection: { filter: "all", values: ["*"] } });
    }
  }
  if (!areaCode) {
    console.warn(
      `[prefetch]   ${electionId}: couldn't identify area variable on ${tableId}`,
    );
    return;
  }

  let response;
  try {
    response = await withRetry(
      () =>
        pxwebClient.queryTable(dbPath, tableId, {
          query: filters,
          response: { format: "json" as const },
        }),
      `turnout-query ${electionId}`,
    );
  } catch (e) {
    console.warn(`[prefetch]   ${electionId}: turnout query failed: ${e}`);
    return;
  }

  // PxWeb json layout: when Tiedot is filtered to multiple values,
  // each value becomes its own measure column (type "c"). The
  // remaining columns are key dimensions (type "d" / "t"). Each
  // data row is { key: [keyVals…], values: [measureVals…] }.
  const cols = response.columns;
  const keyColumns = cols.filter((c) => c.type !== "c");
  const measureColumns = cols.filter((c) => c.type === "c");
  const areaKeyIdx = keyColumns.findIndex((c) => c.code === areaCode);
  const votersMeasureIdx = measureColumns.findIndex((c) => c.code === votersCode);
  const turnoutMeasureIdx = measureColumns.findIndex(
    (c) => c.code === turnoutCode,
  );
  if (areaKeyIdx < 0 || votersMeasureIdx < 0 || turnoutMeasureIdx < 0) {
    console.warn(
      `[prefetch]   ${electionId}: turnout response shape unexpected (areaIdx=${areaKeyIdx} v=${votersMeasureIdx} t=${turnoutMeasureIdx})`,
    );
    return;
  }

  const byRegionId = new Map<string, { voters: number; turnout: number }>();
  for (const row of response.data) {
    const areaRaw = row.key[areaKeyIdx];
    if (!areaRaw) continue;
    const votersRaw = row.values[votersMeasureIdx];
    const turnoutRaw = row.values[turnoutMeasureIdx];
    const voters = votersRaw === undefined ? NaN : parseFloat(votersRaw);
    const turnout = turnoutRaw === undefined ? NaN : parseFloat(turnoutRaw);
    if (!Number.isFinite(voters) && !Number.isFinite(turnout)) continue;
    const entry = {
      voters: Number.isFinite(voters) ? voters : 0,
      turnout: Number.isFinite(turnout) ? turnout : 0,
    };
    // Index by both the canonical id (matches the existing rows
    // for vp / kunta) and the raw id (matches AA rows where the
    // build script keeps the full PxWeb code as the regionId).
    byRegionId.set(canonicalizeAreaId(areaRaw), entry);
    byRegionId.set(areaRaw, entry);
  }

  let merged = 0;
  for (const a of areas) {
    let found = byRegionId.get(a.regionId);
    // HVA rows use `hv<NN>` ids — try the bare 2-digit variant in
    // case the source table uses HV-prefixed codes.
    if (!found && a.regionId.startsWith("hv")) {
      found = byRegionId.get(a.regionId.slice(2));
    }
    if (!found) continue;
    a.voters = Math.round(found.voters);
    a.turnout = found.turnout;
    merged++;
  }
  console.log(
    `[prefetch]   ${electionId}: turnout merged into ${merged}/${areas.length} regions`,
  );
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

/* ─── Candidate-table overrides (gaps in the pinned submodule) ──── */

/** Per-unit `candidate_by_aanestysalue` tables that EXIST in PxWeb but
 *  are missing from the pinned submodule registry. Discovered by listing
 *  the live PxWeb databases this session. Keyed by `${electionType}:${year}`.
 *
 *  alue2022: the archive `StatFin_Passiivi/alvaa` database carries one
 *  "Ehdokkaat äänestysalueittain aluevaaleissa {hyvinvointialue}, 2022"
 *  table per HVA — these include the HVA/kunta aggregate rows too, so a
 *  single override serves both the monolith candidate lists and the AA
 *  side files. Unit keys match the regional 2025 HVA slugs. */
const AA_CANDIDATE_TABLE_OVERRIDES: Record<
  string,
  { dbPath: string; tables: Record<string, string> }
> = {
  // kunta2021: the archive `StatFin_Passiivi/kvaa` carries one
  // "Ehdokkaat äänestysalueittain kuntavaaleissa {vaalipiiri}, 2021"
  // table per vaalipiiri — same shape as kunta2025, just unregistered.
  // The monolith has no AA party rows for 2021 (party data came from the
  // multi-year kunta table), so `synthesizeAaPartyRows` aggregates these
  // candidate votes into per-AA party shares to create the AA level.
  "municipal:2021": {
    dbPath: "StatFin_Passiivi/kvaa",
    tables: {
      helsinki: "statfinpas_kvaa_pxt_12vs_2021",
      uusimaa: "statfinpas_kvaa_pxt_12wj_2021",
      "varsinais-suomi": "statfinpas_kvaa_pxt_12wk_2021",
      satakunta: "statfinpas_kvaa_pxt_12wl_2021",
      hame: "statfinpas_kvaa_pxt_12wm_2021",
      pirkanmaa: "statfinpas_kvaa_pxt_12wn_2021",
      "kaakkois-suomi": "statfinpas_kvaa_pxt_12wp_2021",
      "savo-karjala": "statfinpas_kvaa_pxt_12wq_2021",
      vaasa: "statfinpas_kvaa_pxt_12wr_2021",
      "keski-suomi": "statfinpas_kvaa_pxt_12ws_2021",
      oulu: "statfinpas_kvaa_pxt_12wt_2021",
      lappi: "statfinpas_kvaa_pxt_12wu_2021",
    },
  },
  "regional:2022": {
    dbPath: "StatFin_Passiivi/alvaa",
    tables: {
      "ita-uusimaa": "statfinpas_alvaa_pxt_13bv_2022",
      "keski-uusimaa": "statfinpas_alvaa_pxt_13cr_2022",
      "lansi-uusimaa": "statfinpas_alvaa_pxt_13cs_2022",
      "vantaa-kerava": "statfinpas_alvaa_pxt_13ct_2022",
      "varsinais-suomi": "statfinpas_alvaa_pxt_13cu_2022",
      satakunta: "statfinpas_alvaa_pxt_13cv_2022",
      "kanta-hame": "statfinpas_alvaa_pxt_13cw_2022",
      pirkanmaa: "statfinpas_alvaa_pxt_13cx_2022",
      "paijat-hame": "statfinpas_alvaa_pxt_13cy_2022",
      kymenlaakso: "statfinpas_alvaa_pxt_13cz_2022",
      "etela-karjala": "statfinpas_alvaa_pxt_13d1_2022",
      "etela-savo": "statfinpas_alvaa_pxt_13d2_2022",
      "pohjois-savo": "statfinpas_alvaa_pxt_13d3_2022",
      "pohjois-karjala": "statfinpas_alvaa_pxt_13d4_2022",
      "keski-suomi": "statfinpas_alvaa_pxt_13d5_2022",
      "etela-pohjanmaa": "statfinpas_alvaa_pxt_13d6_2022",
      pohjanmaa: "statfinpas_alvaa_pxt_13d7_2022",
      "keski-pohjanmaa": "statfinpas_alvaa_pxt_13d8_2022",
      "pohjois-pohjanmaa": "statfinpas_alvaa_pxt_13d9_2022",
      kainuu: "statfinpas_alvaa_pxt_13da_2022",
      lappi: "statfinpas_alvaa_pxt_13db_2022",
    },
  },
};

/** Resolve the per-unit `candidate_by_aanestysalue` tables + db path for
 *  an (electionType, year), preferring the local override, then the
 *  submodule registry. Returns null when neither has them. */
function resolveAaCandidateTables(
  electionType: ElectionType,
  year: number,
): { dbPath: string; tables: Record<string, string> } | null {
  const override = AA_CANDIDATE_TABLE_OVERRIDES[`${electionType}:${year}`];
  if (override) return override;
  const t = ALL_ELECTION_TABLES.find(
    (x) => x.election_type === electionType && x.year === year,
  );
  if (t?.candidate_by_aanestysalue) {
    return { dbPath: getDatabasePath(t), tables: t.candidate_by_aanestysalue };
  }
  return null;
}

/** Vp/hv-keyed list of candidate tables for an (electionType, year),
 *  e.g. `["helsinki", "uusimaa", …]` for parliamentary 2023.
 *  Empty array if the election has no per-unit candidate tables. */
function unitKeysForCandidateTables(
  electionType: ElectionType,
  year: number,
): string[] {
  const resolved = resolveAaCandidateTables(electionType, year);
  return resolved ? Object.keys(resolved.tables) : [];
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
  const resolved = resolveAaCandidateTables(electionType, year);
  const tableId = resolved?.tables[unitKey];
  if (!resolved || !tableId) return [];

  const dbPath = resolved.dbPath;
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
        withRetry(async () => {
          await pace();
          return pxwebClient.queryTable(dbPath, tableId, {
            query: filters,
            response: { format: "json" as const },
          });
        }, `cand-query ${tableId} (${unitKey})`),
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

/* ─── Äänestysalue-level candidates (per-kunta side files) ──── */

/** Running total of bytes written to AA-candidate side files.
 *  Tracked separately from the monolith fixtures because side files
 *  are lazy-loaded per kunta on drill-down — they don't count against
 *  the eager page-weight budget. */
let aaSideFileBytes = 0;

/** Soft cell-count ceiling per chunked AA-candidate query. PxWeb's
 *  hard limit is ~12 000; we stay well under so the area dimension
 *  can fan out a little (the candidate count per vp is fixed). */
const AA_CELL_BUDGET = 8000;

/** Fetch äänestysalue-level candidate rows for one vp/hv unit, in
 *  cell-count-bounded chunks. This is the AA counterpart of
 *  `loadCandidatesForUnit` (which deliberately drops aa codes); here
 *  we keep ONLY the aa codes and batch them so each query's
 *  `areas × candidates × 1 measure` stays under `AA_CELL_BUDGET`.
 *  Helsinki (~167 aa × ~230 cand ≈ 38 k cells) splits into ~5 batches. */
async function loadAaCandidatesForUnit(
  unitKey: string,
  electionType: ElectionType,
  year: number,
): Promise<ElectionRecord[]> {
  const resolved = resolveAaCandidateTables(electionType, year);
  const tableId = resolved?.tables[unitKey];
  if (!resolved || !tableId) return [];

  const dbPath = resolved.dbPath;
  let metadata;
  try {
    metadata = await withRetry(
      () => pxwebClient.getTableMetadata(dbPath, tableId),
      `aa-cand-meta ${tableId} (${unitKey})`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[prefetch]   aa-candidates ${tableId} (${unitKey}) meta: ${msg}`);
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

  // AA codes = everything that ISN'T a vp/hv/kunta aggregate.
  const aaAreas = areaVar.values.filter(
    (c) =>
      !c.startsWith("VP") &&
      !c.startsWith("HV") &&
      !c.startsWith("KU") &&
      !/^\d{3}$/.test(c),
  );
  if (aaAreas.length === 0) return [];

  const ehdVar = metadata.variables.find((v) => v.code === "Ehdokas");
  const candidateCount = Math.max(1, ehdVar?.values.length ?? 1);
  const batchSize = Math.max(1, Math.floor(AA_CELL_BUDGET / candidateCount));

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

  const valintaVar = metadata.variables.find((v) => v.code === "Valintatieto");
  const hasYear = metadata.variables.some((v) => v.code === "Vuosi");
  const hasKierros = metadata.variables.some((v) => v.code === "Kierros");

  type FilterItem = {
    code: string;
    selection: { filter: "item" | "all"; values: string[] };
  };

  /** One cell-bounded query: areas in `areaValues`, candidates either all
   *  (`"all"`) or restricted to `ehdokas`. Cached + retried + paced.
   *  Returns normalized rows, or [] on failure (logged). */
  const runQuery = async (
    areaValues: string[],
    ehdokas: string[] | "all",
    tag: string,
  ): Promise<ElectionRecord[]> => {
    const filters: FilterItem[] = [];
    if (hasYear) {
      filters.push({ code: "Vuosi", selection: { filter: "item", values: [String(year)] } });
    }
    filters.push({ code: areaVar.code, selection: { filter: "item", values: areaValues } });
    filters.push({
      code: "Ehdokas",
      selection:
        ehdokas === "all"
          ? { filter: "all", values: ["*"] }
          : { filter: "item", values: ehdokas },
    });
    if (valintaVar) {
      const useSss = valintaVar.values.includes("SSS");
      filters.push({
        code: "Valintatieto",
        selection: { filter: "item", values: useSss ? ["SSS"] : ["1", "2", "3"] },
      });
    }
    if (hasKierros) {
      filters.push({ code: "Kierros", selection: { filter: "all", values: ["*"] } });
    }
    filters.push({ code: tiedotVar.code, selection: { filter: "item", values: [votesCode] } });

    const cacheKey = `vaalit:aacand:${tableId}:${electionType}:${year}:${unitKey}:${tag}`;
    try {
      const wrapped = await withCache(
        cacheKey,
        () =>
          withRetry(async () => {
            await pace();
            return pxwebClient.queryTable(dbPath, tableId, {
              query: filters,
              response: { format: "json" as const },
            });
          }, `aa-cand-query ${tableId} (${unitKey} ${tag})`),
        24 * 60 * 60 * 1000,
      );
      return normalizeCandidateByAanestysalue(wrapped.value, metadata, year, electionType);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[prefetch]   aa-candidates ${tableId} (${unitKey} ${tag}): ${msg}`);
      return [];
    }
  };

  const out: ElectionRecord[] = [];

  // Path A — area-batching with the full candidate list. Efficient when
  // the candidate count is modest (parliamentary ~150-230/vp, regional
  // per-HVA, single-kunta vps like Helsinki municipal): each query fans
  // out many äänestysalueet.
  const PER_KUNTA_THRESHOLD = 8;
  if (batchSize >= PER_KUNTA_THRESHOLD) {
    const batchCount = Math.ceil(aaAreas.length / batchSize);
    for (let b = 0; b < batchCount; b++) {
      const batch = aaAreas.slice(b * batchSize, (b + 1) * batchSize);
      const rows = await runQuery(batch, "all", `${b + 1}/${batchCount}`);
      for (const r of rows) out.push(r);
    }
    return out;
  }

  // Path B — per-kunta candidate scoping. When the candidate count is huge
  // (multi-kunta municipal vps list ALL ~4 000 of the vp's candidates),
  // pairing all of them with even 2 AAs already fills the cell budget, so
  // the area-batch path degenerates into hundreds of queries. Municipal
  // candidates are kunta-local, so for each kunta we probe its own
  // candidate set (one cheap query against the kunta aggregate), then
  // fetch only that kunta's AAs × that kunta's candidates — small queries,
  // far fewer of them. Scrapes one municipality at a time.
  // Map each kunta → its aggregate area code IN THIS TABLE. The format
  // varies: bare 3-digit ("091", parliamentary / alue2022) or "KU###"
  // (municipal 14v*). We probe that aggregate to learn the kunta's full
  // candidate set cheaply (one query) before fetching its AAs.
  const kuntaAgg = new Map<string, string>();
  for (const c of areaVar.values) {
    if (c.startsWith("VP") || c.startsWith("HV")) continue;
    if (c.startsWith("KU") && /^\d{3}$/.test(c.slice(2))) kuntaAgg.set(c.slice(2), c);
    else if (/^\d{3}$/.test(c)) kuntaAgg.set(c, c);
  }

  const aaByKunta = new Map<string, string[]>();
  for (const code of aaAreas) {
    const k = parseParentKunta(code);
    if (!k) continue;
    const arr = aaByKunta.get(k);
    if (arr) arr.push(code);
    else aaByKunta.set(k, [code]);
  }
  for (const [kunta, kuntaAa] of aaByKunta.entries()) {
    // Discover this kunta's candidate ids via the aggregate probe.
    const agg = kuntaAgg.get(kunta);
    const candIds = agg
      ? [
          ...new Set(
            (await runQuery([agg], "all", `k${kunta}-probe`))
              .filter((r) => r.candidate_id && r.votes)
              .map((r) => r.candidate_id!),
          ),
        ]
      : [];
    if (candIds.length > 0) {
      // Scoped fetch — kunta's AAs × only that kunta's candidates.
      const aaBatch = Math.max(1, Math.floor(AA_CELL_BUDGET / candIds.length));
      const nBatches = Math.ceil(kuntaAa.length / aaBatch);
      for (let b = 0; b < nBatches; b++) {
        const slice = kuntaAa.slice(b * aaBatch, (b + 1) * aaBatch);
        const rows = await runQuery(slice, candIds, `k${kunta}-${b + 1}/${nBatches}`);
        for (const r of rows) out.push(r);
      }
    } else {
      // No usable aggregate — fall back to the kunta's AAs × all
      // candidates, one cell-budget batch at a time (correct, just more
      // queries for this kunta).
      const aaBatch = Math.max(1, Math.floor(AA_CELL_BUDGET / candidateCount));
      const nBatches = Math.ceil(kuntaAa.length / aaBatch);
      for (let b = 0; b < nBatches; b++) {
        const slice = kuntaAa.slice(b * aaBatch, (b + 1) * aaBatch);
        const rows = await runQuery(slice, "all", `k${kunta}-full-${b + 1}/${nBatches}`);
        for (const r of rows) out.push(r);
      }
    }
  }
  return out;
}

/** Synthesise per-äänestysalue PARTY rows from candidate-AA data, for
 *  elections whose monolith has no AA level (party data came from a
 *  kunta-level multi-year table) but whose candidate-AA tables exist
 *  (kunta2021, alue2022). In Finnish open-list elections every vote is
 *  cast for a candidate, so summing candidate votes by party per AA
 *  yields the exact party vote totals + shares — the same approach
 *  `buildPres2024Fixture` uses. Returns AA `RegionResult` rows to inject
 *  into `areas`; turnout/voters stay 0 (no eligible-voter source here —
 *  the UI shows "—"). The candidate-AA queries are cached, so the
 *  subsequent `buildAaCandidateSideFiles` re-fetch is free. */
async function synthesizeAaPartyRows(
  electionId: string,
  unitKeys: string[],
  electionType: ElectionType,
  year: number,
): Promise<RegionResult[]> {
  const byAa = new Map<
    string,
    { votes: number; party: Map<string, number>; label?: string }
  >();
  for (const unitKey of unitKeys) {
    let rows: ElectionRecord[];
    try {
      rows = await loadAaCandidatesForUnit(unitKey, electionType, year);
    } catch {
      rows = [];
    }
    for (const r of rows) {
      if (r.area_level !== "aanestysalue" || !r.votes) continue;
      const slug = partyKey(r.party_name, r.party_id);
      if (!slug) continue;
      let e = byAa.get(r.area_id);
      if (!e) {
        e = { votes: 0, party: new Map(), label: r.area_name };
        byAa.set(r.area_id, e);
      }
      e.votes += r.votes;
      e.party.set(slug, (e.party.get(slug) ?? 0) + r.votes);
    }
  }

  const out: RegionResult[] = [];
  for (const [aaId, e] of byAa.entries()) {
    if (e.votes === 0) continue;
    const shares: Record<string, number> = {};
    for (const [p, v] of e.party.entries()) shares[p] = (v / e.votes) * 100;
    const result: RegionResult = {
      regionId: aaId,
      electionId,
      votes: e.votes,
      voters: 0,
      turnout: 0,
      shares,
    };
    const pk = parseParentKunta(aaId);
    if (pk) result.parentKunta = pk;
    if (e.label) result.label = e.label;
    out.push(result);
  }
  return out;
}

/** Build per-äänestysalue PARTY rows for eu2019 from the archive table
 *  `620_euvaa_2019_tau_108` (Äänestysalue × Puolue × votes). eu2019's
 *  party data otherwise comes from a kunta-level multi-year table, so the
 *  monolith has no AA level; 620 carries 1943 äänestysalue rows. EU has
 *  no candidate-by-äänestysalue table in PxWeb, so this gives eu2019 a
 *  party-coloured drillable AA map (no per-AA candidate lists — those
 *  live only in the Ministry of Justice tulospalvelu file). */
async function buildEu2019AaParty(electionId: string): Promise<RegionResult[]> {
  const dbPath = "StatFin_Passiivi/euvaa";
  const tableId = "620_euvaa_2019_tau_108";
  let meta;
  try {
    meta = await withRetry(
      () => pxwebClient.getTableMetadata(dbPath, tableId),
      "eu2019 aa-party meta",
    );
  } catch (e) {
    console.warn(`[prefetch]   eu2019 aa-party meta failed: ${(e as Error).message}`);
    return [];
  }
  const areaVar = meta.variables.find((v) => v.code === "Äänestysalue");
  const puolueVar = meta.variables.find((v) => v.code === "Puolue");
  const tiedotVar = meta.variables.find(
    (v) => v.code === "Puolueiden kannatus" || v.code === "Tiedot",
  );
  const sukuVar = meta.variables.find((v) => v.code === "Sukupuoli");
  if (!areaVar || !puolueVar || !tiedotVar) return [];

  const votesCode =
    tiedotVar.values.find((_, i) =>
      /ääniä yht|äänimäärä|^ääniä/.test((tiedotVar.valueTexts[i] ?? "").toLowerCase()),
    ) ?? tiedotVar.values[0]!;
  const partyNames = new Map<string, string>();
  puolueVar.values.forEach((c, i) => partyNames.set(c, puolueVar.valueTexts[i] ?? c));
  const partyCodes = puolueVar.values.filter((c) => c !== "00"); // drop "Yhteensä"
  const sukuTotal = sukuVar
    ? sukuVar.values.includes("S")
      ? "S"
      : sukuVar.values[0]!
    : null;
  const areaText = new Map<string, string>();
  areaVar.values.forEach((c, i) => areaText.set(c, areaVar.valueTexts[i] ?? c));
  const aaCodes = areaVar.values.filter(
    (c) => c !== "SSS" && !c.startsWith("VP") && !/^\d{3}$/.test(c) && c.length >= 6,
  );
  if (aaCodes.length === 0) return [];

  const batch = Math.max(1, Math.floor(8000 / Math.max(1, partyCodes.length)));
  const byAa = new Map<string, { votes: number; party: Map<string, number>; label?: string }>();
  for (let i = 0; i < aaCodes.length; i += batch) {
    const slice = aaCodes.slice(i, i + batch);
    const filters: Array<{
      code: string;
      selection: { filter: "item" | "all"; values: string[] };
    }> = [
      { code: "Äänestysalue", selection: { filter: "item", values: slice } },
      { code: "Puolue", selection: { filter: "item", values: partyCodes } },
      { code: tiedotVar.code, selection: { filter: "item", values: [votesCode] } },
    ];
    if (sukuTotal) {
      filters.push({ code: "Sukupuoli", selection: { filter: "item", values: [sukuTotal] } });
    }
    let resp;
    try {
      const wrapped = await withCache(
        `vaalit:eu2019aapt:${i}`,
        () =>
          withRetry(async () => {
            await pace();
            return pxwebClient.queryTable(dbPath, tableId, {
              query: filters,
              response: { format: "json" as const },
            });
          }, `eu2019 aa-party ${i}`),
        24 * 60 * 60 * 1000,
      );
      resp = wrapped.value;
    } catch (e) {
      console.warn(`[prefetch]   eu2019 aa-party batch ${i}: ${(e as Error).message}`);
      continue;
    }
    const keyCols = resp.columns.filter((c) => c.type !== "c");
    const areaIdx = keyCols.findIndex((c) => c.code === "Äänestysalue");
    const partyIdx = keyCols.findIndex((c) => c.code === "Puolue");
    if (areaIdx < 0 || partyIdx < 0) continue;
    for (const row of resp.data) {
      const area = row.key[areaIdx];
      const pcode = row.key[partyIdx];
      if (!area || !pcode) continue;
      const v = Number(row.values[0]);
      if (!Number.isFinite(v) || v <= 0) continue;
      const slug = partyKey(partyNames.get(pcode), pcode);
      if (!slug) continue;
      let e = byAa.get(area);
      if (!e) {
        e = { votes: 0, party: new Map(), label: areaText.get(area) };
        byAa.set(area, e);
      }
      e.votes += v;
      e.party.set(slug, (e.party.get(slug) ?? 0) + v);
    }
  }

  const out: RegionResult[] = [];
  for (const [aa, e] of byAa.entries()) {
    if (e.votes === 0) continue;
    const shares: Record<string, number> = {};
    for (const [p, v] of e.party.entries()) shares[p] = (v / e.votes) * 100;
    const result: RegionResult = {
      regionId: aa,
      electionId,
      votes: e.votes,
      voters: 0,
      turnout: 0,
      shares,
    };
    const pk = parseParentKunta(aa);
    if (pk) result.parentKunta = pk;
    if (e.label) result.label = e.label;
    out.push(result);
  }
  return out;
}

/** Build per-kunta äänestysalue-candidate side files for an election
 *  and write them to `public/data/elections/{electionId}/aa-cands/`.
 *  One file per kunta, shaped `{ [aaRegionId]: Candidate[] }`, capped
 *  at `TOP_N_PER_REGION` per AA.
 *
 *  Memory-critical: each vp/hv unit's äänestysalue candidate set is
 *  large (Helsinki alone ≈ 4 900 candidate-rows), and a kunta belongs
 *  to exactly one vaalipiiri, so a unit's kunta files never collide
 *  with another's. We therefore **stream per unit** — group, write, and
 *  release one unit at a time — rather than accumulating every unit in
 *  memory before writing. Accumulating tripped the 4 GB heap on the
 *  bigger elections once the queries actually succeeded (warm cache).
 *  Streaming also means a later OOM/kill leaves the units done so far
 *  already on disk; a re-run continues from the `.complete` marker.
 */
async function buildAaCandidateSideFiles(
  electionId: string,
  unitKeys: string[],
  electionType: ElectionType,
  year: number,
): Promise<void> {
  const dir = resolve(OUT_DIR, electionId, "aa-cands");
  const marker = resolve(dir, ".complete");
  // Idempotent skip — a previous run already finished this election.
  // Lets the server team re-run the prefetch after a rate-limit/OOM
  // interruption and make forward progress without redoing finished
  // elections (and without loading their data into memory at all).
  if (existsSync(marker)) {
    console.log(
      `[prefetch]   ${electionId}: aa-candidate side files already complete — skipping`,
    );
    return;
  }
  await mkdir(dir, { recursive: true });

  let kuntaCount = 0;
  let aaCount = 0;
  let totalRows = 0;
  let aaRows = 0;
  let failedUnits = 0;

  for (const unitKey of unitKeys) {
    let rows: ElectionRecord[];
    try {
      rows = await loadAaCandidatesForUnit(unitKey, electionType, year);
    } catch {
      rows = [];
    }
    totalRows += rows.length;
    if (rows.length === 0) {
      failedUnits++;
      continue;
    }

    // Group this unit's rows by aa area_id, sum + sort + cap per AA.
    const byAa = new Map<string, Map<string, Candidate>>();
    for (const r of rows) {
      if (r.area_level !== "aanestysalue") continue;
      aaRows++;
      if (!r.candidate_id || !r.votes) continue;
      let cands = byAa.get(r.area_id);
      if (!cands) {
        cands = new Map<string, Candidate>();
        byAa.set(r.area_id, cands);
      }
      const existing = cands.get(r.candidate_id);
      if (existing) {
        existing.votes += r.votes;
      } else {
        const slug = partyKey(r.party_name, r.party_id) ?? `_unknown`;
        cands.set(r.candidate_id, {
          id: r.candidate_id,
          name: r.candidate_name ?? "",
          party: slug,
          votes: r.votes,
        });
      }
    }

    // Bucket this unit's AAs by parent kunta and write each kunta file
    // immediately, then drop the unit's working set.
    const byKunta = new Map<string, Record<string, Candidate[]>>();
    for (const [aaId, cands] of byAa.entries()) {
      const kunta = parseParentKunta(aaId);
      if (!kunta) continue;
      const list = Array.from(cands.values())
        .filter((c) => c.votes > 0)
        .sort((a, b) => b.votes - a.votes)
        .slice(0, TOP_N_PER_REGION);
      if (list.length === 0) continue;
      let bucket = byKunta.get(kunta);
      if (!bucket) {
        bucket = {};
        byKunta.set(kunta, bucket);
      }
      bucket[aaId] = list;
      aaCount++;
    }
    for (const [kunta, payload] of byKunta.entries()) {
      const json = JSON.stringify(payload);
      await writeFile(resolve(dir, `${kunta}.json`), json, "utf8");
      aaSideFileBytes += json.length;
      kuntaCount++;
    }
    // Release the unit's working set before the next (V8 hint; the
    // prefetch runs with --expose-gc).
    if (typeof globalThis.gc === "function") globalThis.gc();
  }

  if (kuntaCount === 0) {
    console.warn(
      `[prefetch]   ${electionId}: 0 aa-candidate files — ${failedUnits}/${unitKeys.length} units returned no rows, ` +
        `${totalRows} total rows, ${aaRows} aanestysalue rows. ` +
        (totalRows === 0
          ? "Likely rate-limited (all batches dropped) — re-run to retry."
          : "Rows fetched but none grouped — check area_id format / parseParentKunta."),
    );
    return;
  }

  // Mark complete only when every unit contributed — a partial run
  // (some units rate-limited) leaves no marker, so a re-run retries it.
  if (failedUnits === 0) {
    await writeFile(marker, "", "utf8");
  }
  console.log(
    `[prefetch]   ${electionId}: aa-candidate side files → ${kuntaCount} kuntat, ${aaCount} äänestysaluetta` +
      (failedUnits > 0
        ? ` (${failedUnits}/${unitKeys.length} units missing — re-run to fill)`
        : ""),
  );
}

/** Fetch EU 2024 candidates from `statfin_euvaa_pxt_14gx`
 *  (Puolue ja ehdokas × Vaalipiiri × votes). Attaches a candidate
 *  list to every vp row in `areas`.
 *
 *  The "Puolue ja ehdokas" dimension mixes party-aggregate rows
 *  (2-digit codes like "01" = KOK, "06" = VAS) with candidate rows
 *  (6-digit codes whose first 2 digits are the party prefix). We
 *  build a `prefix → party-slug` map from the 2-digit rows, then
 *  derive each candidate's party from their code prefix. */
async function attachEuCandidates(
  year: number,
  areas: RegionResult[],
): Promise<void> {
  if (year !== 2024) return; // 2019 archive table has a different shape
  try {
    const dbPath = "StatFin/euvaa";
    const tableId = "statfin_euvaa_pxt_14gx";
    const metadata = await withRetry(
      () => pxwebClient.getTableMetadata(dbPath, tableId),
      `eu cand meta`,
    );
    const candVar = metadata.variables.find(
      (v) => v.code === "Puolue ja ehdokas",
    );
    if (!candVar) return;

    // Build prefix → party-slug + candidate id → name maps.
    const prefixToSlug = new Map<string, string>();
    const candNames = new Map<string, string>();
    for (let i = 0; i < candVar.values.length; i++) {
      const code = candVar.values[i]!;
      const text = candVar.valueTexts[i] ?? code;
      if (/^\d{2}$/.test(code)) {
        const slug = partyKey(text, code);
        if (slug) prefixToSlug.set(code, slug);
      } else if (/^\d{6}$/.test(code)) {
        candNames.set(code, text);
      }
    }
    if (candNames.size === 0) return;

    const resp = await withRetry(
      () =>
        pxwebClient.queryTable(dbPath, tableId, {
          query: [
            { code: "Vuosi", selection: { filter: "item", values: [String(year)] } },
            {
              code: "Puolue ja ehdokas",
              selection: {
                filter: "item",
                values: Array.from(candNames.keys()),
              },
            },
            { code: "Vaalipiiri", selection: { filter: "all", values: ["*"] } },
            { code: "Tiedot", selection: { filter: "item", values: ["euvaa_aanet"] } },
          ],
          response: { format: "json" as const },
        }),
      `eu cand query`,
    );

    type Row = { vp: string; cand: string; votes: number };
    const byVp = new Map<string, Row[]>();
    const nationalVotes = new Map<string, number>();
    for (const r of resp.data) {
      const cand = String(r.key[1] ?? "");
      const vp = String(r.key[2] ?? "");
      const v = Number(r.values[0]);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (!candNames.has(cand)) continue; // skip aggregate rows
      const arr = byVp.get(vp);
      if (arr) arr.push({ vp, cand, votes: v });
      else byVp.set(vp, [{ vp, cand, votes: v }]);
      nationalVotes.set(cand, (nationalVotes.get(cand) ?? 0) + v);
    }

    const buildCandidate = (r: Row): Candidate => {
      const prefix = r.cand.slice(0, 2);
      const slug = prefixToSlug.get(prefix) ?? `_${prefix}`;
      return {
        id: r.cand,
        name: candNames.get(r.cand) ?? r.cand,
        party: slug,
        votes: r.votes,
      };
    };

    for (const region of areas) {
      if (!/^\d{2}$/.test(region.regionId)) continue;
      const vpCode = `VP${region.regionId}`;
      const recs = byVp.get(vpCode);
      if (!recs) continue;
      const list = recs.map(buildCandidate);
      list.sort((a, b) => b.votes - a.votes);
      if (list.length > 0) region.candidates = list;
    }

    // Top-N candidates' per-kunta + per-AA breakdown via 14gw. The
    // table requires a single-candidate filter (full all-cand ×
    // all-area would blow PxWeb's 12k-cell limit), so we fetch the
    // top names by national votes one at a time. Cap at TOP_N_EU
    // to keep the prefetch under ~90 seconds; candidates outside
    // that cap stay vp-level only (formula chips referring to a
    // small candidate at kunta level read as "no data", same as
    // every other "outside the cap" case).
    const TOP_N_EU = 60;
    const topCands = Array.from(nationalVotes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N_EU)
      .map(([id]) => id);
    if (topCands.length === 0) return;

    const aaTableId = "statfin_euvaa_pxt_14gw";
    const aaMeta = await withRetry(
      () => pxwebClient.getTableMetadata(dbPath, aaTableId),
      `eu cand-aa meta`,
    );
    const areaVar = aaMeta.variables.find(
      (v) =>
        v.code === "Alue/Äänestysalue" ||
        v.code === "Äänestysalue" ||
        v.code === "Alue",
    );
    const tiedotVar = aaMeta.variables.find(
      (v) => v.code === "Tiedot" || v.code === "Äänestystiedot",
    );
    const votesTiedot =
      tiedotVar?.values.find(
        (_, i) =>
          /äänimäärä|äänet/.test(
            (tiedotVar.valueTexts[i] ?? "").toLowerCase(),
          ),
      ) ?? "euvaa_aanet";
    if (!areaVar || !tiedotVar) {
      console.warn(`[prefetch]   eu cand-aa: unexpected schema on ${aaTableId}`);
      return;
    }

    // candId → (canonical region id → votes). Built incrementally
    // across the per-candidate queries so a transient failure on
    // one candidate doesn't drop the rest.
    const byArea = new Map<string, Map<string, number>>();
    let okCount = 0;
    for (const candId of topCands) {
      try {
        const r = await withRetry(
          () =>
            pxwebClient.queryTable(dbPath, aaTableId, {
              query: [
                { code: "Vuosi", selection: { filter: "item", values: [String(year)] } },
                { code: areaVar.code, selection: { filter: "all", values: ["*"] } },
                { code: "Ehdokas", selection: { filter: "item", values: [candId] } },
                { code: tiedotVar.code, selection: { filter: "item", values: [votesTiedot] } },
              ],
              response: { format: "json" as const },
            }),
          `eu cand-aa ${candId}`,
        );
        const keyCols = r.columns.filter((c) => c.type !== "c");
        const areaIdx = keyCols.findIndex((c) => c.code === areaVar.code);
        if (areaIdx < 0) continue;
        const perArea = new Map<string, number>();
        for (const row of r.data) {
          const rawArea = row.key[areaIdx];
          if (!rawArea) continue;
          const v = Number(row.values[0]);
          if (!Number.isFinite(v) || v <= 0) continue;
          // Index by both canonical and raw — kunta rows match the
          // canonical 3-digit form, AA rows use the raw PxWeb code.
          perArea.set(canonicalizeAreaId(rawArea), v);
          perArea.set(rawArea, v);
        }
        if (perArea.size > 0) {
          byArea.set(candId, perArea);
          okCount++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[prefetch]   eu cand-aa ${candId}: ${msg}`);
      }
    }

    // Attach per-area top candidates list. Skip vp rows — those
    // already have the full per-vp list from 14gx above.
    let merged = 0;
    for (const region of areas) {
      if (/^\d{2}$/.test(region.regionId)) continue;
      const local: Candidate[] = [];
      for (const candId of topCands) {
        const votes = byArea.get(candId)?.get(region.regionId);
        if (votes == null || votes <= 0) continue;
        const prefix = candId.slice(0, 2);
        const slug = prefixToSlug.get(prefix) ?? `_${prefix}`;
        local.push({
          id: candId,
          name: candNames.get(candId) ?? candId,
          party: slug,
          votes,
        });
      }
      if (local.length === 0) continue;
      local.sort((a, b) => b.votes - a.votes);
      region.candidates = local.slice(0, TOP_N_PER_REGION);
      merged++;
    }
    console.log(
      `[prefetch]   eu candidates kunta/aa: ${okCount}/${topCands.length} candidate fetches → ${merged} regions`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[prefetch]   eu candidates: ${msg}`);
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
/** Match a 2024 presidential candidate's name to a canonical party
 *  slug. The 14d5 table emits candidate names directly in
 *  `valueTexts`, so we don't need the 14db candidate-id mapping
 *  for this path. (14db's candidate-id space differs from 14d5's
 *  anyway — "08" is Niinistö in 14db but Stubb in 14d5.) */
const PRES_2024_NAME_TO_PARTY: ReadonlyArray<{ re: RegExp; slug: string }> = [
  { re: /alexander\s+stubb/i, slug: "kok" },
  { re: /pekka\s+haavisto/i, slug: "vihr" },
  { re: /jussi\s+halla[- ]?aho/i, slug: "ps" },
  { re: /olli\s+rehn/i, slug: "kesk" },
  { re: /li\s+andersson/i, slug: "vas" },
  { re: /jutta\s+urpilainen/i, slug: "sdp" },
  { re: /sari\s+essayah/i, slug: "kd" },
  { re: /mika\s+aaltola/i, slug: "_aalt" },
  { re: /harry\s+harkimo/i, slug: "_liike" },
  { re: /nils\s+torvalds/i, slug: "rkp" },
];
function pres2024NameToParty(name: string): string {
  for (const { re, slug } of PRES_2024_NAME_TO_PARTY) {
    if (re.test(name)) return slug;
  }
  // Fallback: stable derived slug — keeps unrecognised candidates
  // distinct in `shares` rather than clobbering them all together.
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-zåäö]/g, "")
    .slice(0, 12);
  return sanitized ? `_${sanitized}` : "_unknown";
}

/** Build a 2024 presidential fixture from table 14d5
 *  (candidate × area × year × round, all area levels).
 *
 *  Provides full vp + kunta coverage (drilling into a vp shows
 *  per-kunta colors, not crosshatch). 14db is still used for
 *  2018 / 2012 rounds because those archive years don't share
 *  this single-table-with-everything shape. */
async function buildPres2024Fixture(
  electionId: string,
  round: 1 | 2,
): Promise<FixtureFile> {
  try {
    const dbPath = "StatFin/pvaa";
    const tableId = "statfin_pvaa_pxt_14d5";
    const metadata = await withRetry(
      () => pxwebClient.getTableMetadata(dbPath, tableId),
      `pres2024 meta`,
    );

    const areaVar = metadata.variables.find((v) => v.code === "Alue");
    if (!areaVar) {
      console.warn(`[prefetch]   ${electionId}: 14d5 has no Alue variable`);
      return { electionId, status: "no_data" };
    }
    // Drop SSS (national) + aa codes; keep VP## + 3-digit kunta.
    const wantedAreas = areaVar.values.filter(
      (c) => c.startsWith("VP") || /^\d{3}$/.test(c),
    );
    if (wantedAreas.length === 0) {
      return { electionId, status: "no_data" };
    }

    const candVar = metadata.variables.find((v) => v.code === "Ehdokas");
    if (!candVar) {
      return { electionId, status: "no_data" };
    }
    const candidateNames = new Map<string, string>();
    candVar.values.forEach((code, i) => {
      candidateNames.set(code, candVar.valueTexts[i] ?? code);
    });

    const resp = await withRetry(
      () =>
        pxwebClient.queryTable(dbPath, tableId, {
          query: [
            { code: "Vuosi", selection: { filter: "item", values: ["2024"] } },
            {
              code: "Alue",
              selection: { filter: "item", values: wantedAreas },
            },
            {
              code: "Ehdokas",
              selection: { filter: "all", values: ["*"] },
            },
            {
              code: "Kierros",
              selection: { filter: "item", values: [String(round)] },
            },
            {
              code: "Tiedot",
              selection: { filter: "item", values: ["pvaa_aanet"] },
            },
          ],
          response: { format: "json" as const },
        }),
      `pres2024 ${electionId}`,
    );

    // Group raw rows by area code, sum candidate votes by party slug.
    type Row = { area: string; cand: string; votes: number };
    const rows: Row[] = [];
    for (const r of resp.data) {
      const area = String(r.key[1] ?? "");
      const cand = String(r.key[2] ?? "");
      const v = Number(r.values[0]);
      if (!Number.isFinite(v) || v <= 0) continue;
      // "00" is "Hyväksytyt äänestysliput, yhteensä" — skip aggregate.
      if (cand === "00") continue;
      rows.push({ area, cand, votes: v });
    }

    const byArea = new Map<string, Row[]>();
    for (const row of rows) {
      const arr = byArea.get(row.area);
      if (arr) arr.push(row);
      else byArea.set(row.area, [row]);
    }

    // Skip aggregate / non-candidate rows ("Hyväksytyt äänestysliput,
    // yhteensä", "Hylätyt äänestysliput", etc.) by name. The candidate
    // ids vary table-to-table; matching on the Finnish name is stable.
    const isAggregateName = (name: string): boolean =>
      /äänestysliput|yhteensä|hyväksytyt|hylätyt/i.test(name);

    const areas: RegionResult[] = [];
    for (const [areaCode, recs] of byArea.entries()) {
      const partyVotes = new Map<string, number>();
      const candList: Candidate[] = [];
      let totalVotes = 0;
      for (const rec of recs) {
        const name = candidateNames.get(rec.cand) ?? rec.cand;
        if (isAggregateName(name)) continue;
        const slug = pres2024NameToParty(name);
        partyVotes.set(slug, (partyVotes.get(slug) ?? 0) + rec.votes);
        totalVotes += rec.votes;
        candList.push({
          id: rec.cand,
          name,
          party: slug,
          votes: rec.votes,
        });
      }
      if (totalVotes === 0) continue;

      const shares: Record<string, number> = {};
      for (const [party, votes] of partyVotes.entries()) {
        shares[party] = (votes / totalVotes) * 100;
      }
      candList.sort((a, b) => b.votes - a.votes);
      const result: RegionResult = {
        regionId: canonicalizeAreaId(areaCode),
        electionId,
        votes: totalVotes,
        voters: 0,
        turnout: 0,
        shares,
      };
      if (candList.length > 0) result.candidates = candList;
      areas.push(result);
    }
    // Second pass — aa rows. 14d5 has the aa Alue codes (~1750 nationwide)
    // but querying them all in one shot would be ~19 000 cells — over
    // PxWeb's ~12 000 limit. Group by vp prefix and fetch per-vp instead;
    // largest vp (Uusimaa, 313 aa) is ~3 400 cells.
    const aaCodes = areaVar.values.filter(
      (c) => c !== "SSS" && !c.startsWith("VP") && !/^\d{3}$/.test(c),
    );
    const aaByVp = new Map<string, string[]>();
    for (const code of aaCodes) {
      const vp = code.slice(0, 2);
      const arr = aaByVp.get(vp);
      if (arr) arr.push(code);
      else aaByVp.set(vp, [code]);
    }
    const areaTexts = new Map<string, string>();
    areaVar.values.forEach((code, i) => {
      areaTexts.set(code, areaVar.valueTexts[i] ?? code);
    });

    for (const [vpPrefix, codes] of aaByVp.entries()) {
      let aaResp;
      try {
        aaResp = await withRetry(
          () =>
            pxwebClient.queryTable(dbPath, tableId, {
              query: [
                {
                  code: "Vuosi",
                  selection: { filter: "item", values: ["2024"] },
                },
                { code: "Alue", selection: { filter: "item", values: codes } },
                {
                  code: "Ehdokas",
                  selection: { filter: "all", values: ["*"] },
                },
                {
                  code: "Kierros",
                  selection: { filter: "item", values: [String(round)] },
                },
                {
                  code: "Tiedot",
                  selection: { filter: "item", values: ["pvaa_aanet"] },
                },
              ],
              response: { format: "json" as const },
            }),
          `pres2024 ${electionId} aa vp${vpPrefix}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[prefetch]   ${electionId}: aa vp${vpPrefix} skipped (${msg})`,
        );
        continue;
      }

      const aaRows: Row[] = [];
      for (const r of aaResp.data) {
        const area = String(r.key[1] ?? "");
        const cand = String(r.key[2] ?? "");
        const v = Number(r.values[0]);
        if (!Number.isFinite(v) || v <= 0) continue;
        if (cand === "00") continue;
        aaRows.push({ area, cand, votes: v });
      }
      const aaByArea = new Map<string, Row[]>();
      for (const r of aaRows) {
        const arr = aaByArea.get(r.area);
        if (arr) arr.push(r);
        else aaByArea.set(r.area, [r]);
      }
      for (const [aaCode, recs] of aaByArea.entries()) {
        const partyVotes = new Map<string, number>();
        const candList: Candidate[] = [];
        let totalVotes = 0;
        for (const rec of recs) {
          const name = candidateNames.get(rec.cand) ?? rec.cand;
          if (isAggregateName(name)) continue;
          const slug = pres2024NameToParty(name);
          partyVotes.set(slug, (partyVotes.get(slug) ?? 0) + rec.votes);
          totalVotes += rec.votes;
          candList.push({
            id: rec.cand,
            name,
            party: slug,
            votes: rec.votes,
          });
        }
        if (totalVotes === 0) continue;
        const shares: Record<string, number> = {};
        for (const [party, votes] of partyVotes.entries()) {
          shares[party] = (votes / totalVotes) * 100;
        }
        candList.sort((a, b) => b.votes - a.votes);
        const result: RegionResult = {
          regionId: aaCode,
          electionId,
          votes: totalVotes,
          voters: 0,
          turnout: 0,
          shares,
        };
        if (candList.length > 0) result.candidates = candList;
        const parentKunta = parseParentKunta(aaCode);
        if (parentKunta) result.parentKunta = parentKunta;
        const label = areaTexts.get(aaCode);
        if (label) result.label = label;
        areas.push(result);
      }
    }

    if (areas.length === 0) return { electionId, status: "no_data" };
    return { electionId, areas };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[prefetch]   ${electionId}: ${msg} → status:no_data`);
    return { electionId, status: "no_data" };
  }
}

/** Add per-kunta share rows to an older-pres fixture by reading the
 *  archive `km_ku_*` "vaalikartta" tables. They give per-candidate
 *  vote-share percentages plus a turnout % per kunta — no raw vote
 *  counts (so the per-kunta `votes` field stays at 0; the "Äänimäärä"
 *  workflow will read 0 for those kuntat). Winner / support % /
 *  Kannatuksen muutos still work, which is what the user asked for. */
async function attachOlderPresKuntaRows(
  areas: RegionResult[],
  electionId: string,
  year: number,
  round: 1 | 2,
): Promise<void> {
  const tableId =
    year === 2018 ? "km_ku_2018" : year === 2012 ? "km_ku_fi" : null;
  if (!tableId) return;
  const dbPath = "StatFin_Passiivi/pvaa";

  let meta;
  try {
    meta = await withRetry(
      () => pxwebClient.getTableMetadata(dbPath, tableId),
      `older pres meta ${electionId}`,
    );
  } catch (e) {
    console.warn(
      `[prefetch]   ${electionId}: km_ku meta failed (${(e as Error).message})`,
    );
    return;
  }

  const areaVar = meta.variables.find(
    (v) => v.code === "Kunta" || v.code === "Alue",
  );
  const measureVar = meta.variables.find(
    (v) => v.code === "Lukumäärätiedot" || v.code === "Tiedot",
  );
  if (!areaVar || !measureVar) return;

  // The 2012 table holds both rounds in one table. Round-1 share
  // columns are `Pro_NN`; round-2 columns get an `X` prefix.
  // The "kannatusmuutos" columns embed the party (`/KOK`, `/VIHR`)
  // — and they only appear for round 1 even on the 2012 table —
  // so we always read party from the un-prefixed `Muutos_NN`,
  // regardless of which round's shares we're collecting.
  const sharePrefix = round === 2 ? "Xpro_" : "Pro_";

  interface CandSlot {
    col: string;
    name: string;
    party: string;
  }
  const slots = new Map<string, CandSlot>();
  for (let i = 0; i < measureVar.values.length; i++) {
    const code = measureVar.values[i]!;
    const text = measureVar.valueTexts[i] ?? "";
    if (code.startsWith(sharePrefix)) {
      const num = code.slice(sharePrefix.length);
      const nameMatch = /^(.+?)n\s+kannatus/.exec(text);
      const name = nameMatch ? nameMatch[1] ?? num : num;
      const cleanName = name.replace(/n$/, "");
      const existing = slots.get(num);
      slots.set(num, {
        col: code,
        name: cleanName,
        party: existing?.party ?? "_unknown",
      });
    } else if (code.startsWith("Muutos_")) {
      // Always read /PARTY from round-1 Muutos labels — they're the
      // only ones that carry it.
      const num = code.slice("Muutos_".length);
      const partyMatch = /\/([A-ZÄÖa-zäö]+)\s+kannatusmuutos/i.exec(text);
      if (partyMatch) {
        const slug = partyKey(partyMatch[1], partyMatch[1]) ?? `_${partyMatch[1].toLowerCase()}`;
        const existing = slots.get(num);
        slots.set(num, {
          col: existing?.col ?? "",
          name: existing?.name ?? num,
          party: slug,
        });
      }
    }
  }
  // Drop slots that don't have a share column (e.g. Muutos-only).
  for (const [num, s] of slots.entries()) {
    if (!s.col) slots.delete(num);
  }
  if (slots.size === 0) return;

  let resp;
  try {
    resp = await withRetry(
      () =>
        pxwebClient.queryTable(dbPath, tableId, {
          query: [
            { code: areaVar.code, selection: { filter: "all", values: ["*"] } },
            {
              code: measureVar.code,
              selection: {
                filter: "item",
                values: Array.from(slots.values()).map((s) => s.col),
              },
            },
          ],
          response: { format: "json" as const },
        }),
      `older pres query ${electionId}`,
    );
  } catch (e) {
    console.warn(
      `[prefetch]   ${electionId}: km_ku query failed (${(e as Error).message})`,
    );
    return;
  }

  // Each row's key is [Alue, Lukumäärätiedot]; values[0] = the share %
  // (or "..." / null when the kunta didn't participate in r2 etc.).
  const sharesByKunta = new Map<string, Record<string, number>>();
  const candListByKunta = new Map<string, Candidate[]>();
  const orderedSlotEntries = Array.from(slots.entries()); // [candNum, slot]
  for (const r of resp.data) {
    const area = String(r.key[0] ?? "");
    const measureCode = String(r.key[1] ?? "");
    if (area === "SSS") continue;
    if (!/^\d{3}$/.test(area)) continue;
    const slotEntry = orderedSlotEntries.find(([, s]) => s.col === measureCode);
    if (!slotEntry) continue;
    const [candNum, slot] = slotEntry;
    const raw = r.values[0];
    if (raw == null || raw === "..." || raw === ".") continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) continue;
    const sh = sharesByKunta.get(area) ?? {};
    sh[slot.party] = (sh[slot.party] ?? 0) + v;
    sharesByKunta.set(area, sh);
    const cl = candListByKunta.get(area) ?? [];
    cl.push({
      id: `${year}_${round}_${candNum}`,
      name: slot.name,
      party: slot.party,
      // The km_ku table only has shares — store the share-percent in
      // `votes` as a stand-in so the candidate list at least sorts
      // correctly. Real vote counts would need a second fetch.
      votes: Math.round(v * 100),
    });
    candListByKunta.set(area, cl);
  }

  for (const [area, shares] of sharesByKunta.entries()) {
    const cands = (candListByKunta.get(area) ?? []).sort(
      (a, b) => b.votes - a.votes,
    );
    const result: RegionResult = {
      regionId: area,
      electionId,
      // No raw vote counts in km_ku — leave votes=0; voters/turnout
      // could be backfilled from the äänestystiedot table later.
      votes: 0,
      voters: 0,
      turnout: 0,
      shares,
    };
    if (cands.length > 0) result.candidates = cands;
    areas.push(result);
  }
  console.log(
    `[prefetch]   ${electionId}: older-pres kunta rows → ${sharesByKunta.size}`,
  );
}

async function buildPresidentialFixture(
  electionId: string,
  year: number,
  round: 1 | 2,
): Promise<FixtureFile> {
  // 2024 has the all-areas single-table 14d5 — use it for vp + kunta.
  // 2018 / 2012 fall back to the multi-year 14db (vp-only).
  if (year === 2024) {
    return buildPres2024Fixture(electionId, round);
  }
  try {
    // Fetch metadata once so we can attach human-readable candidate
    // names to the fixture (composer and Ledger render them as-is).
    const meta = await withRetry(
      () =>
        pxwebClient.getTableMetadata("StatFin/pvaa", "statfin_pvaa_pxt_14db"),
      `pres meta ${electionId}`,
    );
    const ehdVar = meta.variables.find((v) => v.code === "Ehdokkaat");
    const candNames = new Map<string, string>();
    ehdVar?.values.forEach((code, i) => {
      candNames.set(code, ehdVar.valueTexts[i] ?? code);
    });

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
      const candByKey = new Map<string, Candidate>();
      let totalVotes = 0;
      for (const rec of recs) {
        const slug =
          PRESIDENTIAL_CANDIDATE_PARTY[rec.candidateId] ??
          `_cand${rec.candidateId}`;
        partyVotes.set(slug, (partyVotes.get(slug) ?? 0) + rec.votes);
        totalVotes += rec.votes;
        // Pre-2013 vp boundary remap means multiple old vp rows can
        // collapse to one canonical vp; sum candidate votes across
        // those rows so a candidate appears once per canonical vp.
        const existing = candByKey.get(rec.candidateId);
        if (existing) {
          existing.votes += rec.votes;
        } else {
          candByKey.set(rec.candidateId, {
            id: rec.candidateId,
            name: candNames.get(rec.candidateId) ?? rec.candidateId,
            party: slug,
            votes: rec.votes,
          });
        }
      }
      if (totalVotes === 0) continue;

      const shares: Record<string, number> = {};
      for (const [party, votes] of partyVotes.entries()) {
        shares[party] = (votes / totalVotes) * 100;
      }
      const candList = Array.from(candByKey.values()).sort(
        (a, b) => b.votes - a.votes,
      );
      const result: RegionResult = {
        regionId: vpId,
        electionId,
        votes: totalVotes,
        voters: 0,
        turnout: 0,
        shares,
      };
      if (candList.length > 0) result.candidates = candList;
      areas.push(result);
    }

    if (areas.length === 0) {
      console.warn(`[prefetch]   ${electionId}: 0 areas after aggregation → status:no_data`);
      return { electionId, status: "no_data" };
    }
    // Append per-kunta rows from the archive vaalikartta tables so
    // older pres elections aren't 100 % crosshatch when the user
    // drills into a vaalipiiri.
    await attachOlderPresKuntaRows(areas, electionId, year, round);
    return { electionId, areas };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[prefetch]   ${electionId}: ${msg} → status:no_data`);
    return { electionId, status: "no_data" };
  }
}


/* ─── Hyvinvointialue mapping + aggregation ─────────────────── */

/** PxWeb HV codes (01..21) → human-readable names. Order matches the
 *  REGIONAL_TABLES mapping in the elections submodule (Helsinki is
 *  excluded — it has no aluevaalit and acts as its own welfare
 *  authority). Used by the runtime to label HVA pills + tooltips. */
const HVA_NAMES: Record<string, string> = {
  "01": "Itä-Uusimaa",
  "02": "Keski-Uusimaa",
  "03": "Länsi-Uusimaa",
  "04": "Vantaa-Kerava",
  "05": "Varsinais-Suomi",
  "06": "Satakunta",
  "07": "Kanta-Häme",
  "08": "Pirkanmaa",
  "09": "Päijät-Häme",
  "10": "Kymenlaakso",
  "11": "Etelä-Karjala",
  "12": "Etelä-Savo",
  "13": "Pohjois-Savo",
  "14": "Pohjois-Karjala",
  "15": "Keski-Suomi",
  "16": "Etelä-Pohjanmaa",
  "17": "Pohjanmaa",
  "18": "Keski-Pohjanmaa",
  "19": "Pohjois-Pohjanmaa",
  "20": "Kainuu",
  "21": "Lappi",
};

/** Derived at build time from the aluevaalit 2025 äänestysalue
 *  codes (vp_ku_prefix format = `<HV><kunta><aa>`). PxWeb's own
 *  area codes ARE the source of truth for the kunta→HVA mapping;
 *  no hardcoding needed. */
interface HvaMapping {
  /** kuntakoodi → 2-digit HVA code. Helsinki + Ahvenanmaa absent
   *  (they don't participate in aluevaalit). */
  kuntaToHva: Record<string, string>;
  /** HVA code → vp slug ("uus", "pir", …). Each HVA lies fully
   *  within one vaalipiiri, so the lookup is unambiguous. */
  hvaToVp: Record<string, string>;
}

async function deriveHvaMapping(): Promise<HvaMapping | null> {
  // Fetch alvaa 2025 area data via the regional party loader. This
  // is the same call rebatched later for the alue fixture build —
  // the cache layer makes the second call free.
  let res;
  try {
    res = await withRetry(
      () => loadPartyResults(2025, undefined, "regional"),
      "hva-mapping",
    );
  } catch (e) {
    console.warn(
      `[prefetch]   hva mapping derivation failed (${(e as Error).message})`,
    );
    return null;
  }
  const kuntaToHva: Record<string, string> = {};
  for (const r of res.rows) {
    if (r.area_level !== "aanestysalue") continue;
    const m = /^(\d{2})(\d{3})/.exec(r.area_id);
    if (!m) continue;
    const hv = m[1]!;
    const kunta = m[2]!;
    if (kuntaToHva[kunta]) continue;
    kuntaToHva[kunta] = hv;
  }
  if (Object.keys(kuntaToHva).length === 0) {
    console.warn(`[prefetch]   hva mapping is empty — no aa rows in alue 2025`);
    return null;
  }

  // Cross-reference with fi-kunnat.json to find each HVA's parent vp.
  const kunnatRaw = await readFile(
    resolve(REPO_ROOT, "data/fi-kunnat.json"),
    "utf8",
  );
  const kunnatGeo = JSON.parse(kunnatRaw) as {
    features: Array<{ id: string; vp: string }>;
  };
  const maps = await loadGeometryMaps();
  if (!maps) return null;
  const kuntaToVpSlug = new Map<string, string>();
  for (const f of kunnatGeo.features) kuntaToVpSlug.set(f.id, f.vp);

  const hvaToVp: Record<string, string> = {};
  for (const [kunta, hv] of Object.entries(kuntaToHva)) {
    const vpSlug = kuntaToVpSlug.get(kunta);
    if (vpSlug && !hvaToVp[hv]) hvaToVp[hv] = vpSlug;
  }
  console.log(
    `[prefetch]   hva mapping: ${Object.keys(kuntaToHva).length} kuntat → ${Object.keys(hvaToVp).length} HVAs`,
  );
  return { kuntaToHva, hvaToVp };
}

/** For non-alue fixtures, synthesise per-HVA aggregate rows from the
 *  fixture's kunta-level rows. Each HVA's votes = sum of its
 *  member kuntat's votes; shares = vote-weighted average; candidates
 *  merged by id. */
function attachHvaAggregates(
  areas: RegionResult[],
  electionId: string,
  mapping: HvaMapping,
): void {
  // Group kunta rows by HVA.
  const byHva = new Map<string, RegionResult[]>();
  for (const a of areas) {
    if (!/^\d{3}$/.test(a.regionId)) continue;
    const hv = mapping.kuntaToHva[a.regionId];
    if (!hv) continue;
    const arr = byHva.get(hv);
    if (arr) arr.push(a);
    else byHva.set(hv, [a]);
  }

  for (const [hv, rows] of byHva.entries()) {
    let totalVotes = 0;
    let totalVoters = 0;
    const partyVotes = new Map<string, number>();
    const partyShareSum = new Map<string, number>();
    const partyShareN = new Map<string, number>();
    const candById = new Map<
      string,
      { id: string; name: string; party: string; votes: number }
    >();
    for (const r of rows) {
      totalVotes += r.votes;
      totalVoters += r.voters;
      for (const [party, share] of Object.entries(r.shares)) {
        if (share == null) continue;
        partyVotes.set(
          party,
          (partyVotes.get(party) ?? 0) + (r.votes * share) / 100,
        );
        partyShareSum.set(party, (partyShareSum.get(party) ?? 0) + share);
        partyShareN.set(party, (partyShareN.get(party) ?? 0) + 1);
      }
      if (r.candidates) {
        for (const c of r.candidates) {
          const existing = candById.get(c.id);
          if (existing) existing.votes += c.votes;
          else candById.set(c.id, { ...c });
        }
      }
    }
    if (rows.length === 0) continue;
    const shares: Record<string, number> = {};
    if (totalVotes > 0) {
      for (const [p, v] of partyVotes.entries()) {
        shares[p] = (v / totalVotes) * 100;
      }
    } else {
      // No raw vote counts (older-pres archive km_ku tables) — fall
      // back to simple share averaging across the HVA's kuntat. Less
      // accurate than vote-weighted but lets the HVA view paint
      // older pres elections with sensible colors.
      const n = rows.length;
      for (const [p, sum] of partyShareSum.entries()) {
        shares[p] = sum / n;
      }
    }
    const turnout = totalVoters > 0 ? (totalVotes / totalVoters) * 100 : 0;
    const result: RegionResult = {
      regionId: `hv${hv}`,
      electionId,
      votes: totalVotes,
      voters: totalVoters,
      turnout,
      shares,
    };
    const cands = Array.from(candById.values()).sort(
      (a, b) => b.votes - a.votes,
    );
    if (cands.length > 0) result.candidates = cands.slice(0, TOP_N_PER_REGION);
    areas.push(result);
  }
}

/* ─── Alue: per-vp aggregation from kunta rows ──────────────── */

/** Loads the vp-slug → vp-code mapping and the kunta-code → vp-code
 *  mapping from the geometry files. The aluevaalit fixture's 2-digit
 *  codes are hyvinvointialueet (HV01..HV21), not vaalipiirit, so the
 *  App's "regionId='02' → Uusimaa" lookup gets HV02 = Keski-Uusimaa
 *  data and renders Uusimaa vp colored by Keski-Uusimaa results. The
 *  fix: synthesise per-vp aggregate rows from the kunta-level data
 *  using the geometry's vp grouping, and overwrite the broken
 *  2-digit rows. */
let geometryMaps: {
  /** vp slug ("hel", "uus", …) → vp 2-digit code ("01", "02", …). */
  vpSlugToCode: Map<string, string>;
  /** kunta 3-digit code → vp 2-digit code. */
  kuntaToVp: Map<string, string>;
} | null = null;

async function loadGeometryMaps(): Promise<typeof geometryMaps> {
  if (geometryMaps) return geometryMaps;
  const vps = JSON.parse(
    await readFile(resolve(REPO_ROOT, "data/fi-vaalipiirit.json"), "utf8"),
  ) as { features: Array<{ id: string; code: string }> };
  const kuntat = JSON.parse(
    await readFile(resolve(REPO_ROOT, "data/fi-kunnat.json"), "utf8"),
  ) as { features: Array<{ id: string; vp: string }> };
  const vpSlugToCode = new Map<string, string>();
  for (const f of vps.features) vpSlugToCode.set(f.id, f.code);
  const kuntaToVp = new Map<string, string>();
  for (const k of kuntat.features) {
    const vpCode = vpSlugToCode.get(k.vp);
    if (vpCode) kuntaToVp.set(k.id, vpCode);
  }
  geometryMaps = { vpSlugToCode, kuntaToVp };
  return geometryMaps;
}

/** Replace an alue fixture's 2-digit rows (which are hyvinvointialue
 *  aggregates, not vaalipiiri) with per-vp aggregates synthesised
 *  from the kunta-level rows.
 *
 *  Before dropping, preserves the original HVA-level rows under
 *  `hv<NN>` regionIds so they're available to the runtime HVA view.
 *  Aluevaalit's HVA results come straight from PxWeb here — no
 *  kunta-aggregation needed (the user spec'd this distinction). */
async function rewriteAlueVpAggregates(areas: RegionResult[], electionId: string): Promise<void> {
  const maps = await loadGeometryMaps();
  if (!maps) return;
  const { kuntaToVp } = maps;

  // Capture PxWeb's authoritative HVA aggregates BEFORE we touch them.
  const hvaRows: RegionResult[] = [];
  for (const a of areas) {
    if (/^\d{2}$/.test(a.regionId)) {
      hvaRows.push({ ...a, regionId: `hv${a.regionId}` });
    }
  }

  // Group kunta rows by their vp code.
  const byVp = new Map<string, RegionResult[]>();
  for (const a of areas) {
    if (!/^\d{3}$/.test(a.regionId)) continue;
    const vp = kuntaToVp.get(a.regionId);
    if (!vp) continue;
    const arr = byVp.get(vp);
    if (arr) arr.push(a);
    else byVp.set(vp, [a]);
  }
  // Build per-vp aggregate row: sum votes + voters, weight shares
  // by votes. Voters / turnout cascade from the kunta rows that
  // attachTurnout populated; the per-vp turnout is recomputed from
  // the summed totals so the value is internally consistent.
  const vpRows: RegionResult[] = [];
  for (const [vpCode, rows] of byVp.entries()) {
    let totalVotes = 0;
    let totalVoters = 0;
    const partyVotes = new Map<string, number>();
    for (const r of rows) {
      totalVotes += r.votes;
      totalVoters += r.voters;
      for (const [party, share] of Object.entries(r.shares)) {
        if (share == null) continue;
        const w = (r.votes * share) / 100;
        partyVotes.set(party, (partyVotes.get(party) ?? 0) + w);
      }
    }
    if (totalVotes === 0) continue;
    const shares: Record<string, number> = {};
    for (const [party, v] of partyVotes.entries()) {
      shares[party] = (v / totalVotes) * 100;
    }
    vpRows.push({
      regionId: vpCode,
      electionId,
      votes: totalVotes,
      voters: totalVoters,
      turnout: totalVoters > 0 ? (totalVotes / totalVoters) * 100 : 0,
      shares,
    });
  }
  // Drop existing 2-digit rows (hv aggregates) and append vp aggregates
  // + the preserved HVA rows under `hv<NN>` ids.
  for (let i = areas.length - 1; i >= 0; i--) {
    const reg = areas[i]!.regionId;
    if (/^\d{2}$/.test(reg)) areas.splice(i, 1);
  }
  areas.push(...vpRows, ...hvaRows);
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

/** Persist running totals at module scope so the `process.on("exit")`
 *  hook can print them no matter how the script terminates — silent
 *  OOM kills (kernel SIGKILL on small hosts) used to leave the user
 *  with a missing dist/ and zero diagnostic. The hook runs even on
 *  uncaught exceptions and graceful exit, so the operator always
 *  sees how far the prefetch got. */
const progress = {
  withData: 0,
  withoutData: 0,
  failed: 0,
  totalBytes: 0,
  attempted: 0,
  finished: false,
};

process.on("exit", (code) => {
  if (progress.finished) return; // main() already printed its own summary
  const totalKb = (progress.totalBytes / 1024).toFixed(1);
  console.warn(
    `[prefetch] EXIT code=${code} — partial run: ${progress.withData} with data, ` +
      `${progress.withoutData} no_data, ${progress.failed} failed, ` +
      `${progress.attempted}/${ELECTIONS.length} elections attempted, ` +
      `${totalKb} KB written`,
  );
  if (progress.attempted < ELECTIONS.length) {
    console.warn(
      "[prefetch] hint: a silent kill at this point is usually OOM. " +
        "See deploy.md → build host requirements.",
    );
  }
});

/** Compare AA-candidate side-file coverage against the monolith's
 *  äänestysalue rows and log it, so "all data caught" is verifiable and
 *  a gap is never silent. Only meaningful for elections whose monolith
 *  carries aa rows; others are skipped. */
function auditAaCoverage(electionId: string, fixture: FixtureFile): void {
  const monoAa = (fixture.areas ?? []).filter((a) => a.parentKunta).length;
  if (monoAa === 0) return;
  const dir = resolve(OUT_DIR, electionId, "aa-cands");
  let withCands = 0;
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const obj = JSON.parse(readFileSync(resolve(dir, f), "utf8")) as Record<
          string,
          unknown
        >;
        withCands += Object.keys(obj).length;
      } catch {
        // skip an unreadable side file — coverage just reads lower
      }
    }
  }
  const pct = (withCands / monoAa) * 100;
  const flag = pct >= 95 ? "" : " ⚠ below 95% — re-run to fill (resumable)";
  console.log(
    `[prefetch]   ${electionId}: aa-candidate coverage ${withCands}/${monoAa} (${pct.toFixed(
      0,
    )}%)${flag}`,
  );
}

async function main(): Promise<void> {
  await copyGeometry();
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`[prefetch] writing fixtures to ${OUT_DIR}`);

  // Derive the kunta→HVA mapping once, before any fixture build. Used
  // to synthesise per-HVA aggregate rows for non-alue elections (alue
  // takes its HVA rows directly from PxWeb).
  const hvaMapping = await deriveHvaMapping();
  if (hvaMapping) {
    const file = resolve(PUBLIC_DATA, "kunta-hva.json");
    await writeFile(
      file,
      JSON.stringify({
        kuntaToHva: hvaMapping.kuntaToHva,
        hvaToVp: hvaMapping.hvaToVp,
        hvaNames: HVA_NAMES,
      }),
      "utf8",
    );
    console.log(`[prefetch] wrote kunta-hva.json (${Object.keys(hvaMapping.kuntaToHva).length} kuntat)`);
  }

  for (const e of ELECTIONS) {
    progress.attempted += 1;
    try {
      const fixture = await buildFixture(e.id, e.typeId, e.year, hvaMapping);
      const json = JSON.stringify(fixture);
      const path = resolve(OUT_DIR, `${e.id}.json`);
      await writeFile(path, json, "utf8");
      progress.totalBytes += json.length;

      if (fixture.status === "no_data") {
        progress.withoutData += 1;
      } else {
        progress.withData += 1;
        const areaCount = fixture.areas?.length ?? 0;
        console.log(
          `[prefetch]   ${e.id}: ${areaCount} areas, ${(json.length / 1024).toFixed(1)} KB`,
        );
        auditAaCoverage(e.id, fixture);
      }
    } catch (err) {
      // One election's failure (transient PxWeb error, parsing issue,
      // …) shouldn't tank the whole build. Log the failure, write a
      // no_data placeholder so the deployed app crosshatches that
      // election cleanly instead of hard-erroring on a missing fixture
      // file, and carry on.
      progress.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[prefetch] ${e.id}: failed: ${msg}`);
      try {
        const placeholder = JSON.stringify({
          electionId: e.id,
          status: "no_data",
        });
        await writeFile(
          resolve(OUT_DIR, `${e.id}.json`),
          placeholder,
          "utf8",
        );
        progress.totalBytes += placeholder.length;
      } catch {
        // ignore — the EXIT hook will surface the partial state
      }
    }

    // Hint to V8 to release per-election working memory before the
    // next iteration. Only fires when the runner is started with
    // --expose-gc (package.json's prefetch script does so). On a
    // 4 GB host this can be the difference between completing and
    // an OOM kill mid-prefetch.
    if (typeof globalThis.gc === "function") globalThis.gc();
  }

  const totalKb = (progress.totalBytes / 1024).toFixed(1);
  console.log(
    `[prefetch] done — ${progress.withData} with data, ` +
      `${progress.withoutData} no_data, ${progress.failed} failed, ` +
      `${totalKb} KB total`,
  );
  if (aaSideFileBytes > 0) {
    console.log(
      `[prefetch] aa-candidate side files: ${(aaSideFileBytes / 1024 / 1024).toFixed(2)} MB ` +
        `(lazy — not counted against the page-weight budget)`,
    );
  }
  progress.finished = true;

  if (progress.totalBytes > SIZE_BUDGET_BYTES) {
    console.warn(
      `[prefetch] WARNING: output ${(progress.totalBytes / 1024 / 1024).toFixed(2)} MB exceeds 10 MB budget`,
    );
  }

  if (progress.failed > 0) {
    // Non-zero exit so CI surfaces the partial run, but only after
    // we've written the placeholders + final summary above.
    process.exitCode = 1;
  }
}

await main();
