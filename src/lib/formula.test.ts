import { describe, expect, it } from "vitest";

import type {
  ChipFields,
  FormulaToken,
  RegionResult,
} from "../types/elections";

import {
  applyFraming,
  chipElectionId,
  chipValue,
  evalAcrossRegions,
  evalFormula,
  formulaRange,
  formulaSummary,
  formulaTokenLabel,
  type ResultLookup,
} from "./formula";

/* ─── Test fixtures ─────────────────────────────────────────── */

function row(
  regionId: string,
  electionId: string,
  shares: Record<string, number>,
  votes = 100_000,
  turnout = 70,
): RegionResult {
  return {
    regionId,
    electionId,
    votes,
    voters: Math.round(votes / (turnout / 100)),
    turnout,
    shares,
  };
}

const HEL_2023 = row("01", "ek2023", { kok: 26.4, sdp: 20.9, ps: 11.3, vihr: 15.3 });
const UUS_2023 = row("02", "ek2023", { kok: 26.2, sdp: 19.9, ps: 18.2, vihr: 7.6 });
const HEL_2019 = row("01", "ek2019", { kok: 22.0, sdp: 19.0, ps: 8.0, vihr: 23.0 });
const UUS_2019 = row("02", "ek2019", { kok: 23.0, sdp: 18.0, ps: 14.0, vihr: 13.0 });

const TABLE: Record<string, RegionResult> = {
  "01__ek2023": HEL_2023,
  "02__ek2023": UUS_2023,
  "01__ek2019": HEL_2019,
  "02__ek2019": UUS_2019,
};

const lookup: ResultLookup = (regionId, electionId) =>
  TABLE[`${regionId}__${electionId}`] ?? null;

/* ─── chipElectionId ────────────────────────────────────────── */

describe("chipElectionId", () => {
  it("formats parliamentary as ek<year>", () => {
    expect(chipElectionId({ type: "ek", year: 2023 })).toBe("ek2023");
  });

  it("formats presidential with round suffix", () => {
    expect(chipElectionId({ type: "pres", year: 2024, round: 1 })).toBe("pres2024r1");
    expect(chipElectionId({ type: "pres", year: 2024, round: 2 })).toBe("pres2024r2");
  });

  it("defaults to round 1 when no round given for presidential", () => {
    expect(chipElectionId({ type: "pres", year: 2024 })).toBe("pres2024r1");
  });

  it("returns null for unbound selectors and incomplete slots", () => {
    expect(chipElectionId({ selType: "A", year: 2023 })).toBeNull();
    expect(chipElectionId({ type: "ek", selYear: "B" })).toBeNull();
    expect(chipElectionId({ type: "ek" })).toBeNull();
    expect(chipElectionId({ year: 2023 })).toBeNull();
    expect(chipElectionId({})).toBeNull();
  });
});

/* ─── chipValue ─────────────────────────────────────────────── */

describe("chipValue", () => {
  it("returns the party share when chip has who.party", () => {
    expect(
      chipValue({ type: "ek", year: 2023, who: { party: "kok" } }, "01", lookup),
    ).toBe(26.4);
  });

  it("returns turnout when chip has no who", () => {
    expect(chipValue({ type: "ek", year: 2023 }, "01", lookup)).toBe(70);
  });

  it("returns 0 (not null) for parties absent from the result", () => {
    expect(
      chipValue({ type: "ek", year: 2023, who: { party: "rkp" } }, "01", lookup),
    ).toBe(0);
  });

  it("returns null for unbound selectors", () => {
    expect(
      chipValue({ selType: "A", year: 2023, who: { party: "kok" } }, "01", lookup),
    ).toBeNull();
    expect(
      chipValue({ type: "ek", year: 2023, selWho: "C" }, "01", lookup),
    ).toBeNull();
  });

  it("returns null when the (region, election) pair has no data", () => {
    expect(
      chipValue({ type: "ek", year: 2027, who: { party: "kok" } }, "01", lookup),
    ).toBeNull();
  });

  it("returns null for candidate metric (Phase 3.x)", () => {
    expect(
      chipValue(
        {
          type: "ek",
          year: 2023,
          who: {
            candidate: { id: "x1", name: "Anna Test", party: "kok" },
          },
        },
        "01",
        lookup,
      ),
    ).toBeNull();
  });
});

/* ─── evalFormula ───────────────────────────────────────────── */

