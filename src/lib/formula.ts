/**
 * Formula evaluator — port of `prototype/wf-map.jsx:178` (evalFormula)
 * with surrounding helpers from the same file.
 *
 * Replaces the prototype's synthetic-data closure (`regionData(id)`)
 * with a caller-supplied synchronous lookup, so the evaluator stays
 * pure and is easy to unit-test. Production callers wrap a pre-loaded
 * Map of `(regionId, electionId) → RegionResult` in a closure.
 *
 * Supported chip metrics:
 *   - `who.party`     → party's vote share % at the chip's election
 *   - `who.candidate` → candidate's vote share % (votes / total × 100)
 *   - no `who`        → turnout at the chip's election
 * Plus numeric literals, operators (+ − × ÷), parentheses.
 *
 * Candidate values rely on `RegionResult.candidates` being populated
 * by the build-time prefetch (top 90 per region). Candidates outside
 * the top 90 in a region resolve to `null` (no_data for that region).
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

/** Chip metric — controls whether `chipValue` returns share %
 *  (the default, matching the prototype's behaviour) or absolute
 *  vote counts. The framing layer in `evalAcrossRegions` decides
 *  which to use based on the active `FormulaFraming`. */
export type ChipMetric = "share" | "votes";

/** Compute the numeric value contributed by a chip in one region.
 *  Returns `null` for unbound selectors or missing data. */
export function chipValue(
  fields: ChipFields,
  regionId: string,
  lookup: ResultLookup,
  metric: ChipMetric = "share",
): number | null {
  if (fields.selWho) return null;
  const electionId = chipElectionId(fields);
  if (!electionId) return null;
  const result = lookup(regionId, electionId);
  if (!result) return null;

  const who = fields.who;

  if (metric === "votes") {
    if (!who) {
      // No `who` → "this region's votes" — same value the votes-mode
      // workflow uses when no focus party is set. Useful for things
      // like raw turnout count.
      return result.votes;
    }
    if ("party" in who) {
      const share = result.shares[who.party] ?? 0;
      return Math.round((result.votes * share) / 100);
    }
    // candidate — return the absolute candidate vote count.
    const cand = result.candidates?.find((c) => c.id === who.candidate.id);
    if (!cand) return null;
    return cand.votes;
  }

  // metric === "share"
  if (!who) {
    return result.turnout;
  }
  if ("party" in who) {
    return result.shares[who.party] ?? 0;
  }
  // who.candidate — return the candidate's vote share as a percentage.
  // The fixture's `candidates` array is the top-N for that region;
  // candidates outside the top fall through to no-data.
  const cand = result.candidates?.find((c) => c.id === who.candidate.id);
  if (!cand) return null;
  return result.votes > 0 ? (cand.votes / result.votes) * 100 : 0;
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
  metric: ChipMetric = "share",
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
      const v = chipValue(f, regionId, lookup, metric);
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
 *  mode. Pure — no side effects.
 *
 *  `absVotes` and `absolute` differ only in chip metric (caller
 *  picks `"votes"` vs `"share"`); both leave evaluator output
 *  alone. `share` rescales to a region's % of the visible total;
 *  `vsSelected` rescales as a relative change vs the selected
 *  region. */
export function applyFraming(
  entries: Entry[],
  framing: FormulaFraming,
  framingRef: string | null = null,
): Entry[] {
  if (framing === "absolute" || framing === "absVotes") return entries;
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

/** Map a framing to the chip metric it expects. `absVotes` needs
 *  the chip evaluator to return raw vote counts; everything else
 *  uses share %. */
export function metricForFraming(framing: FormulaFraming): ChipMetric {
  return framing === "absVotes" ? "votes" : "share";
}

/** Evaluate the formula across a list of regions, returning framed
 *  `(id, value)` pairs. Regions whose evaluation errors are silently
 *  excluded — the caller can detect them by comparing input vs.
 *  output length. The chip metric ("share" vs "votes") is derived
 *  from the framing. */
export function evalAcrossRegions(
  tokens: FormulaToken[],
  regionIds: string[],
  lookup: ResultLookup,
  framing: FormulaFraming = "absolute",
  framingRef: string | null = null,
): Entry[] {
  const metric = metricForFraming(framing);
  const raw: Entry[] = [];
  for (const id of regionIds) {
    const r = evalFormula(tokens, id, lookup, metric);
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
 *  first appearance. Used by the param-row binding picker.
 *
 *  `typeHint` carries the concrete type of any chip that contains the
 *  selector — when every chip referencing the selector shares the
 *  same type, the binding picker can filter year/who options to that
 *  type (e.g. a `$Y` referenced only in EU chips → list only EU
 *  years). When chips reference selectors with mixed/abstract types,
 *  typeHint is null and the picker shows everything. */
export function listSelectors(
  tokens: FormulaToken[],
): Array<{ name: string; slot: "type" | "year" | "who"; typeHint: import("../types/elections").ElectionTypeId | null }> {
  const slot = new Map<string, "type" | "year" | "who">();
  // Track the set of concrete types each selector co-occurs with;
  // emit a single typeHint only when all chips agree.
  const types = new Map<string, Set<string>>();
  const noteType = (name: string, t: import("../types/elections").ElectionTypeId | undefined): void => {
    if (!types.has(name)) types.set(name, new Set());
    if (t) types.get(name)!.add(t);
  };
  for (const t of tokens) {
    if (t.kind !== "chip") continue;
    const f = t.fields;
    if (f.selType && !slot.has(f.selType)) slot.set(f.selType, "type");
    if (f.selYear) {
      if (!slot.has(f.selYear)) slot.set(f.selYear, "year");
      noteType(f.selYear, f.type);
    }
    if (f.selWho) {
      if (!slot.has(f.selWho)) slot.set(f.selWho, "who");
      noteType(f.selWho, f.type);
    }
  }
  return [...slot.entries()].map(([name, s]) => {
    const ts = types.get(name);
    const typeHint =
      ts && ts.size === 1
        ? (ts.values().next().value as import("../types/elections").ElectionTypeId)
        : null;
    return { name, slot: s, typeHint };
  });
}
