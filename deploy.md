# Deployment

This is a fully static single-page app (Vite + React). Builds run in
GitHub Actions on every push to `main` and publish the result to a
`dist` branch in the same repo. The server team's job is to clone
that branch, copy it into Caddy's serve directory, and refresh on
demand. No Node, no PxWeb access, no build tooling on the box.

## What you're publishing

- **Repo**: <https://github.com/uuteen-alyyn/Uusimaa_election_visualizer> (public)
- **Build artifact**: branch `dist` of the same repo. Contains only
  the built static files (`index.html`, `assets/`, `data/`) — no
  source code, no `node_modules`, no submodule. Force-updated on
  every successful CI run.
- **Subdomain**: `vaalit.leinonensanteri.fi`
- **Hosting target**: existing Caddy reverse proxy on the Hetzner box,
  served alongside `vihrea-mcp.leinonensanteri.fi`.
- **On-disk path**: `/opt/vaalit/dist/`, mounted into the Caddy
  container as `/srv/vaalit:ro`.

## DNS records (Cloudflare)

Add these for `vaalit.leinonensanteri.fi`, both grey-cloud (DNS-only;
TLS is terminated by Caddy on the box, not Cloudflare):

| Type | Name   | Value                       |
| ---- | ------ | --------------------------- |
| A    | vaalit | 62.238.0.198                |
| AAAA | vaalit | 2a01:4f9:c014:52b3::1       |

## First-time setup (one-time, server-side)

```bash
# 1. Clone the dist branch only — shallow + single-branch keeps
#    the on-disk footprint tiny (~17 MB instead of ~250 MB for the
#    full source repo).
sudo mkdir -p /opt/vaalit
sudo git clone \
    --branch dist \
    --single-branch \
    --depth 1 \
    https://github.com/uuteen-alyyn/Uusimaa_election_visualizer.git \
    /opt/vaalit/site

# 2. Sync into the Caddy serve path.
sudo rsync -a --delete /opt/vaalit/site/ /opt/vaalit/dist/
```

## Caddy site block

Append to the existing Caddyfile (or import as a snippet):

```caddy
vaalit.leinonensanteri.fi {
    root * /srv/vaalit
    encode zstd gzip
    file_server
    # SPA fallback: every URL that doesn't resolve to a real file
    # serves index.html so client-side hash routing works.
    try_files {path} /index.html
}
```

If the Caddy container is the same one currently serving
`vihrea-mcp.leinonensanteri.fi`, mount the dist directory by adding
to its `docker-compose.yml`:

```yaml
volumes:
  - /opt/vaalit/dist:/srv/vaalit:ro
```

Then `caddy reload` (or restart the container) — TLS is provisioned
automatically on first request.

## Refresh procedure (run on demand)

When the dev team announces a new build is live on the `dist` branch,
SSH into the box and run:

```bash
cd /opt/vaalit/site
git fetch origin dist
git reset --hard origin/dist
sudo rsync -a --delete /opt/vaalit/site/ /opt/vaalit/dist/
```

`git reset --hard` is the right command here (not `git pull`) because
CI force-pushes the `dist` branch — every build is an orphan commit
with no shared history with the previous one. `git pull` would
complain about non-fast-forward; `reset --hard` doesn't.

No restart needed. Caddy serves the new files on the next request.

## Phone-testing before pushing to production

When working on UI changes (especially mobile-affecting ones), you
can preview from your phone without going through CI + the server
refresh by serving the dev build over your local Wi-Fi:

```bash
npm run dev -- --host
```

Vite prints both a localhost URL and a Network URL (something like
`http://192.168.1.42:5173`). On a phone connected to the same
Wi-Fi, open the Network URL — you'll see your in-progress branch
exactly as code changes save. Hot-reload works across the LAN
just like on localhost.

If your firewall blocks the port, allow inbound TCP 5173 on the
dev machine for the Wi-Fi network only (not Public).

For a build-and-preview cycle that mirrors production more closely
(no dev-mode warnings, CSS minified, fixtures served as static
files):

```bash
npm run build
npm run preview -- --host
```

Same Network URL pattern; serves the actual `dist/` artifact.

This is the fastest iteration loop. Reserve the production deploy
(below) for testing the actual Caddy + DNS + cache headers, or
sharing a link.

## Production refresh (when shipping a change)

Push to `main` → CI builds → server team runs the refresh below.

For desktop testing, hit <https://vaalit.leinonensanteri.fi> in
a regular browser. For phone testing, hit the same URL on your
phone — no special path, the page detects narrow viewports and
serves the mobile layout automatically.

## Smoke test (run after every refresh)

### Desktop checks

1. <https://vaalit.leinonensanteri.fi> loads, paper-coloured background,
   13 vaalipiirit visible on the map, Helsinki callout square in the
   Gulf of Finland.
2. Default mittari "Suurin puolue" colours regions with party tokens
   (Keskusta green inland, SDP red, Kokoomus blue in the south).
3. Drill: click Uusimaa → kunnat appear, hover a kunta → tooltip
   shows party + share. Drill again into a kunta → äänestysalueet
   square grid with shortened labels.
4. Switch mittari to "Kannatuksen muutos" + EK 2023 / EK 2019 +
   focus party Kokoomus. Diverging purple↔orange ramp renders.
5. Build a custom kaava (e.g. `Kok % (EK 2023) − Kok % (EK 2019)`),
   save it, reload page → custom pill is back, click → same
   colouring restores.
