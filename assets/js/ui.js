/* Overlays, toasts and small UI plumbing. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let overlayStack = [];

export function openOverlay(overlay) {
  if (!overlay) return;
  overlay.hidden = false;
  overlay._restore = document.activeElement;
  if (!overlayStack.includes(overlay)) overlayStack.push(overlay);
  document.body.style.overflow = "hidden";
  const target = overlay.querySelector("[data-autofocus]") ?? overlay.querySelector("input, button, a");
  setTimeout(() => target?.focus({ preventScroll: true }), 30);
}

export function closeOverlay(overlay) {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  overlayStack = overlayStack.filter((item) => item !== overlay);
  if (!overlayStack.length) document.body.style.overflow = "";
  overlay._restore?.focus?.({ preventScroll: true });
}

export function closeTopOverlay() {
  const top = overlayStack[overlayStack.length - 1];
  if (top) closeOverlay(top);
  return Boolean(top);
}

export function anyOverlayOpen() {
  return overlayStack.length > 0;
}

export function toast(message, ms = 2000) {
  const host = $("#toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  host.append(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, ms);
}

export function openModal(html) {
  $("#modalBody").innerHTML = html;
  openOverlay($("#modal"));
}

export function closeModal() {
  closeOverlay($("#modal"));
}

/* Wire overlay dismissal once. */
document.addEventListener("click", (event) => {
  const overlay = event.target.closest(".overlay");
  if (!overlay) return;
  if (event.target.closest("[data-close]") || event.target === overlay) {
    closeOverlay(overlay);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTopOverlay();
});
