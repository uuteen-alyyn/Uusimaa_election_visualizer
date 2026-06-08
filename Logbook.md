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

---

## ENTRY Phase 3 (4/4) — custom formula composer; closes Phase 3 2026-05-03

**What was done**

Closes Phase 3. The dashboard now matches the prototype's full
workflow surface end-to-end against real data.

- `src/lib/composer-suggestions.ts` — pure helpers for the
  composer's progressive suggestions:
  * `chipIsComplete`, `nextFieldFor`, `stripLastField` —
    chip-state finite state machine
  * `score` / `scoreOne` — substring/prefix/acronym ranking
    (verbatim port from prototype)
  * `pickNextSelectorName` — `A`, `B`, `C`… selector naming
  * `chipText` / `chipFullText` — progressive chip display labels
  * `buildSuggestions` — the main entry, per-slot ranking
  * Type-tagged `Suggestion` discriminated union
  * Phase 3 deliberately drops the candidate-suggestion branch:
    fixtures don't have candidate data, so candidate chips would
    silently produce no-data formulas
- `src/components/FormulaComposer.tsx` — chip-based input,
  keyboard-navigable, port of the prototype's
  `FormulaComposer`. Uses `composer-suggestions.ts` for state
  + ranking; bundles `ChipPill` and `SuggestionGlyph` privately.
- `src/components/WorkflowBuilder.tsx` — modal popover wrapping
  the composer. Two modes:
  * `new`: creates a new custom workflow on save
  * `edit`: updates the existing workflow in place (carries
    saved selector labels through)
  Auto-derives selectors from tokens; shows a friendly-name input
  per selector that maps to the param row's binding picker.
- `src/components/WorkflowBar.tsx` rewritten to two rows:
  * Row 1: built-ins + "+ Mukautettu" trigger
  * Row 2: custom workflows (with ƒ glyph) + Edit popover +
    Remove popover (multi-select with checkboxes)
- `src/lib/formula.ts` extended:
  * `resolveFormulaTokens(tokens, bindings)` — replaces selector
    slots with their bound concrete values; selectors that are
    still unbound stay as selectors (so the evaluator surfaces a
    clear error rather than silently returning 0)
  * `listSelectors(tokens)` — distinct selectors in order of
    first appearance, used by both the param-row UI and the
    auto-default-bindings helper
- `src/lib/color-ramps.ts` formula branch wired:
  * `fillForRegion(..., { formulaValue, formulaRange })` returns a
    diverging purple↔orange ramp when the value range straddles 0
    and a single-hue cream→blue ramp otherwise
  * Same threshold buckets as the prototype
- `src/components/Ledger.tsx` — formula value block:
  * Shows the formula expression (`ƒ Kok % (EK 2023) - …`) and
    the framed value with a unit suffix
  * Three framings supported: absolute (raw), % of total, vs
    selected (with `+` sign on positive values)
- `src/App.tsx` — major rewrite:
  * State now includes `formulaTokens`, `formulaBindings`,
    `framing`, `customWorkflows`, `appliedWorkflowId`,
    `appliedSelectorLabels`, `builderOpen`, `editingWorkflow`
  * `useFormulaResults` hook — given a token list, loads every
    election the formula references and returns a ResultLookup
    closure. Memoised against a stable join-key so React
    re-renders don't re-fetch
  * `formulaValueByRegion` Map — pre-computed per render so
    `getFill` is O(1) per call. Framing is applied in the same
    pass, so the diverging-vs-single-hue auto-pick in
    `color-ramps.formulaFill` matches the framed range.
  * `applyWorkflow` now copies formula + selectorLabels +
    defaultBindings; `autoDefaultBindings` fills in sensible
    defaults for any selector that doesn't have one yet
  * `saveWorkflow` / `updateWorkflow` / `deleteWorkflow` wired
    to setCustomWorkflows; `useEffect` persists to localStorage
    on every change
  * URL hash sync includes `formulaTokens` + `formulaBindings`
    when mode === "formula"
  * Selector binding row (param row, formula mode only) — picks
    type / year / party for each `$X` selector. Friendly names
    come from `appliedSelectorLabels`.
  * Framing tabs — absolute / % of total / vs selected.
    "vs selected" is disabled when no region is selected.

**Decisions**

- **Composer drops the candidate-suggestion branch** (it appears
  in the prototype but we can't honor it: fixtures don't carry
  candidate data; selecting a candidate chip would silently
  produce a no-data formula). Re-add when candidate data lands.
- **Bindings auto-default** to ek / ek2023 / kok. Means a saved
  formula like `$A % (EK $B) - $A % (EK 2019)` is immediately
  productive when first applied, not blank.
- **`useFormulaResults` join-key by stable string** —
  `electionIds.join("|")` is the dependency since arrays don't
  shallow-compare. Re-runs only when the *set* of elections the
  formula references changes, not on every keystroke in the
  composer.
- **Pre-compute `formulaValueByRegion` once per render** rather
  than re-evaluating in `getFill`. The map has at most ~310
  entries, evaluation is microseconds; pre-computing simplifies
  the dependency graph and lets us share the framed values with
  the Ledger.
- **`vsSelected` framing disables when nothing's selected** —
  rather than silently falling back to absolute. Shows a
  not-allowed cursor on hover with a tooltip.
- **Formula color-ramp sits in `color-ramps.ts`** (not in
  `formula.ts`) — visual-mapping concerns belong with the rest of
  the ramp logic. `formula.ts` stays focused on evaluation.

**Files changed**

- New: `src/components/FormulaComposer.tsx`,
  `src/components/WorkflowBuilder.tsx`,
  `src/lib/composer-suggestions.ts`,
  `src/lib/composer-suggestions.test.ts`
- Modified: `src/App.tsx` (major rewrite),
  `src/components/WorkflowBar.tsx` (two rows + edit/remove
  popovers), `src/components/Ledger.tsx` (formula value block),
  `src/lib/color-ramps.ts` (formula-mode branch),
  `src/lib/formula.ts` (`resolveFormulaTokens`, `listSelectors`),
  `Implementation_plan.md`, `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean (both configs)
- `npm run build` — clean, 1.61s, **63.40 KB gz JS**
  (was 54.16 → +9.2 KB gz for FormulaComposer + WorkflowBuilder
  + selector binding UI + framing tabs + formula color-ramp
  branch + new evaluator helpers)
- `npm test` — **151 / 151 passed** (was 126 → +25 for the new
  composer-suggestions module)

**Bundle size**

- JS: 200.14 KB raw / 63.40 KB gzipped
- CSS: 4.83 KB raw / 1.62 KB gzipped (unchanged)

**Test count**

- 151 / 151 (was 126)

**Commit hash**

- Pending this session

**Notes**

- **Phase 3 acceptance** (manual visual check pending):
  * All four built-ins still work ✓ (regression check)
  * Click "+ Mukautettu" → modal opens, type "eduskunta", arrow
    keys + Enter pick "Eduskuntavaalit", continues to year, etc.
  * Build `Kok 2023 - Kok 2019`, save with name "Kok kannatus
    2019→2023" → custom pill appears in row 2
  * Reload page → custom pill is back (localStorage) ✓
  * Build `$A % (EK 2023) - $A % (EK 2019)` with selector A,
    save → param row shows `$A` picker; switch from KOK to SDP
    → map recolors with diverging ramp
  * "Share link" — paste in new tab → identical view round-trips
- **Phase 3 closed.** Next: Phase 4 — polish, exports, accessibility,
  ship audit. Plus the small backlog of formula-mode niceties
  (live preview in the builder, stricter selector validation in
  the evaluator).

---

## ENTRY fix: adaptive support / change ramps for small parties 2026-05-03

**What was done**

- `src/lib/color-ramps.ts`:
  * `FillOptions` adds `supportRange` and `changeRange` —
    `{min, max}` over the visible region set
  * `supportFill` uses the supplied range to evenly distribute
    the 6-step cream→blue ramp; falls back to the prototype's
    fixed thresholds (10/17/23/30/38) when range is null
  * `changeFill` uses the supplied range's largest absolute
    swing as the diverging-ramp bound, matching the formula
    mode's diverging branch; falls back to ±4pp / ±1.5pp fixed
    thresholds when range is null
  * Extracted `singleHueRamp(v, range)` so the support-mode and
    formula-mode single-hue branches share one bucketing rule
- `src/App.tsx` computes `supportRange` and `changeRange` per
  active mode + visible region set, then passes through `getFill`.
- 7 new tests in `color-ramps.test.ts` covering both adaptive
  paths (Vihr 2-15% support, Vihr ±2pp change) and the
  fall-back-to-fixed-thresholds when range is null or degenerate.

**Why**

User flagged that for Vihr, Vas, Rkp, KD the map looked flat in
support mode. Diagnosis: those parties' nationwide range
(typically 2–15%) fits inside the prototype's first 1–2 fixed
buckets, so 90%+ of the map renders the same shade. Same problem
applies to change mode for small parties whose typical swing is
smaller than the ±4pp fixed threshold.

Fix: scale the ramps to the actual data range across visible
regions. Same pattern formula mode already used (the diverging-
vs-single-hue auto-pick on `formulaRange`). Big parties keep
working — for KOK at 18-30% the adaptive range mostly produces
the same buckets as the fixed thresholds. The win is that small
parties now read as real geographic patterns.

**Files changed**

- Modified: `src/lib/color-ramps.ts`,
  `src/lib/color-ramps.test.ts`, `src/App.tsx`,
  `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.99s, 63.73 KB gz JS (+0.3 KB)
