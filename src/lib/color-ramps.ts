/**
 * Per-region fill colors for the four built-in workflows + a
 * formula-mode hook. Thresholds ported verbatim from
 * `prototype/wf-map.jsx:309` so the visual behaviour matches the
 * design reference.
 *
 * The prototype called `regionData(id)` for synthetic data inside
 * `fillForRegion`. Here the caller passes the real `RegionResult`
 * already loaded from `LocalFixtureSource`, so this module is a pure
 * function and easy to unit-test.
 *
 * The `formula` mode is only stubbed in Phase 2 — it returns the
 * neutral fill, since the formula evaluator + range-across-regions
 * computation lands in Phase 3 (`src/lib/formula.ts`). Once that's
 * in place, the formula branch wires through here unchanged.
 */

import type { PartyId, RegionResult, WorkflowKind } from "../types/elections";

/** Fill for regions whose fixture data is missing — references the
 *  `<pattern id="nodata-pattern">` defined in `HierarchyMap`. */
export const NODATA_FILL = "url(#nodata-pattern)";

/** Reserved cream colour for genuinely-neutral states (e.g. a
 *  formula whose value falls in the middle of the diverging
 *  ramp). Distinct from NODATA_FILL so the user can tell "real
 *  zero" apart from "missing data" at a glance. */
export const NEUTRAL_FILL = "#eae3cf";

/** Optional per-mode parameters passed alongside the row. */
export interface FillOptions {
  /** Set when mode ∈ {"support", "votes", "change"}. `null` is
   *  legal for "support" and means "color by the current winner's
   *  party" (the prototype's `winner-relative` shading). */
  focusParty?: PartyId | null;
  /** Reference election's `RegionResult` for the same region.
   *  Required only when mode === "change". */
  refResult?: RegionResult | null;
  /** Formula value for this region (already evaluated + framed by
   *  the caller). Required for `mode === "formula"`. */
  formulaValue?: number | null;
  /** Min/max of formula values across all visible regions, for
   *  diverging-vs-single-hue auto-pick + ramp scaling. Required
   *  for `mode === "formula"`. */
  formulaRange?: { min: number; max: number } | null;
  /** Min/max of focus-party shares across visible regions for
   *  adaptive `support` mode coloring. When omitted, fixed
   *  thresholds are used (tuned for the largest parties). */
  supportRange?: { min: number; max: number } | null;
  /** Min/max of percentage-point swings across visible regions
   *  for adaptive `change` mode coloring. When omitted, fixed
   *  ±4pp thresholds are used. */
  changeRange?: { min: number; max: number } | null;
  /** Min/max of total votes across visible regions for adaptive
   *  `votes` mode coloring. Without this, drilled-in views where
   *  one kunta dwarfs the rest (e.g. Oulu in Oulun vaalipiiri)
   *  collapse all small kuntat into the lightest fixed bucket. */
  votesRange?: { min: number; max: number } | null;
}

/** Determine the SVG fill for one region.
 *
 *  Returns `NEUTRAL_FILL` for `null` inputs or unsupported modes —
 *  callers should layer a `.nodata` crosshatch on top when there is
 *  truly no data for the region. */
export function fillForRegion(
  result: RegionResult | null,
  mode: WorkflowKind,
  options: FillOptions = {},
): string {
  // For non-formula modes, missing data → crosshatch. Formula mode
  // can still render a value (e.g. if the formula references a
  // different election that did load); the formulaFill helper
  // returns NEUTRAL_FILL on its own when the value is missing.
  if (mode !== "formula" && !result) return NODATA_FILL;

  switch (mode) {
    case "winner":
      return winnerFill(result!);
    case "support":
      return supportFill(
        result!,
        options.focusParty ?? null,
        options.supportRange ?? null,
      );
    case "votes":
      return votesFill(
        result!,
        options.focusParty ?? null,
        options.votesRange ?? null,
      );
    case "change": {
      // Change mode needs *both* current and ref data; otherwise
      // crosshatch tells the user the comparison is unavailable
      // for this region rather than misleading them with cream.
      if (!options.refResult || !options.focusParty) return NODATA_FILL;
      return changeFill(
        result!,
        options.refResult,
        options.focusParty,
        options.changeRange ?? null,
      );
    }
    case "formula":
      return formulaFill(options.formulaValue ?? null, options.formulaRange ?? null);
  }
}

