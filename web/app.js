(function () {
  "use strict";
  const D = window.EMBER;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p, d = 0) => (p == null ? "—" : (100 * p).toFixed(d) + "%");
  const o2pct = (x) => pct(x, Math.round(x * 1000) % 10 ? 1 : 0);
  const num = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const ATM_PSI = 14.6959;
  const C = { ink: "#f1f5f9", ink2: "#cbd5e1", ink3: "#94a3b8", ink4: "#64748b", line: "rgba(203,213,225,0.08)", line2: "rgba(203,213,225,0.18)", bg: "#070a14", surface: "#0d1220", orange: "#f2600f", blue: "#0b93d6", violet: "#8b5cf6", teal: "#0f9d8f", amber: "#fbbf24" };
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
      hoverlabel: { bgcolor: "#121a2c", bordercolor: C.line2, font: { family: "Geist, Inter, sans-serif", color: C.ink, size: 12 }, align: "left" },
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
    Plotly.react(el, data, lay, CFG);
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
    $("#hero-lead").innerHTML = `NASA's archive holds ${S.ambient.toLocaleString("en-US")} flight fires with a known atmosphere. Only <b>${S.moon_envelope}</b> came near that air, and no solid material has burned in orbit above <b>${D.solids.max_o2_any_solid_pct}% O₂</b>. Skylab Phoenix turns the archive into fire-safety answers you can check, and says plainly where the data runs out.`;
  }
  function renderHabitats() {
    $("#habitats").innerHTML = D.habitats.map((hb) => {
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
      renderCoverage();
    }));
    $("#cov-legend").innerHTML = [
      legendItem("circle", C.ink2, "Measured conditions"), legendItem("circle", C.ink2, "Assumed cabin air", true),
      legendItem("cross", C.ink, "Habitat atmosphere"), legendItem("bar", "rgba(242,96,15,.35)", "Lunar-base envelope (challenge brief)"),
    ].join("");
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
      xaxis: { type: "log", range: [Math.log10(10.5), Math.log10(108)], tickvals: xt, ticktext: xt.map((v) => v + "%"), title: { text: "Oxygen mole fraction (log scale)" } },
      yaxis: { type: "log", range: [Math.log10(0.22), Math.log10(5.6)], tickvals: [0.25, 0.5, 0.7, 1, 2, 3, 5], title: { text: "Pressure, atm (log scale)" } },
      annotations: [{ x: Math.log10(48), y: Math.log10(0.24), text: "LUNAR-BASE ENVELOPE · ≥30% O₂ · ≤10.2 psi", showarrow: false, font: { family: "Geist Mono, JetBrains Mono, monospace", size: 10, color: C.ink3 }, xanchor: "center" }, ...habNotes],
      hovermode: "closest",
    }));
  }

  const invState = { hab: "moon_base", layer: "All", q: "", sel: null };
  const INV = D.investigations;
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
    $("#inv-habitat").innerHTML = D.habitats.map((x) => `<button aria-pressed="${x.id === invState.hab}" data-h="${x.id}">${esc(x.name)}</button>`).join("");
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
    if (!invState.sel || !rows.find((r) => r.psi_id === invState.sel)) invState.sel = rows.length ? rows[0].psi_id : null;
    $("#inv-list").innerHTML = rows.length ? rows.map((r, i) => {
      const s = scoreOf(r, invState.hab), rb = robust[r.psi_id];
      return `<button class="inv-row" role="option" aria-selected="${r.psi_id === invState.sel}" data-id="${r.psi_id}">
        <span class="rk">${String(i + 1).padStart(2, "0")}</span>
        <span><span class="nm">${esc(r.name)} <small>${r.psi_id}</small></span><span class="mt">${esc(r.family)} · ${r.type} · ${r.n_tests.toLocaleString("en-US")} records${r.n_with_outcome ? ` · ${r.n_with_outcome} labeled` : ""}</span></span>
        <span class="score"><span class="n">${s.toFixed(1)}</span><span class="bar"><i style="width:${s}%"></i></span>${rb != null && rb >= 0.05 ? `<span class="rb" title="Share of 2,000 random weightings in which it stays in the top 3">top 3 in ${Math.round(100 * rb)}%</span>` : ""}</span></button>`;
    }).join("") : '<p class="note" style="padding:18px">No investigation matches.</p>';
    document.querySelectorAll(".inv-row").forEach((b) => b.addEventListener("click", () => selectInv(b.dataset.id)));
    renderInvDetail();
  }
  function selectInv(id) {
    invState.sel = id;
    document.querySelectorAll(".inv-row").forEach((b) => b.setAttribute("aria-selected", b.dataset.id === id));
    renderInvDetail();
  }
  function vfRows(items, max = 7) {
    if (!items.length) return '<p class="note">—</p>';
    const more = items.length > max ? `<p class="note">+${items.length - max} more</p>` : "";
    return `<div class="vf">${items.slice(0, max).map((x) => `<div class="row"><span class="k">${esc(x.variable)}</span><span class="v">${esc(x.values)}</span></div>`).join("")}</div>${more}`;
  }
  function renderInvDetail() {
    const r = INV.find((x) => x.psi_id === invState.sel);
    const el = $("#inv-detail");
    if (!r) { el.innerHTML = '<p class="note">Select an investigation.</p>'; return; }
    const rel = r.relevance[invState.hab];
    const bar = (v) => `<span class="bar"><i style="width:${100 * v}%"></i></span>`;
    const cond = r.o2_min != null
      ? `${pct(r.o2_min, 1)}–${pct(r.o2_max, 1)} O₂ · ${num(r.p_min)}–${num(r.p_max)} atm${r.conditions_assumed ? " (cabin air assumed)" : ""}`
      : "Not reported per test";
    const tables = r.tables.map((t) => `
      <div class="label">${esc(t.table)} · ${t.rows} rows</div>
      <div class="pair">
        <div><div class="k-head">What varied</div>${vfRows(t.varied)}</div>
        <div><div class="k-head">What was measured</div>${vfRows(t.measured)}</div>
      </div>
      ${t.fixed.length ? `<div class="note"><b>Held fixed:</b> ${t.fixed.slice(0, 6).map((x) => `${esc(x.variable)} = ${esc(x.values)}`).join(" · ")}</div>` : ""}`).join("");
    const pubs = r.publications.length ? `<div class="label">Publications · ${r.n_publications} listed in PSI</div><div class="pubs">${r.publications.slice(0, 3).map((p) => `<div>${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}<small>${esc((p.authors || "").split(",").slice(0, 3).join(","))}${(p.authors || "").split(",").length > 3 ? " et al." : ""}</small></div>`).join("")}</div>` : "";
    el.innerHTML = `
      <div class="tags">${r.layers.map((l) => `<span class="tag solid layer-${l}">${l}</span>`).join("")}<span class="tag">${r.type}</span><span class="tag">${esc(r.family)}</span></div>
      <h3>${esc(r.name)}<small>${r.psi_id}</small></h3>
      <div class="ttl">${esc(r.title)}</div>
      ${SI && SI.investigation[r.psi_id] ? `<div class="si-sum">${badge(SI.investigation[r.psi_id])}<p>${sentencesHtml(SI.investigation[r.psi_id], "inv")}</p>${evidenceHtml(SI.investigation[r.psi_id], "inv")}</div>` : ""}
      <div class="label">Objective · NASA PSI text</div>
      <p class="obj">${esc(r.objective || "No objective text in PSI metadata.")}</p>
      <div class="meta">
        <div><span>Science team</span><b>${esc(r.pi || "—")}</b></div>
        <div><span>Platform</span><b>${esc(r.platform)}</b></div>
        <div><span>Hardware</span><b>${esc(r.hardware)}</b></div>
        <div><span>Conditions tested</span><b>${cond}</b></div>
      </div>
      <div class="label">Relevance for ${esc(habName(invState.hab))} · ${scoreOf(r, invState.hab).toFixed(1)} / 100</div>
      <div class="breakdown">
        <div class="r"><span>Atmosphere closeness ×${wt.w[0].toFixed(2)}</span>${bar(rel.proximity)}<span class="n">${rel.proximity.toFixed(2)}</span></div>
        <div class="r"><span>${wt.vol === "records" ? "Measured records" : "Labeled outcomes"} ×${wt.w[1].toFixed(2)}</span>${bar(volOf(r, invState.hab))}<span class="n">${volOf(r, invState.hab).toFixed(2)}</span></div>
        <div class="r"><span>Fire-safety directness ×${wt.w[2].toFixed(2)}</span>${bar(rel.directness)}<span class="n">${rel.directness.toFixed(2)}</span></div>
      </div>
      <p class="note">≈${rel.n_near} test-equivalents within ~3 points of O₂ and ~30% of the pressure of this habitat.</p>
      ${tables || '<p class="note">No experimental table in PSI (ground or modeling investigation).</p>'}
      ${r.earth_benefit ? `<div class="label">Benefit on Earth · from PSI</div><p class="obj">${esc(r.earth_benefit)}</p>` : ""}
      ${pubs}
      <div class="links">
        <a class="btn btn--fire btn--sm" href="${r.psi_url}" target="_blank" rel="noopener">Open in NASA PSI <span aria-hidden="true">↗</span></a>
        ${r.doi ? `<a class="btn btn--line btn--sm" href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">Dataset DOI ↗</a>` : ""}
        <button class="btn btn--line btn--sm" type="button" id="add-cmp">Add to comparison</button>
      </div>`;
    wireCites(el);
    $("#add-cmp").addEventListener("click", () => {
      if (!cmpState.ids.includes(r.psi_id)) { cmpState.ids = [r.psi_id, ...cmpState.ids.filter((x) => x !== r.psi_id)].slice(0, 3); }
      renderCompare();
      document.getElementById("compare").scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
    $("#presets").innerHTML = D.habitats.map((x) => `<button data-h="${x.id}" aria-pressed="${sc.preset === x.id}">${esc(x.name)}<span>${o2pct(x.x_o2)} · ${num(x.p_atm * ATM_PSI, 1)} psi</span></button>`).join("");
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
  }
  const viz = { view: "curve", clickBound: false };
  const PSI = (atm) => atm * ATM_PSI;
  const PSI_TICKS = [4.4, 7.3, 10.2, 14.7, 22, 29.4, 44];
  function statusAt(x) { const nn = neighbors(x), thr = M.ood_threshold; return nn.dist > thr || outOfRange(x).length ? (nn.dist > 2 * thr ? "outside" : "extrapolating") : "within"; }
  function renderVizControls() {
    $("#viz-seg").innerHTML = [["curve", "Simple · oxygen curve"], ["map", "Map · oxygen × pressure"]].map(([k, l]) => `<button type="button" aria-pressed="${viz.view === k}" data-v="${k}">${l}</button>`).join("");
    document.querySelectorAll("#viz-seg button").forEach((b) => b.addEventListener("click", () => { viz.view = b.dataset.v; renderVizControls(); renderMap(true); }));
  }
  function renderMap() {
    if (!$("#viz-seg").children.length) renderVizControls();
    const dil = [sc.co2 ? `${(100 * sc.co2).toFixed(0)}% CO₂` : "", sc.he ? `${(100 * sc.he).toFixed(0)}% helium` : ""].filter(Boolean).join(" + ") || "no suppressant";
    if (viz.view === "curve") renderCurve(dil); else renderRiskMap(dil);
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
        colorscale: [[0, "#0d1220"], [0.3, "#3b1d6e"], [0.55, "#e11d48"], [0.78, "#f97316"], [1, "#fde68a"]],
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

  let findLayer = "All";
  function renderFindings() {
    $("#find-layer").innerHTML = ["All", "Prevention", "Detection", "Suppression"].map((l) => `<button aria-pressed="${l === findLayer}" data-l="${l}">${l}</button>`).join("");
    document.querySelectorAll("#find-layer button").forEach((b) => b.addEventListener("click", () => { findLayer = b.dataset.l; renderFindings(); }));
    const comp = [["volume", "Volume"], ["quality", "Quality"], ["agreement", "Agreement"], ["closeness", "Lunar fit"]];
    $("#findings-list").innerHTML = D.findings.filter((f) => findLayer === "All" || f.layer === findLayer).map((f) => `
      <article class="finding l-${f.layer}">
        <div class="sc">${Math.round(f.score)}<small>Evidence score</small></div>
        <div><span class="tag solid layer-${f.layer}">${esc(f.layer)}</span><h4>${esc(f.title)}</h4><p>${esc(f.text)}</p><div class="impl">${esc(f.implication)}</div><div class="src">Source · ${esc(f.source)}</div></div>
        <div class="mini">${comp.map(([k, l]) => `<div class="r"><span>${l}</span><span class="score"><span class="bar"><i style="width:${100 * f.components[k]}%"></i></span></span></div>`).join("")}</div>
      </article>`).join("");
  }

  const nextState = { co2: null };
  function pickLabel(k) { return `${o2pct(k.x_o2)} O₂ · ${PSI(k.p_atm).toFixed(1)} psi · ${(100 * k.x_co2).toFixed(0)}% CO₂`; }
  function renderNext() {
    const N = D.next, k = N.picks[0];
    const asks = k.x_co2 > 0
      ? `How much CO₂ it takes to put out a ${k.fuel.toLowerCase()} fire in air close to the lunar base (${o2pct(k.x_o2)} O₂, ${PSI(k.p_atm).toFixed(1)} psi).`
      : `Whether a ${k.fuel.toLowerCase()} fire goes out on its own in air close to the lunar base.`;
    $("#mission").innerHTML = `
      <div class="mission__main">
        <p class="label">Recommended flight test · #1 of ${N.picks.length}</p>
        <h3 class="mission__title">${esc(k.fuel)} droplet <span class="mute">at</span> ${o2pct(k.x_o2)} O₂, ${PSI(k.p_atm).toFixed(1)} psi <span class="mute">with</span> ${(100 * k.x_co2).toFixed(0)}% CO₂</h3>
      </div>
      <dl class="mission__facts">
        <div><dt>What it answers</dt><dd>${esc(asks)}</dd></div>
        <div><dt>Why this one</dt><dd>Today the model can only say the flame goes out on its own somewhere between <b>${pct(k.interval[0])} and ${pct(k.interval[1])}</b> of the time. That is the widest doubt near lunar-base air, so one flight here teaches the most.</dd></div>
        <div><dt>How it was chosen</dt><dd>Active learning: the 200 bootstrap models were asked about every candidate atmosphere near the lunar base; this is where they disagree most.</dd></div>
      </dl>`;
    const narrow = innerWidth < 700;
    const P = N.picks.map((q, i) => ({ ...q, i, lab: narrow ? `#${i + 1}` : `#${i + 1}  ${pickLabel(q)}` })).reverse();
    plot("range-chart", [
      { x: P.map((q) => q.p_ext), y: P.map((q) => q.lab), type: "scatter", mode: "markers", marker: { size: 12, color: C.ink, line: { color: C.bg, width: 2 } },
        customdata: P.map((q) => [q.interval[0], q.interval[1]]), hovertemplate: "<b>%{y}</b><br>best estimate %{x:.0%}<br>could be anywhere from %{customdata[0]:.0%} to %{customdata[1]:.0%}<extra></extra>" },
    ], layout({
      margin: { l: 10, r: 18, t: 6, b: 44 },
      shapes: P.map((q) => ({ type: "line", xref: "x", yref: "y", x0: q.interval[0], x1: q.interval[1], y0: q.lab, y1: q.lab, line: { color: q.i === 0 ? C.orange : C.ink4, width: q.i === 0 ? 12 : 8 }, layer: "below" })),
      xaxis: { range: [0, 1], tickformat: ".0%", tickvals: [0, 0.25, 0.5, 0.75, 1], title: { text: narrow ? "Chance it goes out on its own" : "Chance the flame goes out on its own (today's estimate)" } },
      yaxis: { type: "category", tickfont: { family: "Geist Mono, monospace", size: 11.5, color: C.ink2 }, gridcolor: "rgba(0,0,0,0)" },
    }));
    $("#next-sub").textContent = "A long bar means the model does not know yet. The dot is its best guess.";
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
        colorscale: [[0, "#0d1220"], [0.5, "#5b21b6"], [1, "#ddd6fe"]],
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
    $("#qc-sub").textContent = `${D.qc.length} entries · spreadsheet auto-fill errors, impossible values, duplicate rows, inconsistent labels`;
    $("#qc-table").innerHTML = `<thead><tr><th>PSI</th><th>Experiment</th><th>Record</th><th>Field</th><th>Original</th><th>New</th><th>Rule</th></tr></thead><tbody>${D.qc.map((q) => `<tr><td class="mono">${esc(q.psi_id)}</td><td>${esc(q.experimento)}</td><td class="mono">${esc(q.registro)}</td><td>${esc(q.campo)}</td><td class="mono">${esc(q.valor_original)}</td><td class="mono">${esc(q.valor_nuevo)}</td><td>${esc(q.regla)}</td></tr>`).join("")}</tbody>`;
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
    if (QS.get("hab") && D.habitats.some((x) => x.id === QS.get("hab"))) setPreset(QS.get("hab"));
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
    $("#brief-hab").innerHTML = D.habitats.map((x) => `<button aria-pressed="${x.id === briefState.hab}" data-h="${x.id}">${esc(x.name)}</button>`).join("");
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
      ["Download the unified tables", "1,989 tests in SI units with a logged correction trail.", { go: "#quality" }]] },
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
  function renderCompare() {
    const opts = [...INV].sort((a, b) => a.name.localeCompare(b.name));
    $("#cmp-pick").innerHTML = cmpState.ids.map((id, k) => `<label class="pick"><span class="label" style="margin:0">#${k + 1}</span><select data-k="${k}" aria-label="Investigation ${k + 1}"><option value="">—</option>${opts.map((r) => `<option value="${r.psi_id}" ${r.psi_id === id ? "selected" : ""}>${esc(r.name)} · ${r.psi_id}</option>`).join("")}</select></label>`).join("");
    document.querySelectorAll("#cmp-pick select").forEach((s) => s.addEventListener("change", () => { cmpState.ids[+s.dataset.k] = s.value; renderCompare(); }));
    const R = cmpState.ids.map((id) => INV.find((r) => r.psi_id === id)).filter(Boolean);
    if (!R.length) { $("#cmp-table").innerHTML = ""; $("#cmp-note").textContent = "Pick an investigation."; return; }
    const hab = invState.hab;
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
      ["ensayos.csv", "All 1,989 test records in one schema, SI units (CSV)"],
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
  function renderDests() {
    $("#dests").innerHTML = Object.entries(DEST).map(([k, d]) => {
      const x = destInfo(k);
      return `<li class="dst"><span class="dst__n">${esc(d.label)}</span><b>${esc(d.title)}</b>
        <span class="atm"><span>${o2pct(x.hb.x_o2)} O₂</span><span>${num(x.hb.p_atm * ATM_PSI, 1)} psi</span><span>${d.g}</span></span>
        <span class="dst__v${x.muted ? " muted" : ""}">${x.v}</span><span class="dst__l">${esc(x.l)}</span><span class="dst__t">${esc(x.t)}</span>
        <a class="dst__go" href="#/lab" data-hab="${d.hab}">Open in the Fire Lab →</a></li>`;
    }).join("");
    document.querySelectorAll("#dests [data-hab]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); ensure("lab"); setPreset(a.dataset.hab); location.hash = "#/lab"; }));
  }
  function destDetail(id) {
    const x = destInfo(id);
    return `<span class="glabel__v${x.muted ? " muted" : ""}">${x.v}</span><span class="glabel__l">${esc(x.l)}</span><a href="#/lab" class="glabel__a" data-hab="${DEST[id].hab}">Open in the Fire Lab →</a>`;
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
    const tiles = [
      ["flames", "Flames", "Real ISS flight video: the same plastic at four oxygen levels, plus fabric, film, a droplet and a gas sphere."],
      ["lab", "Fire Lab", "Set oxygen, pressure and suppressant; a validated model answers with uncertainty."],
      ["findings", "Findings", "Where NASA has flown fire versus where crews will live, and what the tests show."],
      ["ranking", "Ranking", "The 24 investigations ranked for your habitat, with weights you can change."],
      ["next", "Next flight", "The experiment NASA should fly next, chosen by where the models disagree most."],
      ["ask", "Ask SI", "Cited briefings checked by code, and a search over NASA's own text."],
    ];
    $("#tiles").innerHTML = tiles.map(([v, t, d], i) => `<a class="tile" href="#/${v}"><span class="tile__n">${String(i + 1).padStart(2, "0")}</span><b>${t}</b><small>${d}</small><span class="tile__go" aria-hidden="true">→</span></a>`).join("");
  }

  const ROD = [
    { f: "bass2-rod-15", o2: 15.1, test: "O17", flow: "3 cm/s, then 0, then 11", x: 2.2, cap: "Small, dim and blue. Near the limit there is little soot left to glow, yet the flame holds on." },
    { f: "bass2-rod-17", o2: 16.7, test: "O10", flow: "5, 2, then 0 cm/s", x: 3.0, cap: "Brighter, with a yellow tail: a little more oxygen already means more soot." },
    { f: "bass2-rod-18", o2: 18.0, test: "O3b", flow: "5, 3, 2, 1 cm/s, then lower", x: 4.0, cap: "Orange and sooty, wrapped around the tip; it shrinks each time the airflow is turned down." },
    { f: "bass2-rod-22", o2: 22.2, test: "O1", flow: "20, 10, 5, 2, then 1 cm/s", x: 6.6, cap: "Air close to the station's: a large, bright, sooty flame that changes shape as the airflow drops." },
  ];
  const REEL = [
    { f: "bass2-sibal-18", kind: "Solid · fabric", t: "SIBAL cotton-fiberglass fabric", m: "18.5% O₂ · 10 cm/s · BASS-II test T1", x: 1.2, psi: "PSI-25", cap: "A small, dim flame on a 2 cm strip of the fabric NASA uses as a cabin-textile stand-in." },
    { f: "bass2-film-22", kind: "Solid · thin film", t: "100 µm acrylic film", m: "22.2% O₂ · 5 cm/s · BASS-II test B1", x: 1.8, psi: "PSI-25", cap: "Thin material burns as a flame front that travels along the strip." },
    { f: "cfi-droplet", kind: "Liquid · fuel droplet", t: "Fuel droplet, backlit", m: "Cool Flame Investigation · CIR rack", x: 6, psi: "PSI-39", cap: "Two needles deploy the droplet (dark disc), a hot wire lights it, and it shrinks as it burns." },
    { f: "cfig-butane-39", kind: "Gas · burner flame", t: "Butane from a spherical burner", m: "39.1% O₂ · 1 atm · ACME CFI-G test 21102 B1", x: 4.5, psi: "PSI-159", cap: "Nothing rises, so the flame is a sphere. NASA's table: it went out on its own after 38 s." },
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
  function renderReel() {
    $("#reel").innerHTML = REEL.map((r) => `<figure class="clip"><div class="clip__v"><video data-src="${vidUrl(r.f)}" poster="assets/video/${r.f}.jpg" muted loop playsinline preload="none"></video><span class="stage__tag">×${r.x}</span></div>
      <figcaption><span class="label">${esc(r.kind)}</span><b>${esc(r.t)}</b><span class="mono-sm">${esc(r.m)}</span><small>${esc(r.cap)}</small><a class="src-link" href="${psiUrl(r.psi)}" target="_blank" rel="noopener">${r.psi} ↗</a></figcaption></figure>`).join("");
    const vids = [...document.querySelectorAll("#reel video")];
    const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause();
    }), { threshold: 0.25 }) : null;
    vids.forEach((v) => (io ? io.observe(v) : (v.src = v.dataset.src)));
  }

  const VIEWS = ["home", "flames", "lab", "findings", "ranking", "next", "ask", "data"];
  const ALIAS = { scenario: "lab", atmospheres: "lab", problem: "lab", briefing: "ask", coverage: "findings", evidence: "findings", findings: "findings",
    investigations: "ranking", compare: "ranking", next: "next", earth: "next", quality: "data", archive: "data", sources: "data", solids: "flames", answer: "home", top: "home" };
  const done = {};
  const INIT = {
    home: () => { safe(renderHero, "hero"); safe(renderAnswers, "answers"); safe(renderHistory, "history"); safe(renderDests, "destinations"); safe(initGlobe, "globe"); },
    flames: () => { safe(renderStage, "stage"); safe(renderReel, "reel"); safe(renderSolids, "solids"); },
    lab: () => { safe(renderHabitats, "habitats"); safe(() => { renderScenarioControls(); updateScenario(true); renderDrivers(); }, "scenario"); safe(applyUrlScenario, "url"); urlReady = true; },
    findings: () => { safe(() => { renderCoverageFilters(); renderCoverage(); }, "coverage"); safe(renderFindings, "findings"); safe(renderEvidence, "evidence"); },
    ranking: () => { safe(() => { computeRobust(invState.hab); renderInvControls(); renderCriteria(); renderInvList(); renderCompare(); }, "investigations"); },
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
  $("#share-btn").addEventListener("click", (e) => copyText(shareUrl(), e.currentTarget));
  $("#unc-details").addEventListener("toggle", () => { if ($("#unc-details").open) safe(renderUncMap, "uncertainty map"); });
  document.querySelectorAll("details").forEach((d) => d.addEventListener("toggle", () => { if (d.open) resizeIn(d); }));
  $("#built").innerHTML = `Pipeline run ${esc(D.generated)}<br>Python · pandas · scikit-learn · Plotly · three.js`;
  if (QS.has("o2") || QS.has("hab")) { if (!location.hash || location.hash === "#" || location.hash === "#scenario") history.replaceState(null, "", `${location.search}#/lab`); }
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