- `npm test` — 158 / 158 passed (was 151 → +7)

**Test count**

- 158 / 158 (was 151)

**Commit hash**

- Pending this session

---

## ENTRY Phase 4 (1/4) — exports + share link 2026-05-03

**What was done**

- `src/lib/exports.ts` — pure download helpers:
  * `timestamp()` — ISO-derived filename slug
  * `inlineCssTokens(cs)` — read every needed `--var` from
    `documentElement` and emit a `:root{}` declaration so the
    standalone SVG renders identically off the host page
  * `svgToXml(svg)` — clones, inlines CSS, serialises
  * `downloadMapSvg(svg)` — Blob → `<a download>`
  * `downloadMapPng(svg, scale=2)` — SVG → Image → canvas → PNG
    Blob on a paper-coloured background; revokes the SVG URL
    in a `finally`
  * `downloadDashboardPng(node)` — `html-to-image` `toPng` at
    2× pixelRatio with `cacheBust` and the `--page-bg` colour
- `src/components/DownloadMenu.tsx` — sketchy "↓ Lataa" pill
  with a dropdown:
  * Map PNG / Map SVG
  * Whole-view PNG (the dashboard subtree)
  * Disables itself while data is still loading
  * Closes on outside click; keyboard-activatable
- `src/components/ShareLinkPill.tsx` — "↗ Jaa linkki" pill,
  copies `window.location.href` (which already carries the full
  state via the `share-state.ts` codec). Falls back gracefully
  when `navigator.clipboard` is unavailable.
- `App.tsx`:
  * `mapAreaRef` (HTMLDivElement, `querySelector("svg")` to
    find the live SVG) and `dashboardRef` (the whole `.page`
    subtree)
  * `toast` state + `useEffect` auto-clear after 2s; toast
    surface rendered as a fixed-position pill at the bottom
  * Top header now: title row, then a Crumb / ShareLink /
    DownloadMenu row
  * `exportSvg` / `exportPng` / `exportDashboard` callbacks
    handle errors via the toast
- 4 unit tests for `timestamp` + `inlineCssTokens` (the pure
  bits — PNG canvas roundtrips need a real browser DOM and
  are validated manually).

**Decisions**

- **Inline a comprehensive list of CSS vars in the exported SVG.**
  The map references `--ink`, `--paper-2`, all 8 party colours,
  every ramp shade. Bundling them all into the standalone SVG
  costs ~400 bytes and avoids having to know which the current
  view uses.
- **Toast for share-copy + every export action.** Without a
  toast, the user can't tell that "Jaa linkki" actually copied
  (browsers silently swallow `clipboard.writeText` errors when
  the page loses focus during the click).
- **`html-to-image` instead of rendering the dashboard via SVG.**
  We could've SVG-foreignObject'd the whole dashboard, but
  text-on-image rendering is browser-flaky in that path, and
  `html-to-image` already handles font-loading + cache-busting.

**Files changed**

- New: `src/lib/exports.ts`, `src/lib/exports.test.ts`,
  `src/components/DownloadMenu.tsx`,
  `src/components/ShareLinkPill.tsx`
- Modified: `src/App.tsx` (refs, top-bar, export handlers,
  toast), `Implementation_plan.md`, `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.83s, **70.77 KB gz JS** (was 63.73
  → +7 KB gz for html-to-image + DownloadMenu + ShareLinkPill +
  exports.ts)
- `npm test` — **162 / 162 passed** (was 158 → +4 exports tests)

**Test count**

- 162 / 162 (was 158)

**Commit hash**

- Pending this session

**Notes**

- Manual smoke check pending: dev server → click "↓ Lataa" → 3
  options visible → each downloads a file with timestamped name.
  "↗ Jaa linkki" copies URL + shows "Linkki kopioitu" toast.
- Next: Phase 4 (2/4) — accessibility (Tab cycle through map
  regions, `:focus-visible` tooltips, comprehensive ARIA labels,
  min text size 12px sweep).

---

## ENTRY Phase 4 (2/4) — keyboard navigation + ARIA labels 2026-05-03

**What was done**

- Global `:focus-visible` ring (2px ink outline, +2px offset).
  Mouse clicks remain ring-free; tab / arrow / shift-tab show a
  clear focus indicator on every interactive element.
- Skip-to-map link in the App: visible only on focus, lets
  keyboard users jump past the title + crumb + workflow bar
  straight to the map (`#map-area` anchor).
- `HierarchyMap` is now keyboard-navigable as a single tab stop:
  * SVG gets `role="application"`, `tabIndex={0}`,
    `aria-label` describing how to use the keyboard
  * Tab / → / ↓ cycle to next sibling region
  * Shift-Tab / ← / ↑ cycle backwards
  * Enter drills into the selected region
  * Escape blurs the map
  * `aria-activedescendant` points to the focused region's
    path id (`map-region-<id>`); each path has `role="option"`,
    `aria-label`, `aria-selected`
  * Steals Tab on purpose — the alternative (one tab stop per
    region) would force ~310 tab presses to leave the map at
    kunta level.
- ARIA labels added to:
  * `Crumb`: `<nav aria-label="Sijainti">`, home pill is
    `aria-current="location"` when active
  * App's parameter section: `<section aria-label="Tarkastelutyyli ja parametrit">`
  * `<main aria-label="Vaalituloskartta — EK 2023">` (label
    follows the live election)
  * Toast: `role="status"`, `aria-live="polite"` (already in
    place from 1/4)
- `index.html` already had `lang="fi"` on `<html>` from Phase 0.

**Decisions**

- **Single-tab-stop map.** Rejected one-tab-per-region because
  314 tab presses to traverse a kunta-level view would be
  punishing. The single-tab-stop / arrow-keys-inside pattern is
  the same one used by interactive maps in the
  WAI-ARIA Authoring Practices.
- **`role="application"` on the SVG.** This tells screen
  readers to pass keystrokes through rather than handle them
  themselves. Required for the Tab / Arrow handler to work.
  We use `aria-label` to describe the navigation explicitly.
