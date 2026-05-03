# Logbook — Uusimaa / Finland Election Visualizer

Append-only. New entries at the bottom. Never remove or rewrite past
entries — they are the project's audit trail.

Each entry follows the format from `CLAUDE CODE_GOOD PRACTICES.md`:
files changed, build status, test count, commit hash, decisions, notes.

---

## ENTRY Project planning session 2026-05-03

**What was done**

- Read the full prototype source (~3,900 lines JSX), README, and
  `PRODUCT_NOTES.md` to ground the new work in the existing design
- Initialized git repository in `Uusimaa_election_visualizer/`,
  pushed initial commit to
  `https://github.com/uuteen-alyyn/Uusimaa_election_visualizer`
  (public personal repo) — 24 files, 4,559 insertions
- Inspected the Vihreä MCP repo and the
  `vihrea-vaalidata-tilastotAPI-MCP` submodule to confirm the
  elections code is reusable
- Drafted full implementation plan; user reviewed and approved
- Created the four required project files per
  `CLAUDE CODE_GOOD PRACTICES.md` (`Implementation_plan.md`,
  `Logbook.md`, `BACKLOG.md`, replaced `CLAUDE.md`)

**Decisions**

- **Architecture: Option C — build-time prefetch via the elections
  submodule.** Static SPA; no runtime data fetch; election results
  don't change post-publish so prefetching once is the natural fit.
- **Data source: 100% from Vihreä MCP.** The
  `vihrea-vaalidata-tilastotAPI-MCP` code is added as a git submodule
  during Phase 0; no parallel PxWeb adapter.
- **Stack: Vite + React 18 + TypeScript** for fast dev loop, easy
  static output, and minimal migration cost from the existing React
  prototype. Plain CSS variables (no Tailwind) for the small token set.
- **Scope: every election currently in
  `prototype/wf-workflows.jsx` catalog** — ek 2027/2023/2019, kunta
  2025/2021, alue 2025/2022, eu 2024/2019, pres 2024 r1/r2, 2018 r1,
  2012 r1/r2. Future ones render "Ei tietoja" until results land.
- **Out of scope for v1**: level-3 äänestysalueet, mobile, i18n beyond
  Finnish, election-night live results, SEO via path routes,
  authentication.
- **Deploy: Caddy-direct, no Docker container** at
  `vaalit.leinonensanteri.fi` (subdomain TBC). Server team confirmed:
  GitHub Actions builds the `dist` branch; box `git pull`s; on-disk
  path `/opt/vaalit/dist/` mounted into Caddy as `/srv/vaalit:ro`.
  DNS: A `62.238.0.198` + AAAA `2a01:4f9:c014:52b3::1`, grey-cloud
  in Cloudflare.
- **Naming convention**: `vaalit` everywhere — subdomain, on-disk
  path, dist branch, service catalog entry. Per server team's
  good-practice flag from the kuntakello incident (one name, used
  consistently).

**Files changed**

- Created `Implementation_plan.md` (mirror of approved plan)
- Created `Logbook.md` (this file)
- Created `BACKLOG.md` (priority-grouped queue with initial items)
- Replaced `CLAUDE.md` (post-scaffold version: session-start ritual,
  good-practices reference, hard constraints, file map)

**Build status**

- n/a (no code yet — these are project-doc files only)

**Test count**

- n/a (no tests yet)

**Commit hash**

- `3593c71` — `Phase 0 (1/4): required project files per good practices`
- Initial commit `58939ca` (24 files, 4,559 insertions) covers the
  prototype handoff bundle and was made earlier today

**Notes**

- Full implementation plan is in `Implementation_plan.md`. After this
  commit, the rest of Phase 0 follows: `.gitattributes`, `.gitignore`,
  Vite scaffold, deps install, elections submodule, design-token
  extraction, type stubs.
- Reference doc: `CLAUDE CODE_GOOD PRACTICES.md` (committed at the
  repo root in this commit) is the source of truth for project
  standards across the user's projects.

