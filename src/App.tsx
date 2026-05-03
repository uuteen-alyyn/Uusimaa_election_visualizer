/**
 * Phase 3 (2/4) demo — full dashboard shell.
 *
 * Renders the four built-in workflows (winner / support / votes /
 * change) against real Tilastokeskus data. Per-mode parameter row
 * exposes the election picker, the reference-election picker (for
 * change mode), and the party picker (for modes that need one).
 *
 * URL hash carries the share state so reload + paste round-trip
 * the active view. Custom workflows and the formula composer come
 * in Phase 3 (4/4).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Crumb } from "./components/Crumb";
import { ElectionPicker } from "./components/ElectionPicker";
import { HierarchyMap, type DisplayLevel } from "./components/HierarchyMap";
import { PartyPicker } from "./components/PartyPicker";
import { WorkflowBar } from "./components/WorkflowBar";

import { ELECTION_BY_ID, ELECTIONS } from "./data/catalog";
import { LocalFixtureSource } from "./data/elections-source";
import { loadGeometry, type ProjectedGeometry } from "./data/geometry";

import { fillForRegion } from "./lib/color-ramps";
import {
  readShareStateFromHash,
  writeShareStateToHash,
  type ShareableState,
} from "./lib/share-state";
import {
  BUILTIN_WORKFLOWS,
  DEFAULT_ELECTION,
  DEFAULT_PARTY,
  DEFAULT_REF_ELECTION,
  WF_KIND_BY_ID,
} from "./lib/workflow";

import type {
  ElectionId,
  PartyId,
  RegionResult,
  Workflow,
  WorkflowKind,
} from "./types/elections";

/* ─── Per-election fixture loader ──────────────────────────── */

interface FixtureState {
  /** `null` while loading, an empty Map for elections with
   *  status:"no_data". */
  map: Map<string, RegionResult> | null;
  loading: boolean;
}

function useFixture(
  source: LocalFixtureSource,
  electionId: ElectionId | null,
): FixtureState {
  const [map, setMap] = useState<Map<string, RegionResult> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!electionId) {
      setMap(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [vp, kunta] = await Promise.all([
        source.listAreas("vp", null, electionId),
        source.listAreas("kunta", null, electionId),
      ]);
      if (cancelled) return;
      const m = new Map<string, RegionResult>();
      for (const r of [...vp, ...kunta]) m.set(r.regionId, r);
      setMap(m);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [source, electionId]);

  return { map, loading };
}

/** Probes which catalog elections actually have data, so the
 *  ElectionPicker can disable the rest. Loads fixtures lazily on
 *  first probe — `LocalFixtureSource` caches per id, so this is
 *  ~free after the first pass. */
function useElectionsWithData(source: LocalFixtureSource): ReadonlySet<ElectionId> {
  const [ids, setIds] = useState<ReadonlySet<ElectionId>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out = new Set<ElectionId>();
      await Promise.all(
        ELECTIONS.map(async (e) => {
          const areas = await source.listAreas("vp", null, e.id);
          if (areas.length > 0) out.add(e.id);
        }),
      );
      if (!cancelled) setIds(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);
  return ids;
}

/* ─── App ──────────────────────────────────────────────────── */

