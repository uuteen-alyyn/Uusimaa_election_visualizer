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
import { DynamicLegend } from "./components/DynamicLegend";
import { ElectionPicker } from "./components/ElectionPicker";
import { HierarchyMap, type DisplayLevel } from "./components/HierarchyMap";
import { Ledger, type LedgerLevelLabel } from "./components/Ledger";
import { PartyPicker } from "./components/PartyPicker";
import { ShareLinkPill } from "./components/ShareLinkPill";
import { MittariDropdown } from "./components/MittariDropdown";
import { WorkflowBuilder } from "./components/WorkflowBuilder";

import {
  ELECTION_BY_ID,
  ELECTIONS,
  PARTIES,
  PARTY_BY_ID,
  ELECTION_TYPES,
} from "./data/catalog";
import { pickWinner, pointChange, votesValue } from "./lib/color-ramps";
import {
  LocalFixtureSource,
  type KuntaHvaMap,
} from "./data/elections-source";
import { loadGeometry, type ProjectedGeometry } from "./data/geometry";

import { aggregateRegions } from "./lib/aggregate";
import { fillForRegion, NODATA_FILL } from "./lib/color-ramps";
import { makeAanestysalueet, makeHvaFeatures } from "./data/geometry";
import {
  downloadDashboardPng,
  downloadMapPng,
  downloadMapSvg,
} from "./lib/exports";

