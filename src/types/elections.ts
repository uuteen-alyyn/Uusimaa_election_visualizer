/**
 * Core types for election data, workflows, and formula composition.
 *
 * All UI components and the data layer reference these. The wire
 * shape on disk under public/data/elections/{id}.json matches
 * `FixtureFile` (defined alongside `LocalFixtureSource`) — the
 * fixtures are an array of `RegionResult` plus envelope metadata.
 */

/* ─── Identifiers ──────────────────────────────────────────── */

/** Region identifier.
 *
 *  - Vaalipiiri: 2-digit code matching `data/fi-vaalipiirit.json` ids
 *    (`"01"` Helsinki, `"02"` Uusimaa, …, `"13"` Lappi).
 *    Note that the prototype's geometry file uses short slugs
 *    (`"hel"`, `"uus"`, …) for vp ids — we'll reconcile in Phase 2.
 *  - Kunta: 3-digit kuntakoodi (`"091"` Helsinki, `"049"` Espoo, …).
 *  - Country level: `"suomi"`.
 */
export type RegionId = string;

/** Election identifier — see `src/data/catalog.ts` ELECTIONS. */
export type ElectionId = string;

/** Election type. */
export type ElectionTypeId = "kunta" | "alue" | "ek" | "eu" | "pres";

/** Hierarchy level for the map view.
 *
 *  - `maa`   : country aggregate (synthesised from vp rows)
 *  - `vp`    : vaalipiiri (electoral district) — 13 nationally
 *  - `hva`   : hyvinvointialue (welfare region) — 21 + Helsinki
 *              (Helsinki is its own implicit HVA, Ahvenanmaa has
 *              none). Aggregation source: PxWeb-direct for alue
 *              elections; sum of kunta rows for everything else.
 *  - `kunta` : municipality (~309 in mainland Finland)
 *  - `aa`    : äänestysalue (polling district) */
export type AreaLevel = "maa" | "vp" | "hva" | "kunta" | "aa";

/** Canonical 8 parties with bespoke design tokens (see tokens.css `--p-*`).
 *  Smaller parties are allowed via the wider `PartyId` type, but render
 *  with a fallback color in the UI. */
export const KNOWN_PARTY_IDS = [
  "kok",
  "sdp",
  "ps",
  "kesk",
  "vihr",
  "vas",
  "rkp",
  "kd",
] as const;
export type KnownPartyId = (typeof KNOWN_PARTY_IDS)[number];

/** Any party id PxWeb may produce. Use `KNOWN_PARTY_IDS.includes(id)`
 *  to check whether a tokens.css color exists for it. */
export type PartyId = string;

/* ─── Wire shapes ──────────────────────────────────────────── */

/** Single candidate row from a region. */
export interface Candidate {
  id: string;
  name: string;
  party: PartyId;
  votes: number;
}

/** Per-region results for one election, lazily loaded from a fixture. */
export interface RegionResult {
  regionId: RegionId;
  electionId: ElectionId;
  /** Total votes cast in the region. */
  votes: number;
  /** Eligible voters in the region. */
  voters: number;
  /** Turnout percentage, 0–100. */
  turnout: number;
  /** Party shares as a percentage 0–100; sums to ~100 across all
   *  parties present (may include parties outside `KNOWN_PARTY_IDS`). */
  shares: Partial<Record<PartyId, number>>;
  /** Optional per-region top candidates, when fetched. */
  candidates?: Candidate[];
  /** Set on äänestysalue rows: the 3-digit kuntakoodi the aa
   *  belongs to. Used by `LocalFixtureSource.listAreas` to scope
   *  the kunta → aa drill. */
  parentKunta?: string;
  /** Set on äänestysalue rows: the friendly label
   *  (e.g. `"001 Eteläinen"`). The vp/kunta levels get their
   *  labels from the geometry; aa labels live with the data
   *  because we generate aa shapes client-side. */
  label?: string;
}

/* ─── Workflows ────────────────────────────────────────────── */

/** The five coloring modes the workflow bar exposes. */
export type WorkflowKind = "winner" | "support" | "votes" | "change" | "formula";

