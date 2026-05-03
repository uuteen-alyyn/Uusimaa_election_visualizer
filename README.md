# Handoff: Uusimaa / Finland Election Visualizer

## Overview

A web product for **exploring Finnish election results on a map** with hierarchical
drill-down (country → vaalipiiri → kunta → optional äänestysalue), multiple
coloring "workflows" (biggest party, party support %, total votes, change in
support, **custom formula**), and saved/shareable views.

The original brief framed it as a "Uusimaa election visualizer", but the
prototype is built nationally; Uusimaa is just one of 13 vaalipiirit you can
drill into. Treat the whole country as in scope.

## About the Design Files

The files under `prototype/` are **design references** — a working HTML/React
prototype written with React via UMD + Babel-in-the-browser, intentionally
sketchy in style (Caveat / Architects Daughter fonts, hand-drawn aesthetic).
They are **not production code to copy directly**. Your job is to recreate
this design in a real codebase, choosing the framework, build tooling, and
architecture you judge appropriate for a production product.

The visual style is **hi-fi**: match the sketchy/notebook aesthetic, the type
choices, the muted paper background, the workflow pill bar, the breadcrumb,
the formula chip composer — pixel-faithful where reasonable.

## Fidelity

**Hi-fi.** Reproduce the look-and-feel of the prototype faithfully:
- Paper-coloured background (`#fbf9f4` / `#efebe0`), ink-black foreground
- "Caveat" for headings, "Architects Daughter" for body, "JetBrains Mono"
  for monospaced values
- Hand-drawn pill / button / chip primitives with 1.5px ink borders, slight
  rotations, soft drop shadows (`3px 3px 0 rgba(0,0,0,0.15)`)
- Party colour swatches as listed in the design tokens section

The map itself was switched from sketchy hand-drawn polygons to **clean
vector lines on real Finnish geometry** — keep that clean look for the map
proper, but keep the sketchy chrome around it.

## What this product is

A tool for **journalists, analysts, civic-curious citizens** to:

1. **See election results on a map of Finland.** Pick an election (eduskuntavaalit,
   kuntavaalit, aluevaalit, eurovaalit, presidentinvaalit including round 1/2),
   pick a coloring mode, and see the country shaded.
2. **Drill down hierarchically.** Country shows all 13 vaalipiirit. Double-click
   one and you see all kunnat of that vaalipiiri at once. (Optional level 3:
   äänestysalueet for a selected kunta — left as a placeholder grid in the
   prototype because AA boundaries shift between elections and aren't openly
   redistributable for all years.)
3. **Switch coloring workflows** from a pill bar above the map. Built-ins:
   *Biggest party*, *Party support %*, *Total votes*, *Change in support*.
4. **Build custom formulas** with a chip-based composer
   (e.g. `KOK % (EK 2027) − KOK % (EK 2023)`, with operators `+ − × ÷ ( )`
   and numeric literals). Save formulas as named workflow buttons in the bar.
5. **Bind selectors** in formulas — chips can have `$A`/`$B` placeholders for
   election type/year/who, bound at view time so one formula works across
   elections.
6. **Compare parties / candidates per region.** Side ledger shows party shares,
   turnout, total votes, and a candidate list (sortable, scrollable).
7. **Share & download.** URL hash encodes the full view (mode, election, party,
   formula, bindings) so links are reproducible. Map and dashboard can be
   exported as PNG / SVG.

## Target stack — your call

You (Claude Code) decide the stack. Suggested defaults if no existing codebase:

- **Framework:** Next.js (App Router) + TypeScript, or Vite + React + TS.
- **Styling:** Tailwind for layout + CSS variables for the design tokens
  listed below; keep the sketchy primitives as a small component library.
- **Maps:** for v1, **plain SVG with our own equirectangular projection** is
  enough — see `prototype/wf-geo.jsx`. If pan/zoom or label-collision
  becomes painful, swap to **D3-geo** + `d3-geo-projection` (we never need
  globe-scale tiles, so MapLibre is overkill).
- **Charts:** small bar rows are hand-rolled; a real product can use Visx
  or Recharts for the per-region party-share chart. Sparklines for the
  ledger should stay lightweight — inline SVG is fine.
- **State:** the prototype uses local React state plus `localStorage` and
  URL hash. For the real app, keep it simple — Zustand or React context
  is plenty; no need for Redux.
- **Data fetching:** server components or React Query against the data
  layer described below.

## Data backend — Statistics Finland (Tilastokeskus) PxWeb API

The prototype's `regionData()` is **fully synthetic**. Replace it with a
real data layer backed by **Tilastokeskus PxWeb**.

- API root: `https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/`
- Election tables of interest sit under categories:
  - `vaa/evaa/` — eduskuntavaalit (parliamentary)
  - `vaa/kvaa/` — kuntavaalit (municipal)
  - `vaa/avaa/` — aluevaalit (regional / wellbeing services counties)
  - `vaa/euvaa/` — europarlamenttivaalit
  - `vaa/pvaa/` — presidentinvaalit (rounds available)
