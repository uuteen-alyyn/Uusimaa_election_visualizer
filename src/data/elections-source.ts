/**
 * ElectionDataSource — the only sanctioned data path in production
 * (per CLAUDE.md hard constraint). The `LocalFixtureSource` impl
 * loads pre-built JSON fixtures from /data/elections/{electionId}.json
 * — fixtures are generated at build time by `scripts/build-fixtures.ts`
 * (Phase 1 wires that up to the elections submodule's loaders).
 */

import type {
  AreaLevel,
  Candidate,
  ElectionId,
  RegionId,
  RegionResult,
} from "../types/elections";

/** Wire shape on disk for `public/data/elections/{electionId}.json`. */
export interface FixtureFile {
  electionId: ElectionId;
  /** Set to `"no_data"` for elections in the catalog that don't yet
   *  have PxWeb results (e.g. future ek2027). */
  status?: "no_data";
  /** All regions across all levels for this election. */
  areas?: RegionResult[];
}

/** The visualizer's data-access boundary.
 *
 *  All UI code that needs election results goes through this.
 *  The interface is kept narrow on purpose — implementations are
 *  free to back it with fixtures, an HTTP API, or fakes for tests. */
export interface ElectionDataSource {
  /** Fetch a single region's result. Returns `null` for unknown
   *  regions or elections without data. */
  getRegionResult(
    regionId: RegionId,
    electionId: ElectionId,
  ): Promise<RegionResult | null>;

  /** Bulk fetch — every region at the given level for one election.
   *  Used to color the entire map at once. Returns `[]` when the
   *  election has no data. */
  listAreas(
    level: AreaLevel,
    parentId: RegionId | null,
    electionId: ElectionId,
  ): Promise<RegionResult[]>;

  /** Country-level top candidates for an election — vp-level
   *  candidate rows merged by id and re-sorted by total votes.
   *  Used by the formula composer to offer per-candidate chips.
   *  Returns `[]` when the election has no candidate data. */
  listCandidates(electionId: ElectionId): Promise<Candidate[]>;
}

/** Wire shape of `public/data/kunta-hva.json` — emitted by the
 *  build-time prefetch and read once at runtime to power the HVA
 *  view's grouping and per-vp filtering. */
export interface KuntaHvaMap {
  kuntaToHva: Record<string, string>;
  hvaToVp: Record<string, string>;
  hvaNames: Record<string, string>;
}

/**
 * Reads pre-built JSON fixtures from `/data/elections/{id}.json`.
 *
 * Fixtures are emitted by `scripts/build-fixtures.ts` at build time.
 * The deployed app does no runtime PxWeb fetch — this loader just
 * pulls static JSON, caches it per-election, and slices it.
 */
export class LocalFixtureSource implements ElectionDataSource {
  private cache = new Map<ElectionId, FixtureFile>();
  private hvaMapPromise: Promise<KuntaHvaMap | null> | null = null;

  private async load(electionId: ElectionId): Promise<FixtureFile> {
    const cached = this.cache.get(electionId);
    if (cached) return cached;

    let fixture: FixtureFile;
    try {
      const res = await fetch(`/data/elections/${electionId}.json`);
      if (res.ok) {
        fixture = (await res.json()) as FixtureFile;
      } else {
        fixture = { electionId, status: "no_data" };
      }
    } catch {
      fixture = { electionId, status: "no_data" };
    }

    this.cache.set(electionId, fixture);
    return fixture;
  }

  async getRegionResult(
    regionId: RegionId,
    electionId: ElectionId,
  ): Promise<RegionResult | null> {
    const fixture = await this.load(electionId);
    if (fixture.status === "no_data" || !fixture.areas) return null;
    return fixture.areas.find((a) => a.regionId === regionId) ?? null;
  }

