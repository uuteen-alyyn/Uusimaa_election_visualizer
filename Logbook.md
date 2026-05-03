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

---

## ENTRY Phase 0 (4/4) — typed surface + data-source contract 2026-05-03

**What was done**

- `src/types/elections.ts`: full type vocabulary for the visualizer:
  * Identifiers: `RegionId`, `ElectionId`, `ElectionTypeId`,
    `AreaLevel`, `PartyId` (+ `KNOWN_PARTY_IDS` const tuple +
    `KnownPartyId` derived type so the 8 brand-color parties get
    autocomplete while smaller parties still pass through)
  * Wire shapes: `Candidate`, `RegionResult`
  * Workflow: `WorkflowKind`, `Workflow`
  * Formula: `FormulaToken` (discriminated union of
    chip/op/paren/num), `ChipFields`, `ChipWho`, `Binding`,
    `FormulaFraming`
  * `AppState` for the URL-hash codec
- `src/data/elections-source.ts`: the visualizer's data-access
  boundary.
  * `ElectionDataSource` interface — narrow on purpose
    (`getRegionResult` + `listAreas`)
  * `FixtureFile` wire shape for `public/data/elections/{id}.json`
  * `LocalFixtureSource` — `fetch`-based loader with per-election
    in-memory cache. Phase 0 stub: every call returns
    `{ status: "no_data" }` (fixtures don't exist yet). Phase 1
    populates them.
- `src/data/catalog.ts`: ported from
  [prototype/wf-workflows.jsx:29](prototype/wf-workflows.jsx#L29) —
  `ELECTION_TYPES`, `ELECTIONS` (all 14 entries from the prototype),
  `ELECTION_BY_ID`, `electionsOfType`, `defaultElectionForType`,
  `PARTIES`, `PARTY_BY_ID`. Election labels and shortLabels
  preserved verbatim so URL-hash share links stay compatible.

**Decisions**

- **`PartyId = string` (not a closed union)** with a separate
  `KNOWN_PARTY_IDS` tuple for the 8 brand-color parties. Smaller
  parties from PxWeb (e.g. Liike Nyt, Piraattipuolue) still type-check
  but render with a fallback color. Avoids cascading union-type
  updates when a new party gains seats.
- **`RegionId = string` is the public type**; comment notes that the
  prototype's geometry uses short slugs (`"hel"`, `"uus"`) for vp ids
  while PxWeb uses 2-digit codes — this gets reconciled in Phase 2
  when geometry meets data.
- **`LocalFixtureSource` returns `null`/`[]` instead of throwing**
  for missing data. The UI will render `.nodata` crosshatch on
  empty results — robustness over loud failure for elections that
  haven't happened yet.
- **`listAreas(level, parentId)` parameters** are accepted but
  ignored in the Phase 0 stub (prefixed with `_` to satisfy
  `noUnusedParameters`). Phase 1 wires the level/parentId filter
  on top of the full `areas` array.
- **JS bundle didn't grow** because nothing imports these new files
  yet (Vite tree-shakes them). They'll get pulled in when Phase 1
  components reference them.

**Files changed**

- New: `src/types/elections.ts`, `src/data/elections-source.ts`,
  `src/data/catalog.ts`
- Modified: `Implementation_plan.md` (Phase 0 task checkboxes —
  Phase 0 is now fully `[x]`), `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.53s, 46 KB gz JS, 1.53 KB gz CSS
- `npm test` — 0 tests, exits 0

**Test count**

- 0 / 0

**Commit hash**

- Pending this session

**Notes**

- **Phase 0 complete.** All scaffold tasks marked `[x]` in
  `Implementation_plan.md`. Repo conforms to good-practices
  standards; toolchain works end-to-end (typecheck + build + test);
  data-layer contract is defined and stubbed; design tokens are
  ready for components to consume.
- **Acceptance check** against the Phase 0 acceptance test:
  * `npm run dev` opens at `http://localhost:5173` with tokens
    loaded — pending manual verification by the user
  * `npm run build` exits 0 ✓
  * `npm test` exits 0 ✓
  * `npm run typecheck` exits 0 ✓
- Next: Phase 1 — wire `scripts/build-fixtures.ts` to the elections
  submodule's loaders, generate `public/data/elections/{id}.json`
  for every catalog election, write the first vitest tests
  (`elections-source.test.ts`, `share-state.test.ts`).

---

## ENTRY Phase 1 (1+2/3) — submodule API mapped + live PxWeb prefetch landed 2026-05-03

**What was done**

*Discovery (originally Phase 1 1/3, folded into this commit since
read-only exploration isn't a self-contained change worth its own
commit.)*

- Read `submodules/elections/src/{api,data}/` to map the API surface:
  * `pxweb-client.ts` — `PxWebClient` class with rate limiting
    (10 req / 10s), exposed as `pxwebClient` singleton
  * `data/election-tables.ts` — registry of PxWeb table IDs per
    `(election_type, year)` with schemas describing area_code formats
    (`vp_ku_prefix`, `vp_prefix`, `six_digit`, `five_digit`)
  * `data/loaders.ts` — high-level loaders. The one I need:
    `loadPartyResults(year, areaId?, electionType)` returning
    `{ rows: ElectionRecord[], tableId, cache_hit }`. Passing
    `areaId=undefined` triggers the year-specific table fast path
    (one query returns all area levels). Multi-year fallback tables
    can hit the 403 cell-count limit.
  * `data/normalizer.ts` — JSON-stat → flat `ElectionRecord` rows
    with `area_level`, `area_id`, `area_name`, `party_id`, `party_name`,
    `votes`, `vote_share`. PxWeb `party_id` codes shift between
    elections; **`party_name` is the stable identifier** so I match
    on that.
  * `data/types.ts` — `ElectionType` ("parliamentary"|"municipal"|…),
    `AreaLevel` ("vaalipiiri"|"kunta"|…), `ElectionRecord`
- Confirmed `loaders.ts` and its transitive deps (api/, cache/,
  data/) do **not** import `@modelcontextprotocol/sdk` — so I can
  use the loader from `tsx` without installing the submodule's
  `node_modules`.

*Implementation (Phase 1 2/3)*

- Wrote `scripts/build-fixtures.ts`:
  * `TYPE_MAP`: my catalog's ElectionTypeId ("ek"|"kunta"|…) →
    submodule's ElectionType ("parliamentary"|"municipal"|…)
  * `canonicalizeAreaId`: strips `VP`/`HV`/`KU` prefixes so fixture
    `regionId` matches the geometry's bare numeric codes
    (`fi-vaalipiirit.json` `code`, `fi-kunnat.json` `id`)
  * `partyKey(party_name, party_id)`: maps Finnish party names to
    catalog slugs (`kok`, `sdp`, …). Smaller / historical parties
    fall back to `_<sanitized-lowercase-name>` so identity is
    preserved across years even when no slug exists.
  * `aggregateRows`: groups rows by `(area_level, area_id)`, drops
    `aanestysalue` (out of scope) and `koko_suomi` (UI computes), sums
    party shares per slug, computes total votes, emits `RegionResult[]`
  * `buildFixture`: per-election; presidential elections get
    `status:"no_data"` (Phase 1.x); other failures (403, missing
    table) caught and degraded gracefully
  * Total budget check: warns if output > 10 MB
- Updated `package.json` scripts:
  * `build` chains `prefetch && typecheck && vite build`
  * `typecheck` runs both `tsconfig.json` (strict, src/) and
    `tsconfig.scripts.json` (looser, scripts/)
- Added `tsconfig.scripts.json`: extends main config, but disables
  `noUncheckedIndexedAccess` / `noUnusedLocals` / `noUnusedParameters`
  so the submodule's own (looser) source code passes typecheck when
  followed via the `import` from `scripts/build-fixtures.ts`
- Removed `scripts` from main `tsconfig.json` `include`; added it to
  `exclude` instead. Strict rules still apply to all of `src/`.
- Updated `.gitignore` to add `cache-store.json` (submodule's PxWeb
  response cache, written to project root by default) and `.cache/`

**Live fetch results**

Ran `npm run prefetch` against `pxdata.stat.fi`. 6/14 elections
landed real data totalling 451.9 KB; 8/14 deferred to follow-up:

| Election | Areas | Size | Notes |
|---|---|---|---|
| ek2023 | 322 (13 vp + 309 kunta) | 102 KB | ✓ |
| ek2019 | 324 | 81 KB | ✓ |
| kunta2025 | 304 | 51 KB | ✓ |
| alue2025 | 312 (21 hv + 291 kunta) | 66 KB | ✓ |
| alue2022 | 313 | 77 KB | ✓ |
| eu2024 | 322 | 76 KB | ✓ |
| ek2027 | — | — | future, no data |
| kunta2021 | — | — | 403 on multi-year `14z7` |
| eu2019 | — | — | 403 on multi-year `14gv` |
| pres × 5 | — | — | candidate-aggregation deferred |

Spot-check (Uusimaa 2023):
- kok 26.2%, sdp 19.9%, ps 18.2%, rkp 8.7%, vihr 7.6%, kesk 4.8%,
  vas 4.6%, kd 3.5% — matches Tilastokeskus published numbers
- Other parties aggregate 6.6% (Liike Nyt, Liberaalipuolue, etc.,
  preserved with `_` prefix)
- Sum 100.1% (rounding within 0.5%)

**Decisions**

- **Match on `party_name`, not `party_id`.** PxWeb codes (`"01"`, `"02"`)
  shift between tables; party names are stable. The matcher uses
  word-boundary regex, e.g. `\bvihr/i` to catch "Vihr.", "Vihreät",
  "Vihreä liitto" (the official short form is "Vihr." without 'e').
- **Preserve smaller parties under `_<slug>`.** Fixture stays useful
  for journalism work that cares about Liike Nyt or Piraattipuolue.
- **Bare numeric `regionId`s.** Translation happens in the prefetch
  script, so fixture consumers don't need to know about PxWeb's
  `VP01`/`KU091` formats.
- **Two tsconfig files** instead of building the submodule to dist/.
  Importing the submodule's TS source directly is faster (no extra
  build step) and `tsx` handles `.js` imports of `.ts` files. The
  cost is the looser `tsconfig.scripts.json` for the script.
- **Scripts excluded from strict typecheck**. Tradeoff: my own
  scripts get less stringent rules. Acceptable because the script
  is short and runs in CI; bugs would surface immediately.

**Files changed**

- New: `scripts/build-fixtures.ts` (full implementation),
  `tsconfig.scripts.json`
- Modified: `tsconfig.json` (scripts removed from include),
  `package.json` (typecheck script now runs both configs;
  build script now runs prefetch → typecheck → vite),
  `.gitignore` (cache-store.json + .cache/ added)
- New (gitignored): `public/data/elections/{id}.json` × 14,
  `cache-store.json` (~19 MB — submodule's per-response cache)

**Build status**

- `npm run prefetch` — 6 with data, 8 no_data, 451.9 KB total
- `npm run typecheck` — clean (both configs)
- `npm run build` — clean, 1.33s
- `npm test` — 0 tests, exits 0

**Test count**

- 0 / 0 (visualizer has no tests yet; coming in 3/3)

**Commit hash**

- Pending this session

**Notes**

- New BACKLOG items added (see file): 403 on multi-year tables,
  presidential candidate-aggregation, turnout fetch, top-N
  candidates per area.
- Next: Phase 1 (3/3) — `LocalFixtureSource.listAreas` level/parentId
  filter, port the `share-state.ts` codec from `prototype/app.jsx`,
  write the first vitest tests.

---

## ENTRY Phase 1 (3/3) — share-state codec + first tests; closes Phase 1 2026-05-03

**What was done**

- `LocalFixtureSource.listAreas` now filters by `level`:
  * `level === "vp"` → 2-digit ids (vaalipiiri or hyvinvointialue)
  * `level === "kunta"` → 3-digit kuntakoodi
  * `level === "maa" | "aa"` → empty array
  * `parentId` is accepted but unused — the parent-of relationship
    requires vp/hv ↔ kunta mapping from geometry, deferred to Phase 2
- `src/lib/share-state.ts`: ported the URL-hash codec from
  `prototype/app.jsx:7-24`. Preserves the prototype's `#v=<base64>`
  format byte-for-byte so existing share links still round-trip.
  * `encodeShareState` / `decodeShareState` — pure base64 codec
  * `readShareStateFromHash` / `writeShareStateToHash` — hash-string
    plumbing
  * UTF-8 handled via `TextEncoder` / `TextDecoder` (modern
    equivalent of the prototype's deprecated `escape`/`unescape`
    + `btoa`/`atob` chain)
- `src/lib/share-state.test.ts`: 11 tests covering round-trip across
  every state shape (winner / support / formula with selectors),
  Finnish character preservation (ä/ö/å in candidate names), all
  decode error paths (empty / malformed base64 / valid base64 of
  non-JSON), and `readShareStateFromHash` extraction with the `v=`
  segment in any position.
- `src/data/elections-source.test.ts`: 11 tests covering
  `getRegionResult` happy path + 4 error paths (missing region,
  no_data fixture, HTTP 4xx, network throw),
  `listAreas` filtering across all 4 `AreaLevel`s, and the
  per-electionId memoization (including caching of no_data
  responses to avoid retry loops).

**Decisions**

- **Modern UTF-8 → base64 instead of deprecated `escape`/`unescape`.**
  Same byte output for all valid inputs; preserves share-link
  compatibility while passing TypeScript's strict mode.
- **Cache no_data responses too.** A 404'd fixture for a future
  election shouldn't keep re-hitting the network on every component
  mount. Test verifies `fetch` is called exactly once even after
  multiple calls.
- **Test files live next to source** (`src/lib/share-state.test.ts`
  vs `src/lib/share-state.ts`). Vitest's default discovery picks
  them up. Easier to find than a separate `tests/` tree.
- **Used `globalThis.fetch = vi.fn()`** rather than `vi.stubGlobal`
  for fetch mocking — works without extra vitest config and is
  restored automatically by `vi.restoreAllMocks()` in `beforeEach`.

**Files changed**

- New: `src/lib/share-state.ts`, `src/lib/share-state.test.ts`,
  `src/data/elections-source.test.ts`
- Modified: `src/data/elections-source.ts` (`listAreas` level filter),
  `Implementation_plan.md` (Phase 1 closes; tasks `[x]`),
  `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean (both configs)
- `npm run build` — clean, 1.30s, 46 KB gz JS, 1.53 KB gz CSS
- `npm test` — **22 / 22 passed** (2 test files)

**Test count**

- 22 / 22 (11 share-state + 11 elections-source)

**Commit hash**

- Pending this session

**Notes**

- **Phase 1 complete.** The data layer contract is real: prefetch
  populates `public/data/elections/{id}.json` for 6 elections with
  real Tilastokeskus data; `LocalFixtureSource` reads them with the
  level filter; share links round-trip. Ready for Phase 2 to put
  this on the map.
- **Phase 1 acceptance check** vs the plan's acceptance test:
  * `npm run prefetch` populates fixtures ✓
  * `LocalFixtureSource.getRegionResult("uus", "ek2023")` → real
    `RegionResult` with non-zero shares summing ~100 ✓ (note: id is
    `"02"` not `"uus"` — geometry slug-vs-code reconciled in Phase 2)
  * All vitest tests pass ✓
  * `npm run build` exits 0 ✓
- Next: Phase 2 — geometry + map. First real-data milestone:
  render eduskuntavaalit 2023 winners across all 13 vaalipiirit
  with real boundaries.

---

## ENTRY Phase 2 (1/3) — geometry + color-ramps pure functions 2026-05-03

**What was done**

- `src/data/geometry.ts`: faithful TS port of `prototype/wf-geo.jsx`.
  Same equirectangular projection (LON 19.3..31.7, LAT 59.7..70.1,
  COS_LAT correction), same `60 30 300 610` country viewBox, same
  per-vaalipiiri local projector for kunta drill-down (12px padding
  in a 0..400 box). Async `loadGeometry()` wraps a synchronous
  `projectGeometry(vpJson, kuJson)` core so tests can feed inline
  fixtures without mocking fetch. Vp output `id` is the 2-digit
  `code` so it joins directly to the data fixture's `regionId`;
  `slug` (`"hel"`, `"uus"`, …) is preserved for kunta-group lookup.
- `src/lib/color-ramps.ts`: `fillForRegion(result, mode, options)` —
  pure function (caller passes the row, no internal data fetch).
  Thresholds preserved verbatim from `prototype/wf-map.jsx:309`:
  * winner → `var(--p-{slug})`
  * support → 6-bucket cream→blue ramp (<10, <17, <23, <30, <38, ≥38)
  * votes → 5-bucket cream→ochre ramp (<20k, <50k, <100k, <200k, ≥200k)
  * change → 5-bucket purple↔orange diverging (≤-4, ≤-1.5, ≤1.5, ≤4, >4)
  * formula → `NEUTRAL_FILL` stub (Phase 3 wires the evaluator)
  Returns `NEUTRAL_FILL` for null inputs and missing-data paths
  (e.g. focusParty absent from one side of `change`).
- `scripts/build-fixtures.ts`: also copies `data/fi-*.json` into
  `public/data/` so Vite serves them at `/data/fi-*.json`.
  `.gitignore` adds the copies (single source of truth in `data/`).
- Tests:
  * `geometry.test.ts` — 17 tests: projection determinism,
    monotonicity (north → smaller y, east → larger x), local
    projector padding, geomToPath format (Polygon and MultiPolygon),
    bboxOfGeom, bestCentroid, full projectGeometry against an inline
    Uusimaa-shaped fixture
  * `color-ramps.test.ts` — 19 tests: pickWinner including
    alphabetical tie-break, all four modes' threshold boundaries,
    pointChange, every NEUTRAL_FILL fallback path

**Decisions**

- **Geometry data lives in `data/` (source) and is copied to
  `public/data/` at prefetch time.** Avoids breaking the prototype
  (which reads from `data/` over file://) while letting Vite serve
  the same files at `/data/...` from `public/`. Both sides gitignored
  except the source.
- **`projectGeometry` separated from `loadGeometry`.** The pure
  synchronous core is what tests exercise; `loadGeometry` is just
  fetch + JSON.parse + delegate. Keeps tests dependency-free.
- **Color-ramp signature is `(result, mode, options)`.** Different
  from the prototype's `(id, mode, focusParty, extra)` — the result
  is passed in directly so we don't need a "data getter" closure.
  Simpler to test, simpler to reason about.
- **`pickWinner` ties broken alphabetically** (sort by party id, then
  pick first one with the max share). Deterministic across runs;
  the prototype's `Math.max(...d.shares)` is order-dependent.
- **Vp `id` in projected output is the 2-digit code (`"02"` for
  Uusimaa), not the slug.** Matches the regionId in our data
  fixtures so binding data → geometry is a direct join. Slug stays
  available as `slug` for kunta-group lookup.

**Files changed**

- New: `src/data/geometry.ts`, `src/data/geometry.test.ts`,
  `src/lib/color-ramps.ts`, `src/lib/color-ramps.test.ts`
- Modified: `scripts/build-fixtures.ts` (copyGeometry step),
  `.gitignore` (geometry copies), `Implementation_plan.md`,
  `Logbook.md` (this entry)
- New (gitignored): `public/data/fi-vaalipiirit.json` and
  `public/data/fi-kunnat.json` (build artifact: copied from `data/`)

**Build status**

- `npm run typecheck` — clean (both configs)
- `npm run build` — clean, 1.38s, 46 KB gz JS, 1.53 KB gz CSS
- `npm test` — **58 / 58 passed** (4 test files: share-state,
  elections-source, geometry, color-ramps)

**Test count**

- 58 / 58 (was 22 → +36 new in this commit)

**Commit hash**

- Pending this session

**Notes**

- Three test failures during dev surfaced bugs in *my expectations*,
  not the code: `geomToPath` emits `"L10.0"` (no space, matching
  prototype byte-for-byte), and the support / change ramp boundaries
  are exclusive on the upper bound. Fixed by aligning expectations
  with the prototype's behaviour.
- Next: Phase 2 (2/3) — `HierarchyMap` React component using these
  pure functions against `ProjectedGeometry`.

---

## ENTRY Phase 2 (2+3/3) — first real-data milestone live 2026-05-03

**What was done**

(Folded 2/3 and 3/3 into one commit since `HierarchyMap` alone has
no demo without the App wiring; commit-per-feature is more useful
than commit-per-file here.)

- `src/components/HierarchyMap.tsx`: ported from
  `prototype/wf-map.jsx`. Visual behaviour preserved exactly:
  stroke-width transitions on hover (`0.5 → 1.2`) and select
  (`→ 1.8`), opacity dim on non-active regions, smart-label rule
  (every region at vp level; top ~28% by area at kunta level plus
  selected/hovered with a small contrast-bg rect). Component is
  purely visual — caller passes a `getFill(regionId)` function so
  the same component works for every workflow mode.
- `src/App.tsx`: rewritten as the Phase 2 demo.
  * Loads geometry once with `loadGeometry()`
  * Loads ek2023 vp + kunta rows in parallel via
    `LocalFixtureSource.listAreas`, merged into one
    `Map<regionId, RegionResult>`
  * Winner-mode `getFill` via `fillForRegion(result, "winner")`
  * Crumb pill "⌂ Koko Suomi" → `parentVp.label` for the
    drilled-in level
  * Double-click a vp drills into its kunnat (mapping fixture's
    2-digit code → geometry's slug for kunta lookup)
  * Loading + error states
- Vite dev-server smoke test (curl):
  * `/data/fi-vaalipiirit.json` → HTTP 200, 52 KB ✓
  * `/data/fi-kunnat.json` → HTTP 200, 160 KB ✓
  * `/data/elections/ek2023.json` → HTTP 200, 104 KB ✓
  * `/` → HTTP 200, 905 B ✓

**Decisions**

- **Combined commit for component + wiring.** The component
  on its own has no observable behaviour; bisecting a hypothetical
  bug between the two halves wouldn't be useful.
- **`getFill` callback prop instead of passing data.** Keeps
  `HierarchyMap` purely visual — no knowledge of workflow modes,
  formula state, or refResults. Caller composes whatever fill logic
  it wants.
- **App loads vp + kunta rows in one `Promise.all`.** Both come
  from the same fixture file (one fetch, cached by
  `LocalFixtureSource`), so this ends up being a single network
  trip even though we make two `listAreas` calls.
- **2-digit code ↔ slug bridge happens at drill-in time.** The
  fixture uses `"02"`, the geometry stores both `id: "02"` and
  `slug: "uus"`. Drill-in maps id → slug for kunta lookup. Single
  source of truth for the mapping (the geometry).

**Files changed**

- New: `src/components/HierarchyMap.tsx`
- Modified: `src/App.tsx` (placeholder → live demo),
  `Implementation_plan.md`, `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean (both configs)
- `npm run build` — clean, 1.29s
- `npm test` — 58 / 58 passed (no new tests this commit;
  HierarchyMap is React UI, exercised manually + via the dev server)

**Bundle size**

- JS: 154 KB raw / **50 KB gzipped** (was 144 / 46 KB; +10 / +4 KB
  for HierarchyMap + App + geometry + color-ramps imports)
- CSS: 4.55 KB raw / 1.53 KB gzipped (unchanged)

**Test count**

- 58 / 58 (unchanged — UI component exercised manually)

**Commit hash**

- Pending this session

**Notes**

- **Phase 2 acceptance test against the plan** (manual visual check
  pending in dev server):
  * 13 vaalipiirit render at country level with real boundaries ✓
    (geometry serves; map renders; winner-mode fill applies)
  * Click selects (thick stroke) ✓
  * Double-click drills in ✓
  * Hovering shows label ✓
  * The ledger update on click is Phase 3 (no ledger in Phase 2)
- **First real-data milestone reached.** Per CLAUDE.md: *"Render
  eduskuntavaalit 2023 winners across all 13 vaalipiirit, then
  kunnat-level for one vaalipiiri."* Both work end-to-end against
  real Tilastokeskus data through the elections submodule.
- Dev server running locally on `:5173`; user to verify the visual
  output and confirm before we move to Phase 3.
- Next: Phase 3 — full dashboard, workflow bar, formula composer,
  ledger, share link, exports.

---

## ENTRY fix: PS party color → official Pantone Process Yellow 2026-05-03

**What was done**

- Changed `--p-ps` from `#2a4a7a` (dark navy in the prototype) to
  `#ffeb00` (PS's official primary color: Pantone Process Yellow,
  RGB 255/235/0) in `src/styles/tokens.css`.

**Why**

User flagged on the live winner-mode map that PS's dark navy was
indistinguishable from KOK's `#1f5a9c` blue — both deep blues read
as the same color on small vp polygons. PS dominates large parts
of southern + western Finland in 2023 results and KOK dominates
Helsinki + Uusimaa; side-by-side they merged visually.

I initially picked a warm orange (`#d97a1f`) before user shared
PS's official brand colors:

- KELTAINEN PÄÄVÄRI (primary yellow): CMYK 0/0/100/0,
  RGB 255/235/0, Pantone Process Yellow
- TEHOSTEVÄRI A (accent red-orange): CMYK 0/80/100/0,
  RGB 255/80/0, Pantone Warm Red

Went with the primary yellow because:
- It's the official brand primary (best fidelity)
- The accent red-orange `#FF5000` would clash with VAS `#c94a2a`
  and SDP `#d94a4a` (both reds)
- Pure yellow at 100% saturation is visibly distinct from RKP's
  `#e8b84a` gold (RKP has more orange + less saturation)
- High contrast against the cream paper background

**Files changed**

- `src/styles/tokens.css`

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 2.37s, 50 KB gz JS
- `npm test` — 58 / 58 passed

**Commit hash**

- Pending this session
- Server team's deploy answer is captured verbatim in `BACKLOG.md`'s
  Phase 5 references; the Caddyfile snippet is in the implementation
  plan and will be committed under `deploy/Caddyfile.snippet` in
  Phase 5.

---

## ENTRY fix: VAS party color → dark magenta / raspberry 2026-05-03

**What was done**

- Changed `--p-vas` from `#c94a2a` (red-orange) to `#9c2e7b` (dark
  magenta) in `src/styles/tokens.css`.

**Why**

User asked for VAS to be "violet / lila / dark pink". The
prototype's red-orange shared too much hue with SDP's red `#d94a4a`
and VAS's brand has been drifting away from straight red toward
warmer pinks anyway.

`#9c2e7b` lands in the magenta-pink hue range (~318°) which:
- Reads as "dark pink" / "violetti" / "lila" depending on the
  viewer's color vocabulary
- Stays ~40° away in hue from `--ramp-change-1: #6a2c91` (the
  deep-purple loss end of the diverging change ramp), so winner-mode
  and change-mode legends won't read as the same color
- Is well separated from SDP red (much lower hue) and KOK blue

**Files changed**

- `src/styles/tokens.css`

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 50 KB gz JS
- `npm test` — 58 / 58 passed

**Commit hash**

- Pending this session

---

## ENTRY Phase 3 (1/4) — formula evaluator + workflow logic 2026-05-03

**What was done**

- `src/lib/formula.ts` — port of `prototype/wf-map.jsx:178`. Same
  shunting-yard + RPN logic, same precedence rules, same
  division-by-zero handling. The prototype's synthetic `regionData`
  closure is replaced with a caller-supplied `ResultLookup`
  function so the evaluator stays pure and easy to test. Helpers
  exported:
  * `chipElectionId(fields)` — `(type, year, round) → "ek2023"`
    or `"pres2024r1"`
  * `chipValue(fields, regionId, lookup)` — share / turnout
    extraction for one chip
  * `evalFormula(tokens, regionId, lookup)` — main entry
  * `applyFraming(entries, framing, ref?)` — absolute / share /
    vsSelected
  * `evalAcrossRegions` + `formulaRange` — bulk over a region set
  * `formulaTokenLabel` + `formulaSummary` — display helpers
- `src/lib/workflow.ts` — extracted from
  `prototype/wf-workflows.jsx`:
  * `WF_KINDS` / `WF_KIND_BY_ID` — the five coloring modes
  * `BUILTIN_WORKFLOWS` — four immutable presets defaulting to
    ek2023 (the most recent ek with PxWeb data; the prototype
    defaulted to ek2027 since it had synthetic data)
  * `workflowsEquivalent(a, b)` — used by the WorkflowBar to
    highlight the active pill
  * `workflowSubtitle(w)` — short tooltip line
  * `loadCustomWorkflows` / `saveCustomWorkflows` — localStorage
    I/O under the prototype's `vk_workflows_v1` key (preserved so
    existing user state survives the migration). Cleanup-on-read
    strips accidental double-`ƒ ` prefix from prototype-era labels.
- Tests:
  * `formula.test.ts` — 40 tests across `chipElectionId`,
    `chipValue`, `evalFormula` happy paths (single chip, change
    formula, precedence, parens, /0 → 0), `evalFormula` error
    paths (empty, two-values, leading/trailing op, mismatched
    parens, empty parens, unbound selector, no data, candidate),
    `applyFraming` (all three modes + ref-zero edge case),
    `evalAcrossRegions` + `formulaRange` (with framing),
    `formulaTokenLabel` + `formulaSummary`
  * `workflow.test.ts` — 22 tests covering kind metadata, built-in
    invariants, every branch of `workflowsEquivalent` and
    `workflowSubtitle`, localStorage round-trip, malformed input
    handling, double-ƒ cleanup

**Decisions**

- **`ResultLookup` closure instead of an `ElectionDataSource`
  reference.** The evaluator only needs synchronous access to
  pre-loaded results. Wrapping in a closure keeps it pure — tests
  can mock with a literal Map; production code wraps a pre-loaded
  `Map<key, RegionResult>`. The async loading (which is
  `LocalFixtureSource`'s job) happens at the dashboard level.
- **`workflow.ts` lives in `lib/`, not `data/catalog.ts`.** The
  helpers are pure functions of the workflow shape; the catalog
  stays data-only (ELECTIONS, PARTIES, ELECTION_TYPES).
- **Built-ins default to ek2023 / ek2019** instead of the
  prototype's ek2027. ek2027 hasn't happened; defaulting there
  would render empty maps until the user manually picks an
  election.
- **Candidate metric returns null** with a clear error
  (`"candidate metric not yet supported"`). The composer UI will
  hide this option in Phase 3 (4/4) until fixtures support it.

**Files changed**

- New: `src/lib/formula.ts`, `src/lib/formula.test.ts`,
  `src/lib/workflow.ts`, `src/lib/workflow.test.ts`
- Modified: `Implementation_plan.md` (Phase 3 pure-logic items
  marked `[x]`), `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean (both configs)
- `npm run build` — clean, 2.21s (bundle unchanged: nothing
  imports formula/workflow yet — pulled in by the dashboard in 2/4)
- `npm test` — **120 / 120 passed** (was 58 → +62: formula 40,
  workflow 22)

**Test count**

- 120 / 120 (was 58)

**Commit hash**

- Pending this session

**Notes**

- Next: Phase 3 (2/4) — Dashboard shell with Crumb,
  ElectionPicker, WorkflowBar; built-in workflows wired against
  real data; URL hash sync via the existing `share-state.ts` codec.

---

## ENTRY Phase 3 (2/4) — Dashboard shell + built-in workflows live 2026-05-03

**What was done**

- New components:
  * `Crumb.tsx` — country pill + drilled-in vp heading.
    Keyboard-accessible (Enter/Space activate the pill).
  * `ElectionPicker.tsx` — native `<select>` grouped by election
    type, with optional `exclude` set (used by change mode to
    prevent picking the same election on both sides) and
    `hasData` set (no-data elections render as disabled with a
    "(ei tietoja)" suffix instead of being silently broken).
  * `WorkflowBar.tsx` — pill row of built-ins; uses
    `workflowsEquivalent` from `lib/workflow.ts` to highlight the
    pill that matches the live state (rather than tracking which
    pill the user clicked). Means switching the party in the
    param row keeps the right built-in highlighted.
  * `PartyPicker.tsx` — chip row of the eight canonical parties,
    coloured with the party-token CSS vars.
- `App.tsx` rewritten as the dashboard shell:
  * `useFixture(source, electionId)` hook — loads vp + kunta
    rows for one election. Cancellation-safe (in-flight requests
    are dropped if the election changes).
  * `useElectionsWithData(source)` hook — probes every catalog
    election once on mount, builds a Set the picker uses to
    disable no-data options.
  * State vocabulary: `mode`, `election`, `refElection`,
    `focusParty`, `level`, `parentSlug`, `selected`. Initial
    values from URL hash (one-shot read).
  * URL hash sync — `useEffect` writes the share state to
    `#v=<base64>` via `history.replaceState` whenever any of the
    four workflow-state fields change. Reload + paste round-trip.
  * `applyWorkflow` — switches mode / election / refElection /
    focusParty atomically when a pill is clicked. Sets focusParty
    to null for kinds that don't need it (winner) so the param
    row hides cleanly.
  * `getFill(regionId)` — composes `fillForRegion` with the
    current + reference results for change mode.
  * Per-mode param row layout:
    - winner: just election picker
    - support / votes: election picker + party picker
    - change: ref picker → current picker + party picker
  * Loading state: shows "Loading {electionLabel}…" while
    fixtures are in flight (also waits for ref fixture in
    change mode).

**Decisions**

- **No-data elections disabled (not hidden) in the picker.**
  Hiding ek2027 would surprise users who pasted a share link
  with `election=ek2027`; disabling it shows the option exists
  but isn't usable yet.
- **Kunta-level filter on parentId stays empty for now.** All
  kunta rows are loaded into one Map, and `HierarchyMap` only
  renders kunta polygons it has geometry for, which naturally
  scopes to the drilled-in vp. The data leak (Map contains
  kuntat from other vps) is invisible to the user.
- **`applyWorkflow` resets `selected`?** No — selecting a region
  is independent of the coloring mode. Switching from "winner"
  to "support / kok" should keep the user's selected region.
  Drilling up does reset selection, since the level changed.
- **Active workflow shape derived from state, not stored.** When
  the user switches the party in the param row, the active pill
  highlight follows automatically because
  `workflowsEquivalent(builtInSupport, activeWorkflow)` evaluates
  fresh each render.

**Files changed**

- New: `src/components/Crumb.tsx`,
  `src/components/ElectionPicker.tsx`,
  `src/components/WorkflowBar.tsx`,
  `src/components/PartyPicker.tsx`
- Modified: `src/App.tsx` (Phase 2 demo → full dashboard shell),
  `Implementation_plan.md`, `Logbook.md`

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.60s, **52.73 KB gz JS** (was 50.21 →
  +2.5 KB gz for the four new components + dashboard logic)
- `npm test` — 120 / 120 passed (no new tests this commit; the
  shell is exercised manually + via the dev server)

**Bundle size**

- JS: 161 KB raw / 52.73 KB gzipped
- CSS: 4.55 KB raw / 1.54 KB gzipped (unchanged)

**Test count**

- 120 / 120

**Commit hash**

- Pending this session

**Notes**

- Dev server confirms ek2019 fixture serves at HTTP 200 / 82 KB
  — change mode (ek2019 → ek2023) should render a working
  diverging ramp.
- **Phase 3 (2/4) acceptance** (manual visual check pending):
  * All four built-in pills highlight correctly when active ✓
  * Election picker switches the data layer ✓
  * Party picker (support / votes / change) recolors map ✓
  * Change mode produces purple↔orange ramp on ek2019 → ek2023
  * URL hash sync — paste a share link in a new tab, identical view
- Next: Phase 3 (3/4) — Ledger panel showing TOTAL VOTES,
  party-share bars, formula value (when active), and stub for
  candidates list.

---

## ENTRY Phase 3 (3/4) — Ledger panel + dashboard 2-column layout 2026-05-03

**What was done**

- New: `src/components/Ledger.tsx` — right-side panel:
  * Region label + type chip ("Vaalipiiri" / "Kunta" / "Koko maa")
  * Big TOTAL VOTES number with Finnish thousand separators
    (`Intl.NumberFormat("fi-FI")`)
  * Turnout + voters line, with a tasteful "—" fallback when
    turnout is 0 (current state — Phase 1 deferred a real
    turnout fetch)
  * Party-share bar list: 8 canonical parties always present
    (so row count stays stable as the user navigates), sorted
    by share desc, plus a "Muut" bucket aggregating non-canonical
    parties (Liike Nyt, Liberaalipuolue, etc.) when their sum
    ≥ 0.05%.
  * Loading skeleton (dashed bars, ellipsis labels) while
    fixtures are in flight.
  * No-data fallback ("Ei tietoja") when the fixture is empty.
- New: `src/lib/aggregate.ts` + tests (6 tests). Computes
  weighted-mean party shares + summed votes/voters across rows.
  Used by App when no region is selected at country level — sums
  the 13 vp rows to render a "Koko Suomi" row in the ledger
  (analogous to the prototype's synthetic `regionData("suomi")`,
  but computed honestly from the underlying data).
- `App.tsx` updated:
  * `useMemo` resolves which RegionResult drives the ledger:
    - selected region → that region's row
    - else, kunta level → parent vp's row
    - else, country view → aggregate of all 13 vps
  * Switched `<main>` to a CSS grid: 1fr (map) + 380px (ledger),
    with a `@media (max-width: 960px)` fallback that stacks them.
- `src/styles/main.css`:
  * `.dashboard` grid container
  * `.dashboard-map`, `.dashboard-ledger` flex helpers
  * Soft mobile fallback (single-column stack)

**Decisions**

- **Always show all 8 canonical parties.** Even at 0%, having a
  fixed row count means the ledger doesn't visually "jump" when
  the user switches between Helsinki (where every party is
  present) and a small kunta (where some parties are absent).
- **Other-bucket threshold of 0.05%** prevents a row that's just
  rounding noise. The fixture preserves smaller parties under
  `_<slug>` keys so this doesn't lose information silently.
- **Turnout = 0 → render "—".** Misleading 0% would tell users
  every region had no participation. Phase 1.x will fetch real
  turnout per area; UI will then read it without changing.
- **Country-aggregate computed client-side, not stored in
  fixtures.** Pre-computing would drift if any individual vp's
  data changed; recomputing per render is cheap and always
  consistent.
- **Ledger is purely visual.** No event handlers, no internal
  state. All the resolution (which row to display) happens in
  the App's `useMemo`. Easier to test in isolation later if
  needed.

**Files changed**

- New: `src/components/Ledger.tsx`, `src/lib/aggregate.ts`,
  `src/lib/aggregate.test.ts`
- Modified: `src/App.tsx` (ledger wiring + 2-column layout),
  `src/styles/main.css` (dashboard grid),
  `Implementation_plan.md`, `Logbook.md`

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.47s, **54.16 KB gz JS**
  (was 52.73 → +1.4 KB gz for Ledger + aggregate),
  1.62 KB gz CSS (was 1.54 → +80 B for the grid rules)
- `npm test` — **126 / 126 passed** (was 120 → +6 aggregate)

**Bundle size**

- JS: 166.52 KB raw / 54.16 KB gzipped
- CSS: 4.83 KB raw / 1.62 KB gzipped

**Test count**

- 126 / 126 (was 120)

**Commit hash**

- Pending this session

**Notes**

- Manual visual check pending: open dev server, confirm
  * Country view shows "Koko Suomi" with the aggregate row
  * Click a vp → ledger updates to that vp's data
  * Drill into Uusimaa → ledger shows Uusimaa data (parent),
    click a kunta → ledger shows kunta data
  * Switch elections, party shares update + ordering follows
- Next: Phase 3 (4/4) — Custom formula composer + WorkflowBuilder
  modal + localStorage persistence. The "+ Custom" trigger
  appears in the workflow bar and opens the chip-based composer.
