import { loadEntries, loadMeta, data, CATEGORY_BY_ID, categoryCounts, findByName } from "../data.js";
import { texHTML } from "../texture.js";
import { esc, num, date, countUp, whenIdle } from "../util.js";

const SHELF_IDS = ["ores", "tools", "weapons", "armour", "food", "building"];

/* The shelf mosaics should show the archetypal thing, not merely anything that
   happens to match the (deliberately loose) filter count. */
const SHELF_SAMPLES = {
  ores: (entry) => entry.k === "b" && /ore|deposit/i.test(entry.n),
  tools: (entry) => entry.ty === "Tool" && entry.k === "i",
  weapons: (entry) => entry.k === "i" && entry.dmg > 0 &&
    /sword|bow|gun|rifle|shotgun|pistol|spear|dagger|crossbow|launcher|blade/i.test(entry.n),
  armour: (entry) => entry.ar != null,
  food: (entry) => Boolean(entry.eat),
  building: (entry) => entry.k === "b" && !entry.var && (entry.ht === "rock" || entry.ht === "wood"),
};
const POPULAR = ["Diamond Sword", "Torch", "Iron Ore", "Grass Block", "Wood Pickaxe"];
const SPECIMENS = ["Diamond Pickaxe", "Torch", "Iron Ore", "Diamond Sword"];

