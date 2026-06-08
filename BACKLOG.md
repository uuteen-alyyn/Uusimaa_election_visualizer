# Backlog — Uusimaa / Finland Election Visualizer

Persistent work queue surviving across sessions. **Read at the start
of every session and surface outstanding items to the user.** Items
are removed only when the user explicitly says they're done or
dropped.

Format: priority emoji + short title + status note + date added.

---

## 🔴 Critical

*(none)*

---

## 🟡 Medium

- **Subdomain confirmation** — server team suggested
  `vaalit.leinonensanteri.fi`; user to confirm the exact name before
  DNS records are added in Cloudflare. Blocks Phase 5. *(added 2026-05-03)*
- **Refresh fixtures automation** — once Phase 5 ships, the
  `refresh-fixtures.yml` cron should open auto-PRs when new election
  data lands at PxWeb. Manual trigger is fine for v1; automation is a
  v1.x improvement. *(added 2026-05-03)*
- **`npm audit` — esbuild dev-server CORS (5 moderate)** — vitest's
  bundled vite still depends on esbuild ≤ 0.24.2, which allows any
  page to read your localhost dev server's responses
  ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)).
  Dev-only; production bundle is unaffected. Fix: bump vitest to 4.x
  (breaking change, but we have no tests yet so it's safe to do
  before Phase 1). Address before adding any external collaborator
  to a dev session. *(added 2026-05-03)*
- **`kunta2021` + `eu2019` fetch fails with 403 (cell-count limit)** —
  these two elections fall back to the multi-year tables (`14z7`,
  `14gv`) which exceed PxWeb's ~12 000-cell limit when fetching all
  areas in one query. Fix: iterate per-vp/hv area (one query per
  electoral district, ~13–21 queries instead of 1). Or wait for
  Tilastokeskus to add year-specific tables. *(added 2026-05-03)*
- **Presidential elections — candidate-aggregation deferred** —
  `loadPartyResults` doesn't work for presidential because the
  PxWeb tables only contain candidate rows; party identity comes
  from each candidate's affiliation. Fix: add a presidential branch
  to `scripts/build-fixtures.ts` that calls `loadCandidateResults`,
  groups by candidate's party, and aggregates. Affects 5 elections:
  pres2024 r1/r2, pres2018 r1, pres2012 r1/r2. *(added 2026-05-03)*
- **Turnout per area is hard-coded to 0 in fixtures** — `loadPartyResults`
  doesn't include eligible-voters. Need a separate fetch from the
  `turnout_by_aanestysalue` table per election (or use the
  voter-background table). UI should show "—" when turnout is 0
  rather than rendering as 0%. *(added 2026-05-03)*
- **Top-N candidates per area — partially done; gaps in EU + pres** —
  parliamentary 2023/2019, municipal 2025/2021, and regional 2025
  now ship a top-N candidate list per vp + kunta (40 + 20). EU and
  presidential elections still surface no candidates because their
  PxWeb tables are vp-only or national-only — different query +
  aggregation path needed. Add EU 2024 vp-level via 14gx (single
  table) and presidential vp-level via 14db (already loaded for
  shares — extend to keep candidate names). *(updated 2026-05-04)*
- **Some candidate fetches 429/403 once warmed up** — PxWeb's public
  rate limit is more aggressive than the submodule's 10 req/10 s
  client-side throttle. The prefetch retries on 429 (3/8/20/45 s
  backoff, now jittered) and gives up after the 4th attempt.
  Consequence: a clean run after a long-warm cache occasionally drops
  1–3 vp's worth of candidates per election. Re-running fills in the
  misses (cached). Long-term: route all calls through `withCache` so a
  single cold warm-up is enough. *(added 2026-05-04)*
