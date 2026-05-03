/**
 * Phase 3 (4/4) — full dashboard with custom formula workflows.
 *
 * Closes Phase 3. The dashboard now supports the entire workflow
 * model from the prototype:
 *
 *   - 4 built-in workflows (winner / support / votes / change)
 *   - Custom formula workflows: composer, save, edit, remove,
 *     localStorage persistence
 *   - Selector binding (`$A` / `$B` / `$C`) with a param-row picker
 *   - Three formula framings (absolute / share / vsSelected)
 *   - URL hash share state including formula tokens + bindings
 *   - Ledger formula-value block when a formula is active
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Crumb } from "./components/Crumb";
import { DownloadMenu } from "./components/DownloadMenu";
import { ElectionPicker } from "./components/ElectionPicker";
import { HierarchyMap, type DisplayLevel } from "./components/HierarchyMap";
import { Ledger, type LedgerLevelLabel } from "./components/Ledger";
import { PartyPicker } from "./components/PartyPicker";
import { ShareLinkPill } from "./components/ShareLinkPill";
import { WorkflowBar } from "./components/WorkflowBar";
import { WorkflowBuilder } from "./components/WorkflowBuilder";

import {
  ELECTION_BY_ID,
  ELECTIONS,
  PARTIES,
  PARTY_BY_ID,
  ELECTION_TYPES,
} from "./data/catalog";
import { LocalFixtureSource } from "./data/elections-source";
import { loadGeometry, type ProjectedGeometry } from "./data/geometry";

import { aggregateRegions } from "./lib/aggregate";
import { fillForRegion } from "./lib/color-ramps";
import {
  downloadDashboardPng,
  downloadMapPng,
  downloadMapSvg,
} from "./lib/exports";
import {
  evalFormula,
  formulaRange as computeFormulaRange,
  formulaSummary,
  listSelectors,
  resolveFormulaTokens,
  type ResultLookup,
} from "./lib/formula";
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
  loadCustomWorkflows,
  saveCustomWorkflows,
  WF_KIND_BY_ID,
} from "./lib/workflow";

import type {
  Binding,
  ElectionId,
  ElectionTypeId,
  FormulaFraming,
  FormulaToken,
  PartyId,
  RegionResult,
  Workflow,
  WorkflowKind,
} from "./types/elections";

/* ─── Per-election fixture loader ──────────────────────────── */