const NUM_FI = new Intl.NumberFormat("fi-FI");
import {
  chipValue as chipValueDirect,
  evalFormula,
  findLastChip,
  metricForFraming,
  formulaRange as computeFormulaRange,
  formulaSummary,
  listSelectors,
  resolveFormulaTokens,
  resolveWhoSelectorElection,
  resolveYearSelectorType,
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
  Candidate,
  ChipWho,
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

/** Returns `null` while probing (so the picker doesn't briefly
 *  flash all-disabled). Populated once every fixture has been
 *  inspected. */
function useElectionsWithData(source: LocalFixtureSource): ReadonlySet<ElectionId> | null {
  const [ids, setIds] = useState<ReadonlySet<ElectionId> | null>(null);
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

/** Pick the most recent same-type election (with data) that comes
 *  *before* the given election. Used to auto-default the change
 *  mode's reference election when the user toggles into it. */
function findPreviousElectionOfSameType(
  currentId: ElectionId,
  withData: ReadonlySet<ElectionId> | null,
): ElectionId | null {
  const cur = ELECTION_BY_ID[currentId];
  if (!cur) return null;
  const candidates = ELECTIONS.filter((e) => {
    if (e.id === cur.id) return false;
    if (e.typeId !== cur.typeId) return false;
    if (withData && !withData.has(e.id)) return false;
    if (e.year < cur.year) return true;
    if (e.year === cur.year) {
      // Same year — only relevant for presidential rounds (round 1
      // is "previous" to round 2).
      return (e.round ?? 1) < (cur.round ?? 1);
    }
    return false;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return (b.round ?? 1) - (a.round ?? 1);
  });
  return candidates[0]?.id ?? null;
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

  // Country-level top candidates per election. The vp/kunta rows from
  // the fixture only carry candidates per their own slice; the
  // ledger's country branch builds an aggregate result from vp rows
  // (which doesn't include kuntavaalit candidates, since those live
  // on kunta rows). Fetching the merged list once per election lets
  // the candidate scroll appear at "Koko Suomi" too.
  const [countryCandidates, setCountryCandidates] = useState<
    Record<ElectionId, ReadonlyArray<Candidate>>
  >({} as Record<ElectionId, ReadonlyArray<Candidate>>);

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
  /** When level === "kunta" or "aa" or "hva": the parent vp's slug.
   *  Used to build the breadcrumb and drill back up. */
  const [parentSlug, setParentSlug] = useState<string | null>(null);
  /** When level === "aa": the kunta's 3-digit code. */
  const [parentKunta, setParentKunta] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  /** "Kunta" or "Hyvinvointialue" — toggled via the pill at the
   *  top-right of the map. When `hva`, drilling from a vp goes to
   *  HVA view (the vp's hyvinvointialueet) instead of the kunta
   *  view. The toggle is hidden when there's no meaningful HVA
   *  alternative for the current vp (Helsinki single-kunta + own
   *  HVA, Ahvenanmaa no HVA at all). */
  const [viewMode, setViewMode] = useState<"kunta" | "hva">("kunta");
  /** Custom-formula option: skip Ahvenanmaa from the visible-region
   *  range. Ahvenanmaa has no votes for mainland parties, so
   *  including it collapses most adaptive ramps into the lightest
   *  bucket. Default true; flipped when applying a saved workflow
   *  with `excludeAhvenanmaa` set, and editable via the runtime
   *  toggle in formula mode. */
  const [excludeAhvenanmaa, setExcludeAhvenanmaa] = useState<boolean>(true);
  /** kunta → HVA mapping loaded once from /data/kunta-hva.json. Null
   *  while the fetch is in-flight or if the file is missing (older
   *  deploy). */
  const [hvaMap, setHvaMap] = useState<KuntaHvaMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    void source.loadHvaMap().then((m) => {
      if (!cancelled) setHvaMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

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

  // Lazy-load country-level candidates the first time the user views
  // an election. Cached per-id under `countryCandidates`.
  useEffect(() => {
    if (countryCandidates[election]) return;
    let cancelled = false;
    void source.listCandidates(election).then((list) => {
      if (cancelled) return;
      setCountryCandidates((prev) =>
        prev[election] ? prev : { ...prev, [election]: list },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [election, source, countryCandidates]);

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
    // Votes mode treats `focusParty == null` as "Kaikki puolueet"
    // (color by total votes). Don't backfill DEFAULT_PARTY — that
    // would silently flip the user's "Kaikki" choice to KOK on
    // save / share-link round trip.
    const partyForActive: PartyId | undefined = WF_KIND_BY_ID[mode]
      .needsParty
      ? mode === "votes"
        ? (focusParty ?? undefined)
        : (focusParty ?? DEFAULT_PARTY)
      : undefined;
    return {
      id: "__active",
      label: "active",
      kind: mode,
      election,
      refElection: mode === "change" ? refElection : undefined,
      party: partyForActive,
    };
  }, [mode, election, refElection, focusParty, formulaTokens, appliedWorkflowId]);

  /* ─── Apply / save / update / delete workflow ───────────── */

  const applyWorkflow = useCallback(
    (w: Workflow): void => {
      setMode(w.kind);

      // Election persistence: when the user toggles between modes,
      // they expect to stay on whatever election they were viewing.
      // Only override the election when the current one has no data.
      const nextElection =
        electionsWithData == null
          ? election
          : electionsWithData.has(election)
            ? election
            : w.election;
      setElection(nextElection);

      // Reference election: for change mode, auto-pick the
      // previous-of-same-type so the comparison is meaningful
      // (kunta2025 → kunta2021, eu2024 → eu2019, etc.) instead
      // of always falling through to the built-in's hardcoded
      // ek2019. User can still override via the picker.
      if (w.kind === "change") {
        const autoRef = findPreviousElectionOfSameType(
          nextElection,
          electionsWithData,
        );
        if (autoRef) setRefElection(autoRef);
        else if (w.refElection) setRefElection(w.refElection);
      } else if (w.refElection) {
        const target = w.refElection;
        setRefElection((prev) => {
          if (electionsWithData == null) return prev;
          if (electionsWithData.has(prev)) return prev;
          return target;
        });
      }

      if (WF_KIND_BY_ID[w.kind].needsParty) {
        // Votes: a workflow without a `party` means "Kaikki puolueet"
        // (color by total votes). Support / change still need a party,
        // so substitute the default for safety.
        if (w.kind === "votes") {
          setFocusParty(w.party ?? null);
        } else {
          setFocusParty(w.party ?? DEFAULT_PARTY);
        }
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
        // Honour the saved per-workflow Ahvenanmaa preference when
        // the field is present; default to "exclude" otherwise so
        // legacy saved workflows still get the safer ramp.
        setExcludeAhvenanmaa(w.excludeAhvenanmaa ?? true);
      } else {
        setAppliedSelectorLabels({});
      }
      setAppliedWorkflowId(w.builtin ? null : w.id);
    },
    [electionsWithData, election],
  );

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

  // Async load of äänestysalue rows for the currently-drilled kunta.
  // Empty when level !== "aa" or the fixture has no aa data for
  // the current election (only year-specific tables include aa).
  const [aaResults, setAaResults] = useState<RegionResult[]>([]);
  useEffect(() => {
    if (level !== "aa" || !parentKunta) {
      setAaResults([]);
      return;
    }
    let cancelled = false;
    void source.listAreas("aa", parentKunta, election).then((rows) => {
      if (!cancelled) setAaResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [source, level, parentKunta, election]);

  // Parallel load of the ref-election's äänestysalue rows for the
  // same drilled-in kunta — required for change mode at aa level.
  // Empty when level !== "aa" or the ref fixture has no aa data.
  const [refAaResults, setRefAaResults] = useState<RegionResult[]>([]);
  useEffect(() => {
    if (level !== "aa" || !parentKunta || mode !== "change") {
      setRefAaResults([]);
      return;
    }
    let cancelled = false;
    void source.listAreas("aa", parentKunta, refElection).then((rows) => {
      if (!cancelled) setRefAaResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [source, level, parentKunta, refElection, mode]);

  /** Generated square-grid äänestysalue features, sized to the
   *  kunta's actual aa count. */
  const aaFeatures = useMemo(() => {
    if (level !== "aa" || aaResults.length === 0) return null;
    return makeAanestysalueet(
      aaResults.map((r) => ({ id: r.regionId, label: r.label })),
    );
  }, [level, aaResults]);

  /** Async load of HVA aggregate rows for the parent vp. */
  const [hvaResults, setHvaResults] = useState<RegionResult[]>([]);
  useEffect(() => {
    if (level !== "hva" || !parentSlug) {
      setHvaResults([]);
      return;
    }
    let cancelled = false;
    void source.listAreas("hva", parentSlug, election).then((rows) => {
      if (!cancelled) setHvaResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [source, level, parentSlug, election]);

  /** Parallel ref-election HVA load for change mode at HVA level. */
  const [refHvaResults, setRefHvaResults] = useState<RegionResult[]>([]);
  useEffect(() => {
    if (level !== "hva" || !parentSlug || mode !== "change") {
      setRefHvaResults([]);
      return;
    }
    let cancelled = false;
    void source.listAreas("hva", parentSlug, refElection).then((rows) => {
      if (!cancelled) setRefHvaResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [source, level, parentSlug, refElection, mode]);

  /** Combined-path HVA features for the parent vp — rendered as
   *  one path per HVA filled with the per-HVA aggregated value. */
  const hvaFeatures = useMemo(() => {
    if (level !== "hva" || !parentSlug || !geometry || !hvaMap) return null;
    const kunnat = geometry.kunnat[parentSlug] ?? [];
    if (kunnat.length === 0) return null;
    return makeHvaFeatures(kunnat, hvaMap.kuntaToHva, hvaMap.hvaNames);
  }, [level, parentSlug, geometry, hvaMap]);

  // Region IDs we color in the current map view.
  const visibleRegionIds = useMemo<string[]>(() => {
    if (!geometry) return [];
    if (level === "vp") return geometry.vaalipiirit.map((v) => v.id);
    if (level === "kunta" && parentSlug) {
      return (geometry.kunnat[parentSlug] ?? []).map((k) => k.id);
    }
    if (level === "hva") return hvaResults.map((r) => r.regionId);
    if (level === "aa") return aaResults.map((r) => r.regionId);
    return [];
  }, [geometry, level, parentSlug, hvaResults, aaResults]);

  /** Region ids to feed formulaRange / formulaValueByRegion. When
   *  the user has the "Älä huomioi Ahvenanmaata" toggle on (default
   *  for custom formulas), drop the Ahvenanmaa vp at country view
   *  so the range scales to the rest of the map. At kunta / hva /
   *  aa drill-downs Ahvenanmaa is typically already off-screen, so
   *  the filter is a no-op there. */
  const formulaRegionIds = useMemo<string[]>(() => {
    if (!excludeAhvenanmaa) return visibleRegionIds;
    if (level === "vp") return visibleRegionIds.filter((id) => id !== "05");
    return visibleRegionIds;
  }, [visibleRegionIds, excludeAhvenanmaa, level]);

  const formulaRange = useMemo(() => {
    if (mode !== "formula" || resolvedFormula.length === 0) return null;
    return computeFormulaRange(
      resolvedFormula,
      formulaRegionIds,
      formulaLookup,
      framing,
      null,
    );
  }, [mode, resolvedFormula, formulaRegionIds, formulaLookup, framing]);

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

  /** aa-row lookups, used by every level-aware computation below
   *  (changeRange, votesRange, getFill, getTooltip, no-data check).
   *  Defined here so they're visible to changeRange / hasNoDataInView
   *  which run before the tooltip block. */
  const aaById = useMemo(
    () => new Map(aaResults.map((r) => [r.regionId, r])),
    [aaResults],
  );
  const refAaById = useMemo(
    () => new Map(refAaResults.map((r) => [r.regionId, r])),
    [refAaResults],
  );
  const hvaById = useMemo(
    () => new Map(hvaResults.map((r) => [r.regionId, r])),
    [hvaResults],
  );
  const refHvaById = useMemo(
    () => new Map(refHvaResults.map((r) => [r.regionId, r])),
    [refHvaResults],
  );

  /** Range of percentage-point swings across visible regions — same
   *  rationale as `supportRange` but for the diverging change ramp. */
  const changeRange = useMemo(() => {
    if (mode !== "change" || !focusParty || !currentResults || !refResults) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const id of visibleRegionIds) {
      // At aa or hva level the rows live in their own maps, not in
      // the vp+kunta currentResults / refResults maps.
      const a =
        currentResults.get(id)?.shares[focusParty] ??
        hvaById.get(id)?.shares[focusParty] ??
        aaById.get(id)?.shares[focusParty];
      const b =
        refResults.get(id)?.shares[focusParty] ??
        refHvaById.get(id)?.shares[focusParty] ??
        refAaById.get(id)?.shares[focusParty];
      if (a == null || b == null) continue;
      const d = a - b;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
    return { min, max };
  }, [mode, focusParty, currentResults, refResults, aaById, refAaById, hvaById, refHvaById, visibleRegionIds]);

  /** Range of votes across visible regions — party-specific when a
   *  focus party is set (the votes mode's party picker), total
   *  otherwise. Skips regions whose value is literally 0 for the
   *  party (Ahvenanmaa for mainland parties, etc.) — they're
   *  effectively no-data and would otherwise drag `logMin` to 0
   *  and compress every real-data region into the top 1–2 buckets. */
  const votesRange = useMemo(() => {
    if (mode !== "votes" || !currentResults) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const id of visibleRegionIds) {
      const r = currentResults.get(id);
      if (!r) continue;
      const v = votesValue(r, focusParty);
      if (focusParty && v === 0) continue; // treat as no-data
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
    return { min, max };
  }, [mode, focusParty, currentResults, visibleRegionIds]);

  // Per-region formula values (memoised, so getFill is O(1) per call).
  const formulaValueByRegion = useMemo(() => {
    if (mode !== "formula" || resolvedFormula.length === 0) return new Map<string, number>();
    const metric = metricForFraming(framing);
    const m = new Map<string, number>();

    // vsSelected = relative change of the formula vs the last chip's
    // value, per region. Doesn't need a region selection — for a
    // `kok2023 − kok2019` formula, the result reads as "% change in
    // absolute votes between the two elections" per region.
    if (framing === "vsSelected") {
      const lastChip = findLastChip(resolvedFormula);
      if (!lastChip) return m;
      for (const id of formulaRegionIds) {
        const r = evalFormula(resolvedFormula, id, formulaLookup, metric);
        if (!r.ok) continue;
        const base = chipValueDirect(lastChip.fields, id, formulaLookup, metric);
        if (base == null || base === 0) continue;
        m.set(id, (r.value / base) * 100);
      }
      return m;
    }

    for (const id of formulaRegionIds) {
      const r = evalFormula(resolvedFormula, id, formulaLookup, metric);
      if (r.ok) m.set(id, r.value);
    }
    if (framing === "share") {
      const sum = [...m.values()].reduce((s, v) => s + v, 0);
      if (sum !== 0) for (const [k, v] of m) m.set(k, (v / sum) * 100);
      else for (const [k] of m) m.set(k, 0);
    }
    return m;
  }, [mode, resolvedFormula, formulaRegionIds, formulaLookup, framing]);

  /* ─── Map fill ──────────────────────────────────────────── */

  /** Map region-id → result for whatever level we're showing.
   *  At vp/kunta level it's `currentResults`; at aa level we
   *  also merge `aaResults` since those rows aren't in the
   *  vp+kunta map. */

  const getFill = useCallback(
    (regionId: string): string => {
      // Ahvenanmaa exclusion in formula mode: render the vp as
      // crosshatch so the user sees it's intentionally outside the
      // ramp scaling, not a no-data row of the actual formula.
      if (
        mode === "formula" &&
        excludeAhvenanmaa &&
        level === "vp" &&
        regionId === "05"
      ) {
        return NODATA_FILL;
      }
      const result =
        currentResults?.get(regionId) ??
        hvaById.get(regionId) ??
        aaById.get(regionId) ??
        null;
      const refResult =
        refResults?.get(regionId) ??
        refHvaById.get(regionId) ??
        refAaById.get(regionId) ??
        null;
      const formulaValue = formulaValueByRegion.get(regionId) ?? null;
      return fillForRegion(result, mode, {
        focusParty,
        refResult,
        formulaValue,
        formulaRange,
        supportRange,
        changeRange,
        votesRange,
      });
    },
    [
      currentResults,
      aaById,
      hvaById,
      refResults,
      refAaById,
      refHvaById,
      mode,
      focusParty,
      formulaValueByRegion,
      formulaRange,
      supportRange,
      changeRange,
      votesRange,
      excludeAhvenanmaa,
      level,
    ],
  );

  /* ─── Hover tooltip text (mode-specific) ────────────────── */

  const getTooltip = useCallback(
    (regionId: string, label: string): string => {
      const result =
        currentResults?.get(regionId) ??
        hvaById.get(regionId) ??
        aaById.get(regionId);
      if (!result) return `${label} — Ei tietoja`;
      switch (mode) {
        case "winner": {
          const winner = pickWinner(result);
          if (!winner) return `${label} — Ei tuloksia`;
          const share = result.shares[winner] ?? 0;
          const partyName = PARTY_BY_ID[winner]?.name ?? winner;
          return `${label} — ${partyName} ${share.toFixed(1)}%`;
        }
        case "support": {
          if (!focusParty) return label;
          const share = result.shares[focusParty] ?? 0;
          const abbr = PARTY_BY_ID[focusParty]?.abbr ?? focusParty;
          return `${label} — ${abbr} ${share.toFixed(1)}%`;
        }
        case "votes": {
          const v = votesValue(result, focusParty);
          if (focusParty) {
            const abbr = PARTY_BY_ID[focusParty]?.abbr ?? focusParty;
            return `${label} — ${abbr} ${NUM_FI.format(v)} ääntä`;
          }
          return `${label} — ${NUM_FI.format(v)} ääntä`;
        }
        case "change": {
          const refResult =
            refResults?.get(regionId) ??
            refHvaById.get(regionId) ??
            refAaById.get(regionId);
          if (!focusParty || !refResult) return `${label} — Ei vertailutietoja`;
          const delta = pointChange(result, refResult, focusParty);
          if (delta == null) return `${label} — Ei vertailutietoja`;
          const sign = delta > 0 ? "+" : "";
          const abbr = PARTY_BY_ID[focusParty]?.abbr ?? focusParty;
          return `${label} — ${abbr} ${sign}${delta.toFixed(1)} pp`;
        }
        case "formula": {
          const v = formulaValueByRegion.get(regionId);
          if (v == null) return `${label} — kaava: ei arvoa`;
          if (framing === "absVotes") {
            return `${label} — ƒ ${NUM_FI.format(Math.round(v))} ääntä`;
          }
          const unit =
            framing === "share" || framing === "vsSelected" ? "%" : "";
          const sign = framing === "vsSelected" && v > 0 ? "+" : "";
          return `${label} — ƒ ${sign}${v.toFixed(1)}${unit}`;
        }
      }
    },
    [currentResults, aaById, hvaById, refResults, refAaById, refHvaById, mode, focusParty, formulaValueByRegion, framing],
  );

  /* ─── Legend inputs ────────────────────────────────────── */

  /** Unique winner-party set across visible regions (for the
   *  winner-mode legend). Sorted by frequency desc so the most
   *  common winner appears first. */
  const winnerPartiesInView = useMemo<PartyId[]>(() => {
    if (mode !== "winner" || !currentResults) return [];
    const counts = new Map<PartyId, number>();
    for (const id of visibleRegionIds) {
      const r = currentResults.get(id);
      if (!r) continue;
      const w = pickWinner(r);
      if (!w) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }, [mode, currentResults, visibleRegionIds]);

  /** Whether at least one visible region renders the no-data
   *  crosshatch — used to add an "Ei tietoja" entry to the legend. */
  const hasNoDataInView = useMemo<boolean>(() => {
    if (!currentResults) return false;
    if (mode === "formula") return false;
    for (const id of visibleRegionIds) {
      const r = currentResults.get(id) ?? hvaById.get(id) ?? aaById.get(id);
      if (!r) return true;
      if (
        mode === "change" &&
        (!focusParty ||
          !(
            refResults?.get(id) ??
            refHvaById.get(id) ??
            refAaById.get(id)
          ))
      )
        return true;
    }
    return false;
  }, [mode, currentResults, aaById, hvaById, refResults, refAaById, refHvaById, focusParty, visibleRegionIds]);

  /* ─── Drill handlers ───────────────────────────────────── */

  const onPick = useCallback((id: string) => setSelected(id), []);
  const onZoomIn = useCallback(
    (id: string) => {
      if (!geometry) return;
      if (level === "vp") {
        const vp = geometry.vaalipiirit.find((v) => v.id === id);
        if (!vp) return;
        // HVA view path: only valid when the vp has at least 2 HVAs
        // (Helsinki / Ahvenanmaa fall back to kunta view).
        const hvaCount = vp.slug
          ? Object.values(hvaMap?.hvaToVp ?? {}).filter((s) => s === vp.slug)
              .length
          : 0;
        if (viewMode === "hva" && hvaCount >= 2) {
          setLevel("hva");
          setParentSlug(vp.slug);
          setParentKunta(null);
          setSelected(null);
          return;
        }
        setLevel("kunta");
        setParentSlug(vp.slug);
        setParentKunta(null);
        setSelected(null);
        return;
      }
      if (level === "hva") {
        // Drilling from HVA → kunta view of the parent vp's kuntat.
        // We don't filter to "only this HVA's kuntat" — the vp's
        // full kunta map is more useful for navigation, and kuntat
        // outside the picked HVA simply paint with their own value.
        setLevel("kunta");
        setParentKunta(null);
        setSelected(null);
        return;
      }
      if (level === "kunta") {
        // Drill into a kunta's äänestysalueet. Only works for the
        // 4 elections whose year-specific tables expose aa rows
        // (ek2023, kunta2025, alue2025, eu2024). Other elections
        // produce an empty aa list and the user sees "no data".
        setLevel("aa");
        setParentKunta(id);
        setSelected(null);
        return;
      }
    },
    [level, geometry, viewMode, hvaMap],
  );

  const drillUpToCountry = useCallback(() => {
    setLevel("vp");
    setParentSlug(null);
    setParentKunta(null);
    setSelected(null);
  }, []);

  const drillUpToVp = useCallback(() => {
    setLevel("kunta");
    setParentKunta(null);
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
    (level === "kunta" || level === "aa") && parentSlug && geometry
      ? geometry.vaalipiirit.find((v) => v.slug === parentSlug)
      : null;
  const parentKuntaFeature =
    level === "aa" && parentKunta && geometry && parentSlug
      ? geometry.kunnat[parentSlug]?.find((k) => k.id === parentKunta)
      : null;

  /* ─── Crumb steps ──────────────────────────────────────── */
  const crumbSteps = useMemo(() => {
    const steps: Array<{ label: string; onClick?: () => void }> = [];
    if (level === "vp") {
      steps.push({ label: "Koko Suomi" });
    } else if (level === "kunta") {
      steps.push({ label: "Koko Suomi", onClick: drillUpToCountry });
      steps.push({ label: parentVp?.label ?? "Vaalipiiri" });
    } else if (level === "hva") {
      steps.push({ label: "Koko Suomi", onClick: drillUpToCountry });
      steps.push({ label: parentVp?.label ?? "Vaalipiiri" });
      steps.push({ label: "Hyvinvointialueet" });
    } else {
      // aa
      steps.push({ label: "Koko Suomi", onClick: drillUpToCountry });
      steps.push({ label: parentVp?.label ?? "Vaalipiiri", onClick: drillUpToVp });
      steps.push({ label: parentKuntaFeature?.label ?? "Kunta" });
    }
    return steps;
  }, [level, parentVp, parentKuntaFeature, drillUpToCountry, drillUpToVp]);

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
      const result =
        currentResults.get(selected) ??
        hvaById.get(selected) ??
        aaById.get(selected) ??
        null;
      if (level === "vp" && geometry) {
        const vp = geometry.vaalipiirit.find((v) => v.id === selected);
        return { result, label: vp?.label ?? selected, levelLabel: "Vaalipiiri", ...formulaInfo };
      }
      if (level === "hva") {
        const code = selected.startsWith("hv") ? selected.slice(2) : selected;
        const name = hvaMap?.hvaNames[code] ?? selected;
        return {
          result,
          label: name,
          levelLabel: "Hyvinvointialue",
          ...formulaInfo,
        };
      }
      if (level === "kunta" && geometry && parentSlug) {
        const k = geometry.kunnat[parentSlug]?.find((x) => x.id === selected);
        return { result, label: k?.label ?? selected, levelLabel: "Kunta", ...formulaInfo };
      }
      if (level === "aa") {
        const aa = aaResults.find((r) => r.regionId === selected);
        return {
          result,
          label: aa?.label ?? selected,
          levelLabel: "Äänestysalue",
          ...formulaInfo,
        };
      }
      return { result, label: selected, levelLabel: "Vaalipiiri", ...formulaInfo };
    }
    if (level === "aa" && parentKuntaFeature) {
      // No aa selected — show the parent kunta's totals.
      const result = currentResults.get(parentKuntaFeature.id) ?? null;
      return {
        result,
        label: parentKuntaFeature.label,
        levelLabel: "Kunta",
        ...formulaInfo,
      };
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
    // Country aggregate from vp rows misses kuntavaalit candidates
    // (they live on kunta rows only). Fall back to the
    // already-merged country list when the aggregate didn't pick
    // any up.
    if (!aggregated.candidates || aggregated.candidates.length === 0) {
      const list = countryCandidates[election];
      if (list && list.length > 0) {
        aggregated.candidates = list.slice(0, 90);
      }
    }
    return {
      result: aggregated,
      label: "Koko Suomi",
      levelLabel: "Koko maa",
      ...formulaInfo,
    };
  }, [
    currentResults,
    aaById,
    aaResults,
    selected,
    level,
    parentSlug,
    parentVp,
    parentKuntaFeature,
    geometry,
    election,
    mode,
    resolvedFormula,
    formulaValueByRegion,
    countryCandidates,
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
  // For each selector, compute runtime context so the binding pickers
  // can be scoped:
  //   - year slot  → typeHint resolved via sibling $type bindings, so
  //                  the year dropdown filters to compatible elections
  //   - who slot   → resolved election id, used to fetch candidates
  const activeSelectors = useMemo(
    () =>
      listSelectors(formulaTokens).map((s) => {
        const resolvedTypeHint =
          s.slot === "year"
            ? resolveYearSelectorType(s.name, formulaTokens, formulaBindings) ??
              s.typeHint
            : s.typeHint;
        return {
          ...s,
          typeHint: resolvedTypeHint,
          resolvedElectionId:
            s.slot === "who"
              ? resolveWhoSelectorElection(s.name, formulaTokens, formulaBindings)
              : null,
        };
      }),
    [formulaTokens, formulaBindings],
  );

  return (
    <div className="page" ref={dashboardRef}>
      <a href="#map-area" className="skip-link">
        Siirry karttaan
      </a>
      <div className="page-grid" id="map-area">
        {/* ─── Left column: title + Vaali + Mittari + Ledger ─── */}
        <section className="col col-left" aria-label="Otsikko ja päätunnusluvut">
          <h1>Vaalit — tulosvisualisointi</h1>
          <Crumb steps={crumbSteps} />

          {/* Vaali + Mittari share a single horizontal row by stacking
              their tiny labels above the controls. 2-col grid keeps
              the two dropdowns on the same line even when the left
              third is narrow (~430 px on a 1366-wide laptop). */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              columnGap: 10,
              rowGap: 4,
              fontSize: 13,
              alignItems: "center",
            }}
          >
            <ParamLabel>Vaali</ParamLabel>
            <ParamLabel>Mittari</ParamLabel>
            <ElectionPicker
              value={election}
              onChange={setElection}
              hasData={electionsWithData}
              ariaLabel="Vaali"
            />
            <MittariDropdown
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
          </div>

          <Ledger
            result={ledger.result}
            label={ledger.label}
            levelLabel={ledger.levelLabel}
            loading={dataLoading}
            formulaValue={ledger.formulaValue ?? null}
            formulaSummaryText={ledger.formulaSummaryText ?? null}
            framing={mode === "formula" ? framing : null}
            formulaDescription={
              mode === "formula" && appliedWorkflowId
                ? customWorkflows.find((w) => w.id === appliedWorkflowId)
                    ?.description ?? null
                : null
            }
          />
        </section>

        {/* ─── Center column: full-height map ─── */}
        <section
          className="col col-center"
          ref={mapAreaRef}
          aria-label={`Vaalituloskartta — ${electionLabel}`}
        >
          {dataLoading || !geometry ? (
            <LoadingStamp electionLabel={electionLabel} />
          ) : level === "aa" && aaFeatures == null ? (
            <NoAaData
              electionLabel={electionLabel}
              kuntaLabel={parentKuntaFeature?.label ?? null}
              onBack={drillUpToVp}
            />
          ) : (
            <div className="map-frame">
              <HierarchyMap
                geometry={geometry}
                level={level}
                parentSlug={parentSlug}
                aaFeatures={aaFeatures}
                hvaFeatures={hvaFeatures}
                selected={selected}
                getFill={getFill}
                getTooltip={getTooltip}
                onPick={onPick}
                onZoomIn={onZoomIn}
              />
            </div>
          )}
        </section>

        {/* ─── Right column: actions + per-mode controls + legend ─── */}
        <section className="col col-right" aria-label="Toiminnot ja selitykset">
          <div className="col-right-actions">
            <ShareLinkPill onToast={setToast} />
            <DownloadMenu
              onMapSvg={exportSvg}
              onMapPng={exportPng}
              onDashboardPng={exportDashboard}
              disabled={dataLoading}
            />
            <HelpBox />
          </div>

          {/* Per-mode controls — visible only when applicable. */}
          {(WF_KIND_BY_ID[mode].needsParty ||
            mode === "change" ||
            mode === "formula") ? (
            <div className="col-right-controls">
              {WF_KIND_BY_ID[mode].needsParty ? (
                <>
                  <ParamLabel>Puolue</ParamLabel>
                  <PartyPicker
                    value={focusParty}
                    onChange={setFocusParty}
                    allowAll={mode === "votes"}
                  />
                </>
              ) : null}
              {mode === "change" ? (
                <>
                  <ParamLabel>Vertailu</ParamLabel>
                  <ElectionPicker
                    value={refElection}
                    onChange={setRefElection}
                    exclude={new Set([election])}
                    hasData={electionsWithData}
                    ariaLabel="Vertailuvuosi"
                  />
                </>
              ) : null}
              {mode === "formula" ? (
                <>
                  <ParamLabel>Skaala</ParamLabel>
                  <FramingTabs value={framing} onChange={setFraming} />
                </>
              ) : null}
            </div>
          ) : null}

          {/* Inline secondary toggles — previously hidden behind a
              "Lisäasetukset" popover. Surfacing them directly removes
              a click and keeps the right-column state visible at all
              times. The HVA toggle is hidden where it has no meaning
              (Helsinki / Ahvenanmaa); the Ahvenanmaa exclusion is
              formula-mode only since that's where the empty share
              collapses adaptive ramps. */}
          <ExtraTogglesInline
            viewMode={viewMode}
            onViewModeChange={(next) => {
              setViewMode(next);
              if (next === "kunta" && level === "hva" && parentSlug) {
                setLevel("kunta");
                setSelected(null);
              }
              if (
                next === "hva" &&
                level === "kunta" &&
                parentSlug &&
                hvaMap
              ) {
                const hvaCount = Object.values(hvaMap.hvaToVp).filter(
                  (s) => s === parentSlug,
                ).length;
                if (hvaCount >= 2) {
                  setLevel("hva");
                  setSelected(null);
                }
              }
            }}
            hvaDisabledReason={(() => {
              if (!parentSlug) return null;
              if (parentSlug === "hel" || parentSlug === "ahve") {
                return "Helsinki ja Ahvenanmaa: ei hyvinvointialueita";
              }
              return null;
            })()}
            showAhvenanmaaToggle={mode === "formula"}
            excludeAhvenanmaa={excludeAhvenanmaa}
            onExcludeAhvenanmaaChange={(next) => {
              setExcludeAhvenanmaa(next);
              if (appliedWorkflowId) {
                setCustomWorkflows((prev) =>
                  prev.map((w) =>
                    w.id === appliedWorkflowId
                      ? { ...w, excludeAhvenanmaa: next }
                      : w,
                  ),
                );
              }
            }}
          />

          {/* Legend (color-scheme explanation) — sits in the right
              column so it's visible alongside the map. */}
          <div>
            <DynamicLegend
              mode={mode}
              focusParty={focusParty}
              winnerParties={winnerPartiesInView}
              hasNoData={hasNoDataInView}
              supportRange={supportRange}
              changeRange={changeRange}
              votesRange={votesRange}
              formulaRange={formulaRange}
              formulaSummary={
                mode === "formula" && resolvedFormula.length > 0
                  ? formulaSummary(resolvedFormula)
                  : null
              }
              framing={mode === "formula" ? framing : null}
              electionLabel={electionLabel}
              refElectionLabel={mode === "change" ? refLabel : undefined}
            />
          </div>

          {/* Selector bindings — second row only when a formula has
              `$A`, `$Y`, etc. */}
          {mode === "formula" && activeSelectors.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                fontSize: 13,
              }}
            >
              <SelectorBindingRow
                selectors={activeSelectors}
                bindings={formulaBindings}
                setBindings={setFormulaBindings}
                labels={appliedSelectorLabels}
                electionsWithData={electionsWithData}
                loadCandidates={(id) => source.listCandidates(id)}
              />
            </div>
          ) : null}
        </section>
      </div>

      {builderOpen ? (
        <WorkflowBuilder
          initial={editingWorkflow ?? undefined}
          onSave={saveWorkflow}
          onUpdate={updateWorkflow}
          onClose={() => {
            setBuilderOpen(false);
            setEditingWorkflow(null);
          }}
          loadCandidatesForElection={(id) => source.listCandidates(id)}
          availableElectionIds={electionsWithData}
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

function NoAaData({
  electionLabel,
  kuntaLabel,
  onBack,
}: {
  electionLabel: string;
  kuntaLabel: string | null;
  onBack: () => void;
}): JSX.Element {
  return (
    <div
      role="status"
      style={{
        height: 640,
        width: 520,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        textAlign: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          border: "2px dashed rgba(0,0,0,0.35)",
          padding: "16px 22px",
          borderRadius: "var(--radius-card)",
          fontFamily: "var(--font-display)",
          fontSize: 22,
          color: "rgba(0,0,0,0.55)",
          transform: "rotate(-2deg)",
          background: "rgba(251,249,244,0.7)",
          maxWidth: 360,
        }}
      >
        Äänestysaluetietoja ei ole saatavilla
        {kuntaLabel ? ` kunnalle ${kuntaLabel}` : ""} vaalille {electionLabel}.
      </div>
      <div style={{ fontSize: 12, opacity: 0.6, maxWidth: 360 }}>
        Tilastokeskuksen vuosittaiset taulukot tarjoavat
        äänestysalue&shy;tason datan vain osalle vaaleja
        (eduskuntavaalit&nbsp;2023, kuntavaalit&nbsp;2025,
        aluevaalit&nbsp;2025, eurovaalit&nbsp;2024).
      </div>
      <span
        className="pill"
        onClick={onBack}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onBack();
          }
        }}
        style={{
          cursor: "pointer",
          fontSize: 12,
          background: "var(--paper)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        ← Takaisin kuntiin
      </span>
    </div>
  );
}

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

/** Right-column inline secondary toggles. Replaces the old
 *  `LisaasetuksetButton` popover with always-visible controls so the
 *  user can flip view mode / Ahvenanmaa exclusion without an extra
 *  click. Renders nothing when neither toggle is applicable
 *  (e.g. Helsinki vp + non-formula mode). */
function ExtraTogglesInline({
  viewMode,
  onViewModeChange,
  hvaDisabledReason,
  showAhvenanmaaToggle,
  excludeAhvenanmaa,
  onExcludeAhvenanmaaChange,
}: {
  viewMode: "kunta" | "hva";
  onViewModeChange: (next: "kunta" | "hva") => void;
  hvaDisabledReason: string | null;
  showAhvenanmaaToggle: boolean;
  excludeAhvenanmaa: boolean;
  onExcludeAhvenanmaaChange: (next: boolean) => void;
}): JSX.Element | null {
  const hvaDisabled = hvaDisabledReason !== null;
  if (hvaDisabled && !showAhvenanmaaToggle) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        rowGap: 6,
        alignItems: "center",
        fontSize: 12,
      }}
    >
      {!hvaDisabled ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ParamLabel>Ryhmittely</ParamLabel>
          <span
            style={{
              display: "inline-flex",
              gap: 4,
              background: "var(--paper-2)",
              border: "var(--border-thin) solid var(--line)",
              borderRadius: "var(--radius-pill)",
              padding: 3,
            }}
          >
            {(["kunta", "hva"] as const).map((m) => (
              <span
                key={m}
                className={"pill " + (viewMode === m ? "on" : "")}
                onClick={() => onViewModeChange(m)}
                role="button"
                tabIndex={0}
                aria-pressed={viewMode === m}
                style={{ cursor: "pointer", fontSize: 11, padding: "2px 10px" }}
              >
                {m === "kunta" ? "Kunta" : "HVA"}
              </span>
            ))}
          </span>
        </span>
      ) : null}
      {showAhvenanmaaToggle ? (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            fontSize: 12,
          }}
          title="Ahvenanmaalla ei ole ääniä mantereen puolueille — sen mukaan ottaminen romahduttaa väriliukuman muille alueille."
        >
          <input
            type="checkbox"
            checked={excludeAhvenanmaa}
            onChange={(e) => onExcludeAhvenanmaaChange(e.target.checked)}
            style={{ accentColor: "var(--ink)" }}
          />
          <span>Älä huomioi Ahvenanmaata</span>
        </label>
      ) : null}
    </div>
  );
}

function FramingTabs({
  value,
  onChange,
}: {
  value: FormulaFraming;
  onChange: (f: FormulaFraming) => void;
}): JSX.Element {
  // Three buttons: vote count (absolute), percentage points
  // (absolute share %), and relative change vs the selected region.
  // The legacy "% kokonaisuudesta" framing still exists in the
  // codec but isn't exposed as a button.
  const opts: Array<{
    id: FormulaFraming;
    label: string;
    title: string;
  }> = [
    {
      id: "absVotes",
      label: "Äänimäärä",
      title:
        "Kaavan arvo äänimääränä, esim. kok2023 − kok2019 antaa äänten erotuksen.",
    },
    {
      id: "absolute",
      label: "Prosenttiyksikköä",
      title:
        "Kaavan arvo prosenttiyksiköissä, esim. kok2023 − kok2019 antaa kannatuksen muutoksen %-yksikköinä.",
    },
    {
      id: "vsSelected",
      label: "Suhteellinen muutos %",
      title:
        "Kaavan arvo prosenttina kaavan viimeisen termin äänimäärästä — esim. kok2023 − kok2019 antaa muutoksen prosentteina vuoden 2019 äänimäärästä.",
    },
  ];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {opts.map((opt) => (
        <span
          key={opt.id}
          className={"pill " + (value === opt.id ? "on" : "")}
          onClick={() => onChange(opt.id)}
          role="button"
          tabIndex={0}
          title={opt.title}
          style={{ cursor: "pointer", fontSize: 12 }}
        >
          {opt.label}
        </span>
      ))}
    </div>
  );
}

function SelectorBindingRow({
  selectors,
  bindings,
  setBindings,
  labels,
  electionsWithData,
  loadCandidates,
}: {
  selectors: Array<{
    name: string;
    slot: "type" | "year" | "who";
    typeHint: ElectionTypeId | null;
    /** Resolved election id (e.g. "ek2023") for `who`-slot selectors,
     *  computed from sibling bindings. `null` when the chip's other
     *  slots aren't yet bound, in which case the picker defaults to
     *  party-only mode. */
    resolvedElectionId: ElectionId | null;
  }>;
  bindings: Record<string, Binding>;
  setBindings: React.Dispatch<React.SetStateAction<Record<string, Binding>>>;
  labels: Record<string, string>;
  /** `null` while probing — treat every option as available. */
  electionsWithData: ReadonlySet<ElectionId> | null;
  /** Async lookup for candidates of a given election. */
  loadCandidates: (electionId: ElectionId) => Promise<Candidate[]>;
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
                {ELECTIONS.filter(
                  (e) =>
                    (electionsWithData == null || electionsWithData.has(e.id)) &&
                    // Filter to the chip-resolved type when every chip
                    // referencing this $Year selector shares one type
                    // (so picking "Pres 2024 r1" can't bind through
                    // an EU chip and silently resolve to eu2024).
                    (s.typeHint == null || e.typeId === s.typeHint),
                ).map((e) => {
                  // Just the year, with "· I" / "· II" for pres rounds.
                  const label =
                    e.typeId === "pres" && e.round
                      ? `${e.year} · ${e.round === 2 ? "II" : "I"}`
                      : String(e.year);
                  return (
                    <option key={e.id} value={`${e.year}_${e.round ?? 1}`}>
                      {label}
                    </option>
                  );
                })}
              </select>
            ) : null}
            {s.slot === "who" ? (
              <WhoBindingPicker
                selectorName={s.name}
                value={b.who ?? null}
                onChange={(next) => bind(s.name, { who: next ?? undefined })}
                resolvedElectionId={s.resolvedElectionId ?? null}
                loadCandidates={loadCandidates}
              />
            ) : null}
          </span>
        );
      })}
    </>
  );
}

/* ─── Who-slot binding popover ──────────────────────────────── */

/** Replaces the runtime "who" `<select>` so the user can bind a
 *  selector to either a party (the original 8) or to a specific
 *  candidate from the chip's resolved election. Clicking the pill
 *  toggles a small popover anchored under it.
 *
 *  When `resolvedElectionId` is null (the chip's other slots aren't
 *  bound yet, or chips disagree), the popover only offers parties —
 *  there's no single election to fetch candidates from. */
function WhoBindingPicker({
  selectorName,
  value,
  onChange,
  resolvedElectionId,
  loadCandidates,
}: {
  selectorName: string;
  value: ChipWho | null;
  onChange: (next: ChipWho | null) => void;
  resolvedElectionId: ElectionId | null;
  loadCandidates: (electionId: ElectionId) => Promise<Candidate[]>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"party" | "candidate">(() =>
    value && "candidate" in value ? "candidate" : "party",
  );
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // Load candidates lazily once a resolved election is known.
  useEffect(() => {
    if (!resolvedElectionId) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    void loadCandidates(resolvedElectionId).then((list) => {
      if (!cancelled) setCandidates(list);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedElectionId, loadCandidates]);

  // Click-outside closes.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const display = (() => {
    if (!value) return "— valitse —";
    if ("party" in value) return PARTY_BY_ID[value.party]?.name ?? value.party;
    return value.candidate.name;
  })();
  const swatchColor = (() => {
    if (!value) return "transparent";
    if ("party" in value) return `var(--p-${value.party})`;
    const known = PARTY_BY_ID[value.candidate.party];
    return known ? `var(--p-${known.id})` : "var(--ink-mute)";
  })();

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 25);
    return candidates
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 25);
  }, [candidates, query]);

  return (
    <span ref={wrapRef} style={{ position: "relative" }}>
      <span
        role="button"
        tabIndex={0}
        aria-label={`Valinta $${selectorName}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 4px 2px 4px",
          borderBottom: "var(--border-default) dotted var(--ink)",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        {value ? (
          <span
            className="swatch"
            style={{ background: swatchColor }}
            aria-hidden="true"
          />
        ) : null}
        {display}
        <span style={{ opacity: 0.5, fontSize: 10 }}>▾</span>
      </span>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            background: "var(--paper)",
            border: "var(--border-default) solid var(--line)",
            borderRadius: "var(--radius-box)",
            boxShadow: "var(--shadow-pop)",
            padding: 6,
            minWidth: 220,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {resolvedElectionId ? (
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 6,
                paddingBottom: 6,
                borderBottom: "1px dotted var(--hair)",
              }}
            >
              {(["party", "candidate"] as const).map((m) => (
                <span
                  key={m}
                  className={"pill " + (mode === m ? "on" : "")}
                  onClick={() => setMode(m)}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer", fontSize: 11, padding: "2px 8px" }}
                >
                  {m === "party" ? "Puolue" : "Ehdokas"}
                </span>
              ))}
            </div>
          ) : null}
          {mode === "party" || !resolvedElectionId ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <BindingRow
                label="— tyhjä —"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                active={value === null}
              />
              {PARTIES.map((p) => (
                <BindingRow
                  key={p.id}
                  label={p.name}
                  swatchColor={`var(--p-${p.id})`}
                  active={Boolean(value && "party" in value && value.party === p.id)}
                  onClick={() => {
                    onChange({ party: p.id });
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          ) : (
            <div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="etsi ehdokasta nimellä…"
                aria-label="Ehdokashaku"
                autoFocus
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  fontSize: 12,
                  border: "1px solid var(--line)",
                  borderRadius: 4,
                  background: "var(--paper-2)",
                  fontFamily: "inherit",
                  marginBottom: 6,
                  boxSizing: "border-box",
                }}
              />
              {filteredCandidates.length === 0 ? (
                <div style={{ padding: "6px 8px", fontSize: 11, opacity: 0.55 }}>
                  Ei tuloksia
                </div>
              ) : (
                filteredCandidates.map((c) => {
                  const known = PARTY_BY_ID[c.party];
                  const partyAbbr =
                    known?.abbr ?? c.party.replace(/^_/, "").toUpperCase();
                  return (
                    <BindingRow
                      key={c.id}
                      label={c.name}
                      sub={partyAbbr}
                      swatchColor={
                        known ? `var(--p-${known.id})` : "var(--ink-mute)"
                      }
                      active={Boolean(
                        value &&
                          "candidate" in value &&
                          value.candidate.id === c.id,
                      )}
                      onClick={() => {
                        onChange({
                          candidate: { id: c.id, name: c.name, party: c.party },
                        });
                        setOpen(false);
                      }}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>
      ) : null}
    </span>
  );
}

function BindingRow({
  label,
  sub,
  swatchColor,
  active,
  onClick,
}: {
  label: string;
  sub?: string;
  swatchColor?: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 6px",
        cursor: "pointer",
        background: active ? "rgba(0,0,0,0.07)" : "transparent",
        borderRadius: 3,
        fontSize: 12,
      }}
    >
      {swatchColor ? (
        <span
          className="swatch"
          style={{ background: swatchColor, flexShrink: 0 }}
          aria-hidden="true"
        />
      ) : null}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {sub ? (
        <span style={{ fontSize: 10, opacity: 0.55 }}>{sub}</span>
      ) : null}
    </div>
  );
}

/* ─── Käyttöohjeet (help / instructions) ────────────────────── */

/** Help-button pill in the right-column actions. When clicked,
 *  the panel opens as a fixed-position overlay centered on screen
 *  with the three sections side-by-side, so the entire help text
 *  fits within the viewport — the page itself is `overflow:
 *  hidden` (viewport-pinned), so an inline expanded panel would
 *  get clipped and require scrolling. */
function HelpBox(): JSX.Element {
  const [open, setOpen] = useState(false);
  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <span
        className="pill"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{
          cursor: "pointer",
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Käyttöohjeet
      </span>
      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(26,26,26,0.32)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          role="dialog"
          aria-label="Käyttöohjeet"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--paper)",
              border: "var(--border-default) solid var(--line)",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--shadow-pop)",
              padding: "20px 24px",
              fontSize: 13.5,
              lineHeight: 1.55,
              width: "min(1000px, 96vw)",
              maxHeight: "90vh",
              fontFamily:
                "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 22,
                  margin: 0,
                }}
              >
                Käyttöohjeet
              </h2>
              <span
                onClick={() => setOpen(false)}
                role="button"
                tabIndex={0}
                aria-label="Sulje"
                style={{
                  cursor: "pointer",
                  fontSize: 18,
                  padding: "2px 10px",
                  color: "var(--ink)",
                }}
              >
                ✕
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 22,
              }}
            >
              <HelpSection title="Kartan navigointi">
                <li>
                  <b>Klikkaus</b> valitsee alueen — tulokset näkyvät
                  vasemmalla.
                </li>
                <li>
                  <b>Kaksoisklikkaus</b> porautuu alueen sisään:
                  vaalipiiri → kunta → äänestysalue.
                </li>
                <li>
                  <b>Tab</b> / <b>nuolet</b> siirtyvät alueesta toiseen,{" "}
                  <b>Shift+Tab</b> toiseen suuntaan, <b>Enter</b>{" "}
                  porautuu sisään, <b>Esc</b> poistaa fokuksen.
                </li>
                <li>
                  <b>Lisäasetukset</b> oikealla sisältää{" "}
                  <i>Kunta / Hyvinvointialue</i> -valitsimen kuntien
                  ryhmittelyyn.
                </li>
              </HelpSection>
              <HelpSection title="Mittari + mukautettu kaava">
                <li>
                  <b>Mittari</b>-pudotus valitsee näkymän: Suurin
                  puolue, Puolueen kannatus %, Äänimäärä, Kannatuksen
                  muutos tai oma mukautettu kaava.
                </li>
                <li>
                  <b>+ Uusi mukautettu kaava…</b> avaa kaavan
                  rakentajan — voit verrata esim.{" "}
                  <i>Vihreät 2023 − Vihreät 2019</i> tai yksittäisen
                  ehdokkaan kannatusta puolueeseen.
                </li>
                <li>
                  <b>Skaala</b> kaavalle: <i>Äänimäärä</i> raakana,{" "}
                  <i>Prosenttiyksikköä</i> %-yksikköinä,{" "}
                  <i>Suhteellinen muutos %</i> kaavan viimeiseen
                  termiin verrattuna.
                </li>
                <li>
                  <b>Älä huomioi Ahvenanmaata</b> (Lisäasetukset)
                  jättää Ahvenanmaan väriliukuman ulkopuolelle.
                </li>
              </HelpSection>
              <HelpSection title="Jakaminen + tallennus">
                <li>
                  <b>Jaa linkki</b> kopioi nykyisen näkymän osoitteen
                  leikepöydälle — toinen käyttäjä saa saman näkymän
                  avaamalla linkin.
                </li>
                <li>
                  <b>Lataa kuvana</b>: <i>Karttakuva (SVG)</i>{" "}
                  vektoriksi, <i>Karttakuva (PNG)</i> rasteriksi tai{" "}
                  <i>Koko näkymä (PNG)</i> sisältäen sivuelementit.
                </li>
                <li>
                  Mukautetut kaavat tallentuvat selaimeen — vain sinä
                  näet omat kaavasi, eivät muut sivuston käyttäjät.
                </li>
              </HelpSection>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function HelpSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 10,
          opacity: 0.6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{children}</ul>
    </div>
  );
}
