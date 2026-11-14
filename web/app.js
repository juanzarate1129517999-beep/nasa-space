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
      [S.investigations, `<small>/ ${S.flight} flight</small>`, "PSI combustion investigations profiled and ranked"],
      [S.records.toLocaleString("en-US"), "", `test records cleaned into one schema · ${S.with_outcome} with a labeled outcome`],
      [S.qc_fixes, "", "corrections to NASA's tables, each one logged with the original value"],
      [S.moon_envelope, `<small>/ ${S.ambient.toLocaleString("en-US")}</small>`, "flight tests anywhere near lunar-base air"],
      [auc.toFixed(2), "<small>AUC</small>", "self-extinction model, scored on held-out ISS test days"],
    ];
    $("#kpis").innerHTML = k.map(([v, s, l]) => `<div><dt>${l}</dt><dd>${v}${s}</dd></div>`).join("");
    const names = [...INV].sort((a, b) => a.name.localeCompare(b.name)).map((r) => `<span>${esc(r.name)}</span>`).join("");
    $("#marquee").innerHTML = names; $("#marquee-2").innerHTML = names;

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
      document.getElementById("scenario").scrollIntoView({ behavior: "smooth" });
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
  function renderInvControls() {
    $("#inv-habitat").innerHTML = D.habitats.map((x) => `<button aria-pressed="${x.id === invState.hab}" data-h="${x.id}">${esc(x.name)}</button>`).join("");
    $("#inv-layer").innerHTML = ["All", "Prevention", "Detection", "Suppression"].map((l) => `<button aria-pressed="${l === invState.layer}" data-l="${l}">${l}</button>`).join("");
    document.querySelectorAll("#inv-habitat button").forEach((b) => b.addEventListener("click", () => { invState.hab = b.dataset.h; invState.sel = null; renderInvControls(); renderInvList(); safe(renderCompare, "compare"); }));
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
      <div class="label">Relevance for ${esc(habName(invState.hab))} · ${rel.score.toFixed(1)} / 100</div>
      <div class="breakdown">
        <div class="r"><span>Condition proximity ×0.5</span>${bar(rel.proximity)}<span class="n">${rel.proximity.toFixed(2)}</span></div>
        <div class="r"><span>Labeled evidence ×0.2</span>${bar(rel.evidence)}<span class="n">${rel.evidence.toFixed(2)}</span></div>
        <div class="r"><span>Fire-safety directness ×0.3</span>${bar(rel.directness)}<span class="n">${rel.directness.toFixed(2)}</span></div>
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
      document.getElementById("compare").scrollIntoView({ behavior: "smooth" });
    });
  }
  function renderSimilarity() {
    const S = D.similarity;
    const w = S.weights;
    $("#sim-sub").textContent = `Similarity = ${Math.round(100 * w.keywords_jaccard)}% shared keywords + ${Math.round(100 * w.same_family)}% same fuel family + ${Math.round(100 * w.same_hardware)}% same hardware + ${Math.round(100 * w.o2_range_overlap)}% overlapping O₂ range + ${Math.round(100 * w.linked_in_psi)}% linked in PSI · ordered by hierarchical clustering · click a cell to open it`;
    const el = plot("sim-chart", [{
      z: S.matrix, x: S.names, y: S.names, type: "heatmap", zmin: 0, zmax: 1, xgap: 1, ygap: 1,
      colorscale: [[0, "#0d1220"], [0.35, "#3b1d10"], [0.7, "#f2600f"], [1, "#fde68a"]],
      colorbar: { thickness: 8, outlinewidth: 0, tickfont: { family: "Geist Mono, JetBrains Mono, monospace", size: 10, color: C.ink3 }, len: 0.6 },
      hovertemplate: "<b>%{y}</b> ↔ <b>%{x}</b><br>similarity %{z:.2f}<extra></extra>",
    }], layout({
      margin: { l: 150, r: 10, t: 6, b: 140 },
      xaxis: { tickangle: -50, gridcolor: "rgba(0,0,0,0)", tickfont: { family: "Geist, Inter, sans-serif", size: 11, color: C.ink2 } },
      yaxis: { autorange: "reversed", gridcolor: "rgba(0,0,0,0)", tickfont: { family: "Geist, Inter, sans-serif", size: 11, color: C.ink2 } },
    }));
    if (el) el.on("plotly_click", (ev) => {
      const name = ev.points[0].y;
      const id = S.ids[S.names.indexOf(name)];
      invState.layer = "All"; invState.q = ""; $("#inv-search").value = "";
      renderInvControls(); renderInvList(); selectInv(id);
      document.getElementById("investigations").scrollIntoView({ behavior: "smooth" });
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
      ? `${sc.fuel} droplet, d₀ ${sc.d0.toFixed(2)} mm · ${(100 * sc.o2).toFixed(1)}% O₂ · ${sc.p.toFixed(2)} atm (${(sc.p * ATM_PSI).toFixed(1)} psi) · ${dil}`
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
  let mapDrawn = false;
  function renderMap(remap) {
    const o2 = [], p = [];
    for (let i = 0; i <= 60; i++) o2.push(0.10 + i * 0.005);
    for (let j = 0; j <= 48; j++) p.push(Math.exp(Math.log(0.3) + (j * (Math.log(3.2) - Math.log(0.3))) / 48));
    const scen = { x: [100 * sc.o2], y: [sc.p], type: "scatter", mode: "markers", hoverinfo: "skip", marker: { symbol: "cross-thin", size: 26, color: C.ink, line: { color: C.ink, width: 3 } } };
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
        colorbar: { thickness: 8, outlinewidth: 0, tickformat: ".0%", tickfont: { family: "Geist Mono, JetBrains Mono, monospace", size: 10, color: C.ink3 }, len: 0.8, title: { text: "P(self-ext.)", side: "right", font: { size: 10.5, color: C.ink3 } } },
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
        ax: { cabin: 0, eva_prep: -10, moon_base: 30, exploration: 34 }[x.id] ?? 0, ay: { cabin: -42, eva_prep: 40, moon_base: -44, exploration: 40 }[x.id] ?? -40,
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

  function renderNext() {
    const N = D.next;
    const flown = M.train.filter((t) => t.x_co2 === 0 && t.x_he === 0);
    const habs = D.habitats.filter((x) => x.x_o2 <= 0.4);
    plot("unc-chart", [
      { z: N.map.spread, x: N.map.o2.map((v) => 100 * v), y: N.map.p, type: "heatmap", zsmooth: "best",
        colorscale: [[0, "#0d1220"], [0.5, "#5b21b6"], [1, "#ddd6fe"]],
        colorbar: { thickness: 8, outlinewidth: 0, tickformat: ".0%", tickfont: { family: "Geist Mono, JetBrains Mono, monospace", size: 10, color: C.ink3 }, len: 0.8, title: { text: "90% band", side: "right", font: { size: 10.5, color: C.ink3 } } },
        hovertemplate: "O₂ %{x:.0f}% · %{y:.2f} atm<br>uncertainty band %{z:.0%}<extra></extra>" },
      { x: flown.map((t) => 100 * t.x_o2), y: flown.map((t) => t.p_atm), type: "scatter", mode: "markers", marker: { size: 5, color: C.bg, line: { color: C.ink3, width: 1 } }, hovertemplate: "Flown FLEX test (no diluent)<br>O₂ %{x:.0f}% · %{y:.2f} atm<extra></extra>" },
      { x: N.picks.map((p) => 100 * p.x_o2), y: N.picks.map((p) => p.p_atm), type: "scatter", mode: "markers+text", text: N.picks.map((_, i) => String(i + 1)), textposition: "middle center",
        textfont: { family: "Geist Mono, JetBrains Mono, monospace", size: 10, color: "#fff" }, marker: { size: 18, color: C.orange, line: { color: C.bg, width: 2 } },
        customdata: N.picks.map((p) => [p.fuel, 100 * p.x_co2]), hovertemplate: "<b>Recommended %{text}</b><br>%{customdata[0]} · O₂ %{x:.0f}% · %{y:.2f} atm · CO₂ %{customdata[1]:.0f}%<extra></extra>" },
      { x: habs.map((x) => 100 * x.x_o2), y: habs.map((x) => x.p_atm), type: "scatter", mode: "markers", marker: { symbol: "cross-thin", size: 16, color: C.ink, line: { color: C.ink, width: 2 } }, hoverinfo: "skip" },
    ], layout({
      margin: { l: 52, r: 8, t: 8, b: 44 }, xaxis: { ticksuffix: "%", title: { text: "Oxygen" }, gridcolor: "rgba(0,0,0,0)" },
      yaxis: { type: "log", tickvals: [0.3, 0.5, 0.7, 1, 2, 3], title: { text: "Pressure, atm" }, gridcolor: "rgba(0,0,0,0)" },
      annotations: habs.map((x) => ({
        x: 100 * x.x_o2, y: Math.log10(x.p_atm), text: esc(x.name), showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: C.ink3,
        ax: { cabin: -40, eva_prep: -60, moon_base: 60, exploration: 40 }[x.id] ?? 0, ay: { cabin: -36, eva_prep: -46, moon_base: -40, exploration: 36 }[x.id] ?? -40,
        font: { size: 11, color: C.ink }, bgcolor: "rgba(7,10,20,0.88)", borderpad: 3,
      })),
    }));
    $("#next-sub").textContent = "Ranked by expected information gain near lunar-base air · numbered on the map";
    $("#next-table").innerHTML = `<thead><tr><th>#</th><th>Fuel</th><th class="num">O₂</th><th class="num">Pressure</th><th class="num">CO₂</th><th class="num">P(self-ext.) today</th><th class="num">Uncertainty</th></tr></thead><tbody>${N.picks.map((p, i) => `
      <tr${i === 0 ? ' class="hl"' : ""}><td class="mono">${i + 1}</td><td>${p.fuel}</td><td class="num">${(100 * p.x_o2).toFixed(0)}%</td><td class="num">${p.p_atm.toFixed(2)} atm · ${(p.p_atm * ATM_PSI).toFixed(1)} psi</td><td class="num">${(100 * p.x_co2).toFixed(0)}%</td><td class="num">${pct(p.p_ext)} <span style="color:var(--ink-4)">(${pct(p.interval[0])}–${pct(p.interval[1])})</span></td><td class="num">±${(50 * p.uncertainty).toFixed(0)} pts</td></tr>`).join("")}</tbody>`;
    $("#next-note").innerHTML = `<b>Why these:</b> the model is least certain about how much CO₂ it takes to put out a fire at the reduced pressure and elevated O₂ planned for the Moon base — exactly the suppression question a lunar habitat must answer. Score = ${esc(N.score_formula)}.`;
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
  function shareUrl(hash) {
    return `${location.origin}${location.pathname}?${scenarioParams()}${hash}`;
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
    { id: "undergrad", name: "Undergraduate", intro: "New to microgravity fire? Three steps, about five minutes.", steps: [
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
    $("#aud-path").innerHTML = `<p class="aud-intro">${esc(a.intro)}</p><ol class="steps">${a.steps.map(([t, d], i) => `<li><button type="button" class="step" data-i="${i}"><span class="n">${i + 1}</span><span><b>${esc(t)}</b><small>${esc(d)}</small></span><span class="arrow">→</span></button></li>`).join("")}</ol>`;
    document.querySelectorAll("#aud-path .step").forEach((b) => b.addEventListener("click", () => {
      const act = a.steps[+b.dataset.i][2];
      if (act.brief) { briefState.hab = act.brief; renderBrief(); }
      if (act.preset) setPreset(act.preset);
      if (act.ask) { $("#ask-q").value = act.ask; renderAsk(act.ask); }
      document.querySelector(act.go)?.scrollIntoView({ behavior: "smooth" });
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
    const rank = Object.fromEntries([...INV].sort((a, b) => b.relevance[hab].score - a.relevance[hab].score).map((r, i) => [r.psi_id, i + 1]));
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
      [`Relevance · ${habName(hab)}`, (r) => `${r.relevance[hab].score.toFixed(1)} / 100 · rank ${rank[r.psi_id]}`],
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

  function navSpy() {
    const links = [...document.querySelectorAll(".nav__links a")];
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { links.forEach((a) => a.classList.remove("is-on")); map.get(e.target.id)?.classList.add("is-on"); }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) obs.observe(s); });
  }

  function safe(fn, name) { try { fn(); } catch (e) { console.error(`[Skylab Phoenix] ${name} failed`, e); } }
  safe(renderHero, "hero");
  safe(() => { renderAudience(); renderBrief(); renderAsk(""); }, "briefing");
  $("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); safe(() => renderAsk($("#ask-q").value), "ask"); });
  $("#brief-dl").addEventListener("click", () => download(`skylab-phoenix-briefing-${briefState.hab}.md`, briefMarkdown()));
  $("#brief-sim").addEventListener("click", () => { setPreset(briefState.hab); document.getElementById("scenario").scrollIntoView({ behavior: "smooth" }); });
  safe(() => { renderCoverageFilters(); renderCoverage(); }, "coverage");
  safe(() => { renderInvControls(); renderInvList(); renderSimilarity(); renderCompare(); }, "investigations");
  $("#inv-search").addEventListener("input", (e) => { invState.q = e.target.value; renderInvList(); });
  safe(() => { renderScenarioControls(); updateScenario(true); renderDrivers(); }, "scenario");
  safe(() => { applyUrlScenario(); }, "url");
  urlReady = true;
  $("#share-btn").addEventListener("click", (e) => copyText(shareUrl("#scenario"), e.currentTarget));
  safe(renderDownloads, "downloads");
  safe(renderEvidence, "evidence");
  safe(renderFindings, "findings");
  safe(renderNext, "next");
  safe(renderQuality, "quality");
  safe(navSpy, "nav");
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
    window.addEventListener("hashchange", () => rv.forEach((el) => el.classList.add("in")));
  }, "chrome");
  const hideLoading = () => { $("#loading").classList.add("done"); document.documentElement.classList.add("is-ready"); };
  requestAnimationFrame(hideLoading);
  setTimeout(hideLoading, 300);
  if (location.search.includes("offsets")) setTimeout(() => {
    const o = {};
    document.querySelectorAll("main > section").forEach((sec, i) => { o[sec.id || `s${i}`] = [Math.round(sec.getBoundingClientRect().top + scrollY), sec.offsetHeight]; });
    o.total = document.documentElement.scrollHeight;
    const pre = document.createElement("pre"); pre.id = "offsets"; pre.textContent = JSON.stringify(o); pre.hidden = true; document.body.append(pre);
  }, 1500);
})();