- Each table is queried with a JSON-stat POST describing dimensions to slice.
  Wrap this in a typed client; cache responses (keys are stable, results
  almost never change post-election).
- Geography: kunta is keyed by **3-digit kuntakoodi** (e.g. `091` Helsinki).
  Vaalipiiri uses 2-digit codes (`01`–`13`). Both codes are already on the
  geometry features in `data/fi-*.json`.
- Boundary geometry is from Tilastokeskus' WFS
  (`geo.stat.fi/geoserver/tilastointialueet/wfs`), layers
  `vaalipiiri4500k_<year>` and `kunta4500k_<year>`. License: **CC BY 4.0**
  — credit "Lähde: Tilastokeskus" somewhere visible (footer is fine).

Build a typed `ElectionDataSource` interface so the UI can be developed
against a stub and switched to live data without churn:

```ts
type RegionId = string;            // "091" for kunta, "01" for vaalipiiri
type ElectionId =                  // matches prototype/wf-workflows.jsx
  | `ek${number}` | `kunta${number}` | `alue${number}`
  | `eu${number}` | `pres${number}r${1|2}`;

interface RegionResult {
  regionId: RegionId;
  electionId: ElectionId;
  votes: number;                   // votes cast
  voters: number;                  // eligible voters
  turnout: number;                 // %, 0..100
  shares: Record<PartyId, number>; // %, 0..100, sums ~100
  candidates?: Candidate[];        // optional, lazy-loaded
}
```

## In-scope screens / views

### 1. Main dashboard (`V2_Focused`)

Single screen, three regions:

- **Top bar (row 1):** crumb (Koko Suomi › Uusimaa › Espoo), share-link pill,
  download menu, optional "Tweaks" affordance.
- **Workflow bar (row 2):** horizontal scroll of workflow pills + "＋ Custom"
  button that opens the formula popover. Selecting a pill applies the
  workflow immediately. Custom workflows show a small ✎/✕ on hover.
- **Map (left, ~62% width):** SVG, country/vaalipiiri/kunta level. Selected
  region thick stroke; hover shows label + tooltip; double-click drills
  in. ↑/↓ buttons drill in/out, Tab/Shift-Tab cycle siblings.
- **Ledger (right):** big-number TOTAL VOTES, party-share bar list, turnout,
  scrollable candidates list, "näytä ala-alueet" dropdown to jump to a child.

### 2. Custom workflow / formula builder

Popover anchored to the "＋ Custom" pill. WYSIWYG composer described in
`prototype/wf-suggest.jsx`. Three slot types per chip: election type, year
(or pres round), who (party or candidate). Selectors `$A`/`$B`/`$C` make
formulas reusable across elections. Operators `+ − × ÷ ( )` and numeric
literals. Live preview on the map while editing. Apply / Save as.

### 3. Compare view (variants)

Already prototyped in `prototype/wf-variants.jsx` — side-by-side artboards
for comparing settings. Lower priority for v1; can ship later.

### 4. Suggestions panel (lower priority)

`prototype/wf-suggest.jsx` also contains a recommended-formulas surface —
"You're looking at X, you might also want Y". Optional for v1.

## Interactions & behavior

- **Map drill-down**
  - Click region → select (updates ledger; siblings stay visible)
  - Double-click region → drill into it (e.g. vaalipiiri → its kunnat)
  - ↑ button or Esc → drill out
  - ↓ button → drill into currently selected region
  - Tab / Shift-Tab → cycle selection through siblings at current level
  - Breadcrumb segments are clickable
- **Hover tooltip:** show region label + current metric value + party share
- **Workflow pill click:** instant re-color
- **Formula chip click:** opens slot picker (type → year → who)
- **Selector binding:** when a formula has `$A`, ledger shows binding picker
- **Share link:** `#v=<base64-json>` of state; `replaceState` so back button
  is sane
- **localStorage keys:** `vk_workflows_v1` for custom workflows
- **Animations:** stroke-width on hover only (~120ms); no other motion

## State management

```ts
type AppState = {
  mode: 'winner'|'support'|'votes'|'change'|'formula';
  election: ElectionId;
  refElection: ElectionId;            // only used when mode==='change'
  focusParty: PartyId | null;         // null = "winner-relative"
  formulaTokens: FormulaToken[];      // mode==='formula'
  formulaBindings: Record<string, Binding>;  // {A:{type:'ek'}, ...}
  appliedWorkflowId: string | null;   // null when a built-in is active
  customWorkflows: Workflow[];        // persisted
  // Map navigation
  level: 'maa' | 'vp' | 'kunta' | 'aa';
  parentId: RegionId | null;
  selectedId: RegionId | null;
};
```