/* ─── Mode: formula (auto-pick diverging vs single-hue) ─────── */

function formulaFill(
  value: number | null,
  range: { min: number; max: number } | null,
): string {
  if (value === null || range === null) return NEUTRAL_FILL;
  const { min, max } = range;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return NEUTRAL_FILL;

  // Diverging if the value range straddles 0 (e.g. change in
  // support); otherwise single-hue (e.g. raw % share).
  if (min < 0 && max > 0) {
    const bound = Math.max(Math.abs(min), Math.abs(max));
    const t = bound === 0 ? 0 : value / bound;
    if (t <= -0.66) return "var(--ramp-change-1)";
    if (t <= -0.25) return "var(--ramp-change-2)";
    if (t < 0.25) return "var(--ramp-change-3)";
    if (t < 0.66) return "var(--ramp-change-4)";
    return "var(--ramp-change-5)";
  }
  const span = max - min || 1;
  const t = (value - min) / span;
  if (t < 0.15) return "var(--ramp-support-1)";
  if (t < 0.35) return "var(--ramp-support-2)";
  if (t < 0.55) return "var(--ramp-support-3)";
  if (t < 0.75) return "var(--ramp-support-4)";
  if (t < 0.9) return "var(--ramp-support-5)";
  return "var(--ramp-support-6)";
}

/* ─── Mode: winner ──────────────────────────────────────────── */

/** Find the party with the largest share. Returns `null` if shares
 *  are empty / all zero. Stable (alphabetical tie-break) so the same
 *  region always picks the same winner. */
export function pickWinner(result: RegionResult): PartyId | null {
  let best: PartyId | null = null;
  let bestShare = -Infinity;
  for (const party of Object.keys(result.shares).sort()) {
    const share = result.shares[party];
    if (share != null && share > bestShare) {
      bestShare = share;
      best = party;
    }
  }
  return bestShare > 0 ? best : null;
}

function winnerFill(result: RegionResult): string {
  const winner = pickWinner(result);
  if (!winner) return NEUTRAL_FILL;
  return `var(--p-${winner})`;
}

/* ─── Mode: support % (single-hue ramp) ─────────────────────── */

/** Cream→blue single-hue ramp.
 *
 *  When a `range` is supplied (typically computed by the caller
 *  across all visible regions), buckets are evenly distributed
 *  within that range — important for small parties whose entire
 *  share range fits inside the prototype's lowest fixed bucket.
 *
 *  When `range` is null, falls back to the prototype's fixed
 *  thresholds (10/17/23/30/38) which are tuned for parties that
 *  typically exceed 10%. */
function supportFill(
  result: RegionResult,
  focusParty: PartyId | null,
  range: { min: number; max: number } | null,
): string {
  const v = focusParty
    ? (result.shares[focusParty] ?? 0)
    : Math.max(0, ...Object.values(result.shares).filter((x): x is number => x != null));

  if (range) return singleHueRamp(v, range);

  // Fixed-threshold fallback.
  if (v < 10) return "var(--ramp-support-1)";
  if (v < 17) return "var(--ramp-support-2)";
  if (v < 23) return "var(--ramp-support-3)";
  if (v < 30) return "var(--ramp-support-4)";
  if (v < 38) return "var(--ramp-support-5)";
  return "var(--ramp-support-6)";
}

/** Linear-bucket a value within `[range.min, range.max]` onto the
 *  6-step support ramp. Same step splits as the formula mode's
 *  single-hue branch (0.15 / 0.35 / 0.55 / 0.75 / 0.90). */
function singleHueRamp(v: number, range: { min: number; max: number }): string {
  const span = range.max - range.min || 1;
  const t = (v - range.min) / span;
  if (t < 0.15) return "var(--ramp-support-1)";
  if (t < 0.35) return "var(--ramp-support-2)";
  if (t < 0.55) return "var(--ramp-support-3)";
  if (t < 0.75) return "var(--ramp-support-4)";
  if (t < 0.9) return "var(--ramp-support-5)";
  return "var(--ramp-support-6)";
}

/* ─── Mode: total votes (cream→ochre) ───────────────────────── */

