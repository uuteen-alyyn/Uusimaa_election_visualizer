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

/** Hierarchy level for the map view. */
export type AreaLevel = "maa" | "vp" | "kunta" | "aa";

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

/** Formula framing — how raw values are rescaled for display. */
export type FormulaFraming = "absolute" | "share" | "vsSelected";

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
