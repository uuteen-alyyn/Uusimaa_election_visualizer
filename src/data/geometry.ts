/**
 * Real Finnish geometry — projected from Tilastokeskus' WFS layers
 * (CC BY 4.0, `vaalipiiri4500k_2026` and `kunta4500k_2026`).
 *
 * Ported from `prototype/wf-geo.jsx`. The projection math is preserved
 * verbatim so visual layout matches the prototype exactly:
 *
 *   - Equirectangular projection scaled for Finland's mid-latitude
 *     (LAT 59.7..70.1, LON 19.3..31.7, COS_LAT correction)
 *   - Country viewBox `60 30 300 610` (width 300, height 610)
 *   - Per-vaalipiiri local projector for kunta drill-down: each
 *     vp's bbox is fitted into a 0..400 box uniformly (12px padding)
 *
 * Edge case (per PRODUCT_NOTES.md): **Vaasa kunta (905)** is on
 * islands and falls just outside its parent vaalipiiri's polygon.
 * The geometry data file already assigns it to Vaasan vaalipiiri
 * (vp slug "vaa") via nearest-neighbour at preparation time.
 */

/* ─── Geometry types (raw from JSON files) ──────────────────── */

interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
interface GeoJSONMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}
type GeoJSONGeometry = GeoJSONPolygon | GeoJSONMultiPolygon;

interface VpFeature {
  /** Slug — `"hel"`, `"uus"`, …; matches `prototype/wf-geo.jsx` VP_LABELS. */
  id: string;
  /** 2-digit code — matches the data fixture's `regionId`. */
  code: string;
  label: string;
  nimi?: string;
  geometry: GeoJSONGeometry;
}

interface KuntaFeature {
  /** 3-digit kuntakoodi — e.g. `"091"` (Helsinki). */
  id: string;
  label: string;
  /** Vaalipiiri slug this kunta belongs to (matches `VpFeature.id`). */
  vp: string;
  geometry: GeoJSONGeometry;
}

interface FeatureCollection<F> {
  features: F[];
}

/* ─── Projected output ──────────────────────────────────────── */

/** A region projected into SVG path coordinates. */
export interface ProjectedFeature {
  /** Identifier matching `regionId` in the data fixtures.
   *
   *  - Vaalipiiri: 2-digit code (`"01"` for Helsinki, …)
   *  - Kunta: 3-digit kuntakoodi (`"091"` for Helsinki kunta, …) */
  id: string;
  /** Friendly label (Finnish) for tooltips and the label-on-map text. */
  label: string;
  /** SVG `d` attribute — already projected. */
  d: string;
  /** Centroid x in viewBox units, used as the label anchor. */
  cx: number;
  /** Centroid y in viewBox units. */
  cy: number;
  /** Projected polygon area (viewBox units²) — used for the
   *  smart-label rule (label only the largest ~28% of regions
   *  at kunta level to avoid overlap). */
  area: number;
}

/** A vaalipiiri also carries its raw lon/lat bbox so we can build
 *  a per-vp local projector for kunta drill-down. */
export interface ProjectedVpFeature extends ProjectedFeature {
  /** Slug for kunta lookup (`"hel"`, `"uus"`, …). */
  slug: string;
  /** Raw lon/lat bbox `[west, south, east, north]`. */
  bbox: [number, number, number, number];
}

/** A kunta carries its parent vp slug for drill-up. */
export interface ProjectedKuntaFeature extends ProjectedFeature {
  vp: string;
}

export interface ProjectedGeometry {
  /** All 13 vaalipiirit, projected into the country viewBox. */
  vaalipiirit: ProjectedVpFeature[];
  /** Kunnat grouped by parent vp slug; each group is projected into
   *  its vp's local 0..400 viewBox. */
  kunnat: Record<string, ProjectedKuntaFeature[]>;
}

/* ─── Projection math (constants from prototype) ────────────── */

/** Country viewBox the renderer should use as the SVG viewBox. */
export const COUNTRY_VIEWBOX = "60 30 300 610" as const;

const COUNTRY_VB = { x: 60, y: 30, w: 300, h: 610 } as const;

// Finland mainland bounding rectangle (lon/lat)
const LON_MIN = 19.3;
const LON_MAX = 31.7;
const LAT_MIN = 59.7;
const LAT_MAX = 70.1;

const MEAN_LAT_RAD = ((LAT_MIN + LAT_MAX) / 2) * (Math.PI / 180);
const COS_LAT = Math.cos(MEAN_LAT_RAD);

const dataW = (LON_MAX - LON_MIN) * COS_LAT;
const dataH = LAT_MAX - LAT_MIN;
const SCALE = Math.min(COUNTRY_VB.w / dataW, COUNTRY_VB.h / dataH);
const offX = COUNTRY_VB.x + (COUNTRY_VB.w - dataW * SCALE) / 2;
const offY = COUNTRY_VB.y + (COUNTRY_VB.h - dataH * SCALE) / 2;

/** Project a (lon, lat) pair into the country viewBox. */
export function projCountry(lon: number, lat: number): [number, number] {
  return [
    offX + (lon - LON_MIN) * COS_LAT * SCALE,
    offY + (LAT_MAX - lat) * SCALE,
  ];
}

export type Projector = (lon: number, lat: number) => [number, number];

/** Build a local projector that fits a lon/lat bbox into a 0..400
 *  viewBox uniformly with 12px padding. Used for kunta drill-down
 *  so each vaalipiiri's kunnat fill its own frame. */
