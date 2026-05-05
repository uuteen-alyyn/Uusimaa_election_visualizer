# Implementation plan: polished mobile layout

## Context

The desktop app shipped (`vaalit.leinonensanteri.fi`) and the
`@media (max-width: 1100px)` fallback already collapses the
3-column grid to one when narrow — opening the live URL on a
phone today *renders*, but it's not built for thumbs:

- Pills + chips are 22-26 px tall; iOS HIG is 44 px minimum.
- Native `<select>` elements have 13 px font-size, which makes
  iOS Safari auto-zoom on focus.
- Map's SVG sizes by height (fills the column) — on a stacked
  layout that means the SVG runs the full vertical height
  available, leaving the ledger pushed off-screen.
- AA-level grid for Helsinki (167 squares) is a finger-trap.
- Hover-only labels on the map don't show on touch.
- Composer's suggestion dropdown lands under the iOS keyboard.

This plan turns the existing soft fallback into a deliberate
mobile layout: same feature set, sized for fingers, no
hover-only affordances, no keyboard collisions. Out of scope:
PWA install, offline support, app shell, different navigation
paradigm.

## Hard constraints

- **No new data, no new logic.** CSS + a few targeted React
  changes. Vitest suite stays green untouched.
- **No new dependencies.** No mobile-detect lib, no UI framework.
  Browser media queries + CSS are enough.
- **Desktop must not regress.** Every change gates on
  `@media (max-width: 640px)` or similar; existing rules
  outside that block are preserved.
- **Two breakpoints total**: `1100px` (existing, stacks columns)
  and `640px` (new, mobile touch tuning). No third for landscape
  phones — `dvh` units handle orientation flips.

## Phase 1 — Layout & viewport (~30 min)

**Goal**: stacked layout works correctly without forcing the
ledger off-screen, and the map fits horizontally instead of
vertically when the page is narrow.

- [ ] In [src/styles/main.css](src/styles/main.css): replace
      `height: 100vh` with `height: 100dvh` on `.page` so iOS
      Safari's URL bar doesn't push content under the bottom of
      the screen.
- [ ] Add a `@media (max-width: 1100px)` extension (the block
      already exists at line ~165) that sets:
      - `.col-center .map-frame { flex: 0 0 auto; max-height: 60dvh; width: 100%; }`
      - `.col-center .map-frame > svg { width: 100%; height: auto; max-height: 100%; }`
      Switches the SVG from "fill the column height" to "fill
      the column width", capped at 60% of viewport height so the
      ledger underneath stays useful without scrolling forever.
- [ ] New `@media (max-width: 640px)` block at the bottom of
      main.css for everything else:
      - `.page { padding: 12px 12px 8px; gap: 8px; }`
      - `.col { gap: 8px; }`
      - `.col-left h1 { font-size: 22px; }` (down from 26)

**Acceptance**: open `npm run dev` in Chrome DevTools at
390×844 (iPhone 14). Map fills width, ledger sits below at full
width and is scrollable internally. No horizontal scroll on the
page itself.

## Phase 2 — Touch targets (~45 min)

**Goal**: every interactive element is at least 36 px tall on
mobile (relaxing iOS's 44 px slightly to keep dense controls
manageable; native `<select>` arrives at 36-40 px naturally).

- [ ] In [src/styles/primitives.css](src/styles/primitives.css):
      add a `@media (max-width: 640px)` block:
      - `.pill { padding: 8px 14px; min-height: 38px; font-size: 14px; }`
      - `.pill.on { … }` — keep the active treatment, just
        re-apply with the new sizing.
      - `.swatch { width: 14px; height: 14px; }` (up from 10)
      - `.bar-row { gap: 10px; }` (up from 8)
- [ ] In [src/components/ElectionPicker.tsx](src/components/ElectionPicker.tsx)
      and [src/components/MittariDropdown.tsx](src/components/MittariDropdown.tsx):
      add a media-conditional inline style — `font-size: 16px`
      on the `<select>` when below 640px (iOS auto-zooms inputs
      with font-size < 16). Easiest path: style hook on
      `prefers-reduced-data` not relevant here; do this via
      a CSS rule targeting `select` inside the chip area instead.
