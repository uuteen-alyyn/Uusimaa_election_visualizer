import { beforeEach, describe, expect, it } from "vitest";

import type { Workflow } from "../types/elections";

import {
  BUILTIN_WORKFLOWS,
  loadCustomWorkflows,
  saveCustomWorkflows,
  WF_KIND_BY_ID,
  WF_KINDS,
  WF_LS_KEY,
  workflowSubtitle,
  workflowsEquivalent,
} from "./workflow";

/* ─── WF_KINDS ──────────────────────────────────────────────── */

describe("WF_KINDS", () => {
  it("exposes exactly the five coloring modes", () => {
    expect(WF_KINDS.map((k) => k.id).sort()).toEqual([
      "change",
      "formula",
      "support",
      "votes",
      "winner",
    ]);
  });

  it("flags needsParty / needsRef on the right kinds", () => {
    expect(WF_KIND_BY_ID.winner.needsParty).toBe(false);
    expect(WF_KIND_BY_ID.support.needsParty).toBe(true);
    expect(WF_KIND_BY_ID.votes.needsParty).toBe(true);
    expect(WF_KIND_BY_ID.change.needsParty).toBe(true);
    expect(WF_KIND_BY_ID.change.needsRef).toBe(true);
    expect(WF_KIND_BY_ID.support.needsRef).toBe(false);
  });
});

/* ─── BUILTIN_WORKFLOWS ──────────────────────────────────────── */

describe("BUILTIN_WORKFLOWS", () => {
  it("contains the four built-ins, all marked builtin: true", () => {
    expect(BUILTIN_WORKFLOWS.length).toBe(4);
    for (const w of BUILTIN_WORKFLOWS) {
      expect(w.builtin).toBe(true);
    }
  });

  it("defaults all built-ins to ek2023 (most recent ek with data)", () => {
    for (const w of BUILTIN_WORKFLOWS) expect(w.election).toBe("ek2023");
  });

  it("the change built-in references ek2019", () => {
    const change = BUILTIN_WORKFLOWS.find((w) => w.kind === "change");
    expect(change?.refElection).toBe("ek2019");
  });
});

/* ─── workflowsEquivalent ────────────────────────────────────── */

describe("workflowsEquivalent", () => {
  const winner: Workflow = {
    id: "a",
    label: "x",
    kind: "winner",
    election: "ek2023",
  };
  const support: Workflow = {
    id: "b",
    label: "y",
    kind: "support",
    election: "ek2023",
    party: "kok",
  };
  const change: Workflow = {
    id: "c",
    label: "z",
    kind: "change",
    election: "ek2023",
    refElection: "ek2019",
    party: "kok",
  };

  it("treats two winner workflows on the same election as equivalent", () => {
    expect(workflowsEquivalent(winner, { ...winner, id: "different" })).toBe(true);
  });

  it("differs by election", () => {
    expect(workflowsEquivalent(winner, { ...winner, election: "ek2019" })).toBe(false);
  });

  it("considers party for kinds that need it", () => {
    expect(workflowsEquivalent(support, { ...support, party: "sdp" })).toBe(false);
    expect(workflowsEquivalent(support, { ...support, party: "kok" })).toBe(true);
  });

  it("considers refElection for change kind", () => {
    expect(
      workflowsEquivalent(change, { ...change, refElection: "ek2027" }),
    ).toBe(false);
  });

  it("compares formula token arrays for formula kind", () => {
    const f1: Workflow = {
      id: "f1",
      label: "ƒ",
      kind: "formula",
      election: "ek2023",
      formula: [{ kind: "num", value: 42 }],
    };
    const f1Same: Workflow = { ...f1, id: "f2", formula: [{ kind: "num", value: 42 }] };
    const f1Diff: Workflow = { ...f1, formula: [{ kind: "num", value: 99 }] };
    expect(workflowsEquivalent(f1, f1Same)).toBe(true);
    expect(workflowsEquivalent(f1, f1Diff)).toBe(false);
  });

  it("returns false for null / different kind", () => {
    expect(workflowsEquivalent(null, winner)).toBe(false);
    expect(workflowsEquivalent(winner, null)).toBe(false);
    expect(workflowsEquivalent(winner, support)).toBe(false);
  });
});

/* ─── workflowSubtitle ───────────────────────────────────────── */

describe("workflowSubtitle", () => {
  it("formats a winner workflow as just the election short label", () => {
    expect(
      workflowSubtitle({
        id: "x",
        label: "y",
        kind: "winner",
        election: "ek2023",
      }),
    ).toBe("EK 2023");
  });

  it("appends the party for support / votes", () => {
    expect(
      workflowSubtitle({
        id: "x",
        label: "y",
        kind: "support",
        election: "ek2023",
        party: "kok",
      }),
    ).toBe("EK 2023 · Kok");
  });

  it("includes vs <ref> for change", () => {
    expect(
      workflowSubtitle({
        id: "x",
        label: "y",
        kind: "change",
        election: "ek2023",
        refElection: "ek2019",
        party: "sdp",
      }),
    ).toBe("EK 2023 · vs EK 2019 · SDP");
  });

  it("prefixes the ƒ glyph for formula workflows", () => {
    expect(
      workflowSubtitle({
        id: "x",
        label: "y",
        kind: "formula",
        election: "ek2023",
        formula: [{ kind: "num", value: 42 }],
      }),
    ).toMatch(/^ƒ /);
  });
});

/* ─── localStorage round-trip ────────────────────────────────── */

class MemStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("loadCustomWorkflows / saveCustomWorkflows", () => {
  let storage: MemStorage;
  beforeEach(() => {
    storage = new MemStorage();
  });

  it("uses the prototype's vk_workflows_v1 key (preserves user state)", () => {
    expect(WF_LS_KEY).toBe("vk_workflows_v1");
  });

  it("returns [] when storage is empty", () => {
    expect(loadCustomWorkflows(storage)).toEqual([]);
  });

  it("round-trips a saved array", () => {
    const wf: Workflow = {
      id: "w1",
      label: "Kok change 19→23",
      kind: "formula",
      election: "ek2023",
      formula: [{ kind: "num", value: 1 }],
    };
    saveCustomWorkflows([wf], storage);
    expect(loadCustomWorkflows(storage)).toEqual([wf]);
  });

  it("returns [] on malformed JSON", () => {
    storage.setItem(WF_LS_KEY, "{not json");
    expect(loadCustomWorkflows(storage)).toEqual([]);
  });

  it("returns [] when the value isn't an array", () => {
    storage.setItem(WF_LS_KEY, JSON.stringify({ foo: "bar" }));
    expect(loadCustomWorkflows(storage)).toEqual([]);
  });

  it("filters out malformed entries (no id / no kind)", () => {
    const good: Workflow = {
      id: "g",
      label: "good",
      kind: "winner",
      election: "ek2023",
    };
    storage.setItem(
      WF_LS_KEY,
      JSON.stringify([good, { label: "missing id" }, null, "string"]),
    );
    expect(loadCustomWorkflows(storage)).toEqual([good]);
  });

  it("strips an accidental double-ƒ prefix from labels (cleanup-on-read)", () => {
    storage.setItem(
      WF_LS_KEY,
      JSON.stringify([
        { id: "x", label: "ƒ ƒ My formula", kind: "formula", election: "ek2023" },
      ]),
    );
    const loaded = loadCustomWorkflows(storage);
    expect(loaded[0]?.label).toBe("My formula");
  });
});
