import { describe, expect, it } from "vitest";

import type { RegionResult } from "../types/elections";

import {
  fillForRegion,
  NEUTRAL_FILL,
  pickWinner,
  pointChange,
} from "./color-ramps";

/** Build a `RegionResult` with sensible defaults so tests stay terse. */
function row(
  shares: Record<string, number>,
  votes = 100_000,
): RegionResult {
  return {
    regionId: "01",
    electionId: "ek2023",
    votes,
    voters: 0,
    turnout: 0,
    shares,
  };
}

/* ─── pickWinner ─────────────────────────────────────────────── */

describe("pickWinner", () => {
  it("returns the party with the largest share", () => {
    expect(pickWinner(row({ kok: 26, sdp: 20, ps: 18 }))).toBe("kok");
  });

  it("breaks ties alphabetically (deterministic)", () => {
    // Both 25; "kok" sorts before "sdp"
    expect(pickWinner(row({ sdp: 25, kok: 25 }))).toBe("kok");
  });

  it("returns null when all shares are zero", () => {
    expect(pickWinner(row({ kok: 0, sdp: 0 }))).toBeNull();
  });

  it("returns null for empty shares", () => {
    expect(pickWinner(row({}))).toBeNull();
  });
});

/* ─── fillForRegion: winner ─────────────────────────────────── */

describe("fillForRegion (winner)", () => {
  it("returns the winner's CSS variable", () => {
    expect(fillForRegion(row({ kok: 26, sdp: 20 }), "winner")).toBe(
      "var(--p-kok)",
    );
  });

  it("returns NEUTRAL_FILL on null result", () => {
    expect(fillForRegion(null, "winner")).toBe(NEUTRAL_FILL);
  });

  it("returns NEUTRAL_FILL when no party has any share", () => {
    expect(fillForRegion(row({}), "winner")).toBe(NEUTRAL_FILL);
  });
});

/* ─── fillForRegion: support ─────────────────────────────────── */

describe("fillForRegion (support)", () => {
  it("uses the focusParty share when one is given", () => {
    // Kok at 25 → ramp-support-4 (≥ 23 and < 30 → bucket 4)
    expect(
      fillForRegion(row({ kok: 25, sdp: 20 }), "support", { focusParty: "kok" }),
    ).toBe("var(--ramp-support-4)");
  });

  it("falls back to the largest share when focusParty is null (winner-relative)", () => {
    // Largest 26 → bucket 4
    expect(fillForRegion(row({ kok: 26, sdp: 20 }), "support", { focusParty: null })).toBe(
      "var(--ramp-support-4)",
    );
  });

  it("threshold boundaries: <10 → ramp 1, <17 → ramp 2, etc.", () => {
    const cases: Array<[number, string]> = [
      [0, "var(--ramp-support-1)"],
      [9.9, "var(--ramp-support-1)"],
      [10, "var(--ramp-support-2)"],
      [16.9, "var(--ramp-support-2)"],
      [17, "var(--ramp-support-3)"],
      [22.9, "var(--ramp-support-3)"],
      [23, "var(--ramp-support-4)"],
      [29.9, "var(--ramp-support-4)"],
      [30, "var(--ramp-support-5)"],
      [37.9, "var(--ramp-support-5)"],
      [38, "var(--ramp-support-6)"],
      [99, "var(--ramp-support-6)"],
    ];
    for (const [share, expected] of cases) {
      expect(
        fillForRegion(row({ kok: share }), "support", { focusParty: "kok" }),
      ).toBe(expected);
    }
  });

  it("treats a missing focusParty share as 0 (lowest ramp)", () => {
    expect(
      fillForRegion(row({ sdp: 20 }), "support", { focusParty: "kok" }),
    ).toBe("var(--ramp-support-1)");
  });
});

/* ─── fillForRegion: votes ──────────────────────────────────── */

