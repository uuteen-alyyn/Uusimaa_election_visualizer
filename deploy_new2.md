# Deployment — server-team setup guide (2026-06)

Complete, current instructions for getting **vaalit.leinonensanteri.fi**
live and keeping it refreshed. Supersedes `deploy.md` where they differ
(timing, disk size, smoke test, operational notes have changed as of the
äänestysalue-candidate work).

---

## 1. How it works (read first)

This is a **fully static** single-page app (Vite + React). There is a
clean split of responsibilities:

```
 Developer pushes to `main`
        │
        ▼
 GitHub Actions runner  (.github/workflows/build.yml)
   • npm ci  +  npm test
   • npm run build   →  PREFETCH downloads ALL election data from
   │                    Tilastokeskus PxWeb, then vite builds dist/
   • force-pushes dist/ (static files + data) to the `dist` branch
        │
        ▼
 Hetzner box  (the server team)
   • git reset --hard origin/dist   → pulls the pre-built files
   • rsync into Caddy's serve dir   → live
```

**The server never builds, never installs Node, never contacts PxWeb.**
It only pulls a branch of pre-built files and serves them with Caddy.
All the heavy data-downloading happens on GitHub's runner.

---

## 2. What you're publishing

| | |
|---|---|
| Repo | <https://github.com/uuteen-alyyn/Uusimaa_election_visualizer> (public) |
| Build artifact | branch **`dist`** of the same repo — built static files only (`index.html`, `assets/`, `data/`). Force-updated each successful CI run. |
| Subdomain | `vaalit.leinonensanteri.fi` |
| Hosting | existing Caddy reverse proxy on the Hetzner box (alongside `vihrea-mcp.leinonensanteri.fi`) |
| On-disk path | `/opt/vaalit/dist/`, mounted into the Caddy container as `/srv/vaalit:ro` |
| Disk footprint | **~60–90 MB** total. Most of it is the JSON election data under `dist/data/elections/` (per-election files **plus** per-kunta candidate side files under `dist/data/elections/{id}/aa-cands/`). The JS bundle is ~260 KB (~84 KB gz), CSS ~7.5 KB. *(This is larger than older docs said — the äänestysalue candidate lists are new.)* |

---

## 3. DNS records (Cloudflare)

Add for `vaalit.leinonensanteri.fi`, **both grey-cloud** (DNS-only — TLS
is terminated by Caddy on the box, not Cloudflare):

| Type | Name   | Value                  |
| ---- | ------ | ---------------------- |
| A    | vaalit | 62.238.0.198           |
| AAAA | vaalit | 2a01:4f9:c014:52b3::1  |

---

## 4. First-time server setup (one-time)

```bash
# 1. Shallow single-branch clone of the dist branch only.
sudo mkdir -p /opt/vaalit
sudo git clone \
    --branch dist --single-branch --depth 1 \
    https://github.com/uuteen-alyyn/Uusimaa_election_visualizer.git \
    /opt/vaalit/site

# 2. Sync into the Caddy serve path.
sudo rsync -a --delete /opt/vaalit/site/ /opt/vaalit/dist/
```

---

## 5. Caddy site block

Append to the Caddyfile (or import as a snippet):

```caddy
vaalit.leinonensanteri.fi {
    root * /srv/vaalit
    encode zstd gzip
    file_server
    # SPA fallback: any URL that isn't a real file serves index.html so
    # client-side hash routing (#v=…) works.
    try_files {path} /index.html
}
```

If the Caddy container is the same one serving
`vihrea-mcp.leinonensanteri.fi`, mount the dist dir in its
`docker-compose.yml`:

```yaml
volumes:
  - /opt/vaalit/dist:/srv/vaalit:ro
```

Then `caddy reload` (or restart the container). TLS provisions
automatically on first request.

> **Note on the data files**: the app fetches small JSON files at
> runtime from `/data/elections/...`, including lazy per-kunta files like
> `/data/elections/ek2023/aa-cands/091.json` when a user drills into an
> äänestysalue. These are plain static files under the served root —
> nothing special to configure, just make sure the whole `data/` tree is
> synced (the `rsync -a` above does this).

---

## 6. Refresh procedure (each new build)

When the dev team says a new build is on the `dist` branch:

```bash
cd /opt/vaalit/site
git fetch origin dist
git reset --hard origin/dist          # NOT `git pull` — see below
sudo rsync -a --delete /opt/vaalit/site/ /opt/vaalit/dist/
```