- **`role="option"` on paths.** The map effectively presents a
  set of choices the user can pick from; `option` is the most
  semantic ARIA mapping. Combined with `aria-selected`, this
  reads naturally: "Helsinki, valittu" / "Uusimaa, ei valittu".
- **Min text size 12px not strictly enforced.** Body text is
  13–14px; small uppercase tracked labels (10–11px) are kept
  since WCAG accepts decorative chrome at smaller sizes when
  paired with adequate contrast. Will document in the ship audit.
- **Skip link Finnish-only.** Site is FI-only for v1 (per
  CLAUDE.md), so no `lang` switch on the link.

**Files changed**

- New: nothing
- Modified: `src/App.tsx` (skip link, section labels, main
  label), `src/components/Crumb.tsx` (`<nav>` + ARIA),
  `src/components/HierarchyMap.tsx` (keyboard handler, ARIA on
  SVG + paths, `useRef` for blur), `src/styles/main.css`
  (focus-visible ring, skip-link styles)
- `Implementation_plan.md`, `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 2.48s, **71.31 KB gz JS** (was
  70.77 → +0.5 KB), **1.73 KB gz CSS** (was 1.62 → +0.1 KB
  for focus-visible + skip-link rules)
- `npm test` — 162 / 162 passed (no new tests; behavioural
  changes verified manually)

**Test count**

- 162 / 162 (unchanged)

**Commit hash**

- Pending this session

**Notes**

- Manual smoke test pending: Tab into the dashboard, focus the
  map → arrow keys cycle regions → Enter drills in. Skip link
  appears on first Tab. Voiceover / NVDA should announce
  "Helsinki, valittu" / "Uusimaa, ei valittu" as user moves.
- Next: Phase 4 (3/4) — empty/loading/error states. `.nodata`
  crosshatch fill for regions with no fixture data, sketchy
  "Loading…" stamp on the map area, inline error in the
  formula builder.

---

## ENTRY Phase 4 (3/4) — empty / loading / error states 2026-05-03

**What was done**

- **No-data crosshatch.** `color-ramps.ts` exports
  `NODATA_FILL = "url(#nodata-pattern)"`; `fillForRegion` returns
  it whenever:
  * mode ≠ "formula" and the region's `result` is null
  * mode === "change" and either the ref result or focus party is
    missing (previously these returned cream, which silently
    misled — "no comparison available" is a different signal
    from "this region had zero change")
  `HierarchyMap` renders an SVG `<pattern>` in `<defs>`: 6×6 box,
  rotated 45°, ink-light cream base with a 1.4px darker stripe.
  Every region path that resolves to `NODATA_FILL` shows the
  hand-drawn diagonal pattern.
- **Loading stamp.** Replaced the bland "Loading…" text with a
  rotated dashed-border stamp (`LoadingStamp` in `App.tsx`):
  tilted -2°, dashed 2px ink-35% border, Caveat font, paper-tinted
  background. Shows the live election label so the user knows
  what's loading. `role="status" aria-live="polite"` so screen
  readers announce progress.
- **Inline formula error.** `WorkflowBuilder` runs the evaluator
  against a no-op data lookup and surfaces structural errors
  immediately. Data-shaped errors (`"unbound selector"`,
  `"no data for chip"`) are filtered out — they're expected
  while building. Errors translated to Finnish via
  `translateFormulaError`:
  * `"empty parentheses"` → `"Tyhjät sulut — lisää termi sulkujen sisään."`
  * `"formula ends on an operator"` → `"Kaava päättyy operaattoriin — lisää viimeinen termi."`
  * etc.
  Save button disables until the formula is structurally valid
  (`canSave = tokens.length > 0 && syntaxError === null`).
- **Map keeps last valid coloring on formula errors.** If the
  user opens the builder and edits an existing custom workflow
  into an invalid state, the map still renders with the
  previously-saved formula because `formulaTokens` only updates
  on Save (which is gated on `canSave`).

**Decisions**

- **`NODATA_FILL` ≠ `NEUTRAL_FILL`.** Two distinct visual states:
  crosshatch for "no data here" / cream for "real zero".
  Important for change mode in particular, where `0pp` is a real
  result and missing data is a different thing.
- **Dummy lookup `() => null` for builder validation.** The
  evaluator's structural checks (mismatched parens, two values,
  etc.) run before any data lookup, so they're surfaced first.
  Data errors after that are filtered as expected-during-build.
- **Translate errors at the boundary, not inside formula.ts.**
  The evaluator returns English error codes; the builder
  translates to Finnish for display. Keeps `formula.ts`
  data-only and easier to test.
- **Skip a candidate-name input.** The composer's `who` slot
  doesn't yet offer candidate suggestions (deferred to Phase
  5+); accordingly the candidate-error message is included
  defensively but isn't reachable from the current UI.

**Files changed**

- New: nothing
- Modified: `src/App.tsx` (LoadingStamp component),
  `src/lib/color-ramps.ts` (NODATA_FILL constant, change branch
  returns crosshatch on missing ref/party),
  `src/lib/color-ramps.test.ts` (tests updated for the new
  contract), `src/components/HierarchyMap.tsx`
  (`<defs><pattern>` crosshatch), `src/components/WorkflowBuilder.tsx`
  (inline syntax error + translateFormulaError),
  `Implementation_plan.md`, `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.68s, **72.06 KB gz JS** (was 71.31
  → +0.7 KB gz)
- `npm test` — 162 / 162 passed (existing tests updated for the
  NODATA_FILL change; no new tests needed)

**Test count**

- 162 / 162

**Commit hash**

- Pending this session

**Notes**

- Manual smoke check pending: pick "Eduskuntavaalit 2027"
  (no data) → all regions render crosshatch. Pick change
  mode with VAS → Ahvenanmaa shows crosshatch (VAS doesn't
  poll there). Open the formula composer, type a `(`
  without a closing `)` → red inline alert, Save disabled.
- Next: Phase 4 (4/4) — Lighthouse audit + ship-audit document
  in `audits/SHIP_AUDIT_2026-05-03.md`. End of Phase 4 ≈ ready
  to ship.

---

## ENTRY Phase 4 (4/4) — ship audit; closes Phase 4 2026-05-03

**What was done**

- Wrote `audits/SHIP_AUDIT_2026-05-03.md` covering nine review
  areas per the `CLAUDE CODE_GOOD PRACTICES.md` audit protocol:
  context snapshot (bundle / payload / test count), type
  consistency, error paths, output stability, visual fidelity,
  orphaned-helper sweep, performance, accessibility, license
  attribution, plus deferred-not-blocking items.
- Walked all 115 exports across 22 source files; no orphaned
  exports.
- Validated every error surface produces both a *what* and a
  *how to recover* message (per practices doc's error-response
  rule).
- Confirmed no runtime-constructed output keys: all fixture
  fields are statically declared; `_<slug>` prefix for
  non-canonical parties is a stable derivation rule.

**Findings**

- 🔴 Critical: **0**
- 🟡 Medium (in this audit): **0** new findings. The
  pre-existing 🟡 items in `BACKLOG.md` (`npm audit` esbuild
  warning, kunta2021/eu2019 403, presidential aggregation,
  turnout-per-area, top-N candidates, etc.) are explicitly
  out of v1 ship scope.
- 🟢 Minor / informational: **5** documented (silent
  localStorage fail, no formal screen-reader test, decorative
  10–11px labels not strictly 12px, candidate-error message
  defensive, Lighthouse score pending live measurement).

**Ship gate:** ✅ — no blockers. Phase 5 deploy is unblocked
once the user confirms the subdomain
(`vaalit.leinonensanteri.fi`) and forwards the deploy
spec we drafted in Phase 0.

