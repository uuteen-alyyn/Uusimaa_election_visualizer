/**
 * SVG / PNG export helpers — port of the download logic from
 * `prototype/wf-variants.jsx:311-380`.
 *
 *   - `downloadMapSvg(svg)`     — clones the live SVG, inlines the
 *                                  CSS variables it references, and
 *                                  serialises to a standalone .svg file
 *   - `downloadMapPng(svg)`     — same as SVG but rasterised to a 2×
 *                                  PNG via canvas
 *   - `downloadDashboardPng(el)` — the whole dashboard subtree as a
 *                                  PNG via the `html-to-image` library
 *
 * Pure helpers (`timestamp`, `svgToXml`) are exported so tests can
 * exercise them without touching the browser's canvas / Image APIs.
 */

import * as htmlToImage from "html-to-image";

/** Filename-safe ISO-ish stamp, e.g. `"2026-05-03-21-03"`. */
export function timestamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

/** CSS custom properties the map's stroke / fill / label rules
 *  reference. We inline the resolved values so the standalone SVG
 *  doesn't depend on the host page's stylesheet. */
const TOKENS = [
  "--ink",
  "--paper",
  "--paper-2",
  "--page-bg",
  "--p-kok",
  "--p-sdp",
  "--p-ps",
  "--p-kesk",
  "--p-vihr",
  "--p-vas",
  "--p-rkp",
  "--p-kd",
  "--ramp-support-1",
  "--ramp-support-2",
  "--ramp-support-3",
  "--ramp-support-4",
  "--ramp-support-5",
  "--ramp-support-6",
  "--ramp-change-1",
  "--ramp-change-2",
  "--ramp-change-3",
  "--ramp-change-4",
  "--ramp-change-5",
  "--ramp-votes-1",
  "--ramp-votes-2",
  "--ramp-votes-3",
  "--ramp-votes-4",
  "--ramp-votes-5",
] as const;

/** Read every needed CSS var from `documentElement` and emit a
 *  `:root{ --x:#…; … }` declaration suitable for inlining. */
export function inlineCssTokens(
  computedStyle: CSSStyleDeclaration,
): string {
  const decls = TOKENS.map(
    (name) => `${name}:${computedStyle.getPropertyValue(name).trim()};`,
  ).join("");
  return `:root{${decls}} text{font-family:'Architects Daughter', system-ui;}`;
}

/** Clone the SVG and inline the design-token CSS so the output
 *  renders identically when opened standalone. */
export function svgToXml(
  svg: SVGSVGElement,
  computedStyle: CSSStyleDeclaration = getComputedStyle(document.documentElement),
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  const styleEl = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "style",
  );
  styleEl.textContent = inlineCssTokens(computedStyle);
  clone.insertBefore(styleEl, clone.firstChild);

  return new XMLSerializer().serializeToString(clone);
}

/** Trigger a browser download of `blob` with the given filename. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─── Public download entry points ─────────────────────────── */

export function downloadMapSvg(svg: SVGSVGElement, now?: Date): void {
  const xml = svgToXml(svg);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, `map-${timestamp(now)}.svg`);
}

export async function downloadMapPng(
  svg: SVGSVGElement,
  scale = 2,
  now?: Date,
): Promise<void> {
  const xml = svgToXml(svg);
  const cs = getComputedStyle(document.documentElement);
  const paper = cs.getPropertyValue("--paper").trim() || "#fbf9f4";

  const w = svg.viewBox.baseVal.width || svg.clientWidth || 800;
  const h = svg.viewBox.baseVal.height || svg.clientHeight || 800;

  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.src = svgUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e instanceof Error ? e : new Error("svg → img load failed"));
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2d context");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("toBlob produced null"));
      }, "image/png");
    });

    triggerDownload(pngBlob, `map-${timestamp(now)}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function downloadDashboardPng(
  node: HTMLElement,
  now?: Date,
): Promise<void> {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue("--page-bg").trim() || "#efebe0";
  const dataUrl = await htmlToImage.toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: bg,
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `dashboard-${timestamp(now)}.png`;
  a.click();
}