export async function render(root, ctx) {
  const [entries, meta] = await Promise.all([loadEntries(), loadMeta()]);
  const counts = categoryCounts(entries);
  const snapshotDate = meta.snapshot?.latestCheck ? date(meta.snapshot.latestCheck, { month: "short", day: "numeric" }) : "recent";

  const specimens = SPECIMENS.map((name) => findByName(entries, name)).filter((entry) => entry?.t);

  const shelves = SHELF_IDS.map((id) => {
    const category = CATEGORY_BY_ID.get(id);
    const samplePredicate = SHELF_SAMPLES[id];
    let samples = sampleEntries(
      entries,
      (entry) => category.test(entry) && samplePredicate(entry),
      4,
    );
    if (samples.length < 4) {
      const chosen = new Set(samples.map((entry) => entry.i));
      samples = samples.concat(
        sampleEntries(entries, category.test, 4 - samples.length, false, chosen),
      );
    }
    return `
      <a class="shelf" href="#/codex?cat=${id}">
        <span class="shelf-mosaic">
          ${samples.map((entry) => texHTML(entry.t, 36, { cls: "mosaic-tile" })).join("")}
        </span>
        <span>
          <b>${esc(category.label)}</b>
          <small>${esc(category.hint)}</small>
          <span class="count">${num(counts[id])} entries</span>
        </span>
      </a>`;
  }).join("");

  const seenBases = new Set();
  const additions = meta.additions
    .map((addition) => data.byId.get(addition.id) ?? findByName(entries, addition.name))
    .filter((entry) => {
      if (!entry) return false;
      const base = entry.n.split("|")[0];
      if (seenBases.has(base)) return false;
      seenBases.add(base);
      return true;
    })
    .slice(0, 10);

  const latest = meta.latestUpdate ?? {};
  const addedCount = latest.counts?.Added ?? additions.length;

  const stats = [
    ["entries", meta.counts.entries, "Registry records", "Blocks, items & variants"],
    ["blocks", meta.counts.blocks, "Blocks", "Placeable world content"],
    ["items", meta.counts.items, "Items", "Tools, weapons, armour"],
    ["textures", meta.counts.textures, "Textures", "Extracted PNG sprites"],
    ["mobs", meta.counts.mobs, "Mobs", `${num(meta.counts.variations)} variations`],
  ];

  root.innerHTML = `
    <section class="hero">
      <div class="container hero-inner">
        <div class="hero-copy">
          <p class="kicker">Unofficial field guide · snapshot ${esc(snapshotDate)}</p>
          <h1>Every block.<br>Every item.<br><em>One codex.</em></h1>
          <p class="lede">
            ${num(meta.counts.entries)} registry entries and ${num(meta.counts.textures)} extracted pixel textures
            from Bloxd, indexed for searching, comparing and theorising. No wiki drift, no guesswork — just the
            numbers that ship in the game.
          </p>
          <form class="hero-search" id="heroSearch" role="search">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="5.6" stroke="currentColor" stroke-width="1.6"/><path d="m13.2 13.2 3.3 3.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <input id="heroQuery" type="search" placeholder="Search blocks, items or an ID…" aria-label="Search the codex">
            <button class="btn primary small" type="submit">Search</button>
          </form>
          <div class="hero-chips">
            <span>Popular</span>
            ${POPULAR.map((name) => `<button type="button" data-query="${esc(name)}">${esc(name)}</button>`).join("")}
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <span class="ring"></span><span class="ring two"></span>
          <div class="cube-stage">
            <div class="cube">
              <span class="cube-face top"></span>
              <span class="cube-face front"></span>
              <span class="cube-face right"></span>
              <span class="cube-face back"></span>
              <span class="cube-face left"></span>
              <span class="cube-face bottom"></span>
            </div>
          </div>
          ${specimens
            .map(
              (entry, index) => `
            <div class="specimen" style="--x:${[0, 70, 1, 66][index]}%;--y:${[1, 9, 63, 64][index]}%;animation-delay:${index * 1.3}s;left:var(--x);top:var(--y)">
              ${texHTML(entry.t, 46)}
              <b>${esc(entry.n.split("|")[0])}</b>
              <small>#${entry.i}</small>
            </div>`,
            )
            .join("")}
        </div>
      </div>
    </section>

    <div class="container">
      <div class="stat-strip">
        ${stats
          .map(
            ([key, value, label, hint]) => `
          <div class="stat">
            <div class="stat-value" data-count="${value}">0</div>
            <div class="stat-label">${esc(label)}</div>
            <div class="stat-hint">${esc(hint)}</div>
          </div>`,
          )
          .join("")}
      </div>
    </div>

    <section class="section container">
      <div class="section-head">
        <div>
          <p class="kicker">Browse the archive</p>
          <h2>Pick a shelf.</h2>
          <p>Six curated views over the registry. Every card opens the codex pre-filtered, so you can keep narrowing from there.</p>
        </div>
        <a class="btn ghost" href="#/codex">Open the full codex →</a>
      </div>
      <div class="shelf-grid">${shelves}</div>
    </section>

    <section class="section container" style="padding-top:0">
      <div class="home-split">
        <div class="panel home-panel">
          <p class="kicker">Fresh from the build</p>
          <h3>${num(addedCount)} entries joined the registry.</h3>
          <p class="panel-sub">
            Latest extracted diff${latest.runAt ? ` from ${esc(date(latest.runAt))}` : ""} —
            the registry moved from ${num(latest.from ?? 0)} to ${num(latest.to ?? meta.counts.entries)} records.
          </p>
          <div class="added-list">
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
          <div style="margin-top:18px"><a class="btn small" href="#/archive">Read the changelog →</a></div>
        </div>

        <div class="panel home-panel">
          <p class="kicker">Run the numbers</p>
          <h3>The lab.</h3>
          <p class="panel-sub">Calculators wired directly to registry data — no recipes, no approximation, just the shipped values.</p>
          <div class="lab-teaser" style="margin-top:18px">
            <a class="teaser-row" href="#/lab">
              <span><b>Break-time calculator</b><small>Block × tool, with every alternative ranked</small></span>
              <i>→</i>
            </a>
            <a class="teaser-row" href="#/lab">
              <span><b>Damage calculator</b><small>Time-to-KO against armour reduction</small></span>
              <i>→</i>
            </a>
            <a class="teaser-row" href="#/lab">
              <span><b>ID finder</b><small>Jump straight to a numeric registry ID</small></span>
              <i>→</i>
            </a>
          </div>
        </div>
      </div>
    </section>

    <section class="section container" style="padding-top:0">
      <div class="cta panel">
        <div class="cta-copy">
          <p class="kicker">The texture wall</p>
          <h2>${num(meta.counts.textures)} sprites, zero loading jank.</h2>
          <p>Every extracted PNG is packed into a handful of atlases and laid out as a single scrollable wall. Hover to identify, click to inspect at 10×, download any tile as a clean PNG.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">
            <a class="btn primary" href="#/textures">Open the texture wall</a>
            <a class="btn" href="#/mobs">Meet the mobs</a>
          </div>
        </div>
        <div class="cta-mosaic" aria-hidden="true">
          ${sampleEntries(entries, (entry) => Boolean(entry.t), 24, true)
            .map((entry) => texHTML(entry.t, 46))
            .join("")}
        </div>
      </div>
    </section>
  `;

  /* --- wiring --------------------------------------------------------- */
  const form = root.querySelector("#heroSearch");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = root.querySelector("#heroQuery").value.trim();
    location.hash = query ? `#/codex?q=${encodeURIComponent(query)}` : "#/codex";
  });

  root.querySelectorAll("[data-query]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelector("#heroQuery").value = button.dataset.query;
      location.hash = `#/codex?q=${encodeURIComponent(button.dataset.query)}`;
    });
  });

  whenIdle(() => {
    root.querySelectorAll("[data-count]").forEach((element) => {
      countUp(element, Number(element.dataset.count));
    });
  });
}

function sampleEntries(entries, predicate, count, allowVariants = false, exclude = null) {
  const picked = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry.t || !predicate(entry)) continue;
    if (!allowVariants && entry.var) continue;
    if (exclude?.has(entry.i)) continue;
    const stem = entry.n.split(" ")[0];
    if (seen.has(stem)) continue;
    seen.add(stem);
    picked.push(entry);
    if (picked.length >= count) break;
  }
  if (picked.length < count) {
    for (const entry of entries) {
      if (picked.length >= count) break;
      if (entry.t && predicate(entry) && !picked.includes(entry) && !exclude?.has(entry.i)) picked.push(entry);
    }
  }
  return picked;
}
