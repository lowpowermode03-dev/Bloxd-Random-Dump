/* App entry: router, header behaviour and global shortcuts. */

import { $, $$, closeOverlay, toast } from "./ui.js";
import { copy } from "./util.js";
import { loadMeta } from "./data.js";
import { initPalette, openPalette } from "./palette.js";
import { startMonitor, onScan } from "./monitor.js";

import * as home from "./views/home.js";
import * as codex from "./views/codex.js";
import * as entry from "./views/entry.js";
import * as textures from "./views/textures.js";
import * as mobs from "./views/mobs.js";
import * as lab from "./views/lab.js";
import * as archive from "./views/archive.js";

const ROUTES = [
  { id: "home", nav: null, pattern: /^\/?$/, title: "Bloxd Codex", view: home },
  { id: "codex", nav: "codex", pattern: /^\/codex\/?$/, title: "Codex", view: codex },
  { id: "entry", nav: "codex", pattern: /^\/entry\/(\d+)\/?$/, title: "Entry", view: entry },
  { id: "textures", nav: "textures", pattern: /^\/textures\/?$/, title: "Textures", view: textures },
  { id: "mobs", nav: "mobs", pattern: /^\/mobs\/?$/, title: "Mobs", view: mobs },
  { id: "lab", nav: "lab", pattern: /^\/lab\/?$/, title: "Lab", view: lab },
  { id: "archive", nav: "archive", pattern: /^\/archive\/?$/, title: "Archive", view: archive },
];

const NOT_FOUND = {
  id: "404",
  nav: null,
  title: "Not found",
  view: {
    render(root) {
    root.innerHTML = `
      <div class="container" style="padding:120px 0;text-align:center">
        <p class="kicker" style="justify-content:center">404</p>
        <h1 style="font-size:clamp(38px,7vw,72px);margin:16px 0">This chunk failed<br>to load.</h1>
        <p class="muted" style="max-width:44ch;margin:0 auto 28px">The page you asked for is not in the archive. The registry, however, is very much intact.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a class="btn primary" href="#/codex">Open the codex</a>
          <a class="btn" href="#/">Back home</a>
        </div>
      </div>`;
    },
  },
};

let renderToken = 0;
let currentPath = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart = ""] = raw.split("?");
  return { path: pathPart || "/", query: new URLSearchParams(queryPart) };
}

function setActiveNav(id) {
  $$("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === id);
  });
}

function errorView(root, error) {
  root.innerHTML = `
    <div class="container" style="padding:110px 0;text-align:center">
      <p class="kicker" style="justify-content:center">Archive error</p>
      <h1 style="font-size:clamp(32px,5vw,52px);margin:16px 0 10px">The data could not be read.</h1>
      <p class="muted" style="max-width:52ch;margin:0 auto 22px">${error.message}</p>
      <p class="dim" style="max-width:52ch;margin:0 auto 26px;font-size:13px">If you opened this file directly, serve the folder over HTTP instead — the site fetches JSON and textures.</p>
      <button class="btn primary" onclick="location.reload()">Retry</button>
    </div>`;
}

async function render() {
  const { path, query } = parseHash();
  const route = ROUTES.find((candidate) => candidate.pattern.test(path)) ?? NOT_FOUND;
  const match = route.pattern ? path.match(route.pattern) : null;
  const token = ++renderToken;
  const root = $("#view");

  document.title = route.id === "home" ? "Bloxd Codex — every block, item and mob" : `${route.title} — Bloxd Codex`;
  setActiveNav(route.nav);

  if (path !== currentPath) {
    window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
    currentPath = path;
  }

  try {
    await route.view.render(root, {
      query,
      path,
      params: match ? match.slice(1) : [],
    });
    if (token !== renderToken) return;
    root.classList.remove("is-entering");
    void root.offsetWidth;
    root.classList.add("is-entering");
  } catch (error) {
    if (token !== renderToken) return;
    console.error(error);
    errorView(root, error);
  }
}

function setupMonitor() {
  startMonitor();
  onScan((state) => {
    const pill = document.querySelector(".snapshot-pill");
    if (!pill) return;
    if (state.offline) {
      pill.dataset.scan = "offline";
      pill.title = "Live scanner offline — run `node serve.mjs` to scan Bloxd files every 20 seconds";
      return;
    }
    const data = state.data;
    if (!data) return;
    const changed = Boolean(data.local?.changed || data.remote?.some((result) => result.changed));
    pill.dataset.scan = changed ? "changed" : "live";
    const age = data.lastScanAt
      ? Math.max(0, Math.round((Date.now() - Date.parse(data.lastScanAt)) / 1000))
      : null;
    pill.title = `Bloxd files scanned every ${Math.round((data.intervalMs ?? 20000) / 1000)}s${
      age === null ? "" : ` · last scan ${age}s ago`
    }`;
  });
}

function setupHeader() {
  const menuBtn = $("#menuBtn");
  const mobileNav = $("#mobileNav");

  const setMenu = (open) => {
    menuBtn.setAttribute("aria-expanded", String(open));
    mobileNav.hidden = !open;
  };

  menuBtn.addEventListener("click", () => setMenu(menuBtn.getAttribute("aria-expanded") !== "true"));
  mobileNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  window.addEventListener("hashchange", () => setMenu(false));

  $("#searchTrigger").addEventListener("click", () => openPalette());

  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const palette = $("#palette");
      if (palette.hidden) openPalette();
      else closeOverlay(palette);
    }
  });
}

function setupDelegates() {
  document.addEventListener("click", async (event) => {
    const go = event.target.closest("[data-go]");
    if (go) {
      event.preventDefault();
      location.hash = `#${go.dataset.go}`;
      return;
    }
    const copyable = event.target.closest("[data-copy]");
    if (copyable) {
      event.preventDefault();
      await copy(copyable.dataset.copy);
      toast(copyable.dataset.copyToast || "Copied to clipboard");
    }
  });
}

function boot() {
  initPalette();
  setupHeader();
  setupMonitor();
  setupDelegates();
  loadMeta().catch((error) => console.warn("meta failed", error));
  window.addEventListener("hashchange", render);
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
