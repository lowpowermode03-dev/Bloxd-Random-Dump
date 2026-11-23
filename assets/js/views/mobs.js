import { loadEntries, loadMobs, loadMeta } from "../data.js";
import { texHTML } from "../texture.js";
import { esc, num } from "../util.js";
import { openModal, $ } from "../ui.js";

export async function render(root, ctx) {
  const [mobs, meta] = await Promise.all([loadMobs(), loadMeta()]);

  const withTexture = mobs.mobs.filter((mob) => mob.variations.some((variation) => variation.tile)).length;

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <div class="head-row">
          <div>
            <p class="kicker">Creature index</p>
            <h1>Mobs</h1>
            <p>${num(mobs.total)} mobs and ${num(mobs.variations)} colour or state variations, resolved from the extracted caught-mob, spawner and spawn-orb textures.</p>
          </div>
          <div class="head-stats">
            <div class="head-stat"><b>${num(mobs.total)}</b><small>Mobs</small></div>
            <div class="head-stat"><b>${num(mobs.variations)}</b><small>Variations</small></div>
            <div class="head-stat"><b>${num(withTexture)}</b><small>With sprites</small></div>
          </div>
        </div>
      </div>

      <div class="tex-toolbar">
        <div class="field grow">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="5.6" stroke="currentColor" stroke-width="1.6"/><path d="m13.2 13.2 3.3 3.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="mobSearch" type="search" placeholder="Find a mob…" aria-label="Search mobs">
        </div>
        <span class="count" id="mobCount"><b>${num(mobs.total)}</b> mobs</span>
      </div>

      <div class="mob-grid" id="mobGrid"></div>

      <p class="dim" style="font-size:12px;margin:-20px 0 60px">
        Mob statistics such as health and damage are not part of this registry snapshot, so none are invented here.
        Sprites come from the extracted texture archive; spawner blocks can be found in the
        <a href="#/codex?cat=spawners" style="color:var(--lime)">codex</a>.
      </p>
    </div>`;

  const grid = root.querySelector("#mobGrid");
  const countEl = root.querySelector("#mobCount");
  const search = root.querySelector("#mobSearch");

  const leadTile = (mob) =>
    mob.variations.find((variation) => variation.tile)?.tile ?? mob.spawner ?? mob.orb ?? null;

  const paint = (list) => {
    countEl.innerHTML = `<b>${num(list.length)}</b> mob${list.length === 1 ? "" : "s"}`;
    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>No mob by that name.</b><p>Try a shorter search.</p></div>`;
      return;
    }
    grid.innerHTML = list
      .map(
        (mob, index) => `
        <button type="button" class="mob-card" data-mob="${mobs.mobs.indexOf(mob)}">
          ${texHTML(leadTile(mob), 54)}
          <span>
            <b>${esc(mob.name)}</b>
            <small>${mob.variations.length} variation${mob.variations.length === 1 ? "" : "s"}</small>
          </span>
        </button>`,
      )
      .join("");
  };

  grid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-mob]");
    if (!card) return;
    openMob(mobs.mobs[Number(card.dataset.mob)]);
  });

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    paint(query ? mobs.mobs.filter((mob) => mob.name.toLowerCase().includes(query)) : mobs.mobs);
  });

  paint(mobs.mobs);
}

function openMob(mob) {
  const tiles = new Set(
    mob.variations.filter((variation) => variation.tile).map((variation) => JSON.stringify(variation.tile)),
  );
  const shared = mob.variations.length > 1 && tiles.size === 1;
  const lead = mob.variations.find((variation) => variation.tile)?.tile ?? mob.spawner ?? mob.orb;

  openModal(`
    <div class="modal-head">
      ${texHTML(lead, 52)}
      <div>
        <h2 id="modalTitle">${esc(mob.name)}</h2>
        <small>${mob.variations.length} variation${mob.variations.length === 1 ? "" : "s"} · mob</small>
      </div>
    </div>
    <p class="modal-sub">Caught-mob sprites for each variation in the registry.</p>
    <div class="var-grid">
      ${mob.variations
        .map(
          (variation) => `
        <div class="var-card">
          ${variation.tile ? texHTML(variation.tile, 46) : `<span class="texbox empty" style="width:46px;height:46px;border:1px dashed var(--line-strong)"></span>`}
          <span>${esc(variation.name)}</span>
        </div>`,
        )
        .join("")}
    </div>
    ${shared ? `<div class="note"><span>ⓘ</span><div><b>Shared sprite.</b> These variations reuse one extracted texture — the game tints it at runtime, so the PNG alone cannot show the final colour.</div></div>` : ""}
    <div class="mob-assets">
      ${mob.spawner ? `<span class="asset">${texHTML(mob.spawner, 24)} Spawner block</span>` : ""}
      ${mob.orb ? `<span class="asset">${texHTML(mob.orb, 24)} Spawn orb</span>` : ""}
    </div>
    <div class="lightbox-actions" style="margin-top:18px">
      <a class="btn small primary" href="#/codex?q=${encodeURIComponent(mob.name)}">Find related entries →</a>
      <button class="btn small ghost" data-close>Close</button>
    </div>
  `);
}
