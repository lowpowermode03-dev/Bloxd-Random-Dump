# Bloxd Codex

An unofficial, dependency-free field guide to **Bloxd**, built from scratch on top of the
archived `Bloxd-Developer-Hub 9.zip` snapshot kept in this repository.

> Every block. Every item. One codex.

The site is a static, hash-routed web app (plain HTML, CSS and ES modules) with its data
generated straight out of the zip: **10,080 registry entries**, **10,068 textures**,
**59 mobs** and **142 mob variations**, plus the extraction monitor's snapshot metadata and
changelogs.

## What is in the box

| Page | What it does |
| --- | --- |
| **Codex** | Search and filter all 10,080 entries by kind, shelf, harvest type, harvest level and properties. Cards link to full records with grouped properties and raw JSON. |
| **Entry** | A dedicated page per registry ID: large pixel texture, badges, mining/combat/tool/armour/food properties, collapsible nested values, raw JSON, previous/next and related entries. |
| **Textures** | The full texture wall — all 10,068 sprites, filterable by kind and canvas size, lazily streamed, with a lightbox that previews at high zoom and downloads a cropped PNG. |
| **Mobs** | 59 mobs, their variations, caught-mob sprites, spawner blocks and spawn orbs. |
| **Lab** | Two calculators wired to real registry values: a break-time calculator (block × tool, with every alternative ranked) and a time-to-KO calculator (damage × armour reduction). Plus an ID finder. |
| **Archive** | Provenance, environment build fingerprints, the latest extraction diff, update history, and downloadable raw JSON/changelogs. |
| Anywhere | ⌘K / Ctrl-K command palette, deep links for every entry, responsive layouts, reduced-motion support. |

## Run locally

```bash
node serve.mjs          # http://localhost:8080
# or
python3 -m http.server 8000
```

Serve the folder over HTTP — opening `index.html` with a `file://` URL will block the JSON
and texture fetches. `serve.mjs` is a zero-dependency static server with gzip, correct font
and manifest MIME types, and a themed 404 page; `PORT=3000 node serve.mjs` changes the port.

## Deploy

Any static host works because all paths are relative.

* **Vercel** — import the repository, leave the framework as *Other*, build command empty.
  `vercel.json` already sets the root as output and adds cache headers.
* **GitHub Pages / Netlify / Cloudflare Pages** — publish the repository root.

## Live Bloxd file monitor

`node serve.mjs` starts a scanner (`scan.mjs`) that sweeps the Bloxd files **every 20
seconds** and reports what it finds on the Archive page and in the header pill:

* **Local files** — `data/` and `media/` (plus the source zip when it is in the checkout)
  are fingerprinted by path, size and mtime. Added, modified and removed files are listed
  on the next sweep.
* **Remote builds** — the index page of `bloxd.io`, `preprod.bloxd.io` and
  `staging.bloxd.io` is fetched and the `<build>.main.<hash>.js` bundle name is pulled out
  of it. Only the HTML is downloaded, never the 3.6 MB game bundle. A change in that build
  id raises a "new Bloxd build detected" toast.
* **API** — `GET /api/scan` returns the latest snapshot, `POST /api/scan/now` forces a
  sweep. The panel also polls every 5 seconds for the countdown.

Tuning, all optional:

```bash
SCAN_INTERVAL_MS=60000 node serve.mjs     # slower sweeps (5 s–1 h)
SCAN_REMOTE=0 node serve.mjs              # local files only, no outbound requests
SCAN_URLS="https://bloxd.io/" node serve.mjs
SCAN_TIMEOUT_MS=2500 node serve.mjs
node scan.mjs                             # one sweep, printed as JSON
```

The scanner needs the long-running `serve.mjs` process. On a static host such as Vercel
there is no `/api/scan`, and the panel explains that the monitor is dormant while the rest
of the archive keeps working.

## Design & brand assets

The site wears Bloxd's own visual language: muted grass-block greens, hard pixel edges,
chunky block shadows and a hand-built 19×19 pixel face mark.

* `assets/bloxd-mark.svg` — the header/footer mark (rounded grass tile + pixel face).
* `assets/favicon.svg`, `assets/icon-180.png`, `assets/icon-192.png`, `assets/icon-512.png`
  — favicon, Apple touch icon and PWA icons, all generated from the same grid.
* `assets/og.png` — 1200×630 social card.
* `assets/blocks/*.png` — the in-game grass and dirt textures (upscaled ×4, nearest neighbour)
  used for the floating hero block and footer texture.
