/**
 * HierarchyMap — renders all regions at one hierarchy level as
 * clickable, hoverable SVG paths.
 *
 * Ported from `prototype/wf-map.jsx` `HierarchyMap`. Visual behaviour
 * is preserved: stroke-width transitions on hover/select, smart-label
 * rule at kunta level (label only the top ~28% of regions by area
 * plus selected/hovered to avoid overlap).
 *
 * The component is purely visual — no coloring logic. The caller
 * supplies a `getFill(regionId)` function so the same component
 * works across every workflow mode without knowing about
 * `RegionResult`, `formula`, or `refResult`.
 */

import { useMemo, useRef, useState } from "react";

import {
  AA_VIEWBOX,
  COUNTRY_VIEWBOX,
  type ProjectedFeature,
  type ProjectedGeometry,
} from "../data/geometry";

/** Subset of `AreaLevel` that the map actually renders. */
export type DisplayLevel = "vp" | "kunta" | "aa";

export interface HierarchyMapProps {
  /** Output of `loadGeometry()`. */
  geometry: ProjectedGeometry;
  /** Which level's regions to draw. */
  level: DisplayLevel;
  /** When `level === "kunta"`, the parent vp's slug (`"hel"`,
   *  `"uus"`, …). Ignored at vp level. */
  parentSlug?: string | null;
  /** When `level === "aa"`, the äänestysalue list (with their
   *  pre-projected SVG paths from `makeAanestysalueet`).
   *  Required for aa rendering — there's no real aa geometry,
   *  the caller generates a square grid client-side. */
  aaFeatures?: ReadonlyArray<ProjectedFeature> | null;
  /** Currently-selected region id (drawn with thick stroke). */
  selected: string | null;
  /** Caller-supplied per-region fill. Should return a CSS color
   *  (or `var(--…)`). */
  getFill: (regionId: string) => string;
  /** Caller-supplied tooltip text shown in the SVG `<title>`
   *  (and screen-reader `aria-label`) on hover. Defaults to the
   *  region's display label when omitted. */
  getTooltip?: (regionId: string, label: string) => string;
  /** SVG width / height in pixels. */
  width?: number;
  height?: number;
  /** Single-click on a region. */
  onPick?: (regionId: string) => void;
  /** Double-click on a region — drill in. */
  onZoomIn?: (regionId: string) => void;
}

const VP_VIEWBOX = COUNTRY_VIEWBOX; // "60 30 300 610"
const KUNTA_VIEWBOX = "0 0 400 400" as const;

