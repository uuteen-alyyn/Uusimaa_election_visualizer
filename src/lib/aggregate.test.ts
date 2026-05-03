import { describe, expect, it } from "vitest";

import { aggregateRegions } from "./aggregate";
import type { RegionResult } from "../types/elections";

function row(
  regionId: string,
  votes: number,
  voters: number,
  shares: Record<string, number>,
): RegionResult {
  return {
    regionId,
    electionId: "ek2023",
    votes,
    voters,
    turnout: voters > 0 ? (votes / voters) * 100 : 0,
    shares,
  };
}

describe("aggregateRegions", () => {
  it("returns a zero-row when given no rows", () => {
    const r = aggregateRegions([], { regionId: "x", electionId: "ek2023" });
    expect(r.votes).toBe(0);
    expect(r.voters).toBe(0);
    expect(r.turnout).toBe(0);
    expect(r.shares).toEqual({});
  });

  it("sums votes and voters", () => {
    const r = aggregateRegions(
      [row("a", 100, 200, {}), row("b", 150, 300, {})],
      { regionId: "agg", electionId: "ek2023" },
    );
    expect(r.votes).toBe(250);
    expect(r.voters).toBe(500);
    expect(r.turnout).toBe(50); // 250 / 500 * 100
  });

  it("computes a weighted-mean party share, not a simple arithmetic mean", () => {
    // Region A: 100 votes, KOK 30% → 30 KOK votes
    // Region B: 900 votes, KOK 10% → 90 KOK votes
    // Weighted: (30 + 90) / (100 + 900) = 120 / 1000 = 12%
    // Naive average would be (30 + 10) / 2 = 20% — wrong.
    const r = aggregateRegions(
      [
        row("a", 100, 200, { kok: 30 }),
        row("b", 900, 1800, { kok: 10 }),
      ],
      { regionId: "agg", electionId: "ek2023" },
    );
    expect(r.shares.kok).toBeCloseTo(12, 5);
  });

  it("preserves all parties seen in any input row", () => {
    const r = aggregateRegions(
      [
        row("a", 100, 200, { kok: 30, sdp: 20 }),
        row("b", 100, 200, { kok: 25, vihr: 15 }),
      ],
      { regionId: "agg", electionId: "ek2023" },
    );
    expect(Object.keys(r.shares).sort()).toEqual(["kok", "sdp", "vihr"]);
  });

  it("aggregate's own regionId / electionId come from the options", () => {
    const r = aggregateRegions(
      [row("a", 100, 200, { kok: 30 })],
      { regionId: "suomi", electionId: "ek2023" },
    );
    expect(r.regionId).toBe("suomi");
    expect(r.electionId).toBe("ek2023");
  });

  it("zero-vote rows don't crash share computation", () => {
    const r = aggregateRegions(
      [row("a", 0, 0, { kok: 100 }), row("b", 100, 200, { kok: 30 })],
      { regionId: "agg", electionId: "ek2023" },
    );
    // Only region B contributes; KOK = 30 votes / 100 total = 30%
    expect(r.shares.kok).toBeCloseTo(30, 5);
  });
});
