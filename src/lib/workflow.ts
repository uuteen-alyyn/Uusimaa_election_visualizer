/**
 * Workflow primitives — port of the catalog + helpers from
 * `prototype/wf-workflows.jsx`. The data shapes are typed in
 * `src/types/elections.ts`; this module exposes:
 *
 *   - `WF_KINDS` / `WF_KIND_BY_ID` — the five coloring modes
 *   - `BUILTIN_WORKFLOWS` — four immutable built-ins shown first
 *   - `workflowsEquivalent` — used by the WorkflowBar to decide
 *     which pill is highlighted
 *   - `workflowSubtitle` — short descriptive line for tooltips
 *   - `loadCustomWorkflows` / `saveCustomWorkflows` — localStorage
 *     I/O under the prototype's `vk_workflows_v1` key (preserved so
 *     existing user state survives the migration)
 */

import { ELECTION_BY_ID, PARTY_BY_ID } from "../data/catalog";
import { formulaSummary } from "./formula";
import type { Workflow, WorkflowKind } from "../types/elections";

/* ─── Workflow kinds ───────────────────────────────────────── */

export interface WorkflowKindDef {
  id: WorkflowKind;
  label: string;
  /** True for kinds that color by a specific party (support / votes / change). */
  needsParty: boolean;
  /** True for kinds that compare against a reference election (change). */
  needsRef: boolean;
  /** True for the formula kind. */
  needsFormula?: boolean;
}

export const WF_KINDS: readonly WorkflowKindDef[] = [
  { id: "winner", label: "Suurin puolue", needsParty: false, needsRef: false },
  { id: "support", label: "Puolueen kannatus %", needsParty: true, needsRef: false },
  { id: "votes", label: "Äänimäärä", needsParty: true, needsRef: false },
  { id: "change", label: "Kannatuksen muutos", needsParty: true, needsRef: true },
  {
    id: "formula",
    label: "Mukautettu kaava",
    needsParty: false,
    needsRef: false,
    needsFormula: true,
  },
];

export const WF_KIND_BY_ID: Readonly<Record<WorkflowKind, WorkflowKindDef>> =
  Object.fromEntries(WF_KINDS.map((k) => [k.id, k])) as Readonly<
    Record<WorkflowKind, WorkflowKindDef>
  >;

/* ─── Built-in workflows ────────────────────────────────────── */

/** Default election for new workflows — most recent eduskuntavaalit
 *  with PxWeb data (the prototype defaulted to ek2027 since it had
 *  synthetic data; we use ek2023). */
export const DEFAULT_ELECTION = "ek2023";
/** Default reference election for the change mode — ek2019 gives
 *  the most recent ek-vs-ek comparison until ek2027 is held. */
export const DEFAULT_REF_ELECTION = "ek2019";
/** Default focus party — Kokoomus, the largest party in 2023. */
export const DEFAULT_PARTY = "kok";

export const BUILTIN_WORKFLOWS: readonly Workflow[] = [
  {
    id: "bi-winner",
    builtin: true,
    label: "Suurin puolue",
    kind: "winner",
    election: DEFAULT_ELECTION,
  },
  {
    id: "bi-support",
    builtin: true,
    label: "Puolueen kannatus %",
    kind: "support",
    election: DEFAULT_ELECTION,
    party: DEFAULT_PARTY,
  },
  {
    id: "bi-votes",
    builtin: true,
    label: "Äänimäärä",
    kind: "votes",
    election: DEFAULT_ELECTION,
    party: DEFAULT_PARTY,
  },
  {
    id: "bi-change",
    builtin: true,
    label: "Kannatuksen muutos",
    kind: "change",
    election: DEFAULT_ELECTION,
    refElection: DEFAULT_REF_ELECTION,
    party: DEFAULT_PARTY,
  },
];

/* ─── Equivalence + display ─────────────────────────────────── */

/** Are two workflows equivalent in what they configure? Ignores id,
 *  label, builtin/customness — used by the WorkflowBar to highlight
 *  the active pill regardless of which row produced it. */
export function workflowsEquivalent(a: Workflow | null, b: Workflow | null): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "formula") {
    return JSON.stringify(a.formula ?? []) === JSON.stringify(b.formula ?? []);
  }
  if (a.election !== b.election) return false;
  const k = WF_KIND_BY_ID[a.kind];
  if (k.needsParty && a.party !== b.party) return false;
  if (k.needsRef && a.refElection !== b.refElection) return false;
  return true;
}

/** Short subtitle for a workflow (tooltip / pill-hover line). */
export function workflowSubtitle(w: Workflow): string {
  if (w.kind === "formula") {
    return "ƒ " + formulaSummary(w.formula ?? []);
  }
  const electionLabel = ELECTION_BY_ID[w.election]?.shortLabel ?? w.election;
  const bits = [electionLabel];
  const k = WF_KIND_BY_ID[w.kind];
  if (k.needsRef && w.refElection) {
    const refLabel = ELECTION_BY_ID[w.refElection]?.shortLabel ?? w.refElection;
    bits.push(`vs ${refLabel}`);
  }
  if (k.needsParty && w.party) {
    bits.push(PARTY_BY_ID[w.party]?.abbr ?? w.party);
  }
  return bits.join(" · ");
}

/* ─── localStorage persistence ──────────────────────────────── */

/** localStorage key — preserved verbatim from the prototype so
 *  existing users' saved workflows survive the migration. */
export const WF_LS_KEY = "vk_workflows_v1";

/** Load saved custom workflows. Returns `[]` on missing / malformed
 *  storage. Strips an accidental double-`ƒ ` prefix that crept into
 *  some early prototype labels (cleanup-on-read; never re-saves
 *  the bad form). */
export function loadCustomWorkflows(storage: Storage = localStorage): Workflow[] {
  try {
    const raw = storage.getItem(WF_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((w): w is Workflow => {
      if (!w || typeof w !== "object") return false;
      const wf = w as Partial<Workflow>;
      return typeof wf.id === "string" && typeof wf.kind === "string";
    });
    return valid.map((w) => {
      if (typeof w.label === "string") {
        const clean = w.label.replace(/^(ƒ\s*)+/, "");
        if (clean !== w.label) return { ...w, label: clean };
      }
      return w;
    });
  } catch {
    return [];
  }
}

/** Save custom workflows. Errors (storage full, disabled) are
 *  swallowed — caller can keep going with in-memory state. */
export function saveCustomWorkflows(
  workflows: Workflow[],
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(WF_LS_KEY, JSON.stringify(workflows));
  } catch {
    // intentionally swallowed
  }
}
