# Deployment

This is a fully static single-page app (Vite + React). Build it with
`npm run build`; the resulting `dist/` directory is the only thing
that needs to be on the server. No application server, no database,
no runtime API access.

## What you're publishing

- **Repo**: <https://github.com/uuteen-alyyn/Uusimaa_election_visualizer> (public)
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

## Build host requirements

The build itself is the resource-intensive part — once `dist/` is
produced, serving it needs almost nothing.

| Resource     | Build host                          | Serving host          |
| ------------ | ----------------------------------- | --------------------- |
| Node.js      | 20.x or 22.x (tested on v22.22.2)   | n/a (static files)    |
| RAM          | **8 GB recommended, 4 GB minimum**  | tiny — Caddy only     |
| Swap         | enable if RAM ≤ 4 GB                | n/a                   |
| Outbound TLS | `pxdata.stat.fi` (Tilastokeskus)    | n/a                   |
| Disk         | ~250 MB (repo + cache + node_modules) | ~17 MB (`dist/`)    |

**Why so much RAM**: the prefetch holds the full PxWeb response
cache (`cache-store.json`, ~110 MB on disk) in memory and rewrites
the entire snapshot to disk on every successful query. Combined
with per-election working memory while parsing the larger tables
(kunta2025 alone is ~670k rows), peak resident set comfortably
hits 1.5–2 GB.

A small Hetzner CX23 (4 GB / no swap) **will OOM-kill the prefetch
mid-run** unless you both add swap and bake the heap flag. The
`prefetch` npm script already passes `--max-old-space-size=4096
--expose-gc` and the script forces a full GC between elections, so
on a 4 GB box with ≥ 4 GB swap the build typically completes; on a
swap-less box it'll get killed by the kernel without printing
anything to stdout.

**Recommendation**: build locally on a development machine and
`scp` / `rsync` the resulting `dist/` to the server. Each content
update is a one-shot local build. The server then only needs Caddy.

If you do want to build on the server itself:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

If the build still gets killed silently, the most likely cause is
that the cache file has grown unwieldy after many runs. Delete
`cache-store.json` at the repo root and retry — first run after
that hits PxWeb fresh (5 min) but every subsequent run reuses the
trimmed-down cache.

## Build (one-time; repeat to refresh)

The build pulls live election data from Tilastokeskus' PxWeb API at
build time, so the box (or wherever you run `npm run build`) needs
outbound HTTPS to `pxdata.stat.fi`. Once built, the resulting `dist/`
makes no further network calls — every election fixture is baked
into JSON under `dist/data/elections/`.

```bash
git clone --recurse-submodules https://github.com/uuteen-alyyn/Uusimaa_election_visualizer.git /opt/vaalit/src
cd /opt/vaalit/src
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

If the prefetch trips a 429 it'll retry with backoff automatically.
If it gets a hard failure (403, network error, parse error) the
script catches it per-election, writes a `{ "status": "no_data" }`
placeholder for that election, and continues with the rest. The UI
renders an "Ei tietoja" crosshatch for those regions — the rest of
the build still succeeds.

**Always check the trailing summary line.** The script always logs
either:

```
[prefetch] done — 13 with data, 1 no_data, 0 failed, 14499.4 KB total
```

or, if the process is killed mid-run (kernel OOM):

```
[prefetch] EXIT code=… — partial run: N with data, M no_data, K failed,
            X/14 elections attempted, Y KB written
[prefetch] hint: a silent kill at this point is usually OOM. …
```

If you see the EXIT-line variant, treat it as "rebuild needed" —
`dist/` is incomplete (likely missing fixtures + skipped typecheck +
skipped vite build). Don't deploy.

After build, copy or symlink `dist/` to the path Caddy serves:

```bash
rsync -a --delete /opt/vaalit/src/dist/ /opt/vaalit/dist/
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

## Refresh workflow

The deployed app is fully static, so "refreshing" means rebuilding
and rsync-ing.

- **Code changes** (UI / behaviour): pull `main`, run `npm run build`,
  rsync `dist/`. The submodule (`submodules/elections/`) is pinned to
  a specific SHA — `git submodule update --init --recursive` keeps it
  in sync with whatever the parent repo expects.
- **Data refresh** (new election results land at PxWeb): same as
  above. Delete `cache-store.json` first if you specifically want to
  force a re-fetch of every table; otherwise the cache is keyed per
  table and only stale entries are re-fetched.
- **Election added to the catalog**: bump the entry in
  `src/data/catalog.ts`, build, deploy. No data layer changes
  needed — the prefetch follows the catalog.

## Smoke test (run after every deploy)

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

## Operational notes

- **Disk footprint**: `dist/` is ~17 MB total. Most of it (~14 MB)
  is the JSON fixtures under `dist/data/elections/`; the JS bundle
  is ~260 KB (~82 KB gzipped) and the CSS is ~6 KB.
- **No backups needed** for the served content — `dist/` is
  reproducible from the repo + PxWeb at any time.
- **No secrets, no env vars**. The repo is public and the build
  takes no credentials.
- **Build cache** (`cache-store.json` at the repo root, ~7 MB) is
  gitignored. Keep it across builds for fast incremental rebuilds.

## Contact

For issues or questions: GitHub Issues at
<https://github.com/uuteen-alyyn/Uusimaa_election_visualizer/issues>.