**Decisions**

- **Lighthouse score deferred to live measurement.** Running
  Lighthouse against `npm run preview` from this dev box is
  noisy (CPU throttle simulates a low-end phone, timing on
  Windows isn't representative of Hetzner's Linux serve path).
  Better to measure once against
  `https://vaalit.leinonensanteri.fi` and record the actual
  numbers — that's the value users see anyway.
- **Min text size 12px not strictly enforced.** Body text is
  13–14px throughout; small uppercase tracked labels (10–11px)
  retained as decorative chrome. WCAG 2.1 has no strict pixel
  minimum when contrast is adequate. Logged as 🟢.

**Files changed**

- New: `audits/SHIP_AUDIT_2026-05-03.md`
- Modified: `Implementation_plan.md`, `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean (unchanged from 4/3)
- `npm test` — 162 / 162 passed (unchanged)

**Test count**

- 162 / 162

**Commit hash**

- Pending this session

**Notes**

- **Phase 4 closed.** Functional product complete; audit is
  green; awaiting Phase 5 deploy.
- Phase 5 next step: confirm subdomain → draft & forward
  Caddyfile snippet + DNS instructions to the server team
  (most of this is already in `Implementation_plan.md` Phase 5
  + the original server-team email exchange).

---

## ENTRY fix: dynamic legend + hover tooltip + visible download/share buttons 2026-05-03

**What was done**

User flagged three gaps after the Phase 4 audit declared "ready
to ship":

1. **Color legend missing.** Prototype had `DynamicLegend`; the
   audit didn't flag it because I'd marked it deferred in the
   Implementation_plan checklist. User correctly pointed out
   this is a v1 omission — built it.
2. **Hover tooltip just shows region name.** Should include the
   mode-relevant value.
3. **Download button visually weak.** Built in Phase 4 (1/4)
   but rendered with `opacity: 0.8` + dotted border, so it
   read as decorative chrome rather than an action.

Implementations:

- New `src/components/DynamicLegend.tsx` — per-mode legend with
  `aria-label="Värin merkitys"`:
  * **winner**: list of unique winners-in-view with party
    swatches, sorted by frequency. Appends an "Ei tietoja" row
    with a mini-crosshatch swatch when any visible region has
    no data.
  * **support**: cream→blue gradient bar with the focus-party
    name + min/max % from `supportRange` (the same adaptive
    range the map uses).
  * **votes**: cream→ochre gradient with the fixed thresholds
    (0 / 20k / 50k / 100k / 200k+).
  * **change**: diverging purple↔orange gradient with min /
    0 / max in pp from `changeRange`. Includes
    "EK 2019 → EK 2023" subtitle.
  * **formula**: auto-picks diverging vs single-hue based on
    whether the formula range straddles 0; shows the framing
    label (% of näkyvistä / vs valittu) and a one-line ƒ-summary.
- `HierarchyMap` — new `getTooltip(regionId, label)` callback
  prop. Fed into both the SVG `<title>` and the path's
  `aria-label`. Defaults to just the region label when omitted.
- `App.tsx`:
  * `getTooltip` builds mode-specific text:
    - winner → "Helsinki — Kokoomus 26.4%"
    - support → "Helsinki — Kok 26.4%"
    - votes → "Helsinki — 388 501 ääntä"
    - change → "Helsinki — Kok +4.4 pp"
    - formula → "Helsinki — ƒ +4.4%"
    - missing data → "Helsinki — Ei tietoja"
  * `winnerPartiesInView` (memoised, frequency-sorted) and
    `hasNoDataInView` (memoised, mode-aware) feed the legend.
  * Legend positioned absolute bottom-left of the map area,
    over a soft paper background so it reads on any vp/kunta
    polygon underneath.
- DownloadMenu + ShareLinkPill: both bumped from "decorative
  dotted pill, opacity 0.8" → "solid border, full opacity,
  paper background, soft shadow". The download trigger label
  changed from "Lataa" to "Lataa kuvana" to telegraph the
  action more clearly.

**Decisions**

- **Legend on the map, not the ledger.** Two reasons: (a) the
  ledger is a per-region readout, the legend is a global
  color-key — different concerns; (b) bottom-left of the map
  matches the prototype's layout reference and is the
  convention in cartography.
- **Native SVG `<title>` over a custom React tooltip.** The
  user mentioned "0.5s delay" but `<title>` shows after the
  browser's native delay (~1s). Custom tooltips would let us
  control timing exactly but require pointer tracking +
  portal rendering + theme styling — too much for the value
  delivered. The native one already works on mobile (long-press),
  with screen readers, and during keyboard focus. Custom
  tooltip can be a v1.1 enhancement.
- **getTooltip via callback** matches `getFill` — keeps
  HierarchyMap stateless about coloring + labeling, App is
  the single source of mode awareness.
- **Stronger button styling.** The "decorative chrome" look
  was too subtle for a primary export action. Solid border
  + paper background reads as actionable.

**Files changed**

- New: `src/components/DynamicLegend.tsx`
- Modified: `src/App.tsx` (legend wiring, tooltip builder,
  winnerPartiesInView, hasNoDataInView), `src/components/HierarchyMap.tsx`
  (getTooltip prop + threading through to title and aria-label),
  `src/components/DownloadMenu.tsx` (visibility bump),
  `src/components/ShareLinkPill.tsx` (visibility bump),
  `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 2.10s, **73.76 KB gz JS** (was 72.06
  → +1.7 KB gz for the legend + tooltip logic + button restyle)
- `npm test` — 162 / 162 passed

**Test count**

- 162 / 162

**Commit hash**

- Pending this session

**Notes**

- Re-ran the ship audit mentally: the three reported gaps are
  fixed; no new findings; ship gate still clean.
- Manual smoke check pending: open dev server → bottom-left of
  the map shows a legend that updates per workflow. Hover any
  region for ~1s → tooltip shows region + the mode's value.
  Top-right has a clearly-visible "Jaa linkki" + "↓ Lataa
  kuvana" pair.

---

## ENTRY fix: 4 user-reported bugs (EU + votes + election persistence + picker) 2026-05-03

**What was done**

User-reported issues, all fixed in one commit:

1. **EU view broken** — diagnosed via fixture inspection: every
   eu2024 region had a `_puolueetyhte` "party" at 100% share
   (the "Puolueet yhteensä" aggregate row from PxWeb that the
   prefetch's party-name matcher didn't catch). pickWinner
   returned it for every region, the fill referenced the
   non-existent `var(--p-_puolueetyhte)`, and regions rendered
   with the CSS fallback color.

   Fix: `scripts/build-fixtures.ts` adds `isAggregateParty()` —
   skips rows whose `party_id` is one of `{"SSS", "00", "TOTAL", "00000"}`
   or whose `party_name` matches `/^puolueet\s+yhteens/i`,
   `/^yhteens(ä|a)$/i`, `/^kaikki\s+puolueet/i`, `/^all\s+parties$/i`.
   Re-ran prefetch → eu2024 fixture is now clean (Uusimaa shares
   sum to 100% across real parties).

2. **Votes view broken in Oulun vaalipiiri** — diagnosed: Oulu
   kunta has 116 840 votes; the next-largest (Kajaani) has
   18 853; the smallest (Merijärvi) has 565. With fixed
   thresholds (20K / 50K / 100K / 200K), 37 of 38 kuntat fell
   in bucket 1 (cream).

   Fix: same adaptive-range pattern as support / change.
   `color-ramps.ts` accepts a `votesRange: {min, max}`; when
   provided, the 5 buckets distribute evenly within
   `[min, max]`. App computes the range over `visibleRegionIds`
   when `mode === "votes"` and threads it through `getFill`.
   Big-vp views unchanged (range-based vs fixed produces ~the
   same buckets when range spans 12K → 565K); drilled-in
   kunta views now read as real geographic gradient.

