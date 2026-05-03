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
