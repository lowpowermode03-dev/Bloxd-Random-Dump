/* Live Bloxd file scanner — talks to /api/scan on the dev server.
 *
 * The archive is static, but `node serve.mjs` fingerprints the Bloxd files in
 * data/ + media/ and probes the Bloxd environments every 20 seconds. This
 * module polls that snapshot, paints the monitor panel on the Archive page and
 * keeps the header pill honest about when the last scan happened.
 *
 * On a static host (no /api) everything degrades to an "offline" note.
 */

import { bytes, esc, num } from "./util.js";
import { toast } from "./ui.js";

const POLL_MS = 5000;
const listeners = new Set();

let state = { phase: "loading", offline: false, data: null, error: null };
let pollTimer = null;
let countdownTimer = null;
let lastAnnouncedScan = null;
let lastDuePoll = 0;

export function getScanState() {
  return state;
}

export function onScan(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (error) {
      console.error(error);
    }
  }
}

async function poll() {
  try {
    const response = await fetch("api/scan", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state = { phase: "online", offline: false, data, error: null };
    announce(data);
  } catch (error) {
    state = { phase: "offline", offline: true, data: state.data, error: String(error?.message || error) };
  }
  emit();
}

function announce(data) {
  const latest = data.history?.[0];
  if (!latest || latest.at === lastAnnouncedScan) return;
  lastAnnouncedScan = latest.at;
  if (latest.remoteChanged) {
    toast("New Bloxd build detected", 3200);
  } else if (latest.localChanged) {
    toast("Bloxd archive files changed on disk", 3200);
  }
}

export function startMonitor() {
  if (pollTimer) return;
  poll();
  pollTimer = setInterval(() => {
    if (document.visibilityState !== "hidden") poll();
  }, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") poll();
  });
  countdownTimer = setInterval(updateCountdowns, 1000);
}

function secondsUntil(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000));
}

function countdownLabel(next) {
  if (state.offline) return "offline";
  if (state.data?.scanning) return "scanning…";
  if (next === null) return "starting…";
  if (next <= 0) return "scan pending";
  return `next scan in ${next}s`;
}

function updateCountdowns() {
  const nodes = document.querySelectorAll("[data-scan-countdown]");
  if (!nodes.length) return;
  const next = secondsUntil(state.data?.nextScanAt);
  const last = state.data?.lastScanAt ? new Date(state.data.lastScanAt) : null;
  const text = countdownLabel(next);
  for (const node of nodes) {
    node.textContent = text;
    node.dataset.last = last ? last.toLocaleTimeString() : "";
  }
  // The countdown hit zero: the server has just swept, so refresh promptly
  // instead of waiting out the whole poll interval.
  if (next !== null && next <= 0 && state.phase === "online") {
    const now = Date.now();
    if (now - lastDuePoll > 1500) {
      lastDuePoll = now;
      poll();
    }
  }
}

function historyTicks(history = []) {
  return history
    .slice(0, 12)
    .reverse()
    .map((entry) => {
      const changed = entry.localChanged || entry.remoteChanged;
      const title = `${new Date(entry.at).toLocaleTimeString()} · ${entry.ms} ms${changed ? " · changed" : ""}`;
      return `<span class="scan-tick" data-changed="${changed ? "true" : "false"}" title="${esc(title)}"></span>`;
    })
    .join("");
}

function remoteRow(result) {
  const host = (() => {
    try {
      return new URL(result.url).host;
    } catch {
      return result.url;
    }
  })();
  const label = result.status === "error" ? "unreachable" : result.build || "no build id";
  const detail = result.status === "error" ? "—" : `${result.latencyMs} ms${result.changed ? " · changed" : ""}`;
  const note = result.changed && result.previousBuild ? `was ${result.previousBuild}` : result.status === "error" ? result.error || "unreachable" : result.bundleUrl || "";
  return `<li data-status="${esc(result.status)}${result.changed ? " changed" : ""}" title="${esc(note)}">
    <i aria-hidden="true"></i>
    <span class="scan-url">${esc(host)}</span>
    <b>${esc(label)}</b>
    <small>${esc(detail)}</small>
  </li>`;
}

