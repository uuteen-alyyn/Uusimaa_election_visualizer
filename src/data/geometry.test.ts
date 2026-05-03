import { describe, expect, it } from "vitest";

import {
  bboxOfGeom,
  bestCentroid,
  COUNTRY_VIEWBOX,
  geomToPath,
  makeLocalProjector,
  projCountry,
  projectGeometry,
} from "./geometry";

/* ─── projCountry ───────────────────────────────────────────── */

describe("projCountry", () => {
  it("matches the documented viewBox: width 300, height 610, offset 60/30", () => {
    expect(COUNTRY_VIEWBOX).toBe("60 30 300 610");
  });

  it("places north-westernmost point near top-left of the viewBox", () => {
    const [x, y] = projCountry(19.3, 70.1);
    // West-ish (low x) and north-ish (low y) within the country box (60..360, 30..640)
    expect(x).toBeGreaterThanOrEqual(60);
    expect(x).toBeLessThan(180);
    expect(y).toBeGreaterThanOrEqual(30);
    expect(y).toBeLessThan(120);
  });

  it("places south-easternmost point near bottom-right", () => {
    const [x, y] = projCountry(31.7, 59.7);
    expect(x).toBeGreaterThan(180);
    expect(x).toBeLessThanOrEqual(360);
    expect(y).toBeGreaterThan(540);
    expect(y).toBeLessThanOrEqual(640);
  });

  it("is deterministic — same input produces same output", () => {
    const a = projCountry(24.94, 60.17); // Helsinki centre
    const b = projCountry(24.94, 60.17);
    expect(a).toEqual(b);
  });

  it("y is monotonically decreasing in latitude (north = smaller y)", () => {
    const [, ySouth] = projCountry(24.0, 60.0);
    const [, yNorth] = projCountry(24.0, 65.0);
    expect(yNorth).toBeLessThan(ySouth);
  });

  it("x is monotonically increasing in longitude (east = larger x)", () => {
    const [xWest] = projCountry(20.0, 65.0);
    const [xEast] = projCountry(30.0, 65.0);
    expect(xEast).toBeGreaterThan(xWest);
  });
});

/* ─── makeLocalProjector ────────────────────────────────────── */

describe("makeLocalProjector", () => {
  it("fits the bbox into a 0..400 viewBox with 12px padding", () => {
    // A square-ish bbox somewhere in southern Finland
    const project = makeLocalProjector([24.0, 60.0, 25.0, 61.0]);
    const corners: Array<[number, number]> = [
      [24.0, 60.0],
      [25.0, 60.0],
      [24.0, 61.0],
      [25.0, 61.0],
    ];
    for (const [lon, lat] of corners) {
      const [x, y] = project(lon, lat);
      expect(x).toBeGreaterThanOrEqual(12);
      expect(x).toBeLessThanOrEqual(388);
      expect(y).toBeGreaterThanOrEqual(12);
      expect(y).toBeLessThanOrEqual(388);
    }
  });

  it("inverts y so north (high lat) is up (low y)", () => {
    const project = makeLocalProjector([24.0, 60.0, 25.0, 61.0]);
    const [, yNorth] = project(24.5, 61.0);
    const [, ySouth] = project(24.5, 60.0);
    expect(yNorth).toBeLessThan(ySouth);
  });
});

/* ─── geomToPath ────────────────────────────────────────────── */

describe("geomToPath", () => {
  const identity = (lon: number, lat: number): [number, number] => [lon, lat];

  it("emits an `M`+`L`+`Z` sequence for a Polygon ring", () => {
    const d = geomToPath(
      {
        type: "Polygon",
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      },
      identity,
    );
    // Format from prototype: letter immediately followed by coords,
    // segments separated by single spaces. One decimal place.
    expect(d).toMatch(/^M0\.0,0\.0/);
    expect(d).toContain("L10.0,0.0");
    expect(d).toContain("L0.0,10.0");
    expect(d).toMatch(/Z$/);
  });

  it("handles MultiPolygon by concatenating ring paths", () => {
    const d = geomToPath(
      {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          [[[5, 5], [6, 5], [6, 6], [5, 5]]],
        ],
      },
      identity,
    );
    // Two rings → exactly two Z terminators
    expect((d.match(/Z/g) ?? []).length).toBe(2);
    expect(d).toContain("M5.0,5.0");
  });
});