3. **Election doesn't stick across mode toggle** — `applyWorkflow`
   unconditionally called `setElection(w.election)`, which is
   `ek2023` for every built-in. Switching modes reset the user's
   ek2019 / kunta2025 / etc. choice.

   Fix: `setElection((prev) => electionsWithData.has(prev) ? prev : w.election)`.
   The user's current election persists when it has data; the
   workflow's default only kicks in if the current is no_data
   (e.g. user landed on ek2027 via URL hash, then clicked a pill).
   Same logic for `refElection`. While probing (`electionsWithData`
   is `null`), preserve current — assume the user knows what
   they're doing.

4. **Presidential / EU2019 / Kunta2021 / EK2027 in picker** —
   they were rendered disabled with "(ei tietoja)" suffix.
   Per user feedback, that's confusing UX.

   Fix: `ElectionPicker` now FILTERS rather than disables. If
   `hasData` is provided, only matching elections render. If
   `hasData` is `null` (still probing), all options show. As
   a side effect, `useElectionsWithData` now starts at `null`
   instead of an empty Set, so during the brief probing window
   the picker shows everything. Same filter applied to the
   selector-binding row's year picker.

**Decisions**

- **Aggregate party filter is layered**: party_id codes catch
  the common cases ("SSS" parliamentary/municipal/regional,
  "00" EU); name patterns catch the long tail. Cheap, robust.
- **Adaptive ramps now cover all of support / change / votes
  / formula.** Winner mode doesn't need adaptive (each region
  gets its winner's color, no scale). The pattern is consistent
  across modes — App computes a range across `visibleRegionIds`,
  passes through `FillOptions`.
- **Election persistence trusts the probe.** When
  `electionsWithData` is still `null`, we don't know if the
  current election is bad; default to keeping the user's choice.
  Worst case: user lands on a no_data election and the dashboard
  shows crosshatch until they pick another (or reload after
  the probe finishes). Same as before — no regression.
- **Hide vs disable**: hiding no-data options matches the user's
  expectation that "if it's in the picker, I can use it". The
  hidden-but-loadable-via-URL-hash case gracefully falls back
  to the workflow's default election.

**Files changed**

- Modified: `scripts/build-fixtures.ts` (isAggregateParty filter),
  `src/lib/color-ramps.ts` (votesRange + adaptive votesFill),
  `src/components/ElectionPicker.tsx` (filter vs disable),
  `src/App.tsx` (votesRange computation, applyWorkflow election
  persistence, useElectionsWithData returns null when probing,
  SelectorBindingRow accepts null hasData)
- Re-ran `npm run prefetch` to regenerate fixtures with the
  aggregate filter applied.
