/* A compact searchable dropdown, used by the lab calculators. */

import { esc } from "./util.js";

export function mountCombo(container, options) {
  const {
    items = [],
    getLabel = (item) => item.n,
    getMeta = (item) => (item.i != null ? `#${item.i}` : ""),
    placeholder = "Search…",
    initial = null,
    onSelect = () => {},
  } = options;

  container.innerHTML = `
    <div class="combo">
      <input type="text" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" aria-autocomplete="list">
      <button class="combo-clear" type="button" aria-label="Clear">×</button>
      <div class="combo-list" role="listbox" hidden></div>
    </div>`;

  const root = container.firstElementChild;
  const input = root.querySelector("input");
  const list = root.querySelector(".combo-list");
  const clear = root.querySelector(".combo-clear");
  let selected = null;
  let filtered = [];
  let active = -1;

  const matches = (query) => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? items.filter((item) => getLabel(item).toLowerCase().includes(q))
      : items;
    return pool.slice(0, 60);
  };

  const paint = () => {
    if (!filtered.length) {
      list.innerHTML = `<div class="combo-empty">No matches</div>`;
      return;
    }
    list.innerHTML = filtered
      .map(
        (item, index) =>
          `<button type="button" role="option" data-index="${index}" class="${index === active ? "active" : ""}" aria-selected="${index === active}">
            <span>${esc(getLabel(item))}</span><small>${esc(getMeta(item))}</small>
          </button>`,
      )
      .join("");
    list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  };

  const open = (query) => {
    filtered = matches(query);
    active = filtered.length ? 0 : -1;
    paint();
    list.hidden = false;
  };

  const close = () => {
    list.hidden = true;
  };

  const choose = (item, notify = true) => {
    selected = item;
    if (item) {
      input.value = getLabel(item);
      clear.hidden = false;
    }
    close();
    if (notify) onSelect(item);
  };

  input.addEventListener("focus", () => {
    if (selected && input.value === getLabel(selected)) {
      // Select the current value so typing replaces it instead of appending.
      requestAnimationFrame(() => input.select());
      open("");
    } else {
      open(input.value);
    }
  });

  input.addEventListener("input", () => {
    selected = null;
    clear.hidden = !input.value;
    open(input.value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!filtered.length) return;
      if (list.hidden) open(input.value);
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length;
      paint();
    } else if (event.key === "Enter") {
      if (!list.hidden && filtered[active]) {
        event.preventDefault();
        choose(filtered[active]);
      }
    } else if (event.key === "Escape") {
      close();
    }
  });

  list.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const button = event.target.closest("[data-index]");
    if (button) choose(filtered[Number(button.dataset.index)]);
  });

  clear.addEventListener("click", () => {
    input.value = "";
    selected = null;
    clear.hidden = true;
    filtered = items.slice(0, 60);
    open("");
    input.focus();
    onSelect(null);
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) close();
  });

  if (initial) choose(initial, false);

  return {
    select: (item) => choose(item, false),
    get selected() { return selected; },
    focus: () => input.focus(),
  };
}
