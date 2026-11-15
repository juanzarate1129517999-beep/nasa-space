// The Fire Lab in the browser (web/app.js) must give the same answers as the Python
// model (pipeline/models.py) that the technical report is built from.
//
// tests/e2e/parity_cases.py computes reference answers with the pipeline's own
// functions on the model exactly as published in web/data/ember.json. This test
// sets the same scenarios through the Fire Lab controls, as a visitor would, and
// reads what the page shows.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { startSite, show, ROOT } from "./helpers.mjs";

const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const REF = JSON.parse(execFileSync(PYTHON, [path.join(ROOT, "tests/e2e/parity_cases.py")], { cwd: ROOT, encoding: "utf8" }));

// The browser takes the 5th/95th percentile as the nearest bootstrap draw; numpy
// interpolates between draws. Both are valid; they differ by at most one draw step.
const INTERVAL_TOL = 0.02;

let site, page, problems;
before(async () => {
  site = await startSite();
  ({ page, problems } = await site.open({ url: "#/lab" }));
  await show(page, "lab");
  await page.waitForSelector("#sl-o2");
});
after(async () => { await site?.close(); });

// Sets a scenario with the Fire Lab controls and returns what the page shows.
async function runScenario(c) {
  return page.evaluate((c) => {
    document.querySelector(`#fuel-seg button[data-f="${c.fuel}"]`).click();
    const set = (k, v) => {
      const el = document.getElementById(`sl-${k}`);
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    // Clear the diluents first so oxygen is never capped by the O2 + CO2 + He <= 100% rule.
    set("co2", 0); set("he", 0);
    set("o2", c.o2); set("p", c.p); set("co2", c.co2); set("he", c.he); set("d0", c.d0);
    const pctOf = (el, prop) => parseFloat(el.style[prop]) / 100;
    const ci = document.getElementById("r-ci"), pt = document.getElementById("r-pt");
    const status = document.querySelector("#r-status .status");
    const cap = document.getElementById("r-cap").innerText;
    const breakApart = cap.match(/(\d+) break apart/);
    return {
      big: document.getElementById("r-big").textContent.trim(),
      p: pctOf(pt, "left"), lo: pctOf(ci, "left"), width: pctOf(ci, "width"),
      status: status.classList.contains("out") ? "outside" : status.classList.contains("warn") ? "extrapolating" : "within",
      disruption: breakApart ? Number(breakApart[1]) : null,
      sliders: ["o2", "p", "co2", "he", "d0"].map((k) => Number(document.getElementById(`sl-${k}`).value)),
    };
  }, c);
}

test(`Fire Lab matches the Python model on ${REF.cases.length} scenarios`, async () => {
  for (const c of REF.cases) {
    const got = await runScenario(c);
    const label = `${c.fuel} ${c.o2} O2, ${c.p} atm, ${c.co2} CO2, ${c.he} He, ${c.d0} mm`;
    const want = c.extinction;
    // The controls hold the exact scenario (nothing was clamped or rounded away).
    [c.o2, c.p, c.co2, c.he, c.d0].forEach((v, i) => assert.ok(Math.abs(got.sliders[i] - v) < 1e-9, `${label}: slider ${i} shows ${got.sliders[i]}`));
    assert.equal(got.status, c.status, `${label}: data status`);
    // Same bootstrap draws, so the point estimate (their mean) must agree to rounding.
    assert.ok(Math.abs(got.p - want.p) < 1e-6, `${label}: chance ${got.p} vs Python ${want.p}`);
    assert.ok(Math.abs(got.lo - want.lo) <= INTERVAL_TOL, `${label}: interval low ${got.lo} vs ${want.lo}`);
    const hi = got.width > 0.01 ? got.lo + got.width : null; // bars narrower than 1% are drawn 1% wide
    if (hi != null) assert.ok(Math.abs(hi - want.hi) <= INTERVAL_TOL, `${label}: interval high ${hi} vs ${want.hi}`);
    if (c.status === "outside") {
      assert.equal(got.big, "—", `${label}: prediction must be withheld outside the data`);
    } else {
      assert.equal(got.big, `${(100 * want.p).toFixed(0)}%`, `${label}: headline number`);
      assert.equal(got.disruption, Math.round(100 * c.disruption.p), `${label}: "break apart" count`);
    }
  }
  assert.deepEqual(problems, []);
});

test("each crew atmosphere shows the numbers published in the report", async () => {
  // The spacesuit (100% O2) is far outside every flown test, so it has no preset button.
  const presets = await page.$$eval("#presets button", (bs) => bs.map((b) => b.dataset.h));
  assert.deepEqual(presets, REF.habitats.map((h) => h.id).filter((id) => id !== "suit"));
  for (const h of REF.habitats.filter((x) => presets.includes(x.id))) {
    for (const fuel of ["Methanol", "Heptane"]) {
      const got = await page.evaluate(({ id, fuel }) => {
        document.querySelector(`#presets button[data-h="${id}"]`).click();
        document.querySelector(`#fuel-seg button[data-f="${fuel}"]`).click();
        document.getElementById("sl-d0").value = String(window.EMBER.flex.d0_median);
        document.getElementById("sl-d0").dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector(`#presets button[data-h="${id}"]`).click();
        return { big: document.getElementById("r-big").textContent.trim(), p: parseFloat(document.getElementById("r-pt").style.left) / 100 };
      }, { id: h.id, fuel });
      if (h.status[fuel] === "outside") assert.equal(got.big, "—", `${h.id} ${fuel}`);
      else {
        assert.ok(Math.abs(got.p - h[fuel]) < 1e-6, `${h.id} ${fuel}: ${got.p} vs ${h[fuel]}`);
        assert.equal(got.big, `${(100 * h[fuel]).toFixed(0)}%`, `${h.id} ${fuel}`);
      }
    }
  }
  // The headline of the project: cabin air 75%, lunar-base air 8% (methanol).
  const cabin = REF.habitats.find((h) => h.id === "cabin"), moon = REF.habitats.find((h) => h.id === "moon_base");
  assert.equal(Math.round(100 * cabin.Methanol), 75);
  assert.equal(Math.round(100 * moon.Methanol), 8);
  assert.deepEqual(problems, []);
});
