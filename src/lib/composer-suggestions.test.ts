import { describe, expect, it } from "vitest";

import type { FormulaToken } from "../types/elections";

import {
  buildSuggestions,
  chipIsComplete,
  nextFieldFor,
  pickNextSelectorName,
  score,
  scoreOne,
  stripLastField,
  type SelectorRecord,
} from "./composer-suggestions";

/* ─── scoring ───────────────────────────────────────────────── */

describe("scoreOne", () => {
  it("scores exact match higher than prefix", () => {
    expect(scoreOne("kok", "kok")).toBeGreaterThan(scoreOne("kok", "kokoomus"));
  });
  it("scores prefix higher than infix", () => {
    expect(scoreOne("ko", "kokoomus")).toBeGreaterThan(scoreOne("ko", "perussuomalaiset"));
  });
  it("returns 0 for terms that don't appear at all", () => {
    expect(scoreOne("xyz", "kokoomus")).toBe(0);
  });
});

describe("score", () => {
  it("returns 1 (passthrough) for empty queries", () => {
    expect(score("", "anything")).toBe(1);
  });
  it("requires every term to match for multi-term queries", () => {
    expect(score("kok foo", "kokoomus")).toBe(0);
  });
});

/* ─── chip slot helpers ─────────────────────────────────────── */

describe("chipIsComplete", () => {
  it("is true for an op token", () => {
    expect(chipIsComplete({ kind: "op", value: "+" })).toBe(true);
  });
  it("requires all three slots to be filled (concrete or selector)", () => {
    const incomplete: FormulaToken = { kind: "chip", fields: { type: "ek" } };
    expect(chipIsComplete(incomplete)).toBe(false);
    const complete: FormulaToken = {
      kind: "chip",
      fields: { type: "ek", year: 2023, who: { party: "kok" } },
    };
    expect(chipIsComplete(complete)).toBe(true);
  });
  it("counts selectors as filled slots", () => {
    const sel: FormulaToken = {
      kind: "chip",
      fields: { selType: "A", selYear: "B", selWho: "C" },
    };
    expect(chipIsComplete(sel)).toBe(true);
  });
});

describe("nextFieldFor", () => {
  it("returns 'type' for null or non-chip", () => {
    expect(nextFieldFor(null)).toBe("type");
    expect(nextFieldFor({ kind: "op", value: "+" })).toBe("type");
  });
  it("walks slots in order: type → year → who → null", () => {
    expect(nextFieldFor({ kind: "chip", fields: {} })).toBe("type");
    expect(nextFieldFor({ kind: "chip", fields: { type: "ek" } })).toBe("year");
    expect(nextFieldFor({ kind: "chip", fields: { type: "ek", year: 2023 } })).toBe("who");
    expect(
      nextFieldFor({ kind: "chip", fields: { type: "ek", year: 2023, who: { party: "kok" } } }),
    ).toBeNull();
  });
});

describe("stripLastField", () => {
  it("removes who/selWho first", () => {
    const c: FormulaToken = {
      kind: "chip",
      fields: { type: "ek", year: 2023, who: { party: "kok" } },
    };
    const stripped = stripLastField(c);
    expect(stripped?.kind).toBe("chip");
    if (stripped?.kind === "chip") {
      expect(stripped.fields.who).toBeUndefined();
      expect(stripped.fields.year).toBe(2023);
    }
  });
  it("removes year/selYear/round when no who is present", () => {
    const c: FormulaToken = {
      kind: "chip",
      fields: { type: "pres", year: 2024, round: 2 },
    };
    const stripped = stripLastField(c);
    if (stripped?.kind === "chip") {
      expect(stripped.fields.year).toBeUndefined();
      expect(stripped.fields.round).toBeUndefined();
      expect(stripped.fields.type).toBe("pres");
    }
  });
  it("returns null when only the type slot remains", () => {
    const c: FormulaToken = { kind: "chip", fields: { type: "ek" } };
    expect(stripLastField(c)).toBeNull();
  });
  it("returns null for non-chip tokens", () => {
    expect(stripLastField({ kind: "num", value: 42 })).toBeNull();
  });
});

/* ─── selector naming ──────────────────────────────────────── */

describe("pickNextSelectorName", () => {
  it("returns A when no selectors are in use", () => {
    expect(pickNextSelectorName([])).toBe("A");
  });
  it("skips already-used names", () => {
    const used: SelectorRecord[] = [
      { name: "A", slot: "selType" },
      { name: "B", slot: "selYear" },
    ];
    expect(pickNextSelectorName(used)).toBe("C");
  });
});

/* ─── buildSuggestions ──────────────────────────────────────── */

describe("buildSuggestions — operator suggestions", () => {
  it("offers operators only when the active chip is complete or null", () => {
    const out = buildSuggestions("plus", null, null, []);
    const opIds = out.filter((s) => s.kind === "op").map((s) => s.id);
    expect(opIds).toContain("op-+");
  });

  it("recognises a literal '+' as an operator suggestion", () => {
    const out = buildSuggestions("+", null, null, []);
    const top = out[0];
    expect(top?.kind).toBe("op");
    if (top?.kind === "op") expect(top.op).toBe("+");
  });

  it("matches a numeric query as a num suggestion", () => {
    const out = buildSuggestions("42", null, null, []);
    const num = out.find((s) => s.kind === "num");
    expect(num).toBeDefined();
    if (num?.kind === "num") expect(num.num).toBe(42);
  });
});

describe("buildSuggestions — type slot", () => {
  it("ranks 'eduskuntavaalit' as the top hit for 'eduskunta'", () => {
    const out = buildSuggestions("eduskunta", "type", null, []);
    expect(out[0]?.id).toBe("type-ek");
  });

  it("offers a selector suggestion when query is empty", () => {
    const out = buildSuggestions("", "type", null, []);
    expect(out.some((s) => s.kind === "selector")).toBe(true);
  });
});

describe("buildSuggestions — year slot", () => {
  it("filters years by the chip's already-chosen type", () => {
    const chip: FormulaToken = { kind: "chip", fields: { type: "kunta" } };
    const out = buildSuggestions("", "year", chip, []);
    const yearIds = out
      .filter((s) => s.kind === "year")
      .map((s) => s.id);
    // Only kunta years should be present
    expect(yearIds.every((id) => id.startsWith("yr-kunta"))).toBe(true);
  });

  it("for presidential, includes round suffix in the label", () => {
    const chip: FormulaToken = { kind: "chip", fields: { type: "pres" } };
    const out = buildSuggestions("2024", "year", chip, []);
    const presLabels = out
      .filter((s) => s.kind === "year")
      .map((s) => s.label);
    // Round disambiguator is the Roman numeral "I" / "II" — both
    // pres 2024 entries (r1 and r2) should be present and labelled.
    expect(presLabels.some((l) => /·\s*I$|·\s*II$/.test(l))).toBe(true);
  });
});

describe("buildSuggestions — who slot", () => {
  it("ranks parties by name match", () => {
    const out = buildSuggestions("kok", "who", null, []);
    expect(out[0]?.id).toBe("party-kok");
  });

  it("offers a selector suggestion on $-prefixed queries", () => {
    const out = buildSuggestions("$", "who", null, []);
    expect(out.some((s) => s.kind === "selector")).toBe(true);
  });
});
