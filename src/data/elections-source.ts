/**
 * ElectionDataSource — the only sanctioned data path in production
 * (per CLAUDE.md hard constraint). The `LocalFixtureSource` impl
 * loads pre-built JSON fixtures from /data/elections/{electionId}.json
 * — fixtures are generated at build time by `scripts/build-fixtures.ts`
 * (Phase 1 wires that up to the elections submodule's loaders).
 */

import type {
  AreaLevel,
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
}

/**
 * Reads pre-built JSON fixtures from `/data/elections/{id}.json`.
 *
 * Fixtures are emitted by `scripts/build-fixtures.ts` at build time.
 * The deployed app does no runtime PxWeb fetch — this loader just
 * pulls static JSON, caches it per-election, and slices it.
 *
 * Phase 0 stub: fixtures don't exist yet, so every load currently
 * returns `{ status: "no_data" }`. Phase 1 wires the prefetch
 * script and this loader against real data.
 */
export class LocalFixtureSource implements ElectionDataSource {
  private cache = new Map<ElectionId, FixtureFile>();

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
    _parentId: RegionId | null,
    electionId: ElectionId,
  ): Promise<RegionResult[]> {
    const fixture = await this.load(electionId);
    if (fixture.status === "no_data" || !fixture.areas) return [];

    // Filter by region-id pattern (set by `scripts/build-fixtures.ts`):
    //   2-digit numeric → vaalipiiri or hyvinvointialue
    //   3-digit numeric → kunta
    // Phase 2 wires `parentId` once geometry has the vp/hv ↔ kunta
    // mapping; for now we return all areas at the requested level
    // and let `HierarchyMap` intersect with geometry.
    if (level === "vp") {
      return fixture.areas.filter((a) => /^\d{2}$/.test(a.regionId));
    }
    if (level === "kunta") {
      return fixture.areas.filter((a) => /^\d{3}$/.test(a.regionId));
    }
    // "maa" and "aa" levels: visualizer doesn't render fixture areas
    // directly at those levels (country sums computed by UI;
    // äänestysalueet out of scope).
    return [];
  }
}
