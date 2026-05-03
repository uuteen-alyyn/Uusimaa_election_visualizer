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

/** Strip VP/HV/KU prefixes so fixtures use bare numeric codes that
 *  match `data/fi-vaalipiirit.json` `code` and `data/fi-kunnat.json` `id`. */
function canonicalizeAreaId(rawId: string): string {
  if (rawId.startsWith("VP") || rawId.startsWith("HV")) return rawId.slice(2);
  if (rawId.startsWith("KU")) return rawId.slice(2);
  return rawId;
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
    const totalVotes = records.reduce((s, r) => s + (r.votes || 0), 0);
    const shares: Record<string, number> = {};
    for (const r of records) {
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

  // Presidential elections need candidate-table aggregation, not
  // party-table: skip for Phase 1 first cut. Tracked in BACKLOG.
  if (electionType === "presidential") {
    console.warn(`[prefetch]   ${electionId}: presidential — deferred to Phase 1.x → status:no_data`);
    return { electionId, status: "no_data" };
  }

  try {
    const res = await loadPartyResults(year, undefined, electionType);
    const areas = aggregateRows(res.rows, electionId);
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