describe("fillForRegion (votes)", () => {
  it("threshold boundaries: <20k, <50k, <100k, <200k, ≥200k", () => {
    const cases: Array<[number, string]> = [
      [0, "var(--ramp-votes-1)"],
      [19_999, "var(--ramp-votes-1)"],
      [20_000, "var(--ramp-votes-2)"],
      [49_999, "var(--ramp-votes-2)"],
      [50_000, "var(--ramp-votes-3)"],
      [99_999, "var(--ramp-votes-3)"],
      [100_000, "var(--ramp-votes-4)"],
      [199_999, "var(--ramp-votes-4)"],
      [200_000, "var(--ramp-votes-5)"],
      [565_306, "var(--ramp-votes-5)"], // Uusimaa 2023 actual
    ];
    for (const [votes, expected] of cases) {
      expect(fillForRegion(row({}, votes), "votes")).toBe(expected);
    }
  });
});

/* ─── pointChange + change mode ─────────────────────────────── */

describe("pointChange", () => {
  it("subtracts ref share from current share", () => {
    expect(pointChange(row({ kok: 28 }), row({ kok: 22 }), "kok")).toBe(6);
  });

  it("returns null when either side is missing the party", () => {
    expect(pointChange(row({ kok: 28 }), row({}), "kok")).toBeNull();
    expect(pointChange(row({}), row({ kok: 22 }), "kok")).toBeNull();
  });
});

describe("fillForRegion (change)", () => {
  const cur = row({ kok: 28 });
  const ref = row({ kok: 22 });

  it("threshold boundaries: ≤-4 → 1 (purple), ≤-1.5 → 2, ≤1.5 → 3 (cream), ≤4 → 4, >4 → 5 (orange)", () => {
    const cases: Array<[number, number, string]> = [
      [10, 30, "var(--ramp-change-1)"], // -20 → strong loss
      [22, 25, "var(--ramp-change-2)"], // -3
      [23.5, 23, "var(--ramp-change-3)"], // +0.5 (within ±1.5)
      [25, 23, "var(--ramp-change-4)"], // +2
      [30, 20, "var(--ramp-change-5)"], // +10 → strong gain
    ];
    for (const [a, b, expected] of cases) {
      expect(
        fillForRegion(row({ kok: a }), "change", {
          focusParty: "kok",
          refResult: row({ kok: b }),
        }),
      ).toBe(expected);
    }
  });

  it("returns NEUTRAL_FILL when refResult is missing", () => {
    expect(
      fillForRegion(cur, "change", { focusParty: "kok", refResult: null }),
    ).toBe(NEUTRAL_FILL);
  });

  it("returns NEUTRAL_FILL when focusParty is null (no party to compare)", () => {
    expect(fillForRegion(cur, "change", { focusParty: null, refResult: ref })).toBe(
      NEUTRAL_FILL,
    );
  });

  it("returns NEUTRAL_FILL when the party is missing from one side", () => {
    expect(
      fillForRegion(cur, "change", {
        focusParty: "kok",
        refResult: row({ sdp: 20 }),
      }),
    ).toBe(NEUTRAL_FILL);
  });
});

/* ─── fillForRegion: formula ───────────────────────────────── */

describe("fillForRegion (formula)", () => {
  it("returns NEUTRAL_FILL when value or range is missing", () => {
    expect(fillForRegion(null, "formula")).toBe(NEUTRAL_FILL);
    expect(fillForRegion(row({}), "formula")).toBe(NEUTRAL_FILL);
    expect(
      fillForRegion(row({}), "formula", {
        formulaValue: 5,
        formulaRange: null,
      }),
    ).toBe(NEUTRAL_FILL);
  });

  it("uses the diverging ramp when the range straddles zero", () => {
    const opts = { formulaValue: 5, formulaRange: { min: -10, max: 10 } };
    // t = 5 / 10 = 0.5; falls in 0.25 ≤ t < 0.66 → ramp-change-4
    expect(fillForRegion(row({}), "formula", opts)).toBe("var(--ramp-change-4)");
  });

  it("uses the single-hue ramp when the range is all positive", () => {
    const opts = { formulaValue: 50, formulaRange: { min: 0, max: 100 } };
    // t = (50 - 0) / 100 = 0.5; falls in 0.35 ≤ t < 0.55 → ramp-support-3
    expect(fillForRegion(row({}), "formula", opts)).toBe("var(--ramp-support-3)");
  });
});

