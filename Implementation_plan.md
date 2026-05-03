# Implementation plan: Uusimaa / Finland Election Visualizer

## Context

Build a production replacement for the React-via-CDN prototype under
[prototype/](prototype/), reproducing the full mockup's functionality
against real Tilastokeskus data, deployed as a static SPA at
`vaalit.leinonensanteri.fi`.

## Hard constraints (decided)

- **Data: 100% from Vihreä MCP.** Reuse `vihrea-vaalidata-tilastotAPI-MCP`
  as a git submodule (PxWeb client + normalizer + query engine + area
  hierarchy). No second PxWeb adapter.
- **Architecture: build-time prefetch (Option C).** Election data
  fetched once at build time, emitted as JSON fixtures into
  `public/data/elections/`. Deployed app is 100% static. No runtime
  PxWeb fetch, no server, no DB, no auth.
- **Deploy: Caddy-direct, no Docker for the visualizer.** Server team
  confirmed pattern: `/opt/vaalit/dist:/srv/vaalit:ro`, GitHub Actions
  builds and pushes a `dist` branch the box `git pull`s.
- **DNS**: A `62.238.0.198` + AAAA `2a01:4f9:c014:52b3::1` for `vaalit`,
  grey-cloud (DNS-only) in Cloudflare.
- **Naming**: `vaalit` everywhere — subdomain, path on box,
  GitHub repo dist branch, service catalog entry.