* `assets/fonts/*.woff2` — self-hosted Space Grotesk and Silkscreen, so the site makes no
  third-party requests at runtime.
* `manifest.webmanifest`, `robots.txt`, `404.html` — installability, crawler hints and a
  themed not-found page.

The mark is an original SVG reconstruction of Bloxd's pixel avatar, used here for an
unofficial fan project. Bloxd's name and logo remain the property of Bloxd.

## Rebuilding the datasets

```bash
pip install pillow
python3 tools/build_site.py
```

The builder reads `Bloxd-Developer-Hub 9.zip` directly and rewrites `data/` and `media/`.
It is the single source of truth — no other repository needs to be present.

What it produces:

* `data/entries.json` — a compact, single-request search index (1.15 MB) with short keys.
* `data/details/*.json` — the untouched full registry records, sharded eight ways so a
  detail page only fetches ~600 KB.
* `data/mobs.json` — mobs and variations resolved to texture tiles.
* `data/meta.json` — counts, environment builds, changelog digests, atlas manifest.
* `data/changelogs/*.md` — the original extracted changelogs.
* `media/atlas/*.png` — every texture packed into 13 atlases, one per native canvas size,
  with identical images deduplicated (10,068 source files → 2,392 unique images).
  Packing keeps HTTP requests low and file counts manageable; a uniform canvas size per
  sheet means the frontend can scale a whole sheet by one factor without blurring.
* `media/tex/*.png` — the handful of textures with a canvas size unique enough to be
  stored on their own.

## Project layout

```text
.
├── index.html               app shell (header, footer, palette, lightbox, modal)
├── assets/
│   ├── site.css             design system + every component + Bloxd theme layer
│   ├── bloxd-mark.svg       site logo (grass tile + pixel face)
│   ├── favicon.svg          favicon
│   ├── icon-*.png           Apple touch / PWA icons
│   ├── og.png               social card
│   ├── blocks/              grass + dirt tiles used by the hero cube
│   ├── fonts/               self-hosted Space Grotesk + Silkscreen
│   └── js/
│       ├── main.js          router, header behaviour, global shortcuts
│       ├── data.js          data loading, categories, search, sorting
│       ├── texture.js       pixel-perfect atlas rendering, downloads, lightbox
│       ├── combo.js         searchable dropdown used by the lab
│       ├── palette.js       ⌘K command palette
│       ├── monitor.js       live scan panel + header status
│       ├── ui.js            overlays, modals, toasts
│       ├── util.js          formatting, labels, clipboard, misc helpers
│       └── views/           home, codex, entry, textures, mobs, lab, archive
├── data/                    generated datasets (committed)
├── media/                   generated atlases and one-off textures (committed)
├── tools/build_site.py      zip → site data pipeline
├── serve.mjs                local static server (+ 404 handling, scan API)
├── scan.mjs                 20-second Bloxd file scanner (local + remote)
├── 404.html                 themed not-found page
├── manifest.webmanifest     installable web app metadata
├── robots.txt
├── vercel.json
└── Bloxd-Developer-Hub 9.zip  the archived research snapshot
```

## Data provenance

* Registry read from the archived `Bloxd-Entries-Data` extraction, captured from build
  `vjxd5n.542dd0f9` and last checked on **2026-11-16** (UTC).
* Environment metadata from the archived `Bloxd-Build-Monitor` snapshot
  (`bloxd.io`, `preprod.bloxd.io`, `staging.bloxd.io` — all reporting the same build).
* Latest extracted diff: 9,602 → 10,080 entries on 2026-11-12 — 478 added, 0 removed,
  1,492 IDs moved.

## Known limitations

* This is a static snapshot, not a live API or game client.
* Mob health, damage and movement statistics are **not** part of this extraction, so the
  mob pages do not invent them.
* Some mob variations share a single greyscale sprite that the game tints at runtime.
* Lab results are arithmetic on registry values (`ttb ÷ multiplier`,
  `damage × (1 − reduction)`); movement, latency, enchantments and multi-piece armour
  formulas are not modelled.
* The original hub's archived JavaScript/CSS game bundles are not shipped in this edition;
  this site focuses on registry data, textures, mobs and changelogs.
* Textures and game data remain the property of their respective creators. This is an
  unofficial research project, not affiliated with or endorsed by Bloxd.