/* ─── adaptive support range ───────────────────────────────── */

describe("fillForRegion (support, adaptive)", () => {
  // For Vihr at 2-15% across regions, fixed thresholds collapse
  // most regions into ramp-1. Adaptive should spread them.
  const range = { min: 2, max: 15 };

  it("scales the bucket boundaries to the supplied range", () => {
    // v = 2 (range min) → t = 0 → ramp-1
    expect(
      fillForRegion(row({ vihr: 2 }), "support", { focusParty: "vihr", supportRange: range }),
    ).toBe("var(--ramp-support-1)");
    // v = 15 (range max) → t = 1 → ramp-6
    expect(
      fillForRegion(row({ vihr: 15 }), "support", { focusParty: "vihr", supportRange: range }),
    ).toBe("var(--ramp-support-6)");
    // v = 8.5 (mid) → t = 0.5 → ramp-3 (0.35..0.55)
    expect(
      fillForRegion(row({ vihr: 8.5 }), "support", {
        focusParty: "vihr",
        supportRange: range,
      }),
    ).toBe("var(--ramp-support-3)");
  });

  it("falls back to fixed thresholds when range is null", () => {
    // v = 8.5 → fixed: < 10 → ramp-1
    expect(
      fillForRegion(row({ vihr: 8.5 }), "support", { focusParty: "vihr" }),
    ).toBe("var(--ramp-support-1)");
  });

  it("falls back when range is degenerate (single value)", () => {
    // Equal min/max isn't a useful range; expect the SAME bucket
    // for any input via the fallback path.
    const flat = { min: 5, max: 5 };
    expect(
      fillForRegion(row({ vihr: 5 }), "support", { focusParty: "vihr", supportRange: flat }),
    ).toBe(
      // Note: with span = 0 → 1 fallback in singleHueRamp, t = 0 → ramp-1
      "var(--ramp-support-1)",
    );
  });
});

/* ─── adaptive change range ────────────────────────────────── */

describe("fillForRegion (change, adaptive)", () => {
  // Vihr swings ±2pp typically; fixed ±4pp thresholds collapse
  // every region into the middle "no change" bucket. Adaptive
  // ramp scales to the actual data spread.
  const range = { min: -2, max: 2 };

  function changeOpts(refShare: number) {
    return {
      focusParty: "vihr" as const,
      refResult: row({ vihr: refShare }),
      changeRange: range,
    };
  }

  it("scales diverging buckets to the largest absolute swing", () => {
    // delta = -2 → t = -1 → ramp-change-1 (purple)
    expect(
      fillForRegion(row({ vihr: 0 }), "change", changeOpts(2)),
    ).toBe("var(--ramp-change-1)");
    // delta = +2 → t = +1 → ramp-change-5 (orange)
    expect(
      fillForRegion(row({ vihr: 4 }), "change", changeOpts(2)),
    ).toBe("var(--ramp-change-5)");
    // delta = 0 → t = 0 → ramp-change-3 (cream)
    expect(
      fillForRegion(row({ vihr: 2 }), "change", changeOpts(2)),
    ).toBe("var(--ramp-change-3)");
  });

  it("falls back to fixed ±4pp thresholds when range is null", () => {
    // delta = -2 → fixed: -2 ≤ -1.5 → ramp-2
    expect(
      fillForRegion(row({ vihr: 0 }), "change", {
        focusParty: "vihr",
        refResult: row({ vihr: 2 }),
      }),
    ).toBe("var(--ramp-change-2)");
  });
});