const chipKok2023: FormulaToken = {
  kind: "chip",
  fields: { type: "ek", year: 2023, who: { party: "kok" } },
};
const chipKok2019: FormulaToken = {
  kind: "chip",
  fields: { type: "ek", year: 2019, who: { party: "kok" } },
};
const minus: FormulaToken = { kind: "op", value: "-" };
const plus: FormulaToken = { kind: "op", value: "+" };
const times: FormulaToken = { kind: "op", value: "*" };
const divide: FormulaToken = { kind: "op", value: "/" };
const lparen: FormulaToken = { kind: "paren", value: "(" };
const rparen: FormulaToken = { kind: "paren", value: ")" };
const num = (v: number): FormulaToken => ({ kind: "num", value: v });

describe("evalFormula — happy paths", () => {
  it("evaluates a single chip", () => {
    expect(evalFormula([chipKok2023], "01", lookup)).toEqual({ ok: true, value: 26.4 });
  });

  it("evaluates a literal", () => {
    expect(evalFormula([num(42)], "01", lookup)).toEqual({ ok: true, value: 42 });
  });

  it("computes change in support: KOK 2023 − KOK 2019 in Helsinki", () => {
    const r = evalFormula([chipKok2023, minus, chipKok2019], "01", lookup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(26.4 - 22.0, 5);
  });

  it("respects operator precedence (1 + 2 * 3 = 7, not 9)", () => {
    const r = evalFormula([num(1), plus, num(2), times, num(3)], "01", lookup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(7);
  });

  it("respects parentheses ((1 + 2) * 3 = 9)", () => {
    const r = evalFormula(
      [lparen, num(1), plus, num(2), rparen, times, num(3)],
      "01",
      lookup,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(9);
  });

  it("treats division by zero as 0 (no NaN propagation)", () => {
    const r = evalFormula([num(10), divide, num(0)], "01", lookup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(0);
  });
});

describe("evalFormula — error paths", () => {
  it("rejects an empty token list", () => {
    expect(evalFormula([], "01", lookup)).toEqual({
      ok: false,
      error: "empty formula",
    });
  });

  it("rejects two values in a row", () => {
    const r = evalFormula([num(1), num(2)], "01", lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("two values in a row");
  });

  it("rejects a trailing operator", () => {
    const r = evalFormula([num(1), plus], "01", lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("formula ends on an operator");
  });

  it("rejects a leading operator", () => {
    const r = evalFormula([plus, num(1)], "01", lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/value before/);
  });

  it("rejects mismatched parentheses", () => {
    const r1 = evalFormula([lparen, num(1)], "01", lookup);
    expect(r1.ok).toBe(false);
    const r2 = evalFormula([num(1), rparen], "01", lookup);
    expect(r2.ok).toBe(false);
  });

  it("rejects empty parentheses", () => {
    const r = evalFormula([lparen, rparen], "01", lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("empty parentheses");
  });

  it("surfaces unbound selectors with a clear message", () => {
    const chip: FormulaToken = {
      kind: "chip",
      fields: { selType: "A", year: 2023, who: { party: "kok" } },
    };
    const r = evalFormula([chip], "01", lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("unbound selector");
  });

  it("surfaces no-data errors for missing fixtures", () => {
    const chip: FormulaToken = {
      kind: "chip",
      fields: { type: "ek", year: 2027, who: { party: "kok" } },
    };
    const r = evalFormula([chip], "01", lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("no data for chip");
  });

  it("rejects candidate metric chips", () => {
    const chip: FormulaToken = {
      kind: "chip",
      fields: {
        type: "ek",
        year: 2023,
        who: { candidate: { id: "x", name: "A B", party: "kok" } },
      },
    };
    const r = evalFormula([chip], "01", lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/candidate metric/);
  });
});

/* ─── applyFraming ──────────────────────────────────────────── */

describe("applyFraming", () => {
  const entries = [
    { id: "01", v: 10 },
    { id: "02", v: 30 },
    { id: "03", v: 60 },
  ];

  it("absolute mode is identity", () => {
    expect(applyFraming(entries, "absolute")).toEqual(entries);
  });

  it("share mode normalizes to percentages summing to 100", () => {
    const out = applyFraming(entries, "share");
    expect(out.map((e) => e.v)).toEqual([10, 30, 60]);
    const sum = out.reduce((s, e) => s + e.v, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it("vsSelected expresses each entry as % difference from the ref", () => {
    const out = applyFraming(entries, "vsSelected", "02");
    // ref = 30; (10-30)/30*100 = -66.67; (30-30)/30*100 = 0; (60-30)/30*100 = 100
    expect(out[0]!.v).toBeCloseTo(-66.67, 1);
    expect(out[1]!.v).toBeCloseTo(0, 5);
    expect(out[2]!.v).toBeCloseTo(100, 5);
  });

  it("vsSelected returns zeros when ref is missing or zero", () => {
    const all0 = applyFraming([{ id: "x", v: 5 }], "vsSelected", "y");
    expect(all0[0]!.v).toBe(0);
    const refZero = applyFraming([{ id: "z", v: 0 }, { id: "w", v: 5 }], "vsSelected", "z");
    expect(refZero.every((e) => e.v === 0)).toBe(true);
  });
});

/* ─── evalAcrossRegions + formulaRange ───────────────────────── */

describe("evalAcrossRegions", () => {
  it("evaluates over a region list and silently drops errors", () => {
    // ek2027 has no data → those entries are dropped.
    const chip2027: FormulaToken = {
      kind: "chip",
      fields: { type: "ek", year: 2027, who: { party: "kok" } },
    };
    const out = evalAcrossRegions([chip2027], ["01", "02"], lookup);
    expect(out).toEqual([]);
  });

  it("returns one entry per successful region", () => {
    const out = evalAcrossRegions([chipKok2023], ["01", "02"], lookup);
    expect(out).toEqual([
      { id: "01", v: 26.4 },
      { id: "02", v: 26.2 },
    ]);
  });
});

describe("formulaRange", () => {
  it("returns min/max across regions", () => {
    expect(formulaRange([chipKok2023], ["01", "02"], lookup)).toEqual({
      min: 26.2,
      max: 26.4,
    });
  });

  it("returns null when no region evaluates successfully", () => {
    const chip2027: FormulaToken = {
      kind: "chip",
      fields: { type: "ek", year: 2027, who: { party: "kok" } },
    };
    expect(formulaRange([chip2027], ["01", "02"], lookup)).toBeNull();
  });

  it("respects framing — share normalizes range across visible regions", () => {
    // Two regions, kok shares 26.4 + 26.2 = 52.6. Each entry's "share" of that
    // total: 26.4/52.6*100 ≈ 50.19, 26.2/52.6*100 ≈ 49.81
    const r = formulaRange([chipKok2023], ["01", "02"], lookup, "share");
    expect(r).not.toBeNull();
    if (r) {
      expect(r.min).toBeCloseTo(49.81, 1);
      expect(r.max).toBeCloseTo(50.19, 1);
    }
  });
});

/* ─── formulaTokenLabel + formulaSummary ────────────────────── */

describe("formulaTokenLabel + formulaSummary", () => {
  it("formats a chip with a known election + party", () => {
    expect(formulaTokenLabel(chipKok2023)).toBe("Kok % (EK 2023)");
  });

  it("formats numeric and operator tokens as their literal text", () => {
    expect(formulaTokenLabel(num(42))).toBe("42");
    expect(formulaTokenLabel(plus)).toBe("+");
    expect(formulaTokenLabel(rparen)).toBe(")");
  });

  it("renders selector slots with $-prefixed names", () => {
    const chip: FormulaToken = {
      kind: "chip",
      fields: { type: "ek", year: 2023, selWho: "A" },
    };
    expect(formulaTokenLabel(chip)).toContain("$A");
  });

  it("formulaSummary joins token labels with single spaces", () => {
    expect(formulaSummary([chipKok2023, minus, chipKok2019])).toBe(
      "Kok % (EK 2023) - Kok % (EK 2019)",
    );
  });

  it("handles an empty token list", () => {
    expect(formulaSummary([])).toBe("empty formula");
  });
});

/* ─── ChipFields type-shape sanity ──────────────────────────── */

describe("ChipFields type sanity", () => {
  it("compiles with all combinations the formula composer can produce", () => {
    const cases: ChipFields[] = [
      { type: "ek", year: 2023, who: { party: "kok" } },
      { type: "pres", year: 2024, round: 2, who: { party: "kok" } },
      { selType: "A", selYear: "B", selWho: "C" },
      { type: "ek", year: 2023 }, // turnout
      {
        type: "ek",
        year: 2023,
        who: { candidate: { id: "x", name: "A", party: "kok" } },
      },
    ];
    expect(cases.length).toBe(5);
  });
});
