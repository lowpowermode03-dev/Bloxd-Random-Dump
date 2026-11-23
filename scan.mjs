#!/usr/bin/env node
/**
 * Bloxd file scanner.
 *
 * Every SCAN_INTERVAL_MS (default 20 seconds) this fingerprints:
 *   1. the archived Bloxd files in data/ and media/ (+ any source .zip), and
 *   2. the Bloxd environments in SCAN_URLS, by reading their index and pulling
 *      the `<build>.main.<hash>.js` bundle name out of it.
 *
 * It is intentionally dependency-free and cheap: local files are diffed on
 * size + mtime (no content hashing unless something changed), and the remote
 * probe downloads the index HTML only — never the 3.6 MB game bundle.
 *
 *   node serve.mjs                     # scanner runs inside the dev server
 *   node scan.mjs                      # one scan, printed as JSON
 *   SCAN_INTERVAL_MS=60000 node serve.mjs
 *   SCAN_REMOTE=0 node serve.mjs       # local files only (offline mode)
 *   SCAN_URLS="https://bloxd.io/" node serve.mjs
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(new URL(".", import.meta.url).pathname);

const DEFAULT_URLS = ["https://bloxd.io/", "https://preprod.bloxd.io/", "https://staging.bloxd.io/"];

export const SCAN_CONFIG = {
  intervalMs: Math.min(3_600_000, Math.max(5_000, Number(process.env.SCAN_INTERVAL_MS) || 20_000)),
  roots: (process.env.SCAN_ROOTS || "data,media")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  remote: process.env.SCAN_REMOTE !== "0",
  urls: (process.env.SCAN_URLS || DEFAULT_URLS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  timeoutMs: Math.min(30_000, Math.max(1_000, Number(process.env.SCAN_TIMEOUT_MS) || 5_000)),
  maxFiles: 12_000,
  historySize: 14,
};

const BUNDLE_RE = /static\/js\/([a-z0-9]+)\.main\.([0-9a-f]{6,})\.js/i;
const ZIP_RE = /\.zip$/i;
const USER_AGENT = "BloxdCodex/1.0 (build monitor; +https://bloxd.io)";

const state = {
  startedAt: new Date().toISOString(),
  intervalMs: SCAN_CONFIG.intervalMs,
  remoteEnabled: SCAN_CONFIG.remote,
  scanning: false,
  scans: 0,
  lastScanAt: null,
  nextScanAt: null,
  durationMs: null,
  local: {
    roots: SCAN_CONFIG.roots,
    files: 0,
    bytes: 0,
    digest: null,
    changed: false,
    changedAt: null,
    added: [],
    removed: [],
    modified: [],
    truncated: false,
    zip: null,
  },
  remote: [],
  history: [],
};

let localIndex = new Map();
let remoteIndex = new Map();
let timer = null;
const warned = new Set();

const sha1 = (value) => createHash("sha1").update(value).digest("hex");
const iso = () => new Date().toISOString();
const round = (value) => Math.round(value * 100) / 100;

async function walk(dir, out) {
  let items;
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of items) {
    if (out.length >= SCAN_CONFIG.maxFiles) return;
    if (item.name.startsWith(".")) continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) {
      await walk(full, out);
    } else if (item.isFile()) {
      out.push(full);
    }
  }
}

async function scanLocal() {
  const files = [];
  for (const root of SCAN_CONFIG.roots) await walk(join(ROOT, root), files);

  const index = new Map();
  let bytes = 0;
  for (const full of files) {
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    const key = relative(ROOT, full).split(sep).join("/");
    index.set(key, { size: stat.size, mtimeMs: Math.round(stat.mtimeMs) });
    bytes += stat.size;
  }

  let zip = null;
  const rootEntries = await fs.readdir(ROOT).catch(() => []);
  const zipName = rootEntries.find((name) => ZIP_RE.test(name) && !name.startsWith("."));
  if (zipName) {
    const stat = await fs.stat(join(ROOT, zipName)).catch(() => null);
    if (stat) {
      zip = { name: zipName, bytes: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString() };
      index.set(zipName, { size: stat.size, mtimeMs: Math.round(stat.mtimeMs) });
      bytes += stat.size;
    }
  }

  const digest = createHash("sha1");
  for (const key of [...index.keys()].sort()) {
    const entry = index.get(key);
    digest.update(`${key}:${entry.size}:${entry.mtimeMs}\n`);
  }

  const added = [];
  const removed = [];
  const modified = [];
  if (localIndex.size) {
    for (const key of index.keys()) {
      const next = index.get(key);
      const previous = localIndex.get(key);
      if (!previous) added.push(key);
      else if (previous.size !== next.size || previous.mtimeMs !== next.mtimeMs) modified.push(key);
    }
    for (const key of localIndex.keys()) if (!index.has(key)) removed.push(key);
  }

  const firstScan = localIndex.size === 0;
  localIndex = index;

  return {
    roots: SCAN_CONFIG.roots,
    files: index.size,
    bytes,
    digest: digest.digest("hex").slice(0, 16),
    changed: !firstScan && Boolean(added.length || removed.length || modified.length),
    firstScan,
    added: added.slice(0, 24),
    removed: removed.slice(0, 24),
    modified: modified.slice(0, 24),
    addedCount: added.length,
    removedCount: removed.length,
    modifiedCount: modified.length,
    truncated: files.length >= SCAN_CONFIG.maxFiles,
    zip,
  };
}

async function probeRemote(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_CONFIG.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    const html = await response.text();
    const match = BUNDLE_RE.exec(html);
    const bundle = match ? { build: `${match[1]}.${match[2]}`, url: match[0].startsWith("http") ? match[0] : `https://${new URL(url).host}${match[0]}` } : null;
    const hash = sha1(html);
    return {
      url,
      status: response.ok ? "ok" : "error",
      httpStatus: response.status,
      bytes: Buffer.byteLength(html),
      hash: hash.slice(0, 16),
      build: bundle?.build ?? null,
      bundleUrl: bundle?.url ?? null,
      latencyMs: Date.now() - started,
      checkedAt: iso(),
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      url,
      status: "error",
      httpStatus: null,
      bytes: 0,
      hash: null,
      build: null,
      bundleUrl: null,
      latencyMs: Date.now() - started,
      checkedAt: iso(),
      error: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function scanRemote() {
  if (!SCAN_CONFIG.remote) return [];
  const results = [];
  for (const url of SCAN_CONFIG.urls) results.push(await probeRemote(url));

  for (const result of results) {
    const previous = remoteIndex.get(result.url);
    result.changed = Boolean(previous && previous.hash && result.hash && previous.hash !== result.hash);
    if (previous?.hash) result.previousBuild = previous.build;
    if (result.status === "error") {
      if (!warned.has(result.url)) {
        warned.add(result.url);
        console.warn(`[scan] ${result.url} unreachable: ${result.error}`);
      }
    } else if (warned.delete(result.url)) {
      console.log(`[scan] ${result.url} reachable again${result.build ? ` (${result.build})` : ""}`);
    }
  }

  remoteIndex = new Map(
    results
      .filter((result) => result.hash)
      .map((result) => [result.url, { hash: result.hash, build: result.build }]),
  );
  return results;
}

function remember(entry) {
  state.history.unshift(entry);
  state.history.length = Math.min(state.history.length, SCAN_CONFIG.historySize);
}

async function runScan(reason = "interval") {
  if (state.scanning) return snapshot();
  state.scanning = true;
  const started = Date.now();

  try {
    const local = await scanLocal();
    const remote = await scanRemote();

    if (local.firstScan) {
      local.changed = false;
    } else if (local.changed) {
      local.changedAt = iso();
    }

    const merged = { ...state.local, ...local, changedAt: local.changed ? iso() : state.local.changedAt };
    delete merged.firstScan;
    state.local = merged;

    state.remote = remote;
    state.scans += 1;
    state.lastScanAt = iso();
    state.durationMs = Date.now() - started;

    const remoteChanged = remote.some((result) => result.changed);
    remember({
      at: state.lastScanAt,
      ms: state.durationMs,
      reason,
      localChanged: local.changed,
      remoteChanged,
      errors: remote.filter((result) => result.status === "error").length,
      files: state.local.files,
      bytes: state.local.bytes,
    });

    if (local.changed) {
      console.log(
        `[scan] local change: ${local.addedCount} added, ${local.modifiedCount} modified, ${local.removedCount} removed`,
      );
    }
    for (const result of remote) {
      if (result.changed) console.log(`[scan] new build at ${result.url}: ${result.build ?? "unknown"}`);
    }
  } catch (error) {
    console.error("[scan] failed:", error);
    remember({ at: iso(), ms: Date.now() - started, reason, error: String(error?.message || error) });
  } finally {
    state.scanning = false;
    state.nextScanAt = new Date(Date.now() + SCAN_CONFIG.intervalMs).toISOString();
  }

  return snapshot();
}

/** Plain-JSON copy of the scanner state, safe to send over HTTP. */
export function snapshot() {
  return {
    intervalMs: state.intervalMs,
    remoteEnabled: state.remoteEnabled,
    startedAt: state.startedAt,
    scanning: state.scanning,
    scans: state.scans,
    lastScanAt: state.lastScanAt,
    nextScanAt: state.nextScanAt,
    durationMs: state.durationMs,
    local: state.local,
    remote: state.remote,
    history: state.history,
    serverTime: iso(),
  };
}

export function getScanState() {
  return state;
}

export function scanNow(reason = "manual") {
  return runScan(reason);
}

export function startScanner() {
  if (timer) return snapshot();
  timer = setInterval(() => runScan("interval"), SCAN_CONFIG.intervalMs);
  timer.unref?.();
  runScan("startup");
  return snapshot();
}

export function stopScanner() {
  if (timer) clearInterval(timer);
  timer = null;
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const result = await runScan("cli");
  const summary = {
    intervalMs: result.intervalMs,
    local: {
      files: result.local.files,
      bytes: result.local.bytes,
      digest: result.local.digest,
      zip: result.local.zip,
    },
    remote: result.remote.map(({ url, status, build, latencyMs, error }) => ({
      url,
      status,
      build,
      latencyMs,
      error,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  stopScanner();
}