export function App(): JSX.Element {
  const source = useMemo(() => new LocalFixtureSource(), []);
  const [geometry, setGeometry] = useState<ProjectedGeometry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const electionsWithData = useElectionsWithData(source);

  // Initial state from URL hash (one-shot read on mount).
  const initial = useMemo(() => readShareStateFromHash(window.location.hash), []);

  // Workflow state.
  const [mode, setMode] = useState<WorkflowKind>(initial?.mode ?? "winner");
  const [election, setElection] = useState<ElectionId>(
    initial?.election ?? DEFAULT_ELECTION,
  );
  const [refElection, setRefElection] = useState<ElectionId>(
    initial?.refElection ?? DEFAULT_REF_ELECTION,
  );
  const [focusParty, setFocusParty] = useState<PartyId | null>(
    initial?.focusParty ?? DEFAULT_PARTY,
  );

  // Map navigation.
  const [level, setLevel] = useState<DisplayLevel>("vp");
  const [parentSlug, setParentSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Geometry (one-time).
  useEffect(() => {
    void loadGeometry()
      .then(setGeometry)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  // Current + reference fixtures. Reference only loads in change mode.
  const { map: currentResults, loading: currentLoading } = useFixture(source, election);
  const { map: refResults, loading: refLoading } = useFixture(
    source,
    mode === "change" ? refElection : null,
  );

  // URL hash sync — debounced via React's batched updates.
  useEffect(() => {
    const state: ShareableState = { mode, election, refElection, focusParty };
    const hash = writeShareStateToHash(state);
    if (hash && window.location.hash !== hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search + hash,
      );
    }
  }, [mode, election, refElection, focusParty]);

  // Active workflow shape — used by WorkflowBar to decide which
  // pill is highlighted. Derived from state so it always reflects
  // the live values, including param-row tweaks.
  const activeWorkflow = useMemo<Workflow>(
    () => ({
      id: "__active",
      label: "active",
      kind: mode,
      election,
      refElection: mode === "change" ? refElection : undefined,
      party: WF_KIND_BY_ID[mode].needsParty
        ? (focusParty ?? DEFAULT_PARTY)
        : undefined,
    }),
    [mode, election, refElection, focusParty],
  );

  // Apply a workflow (built-in or custom).
  const applyWorkflow = useCallback((w: Workflow) => {
    setMode(w.kind);
    setElection(w.election);
    if (w.refElection) setRefElection(w.refElection);
    if (WF_KIND_BY_ID[w.kind].needsParty) {
      setFocusParty(w.party ?? DEFAULT_PARTY);
    } else {
      setFocusParty(null);
    }
  }, []);

  // Map fill function.
  const getFill = useCallback(
    (regionId: string): string => {
      const result = currentResults?.get(regionId) ?? null;
      const refResult = refResults?.get(regionId) ?? null;
      return fillForRegion(result, mode, { focusParty, refResult });
    },
    [currentResults, refResults, mode, focusParty],
  );

  // Drill handlers.
  const onPick = useCallback((id: string) => setSelected(id), []);
  const onZoomIn = useCallback(
    (id: string) => {
      if (level !== "vp" || !geometry) return;
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

  const parentVp =
    level === "kunta" && parentSlug && geometry
      ? geometry.vaalipiirit.find((v) => v.slug === parentSlug)
      : null;

  /* ─── Render ─────────────────────────────────────────────── */

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

  const dataLoading = !geometry || !currentResults || (mode === "change" && (currentLoading || refLoading || !refResults));

  const electionLabel =
    ELECTION_BY_ID[election]?.shortLabel ?? election;
  const refLabel =
    ELECTION_BY_ID[refElection]?.shortLabel ?? refElection;

  return (
    <div className="page">
      <header>
        <h1>Vaalit — tulosvisualisointi</h1>
        <Crumb
          home="Koko Suomi"
          current={parentVp?.label ?? null}
          onHome={drillUp}
        />
      </header>

      <section
        className="workflow-section"
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <WorkflowBar
          workflows={BUILTIN_WORKFLOWS}
          activeWorkflow={activeWorkflow}
          onApply={applyWorkflow}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            minHeight: 32,
            fontSize: 13,
          }}
        >
          {mode === "change" ? (
            <>
              <ParamLabel>Vertaa</ParamLabel>
              <ElectionPicker
                value={refElection}
                onChange={setRefElection}
                exclude={new Set([election])}
                hasData={electionsWithData}
                ariaLabel="Vertailuvuosi"
              />
              <span style={{ opacity: 0.5, fontSize: 16 }}>→</span>
              <ParamLabel>nykyiseen</ParamLabel>
              <ElectionPicker
                value={election}
                onChange={setElection}
                exclude={new Set([refElection])}
                hasData={electionsWithData}
                ariaLabel="Nykyinen vaali"
              />
            </>
          ) : (
            <>
              <ParamLabel>Vaali</ParamLabel>
              <ElectionPicker
                value={election}
                onChange={setElection}
                hasData={electionsWithData}
                ariaLabel="Vaali"
              />
            </>
          )}
          {WF_KIND_BY_ID[mode].needsParty ? (
            <>
              <span style={{ width: 1, height: 22, background: "var(--hair)", margin: "0 4px" }} />
              <ParamLabel>{mode === "change" ? "Tarkasteltava puolue" : "Puolue"}</ParamLabel>
              <PartyPicker
                value={focusParty}
                onChange={(p) => setFocusParty(p)}
              />
            </>
          ) : null}
        </div>
      </section>

      <main style={{ display: "flex", justifyContent: "center", minHeight: 600 }}>
        {dataLoading ? (
          <p style={{ opacity: 0.6 }}>Loading {electionLabel}…</p>
        ) : (
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
        )}
      </main>

      <footer>
        <small>
          {mode === "change" ? (
            <>
              {refLabel} → {electionLabel}.{" "}
            </>
          ) : (
            <>{electionLabel}. </>
          )}
          Lähde: Tilastokeskus, vaalitilastot (CC BY 4.0) ·
          Tilastointialueet © Tilastokeskus, CC BY 4.0
        </small>
      </footer>
    </div>
  );
}

/** Small uppercase label shown next to dropdowns in the param row. */
function ParamLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span
      style={{
        fontSize: 10,
        opacity: 0.55,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}
