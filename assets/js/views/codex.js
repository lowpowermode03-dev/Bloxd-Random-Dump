import {
  loadEntries,
  loadMeta,
  CATEGORIES,
  categoryCounts,
  filterEntries,
  sortEntries,
  searchEntries,
  SORTS,
  HARVEST_LABELS,
  HARVEST_LEVEL_LABELS,
} from "../data.js";
import { texHTML } from "../texture.js";
import { esc, num, ms, debounce, nameHTML } from "../util.js";

const PAGE = 72;
const KINDS = [["all", "All"], ["b", "Blocks"], ["i", "Items"]];

export async function render(root, ctx) {
  const [entries, meta] = await Promise.all([loadEntries(), loadMeta()]);
  const counts = categoryCounts(entries);
  const state = readState(ctx.query);
  let shown = PAGE;
  let filtered = [];

  const harvestCounts = { all: entries.length };
  for (const entry of entries) {
    if (entry.ht) harvestCounts[entry.ht] = (harvestCounts[entry.ht] ?? 0) + 1;
  }
  const levelCounts = { all: entries.length };
  for (const entry of entries) {
    if (entry.hl != null) levelCounts[entry.hl] = (levelCounts[entry.hl] ?? 0) + 1;
  }

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <div class="head-row">
          <div>
            <p class="kicker">The registry</p>
            <h1>Codex</h1>
            <p>Every block and item in the extracted registry, with the properties the game actually reads — break times, harvest rules, damage, armour and food values.</p>
          </div>
          <div class="head-stats">
            <div class="head-stat"><b>${num(meta.counts.entries)}</b><small>Entries</small></div>
            <div class="head-stat"><b>${num(meta.counts.blocks)}</b><small>Blocks</small></div>
            <div class="head-stat"><b>${num(meta.counts.items)}</b><small>Items</small></div>
          </div>
        </div>
      </div>

      <div class="codex">
        <aside class="filters" id="filters">
          <div class="filter-group">
            <div class="filter-label">Kind</div>
            <div class="seg" role="group" aria-label="Filter by kind">
              ${KINDS.map(
                ([value, label]) =>
                  `<button type="button" data-kind="${value}" aria-pressed="${state.kind === value}">${label}</button>`,
              ).join("")}
            </div>
          </div>

          <div class="filter-group">
            <div class="filter-label">Shelf</div>
            <div class="filter-list">
              ${CATEGORIES.map(
                (category) => `
                <button type="button" data-cat="${category.id}" aria-pressed="${state.cat === category.id}">
                  ${esc(category.label)}<i>${num(counts[category.id])}</i>
                </button>`,
              ).join("")}
            </div>
          </div>

          <div class="filter-group">
            <div class="filter-label">Harvest type</div>
            <div class="filter-list">
              <button type="button" data-ht="all" aria-pressed="${state.ht === "all"}">Any type<i>${num(entries.length)}</i></button>
              ${Object.entries(HARVEST_LABELS).map(
                ([value, label]) =>
                  `<button type="button" data-ht="${value}" aria-pressed="${state.ht === value}">${label}<i>${num(harvestCounts[value] ?? 0)}</i></button>`,
              ).join("")}
            </div>
          </div>

          <div class="filter-group">
            <div class="filter-label">Harvest level</div>
            <div class="filter-list">
              <button type="button" data-level="all" aria-pressed="${state.level === "all"}">Any level<i>${num(entries.length)}</i></button>
              ${Object.entries(HARVEST_LEVEL_LABELS).map(
                ([value, label]) =>
                  `<button type="button" data-level="${value}" aria-pressed="${String(state.level) === value}">${label}<i>${num(levelCounts[value] ?? 0)}</i></button>`,
              ).join("")}
            </div>
          </div>

          <div class="filter-group">
            <div class="filter-label">Properties</div>
            <div class="switches">
              <label class="switch">Hide meta variants <input type="checkbox" data-flag="hideVariants" ${state.flags.hideVariants ? "checked" : ""}></label>
              <label class="switch">Stackable only <input type="checkbox" data-flag="stackable" ${state.flags.stackable ? "checked" : ""}></label>
              <label class="switch">Deals damage <input type="checkbox" data-flag="damage" ${state.flags.damage ? "checked" : ""}></label>
              <label class="switch">Edible <input type="checkbox" data-flag="edible" ${state.flags.edible ? "checked" : ""}></label>
              <label class="switch">Wearable armour <input type="checkbox" data-flag="wearable" ${state.flags.wearable ? "checked" : ""}></label>
            </div>
          </div>

          <button class="btn ghost small" id="resetFilters" type="button">Reset all filters</button>
        </aside>

        <section class="results">
          <div class="toolbar">
            <button class="btn small filter-toggle" id="filterToggle" type="button">Filters</button>
            <div class="field grow">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="5.6" stroke="currentColor" stroke-width="1.6"/><path d="m13.2 13.2 3.3 3.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              <input id="codexSearch" type="search" placeholder="Search name, ID, type, texture key…" value="${esc(state.q)}" aria-label="Search the registry">
            </div>
            <label class="select">
              <select id="codexSort" aria-label="Sort results">
                ${SORTS.map(([value, label]) => `<option value="${value}" ${state.sort === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <span class="count" id="resultCount"><b>—</b></span>
          </div>

          <div class="entry-grid" id="entryGrid" aria-live="polite"></div>
          <div class="loadmore" id="loadMore" hidden>
            <button class="btn" type="button" id="loadMoreBtn">Load more entries</button>
            <p id="loadMoreInfo">—</p>
          </div>
        </section>
      </div>
    </div>`;

  const grid = root.querySelector("#entryGrid");
  const countEl = root.querySelector("#resultCount");
  const loadMore = root.querySelector("#loadMore");
  const loadInfo = root.querySelector("#loadMoreInfo");
  const searchInput = root.querySelector("#codexSearch");
  const sortSelect = root.querySelector("#codexSort");
  const filters = root.querySelector("#filters");

  const compute = () => {
    let list = filterEntries(entries, {
      kind: state.kind,
      category: state.cat,
      harvest: state.ht,
      level: state.level,
      flags: state.flags,
    });
    if (state.q) list = searchEntries(list, state.q);
    return sortEntries(list, state.sort);
  };

  const cardHTML = (entry) => {
    const facts = [];
    if (entry.k === "b" && entry.ttb != null) facts.push(ms(entry.ttb));
    if (entry.dmg) facts.push(`${entry.dmg} dmg`);
    if (entry.mult != null) facts.push(`×${entry.mult}`);
    if (entry.ar != null) facts.push(`${Math.round(entry.ar * 100)}% armour`);
    if (entry.heal) facts.push(`+${entry.heal} HP`);
    const kind = entry.k === "b" ? "Block" : entry.ty || "Item";
    return `
      <a class="entry-card" href="#/entry/${entry.i}">
        ${texHTML(entry.t, 42)}
        <span class="entry-card-body">
          <span class="entry-name" title="${esc(entry.n)}">${nameHTML(entry.n)}</span>
          <span class="entry-sub">
            <span>${esc(kind)}</span>
            ${entry.ht ? `<i class="dot"></i><span>${esc(entry.ht)}</span>` : ""}
            ${facts.length ? `<i class="dot"></i><span>${esc(facts[0])}</span>` : ""}
            ${entry.var ? `<span class="badge var" style="margin-left:4px">var</span>` : ""}
          </span>
        </span>
        <span class="entry-id">#${entry.i}</span>
      </a>`;
  };

  const paint = () => {
    const slice = filtered.slice(0, shown);
    countEl.innerHTML = `<b>${num(filtered.length)}</b> ${filtered.length === 1 ? "entry" : "entries"}`;
    if (!filtered.length) {
      grid.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          <b>Nothing matches that combination.</b>
          <p>Try removing a filter or searching for a shorter term.</p>
        </div>`;
      loadMore.hidden = true;
      return;
    }
    grid.innerHTML = slice.map(cardHTML).join("");
    const remaining = filtered.length - slice.length;
    loadMore.hidden = remaining <= 0;
    if (remaining > 0) {
      loadInfo.innerHTML = `Showing <b>${num(slice.length)}</b> of <b>${num(filtered.length)}</b> — ${num(remaining)} more`;
    } else {
      loadInfo.innerHTML = `All <b>${num(filtered.length)}</b> matching entries shown`;
    }
  };

  const refresh = (reset = true) => {
    if (reset) shown = PAGE;
    filtered = compute();
    paint();
    syncURL();
  };

  const syncURL = () => {
    const qs = new URLSearchParams();
    if (state.q) qs.set("q", state.q);
    if (state.kind !== "all") qs.set("kind", state.kind);
    if (state.cat !== "all") qs.set("cat", state.cat);
    if (state.ht !== "all") qs.set("ht", state.ht);
    if (state.level !== "all") qs.set("level", state.level);
    if (state.sort !== "id") qs.set("sort", state.sort);
    if (state.flags.hideVariants) qs.set("variants", "0");
    if (state.flags.stackable) qs.set("stack", "1");
    if (state.flags.damage) qs.set("damage", "1");
    if (state.flags.edible) qs.set("food", "1");
    if (state.flags.wearable) qs.set("wear", "1");
    const suffix = qs.toString() ? `?${qs}` : "";
    history.replaceState(null, "", `#/codex${suffix}`);
  };

  const updatePressed = () => {
    root.querySelectorAll("[data-kind]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.kind === state.kind));
    });
    root.querySelectorAll("[data-cat]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.cat === state.cat));
    });
    root.querySelectorAll("[data-ht]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.ht === state.ht));
    });
    root.querySelectorAll("[data-level]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.level === String(state.level)));
    });
    root.querySelectorAll("[data-flag]").forEach((input) => {
      input.checked = Boolean(state.flags[input.dataset.flag]);
    });
  };

  searchInput.addEventListener(
    "input",
    debounce(() => {
      state.q = searchInput.value;
      refresh();
    }, 140),
  );

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    refresh();
  });

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.kind) state.kind = button.dataset.kind;
    else if (button.dataset.cat) state.cat = button.dataset.cat;
    else if (button.dataset.ht) state.ht = button.dataset.ht;
    else if (button.dataset.level) state.level = button.dataset.level;
    else return;
    updatePressed();
    refresh();
  });

  root.querySelectorAll("[data-flag]").forEach((input) => {
    input.addEventListener("change", () => {
      state.flags[input.dataset.flag] = input.checked;
      refresh();
    });
  });

  root.querySelector("#loadMoreBtn").addEventListener("click", () => {
    shown += PAGE;
    paint();
  });

  root.querySelector("#resetFilters").addEventListener("click", () => {
    Object.assign(state, {
      q: "",
      kind: "all",
      cat: "all",
      ht: "all",
      level: "all",
      sort: "id",
      flags: { hideVariants: false, stackable: false, damage: false, edible: false, wearable: false },
    });
    searchInput.value = "";
    sortSelect.value = "id";
    updatePressed();
    refresh();
  });

  root.querySelector("#filterToggle").addEventListener("click", () => {
    filters.classList.toggle("open");
  });

  updatePressed();
  refresh();
}

function readState(query) {
  const kind = ["all", "b", "i"].includes(query.get("kind")) ? query.get("kind") : "all";
  const cat = CATEGORIES.some((category) => category.id === query.get("cat")) ? query.get("cat") : "all";
  const ht = ["all", "rock", "wood", "granule", "cuttable"].includes(query.get("ht")) ? query.get("ht") : "all";
  const level = ["0", "1", "2", "3", "4", "5"].includes(query.get("level")) ? query.get("level") : "all";
  const sort = SORTS.some(([value]) => value === query.get("sort")) ? query.get("sort") : "id";
  return {
    q: query.get("q") ?? "",
    kind,
    cat,
    ht,
    level,
    sort,
    flags: {
      hideVariants: query.get("variants") === "0",
      stackable: query.get("stack") === "1",
      damage: query.get("damage") === "1",
      edible: query.get("food") === "1",
      wearable: query.get("wear") === "1",
    },
  };
}
