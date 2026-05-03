import { describe, expect, it } from "vitest";

import {
  decodeShareState,
  encodeShareState,
  readShareStateFromHash,
  writeShareStateToHash,
  type ShareableState,
} from "./share-state";

const baseWinner: ShareableState = {
  mode: "winner",
  election: "ek2023",
  refElection: "ek2019",
  focusParty: null,
};

describe("encode / decode round-trip", () => {
  it("round-trips a simple winner-mode state", () => {
    const enc = encodeShareState(baseWinner);
    expect(enc).toMatch(/^[A-Za-z0-9+/]+$/); // base64 no padding
    expect(decodeShareState(enc)).toEqual(baseWinner);
  });

  it("round-trips support mode with focus party", () => {
    const s: ShareableState = { ...baseWinner, mode: "support", focusParty: "kok" };
    expect(decodeShareState(encodeShareState(s))).toEqual(s);
  });

  it("round-trips a custom-formula state with selector bindings", () => {
    const s: ShareableState = {
      mode: "formula",
      election: "ek2023",
      refElection: "ek2019",
      focusParty: null,
      formulaTokens: [
        { kind: "chip", fields: { type: "ek", year: 2023, who: { party: "kok" } } },
        { kind: "op", value: "-" },
        { kind: "chip", fields: { selType: "A", selYear: "B", who: { party: "kok" } } },
      ],
      formulaBindings: {
        A: { type: "ek" },
        B: { year: 2019 },
      },
    };
    const restored = decodeShareState(encodeShareState(s));
    expect(restored).toEqual(s);
  });

  it("preserves Finnish characters (ä/ö) inside formula chip names", () => {
    const s: ShareableState = {
      ...baseWinner,
      mode: "formula",
      formulaTokens: [
        {
          kind: "chip",
          fields: {
            type: "ek",
            year: 2023,
            who: {
              candidate: { id: "x1", name: "Anna Mäkinen-Hämäläinen", party: "vihr" },
            },
          },
        },
      ],
    };
    expect(decodeShareState(encodeShareState(s))).toEqual(s);
  });
});

describe("decode error paths", () => {
  it("returns null on empty input", () => {
    expect(decodeShareState("")).toBeNull();
  });

  it("returns null on malformed base64", () => {
    expect(decodeShareState("@@@@")).toBeNull();
  });

  it("returns null on base64 of non-JSON", () => {
    // valid base64 of "hello world" — not a JSON object
    expect(decodeShareState("aGVsbG8gd29ybGQ")).toBeNull();
  });
});

describe("readShareStateFromHash", () => {
  it("extracts state from a simple `#v=…` hash", () => {
    const hash = writeShareStateToHash(baseWinner);
    expect(hash).toMatch(/^#v=/);
    expect(readShareStateFromHash(hash)).toEqual(baseWinner);
  });

  it("extracts state when `v=` is not the first key", () => {
    const enc = encodeShareState(baseWinner);
    expect(readShareStateFromHash(`#foo=bar&v=${enc}`)).toEqual(baseWinner);
  });

  it("returns null when hash has no `v=` segment", () => {
    expect(readShareStateFromHash("")).toBeNull();
    expect(readShareStateFromHash("#foo=bar")).toBeNull();
    expect(readShareStateFromHash("#")).toBeNull();
  });
});

describe("writeShareStateToHash", () => {
  it("produces a hash starting with `#v=`", () => {
    expect(writeShareStateToHash(baseWinner)).toMatch(/^#v=[A-Za-z0-9+/]+$/);
  });
});
