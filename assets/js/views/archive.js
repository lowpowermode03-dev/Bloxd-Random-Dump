import { loadEntries, loadMeta, data } from "../data.js";
import { texHTML } from "../texture.js";
import { esc, num, bytes, date, dateTime } from "../util.js";
import { mountScanPanel } from "../monitor.js";

export async function render(root) {
  const [entries, meta] = await Promise.all([loadEntries(), loadMeta()]);
  const additions = meta.additions
    .map((addition) => data.byId.get(addition.id))
    .filter(Boolean)
    .slice(0, 24);

  const latest = meta.latestUpdate ?? {};
  const detailTotal = meta.data.details.reduce((sum, size) => sum + size, 0);

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <div class="head-row">
          <div>
            <p class="kicker">Provenance</p>
            <h1>Archive</h1>
            <p>Where every number on this site comes from: the extraction run, the production build it was read from, the resulting counts and the raw files you can take with you.</p>
          </div>
          <div class="head-stats">
            <div class="head-stat"><b>${num(meta.counts.entries)}</b><small>Entries</small></div>
            <div class="head-stat"><b>${num(meta.counts.textures)}</b><small>Textures</small></div>
            <div class="head-stat"><b>${esc(date(meta.snapshot?.latestCheck))}</b><small>Last checked</small></div>
          </div>
        </div>
      </div>

      <div class="archive">
        <section class="panel panel-pad scan-panel" id="scanPanel" aria-live="polite"></section>

        <section class="panel panel-pad">
          <p class="kicker">Build snapshot</p>
          <h2 style="font-size:24px;margin:10px 0 6px">Three environments, one archived build.</h2>
          <p class="muted" style="font-size:13.5px;max-width:70ch">The monitor records the production, pre-production and staging builds it observed. All three report the same build identity in this snapshot.</p>
          <div class="archive-grid" style="margin-top:20px">
            ${meta.snapshot.environments
              .map(
                (environment) => `
              <div class="env-card panel">
                <div class="env-name"><span>${esc(environment.name)}</span><i></i></div>
                <div class="env-build">${esc(environment.build ?? "—")}</div>
                <div class="env-sub">Checked ${esc(dateTime(environment.checkedAt))}</div>
                <div class="env-hash">bundle ${esc(bytes(environment.bundleSize))} · ${esc(String(environment.bundleSha256 ?? "").slice(0, 18))}…</div>
                <div style="margin-top:12px">
                  <button class="btn small ghost" type="button" data-copy="${esc(environment.bundleSha256 ?? "")}" data-copy-toast="Bundle SHA-256 copied">Copy SHA-256</button>
                </div>
              </div>`,
              )
              .join("")}
          </div>
        </section>

        <section class="panel panel-pad">
          <div class="head-row">
            <div>
              <p class="kicker">Latest extraction</p>
              <h2 style="font-size:24px;margin:10px 0 6px">
                ${latest.runAt ? esc(date(latest.runAt)) : "Most recent run"}
              </h2>
              <p class="muted" style="font-size:13.5px">
                Registry ${num(latest.from ?? 0)} → ${num(latest.to ?? meta.counts.entries)} ·
                ${num(latest.counts?.Added ?? 0)} added ·
                ${num(latest.counts?.Removed ?? 0)} removed ·
                ${num(latest.counts?.["ID changed"] ?? 0)} IDs moved
              </p>
            </div>
            <a class="btn small" href="data/changelogs/entries-changes.md" target="_blank" rel="noopener">Open raw changelog ↗</a>
          </div>
          <div class="added-list" style="margin-top:20px">
            ${additions
              .map(
                (entry) => `
              <a class="added-item" href="#/entry/${entry.i}">
                ${texHTML(entry.t, 26)}
                <span>${esc(entry.n.split("|")[0])}</span>
                <small>#${entry.i}</small>
              </a>`,
              )
              .join("")}
          </div>
          ${
            meta.additions.length > additions.length
              ? `<p class="dim mono" style="font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;margin-top:16px">Showing ${additions.length} of ${num(meta.additions.length)} captured additions</p>`
              : ""
          }
        </section>

        <section class="panel panel-pad">
          <p class="kicker">Update history</p>
          <h2 style="font-size:24px;margin:10px 0 6px">Recent extractions.</h2>
          <p class="muted" style="font-size:13.5px;max-width:70ch">Each row is a registry diff captured by the entries monitor. ID changes happen whenever the game renumbers its registry.</p>
          <div class="timeline" style="margin-top:16px">
            ${(meta.updates ?? [])
              .map(
                (update) => `
              <div class="tl-item">
                <span class="tl-date">${esc(date(update.runAt))}</span>
                <span class="tl-main">
                  <b>${num(update.from ?? 0)} → ${num(update.to ?? 0)} entries</b>
                  <small>+${num(update.counts?.Added ?? 0)} added · −${num(update.counts?.Removed ?? 0)} removed · ${num(update.counts?.["ID changed"] ?? 0)} ID changes</small>
                </span>
                <span class="tl-delta">+${num((update.to ?? 0) - (update.from ?? 0))}</span>
              </div>`,
              )
              .join("") || `<p class="muted">No update history was found in this snapshot.</p>`}
          </div>
        </section>

        <section class="panel panel-pad">
          <p class="kicker">Take the data</p>
          <h2 style="font-size:24px;margin:10px 0 6px">Raw files.</h2>
          <p class="muted" style="font-size:13.5px;max-width:70ch">Everything the site renders is a static JSON file. Download the compact registry, mob index, snapshot metadata or the original changelogs.</p>
          <div class="downloads" style="margin-top:18px">
            <a class="download" href="data/entries.json" download>
              <span class="dl-icon">↓</span>
              <span><b>Registry (compact)</b><br><small style="margin:0">${bytes(meta.data.entries)}</small></span>
            </a>
            <a class="download" href="data/mobs.json" download>
              <span class="dl-icon">↓</span>
              <span><b>Mobs & variations</b><br><small style="margin:0">${bytes(meta.data.mobs)}</small></span>
            </a>
            <a class="download" href="data/meta.json" download>
              <span class="dl-icon">↓</span>
              <span><b>Snapshot metadata</b><br><small style="margin:0">${bytes(JSON.stringify(meta).length)}</small></span>
            </a>
            ${meta.changelogs
              .map(
                (log) => `
              <a class="download" href="${esc(log.file)}" target="_blank" rel="noopener">
                <span class="dl-icon">↗</span>
                <span><b>${esc(log.name.replace(".md", ""))}</b><br><small style="margin:0">${bytes(log.bytes)}</small></span>
              </a>`,
              )
              .join("")}
          </div>
          <p class="dim" style="font-size:12px;margin-top:16px">
            Full registry records are sharded into eight files (${bytes(detailTotal)} total):
            ${meta.data.details
              .map((_, index) => `<a href="data/details/${index}.json" style="color:var(--lime)" download>${index}</a>`)
              .join(" · ")}.
          </p>
        </section>

        <section class="panel panel-pad prose">
          <p class="kicker">About this edition</p>
          <h2 style="font-size:24px;margin:10px 0 14px">How the codex was built.</h2>
          <p>
            This is a new, independently built field guide assembled from the archived
            <b>Bloxd-Developer-Hub</b> zip in this repository. The archive bundles two research snapshots:
            extracted Bloxd registry records with their PNG textures, and build-monitor metadata for
            production, pre-production and staging.
          </p>
          <p>
            A build script (<code>tools/build_site.py</code>) reads the zip directly. It flattens the
            ${num(meta.counts.entries)} registry records into a compact search index, shards the full records
            into eight JSON files, resolves ${num(meta.counts.variations)} mob variations to their sprites,
            and repacks all ${num(meta.counts.textures)} textures into ${num(meta.atlases.length)} atlases
            (deduplicating identical images and keeping 16×16 sprites pixel-perfect). The website itself is
            dependency-free HTML, CSS and ES modules.
          </p>

          <h3>What is included</h3>
          <ul>
            <li>${num(meta.counts.entries)} registry entries — ${num(meta.counts.blocks)} blocks and ${num(meta.counts.items)} items, including ${num(meta.counts.variants)} meta variants.</li>
            <li>${num(meta.counts.textures)} extracted textures, served from ${num(meta.atlases.length)} packed atlases.</li>
            <li>${num(meta.counts.mobs)} mobs with ${num(meta.counts.variations)} variations, spawner blocks and spawn orbs where available.</li>
            <li>Build snapshot metadata for three environments and the extracted change history.</li>
          </ul>

          <h3>Known limits</h3>
          <ul>
            <li>This is a static snapshot, not a live game API. The registry only changes when a new extraction is built; the monitor above merely watches the files on disk and the Bloxd build ids.</li>
            <li>Mob health, damage and movement stats are not included in this extraction, so the mob pages make no claims about them.</li>
            <li>Some mob variations share a single greyscale sprite and are tinted by the game at runtime.</li>
            <li>Break-time and damage results are arithmetic on registry values; movement, latency, enchantments and multi-piece armour formulas are not modelled.</li>
            <li>The archived JavaScript/CSS build bundles from the original hub are not part of this edition; the site focuses on registry data, textures, mobs and changelogs.</li>
          </ul>

          <h3>Rebuilding</h3>
          <p>
            Regenerate every dataset and atlas from the zip with:
            <code>python3 tools/build_site.py</code> (requires Pillow). Serve the folder with
            <code>node serve.mjs</code> or any static server.
          </p>
          <p class="dim" style="font-size:12px">
            Generated ${esc(dateTime(meta.generatedAt))} from <code>${esc(meta.source.archive)}</code>.
            Textures and game data remain the property of their respective creators. This site is unofficial
            and not affiliated with Bloxd.
          </p>
        </section>
      </div>
    </div>`;

  mountScanPanel(root.querySelector("#scanPanel"));
}
