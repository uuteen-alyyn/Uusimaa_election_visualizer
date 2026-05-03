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
- Server team's deploy answer is captured verbatim in `BACKLOG.md`'s
  Phase 5 references; the Caddyfile snippet is in the implementation
  plan and will be committed under `deploy/Caddyfile.snippet` in
  Phase 5.
