/**
 * Formula evaluator — port of `prototype/wf-map.jsx:178` (evalFormula)
 * with surrounding helpers from the same file.
 *
 * Replaces the prototype's synthetic-data closure (`regionData(id)`)
 * with a caller-supplied synchronous lookup, so the evaluator stays
 * pure and is easy to unit-test. Production callers wrap a pre-loaded
 * Map of `(regionId, electionId) → RegionResult` in a closure.
 *
 * Phase 3 first cut supports:
 *   - chip with `who.party` → vote share for that party at the
 *     chip's election
 *   - chip with no `who` → turnout at the chip's election
 *   - numeric literals, operators (+ − × ÷), parentheses
 *
 * Not yet supported: candidate metric (fixtures don't have candidate
 * lists yet — see BACKLOG), `votes` metric (party-specific vote
 * counts; can be derived from `share × total` later).
 */

import { ELECTION_BY_ID, PARTY_BY_ID } from "../data/catalog";
import type {
  ChipFields,
  ElectionId,
  FormulaFraming,
  FormulaToken,
  RegionResult,
} from "../types/elections";

/* ─── Result types ──────────────────────────────────────────── */

export interface EvalSuccess {
  ok: true;
  value: number;
}
export interface EvalError {
  ok: false;
  error: string;
}
export type EvalResult = EvalSuccess | EvalError;

/** Synchronous lookup of pre-loaded RegionResults. Returns `null`
 *  when the (regionId, electionId) pair has no fixture data
 *  (e.g. future elections, partial loads). */
export type ResultLookup = (
  regionId: string,
  electionId: ElectionId,
) => RegionResult | null;

/* ─── Chip → election + value ───────────────────────────────── */

/** Resolve a chip's `(type, year, round?)` triple to an `ElectionId`
 *  matching the catalog (e.g. `"ek2023"`, `"pres2024r1"`). Returns
 *  `null` for chips with unbound selectors or incomplete slots. */
export function chipElectionId(fields: ChipFields): ElectionId | null {
  if (fields.selType || fields.selYear) return null;
  if (!fields.type || !fields.year) return null;
  if (fields.type === "pres") {
    return `pres${fields.year}r${fields.round ?? 1}` as ElectionId;
  }
  return `${fields.type}${fields.year}` as ElectionId;
}

/** Compute the numeric value contributed by a chip in one region.
 *  Returns `null` for unbound selectors, missing data, or unsupported
 *  metrics (candidate, votes-per-party). The evaluator surfaces the
 *  appropriate error for each case. */
export function chipValue(
  fields: ChipFields,
  regionId: string,
  lookup: ResultLookup,
): number | null {
  if (fields.selWho) return null;
  const electionId = chipElectionId(fields);
  if (!electionId) return null;
  const result = lookup(regionId, electionId);
  if (!result) return null;

  const who = fields.who;
  if (!who) {
    // No who → turnout metric (matches prototype's fallback)
    return result.turnout;
  }
  if ("party" in who) {
    return result.shares[who.party] ?? 0;
  }
  // who.candidate — Phase 3.x; signal as null so caller errors out
  return null;
}

/* ─── Evaluator (shunting-yard + RPN) ───────────────────────── */

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/** Run the formula against one region.
 *
 *  Algorithm preserved verbatim from `prototype/wf-map.jsx:178` —
 *  same precedence rules, same adjacency error messages, same
 *  division-by-zero handling (returns 0 to avoid NaN propagation
 *  that would render as a missing color). */
