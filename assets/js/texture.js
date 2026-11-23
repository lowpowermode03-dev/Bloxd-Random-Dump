/* Pixel-texture rendering from packed atlases + a texture lightbox. */

import { data, atlas } from "./data.js";
import { esc, slug } from "./util.js";
import { $, openOverlay } from "./ui.js";

const imageCache = new Map();

export function tileDims(tile) {
  if (!tile) return [0, 0];
  return tile[0] === -1 ? [tile[2], tile[3]] : [tile[3], tile[4]];
}

/**
 * Render a texture tile as markup.
 * `fit` is the longest displayed edge in pixels; aspect ratio is preserved.
 */
export function texHTML(tile, fit = 44, opts = {}) {
  const { cls = "", border = false } = opts;
  const classes = ["texbox", "checker", cls].filter(Boolean).join(" ");
  const frame = border ? "border:1px solid rgba(255,255,255,.07);" : "";

  if (!tile) {
    return `<span class="${classes} empty" style="width:${fit}px;height:${fit}px;${frame}" aria-hidden="true"></span>`;
  }

  const [width, height] = tileDims(tile);
  const scale = fit / Math.max(width, height);
  const w = (width * scale).toFixed(2);
  const h = (height * scale).toFixed(2);

  if (tile[0] === -1) {
    return `<span class="${classes}" style="width:${w}px;height:${h}px;${frame}">` +
      `<img class="px px-img" src="${esc(tile[1])}" width="${width}" height="${height}" alt="" loading="lazy" decoding="async" style="width:${w}px;height:${h}px">` +
      `</span>`;
  }

  const sheet = atlas(tile[0]);
  if (!sheet) return `<span class="${classes} empty" style="width:${fit}px;height:${fit}px"></span>`;

  const [x, y] = [tile[1], tile[2]];
  const bgW = (sheet.w * scale).toFixed(2);
  const bgH = (sheet.h * scale).toFixed(2);
  const posX = (-x * scale).toFixed(2);
  const posY = (-y * scale).toFixed(2);

  return `<span class="${classes}" style="width:${w}px;height:${h}px;${frame}">` +
    `<span class="px" style="width:${w}px;height:${h}px;background-image:url('${sheet.file}');background-size:${bgW}px ${bgH}px;background-position:${posX}px ${posY}px"></span>` +
    `</span>`;
}

function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

/** Crop a tile out of its atlas and return a PNG blob. */
export async function tileBlob(tile) {
  if (!tile) throw new Error("No texture");
  if (tile[0] === -1) {
    const response = await fetch(tile[1]);
    return response.blob();
  }
  const sheet = atlas(tile[0]);
  const img = await loadImage(sheet.file);
  const [x, y, w, h] = [tile[1], tile[2], tile[3], tile[4]];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function downloadTile(tile, name = "texture") {
  const blob = await tileBlob(tile);
  const { downloadBlob } = await import("./util.js");
  downloadBlob(blob, `${slug(name)}.png`);
}

/* ----------------------------------------------------------- lightbox */

let state = { items: [], index: 0 };

export function openLightbox(items, index) {
  state = { items, index };
  paint();
  openOverlay($("#lightbox"));
}

function paint() {
  const item = state.items[state.index];
  if (!item) return;
  const [width, height] = tileDims(item.tile);
  const zoom = Math.max(2, Math.min(10, Math.floor(280 / Math.max(width, height, 1))));
  const fit = Math.max(width, height) * zoom;

  $("#lightboxStage").innerHTML = item.tile
    ? texHTML(item.tile, Math.min(fit, 340), { cls: "lb-tex" })
    : `<span class="dim mono">No texture extracted</span>`;

  const entryLink = item.entryId != null
    ? `<a class="btn small primary" href="#/entry/${item.entryId}">Open entry #${item.entryId}</a>`
    : "";

  $("#lightboxMeta").innerHTML = `
    <h3>${esc(item.name)}</h3>
    <p class="lm-sub">${width} × ${height} px${item.sub ? ` · ${esc(item.sub)}` : ""}${item.tile ? ` · ${zoom}× preview` : ""}</p>
    <div class="lightbox-actions">
      ${entryLink}
      ${item.tile ? `<button class="btn small" data-lb-download>↓ Download PNG</button>` : ""}
      <button class="btn small ghost" data-lb-copy>Copy name</button>
      <span class="count" style="margin-left:auto">${state.index + 1} / ${state.items.length}</span>
      <button class="btn small ghost" data-lb-prev aria-label="Previous texture">←</button>
      <button class="btn small ghost" data-lb-next aria-label="Next texture">→</button>
    </div>`;

  const download = $("[data-lb-download]", $("#lightboxMeta"));
  if (download) {
    download.addEventListener("click", () => downloadTile(item.tile, item.name));
  }
  $("[data-lb-copy]", $("#lightboxMeta"))?.addEventListener("click", async () => {
    const { copy } = await import("./util.js");
    const { toast } = await import("./ui.js");
    await copy(item.name);
    toast(`Copied “${item.name}”`);
  });
  $("[data-lb-prev]", $("#lightboxMeta"))?.addEventListener("click", () => step(-1));
  $("[data-lb-next]", $("#lightboxMeta"))?.addEventListener("click", () => step(1));
}

export function step(delta) {
  if (!state.items.length) return;
  state.index = (state.index + delta + state.items.length) % state.items.length;
  paint();
}

document.addEventListener("keydown", (event) => {
  const lightbox = $("#lightbox");
  if (!lightbox || lightbox.hidden) return;
  if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
  if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
});
