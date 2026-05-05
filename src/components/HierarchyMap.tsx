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

import { useMatchMedia } from "../lib/use-match-media";
import {
  AA_VIEWBOX,
  COUNTRY_VIEWBOX,
  type ProjectedFeature,
  type ProjectedGeometry,
} from "../data/geometry";

/** Subset of `AreaLevel` that the map actually renders. */
export type DisplayLevel = "vp" | "hva" | "kunta" | "aa";

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
  /** When `level === "hva"`, the per-HVA combined-path features
   *  from `makeHvaFeatures`. */
  hvaFeatures?: ReadonlyArray<ProjectedFeature> | null;
  /** Currently-selected region id (drawn with thick stroke). */
  selected: string | null;
  /** Caller-supplied per-region fill. Should return a CSS color
   *  (or `var(--…)`). */
  getFill: (regionId: string) => string;
  /** Caller-supplied tooltip text shown in the SVG `<title>`
   *  (and screen-reader `aria-label`) on hover. Defaults to the
   *  region's display label when omitted. */
  getTooltip?: (regionId: string, label: string) => string;
  /** Single-click on a region. */
  onPick?: (regionId: string) => void;
  /** Double-click on a region — drill in. */
  onZoomIn?: (regionId: string) => void;
  /** When `level === "aa"` and this is `true`, render the
   *  alternative scrollable-list view instead of the dense
   *  square-grid SVG. Helsinki's 167 AA squares are
   *  finger-untappable; the list trades the spatial encoding
   *  for guaranteed-tap-target rows. App.tsx flips this on by
   *  default when the viewport is mobile-narrow. */
  aaListMode?: boolean;
}

const VP_VIEWBOX = COUNTRY_VIEWBOX; // "60 30 300 610"
const KUNTA_VIEWBOX = "0 0 400 400" as const;

/** Per-vp label nudge for the country view. Uusimaa's polygon
 *  centroid sits directly on top of the much smaller Helsinki vp
 *  polygon — pull "Uusimaa" up-and-right into Uusimaa proper so
 *  it doesn't crowd the Helsinki callout's leader line. */
const VP_LABEL_OFFSET: Readonly<Record<string, { dx: number; dy: number }>> = {
  uus: { dx: 14, dy: -24 },
};

/** Vp ids whose polygon label is suppressed at country view. The
 *  Helsinki polygon is so small the inline "Helsinki" text just
 *  overlaps Uusimaa's label; the right-side callout square already
 *  carries the name, so we drop the polygon label here. */
const VP_HIDE_POLYGON_LABEL: ReadonlySet<string> = new Set(["01"]);

function labelOffsetFor(
  level: DisplayLevel,
  id: string,
): { dx: number; dy: number } {
  if (level !== "vp") return { dx: 0, dy: 0 };
  return VP_LABEL_OFFSET[id] ?? { dx: 0, dy: 0 };
}

