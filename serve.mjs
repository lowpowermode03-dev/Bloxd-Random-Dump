#!/usr/bin/env node
/**
 * Tiny zero-dependency static server for the Bloxd Codex.
 *
 *   node serve.mjs            # http://localhost:8080
 *   PORT=3000 node serve.mjs
 *
 * Serves the repository root, gzips text assets on the fly and falls back to
 * index.html for hash-router deep links.
 */

import http from "node:http";
import { promises as fs, createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = resolve(new URL(".", import.meta.url).pathname);
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".md", ".svg", ".txt"]);
const gzipCache = new Map();

async function readFileWithGzip(path, ext, acceptsGzip) {
  const body = await fs.readFile(path);
  if (!acceptsGzip || !COMPRESSIBLE.has(ext) || body.length < 1024) {
    return { body, encoding: null };
  }
  const key = `${path}:${body.length}`;
  let cached = gzipCache.get(key);
  if (!cached) {
    cached = gzipSync(body, { level: 6 });
    gzipCache.set(key, cached);
    if (gzipCache.size > 60) gzipCache.delete(gzipCache.keys().next().value);
  }
  return { body: cached, encoding: "gzip" };
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  if (pathname.endsWith("/")) pathname += "index.html";

  let filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  let stat = null;
  try {
    stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = join(filePath, "index.html");
      stat = await fs.stat(filePath);
    }
  } catch {
    stat = null;
  }

  // Hash-router fallback for clean deep links like /codex
  if (!stat) {
    if (!extname(pathname)) {
      filePath = join(ROOT, "index.html");
      stat = await fs.stat(filePath).catch(() => null);
    }
    if (!stat) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
  }

  const ext = extname(filePath).toLowerCase();
  const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": ext === ".png" ? "public, max-age=86400" : "public, max-age=60",
  };

  try {
    if (req.method === "HEAD") {
      res.writeHead(200, { ...headers, "Content-Length": stat.size }).end();
      return;
    }
    const { body, encoding } = await readFileWithGzip(filePath, ext, acceptsGzip);
    if (encoding) headers["Content-Encoding"] = encoding;
    headers["Content-Length"] = body.length;
    headers.Vary = "Accept-Encoding";
    res.writeHead(200, headers);
    res.end(body);
  } catch (error) {
    console.error(error);
    res.writeHead(500).end("Server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Bloxd Codex running at http://localhost:${PORT}`);
  console.log(`Serving ${ROOT}`);
});