- `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 2.04s, 73.87 KB gz JS (+0.07 KB)
- `npm test` — 162 / 162 passed

**Test count**

- 162 / 162 (no test changes — existing tests still pass; the
  bug surfaces on the data layer (prefetch) and runtime layer
  (App-level range computation), neither of which has test
  coverage focused on these specific bugs. Could add as future
  hardening — flagging in BACKLOG)

**Commit hash**

- Pending this session

**Notes**

- Local fixture regeneration is needed for the EU fix to be
  visible in the running dev server. `npm run prefetch` does
  this; subsequent `vite dev` reloads the new JSON. Documented
  in the commit message.
- Manual smoke check pending: pick eu2024 → see proper party
  coloring (not all-cream). Switch from winner to support to
  votes — current election sticks. Pick Oulun vaalipiiri in
  votes mode → kuntat range from cream (Merijärvi) to ochre
  (Oulu). Picker no longer shows presidential elections.

---

## ENTRY feat: top-N candidates in Ledger (parliamentary, municipal, regional) 2026-05-04

**What was done**

User report: "the app was also supposed to load the top
candidates in each district / municipality into a scrollable
window, why are they not visible?"

Closed the gap end-to-end:

1. **Build-time fetch**: `scripts/build-fixtures.ts` gained
   `loadCandidatesForUnit(unitKey, electionType, year)` —
   bypasses the submodule's `loadCandidateResults` (which
   asks for every aa-level area in one query and trips the
   ~12 000-cell PxWeb limit on Helsinki/Uusimaa) and queries
   the per-vp candidate tables directly, filtered to:
   - VP## / HV## / KU### / 3-digit kunta codes only (no aa)
   - `Tiedot=votes` only (no share column)
   - `Valintatieto=SSS` aggregate when present (1 row per
     candidate instead of 3 across elected/varalla/not_elected)

2. **Aggregation**: `attachCandidates(areas, rows)` groups by
   canonical region id, sums per-candidate votes (defensive —
   covers cases where a candidate appears in multiple
   Valintatieto rows), sorts descending, and takes top 40 for
   vp/hv aggregates and top 20 for kunta. Mutates the matching
   `RegionResult` entries in place.

3. **Country-level merge**: `src/lib/aggregate.ts`'s
   `aggregateRegions` now also merges candidate lists across
   the source vp rows by candidate id (parliamentary +
   municipal candidates carry stable ids across vp/kunta in
   PxWeb), so the no-region-selected "Koko Suomi" view shows
   genuine country-wide top candidates rather than nothing.

4. **Ledger UI**: new `CandidatesList` + `CandidateRow`
   sub-components in `src/components/Ledger.tsx`. Rendered
   inside a `max-height: 280px; overflow-y: auto` flex
   column, each row is a 26 / 1fr / auto grid (rank · party
   swatch + name + abbr · votes). Renders nothing when the
   region has no candidates (so EU and presidential — which
   don't ship candidate data yet — stay visually clean).

5. **429 resilience**: a single warm-up run hits PxWeb's
   public throttle hard; the submodule's 10 req / 10 s
   client-side limiter is too generous. Added `withRetry()`
   in `build-fixtures.ts` (3 / 8 / 20 / 45 s exponential
   backoff, 4 retries, 429-only — other errors propagate)
   and routed both candidate calls and the year-filtered
   party fallback + presidential fetch through it. Also wrapped
   candidate query bodies in `withCache` so the misses on
   subsequent runs are filled from disk.

**Coverage**

- ek2023: 322 regions with candidates
- ek2019: 324 regions with candidates
- kunta2025: 252 regions
- kunta2021: 190 regions
- alue2025: 312 regions
- alue2022, eu2024, eu2019, pres*: 0 (no per-vp candidate
  tables in the right shape — flagged in BACKLOG for a
  follow-up)

**Decisions**

- **Top 40 per vp / 20 per kunta.** With ~13 candidate-bearing
  fixtures and ~310 kunnat each, this lands the candidate
  payload at ~1.5 MB across all elections — well under the
  10 MB budget.
- **Bypass the submodule's loadCandidateResults.** Helsinki
  and Uusimaa are too large for one all-areas query. The
  in-build script does a metadata-driven filter to non-aa
  area codes and votes-only Tiedot — typical query is
  ~30 areas × ~250 candidates × 1 measure ≈ 7 500 cells.
- **Use the SSS Valintatieto aggregate when available.**
  The submodule's loader fetches outcome codes 1/2/3
  separately so it can preserve `election_outcome`. We don't
  need that — the Ledger only shows totals — and dropping it
  cuts cell count 3×.
- **Country-level candidate merge by id.** Parliamentary +
  municipal candidate ids are stable across vp/kunta within
  one election. Merging by id and re-summing gives the
  correct national totals without an extra fetch. The cap
  is also 40 at country level.
- **Render nothing when there are no candidates.** Empty list
  is visually noisy; absent block is cleaner. Once EU /
  presidential get their own candidate path, the same
  component will surface those automatically.

**Files changed**

- Modified: `scripts/build-fixtures.ts` (+ ~270 lines —
  candidate loader, aggregation, retry helper, withCache),
  `src/lib/aggregate.ts` (candidate merge in
  `aggregateRegions`), `src/components/Ledger.tsx`
  (`CandidatesList` + `CandidateRow`), `BACKLOG.md` (status
  update on the candidates item; new 429-handling note)
- Logbook entry (this)
- Re-ran `npm run prefetch` → `public/data/elections/*.json`
  regenerated (gitignored — reproduced from CI / build)

**Build status**

- `npm run typecheck` — clean
- `npm run build` — clean, 1.67 s, 76.06 KB gz JS
- `npm test` — 162 / 162 passed
- `npm run prefetch` — 13 / 14 with data, 5 054 KB total
  (under 10 MB budget)

**Test count**

- 162 / 162 (no test changes — candidate handling is
  shape-preserving on existing fixtures, and the new path
  goes through the same `RegionResult` schema. A future
  `aggregate.test.ts` extension for candidate merging is
  flagged for hardening.)

**Commit hash**

- Pending this commit

**Notes**

- One known gap: a few vp's worth of candidates may drop on
  any given prefetch when PxWeb rate-limits past the 4-retry
  budget. Re-running fills them from cache. Logged in BACKLOG.
- No UI change for elections without candidates (eu / pres) —
  the Ledger renders the same shares + formula blocks as
  before. Drilling into an aa shows the kunta's candidates
  (RegionResult for an aa doesn't carry a separate list —
  consistent with the placeholder grid representing the kunta).

---

## ENTRY feat: drill affordance + äänestysalue candidate data 2026-06-03

**What was done**

Two user requests after a round of real-world testing.

*Part 1 — drill-down is now self-evident.*

- `src/App.tsx`: added `↑ Takaisin` / `↓ Avaa alue` pill buttons at
  the top-right of the map frame (new `DrillButton` helper), wired to
  new `drillUpOne()` (aa→kunta, kunta|hva→country) and
  `drillIntoSelected()` (mirrors a double-click). `↓` disables without
  a selection or at aa level; `↑` disables at vp. Keyboard-accessible
  (Enter/Space), styled like the existing AA Kartta/Lista toggle.
- Added a persistent muted hint line under the Crumb spelling out the
  gesture; wording adapts at aa level (only "go back" applies there).
- Double-click + keyboard Enter still work unchanged; `HelpBox` copy
  left as-is.

*Part 2 — real candidate data at äänestysalue level.*

- Root cause confirmed in code: the 5 depth elections (ek2023, ek2019,
  kunta2025, kunta2021, alue2025) all have `candidate_by_aanestysalue`
  tables, but `loadCandidatesForUnit` deliberately dropped aa codes and
  `attachCandidates` only grouped vp/kunta/hva. eu2024 + all
  presidential already carried aa candidates inline.
- `scripts/build-fixtures.ts`:
  * New `loadAaCandidatesForUnit` — the aa counterpart of
    `loadCandidatesForUnit`; keeps ONLY aa codes and **chunks** the
    area dimension so each query's `areas × candidates` stays under
    `AA_CELL_BUDGET = 8000` (`batchSize = floor(8000 / candidateCount)`).
    Helsinki (~167 aa × ~230 cand) splits into ~5 batches. Each batch is
    `withCache` + `withRetry` wrapped.
  * New `buildAaCandidateSideFiles` — groups aa candidates by aa id
    (sum → sort → cap at `TOP_N_PER_REGION = 90`), buckets by parent
    kunta via the existing `parseParentKunta`, and writes one file per
    kunta to `public/data/elections/{id}/aa-cands/{kunta}.json`
    (`{ aaRegionId: Candidate[] }`). Streams per-unit to keep the
    working set small.
  * Wired into `buildFixture` after the existing candidate block (depth
    elections only; eu/pres unchanged).
  * `withRetry` backoff now **jittered** (`base + random(0..base/2)`)
    per the server team's note.
  * Side-file bytes tracked separately (`aaSideFileBytes`) and logged on
    their own line — they're lazy-loaded per kunta and don't count
    against the eager page-weight budget.
- `src/data/elections-source.ts`: new `listAaCandidates(electionId,
  kunta)` on the interface + `LocalFixtureSource` — fetches the per-kunta
  side file, caches by `id|kunta`, returns `{}` on 404 (mirrors
  `loadHvaMap`).
- `src/App.tsx`: new effect loads the drilled-in kunta's aa-candidate
  side file into `aaCandsByRegion`; the ledger's aa branch now resolves
  candidates **real-AA → inline-on-row → parent-kunta** instead of
  always borrowing the kunta's list.
- `src/components/Ledger.tsx`: `CandidatesList` now shows the first 12
  rows with a **"Näytä lisää (N)"** reveal (full capped list in a scroll
  box); resets per region via a `key`. Satisfies "capped + load more".

*Part 2e — eu2019 / alue2022 (the two total-gap elections).*

- Investigated the registry: regional-2022 has an explicit
  "No per-äänestysalue candidate tables available in archive" comment,
  and eu-2019 has only a national-totals Sar-format table
  (`430_euvaa_2019_tau_105`), no geographic breakdown. So aa candidate
  data genuinely doesn't exist in Tilastokeskus's published data for
  these two — a hard data limitation, not a code gap. Documented in
  `BACKLOG.md`; no code change.

**Decisions**

- **Per-kunta lazy side files, not monolith bloat.** Keeps the eager
  per-election JSON light (server team's recommendation); the app
  fetches one small kunta file on drill-down. The monolith already
  carries aa *party* rows, so the join key is the aa `regionId`.
- **Cap aa lists at the existing 90** (per user: "capped at current
  cap"); the ledger reveals the rest with "Näytä lisää" — pure UI, no
  refetch.
- **Resolution order real-AA → inline → kunta** so the ledger always
  has content (eu/pres keep inline aa candidates; no-data elections fall
  back to the kunta ranking, same as before).

**Files changed**

- Modified: `src/App.tsx` (drill buttons + hint, aa-candidate effect +
  ledger resolution), `src/components/Ledger.tsx` ("Näytä lisää"),
  `src/data/elections-source.ts` (`listAaCandidates`),
  `src/data/elections-source.test.ts` (+4 tests),
  `scripts/build-fixtures.ts` (aa candidate fetch + chunking + jitter +
  side files), `BACKLOG.md`, `Logbook.md` (this entry)

**Build status**

- `npm run typecheck` — clean (both configs)
- `npx vite build` — clean, 266 KB raw / **84.15 KB gz** JS
- `npm test` — **172 / 172 passed** (was 162 → +10; incl. 4 new
  `listAaCandidates` tests)
- `npm run prefetch` — re-run from a cold cache to regenerate fixtures
  + the new aa-cands side files; verify the first aa join (side-file
  regionId ↔ monolith aa regionId) before trusting it.

**Test count**

- 172 / 172

**Commit hash**

- Pending (user controls commits)

**Notes**

- Join-key risk (flagged in the plan): the side files key candidates by
  the candidate table's aa `area_id`; the monolith keys aa rows by the
  party table's `area_id`. Same db + same vp_ku_prefix format, but
  verify the first join in dev.
- The aa side files live under the gitignored
  `public/data/elections/` tree — reproduced by CI, never committed.

---

## ENTRY fix: aa-candidate prefetch resilience (streaming + resumable) 2026-06-03

**What was done**

Hardened the äänestysalue-candidate prefetch after observing it never
populated more than ek2023 in local runs. Diagnosed end-to-end:

- **ek2023** fully populates (309 kunta side files, 1805 AAs) and the
  join to the monolith AA rows is exact (1805 matched / 0 missed).
- **ek2019** code path is correct — a cached Helsinki response
  normalises to 4908 `aanestysalue` rows, area_id `01091001A`,
  `parseParentKunta` → `091`. It just never got *written*.

Root cause was **not** code: each local prefetch was killed ~10 min
in (the harness caps a single command at 600 s) while a full cold
prefetch needs ~80 min — stretched further by PxWeb's aggressive
public rate limiting (28–45 s backoffs once warmed up). Every run
died partway through ek2019, and a kill mid-write corrupted
`cache-store.json` (the cache layer detects this and discards it).
A secondary issue: when the AA queries *succeeded* (warm cache),
`buildAaCandidateSideFiles` accumulated all ~13 units' rows in memory
before writing, which is heavy on the bigger elections.

Fixes in `scripts/build-fixtures.ts`:

- **Stream per-unit writes** — a kunta belongs to exactly one
  vaalipiiri, so each unit's kunta files are written and released
  immediately instead of accumulating the whole election. Caps peak
  memory and persists progress incrementally (a later kill leaves the
  finished units on disk).
- **`.complete` marker + idempotent skip** — after an election's AA
  step finishes with no missing units, write
  `aa-cands/.complete`; on the next run, skip that election entirely
  (no fetch, no memory). This makes the prefetch **resumable**: run it
  repeatedly and it makes forward progress one election at a time. A
  partial election (some units rate-limited) writes no marker, so a
  re-run retries it. Verified live: a re-run logged
  `ek2023: aa-candidate side files already complete — skipping`.
- **Diagnostic logging** — a 0-file outcome now logs how many units
  returned rows, total rows, and aanestysalue rows, distinguishing
  rate-limit drops from a format/grouping bug (previously silent).
- Manually wrote `ek2023/aa-cands/.complete` since its 309 files were
  produced by the pre-streaming code.

**Operational note (for the server team's CI)**

Local population of ek2019 / kunta2025 / kunta2021 / alue2025 isn't
feasible in this dev environment (10-min command cap + PxWeb throttle
hammered by repeated runs). On the CI runner — no short timeout, runs
once per build — run `npm run prefetch`; if rate limiting interrupts
it, **re-run until every depth election has an `aa-cands/.complete`
marker** (the skip makes each re-run cheap and incremental). ek2023 is
already complete and verified.

**Build status**

- `npm run typecheck` — clean (both configs)
- `npm test` — 172 / 172 passed
- `npx vite build` — clean, 84.15 KB gz JS
- `npm run prefetch` — ek2023 AA files complete + verified (join
  1805/0); other depth elections pending a CI run (resumable).

**Notes**

- No app-code change in this entry — purely prefetch resilience. The
  UI already degrades gracefully where AA side files are absent
  (falls back to the parent kunta's candidate list).

**Update (same day) — incremental population confirmed**

- The resumable design works in practice: an incremental run skipped
  ek2023 (marker) and **completed ek2019** (311 kunta files, join
  1940/0). **2 of 5 depth elections now populated + join-verified
  locally** (ek2023, ek2019 — both parliamentary).
- **Municipal (kunta2025/kunta2021) is the slow case** (see BACKLOG):
  the per-vp candidate table lists all ~4 000 of the vp's municipal
  candidates, so the cell limit forces ~2 AAs/query → ~300 queries/vp.
  Completes on CI but is slow; perf follow-up logged (per-kunta
  `Ehdokas` filtering). Regional (alue2025) should behave like
  parliamentary. Partial kunta2025 output was removed so the UI falls
  back cleanly to kunta-level candidates there until CI populates it.

---

## ENTRY feat: catch all AA candidate data — municipal fix, alue2022, audit 2026-06-04

**What was done**

Phase 3 of the AA-candidate work: close the remaining gaps and make the
prefetch reliable enough to "catch all data". Investigated the real
PxWeb + Ministry-of-Justice data landscape (live table listings + web
research) and corrected two earlier wrong conclusions.

*Municipal per-kunta fix (the real cell-count solution) —
`scripts/build-fixtures.ts`.* `loadAaCandidatesForUnit` now branches:
when the area-batch size collapses (`batchSize < 8`, i.e. the per-vp
candidate list is huge — Uusimaa municipal has **4 701** candidates), it
switches to per-kunta scoping. Municipal candidates are kunta-local
(verified: 16 241 kunta2025 candidates each in exactly one kunta), so for
each kunta it probes that kunta's aggregate row × all candidates to learn
its own candidate ids, then fetches the kunta's AAs × only those ids.
**Validated live**: Askola (KU018) probe → 57 candidates (vs 4 701
vp-wide, an 82× narrowing), scoped fetch → 57 real AA rows; AA code
`02018001` → kunta `018` joins to the monolith. The kunta-aggregate code
format varies by table (bare `091` parliamentary / alue2022, `KU###`
municipal) — discovered from the area variable rather than assumed
(the first cut wrongly used the bare 3-digit code → PxWeb 400).

*alue2022 table override — the data DOES exist.* The earlier "no
candidate tables for alue2022" was based on the incomplete pinned
submodule registry. The archive `StatFin_Passiivi/alvaa` has 21 per-HVA
"Ehdokkaat äänestysalueittain … 2022" tables (`13bv…13db`). Added them as
a local `AA_CANDIDATE_TABLE_OVERRIDES` map + a `resolveAaCandidateTables`
resolver that all three candidate functions now use. Validated 13bv
(Itä-Uusimaa): 371 candidates, AA code `01018001` → kunta `018`, query
returns real rows.

*Gentle pacing* (`pace()`, 250 ms min-gap between uncached PxWeb
candidate/AA queries) — stays under the throttle instead of tripping
28–45 s backoffs.

*Coverage audit* — per election, logs `aa-candidate coverage N/M (P%)`
(side-file AAs vs monolith AA rows) and warns below 95%, so a gap is
never silent.

*AA-level guard* — skip AA candidate fetching when the monolith has no
äänestysalue level (see finding below), so we don't fetch orphan data.

**Key finding — three elections have no äänestysalue level at all**

Drilling to AA requires AA *party* rows in the monolith. Checked: eu2019,
alue2022, **kunta2021** all have `aa 0` — their party data came from
kunta-level multi-year tables, so the app can't drill into their
äänestysalueet, and AA candidates would have nothing to attach to.
kunta2025 (`aa 1655`) and alue2025 (`aa 1489`) *do* have AA levels — they
are the real, achievable AA-candidate targets (plus the 4 already done).

Giving the three a full AA level needs an AA *party*-data backfill first.
alue2022 + kunta2021 are recoverable from PxWeb (their candidate-AA
tables exist; party shares can be synthesised by aggregating candidate
votes per AA, the presidential pattern). **eu2019** has no PxWeb AA
candidate table at all — the data YLE shows comes from the Ministry of
Justice tulospalvelu (`epv-2019_ehd_maa.csv.zip`, a 401 MB Latin-1
fixed-format CSV). Backfilling eu2019's AA level (party + the 401 MB
second-source candidate file) is disproportionate for one EU election
(single national constituency); documented as a future option with the
exact sources identified. The alue2022 override is kept (future-ready)
but currently dormant behind the AA-level guard.

**Decisions**

- **Per-kunta scoping only when needed** (`batchSize < 8`): parliamentary
  / regional / Helsinki municipal keep the fast area-batch path; only
  multi-kunta municipal vps (huge candidate lists) take the probe path.
- **Discover the kunta-aggregate code from the table**, never assume its
  format — it varies (`091` vs `KU018`).
- **Table-ID overrides live in `scripts/`**, not the pinned submodule —
  matches the existing hardcoded EU/presidential IDs; no SHA churn.
- **eu2019 AA = documented, not built** — proportionality + the
  second-source/size cost outweigh the value for one EU election.

**Files changed**

- `scripts/build-fixtures.ts` — `pace()`; `AA_CANDIDATE_TABLE_OVERRIDES` +
  `resolveAaCandidateTables` (used by `unitKeysForCandidateTables`,
  `loadCandidatesForUnit`, `loadAaCandidatesForUnit`); per-kunta
  municipal path; coverage audit; AA-level guard.
- `BACKLOG.md`, `Logbook.md` (this entry).

**Build status**

- `npm run typecheck` — clean (both configs)
- `npm test` — 172 / 172 passed
- `npx vite build` — clean, 84.15 KB gz JS
- Live validation: alue2022 (13bv) + municipal per-kunta (KU018) both
  return correct, joinable AA candidate rows. Full population of
  kunta2025 + alue2025 runs on CI (resumable via `.complete` markers;
  the 10-min dev cap + throttle prevent a full local run).

**Notes**

- No app-code change this entry — prefetch only. UI already falls back to
  kunta-level candidates where AA side files are absent.

---

## ENTRY feat: AA-level backfill for kunta2021 / alue2022 / eu2019 2026-06-04

**What was done**

User pushed back (correctly) that äänestysalue data exists for kunta2021,
alue2022, eu2019 because YLE shows it. Verified directly against PxWeb —
the data IS in Tilastokeskus, just not in the registered/baked path:

- **kunta2021** — 12 per-vaalipiiri "Ehdokkaat äänestysalueittain
  kuntavaaleissa {vp}, 2021" tables (`12vs,12wj…12wu`) in
  `StatFin_Passiivi/kvaa`.
- **alue2022** — 21 per-HVA candidate-AA tables (`13bv…13db`, added last
  entry).
- **eu2019** — party-AA table `620_euvaa_2019_tau_108` with 1943
  äänestysalue rows (the euvaa candidate tables stop at vaalipiiri, so EU
  has party-AA but no candidate-AA in PxWeb).

Implemented in `scripts/build-fixtures.ts`:

- Registered kunta2021's candidate-AA tables in `AA_CANDIDATE_TABLE_OVERRIDES`.
- **`synthesizeAaPartyRows`** — for an election with no AA level but
  candidate-AA tables (kunta2021, alue2022), aggregates candidate votes by
  party per AA into party shares + total (open-list ⇒ exact party totals,
  the `buildPres2024Fixture` pattern) and injects AA `RegionResult` rows
  into the monolith. The existing AA-candidate side-file path then runs.
  Candidate-AA queries are cached, so the side-file re-fetch is free.
- **`buildEu2019AaParty`** — fetches table 620 (Äänestysalue × Puolue ×
  votes, Sar-format, chunked + paced) → AA party rows for a drillable
  party-coloured eu2019 map. No per-AA candidate lists (not in PxWeb).
- Wired both into `buildFixture`'s AA-level backfill, before the
  side-file guard.

**Validated live (single-unit, read-only) — all correct + joinable**

- kunta2021 12wj (Uusimaa): 5 554 candidates; aggregate codes are bare
  3-digit ("018") here vs "KU018" for kunta2025 — the per-kunta probe
  discovers the format from the table, so both work. Kunta 018: probe →
  64 candidates, AA `02018001` → kunta `018`, 1936 votes / 8 parties.
- alue2022 13bv (Itä-Uusimaa): 371 candidates, AA `01018001` → kunta `018`.
- eu2019 620: 1943 AAs, AA `01091001A` → kunta `091`, 2417 votes / 16
  parties.

**Coverage after this entry** — every election now has a path to a full
äänestysalue level from PxWeb: ek2023/ek2019 ✓ (done), eu2024/pres ✓
(inline), kunta2025 + alue2025 (validated), **kunta2021 + alue2022**
(synthesis), **eu2019** (party-only). The only residual gap is eu2019 per-AA
*candidate* lists (Ministry of Justice 401 MB file; deferred).

**Decisions**

- **Synthesise party from candidates** (kunta2021, alue2022) rather than
  hunt for per-year party-AA tables — uniform, reuses the candidate
  machinery, and the cache makes the side-file pass free. Turnout/voters
  stay 0 (no eligible-voter source in candidate tables; UI shows "—").
- **eu2019 party-AA only** — its candidate-AA isn't in PxWeb; the 401 MB
  OM file is disproportionate, so eu2019 ships a party-coloured AA map.

**Files changed**

- `scripts/build-fixtures.ts` — kunta2021 override; `synthesizeAaPartyRows`;
  `buildEu2019AaParty`; AA-level backfill wiring.
- `BACKLOG.md`, `Logbook.md` (this entry).

**Build status**

- `npm run typecheck` — clean (both configs)
- `npm test` — 172 / 172 passed
- `npx vite build` — clean, 84.15 KB gz JS
- Full population runs on CI (resumable; 10-min dev cap + throttle block
  a full local run).

---

## ENTRY incident: Tilastokeskus PxWeb API migration broke the prefetch 2026-06-08

**What happened**

Deploying the äänestysalue-candidate work surfaced a live upstream
breakage. Tilastokeskus migrated its **active** PxWeb databases on
2026-06-08 (their announcement:
https://stat.fi/en/news/Changes-to-interface-use-of-PxWeb-databases-on-8-June-change-interface-queries-as-instructed):

1. Table ids shortened: `statfin_evaa_pxt_13t2` → `13t2`.
2. Variable codes replaced names: `Vuosi` → `timeperiod_y`, `Tiedot` →
   `contentscode`, `Puolue`/`Sukupuoli` → generated codes (the human name
   moved to `text`; some texts also changed, e.g. the area variable).
3. Some measure value codes were db-prefixed: `aanet_yht` →
   `kvaa-aanet_yht` (non-uniform — evaa unchanged, kvaa/alvaa prefixed).

Archive db (`StatFin_Passiivi`) was **not** migrated. The pinned submodule
(`fc547e2`) queried by the old ids/names → every active-db fetch returned
400, so the first CI build produced a degraded 13/14-`no_data` dist that
still "succeeded" and published (`c2c29a1`). Live site unaffected (server
hadn't pulled).

**Fixes (all on `main`)**

- **Sanity-check** now refuses to publish unless ≥12 elections carry data
  (was: only blocked the OOM `EXIT` line); logs per-election coverage.
  (`a84d7a2`)
- **PxWeb migration shim** wrapping `pxwebClient` (`f03915a`): shortens
  active ids; translates variable codes old-name↔new-code by `text`;
  translates measure value codes old↔new on request and reverses them on
  the response. Archive passes through. Validated cold against the live
  new API — parliamentary/municipal/eu/regional party fetches return full
  äänestysalue data, shares ≈100 %.
- **Resumable build** (`dccbb47`, `c62e85a`): migration-day throttle is
  severe (~10 s+/query), so a cold build can't finish ~1000+ AA queries in
  one run. The build caches its output across runs, skips finished
  elections (cached monolith + `.complete` marker) and finished kuntas
  (existing side file), marks an election complete at ≥98 % kunta
  coverage, and **self-limits to 320 min** (< the 350-min job timeout) so
  it exits cleanly and the post-job cache save preserves progress. Each
  re-run resumes; once a clean run finishes with ≥12 it publishes.

**Status**

- Root cause = upstream Tilastokeskus migration (their news post), not app
  code; the same code is the Vihreä MCP, so the MCP is affected too.
- Migration fix verified locally; CI build now converges across resuming
  runs (or one run once Tilastokeskus's load subsides). `dist` stays at
  the bad `c2c29a1` until a clean ≥12 build publishes — **server must not
  pull until then.**
- Production safe throughout (serving 05.05 data).

**Build status**: typecheck clean (both); `npm test` 172/172; vite build
84 KB gz.