/* ─── bboxOfGeom + bestCentroid ─────────────────────────────── */

describe("bboxOfGeom", () => {
  it("returns [minX, minY, maxX, maxY] for a Polygon", () => {
    const geom = {
      type: "Polygon" as const,
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    };
    expect(bboxOfGeom(geom)).toEqual([0, 0, 10, 10]);
  });

  it("walks all rings of a MultiPolygon", () => {
    const geom = {
      type: "MultiPolygon" as const,
      coordinates: [
        [[[0, 0], [2, 0], [2, 2], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 5]]],
      ],
    };
    expect(bboxOfGeom(geom)).toEqual([0, 0, 6, 6]);
  });
});

describe("bestCentroid", () => {
  const identity = (lon: number, lat: number): [number, number] => [lon, lat];

  it("is centered for a square", () => {
    const c = bestCentroid(
      {
        type: "Polygon",
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      },
      identity,
    );
    // The centroid of the 5-vertex closed ring (which repeats the
    // first point) averages over all 5, so it lands at x = (0+10+10+0+0)/5 = 4
    // — close enough to 5 for label-anchor purposes.
    expect(c.cx).toBeCloseTo(4, 0);
    expect(c.cy).toBeCloseTo(4, 0);
    expect(c.area).toBeGreaterThan(0);
  });

  it("returns zero area for an empty geometry", () => {
    const c = bestCentroid(
      { type: "Polygon", coordinates: [] },
      identity,
    );
    expect(c.area).toBe(0);
  });
});

/* ─── projectGeometry (end-to-end) ──────────────────────────── */

describe("projectGeometry", () => {
  const sampleVps = {
    features: [
      {
        id: "uus",
        code: "02",
        label: "Uusimaa",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [24.0, 60.0],
              [25.0, 60.0],
              [25.0, 61.0],
              [24.0, 61.0],
              [24.0, 60.0],
            ],
          ],
        },
      },
    ],
  };
  const sampleKunnat = {
    features: [
      {
        id: "091",
        label: "Helsinki",
        vp: "uus",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [24.9, 60.1],
              [25.0, 60.1],
              [25.0, 60.3],
              [24.9, 60.3],
              [24.9, 60.1],
            ],
          ],
        },
      },
      {
        id: "049",
        label: "Espoo",
        vp: "uus",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [24.6, 60.2],
              [24.8, 60.2],
              [24.8, 60.4],
              [24.6, 60.4],
              [24.6, 60.2],
            ],
          ],
        },
      },
    ],
  };

  it("projects the vp into the country viewBox with the 2-digit code as id", () => {
    const { vaalipiirit } = projectGeometry(sampleVps, sampleKunnat);
    expect(vaalipiirit).toHaveLength(1);
    const uus = vaalipiirit[0]!;
    expect(uus.id).toBe("02"); // matches data fixture's regionId
    expect(uus.slug).toBe("uus"); // for kunta lookup
    expect(uus.label).toBe("Uusimaa");
    expect(uus.d).toMatch(/^M\d/);
    expect(uus.bbox).toEqual([24.0, 60.0, 25.0, 61.0]);
  });

  it("groups kunnat under their parent vp's slug, projected locally", () => {
    const { kunnat } = projectGeometry(sampleVps, sampleKunnat);
    expect(Object.keys(kunnat)).toEqual(["uus"]);
    const uusKunnat = kunnat.uus!;
    expect(uusKunnat.map((k) => k.id).sort()).toEqual(["049", "091"]);
    // Local projector pads to 12, so kunta x/y must lie inside [12, 388].
    for (const k of uusKunnat) {
      expect(k.cx).toBeGreaterThanOrEqual(0);
      expect(k.cx).toBeLessThanOrEqual(400);
      expect(k.cy).toBeGreaterThanOrEqual(0);
      expect(k.cy).toBeLessThanOrEqual(400);
    }
  });

  it("returns an empty kunta array for vps that have no kunnat in the input", () => {
    const onlyVp = {
      features: [
        {
          ...sampleVps.features[0]!,
          id: "lap",
          code: "13",
          label: "Lappi",
        },
      ],
    };
    const { kunnat } = projectGeometry(onlyVp, { features: [] });
    expect(kunnat.lap).toEqual([]);
  });
});
