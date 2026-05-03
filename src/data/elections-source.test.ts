import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalFixtureSource, type FixtureFile } from "./elections-source";

const SAMPLE: FixtureFile = {
  electionId: "ek2023",
  areas: [
    // 13 vp + 2 kunta — minimum surface to exercise the level filter
    { regionId: "01", electionId: "ek2023", votes: 388501, voters: 0, turnout: 0, shares: { kok: 26.4, sdp: 20.9 } },
    { regionId: "02", electionId: "ek2023", votes: 565306, voters: 0, turnout: 0, shares: { kok: 26.2, sdp: 19.9 } },
    { regionId: "03", electionId: "ek2023", votes: 300000, voters: 0, turnout: 0, shares: { kok: 22, sdp: 21 } },
    { regionId: "091", electionId: "ek2023", votes: 388501, voters: 0, turnout: 0, shares: { kok: 26.4, sdp: 20.9 } },
    { regionId: "049", electionId: "ek2023", votes: 200000, voters: 0, turnout: 0, shares: { kok: 30, sdp: 18 } },
  ],
};

const NO_DATA: FixtureFile = {
  electionId: "ek2027",
  status: "no_data",
};

function mockFetchOk(payload: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

function mockFetchFailing() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({}),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("LocalFixtureSource.getRegionResult", () => {
  it("returns the matching region", async () => {
    mockFetchOk(SAMPLE);
    const src = new LocalFixtureSource();
    const r = await src.getRegionResult("02", "ek2023");
    expect(r?.regionId).toBe("02");
    expect(r?.shares.kok).toBe(26.2);
    expect(r?.votes).toBe(565306);
  });

  it("returns null when the region isn't in the fixture", async () => {
    mockFetchOk(SAMPLE);
    const src = new LocalFixtureSource();
    expect(await src.getRegionResult("99", "ek2023")).toBeNull();
  });

  it("returns null on no-data fixture", async () => {
    mockFetchOk(NO_DATA);
    const src = new LocalFixtureSource();
    expect(await src.getRegionResult("01", "ek2027")).toBeNull();
  });

  it("returns null on fetch failure (HTTP error)", async () => {
    mockFetchFailing();
    const src = new LocalFixtureSource();
    expect(await src.getRegionResult("01", "ekX")).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const src = new LocalFixtureSource();
    expect(await src.getRegionResult("01", "ekX")).toBeNull();
  });
});

describe("LocalFixtureSource.listAreas", () => {
  it("filters to vp-level (2-digit) areas when level=vp", async () => {
    mockFetchOk(SAMPLE);
    const src = new LocalFixtureSource();
    const r = await src.listAreas("vp", null, "ek2023");
    expect(r.map((a) => a.regionId)).toEqual(["01", "02", "03"]);
  });

  it("filters to kunta-level (3-digit) areas when level=kunta", async () => {
    mockFetchOk(SAMPLE);
    const src = new LocalFixtureSource();
    const r = await src.listAreas("kunta", null, "ek2023");
    expect(r.map((a) => a.regionId)).toEqual(["091", "049"]);
  });

  it("returns [] for level=maa or aa (visualizer doesn't render fixture areas at those levels)", async () => {
    mockFetchOk(SAMPLE);
    const src = new LocalFixtureSource();
    expect(await src.listAreas("maa", null, "ek2023")).toEqual([]);
    expect(await src.listAreas("aa", "091", "ek2023")).toEqual([]);
  });

  it("returns [] on no-data fixture", async () => {
    mockFetchOk(NO_DATA);
    const src = new LocalFixtureSource();
    expect(await src.listAreas("vp", null, "ek2027")).toEqual([]);
  });
});

describe("LocalFixtureSource caching", () => {
  it("fetches each electionId only once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SAMPLE,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const src = new LocalFixtureSource();
    await src.getRegionResult("01", "ek2023");
    await src.getRegionResult("02", "ek2023");
    await src.listAreas("vp", null, "ek2023");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches no-data results too (a 404'd election shouldn't keep retrying)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const src = new LocalFixtureSource();
    await src.getRegionResult("01", "ek2027");
    await src.getRegionResult("02", "ek2027");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
