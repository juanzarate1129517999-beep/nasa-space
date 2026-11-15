(function () {
  "use strict";
  const D = window.EMBER;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p, d = 0) => (p == null ? "—" : (100 * p).toFixed(d) + "%");
  const o2pct = (x) => pct(x, Math.round(x * 1000) % 10 ? 1 : 0);
  const num = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const ATM_PSI = 14.6959;
  const C = { ink: "#f1f5f9", ink2: "#cbd5e1", ink3: "#94a3b8", ink4: "#64748b", line: "rgba(203,213,225,0.08)", line2: "rgba(203,213,225,0.18)", bg: "#000000", surface: "#0b0c0f", orange: "#f2600f", blue: "#0b93d6", violet: "#8b5cf6", teal: "#0f9d8f", amber: "#fbbf24" };
  const FAMILY = {
    solido: { name: "Solid materials", symbol: "square", color: C.orange },
    gota: { name: "Fuel droplets", symbol: "circle", color: C.blue },
    gas: { name: "Gas flames", symbol: "diamond", color: C.violet },
    humo: { name: "Smoke & dust", symbol: "triangle-up", color: C.teal },
    polvo: { name: "Smoke & dust", symbol: "triangle-up", color: C.teal },
  };
  const OUTCOME = { extincion: "Self-extinguished", disrupcion: "Droplet disrupted", completo: "Burned to completion" };
  const CFG = { displayModeBar: false, responsive: true };

  if (!D) {
    $("#loading").textContent = "DATA NOT FOUND — RUN: python -m pipeline.run";
    return;
  }
  const hasPlotly = typeof window.Plotly !== "undefined";

  function layout(extra = {}) {
    const axis = {
      gridcolor: C.line, linecolor: C.line2, zeroline: false, ticks: "", automargin: true,
      tickfont: { family: "Geist Mono, JetBrains Mono, monospace", size: 10.5, color: C.ink3 },
      title: { font: { size: 12, color: C.ink2, family: "Geist, Inter, sans-serif" }, standoff: 12 },
    };
    const base = {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Geist, Inter, sans-serif", color: C.ink3, size: 11.5 },
      margin: { l: 56, r: 18, t: 12, b: 48 }, showlegend: false, dragmode: false,
      hoverlabel: { bgcolor: "#111317", bordercolor: C.line2, font: { family: "Geist, Inter, sans-serif", color: C.ink, size: 12 }, align: "left" },
      xaxis: JSON.parse(JSON.stringify(axis)), yaxis: JSON.parse(JSON.stringify(axis)),
    };
    return merge(base, extra);
  }
  function merge(a, b) {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") a[k] = merge(a[k], v);
      else a[k] = v;
    }
    return a;
  }
  function plot(id, data, lay) {
    const el = document.getElementById(id);
    if (!hasPlotly) {
      el.innerHTML = '<p class="note" style="padding:20px">Charts could not load (web/vendor/plotly-2.35.2.min.js is missing). All values are also available in the tables and downloads.</p>';
      return;
    }
    const L = window.I18N;
    Plotly.react(el, L ? L.deep(data) : data, L ? L.deep(lay) : lay, CFG);
    return el;
  }
  const legendItem = (shape, color, label, open = false) => {
    const fill = open ? "none" : color;
    const s = {
      square: `<rect x="2" y="2" width="8" height="8" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`,
      circle: `<circle cx="6" cy="6" r="4.2" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`,
      diamond: `<path d="M6 1.2 10.8 6 6 10.8 1.2 6Z" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`,
      tri: `<path d="M6 1.5 10.8 10.3H1.2Z" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`,
      line: `<path d="M0 6H12" stroke="${color}" stroke-width="2"/>`,
      bar: `<rect x="0" y="2" width="12" height="8" rx="2" fill="${color}"/>`,
      cross: `<path d="M6 0V12M0 6H12" stroke="${color}" stroke-width="2"/>`,
    }[shape];
    return `<span><svg viewBox="0 0 12 12" aria-hidden="true">${s}</svg>${esc(label)}</span>`;
  };

  const M = D.flex;
  const BOOT = M.boot;
  const MU = M.mu, SD = M.sd;
  function stdz(x) { return x.map((v, i) => (v - MU[i]) / SD[i]); }
  function sig(z) { return 1 / (1 + Math.exp(-z)); }
  function predict(x) {
    const xs = stdz(x);
    const ps = BOOT.map((b) => { let z = b[0]; for (let i = 0; i < xs.length; i++) z += b[i + 1] * xs[i]; return sig(z); }).sort((a, b) => a - b);
    const q = (f) => ps[Math.min(ps.length - 1, Math.max(0, Math.round(f * (ps.length - 1))))];
    return { p: ps.reduce((a, b) => a + b, 0) / ps.length, lo: q(0.05), hi: q(0.95) };
  }
  function pointEstimate(xs) { let z = M.coef[0]; for (let i = 0; i < xs.length; i++) z += M.coef[i + 1] * xs[i]; return sig(z); }
  function neighbors(x, k = 5) {
    const xs = stdz(x);
    const d = M.train_std.map((t, i) => ({ i, d: Math.sqrt(t.reduce((s, v, j) => s + (v - xs[j]) ** 2, 0)) }));
    d.sort((a, b) => a.d - b.d);
    const near = d.slice(0, k);
    return { near, dist: near.reduce((s, r) => s + r.d, 0) / k };
  }
  const featVec = (s) => [s.fuel === "Heptane" ? 1 : 0, s.o2, Math.log(s.p), s.co2, s.he, s.d0];
  const FEAT_TXT = { x_o2: "oxygen", log_p: "pressure", x_co2: "CO₂", x_he: "helium", d0_mm: "droplet size" };
  function outOfRange(x) {
    const R = M.ranges || {};
    return M.features.filter((f, i) => f !== "heptane" && R[f] && (x[i] < R[f][0] - 1e-9 || x[i] > R[f][1] + 1e-9));
  }
  function dataStatus(x) {
    const nn = neighbors(x), thr = M.ood_threshold, beyond = outOfRange(x);
    const s = nn.dist > 2 * thr ? "outside" : (nn.dist > thr || beyond.length ? "extrapolating" : "within");
    return { s, nn, beyond };
  }
  const beyondTxt = (b) => b.map((f) => FEAT_TXT[f]).join(" and ");

  function renderHero() {
    const S = D.summary;
    const auc = M.validation.models.find((m) => m.key === "lr").auc;
    const k = [
      [S.investigations, `<small>/ ${S.flight} flight</small>`, "NASA PSI combustion investigations, profiled and ranked"],
      [S.records.toLocaleString("en-US"), "", `test records cleaned into one schema · ${S.with_outcome} with a labeled outcome`],
      [S.qc_fixes, "", "corrections to NASA's tables, each one logged with the original value"],
      [auc.toFixed(2), "<small>AUC</small>", "self-extinction model, scored on ISS test days it never saw"],
    ];
    $("#kpis").innerHTML = k.map(([v, s, l]) => `<div><dt>${l}</dt><dd>${v}${s}</dd></div>`).join("");
    $("#hero-lead").innerHTML = `NASA's flight archive holds ${S.ambient.toLocaleString("en-US")} fire-test records with an atmosphere: ${D.coverage.n_measured.toLocaleString("en-US")} with measured oxygen and pressure, the rest run in ordinary cabin air. Only <b>${S.moon_envelope}</b> came near Moon-base air, and no solid material has burned in orbit above <b>${D.solids.max_o2_any_solid_pct}% O₂</b>. Skylab Phoenix turns the archive into fire-safety answers you can check, and says plainly where the data runs out.`;
  }
  function renderHabitats() {
    $("#habitats").innerHTML = HUI.map((hb) => {
      const x = featVec({ fuel: "Methanol", o2: hb.x_o2, p: hb.p_atm, co2: 0, he: 0, d0: M.d0_median });
      const st = dataStatus(x);
      const r = { ...predict(x), ood: st.s === "outside" };
      const atm = `<div class="atm"><span>${o2pct(hb.x_o2)} O₂</span><span>${num(hb.p_atm, 2)} atm</span><span>${num(hb.p_atm * ATM_PSI, 1)} psi</span></div>`;
      const warn = st.s === "extrapolating"
        ? `<div class="xtra" title="${st.beyond.length ? `The ${esc(beyondTxt(st.beyond))} is beyond every flown FLEX test` : "Far from the nearest flown FLEX tests"}">Extrapolating · ${st.beyond.length ? `${esc(beyondTxt(st.beyond))} outside flown range` : "far from flown tests"}</div>` : "";
      const body = r.ood
        ? `<div class="p muted">—</div><div class="plabel">Prediction withheld</div><div class="ood-note"><b>Outside all flight data.</b> No microgravity fire has been flown near this atmosphere.</div>`
        : `<div class="p">${pct(r.p)}</div><div class="plabel">Self-extinguishes</div>
           <div class="track"><div class="ci" style="left:${100 * r.lo}%;width:${Math.max(1, 100 * (r.hi - r.lo))}%"></div><div class="pt" style="left:${100 * r.p}%"></div></div><div class="ci-txt">90% interval ${pct(r.lo)}–${pct(r.hi)}</div>${warn}`;
      return `<button class="hab" type="button" data-hab="${hb.id}" title="${esc(hb.source)}"><span class="go" aria-hidden="true">→</span><div class="name">${esc(hb.name)}</div><div class="det">${esc(hb.detail)}</div>${atm}${body}</button>`;
    }).join("");
    document.querySelectorAll(".hab").forEach((b) => b.addEventListener("click", () => {
      setPreset(b.dataset.hab);
      document.getElementById("scenario").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  const covState = { solido: true, gota: true, gas: true, humo: true };
  function renderCoverageFilters() {
    const fams = [["solido", "square"], ["gota", "circle"], ["gas", "diamond"], ["humo", "tri"]];
    $("#cov-filters").innerHTML = fams.map(([f, s]) => `<button class="chip" aria-pressed="${covState[f]}" data-f="${f}"><svg width="11" height="11" viewBox="0 0 12 12">${legendItem(s, FAMILY[f].color, "").match(/<svg[^>]*>(.*)<\/svg>/)[1]}</svg>${FAMILY[f].name}</button>`).join("");
    document.querySelectorAll("#cov-filters .chip").forEach((b) => b.addEventListener("click", () => {
      covState[b.dataset.f] = !covState[b.dataset.f];
      b.setAttribute("aria-pressed", covState[b.dataset.f]);
      renderCovMode();
    }));
    $("#cov-legend").innerHTML = [
      legendItem("circle", C.ink2, "Measured conditions"), legendItem("circle", C.ink2, "Assumed cabin air", true),
      legendItem("cross", C.ink, "Habitat atmosphere"), legendItem("bar", "rgba(242,96,15,.35)", "Lunar-base envelope (challenge brief)"),
    ].join("");
  }
  const covMode = { m: "simple" };
  function nearByFamily(hb) {
    const out = { solido: 0, gota: 0, gas: 0, humo: 0 };
    for (const g of D.coverage.groups) {
      const fam = g.family === "polvo" ? "humo" : g.family;
      for (let k = 0; k < g.x_o2.length; k++) {
        const o = g.x_o2[k], pp = g.p_atm[k];
        if (o == null || pp == null) continue;
        if (Math.abs(o - hb.x_o2) <= 0.03 && Math.abs(Math.log(pp / hb.p_atm)) <= Math.log(1.3)) out[fam]++;
      }
    }
    return out;
  }
  function renderCovSimple() {
    const fams = ["solido", "gota", "gas", "humo"].filter((f) => covState[f]);
    const rows = D.habitats.map((h) => { const c = nearByFamily(h); return { h, c, n: fams.reduce((s, f) => s + c[f], 0) }; });
    const max = Math.max(1, ...rows.map((r) => r.n));
    const cab = rows.find((r) => r.h.id === "cabin"), moon = rows.find((r) => r.h.id === "moon_base");
    const ratio = moon.n ? Math.round(cab.n / moon.n) : null;
    const air = (h) => `<span class="cvs__air"><i style="--o:${Math.min(100, 100 * h.x_o2)}%"></i>${o2pct(h.x_o2)} O₂</span><span class="cvs__air cvs__air--p"><i style="--o:${Math.min(100, 100 * h.p_atm)}%"></i>${num(h.p_atm * ATM_PSI, 1)} psi</span>`;
    $("#cov-simple").innerHTML = `
      <div class="cvs__head"><p class="cvs__big">${ratio ? `<b>${ratio}×</b> more flight tests in today's cabin air than in Moon-base air.` : `No flight tests near Moon-base air.`}</p>
      <p class="sub">A test counts as “near” when its oxygen is within 3 points and its pressure within 30% of that air. Colors show what was burning.</p></div>
      <div class="cvs">${rows.map((r) => `
        <div class="cvs__r${r.h.id === "moon_base" ? " is-key" : ""}">
          <div class="cvs__n"><b>${esc(r.h.name)}</b><span>${esc(r.h.detail || "")}</span><span class="cvs__airs">${air(r.h)}</span></div>
          <div class="cvs__track">${fams.map((f) => r.c[f] ? `<i style="width:${(100 * r.c[f]) / max}%;background:${FAMILY[f].color}" title="${esc(FAMILY[f].name)}: ${r.c[f]}"></i>` : "").join("")}${r.n === 0 ? '<span class="cvs__zero">no flight test in this air</span>' : ""}</div>
          <div class="cvs__v"><b>${r.n.toLocaleString("en-US")}</b><small>tests</small></div>
        </div>`).join("")}</div>
      <div class="legend">${fams.map((f) => legendItem("bar", FAMILY[f].color, FAMILY[f].name)).join("")}</div>
      <p class="note">The bars for oxygen and pressure under each name compare that air with pure oxygen and with sea-level pressure. Switch to the full map to see every test as a dot.</p>`;
  }
  function renderCovMode() {
    $("#cov-mode").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === covMode.m)));
    $("#cov-simple").hidden = covMode.m !== "simple";
    $("#cov-map").hidden = covMode.m !== "map";
    if (covMode.m === "simple") renderCovSimple(); else { renderCoverage(); resizeIn($("#cov-map")); }
  }
  function renderCoverage() {
    const traces = [];
    const moon = D.habitats.find((x) => x.id === "moon_base");
    traces.push({
      x: [30, 105, 105, 30, 30], y: [0.2, 0.2, moon.p_atm, moon.p_atm, 0.2], type: "scatter", mode: "lines", fill: "toself",
      fillcolor: "rgba(242,96,15,0.10)", line: { color: "rgba(251,146,60,0.6)", width: 1 }, hoverinfo: "skip",
    });
    for (const g of D.coverage.groups) {
      const fam = g.family === "polvo" ? "humo" : g.family;
      if (!covState[fam]) continue;
      const F = FAMILY[fam];
      let symbol = F.symbol;
      if (g.burner_o2) symbol += "-x";
      if (g.assumed || g.burner_o2) symbol += "-open";
      traces.push({
        x: g.x_o2.map((v) => 100 * v), y: g.p_atm, type: "scatter", mode: "markers", name: g.experiment,
        customdata: g.outcome.map((o) => OUTCOME[o] || (o ? o.replace(/_/g, " ") : "—")),
        marker: { symbol, size: g.assumed ? 9 : 7, color: F.color, opacity: g.assumed ? 0.85 : 0.78, line: { color: g.assumed || g.burner_o2 ? F.color : C.bg, width: g.assumed || g.burner_o2 ? 1.3 : 0.8 } },
        hovertemplate: `<b>${esc(g.experiment)}</b> · ${g.psi_id}<br>O₂ %{x:.1f}%${g.burner_o2 ? " (burner stream)" : ""}<br>%{y:.2f} atm${g.assumed ? " (assumed)" : ""}<br>%{customdata}<extra></extra>`,
      });
    }
    traces.push({
      x: D.habitats.map((x) => 100 * x.x_o2), y: D.habitats.map((x) => x.p_atm), type: "scatter", mode: "markers",
      text: D.habitats.map((x) => x.name),
      marker: { symbol: "cross-thin", size: 26, line: { color: C.ink, width: 2.4 } },
      customdata: D.habitats.map((x) => x.source),
      hovertemplate: "<b>%{text}</b><br>O₂ %{x:.1f}% · %{y:.2f} atm<br>%{customdata}<extra></extra>",
    });
    const offs = { cabin: [-34, -38], eva_prep: [-46, 34], moon_base: [40, -38], exploration: [64, 26], suit: [-30, -34] };
    const habNotes = D.habitats.map((x) => ({
      x: Math.log10(100 * x.x_o2), y: Math.log10(x.p_atm), text: `<b>${esc(x.name)}</b>`, showarrow: true, arrowhead: 0, arrowwidth: 1,
      arrowcolor: C.ink3, ax: offs[x.id][0], ay: offs[x.id][1], font: { size: 12, color: C.ink, family: "Geist, Inter, sans-serif" },
      bgcolor: "rgba(7,10,20,0.85)", borderpad: 3,
    }));
    const xt = [12, 15, 20, 25, 30, 40, 60, 85, 100];
    plot("cov-chart", traces, layout({
      margin: { l: 64, r: 20, t: 10, b: 54 },
      xaxis: { type: "log", range: [Math.log10(10.5), Math.log10(108)], tickvals: xt, ticktext: xt.map((v) => v + "%"), title: { text: "Oxygen in the air → more" } },
      yaxis: { type: "log", range: [Math.log10(0.22), Math.log10(5.6)], tickvals: [0.25, 0.5, 0.7, 1, 2, 3, 5], title: { text: "Air pressure, atm (1 = sea level)" } },
      annotations: [{ x: Math.log10(48), y: Math.log10(0.24), text: "LUNAR-BASE ENVELOPE · ≥30% O₂ · ≤10.2 psi", showarrow: false, font: { family: "Geist Mono, JetBrains Mono, monospace", size: 10, color: C.ink3 }, xanchor: "center" }, ...habNotes],
      hovermode: "closest",
    }));
  }

  const invState = { hab: "moon_base", layer: "All", q: "", sel: null };
  const INV = D.investigations;
  const HUI = D.habitats.filter((h) => h.id !== "suit");
  const habName = (id) => D.habitats.find((x) => x.id === id).name;
  const WPRESET = [["Default", [0.5, 0.2, 0.3]], ["Atmosphere first", [0.7, 0.1, 0.2]], ["Safety relevance first", [0.3, 0.1, 0.6]], ["Data volume first", [0.3, 0.5, 0.2]]];
  const wt = { w: [0.5, 0.2, 0.3], vol: "outcomes" };
  const volOf = (r, h) => (wt.vol === "records" ? Math.min(1, Math.log1p(r.n_tests) / Math.log1p(300)) : r.relevance[h].evidence);
  const scoreOf = (r, h) => { const q = r.relevance[h]; return 100 * (wt.w[0] * q.proximity + wt.w[1] * volOf(r, h) + wt.w[2] * q.directness); };
  let robust = {};
  function computeRobust(h) {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gam2 = () => -Math.log(rnd()) - Math.log(rnd());
    const C = INV.map((r) => [r.relevance[h].proximity, volOf(r, h), r.relevance[h].directness]);
    const cnt = new Array(INV.length).fill(0), N = 2000;
    for (let k = 0; k < N; k++) {
      const g = [gam2(), gam2(), gam2()], t = g[0] + g[1] + g[2];
      const sc = C.map((c, i) => [i, (g[0] * c[0] + g[1] * c[1] + g[2] * c[2]) / t]).sort((a, b) => b[1] - a[1]);
      for (let j = 0; j < 3; j++) cnt[sc[j][0]]++;
    }
    robust = Object.fromEntries(INV.map((r, i) => [r.psi_id, cnt[i] / N]));
  }
  function renderCriteria() {
    const names = [["Atmosphere closeness", "How many tests ran within ~3 points of O₂ and ~30% of the pressure of the habitat."], [wt.vol === "records" ? "Data volume · measured records" : "Data volume · labeled outcomes", wt.vol === "records" ? "Test records with measured results, log scale." : "Tests with a labeled outcome (went out, kept burning), log scale."], ["Fire-safety directness", "1.0 for flight tests of cabin materials, smoke and droplet fires; 0.75 for gas-flame work; 0.5 other flight, 0.35 ground."]];
    const top = [...INV].sort((a, b) => scoreOf(b, invState.hab) - scoreOf(a, invState.hab)).slice(0, 3);
    const solid = top.map((r) => robust[r.psi_id] || 0);
    $("#criteria").innerHTML = `
      <div class="crit__w">
        <div class="crit__top"><p class="label">Ranking criteria · ${esc(habName(invState.hab))}</p><div class="seg seg--wrap" id="w-pre">${WPRESET.map(([n, w]) => `<button type="button" data-w="${w.join(",")}" aria-pressed="${w.every((v, i) => Math.abs(v - wt.w[i]) < 1e-6)}">${n}</button>`).join("")}</div></div>
        ${names.map(([n, d], i) => `<div class="slider"><div class="top"><label for="w-${i}">${n}</label><output>${Math.round(100 * wt.w[i])}%</output></div><input type="range" id="w-${i}" min="0" max="100" step="5" value="${Math.round(100 * wt.w[i])}"><p class="crit__d">${d}</p></div>`).join("")}
        <div class="controls-row" style="margin:14px 0 0"><span class="mono-sm">Data volume counts</span><div class="seg" id="w-vol"><button type="button" data-v="outcomes" aria-pressed="${wt.vol === "outcomes"}">Labeled outcomes</button><button type="button" data-v="records" aria-pressed="${wt.vol === "records"}">All measured records</button></div></div>
      </div>
      <div class="crit__r">
        <p class="label">Does the answer hold?</p>
        <p class="crit__big">${top.map((r, i) => `<span><b>${esc(r.name)}</b><small>top 3 in ${Math.round(100 * solid[i])}% of weightings</small></span>`).join("")}</p>
        <p class="note">We re-ranked with 2,000 random weightings of the three criteria. A high share means the place does not depend on our choice of weights. Smoke studies (SAME, SAME-R) and ACME BRE have no labeled outcomes, so “labeled outcomes” scores them zero on data volume; switch to “all measured records” to see their measured data count.</p>
      </div>`;
    document.querySelectorAll("#criteria input[type=range]").forEach((el, i) => el.addEventListener("input", () => {
      const v = +el.value / 100, rest = 1 - v, others = [0, 1, 2].filter((k) => k !== i), sum = others.reduce((a, k) => a + wt.w[k], 0);
      wt.w[i] = v; others.forEach((k) => { wt.w[k] = sum > 0 ? (rest * wt.w[k]) / sum : rest / 2; });
      rerankSoon();
    }));
    document.querySelectorAll("#w-pre button").forEach((b) => b.addEventListener("click", () => { wt.w = b.dataset.w.split(",").map(Number); rerank(); }));
    document.querySelectorAll("#w-vol button").forEach((b) => b.addEventListener("click", () => { wt.vol = b.dataset.v; computeRobust(invState.hab); rerank(); }));
  }
  let rrT = null;
  function rerankSoon() {
    document.querySelectorAll("#criteria input[type=range]").forEach((el, k) => { el.value = Math.round(100 * wt.w[k]); el.previousElementSibling.querySelector("output").textContent = `${Math.round(100 * wt.w[k])}%`; });
    clearTimeout(rrT); rrT = setTimeout(() => { renderInvList(); safe(renderCompare, "compare"); }, 60);
  }
  function rerank() { renderCriteria(); renderInvList(); safe(renderCompare, "compare"); }
  function renderInvControls() {
    $("#inv-habitat").innerHTML = HUI.map((x) => `<button aria-pressed="${x.id === invState.hab}" data-h="${x.id}">${esc(x.name)}</button>`).join("");
    $("#inv-layer").innerHTML = ["All", "Prevention", "Detection", "Suppression"].map((l) => `<button aria-pressed="${l === invState.layer}" data-l="${l}">${l}</button>`).join("");
    document.querySelectorAll("#inv-habitat button").forEach((b) => b.addEventListener("click", () => { invState.hab = b.dataset.h; invState.sel = null; computeRobust(invState.hab); renderInvControls(); renderCriteria(); renderInvList(); safe(renderCompare, "compare"); }));
    document.querySelectorAll("#inv-layer button").forEach((b) => b.addEventListener("click", () => { invState.layer = b.dataset.l; renderInvControls(); renderInvList(); }));
  }
  function filteredInv() {
    const q = invState.q.trim().toLowerCase();
    return INV.filter((r) => invState.layer === "All" || r.layers.includes(invState.layer))
      .filter((r) => !q || [r.name, r.title, r.psi_id, r.pi, r.family, r.hardware, ...(r.keywords || [])].join(" ").toLowerCase().includes(q))
      .sort((a, b) => scoreOf(b, invState.hab) - scoreOf(a, invState.hab));
  }
  function renderInvList() {
    const rows = filteredInv();
    invState.rows = rows;
    $("#inv-mode").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === invMode.m)));
    $("#inv-gallery").hidden = invMode.m !== "gallery";
    $("#inv-chart-wrap").hidden = invMode.m !== "chart";
    $("#inv-count").textContent = invMode.m === "gallery" ? `${rows.length} shown · open any card for its full file` : `${rows.length} shown · click a bar to open its card`;
    if (invMode.m === "gallery") renderInvGallery(rows); else { $("#inv-more-wrap").hidden = true; safe(() => renderInvChart(rows), "investigation chart"); }
  }
  const invMode = { m: "gallery" };
  const POSTER = { "PSI-25": "assets/video/bass2-rod-22.jpg", "PSI-159": "assets/video/cfig-butane-39.jpg", "PSI-39": "assets/video/more/flex-f208d02.jpg", "PSI-23": "assets/video/more/sflame-20029j1.jpg", "PSI-107": "assets/video/more/spice-62-1127.jpg" };
  const ART = { "Solid materials": "solid", "Fuel droplets": "drop", "Gas flames": "gas", "Smoke & dust": "smoke" };
  const CRIT = [["Atmosphere closeness", C.orange], ["Data volume", C.blue], ["Fire-safety directness", C.violet]];
  const critVals = (r, h) => [r.relevance[h].proximity, volOf(r, h), r.relevance[h].directness];
  const visOf = (r) => (POSTER[r.psi_id] ? `<img src="${POSTER[r.psi_id]}" alt="" loading="lazy"><span class="ig__src">Flight video</span>` : `<span class="ig__art ig__art--${ART[r.family] || "gas"}"></span>`);
  function renderInvGallery(rows) {
    const hab = invState.hab;
    const lim = innerWidth < 700 ? 4 : 8;
    $("#inv-more-wrap").hidden = invMode.m !== "gallery" || rows.length <= lim;
    $("#inv-more").textContent = invState.all ? "Show fewer" : `Show all ${rows.length}`;
    $("#inv-gallery").innerHTML = (invState.all ? rows : rows.slice(0, lim)).map((r, i) => {
      const s = scoreOf(r, hab), rel = r.relevance[hab], inCmp = cmpState.ids.includes(r.psi_id);
      return `<article class="ig${i < 3 ? " is-top" : ""}${r.type === "Ground" ? " is-ground" : ""}" data-id="${r.psi_id}" tabindex="0" role="button" aria-label="Open ${esc(r.name)}">
        <span class="ig__vis">${visOf(r)}<span class="ig__top"><span>${esc(r.family)}</span><span>#${i + 1} · ${r.psi_id}</span></span></span>
        <span class="ig__body"><b>${esc(r.name)}</b><span class="ig__t">${esc(r.title)}</span>
          <span class="ig__rel"><span>Relevance</span><span class="ig__bar">${critVals(r, hab).map((v, k) => `<i style="width:${100 * wt.w[k] * v}%;background:${CRIT[k][1]}"></i>`).join("")}</span><span class="ig__n">${Math.round(s)}</span></span>
          <span class="ig__meta"><span>${r.n_tests.toLocaleString("en-US")} records</span><span>${rel.n_near >= 1 ? `≈${Math.round(rel.n_near)} near your air` : "none near your air"}</span></span>
          <span class="ig__act"><span class="ig__open">Open file →</span><button type="button" class="ig__cmp" data-cmp="${r.psi_id}" aria-pressed="${inCmp}">${inCmp ? "✓ In comparison" : "+ Compare"}</button></span></span></article>`;
    }).join("") || '<p class="note">No investigation matches.</p>';
    document.querySelectorAll("#inv-gallery .ig").forEach((b) => {
      b.addEventListener("click", (e) => { if (e.target.closest(".ig__cmp")) return; openInv(b.dataset.id); });
      b.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".ig__cmp")) { e.preventDefault(); openInv(b.dataset.id); } });
    });
    document.querySelectorAll("#inv-gallery .ig__cmp").forEach((b) => b.addEventListener("click", () => { toggleCmp(b.dataset.cmp); renderInvGallery(invState.rows || rows); }));
  }
  function toggleCmp(id) {
    if (cmpState.ids.includes(id)) cmpState.ids = cmpState.ids.map((x) => (x === id ? "" : x));
    else { const k = cmpState.ids.indexOf(""); if (k >= 0) cmpState.ids[k] = id; else cmpState.ids = [...cmpState.ids.slice(1), id]; }
    while (cmpState.ids.length < 3) cmpState.ids.push("");
    safe(renderCompare, "compare");
  }
  function renderInvChart(rows) {
    const hab = invState.hab, R = [...rows].reverse();
    $("#inv-chart-legend").innerHTML = CRIT.map(([n, c], k) => legendItem("bar", c, `${n} · weight ${Math.round(100 * wt.w[k])}%`)).join("");
    const lab = (r) => `${r.name}  #${rows.indexOf(r) + 1}`;
    const traces = CRIT.map(([n, c], k) => ({
      type: "bar", orientation: "h", name: n, y: R.map(lab), x: R.map((r) => 100 * wt.w[k] * critVals(r, hab)[k]), customdata: R.map((r) => r.psi_id),
      marker: { color: R.map((r) => (rows.indexOf(r) < 3 ? c : c + "aa")), line: { width: 0 } },
      hovertemplate: `<b>%{y}</b><br>${n}: %{x:.1f} points<extra></extra>`,
    }));
    traces.push({ type: "scatter", mode: "text", y: R.map(lab), x: R.map((r) => scoreOf(r, hab) + 2.5), text: R.map((r) => scoreOf(r, hab).toFixed(0)), textposition: "middle right", textfont: { family: "Geist Mono, monospace", size: 11, color: C.ink2 }, hoverinfo: "skip", showlegend: false });
    plot("inv-chart", traces, layout({ barmode: "stack", height: Math.max(320, 28 * R.length + 70), margin: { l: 150, r: 30, t: 6, b: 40 }, showlegend: false, bargap: 0.28,
      xaxis: { range: [0, 100], title: { text: "Relevance score (0–100)" } }, yaxis: { type: "category", tickfont: { size: 12, color: C.ink2 }, gridcolor: "rgba(0,0,0,0)" } }));
    const el = $("#inv-chart");
    if (el.removeAllListeners) el.removeAllListeners("plotly_click");
    el.on && el.on("plotly_click", (ev) => { const p = ev.points && ev.points[0]; if (p && p.customdata) openInv(p.customdata); });
  }
  function airStrip(lo, hi, kind, color = C.orange) {
    const hab = D.habitats;
    const pos = kind === "o2" ? (v) => Math.max(0, Math.min(100, ((v - 0.1) / 0.9) * 100)) : (v) => Math.max(0, Math.min(100, ((Math.log(v) - Math.log(0.2)) / (Math.log(5.5) - Math.log(0.2))) * 100));
    const band = lo == null ? "" : `<i class="as__band" style="left:${pos(lo)}%;width:${Math.max(1.2, pos(hi) - pos(lo))}%;background:${color}"></i>`;
    const ticks = hab.filter((h) => kind === "o2" || h.p_atm >= 0.2).map((h) => `<span class="as__h${h.id === invState.hab ? " is-on" : ""}" style="left:${pos(kind === "o2" ? h.x_o2 : h.p_atm)}%" title="${esc(h.name)}"></span>`).join("");
    const ends = kind === "o2" ? ["10%", "100% O₂"] : ["0.2", "5 atm"];
    return `<div class="as"><div class="as__t">${band}${ticks}</div><div class="as__e"><span>${ends[0]}</span><span>${ends[1]}</span></div></div>`;
  }
  function openInv(id) {
    const rows = invState.rows || filteredInv();
    const r = INV.find((x) => x.psi_id === id);
    if (!r) return;
    const hab = invState.hab, rel = r.relevance[hab], i = rows.findIndex((x) => x.psi_id === id), rb = robust[r.psi_id];
    const vals = critVals(r, hab), s = scoreOf(r, hab), inCmp = cmpState.ids.includes(r.psi_id);
    const vary = [...new Set(r.tables.flatMap((t) => t.varied.map((v) => v.variable)))], meas = [...new Set(r.tables.flatMap((t) => t.measured.map((v) => v.variable)))];
    const chips = (xs, n = 10) => (xs.length ? `<div class="chips">${xs.slice(0, n).map((x) => `<span>${esc(x)}</span>`).join("")}${xs.length > n ? `<span class="more">+${xs.length - n}</span>` : ""}</div>` : '<p class="note">Not in a PSI table.</p>');
    const pubs = r.publications.length ? `<div class="pubs">${r.publications.slice(0, 3).map((p) => `<div>${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}<small>${esc((p.authors || "").split(",").slice(0, 3).join(","))}${(p.authors || "").split(",").length > 3 ? " et al." : ""}</small></div>`).join("")}</div>` : '<p class="note">No publications listed in PSI.</p>';
    const prev = i > 0 ? rows[i - 1] : null, next = i >= 0 && i < rows.length - 1 ? rows[i + 1] : null;
    $("#inv-modal-body").innerHTML = `
      <button class="modal__x" type="button" data-close aria-label="Close">✕</button>
      <header class="im__hero">
        <div class="im__vis">${visOf(r)}</div>
        <div class="im__head">
          <div class="tags">${r.layers.map((l) => `<span class="tag solid layer-${l}">${l}</span>`).join("")}<span class="tag">${r.type}</span><span class="tag">${esc(r.family)}</span></div>
          <h3 id="im-title">${esc(r.name)} <small>${r.psi_id}</small></h3>
          <p class="im__ttl">${esc(r.title)}</p>
          <div class="im__rank"><span class="im__pos">#${i + 1}<small>of ${rows.length}</small></span><span><small>Ranked for</small><br><b>${esc(habName(hab))}</b><br><small>${rb != null ? `top 3 in ${Math.round(100 * rb)}% of 2,000 random weightings` : ""}</small></span></div>
        </div>
      </header>
      <div class="im__stats">
        <div><b>${r.n_tests.toLocaleString("en-US")}</b><span>test records</span></div>
        <div><b>${r.n_with_outcome}</b><span>with a labeled outcome</span></div>
        <div><b>${rel.n_near >= 1 ? `≈${Math.round(rel.n_near)}` : "0"}</b><span>near ${esc(habName(hab))} air</span></div>
        <div><b>${r.n_publications}</b><span>publications in PSI</span></div>
      </div>
      <div class="im__grid">
        <section>
          <p class="label">Why it ranks here · ${s.toFixed(1)} / 100</p>
          <div class="im__score">${vals.map((v, k) => `<i style="width:${100 * wt.w[k] * v}%;background:${CRIT[k][1]}"></i>`).join("")}</div>
          <div class="im__crit">${vals.map((v, k) => `<div><span class="dot" style="background:${CRIT[k][1]}"></span><span>${CRIT[k][0]}</span><span class="im__cb"><i style="width:${100 * v}%;background:${CRIT[k][1]}"></i></span><b>${v.toFixed(2)}</b><small>× ${wt.w[k].toFixed(2)}</small></div>`).join("")}</div>
          <p class="label" style="margin-top:22px">Air it tested · against crew atmospheres</p>
          <div class="im__air"><span>Oxygen</span>${airStrip(r.o2_min, r.o2_max, "o2")}<span>Pressure</span>${airStrip(r.p_min, r.p_max, "p")}</div>
          <p class="note">${r.o2_min != null ? `${pct(r.o2_min, 1)}–${pct(r.o2_max, 1)} O₂ · ${num(r.p_min)}–${num(r.p_max)} atm${r.conditions_assumed ? " (cabin air assumed)" : ""}.` : "Oxygen and pressure are not reported per test."} White ticks: crew atmospheres; the bright one is ${esc(habName(hab))}.</p>
                  <p class="label" style="margin-top:22px">What they changed</p>${chips(vary)}
          <p class="label" style="margin-top:18px">What they measured</p>${chips(meas)}
        </section>
        <section>
          <p class="label">What NASA set out to learn</p>
          <p class="obj">${esc(r.objective || "No objective text in PSI metadata.")}</p>
          ${SI && SI.investigation[r.psi_id] ? `<div class="si-sum">${badge(SI.investigation[r.psi_id])}<p>${sentencesHtml(SI.investigation[r.psi_id], "inv")}</p>${evidenceHtml(SI.investigation[r.psi_id], "inv")}</div>` : ""}
          <div class="meta">
            <div><span>Science team</span><b>${esc(r.pi || "—")}</b></div>
            <div><span>Platform</span><b>${esc(r.platform)}</b></div>
            <div><span>Hardware</span><b>${esc(r.hardware)}</b></div>
          </div>
        </section>
      </div>
      ${r.earth_benefit ? `<p class="label">Benefit on Earth · from PSI</p><p class="obj">${esc(r.earth_benefit)}</p>` : ""}
      <p class="label">Publications · ${r.n_publications} listed in PSI</p>${pubs}
      <div class="links">
        <a class="btn btn--fire btn--sm" href="${r.psi_url}" target="_blank" rel="noopener">Open in NASA PSI <span aria-hidden="true">↗</span></a>
        ${r.doi ? `<a class="btn btn--line btn--sm" href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">Dataset DOI ↗</a>` : ""}
        <button class="btn btn--line btn--sm" type="button" data-cmp-add>${inCmp ? "✓ In comparison · view" : "+ Add to comparison"}</button>
      </div>
      <nav class="im__nav">${prev ? `<button type="button" class="btn btn--line btn--sm" data-go="${prev.psi_id}">← #${i} ${esc(prev.name)}</button>` : "<span></span>"}${next ? `<button type="button" class="btn btn--line btn--sm" data-go="${next.psi_id}">#${i + 2} ${esc(next.name)} →</button>` : ""}</nav>`;
    const dlg = $("#inv-modal"), body = $("#inv-modal-body");
    wireCites(body);
    body.querySelector("[data-close]").addEventListener("click", () => dlg.close());
    body.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => openInv(b.dataset.go)));
    body.querySelector("[data-cmp-add]").addEventListener("click", () => {
      if (!cmpState.ids.includes(r.psi_id)) toggleCmp(r.psi_id);
      dlg.close(); if (invMode.m === "gallery") renderInvGallery(invState.rows || rows);
      document.getElementById("compare").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
    body.scrollTop = 0; dlg.scrollTop = 0;
  }
  const SL = [
    { k: "o2", label: "Oxygen", min: 0.10, max: 1.0, step: 0.005, fmt: (v) => `${(100 * v).toFixed(1)}%`, ticks: ["10%", "40%", "70%", "100%"] },
    { k: "p", label: "Pressure", min: 0.25, max: 3.2, step: 0.005, fmt: (v) => `${v.toFixed(2)} atm<small>${(v * ATM_PSI).toFixed(1)} psi</small>`, ticks: ["0.25", "1.0", "2.0", "3.2 atm"] },
    { k: "co2", label: "CO₂ diluent", min: 0, max: 0.7, step: 0.01, fmt: (v) => `${(100 * v).toFixed(0)}%`, ticks: ["0%", "35%", "70%"] },
    { k: "he", label: "Helium diluent", min: 0, max: 0.45, step: 0.01, fmt: (v) => `${(100 * v).toFixed(0)}%`, ticks: ["0%", "20%", "45%"] },
    { k: "d0", label: "Initial droplet diameter", min: 1.1, max: 4.7, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm`, ticks: ["1.1", "2.9", "4.7 mm"] },
  ];
  const sc = { fuel: "Methanol", o2: 0.30, p: 0.694, co2: 0, he: 0, d0: M.d0_median, preset: "moon_base" };
  function renderScenarioControls() {
    $("#presets").innerHTML = HUI.map((x) => `<button data-h="${x.id}" aria-pressed="${sc.preset === x.id}">${esc(x.name)}<span>${o2pct(x.x_o2)} · ${num(x.p_atm * ATM_PSI, 1)} psi</span></button>`).join("");
    document.querySelectorAll("#presets button").forEach((b) => b.addEventListener("click", () => setPreset(b.dataset.h)));
    $("#fuel-seg").innerHTML = ["Methanol", "Heptane"].map((f) => `<button aria-pressed="${sc.fuel === f}" data-f="${f}">${f}</button>`).join("");
    document.querySelectorAll("#fuel-seg button").forEach((b) => b.addEventListener("click", () => { sc.fuel = b.dataset.f; renderScenarioControls(); updateScenario(true); }));
    if (!$("#sliders").children.length) {
      $("#sliders").innerHTML = SL.map((s) => `<div class="slider"><div class="top"><label for="sl-${s.k}">${s.label}</label><output id="out-${s.k}"></output></div>
        <input type="range" id="sl-${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${sc[s.k]}">
        <div class="ticks">${s.ticks.map((t) => `<span>${t}</span>`).join("")}</div></div>`).join("") +
        `<p class="note" id="mix-note"></p>`;
      SL.forEach((s) => $(`#sl-${s.k}`).addEventListener("input", (e) => {
        let v = parseFloat(e.target.value);
        if (["o2", "co2", "he"].includes(s.k)) {
          const others = ["o2", "co2", "he"].filter((k) => k !== s.k).reduce((a, k) => a + sc[k], 0);
          if (v + others > 1) { v = Math.max(s.min, 1 - others); e.target.value = v; }
        }
        sc[s.k] = v; sc.preset = null; renderPresetsPressed(); updateScenario(s.k !== "o2" && s.k !== "p");
      }));
    }
    syncSliders();
  }
  function renderPresetsPressed() { document.querySelectorAll("#presets button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.h === sc.preset)); }
  function syncSliders() {
    SL.forEach((s) => { $(`#sl-${s.k}`).value = sc[s.k]; $(`#out-${s.k}`).innerHTML = s.fmt(sc[s.k]); });
    const n2 = Math.max(0, 1 - sc.o2 - sc.co2 - sc.he);
    $("#mix-note").textContent = `Balance gas: ${(100 * n2).toFixed(0)}% nitrogen. O₂ + CO₂ + He is capped at 100%.`;
  }
  function setPreset(id) {
    const hb = D.habitats.find((x) => x.id === id);
    Object.assign(sc, { o2: hb.x_o2, p: hb.p_atm, co2: 0, he: 0, preset: id });
    renderScenarioControls(); updateScenario(true);
  }
  function updateScenario(remap) {
    syncSliders();
    const x = featVec(sc);
    const r = predict(x);
    const { s: st, nn, beyond } = dataStatus(x);
    const thr = M.ood_threshold;
    let status, show = true;
    if (st === "within") status = `<span class="status"><span class="dot"></span>Within flight data</span>`;
    else if (st === "extrapolating") status = `<span class="status warn" title="${beyond.length ? `${esc(beyondTxt(beyond))} outside every flown FLEX test` : "far from the nearest flown tests"}"><span class="dot"></span>Extrapolating${beyond.length ? ` · ${esc(beyondTxt(beyond))} beyond flown range` : ""} · use with caution</span>`;
    else { status = `<span class="status out"><span class="dot"></span>Outside flight data · prediction withheld</span>`; show = false; }
    syncUrl();
    $("#r-status").innerHTML = status;
    const big = $("#r-big");
    big.textContent = show ? pct(r.p) : "—";
    big.classList.toggle("muted", !show);
    const dil = [sc.co2 ? `${(100 * sc.co2).toFixed(0)}% CO₂` : "", sc.he ? `${(100 * sc.he).toFixed(0)}% He` : ""].filter(Boolean).join(" + ") || "no diluent";
    $("#r-cap").innerHTML = show
      ? `<b>About ${100 - Math.round(100 * r.p)} of 100 droplet fires like this keep burning.</b><br>${sc.fuel} droplet, d₀ ${sc.d0.toFixed(2)} mm · ${(100 * sc.o2).toFixed(1)}% O₂ · ${(sc.p * ATM_PSI).toFixed(1)} psi (${sc.p.toFixed(2)} atm) · ${dil}`
      : `No ISS test was flown near this atmosphere (distance ${nn.dist.toFixed(1)}; predictions are withheld beyond ${(2 * thr).toFixed(1)}, twice the out-of-data limit). This gap is itself a finding — see “Next experiment”.`;
    $("#r-ci").style.left = `${100 * r.lo}%`; $("#r-ci").style.width = `${Math.max(1, 100 * (r.hi - r.lo))}%`;
    $("#r-pt").style.left = `${100 * r.p}%`;
    $("#r-ci").style.opacity = show ? 1 : 0.25; $("#r-pt").style.opacity = show ? 1 : 0.25;
    $("#r-int").textContent = show ? `90% interval ${pct(r.lo)}–${pct(r.hi)} · ${BOOT.length} bootstrap models` : "Interval not shown outside the data";
    const rows = nn.near.map((n) => {
      const t = M.train[n.i];
      return `<tr><td class="mono">${esc(t.fecha || "—")}</td><td>${esc(t.combustible)}</td><td class="num">${(100 * t.x_o2).toFixed(0)}%</td><td class="num">${num(t.p_atm)}</td><td class="num">${(100 * t.x_co2).toFixed(0)}%</td><td class="num">${(100 * t.x_he).toFixed(0)}%</td><td class="num">${num(t.d0_mm)}</td><td>${OUTCOME[t.resultado] || "—"}</td></tr>`;
    }).join("");
    $("#nn-table").innerHTML = `<thead><tr><th>Date</th><th>Fuel</th><th class="num">O₂</th><th class="num">atm</th><th class="num">CO₂</th><th class="num">He</th><th class="num">d₀ mm</th><th>Outcome</th></tr></thead><tbody>${rows}</tbody>`;
    $("#nn-note").textContent = `Mean distance to the 5 nearest tests: ${nn.dist.toFixed(2)} (out-of-data limit ${thr.toFixed(2)}, the 95th percentile among flown tests).`;
    renderMap(remap);
    syncLab3d(r, show, st);
  }
  const viz = { view: "fires", clickBound: false };
  const PSI = (atm) => atm * ATM_PSI;
  const PSI_TICKS = [4.4, 7.3, 10.2, 14.7, 22, 29.4, 44];
  function statusAt(x) { const nn = neighbors(x), thr = M.ood_threshold; return nn.dist > thr || outOfRange(x).length ? (nn.dist > 2 * thr ? "outside" : "extrapolating") : "within"; }
  function renderVizControls() {
    $("#viz-seg").innerHTML = [["fires", "100 fires"], ["curve", "Oxygen curve"], ["map", "Map · oxygen × pressure"]].map(([k, l]) => `<button type="button" aria-pressed="${viz.view === k}" data-v="${k}">${l}</button>`).join("");
    document.querySelectorAll("#viz-seg button").forEach((b) => b.addEventListener("click", () => { viz.view = b.dataset.v; renderVizControls(); renderMap(true); }));
  }
  function renderMap() {
    if (!$("#viz-seg").children.length) renderVizControls();
    const dil = [sc.co2 ? `${(100 * sc.co2).toFixed(0)}% CO₂` : "", sc.he ? `${(100 * sc.he).toFixed(0)}% helium` : ""].filter(Boolean).join(" + ") || "no suppressant";
    const el = $("#map-chart");
    if (viz.view === "fires") { if (hasPlotly && el.classList.contains("js-plotly-plot")) Plotly.purge(el); el.classList.add("chart--html"); renderFires(dil); return; }
    if (el.classList.contains("chart--html")) { el.classList.remove("chart--html"); el.innerHTML = ""; viz.clickBound = false; }
    if (viz.view === "curve") renderCurve(dil); else renderRiskMap(dil);
  }
  function renderFires(dil) {
    const x = featVec(sc), r = predict(x), stt = statusAt(x);
    $("#viz-label").textContent = "Out of 100 fires like this…";
    $("#map-legend").innerHTML = [legendItem("circle", "#7dd3fc", "Goes out on its own"), legendItem("circle", C.orange, "Keeps burning"), legendItem("circle", "rgba(203,213,225,.35)", "Could go either way (90% range)")].join("");
    const o2s = []; for (let o = 0.10; o <= 0.401; o += 0.01) o2s.push(+o.toFixed(2));
    const ps = o2s.map((o) => { const xx = featVec({ ...sc, o2: o }); return { o, p: predict(xx).p, st: statusAt(xx) }; });
    let cross = null; for (let i = 1; i < ps.length; i++) if (ps[i - 1].p >= 0.5 && ps[i].p < 0.5) { cross = ps[i - 1].o + 0.01 * (ps[i - 1].p - 0.5) / (ps[i - 1].p - ps[i].p); break; }
    const pos = (o) => `${(100 * (o - 0.10)) / 0.30}%`;
    const habs = D.habitats.filter((h) => h.x_o2 <= 0.4);
    const ladder = `<div class="ladder">
        <div class="ladder__bar">${ps.map((q) => `<i style="background:${q.st === "outside" ? "rgba(148,163,184,.25)" : `color-mix(in srgb, #7dd3fc ${Math.round(100 * q.p)}%, ${C.orange})`}"></i>`).join("")}
          ${cross ? `<span class="ladder__x" style="left:${pos(cross)}"><b>50/50 at ≈${(100 * cross).toFixed(0)}% O₂</b></span>` : ""}
          <span class="ladder__you" style="left:${pos(Math.min(0.4, sc.o2))}"></span></div>
        <div class="ladder__ticks">${habs.map((h) => `<span style="left:${pos(h.x_o2)}">${esc(h.name)}<small>${o2pct(h.x_o2)}</small></span>`).join("")}</div>
        <p class="note">Oxygen scale at ${PSI(sc.p).toFixed(1)} psi with ${esc(dil)}: blue where most fires go out on their own, orange where most keep burning. The white mark is your scenario.${cross ? ` Above about ${(100 * cross).toFixed(0)}% O₂, most fires like this keep burning.` : ""}</p>
      </div>`;
    if (stt === "outside") {
      $("#viz-sub").textContent = `${sc.fuel} droplet, ${(100 * sc.o2).toFixed(1)}% O₂, ${PSI(sc.p).toFixed(1)} psi, ${dil}.`;
      $("#map-chart").innerHTML = `<div class="fires fires--off"><p><b>No flight data near this air.</b> NASA never flew a droplet fire close to it, so the model does not guess.</p></div>${ladder}`;
      $("#viz-note").textContent = "";
      return;
    }
    const nOut = Math.round(100 * r.p), lo = Math.round(100 * r.lo), hi = Math.round(100 * r.hi);
    const cells = Array.from({ length: 100 }, (_, i) => (i < lo ? "o" : i < nOut ? "ou" : i < hi ? "ku" : "k"));
    $("#viz-sub").textContent = `${sc.fuel} droplet, ${(100 * sc.o2).toFixed(1)}% O₂, ${PSI(sc.p).toFixed(1)} psi, ${dil}. Each dot is one fire.`;
    $("#map-chart").innerHTML = `<div class="fires">
        <div class="fires__grid">${cells.map((c) => `<i class="${c}"></i>`).join("")}</div>
        <div class="fires__txt"><span class="fires__k">${100 - nOut}</span><span>keep burning and must be detected and put out</span>
          <span class="fires__o">${nOut}</span><span>go out on their own</span>
          <span class="mono-sm">The model is ${stt === "within" ? "inside" : "near the edge of"} NASA's flight data: the real number could be anywhere from ${100 - hi} to ${100 - lo} fires that keep burning.</span></div>
      </div>${ladder}`;
    $("#viz-note").textContent = "";
  }
  function renderCurve(dil) {
    const xmax = Math.max(0.40, Math.min(1, sc.o2 + 0.05)), xs = [];
    for (let v = 0.10; v <= xmax + 1e-9; v += 0.0025) xs.push(+v.toFixed(4));
    const pts = xs.map((o) => { const x = featVec({ ...sc, o2: o }); return { o, ...predict(x), st: statusAt(x) }; });
    const ok = pts.map((q) => q.st !== "outside");
    const seg = (f) => pts.map((q, i) => (ok[i] ? f(q) : null));
    const shapes = [
      { type: "rect", xref: "x", yref: "y", x0: 10, x1: 100 * xmax, y0: 0.5, y1: 1, fillcolor: "rgba(15,157,143,0.07)", line: { width: 0 }, layer: "below" },
      { type: "rect", xref: "x", yref: "y", x0: 10, x1: 100 * xmax, y0: 0, y1: 0.5, fillcolor: "rgba(242,96,15,0.07)", line: { width: 0 }, layer: "below" },
      { type: "line", xref: "x", yref: "y", x0: 10, x1: 100 * xmax, y0: 0.5, y1: 0.5, line: { color: C.ink4, width: 1, dash: "dot" } },
    ];
    const bands = [];
    let i = 0;
    while (i < pts.length) {
      if (pts[i].st === "within") { i++; continue; }
      let j = i; while (j + 1 < pts.length && pts[j + 1].st !== "within") j++;
      shapes.push({ type: "rect", xref: "x", yref: "paper", x0: 100 * pts[i].o, x1: 100 * pts[j].o, y0: 0, y1: 1, fillcolor: "rgba(148,163,184,0.10)", line: { width: 0 }, layer: "below" });
      bands.push([100 * pts[i].o, 100 * pts[j].o]);
      i = j + 1;
    }
    const here = predict(featVec(sc)), hereSt = statusAt(featVec(sc));
    const same = D.habitats.filter((h) => Math.abs(Math.log(h.p_atm / sc.p)) < 0.08 && h.x_o2 <= xmax);
    const ann = [
      { x: 10.4, y: 0.97, xanchor: "left", yanchor: "top", text: "GOES OUT ON ITS OWN", showarrow: false, font: { family: "Geist Mono, monospace", size: 10.5, color: "#5eead4" } },
      { x: 10.4, y: 0.03, xanchor: "left", yanchor: "bottom", text: innerWidth < 700 ? "KEEPS BURNING" : "KEEPS BURNING · NEEDS DETECTION AND SUPPRESSION", showarrow: false, font: { family: "Geist Mono, monospace", size: 10.5, color: C.orange } },
      ...same.map((h, k) => ({ x: 100 * h.x_o2, y: 1.0, yref: "y", text: esc(h.name), showarrow: false, yanchor: "bottom", xanchor: same.length > 1 ? (k === 0 ? "right" : "left") : "center", font: { size: 11, color: C.ink2 } })),
    ];
    bands.filter(([a, b]) => b - a >= 1).forEach(([a, b]) => ann.push({ x: (a + b) / 2, y: 0.5, text: "NO FLIGHT DATA", textangle: -90, showarrow: false, font: { family: "Geist Mono, monospace", size: 10, color: C.ink3 } }));
    same.forEach((h) => shapes.push({ type: "line", xref: "x", yref: "y", x0: 100 * h.x_o2, x1: 100 * h.x_o2, y0: 0, y1: 1, line: { color: C.line2, width: 1, dash: "dot" } }));
    $("#viz-label").textContent = "Will a droplet fire go out on its own?";
    $("#viz-sub").textContent = `${sc.fuel} droplet at ${PSI(sc.p).toFixed(1)} psi (${sc.p.toFixed(2)} atm), ${dil}. The line is the model's best estimate; the band is its 90% range. Move the oxygen slider or pick a habitat.`;
    $("#map-legend").innerHTML = [legendItem("line", C.amber, "Chance it goes out on its own"), legendItem("bar", "rgba(251,191,36,0.3)", "90% range"), legendItem("bar", "rgba(148,163,184,0.35)", "No flight data"), legendItem("circle", C.ink, "Your scenario")].join("");
    $("#viz-note").textContent = "Above the dotted 50% line, most fires like this put themselves out; below it, most keep burning. Grey bands are atmospheres no FLEX flight test came close to.";
    plot("map-chart", [
      { x: pts.map((q) => 100 * q.o), y: seg((q) => q.hi), type: "scatter", mode: "lines", line: { width: 0 }, hoverinfo: "skip", connectgaps: false },
      { x: pts.map((q) => 100 * q.o), y: seg((q) => q.lo), type: "scatter", mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: "rgba(251,191,36,0.20)", hoverinfo: "skip", connectgaps: false },
      { x: pts.map((q) => 100 * q.o), y: seg((q) => q.p), type: "scatter", mode: "lines", line: { color: C.amber, width: 2.5 }, connectgaps: false,
        customdata: pts.map((q) => [q.lo, q.hi]), hovertemplate: "O₂ %{x:.1f}%<br>goes out on its own: %{y:.0%}<br>90% range %{customdata[0]:.0%}–%{customdata[1]:.0%}<extra></extra>" },
      { x: [100 * sc.o2], y: [hereSt === "outside" ? 0.5 : here.p], type: "scatter", mode: "markers+text", text: [hereSt === "outside" ? "withheld" : pct(here.p)], textposition: "top right", textfont: { family: "Geist Mono, monospace", size: 12, color: C.ink },
        marker: { size: 13, color: hereSt === "outside" ? C.bg : C.ink, line: { color: C.orange, width: 3 } }, hoverinfo: "skip" },
    ], layout({
      margin: { l: 56, r: 16, t: 26, b: 48 }, shapes, annotations: ann,
      xaxis: { range: [10, 100 * xmax], ticksuffix: "%", title: { text: "Oxygen in the air" }, gridcolor: C.line },
      yaxis: { range: [0, 1.05], tickformat: ".0%", tickvals: [0, 0.25, 0.5, 0.75, 1], title: { text: "Chance it goes out on its own" } },
    }));
  }
  function renderRiskMap(dil) {
    const o2 = [], p = [];
    for (let i = 0; i <= 60; i++) o2.push(0.10 + i * 0.005);
    for (let j = 0; j <= 40; j++) p.push(Math.exp(Math.log(0.3) + (j * (Math.log(3.2) - Math.log(0.3))) / 40));
    const base = (oo, pp) => [sc.fuel === "Heptane" ? 1 : 0, oo, Math.log(pp), sc.co2, sc.he, sc.d0];
    const risk = p.map((pp) => o2.map((oo) => 1 - pointEstimate(stdz(base(oo, pp)))));
    const gap = p.map((pp) => o2.map((oo) => (statusAt(base(oo, pp)) === "within" ? null : 1)));
    const tr = M.train;
    const habs = D.habitats.filter((x) => x.x_o2 <= 0.4);
    $("#viz-label").textContent = "Fire risk map";
    $("#viz-sub").textContent = `${sc.fuel} droplet, ${dil}. Brighter means the fire is more likely to keep burning. Click anywhere on the map to test that atmosphere.`;
    $("#map-legend").innerHTML = [legendItem("line", "#fff", "50% line: half of fires go out"), legendItem("bar", "rgba(148,163,184,0.45)", "No flight data"), legendItem("circle", C.ink2, "Flown FLEX test"), legendItem("cross", C.ink, "Your scenario")].join("");
    $("#viz-note").textContent = "Dark areas: most fires put themselves out. Bright areas: most keep burning and must be detected and suppressed. Grey veil: no FLEX flight test came close, so the colours there are extrapolation.";
    const y = p.map(PSI);
    const el = plot("map-chart", [
      { z: risk, x: o2.map((v) => 100 * v), y, type: "heatmap", zmin: 0, zmax: 1, zsmooth: "best",
        colorscale: [[0, "#0b0c0f"], [0.3, "#3b1d6e"], [0.55, "#e11d48"], [0.78, "#f97316"], [1, "#fde68a"]],
        colorbar: { thickness: 8, outlinewidth: 0, tickformat: ".0%", tickfont: { family: "Geist Mono, monospace", size: 10, color: C.ink3 }, len: 0.85, title: { text: "keeps burning", side: "right", font: { size: 10.5, color: C.ink3 } } },
        hovertemplate: "O₂ %{x:.1f}% · %{y:.1f} psi<br>keeps burning: %{z:.0%}<br><i>click to test</i><extra></extra>" },
      { z: gap, x: o2.map((v) => 100 * v), y, type: "heatmap", zmin: 0, zmax: 1, showscale: false, hoverinfo: "skip", colorscale: [[0, "rgba(148,163,184,0.42)"], [1, "rgba(148,163,184,0.42)"]] },
      { z: risk, x: o2.map((v) => 100 * v), y, type: "contour", showscale: false, hoverinfo: "skip", contours: { start: 0.5, end: 0.5, size: 1, coloring: "none" }, line: { color: "#ffffff", width: 1.6, dash: "dash" } },
      { x: tr.map((t) => 100 * t.x_o2), y: tr.map((t) => PSI(t.p_atm)), type: "scatter", mode: "markers", marker: { size: 4, color: "rgba(241,245,249,0.75)" }, hoverinfo: "skip" },
      { x: habs.map((h) => 100 * h.x_o2), y: habs.map((h) => PSI(h.p_atm)), type: "scatter", mode: "markers+text", text: habs.map((h) => h.name), textposition: habs.map((h) => (h.id === "cabin" ? "top center" : h.id === "eva_prep" ? "bottom left" : h.id === "exploration" ? "bottom right" : "top right")),
        textfont: { size: 11.5, color: C.ink }, marker: { symbol: "diamond", size: 9, color: C.ink, line: { color: C.bg, width: 1.5 } }, hoverinfo: "skip" },
      { x: [100 * sc.o2], y: [PSI(sc.p)], type: "scatter", mode: "markers", hoverinfo: "skip", marker: { symbol: "cross-thin", size: 24, color: C.ink, line: { color: C.ink, width: 3 } } },
    ], layout({
      margin: { l: 56, r: 8, t: 8, b: 48 },
      xaxis: { range: [10, 40], ticksuffix: "%", title: { text: "Oxygen in the air" }, gridcolor: "rgba(0,0,0,0)" },
      yaxis: { type: "log", range: [Math.log10(PSI(0.3)), Math.log10(PSI(3.2))], tickvals: PSI_TICKS, title: { text: "Cabin pressure, psi" }, gridcolor: "rgba(0,0,0,0)" },
    }));
    if (el && !viz.clickBound) {
      viz.clickBound = true;
      el.on("plotly_click", (ev) => {
        if (viz.view !== "map" || !ev.points.length) return;
        const pt = ev.points[0];
        sc.o2 = Math.min(1 - sc.co2 - sc.he, Math.max(0.1, Math.round(pt.x * 2) / 200));
        sc.p = Math.min(3.2, Math.max(0.25, +(pt.y / ATM_PSI).toFixed(3)));
        sc.preset = null; renderPresetsPressed(); updateScenario(true);
      });
    }
  }
  function renderDrivers() {
    const d = [...M.drivers].reverse();
    plot("drivers-chart", [{
      x: d.map((r) => r.coef), y: d.map((r) => r.label), type: "scatter", mode: "markers",
      error_x: { type: "data", symmetric: false, array: d.map((r) => r.hi - r.coef), arrayminus: d.map((r) => r.coef - r.lo), color: C.ink3, thickness: 1.5, width: 0 },
      marker: { size: 11, color: d.map((r) => (r.lo > 0 ? C.blue : r.hi < 0 ? C.orange : C.ink4)), line: { color: C.bg, width: 2 } },
      customdata: d.map((r) => [r.lo, r.hi]),
      hovertemplate: "<b>%{y}</b><br>effect %{x:+.2f}<br>90% CI %{customdata[0]:+.2f} to %{customdata[1]:+.2f}<extra></extra>",
    }], layout({
      margin: { l: 10, r: 18, t: 6, b: 40 },
      xaxis: { zeroline: true, zerolinecolor: C.ink4, zerolinewidth: 1, title: { text: "← keeps burning · standardized effect · self-extinguishes →" } },
      yaxis: { tickfont: { family: "Geist, Inter, sans-serif", size: 12, color: C.ink2 }, gridcolor: "rgba(0,0,0,0)" },
    }));
  }

  function renderEvidence() {
    const B = D.o2_bands;
    const segs = [["extincion", "Self-extinguished", C.blue], ["disrupcion", "Droplet disrupted", C.amber], ["completo", "Burned to completion", C.orange]];
    $("#band-legend").innerHTML = segs.map(([, l, c]) => legendItem("bar", c, l)).join("");
    plot("band-chart", segs.map(([k, l, c]) => ({
      y: B.map((b) => `${b.band} O₂`), x: B.map((b) => b[k] / b.n), type: "bar", orientation: "h", name: l,
      marker: { color: c, line: { color: C.surface, width: 2 } }, customdata: B.map((b) => [b[k], b.n]),
      hovertemplate: `<b>%{y}</b> · ${l}<br>%{customdata[0]} of %{customdata[1]} tests (%{x:.0%})<extra></extra>`,
    })).concat([{ y: B.map((b) => `${b.band} O₂`), x: B.map(() => 1.02), type: "scatter", mode: "text", text: B.map((b) => `n=${b.n}`), textposition: "middle right", textfont: { family: "Geist Mono, JetBrains Mono, monospace", size: 10.5, color: C.ink3 }, hoverinfo: "skip" }]),
    layout({ barmode: "stack", bargap: 0.35, margin: { l: 10, r: 10, t: 4, b: 36 }, xaxis: { tickformat: ".0%", range: [0, 1.16], tickvals: [0, 0.25, 0.5, 0.75, 1] }, yaxis: { gridcolor: "rgba(0,0,0,0)", tickfont: { family: "Geist Mono, JetBrains Mono, monospace", size: 11, color: C.ink2 } } }));

    const S = D.suppression.co2;
    const cats = ["0%", "1–20%", "20–30%", ">30%"];
    const grp = [["Reduced pressure (0.7 atm)", C.orange, "circle", -0.12], ["≈1 atm and above", C.blue, "diamond", 0.12]];
    $("#sup-legend").innerHTML = grp.map(([n, c, s]) => legendItem(s === "circle" ? "circle" : "diamond", c, n)).join("");
    plot("sup-chart", grp.map(([name, color, symbol, off]) => {
      const rows = cats.map((c) => S.find((r) => r.pressure === name && r.co2 === c)).filter(Boolean);
      return {
        x: rows.map((r) => cats.indexOf(r.co2) + off), y: rows.map((r) => r.rate), type: "scatter", mode: "markers+lines", name,
        line: { color, width: 1.5 }, marker: { symbol, size: 11, color, line: { color: C.surface, width: 2 } },
        error_y: { type: "data", symmetric: false, array: rows.map((r) => r.ci[1] - r.rate), arrayminus: rows.map((r) => r.rate - r.ci[0]), color, thickness: 1.3, width: 0 },
        customdata: rows.map((r) => [r.k, r.n, 100 * r.o2_range[0], 100 * r.o2_range[1], r.co2]),
        hovertemplate: `<b>${name}</b> · %{customdata[4]} CO₂<br>%{customdata[0]} of %{customdata[1]} self-extinguished (%{y:.0%})<br>O₂ in these tests: %{customdata[2]:.0f}–%{customdata[3]:.0f}%<extra></extra>`,
      };
    }), layout({ margin: { l: 48, r: 12, t: 6, b: 44 }, xaxis: { tickvals: [0, 1, 2, 3], ticktext: cats, range: [-0.5, 3.5], title: { text: "CO₂ in the chamber" } }, yaxis: { tickformat: ".0%", range: [0, 1.05], title: { text: "Self-extinguished" } } }));

    const CG = D.cfig;
    const st = [["normal", "Normal flames (fuel from burner)", C.orange, "circle"], ["inverse", "Inverse flames (O₂ from burner)", C.violet, "diamond"]];
    $("#tad-legend").innerHTML = st.map(([, n, c, s]) => legendItem(s, c, n)).join("");
    const traces = [];
    for (const [typ, name, color, symbol] of st) {
      const cv = CG.curves.find((c) => c.type === typ);
      traces.push({ x: cv.tad.concat([...cv.tad].reverse()), y: cv.hi.concat([...cv.lo].reverse()), type: "scatter", fill: "toself", fillcolor: typ === "normal" ? "rgba(242,96,15,0.16)" : "rgba(139,92,246,0.14)", line: { width: 0 }, hoverinfo: "skip" });
      traces.push({ x: cv.tad, y: cv.p, type: "scatter", mode: "lines", line: { color, width: 2 }, name, hovertemplate: `${name}<br>Tad %{x:.0f} K → P %{y:.0%}<extra></extra>` });
      const pts = CG.points.filter((p) => (typ === "normal") === (p.experimento === "CFI-G normal"));
      traces.push({ x: pts.map((p) => p.tad_k), y: pts.map((p, i) => { const j = 0.012 + 0.045 * (((i * 37) % 11) / 11); return p.autoextincion ? 1 - j : j; }), type: "scatter", mode: "markers",
        marker: { symbol, size: 5, color, opacity: 0.6 }, customdata: pts.map((p) => [p.combustible, 100 * p.x_o2, p.autoextincion ? "self-extinguished" : "flow terminated"]),
        hovertemplate: "%{customdata[0]} · O₂ %{customdata[1]:.0f}%<br>Tad %{x:.0f} K · %{customdata[2]}<extra></extra>" });
    }
    const n = CG.by_type.normal;
    plot("tad-chart", traces, layout({
      margin: { l: 48, r: 12, t: 6, b: 44 }, xaxis: { title: { text: "Adiabatic flame temperature, K" } },
      yaxis: { tickformat: ".0%", range: [-0.08, 1.08], title: { text: "P(self-extinction)" } },
      shapes: n.t50 ? [{ type: "line", x0: n.t50, x1: n.t50, y0: 0, y1: 1, line: { color: C.ink3, width: 1 } }] : [],
      annotations: n.t50 ? [{ x: n.t50, y: 0.2, text: `normal flames<br>50% ≈ ${Math.round(n.t50).toLocaleString("en-US")} K`, showarrow: false, xanchor: "right", yanchor: "middle", align: "right", xshift: -8, bgcolor: "rgba(15,15,17,0.9)", font: { family: "Geist Mono, JetBrains Mono, monospace", size: 10.5, color: C.ink2 } }] : [],
    }));
    const inv = CG.by_type.inverse;
    $("#tad-note").innerHTML = `<b>Hypothesis test.</b> Normal flames: self-extinction rises as flame temperature drops (AUC ${n.metrics.auc.toFixed(2)}); the 50% point, ≈${Math.round(n.t50).toLocaleString("en-US")} K, lies just above the hottest flame tested (${Math.round(n.tad_max).toLocaleString("en-US")} K), so it is an extrapolation. Inverse flames: no single-temperature rule (AUC ${inv.metrics.auc.toFixed(2)}, ≈ chance). Cool flames: ${CG.ignition.cool_flames} of ${CG.ignition.tests} tests.`;

    const G = D.saffire2;
    const lab = G.map((g) => `${g.material} · ${g.muestra} · ${g.direccion.toLowerCase()}`);
    const states = ["No spread", "Partial", "Whole sample"];
    $("#grav-legend").innerHTML = [legendItem("circle", C.blue, "Microgravity (Cygnus)"), legendItem("square", C.orange, "1 g (ground)")].join("");
    const yy = (i, off) => i + off;
    const lines = G.map((g, i) => ({ x: [g.ug_estado, g.g1_estado], y: [yy(i, -0.13), yy(i, 0.13)], type: "scatter", mode: "lines", line: { color: C.line2, width: 2 }, hoverinfo: "skip" }));
    plot("grav-chart", lines.concat([
      { x: G.map((g) => g.ug_estado), y: G.map((g, i) => yy(i, -0.13)), type: "scatter", mode: "markers", marker: { symbol: "circle", size: 11, color: C.blue, line: { color: C.surface, width: 2 } }, customdata: G.map((g, i) => [lab[i], g.ug_texto]), hovertemplate: "<b>%{customdata[0]}</b><br>Microgravity: %{customdata[1]}<extra></extra>" },
      { x: G.map((g) => g.g1_estado), y: G.map((g, i) => yy(i, 0.13)), type: "scatter", mode: "markers", marker: { symbol: "square", size: 10, color: C.orange, line: { color: C.surface, width: 2 } }, customdata: G.map((g, i) => [lab[i], g.g1_texto]), hovertemplate: "<b>%{customdata[0]}</b><br>1 g: %{customdata[1]}<extra></extra>" },
    ]), layout({
      margin: { l: 10, r: 14, t: 6, b: 36 },
      xaxis: { tickvals: [0, 1, 2], ticktext: states, range: [-0.35, 2.35], tickfont: { family: "Geist, Inter, sans-serif", size: 11.5, color: C.ink2 } },
      yaxis: { tickvals: G.map((_, i) => i), ticktext: lab, autorange: "reversed", gridcolor: "rgba(0,0,0,0)", tickfont: { family: "Geist, Inter, sans-serif", size: 11, color: C.ink2 } },
    }));
    const s1 = Object.fromEntries(D.saffire1.map((r) => [String(r.direccion).trim().toLowerCase(), r.tiempo_quemado_s]));
    const worse = G.filter((g) => g.g1_estado >= g.ug_estado).length;
    $("#grav-note").innerHTML = `<b>${worse} of ${G.length}</b> samples burned as much or more in 1 g at 20 cm/s. Saffire-I, same fabric: <b>${s1.concurrent} s</b> concurrent flow vs <b>${s1.opposed} s</b> opposed. PSI has no partial-gravity data yet (LUCI, FM2); these pairs bound it only for this flow regime.`;
  }

  let findLayer = "All", findAll = false;
  function renderFindings() {
    $("#find-layer").innerHTML = ["All", "Prevention", "Detection", "Suppression"].map((l) => `<button aria-pressed="${l === findLayer}" data-l="${l}">${l}</button>`).join("");
    document.querySelectorAll("#find-layer button").forEach((b) => b.addEventListener("click", () => { findLayer = b.dataset.l; renderFindings(); }));
    const comp = [["volume", "Volume"], ["quality", "Quality"], ["agreement", "Agreement"], ["closeness", "Lunar fit"]];
    const fl = D.findings.filter((f) => findLayer === "All" || f.layer === findLayer);
    $("#find-more").hidden = fl.length <= 4;
    $("#find-more").textContent = findAll ? "Show fewer" : `Show all ${fl.length} findings`;
    $("#findings-list").innerHTML = (findAll ? fl : fl.slice(0, 4)).map((f) => `
      <article class="finding l-${f.layer}">
        <div class="sc">${Math.round(f.score)}<small>Evidence score</small></div>
        <div><span class="tag solid layer-${f.layer}">${esc(f.layer)}</span><h4>${esc(f.title)}</h4><p>${esc(f.text)}</p><div class="impl">${esc(f.implication)}</div><div class="src">Source · ${esc(f.source)}</div></div>
        <div class="mini">${comp.map(([k, l]) => `<div class="r"><span>${l}</span><span class="score"><span class="bar"><i style="width:${100 * f.components[k]}%"></i></span></span></div>`).join("")}</div>
      </article>`).join("");
  }

  const nextState = { co2: null };
  function pickLabel(k) { return `${o2pct(k.x_o2)} O₂ · ${PSI(k.p_atm).toFixed(1)} psi · ${(100 * k.x_co2).toFixed(0)}% CO₂`; }
  function gauge(frac, big, label, color, sub = "") {
    const R = 34, L = 2 * Math.PI * R * 0.75, f = Math.max(0.02, Math.min(1, frac));
    return `<div class="gauge"><svg viewBox="0 0 90 90" aria-hidden="true"><circle cx="45" cy="45" r="${R}" fill="none" stroke="rgba(203,213,225,.12)" stroke-width="7" stroke-dasharray="${L} 999" stroke-linecap="round" transform="rotate(135 45 45)"/><circle cx="45" cy="45" r="${R}" fill="none" stroke="${color}" stroke-width="7" stroke-dasharray="${L * f} 999" stroke-linecap="round" transform="rotate(135 45 45)"/></svg><b>${big}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  }
  function doubtBar(lo, hi, p, big = false) {
    return `<div class="doubt${big ? " doubt--big" : ""}"><div class="doubt__t"><i class="doubt__r" style="left:${100 * lo}%;width:${100 * (hi - lo)}%"></i><i class="doubt__p" style="left:${100 * p}%"></i></div>${big ? `<div class="doubt__s"><span>0% · it never goes out</span><span>50%</span><span>100% · always goes out</span></div>` : ""}</div>`;
  }
  function renderNext() {
    const N = D.next, k = N.picks[0];
    const asks = k.x_co2 > 0
      ? `How much CO₂ it takes to put out a ${k.fuel.toLowerCase()} fire in air close to the lunar base (${o2pct(k.x_o2)} O₂, ${PSI(k.p_atm).toFixed(1)} psi).`
      : `Whether a ${k.fuel.toLowerCase()} fire goes out on its own in air close to the lunar base.`;
    const moon = D.habitats.find((h) => h.id === "moon_base");
    $("#mission").innerHTML = `
      <div class="mission__main">
        <p class="label">Recommended flight test · #1 of ${N.picks.length}</p>
        <h3 class="mission__title">A ${esc(k.fuel.toLowerCase())} droplet fire in almost-lunar-base air, with CO₂ added.</h3>
        <div class="gauges">
          ${gauge(k.x_o2, o2pct(k.x_o2), "oxygen", "#38bdf8", `Moon base ${o2pct(moon.x_o2)}`)}
          ${gauge(k.p_atm, `${PSI(k.p_atm).toFixed(1)}`, "psi pressure", "#e2e8f0", `Moon base ${PSI(moon.p_atm).toFixed(1)}`)}
          ${gauge(k.x_co2 / 0.7, `${(100 * k.x_co2).toFixed(0)}%`, "CO₂ added", "#a78bfa", "suppressant")}
        </div>
      </div>
      <div class="mission__side">
        <p class="label">Today the model can only say</p>
        <p class="mission__q">The flame goes out on its own <b>${pct(k.interval[0])}–${pct(k.interval[1])}</b> of the time.</p>
        ${doubtBar(k.interval[0], k.interval[1], k.p_ext, true)}
        <p class="sub">That range is too wide to plan a fire response. It is the widest doubt anywhere near lunar-base air, so one flight here teaches the most.</p>
        <dl class="mission__facts">
          <div><dt>What it answers</dt><dd>${esc(asks)}</dd></div>
          <div><dt>Where to fly it</dt><dd>The FLEX droplet rig in the ISS Combustion Integrated Rack, which already burned ${D.flex.n} droplets for this model.</dd></div>
        </dl>
      </div>`;
    $("#howpick").innerHTML = [
      ["200", "models", "We trained the same model 200 times, each on a different resample of the NASA tests."],
      ["3,600", "candidate tests", "Each model is asked about 2 fuels × 20 oxygen levels (21–40%) × 15 pressures (4.4–14.7 psi) × 6 CO₂ levels."],
      ["1", "biggest disagreement", "Where the 200 answers spread the most and the air is closest to the lunar base, one flight teaches the most."],
      ["↻", "update", "After the flight, the new result goes into the data and the doubt map is redrawn."],
    ].map(([n, t, d], i) => `<div class="hp"><span class="hp__i">${String(i + 1).padStart(2, "0")}</span><b>${n}</b><span class="hp__t">${t}</span><p>${d}</p></div>`).join('<span class="hp__a" aria-hidden="true">→</span>');
    $("#cands").innerHTML = N.picks.map((q, i) => `<article class="cand${i === 0 ? " is-top" : ""}">
      <div class="cand__h"><span class="cand__n">#${i + 1}</span><span class="mono-sm">${esc(q.fuel)} droplet</span></div>
      <div class="cand__air"><span><b>${o2pct(q.x_o2)}</b>O₂</span><span><b>${PSI(q.p_atm).toFixed(1)}</b>psi</span><span><b>${(100 * q.x_co2).toFixed(0)}%</b>CO₂</span></div>
      ${doubtBar(q.interval[0], q.interval[1], q.p_ext)}
      <p class="cand__l">Goes out on its own <b>${pct(q.interval[0])}–${pct(q.interval[1])}</b> · doubt ${pct(q.uncertainty)}</p></article>`).join("");
    $("#next-table").innerHTML = `<thead><tr><th>#</th><th>Atmosphere to fly</th><th class="num">CO₂ added</th><th class="num">Goes out today</th><th class="num">Doubt</th></tr></thead><tbody>${N.picks.map((q, i) => `
      <tr${i === 0 ? ' class="hl"' : ""}><td class="mono">${i + 1}</td><td>${esc(q.fuel)} · ${o2pct(q.x_o2)} O₂ · ${PSI(q.p_atm).toFixed(1)} psi <span class="mono-sm">${q.p_atm.toFixed(2)} atm</span></td><td class="num">${(100 * q.x_co2).toFixed(0)}%</td><td class="num">${pct(q.interval[0])}–${pct(q.interval[1])}</td><td class="num">${pct(q.uncertainty)}</td></tr>`).join("")}</tbody>`;
    $("#next-note").innerHTML = `<b>Doubt</b> is the width of the 90% range. All six candidates add CO₂ near lunar-base oxygen and pressure: the open question is how much CO₂ it takes to put out a fire in the air planned for the Moon base. Score = ${esc(N.score_formula)}.`;
    const levels = [...new Set(N.picks.map((q) => q.x_co2))].sort((a, b) => a - b);
    if (nextState.co2 == null) nextState.co2 = k.x_co2;
    $("#unc-co2").innerHTML = levels.map((c) => `<button type="button" aria-pressed="${c === nextState.co2}" data-c="${c}">${(100 * c).toFixed(0)}% CO₂</button>`).join("");
    document.querySelectorAll("#unc-co2 button").forEach((b) => b.addEventListener("click", () => { nextState.co2 = +b.dataset.c; renderNext(); }));
    if ($("#unc-details").open) renderUncMap();
  }
  function renderUncMap() {
    const N = D.next, c = nextState.co2, d0 = M.d0_median;
    const go2 = [], gp = [];
    for (let v = 0.15; v <= 0.40 + 1e-9; v += 0.01) go2.push(+v.toFixed(3));
    for (let j = 0; j <= 30; j++) gp.push(Math.exp(Math.log(0.3) + (j * (Math.log(1.4) - Math.log(0.3))) / 30));
    const z = gp.map((pp) => go2.map((oo) => (oo + c > 0.95 ? null : (() => { const r = predict([0, oo, Math.log(pp), c, 0, d0]); return r.hi - r.lo; })())));
    const on = N.picks.map((q, i) => ({ ...q, i })).filter((q) => Math.abs(q.x_co2 - c) < 1e-9);
    const off = N.picks.map((q, i) => ({ ...q, i })).filter((q) => Math.abs(q.x_co2 - c) >= 1e-9);
    const habs = D.habitats.filter((x) => x.x_o2 <= 0.4 && x.p_atm <= 1.4);
    plot("unc-chart", [
      { z, x: go2.map((v) => 100 * v), y: gp.map(PSI), type: "heatmap", zsmooth: "best", zmin: 0, zmax: 0.6,
        colorscale: [[0, "#0b0c0f"], [0.5, "#5b21b6"], [1, "#ddd6fe"]],
        colorbar: { thickness: 8, outlinewidth: 0, tickformat: ".0%", tickfont: { family: "Geist Mono, monospace", size: 10, color: C.ink3 }, len: 0.85, title: { text: "doubt", side: "right", font: { size: 10.5, color: C.ink3 } } },
        hovertemplate: `O₂ %{x:.0f}% · %{y:.1f} psi · ${(100 * c).toFixed(0)}% CO₂<br>doubt (90% range) %{z:.0%}<extra></extra>` },
      { x: habs.map((h) => 100 * h.x_o2), y: habs.map((h) => PSI(h.p_atm)), type: "scatter", mode: "markers+text", text: habs.map((h) => h.name), textposition: "top center", textfont: { size: 11, color: C.ink2 }, marker: { symbol: "diamond", size: 8, color: C.ink }, hoverinfo: "skip" },
      { x: off.map((q) => 100 * q.x_o2), y: off.map((q) => PSI(q.p_atm)), type: "scatter", mode: "markers+text", text: off.map((q) => String(q.i + 1)), textposition: "middle center", textfont: { family: "Geist Mono, monospace", size: 9, color: C.ink3 },
        marker: { size: 16, color: "rgba(0,0,0,0)", line: { color: C.ink4, width: 1.2 } }, hovertemplate: "Candidate %{text} (other CO₂ level)<extra></extra>" },
      { x: on.map((q) => 100 * q.x_o2), y: on.map((q) => PSI(q.p_atm)), type: "scatter", mode: "markers+text", text: on.map((q) => String(q.i + 1)), textposition: "middle center", textfont: { family: "Geist Mono, monospace", size: 10, color: "#fff" },
        marker: { size: 20, color: C.orange, line: { color: C.bg, width: 2 } }, hovertemplate: `Candidate %{text} · ${(100 * c).toFixed(0)}% CO₂<extra></extra>` },
    ], layout({
      margin: { l: 56, r: 8, t: 8, b: 48 },
      xaxis: { range: [15, 40], ticksuffix: "%", title: { text: "Oxygen in the air" }, gridcolor: "rgba(0,0,0,0)" },
      yaxis: { type: "log", tickvals: PSI_TICKS, title: { text: "Cabin pressure, psi" }, gridcolor: "rgba(0,0,0,0)" },
    }));
  }
  const RES = {
    psi: ["PSI Data Repository: Combustion Science", "https://psi.nasa.gov/physci/repo/search?q=combustion", "The data source: all 24 investigations are downloaded, cleaned and modelled from it."],
    cs: ["NASA Combustion Science", "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/", "Linked as background; the investigation profiles themselves are built from PSI metadata and tables."],
    cast: ["NASA ScienceCasts: The Power of Studying Combustion on the ISS", "https://www.youtube.com/watch?v=W1oXykoz9zg", "Linked from the undergraduate path as a first introduction."],
    guide: ["A Researcher's Guide to ISS Combustion Science", "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/", "Linked as NASA's overview of the ISS experiments whose data sit in PSI."],
    a1: ["Apollo 1", "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1", "Why oxygen-enriched cabins matter (Why it matters)."],
    a13: ["Apollo 13", "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13", "Oxygen-system fire risk (Why it matters)."],
    mir: ["25 Years Ago: Fire Aboard Space Station Mir", "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/", "Oxygen-generator fire in orbit (Why it matters)."],
    tanks: ["Fireman's Air Tanks", "https://spinoff.nasa.gov/node/9582", "Spacesuit technology in firefighting (On Earth)."],
    detector: ["Fire Detector", "https://spinoff.nasa.gov/node/9407", "Smoke versus dust discrimination, linked to SAME, SAME-R and DAFT (On Earth)."],
    attire: ["New Technology for the Fire Attire", "https://spinoff.nasa.gov/node/9918", "Spacesuit materials in firefighter clothing (On Earth)."],
  };
  const CHALLENGE_URL = "https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/";
  function renderHistory() {
    const S = D.solids;
    const ev = [
      ["2026", "Artemis II", "A smoke alarm went off about 80,000 miles from Earth. As the commander put it, it gets everyone's attention.", CHALLENGE_URL, "Challenge brief"],
      ["1997", "Mir", "A fire caused by an oxygen generator failure erupted aboard the station during joint operations.", RES.mir[1], "NASA history"],
      ["1970", "Apollo 13", "An oxygen tank exploded on the way to the Moon; the crew survived a life-threatening flight home.", RES.a13[1], "NASA lessons learned"],
      ["1967", "Apollo 1", `Fire erupted in the oxygen-filled spacecraft during a pre-launch test and the crew died. Today, no solid material has burned in orbit above ${S.max_o2_any_solid_pct}% O₂.`, RES.a1[1], "NASA lessons learned"],
    ];
    $("#history").innerHTML = ev.map(([y, n, d, u, s]) => `<li><span class="yr">${y}</span><div><b>${esc(n)}</b><p>${esc(d)}</p><a class="src-link" href="${u}" target="_blank" rel="noopener">${esc(s)} ↗</a></div></li>`).join("");
  }
  function renderSolids() {
    const S = D.solids, B = S.boundary;
    $("#solid-facts").innerHTML = [
      [`${S.min_o2_pct}%`, `lowest O₂ for a lasting PMMA flame in orbit, against ${S.g1_upward_limit_pct}% in the normal-gravity upward test`],
      [`${S.min_flow_cm_s[0].toFixed(1)}–${S.min_flow_cm_s[1].toFixed(1)}`, "cm/s: the gentle breeze where solids burn at the lowest oxygen, typical of spacecraft flows near surfaces"],
      [`${S.ignition_limit_pct}%`, `O₂ needed to ignite a rod; once lit, flames survived down to ${S.lowest_final_o2_rods_pct}%`],
      [`${S.max_o2_any_solid_pct}%`, `highest O₂ in which any solid has burned in orbit (${S.n_solid_tests} flight tests); the Moon base will be at 30%+`],
    ].map(([v, l]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join("");
    const u = B.flow_cm_s, o = B.o2_pct;
    const inT = u.map((v, i) => (B.tested[i] ? o[i] : null)), outT = u.map((v, i) => (!B.tested[i] || i === B.tested.lastIndexOf(true) ? o[i] : null));
    const xr = [0.3, 300], yr = [12, 36];
    const vis = u.map((v, i) => v >= xr[0] && v <= xr[1]);
    const X = u.filter((_, i) => vis[i]), Y = o.filter((_, i) => vis[i]);
    const habs = D.habitats.filter((h) => h.x_o2 < 1);
    $("#solid-legend").innerHTML = [legendItem("line", C.amber, "NASA boundary (tested range)"), legendItem("line", C.ink3, "Extrapolated"), legendItem("bar", "rgba(242,96,15,0.35)", "Keeps burning"), legendItem("bar", "rgba(203,213,225,0.18)", "Where BASS-II tested")].join("");
    plot("solid-map", [
      { x: X.concat([...X].reverse()), y: Y.concat(X.map(() => yr[1])), type: "scatter", fill: "toself", fillcolor: "rgba(242,96,15,0.13)", line: { width: 0 }, hoverinfo: "skip" },
      { x: u, y: outT, type: "scatter", mode: "lines", line: { color: C.ink3, width: 2, dash: "dash" }, hoverinfo: "skip", connectgaps: false },
      { x: u, y: inT, type: "scatter", mode: "lines", line: { color: C.amber, width: 3 }, connectgaps: false, hovertemplate: "airflow %{x:.1f} cm/s<br>flame survives above %{y:.1f}% O₂<extra></extra>" },
    ], layout({
      margin: { l: 52, r: 150, t: 10, b: 48 },
      xaxis: { type: "log", range: xr.map(Math.log10), tickvals: [0.3, 1, 2, 5, 10, 20, 50, 100, 200], title: { text: "Airflow past the sample, cm/s (log)" } },
      yaxis: { range: yr, ticksuffix: "%", title: { text: "Oxygen in the air" } },
      shapes: [
        { type: "rect", x0: xr[0], x1: S.tested_flow_cm_s[1], y0: S.tested_o2_pct[0], y1: S.tested_o2_pct[1], line: { color: C.line2, width: 1, dash: "dot" }, fillcolor: "rgba(203,213,225,0.06)", layer: "below" },
        { type: "line", x0: xr[0], x1: xr[1], y0: S.g1_upward_limit_pct, y1: S.g1_upward_limit_pct, line: { color: "#7dd3fc", width: 1.2, dash: "dot" } },
        ...habs.map((h) => ({ type: "line", x0: xr[0], x1: xr[1], y0: 100 * h.x_o2, y1: 100 * h.x_o2, line: { color: h.id === "moon_base" ? C.orange : C.line2, width: h.id === "moon_base" ? 1.6 : 1 } })),
      ],
      annotations: [
        ...habs.map((h) => ({ x: 1, xref: "paper", xanchor: "left", y: 100 * h.x_o2, text: ` ${esc(h.name)} ${o2pct(h.x_o2)}`, showarrow: false, font: { size: 10.5, color: h.id === "moon_base" ? C.orange : C.ink3 } })),
        { x: 1, xref: "paper", xanchor: "left", y: S.g1_upward_limit_pct, text: ` 1 g test limit ${S.g1_upward_limit_pct}%`, showarrow: false, font: { size: 10.5, color: "#7dd3fc" } },
        { x: Math.log10(2.1), y: S.min_o2_pct - 0.35, text: `lowest point ≈ 2 cm/s, ${S.min_o2_pct}% O₂`, showarrow: false, yanchor: "top", font: { family: "Geist Mono, monospace", size: 10, color: C.amber } },
        { x: Math.log10(0.45), y: 34.5, xanchor: "left", text: "KEEPS BURNING", showarrow: false, font: { family: "Geist Mono, monospace", size: 10.5, color: C.orange } },
        { x: Math.log10(250), y: 12.7, xanchor: "right", text: "FLAME GOES OUT", showarrow: false, font: { family: "Geist Mono, monospace", size: 10.5, color: "#5eead4" } },
      ],
    }));
    $("#solid-note").innerHTML = `Equation: ${esc(B.equation)} · ${esc(S.source)}, ${esc(B.page)}. Above about ${S.tested_o2_pct[1]}% O₂ and beyond ${S.tested_flow_cm_s[1]} cm/s no solid was flown, so the dashed line and every habitat above cabin air are extrapolation.`;
    const fams = [["PMMA rod", C.orange, "circle"], ["PMMA slab", C.amber, "square"], ["PMMA thin film", C.violet, "diamond"], ["SIBAL fabric", C.blue, "triangle-up"]];
    $("#solid-co-legend").innerHTML = fams.map(([f, c, s]) => legendItem(s === "square" ? "square" : s === "diamond" ? "diamond" : s === "triangle-up" ? "tri" : "circle", c, f)).join("");
    plot("solid-co", fams.map(([f, c, s]) => {
      const pts = S.points.filter((q) => q.family === f && q.co_produced_ppm != null);
      return { x: pts.map((q) => q.o2_initial_pct), y: pts.map((q) => q.co_produced_ppm), type: "scatter", mode: "markers", name: f,
        marker: { symbol: s, size: 9, color: c, opacity: 0.85, line: { color: C.bg, width: 1 } }, customdata: pts.map((q) => [q.test, q.material]),
        hovertemplate: "<b>%{customdata[0]}</b> · %{customdata[1]}<br>O₂ %{x:.1f}% · CO +%{y:.0f} ppm<extra></extra>" };
    }), layout({ margin: { l: 56, r: 12, t: 10, b: 48 }, xaxis: { ticksuffix: "%", title: { text: "Oxygen when the sample was lit" } }, yaxis: { title: { text: "CO added, ppm" } } }));
    $("#solid-co-note").innerHTML = `PMMA rods: median <b>${Math.round(S.co_rods_low_o2_median_ppm)} ppm</b> of CO below 17% O₂ (${S.n_rods_low} tests) against <b>${Math.round(S.co_rods_high_o2_median_ppm)} ppm</b> above 20% (${S.n_rods_high} tests), consistent with the BASS-II report: near the limit flames run fuel-rich. Three final-O₂ readings in NASA's table (0.6–1.6%) are physically impossible in the 250 L glovebox and are excluded (see the quality log).`;
    $("#solid-hab").innerHTML = `<thead><tr><th>Habitat</th><th class="num">O₂</th><th>In still air</th><th class="num">Burns up to an airflow of</th><th>Data status</th></tr></thead><tbody>${S.habitats.map((h) => `<tr${h.habitat === "moon_base" ? ' class="hl"' : ""}><td>${esc(h.name)}</td><td class="num">${o2pct(h.o2_pct / 100)}</td><td>${h.burns_in_still_air ? "Keeps burning" : "Goes out"}</td><td class="num">≈ ${Math.round(h.blowoff_flow_cm_s)} cm/s</td><td>${h.o2_pct > S.tested_o2_pct[1] ? '<span class="status warn"><span class="dot"></span>Extrapolated O₂ and flow</span>' : '<span class="status warn"><span class="dot"></span>O₂ tested · flow extrapolated</span>'}</td></tr>`).join("")}</tbody>`;
    $("#solid-hab-note").textContent = `Read from NASA's boundary for a ${B.rod_radius_cm} cm PMMA rod at 1 atm: with no forced airflow the boundary sits at ${S.zero_flow_o2_pct}% O₂, below every habitat. The habitats run at lower pressure, which BASS-II never tested; this is why solid-material flammability at ≥30% O₂ and ≤10.2 psi is the flight test the data asks for. The spacesuit (100% O₂) is far outside any solid test.`;
  }
  function renderEarth() {
    const n = D.solids.n_earth_benefit;
    const items = [
      ["Smoke or dust?", "A 1970s shuttle smoke detector learned to tell smoke from dust, cutting nuisance alarms; it found use in mining. In PSI, SAME and SAME-R measured real smoke in orbit and DAFT measured dust with one of the same instruments: the data a detector needs to tell them apart.", RES.detector, "#evidence"],
      ["Firefighter air tanks", "In the 1970s, spacesuit technology was adapted to improve firefighters' air tanks and breathing gear.", RES.tanks, ""],
      ["Protective clothing", "Spacesuit materials improved firefighter clothing in the 1980s. BASS-II shows why material tests should include weak airflow, where fabrics and plastics burn at lower oxygen.", RES.attire, "#solids"],
      ["Water mist and suppression", "Fine-water-mist extinguishers developed for the ISS have practical applications on Earth. FLEX measured how diluting the air with CO₂ or helium puts droplet fires out.", ["Challenge brief", CHALLENGE_URL], "#evidence"],
      ["Benefits listed by NASA", `${n === 24 ? "All 24" : `${n} of the 24`} investigations list a benefit on Earth in PSI; each investigation profile quotes it in NASA's own words.`, ["PSI Data Repository", RES.psi[1]], "#investigations"],
    ];
    $("#earth-list").innerHTML = items.map(([t, d, r, go]) => `<article class="earth__item"><h4>${esc(t)}</h4><p>${esc(d)}</p><div class="earth__links"><a class="src-link" href="${r[1]}" target="_blank" rel="noopener">${esc(r[0])} ↗</a>${go ? `<a class="src-link" href="${go}">See the data →</a>` : ""}</div></article>`).join("");
    $("#resources").innerHTML = Object.values(RES).map(([t, u, how]) => `<a class="dl dl--stack" href="${u}" target="_blank" rel="noopener"><span><span class="mono-sm">${esc(t)}</span><small>${esc(how)}</small></span><span class="arrow">↗</span></a>`).join("");
  }
  const QC_CATS = [
    ["dup", "Duplicate or empty rows", /duplicate|repeated|share identifier|Empty rows/i, "#f97316"],
    ["phys", "Physically impossible values", /impossible|cannot|Negative|far (below|above)|fell during|larger than|do not sum|sensor range|zero offset/i, "#f43f5e"],
    ["sheet", "Spreadsheet artifacts", /auto-increment|Spreadsheet error|percent of a percent|en dash|placeholder|written with '~'|note written|Loss-of-signal|Text note|ramped|decimal point/i, "#a78bfa"],
    ["contra", "Contradictions inside a record", /yet the same row|implies a gas density|earlier than the ignition|Composite sample|Two thicknesses/i, "#fbbf24"],
    ["label", "Labels, IDs and dates", /capitalization|spaces|written two ways|Spelling|label|date formats|transposed|disagree|as-run|sphere|same fuel|non-sample|not a recognizable/i, "#38bdf8"],
  ];
  const qcState = { cat: "all" };
  const qcCat = (q) => (QC_CATS.find((c) => c[2].test(q.regla)) || ["other"])[0];
  const qcCells = (q) => { if (/Empty rows/.test(q.regla)) return 0; const m = /^(\d+) rows/.exec(q.registro) || /\((\d+) (?:rows|cells)\)/.exec(q.regla + " " + q.registro); if (m) return +m[1]; return q.registro.includes(",") ? q.registro.split(",").length : 1; };
  function renderQC() {
    const all = D.qc, cells = all.reduce((s, q) => s + qcCells(q), 0);
    const psis = new Set(all.map((q) => q.psi_id.split("/")[0])).size;
    $("#qc-sub").textContent = `${all.length} logged corrections and flags · about ${cells.toLocaleString("en-US")} records or cells affected · ${psis} NASA tables. Each row keeps the original value.`;
    const cnt = (k) => all.filter((q) => qcCat(q) === k).length;
    $("#qc-cats").innerHTML = `<button type="button" data-c="all" aria-pressed="${qcState.cat === "all"}"><b>${all.length}</b>All</button>` + QC_CATS.map(([k, n, , col]) => `<button type="button" data-c="${k}" aria-pressed="${qcState.cat === k}" style="--c:${col}"><b>${cnt(k)}</b>${n}</button>`).join("") + (cnt("other") ? `<button type="button" data-c="other" aria-pressed="${qcState.cat === "other"}"><b>${cnt("other")}</b>Other</button>` : "");
    document.querySelectorAll("#qc-cats button").forEach((b) => b.addEventListener("click", () => { qcState.cat = b.dataset.c; renderQC(); }));
    const rows = all.filter((q) => qcState.cat === "all" || qcCat(q) === qcState.cat);
    $("#qc-table").innerHTML = `<thead><tr><th>PSI</th><th>Experiment</th><th>Record</th><th>Field</th><th>Original</th><th>New</th><th>Rule</th></tr></thead><tbody>${rows.map((q) => `<tr><td class="mono">${esc(q.psi_id)}</td><td>${esc(q.experimento)}</td><td class="mono">${esc(q.registro)}</td><td>${esc(q.campo)}</td><td class="mono">${esc(q.valor_original)}</td><td class="mono">${esc(q.valor_nuevo)}</td><td>${esc(q.regla)}</td></tr>`).join("")}</tbody>`;
  }
  function renderQuality() {
    const S = D.summary;
    const steps = [
      ["Bronze", "NASA PSI API", "Public metadata + experimental tables for the 24 Combustion Science investigations, fetched without login."],
      ["Silver", `${S.records.toLocaleString("en-US")} records`, `One schema, SI units, outcomes normalized; ${S.qc_fixes} corrections logged with the original value.`],
      ["Gold", "Analytic tables", "Unified tests, 24 investigation profiles, similarity matrix, habitat ranking, findings with evidence scores."],
      ["Models", "Validated ML", "FLEX logistic + 200-model bootstrap, CFI-G temperature test, out-of-data detector, active-learning picks."],
      ["Dashboard", "This page", "Static site; the models run in the browser, so every slider is a live prediction."],
    ];
    $("#pipe").innerHTML = steps.map(([k, t, d], i) => `<li class="st"><div class="k">${String(i + 1).padStart(2, "0")}</div><div class="t">${k} · ${t}</div><div class="d">${d}</div></li>`).join("");
    const V = M.validation;
    $("#val-sub").textContent = V.scheme;
    $("#val-table").innerHTML = `<thead><tr><th>Model</th><th class="num">AUC ↑</th><th class="num">Brier ↓</th><th class="num">Log loss ↓</th><th class="num">Accuracy</th></tr></thead><tbody>${V.models.map((m) => `
      <tr${m.deployed ? ' class="hl"' : ""}><td>${esc(m.name)}${m.deployed ? ' <span class="tag solid">deployed</span>' : ""}</td><td class="num">${m.auc.toFixed(3)}</td><td class="num">${m.brier.toFixed(3)}</td><td class="num">${m.log_loss.toFixed(3)}</td><td class="num">${pct(m.accuracy, 1)}</td></tr>`).join("")}</tbody>`;
    const R = V.reliability;
    plot("rel-chart", [
      { x: [0, 1], y: [0, 1], type: "scatter", mode: "lines", line: { color: C.ink4, width: 1 }, hoverinfo: "skip" },
      { x: R.map((r) => r.pred), y: R.map((r) => r.obs), type: "scatter", mode: "lines+markers", line: { color: C.orange, width: 2 },
        marker: { size: R.map((r) => 7 + Math.sqrt(r.n)), color: C.amber, line: { color: C.surface, width: 2 } }, customdata: R.map((r) => r.n),
        hovertemplate: "predicted %{x:.0%} → observed %{y:.0%}<br>n = %{customdata}<extra></extra>" },
    ], layout({ margin: { l: 52, r: 14, t: 6, b: 44 }, xaxis: { tickformat: ".0%", range: [0, 1], title: { text: "Predicted P(self-extinction)" } }, yaxis: { tickformat: ".0%", range: [0, 1], title: { text: "Observed rate" } },
      annotations: [{ x: 0.25, y: 0.25, ax: 30, ay: -34, text: "perfect calibration", showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: C.ink4, xanchor: "left", font: { size: 10, color: C.ink3, family: "Geist Mono, JetBrains Mono, monospace" } }] }));
    renderQC();
    const nClips = (window.CLIPS || []).length;
    $("#mth-src").innerHTML = [
      ["NASA PSI", `${S.investigations} combustion investigations · ${S.records.toLocaleString("en-US")} records`, "Experimental tables and metadata from the Physical Sciences Informatics public API.", "https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation"],
      ["PSI flight video", `${nClips} clips`, "Raw ISS and Cygnus flight video, cropped to the flame for the archive in Flames.", "https://psi.nasa.gov/"],
      ["LOLA terrain", "5 m per pixel", "South-pole elevation maps from NASA GSFC PGDA product 78 (Barker et al. 2021) for the landing site.", "https://pgda.gsfc.nasa.gov/products/78"],
      ["CGI Moon Kit", "LROC color · LOLA relief", "NASA SVS textures for the 3D Moon.", "https://svs.gsfc.nasa.gov/4720"],
      ["JPL Horizons", "Sun and Earth every 3 h", "Where the Sun and Earth sit in the sky of the base, November 2026 to November 2027.", "https://ssd.jpl.nasa.gov/horizons/"],
      ["NASA reports", "BASS-II summary · exploration atmospheres", "Flammability boundary (NASA/TM-20210011385) and the exploration habitat atmosphere.", "https://ntrs.nasa.gov/"],
    ].map(([k, n, d, u]) => `<a class="mth-s" href="${u}" target="_blank" rel="noopener"><b>${k}</b><span>${esc(n)}</span><small>${esc(d)}</small></a>`).join("");
    $("#mth-solid").textContent = D.solids.max_o2_any_solid_pct;
    const toc = [...document.querySelectorAll("#mth-toc a")];
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) toc.forEach((a) => a.classList.toggle("is-on", a.getAttribute("href").endsWith(e.target.id))); }), { rootMargin: "-40% 0px -55% 0px" });
      document.querySelectorAll(".mth-step").forEach((x) => io.observe(x));
    }
    $("#built").innerHTML = `Pipeline run ${esc(D.generated)}<br>Python · pandas · scikit-learn · Plotly`;
  }

  const QS = new URLSearchParams(location.search);
  let urlReady = false, urlTimer = null;
  function scenarioParams() {
    const p = new URLSearchParams();
    if (sc.preset) p.set("hab", sc.preset);
    p.set("fuel", sc.fuel); p.set("o2", sc.o2.toFixed(3)); p.set("p", sc.p.toFixed(3));
    if (sc.co2) p.set("co2", sc.co2.toFixed(2));
    if (sc.he) p.set("he", sc.he.toFixed(2));
    p.set("d0", sc.d0.toFixed(2));
    if (audState.id) p.set("view", audState.id);
    return p;
  }
  function syncUrl() {
    if (!urlReady) return;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => { try { history.replaceState(null, "", `?${scenarioParams()}${location.hash}`); } catch (e) {} }, 250);
  }
  function applyUrlScenario() {
    const g = (k, lo, hi) => { const v = parseFloat(QS.get(k)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; };
    if (QS.get("hab") && HUI.some((x) => x.id === QS.get("hab"))) setPreset(QS.get("hab"));
    if (["Methanol", "Heptane"].includes(QS.get("fuel"))) sc.fuel = QS.get("fuel");
    const vals = { o2: g("o2", 0.10, 1), p: g("p", 0.25, 3.2), co2: g("co2", 0, 0.7), he: g("he", 0, 0.45), d0: g("d0", 1.1, 4.7) };
    let changed = false;
    for (const [k, v] of Object.entries(vals)) if (v != null && Math.abs(v - sc[k]) > 1e-9) { sc[k] = v; changed = true; }
    if (sc.o2 + sc.co2 + sc.he > 1) { sc.co2 = 0; sc.he = 0; }
    const qh = D.habitats.find((x) => x.id === QS.get("hab"));
    if (changed) sc.preset = qh && Math.abs(sc.o2 - qh.x_o2) < 1e-3 && Math.abs(sc.p - qh.p_atm) < 1e-3 && !sc.co2 && !sc.he ? qh.id : null;
    renderScenarioControls(); updateScenario(true);
    return QS.has("o2") || QS.has("hab");
  }
  async function copyText(t, btn) {
    const old = btn.textContent;
    try { await navigator.clipboard.writeText(t); btn.textContent = "Link copied ✓"; }
    catch (e) { window.prompt("Copy this link:", t); }
    setTimeout(() => { btn.textContent = old; }, 1800);
  }
  function shareUrl() {
    return `${location.origin}${location.pathname}?${scenarioParams()}#/lab`;
  }

  const SI = window.SI || null;
  const briefState = { hab: "moon_base" };
  const citeChip = (c, scope) => `<button class="cite" type="button" data-e="${esc(c)}" data-scope="${scope}" title="Show evidence ${esc(c)}">${esc(c)}</button>`;
  function sentencesHtml(b, scope) {
    return b.sentences.map((s) => `<span class="sent">${esc(s.text)}${s.cites.map((c) => citeChip(c, scope)).join("")}</span>`).join(" ");
  }
  function evidenceHtml(b, scope, open = false) {
    const used = new Set(b.sentences.flatMap((s) => s.cites));
    return `<details class="evid" ${open ? "open" : ""} id="evid-${scope}"><summary>Evidence behind this briefing · ${Object.keys(b.evidence).length} items computed from PSI</summary>
      <ol>${Object.entries(b.evidence).map(([k, t]) => `<li id="ev-${scope}-${k}" class="${used.has(k) ? "used" : ""}"><b>${k}</b> ${esc(t)}</li>`).join("")}</ol></details>`;
  }
  const badge = (b) => b.source === "si"
    ? `<span class="badge si" title="Written by an SI model and checked by code: citations, numbers, no safety verdicts">SI-written · verified ✓</span>`
    : `<span class="badge det" title="No verified SI draft for the current data; showing the evidence itself">Evidence brief · deterministic</span>`;
  function wireCites(root) {
    root.querySelectorAll(".cite").forEach((btn) => btn.addEventListener("click", () => {
      const det = document.getElementById(`evid-${btn.dataset.scope}`);
      if (det) det.open = true;
      const li = document.getElementById(`ev-${btn.dataset.scope}-${btn.dataset.e}`);
      if (li) { li.classList.remove("flash"); void li.offsetWidth; li.classList.add("flash"); li.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }));
  }
  function renderBrief() {
    if (!SI) { $("#brief").innerHTML = '<p class="note">SI data not found — run python -m pipeline.run.</p>'; return; }
    $("#brief-hab").innerHTML = HUI.map((x) => `<button aria-pressed="${x.id === briefState.hab}" data-h="${x.id}">${esc(x.name)}</button>`).join("");
    document.querySelectorAll("#brief-hab button").forEach((b) => b.addEventListener("click", () => { briefState.hab = b.dataset.h; renderBrief(); }));
    const b = SI.habitat[briefState.hab];
    const hb = D.habitats.find((x) => x.id === briefState.hab);
    $("#brief").innerHTML = `<div class="brief-meta">${badge(b)}<span class="mono-sm">${o2pct(hb.x_o2)} O₂ · ${num(hb.p_atm * ATM_PSI, 1)} psi</span></div>
      ${b.headline ? `<h3 class="brief-h">${esc(b.headline)}</h3>` : ""}
      <p class="brief-p">${sentencesHtml(b, "hab")}</p>${evidenceHtml(b, "hab")}`;
    wireCites($("#brief"));
  }
  function briefMarkdown() {
    const b = SI.habitat[briefState.hab], hb = D.habitats.find((x) => x.id === briefState.hab);
    const lines = [`# Fire-safety briefing: ${hb.name}`, "", `${o2pct(hb.x_o2)} O2 at ${num(hb.p_atm * ATM_PSI, 1)} psi (${num(hb.p_atm, 2)} atm). ${hb.source}.`, "",
      b.headline ? `## ${b.headline}\n` : "", ...b.sentences.map((s) => `- ${s.text} [${s.cites.join(", ")}]`), "", "## Evidence (computed from NASA PSI data)", "",
      ...Object.entries(b.evidence).map(([k, t]) => `- **${k}** ${t}`), "",
      `---`, b.source === "si" ? "Written by an SI model (Anthropic Claude) and published only after code verified every citation and number. No safety verdicts." : "Deterministic evidence brief (no verified SI draft for the current data).",
      `Skylab Phoenix · NASA Space Apps 2026 · Flame in Freefall · data: NASA Physical Sciences Informatics (CC0) · pipeline run ${D.generated}.`,
      "Research aid, not flight certification."];
    return lines.join("\n");
  }
  function download(name, text, type = "text/markdown") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  const STOP = new Set("a an and are as at be by can did do does for from has have how i in is it its of on or that the this to was were what when where which who why will with into than then there these those about after over under not no yes".split(" "));
  const SYN = { fire: ["flame", "combustion", "burn"], flame: ["fire"], suppressant: ["suppression", "extinguish", "extinguishment", "diluent", "co2", "helium"],
    suppress: ["suppression", "extinguish"], extinguish: ["extinction", "suppression"], smoke: ["aerosol", "soot", "particle"], detect: ["detection", "detector", "sensor"],
    detector: ["detection", "smoke"], moon: ["lunar"], lunar: ["moon"], mars: ["martian", "partial"], oxygen: ["o2"], o2: ["oxygen"], gravity: ["microgravity", "g"],
    material: ["solid", "fabric", "pmma"], solid: ["material"], droplet: ["fuel", "liquid"], cool: ["low-temperature"], spread: ["growth"], ventilation: ["flow", "airflow"] };
  const stem = (w) => w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
  const toks = (t) => String(t).toLowerCase().replace(/₂/g, "2").split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map(stem);
  const CORPUS = (window.CORPUS || []).map((d) => ({ ...d, tf: (() => { const m = new Map(); for (const w of [...toks(d.title), ...toks(d.title), ...toks(d.text)]) m.set(w, (m.get(w) || 0) + 1); return m; })(), len: toks(d.title).length * 2 + toks(d.text).length }));
  const AVGLEN = CORPUS.reduce((s, d) => s + d.len, 0) / Math.max(1, CORPUS.length);
  const DF = (() => { const m = new Map(); CORPUS.forEach((d) => d.tf.forEach((_, w) => m.set(w, (m.get(w) || 0) + 1))); return m; })();
  function search(q, k = 5) {
    const base = toks(q);
    const terms = new Map(base.map((w) => [w, 1]));
    base.forEach((w) => (SYN[w] || []).forEach((s) => { const t = stem(s); if (!terms.has(t)) terms.set(t, 0.5); }));
    const N = CORPUS.length;
    const scored = CORPUS.map((d) => {
      let s = 0;
      terms.forEach((wt, w) => {
        const f = d.tf.get(w); if (!f) return;
        const idf = Math.log(1 + (N - DF.get(w) + 0.5) / (DF.get(w) + 0.5));
        s += wt * idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / AVGLEN));
      });
      return { d, s };
    }).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
    return { hits: scored.slice(0, k), terms: [...terms.keys()] };
  }
  function snippet(text, terms, max = 320) {
    const sents = text.split(/(?<=[.!?])\s+/);
    let best = 0, bi = 0;
    sents.forEach((s, i) => { const t = new Set(toks(s)); const sc2 = terms.filter((w) => t.has(w)).length; if (sc2 > best) { best = sc2; bi = i; } });
    let out = sents.slice(bi, bi + 2).join(" ");
    if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, "") + "…";
    const re = new RegExp(`\\b(${terms.filter((w) => w.length > 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\w*`, "gi");
    return esc(out).replace(re, "<mark>$&</mark>");
  }
  const SUGGEST = ["Which suppressants did NASA test?", "What is a cool flame?", "Has any material burned in lunar-base air?", "Why might 1 g material screening not be conservative?",
    "How does smoke change in microgravity?", "Does airflow direction matter?"];
  function renderAsk(q) {
    $("#ask-sug").innerHTML = SUGGEST.map((s) => `<button class="chip" type="button">${esc(s)}</button>`).join("");
    document.querySelectorAll("#ask-sug .chip").forEach((b) => b.addEventListener("click", () => { $("#ask-q").value = b.textContent; renderAsk(b.textContent); }));
    if (!q) { $("#ask-out").innerHTML = `<p class="note">${CORPUS.length} passages indexed from NASA PSI investigation records, Skylab Phoenix findings, habitat definitions and a short glossary.</p>`; return; }
    const { hits, terms } = search(q);
    if (!hits.length || hits[0].s < 1.2) {
      $("#ask-out").innerHTML = `<p class="note"><b>No passage in the archive answers this well.</b> The archive covers the 24 PSI combustion investigations; try naming a fire type (droplet, solid, gas flame, smoke), a habitat, or a suppressant.</p>`;
      return;
    }
    $("#ask-out").innerHTML = hits.map(({ d }) => `<article class="hit">
        <div class="hit-top"><span class="tag">${esc(d.kind)}</span>${d.psi ? `<span class="mono-sm">${esc(d.psi)}</span>` : ""}</div>
        <h4>${esc(d.title)}</h4><p>${snippet(d.text, terms)}</p>
        ${d.url ? `<a class="src-link" href="${esc(d.url)}" ${d.url.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${d.url.startsWith("http") ? "Open the NASA PSI record ↗" : "Open in dashboard →"}</a>` : ""}
      </article>`).join("") + `<p class="note">Ranked by BM25 relevance over NASA's own text. Passages are quoted, not generated.</p>`;
  }

  const AUD = [
    { id: "undergrad", name: "Undergraduate", intro: "New to microgravity fire? Three steps, about five minutes.", link: ["Or start with NASA's 4-minute video: The Power of Studying Combustion on the ISS ↗", "https://www.youtube.com/watch?v=W1oXykoz9zg"], steps: [
      ["Read the lunar-base briefing", "Each sentence has a citation; click one to see the number behind it.", { brief: "moon_base", go: "#briefing" }],
      ["Raise the oxygen yourself", "Start from cabin air and move the oxygen slider to 30%: watch the chance that the flame puts itself out collapse.", { preset: "cabin", go: "#scenario" }],
      ["Look up a term", "Ask the archive “What is a cool flame?”: a flame you can barely see.", { ask: "What is a cool flame?", go: "#briefing" }]] },
    { id: "grad", name: "Graduate student", intro: "Find the investigation and data that fit your thesis question.", steps: [
      ["Rank investigations for your habitat", "Relevance is a transparent formula; every score shows its parts.", { go: "#investigations" }],
      ["Compare side by side", "Hardware, conditions, variables and outcomes of up to three investigations.", { go: "#compare" }],
      ["Download the unified tables", `${D.summary.records.toLocaleString("en-US")} tests in SI units with a logged correction trail.`, { go: "#quality" }]] },
    { id: "professor", name: "Professor", intro: "Teaching material with the evidence attached.", steps: [
      ["Coverage map", "Where NASA has flown fire versus where crews will live: a one-slide lecture.", { go: "#coverage" }],
      ["Raw evidence charts", "Outcomes with sample sizes and intervals, ready for a problem set.", { go: "#evidence" }],
      ["Findings ranked by evidence", "Each with its source investigation and an evidence score you can discuss.", { go: "#findings" }]] },
    { id: "researcher", name: "Aerospace researcher", intro: "Methods, validation and the open questions.", steps: [
      ["Validation and calibration", "Grouped by test day, against gradient boosting and baselines.", { go: "#quality" }],
      ["What NASA should fly next", "Active learning on the bootstrap ensemble near lunar-base air.", { go: "#next" }],
      ["Search NASA's text", "Objectives, hypotheses and publications of all 24 investigations.", { ask: "Which suppressants did NASA test?", go: "#briefing" }]] },
    { id: "engineer", name: "Aerospace engineer", intro: "A design-review view of your cabin atmosphere.", steps: [
      ["Brief for the exploration atmosphere", "8.2 psi, 34% O₂: what the data says and where it stops. Download it as Markdown.", { brief: "exploration", go: "#briefing" }],
      ["Run your own atmosphere", "Set O₂, pressure and diluents; copy a link that reopens the exact case.", { preset: "exploration", go: "#scenario" }],
      ["Design implications", "Detection, suppression and ventilation implications, each traced to a source.", { go: "#findings" }]] },
  ];
  const audState = { id: QS.get("view") && AUD.some((a) => a.id === QS.get("view")) ? QS.get("view") : "undergrad" };
  function renderAudience() {
    $("#aud-seg").innerHTML = AUD.map((a) => `<button aria-pressed="${a.id === audState.id}" data-a="${a.id}">${a.name}</button>`).join("");
    document.querySelectorAll("#aud-seg button").forEach((b) => b.addEventListener("click", () => { audState.id = b.dataset.a; renderAudience(); syncUrl(); }));
    const a = AUD.find((x) => x.id === audState.id);
    $("#aud-path").innerHTML = `<p class="aud-intro">${esc(a.intro)}${a.link ? ` <a class="src-link" href="${a.link[1]}" target="_blank" rel="noopener">${esc(a.link[0])}</a>` : ""}</p><ol class="steps">${a.steps.map(([t, d], i) => `<li><button type="button" class="step" data-i="${i}"><span class="n">${i + 1}</span><span><b>${esc(t)}</b><small>${esc(d)}</small></span><span class="arrow">→</span></button></li>`).join("")}</ol>`;
    document.querySelectorAll("#aud-path .step").forEach((b) => b.addEventListener("click", () => {
      const act = a.steps[+b.dataset.i][2];
      if (act.brief) { briefState.hab = act.brief; renderBrief(); }
      if (act.preset) { ensure("lab"); setPreset(act.preset); }
      if (act.ask) { $("#ask-q").value = act.ask; renderAsk(act.ask); }
      go(act.go);
    }));
  }

  const cmpState = { ids: ["PSI-69", "PSI-25", "PSI-99"] };
  const CMPC = ["#f97316", "#38bdf8", "#a78bfa"];
  function renderCmpVisual(R, hab) {
    const rank = Object.fromEntries([...INV].sort((a, b) => scoreOf(b, hab) - scoreOf(a, hab)).map((r, i) => [r.psi_id, i + 1]));
    const axes = ["Atmosphere closeness", "Data volume", "Fire-safety directness", "Oxygen range tested", "Publications"];
    const v5 = (r) => [...critVals(r, hab), r.o2_min != null ? Math.min(1, (r.o2_max - r.o2_min) / 0.4 + 0.05) : 0, Math.min(1, Math.log1p(r.n_publications) / Math.log1p(60))];
    plot("cmp-radar", R.map((r, i) => { const v = v5(r); return { type: "scatterpolar", r: [...v, v[0]], theta: [...axes, axes[0]], name: r.name, fill: "toself", fillcolor: CMPC[i] + "33", line: { color: CMPC[i], width: 2 }, marker: { size: 5, color: CMPC[i] }, hovertemplate: `<b>${esc(r.name)}</b><br>%{theta}: %{r:.2f}<extra></extra>` }; }),
      layout({ height: 340, margin: innerWidth < 700 ? { l: 70, r: 70, t: 30, b: 30 } : { l: 100, r: 110, t: 30, b: 30 }, showlegend: false, polar: { bgcolor: "rgba(0,0,0,0)", radialaxis: { range: [0, 1], showticklabels: false, gridcolor: C.line2, linecolor: "rgba(0,0,0,0)" }, angularaxis: { gridcolor: C.line2, linecolor: C.line2, tickfont: { size: innerWidth < 700 ? 9 : 11, color: C.ink2 } } } }));
    $("#cmp-cards").innerHTML = R.map((r, i) => `<button type="button" class="cc" data-id="${r.psi_id}" style="--c:${CMPC[i]}">
      <span class="cc__vis">${visOf(r)}</span>
      <span class="cc__b"><span class="cc__n"><i></i>${esc(r.name)} <small>${r.psi_id}</small></span>
      <span class="cc__k"><span><b>#${rank[r.psi_id]}</b>rank</span><span><b>${Math.round(scoreOf(r, hab))}</b>score</span><span><b>${r.n_tests.toLocaleString("en-US")}</b>records</span><span><b>${r.n_with_outcome}</b>labeled</span></span>
      <span class="cc__bar">${critVals(r, hab).map((v, k) => `<i style="width:${100 * wt.w[k] * v}%;background:${CRIT[k][1]}"></i>`).join("")}</span>
      <span class="cc__t">${esc(r.family)} · ${r.type} · ${esc(r.layers.join(", "))}</span></span></button>`).join("");
    document.querySelectorAll("#cmp-cards .cc").forEach((b) => b.addEventListener("click", () => openInv(b.dataset.id)));
    const strip = (kind) => `<div class="ca__row"><span class="ca__k">${kind === "o2" ? "Oxygen tested" : "Pressure tested"}</span><div class="ca__stack">${R.map((r, i) => airStrip(kind === "o2" ? r.o2_min : r.p_min, kind === "o2" ? r.o2_max : r.p_max, kind, CMPC[i])).join("")}</div></div>`;
    $("#cmp-air").innerHTML = strip("o2") + strip("p") + `<p class="note">Each colored band is the range one investigation tested, on the same scale. White ticks mark crew atmospheres; the bright tick is ${esc(habName(hab))}. Click a card to open its full file.</p>`;
  }
  function renderCompare() {
    const opts = [...INV].sort((a, b) => a.name.localeCompare(b.name));
    $("#cmp-pick").innerHTML = cmpState.ids.map((id, k) => `<label class="pick"><span class="label" style="margin:0">#${k + 1}</span><select data-k="${k}" aria-label="Investigation ${k + 1}"><option value="">—</option>${opts.map((r) => `<option value="${r.psi_id}" ${r.psi_id === id ? "selected" : ""}>${esc(r.name)} · ${r.psi_id}</option>`).join("")}</select></label>`).join("");
    document.querySelectorAll("#cmp-pick select").forEach((s) => s.addEventListener("change", () => { cmpState.ids[+s.dataset.k] = s.value; renderCompare(); }));
    const R = cmpState.ids.map((id) => INV.find((r) => r.psi_id === id)).filter(Boolean);
    if (!R.length) { $("#cmp-table").innerHTML = ""; $("#cmp-cards").innerHTML = ""; $("#cmp-air").innerHTML = ""; $("#cmp-note").textContent = "Pick an investigation."; return; }
    const hab = invState.hab;
    safe(() => renderCmpVisual(R, hab), "compare visual");
    const rank = Object.fromEntries([...INV].sort((a, b) => scoreOf(b, hab) - scoreOf(a, hab)).map((r, i) => [r.psi_id, i + 1]));
    const S = D.similarity;
    const sim = (a, b) => S.matrix[S.ids.indexOf(a)][S.ids.indexOf(b)];
    const names = (r, key) => [...new Set(r.tables.flatMap((t) => t[key].map((v) => v.variable)))];
    const rows = [
      ["Type · platform", (r) => `${r.type} · ${r.platform}`],
      ["Hardware", (r) => r.hardware],
      ["Fire type", (r) => r.family],
      ["Safety layers", (r) => r.layers.join(", ")],
      ["Records (labeled)", (r) => `${r.n_tests.toLocaleString("en-US")} (${r.n_with_outcome})`],
      ["O₂ tested", (r) => (r.o2_min != null ? (r.o2_max > r.o2_min ? `${pct(r.o2_min, 1)}–${pct(r.o2_max, 1)}` : pct(r.o2_min, 1)) : "not reported")],
      ["Pressure tested", (r) => (r.p_min != null ? `${r.p_max > r.p_min ? `${num(r.p_min)}–${num(r.p_max)}` : num(r.p_min)} atm${r.conditions_assumed ? " (cabin air assumed)" : ""}` : "not reported")],
      ["What varied", (r) => names(r, "varied").slice(0, 5).join(", ") || "—"],
      ["What was measured", (r) => names(r, "measured").slice(0, 5).join(", ") || "—"],
      [`Relevance · ${habName(hab)}`, (r) => `${scoreOf(r, hab).toFixed(1)} / 100 · rank ${rank[r.psi_id]}`],
      ["Publications in PSI", (r) => String(r.n_publications)],
      [`Similarity to ${R[0].name}`, (r) => (r === R[0] ? "—" : sim(R[0].psi_id, r.psi_id).toFixed(2))],
    ];
    $("#cmp-table").innerHTML = `<thead><tr><th></th>${R.map((r) => `<th>${esc(r.name)} <span class="mono-sm">${r.psi_id}</span></th>`).join("")}</tr></thead><tbody>${rows.map(([k, f]) => {
      const vals = R.map(f);
      const diff = R.length > 1 && new Set(vals).size > 1;
      return `<tr class="${diff ? "diff" : ""}"><th scope="row">${esc(k)}</th>${vals.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`;
    }).join("")}</tbody>`;
    const same = R.length > 1 ? rows.filter(([, f]) => new Set(R.map(f)).size === 1).map(([k]) => k.split(" ·")[0]) : [];
    $("#cmp-note").textContent = R.length > 1 ? (same.length ? `Shared: ${same.join(", ")}. Highlighted rows differ.` : "These investigations differ on every row.") : "Pick a second investigation to compare.";
  }

  function renderDownloads() {
    const files = [
      ["ensayos.csv", `All ${D.summary.records.toLocaleString("en-US")} test records in one schema, SI units (CSV)`],
      ["investigaciones.csv", "Profile of the 24 investigations (CSV)"],
      ["qc_log.csv", "Every correction to NASA's tables, with the original value (CSV)"],
      ["findings.json", "Findings with evidence scores (JSON)"],
      ["saffire2_ug_vs_1g.csv", "Saffire-II microgravity vs 1 g, sample by sample (CSV)"],
      ["si_evidence_packs.json", "Evidence packs given to the SI model (JSON)"],
      ["si_verification.json", "Firewall result for every SI briefing (JSON)"],
    ];
    $("#downloads").innerHTML = files.map(([f, d]) => `<a class="dl" href="data/downloads/${f}" download><span class="mono-sm">${f}</span><span>${d}</span><span class="arrow">↓</span></a>`).join("") +
      `<a class="dl" href="data/ember.json" download><span class="mono-sm">ember.json</span><span>Everything this dashboard shows, including model coefficients (JSON)</span><span class="arrow">↓</span></a>`;
    if (!SI) return;
    const all = [...Object.entries(SI.habitat).map(([k, v]) => ["Habitat", D.habitats.find((x) => x.id === k).name, v]),
      ...Object.entries(SI.investigation).map(([k, v]) => ["Investigation", `${INV.find((r) => r.psi_id === k)?.name || k} · ${k}`, v])];
    $("#si-sub").textContent = `${SI.meta.verified} of ${SI.meta.total} briefings passed · generator: ${SI.meta.generator || "—"}`;
    $("#si-table").innerHTML = `<thead><tr><th>Briefing</th><th>Kind</th><th class="num">Sentences</th><th class="num">Citations</th><th>Status</th></tr></thead><tbody>${all.map(([k, n, v]) =>
      `<tr><td>${esc(n)}</td><td>${k}</td><td class="num">${v.sentences.length}</td><td class="num">${v.sentences.reduce((s, x) => s + x.cites.length, 0)}</td><td>${v.source === "si" ? "verified ✓" : `evidence brief${v.problems.length ? ` · ${esc(v.problems[0])}` : ""}`}</td></tr>`).join("")}</tbody>`;
    $("#si-table").closest(".tbl-wrap").classList.add("scroll");
  }

  function nearCount(hb) {
    let n = 0;
    for (const g of D.coverage.groups) for (let k = 0; k < g.x_o2.length; k++) {
      const o = g.x_o2[k], pp = g.p_atm[k];
      if (o == null || pp == null) continue;
      if (Math.abs(o - hb.x_o2) <= 0.03 && Math.abs(Math.log(pp / hb.p_atm)) <= Math.log(1.3)) n++;
    }
    return n;
  }
  function habPredict(hb) {
    const x = featVec({ fuel: "Methanol", o2: hb.x_o2, p: hb.p_atm, co2: 0, he: 0, d0: M.d0_median });
    return { ...predict(x), st: dataStatus(x).s };
  }
  const DEST = {
    iss: { hab: "cabin", label: "ISS", sub: "where the fires flew", title: "International Space Station", g: "≈ 0 g", where: "Every flight test in this archive burned here or on a Cygnus cargo ship." },
    moon: { hab: "moon_base", label: "Moon", sub: "lunar base · 30% O₂", title: "Lunar base and rover", g: "0.17 g", where: "Planned air for the Moon base and pressurized rover, from the challenge brief." },
    mars: { hab: "exploration", label: "Mars", sub: "exploration air · 34% O₂", title: "Mars and exploration habitats", g: "0.38 g", where: "NASA's exploration atmosphere, proposed for long missions to the Moon and Mars." },
    earth: { hab: "cabin", label: "Earth", sub: "where materials are tested", title: "Earth: where materials are screened", g: "1 g", where: "Spacecraft materials are certified with flame tests in Earth gravity." },
  };
  let globe = null;
  function destInfo(id) {
    const d = DEST[id], hb = D.habitats.find((x) => x.id === d.hab), r = habPredict(hb), S = D.solids;
    if (id === "earth") return { v: `${S.g1_upward_limit_pct}%`, l: "O₂ a PMMA rod needs in the upward flame test on Earth", t: `In orbit, BASS-II rods kept burning down to ${S.min_o2_pct}%. At gentle cabin airflows, Earth screening can understate the risk.`, hb };
    const near = nearCount(hb);
    if (r.st === "outside") return { v: "—", muted: true, l: "prediction withheld: no flight data near this air", t: `${near} flight tests ran within 3 points of O₂ and 30% of this pressure.`, hb };
    return { v: pct(r.p), l: `chance a droplet fire goes out on its own · 90% range ${pct(r.lo)}–${pct(r.hi)}${r.st === "extrapolating" ? " · extrapolating" : ""}`, t: `${near} flight tests ran within 3 points of O₂ and 30% of this pressure.`, hb };
  }

  function destDetail(id) {
    const x = destInfo(id);
    return `<span class="glabel__v${x.muted ? " muted" : ""}">${x.v}</span><span class="glabel__l">${esc(x.l)}</span>${id === "moon" ? '<a href="#/learn" class="glabel__b">Fly to the Moon base →</a>' : ""}<a href="#/lab" class="glabel__a" data-hab="${DEST[id].hab}">Open in the Fire Lab →</a>`;
  }
  function initGlobe() {
    if (!window.PhoenixGlobe || !window.THREE) { $("#globe").classList.add("globe--fallback"); return; }
    globe = window.PhoenixGlobe.init($("#globe"), {
      base: "assets/3d/",
      bodies: [
        { id: "iss", label: DEST.iss.label, sub: DEST.iss.sub },
        { id: "moon", label: DEST.moon.label, sub: DEST.moon.sub },
        { id: "mars", label: DEST.mars.label, sub: DEST.mars.sub },
        { id: "earth", label: DEST.earth.label, sub: DEST.earth.sub },
      ],
      detail: destDetail,
    });
  }
  function renderAnswers() {
    const S = D.summary, SO = D.solids;
    const cab = habPredict(D.habitats.find((x) => x.id === "cabin")), moon = habPredict(D.habitats.find((x) => x.id === "moon_base"));
    const k = D.next.picks[0];
    const items = [
      ["The gap", `${S.moon_envelope}<small>/ ${S.ambient.toLocaleString("en-US")}</small>`, "flight tests anywhere near lunar-base air", `No solid material has burned in orbit above ${SO.max_o2_any_solid_pct}% O₂, and none at reduced pressure.`, "#/findings", "See the gap"],
      ["Prevention", pct(moon.p), "chance a droplet fire goes out on its own in lunar-base air", `Against ${pct(cab.p)} in cabin air. On the Moon base, a fire must be detected and put out; it will not die on its own.`, "#/lab", "Try it in the Fire Lab"],
      ["Solids", `${SO.min_o2_pct}%`, "lowest oxygen where a plastic rod kept burning in orbit", `Below the ${SO.g1_upward_limit_pct}% limit of the upward test used on Earth. Watch the flight video.`, "#/flames", "Watch the flames"],
      ["Next flight", `${pct(k.interval[0])}–${pct(k.interval[1])}`, "today's range for the test that would teach the most", `${k.fuel} droplet at ${o2pct(k.x_o2)} O₂, ${PSI(k.p_atm).toFixed(1)} psi, ${(100 * k.x_co2).toFixed(0)}% CO₂: the widest doubt near lunar-base air.`, "#/next", "See the recommendation"],
    ];
    $("#answer-list").innerHTML = items.map(([t, v, l, d, h, a], i) => `<li class="answer"><a href="${h}"><span class="answer__n">${String(i + 1).padStart(2, "0")} · ${t}</span><span class="answer__v">${v}</span><span class="answer__l">${l}</span><span class="answer__d">${esc(d)}</span><span class="answer__go">${a} →</span></a></li>`).join("");
  }

  const ROD = [
    { f: "bass2-rod-15", o2: 15.1, test: "O17", flow: "3 cm/s, then 0, then 11", x: 2.2, cap: "Small, dim and blue. Near the limit there is little soot left to glow, yet the flame holds on." },
    { f: "bass2-rod-17", o2: 16.7, test: "O10", flow: "5, 2, then 0 cm/s", x: 3.0, cap: "Brighter, with a yellow tail: a little more oxygen already means more soot." },
    { f: "bass2-rod-18", o2: 18.0, test: "O3b", flow: "5, 3, 2, 1 cm/s, then lower", x: 4.0, cap: "Orange and sooty, wrapped around the tip; it shrinks each time the airflow is turned down." },
    { f: "bass2-rod-22", o2: 22.2, test: "O1", flow: "20, 10, 5, 2, then 1 cm/s", x: 6.6, cap: "Air close to the station's: a large, bright, sooty flame that changes shape as the airflow drops." },
  ];

  const vidUrl = (f) => `assets/video/${f}.mp4`;
  const psiUrl = (id) => (INV.find((r) => r.psi_id === id) || {}).psi_url || "#";
  let rodI = 0;
  function renderStage() {
    const r = ROD[rodI], SO = D.solids;
    const pos = (v) => `${(100 * (v - 12)) / (32 - 12)}%`;
    $("#stage").innerHTML = `
      <div class="stage__video"><video id="stage-v" src="${vidUrl(r.f)}" poster="assets/video/${r.f}.jpg" muted loop playsinline autoplay preload="auto"></video><span class="stage__tag">ISS · BASS-II · ×${r.x} speed</span></div>
      <div class="stage__side">
        <p class="label">Oxygen in the glovebox</p>
        <div class="stage__o2">${r.o2}<small>% O₂</small></div>
        <div class="o2bar" aria-hidden="true">
          <i class="o2bar__fill" style="width:${pos(r.o2)}"></i>
          ${[[SO.min_o2_pct, "orbit limit", "lim"], [SO.g1_upward_limit_pct, "Earth test limit", "g1"], [21, "Earth air", "air"], [30, "Moon base", "moon"]].map(([v, t, c]) => `<span class="o2bar__m o2bar__m--${c}" style="left:${pos(v)}"><b>${v}%</b>${t}</span>`).join("")}
        </div>
        <div class="seg stage__pick" role="group" aria-label="Oxygen level">${ROD.map((x, i) => `<button type="button" data-i="${i}" aria-pressed="${i === rodI}">${x.o2}%</button>`).join("")}</div>
        <p class="stage__cap">${esc(r.cap)}</p>
        <dl class="stage__meta"><div><dt>Sample</dt><dd>¼-inch clear acrylic (PMMA) rod</dd></div><div><dt>Airflow</dt><dd>${esc(r.flow)}</dd></div><div><dt>NASA test</dt><dd><a class="src-link" href="${psiUrl("PSI-25")}" target="_blank" rel="noopener">BASS-II ${r.test} · PSI-25 ↗</a></dd></div></dl>
      </div>`;
    document.querySelectorAll(".stage__pick button").forEach((b) => b.addEventListener("click", () => { rodI = +b.dataset.i; renderStage(); }));
    const v = $("#stage-v"); if (v) { v.playbackRate = 1; v.play().catch(() => {}); }
  }


  let lab3d = null;
  const GRAV = [["ISS", 0, "≈ 0 g"], ["Moon", 0.17, "0.17 g"], ["Mars", 0.38, "0.38 g"], ["Earth", 1, "1 g"]];
  const lab3dState = { g: 0, tally: [] };
  function renderGravity() {
    $("#g-seg").innerHTML = GRAV.map(([n, g, t]) => `<button type="button" data-g="${g}" aria-pressed="${g === lab3dState.g}">${n} <small>${t}</small></button>`).join("");
    document.querySelectorAll("#g-seg button").forEach((b) => b.addEventListener("click", () => {
      lab3dState.g = +b.dataset.g; renderGravity();
      if (lab3d) lab3d.set({ g: lab3dState.g });
    }));
  }
  function initLab3D() {
    renderGravity();
    if (!window.PhoenixLab3D || !window.THREE) { $("#lab3d").classList.add("lab3d__view--off"); return; }
    lab3d = window.PhoenixLab3D.init($("#lab3d"), { labels: { drop: "Fuel droplet", flame: "Flame", igniter: "Hot-wire igniter", needle: "Needles hold the droplet", gravity: "Gravity" } });
    if (!lab3d) return;
    $("#lab3d-lbl").addEventListener("click", (e) => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.setAttribute("aria-pressed", String(on)); lab3d.showLabels(on); });
    const steps = [...document.querySelectorAll("#lab3d-tl li")], fill = $("#tl-fill"), outM = $("#tl-out"), endT = $("#tl-end");
    let lastPh = "";
    setInterval(() => {
      if (current !== "lab") return;
      drawD2();
      const s = lab3d.state();
      fill.style.width = `${Math.min(100, 100 * s.t)}%`;
      fill.classList.toggle("is-out", s.phase === "out");
      outM.style.left = s.outAt != null ? `${100 * s.outAt}%` : "-20px";
      outM.style.opacity = s.outAt != null && s.t >= s.outAt ? 1 : 0;
      const ph = s.phase === "out" ? "end" : s.phase;
      if (ph !== lastPh) {
        lastPh = ph;
        steps.forEach((li) => li.classList.toggle("is-on", li.dataset.ph === ph));
        endT.textContent = s.phase === "out" ? "Went out on its own" : s.phase === "end" ? "Burned until the fuel was gone" : "Out on its own, or fuel gone";
      }
    }, 100);
    lab3d.onRun((run) => {
      if (run.n > 1) { lab3dState.tally.unshift(run.out); lab3dState.tally = lab3dState.tally.slice(0, 20); }
      const t = lab3dState.tally, outN = t.filter(Boolean).length;
      $("#lab3d-runs").innerHTML = `<div class="runs__now">Replay ${run.n}: <b>${run.status}</b></div>
        <div class="runs__dots">${t.map((o) => `<i class="${o ? "o" : "k"}" title="${o ? "went out on its own" : "burned to the end"}"></i>`).join("")}</div>
        <div class="mono-sm">${t.length ? `${outN} of the last ${t.length} went out on its own` : "collecting replays…"}</div>`;
    });
  }
  function labPhys(x) {
    const T = M.train, xs = stdz(x), idx = M.train_std.map((t, i) => ({ i, d: Math.sqrt(t.reduce((s, v, j) => s + (v - xs[j]) ** 2, 0)) }))
      .filter((o) => T[o.i].tasa_quemado > 0).sort((a, b) => a.d - b.d).slice(0, 5);
    let wk = 0, k = 0, wr = 0, rr = 0;
    const tests = idx.map((o) => {
      const t = T[o.i], w = 1 / (o.d + 0.3);
      k += w * t.tasa_quemado; wk += w;
      if (t.autoextincion && t.d_ext_mm > 0 && t.d0_mm > 0) { rr += w * t.d_ext_mm / t.d0_mm; wr += w; }
      const tb = t.tiempo_quemado_s > 0 ? t.tiempo_quemado_s : (t.d0_mm ** 2) / t.tasa_quemado;
      const dEnd2 = t.autoextincion && t.d_ext_mm > 0 ? t.d_ext_mm ** 2 : Math.max(0, t.d0_mm ** 2 - t.tasa_quemado * tb);
      return { d0: t.d0_mm, K: t.tasa_quemado, tb: Math.max(0.2, (t.d0_mm ** 2 - dEnd2) / t.tasa_quemado), dEnd2, out: !!t.autoextincion, date: t.fecha, fuel: t.combustible, o2: t.x_o2, p: t.p_atm };
    });
    if (!wr) {
      const fuel = x[0] ? "Heptane" : "Methanol", r = T.filter((t) => t.autoextincion && t.d_ext_mm > 0 && t.combustible === fuel).map((t) => t.d_ext_mm / t.d0_mm).sort((a, b) => a - b);
      if (r.length) { rr = r[Math.floor(r.length / 2)]; wr = 1; }
    }
    return { K: wk ? k / wk : 0.6, rext: wr ? Math.min(0.95, Math.max(0.2, rr / wr)) : 0.72, tests };
  }
  let phys = null;
  function drawD2() {
    const c = $("#lab-d2"); if (!c || !lab3d || !phys) return;
    const s = lab3d.state(), g = c.getContext("2d"), W = c.width, H = c.height, L = 54, B = 40, R = 14, Tp = 14;
    const tmax = Math.max(s.tBurn, ...phys.tests.map((t) => t.tb)) * 1.08, ymax = Math.max(s.d0 ** 2, ...phys.tests.map((t) => t.d0 ** 2)) * 1.08;
    const X = (t) => L + (W - L - R) * t / tmax, Y = (v) => H - B - (H - B - Tp) * v / ymax;
    g.clearRect(0, 0, W, H);
    g.font = "20px ui-monospace, monospace"; g.fillStyle = "rgba(160,170,190,.85)"; g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1;
    const tick = (m) => { const st = [1, 2, 5, 10, 20, 50][[1, 2, 5, 10, 20, 50].findIndex((v) => m / v <= 5)] || 100; return st; };
    const ts = tick(tmax), ys = tick(ymax);
    for (let v = 0; v <= tmax; v += ts) { g.beginPath(); g.moveTo(X(v), Tp); g.lineTo(X(v), H - B); g.stroke(); g.fillText(String(v), X(v) - 6, H - B + 24); }
    for (let v = 0; v <= ymax; v += ys) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(String(v), 6, Y(v) + 7); }
    g.fillText(I18N_T("s"), W - R - 14, H - B - 8); g.fillText(I18N_T("d², mm²"), L + 6, Tp + 18);
    phys.tests.forEach((t) => {
      g.strokeStyle = t.out ? "rgba(125,211,252,.55)" : "rgba(200,205,215,.4)"; g.lineWidth = 2; g.setLineDash([]);
      g.beginPath(); g.moveTo(X(0), Y(t.d0 ** 2)); g.lineTo(X(t.tb), Y(t.dEnd2)); g.stroke();
      if (t.out) { g.fillStyle = "rgba(125,211,252,.9)"; g.beginPath(); g.arc(X(t.tb), Y(t.dEnd2), 5, 0, 7); g.fill(); }
    });
    g.setLineDash([8, 7]); g.strokeStyle = "rgba(255,138,61,.55)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(0), Y(s.d0 ** 2)); g.lineTo(X(s.tBurn), Y(s.dEnd ** 2)); g.stroke(); g.setLineDash([]);
    const te = Math.max(0, Math.min(s.e - s.ign, s.tBurn));
    if (s.e > s.ign) {
      g.strokeStyle = "#ff8a3d"; g.lineWidth = 4; g.beginPath(); g.moveTo(X(0), Y(s.d0 ** 2)); g.lineTo(X(te), Y(Math.max(s.dEnd ** 2, s.d0 ** 2 - s.K * te))); g.stroke();
      g.fillStyle = "#ffb36b"; g.beginPath(); g.arc(X(te), Y(s.d * s.d), 7, 0, 7); g.fill();
    }
    $("#lab-read").innerHTML = `<span><b>${Math.max(0, s.e - s.ign).toFixed(1)} s</b>${I18N_T("since ignition")}</span><span><b>${s.d.toFixed(2)} mm</b>${I18N_T("droplet now")}</span><span><b>${s.K.toFixed(2)} mm²/s</b>${I18N_T("burning rate K")}</span><span><b>${(s.dEnd).toFixed(2)} mm</b>${s.out ? I18N_T("goes out at") : I18N_T("burns down to")}</span>`;
  }
  const I18N_T = (t) => (window.I18N ? window.I18N.t(t) : t);
  function syncLab3d(r, show, st) {
    if (!lab3d) return;
    phys = labPhys(featVec(sc));
    lab3d.set({ o2: sc.o2, p: sc.p, fuel: sc.fuel, co2: sc.co2, he: sc.he, pOut: show ? r.p : 0.5, d0: sc.d0, K: phys.K, rext: phys.rext });
    $("#lab3d-sc").textContent = `${sc.fuel} droplet · ${(100 * sc.o2).toFixed(1)}% O₂ · ${(sc.p * ATM_PSI).toFixed(1)} psi${sc.co2 ? ` · ${(100 * sc.co2).toFixed(0)}% CO₂` : ""}${sc.he ? ` · ${(100 * sc.he).toFixed(0)}% He` : ""}`;
    $("#lab3d-p").innerHTML = show
      ? `<span class="lab3d__big">${pct(r.p)}</span><span>chance it goes out on its own${st === "extrapolating" ? " · extrapolating" : ""}</span>`
      : `<span class="lab3d__big muted">—</span><span>no flight data near this air: replays use 50/50</span>`;
    lab3dState.tally = [];
  }

  const FAM_LABEL = { "PMMA rod": "Acrylic rods", "SIBAL fabric": "Cotton-fiberglass fabric", "PMMA thin film": "Thin films", "PMMA slab": "Slabs", "PMMA sphere": "Spheres", "Nomex fabric": "Nomex", Droplet: "Fuel droplets", "Spherical gas flame": "Gas spheres", "Gas jet flame": "Gas jets" };
  const STATE = [["All", "All"], ["Solid", "Solids"], ["Liquid", "Liquids"], ["Gas", "Gases"]];
  const archState = { st: "All", fam: "All", all: false };
  function renderArchive() {
    const CL = window.CLIPS || [];
    $("#arch-state").innerHTML = STATE.map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${k === archState.st}">${l} <small>${k === "All" ? CL.length : CL.filter((c) => c.state === k).length}</small></button>`).join("");
    document.querySelectorAll("#arch-state button").forEach((b) => b.addEventListener("click", () => { archState.st = b.dataset.s; archState.fam = "All"; archState.all = false; renderArchive(); }));
    const inState = CL.filter((c) => archState.st === "All" || c.state === archState.st);
    const fams = ["All", ...Object.keys(FAM_LABEL).filter((f) => inState.some((c) => c.family === f))];
    $("#arch-filter").innerHTML = fams.length > 2 ? fams.map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === archState.fam}">${f === "All" ? "Every material" : FAM_LABEL[f]}</button>`).join("") : "";
    document.querySelectorAll("#arch-filter button").forEach((b) => b.addEventListener("click", () => { archState.fam = b.dataset.f; renderArchive(); }));
    const ord = { Solid: 0, Liquid: 1, Gas: 2 };
    const list = inState.filter((c) => archState.fam === "All" || c.family === archState.fam).sort((a, b) => (archState.st === "All" ? 0 : ord[a.state] - ord[b.state]) || (a.o2 ?? 99) - (b.o2 ?? 99));
    const pickMix = () => { const by = { Solid: [], Liquid: [], Gas: [] }; list.forEach((c) => by[c.state].push(c)); const out = []; for (let i = 0; out.length < Math.min(12, list.length); i++) for (const k of ["Solid", "Liquid", "Gas"]) if (by[k][i] && out.length < 12) out.push(by[k][i]); return out; };
    const shown = archState.all ? list : archState.st === "All" ? pickMix() : list.slice(0, 12);
    const air = (a) => { const t = String(a).replace(/\([^)]*\)/g, "").replace(/\s*,\s*/g, ", ").replace(/,\s*$/, "").trim(); return t ? `${t} cm/s` : "—"; };
    const path = (c) => `assets/video/${c.dir ? c.dir + "/" : ""}${c.f}`;
    const stTag = { Solid: "Solid", Liquid: "Liquid", Gas: "Gas" };
    $("#arch").innerHTML = shown.map((c) => `<figure class="ac ac--${c.state.toLowerCase()}"><div class="ac__v"><video data-src="${path(c)}.mp4" poster="${path(c)}.jpg" muted loop playsinline preload="none"></video><span class="stage__tag">×${c.x}</span><span class="ac__st">${stTag[c.state]}</span></div>
      <figcaption><span class="ac__o2">${c.o2 == null ? "—" : `${c.approx ? "≈" : ""}${c.o2}`}<small>% O₂</small></span><b>${esc(c.material)}</b><span class="mono-sm">${esc(FAM_LABEL[c.family] || c.family)} · ${c.psi ? `${c.psi} · ` : ""}test ${esc(c.test)}</span><span class="ac__m">${c.m ? esc(c.m) : `<span>Airflow</span> ${esc(air(c.air))}${c.co != null ? ` · CO +${c.co} ppm` : ""}`}</span></figcaption></figure>`).join("");
    $("#arch-more").hidden = list.length <= 12;
    $("#arch-more").textContent = archState.all ? "Show fewer" : `Show all ${list.length}`;
    lazyVideos("#arch video");
  }
  function lazyVideos(sel) {
    const vids = [...document.querySelectorAll(sel)];
    if (!("IntersectionObserver" in window)) { vids.forEach((v) => { v.src = v.dataset.src; }); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { if (!v.getAttribute("src")) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause();
    }), { threshold: 0.25 });
    vids.forEach((v) => io.observe(v));
  }

  const survState = { kind: "All", hab: "moon_base", all: false, view: "chart" };
  function renderSurvival() {
    const SV = D.survival || [];
    const kinds = ["All", "Droplet", "Gas flame"];
    $("#surv-kind").innerHTML = kinds.map((k) => `<button type="button" data-k="${k}" aria-pressed="${k === survState.kind}">${k === "All" ? "All flames" : k === "Droplet" ? "Droplets" : k === "Gas flame" ? "Gas flames" : "Inverse flames"}</button>`).join("");
    document.querySelectorAll("#surv-kind button").forEach((b) => b.addEventListener("click", () => { survState.kind = b.dataset.k; renderSurvival(); }));
    $("#surv-hab").innerHTML = D.habitats.filter((h) => h.x_o2 < 1).map((h) => `<button type="button" data-h="${h.id}" aria-pressed="${h.id === survState.hab}">${esc(h.name)}</button>`).join("");
    document.querySelectorAll("#surv-hab button").forEach((b) => b.addEventListener("click", () => { survState.hab = b.dataset.h; renderSurvival(); }));
    const hb = D.habitats.find((h) => h.id === survState.hab);
    const near = (r) => Math.abs(r.o2_mean - hb.x_o2) <= 0.05 && Math.abs(Math.log(r.p_mean / hb.p_atm)) <= Math.log(1.35);
    const list = SV.filter((r) => r.kind !== "Inverse gas flame" && (survState.kind === "All" || r.kind === survState.kind));
    const shown = survState.all ? list : list.slice(0, 10);
    $("#surv-legend").innerHTML = [legendItem("bar", C.orange, "Kept burning until the fuel was cut or gone"), legendItem("bar", C.amber, "Droplet broke apart, still burning"), legendItem("bar", "#cbd5e1", "Went out on its own"), legendItem("bar", "rgba(242,96,15,.25)", `Near ${hb.name} air`)].join("");
    $("#surv-list").innerHTML = `<div class="surv__h"><span></span><span>Fuel and air</span><span>How the flames ended</span><span class="num">Did not go out</span><span class="num">90% range</span></div>` + shown.map((r, i) => {
      const w = (k) => `${(100 * k) / r.n}%`;
      return `<div class="surv__r${near(r) ? " is-near" : ""}"><span class="surv__i">${String(i + 1).padStart(2, "0")}</span>
        <span><b>${esc(r.kind === "Droplet" ? `${r.fuel} droplets` : `${r.fuel} ${r.kind.toLowerCase()}s`)}</b><small>${esc(r.o2)} oxygen · ${esc(r.p)} · ${esc(r.dil)} · ${r.psi.join(", ")}</small>${near(r) ? `<em>near ${esc(hb.name)} air</em>` : ""}</span>
        <span class="surv__bar"><i class="k" style="width:${w(r.kept)}"></i><i class="b" style="width:${w(r.broke)}"></i><i class="o" style="width:${w(r.out)}"></i></span>
        <span class="num"><b>${r.kept + r.broke}</b> of ${r.n}</span><span class="num mono-sm">${pct(r.ci[0])}–${pct(r.ci[1])}</span></div>`;
    }).join("");
    $("#surv-more").hidden = list.length <= 10;
    $("#surv-more").textContent = survState.all ? "Show fewer" : `Show all ${list.length} groups`;
    $("#surv-note").textContent = `Groups need at least 5 flames that ran to an end (no-ignition and flash tests are left out). A droplet that broke apart is counted as not going out on its own: its fragments were still burning. Near = within 5 points of O₂ and about 35% of the pressure of ${hb.name} air.`;
  }


  let learn3d = null;
  const learnState = { i: 0, o2: 0.30, answers: {} };
  const pAt = (o2, p, extra = {}) => { const x = featVec({ fuel: "Methanol", o2, p, co2: 0, he: 0, d0: M.d0_median, ...extra }); return { ...predict(x), st: dataStatus(x).s }; };
  function learnSteps() {
    const SO = D.solids, k = D.next.picks[0];
    const cab = pAt(0.21, 1), moon = pAt(0.30, 0.694), eva = pAt(0.265, 0.694);
    return [
      { t: "On Earth, a flame is a teardrop.", b: "Hot gas is lighter than the air around it, so it rises and pulls fresh air in from below. That draft feeds the flame and stretches it upward. This is the only kind of flame most of us have seen.", set: { g: 1, o2: 0.21, p: 1, flow: 0, co2: 0 } },
      { t: "In orbit, nothing rises.", b: "Without buoyancy there is no draft. Oxygen reaches the fuel only by slow diffusion, so the flame becomes a dim, blue sphere around the droplet. This is what NASA films inside the station.", set: { g: 0, o2: 0.21, p: 1, flow: 0, co2: 0 }, link: ["#/flames", "Watch the real flight video →"] },
      { t: "More oxygen, a fiercer fire.", b: "Move the oxygen up to the 30% planned for the Moon base and watch the flame grow. The number below is the validated model's answer, trained on 261 ISS droplet fires.", set: { g: 0, p: 1, flow: 0, co2: 0 }, slider: true },
      { t: "Lower pressure, same danger.", b: "The Moon base will run at 10.2 psi to save mass and make spacewalks easier, with more oxygen to keep crews breathing normally. That trade makes fires much less likely to die on their own.", set: { g: 0, o2: 0.30, p: 0.694, flow: 0, co2: 0 },
        stat: `<div class="lstat"><span><b>${pct(cab.p)}</b> go out on their own in cabin air (21% O₂, 14.7 psi)</span><span><b>${pct(moon.p)}</b> in lunar-base air (30% O₂, 10.2 psi)</span></div>` },
      { t: "A gentle breeze feeds the fire.", b: `In orbit a fan does what buoyancy does on Earth. NASA's BASS-II experiment found that plastics keep burning at the lowest oxygen with a breeze of only about 2 cm/s: down to ${SO.min_o2_pct}% O₂, below the ${SO.g1_upward_limit_pct}% limit of the Earth test used to approve materials.`, set: { g: 0, o2: 0.21, p: 1, flow: 0.55, co2: 0 },
        stat: `<div class="lstat"><span><b>${SO.min_o2_pct}%</b> lowest O₂ for a lasting flame in orbit</span><span><b>${SO.g1_upward_limit_pct}%</b> limit of the upward test on Earth</span></div>` },
      { t: "Put it out: dilute the air.", b: `Adding CO₂ takes oxygen and heat away from the flame. But near lunar-base air NASA has almost no data: for a methanol droplet at ${o2pct(k.x_o2)} O₂, ${PSI(k.p_atm).toFixed(1)} psi and ${(100 * k.x_co2).toFixed(0)}% CO₂ the model can only say it goes out on its own ${pct(k.interval[0])} to ${pct(k.interval[1])} of the time. That is the flight test we recommend.`, set: { g: 0, o2: k.x_o2, p: k.p_atm, flow: 0, co2: k.x_co2 }, link: ["#/next", "See the recommended flight →"] },
      { t: "Where it all comes together: the Moon base.", b: `The base will breathe 30% O₂ at 10.2 psi, where a droplet fire puts itself out only ${pct(moon.p)} of the time, against ${pct(cab.p)} in cabin air. Open the Moon base to see each of these ideas tested against NASA flight data, module by module.`, set: { g: 0, o2: 0.30, p: 0.694, flow: 0, co2: 0 }, link: ["#/findings/audit", "See the Moon base audit →"] },
    ];
  }
  function renderLearn() {
    const S = learnSteps(), i = learnState.i, st = S[i];
    const set = { ...st.set };
    if (st.slider) set.o2 = learnState.o2;
    if (learn3d) learn3d.set({ ...set, steady: true, fuel: "Methanol" });
    let extra = "";
    if (st.slider) {
      const r = pAt(learnState.o2, 1);
      extra = `<div class="lslider"><div class="top"><label for="l-o2">Oxygen</label><output>${(100 * learnState.o2).toFixed(0)}%</output></div><input type="range" id="l-o2" min="0.15" max="0.40" step="0.01" value="${learnState.o2}"><div class="ticks"><span>15%</span><span>21% Earth</span><span>30% Moon base</span><span>40%</span></div></div>
        <div class="lstat"><span><b>${r.st === "outside" ? "—" : pct(r.p)}</b> chance a droplet fire goes out on its own at ${(100 * learnState.o2).toFixed(0)}% O₂ and 14.7 psi${r.st === "extrapolating" ? " (extrapolating)" : ""}</span></div>`;
    }
    if (st.stat) extra += st.stat;
    if (st.quiz) {
      const score = st.qs.filter((q, n) => learnState.answers[n] === q.a).length, answered = Object.keys(learnState.answers).length;
      extra = st.qs.map((q, n) => {
        const got = learnState.answers[n];
        return `<div class="quiz"><p class="quiz__q">${n + 1}. ${esc(q.q)}</p><div class="quiz__o">${q.opts.map(([v, l]) => `<button type="button" data-q="${n}" data-v="${v}" class="${got ? (v === q.a ? "ok" : v === got ? "no" : "") : ""}" ${got ? "disabled" : ""}>${esc(l)}</button>`).join("")}</div>${got ? `<p class="quiz__why">${got === q.a ? "Correct." : "Not quite."} ${esc(q.why)}</p>` : ""}</div>`;
      }).join("") + (answered === st.qs.length ? `<p class="quiz__score">${score} of ${st.qs.length} correct. <a class="src-link" href="#/lab">Now run your own atmosphere →</a></p>` : "");
    }
    $("#learn-panel").innerHTML = `
      <div class="learn__dots">${S.map((_, n) => `<button type="button" data-n="${n}" aria-label="Step ${n + 1}" class="${n === i ? "is-on" : n < i ? "is-done" : ""}"></button>`).join("")}</div>
      <p class="label">Step ${i + 1} of ${S.length}</p>
      <h3 class="learn__t">${esc(st.t)}</h3>
      ${st.b ? `<p class="learn__b">${esc(st.b)}</p>` : ""}
      ${extra}
      ${st.link ? `<a class="src-link" href="${st.link[0]}">${esc(st.link[1])}</a>` : ""}
      <div class="learn__nav"><button type="button" class="btn btn--line btn--sm" id="l-prev" ${i === 0 ? "disabled" : ""}>← Back</button><button type="button" class="btn btn--fire btn--sm" id="l-next" ${i === S.length - 1 ? "hidden" : ""}>Next <span aria-hidden="true">→</span></button></div>`;
    document.querySelectorAll(".learn__dots button").forEach((b) => b.addEventListener("click", () => { learnState.i = +b.dataset.n; renderLearn(); }));
    $("#l-prev").addEventListener("click", () => { learnState.i = Math.max(0, i - 1); renderLearn(); });
    $("#l-next").addEventListener("click", () => { learnState.i = Math.min(S.length - 1, i + 1); renderLearn(); });
    const sl = $("#l-o2");
    if (sl) sl.addEventListener("input", () => {
      learnState.o2 = +sl.value;
      if (learn3d) learn3d.set({ o2: learnState.o2 });
      const r = pAt(learnState.o2, 1);
      sl.closest(".lslider").querySelector("output").textContent = `${(100 * learnState.o2).toFixed(0)}%`;
      const box = sl.closest(".lslider").nextElementSibling;
      box.innerHTML = `<span><b>${r.st === "outside" ? "—" : pct(r.p)}</b> chance a droplet fire goes out on its own at ${(100 * learnState.o2).toFixed(0)}% O₂ and 14.7 psi${r.st === "extrapolating" ? " (extrapolating)" : ""}</span>`;
    });
    document.querySelectorAll(".quiz__o button").forEach((b) => b.addEventListener("click", () => { learnState.answers[b.dataset.q] = b.dataset.v; renderLearn(); }));
  }
  function initLearn() {
    if (window.PhoenixLab3D && window.THREE) learn3d = window.PhoenixLab3D.init($("#learn3d"), { labels: { drop: "Fuel droplet", flame: "Flame", igniter: "Hot-wire igniter", gravity: "Gravity", flow: "Airflow" } });
    if (!learn3d) $("#learn3d").classList.add("lab3d__view--off");
    renderLearn();
  }

  const worldState = { o2: 0.21, flow: 0, fuel: "Methanol" };
  let worlds = [];
  const WORLDS = [["ISS", 0, "≈ 0 g", "A sphere. Nothing is lighter or heavier, so hot gas does not rise and oxygen only arrives by slow diffusion."],
    ["Moon", 0.17, "0.17 g", "A short, round flame. A sixth of Earth's pull already starts a weak updraft."],
    ["Mars", 0.38, "0.38 g", "A rounded teardrop. More updraft means more fresh oxygen and more soot at the tip."],
    ["Earth", 1, "1 g", "The familiar tall teardrop: a strong draft feeds and stretches the flame."]];
  function renderWorldCtl() {
    const r = pAt(worldState.o2, 1, { fuel: worldState.fuel });
    $("#worlds-ctl").innerHTML = `
      <div class="lslider"><div class="top"><label for="wo2">Oxygen</label><output>${o2pct(worldState.o2)}</output></div><input type="range" id="wo2" min="0.15" max="0.40" step="0.01" value="${worldState.o2}"></div>
      <div class="lslider"><div class="top"><label for="wfl">Airflow from the left</label><output>${worldState.flow ? `${Math.round(worldState.flow * 20)} cm/s` : "still air"}</output></div><input type="range" id="wfl" min="0" max="0.6" step="0.05" value="${worldState.flow}"></div>
      <div class="worlds-ctl__f"><span class="mono-sm">Fuel</span><div class="seg" id="wfuel">${["Methanol", "Heptane"].map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === worldState.fuel}">${f}</button>`).join("")}</div></div>
      <p class="worlds-ctl__r">On the ISS at 1 atm, the model says this fire goes out on its own <b>${pct(r.p)}</b> of the time <small>(90% range ${pct(r.lo)}–${pct(r.hi)}${r.st !== "within" ? ` · ${r.st}` : ""})</small>.</p>`;
    $("#wo2").addEventListener("input", (e) => { worldState.o2 = +e.target.value; syncWorlds(); e.target.closest(".lslider").querySelector("output").textContent = o2pct(worldState.o2); clearTimeout(renderWorldCtl.t); renderWorldCtl.t = setTimeout(renderWorldCtl, 250); });
    $("#wfl").addEventListener("input", (e) => { worldState.flow = +e.target.value; syncWorlds(); e.target.closest(".lslider").querySelector("output").textContent = worldState.flow ? `${Math.round(worldState.flow * 20)} cm/s` : "still air"; });
    document.querySelectorAll("#wfuel button").forEach((b) => b.addEventListener("click", () => { worldState.fuel = b.dataset.f; syncWorlds(); renderWorldCtl(); }));
  }
  function syncWorlds() { worlds.forEach((w, i) => w && w.set({ o2: worldState.o2, p: 1, co2: 0, he: 0, g: WORLDS[i][1], flow: worldState.flow, fuel: worldState.fuel, steady: true })); }
  function initWorlds() {
    $("#worlds").innerHTML = WORLDS.map(([n, , g, d], i) => `<figure class="world"><div class="world__v" id="world-${i}"><span class="world__g">${g}</span></div><figcaption><b>${n}</b><p>${d}</p></figcaption></figure>`).join("");
    if (window.PhoenixLab3D && window.THREE) worlds = WORLDS.map((w, i) => window.PhoenixLab3D.init($(`#world-${i}`), { labels: {}, showLabels: false, autoRotate: false, lit: true, cam: [0, 0.5, 6.2] }));
    worlds.forEach((w, i) => { if (!w) $(`#world-${i}`).classList.add("lab3d__view--off"); });
    syncWorlds(); renderWorldCtl();
  }

  const MB = D.moonbase;
  const TAG = {
    measured: ["Measured", "Measured by NASA in flight or in its report"],
    derived: ["Derived", "Computed from NASA measurements (scaled or combined)"],
    model: ["Model", "Prediction of the FLEX model inside the flown range"],
    assumed: ["Assumed", "Input we chose: the challenge atmosphere or a stand-in volume"],
    extrapolated: ["Extrapolated", "Beyond anything NASA has tested; treat as a guess"],
    gap: ["No data", "NASA has no data that answers this yet"],
  };
  const tagHtml = (t) => `<span class="ptag ptag--${t}" title="${esc(TAG[t][1])}">${TAG[t][0]}</span>`;
  const LAYERS = [["materials", "Materials"], ["liquids", "Liquid fires"], ["detection", "Detection"], ["suppression", "Suppression"]];
  function mbBrief(b, scope) {
    if (!b) return "";
    return `<div class="si-sum">${badge(b)}${b.headline ? `<p class="mb-hl">${esc(b.headline)}</p>` : ""}<p>${sentencesHtml(b, scope)}</p>${evidenceHtml(b, scope)}</div>`;
  }
  let xpMoon = null, xpSrc = null;
  const xpState = { src: null, step: 0, worlds: false };
  function xpCards() {
    const SO = D.solids, cab = pAt(0.21, 1), moon = pAt(0.30, 0.694), s = (MB && MB.site) || {};
    return [
      { act: "moon", e: "Chapter 1 · The mission", t: "NASA is going back to the Moon, this time to stay.", b: "With Artemis, NASA plans crewed landings near the lunar south pole and, later, a base camp where crews live and work for weeks. In 2026 Artemis II flew four astronauts around the Moon, and a smoke alarm went off on the way: fire safety travels with every crew." },
      { act: "moon", e: "Where", t: "The lunar south pole.", b: "Ridges near the pole see sunlight most of the time, for solar power and warmth, while nearby craters keep water ice in permanent shadow. NASA's laser altimeter has mapped the candidate sites at 5 m per pixel; the orange marker is ours." },
      { act: "moon", e: "The air", t: "Richer air, lower pressure.", b: "To save mass and shorten the preparation for each spacewalk, the base is planned at about 30% oxygen and 10.2 psi. The ISS keeps Earth-like air: 21% oxygen at 14.7 psi." },
      { act: "base", e: "Landing", t: `The ${s.name || "Connecting ridge"}.`, b: `This is real terrain from NASA's LOLA altimeter, ${Math.round(s.z || 1959).toLocaleString("en-US")} m above the lunar datum, lit by the Sun where JPL Horizons puts it today: barely above the horizon, so shadows run for kilometres. A habitat, an airlock and a pressurized rover. Drag to look around, or click a module to cut it open.` },
      { act: "base", e: "The problem", t: "In this air, fires stop putting themselves out.", b: `A droplet fire puts itself out ${pct(cab.p)} of the time in ISS air, but only ${pct(moon.p)} in the base's air, and no solid material has ever burned in orbit above ${SO.max_o2_any_solid_pct}% oxygen. The next chapters show why.`, link: ["#/findings/audit", "See the full base audit →"] },
    ];
  }
  function xpSources() {
    const SO = D.solids, cab = pAt(0.21, 1), moon = pAt(0.30, 0.694);
    const inv = (id) => INV.find((r) => r.psi_id === id) || { n_tests: 0 };
    const sp = (MB && MB.sources && MB.sources.spread && MB.sources.spread.sibal_mm_s) || [2.1, 2.6];
    const s1 = (D.saffire1 || []).find((x) => /oncurrent/.test(x.direccion)) || { tiempo_quemado_s: 420 };
    return [
      { id: "wiring", label: "Wiring and cable bundles", inv: "SAME · SAME-R", psi: "PSI-101", steps: [
        ["It starts with heat, not a flame.", "A wire overheats or arcs, and its insulation (Teflon, Kapton) smoulders long before anything burns."],
        ["In orbit, smoke does not rise.", "Without buoyancy the smoke goes where the fans push it, and its particles grow as they age on the way."],
        ["What NASA measured.", `SAME and SAME-R heated Teflon, Kapton, silicone, cotton lampwick and Pyrell foam on the ISS in ${inv("PSI-101").n_tests + inv("PSI-102").n_tests} runs to measure the smoke a detector has to see.`],
        ["Catch it and stop it.", "The detector sits in the return air. The crew cuts power to the circuit, stops the fans and isolates the module."]] },
      { id: "fabric", label: "Fabric and stowage bags", inv: "Saffire · BASS-II", psi: "PSI-99", steps: [
        ["A soft target.", "Stowage bags, clothing and towels fill every module, and a hot surface or a spark can light their fibres."],
        ["The flame creeps along the fabric.", "With the fans on, the flame spreads along the cloth in the direction of the airflow."],
        ["What NASA measured.", `On Cygnus cargo ships after leaving the ISS, Saffire burned large fabric samples: flames spread at ${sp.join(" and ")} mm/s at about 22% O₂, and a 94 cm sample burned for ${s1.tiempo_quemado_s} s. No fabric has burned in orbit above ${SO.max_o2_any_solid_pct}% O₂.`],
        ["Catch it and stop it.", "Smoke reaches the detector within the airflow. The crew stops the fans and uses the CO₂ extinguisher; at 30% O₂ nobody has measured how much faster fabric burns."]] },
      { id: "liquid", label: "Fuel or alcohol leak", inv: "FLEX", psi: "PSI-69", steps: [
        ["A leak becomes floating droplets.", "In orbit a spilled liquid does not pool: it breaks into droplets that drift through the cabin."],
        ["Each droplet burns as a sphere.", "Oxygen reaches the fuel only by diffusion, so each droplet wears a round blue flame that shrinks as it burns."],
        ["What NASA measured.", `FLEX burned ${M.n} droplets on the ISS. The validated model says a methanol droplet fire puts itself out ${pct(cab.p)} of the time in ISS air, but only ${pct(moon.p)} in the planned lunar-base air.`],
        ["Catch it and stop it.", "Droplet flames give little smoke, so detection is hard. CO₂ helps, but FLEX tested it only at lower oxygen than the base will have."]] },
      { id: "plastic", label: "Plastic parts and panels", inv: "BASS-II", psi: "PSI-25", steps: [
        ["Plastics are everywhere.", "Panels, handles, covers and labels are polymers; an electrical fault next to one can light it."],
        ["A gentle breeze keeps it alive.", "In orbit the flame hugs the plastic; the airflow from the fans brings it the oxygen it needs."],
        ["What NASA measured.", `BASS-II found acrylic (PMMA) flames survive down to ${SO.min_o2_pct}% O₂ with a breeze of about 2 cm/s, below the ${SO.g1_upward_limit_pct}% limit of the Earth test used to approve materials. In still air the limit is ${SO.zero_flow_o2_pct}%.`],
        ["Catch it and stop it.", `On the ISS (21% O₂) stopping the fans pushes the flame toward its limit. At the base's 30% O₂ it would keep burning even in still air.`]] },
      { id: "gas", label: "Gas leak", inv: "ACME CFI-G", psi: "PSI-159", steps: [
        ["A leaking gas line.", "Fuel or process gases from a leaking line or valve mix with the cabin air."],
        ["A flame you cannot see.", "In microgravity some gas flames settle into cool flames: a few hundred degrees, with almost no light."],
        ["What NASA measured.", `ACME CFI-G burned gas fuels in ${inv("PSI-159").n_tests} recorded tests on the ISS, confirmed cool flames in orbit and measured when each flame put itself out.`],
        ["Catch it and stop it.", "Optical detectors can miss a cool flame, so chemical sensing (CO, hydrocarbons) complements them. Isolating the line stops the fuel."]] },
    ];
  }
  function renderXpPanel() {
    const S = xpSources(), s = S.find((x) => x.id === xpState.src), el = $("#xp-src-panel");
    document.querySelectorAll("#xp-chips button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.s === xpState.src)));
    if (!s) { el.innerHTML = `<p class="label">Choose a source</p><p class="xp-src__b">Every glowing point is a real way fires start in spacecraft. Each one is tied to a NASA investigation that measured it in orbit.</p>`; return; }
    const i = xpState.step, [t, b] = s.steps[i];
    el.innerHTML = `
      <p class="label">${esc(s.label)}<span> · ${esc(s.inv)}</span></p>
      <div class="xp-steps">${s.steps.map((_, n) => `<button type="button" data-n="${n}" class="${n === i ? "is-on" : n < i ? "is-done" : ""}" aria-label="Step ${n + 1}"></button>`).join("")}</div>
      <h3 class="xp-src__t"><span>${i + 1}/4</span> ${esc(t)}</h3>
      <p class="xp-src__b">${esc(b)}</p>
      <div class="xp-src__nav"><button type="button" class="btn btn--line btn--sm" id="xp-prev" ${i === 0 ? "disabled" : ""}>←</button><button type="button" class="btn btn--fire btn--sm" id="xp-next">${i === 3 ? "Replay ↻" : "Next →"}</button><a class="src-link" href="${(INV.find((r) => r.psi_id === s.psi) || {}).psi_url || "#"}" target="_blank" rel="noopener">${esc(s.psi)} in NASA PSI ↗</a></div>`;
    el.querySelectorAll(".xp-steps button").forEach((bt) => bt.addEventListener("click", () => setXp(s.id, +bt.dataset.n)));
    $("#xp-prev").addEventListener("click", () => setXp(s.id, Math.max(0, i - 1)));
    $("#xp-next").addEventListener("click", () => setXp(s.id, i === 3 ? 0 : i + 1));
  }
  function setXp(id, step) {
    xpState.src = id; xpState.step = step;
    if (xpSrc) xpSrc.show(id, step);
    renderXpPanel();
  }
  function initXP() {
    const C = xpCards();
    $("#xp-cards").innerHTML = C.map((c, i) => `<article class="xp-card" data-i="${i}" data-act="${c.act}"><div class="xp-card__in"><p class="eyebrow">${esc(c.e)}</p><h2>${esc(c.t)}</h2><p>${esc(c.b)}</p>${c.link ? `<a class="src-link" href="${c.link[0]}">${c.link[1]}</a>` : ""}</div></article>`).join("");
    if (window.PhoenixMoon && window.THREE && MB) xpMoon = window.PhoenixMoon.init($("#xp-moon"), {});
    if (!xpMoon) $("#xp-moon").classList.add("lab3d__view--off");
    const S = xpSources();
    $("#xp-chips").innerHTML = S.map((s) => `<button type="button" data-s="${s.id}" aria-pressed="false"><i></i>${esc(s.label)}</button>`).join("");
    document.querySelectorAll("#xp-chips button").forEach((b) => b.addEventListener("click", () => setXp(b.dataset.s, 0)));
    if (window.PhoenixSources && window.THREE) xpSrc = window.PhoenixSources.init($("#xp-sources"), { sources: S.map((s) => ({ id: s.id, label: s.label })), onPick: (id) => setXp(id, 0) });
    if (!xpSrc) $("#xp-sources").classList.add("lab3d__view--off");
    renderXpPanel();
    if (!("IntersectionObserver" in window)) { safe(initWorlds, "worlds"); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      document.querySelectorAll(".xp-card").forEach((c) => c.classList.toggle("is-on", c === e.target));
      if (!xpMoon) return;
      if (e.target.dataset.act === "base" && xpMoon.mode() !== "base") xpMoon.descend();
      if (e.target.dataset.act === "moon" && xpMoon.mode() === "base") xpMoon.showMoon();
    }), { threshold: 0.55 });
    document.querySelectorAll(".xp-card").forEach((c) => io.observe(c));
    const rail = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) document.querySelectorAll("#xp-rail a").forEach((a) => a.classList.toggle("is-on", a.dataset.c === e.target.id));
      if (e.isIntersecting && e.target.id === "xp-4" && !xpState.worlds) { xpState.worlds = true; safe(initWorlds, "worlds"); }
    }), { rootMargin: "-45% 0px -45% 0px" });
    document.querySelectorAll(".xp-ch").forEach((c) => rail.observe(c));
  }

  const RC = D.records;
  const DSTATE = [["All", "All"], ["S", "Solids"], ["L", "Liquids"], ["G", "Gases"], ["M", "Smoke & dust"]];
  const DCOL = { S: C.orange, L: C.blue, G: C.violet, M: C.teal };
  const OUTS = [["1", "Went out on its own", C.blue], ["0", "Kept burning", C.orange], ["u", "No outcome label", C.ink4]];
  const BANDS = [[0, 0.16, "<16%"], [0.16, 0.19, "16–19%"], [0.19, 0.22, "19–22%"], [0.22, 0.26, "22–26%"], [0.26, 0.30, "26–30%"], [0.30, 0.40, "30–40%"], [0.40, 1.01, "≥40%"]];
  const dash = { state: "All", exp: new Set(), out: new Set(), band: null, box: null, moon: false };
  const rec = (r) => ({ exp: RC.experiments[r[0]], st: r[1], o2: r[2], p: r[3], assumed: !!r[4], out: r[5] == null ? "u" : String(r[5]), fuel: RC.fuels[r[6]], co2: r[7] });
  const RECS = RC ? RC.rows.map(rec) : [];
  const MOON = RC ? { o2: RC.moon_envelope.x_o2_min, p: RC.moon_envelope.p_atm_max } : { o2: 0.28, p: 0.744 };
  function dashPass(r, skip) {
    if (skip !== "state" && dash.state !== "All" && r.st !== dash.state) return false;
    if (skip !== "exp" && dash.exp.size && !dash.exp.has(r.exp)) return false;
    if (skip !== "out" && dash.out.size && !dash.out.has(r.out)) return false;
    if (skip !== "band" && dash.band != null) { const b = BANDS[dash.band]; if (r.o2 == null || r.o2 < b[0] || r.o2 >= b[1]) return false; }
    if (skip !== "box" && dash.box) { const [x0, x1, y0, y1] = dash.box; if (r.o2 == null || r.p == null || 100 * r.o2 < x0 || 100 * r.o2 > x1 || r.p < y0 || r.p > y1) return false; }
    if (skip !== "moon" && dash.moon && !(r.o2 != null && r.p != null && r.o2 >= MOON.o2 && r.p <= MOON.p)) return false;
    return true;
  }
  function renderDash() {
    if (!RC) { $("#dash").hidden = true; return; }
    $("#dash-state").innerHTML = DSTATE.map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${dash.state === k}">${l} <small>${k === "All" ? RECS.length.toLocaleString("en-US") : RECS.filter((r) => r.st === k).length.toLocaleString("en-US")}</small></button>`).join("");
    document.querySelectorAll("#dash-state button").forEach((b) => b.addEventListener("click", () => { dash.state = b.dataset.s; dash.exp.clear(); renderDash(); }));
    $("#dash-quick").innerHTML = `<button type="button" class="chip" id="dash-moon" aria-pressed="${dash.moon}">Only Moon-base air</button>`;
    $("#dash-moon").addEventListener("click", () => { dash.moon = !dash.moon; renderDash(); });
    const F = RECS.filter((r) => dashPass(r));
    const pills = [];
    if (dash.state !== "All") pills.push(["state", DSTATE.find((s) => s[0] === dash.state)[1]]);
    dash.exp.forEach((e) => pills.push(["exp:" + e, e]));
    dash.out.forEach((o) => pills.push(["out:" + o, OUTS.find((x) => x[0] === o)[1]]));
    if (dash.band != null) pills.push(["band", `O₂ ${BANDS[dash.band][2]}`]);
    if (dash.box) pills.push(["box", `O₂ ${dash.box[0].toFixed(0)}–${dash.box[1].toFixed(0)}% · ${dash.box[2].toFixed(2)}–${dash.box[3].toFixed(2)} atm`]);
    if (dash.moon) pills.push(["moon", "Moon-base air"]);
    $("#dash-active").innerHTML = pills.length ? `<span class="label">Filters</span>${pills.map(([k, l]) => `<button type="button" class="pill" data-k="${esc(k)}">${esc(l)} ✕</button>`).join("")}` : `<span class="note">No filter yet: showing all ${RECS.length.toLocaleString("en-US")} records.</span>`;
    document.querySelectorAll("#dash-active .pill").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.k;
      if (k === "state") dash.state = "All"; else if (k.startsWith("exp:")) dash.exp.delete(k.slice(4)); else if (k.startsWith("out:")) dash.out.delete(k.slice(4));
      else if (k === "band") dash.band = null; else if (k === "box") dash.box = null; else if (k === "moon") dash.moon = false;
      renderDash();
    }));
    const lab = F.filter((r) => r.out !== "u"), outN = lab.filter((r) => r.out === "1").length;
    const meas = F.filter((r) => r.o2 != null && r.p != null && !r.assumed);
    const moonN = F.filter((r) => r.o2 != null && r.p != null && r.o2 >= MOON.o2 && r.p <= MOON.p).length;
    const o2s = F.filter((r) => r.o2 != null).map((r) => r.o2).sort((a, b) => a - b);
    const kp = [
      [F.length.toLocaleString("en-US"), "records match"],
      [new Set(F.map((r) => r.exp)).size, "investigations"],
      [lab.length ? pct(outN / lab.length) : "—", `went out on its own (${outN} of ${lab.length} labelled)`],
      [o2s.length ? `${(100 * o2s[0]).toFixed(0)}–${(100 * o2s[o2s.length - 1]).toFixed(0)}%` : "—", "oxygen range covered"],
      [moonN, "inside the Moon-base envelope"],
      [meas.length.toLocaleString("en-US"), "with measured O₂ and pressure"],
    ];
    $("#dash-kpis").innerHTML = kp.map(([v, l]) => `<div><dd>${v}</dd><dt>${l}</dt></div>`).join("");
    if (!hasPlotly) return;
    const bandBase = RECS.filter((r) => dashPass(r, "band"));
    const bc = BANDS.map((b) => bandBase.filter((r) => r.o2 != null && r.o2 >= b[0] && r.o2 < b[1]));
    const el1 = plot("dash-o2", [{
      type: "bar", x: BANDS.map((b) => b[2]), y: bc.map((x) => x.length), customdata: BANDS.map((_, i) => i),
      marker: { color: BANDS.map((_, i) => dash.band == null || dash.band === i ? (i >= 5 ? C.orange : C.blue) : "rgba(148,163,184,.25)") },
      hovertemplate: "%{x} O₂: %{y} records<extra></extra>", text: bc.map((x) => x.length), textposition: "outside", cliponaxis: false, textfont: { color: C.ink2, size: 11 },
    }], layout({ margin: { l: 40, r: 10, t: 18, b: 36 }, yaxis: { title: { text: "Records" } }, bargap: 0.25 }));
    const outBase = RECS.filter((r) => dashPass(r, "out"));
    const el2 = plot("dash-out", [{
      type: "bar", orientation: "h", y: OUTS.map((o) => o[1]), x: OUTS.map((o) => outBase.filter((r) => r.out === o[0]).length), customdata: OUTS.map((o) => o[0]),
      marker: { color: OUTS.map((o) => !dash.out.size || dash.out.has(o[0]) ? o[2] : "rgba(148,163,184,.25)") },
      text: OUTS.map((o) => outBase.filter((r) => r.out === o[0]).length), textposition: "outside", cliponaxis: false, textfont: { color: C.ink2, size: 11 },
      hovertemplate: "%{y}: %{x} records<extra></extra>",
    }], layout({ margin: { l: 150, r: 40, t: 10, b: 30 }, yaxis: { autorange: "reversed" }, bargap: 0.35 }));
    const expBase = RECS.filter((r) => dashPass(r, "exp"));
    const ex = [...new Set(expBase.map((r) => r.exp))].map((e) => ({ e, n: expBase.filter((r) => r.exp === e).length, st: expBase.find((r) => r.exp === e).st })).sort((a, b) => b.n - a.n);
    const el3 = plot("dash-exp", [{
      type: "bar", orientation: "h", y: ex.map((x) => x.e), x: ex.map((x) => x.n), customdata: ex.map((x) => x.e),
      marker: { color: ex.map((x) => !dash.exp.size || dash.exp.has(x.e) ? DCOL[x.st] : "rgba(148,163,184,.25)") },
      text: ex.map((x) => x.n), textposition: "outside", cliponaxis: false, textfont: { color: C.ink2, size: 10.5 },
      hovertemplate: "%{y} (" + "%{customdata}" + "): %{x} records<extra></extra>",
    }], layout({ margin: { l: 130, r: 40, t: 6, b: 24 }, yaxis: { autorange: "reversed", tickfont: { size: 10.5 } }, bargap: 0.3, height: Math.max(150, 24 * ex.length + 44) }));
    const mapBase = RECS.filter((r) => dashPass(r, "box") && r.o2 != null && r.p != null);
    const tr = [];
    const moonH = D.habitats.find((x) => x.id === "moon_base");
    tr.push({ x: [30, 100, 100, 30, 30], y: [0.2, 0.2, moonH.p_atm, moonH.p_atm, 0.2], type: "scatter", mode: "lines", fill: "toself", fillcolor: "rgba(242,96,15,0.10)", line: { color: "rgba(251,146,60,0.6)", width: 1 }, hoverinfo: "skip" });
    ["S", "L", "G", "M"].forEach((k) => {
      const pts = mapBase.filter((r) => r.st === k);
      if (!pts.length) return;
      tr.push({ type: "scattergl", mode: "markers", x: pts.map((r) => 100 * r.o2), y: pts.map((r) => r.p), name: DSTATE.find((s) => s[0] === k)[1],
        text: pts.map((r) => `${r.exp} · ${r.fuel}`),
        marker: { size: 6, color: pts.map((r) => r.assumed ? "rgba(0,0,0,0)" : DCOL[k]), line: { color: DCOL[k], width: 1 }, opacity: 0.8 },
        hovertemplate: "%{text}<br>O₂ %{x:.1f}% · %{y:.2f} atm<extra></extra>" });
    });
    tr.push({ type: "scatter", mode: "markers+text", x: HUI.map((h) => 100 * h.x_o2), y: HUI.map((h) => h.p_atm), text: HUI.map((h) => h.name), textposition: "top right", textfont: { color: C.ink, size: 10.5 },
      marker: { symbol: "cross-thin-open", size: 14, color: C.ink, line: { color: C.ink, width: 2 } }, hovertemplate: "%{text}<extra></extra>" });
    const el4 = plot("dash-map", tr, layout({ dragmode: "select", margin: { l: 56, r: 16, t: 10, b: 46 }, xaxis: { title: { text: "Oxygen, % of the air" }, range: [8, 90] }, yaxis: { title: { text: "Pressure, atm" }, type: "log", range: [Math.log10(0.3), Math.log10(4)] },
      shapes: dash.box ? [{ type: "rect", x0: dash.box[0], x1: dash.box[1], y0: dash.box[2], y1: dash.box[3], line: { color: C.amber, width: 1.5, dash: "dot" }, fillcolor: "rgba(251,191,36,.06)" }] : [] }));
    const wire = (el, fn) => { if (!el || !el.on) return; el.removeAllListeners && el.removeAllListeners("plotly_click"); el.on("plotly_click", (ev) => { const p = ev.points && ev.points[0]; if (p) fn(p); }); };
    wire(el1, (p) => { dash.band = dash.band === p.customdata ? null : p.customdata; renderDash(); });
    wire(el2, (p) => { const k = p.customdata; dash.out.has(k) ? dash.out.delete(k) : dash.out.add(k); renderDash(); });
    wire(el3, (p) => { const k = p.customdata; dash.exp.has(k) ? dash.exp.delete(k) : dash.exp.add(k); renderDash(); });
    if (el4 && el4.on) {
      el4.removeAllListeners && el4.removeAllListeners("plotly_selected");
      el4.on("plotly_selected", (ev) => {
        if (!ev || !ev.range) return;
        const [x0, x1] = ev.range.x, [ly0, ly1] = ev.range.y;
        dash.box = [x0, x1, Math.pow(10, Math.min(ly0, ly1)), Math.pow(10, Math.max(ly0, ly1))];
        renderDash();
      });
    }
    $("#dash-tbl-cap").textContent = `${F.length.toLocaleString("en-US")} records · first ${Math.min(12, F.length)} shown`;
    $("#dash-table").innerHTML = `<thead><tr><th>Investigation</th><th>Fuel or material</th><th class="num">O₂</th><th class="num">atm</th><th>Outcome</th></tr></thead><tbody>${F.slice(0, 12).map((r) => `<tr><td>${esc(r.exp)}</td><td>${esc(r.fuel)}</td><td class="num">${r.o2 == null ? "—" : (100 * r.o2).toFixed(1) + "%"}${r.assumed ? "*" : ""}</td><td class="num">${r.p == null ? "—" : r.p.toFixed(2)}</td><td>${esc(OUTS.find((o) => o[0] === r.out)[1])}</td></tr>`).join("")}</tbody>`;
    $("#dash-csv").onclick = () => {
      const rows = [["investigation", "psi_id", "state", "fuel_or_material", "x_o2", "p_atm", "x_co2", "conditions_assumed", "went_out_on_its_own"]].concat(F.map((r) => [r.exp, RC.psi[r.exp], r.st, r.fuel, r.o2 ?? "", r.p ?? "", r.co2 ?? "", r.assumed ? 1 : 0, r.out === "u" ? "" : r.out]));
      const blob = new Blob([rows.map((r) => r.map((v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\n")], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "skylab_phoenix_filtered_records.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }
  $("#dash-reset") && $("#dash-reset").addEventListener("click", () => { dash.state = "All"; dash.exp.clear(); dash.out.clear(); dash.band = null; dash.box = null; dash.moon = false; renderDash(); });

  function renderBaseReport() {
    $("#mb-legend").innerHTML = Object.keys(TAG).map((t) => `<span>${tagHtml(t)} ${esc(TAG[t][1])}</span>`).join("");
    $("#mb-matrix").innerHTML = `<thead><tr><th>Module</th>${LAYERS.map(([, n]) => `<th>${n}</th>`).join("")}<th>Lunar gravity</th></tr></thead><tbody>${MB.modules.map((m) => `
      <tr data-m="${m.id}"><th scope="row"><b>${esc(m.name)}</b><small>${o2pct(m.x_o2)} O₂ · ${m.psi} psi · ${m.volume_m3} m³</small></th>${LAYERS.map(([k]) => `<td>${tagHtml(m.tests[k].status)}<span>${esc(m.tests[k].answer)}</span></td>`).join("")}<td>${tagHtml("gap")}<span>No test at 0.17 g</span></td></tr>`).join("")}</tbody>`;
    document.querySelectorAll("#mb-matrix tr[data-m]").forEach((r) => r.addEventListener("click", () => {
      const next = r.nextElementSibling, open = next && next.classList.contains("mb-detail");
      document.querySelectorAll("#mb-matrix .mb-detail").forEach((d) => d.remove());
      document.querySelectorAll("#mb-matrix tr[data-m]").forEach((x) => x.classList.remove("is-on"));
      if (open) return;
      const m = MB.modules.find((x) => x.id === r.dataset.m);
      r.classList.add("is-on");
      r.insertAdjacentHTML("afterend", `<tr class="mb-detail"><td colspan="6"><div class="mb-detail__g">${LAYERS.map(([k, n]) => `<div><p class="label">${n}</p><ul class="mb-facts">${m.tests[k].facts.map((f) => `<li><span>${esc(f.label)}</span><b>${esc(f.value)}</b>${tagHtml(f.tag)}<small>${esc(f.source)}</small></li>`).join("")}</ul></div>`).join("")}</div>${SI && SI.module && SI.module[m.id] ? mbBrief(SI.module[m.id], "mbm-" + m.id) : ""}</td></tr>`);
      wireCites(r.nextElementSibling);
    }));
    if (SI && SI.base && SI.base.report) { $("#mb-brief").innerHTML = mbBrief(SI.base.report, "mbr"); wireCites($("#mb-brief")); } else $("#mb-brief").hidden = true;
    $("#mb-flights").innerHTML = MB.report.flight_tests_needed.map((f, i) => `<article class="mb-flight"><span class="mb-flight__n">${String(i + 1).padStart(2, "0")}</span><b>${esc(f.what)}</b><p>${esc(f.why)}</p></article>`).join("");
    const s = MB.site;
    $("#mb-sources").innerHTML = [
      ["Terrain", s.dem, "https://pgda.gsfc.nasa.gov/products/78"],
      ["Moon globe", "NASA SVS CGI Moon Kit: LROC color and LOLA elevation", "https://svs.gsfc.nasa.gov/4720"],
      ["Sun and Earth position", "JPL Horizons API, observer on the Moon at the base site, every 3 hours from November 2026 to November 2027", "https://ssd.jpl.nasa.gov/horizons/"],
      ["Atmospheres", "Challenge brief: 30% O₂ at 10.2 psi for the base and rover; 26.5% O₂ at 10.2 psi for EVA prep", CHALLENGE_URL],
      ["Fire data", "BASS-II (PSI-25) boundary and gas sensors, Saffire-II (PSI-99) spread, FLEX (PSI-69) droplets and CO₂", "#/data"],
      ["Volumes", MB.modules.map((m) => `${m.name}: ${m.volume_ref}`).join(" · "), ""],
    ].map(([k, t, u]) => `<li><b>${k}</b><span>${esc(t)}</span>${u ? `<a href="${u}" ${u.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${u.startsWith("http") ? "Open ↗" : "See"}</a>` : ""}</li>`).join("");
  }
  const VIEWS = ["home", "learn", "flames", "lab", "findings", "ranking", "next", "ask", "data"];
  const ALIAS = { method: "data", base: "learn", scenario: "lab", atmospheres: "lab", problem: "lab", briefing: "ask", coverage: "findings", evidence: "findings", findings: "findings",
    investigations: "ranking", compare: "ranking", next: "next", earth: "next", quality: "data", archive: "data", sources: "data", solids: "flames", answer: "home", top: "home" };
  const done = {};
  const INIT = {
    home: () => { safe(renderHero, "hero"); safe(renderAnswers, "answers"); safe(renderHistory, "history"); safe(initGlobe, "globe"); },
    learn: () => { safe(initLearn, "learn"); safe(initXP, "learn experience"); },
    flames: () => { safe(renderStage, "stage"); safe(renderArchive, "archive"); safe(renderSolids, "solids"); },
    lab: () => { safe(initLab3D, "3d lab"); safe(renderHabitats, "habitats"); safe(() => { renderScenarioControls(); updateScenario(true); renderDrivers(); }, "scenario"); safe(applyUrlScenario, "url"); urlReady = true; },
    findings: () => { safe(renderDash, "dashboard"); if (MB) safe(renderBaseReport, "base audit"); safe(() => { renderCoverageFilters(); renderCovMode(); $("#cov-mode").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { covMode.m = b.dataset.m; renderCovMode(); })); }, "coverage"); safe(renderFindings, "findings"); safe(renderEvidence, "evidence"); },
    ranking: () => { safe(renderSurvival, "survival"); safe(() => { computeRobust(invState.hab); renderInvControls(); renderCriteria(); renderInvList(); renderCompare(); }, "investigations"); },
    next: () => { safe(renderNext, "next"); safe(renderEarth, "earth"); },
    ask: () => { safe(() => { renderAudience(); renderBrief(); renderAsk(""); }, "briefing"); },
    data: () => { safe(renderQuality, "quality"); safe(renderDownloads, "downloads"); safe(renderEarth, "resources"); },
  };
  function ensure(v) { if (!done[v] && INIT[v]) { done[v] = true; INIT[v](); } }
  function resizeIn(root) {
    if (!hasPlotly || !root) return;
    root.querySelectorAll(".js-plotly-plot").forEach((el) => { try { Plotly.Plots.resize(el); } catch (e) {} });
  }
  function viewOf(el) { const v = el && el.closest(".view"); return v ? v.dataset.view : null; }
  function parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [a, b] = h.split("/");
    if (!a) return { v: "home" };
    if (VIEWS.includes(a)) return { v: a, anchor: b || null };
    if (ALIAS[a]) return { v: ALIAS[a], anchor: document.getElementById(a) && !document.getElementById(a).classList.contains("view") ? a : null };
    const el = document.getElementById(a);
    return el && viewOf(el) ? { v: viewOf(el), anchor: a } : { v: "home" };
  }
  let current = null;
  function route() {
    const { v, anchor } = parseHash();
    ensure(v);
    const changed = v !== current;
    current = v;
    document.querySelectorAll(".view").forEach((s) => { s.hidden = s.dataset.view !== v; });
    document.querySelectorAll(".nav__links a").forEach((a) => a.classList.toggle("is-on", a.dataset.v === v));
    document.body.dataset.view = v;
    if (globe) { if (v === "home") globe.resume(); else globe.pause(); }
    if (lab3d) { if (v === "lab") lab3d.resume(); else lab3d.pause(); }
    if (learn3d) { if (v === "learn") learn3d.resume(); else learn3d.pause(); }
    [xpMoon, xpSrc].forEach((x) => x && (v === "learn" ? x.resume() : x.pause()));
    worlds.forEach((w) => w && (v === "learn" ? w.resume() : w.pause()));
    const view = document.querySelector(`.view[data-view="${v}"]`);
    view.querySelectorAll(".rv").forEach((el) => el.classList.add("in"));
    requestAnimationFrame(() => {
      resizeIn(view);
      const el = anchor && document.getElementById(anchor);
      if (el) { const d = el.closest("details"); if (d) d.open = true; el.scrollIntoView({ behavior: changed ? "instant" : "smooth", block: "start" }); }
      else if (changed) window.scrollTo({ top: 0, behavior: "instant" });
    });
    if (v !== "home") document.querySelectorAll(`.view:not([data-view="home"]) video`).forEach((x) => { if (viewOf(x) !== v) x.pause(); });
  }
  function go(target) {
    const id = String(target).replace(/^#\/?/, "");
    const el = document.getElementById(id);
    const v = VIEWS.includes(id) ? id : (el ? viewOf(el) : ALIAS[id]);
    if (!v) return;
    ensure(v);
    const next = el && !el.classList.contains("view") && id !== v ? `#/${v}/${id}` : `#/${v}`;
    if (location.hash === next) route(); else location.hash = next;
  }
  document.addEventListener("click", (e) => {
    const g = e.target.closest(".glabel__a");
    if (g) { e.preventDefault(); ensure("lab"); setPreset(g.dataset.hab); location.hash = "#/lab"; return; }
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const h = a.getAttribute("href");
    if (h.startsWith("#/") || h === "#") return;
    e.preventDefault();
    go(h);
  });

  function safe(fn, name) { try { fn(); } catch (e) { console.error(`[Skylab Phoenix] ${name} failed`, e); } }
  $("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); safe(() => renderAsk($("#ask-q").value), "ask"); });
  $("#brief-dl").addEventListener("click", () => download(`skylab-phoenix-briefing-${briefState.hab}.md`, briefMarkdown()));
  $("#brief-sim").addEventListener("click", () => { ensure("lab"); setPreset(briefState.hab); location.hash = "#/lab"; });
  $("#inv-search").addEventListener("input", (e) => { invState.q = e.target.value; renderInvList(); });
  document.querySelectorAll("#inv-mode button").forEach((b) => b.addEventListener("click", () => { invMode.m = b.dataset.m; renderInvList(); }));
  safe(() => { const dlg = $("#inv-modal"); dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); }, "modal");
  $("#find-more").addEventListener("click", () => { findAll = !findAll; renderFindings(); });
  $("#inv-more").addEventListener("click", () => { invState.all = !invState.all; renderInvGallery(invState.rows || filteredInv()); });
  $("#arch-more").addEventListener("click", () => { archState.all = !archState.all; renderArchive(); });
  $("#surv-more").addEventListener("click", () => { survState.all = !survState.all; renderSurvival(); });
  $("#share-btn").addEventListener("click", (e) => copyText(shareUrl(), e.currentTarget));
  $("#unc-details").addEventListener("toggle", () => { if ($("#unc-details").open) safe(renderUncMap, "uncertainty map"); });
  document.querySelectorAll("details").forEach((d) => d.addEventListener("toggle", () => { if (d.open) resizeIn(d); }));
  $("#built").innerHTML = `Pipeline run ${esc(D.generated)}<br>Python · pandas · scikit-learn · Plotly · three.js`;
  if (QS.has("o2") || QS.has("hab")) { if (!location.hash || location.hash === "#" || location.hash === "#scenario") history.replaceState(null, "", `${location.search}#/lab`); }
  if (window.I18N) safe(() => window.I18N.start(), "i18n");
  route();
  addEventListener("hashchange", route);
  safe(() => {
    const nav = $("#nav"), burger = $("#burger"), menu = $("#navLinks");
    const onScroll = () => nav.classList.toggle("is-scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    const close = () => { menu.classList.remove("is-open"); burger.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); };
    burger.addEventListener("click", () => { const open = !menu.classList.contains("is-open"); menu.classList.toggle("is-open", open); burger.classList.toggle("is-open", open); burger.setAttribute("aria-expanded", String(open)); });
    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
    const rv = [...document.querySelectorAll(".rv")];
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
      rv.forEach((el) => io.observe(el));
    } else rv.forEach((el) => el.classList.add("in"));
  }, "chrome");
  const hideLoading = () => { $("#loading").classList.add("done"); document.documentElement.classList.add("is-ready"); };
  requestAnimationFrame(hideLoading);
  setTimeout(hideLoading, 300);
})();
