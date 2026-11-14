/* EMBER dashboard — renders the pipeline export (window.EMBER) and runs the models client-side. */
(function () {
  "use strict";
  const D = window.EMBER;
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, html = "") => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.innerHTML = html;
    return e;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p, d = 0) => (p == null ? "—" : (100 * p).toFixed(d) + "%");
  const o2pct = (x) => pct(x, Math.round(x * 1000) % 10 ? 1 : 0); // 26.5% but 30%, 100%
  const num = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const ATM_PSI = 14.6959;
  const C = { ink: "#f1f5f9", ink2: "#cbd5e1", ink3: "#94a3b8", ink4: "#64748b", line: "#1c2640", line2: "#29355a", bg: "#070a14", surface: "#0d1220", g2: "#cbd5e1", g3: "#94a3b8", g4: "#64748b", g5: "#475569", orange: "#f2600f", blue: "#0b93d6", violet: "#8b5cf6", teal: "#0f9d8f", amber: "#fbbf24", rose: "#f43f5e" };
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
      tickfont: { family: "JetBrains Mono, monospace", size: 10.5, color: C.ink3 },
      title: { font: { size: 12, color: C.ink2, family: "Inter, sans-serif" }, standoff: 12 },
    };
    const base = {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, sans-serif", color: C.ink3, size: 11.5 },
      margin: { l: 56, r: 18, t: 12, b: 48 }, showlegend: false, dragmode: false,
      hoverlabel: { bgcolor: "#121a2c", bordercolor: C.line2, font: { family: "Inter, sans-serif", color: C.ink, size: 12 }, align: "left" },
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
      el.innerHTML = '<p class="note" style="padding:20px">Charts need the Plotly library (internet connection). All values are also available in the tables.</p>';
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

  /* =========================================================== model (runs in browser) */
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

  /* =========================================================== hero */
  function renderHero() {
    const S = D.summary;
    const auc = M.validation.models.find((m) => m.key === "lr").auc;
    const k = [
      [S.investigations, `<small>/ ${S.flight} flight</small>`, "PSI combustion investigations profiled and ranked"],
      [S.records.toLocaleString("en-US"), "", `test records cleaned into one schema · ${S.with_outcome} with a labeled outcome`],
      [S.qc_fixes, "", "corrections to NASA's tables, each one logged with the original value"],
      [S.moon_envelope, `<small>/ ${S.ambient.toLocaleString("en-US")}</small>`, "flight tests anywhere near lunar-base air"],
      [auc.toFixed(2), "<small>AUC</small>", "self-extinction model, scored on held-out ISS test days"],
    ];
    $("#kpis").innerHTML = k.map(([v, s, l]) => `<div class="kpi"><div class="v">${v}${s}</div><div class="l">${l}</div></div>`).join("");

    $("#habitats").innerHTML = D.habitats.map((hb) => {
      // same browser-side model as the scenario simulator, so the numbers always match
      const x = featVec({ fuel: "Methanol", o2: hb.x_o2, p: hb.p_atm, co2: 0, he: 0, d0: M.d0_median });
      const r = { ...predict(x), ood: neighbors(x).dist > 2 * M.ood_threshold };
      const atm = `<div class="atm"><span>${o2pct(hb.x_o2)} O₂</span><span>${num(hb.p_atm, 2)} atm</span><span>${num(hb.p_atm * ATM_PSI, 1)} psi</span></div>`;
      const body = r.ood
        ? `<div class="ood-note"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="${C.ink}" stroke-dasharray="2 2"/></svg><span><b>Outside all flight data.</b> No microgravity fire has been flown near this atmosphere — Skylab Phoenix withholds a prediction.</span></div>`
        : `<div class="pbar"><div class="plabel"><span>Self-extinguishes</span><b>${pct(r.p)}</b></div>
           <div class="track"><div class="ci" style="left:${100 * r.lo}%;width:${Math.max(1, 100 * (r.hi - r.lo))}%"></div><div class="pt" style="left:${100 * r.p}%"></div></div>
           <div class="plabel" style="margin-top:6px"><span>90% interval</span><span style="font-family:var(--mono)">${pct(r.lo)}–${pct(r.hi)}</span></div></div>`;
      return `<button class="hab" data-hab="${hb.id}" title="${esc(hb.source)}"><span class="go">SIMULATE →</span><div class="name">${esc(hb.name)}</div><div class="det">${esc(hb.detail)}</div>${atm}${body}</button>`;
    }).join("");
    document.querySelectorAll(".hab").forEach((b) => b.addEventListener("click", () => {
      setPreset(b.dataset.hab);
      document.getElementById("scenario").scrollIntoView({ behavior: "smooth" });
    }));
  }

  /* =========================================================== 01 coverage */
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
    // habitat labels as offset annotations so they never collide with each other
    const offs = { cabin: [-34, -38], eva_prep: [-46, 34], moon_base: [40, -38], suit: [-30, -34] };
    const habNotes = D.habitats.map((x) => ({
      x: Math.log10(100 * x.x_o2), y: Math.log10(x.p_atm), text: `<b>${esc(x.name)}</b>`, showarrow: true, arrowhead: 0, arrowwidth: 1,
      arrowcolor: C.ink3, ax: offs[x.id][0], ay: offs[x.id][1], font: { size: 12, color: C.ink, family: "Inter, sans-serif" },
      bgcolor: "rgba(7,10,20,0.85)", borderpad: 3,
    }));
    const xt = [12, 15, 20, 25, 30, 40, 60, 85, 100];
    plot("cov-chart", traces, layout({
      margin: { l: 64, r: 20, t: 10, b: 54 },
      xaxis: { type: "log", range: [Math.log10(10.5), Math.log10(108)], tickvals: xt, ticktext: xt.map((v) => v + "%"), title: { text: "Oxygen mole fraction (log scale)" } },
      yaxis: { type: "log", range: [Math.log10(0.22), Math.log10(5.6)], tickvals: [0.25, 0.5, 0.7, 1, 2, 3, 5], title: { text: "Pressure, atm (log scale)" } },
      annotations: [{ x: Math.log10(48), y: Math.log10(0.24), text: "LUNAR-BASE ENVELOPE · ≥30% O₂ · ≤10.2 psi", showarrow: false, font: { family: "JetBrains Mono, monospace", size: 10, color: C.ink3 }, xanchor: "center" }, ...habNotes],
      hovermode: "closest",
    }));
  }

  /* =========================================================== 02 investigations */
  const invState = { hab: "moon_base", layer: "All", q: "", sel: null };
  const INV = D.investigations;
  const habName = (id) => D.habitats.find((x) => x.id === id).name;
  function renderInvControls() {
    $("#inv-habitat").innerHTML = D.habitats.map((x) => `<button aria-pressed="${x.id === invState.hab}" data-h="${x.id}">${esc(x.name)}</button>`).join("");
    $("#inv-layer").innerHTML = ["All", "Prevention", "Detection", "Suppression"].map((l) => `<button aria-pressed="${l === invState.layer}" data-l="${l}">${l}</button>`).join("");
    document.querySelectorAll("#inv-habitat button").forEach((b) => b.addEventListener("click", () => { invState.hab = b.dataset.h; invState.sel = null; renderInvControls(); renderInvList(); }));
    document.querySelectorAll("#inv-layer button").forEach((b) => b.addEventListener("click", () => { invState.layer = b.dataset.l; renderInvControls(); renderInvList(); }));
  }
  function filteredInv() {
    const q = invState.q.trim().toLowerCase();
    return INV.filter((r) => invState.layer === "All" || r.layers.includes(invState.layer))
      .filter((r) => !q || [r.name, r.title, r.psi_id, r.pi, r.family, r.hardware, ...(r.keywords || [])].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.relevance[invState.hab].score - a.relevance[invState.hab].score);
  }
  function renderInvList() {
    const rows = filteredInv();
    if (!invState.sel || !rows.find((r) => r.psi_id === invState.sel)) invState.sel = rows.length ? rows[0].psi_id : null;
    $("#inv-list").innerHTML = rows.length ? rows.map((r, i) => {
      const s = r.relevance[invState.hab].score;
      return `<button class="inv-row" role="option" aria-selected="${r.psi_id === invState.sel}" data-id="${r.psi_id}">
        <span class="rk">${String(i + 1).padStart(2, "0")}</span>
        <span><span class="nm">${esc(r.name)} <small>${r.psi_id}</small></span><span class="mt">${esc(r.family)} · ${r.type} · ${r.n_tests.toLocaleString("en-US")} records${r.n_with_outcome ? ` · ${r.n_with_outcome} labeled` : ""}</span></span>
        <span class="score"><span class="n">${s.toFixed(1)}</span><span class="bar"><i style="width:${s}%"></i></span></span></button>`;
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
    const bar = (v) => `<span class="bar" style="height:4px;background:var(--surface-3);border-radius:4px;overflow:hidden;display:block"><i style="display:block;height:100%;width:${100 * v}%;background:var(--ink)"></i></span>`;
    const cond = r.o2_min != null
      ? `${pct(r.o2_min, 1)}–${pct(r.o2_max, 1)} O₂ · ${num(r.p_min)}–${num(r.p_max)} atm${r.conditions_assumed ? " (cabin air assumed)" : ""}`
      : "Not reported per test";
    const tables = r.tables.map((t) => `
      <div class="label-sm">${esc(t.table)} · ${t.rows} rows</div>
      <div class="pair">
        <div><div class="note" style="margin:0 0 4px"><b>What varied</b></div>${vfRows(t.varied)}</div>
        <div><div class="note" style="margin:0 0 4px"><b>What was measured</b></div>${vfRows(t.measured)}</div>
      </div>
      ${t.fixed.length ? `<div class="note" style="margin-top:8px"><b>Held fixed:</b> ${t.fixed.slice(0, 6).map((x) => `${esc(x.variable)} = ${esc(x.values)}`).join(" · ")}</div>` : ""}`).join("");
    const pubs = r.publications.length ? `<div class="label-sm">Publications · ${r.n_publications} listed in PSI</div><div class="pubs">${r.publications.slice(0, 3).map((p) => `<div>${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}<small>${esc((p.authors || "").split(",").slice(0, 3).join(","))}${(p.authors || "").split(",").length > 3 ? " et al." : ""}</small></div>`).join("")}</div>` : "";
    el.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap">${r.layers.map((l) => `<span class="tag solid layer-${l}">${l}</span>`).join("")}<span class="tag">${r.type}</span><span class="tag">${esc(r.family)}</span></div>
      <h3>${esc(r.name)} <span style="color:var(--ink-4);font-weight:400;font-size:15px;font-family:var(--mono)">${r.psi_id}</span></h3>
      <div class="ttl">${esc(r.title)}</div>
      <p class="obj">${esc(r.objective || "No objective text in PSI metadata.")}</p>
      <div class="meta">
        <div><span>Science team</span><b>${esc(r.pi || "—")}</b></div>
        <div><span>Platform</span><b>${esc(r.platform)}</b></div>
        <div><span>Hardware</span><b>${esc(r.hardware)}</b></div>
        <div><span>Conditions tested</span><b>${cond}</b></div>
      </div>
      <div class="label-sm">Relevance for ${esc(habName(invState.hab))} · ${rel.score.toFixed(1)} / 100</div>
      <div class="breakdown">
        <div class="r"><span>Condition proximity ×0.5</span>${bar(rel.proximity)}<span class="n">${rel.proximity.toFixed(2)}</span></div>
        <div class="r"><span>Labeled evidence ×0.2</span>${bar(rel.evidence)}<span class="n">${rel.evidence.toFixed(2)}</span></div>
        <div class="r"><span>Fire-safety directness ×0.3</span>${bar(rel.directness)}<span class="n">${rel.directness.toFixed(2)}</span></div>
      </div>
      <p class="note">≈${rel.n_near} test-equivalents within ~3 points of O₂ and ~30% of the pressure of this habitat.</p>
      ${tables || '<p class="note">No experimental table in PSI (ground or modeling investigation).</p>'}
      ${r.earth_benefit ? `<div class="label-sm">Benefit on Earth · from PSI</div><p class="obj" style="font-size:13.5px">${esc(r.earth_benefit)}</p>` : ""}
      ${pubs}
      <div class="links">
        <a class="btn primary" href="${r.psi_url}" target="_blank" rel="noopener">Open in NASA PSI ↗</a>
        ${r.doi ? `<a class="btn" href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">Dataset DOI ↗</a>` : ""}
      </div>`;
  }
  function renderSimilarity() {
    const S = D.similarity;
    const w = S.weights;
    $("#sim-sub").textContent = `Similarity = ${Math.round(100 * w.keywords_jaccard)}% shared keywords + ${Math.round(100 * w.same_family)}% same fuel family + ${Math.round(100 * w.same_hardware)}% same hardware + ${Math.round(100 * w.o2_range_overlap)}% overlapping O₂ range + ${Math.round(100 * w.linked_in_psi)}% linked in PSI · ordered by hierarchical clustering · click a cell to open it`;
    const el = plot("sim-chart", [{
      z: S.matrix, x: S.names, y: S.names, type: "heatmap", zmin: 0, zmax: 1, xgap: 1, ygap: 1,
      colorscale: [[0, "#0d1220"], [0.35, "#3b1d10"], [0.7, "#f2600f"], [1, "#fde68a"]],
      colorbar: { thickness: 8, outlinewidth: 0, tickfont: { family: "JetBrains Mono, monospace", size: 10, color: C.ink3 }, len: 0.6 },
      hovertemplate: "<b>%{y}</b> ↔ <b>%{x}</b><br>similarity %{z:.2f}<extra></extra>",
    }], layout({
      margin: { l: 150, r: 10, t: 6, b: 140 },
      xaxis: { tickangle: -50, gridcolor: "rgba(0,0,0,0)", tickfont: { family: "Inter, sans-serif", size: 11, color: C.ink2 } },
      yaxis: { autorange: "reversed", gridcolor: "rgba(0,0,0,0)", tickfont: { family: "Inter, sans-serif", size: 11, color: C.ink2 } },
    }));
    if (el) el.on("plotly_click", (ev) => {
      const name = ev.points[0].y;
      const id = S.ids[S.names.indexOf(name)];
      invState.layer = "All"; invState.q = ""; $("#inv-search").value = "";
      renderInvControls(); renderInvList(); selectInv(id);
      document.getElementById("investigations").scrollIntoView({ behavior: "smooth" });
    });
  }

  /* =========================================================== 03 scenario */
  const SL = [
    { k: "o2", label: "Oxygen", min: 0.10, max: 1.0, step: 0.005, fmt: (v) => `${(100 * v).toFixed(1)}%`, ticks: ["10%", "40%", "70%", "100%"] },
    { k: "p", label: "Pressure", min: 0.25, max: 3.2, step: 0.005, fmt: (v) => `${v.toFixed(2)} atm<small>${(v * ATM_PSI).toFixed(1)} psi</small>`, ticks: ["0.25", "1.0", "2.0", "3.2 atm"] },
    { k: "co2", label: "CO₂ diluent", min: 0, max: 0.7, step: 0.01, fmt: (v) => `${(100 * v).toFixed(0)}%`, ticks: ["0%", "35%", "70%"] },
    { k: "he", label: "Helium diluent", min: 0, max: 0.45, step: 0.01, fmt: (v) => `${(100 * v).toFixed(0)}%`, ticks: ["0%", "20%", "45%"] },
    { k: "d0", label: "Initial droplet diameter", min: 1.1, max: 4.7, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm`, ticks: ["1.1", "2.9", "4.7 mm"] },
  ];
  const sc = { fuel: "Methanol", o2: 0.30, p: 0.694, co2: 0, he: 0, d0: M.d0_median, preset: "moon_base" };
  function renderScenarioControls() {
    $("#presets").innerHTML = D.habitats.map((x) => `<button data-h="${x.id}" aria-pressed="${sc.preset === x.id}">${esc(x.name)}<br><span style="font-family:var(--mono);font-size:11px;color:var(--ink-4)">${o2pct(x.x_o2)} · ${num(x.p_atm * ATM_PSI, 1)} psi</span></button>`).join("");
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
    const nn = neighbors(x);
    const thr = M.ood_threshold;
    let status, show = true;
    if (nn.dist <= thr) status = `<span class="status"><span class="dot"></span>Within flight data</span>`;
    else if (nn.dist <= 2 * thr) status = `<span class="status warn"><span class="dot"></span>Extrapolating · use with caution</span>`;
    else { status = `<span class="status out"><span class="dot"></span>Outside flight data · prediction withheld</span>`; show = false; }
    $("#r-status").innerHTML = status;
    const big = $("#r-big");
    big.textContent = show ? pct(r.p) : "—";
    big.classList.toggle("muted", !show);
    const dil = [sc.co2 ? `${(100 * sc.co2).toFixed(0)}% CO₂` : "", sc.he ? `${(100 * sc.he).toFixed(0)}% He` : ""].filter(Boolean).join(" + ") || "no diluent";
    $("#r-cap").innerHTML = show
      ? `${sc.fuel} droplet, d₀ ${sc.d0.toFixed(2)} mm · ${(100 * sc.o2).toFixed(1)}% O₂ · ${sc.p.toFixed(2)} atm (${(sc.p * ATM_PSI).toFixed(1)} psi) · ${dil}`
      : `No ISS test was flown near this atmosphere (distance ${nn.dist.toFixed(1)} vs. limit ${thr.toFixed(1)}). This gap is itself a finding — see “Next experiment”.`;
    $("#r-ci").style.left = `${100 * r.lo}%`; $("#r-ci").style.width = `${Math.max(1, 100 * (r.hi - r.lo))}%`;
    $("#r-pt").style.left = `${100 * r.p}%`;
    $("#r-ci").style.opacity = show ? 1 : 0.25; $("#r-pt").style.opacity = show ? 1 : 0.25;
    $("#r-int").textContent = show ? `90% interval ${pct(r.lo)}–${pct(r.hi)} · ${BOOT.length} bootstrap models` : "Interval not shown outside the data";
    // neighbors
    const rows = nn.near.map((n) => {
      const t = M.train[n.i];
      return `<tr><td class="mono">${esc(t.fecha || "—")}</td><td>${esc(t.combustible)}</td><td class="num">${(100 * t.x_o2).toFixed(0)}%</td><td class="num">${num(t.p_atm)}</td><td class="num">${(100 * t.x_co2).toFixed(0)}%</td><td class="num">${(100 * t.x_he).toFixed(0)}%</td><td class="num">${num(t.d0_mm)}</td><td>${OUTCOME[t.resultado] || "—"}</td></tr>`;
    }).join("");
    $("#nn-table").innerHTML = `<thead><tr><th>Date</th><th>Fuel</th><th class="num">O₂</th><th class="num">atm</th><th class="num">CO₂</th><th class="num">He</th><th class="num">d₀ mm</th><th>Outcome</th></tr></thead><tbody>${rows}</tbody>`;
    $("#nn-note").textContent = `Mean distance to the 5 nearest tests: ${nn.dist.toFixed(2)} (out-of-data limit ${thr.toFixed(2)}, the 95th percentile among flown tests).`;
    renderMap(remap);
  }
  let mapDrawn = false;
  function renderMap(remap) {
    const o2 = [], p = [];
    for (let i = 0; i <= 60; i++) o2.push(0.10 + i * 0.005);
    for (let j = 0; j <= 48; j++) p.push(Math.exp(Math.log(0.3) + (j * (Math.log(3.2) - Math.log(0.3))) / 48));
    const scen = { x: [100 * sc.o2], y: [sc.p], type: "scatter", mode: "markers", hoverinfo: "skip", marker: { symbol: "cross-thin", size: 26, color: C.ink, line: { color: C.ink, width: 3 } } };
    // open symbols take their stroke color from marker.color (not marker.line.color)
    const scenRing = { x: [100 * sc.o2], y: [sc.p], type: "scatter", mode: "markers", hoverinfo: "skip", marker: { symbol: "circle-open", size: 30, color: C.bg, line: { width: 4 } } };
    if (mapDrawn && !remap && hasPlotly) {
      Plotly.restyle("map-chart", { x: [scenRing.x, scen.x], y: [scenRing.y, scen.y] }, [3, 4]);
      return;
    }
    $("#map-legend").innerHTML = [legendItem("circle", C.ink, "Flown test · self-extinguished"), legendItem("circle", C.ink, "Flown test · kept burning", true), legendItem("cross", C.ink, "Your scenario")].join("");
    const z = p.map((pp) => o2.map((oo) => pointEstimate(stdz([sc.fuel === "Heptane" ? 1 : 0, oo, Math.log(pp), sc.co2, sc.he, sc.d0]))));
    const tr = M.train;
    const ext = tr.filter((t) => t.autoextincion === 1), burn = tr.filter((t) => t.autoextincion === 0);
    const habs = D.habitats.filter((x) => x.x_o2 <= 0.4);
    plot("map-chart", [
      { z, x: o2.map((v) => 100 * v), y: p, type: "heatmap", zmin: 0, zmax: 1, zsmooth: "best",
        colorscale: [[0, "#fde68a"], [0.25, "#f97316"], [0.5, "#e11d48"], [0.75, "#4c1d95"], [1, "#0d1220"]],
        colorbar: { thickness: 8, outlinewidth: 0, tickformat: ".0%", tickfont: { family: "JetBrains Mono, monospace", size: 10, color: C.ink3 }, len: 0.8, title: { text: "P(self-ext.)", side: "right", font: { size: 10.5, color: C.ink3 } } },
        hovertemplate: "O₂ %{x:.1f}% · %{y:.2f} atm<br>P(self-extinction) %{z:.0%}<extra></extra>" },
      { x: ext.map((t) => 100 * t.x_o2), y: ext.map((t) => t.p_atm), type: "scatter", mode: "markers", name: "Self-extinguished",
        marker: { symbol: "circle", size: 8, color: C.ink, line: { color: C.bg, width: 1.6 } }, hovertemplate: "Flown test: self-extinguished<br>O₂ %{x:.0f}% · %{y:.2f} atm<extra></extra>" },
      { x: burn.map((t) => 100 * t.x_o2), y: burn.map((t) => t.p_atm), type: "scatter", mode: "markers", name: "Kept burning",
        marker: { symbol: "circle", size: 8, color: C.bg, line: { color: C.ink, width: 1.6 } }, hovertemplate: "Flown test: kept burning<br>O₂ %{x:.0f}% · %{y:.2f} atm<extra></extra>" },
      scenRing, scen,
    ], layout({
      margin: { l: 52, r: 8, t: 8, b: 44 },
      annotations: habs.map((x) => ({
        x: 100 * x.x_o2, y: Math.log10(x.p_atm), text: esc(x.name), showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: C.ink3,
        ax: { cabin: 0, eva_prep: -10, moon_base: 30 }[x.id] ?? 0, ay: { cabin: -42, eva_prep: 40, moon_base: -44 }[x.id] ?? -40,
        font: { size: 11, color: C.ink }, bgcolor: "rgba(7,10,20,0.88)", borderpad: 3,
      })),
      xaxis: { range: [10, 40], ticksuffix: "%", title: { text: "Oxygen" }, gridcolor: "rgba(0,0,0,0)" },
      yaxis: { type: "log", range: [Math.log10(0.3), Math.log10(3.2)], tickvals: [0.3, 0.5, 0.7, 1, 2, 3], title: { text: "Pressure, atm" }, gridcolor: "rgba(0,0,0,0)" },
    }));
    mapDrawn = true;
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
      yaxis: { tickfont: { family: "Inter, sans-serif", size: 12, color: C.ink2 }, gridcolor: "rgba(0,0,0,0)" },
    }));
  }

  /* =========================================================== 04 evidence */
  function renderEvidence() {
    // outcome bands
    const B = D.o2_bands;
    const segs = [["extincion", "Self-extinguished", C.blue], ["disrupcion", "Droplet disrupted", C.amber], ["completo", "Burned to completion", C.orange]];
    $("#band-legend").innerHTML = segs.map(([, l, c]) => legendItem("bar", c, l)).join("");
    plot("band-chart", segs.map(([k, l, c]) => ({
      y: B.map((b) => `${b.band} O₂`), x: B.map((b) => b[k] / b.n), type: "bar", orientation: "h", name: l,
      marker: { color: c, line: { color: C.surface, width: 2 } }, customdata: B.map((b) => [b[k], b.n]),
      hovertemplate: `<b>%{y}</b> · ${l}<br>%{customdata[0]} of %{customdata[1]} tests (%{x:.0%})<extra></extra>`,
    })).concat([{ y: B.map((b) => `${b.band} O₂`), x: B.map(() => 1.02), type: "scatter", mode: "text", text: B.map((b) => `n=${b.n}`), textposition: "middle right", textfont: { family: "JetBrains Mono, monospace", size: 10.5, color: C.ink3 }, hoverinfo: "skip" }]),
    layout({ barmode: "stack", bargap: 0.35, margin: { l: 10, r: 10, t: 4, b: 36 }, xaxis: { tickformat: ".0%", range: [0, 1.16], tickvals: [0, 0.25, 0.5, 0.75, 1] }, yaxis: { gridcolor: "rgba(0,0,0,0)", tickfont: { family: "JetBrains Mono, monospace", size: 11, color: C.ink2 } } }));

    // suppression
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

    // Tad
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
      annotations: n.t50 ? [{ x: n.t50, y: 0.2, text: `normal flames<br>50% ≈ ${Math.round(n.t50).toLocaleString("en-US")} K`, showarrow: false, xanchor: "right", yanchor: "middle", align: "right", xshift: -8, bgcolor: "rgba(15,15,17,0.9)", font: { family: "JetBrains Mono, monospace", size: 10.5, color: C.ink2 } }] : [],
    }));
    const inv = CG.by_type.inverse;
    $("#tad-note").innerHTML = `<b>Hypothesis test.</b> Normal flames: self-extinction rises as flame temperature drops (AUC ${n.metrics.auc.toFixed(2)}); the 50% point, ≈${Math.round(n.t50).toLocaleString("en-US")} K, lies just above the hottest flame tested (${Math.round(n.tad_max).toLocaleString("en-US")} K), so it is an extrapolation. Inverse flames: no single-temperature rule (AUC ${inv.metrics.auc.toFixed(2)}, ≈ chance). Cool flames: ${CG.ignition.cool_flames} of ${CG.ignition.tests} tests.`;

    // gravity dumbbell
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
      xaxis: { tickvals: [0, 1, 2], ticktext: states, range: [-0.35, 2.35], tickfont: { family: "Inter, sans-serif", size: 11.5, color: C.ink2 } },
      yaxis: { tickvals: G.map((_, i) => i), ticktext: lab, autorange: "reversed", gridcolor: "rgba(0,0,0,0)", tickfont: { family: "Inter, sans-serif", size: 11, color: C.ink2 } },
    }));
    const s1 = Object.fromEntries(D.saffire1.map((r) => [String(r.direccion).trim().toLowerCase(), r.tiempo_quemado_s]));
    const worse = G.filter((g) => g.g1_estado >= g.ug_estado).length;
    $("#grav-note").innerHTML = `<b>${worse} of ${G.length}</b> samples burned as much or more in 1 g at 20 cm/s. Saffire-I, same fabric: <b>${s1.concurrent} s</b> concurrent flow vs <b>${s1.opposed} s</b> opposed. PSI has no partial-gravity data yet (LUCI, FM2); these pairs bound it only for this flow regime.`;
  }

  /* =========================================================== 05 findings */
  let findLayer = "All";
  function renderFindings() {
    $("#find-layer").innerHTML = ["All", "Prevention", "Detection", "Suppression"].map((l) => `<button aria-pressed="${l === findLayer}" data-l="${l}">${l}</button>`).join("");
    document.querySelectorAll("#find-layer button").forEach((b) => b.addEventListener("click", () => { findLayer = b.dataset.l; renderFindings(); }));
    const comp = [["volume", "Volume"], ["quality", "Quality"], ["agreement", "Agreement"], ["closeness", "Lunar fit"]];
    $("#findings-list").innerHTML = D.findings.filter((f) => findLayer === "All" || f.layer === findLayer).map((f) => `
      <article class="finding l-${f.layer}">
        <div class="sc">${Math.round(f.score)}<small>Evidence</small></div>
        <div><span class="tag solid layer-${f.layer}" style="margin-bottom:10px;display:inline-block">${esc(f.layer)}</span><h4>${esc(f.title)}</h4><p>${esc(f.text)}</p><div class="impl">${esc(f.implication)}</div><div class="src">SOURCE · ${esc(f.source)}</div></div>
        <div class="mini">${comp.map(([k, l]) => `<div class="r"><span>${l}</span><span class="score"><span class="bar"><i style="width:${100 * f.components[k]}%"></i></span></span></div>`).join("")}</div>
      </article>`).join("");
  }

  /* =========================================================== 06 next experiment */
  function renderNext() {
    const N = D.next;
    const flown = M.train.filter((t) => t.x_co2 === 0 && t.x_he === 0);
    const habs = D.habitats.filter((x) => x.x_o2 <= 0.4);
    plot("unc-chart", [
      { z: N.map.spread, x: N.map.o2.map((v) => 100 * v), y: N.map.p, type: "heatmap", zsmooth: "best",
        colorscale: [[0, "#0d1220"], [0.5, "#5b21b6"], [1, "#ddd6fe"]],
        colorbar: { thickness: 8, outlinewidth: 0, tickformat: ".0%", tickfont: { family: "JetBrains Mono, monospace", size: 10, color: C.ink3 }, len: 0.8, title: { text: "90% band", side: "right", font: { size: 10.5, color: C.ink3 } } },
        hovertemplate: "O₂ %{x:.0f}% · %{y:.2f} atm<br>uncertainty band %{z:.0%}<extra></extra>" },
      { x: flown.map((t) => 100 * t.x_o2), y: flown.map((t) => t.p_atm), type: "scatter", mode: "markers", marker: { size: 5, color: C.bg, line: { color: C.ink3, width: 1 } }, hovertemplate: "Flown FLEX test (no diluent)<br>O₂ %{x:.0f}% · %{y:.2f} atm<extra></extra>" },
      { x: N.picks.map((p) => 100 * p.x_o2), y: N.picks.map((p) => p.p_atm), type: "scatter", mode: "markers+text", text: N.picks.map((_, i) => String(i + 1)), textposition: "middle center",
        textfont: { family: "JetBrains Mono, monospace", size: 10, color: "#fff" }, marker: { size: 18, color: C.orange, line: { color: C.bg, width: 2 } },
        customdata: N.picks.map((p) => [p.fuel, 100 * p.x_co2]), hovertemplate: "<b>Recommended %{text}</b><br>%{customdata[0]} · O₂ %{x:.0f}% · %{y:.2f} atm · CO₂ %{customdata[1]:.0f}%<extra></extra>" },
      { x: habs.map((x) => 100 * x.x_o2), y: habs.map((x) => x.p_atm), type: "scatter", mode: "markers", marker: { symbol: "cross-thin", size: 16, color: C.ink, line: { color: C.ink, width: 2 } }, hoverinfo: "skip" },
    ], layout({
      margin: { l: 52, r: 8, t: 8, b: 44 }, xaxis: { ticksuffix: "%", title: { text: "Oxygen" }, gridcolor: "rgba(0,0,0,0)" },
      yaxis: { type: "log", tickvals: [0.3, 0.5, 0.7, 1, 2, 3], title: { text: "Pressure, atm" }, gridcolor: "rgba(0,0,0,0)" },
      annotations: habs.map((x) => ({
        x: 100 * x.x_o2, y: Math.log10(x.p_atm), text: esc(x.name), showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: C.ink3,
        ax: { cabin: -40, eva_prep: -60, moon_base: 60 }[x.id] ?? 0, ay: { cabin: -36, eva_prep: -46, moon_base: -40 }[x.id] ?? -40,
        font: { size: 11, color: C.ink }, bgcolor: "rgba(7,10,20,0.88)", borderpad: 3,
      })),
    }));
    $("#next-sub").textContent = "Ranked by expected information gain near lunar-base air · numbered on the map";
    $("#next-table").innerHTML = `<thead><tr><th>#</th><th>Fuel</th><th class="num">O₂</th><th class="num">Pressure</th><th class="num">CO₂</th><th class="num">P(self-ext.) today</th><th class="num">Uncertainty</th></tr></thead><tbody>${N.picks.map((p, i) => `
      <tr${i === 0 ? ' class="hl"' : ""}><td class="mono">${i + 1}</td><td>${p.fuel}</td><td class="num">${(100 * p.x_o2).toFixed(0)}%</td><td class="num">${p.p_atm.toFixed(2)} atm · ${(p.p_atm * ATM_PSI).toFixed(1)} psi</td><td class="num">${(100 * p.x_co2).toFixed(0)}%</td><td class="num">${pct(p.p_ext)} <span style="color:var(--ink-4)">(${pct(p.interval[0])}–${pct(p.interval[1])})</span></td><td class="num">±${(50 * p.uncertainty).toFixed(0)} pts</td></tr>`).join("")}</tbody>`;
    $("#next-note").innerHTML = `<b>Why these:</b> the model is least certain about how much CO₂ it takes to put out a fire at the reduced pressure and elevated O₂ planned for the Moon base — exactly the suppression question a lunar habitat must answer. Score = ${esc(N.score_formula)}.`;
  }

  /* =========================================================== 07 quality */
  function renderQuality() {
    const S = D.summary;
    const steps = [
      ["Bronze", "NASA PSI API", "Public metadata + experimental tables for the 24 Combustion Science investigations, fetched without login."],
      ["Silver", `${S.records.toLocaleString("en-US")} records`, `One schema, SI units, outcomes normalized; ${S.qc_fixes} corrections logged with the original value.`],
      ["Gold", "Analytic tables", "Unified tests, 24 investigation profiles, similarity matrix, habitat ranking, findings with evidence scores."],
      ["Models", "Validated ML", "FLEX logistic + 200-model bootstrap, CFI-G temperature test, out-of-data detector, active-learning picks."],
      ["Dashboard", "This page", "Static site; the models run in the browser, so every slider is a live prediction."],
    ];
    $("#pipe").innerHTML = steps.map(([k, t, d]) => `<div class="st"><div class="k">${k}</div><div class="t">${t}</div><div class="d">${d}</div></div>`).join("");
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
      annotations: [{ x: 0.25, y: 0.25, ax: 30, ay: -34, text: "perfect calibration", showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: C.ink4, xanchor: "left", font: { size: 10, color: C.ink3, family: "JetBrains Mono, monospace" } }] }));
    $("#qc-sub").textContent = `${D.qc.length} entries · spreadsheet auto-fill errors, impossible values, duplicate rows, inconsistent labels`;
    $("#qc-table").innerHTML = `<thead><tr><th>PSI</th><th>Experiment</th><th>Record</th><th>Field</th><th>Original</th><th>New</th><th>Rule</th></tr></thead><tbody>${D.qc.map((q) => `<tr><td class="mono">${esc(q.psi_id)}</td><td>${esc(q.experimento)}</td><td class="mono">${esc(q.registro)}</td><td>${esc(q.campo)}</td><td class="mono">${esc(q.valor_original)}</td><td class="mono">${esc(q.valor_nuevo)}</td><td>${esc(q.regla)}</td></tr>`).join("")}</tbody>`;
    $("#built").innerHTML = `Pipeline run ${esc(D.generated)}<br>Python · pandas · scikit-learn · Plotly`;
  }

  /* =========================================================== nav highlight */
  function navSpy() {
    const links = [...document.querySelectorAll(".nav a")];
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { links.forEach((a) => a.classList.remove("active")); map.get(e.target.id)?.classList.add("active"); }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) obs.observe(s); });
  }

  /* =========================================================== boot */
  function safe(fn, name) { try { fn(); } catch (e) { console.error(`[Skylab Phoenix] ${name} failed`, e); } }
  safe(renderHero, "hero");
  safe(() => { renderCoverageFilters(); renderCoverage(); }, "coverage");
  safe(() => { renderInvControls(); renderInvList(); renderSimilarity(); }, "investigations");
  $("#inv-search").addEventListener("input", (e) => { invState.q = e.target.value; renderInvList(); });
  safe(() => { renderScenarioControls(); updateScenario(true); renderDrivers(); }, "scenario");
  safe(renderEvidence, "evidence");
  safe(renderFindings, "findings");
  safe(renderNext, "next");
  safe(renderQuality, "quality");
  safe(navSpy, "nav");
  // rAF does not fire in background tabs, so a timer guarantees the overlay is removed
  const hideLoading = () => $("#loading").classList.add("done");
  requestAnimationFrame(hideLoading);
  setTimeout(hideLoading, 300);
  // Dev aid for report screenshots: ?offsets writes each section's page position into the DOM
  if (location.search.includes("offsets")) setTimeout(() => {
    const o = {};
    document.querySelectorAll("main > section").forEach((sec, i) => { o[sec.id || `s${i}`] = [Math.round(sec.getBoundingClientRect().top + scrollY), sec.offsetHeight]; });
    o.total = document.documentElement.scrollHeight;
    const pre = document.createElement("pre"); pre.id = "offsets"; pre.textContent = JSON.stringify(o); pre.hidden = true; document.body.append(pre);
  }, 1500);
})();