## Design tokens

Colors (from prototype CSS):
```
--ink:        #1a1a1a   /* primary text + lines */
--ink-soft:   #3a3a3a
--ink-mute:   #7a7a7a
--paper:      #fbf9f4   /* card background */
--paper-2:    #f4f0e6   /* soft inset */
--page-bg:    #efebe0   /* outer page */
--line:       #1a1a1a
--hair:       rgba(26,26,26,0.35)
--grid:       rgba(26,26,26,0.08)

/* Party accents */
--p-sdp:      #d94a4a
--p-kok:      #1f5a9c
--p-kesk:     #2e8f4a
--p-ps:       #2a4a7a
--p-vihr:     #4a9c3a
--p-vas:      #c94a2a
--p-rkp:      #e8b84a
--p-kd:       #4a6aa0

/* Diverging change ramp (colorblind-safe purple↔orange) */
#6a2c91, #b98ecb, #f0ead8, #f0a860, #c86a10

/* Single-hue support ramp (cream → blue) */
#f4f0e6, #dbe5ef, #a8c3dd, #6e9cc6, #3f76ad, #1f5a9c

/* Votes ramp (cream → ochre) */
#f4f0e6, #e6d9b8, #d1bc78, #a8913f, #6f5f1f
```

Typography:
- Display / headings: **Caveat** 700, ~18–28px
- Body / labels: **Architects Daughter**, 11–14px
- Mono values: **JetBrains Mono** 400/500
- Region labels on map: Architects Daughter, 8.5–11px

Spacing & shapes:
- Border radius: 4 (chip), 6 (button/box), 8 (card), 999 (pill)
- Border: 1.2–1.8px ink-black
- Drop shadow: `3px 3px 0 rgba(0,0,0,0.08–0.15)`
- Pills slightly rotated (`transform: rotate(-0.2deg)`) for the sketchy feel

## Geometry data (already prepared)

`data/fi-vaalipiirit.json` and `data/fi-kunnat.json` are the simplified,
projected-ready GeoJSON-like blobs we use in the prototype:

- Source: Statistics Finland WFS, `vaalipiiri4500k_2026` and
  `kunta4500k_2026`, simplified, coordinates rounded to 3–4 decimals,
  EPSG:4326 (WGS84 lon/lat).
- Each kunta feature carries `vp` (short id) so kunnat are pre-grouped by
  vaalipiiri; pre-computed via point-in-polygon at build time.
- Total size ~210 KB; ship as static assets or inline at build.

`prototype/wf-geo.jsx` shows how to project lon/lat into both the country
viewBox and per-vaalipiiri local viewBoxes. Re-use that math (or replace
with d3-geo's `geoIdentity().fitSize()` for less code).

## Assets / files in this bundle

- `prototype/Wireframes.html` — entry point, design tokens in `<style>`
- `prototype/app.jsx` — root, URL-hash sync, workflow apply/save logic
- `prototype/wf-variants.jsx` — main `V2_Focused` component (the dashboard)
- `prototype/wf-workflows.jsx` — workflow catalog, built-ins, election
  catalog (all elections, types, ids)
- `prototype/wf-suggest.jsx` — formula builder (chip composer)
- `prototype/wf-pieces.jsx` — small UI primitives (Crumb, ColorModeTabs,
  party list, etc.)
- `prototype/wf-map.jsx` — `HierarchyMap`, color ramps, formula evaluator
- `prototype/wf-geo.jsx` — projection of real geometry into SVG paths
- `prototype/design-canvas.jsx` — design-canvas chrome (drop in production)
- `data/fi-vaalipiirit.json`, `data/fi-kunnat.json` — geometry data
- `screenshots/` — reference screenshots of the prototype

## Acceptance criteria for v1

- All 13 vaalipiirit render at country level with real boundaries, hover &
  click states working
- Drill into any vaalipiiri → see its kunnat with real boundaries
- Four built-in workflows produce correct colorings against live PxWeb data
  for at least **eduskuntavaalit 2023** and **kuntavaalit 2025** (most
  recent past elections)
- Custom formula builder works for the most-common case:
  `<party> share (<election A>) − <party> share (<election B>)`
- Saved custom workflows persist across reloads
- Share link round-trips the full view (mode, election, party, formula,
  bindings) cleanly
- Lighthouse perf > 90 on a vaalipiiri-level page
- Footer shows: "Lähde: Tilastokeskus, vaalitilastot (CC BY 4.0)"

## Out of scope for v1

- Äänestysalue (level 3) real boundaries — keep placeholder or remove
- Real-time results on election night (PxWeb publishes after the fact;
  live results are vaalit.fi territory and have a different data shape)
- i18n beyond Finnish UI strings (add SV/EN later if desired)
- Mobile layout — design first targets desktop ≥1280; tablet/mobile is a
  follow-up