---

## ENTRY Phase 0 (2/4) — Vite + React + TS scaffold 2026-05-03

**What was done**

- Hand-rolled Vite + React 18 + TypeScript scaffold (no `npm create
  vite`; we already had docs in the dir, so writing the files
  directly was cleaner than wrestling with the interactive prompt)
- Wrote tooling config: `.gitattributes` (LF-only, kills CRLF
  warnings), `.gitignore` (adds `dist/`, `.vite/`,
  `public/data/elections/`, `coverage/`)
- Wrote project files: `package.json`, `tsconfig.json` (strict + `noEmit`,
  Bundler module resolution, `noUncheckedIndexedAccess`),
  `vite.config.ts`, `index.html` with Google Fonts preload (Caveat /
  Architects Daughter / JetBrains Mono)
- Wrote skeleton React app: `src/main.tsx`, `src/App.tsx` (placeholder
  with footer attribution stub), `src/vite-env.d.ts`,
  `src/styles/main.css` (placeholder; full token extraction in
  Phase 0 (3/4))
- Wrote `scripts/build-fixtures.ts` as a no-op stub so
  `npm run prefetch` exits 0 — Phase 1 will wire it to the elections
  submodule's loaders
- `npm install` — 198 packages installed, lockfile generated
- Verified pre-commit gates: `npm run typecheck` ✓,
  `npm run build` ✓ (1.14s, output 46 KB gzipped JS),
  `npm test` ✓ (`--passWithNoTests` flag added so 0 tests exits 0)

**Decisions**

- **Hand-rolled Vite scaffold** instead of running `npm create vite@latest`,
  since the project directory already contained docs/data/prototype.
  Same final layout, no surprises.
- **Single `tsconfig.json`** with `noEmit: true` (Vite handles
  bundling) — simpler than the dual `tsconfig.app.json` +
  `tsconfig.node.json` template Vite scaffolds by default. Includes
  both `src/` and `scripts/` so the prefetch script is type-checked.
- **`--passWithNoTests` on `vitest run`** so the test gate doesn't
  block early phases. Removed if/when we want CI to fail on
  accidentally-wiped test files.
- **Vulnerabilities**: `npm audit` reports 5 moderate, all variants
  of esbuild's dev-server CORS (transitively via vitest's bundled
  vite). Dev-only. Not blocking. Tracked in BACKLOG (🟡).

**Files changed**

- New: `.gitattributes`, `.gitignore` (replaces the earlier
  pre-scaffold version), `package.json`, `package-lock.json`,
  `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`,
  `src/App.tsx`, `src/vite-env.d.ts`, `src/styles/main.css`,
  `scripts/build-fixtures.ts`
- Modified: `Implementation_plan.md` (Phase 0 task checkboxes),
  `Logbook.md` (this entry + backfilled hash for previous entry),
  `BACKLOG.md` (added esbuild dev-server audit item)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.14s, 46.40 KB gzipped JS bundle
- `npm test` — 0 tests, exits 0

**Test count**

- 0 / 0 (no tests yet; first batch arrives in Phase 1 for
  `share-state.test.ts` and Phase 2 for geometry + color-ramps)

**Commit hash**

- Pending this session (will be backfilled in the next entry)

**Notes**

- Vite resolved to 6.4.2 (not the 6.0.7 minimum I declared). 6.4.2
  passes the top-level esbuild advisory; the audit warnings remaining
  come from vitest's nested vite. Dev-only.
- The dev server smoke test (`npm run dev`) was deferred to manual
  verification. The build artifact is valid; user can open
  `http://localhost:5173` after running `npm run dev`.
- Next: Phase 0 (3/4) adds the elections submodule + extracts the
  full design-token system from `prototype/Wireframes.html` into
  `src/styles/tokens.css` and `src/styles/primitives.css`.

---

## ENTRY Phase 0 (3/4) — elections submodule + design tokens 2026-05-03

**What was done**