function panelHTML(current) {
  if (current.phase === "loading") {
    return `<div class="scan-loading"><span class="scan-spinner" aria-hidden="true"></span>Contacting the file scanner…</div>`;
  }

  if (current.offline) {
    return `
      <div class="scan-head">
        <div>
          <p class="kicker">Live monitor</p>
          <h2>Scanner offline.</h2>
          <p class="muted">The 20-second Bloxd file scan runs inside <code>serve.mjs</code>. Start the site with <code>node serve.mjs</code> to wake it up — on a static host this panel stays dormant and the archive below is unaffected.</p>
        </div>
        <span class="scan-state" data-state="offline"><i aria-hidden="true"></i>offline</span>
      </div>`;
  }

  const data = current.data;
  const local = data.local ?? {};
  const remote = data.remote ?? [];
  const changed = Boolean(local.changed || remote.some((result) => result.changed));
  const scanSeconds = Math.round((data.intervalMs || 20000) / 1000);
  const remoteCopy =
    data.remoteEnabled === false
      ? "reads the build id when remote probing is switched on"
      : remote.length === 1
        ? "reads the build id out of the configured Bloxd environment"
        : remote.length === 3
          ? "reads the build id out of the three Bloxd environments"
          : `reads the build id out of ${remote.length} Bloxd environments`;
  const roots = (local.roots ?? []).map((root) => esc(root)).join(" + ");
  const changeLine = local.changed
    ? `<span class="scan-flag" data-tone="changed">${num(local.addedCount ?? 0)} added · ${num(local.modifiedCount ?? 0)} modified · ${num(local.removedCount ?? 0)} removed</span>`
    : `<span class="scan-flag">local files unchanged this sweep</span>`;
  const fileSample = [
    ...(local.added ?? []).map((file) => `+ ${file}`),
    ...(local.modified ?? []).map((file) => `~ ${file}`),
    ...(local.removed ?? []).map((file) => `− ${file}`),
  ].slice(0, 4);

  return `
    <div class="scan-head">
      <div>
        <p class="kicker">Live monitor</p>
        <h2>Bloxd files, rescanned every ${scanSeconds}s.</h2>
        <p class="muted">Each sweep fingerprints the archived Bloxd files on disk and ${remoteCopy}. Nothing is downloaded beyond ${remote.length === 1 ? "that index page" : "their index pages"}.</p>
      </div>
      <div class="scan-controls">
        <span class="scan-state" data-state="${changed ? "changed" : data.scanning ? "scanning" : "live"}">
          <i aria-hidden="true"></i>${changed ? "changed" : data.scanning ? "scanning" : "watching"}
        </span>
        <span class="scan-countdown mono" data-scan-countdown>${countdownLabel(secondsUntil(data.nextScanAt))}</span>
        <button class="btn small ghost" type="button" data-scan-now>Rescan now</button>
      </div>
    </div>

    <div class="scan-grid">
      <div class="scan-card">
        <small>Local Bloxd files</small>
        <div class="scan-big">${num(local.files ?? 0)}<span> files</span></div>
        <div class="scan-meta">${esc(bytes(local.bytes ?? 0))} · ${roots || "no roots"}</div>
        <div class="scan-meta">${local.zip ? `source zip · ${esc(local.zip.name)}` : "source zip not in this checkout"}</div>
        <div class="scan-meta">${changeLine}</div>
        ${fileSample.length ? `<ul class="scan-files">${fileSample.map((file) => `<li>${esc(file)}</li>`).join("")}</ul>` : ""}
      </div>

      <div class="scan-card">
        <small>Fingerprint</small>
        <div class="scan-digest">${esc(local.digest ?? "—")}</div>
        <div class="scan-meta">scan #${num(data.scans ?? 0)} · ${esc(String(data.durationMs ?? 0))} ms · ${esc(roots)}</div>
        <div class="scan-history" aria-label="Recent scans">${historyTicks(data.history)}</div>
        <div class="scan-meta">Last scan ${data.lastScanAt ? esc(new Date(data.lastScanAt).toLocaleTimeString()) : "—"}</div>
      </div>
    </div>

    <div class="scan-remote">
      <small>Remote builds</small>
      ${
        data.remoteEnabled === false
          ? `<p class="scan-meta">Remote probing is disabled (SCAN_REMOTE=0).</p>`
          : `<ul class="scan-remote-list">${remote.map(remoteRow).join("")}</ul>`
      }
    </div>`;
}

export function mountScanPanel(panel) {
  if (!panel) return;
  let unsubscribe = null;

  const render = (current) => {
    if (!panel.isConnected) {
      unsubscribe?.();
      return;
    }
    panel.innerHTML = panelHTML(current);
    updateCountdowns();
  };

  unsubscribe = onScan(render);

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scan-now]");
    if (!button) return;
    button.disabled = true;
    button.textContent = "Scanning…";
    fetch("api/scan/now", { method: "POST" })
      .then(() => poll())
      .catch(() => {
        button.textContent = "Scanner offline";
      })
      .finally(() => {
        if (button.isConnected) {
          button.disabled = false;
          if (button.textContent === "Scanning…") button.textContent = "Rescan now";
        }
      });
  });
}