  async listAreas(
    level: AreaLevel,
    parentId: RegionId | null,
    electionId: ElectionId,
  ): Promise<RegionResult[]> {
    const fixture = await this.load(electionId);
    if (fixture.status === "no_data" || !fixture.areas) return [];

    // Filter by region-id pattern (set by `scripts/build-fixtures.ts`):
    //   2-digit numeric → vaalipiiri or hyvinvointialue
    //   3-digit numeric → kunta
    //   anything else with `parentKunta` set → äänestysalue
    if (level === "vp") {
      return fixture.areas.filter((a) => /^\d{2}$/.test(a.regionId));
    }
    if (level === "kunta") {
      return fixture.areas.filter((a) => /^\d{3}$/.test(a.regionId));
    }
    if (level === "aa") {
      // `parentId === null` returns every aa row in the fixture —
      // the formula evaluator preloads AA across whichever
      // elections the formula chips reference, then the per-region
      // lookup resolves each id locally.
      if (parentId == null) {
        return fixture.areas.filter((a) => a.parentKunta != null);
      }
      // Drilling into a kunta — only that kunta's äänestysalueet.
      return fixture.areas.filter((a) => a.parentKunta === parentId);
    }
    if (level === "hva") {
      // HVA rows live under `hv<NN>` regionIds. When `parentId` is a
      // vp slug ("uus", "pir", …), filter to that vp's HVAs.
      const all = fixture.areas.filter((a) => /^hv\d{2}$/.test(a.regionId));
      if (!parentId) return all;
      const map = await this.loadHvaMap();
      if (!map) return all;
      return all.filter((a) => {
        const code = a.regionId.slice(2);
        return map.hvaToVp[code] === parentId;
      });
    }
    // "maa": country aggregate is computed by the UI from vp rows.
    return [];
  }

  /** Lazily fetch + cache the kunta→HVA mapping written by the
   *  build-time prefetch. Returns null when the file isn't present
   *  (e.g. on a stale deploy that pre-dates the HVA feature). */
  loadHvaMap(): Promise<KuntaHvaMap | null> {
    if (!this.hvaMapPromise) {
      this.hvaMapPromise = (async () => {
        try {
          const res = await fetch("/data/kunta-hva.json");
          if (!res.ok) return null;
          return (await res.json()) as KuntaHvaMap;
        } catch {
          return null;
        }
      })();
    }
    return this.hvaMapPromise;
  }

  private candidateCache = new Map<ElectionId, Candidate[]>();

  async listCandidates(electionId: ElectionId): Promise<Candidate[]> {
    const cached = this.candidateCache.get(electionId);
    if (cached) return cached;
    const fixture = await this.load(electionId);
    if (fixture.status === "no_data" || !fixture.areas) {
      this.candidateCache.set(electionId, []);
      return [];
    }

    /** Merge candidates from one set of region rows. Each candidate
     *  id is unique within an election, so summing votes across rows
     *  gives a national total. */
    const mergeFrom = (predicate: (a: RegionResult) => boolean): Candidate[] => {
      const byId = new Map<string, Candidate>();
      for (const a of fixture.areas!) {
        if (!predicate(a)) continue;
        if (!a.candidates) continue;
        for (const c of a.candidates) {
          const existing = byId.get(c.id);
          if (existing) existing.votes += c.votes;
          else byId.set(c.id, { ...c });
        }
      }
      return Array.from(byId.values()).sort((a, b) => b.votes - a.votes);
    };

    // Try vp-level first — vp aggregate rows are the cleanest source
    // when the build-time prefetch attaches candidates there
    // (parliamentary, regional, presidential).
    let list = mergeFrom((a) => /^\d{2}$/.test(a.regionId));
    // Fall back to kunta-level when vp has no candidates
    // (kuntavaalit: candidate tables don't carry a VP## aggregate
    //  row, so candidates only appear on the 3-digit kunta rows).
    if (list.length === 0) {
      list = mergeFrom((a) => /^\d{3}$/.test(a.regionId));
    }
    // No cap — the binding picker filters by name and only renders
    // ~25 results at a time, and the data already lives in memory
    // from the fixture load. Capping would silently hide candidates
    // who fell outside the top-N nationally (the user's complaint:
    // "in search candidate I cannot find all of the candidates").
    this.candidateCache.set(electionId, list);
    return list;
  }
}