`git reset --hard` (not `git pull`) because CI **force-pushes** the
`dist` branch as a fresh orphan commit each time — there's no shared
history, so `pull` would reject it as non-fast-forward.

No restart needed; Caddy serves the new files on the next request.

---

## 7. Smoke test (run after every refresh)

### Desktop

1. <https://vaalit.leinonensanteri.fi> loads — paper background, 13
   vaalipiirit on the map, Helsinki callout square in the Gulf of Finland.
2. Default mittari "Suurin puolue" colours regions with party colours.
3. **Drill buttons (new)**: top-right of the map shows **↑ Takaisin** and
   **↓ Avaa alue**. Select a vaalipiiri → **↓ Avaa alue** drills in;
   **↑ Takaisin** goes back. Double-click still works too. A hint line
   under the breadcrumb explains it.
4. Drill country → vaalipiiri → kunta → äänestysalue. At kunta/AA level
   the left **ledger** shows party shares and an **"Eniten ääniä saaneet
   ehdokkaat"** candidate list.
5. **Candidate scroll (new)**: at an äänestysalue, the candidate list
   shows that AA's own top candidates with a **"Näytä lisää"** button to
   reveal the rest. (For elections still populating — see §8 — it may
   fall back to the kunta's candidates; that's expected, not a bug.)
6. Switch mittari to "Kannatuksen muutos" + EK 2023 / EK 2019 + Kokoomus
   → diverging purple↔orange ramp.
7. Build a custom kaava, save, reload → custom pill returns, restores.
8. "Jaa linkki" → paste URL in a new tab → identical view.
9. Footer: "Lähde: Tilastokeskus, vaalitilastot (CC BY 4.0) ·
   Tilastointialueet © Tilastokeskus, CC BY 4.0".

### Mobile (open the URL on a real phone)

10. Stacked layout, no horizontal scroll. Tap regions → ledger updates on
    first tap. AA level defaults to the **list** view; "Kartta / Lista"
    toggle top-left swaps it. Tapping a `<select>` doesn't zoom the page.
    "Käyttöohjeet" opens full-screen.

Anything off → screenshot to the dev team.

---

## 8. What's new in this build (context for the dev team)

The prefetch now also downloads **per-äänestysalue candidate data** for
the high-candidate elections. This makes a **cold** CI run significantly
longer than before (it was "~6 min cold" — that figure is stale). Two
operational consequences the dev team owns (server team can ignore):

- **CI timeout**: `build.yml` has `timeout-minutes` (currently 20). A
  cold prefetch of the new data may exceed it. If the first build after
  these changes times out, **re-run the workflow** (Actions → Run
  workflow) — the PxWeb response cache (`cache-store.json`) is saved
  across runs, so each re-run is faster until one completes. Consider
  raising `timeout-minutes` (e.g. to 50–60) for cold runs.
- **Coverage audit**: the build log prints, per election,
  `aa-candidate coverage N/M (P%)` and warns below 95%. Use it to confirm
  every election populated before trusting the live site.
- **Resumable**: a `.complete` marker per election means a re-run skips
  already-finished elections quickly.

The build's **sanity-check step refuses to publish a partial prefetch**
(it greps for the `[prefetch] EXIT` partial-run line), so a timed-out or
crashed build leaves the `dist` branch — and therefore the live site —
untouched. You can't ship half-built data by accident.

All data remains **100% Tilastokeskus** (PxWeb). One known gap: eu2019
per-äänestysalue *candidate* lists aren't in Tilastokeskus (only the
Ministry of Justice publishes them); eu2019 shows party-coloured
äänestysalueet but empty candidate scrolls there. Everything else has
full candidate data once CI finishes populating it.

---

## 9. Operational notes

- **No backups needed** — `dist/` is reproducible from CI at any time.
- **No secrets, no env vars** on the box.
- **Rollback**: the previous `dist/` is still on disk until the next
  rsync. To roll back: `cd /opt/vaalit/site && git reset --hard
  <previous-dist-sha> && sudo rsync -a --delete /opt/vaalit/site/
  /opt/vaalit/dist/`. Get the SHA from `git log origin/dist` *before* the
  next CI run lands (force-push rewrites that history).
- **Build-host RAM (dev/CI only)**: the prefetch holds the PxWeb cache in
  memory; peak ~1.5–2 GB. The 16 GB GitHub runner is fine. A small
  self-hosted runner needs ≥ 4 GB + swap or it OOM-kills mid-prefetch.

---

## 10. Contact

Issues / questions: GitHub Issues at
<https://github.com/uuteen-alyyn/Uusimaa_election_visualizer/issues>.