interface FixtureState {
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

/* ─── Multi-election cache for formula evaluator ────────────── */

/** Loads any (election) fixtures referenced by the formula tokens
 *  that aren't already covered by the current/ref fixtures. Builds
 *  a `ResultLookup(regionId, electionId)` covering all of them. */
function useFormulaResults(
  source: LocalFixtureSource,
  tokens: FormulaToken[],
): ResultLookup {
  const electionIds = useMemo(() => {
    const set = new Set<ElectionId>();
    for (const t of tokens) {
      if (t.kind !== "chip") continue;
      const f = t.fields;
      if (!f.type || !f.year) continue;
      if (f.type === "pres") {
        set.add(`pres${f.year}r${f.round ?? 1}`);
      } else {
        set.add(`${f.type}${f.year}` as ElectionId);
      }
    }
    return [...set];
  }, [tokens]);

  const [byElection, setByElection] = useState<
    Map<ElectionId, Map<string, RegionResult>>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    if (electionIds.length === 0) {
      setByElection(new Map());
      return;
    }
    void (async () => {
      const result = new Map<ElectionId, Map<string, RegionResult>>();
      await Promise.all(
        electionIds.map(async (eid) => {
          const [vp, kunta] = await Promise.all([
            source.listAreas("vp", null, eid),
            source.listAreas("kunta", null, eid),
          ]);
          const m = new Map<string, RegionResult>();
          for (const r of [...vp, ...kunta]) m.set(r.regionId, r);
          result.set(eid, m);
        }),
      );
      if (!cancelled) setByElection(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [source, electionIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return useCallback<ResultLookup>(
    (regionId, electionId) => byElection.get(electionId)?.get(regionId) ?? null,
    [byElection],
  );
}

/* ─── Auto-default selector bindings ────────────────────────── */

/** Fill in sensible defaults for any selector without an existing
 *  binding. Type defaults to ek, year to ek2023, who to kok — same
 *  pattern as the prototype's autoDefaultBindings. */
function autoDefaultBindings(
  tokens: FormulaToken[],
  existing: Record<string, Binding>,
): Record<string, Binding> {
  const out: Record<string, Binding> = { ...existing };
  for (const sel of listSelectors(tokens)) {
    const cur = out[sel.name] ?? {};
    if (sel.slot === "type" && !cur.type) {
      out[sel.name] = { ...cur, type: "ek" };
    } else if (sel.slot === "year" && !cur.year) {
      const def = ELECTION_BY_ID[DEFAULT_ELECTION];
      out[sel.name] = {
        ...cur,
        year: def?.year ?? 2023,
        ...(def?.round ? { round: def.round } : {}),
      };
    } else if (sel.slot === "who" && !cur.who) {
      out[sel.name] = { ...cur, who: { party: DEFAULT_PARTY } };
    }
  }
  return out;
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
  const [formulaTokens, setFormulaTokens] = useState<FormulaToken[]>(
    initial?.formulaTokens ?? [],
  );
  const [formulaBindings, setFormulaBindings] = useState<Record<string, Binding>>(
    initial?.formulaBindings ?? {},
  );
  const [framing, setFraming] = useState<FormulaFraming>("absolute");

  // Custom workflows (loaded from localStorage on mount).
  const [customWorkflows, setCustomWorkflows] = useState<Workflow[]>(() =>
    loadCustomWorkflows(),
  );
  const [appliedWorkflowId, setAppliedWorkflowId] = useState<string | null>(null);
  const [appliedSelectorLabels, setAppliedSelectorLabels] = useState<
    Record<string, string>
  >({});

  // Builder modal.
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  // Map navigation.
  const [level, setLevel] = useState<DisplayLevel>("vp");
  const [parentSlug, setParentSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Refs for export targets.
  const mapAreaRef = useRef<HTMLDivElement | null>(null);
  const dashboardRef = useRef<HTMLDivElement | null>(null);

  // Toast for share-link feedback.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Geometry (one-time).
  useEffect(() => {
    void loadGeometry()
      .then(setGeometry)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  // Current + reference fixtures (built-in modes use these directly).
  const { map: currentResults, loading: currentLoading } = useFixture(source, election);
  const { map: refResults, loading: refLoading } = useFixture(
    source,
    mode === "change" ? refElection : null,
  );

  // Resolved formula (selectors → bound values) and the per-region
  // lookup that covers every election the formula references.
  const resolvedFormula = useMemo(
    () => resolveFormulaTokens(formulaTokens, formulaBindings),
    [formulaTokens, formulaBindings],
  );
  const formulaLookup = useFormulaResults(source, resolvedFormula);

  // URL hash sync.
  useEffect(() => {
    const state: ShareableState = {
      mode,
      election,
      refElection,
      focusParty,
      ...(mode === "formula"
        ? { formulaTokens, formulaBindings }
        : {}),
    };
    const hash = writeShareStateToHash(state);
    if (hash && window.location.hash !== hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search + hash,
      );
    }
  }, [mode, election, refElection, focusParty, formulaTokens, formulaBindings]);

  // Persist custom workflows whenever they change.
  useEffect(() => {
    saveCustomWorkflows(customWorkflows);
  }, [customWorkflows]);

  /* ─── Active workflow (for pill highlighting) ───────────── */

  const activeWorkflow = useMemo<Workflow>(() => {
    if (mode === "formula") {
      return {
        id: appliedWorkflowId ?? "__active",
        label: "active",
        kind: "formula",
        election,
        formula: formulaTokens,
      };
    }
    return {
      id: "__active",
      label: "active",
      kind: mode,
      election,
      refElection: mode === "change" ? refElection : undefined,
      party: WF_KIND_BY_ID[mode].needsParty
        ? (focusParty ?? DEFAULT_PARTY)
        : undefined,
    };
  }, [mode, election, refElection, focusParty, formulaTokens, appliedWorkflowId]);

  /* ─── Apply / save / update / delete workflow ───────────── */

  const applyWorkflow = useCallback((w: Workflow): void => {
    setMode(w.kind);
    setElection(w.election);
    if (w.refElection) setRefElection(w.refElection);
    if (WF_KIND_BY_ID[w.kind].needsParty) {
      setFocusParty(w.party ?? DEFAULT_PARTY);
    } else {
      setFocusParty(null);
    }
    if (w.kind === "formula") {
      const tokens = w.formula ?? [];
      setFormulaTokens(tokens);
      setFormulaBindings((prev) =>
        autoDefaultBindings(tokens, w.defaultBindings ?? prev),
      );
      setAppliedSelectorLabels(w.selectorLabels ?? {});
    } else {
      setAppliedSelectorLabels({});
    }
    setAppliedWorkflowId(w.builtin ? null : w.id);
  }, []);

  const saveWorkflow = useCallback((wf: Workflow): void => {
    setCustomWorkflows((prev) => [...prev, wf]);
    applyWorkflow(wf);
  }, [applyWorkflow]);

  const updateWorkflow = useCallback((wf: Workflow): void => {
    setCustomWorkflows((prev) => prev.map((w) => (w.id === wf.id ? wf : w)));
    applyWorkflow(wf);
  }, [applyWorkflow]);

  const deleteWorkflow = useCallback((id: string): void => {
    setCustomWorkflows((prev) => prev.filter((w) => w.id !== id));
    if (appliedWorkflowId === id) setAppliedWorkflowId(null);
  }, [appliedWorkflowId]);

  /* ─── Formula range across visible regions ─────────────── */

  // Region IDs we color in the current map view (vp at country
  // level, kuntat-of-vp when drilled in).
  const visibleRegionIds = useMemo<string[]>(() => {
    if (!geometry) return [];
    if (level === "vp") return geometry.vaalipiirit.map((v) => v.id);
    if (parentSlug) return (geometry.kunnat[parentSlug] ?? []).map((k) => k.id);
    return [];
  }, [geometry, level, parentSlug]);

  const formulaRange = useMemo(() => {
    if (mode !== "formula" || resolvedFormula.length === 0) return null;
    return computeFormulaRange(
      resolvedFormula,
      visibleRegionIds,
      formulaLookup,
      framing,
      framing === "vsSelected" ? selected : null,
    );
  }, [mode, resolvedFormula, visibleRegionIds, formulaLookup, framing, selected]);

  /* ─── Adaptive support / change ranges across visible regions ── */

  /** Range of focus-party shares across visible regions — drives the
   *  `support` ramp's adaptive bucketing so small parties (Vihr, Vas,
   *  Rkp, KD) read as real variation across the map instead of
   *  collapsing into the lightest 1–2 fixed buckets. */
  const supportRange = useMemo(() => {
    if (mode !== "support" || !focusParty || !currentResults) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const id of visibleRegionIds) {
      const v = currentResults.get(id)?.shares[focusParty];
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
    return { min, max };
  }, [mode, focusParty, currentResults, visibleRegionIds]);

  /** Range of percentage-point swings across visible regions — same
   *  rationale as `supportRange` but for the diverging change ramp. */
  const changeRange = useMemo(() => {
    if (mode !== "change" || !focusParty || !currentResults || !refResults) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const id of visibleRegionIds) {
      const a = currentResults.get(id)?.shares[focusParty];
      const b = refResults.get(id)?.shares[focusParty];
      if (a == null || b == null) continue;
      const d = a - b;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
    return { min, max };
  }, [mode, focusParty, currentResults, refResults, visibleRegionIds]);

  // Per-region formula values (memoised, so getFill is O(1) per call).
  const formulaValueByRegion = useMemo(() => {
    if (mode !== "formula" || resolvedFormula.length === 0) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const id of visibleRegionIds) {
      const r = evalFormula(resolvedFormula, id, formulaLookup);
      if (r.ok) m.set(id, r.value);
    }
    if (framing === "share") {
      const sum = [...m.values()].reduce((s, v) => s + v, 0);
      if (sum !== 0) for (const [k, v] of m) m.set(k, (v / sum) * 100);
      else for (const [k] of m) m.set(k, 0);
    } else if (framing === "vsSelected" && selected) {
      const base = m.get(selected);
      if (base != null && base !== 0) {
        for (const [k, v] of m) m.set(k, ((v - base) / Math.abs(base)) * 100);
      }
    }
    return m;
  }, [mode, resolvedFormula, visibleRegionIds, formulaLookup, framing, selected]);

  /* ─── Map fill ──────────────────────────────────────────── */

  const getFill = useCallback(
    (regionId: string): string => {
      const result = currentResults?.get(regionId) ?? null;
      const refResult = refResults?.get(regionId) ?? null;
      const formulaValue = formulaValueByRegion.get(regionId) ?? null;
      return fillForRegion(result, mode, {
        focusParty,
        refResult,
        formulaValue,
        formulaRange,
        supportRange,
        changeRange,
      });
    },
    [
      currentResults,
      refResults,
      mode,
      focusParty,
      formulaValueByRegion,
      formulaRange,
      supportRange,
      changeRange,
    ],
  );

  /* ─── Drill handlers ───────────────────────────────────── */

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

  /* ─── Export handlers ───────────────────────────────────── */

  const exportSvg = useCallback(() => {
    const svg = mapAreaRef.current?.querySelector("svg");
    if (!svg) {
      setToast("Karttaa ei voitu ladata");
      return;
    }
    try {
      downloadMapSvg(svg);
      setToast("Kartta ladattu (SVG)");
    } catch {
      setToast("Lataus epäonnistui");
    }
  }, []);

  const exportPng = useCallback(() => {
    const svg = mapAreaRef.current?.querySelector("svg");
    if (!svg) {
      setToast("Karttaa ei voitu ladata");
      return;
    }
    void downloadMapPng(svg).then(
      () => setToast("Kartta ladattu (PNG)"),
      () => setToast("Lataus epäonnistui"),
    );
  }, []);

  const exportDashboard = useCallback(() => {
    const node = dashboardRef.current;
    if (!node) {
      setToast("Näkymää ei voitu ladata");
      return;
    }
    void downloadDashboardPng(node).then(
      () => setToast("Näkymä ladattu (PNG)"),
      () => setToast("Lataus epäonnistui"),
    );
  }, []);

  const parentVp =
    level === "kunta" && parentSlug && geometry
      ? geometry.vaalipiirit.find((v) => v.slug === parentSlug)
      : null;

  /* ─── Ledger inputs ─────────────────────────────────────── */

  const ledger = useMemo<{
    result: RegionResult | null;
    label: string;
    levelLabel: LedgerLevelLabel;
    formulaValue?: number | null;
    formulaSummaryText?: string;
  }>(() => {
    const formulaInfo =
      mode === "formula" && resolvedFormula.length > 0
        ? {
            formulaValue:
              formulaValueByRegion.get(
                selected ?? (parentVp ? parentVp.id : "__suomi"),
              ) ?? null,
            formulaSummaryText: formulaSummary(resolvedFormula),
          }
        : {};
    if (!currentResults) {
      return { result: null, label: "Koko Suomi", levelLabel: "Koko maa", ...formulaInfo };
    }
    if (selected) {
      const result = currentResults.get(selected) ?? null;
      if (level === "vp" && geometry) {
        const vp = geometry.vaalipiirit.find((v) => v.id === selected);
        return { result, label: vp?.label ?? selected, levelLabel: "Vaalipiiri", ...formulaInfo };
      }
      if (level === "kunta" && geometry && parentSlug) {
        const k = geometry.kunnat[parentSlug]?.find((x) => x.id === selected);
        return { result, label: k?.label ?? selected, levelLabel: "Kunta", ...formulaInfo };
      }
      return { result, label: selected, levelLabel: "Vaalipiiri", ...formulaInfo };
    }
    if (level === "kunta" && parentVp) {
      const result = currentResults.get(parentVp.id) ?? null;
      return { result, label: parentVp.label, levelLabel: "Vaalipiiri", ...formulaInfo };
    }
    const vpRows = Array.from(currentResults.values()).filter((r) =>
      /^\d{2}$/.test(r.regionId),
    );
    const aggregated = aggregateRegions(vpRows, {
      regionId: "__suomi",
      electionId: election,
    });
    return {
      result: aggregated,
      label: "Koko Suomi",
      levelLabel: "Koko maa",
      ...formulaInfo,
    };
  }, [
    currentResults,
    selected,
    level,
    parentSlug,
    parentVp,
    geometry,
    election,
    mode,
    resolvedFormula,
    formulaValueByRegion,
  ]);

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

  const electionLabel = ELECTION_BY_ID[election]?.shortLabel ?? election;
  const refLabel = ELECTION_BY_ID[refElection]?.shortLabel ?? refElection;
  const activeSelectors = listSelectors(formulaTokens);

  return (
    <div className="page" ref={dashboardRef}>
      <a href="#map-area" className="skip-link">
        Siirry karttaan
      </a>
      <header>
        <h1>Vaalit — tulosvisualisointi</h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Crumb home="Koko Suomi" current={parentVp?.label ?? null} onHome={drillUp} />
          </div>
          <ShareLinkPill onToast={setToast} />
          <DownloadMenu
            onMapSvg={exportSvg}
            onMapPng={exportPng}
            onDashboardPng={exportDashboard}
            disabled={dataLoading}
          />
        </div>
      </header>

      <section
        aria-label="Tarkastelutyyli ja parametrit"
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <WorkflowBar
          builtins={BUILTIN_WORKFLOWS}
          customs={customWorkflows}
          activeWorkflow={activeWorkflow}
          onApply={applyWorkflow}
          onOpenBuilder={() => {
            setEditingWorkflow(null);
            setBuilderOpen(true);
          }}
          onEdit={(w) => {
            setEditingWorkflow(w);
            setBuilderOpen(true);
          }}
          onDelete={deleteWorkflow}
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
          {mode === "formula" && activeSelectors.length > 0 ? (
            <SelectorBindingRow
              selectors={activeSelectors}
              bindings={formulaBindings}
              setBindings={setFormulaBindings}
              labels={appliedSelectorLabels}
              electionsWithData={electionsWithData}
            />
          ) : null}

          {mode === "formula" ? (
            <>
              {activeSelectors.length > 0 ? (
                <span
                  style={{ width: 1, height: 22, background: "var(--hair)", margin: "0 4px" }}
                />
              ) : null}
              <ParamLabel>Skaalaus</ParamLabel>
              <FramingTabs value={framing} onChange={setFraming} canVsSelected={Boolean(selected)} />
            </>
          ) : mode === "change" ? (
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
              <span style={{ width: 1, height: 22, background: "var(--hair)", margin: "0 4px" }} />
              <ParamLabel>Tarkasteltava puolue</ParamLabel>
              <PartyPicker value={focusParty} onChange={setFocusParty} />
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
              {WF_KIND_BY_ID[mode].needsParty ? (
                <>
                  <span
                    style={{ width: 1, height: 22, background: "var(--hair)", margin: "0 4px" }}
                  />
                  <ParamLabel>Puolue</ParamLabel>
                  <PartyPicker value={focusParty} onChange={setFocusParty} />
                </>
              ) : null}
            </>
          )}
        </div>
      </section>

      <main className="dashboard" id="map-area">
        <div
          className="dashboard-map"
          ref={mapAreaRef}
          aria-label={`Vaalituloskartta — ${electionLabel}`}
        >
          {dataLoading || !geometry ? (
            <LoadingStamp electionLabel={electionLabel} />
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
        </div>
        <div className="dashboard-ledger">
          <Ledger
            result={ledger.result}
            label={ledger.label}
            levelLabel={ledger.levelLabel}
            loading={dataLoading}
            formulaValue={ledger.formulaValue ?? null}
            formulaSummaryText={ledger.formulaSummaryText ?? null}
            framing={mode === "formula" ? framing : null}
          />
        </div>
      </main>

      {builderOpen ? (
        <WorkflowBuilder
          initial={editingWorkflow ?? undefined}
          onSave={saveWorkflow}
          onUpdate={updateWorkflow}
          onClose={() => {
            setBuilderOpen(false);
            setEditingWorkflow(null);
          }}
        />
      ) : null}

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

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 30,
            transform: "translateX(-50%)",
            background: "var(--ink)",
            color: "var(--paper)",
            padding: "10px 16px",
            borderRadius: "var(--radius-box)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            zIndex: 1000,
            boxShadow: "var(--shadow-default)",
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Param-row helpers ──────────────────────────────────── */

function LoadingStamp({ electionLabel }: { electionLabel: string }): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        height: 640,
        width: 520,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          border: "2px dashed rgba(0,0,0,0.35)",
          padding: "16px 28px",
          borderRadius: "var(--radius-card)",
          fontFamily: "var(--font-display)",
          fontSize: 24,
          color: "rgba(0,0,0,0.55)",
          transform: "rotate(-2deg)",
          background: "rgba(251,249,244,0.7)",
        }}
      >
        Ladataan {electionLabel}…
      </div>
    </div>
  );
}

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

function FramingTabs({
  value,
  onChange,
  canVsSelected,
}: {
  value: FormulaFraming;
  onChange: (f: FormulaFraming) => void;
  canVsSelected: boolean;
}): JSX.Element {
  const opts: Array<{ id: FormulaFraming; label: string; needsSel?: boolean }> = [
    { id: "absolute", label: "Absoluuttinen" },
    { id: "share", label: "% kokonaisuudesta" },
    { id: "vsSelected", label: "vs valittu", needsSel: true },
  ];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {opts.map((opt) => {
        const disabled = (opt.needsSel ?? false) && !canVsSelected;
        return (
          <span
            key={opt.id}
            className={"pill " + (value === opt.id ? "on" : "")}
            onClick={() => !disabled && onChange(opt.id)}
            role="button"
            tabIndex={0}
            title={disabled ? "Valitse alue ensin" : ""}
            style={{
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 12,
              opacity: disabled ? 0.4 : 1,
            }}
          >
            {opt.label}
          </span>
        );
      })}
    </div>
  );
}

function SelectorBindingRow({
  selectors,
  bindings,
  setBindings,
  labels,
  electionsWithData,
}: {
  selectors: Array<{ name: string; slot: "type" | "year" | "who" }>;
  bindings: Record<string, Binding>;
  setBindings: React.Dispatch<React.SetStateAction<Record<string, Binding>>>;
  labels: Record<string, string>;
  electionsWithData: ReadonlySet<ElectionId>;
}): JSX.Element {
  const bind = (name: string, patch: Partial<Binding>): void => {
    setBindings((prev) => ({ ...prev, [name]: { ...(prev[name] ?? {}), ...patch } }));
  };
  const selectStyle: React.CSSProperties = {
    border: "none",
    borderBottom: "var(--border-default) dotted var(--ink)",
    background: "transparent",
    padding: "2px 4px",
    borderRadius: 0,
    fontFamily: "inherit",
    fontSize: 12,
    cursor: "pointer",
    color: "var(--ink)",
    appearance: "none",
  };
  return (
    <>
      <ParamLabel>Valitsimet</ParamLabel>
      {selectors.map((s) => {
        const b = bindings[s.name] ?? {};
        const friendly = (labels[s.name] ?? "").trim();
        return (
          <span
            key={s.name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 8px 2px 4px",
              border: "var(--border-default) dashed var(--ink)",
              borderRadius: "var(--radius-pill)",
              background: "#f4e6c3",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              ${s.name}
            </span>
            {friendly ? (
              <span style={{ fontSize: 11, opacity: 0.75, fontStyle: "italic" }}>
                {friendly}
              </span>
            ) : null}
            {s.slot === "type" ? (
              <select
                value={b.type ?? ""}
                onChange={(e) => bind(s.name, { type: e.target.value as ElectionTypeId })}
                style={selectStyle}
                aria-label={`Tyyppi $${s.name}`}
              >
                <option value="">— valitse tyyppi —</option>
                {ELECTION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            ) : null}
            {s.slot === "year" ? (
              <select
                value={b.year ? `${b.year}_${b.round ?? 1}` : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    bind(s.name, { year: undefined, round: undefined });
                    return;
                  }
                  const [yr, rd] = v.split("_").map(Number);
                  bind(s.name, { year: yr, ...(rd ? { round: rd as 1 | 2 } : {}) });
                }}
                style={selectStyle}
                aria-label={`Vuosi $${s.name}`}
              >
                <option value="">— valitse vuosi —</option>
                {ELECTIONS.map((e) => (
                  <option
                    key={e.id}
                    value={`${e.year}_${e.round ?? 1}`}
                    disabled={!electionsWithData.has(e.id)}
                  >
                    {e.shortLabel}
                    {electionsWithData.has(e.id) ? "" : " (ei tietoja)"}
                  </option>
                ))}
              </select>
            ) : null}
            {s.slot === "who" ? (
              <select
                value={
                  b.who && "party" in b.who ? b.who.party : ""
                }
                onChange={(e) =>
                  bind(s.name, {
                    who: e.target.value
                      ? { party: e.target.value as PartyId }
                      : undefined,
                  })
                }
                style={selectStyle}
                aria-label={`Puolue $${s.name}`}
              >
                <option value="">— valitse puolue —</option>
                {PARTIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {PARTY_BY_ID[p.id]?.name ?? p.id}
                  </option>
                ))}
              </select>
            ) : null}
          </span>
        );
      })}
    </>
  );
}