export function HierarchyMap({
  geometry,
  level,
  parentSlug = null,
  aaFeatures = null,
  hvaFeatures = null,
  selected,
  getFill,
  getTooltip,
  onPick,
  onZoomIn,
  aaListMode = false,
}: HierarchyMapProps): JSX.Element {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Touch / no-hover devices: drop the hover machinery entirely.
  // iOS Safari fires `onMouseEnter` on first tap then competes
  // with `onClick` on the second — leaves "stuck hover" labels
  // hanging over the wrong region after navigation. With the
  // ledger updating on tap (via `onPick`) the hover affordance is
  // redundant on touch anyway.
  const isTouch = useMatchMedia("(hover: none)");
  // Mobile-or-narrow viewport — drives the Helsinki callout
  // sizing and (in App.tsx) defaults the AA-level view to the
  // list rather than the dense SVG square grid. Reactive via the
  // matchMedia change listener so a desktop user dragging the
  // window narrow / a phone rotating get the right layout.
  const isCompact = useMatchMedia("(max-width: 640px)");
  const setHoverIfPointer = (id: string | null): void => {
    if (isTouch) return;
    setHoverId(id);
  };

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
    if (level === "hva") {
      return {
        regions: hvaFeatures ? [...hvaFeatures] : [],
        viewBox: KUNTA_VIEWBOX,
      };
    }
    const list = parentSlug ? (geometry.kunnat[parentSlug] ?? []) : [];
    return { regions: list, viewBox: KUNTA_VIEWBOX };
  }, [geometry, level, parentSlug, aaFeatures, hvaFeatures]);

  // Label-visibility rule:
  //   vp:    every region gets a label (only 13–14 regions)
  //   kunta: largest ~28 % by area, plus selected/hovered
  //   hva:   every HVA labelled (always ≤ ~6 within one vp)
  //   aa:    ALWAYS show the shortened label inside every square —
  //          the full name comes through the SVG <title> on hover.
  const labelable = useMemo(() => {
    if (level === "kunta") {
      const sorted = [...regions].sort((a, b) => (b.area || 0) - (a.area || 0));
      const keepN = Math.max(4, Math.ceil(sorted.length * 0.28));
      return new Set(sorted.slice(0, keepN).map((r) => r.id));
    }
    // vp + hva + aa: every region labelled.
    return new Set(regions.map((r) => r.id));
  }, [regions, level]);

  // For aa, scale font to the grid density so dense kuntat (Helsinki,
  // 167 squares) don't have the shortened label overflowing the cell.
  const labelSize = (() => {
    if (level === "vp") return 11;
    if (level === "kunta") return 8.5;
    // aa
    if (regions.length > 100) return 6.5;
    if (regions.length > 50) return 7.5;
    return 8.5;
  })();

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
    // Only include the tail when it's a letter — names like
    // "Lauttasaari (etelä)" shouldn't render as "Laut. (".
    return tail && /[a-zåäöA-ZÅÄÖ]/.test(tail)
      ? `${head}. ${tail}`
      : `${head}.`;
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
        : level === "hva"
          ? "Vaalipiirin hyvinvointialueet. Käytä nuolinäppäimiä siirtyäksesi alueesta toiseen, Enter porautuaksesi kuntiin."
          : "Kunnan äänestysalueet (paikkamerkit). Käytä nuolinäppäimiä siirtyäksesi alueesta toiseen.";

  const focusedId = selected ?? hoverId;
  const focusedRegion = focusedId ? regions.find((r) => r.id === focusedId) : null;

  // List-view branch for AA level. Trades the spatial-grid SVG
  // for a tall scrollable list of AAs whose row-height guarantees
  // a 44 px+ tap target. Reuses the same `getFill` so the swatch
  // beside each row matches the map color. Branch sits AFTER all
  // hook calls — React requires hook order to be stable across
  // renders, so an early return before any hook would crash the
  // app the moment the user toggles between map and list.
  if (level === "aa" && aaListMode) {
    return (
      <AaListView
        features={regions}
        selected={selected}
        getFill={getFill}
        getTooltip={getTooltip}
        onPick={onPick}
        onZoomIn={onZoomIn}
      />
    );
  }

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{
        // Responsive sizing — the SVG fills its container, viewBox
        // + preserveAspectRatio handle the math. Caller (.dashboard-
        // map) decides how big the cell is so the layout adapts to
        // the viewport without per-screen pixel tuning.
        display: "block",
        width: "100%",
        height: "100%",
        maxHeight: "100%",
      }}
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
              onMouseEnter={() => setHoverIfPointer(r.id)}
              onMouseLeave={() => {
                if (isTouch) return;
                setHoverId((prev) => (prev === r.id ? null : prev));
              }}
            >
              <title>{tooltip}</title>
            </path>
          );
        })}
      </g>

      {/* Helsinki callout — at country (vp) level only. The vp polygon
          is so small relative to the rest of Finland that even with
          the Uusimaa label nudge it's hard to interact with directly.
          A square in the empty Gulf-of-Finland sea area, colored the
          same as Helsinki and wired to the same onPick/onZoomIn,
          gives users a comfortably-large click target plus a clear
          legend marker. */}
      {level === "vp"
        ? (() => {
            // vp ids in `regions` are 2-digit `code` values, not the
            // slugs ("hel", "uus", …) — Helsinki is "01".
            const HEL_ID = "01";
            const hel = regions.find((r) => r.id === HEL_ID);
            if (!hel) return null;
            const isSel = selected === HEL_ID;
            const isHover = hoverId === HEL_ID;
            // Square in the Gulf of Finland (empty viewBox region).
            // Pulled in toward Uusimaa from the original far-east
            // position so the leader line is short and the callout
            // reads as "this little square is part of the country
            // map" rather than a free-floating legend.
            // Bumped on compact viewports — the SVG renders smaller
            // there so the same viewBox-unit size translates to a
            // smaller CSS pixel hit area; an extra ~10 viewBox-
            // units lifts mobile thumb-tap comfort to ~36 CSS px.
            const sqSize = isCompact ? 28 : 18;
            const sqX = 245;
            const sqY = isCompact ? 590 : 600;
            const sqCy = sqY + sqSize / 2;
            return (
              <g pointerEvents="auto">
                <line
                  x1={hel.cx}
                  y1={hel.cy}
                  x2={sqX}
                  y2={sqCy}
                  stroke="var(--ink)"
                  strokeWidth={0.6}
                  strokeDasharray="3 2"
                  opacity={0.7}
                  pointerEvents="none"
                />
                <rect
                  x={sqX}
                  y={sqY}
                  width={sqSize}
                  height={sqSize}
                  fill={getFill(HEL_ID)}
                  stroke="var(--ink)"
                  strokeWidth={isSel ? 1.8 : isHover ? 1.2 : 0.7}
                  style={{ cursor: "pointer", transition: "stroke-width 120ms" }}
                  onClick={() => onPick?.(HEL_ID)}
                  onDoubleClick={() => onZoomIn?.(HEL_ID)}
                  onMouseEnter={() => setHoverIfPointer(HEL_ID)}
                  onMouseLeave={() => {
                    if (isTouch) return;
                    setHoverId((prev) => (prev === HEL_ID ? null : prev));
                  }}
                  role="button"
                  aria-label={
                    getTooltip
                      ? getTooltip(HEL_ID, hel.label)
                      : "Helsinki"
                  }
                >
                  <title>
                    {getTooltip ? getTooltip(HEL_ID, hel.label) : "Helsinki"}
                  </title>
                </rect>
                <text
                  x={sqX + sqSize + 4}
                  y={sqCy}
                  textAnchor="start"
                  dominantBaseline="middle"
                  fontSize={isCompact ? 14 : 11}
                  fontFamily="Architects Daughter, system-ui"
                  fill="var(--ink)"
                  pointerEvents="none"
                  style={{ fontWeight: isSel ? 700 : 400 }}
                >
                  Helsinki
                </text>
              </g>
            );
          })()
        : null}

      {regions.map((r) => {
        // Suppress the inline polygon label for vps whose name is
        // already carried by an external callout (Helsinki) so the
        // map doesn't double up. Selection / hover still labels.
        if (
          level === "vp" &&
          VP_HIDE_POLYGON_LABEL.has(r.id) &&
          selected !== r.id &&
          hoverId !== r.id
        ) {
          return null;
        }
        const show = labelable.has(r.id) || selected === r.id || hoverId === r.id;
        if (!show) return null;
        const isSel = selected === r.id;
        const isHover = hoverId === r.id;
        const showHoverBg = isHover && !labelable.has(r.id);
        const text = shortLabelFor(r.label);
        // Per-vp label nudge — Uusimaa's polygon centroid sits right
        // on top of the tiny Helsinki vp polygon, so the "Uusimaa"
        // label hides Helsinki at country view. Nudge it north.
        const labelOffset = labelOffsetFor(level, r.id);
        const lx = r.cx + labelOffset.dx;
        const ly = r.cy + labelOffset.dy;
        return (
          <g key={r.id + "-t"} style={{ pointerEvents: "none" }}>
            {showHoverBg ? (
              <rect
                x={lx - text.length * 3}
                y={ly - 7}
                width={text.length * 6}
                height={13}
                rx={2}
                fill="rgba(251, 249, 244, 0.9)"
                stroke="var(--ink)"
                strokeWidth={0.4}
              />
            ) : null}
            <text
              x={lx}
              y={ly}
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

/** Mobile-friendly list view for AA level. Renders one row per
 *  AA with a swatch (color matches the map fill), the friendly
 *  label, and the per-row tooltip text packed into a small
 *  caption. Tap selects, double-tap is a no-op (AA is the leaf
 *  level — no further drill). Row height is generous (~52 px)
 *  so the user's thumb hits the right one without zoom.
 *
 *  Lives here rather than App.tsx because it's a peer of
 *  HierarchyMap (same SSR / CSR contract, same prop shape). */
function AaListView({
  features,
  selected,
  getFill,
  getTooltip,
  onPick,
  onZoomIn,
}: {
  features: ReadonlyArray<ProjectedFeature>;
  selected: string | null;
  getFill: (regionId: string) => string;
  getTooltip?: (regionId: string, label: string) => string;
  onPick?: (regionId: string) => void;
  onZoomIn?: (regionId: string) => void;
}): JSX.Element {
  if (features.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          fontStyle: "italic",
          color: "var(--ink)",
          opacity: 0.6,
          fontSize: 14,
        }}
      >
        Ei äänestysalueita.
      </div>
    );
  }
  return (
    <div
      role="listbox"
      aria-label="Äänestysalueet"
      style={{
        width: "100%",
        height: "100%",
        maxHeight: "60dvh",
        overflowY: "auto",
        border: "var(--border-default) solid var(--line)",
        borderRadius: "var(--radius-card)",
        background: "var(--paper)",
      }}
    >
      {features.map((f) => {
        const isSel = selected === f.id;
        const tooltip = getTooltip ? getTooltip(f.id, f.label) : f.label;
        return (
          <div
            key={f.id}
            role="option"
            aria-selected={isSel}
            onClick={() => onPick?.(f.id)}
            onDoubleClick={() => onZoomIn?.(f.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderBottom: "1px dotted var(--hair)",
              background: isSel ? "rgba(0,0,0,0.06)" : "transparent",
              cursor: "pointer",
              minHeight: 52,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                border: "1px solid rgba(0,0,0,0.3)",
                background: getFill(f.id),
                flexShrink: 0,
              }}
            />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: isSel ? 700 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {f.label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  opacity: 0.65,
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tooltip}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