export function evalFormula(
  tokens: FormulaToken[],
  regionId: string,
  lookup: ResultLookup,
): EvalResult {
  if (!tokens || tokens.length === 0) return { ok: false, error: "empty formula" };

  type RpnItem = number | "+" | "-" | "*" | "/";
  const out: RpnItem[] = [];
  const stack: string[] = [];
  let prev: "val" | "op" | "lp" | "rp" | null = null;

  for (const t of tokens) {
    if (t.kind === "num") {
      if (prev === "val" || prev === "rp") return { ok: false, error: "two values in a row" };
      out.push(t.value);
      prev = "val";
    } else if (t.kind === "chip") {
      if (prev === "val" || prev === "rp") return { ok: false, error: "two values in a row" };
      // Detect specific failure modes for clearer error messages.
      const f = t.fields;
      if (f.selType || f.selYear || f.selWho) {
        return { ok: false, error: "unbound selector" };
      }
      if (f.who && "candidate" in f.who) {
        return { ok: false, error: "candidate metric not yet supported" };
      }
      const v = chipValue(f, regionId, lookup);
      if (v === null) return { ok: false, error: "no data for chip" };
      out.push(v);
      prev = "val";
    } else if (t.kind === "op") {
      if (prev !== "val" && prev !== "rp") {
        return { ok: false, error: "operator needs a value before it" };
      }
      const top = (): string | undefined => stack[stack.length - 1];
      while (stack.length > 0 && top() !== "(" && (PREC[top()!] ?? 0) >= PREC[t.value]!) {
        out.push(stack.pop() as RpnItem);
      }
      stack.push(t.value);
      prev = "op";
    } else {
      // paren
      if (t.value === "(") {
        if (prev === "val" || prev === "rp") return { ok: false, error: "missing operator before (" };
        stack.push("(");
        prev = "lp";
      } else {
        if (prev !== "val" && prev !== "rp") return { ok: false, error: "empty parentheses" };
        while (stack.length > 0 && stack[stack.length - 1] !== "(") {
          out.push(stack.pop() as RpnItem);
        }
        if (stack.length === 0) return { ok: false, error: "mismatched )" };
        stack.pop();
        prev = "rp";
      }
    }
  }

  if (prev === "op") return { ok: false, error: "formula ends on an operator" };

  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top === "(" || top === ")") return { ok: false, error: "mismatched (" };
    out.push(top as RpnItem);
  }

  // RPN eval
  const s: number[] = [];
  for (const x of out) {
    if (typeof x === "number") {
      s.push(x);
      continue;
    }
    const b = s.pop();
    const a = s.pop();
    if (a === undefined || b === undefined) return { ok: false, error: "not enough operands" };
    if (x === "+") s.push(a + b);
    else if (x === "-") s.push(a - b);
    else if (x === "*") s.push(a * b);
    else if (x === "/") s.push(b === 0 ? 0 : a / b);
  }

  if (s.length !== 1) return { ok: false, error: "invalid formula" };
  return { ok: true, value: s[0]! };
}

/* ─── Framing ───────────────────────────────────────────────── */

interface Entry {
  id: string;
  v: number;
}

/** Re-scale a list of evaluated values according to the framing
 *  mode. Pure — no side effects. */
export function applyFraming(
  entries: Entry[],
  framing: FormulaFraming,
  framingRef: string | null = null,
): Entry[] {
  if (framing === "absolute") return entries;
  if (framing === "share") {
    const sum = entries.reduce((acc, e) => acc + e.v, 0);
    if (sum === 0) return entries.map((e) => ({ ...e, v: 0 }));
    return entries.map((e) => ({ ...e, v: (e.v / sum) * 100 }));
  }
  // vsSelected
  const ref = framingRef ? entries.find((e) => e.id === framingRef) : null;
  const base = ref ? ref.v : 0;
  if (base === 0) return entries.map((e) => ({ ...e, v: 0 }));
  return entries.map((e) => ({ ...e, v: ((e.v - base) / Math.abs(base)) * 100 }));
}

/** Evaluate the formula across a list of regions, returning framed
 *  `(id, value)` pairs. Regions whose evaluation errors are silently
 *  excluded — the caller can detect them by comparing input vs.
 *  output length. */
export function evalAcrossRegions(
  tokens: FormulaToken[],
  regionIds: string[],
  lookup: ResultLookup,
  framing: FormulaFraming = "absolute",
  framingRef: string | null = null,
): Entry[] {
  const raw: Entry[] = [];
  for (const id of regionIds) {
    const r = evalFormula(tokens, id, lookup);
    if (r.ok) raw.push({ id, v: r.value });
  }
  return applyFraming(raw, framing, framingRef);
}

/** Min/max of formula values across a region set, optionally framed.
 *  Returns `null` if no region successfully evaluates. */
