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

/** Fallback / loading / no-data fill (ink-light cream). Matches the
 *  prototype's `#eae3cf` neutral. */
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
  if (!result) return NEUTRAL_FILL;

  switch (mode) {
    case "winner":
      return winnerFill(result);
    case "support":
      return supportFill(result, options.focusParty ?? null);
    case "votes":
      return votesFill(result);
    case "change":
      return changeFill(result, options.refResult ?? null, options.focusParty ?? null);
    case "formula":
      // Phase 3: wire through formula.ts (range + framing).
      return NEUTRAL_FILL;
  }
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

/** Single-hue cream→blue ramp thresholds — preserved from prototype. */
function supportFill(result: RegionResult, focusParty: PartyId | null): string {
  const v = focusParty
    ? (result.shares[focusParty] ?? 0)
    : Math.max(0, ...Object.values(result.shares).filter((x): x is number => x != null));
  if (v < 10) return "var(--ramp-support-1)";
  if (v < 17) return "var(--ramp-support-2)";
  if (v < 23) return "var(--ramp-support-3)";
  if (v < 30) return "var(--ramp-support-4)";
  if (v < 38) return "var(--ramp-support-5)";
  return "var(--ramp-support-6)";
}

/* ─── Mode: total votes (cream→ochre) ───────────────────────── */

function votesFill(result: RegionResult): string {
  const v = result.votes;
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

/** Diverging ramp thresholds — preserved from prototype.
 *  Colorblind-safe: purple (loss) ↔ cream ↔ orange (gain). */
function changeFill(
  current: RegionResult,
  ref: RegionResult | null,
  focusParty: PartyId | null,
): string {
  if (!ref || !focusParty) return NEUTRAL_FILL;
  const v = pointChange(current, ref, focusParty);
  if (v == null) return NEUTRAL_FILL;
  if (v <= -4) return "var(--ramp-change-1)";
  if (v <= -1.5) return "var(--ramp-change-2)";
  if (v <= 1.5) return "var(--ramp-change-3)";
  if (v <= 4) return "var(--ramp-change-4)";
  return "var(--ramp-change-5)";
}