/** Cream→ochre ramp.
 *
 *  When a `range` is supplied, buckets are distributed in
 *  **log10 space** — population (and votes) is famously
 *  log-distributed (Zipf's law). Linear bucketing on raw votes
 *  collapses too aggressively when one outlier dominates the
 *  range (e.g. Oulu's 116K vs the next-biggest kunta at 18K
 *  in Oulun vp). Log spreads readers' attention sensibly:
 *  ~equal visual distance between Helsinki↔Uusimaa,
 *  Uusimaa↔Pirkanmaa, etc.
 *
 *  When `range` is null, falls back to fixed thresholds tuned
 *  for the parliamentary vp level (Ahvenanmaa ~12 000 →
 *  Uusimaa ~565 000). */
/** Resolve the value the votes ramp colors by:
 *
 *  - `focusParty` set → party-specific votes
 *    (`region.votes × shares[party] / 100`)
 *  - `focusParty` null → total votes
 *
 *  Exported so App's range computation uses the same value. */
export function votesValue(
  result: RegionResult,
  focusParty: PartyId | null,
): number {
  if (focusParty) {
    const share = result.shares[focusParty] ?? 0;
    return Math.round((result.votes * share) / 100);
  }
  return result.votes;
}

function votesFill(
  result: RegionResult,
  focusParty: PartyId | null,
  range: { min: number; max: number } | null,
): string {
  const v = votesValue(result, focusParty);
  if (range) {
    // Avoid log(0). Use max(1, …) — votes are always ≥ 0 in
    // practice; this guards against future no-data zeros.
    const logV = Math.log10(Math.max(1, v));
    const logMin = Math.log10(Math.max(1, range.min));
    const logMax = Math.log10(Math.max(1, range.max));
    const span = logMax - logMin || 1;
    const t = (logV - logMin) / span;
    if (t < 0.15) return "var(--ramp-votes-1)";
    if (t < 0.4) return "var(--ramp-votes-2)";
    if (t < 0.65) return "var(--ramp-votes-3)";
    if (t < 0.85) return "var(--ramp-votes-4)";
    return "var(--ramp-votes-5)";
  }
  // Fixed-threshold fallback.
  if (v < 20_000) return "var(--ramp-votes-1)";
  if (v < 50_000) return "var(--ramp-votes-2)";
  if (v < 100_000) return "var(--ramp-votes-3)";
  if (v < 200_000) return "var(--ramp-votes-4)";
  return "var(--ramp-votes-5)";
}

/* ─── Mode: change (purple↔orange diverging) ────────────────── */

/** Percentage-point change for one party between two elections.
 *  Returns `null` if either result is missing the party. */
export function pointChange(
  current: RegionResult,
  ref: RegionResult,
  party: PartyId,
): number | null {
  const a = current.shares[party];
  const b = ref.shares[party];
  if (a == null || b == null) return null;
  return a - b;
}

/** Diverging purple↔orange ramp.
 *
 *  When a `range` is supplied, buckets are scaled to the largest
 *  absolute swing in the visible region set — so for small parties
 *  whose typical swing is ±2pp the map still reads as a real
 *  gain/loss diverging palette rather than collapsing into the
 *  middle "no change" bucket.
 *
 *  When `range` is null, falls back to the prototype's ±4pp /
 *  ±1.5pp fixed thresholds. Colorblind-safe in either mode. */
function changeFill(
  current: RegionResult,
  ref: RegionResult | null,
  focusParty: PartyId | null,
  range: { min: number; max: number } | null,
): string {
  if (!ref || !focusParty) return NEUTRAL_FILL;
  const v = pointChange(current, ref, focusParty);
  if (v == null) return NEUTRAL_FILL;

  if (range) {
    const bound = Math.max(Math.abs(range.min), Math.abs(range.max));
    if (bound === 0) return "var(--ramp-change-3)";
    const t = v / bound; // -1..1
    if (t <= -0.66) return "var(--ramp-change-1)";
    if (t <= -0.25) return "var(--ramp-change-2)";
    if (t < 0.25) return "var(--ramp-change-3)";
    if (t < 0.66) return "var(--ramp-change-4)";
    return "var(--ramp-change-5)";
  }

  // Fixed-threshold fallback.
  if (v <= -4) return "var(--ramp-change-1)";
  if (v <= -1.5) return "var(--ramp-change-2)";
  if (v <= 1.5) return "var(--ramp-change-3)";
  if (v <= 4) return "var(--ramp-change-4)";
  return "var(--ramp-change-5)";
}