export function makeLocalProjector(
  bbox: [number, number, number, number],
): Projector {
  const [w, s, e, n] = bbox;
  const cosLat = Math.cos(((s + n) / 2) * (Math.PI / 180));
  const dW = (e - w) * cosLat;
  const dH = n - s;
  const SIZE = 400;
  const PAD = 12;
  const inner = SIZE - PAD * 2;
  const sc = Math.min(inner / dW, inner / dH);
  const ox = PAD + (inner - dW * sc) / 2;
  const oy = PAD + (inner - dH * sc) / 2;
  return (lon, lat) => [ox + (lon - w) * cosLat * sc, oy + (n - lat) * sc];
}

/* ─── Geometry helpers ──────────────────────────────────────── */

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ri = ring[i]!;
    const rj = ring[j]!;
    a += (rj[0] + ri[0]) * (rj[1] - ri[1]);
  }
  return Math.abs(a / 2);
}

/** Project a Polygon/MultiPolygon → SVG `d` attribute. */
export function geomToPath(geom: GeoJSONGeometry, project: Projector): string {
  const out: string[] = [];

  function ring(r: number[][]): void {
    r.forEach((p, i) => {
      const [x, y] = project(p[0]!, p[1]!);
      out.push((i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1));
    });
    out.push("Z");
  }

  if (geom.type === "Polygon") {
    for (const r of geom.coordinates) ring(r);
  } else {
    for (const poly of geom.coordinates) for (const r of poly) ring(r);
  }
  return out.join(" ");
}

/** Centroid of the largest ring of a Polygon/MultiPolygon, in
 *  projected coordinates. Used to anchor the on-map label.
 *  Returns `{cx: 0, cy: 0, area: 0}` if no rings are found. */
export function bestCentroid(
  geom: GeoJSONGeometry,
  project: Projector,
): { cx: number; cy: number; area: number } {
  let bestRing: [number, number][] | null = null;
  let bestA = 0;

  function tryRing(r: number[][]): void {
    const projected: [number, number][] = r.map((p) => project(p[0]!, p[1]!));
    const a = ringArea(projected);
    if (a > bestA) {
      bestA = a;
      bestRing = projected;
    }
  }

  if (geom.type === "Polygon") {
    for (const r of geom.coordinates) tryRing(r);
  } else {
    for (const poly of geom.coordinates) for (const r of poly) tryRing(r);
  }

  if (!bestRing) return { cx: 0, cy: 0, area: 0 };

  let sx = 0;
  let sy = 0;
  for (const p of bestRing as [number, number][]) {
    sx += p[0];
    sy += p[1];
  }
  const ring = bestRing as [number, number][];
  return { cx: sx / ring.length, cy: sy / ring.length, area: bestA };
}

/** Lon/lat bbox of any GeoJSON geometry. */
export function bboxOfGeom(
  geom: GeoJSONGeometry,
): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function walk(a: unknown): void {
    if (Array.isArray(a) && typeof a[0] === "number") {
      const [x, y] = a as [number, number];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    if (Array.isArray(a)) for (const x of a) walk(x);
  }
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

/* ─── Async loader ──────────────────────────────────────────── */

/** Default base URL — files live under `/public/data/`. Tests can
 *  override with a custom base. */
export const DEFAULT_DATA_BASE = "/data";

/** Fetch and project both geometry files. Vaalipiirit get the country
 *  projection; kunnat get a per-vp local projection. */
export async function loadGeometry(
  baseUrl: string = DEFAULT_DATA_BASE,
): Promise<ProjectedGeometry> {
  const [vpRes, kuRes] = await Promise.all([
    fetch(`${baseUrl}/fi-vaalipiirit.json`),
    fetch(`${baseUrl}/fi-kunnat.json`),
  ]);
  if (!vpRes.ok) throw new Error(`Failed to load fi-vaalipiirit.json (${vpRes.status})`);
  if (!kuRes.ok) throw new Error(`Failed to load fi-kunnat.json (${kuRes.status})`);
  const vpJson = (await vpRes.json()) as FeatureCollection<VpFeature>;
  const kuJson = (await kuRes.json()) as FeatureCollection<KuntaFeature>;

  return projectGeometry(vpJson, kuJson);
}

/** Synchronous core of `loadGeometry` — exposed so tests can feed
 *  in inline fixtures without mocking fetch. */
export function projectGeometry(
  vpJson: FeatureCollection<VpFeature>,
  kuJson: FeatureCollection<KuntaFeature>,
): ProjectedGeometry {
  // Vaalipiirit: project into country viewBox, also remember each
  // one's raw lon/lat bbox for the per-vp local projection.
  const vaalipiirit: ProjectedVpFeature[] = vpJson.features.map((f) => {
    const c = bestCentroid(f.geometry, projCountry);
    return {
      id: f.code,
      slug: f.id,
      label: f.label,
      d: geomToPath(f.geometry, projCountry),
      cx: c.cx,
      cy: c.cy,
      area: c.area,
      bbox: bboxOfGeom(f.geometry),
    };
  });

  // Kunnat grouped by vp slug, each group projected into its vp's
  // local 0..400 box.
  const byVp: Record<string, KuntaFeature[]> = {};
  for (const f of kuJson.features) {
    if (!f.vp) continue;
    (byVp[f.vp] ??= []).push(f);
  }

  const kunnat: Record<string, ProjectedKuntaFeature[]> = {};
  for (const vp of vaalipiirit) {
    const list = byVp[vp.slug] ?? [];
    if (!list.length) {
      kunnat[vp.slug] = [];
      continue;
    }
    const project = makeLocalProjector(vp.bbox);
    kunnat[vp.slug] = list.map((f) => {
      const c = bestCentroid(f.geometry, project);
      return {
        id: f.id,
        label: f.label,
        vp: vp.slug,
        d: geomToPath(f.geometry, project),
        cx: c.cx,
        cy: c.cy,
        area: c.area,
      };
    });
  }

  return { vaalipiirit, kunnat };
}