- **Äänestysalue candidate data — run CI to finish populating** — the
  prefetch fetches AA candidates into lazy per-kunta side files
  `public/data/elections/{id}/aa-cands/{kunta}.json` (streamed, jittered
  + paced, `.complete` marker per election for resumable re-runs, with a
  coverage audit). Elections that HAVE an AA level and full code support:
  **ek2023 ✓ / ek2019 ✓ (done, join-verified), eu2024 ✓ / pres ✓
  (inline), kunta2025 + alue2025 (code validated, await a CI run).** The
  municipal cell-explosion is fixed (per-kunta probe scoping — validated:
  Uusimaa 4 701 cands → 57 per kunta). On CI: run `npm run prefetch` and
  **re-run until each has an `aa-cands/.complete` marker** (cheap +
  incremental; the 10-min dev cap + throttle prevent a full local run).
  *(updated 2026-06-04)*
- **AA-level backfill for kunta2021 / alue2022 / eu2019 — code done,
  await CI population** — these three had `aa 0` in the baked monolith
  (party data came from kunta-level multi-year tables), but the
  äänestysalue data DOES exist in Tilastokeskus PxWeb. Implemented:
  - **kunta2021 + alue2022**: registered their per-vp/per-HVA candidate-AA
    tables (`12vs…12wu` / `13bv…13db`) and `synthesizeAaPartyRows`
    aggregates candidate votes per AA into party shares (open-list ⇒
    exact party totals), injected into the monolith → full AA level
    (party + candidate side files). Validated live (kunta2021 Uusimaa
    kunta 018: 64 candidates; alue2022 13bv).
  - **eu2019**: no candidate-AA table in PxWeb, but party-AA table
    `620_euvaa_2019_tau_108` has 1943 äänestysalue rows — `buildEu2019AaParty`
    adds them → drillable party-coloured AA map. Validated live (1943 AAs,
    party shares). Per-AA *candidate* lists for eu2019 exist only in the
    Ministry of Justice tulospalvelu file (`epv-2019_ehd_maa.csv.zip`,
    401 MB) — deferred (second source + size); eu2019 AA shows party data,
    candidate scroll empty.

  Full population needs a CI run (`npm run prefetch`, re-run to all
  `.complete` markers); the 10-min dev cap + PxWeb throttle block a full
  local run. *(updated 2026-06-04)*
- **Äänestysalue candidate data — no tables for eu2019 / alue2022** —
  eu2024 + all presidential already ship AA candidates inline.
  **eu2019 and alue2022 have no candidate tables in Tilastokeskus's
  published data** at *any* level —
  the submodule registry confirms: regional-2022 has "No per-äänestysalue
  candidate tables available in archive", and eu-2019 has only a
  national-totals Sar-format table (`430_euvaa_2019_tau_105`), no
  geographic breakdown. Hard data limitation, not a code gap. Possible
  future: surface eu2019's national candidate totals at the country
  level only (different archive-format path). *(added 2026-06-03)*

---

## 🟢 Low / future

- **Mobile / tablet layout** — desktop-first for v1; responsive
  redesign deferred. *(out of scope per README; added 2026-05-03)*
- **Level-3 äänestysalueet real boundaries** — pending openly
  redistributable AA geometry from Tilastokeskus. *(out of scope per
  PRODUCT_NOTES.md; added 2026-05-03)*
- **Swedish (SV) UI translation** — Finland's second official
  language; near-must-have for a serious public ship. *(out of scope
  per README; added 2026-05-03)*
- **English (EN) UI translation** — for international press.
  *(out of scope per README; added 2026-05-03)*
- **Election-night live results** — vaalit.fi territory; different
  data shape. *(out of scope per README; added 2026-05-03)*
- **Path-routed URLs** — current product uses `#v=…` hash sharing
  only; SEO via path routes would require migrating to Next.js or
  Astro. Declined for v1 on 2026-05-03.
- **`prototype/` cleanup** — keep as visual reference through Phase 4;
  decide on move-to-`reference/` vs delete after Phase 5 ship.
  *(added 2026-05-03)*
