// Browser tests of the published dashboard (web/).
//
// The site is served from this checkout and every request to another host is
// left hanging with no answer, so the tests also prove the dashboard works when
// Google Fonts, NASA or a CDN is slow or unreachable (a hanging fonts request is
// what kept the "Loading NASA PSI data" splash up before 2026-11-16).
//
// Run: npm run test:e2e   (needs `npm install` and a Chromium for Playwright)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
const VIEWS = ["home", "learn", "flames", "lab", "findings", "ranking", "next", "data"];
// Charts each view must finish drawing (counted as Plotly plots in the view).
const MIN_CHARTS = { flames: 1, lab: 1, findings: 4, ranking: 1, next: 1, data: 1 };
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".csv": "text/csv", ".woff2": "font/woff2", ".pdf": "application/pdf",
};

let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
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
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
});

after(async () => {
  await browser?.close();
  await new Promise((ok) => server?.close(ok));
});

// Opens the dashboard with external hosts blocked and records every problem.
async function open(viewport = { width: 1280, height: 800 }, hash = "", external = "hang") {
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
    // "hang": never answer, like a host that is blocked by a firewall; "abort": fail at once.
    return external === "abort" ? route.abort() : new Promise(() => {});
  });
  const t0 = Date.now();
  await page.goto(base + hash, { waitUntil: "commit" });
  await page.waitForSelector("#loading.done", { state: "attached", timeout: 8000 });
  return { page, problems, splashMs: Date.now() - t0 };
}

async function show(page, view) {
  await page.evaluate((v) => { location.hash = `#/${v}`; }, view);
  await page.waitForFunction((v) => {
    const s = document.querySelector(`.view[data-view="${v}"]`);
    return s && !s.hidden && document.body.dataset.view === v;
  }, view);
}

for (const external of ["hang", "abort"]) {
  test(`splash clears quickly when external hosts ${external === "hang" ? "never answer" : "refuse"}`, async () => {
    const { page, problems, splashMs } = await open(undefined, "", external);
    assert.ok(splashMs < 8000, `splash took ${splashMs} ms`);
    // The home view is usable: its headline numbers are on screen.
    await page.waitForFunction(() => document.querySelector('.view[data-view="home"]').innerText.length > 1000);
    assert.deepEqual(problems, []);
    await page.close();
  });
}

test("every section renders its content and charts without errors", async () => {
  const { page, problems } = await open();
  for (const v of VIEWS) {
    await show(page, v);
    const min = MIN_CHARTS[v] || 0;
    await page.waitForFunction(([v, min]) => {
      const s = document.querySelector(`.view[data-view="${v}"]`);
      return s.querySelectorAll(".js-plotly-plot").length >= min && !/Loading chart/.test(s.innerText);
    }, [v, min], { timeout: 15000 });
    const text = await page.$eval(`.view[data-view="${v}"]`, (s) => s.innerText.trim().length);
    assert.ok(text > 1000, `${v}: only ${text} characters of text`);
    // Only the requested view is visible.
    const visible = await page.$$eval(".view", (els) => els.filter((s) => !s.hidden).map((s) => s.dataset.view));
    assert.deepEqual(visible, [v]);
  }
  await page.waitForTimeout(1000);
  assert.deepEqual(problems, []);
  await page.close();
});

test("deep links and aliases open the right section", async () => {
  const cases = { "#/method": "data", "#/scenario": "lab", "#/investigations": "ranking", "#/coverage": "findings", "#/nope": "home", "": "home" };
  for (const [hash, view] of Object.entries(cases)) {
    const { page, problems } = await open(undefined, hash);
    await page.waitForFunction((v) => document.body.dataset.view === v, view, { timeout: 5000 });
    assert.deepEqual(problems, [], `opening ${hash || "/"}`);
    await page.close();
  }
});

test("every local link and download on the site exists", async () => {
  const { page, problems } = await open();
  for (const v of VIEWS) await show(page, v);
  const links = await page.$$eval("a[href]", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  const local = links.filter((h) => h && !/^(#|[a-z]+:|\/\/)/i.test(h));
  assert.ok(local.some((h) => h.includes("downloads/")), "no download links found");
  for (const h of local) {
    const file = path.join(WEB, decodeURIComponent(h.split(/[?#]/)[0]));
    assert.ok(fs.existsSync(file), `broken link: ${h}`);
  }
  assert.deepEqual(problems, []);
  await page.close();
});

test("no section scrolls sideways on a phone", async () => {
  const { page, problems } = await open({ width: 375, height: 740 });
  for (const v of VIEWS) {
    await show(page, v);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${v}: page is ${overflow}px wider than the phone screen`);
  }
  assert.deepEqual(problems, []);
  await page.close();
});
