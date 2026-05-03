/**
 * Phase 2 demo — first real-data milestone.
 *
 * Renders all 13 vaalipiirit colored by the eduskuntavaalit 2023
 * winner with real Finnish geometry. Double-clicking a vp drills
 * into its kunnat. Click selects (thick stroke); the breadcrumb
 * pill returns to the country view.
 *
 * The full dashboard (workflow bar, formula composer, ledger,
 * share link, exports) lands in Phase 3.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ELECTION_BY_ID } from "./data/catalog";
import { LocalFixtureSource } from "./data/elections-source";
import { loadGeometry, type ProjectedGeometry } from "./data/geometry";
import { HierarchyMap, type DisplayLevel } from "./components/HierarchyMap";
import { fillForRegion } from "./lib/color-ramps";
import type { RegionResult } from "./types/elections";

const ELECTION_ID = "ek2023";

export function App(): JSX.Element {
  const [geometry, setGeometry] = useState<ProjectedGeometry | null>(null);
  const [resultsByRegion, setResultsByRegion] = useState<Map<
    string,
    RegionResult
  > | null>(null);
  const [level, setLevel] = useState<DisplayLevel>("vp");
  const [parentSlug, setParentSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const source = useMemo(() => new LocalFixtureSource(), []);

  // Load geometry once.
  useEffect(() => {
    loadGeometry().then(setGeometry).catch((err: unknown) => {
      setLoadError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  // Load ek2023 results — both vp and kunta levels merged into one map.
  useEffect(() => {
    void (async () => {
      try {
        const [vpRows, kuntaRows] = await Promise.all([
          source.listAreas("vp", null, ELECTION_ID),
          source.listAreas("kunta", null, ELECTION_ID),
        ]);
        const map = new Map<string, RegionResult>();
        for (const r of [...vpRows, ...kuntaRows]) map.set(r.regionId, r);
        setResultsByRegion(map);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [source]);

  // Caller-supplied fill function — winner mode only for Phase 2.
  const getFill = useCallback(
    (regionId: string): string => {
      const result = resultsByRegion?.get(regionId) ?? null;
      return fillForRegion(result, "winner");
    },
    [resultsByRegion],
  );

  const onPick = useCallback((id: string) => setSelected(id), []);

  const onZoomIn = useCallback(
    (id: string) => {
      if (level !== "vp" || !geometry) return;
      // Map fixture's 2-digit code → geometry's vp slug for kunta lookup.
      const vp = geometry.vaalipiirit.find((v) => v.id === id);
      if (!vp) return;
      setLevel("kunta");
      setParentSlug(vp.slug);
      setSelected(null);
    },
    [level, geometry],
  );

  const drillUp = useCallback(() => {
    setLevel("vp");
    setParentSlug(null);
    setSelected(null);
  }, []);

  const electionLabel = ELECTION_BY_ID[ELECTION_ID]?.label ?? ELECTION_ID;
  const parentVp =
    level === "kunta" && parentSlug && geometry
      ? geometry.vaalipiirit.find((v) => v.slug === parentSlug)
      : null;

  // Loading / error states.
  if (loadError) {
    return (
      <div className="page">
        <header>
          <h1>Vaalit — tulosvisualisointi</h1>
        </header>
        <main>
          <p style={{ color: "var(--ch-minus)" }}>
            Couldn't load data: {loadError}
          </p>
        </main>
      </div>
    );
  }
  if (!geometry || !resultsByRegion) {
    return (
      <div className="page">
        <header>
          <h1>Vaalit — tulosvisualisointi</h1>
        </header>
        <main>
          <p style={{ opacity: 0.6 }}>Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <header>
        <h1>Vaalit — tulosvisualisointi</h1>
        <div className="crumb" style={{ marginBottom: 6 }}>
          <span
            className={"pill" + (level === "vp" ? " on" : "")}
            style={{ cursor: "pointer" }}
            onClick={drillUp}
          >
            ⌂ Koko Suomi
          </span>
          {parentVp ? (
            <>
              <span className="sep">›</span>
              <span className="h" style={{ fontSize: 18, fontWeight: 700 }}>
                {parentVp.label}
              </span>
            </>
          ) : null}
        </div>
        <p className="subtitle">
          {electionLabel} · suurin puolue · kaksoisklikkaa aluetta porautuaksesi
        </p>
      </header>

      <main style={{ display: "flex", justifyContent: "center" }}>
        <HierarchyMap
          geometry={geometry}
          level={level}
          parentSlug={parentSlug}
          selected={selected}
          getFill={getFill}
          onPick={onPick}
          onZoomIn={onZoomIn}
          width={520}
          height={640}
        />
      </main>

      <footer>
        <small>
          Lähde: Tilastokeskus, vaalitilastot (CC BY 4.0) ·
          Tilastointialueet © Tilastokeskus, CC BY 4.0
        </small>
      </footer>
    </div>
  );
}
