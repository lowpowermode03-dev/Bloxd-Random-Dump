import { loadEntries, loadMeta, searchEntries } from "../data.js";
import { texHTML, tileDims, openLightbox } from "../texture.js";
import { esc, num, debounce } from "../util.js";

const CHUNK = 120;
let observer = null;

export async function render(root, ctx) {
  const [entries, meta] = await Promise.all([loadEntries(), loadMeta()]);
  const all = entries
    .filter((entry) => entry.t)
    .map((entry) => {
      const [width, height] = tileDims(entry.t);
      return {
        entry,
        tile: entry.t,
        name: entry.n,
        id: entry.i,
        width,
        height,
        sizeKey: `${width}×${height}`,
      };
    });

  const sizeCounts = new Map();
  for (const item of all) sizeCounts.set(item.sizeKey, (sizeCounts.get(item.sizeKey) ?? 0) + 1);
  const sizeOptions = [...sizeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topSizes = sizeOptions.slice(0, 7);

  const state = {
    q: ctx.query.get("q") ?? "",
    kind: ["all", "b", "i"].includes(ctx.query.get("kind")) ? ctx.query.get("kind") : "all",
    size: ctx.query.get("size") ?? "all",
  };

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <div class="head-row">
          <div>
            <p class="kicker">Asset library</p>
            <h1>Texture wall</h1>
            <p>All ${num(meta.counts.textures)} textures extracted from the registry, packed into ${num(meta.atlases.length)} atlases so the whole wall loads at once. Hover to identify a tile, click to inspect it at 10× and download a clean PNG.</p>
          </div>
          <div class="head-stats">
            <div class="head-stat"><b>${num(meta.counts.textures)}</b><small>Sprites</small></div>
            <div class="head-stat"><b>${num(sizeCounts.size)}</b><small>Canvas sizes</small></div>
            <div class="head-stat"><b>${num(meta.atlases.length)}</b><small>Atlases</small></div>
          </div>
        </div>
      </div>

      <div class="tex-toolbar">
        <div class="field grow">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="5.6" stroke="currentColor" stroke-width="1.6"/><path d="m13.2 13.2 3.3 3.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="texSearch" type="search" placeholder="Search texture or entry name…" value="${esc(state.q)}" aria-label="Search textures">
        </div>
        <div class="seg" role="group" aria-label="Filter textures by kind" style="flex:none">
          <button type="button" data-kind="all" aria-pressed="${state.kind === "all"}">All</button>
          <button type="button" data-kind="b" aria-pressed="${state.kind === "b"}">Blocks</button>
          <button type="button" data-kind="i" aria-pressed="${state.kind === "i"}">Items</button>
        </div>
        <label class="select">
          <select id="texSize" aria-label="Filter by canvas size">
            <option value="all">All sizes</option>
            ${topSizes.map(([size, count]) => `<option value="${size}" ${state.size === size ? "selected" : ""}>${size}px · ${num(count)}</option>`).join("")}
          </select>
        </label>
        <span class="count" id="texCount"><b>—</b></span>
      </div>

      <div class="tex-grid" id="texGrid" aria-live="polite"></div>
      <div class="sentinel" id="texSentinel"></div>
      <div class="loading-row" id="texLoading" hidden>Loading the next batch</div>

      <p class="dim" style="font-size:12px;margin:30px 0 60px">
        Textures are rendered from packed atlases with nearest-neighbour scaling, so 16×16 sprites stay crisp.
        Mob textures are catalogued separately on the <a href="#/mobs" style="color:var(--lime)">mobs page</a>.
      </p>
    </div>`;

  const grid = root.querySelector("#texGrid");
  const sentinel = root.querySelector("#texSentinel");
  const loading = root.querySelector("#texLoading");
  const countEl = root.querySelector("#texCount");
  const searchInput = root.querySelector("#texSearch");
  const sizeSelect = root.querySelector("#texSize");

  let filtered = all;
  let shown = 0;

  const applyFilters = () => {
    let list = all;
    if (state.kind !== "all") list = list.filter((item) => item.entry.k === state.kind);
    if (state.size !== "all") list = list.filter((item) => item.sizeKey === state.size);
    if (state.q) {
      const matched = new Set(searchEntries(list.map((item) => item.entry), state.q).map((entry) => entry.i));
      list = list.filter((item) => matched.has(item.id));
    }
    filtered = list;
    shown = 0;
    grid.innerHTML = "";
    countEl.innerHTML = `<b>${num(filtered.length)}</b> texture${filtered.length === 1 ? "" : "s"}`;
    loading.hidden = true;
    sentinel.hidden = false;
    paint();
    syncURL();
  };

  const paint = () => {
    if (shown >= filtered.length) {
      sentinel.hidden = true;
      loading.hidden = true;
      return;
    }
    const batch = filtered.slice(shown, shown + CHUNK);
    const start = shown;
    grid.insertAdjacentHTML(
      "beforeend",
      batch
        .map(
          (item, offset) => `
        <button type="button" class="tex-cell checker" data-index="${start + offset}" title="${esc(item.name)}" aria-label="${esc(item.name)}">
          ${texHTML(item.tile, 58)}
          <span class="tex-size">${item.width}×${item.height}</span>
          <span class="tex-name">${esc(item.name)}</span>
        </button>`,
        )
        .join(""),
    );
    shown += batch.length;
    loading.hidden = shown >= filtered.length;
  };

  const lightboxItems = () =>
    filtered.map((item) => ({
      name: item.name,
      tile: item.tile,
      entryId: item.id,
      sub: `Texture of entry #${item.id}`,
    }));

  grid.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-index]");
    if (!cell) return;
    openLightbox(lightboxItems(), Number(cell.dataset.index));
  });

  searchInput.addEventListener(
    "input",
    debounce(() => {
      state.q = searchInput.value;
      applyFilters();
    }, 140),
  );

  root.querySelectorAll("[data-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      state.kind = button.dataset.kind;
      root.querySelectorAll("[data-kind]").forEach((sibling) => {
        sibling.setAttribute("aria-pressed", String(sibling.dataset.kind === state.kind));
      });
      applyFilters();
    });
  });

  sizeSelect.addEventListener("change", () => {
    state.size = sizeSelect.value;
    applyFilters();
  });

  observer?.disconnect();
  observer = new IntersectionObserver((entriesSeen) => {
    if (entriesSeen.some((entry) => entry.isIntersecting)) paint();
  }, { rootMargin: "600px 0px" });
  observer.observe(sentinel);

  function syncURL() {
    const qs = new URLSearchParams();
    if (state.q) qs.set("q", state.q);
    if (state.kind !== "all") qs.set("kind", state.kind);
    if (state.size !== "all") qs.set("size", state.size);
    history.replaceState(null, "", `#/textures${qs.toString() ? `?${qs}` : ""}`);
  }

  applyFilters();
}