6. Click "Jaa linkki" → paste the URL in a new tab → identical view
   restores.
7. Footer shows
   "Lähde: Tilastokeskus, vaalitilastot (CC BY 4.0) · Tilastointialueet
   © Tilastokeskus, CC BY 4.0".

### Mobile checks (open the URL on a real phone)

Mobile is in scope as of phase-6 of `Implementation_plan_mobile.md`.
Walk these on iOS Safari + Android Chrome at least once per UI
change:

8. Stacked layout: title + Vaali / Mittari + ledger on top, map in
   the middle, Jaa / Lataa / Käyttöohjeet + per-mode controls +
   legend underneath. No horizontal scroll.
9. Tap Helsinki callout square → ledger updates to "Helsinki
   vaalipiiri". The square is comfortable to hit with a thumb.
10. Drill into a vaalipiiri → kunnat. Tap a kunta → ledger updates
    on first tap, no double-tap needed, no "ghost label" hangs.
11. Drill into a kunta → AA-level. Default view on mobile is
    **list** (scrollable rows with swatch + label), not the dense
    SVG square grid. Toggle pinned to the top-left of the map
    frame ("Kartta / Lista") swaps between them.
12. Tap a row in the AA list → row highlights, ledger updates.
13. Tap "+ Uusi mukautettu kaava…", type "kok" — suggestion list
    appears as a **bottom sheet** above the on-screen keyboard,
    scrollable. Tap a suggestion to add it. Save → modal closes.
14. Tap a `<select>` (Vaali, Mittari) — the picker opens but
    iOS Safari does **not** zoom the page. Page font-size stays
    where you left it.
15. Tap "Käyttöohjeet" → modal opens full-screen, three sections
    stack vertically. Tap ✕ → closes.

Anything that doesn't match → file an issue or paste a screenshot
to the dev team.

## Operational notes

- **Disk footprint**: `dist/` is ~17 MB total. Most of it (~14 MB)
  is the JSON fixtures under `dist/data/elections/`; the JS bundle
  is ~260 KB (~82 KB gzipped) and the CSS is ~6 KB.
- **No backups needed** for the served content — `dist/` is
  reproducible from CI at any time.
- **No secrets, no env vars** on the box.
- **Failure recovery**: if a refresh somehow ships a broken build,
  the previous `dist/` contents are still on disk until the next
  rsync. Roll back by `git reset --hard <previous-dist-sha>` and
  re-rsync — see `git log origin/dist` for the history of build
  SHAs (note that history resets when CI force-pushes, so do the
  rollback before the next CI run lands).

## CI workflow (dev team reference)

The build workflow lives at `.github/workflows/build.yml` and
triggers on:

- **Push to `main`**: every code change.
- **Manual dispatch** (Actions tab → "Run workflow"): use this to
  refresh PxWeb data without a code commit, e.g. after a new
  election's results land at Tilastokeskus.

The workflow checks out with submodules, restores the PxWeb response
cache, runs `npm test` (168 vitest tests), runs `npm run build`,
sanity-checks the prefetch summary line, and force-pushes `dist/` to
the `dist` branch. End-to-end runtime is ~30 s warm, ~6 min on a
cold cache or after a fresh runner image.

If CI fails, the `dist` branch is left alone and the server keeps
serving the previous good build. Fix the issue on `main`, push
again, and CI will publish the new build.

## Appendix: building locally

Only relevant if you can't / won't use the CI artifact (offline
environment, debugging the prefetch, etc.).

```bash
git clone --recurse-submodules https://github.com/uuteen-alyyn/Uusimaa_election_visualizer.git
cd Uusimaa_election_visualizer
npm ci
npm run build
```

`npm run build` chains three steps:

1. `npm run prefetch` — hits PxWeb for every election in the catalog
   and writes `public/data/elections/{id}.json`. First run takes
   ~5 minutes (PxWeb rate-limits to 10 req/10s); subsequent runs
   are seconds because results are cached in `cache-store.json` at
   the repo root.
2. `npm run typecheck` — `tsc --noEmit` over `src/` and `scripts/`.
3. `vite build` — emits `dist/`.

### Build-host RAM requirement

The prefetch holds the full PxWeb response cache (`cache-store.json`,
~110 MB on disk) in memory and rewrites the entire snapshot to disk
on every successful query. Combined with per-election working memory,
peak resident set hits 1.5–2 GB.

A 4 GB / no-swap host **will OOM-kill the prefetch mid-run**. The
`prefetch` npm script already passes `--max-old-space-size=4096
--expose-gc` and forces GC between elections; with ≥ 4 GB of swap
added, the build typically completes:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

If a silent kill persists after that, delete `cache-store.json` at
the repo root and retry — the file can grow unwieldy across many
runs. First run after deletion hits PxWeb fresh (5 min), subsequent
runs reuse the trimmed cache.

### Build summary line

The prefetch always logs one of two summary lines:

```
[prefetch] done — 13 with data, 1 no_data, 0 failed, 14499.4 KB total
```

or, on a partial / killed run:

```
[prefetch] EXIT code=… — partial run: N with data, M no_data, K failed,
            X/14 elections attempted, Y KB written
```

CI fails the build if it sees the EXIT-line variant, so the `dist`
branch is never updated from a partial run. Locally, treat it as
"rebuild needed" — `dist/` is incomplete.

## Contact

For issues or questions: GitHub Issues at
<https://github.com/uuteen-alyyn/Uusimaa_election_visualizer/issues>.
