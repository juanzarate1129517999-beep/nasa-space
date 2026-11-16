// Shared setup for the browser tests: serves web/ from this checkout and opens it in Chromium.
//
// Every request to another host is left hanging with no answer (or refused), so
// the tests also prove the dashboard works when Google Fonts, NASA or a CDN is
// slow or unreachable (a hanging fonts request is what kept the
// "Loading NASA PSI data" splash up before 2026-11-16).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const WEB = path.join(ROOT, "web");
export const VIEWS = ["home", "learn", "flames", "lab", "findings", "ranking", "next", "data"];

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".csv": "text/csv", ".woff2": "font/woff2", ".pdf": "application/pdf",
};

export async function startSite() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(WEB, rel.endsWith("/") ? rel + "index.html" : rel);
    if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

  // Opens the dashboard and records every problem: uncaught errors, console errors, failed local requests.
  async function open({ viewport = { width: 1280, height: 800 }, url = "", external = "hang" } = {}) {
    const page = await browser.newPage({ viewport });
    const problems = [];
    page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
    page.on("console", (m) => {
      // Blocked external hosts log "Failed to load resource"; local failures are caught below.
      if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push(`console: ${m.text()}`);
    });
    page.on("response", (r) => {
      if (r.url().startsWith(base) && r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
    });
    page.on("requestfailed", (r) => {
      if (r.url().startsWith(base)) problems.push(`failed: ${r.url()} (${r.failure()?.errorText})`);
    });
    await page.route("**/*", (route) => {
      if (route.request().url().startsWith(base)) return route.continue();
      // "hang": never answer, like a host blocked by a firewall; "abort": refuse at once.
      return external === "abort" ? route.abort() : new Promise(() => {});
    });
    const t0 = Date.now();
    await page.goto(base + url, { waitUntil: "commit" });
    await page.waitForSelector("#loading.done", { state: "attached", timeout: 8000 });
    return { page, problems, splashMs: Date.now() - t0 };
  }

  async function close() {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }

  return { base, open, close };
}

export async function show(page, view) {
  await page.evaluate((v) => { location.hash = `#/${v}`; }, view);
  await page.waitForFunction((v) => {
    const s = document.querySelector(`.view[data-view="${v}"]`);
    return s && !s.hidden && document.body.dataset.view === v;
  }, view);
}