/** A workflow — built-in (4 of them) or user-saved custom. */
export interface Workflow {
  id: string;
  label: string;
  kind: WorkflowKind;
  /** Election bound at view time. */
  election: ElectionId;
  /** Reference election when `kind === "change"`. */
  refElection?: ElectionId;
  /** Focus party when `kind` ∈ {"support","votes","change"}. */
  party?: PartyId;
  /** Formula tokens when `kind === "formula"`. */
  formula?: FormulaToken[];
  /** Optional friendly labels for selectors keyed by selector name (`"A"`, `"B"`…). */
  selectorLabels?: Record<string, string>;
  /** Default selector bindings, persisted across sessions. */
  defaultBindings?: Record<string, Binding>;
  /** Optional free-text description shown below the formula value
   *  in the Ledger when this workflow is the applied one. Lets the
   *  saver leave themselves a note about what the formula means
   *  ("Vihreät yliedustus presidentinvaalin pohjalta", etc.). */
  description?: string;
  /** Custom-formula option: skip Ahvenanmaa when computing the
   *  visible-region range that scales the color ramp. Ahvenanmaa
   *  has no votes for mainland parties, which collapses most ramps
   *  into one bucket otherwise. Defaults to `true` for new custom
   *  workflows. */
  excludeAhvenanmaa?: boolean;
  /** Marks the four immutable built-ins. */
  builtin?: boolean;
}

/* ─── Formula composition ──────────────────────────────────── */

/** A token in the formula composer. */
export type FormulaToken =
  | { kind: "chip"; fields: ChipFields }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" }
  | { kind: "num"; value: number };

/** A formula chip — a triple of (election type, year/round, who).
 *  Each slot may be either a concrete value or a selector reference. */
export interface ChipFields {
  /** Concrete election type. */
  type?: ElectionTypeId;
  /** Selector name (`"A"`, `"B"`, …) when the type slot is bound at view time. */
  selType?: string;
  /** Concrete election year. */
  year?: number;
  /** Selector name for the year slot. */
  selYear?: string;
  /** Round (1 or 2) for presidential elections. */
  round?: 1 | 2;
  /** Concrete who — a party share or a specific candidate. */
  who?: ChipWho;
  /** Selector name for the who slot. */
  selWho?: string;
}

/** Concrete value in a chip's "who" slot. */
export type ChipWho =
  | { party: PartyId }
  | { candidate: { id: string; name: string; party: PartyId } };

/** Late binding for a formula selector ($A/$B/$C). */
export interface Binding {
  type?: ElectionTypeId;
  year?: number;
  round?: 1 | 2;
  who?: ChipWho;
}

/** Change-mode comparison measure.
 *
 *  - `pp`    — percentage-point change in vote share (current minus
 *              ref): the natural unit for "did they gain or lose
 *              support?". Default.
 *  - `votes` — absolute vote-count delta (current party votes minus
 *              ref party votes). Reads as "how many more / fewer
 *              actual ballots did they get this time?".
 *  - `pct`   — relative percentage change of party votes:
 *              `(now − then) / then × 100`. "+15 %" means 15% more
 *              votes than last time, regardless of the absolute
 *              size. Skipped where `then === 0`. */
export type CompareMode = "pp" | "votes" | "pct";

/** Formula framing — how chip metrics are computed and how the
 *  resulting per-region values are rescaled for display.
 *
 *  - `absVotes`   — chip metric = absolute vote count (party votes,
 *                   candidate votes, or region total when no `who`).
 *                   No rescale. Useful for "where did this party
 *                   pull its raw votes from?"
 *  - `absolute`   — chip metric = vote-share % (or turnout %).
 *                   No rescale. The original "Absoluuttinen" mode.
 *  - `vsSelected` — share %, then re-expressed as relative change vs
 *                   the currently selected region.
 *  - `share`      — share %, rescaled as a region's % of the visible
 *                   total. Kept for share-link backwards compat;
 *                   not exposed in the current UI. */
export type FormulaFraming =
  | "absVotes"
  | "absolute"
  | "share"
  | "vsSelected";

/* ─── App state (URL hash codec target) ────────────────────── */

/** Top-level app state. URL hash encodes a subset of this. */
export interface AppState {
  mode: WorkflowKind;
  election: ElectionId;
  refElection: ElectionId;
  focusParty: PartyId | null;
  formulaTokens: FormulaToken[];
  formulaBindings: Record<string, Binding>;
  appliedWorkflowId: string | null;
  customWorkflows: Workflow[];
  level: AreaLevel;
  parentId: RegionId | null;
  selectedId: RegionId | null;
}
