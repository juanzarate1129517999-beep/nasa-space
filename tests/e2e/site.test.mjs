// Browser tests of the published dashboard (web/): every section, link and screen size.
// See helpers.mjs for how the site is served and how other hosts are blocked.
//
// Run: npm run test:e2e   (needs `npm install` and a Chromium for Playwright)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startSite, show, VIEWS, WEB } from "./helpers.mjs";

// Charts each view must finish drawing (counted as Plotly plots in the view).
const MIN_CHARTS = { flames: 1, lab: 1, findings: 4, ranking: 1, next: 1, data: 1 };

let site;
before(async () => { site = await startSite(); });
after(async () => { await site?.close(); });
const open = (opts) => site.open(opts);

for (const external of ["hang", "abort"]) {
  test(`splash clears quickly when external hosts ${external === "hang" ? "never answer" : "refuse"}`, async () => {
    const { page, problems, splashMs } = await open({ external });
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
    const { page, problems } = await open({ url: hash });
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
  const { page, problems } = await open({ viewport: { width: 375, height: 740 } });
  for (const v of VIEWS) {
    await show(page, v);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${v}: page is ${overflow}px wider than the phone screen`);
  }
  assert.deepEqual(problems, []);
  await page.close();
});
