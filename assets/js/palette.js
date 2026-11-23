/* ⌘K command palette: search every registry entry or jump to a page. */

import { data, loadEntries, searchEntries } from "./data.js";
import { texHTML } from "./texture.js";
import { $, openOverlay, closeOverlay } from "./ui.js";
import { esc, nameHTML } from "./util.js";

const PAGES = [
  ["Codex", "Browse all entries", "#/codex"],
  ["Texture wall", "10,068 pixel textures", "#/textures"],
  ["Mobs", "59 mobs and their variations", "#/mobs"],
  ["Lab", "Break-time and damage calculators", "#/lab"],
  ["Archive", "Snapshot, changelog and downloads", "#/archive"],
];

let results = [];
let active = 0;
let input;
let host;

export function initPalette() {
  host = $("#palette");
  input = $("#paletteInput");

  input.addEventListener("input", () => update(input.value));
  input.addEventListener("keydown", onKey);
  $("#paletteResults").addEventListener("click", (event) => {
    const target = event.target.closest("[data-id]");
    if (target) {
      closeOverlay(host);
      location.hash = `#/entry/${target.dataset.id}`;
      return;
    }
    const page = event.target.closest("[data-href]");
    if (page) {
      closeOverlay(host);
      location.hash = page.dataset.href;
      return;
    }
    const action = event.target.closest("[data-action]");
    if (action?.dataset.action === "random") {
      closeOverlay(host);
      const pool = data.entries.filter((entry) => entry.t);
      const random = pool[Math.floor(Math.random() * pool.length)];
      location.hash = `#/entry/${random.i}`;
    }
  });
}

export async function openPalette() {
  await loadEntries();
  host = $("#palette");
  input = $("#paletteInput");
  openOverlay(host);
  input.value = "";
  update("");
  input.focus();
}

function update(query) {
  const q = query.trim();
  const container = $("#paletteResults");
  results = [];
  active = 0;

  if (!q) {
    const pages = PAGES.map(
      ([label, sub, href]) => `
        <button class="presult" data-href="${href}">
          <span class="texbox checker" style="width:32px;height:32px;border:1px solid var(--line);border-radius:7px;display:grid;place-items:center;color:var(--lime);font-size:13px">→</span>
          <span class="p-body"><span class="p-name">${esc(label)}</span><span class="p-sub">${esc(sub)}</span></span>
          <span class="p-go">↵</span>
        </button>`,
    ).join("");
    const random = `
      <button class="presult" data-action="random">
        <span class="texbox checker" style="width:32px;height:32px;border:1px solid var(--line);border-radius:7px;display:grid;place-items:center;color:var(--amber);font-size:13px">✦</span>
        <span class="p-body"><span class="p-name">Surprise me</span><span class="p-sub">Open a random entry</span></span>
        <span class="p-go">↵</span>
      </button>`;
    container.innerHTML = `
      <div class="palette-group-label">Jump to</div>${pages}
      <div class="palette-group-label">Or</div>${random}
      <div class="palette-group-label">Tip</div>
      <div class="palette-empty">Type a block name, item name or registry ID.</div>`;
    return;
  }

  const found = searchEntries(data.entries, q).slice(0, 10);
  results = found;
  if (!found.length) {
    container.innerHTML = `<div class="palette-empty">Nothing matches “${esc(q)}”. Try a shorter search.</div>`;
    return;
  }
  container.innerHTML = `<div class="palette-group-label">${found.length} result${found.length === 1 ? "" : "s"}</div>` +
    found
      .map((entry, index) => {
        const size = 34;
        const kind = entry.k === "b" ? "Block" : "Item";
        return `<button class="presult ${index === 0 ? "active" : ""}" data-id="${entry.i}">
          ${texHTML(entry.t, size, { cls: "thumb" })}
          <span class="p-body">
            <span class="p-name" title="${esc(entry.n)}">${nameHTML(entry.n)}</span>
            <span class="p-sub">${kind} · #${entry.i}${entry.ht ? ` · ${esc(entry.ht)}` : ""}${entry.dmg ? ` · ${entry.dmg} dmg` : ""}</span>
          </span>
          <span class="p-go">↵</span>
        </button>`;
      })
      .join("");
}

function onKey(event) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!results.length) return;
    active = (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
    document.querySelectorAll("#paletteResults .presult[data-id]").forEach((element, index) => {
      element.classList.toggle("active", index === active);
    });
    document.querySelectorAll("#paletteResults .presult[data-id]")[active]?.scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter") {
    const chosen = results[active];
    if (chosen) {
      event.preventDefault();
      closeOverlay(host);
      location.hash = `#/entry/${chosen.i}`;
    }
  }
}