export function HierarchyMap({
  geometry,
  level,
  parentSlug = null,
  aaFeatures = null,
  selected,
  getFill,
  getTooltip,
  width = 480,
  height = 600,
  onPick,
  onZoomIn,
}: HierarchyMapProps): JSX.Element {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const { regions, viewBox } = useMemo<{
    regions: ProjectedFeature[];
    viewBox: string;
  }>(() => {
    if (level === "vp") {
      return { regions: geometry.vaalipiirit, viewBox: VP_VIEWBOX };
    }
    if (level === "aa") {
      return { regions: aaFeatures ? [...aaFeatures] : [], viewBox: AA_VIEWBOX };
    }
    const list = parentSlug ? (geometry.kunnat[parentSlug] ?? []) : [];
    return { regions: list, viewBox: KUNTA_VIEWBOX };
  }, [geometry, level, parentSlug, aaFeatures]);

  // Smart-label rule:
  //   vp:    every region gets a label (only 13–14 regions)
  //   kunta: largest ~28% by area, plus selected/hovered
  //   aa:    all when count ≤ 25; otherwise hide persistent labels
  //          (Helsinki has 167 aa — they collide on a sqrt-grid).
  //          Selected/hovered still show via the hover-bg branch.
  const labelable = useMemo(() => {
    if (level === "vp") return new Set(regions.map((r) => r.id));
    if (level === "kunta") {
      const sorted = [...regions].sort((a, b) => (b.area || 0) - (a.area || 0));
      const keepN = Math.max(4, Math.ceil(sorted.length * 0.28));
      return new Set(sorted.slice(0, keepN).map((r) => r.id));
    }
    // aa
    if (regions.length <= 25) return new Set(regions.map((r) => r.id));
    return new Set<string>();
  }, [regions, level]);

  const labelSize = level === "aa" ? 8 : level === "kunta" ? 8.5 : 11;

  /** Shorten the on-map label so it fits inside a small grid cell.
   *  The full label (e.g. "091 001A Kruununhaka A") is preserved
   *  for tooltips and screen readers via `getTooltip`; on the map
   *  we render the first 4 letters of the name + ".", followed by
   *  the first letter of the next word when one exists:
   *    "091 001A Kruununhaka A"  → "Krun. A"
   *    "091 002A Etu-Töölö"      → "Etu-."
   *    "091 010A Maunula"        → "Maun."
   */
  const shortLabelFor = (raw: string): string => {
    if (level !== "aa") return raw;
    // aa labels arrive as "<kuntakoodi> <aa-num>[suffix] <name…>".
    // Drop the first two whitespace-separated tokens (numeric prefix).
    const tokens = raw.split(/\s+/);
    const nameTokens =
      tokens.length > 2 && /^\d/.test(tokens[0] ?? "")
        ? tokens.slice(2)
        : tokens;
    const head = (nameTokens[0] ?? "").slice(0, 4);
    if (!head) return raw;
    if (nameTokens.length <= 1) return `${head}.`;
    const tail = (nameTokens[1] ?? "").charAt(0);
    return tail ? `${head}. ${tail}` : `${head}.`;
  };

  /* Keyboard navigation: when the SVG has focus, Tab/→/↓ cycle to
   *  the next sibling region, Shift+Tab/←/↑ cycle backwards, Enter
   *  drills in. Steals Tab on purpose — the alternative (one tab
   *  stop per region) would force ~310 tab presses to leave the map. */
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const ids = regions.map((r) => r.id);
    if (ids.length === 0) return;
    const cur = selected != null ? ids.indexOf(selected) : -1;
    let nextIndex: number | null = null;
    if (e.key === "Tab" && !e.shiftKey) {
      nextIndex = cur < 0 ? 0 : (cur + 1) % ids.length;
    } else if (e.key === "Tab" && e.shiftKey) {
      nextIndex = cur < 0 ? ids.length - 1 : (cur - 1 + ids.length) % ids.length;
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = cur < 0 ? 0 : (cur + 1) % ids.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = cur < 0 ? ids.length - 1 : (cur - 1 + ids.length) % ids.length;
    } else if (e.key === "Enter" && selected) {
      e.preventDefault();
      onZoomIn?.(selected);
      return;
    } else if (e.key === "Escape") {
      // Let the caller decide to drill up or just blur.
      svgRef.current?.blur();
      return;
    }
    if (nextIndex == null) return;
    e.preventDefault();
    const nextId = ids[nextIndex];
    if (nextId) onPick?.(nextId);
  };

  const ariaLabel =
    level === "vp"
      ? "Suomen kartta, vaalipiirit. Käytä nuolinäppäimiä siirtyäksesi alueesta toiseen, Enter porautuaksesi sisään."
      : level === "kunta"
        ? "Vaalipiirin kunnat. Käytä nuolinäppäimiä siirtyäksesi alueesta toiseen, Enter porautuaksesi äänestysalueisiin."
        : "Kunnan äänestysalueet (paikkamerkit). Käytä nuolinäppäimiä siirtyäksesi alueesta toiseen.";

  const focusedId = selected ?? hoverId;
  const focusedRegion = focusedId ? regions.find((r) => r.id === focusedId) : null;

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      width={width}
      height={height}
      style={{ display: "block" }}
      tabIndex={0}
      role="application"
      aria-label={ariaLabel}
      aria-activedescendant={focusedRegion ? `map-region-${focusedRegion.id}` : undefined}
      onKeyDown={onKeyDown}
    >
      <defs>
        {/* Crosshatch fill referenced by `NODATA_FILL` (color-ramps.ts).
            Drawn at 6×6 px in the local viewBox; pattern transform
            rotates it 45° so it reads as a hand-drawn diagonal. */}
        <pattern
          id="nodata-pattern"
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="#e6e0cf" />
          <rect width="1.4" height="6" fill="#c9c1ac" />
        </pattern>
      </defs>
      <g>
        {regions.map((r) => {
          const isSel = selected === r.id;
          const isHover = hoverId === r.id;
          const tooltip = getTooltip ? getTooltip(r.id, r.label) : r.label;
          return (
            <path
              key={r.id}
              id={`map-region-${r.id}`}
              d={r.d}
              fill={getFill(r.id)}
              stroke="var(--ink)"
              strokeWidth={isSel ? 1.8 : isHover ? 1.2 : 0.5}
              opacity={isSel ? 1 : isHover ? 0.98 : 0.94}
              role="option"
              aria-label={tooltip}
              aria-selected={isSel}
              style={{ cursor: "pointer", transition: "stroke-width 120ms" }}
              onClick={() => onPick?.(r.id)}
              onDoubleClick={() => onZoomIn?.(r.id)}
              onMouseEnter={() => setHoverId(r.id)}
              onMouseLeave={() =>
                setHoverId((prev) => (prev === r.id ? null : prev))
              }
            >
              <title>{tooltip}</title>
            </path>
          );
        })}
      </g>

      {regions.map((r) => {
        const show = labelable.has(r.id) || selected === r.id || hoverId === r.id;
        if (!show) return null;
        const isSel = selected === r.id;
        const isHover = hoverId === r.id;
        const showHoverBg = isHover && !labelable.has(r.id);
        const text = shortLabelFor(r.label);
        return (
          <g key={r.id + "-t"} style={{ pointerEvents: "none" }}>
            {showHoverBg ? (
              <rect
                x={r.cx - text.length * 3}
                y={r.cy - 7}
                width={text.length * 6}
                height={13}
                rx={2}
                fill="rgba(251, 249, 244, 0.9)"
                stroke="var(--ink)"
                strokeWidth={0.4}
              />
            ) : null}
            <text
              x={r.cx}
              y={r.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={labelSize}
              fontFamily="Architects Daughter, system-ui"
              fill="var(--ink)"
              style={{ fontWeight: isSel ? 700 : 400 }}
            >
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