- [ ] In [src/components/FormulaComposer.tsx:660](src/components/FormulaComposer.tsx#L660):
      bump the chip ✕ remove button on mobile — `font-size: 16px;
      padding: 4px 8px; min-width: 28px; min-height: 28px;`.
- [ ] In main.css: `body { -webkit-tap-highlight-color: transparent; }`
      so taps don't get the default blue flash. The existing
      `:focus-visible` ring keeps keyboard users covered.

**Acceptance**: in DevTools mobile emulation, every pill in the
left column is at least 36 px tall measured by the inspector.
Tapping a `<select>` in iOS Safari (real device) doesn't
trigger zoom-on-focus.

## Phase 3 — Hover-only affordances (~30 min)

**Goal**: nothing critical depends on `:hover` or `onMouseEnter`
firing.

- [ ] In [src/components/HierarchyMap.tsx](src/components/HierarchyMap.tsx):
      the hover-overlay block at line ~378 (`showHoverBg` rect
      drawn before the `<text>`) is purely a hover affordance —
      it shows the kunta name on rollover for kunnat that aren't
      in the `labelable` set. On touch this fires on first tap
      then competes with `onClick`. Gate it on a CSS media
      query: render the rect always, but hide it via
      `@media (hover: none) { .hover-only { display: none; } }`
      where the rect carries `className="hover-only"`. Selected
      / hovered state still updates because tap → `onPick` →
      `selected` already shows the label.
- [ ] Verify `onMouseEnter` / `onMouseLeave` on the map paths
      don't cause "stuck hover" bugs on iOS. If they do, gate
      the handlers via a `(hover: hover)` matchMedia check at
      mount and skip them on touch devices.

**Acceptance**: tap a kunta on a phone — the ledger updates
immediately, no double-tap needed. No "ghost label" hangs over
a kunta after navigation.

## Phase 4 — Helsinki callout + AA list view (~1 h)

**Goal**: the smallest tap targets on the map become realistic
on mobile.

- [ ] In [src/components/HierarchyMap.tsx:289-360](src/components/HierarchyMap.tsx#L289):
      bump the Helsinki callout square's `sqSize` from 18 to
      28 on mobile, and reposition the leader-line endpoint
      accordingly. Either via `useState`+`window.matchMedia`
      hook or by exposing a `compact` prop set in App.tsx
      based on a media-query effect.
- [ ] At AA level, add a "list view" toggle on mobile:
      - New small icon-pill in the right column's actions row
        ("Kartta / Lista") visible only when `level === "aa"`.
      - List view replaces the SVG with a vertical scrollable
        list: each AA renders as one row with its label, a
        winner-party swatch, and the focus-party share. Tap to
        select (same `onPick` plumbing). Reuses the existing
        `aaResults` data — no new fetch.
      - State: `aaViewMode: "map" | "list"`, default to `"list"`
        when `window.matchMedia("(max-width: 640px)").matches`,
        else `"map"`.
- [ ] Bump per-AA SVG square size on mobile too (when user
      stays in map view) — increase the per-row count divisor
      so squares are ~36 px instead of ~24.

**Acceptance**: drill into Helsinki → switch to AA → list view
appears by default on mobile, scrollable, each row ≥ 44 px tall.
Toggle back to map view → squares are tappable without zoom.
Helsinki vp callout square at country view is comfortable to
tap with a thumb.

## Phase 5 — Composer + modals (~45 min)

**Goal**: the formula composer and modal sheets work with the
on-screen keyboard up.

- [ ] In [src/components/FormulaComposer.tsx](src/components/FormulaComposer.tsx)
      around the suggestion dropdown (line ~339): when the
      viewport is narrow, switch the dropdown from
      `position: absolute; top: calc(100% + 4px)` to a
      fixed-position bottom-sheet:
      `position: fixed; left: 8px; right: 8px; bottom: 8px;
      max-height: 50dvh; z-index: 100`. Keyboard sits below it,
      suggestions scroll above the user's thumbs.
- [ ] In [src/components/WorkflowBuilder.tsx:141](src/components/WorkflowBuilder.tsx#L141):
      switch the modal from a centered card to a full-screen
      sheet on mobile — `width: 100%; height: 100dvh;
      max-height: 100dvh; padding: 12px; border-radius: 0`.
      The selector-binding row inside should already wrap;
      verify.
- [ ] In the `HelpBox` modal (App.tsx, search for `HelpBox`):
      collapse the inner `gridTemplateColumns: "1fr 1fr 1fr"`
      to single column on mobile.
- [ ] Verify the `LisaasetuksetButton`-replaced inline toggles
      (`ExtraTogglesInline` in App.tsx) wrap reasonably at 390 px.
      They already use `flex-wrap: wrap`; just confirm with the
      DevTools inspector.

**Acceptance**: open the formula composer on a real phone, type
"kok" — suggestion list shows above the keyboard, scrollable,
all entries tappable. Save the kaava — modal is the full screen,
"Tallenna" / "Peruuta" buttons reachable with one thumb.

## Phase 6 — Type sizing + footer + final pass (~30 min)

**Goal**: text comfortable to read on a 390 px screen, no
orphaned glyphs, no horizontal scroll anywhere.

- [ ] In main.css mobile block: bump body font-size to 15px
      (was 13). Restore `ParamLabel` to 11px (was 10) on mobile
      — small uppercase labels need the bump.
- [ ] In [src/App.tsx](src/App.tsx) footer block: verify the
      "Lähde: Tilastokeskus … · Tilastointialueet …" wraps
      cleanly (it's already inside `<small>` with
      `flex-wrap: wrap`). On a 390 px screen the "·" separators
      should not become orphaned.
- [ ] Audit pass against the live `vaalit.leinonensanteri.fi`
      on the user's actual phone (iOS Safari + Android Chrome).
      Fix anything that surfaces.

**Acceptance**: reading the ledger party-share rows feels
comfortable, not squinty. Footer attribution is on one to two
clean lines, no awkward dangling separator. No element causes
horizontal page scroll.

## Files touched

CSS-heavy by design — most components only get a small
media-conditional tweak:

- [src/styles/main.css](src/styles/main.css) — layout, dvh,
  mobile padding, hover-only gate (~50 lines added)
- [src/styles/primitives.css](src/styles/primitives.css) —
  pill / swatch / bar touch sizes (~25 lines added)
- [src/components/HierarchyMap.tsx](src/components/HierarchyMap.tsx) —
  hover-overlay class, callout sizing, AA list-view sub-component
  (~80 lines, one new internal component)
- [src/components/FormulaComposer.tsx](src/components/FormulaComposer.tsx) —
  bottom-sheet dropdown on mobile (~10 lines media-conditional)
- [src/components/WorkflowBuilder.tsx](src/components/WorkflowBuilder.tsx) —
  full-screen sheet on mobile (~10 lines)
- [src/App.tsx](src/App.tsx) — `aaViewMode` state, HelpBox grid
  collapse, list-view toggle wiring (~20 lines)

No changes to:

- Data layer ([src/data/](src/data/), [scripts/](scripts/))
- Types ([src/types/elections.ts](src/types/elections.ts))
- Pure-function libs ([src/lib/](src/lib/))
- Tests — vitest suite stays untouched and stays green

## Verification

End-to-end:

1. **Desktop regression**: `npm run dev`, open at 1920×1080.
   Walk the smoke-test from `deploy.md`. Nothing should look
   different from the current desktop experience.
2. **DevTools mobile emulation**: switch to "iPhone 14"
   (390×844) in Chrome DevTools. Repeat the smoke-test. The
   layout should be vertical, every interactive element should
   be tappable with the mouse cursor (proxy for finger).
3. **Real device test**: deploy to `dist`, open the live URL
   on iOS Safari + Android Chrome. Walk:
   - Country view loads, paper background, callout square
     visible and tappable for Helsinki.
   - Drill Uusimaa → kunnat. Tap a kunta → ledger updates.
     Drill again → AA list view appears (or map view, tap
     the toggle).
   - Switch mittari to "Kannatuksen muutos" + Vertailuvaali
     EK 2019 → diverging ramp renders, mittayksikkö toggle
     reachable.
   - Open formula composer (`+ Uusi mukautettu kaava…`),
     build `Kok % (EK 2023) − Kok % (EK 2019)`, save.
     Reload page — saved pill is back, tap → coloring
     restores.
   - Tap "Jaa linkki" → URL copied. Paste in a new tab on
     desktop → identical view.
4. **Vitest**: `npm test` passes (168 tests unchanged).
5. **Typecheck + build**: `npm run typecheck` clean,
   `npm run build` produces `dist/`.

## Time estimate

Realistic: **5-7 hours** focused work, broken roughly:

- Phase 1-3: 2 h (the easy CSS / breakpoint work, biggest
  visual change for least effort)
- Phase 4: 1 h
- Phase 5: 1 h
- Phase 6 + cross-device testing: 1-2 h
- Buffer for things discovered during real-device testing: 1 h

If scope needs to shrink, **Phases 1+2+3 alone (~2 h)** get
80% of the value: layout works, things are tappable, no hover
bugs. Phases 4-6 are polish on top.

## Out of scope

- PWA install / offline / service worker
- Different navigation paradigm (drawer, bottom-tab, etc.)
- Different feature set on mobile vs desktop
- Tablet-specific layout (640-1100 px range — they get the
  current "stacked but generously sized" experience without
  mobile touch tuning, which is fine for fingers + bigger
  screens)
- Pinch-zoom on the AA SVG (mentioned earlier as an
  alternative to list-view; list-view is simpler and meets
  the user's mental model — pinch-zoom can be a v2 if the
  list view feels insufficient)
- Landscape-phone-specific tweaks beyond what `dvh` gives
  for free

## Commit boundaries

One commit per phase, message format `feat(mobile): phase N
— <what>`. Pre-commit gate: typecheck ✓, vitest ✓, vite build
✓, manual smoke-test in DevTools mobile emulation ✓.