export function formulaRange(
  tokens: FormulaToken[],
  regionIds: string[],
  lookup: ResultLookup,
  framing: FormulaFraming = "absolute",
  framingRef: string | null = null,
): { min: number; max: number } | null {
  const entries = evalAcrossRegions(tokens, regionIds, lookup, framing, framingRef);
  if (entries.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const e of entries) {
    if (e.v < min) min = e.v;
    if (e.v > max) max = e.v;
  }
  if (!isFinite(min) || !isFinite(max)) return null;
  return { min, max };
}

/* ─── Token labels (for chips, summaries, button text) ──────── */

/** Human-readable label for one token — short enough for a chip
 *  pill but specific enough to disambiguate similar formulas. */
export function formulaTokenLabel(t: FormulaToken): string {
  if (t.kind === "num") return String(t.value);
  if (t.kind === "op") return t.value;
  if (t.kind === "paren") return t.value;

  // chip
  const f = t.fields;
  const electionId = chipElectionId(f);
  const electionLabel = electionId
    ? ELECTION_BY_ID[electionId]?.shortLabel ?? electionId
    : f.selType || f.selYear
      ? "?"
      : "?";

  let who = "";
  if (f.selWho) who = `$${f.selWho}`;
  else if (f.who) {
    if ("party" in f.who) {
      who = PARTY_BY_ID[f.who.party]?.abbr ?? f.who.party;
    } else if ("candidate" in f.who) {
      // Last name only, matches prototype convention
      const last = f.who.candidate.name.split(" ").slice(-1)[0] ?? f.who.candidate.name;
      who = `${last} c`;
    }
  }
  // Match prototype's compact format: "<who> <metric> (<election>)"
  const metric = f.who ? "%" : "t";
  return who ? `${who} ${metric} (${electionLabel})` : `${metric} (${electionLabel})`;
}

/** Concatenated label for a whole formula, e.g.
 *  `"KOK % (EK 2023) − KOK % (EK 2019)"`. Used for workflow pill
 *  subtitles and the auto-generated default name in the builder. */
export function formulaSummary(tokens: FormulaToken[]): string {
  if (!tokens || tokens.length === 0) return "empty formula";
  return tokens.map(formulaTokenLabel).join(" ");
}

/* ─── Selector binding resolution ────────────────────────────── */

import type { Binding } from "../types/elections";

/** Walk a token list and replace every selector slot with its
 *  bound value. Selectors that are still unbound stay as
 *  selectors, so the evaluator can produce a clear "unbound
 *  selector" error rather than silently returning 0. */
export function resolveFormulaTokens(
  tokens: FormulaToken[],
  bindings: Record<string, Binding>,
): FormulaToken[] {
  return tokens.map((t) => {
    if (t.kind !== "chip") return t;
    const f: ChipFields = { ...t.fields };

    if (f.selType) {
      const b = bindings[f.selType];
      if (b?.type) {
        f.type = b.type;
        delete f.selType;
      }
    }
    if (f.selYear) {
      const b = bindings[f.selYear];
      if (b?.year) {
        f.year = b.year;
        if (b.round) f.round = b.round;
        delete f.selYear;
      }
    }
    if (f.selWho) {
      const b = bindings[f.selWho];
      if (b?.who) {
        f.who = b.who;
        delete f.selWho;
      }
    }

    return { kind: "chip", fields: f };
  });
}

/** Find every distinct selector slot in a token list, in order of
 *  first appearance. Used by the param-row binding picker. */
export function listSelectors(
  tokens: FormulaToken[],
): Array<{ name: string; slot: "type" | "year" | "who" }> {
  const seen = new Map<string, "type" | "year" | "who">();
  for (const t of tokens) {
    if (t.kind !== "chip") continue;
    const f = t.fields;
    if (f.selType && !seen.has(f.selType)) seen.set(f.selType, "type");
    if (f.selYear && !seen.has(f.selYear)) seen.set(f.selYear, "year");
    if (f.selWho && !seen.has(f.selWho)) seen.set(f.selWho, "who");
  }
  return [...seen.entries()].map(([name, slot]) => ({ name, slot }));
}