- Added `submodules/elections/` via
  `git submodule add https://github.com/uuteen-alyyn/vihrea-vaalidata-tilastotAPI-MCP submodules/elections`
  Pinned at `fc547e2` (`feat(query): add top_n + top_by post-filters
  to query_election_data`, 2026-04-30T15:52:22+03:00).
- Extracted the full design-token system from
  `prototype/Wireframes.html`'s `<style>` block into:
  * `src/styles/tokens.css` — all CSS custom properties: surfaces
    (ink/paper variants), 8 party hues, change indicators, the three
    map ramps (diverging change, single-hue support, ochre votes),
    typography stack, shape tokens (radii, borders), drop shadows
  * `src/styles/primitives.css` — class definitions for the
    hand-drawn UI primitives: `.box`, `.pill`, `.chip`, `.btn`,
    `.tabs`/`.tab`, `.bar-row`, `.bar`, `.swatch`, `.dot`, `.hair`,
    `.note`, `.scribble`, `.uline`, `.scalebar`, `.nodata`, `.crumb`,
    `.stamp`. All reference token variables — no hard-coded colors.
  * `src/styles/main.css` rewritten as the entry: imports
    `tokens.css` + `primitives.css`, then page-level globals.
- Vitest picked up tests from the elections submodule on first run
  (3 failed, 6 passed, 100 individual). Added a separate
  `vitest.config.ts` excluding `**/submodules/**` and
  `**/prototype/**` from discovery. Vite config stays clean.

**Decisions**

- **Separate `vitest.config.ts`** instead of folding `test:` into
  `vite.config.ts`. Vitest's bundled vite is older than top-level
  vite (6.4.2), and the type-augmentation dance through
  `vitest/config` triggers TS errors due to the version mismatch.
  Separate config files avoid the conflict cleanly.
- **Token comments** preserved in `tokens.css` — palette names match
  the README and PRODUCT_NOTES.md so future readers can cross-reference.
- **`.crumb`, `.scalebar`, `.nodata`, `.stamp`** ported now even
  though they're used in Phase 2/3/4 components. Better to have the
  whole primitives surface in one PR than to split.
- **Skipped**: the prototype's `.i-zoom-in`/`.i-search` etc. pseudo-
  icon classes — too tied to the prototype's CSS-only icon trick.
  Phase 3 will use real SVG icons or text glyphs as needed.

**Files changed**

- New: `.gitmodules`, `submodules/elections` (gitlink at `fc547e2`),
  `src/styles/tokens.css`, `src/styles/primitives.css`,
  `vitest.config.ts`
- Modified: `vite.config.ts` (drop the `test:` block; vitest reads
  `vitest.config.ts` instead), `src/styles/main.css` (now imports
  tokens + primitives + page-level globals only)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.43s, 46 KB gz JS, 1.53 KB gz CSS
- `npm test` — 0 visualizer tests, exits 0 (submodules excluded)

**Test count**

- 0 / 0 (visualizer has no tests yet; first batch lands in Phase 1)

**Commit hash**

- Pending this session

**Notes**

- Submodule install was clone-only — submodule's own `npm install`
  is not run. We don't need its node_modules; Phase 1 will figure out
  whether to import the submodule's source directly (with `tsx`)
  or build it first.
- Bundle CSS jumped from 0.44 KB → 4.55 KB (1.53 KB gz) reflecting
  the full token + primitive set. Still tiny.
- Next: Phase 0 (4/4) adds the typed surface — `src/types/elections.ts`,
  `src/data/elections-source.ts` (with `ElectionDataSource` interface
  and `LocalFixtureSource` impl), `src/data/catalog.ts` (port of
  ELECTIONS / ELECTION_TYPES from the prototype). After that,
  Phase 0 is closed and we move to Phase 1.
- Server team's deploy answer is captured verbatim in `BACKLOG.md`'s
  Phase 5 references; the Caddyfile snippet is in the implementation
  plan and will be committed under `deploy/Caddyfile.snippet` in
  Phase 5.