- **Scope**: all elections currently in
  [prototype/wf-workflows.jsx:38](prototype/wf-workflows.jsx#L38)
  (ek 2027/2023/2019, kunta 2025/2021, alue 2025/2022, eu 2024/2019,
  pres 2024 r1/r2, 2018 r1, 2012 r1/r2). Future ones render
  "Ei tietoja" until results land.
- **Out of scope**: level-3 äänestysalueet, mobile, i18n beyond FI,
  election-night live results, SEO via path routes, authentication.

## Stack

- **Vite + React 18 + TypeScript** — direct prototype port; static
  output; fast dev loop.
- **Plain CSS variables + module CSS**; design tokens in
  `src/styles/tokens.css`. No Tailwind.
- **Vitest** for the deterministic computation layer (formula
  evaluator, color ramps, geometry projection, share-state codec).
- **html-to-image** for dashboard PNG export (already used by
  prototype; small dep).

## Repo layout

```
Uusimaa_election_visualizer/
├── Implementation_plan.md      # ← required (this file)
├── Logbook.md                  # ← required, append-only
├── BACKLOG.md                  # ← required
├── CLAUDE.md                   # ← required
├── README.md
├── PRODUCT_NOTES.md
├── audits/                     # populated before each ship
├── deploy/
│   └── Caddyfile.snippet       # ready-to-paste site block for server team
├── .github/workflows/
│   ├── build.yml               # build + push to `dist` branch
│   └── refresh-fixtures.yml    # weekly: re-run prefetch, open PR if changed
├── public/
│   ├── data/
│   │   ├── fi-vaalipiirit.json      # already present
│   │   ├── fi-kunnat.json           # already present
│   │   └── elections/               # build artifact, gitignored
│   │       ├── ek2023.json
│   │       └── …
│   └── attribution.txt
├── scripts/
│   └── build-fixtures.ts       # imports elections submodule, writes JSON
├── src/
│   ├── components/{Dashboard, HierarchyMap, WorkflowBar, WorkflowBuilder,
│   │                FormulaComposer, Crumb, DownloadMenu, DynamicLegend,
│   │                ElectionPicker, primitives/}.tsx
│   ├── data/{elections-source, geometry, catalog}.ts
│   ├── lib/{formula, color-ramps, share-state}.ts
│   ├── styles/{tokens, primitives}.css
│   ├── types/elections.ts
│   ├── App.tsx
│   └── main.tsx
├── submodules/
│   └── elections/              # vihrea-vaalidata-tilastotAPI-MCP, pinned SHA
├── prototype/                  # KEEP as visual reference, not built
├── data/                       # KEEP (geometry source); copies served from public/data/
├── screenshots/                # KEEP
├── .gitattributes              # * text=auto eol=lf
├── .gitignore                  # dist/, node_modules/, public/data/elections/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Phase 0 — Project files & scaffold

**Goal:** repo conforms to good-practices standards; dev server runs.

- [x] Create `Implementation_plan.md` in repo root (mirror of plan)
- [x] Create `Logbook.md` with first entry stamped at scaffold time
- [x] Create `BACKLOG.md` with priority groups (🔴/🟡/🟢)
- [x] Update existing `CLAUDE.md` to reflect new layout + workflow
- [x] Add `.gitattributes` (`* text=auto eol=lf`) — kills CRLF warnings
- [x] Add `.gitignore` (`dist/`, `node_modules/`, `public/data/elections/`)
- [x] Initialize Vite app (hand-rolled scaffold: `package.json`,
      `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`,
      `src/App.tsx`, `src/vite-env.d.ts`, `src/styles/main.css`)
- [x] Install runtime deps: `react`, `react-dom`, `html-to-image`
- [x] Install dev deps: `typescript`, `vite`, `vitest`,
      `@vitejs/plugin-react`, `@types/{react,react-dom,node}`, `eslint`,
      `tsx`
- [x] Add elections submodule:
      `git submodule add https://github.com/uuteen-alyyn/vihrea-vaalidata-tilastotAPI-MCP submodules/elections`
- [x] Pin submodule to a known-good SHA; record SHA in logbook
      *(pinned at `fc547e2`, 2026-04-30)*
- [x] Extract design tokens from
      [prototype/Wireframes.html](prototype/Wireframes.html) `<style>`
      block into `src/styles/tokens.css` + `src/styles/primitives.css`
- [x] Add Google Fonts link (Caveat, Architects Daughter, JetBrains
      Mono) in `index.html`
- [x] Stub `src/types/elections.ts` with `RegionId`, `PartyId`,
      `ElectionId`, `RegionResult`, `Workflow`, `FormulaToken`,
      `Binding`, `AppState`
- [x] Stub `src/data/elections-source.ts` with `ElectionDataSource`
      interface; one impl `LocalFixtureSource` (reads
      `/data/elections/{id}.json` lazily, in-memory cache)
- [x] Stub `src/data/catalog.ts` with `ELECTIONS` and `ELECTION_TYPES`
      ported from
      [prototype/wf-workflows.jsx:29](prototype/wf-workflows.jsx#L29)
- [x] Add `npm` scripts: `dev`, `build` (= `prefetch && tsc && vite build`),
      `prefetch`, `test`, `typecheck`, `lint`

**Acceptance test:**
- `npm run dev` opens at `http://localhost:5173` with tokens loaded
  (paper background, ink type)
- `npm run build` exits 0 (even though `prefetch` is still a stub)
- `npm test` exits 0 (no tests yet, but vitest configured)
- `npm run typecheck` exits 0

**Commit point:** `Phase 0: scaffold + good-practices project files`

---

## Phase 1 — Data layer (build-time prefetch)

**Goal:** `public/data/elections/{id}.json` exists for every known
election, generated by the elections submodule's loaders. The
visualizer's runtime layer can resolve a `(regionId, electionId) →
RegionResult` against fixtures.

- [x] Read `submodules/elections/src/{api,data}/` to identify the
      highest-level loaders. Confirm exact function signatures and
      record them in logbook.
- [x] Build `scripts/build-fixtures.ts`:
  - [x] Import elections submodule loaders + types (TS path mapping
        in `tsconfig.json` if needed)
  - [x] For each election in `src/data/catalog.ts`:
    - [x] Fetch all-vp results (single `loadPartyResults` call returns
          all area levels in one query for year-specific tables)
    - [x] Fetch kunta results, grouped by vp (same call)
    - [ ] Fetch top-N candidates per vp + kunta (N configurable, start
          at 40) — *deferred to Phase 1.x; see BACKLOG*
    - [x] Normalize into `RegionResult[]` per
          `src/types/elections.ts`
    - [x] Write `public/data/elections/{electionId}.json`
  - [x] For elections with no PxWeb data yet (future), write
        `{ status: "no_data" }` placeholder
  - [x] Cache PxWeb responses per-run (submodule's `withCache` does
        this; cached at `./cache-store.json`, gitignored)
- [x] Wire `npm run prefetch` → `tsx scripts/build-fixtures.ts`
- [x] Wire `npm run build` → `prefetch && typecheck && vite build`
- [x] `LocalFixtureSource.getRegionResult(regionId, electionId)` —
      lazy fetch + memoize per electionId
- [x] `LocalFixtureSource.listAreas(level, parentId, electionId)` —
      bulk lookup needed for map coloring
      *(parentId filter deferred to Phase 2 — needs vp/hv ↔ kunta
      mapping from geometry)*
- [x] Vitest tests:
  - [x] `elections-source.test.ts`: known fixture round-trips
        (mock fetch with sample JSON) — 11 tests
  - [x] `share-state.test.ts`: encode/decode round-trip — 11 tests
- [x] CI artifact size check: warn if `public/data/elections/` exceeds
      ~10MB (current rough budget) *(in `scripts/build-fixtures.ts`)*

**Acceptance test:**
- `npm run prefetch` populates `public/data/elections/` with valid
  JSON for every catalog election that has PxWeb data
- A small Node script can do
  `LocalFixtureSource.getRegionResult("uus", "ek2023")` and get a
  `RegionResult` with non-zero shares summing to ~100
- All vitest tests pass; logbook records test count
- `npm run build` exits 0

**Commit point:** `Phase 1: data layer + build-time fixtures via elections submodule`

---

## Phase 2 — Geometry + Map (first real-data milestone)

**Goal:** matches CLAUDE.md's milestone 1 — render eduskuntavaalit
2023 winners across all 13 vaalipiirit, then kunnat-level for one
vaalipiiri.

- [x] Port [prototype/wf-geo.jsx](prototype/wf-geo.jsx) →
      `src/data/geometry.ts`:
  - [x] Replace synchronous XHR with async `fetch('/data/fi-*.json')`
        (geometry copied from `/data/` → `/public/data/` by the
        prefetch script)
  - [x] Same equirectangular projection (LON 19.3..31.7, LAT 59.7..70.1,
        COS_LAT-corrected)
  - [x] Same per-vaalipiiri local projector for kunta drill-down
  - [x] Comment Vaasa-905 island edge case (per `PRODUCT_NOTES.md`)
- [x] Port `fillForRegion` from
      [prototype/wf-map.jsx:309](prototype/wf-map.jsx#L309) →
      `src/lib/color-ramps.ts`:
  - [x] Same thresholds for `winner`, `support`, `votes`, `change` modes
        *(`formula` mode stub returns NEUTRAL_FILL — Phase 3 wires
         the evaluator)*
  - [ ] Diverging vs single-hue auto-pick for formula *(Phase 3)*
- [x] Port `HierarchyMap` from
      [prototype/wf-map.jsx](prototype/wf-map.jsx) →
      `src/components/HierarchyMap.tsx`:
  - [x] Real-geometry SVG paths
  - [x] Hover/select stroke widths + transitions
  - [x] Smart-label rule (top ~28% by area at kunta level)
- [x] Wire `LocalFixtureSource` → `HierarchyMap` for `winner` mode
      against `ek2023`
- [x] Drill-down: country → vp → kunta works with real boundaries
- [x] Vitest tests:
  - [x] `geometry.test.ts`: projection determinism, COUNTRY_VIEWBOX
        round-trip, projectGeometry end-to-end (17 tests)
  - [x] `color-ramps.test.ts`: each mode's threshold boundaries
        (19 tests)

**Acceptance test:**
- Open `npm run dev` → 13 vaalipiirit colored by 2023 winner with real
  party colors and real boundaries
- Click Uusimaa → see all kunnat of Uusimaa colored by 2023 winner
- Hover on a kunta → label appears; click → ledger updates (ledger
  itself comes in Phase 3)
- All vitest tests pass; logbook records count and the milestone
- `npm run build && npm run typecheck` exit 0

**Commit point:** `Phase 2: real-data milestone — ek2023 winners on real geometry`

---

## Phase 3 — Dashboard, workflow bar, formula composer

**Goal:** every interactive feature from the prototype is reproduced
against real data.

- [x] Port `V2_Focused` from
      [prototype/wf-variants.jsx](prototype/wf-variants.jsx) →
      `src/App.tsx`:
  - [x] Top bar: `Crumb` (share-link pill + `DownloadMenu` are
        Phase 4 items)
  - [x] Workflow bar with built-ins + custom row + "+ Custom"
        trigger + Edit / Remove popovers
  - [x] Per-mode parameter row: `ElectionPicker`, party picker,
        change ref-vs-current, formula framing tabs, selector
        binding row
  - [ ] Map area with pan/zoom, ↑/↓/Tab navigation, sub-region
        popover, focus-party picker, dynamic legend *(Phase 4)*
  - [x] Ledger: TOTAL VOTES + party-share bars + turnout +
        **formula value block** (when active). Top candidates list
        deferred to Phase 4 (fixtures don't have candidates yet)
- [x] Port `WorkflowBar` + `WorkflowBuilder` from
      [prototype/wf-workflows.jsx](prototype/wf-workflows.jsx)
- [x] Port `BUILTIN_WORKFLOWS`, `WF_KINDS`, `workflowsEquivalent`,
      `workflowSubtitle` → `src/lib/workflow.ts` (kept in `lib/`
      since they're pure helpers; catalog.ts stays data-only)
- [x] Port `FormulaComposer` from
      [prototype/wf-suggest.jsx](prototype/wf-suggest.jsx) →
      `src/components/FormulaComposer.tsx`:
  - [x] Progressive type→year→who chip slots
  - [x] Selectors `$A/$B/$C` with late binding (binding picker in
        param row when a formula has selectors)
  - [x] Suggestion list, keyboard navigation (↑↓↵, ⌫ strips
        last field)
- [x] Port the formula evaluator from
      [prototype/wf-map.jsx:178](prototype/wf-map.jsx#L178) →
      `src/lib/formula.ts`:
  - [x] Shunting-yard + RPN, same logic
  - [x] Replace `regionData()` with caller-supplied `ResultLookup`
        closure (decoupled from `ElectionDataSource` so tests stay
        pure; production wraps a pre-loaded Map)
  - [x] Three framings: `absolute`, `share`, `vsSelected`
  - [x] `formulaRange` across visible regions
- [x] localStorage persistence: `vk_workflows_v1` (preserve key for
      forward compat) — load on mount, persist on every
      `customWorkflows` change
- [x] URL hash share: `#v=<base64-json>` — codec ready since Phase 1;
      App now writes mode/election/refElection/focusParty to the
      hash on every change and reads from it on initial mount
- [x] Vitest tests:
  - [x] `formula.test.ts`: precedence, parens, division-by-zero,
        unbound selector → error, missing data → error (40 tests)
  - [x] `workflow.test.ts`: `workflowsEquivalent`, builtin matching,
        localStorage round-trip with cleanup-on-read (22 tests)
  - [x] `share-state.test.ts`: every state shape round-trips
        (already in Phase 1; 11 tests)

**Acceptance test:**
- All four built-in workflows (winner, support%, votes, change) render
  correct colorings against `ek2023` and `ek2019`
- "Change in support" works for `ek2019 → ek2023` with diverging ramp
- Build a custom formula `KOK % (EK 2023) − KOK % (EK 2019)`, save it,
  reload page → custom pill is back, click it → same coloring restores
- Selectors: build `$A % (EK 2023) − $A % (EK 2019)`, save, switch
  `$A` from KOK to SDP via the binding picker → map recolors
- "Share link" → paste in new tab → identical view
- All vitest tests pass; logbook records count
- `npm run build && npm run typecheck && npm test` exit 0

**Commit point:** `Phase 3: dashboard + workflow bar + custom formula composer`

---

## Phase 4 — Polish, exports, accessibility, audit

**Goal:** feature-complete and audited; ready to ship.

- [x] SVG download (map only) — `lib/exports.ts` `downloadMapSvg`,
      inlines design-token CSS so the file renders standalone
- [x] PNG download (map only) — `downloadMapPng` rasterises the
      SVG via canvas at 2× scale on a paper-coloured background
- [x] PNG download (whole dashboard) — `downloadDashboardPng`
      via `html-to-image` over the dashboard-ref subtree
- [x] Footer attribution: already in place since Phase 2
- [x] Accessibility:
  - [x] Tab cycles map regions — SVG is single tab stop with
        `role="application"`; Tab/Arrow keys cycle siblings,
        Enter drills in
  - [x] `:focus-visible` global ring (2px ink outline);
        skip-to-map link for keyboard users
  - [x] ARIA labels on Crumb, ShareLinkPill, DownloadMenu,
        WorkflowBar pills, region paths, dashboard landmarks
  - [x] Color is never the only signal — ledger always shows
        text + numeric value alongside the map fill
  - [/] Min text size 12px — body text 13–14px; small uppercase
        tracked labels (10–11px) kept since they're decorative
        chrome, not body content. Documented in ship audit.
- [ ] Empty/loading/error states:
  - [ ] Loading: sketchy "Loading…" stamp on map area; party-share
        rows dashed
  - [ ] No data for region/election: crosshatch `.nodata` fill,
        tooltip "Ei tietoja"
  - [ ] Invalid formula: inline error in builder; map keeps last valid
- [ ] Lighthouse audit at country level + at one vp drill-down:
  - [ ] Perf > 90 acceptance criterion (README)
- [ ] Pre-ship audit document `audits/SHIP_AUDIT_<date>.md` covering:
  - [ ] All 5 data shapes from `src/types/elections.ts` are
        consistent across loader, evaluator, and UI
  - [ ] Every error path returns a useful message (per
        `CLAUDE CODE_GOOD PRACTICES.md` → "Error responses")
  - [ ] No orphaned helpers (every export reachable from a route)
  - [ ] All output keys are stable (no runtime-constructed keys)
  - [ ] Findings categorized 🔴/🟡/🟢; 🔴 + 🟡 fixed before ship

**Acceptance test:**
- All download buttons produce valid files (open in viewer)
- Keyboard-only walkthrough completes the core flow (drill, switch
  workflow, build formula, share link)
- Lighthouse perf ≥ 90 at country and vp levels
- `audits/SHIP_AUDIT_<date>.md` exists with no remaining 🔴/🟡 issues
- Footer attribution visible
- All vitest tests pass

**Commit point:** `Phase 4: polish + exports + a11y + ship audit`

---

## Phase 5 — Deploy

**Goal:** `https://vaalit.leinonensanteri.fi` is live and serving the
built artifact.

- [ ] Commit ready-to-paste `deploy/Caddyfile.snippet`:
      ```
      vaalit.leinonensanteri.fi {
          root * /srv/vaalit
          file_server
          encode zstd gzip
          try_files {path} /index.html
      }
      ```
- [ ] GitHub Actions `build.yml`:
  - [ ] Trigger: push to `main`, manual dispatch
  - [ ] Steps: checkout `--recurse-submodules`, `npm ci`, `npm run
        build`, push `dist/` to a `dist` branch
- [ ] GitHub Actions `refresh-fixtures.yml`:
  - [ ] Trigger: weekly cron + manual dispatch
  - [ ] Re-run `scripts/build-fixtures.ts`; if diff, open PR
- [ ] DNS: add A `62.238.0.198` + AAAA `2a01:4f9:c014:52b3::1`
      for `vaalit`, grey-cloud
- [ ] Server team applies (with our snippet):
  - [ ] Caddyfile site block
  - [ ] `/opt/vaalit/dist:/srv/vaalit:ro` mount in caddy
        docker-compose
  - [ ] Initial `git clone -b dist` into `/opt/vaalit/`
- [ ] Smoke test against live URL:
  - [ ] All 4 built-in workflows render correctly on `ek2023`
  - [ ] Drill into 3 different vaalipiirit; kunnat boundaries correct
  - [ ] Share a custom-formula URL; reload; state restores
  - [ ] Lighthouse audit on production URL ≥ 90
  - [ ] Footer attribution visible
- [ ] Update `README.md` with build/deploy instructions
- [ ] Update `CLAUDE.md` with the new file map

**Acceptance test:**
- Production URL loads successfully and passes the smoke test
- Logbook entry records: deploy time, dist branch SHA, server team
  confirmation, Lighthouse production scores

**Commit point:** `Phase 5: ship to vaalit.leinonensanteri.fi`

---

## Functions to reuse (with paths)

From the prototype:

- [prototype/wf-geo.jsx:39](prototype/wf-geo.jsx#L39) `projCountry()` —
  equirectangular projection
- [prototype/wf-geo.jsx:47](prototype/wf-geo.jsx#L47)
  `makeLocalProjector()` — per-vaalipiiri kunta projection
- [prototype/wf-map.jsx:178](prototype/wf-map.jsx#L178) `evalFormula()`
  — shunting-yard + RPN
- [prototype/wf-map.jsx:309](prototype/wf-map.jsx#L309)
  `fillForRegion()` — color-ramp thresholds
- [prototype/wf-map.jsx:272](prototype/wf-map.jsx#L272) `applyFraming()`
- [prototype/wf-suggest.jsx:128](prototype/wf-suggest.jsx#L128)
  `buildSuggestions()`
- [prototype/app.jsx:7](prototype/app.jsx#L7) URL hash codec

From the elections submodule (paths to confirm during Phase 1):

- `submodules/elections/src/api/pxweb-client.ts` — PxWeb HTTP client
- `submodules/elections/src/data/election-tables.ts` — table registry
- `submodules/elections/src/data/loaders.ts` — high-level fetchers
- `submodules/elections/src/data/normalizer.ts` — JSON-stat → flat
  results
- `submodules/elections/src/data/area-hierarchy.ts` — vp/kunta/aa
  relationships

## Verification (full)

End-to-end:

1. `git clone --recurse-submodules <repo> && cd Uusimaa_election_visualizer`
2. `npm ci`
3. `npm run build`
4. `npm run dev` → open `http://localhost:5173`
5. Walk the acceptance tests for Phases 2 → 4

Unit (`npm test`):

- `formula.test.ts`, `color-ramps.test.ts`, `geometry.test.ts`,
  `share-state.test.ts`, `elections-source.test.ts`,
  `workflow.test.ts`

Production (after Phase 5):

- Lighthouse against `https://vaalit.leinonensanteri.fi` and a
  drilled-in vp URL — record scores in `Logbook.md`

## Commit & push discipline (per `CLAUDE CODE_GOOD PRACTICES.md`)

- Commit at the marked phase boundary, never in the middle
- Pre-commit gate: `npm run build` ✓, `npm test` ✓, count recorded
- Stage files explicitly by name; never `git add .`
- Push to `origin main` after every commit (remote is source of truth)
- After every phase, append a `Logbook.md` entry **before** moving on:
  files changed, build status, test count, commit hash, decisions
- Update `BACKLOG.md` whenever the user mentions work that won't be
  done immediately; remove items only when they explicitly say
  "done / dropped"

## Open items / followups (do not block start)

- **Subdomain confirmation**: `vaalit.leinonensanteri.fi` is the
  server team's recommendation; user should confirm the exact name
  before DNS records are added
- **CI dist-branch mechanism**: starting with a `dist` branch (server
  team accepts both that and release tarballs); revisit if branch
  history grows unwieldy
- **`prototype/` retention**: keep until Phase 4 ship; then move to
  `reference/` or delete
- **`design-canvas.jsx`**: drop entirely — no analog needed in the
  production app
- **First-time elections-submodule SHA pin**: pin to current
  `vihrea-vaalidata-tilastotAPI-MCP` `main` HEAD at scaffold time;
  bump deliberately when the upstream gets a useful change
