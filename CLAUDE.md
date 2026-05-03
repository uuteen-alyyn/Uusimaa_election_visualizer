# Instructions for Claude Code — Uusimaa / Finland Election Visualizer

## Session start (always)

Read these in order **before any work**:

1. **`BACKLOG.md`** — surface any outstanding items to the user
2. **`Implementation_plan.md`** — know which phase we're on; tasks
   marked `[ ]` are still open
3. **`Logbook.md`** — read the last few entries to know what changed
   in the previous session
4. This file (`CLAUDE.md`) — project-specific constraints

For new contributors or when working on the first phase, also read:

- `README.md` — product overview, fidelity, acceptance criteria
- `PRODUCT_NOTES.md` — design intent and edge cases not in code
- `screenshots/` — visual reference for the hand-drawn UI style

When working under `prototype/`: that's the **design reference**, not
production code. Files there are intentionally React-via-CDN +
Babel-in-the-browser; do not import from there at runtime.

## Project standards

This project follows the conventions in
[`CLAUDE CODE_GOOD PRACTICES.md`](CLAUDE%20CODE_GOOD%20PRACTICES.md)
(committed at the repo root):

- **Required files** always present and current: `Implementation_plan.md`,
  `Logbook.md`, `BACKLOG.md`, `CLAUDE.md`
- **Logbook is append-only.** Write the entry **before** moving on
  after each phase or significant work unit. Include files changed,
  build status, test count, commit hash, decisions, notes.
- **BACKLOG entries** added when work is deferred; removed only when
  the user explicitly says done/dropped
- **Implementation plan tasks** marked `[x]` immediately when
  complete; never batched
- **Pre-commit gate**: `npm run build` ✓, `npm run typecheck` ✓,
  `npm test` ✓; record test count in the logbook entry for the commit
- **Stage files explicitly by name** — never `git add .` / `-A`
- **One commit per phase**, message format `Phase N: <what changed>`
  or `fix: <what + why>`
- **Push to `origin main` after every commit**; remote is source of
  truth, never let local diverge by more than one session

## Hard constraints

### Visual fidelity (hi-fi, locked)

- Paper background `#fbf9f4` / `#efebe0`, ink-black foreground
  `#1a1a1a`
- Caveat (headings), Architects Daughter (body), JetBrains Mono
  (monospaced values)
- Hand-drawn pill / chip / button primitives with 1.2–1.8px ink
  borders, slight rotations (`-0.2deg`), soft drop shadows
  (`3px 3px 0 rgba(0,0,0,0.15)`)
- Map polygons themselves are **clean vectors** on real Finnish
  geometry — sketchy chrome around a clean map is intentional
- Design tokens live in `src/styles/tokens.css`. Reference variables;
  never hard-code colors.

### Data layer (no exceptions)

100% from Vihreä MCP. The `vihrea-vaalidata-tilastotAPI-MCP` code
under `submodules/elections/` is the only PxWeb path. Do not add a
parallel adapter or fetch from any other Tilastokeskus endpoint
directly.

Build-time prefetch only: `scripts/build-fixtures.ts` runs the
elections submodule's loaders and writes JSON into
`public/data/elections/`. The deployed app does no runtime data fetch.

### No synthetic data in production

The prototype's `regionData()` is a seeded RNG used for the design
reference only. **Do not ship synthetic data.** The
`LocalFixtureSource` in `src/data/elections-source.ts` is the only
sanctioned data path in the production app.

The first real-data milestone (Phase 2) is rendering eduskuntavaalit
2023 winners across all 13 vaalipiirit, then kunnat-level for one
vaalipiiri.

### License attribution (legal requirement)

Footer must show:

- "Lähde: Tilastokeskus, vaalitilastot (CC BY 4.0)"
- "Tilastointialueet © Tilastokeskus, CC BY 4.0"

## File map (production)

```
src/
├── components/   Dashboard, HierarchyMap, WorkflowBar,
│                 WorkflowBuilder, FormulaComposer, Crumb,
│                 DownloadMenu, DynamicLegend, ElectionPicker,
│                 primitives/
├── data/         elections-source, geometry, catalog
├── lib/          formula, color-ramps, share-state
│                 (pure functions, vitest-tested)
├── styles/       tokens.css, primitives.css
├── types/        elections.ts (RegionResult, ElectionId, Workflow, …)
├── App.tsx       root, URL hash sync
└── main.tsx      ReactDOM.createRoot

public/data/      fi-vaalipiirit.json, fi-kunnat.json,
                  elections/{id}.json  (build artifact, gitignored)
scripts/          build-fixtures.ts
submodules/
└── elections/    vihrea-vaalidata-tilastotAPI-MCP, pinned SHA
prototype/        visual reference; not built / not served
deploy/           Caddyfile.snippet (for the server team)
audits/           SHIP_AUDIT_<date>.md (per ship)
```

## Out of scope for v1

- Level-3 äänestysalueet real boundaries
- Mobile / tablet layout
- i18n beyond Finnish (SV / EN deferred)
- Election-night live results
- SEO via path-routed URLs (hash sharing `#v=…` only)
- Authentication (product is fully public)

## Deployment context

- Hetzner box (personal), alongside `vihrea-mcp.leinonensanteri.fi`
- Server team handles GitHub → Hetzner deploy
- Subdomain (TBC): `vaalit.leinonensanteri.fi`
- On-disk path: `/opt/vaalit/dist/` (mounted into Caddy as
  `/srv/vaalit:ro`)
- Repo: https://github.com/uuteen-alyyn/Uusimaa_election_visualizer
  (public, personal account)
- DNS: A `62.238.0.198` + AAAA `2a01:4f9:c014:52b3::1` for `vaalit`,
  grey-cloud (DNS-only) in Cloudflare
