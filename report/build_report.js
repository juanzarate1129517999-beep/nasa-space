// Technical report: report/Technical_Report_Skylab_Phoenix.pdf
// Every number and chart comes from the pipeline outputs (web/data, data/gold, data/si); screenshots come from the website.
// Usage: python scripts/serve.py &   then   node report/build_report.js        (needs Playwright)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "http://127.0.0.1:8765/";
const FIG = path.join(__dirname, "figures");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const E = JSON.parse(rd("web/data/ember.json"));
const SI = JSON.parse(rd("web/data/si.js").replace(/^window\.SI=|;\s*$/g, ""));
const CLIPS = JSON.parse(rd("web/data/clips.js").replace(/^window\.CLIPS = |;\s*$/g, ""));
const PACKS = Object.fromEntries(JSON.parse(rd("data/si/evidence_packs.json")).map((p) => [`${p.kind}:${p.id}`, p]));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (p, d = 0) => `${(100 * p).toFixed(d)}%`;
const n = (x) => Number(x).toLocaleString("en-US");
const PSI_ATM = 14.696;
const F = E.flex, V = F.validation, S = E.summary, L = E.solids.literature;
const HC = Object.fromEntries(E.habitat_check.map((h) => [h.habitat, h]));
const MM = HC.moon_base.fuels.Methanol, CM = HC.cabin.fuels.Methanol;
const HAB = Object.fromEntries(E.habitats.map((h) => [h.id, h]));

// ── The deployed FLEX model, evaluated here exactly as in web/app.js ────────────────────────────────
const PH = F.phys, ST = F.stages, sig = (z) => 1 / (1 + Math.exp(-z));
function physics([hep, o2, logp, co2, he, d0]) {
  const n2 = Math.max(0, 1 - o2 - co2 - he), M = PH.molar_mass, C = PH.cp_j_mol_k, fuel = hep === 1 ? "Heptane" : "Methanol";
  const mass = o2 * M.o2 + n2 * M.n2 + co2 * M.co2 + he * M.he, yo = (o2 * M.o2) / mass;
  const cp = (o2 * C.o2 + n2 * C.n2 + co2 * C.co2 + he * C.he) / (mass / 1000);
  const t_st = PH.t0_k + (PH.q_j_kg[fuel] * yo) / (cp * (PH.s_o2[fuel] + yo)), res = Math.log(d0 * d0 * Math.exp(logp));
  return { heptane: hep, x_o2: o2, log_p: logp, x_co2: co2, x_he: he, d0_mm: d0, t_st, res, hep_t_st: hep * t_st, hep_res: hep * res };
}
const stageZ = (st, ph, b) => st.features.reduce((z, f, i) => z + b[i + 1] * (ph[f] - st.mu[i]) / st.sd[i], b[0]);
function ends(x) {
  const ph = physics(x), pd = sig(stageZ(ST.disruption, ph, ST.disruption.coef)), ps = sig(stageZ(ST.extinction, ph, ST.extinction.coef));
  return { e: (1 - pd) * ps, d: pd, c: (1 - pd) * (1 - ps) };
}
const o2grid = Array.from({ length: 31 }, (_, i) => +(0.12 + i * 0.01).toFixed(2));
const endsCurve = (p, fuel) => o2grid.map((o) => ends([fuel === "Heptane" ? 1 : 0, o, Math.log(p), 0, 0, F.d0_median]));
const mapP = Array.from({ length: 36 }, (_, i) => +Math.exp(Math.log(0.4) + i * (Math.log(3.1) - Math.log(0.4)) / 35).toFixed(3));
const mapZ = mapP.map((p) => o2grid.map((o) => ends([0, o, Math.log(p), 0, 0, F.d0_median]).e));

// ── Data prepared for the charts ─────────────────────────────────────────────────────────────────────
const qcGroups = {};
E.qc.forEach((q) => { const k = String(q.regla).replace(/\s*\(\d+ cells?\)/, "").replace(/\d+(\.\d+)?/g, "#").replace(/\s+/g, " ").trim(); qcGroups[k] = (qcGroups[k] || 0) + 1; });
const qcTop = Object.entries(qcGroups).sort((a, b) => b[1] - a[1]);
const train = F.train;
const kMed = (fuel) => { const v = train.filter((t) => t.combustible === fuel && t.tasa_quemado > 0).map((t) => t.tasa_quemado).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const extRatios = train.filter((t) => t.autoextincion && t.d_ext_mm > 0 && t.d0_mm > 0).map((t) => t.d_ext_mm / t.d0_mm).sort((a, b) => a - b);
const extMed = extRatios[Math.floor(extRatios.length / 2)];
const nK = train.filter((t) => t.tasa_quemado > 0).length;
const habsRank = ["cabin", "eva_prep", "moon_base", "exploration"];
const invSorted = [...E.investigations].sort((a, b) => b.relevance.moon_base.score - a.relevance.moon_base.score);
const chartData = {
  qc: qcTop.slice(0, 22),
  cov: E.coverage.groups.map((g) => ({ name: g.experiment, fam: g.family, assumed: g.assumed, burner: g.burner_o2, x: g.x_o2, y: g.p_atm })),
  habitats: E.habitats, moonEnv: E.records.moon_envelope,
  bands: E.o2_bands, co2: E.suppression.co2, saffire2: E.saffire2,
  relev: { names: invSorted.map((r) => r.name), habs: habsRank.map((h) => HAB[h].name), z: invSorted.map((r) => habsRank.map((h) => r.relevance[h].score)) },
  sim: E.similarity,
  val: V.models, rel: V.reliability,
  ends: { cabin: endsCurve(1.0, "Methanol"), moon: endsCurve(0.694, "Methanol"), o2: o2grid },
  map: { o2: o2grid, p: mapP, z: mapZ, pts: train.filter((t) => t.x_co2 === 0 && t.x_he === 0).map((t) => [t.x_o2, t.p_atm, t.resultado]) },
  hab: E.habitat_check.filter((h) => h.habitat !== "suit").map((h) => ({ name: h.name, ...h.fuels.Methanol })),
  cfig: E.cfig, next: E.next, findings: E.findings,
  solids: { b: E.solids.boundary, lit: L.rows.filter((r) => r.ignited && r.x_o2 != null), g1: E.solids.g1_upward_limit_pct, min: E.solids.min_o2_pct },
};

// ── Screenshots of the website (dark), used in section 12 and as a few figures ─────────────────────
async function screenshots() {
  fs.mkdirSync(FIG, { recursive: true });
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1.5 });
  const css = ".cb-btn{opacity:0!important} *{transition:none!important} .js .rv{opacity:1!important;transform:none!important} .sec .card,.sec__head,.finding,.ac,.dash-kpis,.stage,.mth-step,.dl,.sub-h{animation:none!important}";
  const go = async (hash, wait = 3500) => { await p.goto(SITE + hash, { waitUntil: "load" }); await p.addStyleTag({ content: css }); await p.waitForTimeout(wait); };
  const shot = async (file, sel) => {
    if (sel) { const el = await p.$(sel); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(800); await el.screenshot({ path: path.join(FIG, file), type: "jpeg", quality: 82 }); }
    else await p.screenshot({ path: path.join(FIG, file), type: "jpeg", quality: 82 });
  };
  await go("", 6000); await shot("w_home.jpg");
  await go("#/learn", 9000); await p.addStyleTag({ content: ".xp-card__in{visibility:hidden!important}" }); await shot("w_moon.jpg");
  await p.evaluate(() => { const c = document.querySelector('.xp-card[data-act="base"]'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - innerHeight * 0.2); });
  await p.waitForTimeout(11000); await shot("w_base.jpg");
  await p.evaluate(() => document.getElementById("xp-2").scrollIntoView()); await p.waitForTimeout(5000); await shot("w_sources.jpg");
  await go("#/flames"); await shot("w_flames.jpg");
  await p.evaluate(() => document.querySelector("#arch").scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -160)); await p.waitForTimeout(2500); await shot("w_archive.jpg");
  await go("#/lab"); await p.evaluate(() => document.querySelector('#presets button[data-h="moon_base"]').click()); await p.waitForTimeout(2000);
  await p.evaluate(() => document.querySelector(".console").scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -90)); await p.waitForTimeout(1200); await shot("w_lab.jpg");
  await p.evaluate(() => document.querySelector("#map-chart").scrollIntoView({ block: "center" })); await p.waitForTimeout(1200); await shot("w_fires.jpg");
  await go("#/findings"); await shot("w_dash.jpg");
  await p.evaluate(() => document.getElementById("audit").scrollIntoView()); await p.waitForTimeout(1500); await shot("w_audit.jpg");
  await go("#/ranking"); await shot("w_ranking.jpg");
  await go("#/next"); await shot("w_next.jpg");
  await go("#/data"); await shot("w_method.jpg");
  await p.evaluate(() => { const q = document.getElementById("qc") || document.querySelector("[id*=qc]"); if (q) q.scrollIntoView({ block: "start" }); }); await p.waitForTimeout(1500); await shot("w_qc.jpg");
  await go("#/findings"); await p.addStyleTag({ content: ".cb-btn{opacity:1!important}" }); await p.click("#cb-btn"); await p.waitForTimeout(800);
  await p.click('#cb-briefs button[data-h="moon_base"]'); await p.waitForTimeout(1500); await shot("w_chat.jpg");
  await b.close();
}

// ── HTML ────────────────────────────────────────────────────────────────────────────────────────────
let figN = 0, tabN = 0;
const fig = (file, cap, cls = "") => `<figure class="${cls}"><img src="figures/${file}"><figcaption><b>Figure ${++figN}.</b> ${cap}</figcaption></figure>`;
const chart = (id, cap, h = 300) => `<figure><div class="chart" id="${id}" style="height:${h}px"></div><figcaption><b>Figure ${++figN}.</b> ${cap}</figcaption></figure>`;
const table = (cap, head, rows, cls = "") => `<p class="tcap"><b>Table ${++tabN}.</b> ${cap}</p><table class="${cls}"><thead><tr>${head.map((h) => `<th${/^[#n·]|^(O₂|atm|CO₂|AUC|Brier|Score|Records|Publ|Log|Acc|With|Goes|Breaks|Burns|psi|Rel|Prox|Evid|Dir|Δ)/.test(h) ? ' class="n"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${typeof c === "number" || /^[\d.,%–+−-]+( ?(%|atm|psi|pts|s|ppm|K))?$/.test(String(c)) ? ' class="n"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sec = (num, title, lead, body) => `<section class="sec"><div class="sec-top"><span class="bar"></span><span class="num">${num}</span></div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}${body}</section>`;
const box = (t, cls = "") => `<div class="box ${cls}">${t}</div>`;
const h3 = (t) => `<h3><i></i>${t}</h3>`;

function html() {
  const moonBrief = SI.habitat.moon_base, moonPack = PACKS["habitat:moon_base"];
  const ood = E.flex.ood_threshold, suitD = HC.suit.fuels.Methanol.ood_distance, moonD = MM.ood_distance;
  const fx = E.flex.outcomes;
  const top6 = invSorted.slice(0, 6);
  const audit = E.moonbase.modules;
  const flights = E.moonbase.report.flight_tests_needed;
  const picks = E.next.picks;
  const findings = E.findings;
  const solidRows = E.solids.habitats;
  const nPMMA = (E.solids.by_family || []).filter((f) => /PMMA/.test(f.family)).reduce((s, f) => s + (f.n || 0), 0);
  const clipsBy = (st) => CLIPS.filter((c) => c.state === st).length;
  const steps = V.stages;
  const lr = V.models.find((m) => m.key === "lr"), lr6 = V.models.find((m) => m.key === "lr6"), gb = V.models.find((m) => m.key === "gb"), o2m = V.models.find((m) => m.key === "o2");

  const cover = `<section class="cover">
  <div class="cv-bar"></div><div class="cv-glow"></div>
  <div class="cv-main">
    <div class="logo"><img src="../web/assets/phoenix.svg"></div>
    <h1 class="cv-title">Skylab Phoenix</h1>
    <p class="cv-sub">Fire-safety intelligence from NASA's microgravity combustion data: data engineering, analysis, machine learning and a verified SI layer for the Moon, spacecraft and spacesuits</p>
    <p class="cv-eyebrow">NASA Space Apps Challenge 2026 · Flame in Freefall · Fire safety for exploration</p>
    <div class="cv-kpi">
      <div><b>${S.investigations}</b><span>NASA investigations analysed</span></div>
      <div><b>${n(S.records)}</b><span>test records unified</span></div>
      <div><b>${lr.auc.toFixed(2)}</b><span>model AUC, validated by test day</span></div>
      <div><b class="g">${pct(CM.p)} → ${pct(MM.p)}</b><span>droplet fire goes out on its own: cabin → lunar base</span></div>
    </div>
    <table class="cv-tab">
      <tr><td>Team</td><td><b>Skylab Phoenix</b></td></tr>
      <tr><td>Challenge</td><td>Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data</td></tr>
      <tr><td>Team lead</td><td>Juan Sebastián Zárate</td></tr>
      <tr><td>Members</td><td>Juan Sebastián Zárate (lead)<br>Javier Medina</td></tr>
      <tr><td>Data source</td><td>NASA Physical Sciences Informatics (PSI) · ${S.investigations} <i>Combustion Science</i> investigations · CC0 license; NASA NTRS, SVS, PGDA and JPL Horizons</td></tr>
      <tr><td>Tools</td><td>Python · pandas · scikit-learn · SciPy · Plotly · three.js · HTML/CSS/JavaScript · Anthropic Claude (SI briefings)</td></tr>
      <tr><td>Keywords</td><td>microgravity, flammability, lunar base, data engineering, machine learning, uncertainty, active learning, verified SI</td></tr>
    </table>
    <p class="cv-date">November 15, 2026 · Website: juanzarate1129517999-beep.github.io/nasa-space</p>
  </div></section>`;

  const abstract = `<section class="sec"><div class="sec-top"><span class="bar"></span></div><h1>Abstract</h1>
<p class="lead">Artemis lunar-surface habitats and pressurized rovers will run at 30% oxygen or more and 10.2 psi or less. Skylab Phoenix answers, from NASA's own flight data, what happens to fire in that atmosphere and where that data runs out.</p>
<p>We built a data-engineering pipeline that downloads, cleans and unifies the experimental tables of the ${S.investigations} Combustion Science investigations in NASA's PSI repository. The result is ${n(S.records)} records in one schema, ${S.with_outcome} with a labelled outcome. We corrected ${S.qc_fixes} errors in the source tables and logged every correction. On top of that data we profile and rank each investigation per habitat and train interpretable models with explicit uncertainty.</p>
<p>NASA's FLEX table records three ways a burning droplet ends: the flame goes out on its own, the droplet breaks apart, or it burns to completion. Our main model keeps the three apart. Trained on ${F.n} droplet fires from the ISS and validated by holding out whole test days, it reaches AUC ${lr.auc.toFixed(2)} and Brier ${lr.brier.toFixed(3)} for "goes out on its own", ahead of a single logistic model (${lr6.auc.toFixed(2)}), gradient boosting (${gb.auc.toFixed(2)}) and an oxygen-only baseline (${o2m.auc.toFixed(2)}). According to the model, the chance that a methanol droplet fire goes out on its own falls from ${pct(CM.p)} in a spacecraft cabin to ${pct(MM.p)} in the lunar base (90% interval ${pct(MM.lo)}–${pct(MM.hi)}); there, the droplet is predicted to break apart ${pct(MM.disruption.p)} of the time. Only ${S.moon_envelope} of ${n(S.ambient)} flight records lie near that atmosphere, and NASA's PSI tables hold no solid burned there; NASA's Saffire V and VI burned ${L.elevated.n} samples at ${L.elevated.o2_pct[0]}–${L.elevated.o2_pct[1]}% O₂, published outside PSI. For the spacesuit (100% O₂, 4.3 psi) there is no test at all, and the system refuses to predict.</p>
<p>Active learning recommends the next experiment: CO₂ suppression of a methanol droplet at ${pct(picks[0].x_o2)} O₂ and ${picks[0].p_atm.toFixed(2)} atm, where the model is least certain. An SI layer writes plain-language briefings for every habitat, investigation and lunar-base module; code publishes a briefing only if every sentence cites the data and every number is verified (${SI.meta.verified} of ${SI.meta.total} pass). Everything is presented in a website where the models run live in the browser: an immersive 3D story from NASA's Artemis plan to the lunar south pole, ${CLIPS.length} clips of real flight video, a Fire Lab where a droplet burns by the d² law with burning rates measured in FLEX, a cross-filtered dashboard over all ${n(S.records)} records, a fire audit of a three-module lunar base in which every number is labelled by where it comes from, and a floating "Ask SI" chat with the verified briefings.</p>
${box(`<b>The message in one sentence:</b> with more oxygen, droplet fires in microgravity stop putting themselves out, and NASA has almost no flight data in the atmosphere where astronauts will live on the Moon. Skylab Phoenix quantifies it, shows it and says what to test next.`, "pink")}</section>`;

  const contents = `<section class="sec"><div class="sec-top"><span class="bar"></span></div><h1>Contents</h1>
<ol class="toc"><li>Introduction</li><li>The challenge and the research question</li><li>Conceptual framework: fire in microgravity</li><li>Data: source, scope and inventory</li><li>Data engineering</li><li>Exploratory analysis</li><li>Summaries, ranking and similarity of investigations</li><li>Machine learning</li><li>Next experiment: active learning</li><li>Fire-safety findings ranked by evidence</li><li>The SI layer: briefings you can check</li><li>The Skylab Phoenix website</li><li>Discussion and limitations</li><li>Impact for exploration and on Earth</li><li>Conclusions</li><li>Future work</li><li>Reproducibility</li></ol>
<p class="small">References · Annex A: data dictionary · Annex B: formulas · Annex C: full quality log</p>
<h2>Team</h2>
<table><thead><tr><th>Member</th><th>Role</th><th>Responsibilities</th></tr></thead><tbody>
<tr><td><b>Juan Sebastián Zárate</b></td><td>Team lead</td><td>Scientific direction (combustion), data engineering, modeling, validation and presentation</td></tr>
<tr><td><b>Javier Medina</b></td><td>Member</td><td>Research on the challenge and its background, conceptual guidance, review and development support</td></tr></tbody></table>
<p class="small">Use of AI: the SI briefings are written by Anthropic Claude and published only after code verification (Section 11); code, documentation, this report and the demo video were produced with AI assistance. Details in docs/AI_USE.md.</p></section>`;

  const s1 = sec("01", "Introduction", "Fire is one of the most serious risks of crewed spaceflight, and in microgravity it behaves differently than on Earth.", `
<p>The history of spaceflight is a reminder: the Apollo 1 fire in a pure-oxygen cabin (1967), the oxygen-tank explosion on Apollo 13 (1970) and the oxygen-generator fire on the Mir station (1997). During Artemis II, a smoke alarm sounded about 80,000 miles from Earth. NASA's strategy has three layers: <b>prevention</b> (controlling ignition sources and choosing materials by their flammability limits), <b>detection</b> and <b>suppression</b>.</p>
<p>In microgravity there is no buoyancy: hot gas does not rise, a candle flame becomes a blue sphere, and oxygen arrives only by diffusion or ventilation. That changes flammability limits, flame spread and extinction. NASA has measured this for decades on the ISS and on cargo spacecraft and publishes the results in the Physical Sciences Informatics (PSI) repository. The problem the challenge poses is that this volume of data is hard to find, compare and interpret.</p>
<p>The urgency is concrete. To shorten pre-breathing before spacewalks, the lunar base and pressurized rovers will have more oxygen and less pressure than Earth's atmosphere. That combination makes materials much more flammable, and it is exactly where flight data is scarce. Skylab Phoenix sets out to:</p>
<ol><li>Turn PSI's scattered data into a clean, unified and traceable dataset.</li><li>Extract quantitative knowledge from it with validated models that are honest about their uncertainty.</li><li>Present it in a website, with SI briefings, that any researcher, engineer or student can use to make decisions.</li></ol>`);

  const s2 = sec("02", "The challenge and the research question", "The challenge asks for an SI-powered web dashboard that summarizes, ranks and interprets NASA's combustion investigations. Skylab Phoenix answers each official objective with a data component.", `
${table("Official challenge objectives and the matching parts of the solution.", ["Official objective", "Skylab Phoenix component", "Section"], [
    ["Identify the investigations most relevant to habitable crew environments (spacecraft, stations, Moon and Mars bases, pressurized rovers)", "Automatic profile of the 24 investigations and a transparent ranking per habitat; side-by-side comparison", "7"],
    ["Extract data that supports predictive modeling of flammability", "Bronze → silver → gold pipeline with one schema; validated models that run in the browser", "5, 8"],
    ["Highlight research that informs next-generation fire-safety controls", "Findings ranked by evidence (prevention, detection, suppression), a lunar-base fire audit and the recommended next experiment", "9, 10"],
    ["SI-powered summaries and interpretation", "Briefings for every habitat, investigation and lunar-base module, verified by code, in a floating “Ask SI” chat with a search over NASA's own text", "11"],
    ["Applications of PSI data to fire safety on Earth (optional)", "Earth benefits reported by PSI for each investigation, included in their profiles", "14"]])}
${box(`<p class="bh">Research question</p>What does NASA's flight data say about fire behaviour in the atmosphere planned for the lunar base (≥ 30% O₂, ≤ 10.2 psi), how certain is it, and which experiment is missing to answer what is unknown today?`, "violet")}
<p>The challenge page gives several hints that we used as a guide. The μg tests with the most oxygen are those of ACME CFI-G (up to 85% O₂ at the burner). PSI has no partial-gravity data yet (it will come from LUCI and FM2). Microgravity and 1 g results can bound intermediate gravity. And ACME's BRE experiment studied material flammability with gases that emulate solids.</p>
${h3("Target users")}<p>Professors, graduate and undergraduate students, researchers and, above all, aerospace engineers who design habitats and select materials.</p>`);

  const s3 = sec("03", "Conceptual framework: fire in microgravity", "Without buoyancy, fire depends on transport by diffusion and ventilation. Gravity, airflow, oxygen and pressure therefore interact in ways a test on Earth does not capture.", `
${h3("Key concepts")}
<ul class="concepts">
<li><b>Flammability limit.</b> The least favourable combination of conditions (O₂, pressure, flow) in which a material sustains a flame. Microgravity adds a low-flow limit: with little flow, the flame goes out for lack of oxygen and through radiative losses.</li>
<li><b>Self-extinction.</b> The flame goes out on its own with fuel still left. If a fire does not go out on its own, it must be detected and suppressed.</li>
<li><b>Droplet disruption.</b> A burning droplet can break apart before its flame ends (often from bubbles forming inside it). NASA's FLEX table records it as a third ending, “Disruption”, next to “Extinction” and “Completion”; it does not record what the fragments did afterwards.</li>
<li><b>Concurrent vs opposed flow.</b> When air moves in the direction of flame spread, it preheats the fuel and speeds the flame up. When it moves against it, it slows it down.</li>
<li><b>Normal vs inverse flame.</b> In a normal flame, fuel leaves the burner into an oxidizing ambient. In an inverse flame it is the other way round: O₂ leaves the burner into a fuel-laden ambient.</li>
<li><b>Adiabatic and stoichiometric flame temperature.</b> The theoretical temperature of combustion without losses, overall (T<sub>ad</sub>) or at the flame sheet of a diffusion flame (T<sub>st</sub>); an indicator of how close a flame is to its limit.</li>
<li><b>Cool flames.</b> Low-temperature, nearly invisible combustion seen with fuels such as butane. A distinct risk: an optical detector may miss it.</li>
<li><b>Diluents.</b> CO₂ and helium dilute oxygen and change heat transfer. FLEX tested them as suppressants.</li></ul>
${h3("Habitat atmospheres")}
${table("Atmospheres used as scenarios. Lunar base and suit: official challenge page. Exploration: NASA standard.", ["Habitat", "O₂", "Pressure", "Source"], E.habitats.map((h) => [esc(h.name) + `<br><span class="small">${esc(h.detail)}</span>`, pct(h.x_o2, h.x_o2 * 1000 % 10 ? 1 : 0), `${h.p_atm.toFixed(2)} atm · ${(h.p_atm * PSI_ATM).toFixed(1)} psi`, `<span class="small">${esc(h.source)}</span>`]))}
<p>Compared with Earth's air, the lunar base will have over 40% more oxygen. Even if the O₂ partial pressure is similar, the higher mole fraction speeds combustion and reduces the ability of the inert gas to cool the flame.</p>`);

  const invRows = [...E.investigations].sort((a, b) => (b.n_tests || 0) - (a.n_tests || 0) || (a.type > b.type ? 1 : -1)).map((r) => [`<b>${esc(r.name)}</b>`, r.psi_id, esc(r.family), esc(r.hardware), r.type, r.n_tests ? n(r.n_tests) : "—", r.n_with_outcome ? n(r.n_with_outcome) : "—", r.n_publications ?? "—"]);
  const s4 = sec("04", "Data: source, scope and inventory", "We use the data source the challenge names: NASA's PSI repository (CC0 license). Of its 133 results for “combustion”, 24 belong to Combustion Science: 19 flight experiments and 5 ground investigations.", `
<p>The other 109 investigations (materials, fluids, biophysics) only mention the word and are discarded. Everything is retrieved without login from PSI's public API: metadata (objective, hypothesis, approach, team, publications, Earth benefit), experimental tables in CSV or Excel and, for the flight-video archive, raw ISS and Cygnus video. Two NASA reports outside PSI are also used and labelled as such: the BASS-II summary report (flammability boundary of solids) and the Saffire VI paper (burns at raised oxygen and reduced pressure).</p>
<p>Not every investigation publishes a test table: 18 of the 24 do. The five ground studies and FLEX-2 provide descriptions, publications and data products but no test-by-test table, so they enter the profiles and the ranking but contribute no records.</p>
${table("Inventory of the 24 investigations, generated by the pipeline. “Records” in ACME's daily tables = flames lit.", ["Investigation", "PSI", "Family", "Hardware", "Type", "Records", "With outcome", "Publ."], invRows, "dense")}
<p class="small">Hardware grouping as on the challenge page: the CIR combustion rack with ACME (gases) or MDCA (droplets), the fan-driven duct of the Microgravity Science Glovebox (MSG), and the Saffire module inside the Cygnus spacecraft.</p>`);

  const s5 = sec("05", "Data engineering", "A layered pipeline, reproducible with one command, turns 22 heterogeneous tables into one schema in SI units. Every correction is logged with the original value and the rule applied.", `
<div class="pipe"><div><b>BRONZE</b><span>NASA PSI API</span><small>Catalog, metadata and experimental tables of the 24 investigations, no login</small></div><i>→</i>
<div><b>SILVER</b><span>One table per experiment</span><small>Common schema, SI units, normalized labels, quality rules, correction log</small></div><i>→</i>
<div><b>GOLD</b><span>Analytic tables</span><small>${n(S.records)} tests, 24 profiles, similarity, per-habitat ranking, findings</small></div><i>→</i>
<div><b>MODELS + SI</b><span>Validated ML</span><small>Two-stage FLEX model, 200-model bootstrap, out-of-data guard, active learning, SI firewall</small></div><i>→</i>
<div><b>WEB</b><span>Website</span><small>Exported JSON; the models run in the browser</small></div></div>
<p class="small fcap"><b>Figure ${++figN}.</b> Skylab Phoenix pipeline architecture. Command: <span class="mono">python -m pipeline.run</span> (≈ 8 s).</p>
${h3("Layers")}
<ul><li><b>Bronze</b> (<span class="mono">scripts/fetch_psi*.py</span>): downloads the catalog and the lightweight files of each investigation (≈ 110 MB).</li>
<li><b>Silver</b> (<span class="mono">pipeline/silver.py</span>): one function per experiment maps each table to the common schema (Annex A). It converts mmHg and bar to atm and percentages to mole fractions, normalizes labels (“Extinction”, “SE”/“FT”, yes/Yes/flash) and extracts the outcome from the operator's notes in BASS. It also separates flow sweeps and flags O₂ and pressure when they are not reported.</li>
<li><b>Gold</b> (<span class="mono">pipeline/gold.py</span>, <span class="mono">pipeline/investigations.py</span>): unified test table, profile of each investigation, similarity, per-habitat ranking, findings with evidence scores and web export. <span class="mono">pipeline/solids.py</span> adds the BASS-II gas data and the published Saffire IV–VI burns (kept in <span class="mono">data/literature/</span>).</li></ul>
${h3("Quality rules")}
<p>The pipeline fails on duplicate ids, mole fractions outside [0, 1] or pressures outside [0.1, 6] atm. It also applies correction rules: physically impossible values, mole fractions that do not sum to 1, spreadsheet auto-fill errors, duplicate rows and mis-formatted percentages. The full log is in Annex C.</p>
${chart("c_qc", `Corrections by type (the 22 most frequent of ${qcTop.length} types). ${S.qc_fixes} corrections in total; each keeps the original value.`, 360)}
<p>Examples: a 0 mmHg pressure in FLEX (excluded from the models), “3400%” and “2100%” in ACME BRE (34% and 21%), 8 identical duplicate rows in CFI, a missing decimal point in Saffire-II (“037 mm” → 0.37 mm) and lowercase “yes/no” labels in CFI-G. None was fixed silently: all can be audited.</p>
<p>A second pass compared tables with each other and with NASA's own files. It found calendar dates that disagree with the GMT day of year in BASS, one as-run number used for two tests on different days, a BASS-II GMT day contradicted by the name of NASA's raw video for that test, Saffire thicknesses written in centimetres instead of millimetres, sample length and width swapped, camera file names that do not match the sample, and a Greek μ exported as “?”. In BASS-II gas data, final O₂ readings above the initial value and CO readings that fall during a burn are physically impossible in the sealed glovebox and are excluded.</p>
${fig("w_qc.jpg", `The quality log on the Method page of the website: ${S.qc_fixes} corrections, each with the record, field, original value, new value and rule.`, "shot")}`);

  const s6 = sec("06", "Exploratory analysis", "Before any model, the data shows three patterns: almost no tests near lunar-base air, droplet fires stop putting themselves out as oxygen rises, and CO₂ suppresses fires at reduced pressure.", `
${h3("Coverage: where NASA has flown fire")}
${chart("c_cov", `Every flight record with an ambient O₂ and pressure, against the habitat atmospheres. Hollow markers: conditions not reported (cabin air assumed) or burner O₂ (inverse flames). Of ${n(S.ambient)} records (${n(E.coverage.n_measured)} with measured conditions), only ${S.moon_envelope} fall in the lunar envelope, all from ${esc(E.coverage.moon_envelope_experiments.join(" and "))}. No solid in PSI's tables exceeds ${E.solids.max_o2_any_solid_pct}% O₂.`, 360)}
${h3("With more oxygen, droplet fires stop putting themselves out")}
${chart("c_bands", `How the ${fx.extincion + fx.disrupcion + fx.completo} FLEX droplets with a known pressure ended, by O₂ band. Below 18% O₂, ${E.o2_bands[0].extincion} of ${E.o2_bands[0].n} went out on their own. At 30–34%, only ${E.o2_bands[E.o2_bands.length - 1].extincion} of ${E.o2_bands[E.o2_bands.length - 1].n}; most broke apart.`, 250)}
${h3("CO₂ suppression")}
${chart("c_co2", "Self-extinction rate by CO₂ level, with 90% Wilson intervals. At 0.7 atm the rate rises from 50% without CO₂ to 100% above 30%. The dip at 1–20% is explained by those tests using more O₂ (23–25%): the effect of CO₂ is confounded with oxygen.", 270)}
${h3("Gravity: microgravity vs 1 g on the same samples")}
${chart("c_grav", "Saffire-II burned the same samples in orbit (Cygnus) and on the ground, at 20 cm/s and ≈ 22% O₂. In 8 of 8 samples, 1 g burned as much or more. Silicone barely spread in orbit but burned fully on the ground.", 270)}
<p>This qualifies a BASS-II hypothesis: that NASA's standard 1 g test (NASA-STD-6001, Test 1) may not be conservative in space. At 20 cm/s, Saffire-II shows it was. The question stays open for low flow, a regime Saffire-II did not test. In Saffire-I, the same 94 × 40 cm SIBAL fabric burned ${E.saffire1[0].tiempo_quemado_s} s with concurrent flow and ${E.saffire1[1].tiempo_quemado_s} s with opposed flow: ventilation direction defines the worst case.</p>
${h3("Cool flames")}<p>Of ${E.cfig.ignition.tests} ACME CFI-G tests, ${E.cfig.ignition.ignited} ignited and ${E.cfig.ignition.cool_flames} produced confirmed cool flames, all with ${esc(E.cfig.cool_flame_conditions.fuel.join(", "))}, near ${pct(E.cfig.cool_flame_conditions.o2[1])} O₂ and ${E.cfig.cool_flame_conditions.p_atm[1].toFixed(1)} atm. They are rare, but an optical detector may miss them.</p>`);

  const s7 = sec("07", "Summaries, ranking and similarity of investigations", "Each investigation has a profile generated from its data and a relevance score per habitat. The score is a visible formula, not a black box.", `
${h3("Automatic profile")}
<p>For each experimental table, the pipeline classifies every column as varied (with its range), fixed (with its value) or measured (an outcome). This directly answers the challenge's question: “how did the tests within one investigation differ, and how were they alike?”. The profile adds the objective, hypothesis, team, hardware, conditions covered, publications with DOI and the Earth benefit reported by PSI.</p>
${h3("Ranking per habitat")}
${box(`<p class="mono">Relevance = 100 × ( 0.5 · proximity + 0.2 · evidence + 0.3 · directness )</p><ul><li><b>Proximity:</b> 1 − e<sup>−n/8</sup>, where n is the effective number of tests near the habitat atmosphere, with a Gaussian kernel of 3 points of O₂ and 30% of pressure. It counts half when the O₂ is at the burner or the conditions were assumed.</li><li><b>Evidence:</b> log(1 + tests with an outcome), normalized to 300.</li><li><b>Directness:</b> 1.0 if the challenge page names it as core (BASS, BASS-II, Saffire, SAME, SAME-R, FLEX); 0.75 if it mentions it (BRE, DAFT, CFI-G, E-FIELD); 0.5 for other flight investigations; 0.35 for ground ones.</li></ul>`, "dark")}
${chart("c_relev", "Relevance of the 24 investigations for each habitat (0–100). FLEX leads for the lunar base thanks to its tests at 30–34% O₂ and 0.70 atm; ACME CFI-G leads for the exploration atmosphere; BASS and BASS-II lead for the cabin.", 560)}
${table("The six most relevant investigations for the lunar base.", ["#", "Investigation", "Score", "Proximity", "Evidence", "Directness", "Tests near"], top6.map((r, i) => [i + 1, `<b>${esc(r.name)}</b> <span class="small">${r.psi_id}</span>`, r.relevance.moon_base.score.toFixed(1), r.relevance.moon_base.proximity.toFixed(3), r.relevance.moon_base.evidence.toFixed(3), r.relevance.moon_base.directness.toFixed(2), r.relevance.moon_base.n_near.toFixed(1)]))}
${h3("Similarity between investigations")}
${box(`<p class="mono">Similarity = 0.30 · Jaccard(keywords) + 0.25 · same family + 0.15 · same hardware + 0.15 · overlap of O₂ range + 0.15 · linked in PSI</p>`, "dark")}
${chart("c_sim", "Similarity matrix ordered by hierarchical clustering (average linkage). Clear blocks emerge: droplets (FLEX, FLEX-2, CFI), Saffire, BASS, smoke (SAME, SAME-R, DAFT) and the ACME family.", 520)}`);

  const featRows = [["Fuel (heptane / methanol)", "both stages", "Heptane soots more and burns differently than methanol"], ["O₂ mole fraction", "stage 1", "Oxygen available to the flame"], ["Pressure (log)", "stage 1", "Diffusion and residence time scale with pressure"], ["CO₂ and helium fractions", "stage 1; helium also stage 2", "Suppressing diluents: heat capacity (CO₂) and diffusivity (He)"], ["Initial droplet diameter", "stage 1", "Large droplets make large flames, with more radiative loss"], ["Stoichiometric flame temperature T<sub>st</sub>", "stage 2", "Burke–Schumann temperature at the flame sheet, from the gas mixture and the fuel"], ["Residence time log(d₀²·p)", "stage 2", "d²/D with D ∝ 1/p: time the gas spends near the flame"], ["Fuel × T<sub>st</sub>, fuel × residence time", "stage 2", "Lets each fuel respond differently"]];
  const s8 = sec("08", "Machine learning", "With hundreds of tests rather than millions, we chose small, interpretable, calibrated models. We compare them with baselines and validate them without letting tests from the same day leak between training and testing.", `
${h3("8.1 Problem formulation: three endings")}
<p>NASA's FLEX table ends every burn in one of three ways: <b>Extinction</b> (the flame goes out with fuel left, ${fx.extincion}), <b>Disruption</b> (the droplet breaks apart, ${fx.disrupcion}) and <b>Completion</b> (the droplet burns out, ${fx.completo}). We used ${F.n} of the 274 tests: one has an invalid pressure and twelve no initial diameter. The question that matters for a habitat is whether a fire goes out on its own; a droplet that breaks apart did not, but NASA does not record what its fragments did, so the model keeps the three endings apart instead of folding two of them into “kept burning”.</p>
${box(`<b>Two stages.</b> Stage 1 predicts disruption (P<sub>D</sub>). Stage 2, for droplets that do not break apart, predicts extinction against completion (P<sub>E</sub>). Then P(goes out on its own) = (1 − P<sub>D</sub>)·P<sub>E</sub>, P(breaks apart) = P<sub>D</sub>, P(burns to the end) = (1 − P<sub>D</sub>)(1 − P<sub>E</sub>). Nothing measured after ignition (burn time, burning rate, extinction diameter) is used as an input.`, "violet")}
${table("Inputs and features. Every feature is computed from the conditions a test is set up with.", ["Input or feature", "Used in", "Physical meaning"], featRows)}
${h3("8.2 Validation design")}
<ul><li><b>5-fold GroupKFold with ${E.flex.validation.scheme.match(/(\d+) test days/)[1]} test days as groups:</b> each whole day is either in training or in testing, never both, repeated ${V.reps} times with reshuffled folds.</li>
<li><b>Out-of-sample metrics:</b> AUC (ranking ability), Brier and log loss (quality of the probabilities), accuracy.</li>
<li><b>Comparison</b> with the previous single logistic model, gradient boosting (same inputs) and two baselines: oxygen only, and a constant base rate.</li>
<li><b>Uncertainty:</b> 200 paired bootstrap refits resampling whole days; both stages are refit on the same resample. Each prediction reports the mean and the 90% interval.</li></ul>
${h3("8.3 Results")}
${table(`Out-of-sample performance for “goes out on its own” (whole days held out, ${V.reps} repeats). First row: deployed model.`, ["Model", "AUC", "Brier", "Log loss", "Accuracy"], V.models.map((m) => [m.deployed ? `<b>${esc(m.name)}</b>` : esc(m.name), m.auc.toFixed(3) + (m.auc_sd ? ` ± ${m.auc_sd.toFixed(3)}` : ""), m.brier.toFixed(3), m.log_loss.toFixed(3), pct(m.accuracy, 1)]), "hl1")}
${table("Each stage, scored the same way.", ["Question", "n", "AUC", "Brier"], Object.values(steps).map((m) => [esc(m.question), m.n, `${m.auc.toFixed(3)} ± ${m.auc_sd.toFixed(3)}`, m.brier.toFixed(3)]))}
${chart("c_val", "Validation with whole test days held out: the two-stage physics model leads on AUC, Brier and log loss.", 230)}
<div class="two">${chart("c_rel", "Calibration: when the model says 70%, it happens about 70% of the time.", 260)}
<div class="note-col"><p>About twenty variants were compared on the same repeated held-out days before choosing this one (gradient boosting, splines, the history of earlier burns in the chamber, single-stage models with the same features). The figures are therefore slightly optimistic. The gain over the single logistic model comes mainly from the extinction-versus-completion step, whose AUC rises from about 0.80 to ${steps.extinction.auc.toFixed(2)}.</p></div></div>
${h3("8.4 Interpretation")}
${table("Average change in the chance a droplet fire goes out on its own for +1 standard deviation of each input (heptane: methanol → heptane), with its 90% bootstrap interval.", ["Input", "Δ chance", "90% interval", "Reading"], F.drivers.map((d) => [esc(d.label), `${d.coef >= 0 ? "+" : "−"}${Math.abs(100 * d.coef).toFixed(0)} pts`, `${(100 * d.lo).toFixed(0)} to ${(100 * d.hi).toFixed(0)} pts`, d.lo > 0 ? "favours going out" : d.hi < 0 ? "favours not going out" : "inconclusive"]))}
<p>Oxygen dominates: more O₂, fewer fires that go out on their own. Heptane sustains a flame better than methanol. Large droplets and helium favour extinction, consistent with radiative-loss extinction of large flames in microgravity. With the three endings kept apart, CO₂ now shows a small, positive effect, but every FLEX CO₂ test ran at 25% O₂ or less, so its size at lunar-base oxygen is extrapolated.</p>
${h3("8.5 The three endings, from cabin air to lunar-base air")}
${chart("c_ends", `How a 3 mm methanol droplet fire ends as oxygen rises, at 14.7 psi (cabin pressure, left) and 10.2 psi (lunar-base pressure, right). The orange band grows: above about 25% O₂ the droplet usually breaks apart before its flame can go out.`, 270)}
${chart("c_map", "Chance that a droplet fire goes out on its own across oxygen and pressure (3 mm methanol droplet, no diluent). Dots: flown FLEX tests without diluent, coloured by how they ended. Crosses: crew atmospheres.", 340)}
${table("How a 3 mm droplet fire ends in each habitat (no suppressant), with the 90% interval for going out on its own.", ["Habitat · fuel", "Goes out on its own", "Breaks apart", "Burns to the end", "Status"], E.habitat_check.filter((h) => h.habitat !== "suit").flatMap((h) => Object.entries(h.fuels).map(([fu, r]) => [`${esc(h.name)} · ${fu}`, `${pct(r.p)} (${pct(r.lo)}–${pct(r.hi)})`, pct(r.disruption.p), pct(r.completion.p), r.status])).concat([["Spacesuit · both fuels", "withheld", "—", "—", "outside"]]))}
${chart("c_hab", `From cabin to lunar base, the chance that a methanol droplet fire goes out on its own falls from ${pct(CM.p)} to ${pct(MM.p)}. The exploration atmosphere is an extrapolation; the spacesuit is outside the data.`, 230)}
${h3("8.6 “Out-of-data” guard")}
<p>A model always returns a number, even when the question is far from what was tested. To prevent that, we compute the mean distance to the 5 nearest tests in the standardized input space. The limit is the 95th percentile of that distance among the tests themselves (${ood.toFixed(2)}). Up to 1× the limit: within the data. Between 1× and 2×: extrapolation (shown with a warning). Beyond 2×: no prediction. In addition, if any single input leaves the range flown in FLEX (for example, a pressure below every test), the prediction is flagged as an extrapolation even when the distance is small: this is the case of the exploration atmosphere (34% O₂, 8.2 psi). The lunar base sits at ${moonD.toFixed(2)} (within the data). The spacesuit sits at ${suitD.toFixed(1)}, about ten times the limit, so Skylab Phoenix gives no number and reports a gap.</p>
${h3("8.7 Hypothesis test: a limiting flame temperature? (ACME CFI-G)")}
${chart("c_cfig", `Chance of self-extinction against adiabatic flame temperature for CFI-G tests that ignited (normal n = ${E.cfig.by_type.normal.n}, inverse n = ${E.cfig.by_type.inverse.n}). The relationship holds for normal flames (AUC ${E.cfig.by_type.normal.metrics.auc.toFixed(2)}); for inverse flames it has no predictive power (AUC ${E.cfig.by_type.inverse.metrics.auc.toFixed(2)}).`, 270)}
<p>For normal flames, self-extinction becomes more likely as flame temperature falls. The 50% point (≈ ${n(Math.round(E.cfig.by_type.normal.t50))} K; 90% CI ${n(Math.round(E.cfig.by_type.normal.t50_lo))}–${n(Math.round(E.cfig.by_type.normal.t50_hi))} K) lies just above the hottest flame tested (${n(Math.round(E.cfig.by_type.normal.tad_max))} K), so it is an extrapolation. For inverse flames, no single temperature explains extinction. Flame temperature is not a universal criterion, and reporting this negative result is part of the project's scientific honesty.</p>
${h3("8.8 Fire Lab: the d² law from flight data")}
<p>The model says how often a fire goes out; the Fire Lab shows how it burns. A burning droplet in microgravity follows the classic d² law: the square of its diameter falls linearly in time, d² = d₀² − K·t, where K is the burning-rate constant. FLEX measured K for ${nK} of its tests (median ${kMed("Methanol").toFixed(2)} mm²/s for methanol and ${kMed("Heptane").toFixed(2)} mm²/s for heptane) and the diameter at which the visible flame went out.</p>
<ul><li>For any scenario the Fire Lab takes the five FLEX tests closest in the model's standardized inputs and uses their distance-weighted K.</li>
<li>When a replay goes out on its own, it does so at the extinction ratio d<sub>ext</sub>/d₀ of the closest tests that self-extinguished. Across the ${extRatios.length} self-extinguished tests with that measurement the median ratio is ${extMed.toFixed(2)}.</li>
<li>The replay runs in real seconds next to a live d² chart that draws the five flight tests as reference curves. Flame size uses typical flame-to-droplet ratios from droplet theory and is labelled illustrative.</li></ul>
${fig("w_lab.jpg", "Fire Lab in lunar-base air: habitat presets, oxygen, pressure, CO₂, helium, droplet size and fuel, the answer in plain words with its interval and data status, and the 3D replay.", "shot")}
${fig("w_fires.jpg", "Out of 100 droplet fires in lunar-base air: how many go out on their own, break apart or burn to the end, and where the 50/50 point lies on the oxygen scale.", "shot")}`);

  const s9 = sec("09", "Next experiment: active learning", "If NASA could fly one more test, which one would teach the most? Skylab Phoenix searches near lunar-base air for the conditions where the 200 bootstrap models disagree most.", `
${box(`<p class="mono">Score = ${esc(E.next.score_formula)}</p>`, "dark")}
<p>The search sweeps a grid of O₂ (21–40%), pressure (0.30–1.00 atm), CO₂ (0–30%) and both fuels. To keep recommendations diverse, it allows at most two per fuel–CO₂ combination.</p>
${chart("c_next", "Model uncertainty (width of the 90% interval) without CO₂, with the flown tests and the 6 recommendations. The recommendations add CO₂ (see table).", 330)}
${table("Recommended tests, ordered by expected information gain.", ["#", "Fuel", "O₂", "atm", "CO₂", "Goes out (90%)", "Score"], picks.map((k, i) => [i + 1, k.fuel, pct(k.x_o2), k.p_atm.toFixed(2), pct(k.x_co2), `${pct(k.p_ext)} (${pct(k.interval[0])}–${pct(k.interval[1])})`, k.score.toFixed(3)]))}
<p><b>Reading:</b> the model is most unsure about how much CO₂ it takes to put out a fire at the reduced pressure and elevated O₂ of the lunar base. That is exactly the suppression question a lunar habitat must answer before choosing extinguishers. Since PSI has no partial-gravity data, these conditions are also the first worth testing in LUCI or FM2.</p>
${fig("w_next.jpg", "Next flight on the website: the recommended experiment and how sure the model is today.", "shot")}`);

  const s10 = sec("10", "Fire-safety findings ranked by evidence", `The pipeline produces ${findings.length} findings. Each has an evidence score and a design implication. Every number in them is computed from the PSI tables, except the solid-material limits, quoted from NASA's BASS-II report, and the Saffire IV–VI burns, quoted from NASA's paper.`, `
${box(`<p class="mono">Evidence = 100 × ( 0.35 · volume + 0.25 · quality + 0.20 · agreement + 0.20 · closeness to the lunar base )</p><p class="small">Volume = log(1 + n)/log(301). Quality = model validation or type of measurement. Agreement = investigations pointing the same way (max. 3). Closeness = how near lunar-base air the evidence is.</p>`, "dark")}
${chart("c_find", "Evidence score of each finding, coloured by safety layer.", 300)}
${table("Findings with their implication for habitat design.", ["#", "Score", "Layer", "Finding and implication"], findings.map((f, i) => [`F${i + 1}`, f.score.toFixed(0), esc(f.layer), `<b>${esc(f.title)}</b><br><span class="small">${esc(f.text)}</span><br><i class="small">→ ${esc(f.implication)}</i>`]), "dense")}
${h3("Solid materials: the limits measured in orbit")}
<p>Fabrics and plastics are what burns in a spacecraft, and the challenge points to BASS, BASS-II and Saffire. From the BASS-II test matrices (PSI-25) we extracted the oxygen, CO and CO₂ readings of ${E.solids.n_tests} tests, and from NASA's BASS-II summary report (${esc(E.solids.source)}) the flammability boundary that the investigators fitted to their PMMA rod tests: <span class="mono">${esc(E.solids.boundary.equation)}</span> (${esc(E.solids.boundary.page)}).</p>
<ul><li>The boundary bottoms out at about ${E.solids.min_o2_pct}% O₂ near ${E.solids.min_flow_cm_s[0].toFixed(1)}–${E.solids.min_flow_cm_s[1].toFixed(1)} cm/s of airflow, below the ${E.solids.g1_upward_limit_pct}% limit of the normal-gravity upward test. In the gentle airflow typical near spacecraft surfaces, solids burn at less oxygen than Earth tests indicate.</li>
<li>Rods needed about ${E.solids.ignition_limit_pct}% O₂ to ignite; once lit, flames survived to ${E.solids.lowest_final_o2_rods_pct}%.</li>
<li>Near the limit, flames run fuel-rich: PMMA rods released a median ${E.solids.co_rods_low_o2_median_ppm} ppm of CO below 17% O₂ (${E.solids.n_rods_low} tests) against ${E.solids.co_rods_high_o2_median_ppm} ppm above 20% (${E.solids.n_rods_high} tests).</li></ul>
${table("What the boundary implies for each habitat (PMMA rod, 1 atm).", ["Habitat", "O₂", "Burns in still air", "Blow-off airflow", "Note"], solidRows.map((h) => [esc(h.name), `${h.o2_pct}%`, h.burns_in_still_air ? "yes" : "no", `${h.blowoff_flow_cm_s} cm/s`, `<span class="small">${esc(h.pressure_note)}${h.extrapolated ? "; extrapolated" : ""}</span>`]))}
<p>NASA PSI's tables hold no solid burned above ${E.solids.max_o2_any_solid_pct}% O₂ or at reduced pressure. NASA's Saffire experiments on Cygnus did burn large samples at raised oxygen and reduced pressure. Those burns are published (${esc(L.citation)}) and kept apart from the PSI data:</p>
${table("Saffire IV–VI burns as published by NASA (transcribed in data/literature/saffire_iv_vi.csv).", ["Sample", "Material", "O₂", "Pressure", "Burn", "CO₂ rise", "CO rise"], L.rows.map((r) => [r.sample, esc(r.material), r.x_o2 == null ? "—" : pct(r.x_o2, 1), r.p_atm == null ? "—" : `${r.p_atm.toFixed(2)} atm`, r.ignited ? `${r.burn_s} s` : "did not ignite", r.co2_increase_ppm == null ? "—" : `${n(r.co2_increase_ppm)} ppm`, r.co_increase_ppm == null ? "—" : `${r.co_increase_ppm} ppm`]))}
<p>They show that cotton-fiberglass fabric and acrylic burn in Moon-base-like air, at one airflow (20 cm/s). They do not show where those materials stop burning, so every materials limit for 30% oxygen is still an extrapolation, which is why mapping those limits is the flight test the data asks for.</p>
${chart("c_sol", "NASA BASS-II flammability boundary for PMMA rods (tested range solid, extrapolation dashed), the 1 g upward-test limit and the crew atmospheres; diamonds are the published Saffire IV–VI burns at 20 cm/s.", 300)}
${h3("The lunar base, audited for fire")}
<p>To make the findings concrete we placed a three-module base on NASA's 5 m per pixel LOLA terrain of the ${esc(E.moonbase.site.name)} near the south pole (${Math.abs(E.moonbase.site.lat)}°S, ${E.moonbase.site.lon}°E, ${n(Math.round(E.moonbase.site.z))} m), where JPL Horizons puts the Sun between ${E.moonbase.site.sun_elev_range[0]}° and ${E.moonbase.site.sun_elev_range[1]}° above the local horizontal from November 2026 to November 2027. Each module is audited on four layers: materials, liquid fires, detection and suppression. Of ${E.moonbase.report.total_facts} numbers in the audit, ${E.moonbase.report.measured_layers} are NASA measurements; every other one is labelled derived, model, assumed, extrapolated or no data.</p>
${table("Fire audit of the lunar base. Module volumes use ISS Destiny, ISS Quest and Orion as stand-ins.", ["Module", "Materials", "Liquid fires", "Detection", "Suppression"], audit.map((m) => [`<b>${esc(m.name)}</b><br><span class="small">${pct(m.x_o2, 1)} · ${m.psi} psi · ${m.volume_m3} m³</span>`, ...["materials", "liquids", "detection", "suppression"].map((k) => `<span class="small">${esc(m.tests[k].answer || m.tests[k].facts[0].label + ": " + m.tests[k].facts[0].value)}</span>`)]), "dense")}
<p>The audit ends in three flights that would close the biggest gaps:</p>
<ol>${flights.map((t) => `<li><b>${esc(t.what)}.</b> ${esc(t.why)}</li>`).join("")}</ol>
${fig("w_audit.jpg", "The audit in Findings: each cell carries a provenance tag; clicking a module opens every number, its source and its label.", "shot")}`);

  const s11 = sec("11", "The SI layer: briefings you can check", "The challenge asks for a super intelligence (SI) powered dashboard. Skylab Phoenix uses SI where it is strong, turning evidence into plain language, and keeps it away from decisions: rankings, predictions and the out-of-data guard stay deterministic and tested.", `
${h3("11.1 How it works")}
<ol><li><b>Evidence packs.</b> For each of the 5 habitats, 24 investigations, 3 lunar-base modules and the base as a whole, <span class="mono">pipeline/si.py</span> writes numbered evidence items (E1, E2…) computed from the gold data: model predictions with their intervals and the three endings, the most relevant investigations, coverage, the published Saffire burns, validation and the top findings.</li>
<li><b>SI drafts.</b> An SI model (Anthropic Claude) writes a short briefing from each pack. Each sentence lists the evidence items it relies on. <span class="mono">scripts/si_generate.py</span> regenerates the drafts through the API.</li>
<li><b>Verification firewall.</b> Code publishes a briefing only if every sentence cites existing evidence, every number appears in the evidence it cites, nothing reads as a safety verdict (“is safe”, “certified”, “guaranteed”…), and the evidence is unchanged since the draft was written (hash). Otherwise the website shows the evidence itself, labelled “Evidence brief”.</li></ol>
<p><b>Result: ${SI.meta.verified} of ${SI.meta.total} briefings pass.</b> The firewall is exercised every time the data changes: adding the three-ending model and the Saffire IV–VI burns changed the evidence of 9 packs, and the firewall blocked exactly those 9 drafts, naming the outdated numbers, until they were rewritten. The test suite checks that invented numbers, wrong citations, uncited sentences, verdicts and stale drafts are all rejected. The firewall checks numbers and citations, not meaning, so the drafts were also read against what the data records: a sentence implying that broken droplets keep burning was removed because NASA does not record that.</p>
${h3("11.2 Example: lunar-base briefing as published")}
${box(`<span class="badge">SI-written · verified ✓</span><p><b>${esc(moonBrief.headline)}</b></p><p>${moonBrief.sentences.map((s) => `${esc(s.text)} <span class="cite">[${s.cites.join(", ")}]</span>`).join(" ")}</p>`, "pink")}
${table("Evidence cited by that briefing (computed by the pipeline from PSI and the published Saffire burns).", ["Item", "Evidence"], [...new Set(moonBrief.sentences.flatMap((s) => s.cites))].sort((a, b) => +a.slice(1) - +b.slice(1)).map((k) => [k, `<span class="small">${esc(moonPack.items[k])}</span>`]))}
${h3("11.3 The “Ask SI” chat")}
<p>On the website the briefings live in a floating chat available on every page. A visitor opens the verified briefing of any crew atmosphere, with its citations, evidence, a download and a link to the Fire Lab, or asks a question: a BM25 keyword search, running in the browser over NASA's own text for the 24 investigations (objectives, hypotheses, approach, Earth benefits, publication titles), our findings, the habitat definitions and a short glossary, returns ranked passages with their source and a link to the PSI record. It quotes; it does not generate, so it cannot invent an answer, and it says so when no passage fits.</p>
${fig("w_chat.jpg", "The Ask SI chat with the verified lunar-base briefing, its numbered citations and evidence.", "shot")}`);

  const s12 = sec("12", "The Skylab Phoenix website", "A static website with its own design. The models run in the browser, so every control is a live prediction and there is no server that could fail during a demo. It is published on GitHub Pages: juanzarate1129517999-beep.github.io/nasa-space.", `
${table("Sections of the website and the question each one answers.", ["Section", "What it shows"], [
    ["Home", "The headline numbers and a 3D Earth with the ISS and 23 NASA satellites on today's orbital elements, the Moon (LRO colour and LOLA relief) and Mars; the stars are peaks of NASA's star map"],
    ["Learn 3D", "An immersive four-chapter story: NASA's Artemis plan over a real 3D Moon and the descent to the base site; five ways a fire starts inside an ISS module, each tied to the investigation that measured it; how one flame changes from Earth to orbit; the same fire in four gravities"],
    ["Flames", `${CLIPS.length} clips of real flight video (${clipsBy("Solid")} solids, ${clipsBy("Liquid")} liquids, ${clipsBy("Gas")} gases) and the solid-material limits measured by BASS-II. ${CLIPS.filter((c) => c.gen).length} clips were cut by scripts/build_clips.py, which downloads NASA PSI raw video, finds the flame, crops and speeds it up; every clip was reviewed and 27 were rejected`],
    ["Fire Lab", "The two-stage model with the three endings, the interval and the out-of-data status, and the real-time d² replay"],
    ["Findings", "The interactive dashboard over all records, coverage, the lunar-base audit and the findings ranked by evidence"],
    ["Ranking", "The 24 investigations ranked per habitat, an adjustable score, a robustness test, files and side-by-side comparison"],
    ["Next flight", "The recommended experiment, the six candidates, the recommendation table and the map of doubt"],
    ["Method", "Nine steps from the question to reproduction, with the quality log, validation and the SI firewall"],
    ["Ask SI (chat)", "Floating on every page: the verified SI briefings with their evidence and a search over NASA's own text"]])}
${fig("w_home.jpg", "Home: the Moon base will breathe 30% oxygen; Earth with the ISS and NASA satellites on today's orbital elements, the Moon and Mars.", "shot")}
${fig("w_moon.jpg", "Learn 3D, chapter 1: NASA's Artemis plan over the Moon (LRO LROC colour and LOLA relief).", "shot")}
${fig("w_base.jpg", "Learn 3D, landing: the base on real LOLA terrain, lit by the Sun where JPL Horizons places it.", "shot")}
${fig("w_sources.jpg", "Learn 3D, chapter 2: five fire sources inside an ISS module, each tied to the NASA investigation that measured it.", "shot")}
${fig("w_flames.jpg", "Flames: the same acrylic rod at four oxygen levels, real ISS flight video from BASS-II.", "shot")}
${fig("w_archive.jpg", `The flight archive: ${CLIPS.length} clips of solids, liquids and gases, filtered by state and material.`, "shot")}
${fig("w_dash.jpg", `The interactive dashboard: every chart over the ${n(S.records)} records filters the others.`, "shot")}
${fig("w_ranking.jpg", "Ranking: the 24 investigations for the chosen habitat and safety layer.", "shot")}
${fig("w_method.jpg", "Method: nine explained steps from the question to reproduction.", "shot")}
${box(`<b>Why the method is on the website and in this report.</b> The Method page gives every visitor, including judges, a short and checkable account of how each number is made, next to the data it describes. This report holds the full detail: formulas, the complete quality log, the data dictionary and references.`, "pink")}`);

  const s13 = sec("13", "Discussion and limitations", "Saying clearly what the data does not allow is part of the result.", `
<ul class="concepts">
<li><b>Droplets, not cabin materials.</b> The main model was trained on methanol and heptane droplets. The defensible conclusion is that, in the droplet fires NASA flew, going out on its own nearly disappears at ≥ 30% O₂. It is not a direct prediction for fabrics or polymers.</li>
<li><b>Little data near the Moon.</b> ${S.moon_envelope} records in the lunar envelope and no solid in PSI's tables; ${L.elevated.n} published Saffire burns reach that oxygen, at one airflow. The intervals reflect it and the out-of-data guard watches it.</li>
<li><b>What happens after a droplet breaks apart is not recorded.</b> NASA's FLEX table labels the ending “Disruption”; the model and the website never say whether the fragments kept burning.</li>
<li><b>CO₂ effect partly confounded with O₂.</b> In FLEX, each CO₂ level was tested at a different O₂ and never above 25% O₂. We show empirical rates and label any CO₂ answer at lunar-base oxygen as extrapolated.</li>
<li><b>Model choice made on the validation scheme.</b> About twenty variants were compared on the same held-out days, so the reported scores are slightly optimistic.</li>
<li><b>BASS outcomes extracted from text.</b> They come from regular expressions over operator notes and are hints for a combustion expert to review.</li>
<li><b>Solids concentrated in PMMA.</b> Other materials have very little data.</li>
<li><b>Published values transcribed.</b> The Saffire IV–VI values are copied from NASA's paper, not from a PSI table.</li>
<li><b>No partial gravity.</b> PSI has no lunar or Martian data. Saffire-II bounds only the 20 cm/s regime.</li>
<li><b>Assumed conditions.</b> In SPICE, SLICE, SAME, CLD and E-FIELD, O₂ and pressure are not reported per test and cabin air was assumed. They are flagged and down-weighted in the ranking.</li>
<li><b>Extrapolated limiting temperature.</b> The 50% point in CFI-G lies above the hottest temperature tested.</li>
<li><b>Illustrations are labelled.</b> Flame size in the Fire Lab and every partial-gravity flame are illustrations; module volumes of the lunar base are ISS and Orion stand-ins.</li>
<li><b>SI text is interpretation, not evidence.</b> The firewall guarantees citations and numbers, not that an interpretation is the best one; the evidence behind every sentence is one click away.</li></ul>
${h3("What we did to mitigate it")}
<p>Validation by whole test days, repeated; comparison with baselines; bootstrap intervals; a calibration diagram; an out-of-data guard with a per-input range check; a public correction log; the three endings kept apart; published data kept separate from PSI; a verified SI layer; automated tests in continuous integration; and wording that separates what was measured from what was extrapolated.</p>`);

  const s14 = sec("14", "Impact for exploration and on Earth", "", `
<ul class="concepts">
<li><b>Lunar habitat design.</b> Quantifies how much the risk grows from cabin air to lunar-base air and what must be measured before certifying materials.</li>
<li><b>Experiment planning.</b> The active-learning recommendation prioritizes tests for the ISS, LUCI or FM2 where they add the most information.</li>
<li><b>Detection and suppression.</b> Flags cool flames as a risk for optical detectors, CO₂ and helium as suppressants with measurable effects, and ventilation as a design variable.</li>
<li><b>Open data engineering.</b> The clean dataset, the ${S.qc_fixes}-entry PSI correction log and ${CLIPS.length} cut flight clips serve any researcher.</li>
<li><b>On Earth.</b> The same questions (oxygen-enriched atmospheres in hospitals, submarines and mines; smoke detection that tells smoke from dust; firefighter equipment) benefit from this data. The profiles include the Earth benefits PSI reports for each investigation.</li></ul>`);

  const s15 = sec("15", "Conclusions", "", `
<ol><li>NASA's flight data shows that at ≥ 30% O₂ droplet fires stop putting themselves out: in FLEX, ${E.o2_bands[E.o2_bands.length - 1].extincion} of ${E.o2_bands[E.o2_bands.length - 1].n} droplets at 30–34% O₂, and most of the rest broke apart.</li>
<li>A two-stage, calibrated model (out-of-sample AUC ${lr.auc.toFixed(2)}) estimates that the chance a methanol droplet fire goes out on its own falls from ${pct(CM.p)} in the cabin to ${pct(MM.p)} in the lunar base, where the droplet is predicted to break apart ${pct(MM.disruption.p)} of the time.</li>
<li>The data gap is the most important finding for NASA: ${S.moon_envelope} records near lunar-base air, no solid in PSI's tables, ${L.elevated.n} published Saffire burns at one airflow, no flame at lunar gravity.</li>
<li>The highest-value next tests are CO₂ suppression at lunar-base O₂ and pressure, and the flammability limits of habitat materials there.</li>
<li>Everything is reproducible and traceable, and it is presented in a website, with verified SI briefings, that says when it does not know.</li></ol>`);

  const s16 = sec("16", "Future work", "", `
<ul><li>A flammability envelope for solids (PMMA, SIBAL) with a Gaussian process in the flow–O₂ plane, after turning BASS flow sweeps into expert-reviewed points, and adding the Saffire IV–VI burns when NASA publishes them in PSI.</li>
<li>Extract results from PSI publications with an SI model and cross-check them against the tables with the same firewall.</li>
<li>Add partial-gravity data (LUCI, FM2) when PSI publishes it, and retrain.</li>
<li>A survival model for gas-flame burn time that treats flames still burning at fuel cut-off as censored.</li>
<li>Use the flight video itself: measure flame size and the moment of disruption frame by frame from the clips already cut.</li></ul>`);

  const s17 = sec("17", "Reproducibility", "", `
<pre>python -m venv .venv &amp;&amp; source .venv/bin/activate
pip install -r requirements.txt
python scripts/fetch_psi_catalog.py combustion
python scripts/fetch_psi.py data/psi PSI-10 PSI-20 … PSI-159
python scripts/build_moon_assets.py web/assets/moon   # LOLA terrain, Moon textures, JPL Horizons
python -m pipeline.run                              # silver → gold → models → SI firewall → web/data
python -m pytest
python scripts/serve.py                             # website at http://127.0.0.1:8765
node report/build_report.js                         # this PDF (needs the local website and Playwright)
python scripts/build_clips.py bass2 40              # optional: cut more flight clips from PSI raw video</pre>
${table("Repository layout.", ["Path", "Contents"], [["web/", "The website: index.html, styles.css, app.js, the 3D modules, data, flight video, bundled Plotly and three.js"], ["pipeline/", "Cleaning, profiles and ranking, models, solids, lunar-base audit, SI evidence and firewall, web export"], ["scripts/", "Downloads from NASA PSI, flight clips, star field, lunar assets, SI drafts, local server"], ["data/gold/, data/si/, data/literature/, data/clips/", "Tests, investigations, QC log, findings; evidence packs, SI drafts and verification; published Saffire burns; clip records"], ["tests/", "Data, model, out-of-data guard, published-data and SI firewall tests"], ["report/", "This report and its generator"], ["docs/", "Use of AI and the 30-second demo video"]])}`);

  const refs = `<section class="sec"><div class="sec-top"><span class="bar"></span></div><h1>References</h1><ol class="refs">
<li>NASA Space Apps Challenge 2026. Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data. spaceappschallenge.org/2026/challenges/flame-in-freefall</li>
<li>NASA Physical Sciences Informatics (PSI). Repository, search “combustion”. psi.nasa.gov/physci/repo · CC0 license</li>
<li>NASA Glenn Research Center. Combustion Science. nasa.gov/glenn</li>
<li>NASA. A Researcher's Guide to International Space Station Combustion Science.</li>
<li>${esc(E.solids.source)}.</li>
<li>${esc(L.citation)}. ${esc(L.url)}</li>
<li>NASA exploration atmosphere: 8.2 psia, 34% O₂. NTRS 20240007817 (ICES-2024-128).</li>
<li>NASA SVS CGI Moon Kit (LRO LROC colour, LOLA elevation), svs.gsfc.nasa.gov/4720; NASA GSFC PGDA LOLA 5 m/pixel south-pole terrain, pgda.gsfc.nasa.gov/products/78 (Barker et al. 2021); JPL Horizons, ssd.jpl.nasa.gov/horizons; NASA SVS Orbit Viewer.</li>
<li>Burke, S. P., Schumann, T. E. W. (1928). Diffusion flames. Industrial &amp; Engineering Chemistry 20(10).</li>
${E.investigations.map((r) => `<li>${esc(r.name)} (${esc(r.psi_id)}). ${esc(r.title || "")}. NASA PSI, doi:${esc(r.doi)}</li>`).join("")}
</ol></section>`;

  const dict = [["test_uid", "Unique test id: PSI id + test identifier"], ["psi_id / experimento", "Source investigation"], ["familia", "Fuel family: droplet, gas, solid, smoke, dust"], ["combustible / material_familia", "Fuel or material, and its family"], ["x_o2", "O₂ mole fraction (0–1)"], ["o2_ubicacion, o2_supuesto", "Where O₂ was measured (ambient or burner) and whether it was assumed"], ["p_atm, p_supuesta", "Pressure in atm, and whether it was assumed"], ["x_co2, x_he", "CO₂ and helium mole fractions"], ["flujo_cm_s, barrido_flujo, direccion_flujo", "Airflow speed, whether it was swept, and its direction"], ["d0_mm", "Initial droplet diameter"], ["gravedad", "μg or 1 g"], ["ignicion", "Ignited (1/0)"], ["autoextincion", "Went out on its own (1/0)"], ["resultado", "How the test ended: extinction, disruption, completion, flow cut, no ignition, flash…"], ["llama_fria", "Cool flame observed"], ["tad_k, zst", "Adiabatic flame temperature and stoichiometric mixture fraction (CFI-G)"], ["tasa_quemado", "Burning-rate constant K (mm²/s)"], ["tiempo_quemado_s", "Burn time"], ["d_ext_mm", "Diameter at flame extinction"], ["n_eventos", "Flames lit in the record (ACME daily tables)"], ["con_resultado", "The record has an outcome label"], ["fecha", "Test date"], ["qc_flags", "Quality flags raised by the pipeline"]];
  const annexA = `<section class="sec"><div class="sec-top"><span class="bar"></span></div><h1>Annex A. Data dictionary (gold test table)</h1><p class="small">data/gold/ensayos.csv, ${n(S.records)} rows. Column names kept as written by the pipeline.</p>${table("Columns of the gold test table.", ["Field", "Description"], dict.map(([a, b]) => [`<span class="mono">${a}</span>`, b]))}</section>`;
  const annexB = `<section class="sec"><div class="sec-top"><span class="bar"></span></div><h1>Annex B. Formulas</h1><div class="formulas">
<p class="mono">Logistic: P = 1 / (1 + e^−(β₀ + Σ βᵢ·zᵢ)),  zᵢ = (xᵢ − μᵢ) / σᵢ</p>
<p class="mono">Three endings: P(out) = (1 − P_D)·P_E · P(breaks apart) = P_D · P(burns out) = (1 − P_D)(1 − P_E)</p>
<p class="mono">Stoichiometric flame temperature: T_st = T₀ + Q·Y_O₂ / (c_p·(s + Y_O₂))   (Q: lower heating value; s: kg O₂ per kg fuel)</p>
<p class="mono">Residence time feature: log(d₀²·p)</p>
<p class="mono">Wilson interval (90%): (p̂ + z²/2n ± z·√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n),  z = 1.645</p>
<p class="mono">Out-of-data distance: mean Euclidean distance to the 5 nearest flown tests in standardized inputs; limit = 95th percentile among tests (${ood.toFixed(2)})</p>
<p class="mono">d² law: d² = d₀² − K·t</p>
<p class="mono">BASS-II boundary: ${esc(E.solids.boundary.equation)}</p>
<p class="mono">Relevance = 100·(0.5·proximity + 0.2·evidence + 0.3·directness),  proximity = 1 − e^(−n/8)</p>
<p class="mono">Evidence = 100·(0.35·volume + 0.25·quality + 0.20·agreement + 0.20·closeness)</p>
<p class="mono">Active learning score = ${esc(E.next.score_formula)}</p></div></section>`;
  const annexC = `<section class="sec"><div class="sec-top"><span class="bar"></span></div><h1>Annex C. Full quality log (${S.qc_fixes} corrections)</h1><p class="small">data/gold/qc_log.csv and web/data/downloads/qc_log.csv.</p>
${table("Every correction, with the original and new value and the rule applied.", ["PSI", "Experiment", "Record", "Field", "Original", "New", "Rule"], E.qc.map((q) => [q.psi_id, esc(q.experimento), esc(q.registro), esc(q.campo), esc(String(q.valor_original).slice(0, 60)), esc(String(q.valor_nuevo).slice(0, 40)), esc(q.regla)]), "qc")}</section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Skylab Phoenix · Technical report</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500&display=block" rel="stylesheet">
<script src="../web/vendor/plotly-2.35.2.min.js"></script>
<style>${CSS}</style></head><body>
${cover}${abstract}${contents}${s1}${s2}${s3}${s4}${s5}${s6}${s7}${s8}${s9}${s10}${s11}${s12}${s13}${s14}${s15}${s16}${s17}${refs}${annexA}${annexB}${annexC}
<script>window.DATA = ${JSON.stringify(chartData)};</script><script>${CHARTS}</script></body></html>`;
}

const CSS = `
@page { size: A4; margin: 18mm 17mm 20mm; }
@page :first { margin: 0; }
:root { --o: #f2600f; --ink: #0f172a; --ink2: #334155; --ink3: #64748b; --line: #e5e7eb; --fire: linear-gradient(90deg, #fbbf24, #f97316 35%, #f43f5e 68%, #8b5cf6); }
* { box-sizing: border-box; }
body { margin: 0; font-family: Geist, Inter, Arial, sans-serif; color: var(--ink); font-size: 9.6pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
p { margin: 0 0 2.6mm; } ul, ol { margin: 0 0 3mm; padding-left: 5mm; } li { margin-bottom: 1.1mm; }
.cover { position: relative; height: 296mm; overflow: hidden; break-after: page; }
.cv-bar { position: absolute; left: 0; top: 0; width: 100%; height: 7mm; background: var(--fire); }
.cv-glow { position: absolute; right: -40mm; top: 30mm; width: 150mm; height: 150mm; border-radius: 50%; background: radial-gradient(circle, rgba(244,63,94,.10), rgba(139,92,246,.06) 45%, transparent 70%); }
.cv-main { position: relative; padding: 32mm 20mm 0; }
.logo { width: 21mm; height: 21mm; border-radius: 50%; background: #0b0d1a; display: grid; place-items: center; margin-bottom: 8mm; box-shadow: 0 6px 18px rgba(15,23,42,.25); }
.logo img { width: 13mm; }
.cv-title { font-size: 38pt; font-weight: 800; letter-spacing: -.045em; line-height: 1; margin: 0 0 5mm; }
.cv-sub { font-size: 12.5pt; color: var(--ink2); max-width: 140mm; line-height: 1.45; margin-bottom: 4mm; }
.cv-eyebrow { font-size: 7.4pt; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--o); margin-bottom: 12mm; }
.cv-kpi { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin-bottom: 15mm; max-width: 155mm; }
.cv-kpi div { padding: 4mm 3mm; border-left: 1px solid var(--line); } .cv-kpi div:first-child { border-left: 0; padding-left: 0; }
.cv-kpi b { display: block; font-size: 16pt; font-weight: 600; color: var(--o); letter-spacing: -.02em; }
.cv-kpi b.g { color: #ea4a2f; }
.cv-kpi span { font-size: 7.2pt; color: var(--ink3); line-height: 1.3; display: block; margin-top: 1mm; }
.cv-tab { width: 155mm; border-collapse: collapse; font-size: 8.2pt; }
.cv-tab td { padding: 2.4mm 2mm; border-top: 1px solid var(--line); vertical-align: top; } .cv-tab tr:last-child td { border-bottom: 1px solid var(--line); }
.cv-tab td:first-child { width: 36mm; color: var(--ink3); }
.cv-date { margin-top: 10mm; font-size: 7.6pt; color: var(--ink3); }
.sec { break-before: page; }
.sec-top { display: flex; align-items: center; gap: 3mm; margin-bottom: 3mm; } .sec-top .bar { width: 14mm; height: 1.4mm; border-radius: 1mm; background: var(--fire); } .sec-top .num { font-size: 8pt; font-weight: 600; color: var(--o); }
h1 { font-size: 19pt; font-weight: 700; letter-spacing: -.03em; line-height: 1.12; margin: 0 0 3mm; }
.lead { font-size: 10.6pt; font-weight: 600; color: var(--ink); line-height: 1.45; margin-bottom: 4mm; }
h2 { font-size: 12pt; margin: 6mm 0 2mm; } h3 { font-size: 10.5pt; font-weight: 700; margin: 6mm 0 2.2mm; display: flex; align-items: center; gap: 2.4mm; break-after: avoid; }
h3 i { width: 2mm; height: 2mm; border-radius: 50%; background: var(--o); flex: none; }
.small { font-size: 8pt; color: var(--ink2); } .mono { font-family: "Geist Mono", monospace; font-size: 8.2pt; }
.box { border-radius: 2.5mm; padding: 4mm 5mm; margin: 3mm 0 4mm; break-inside: avoid; }
.box.pink { background: #fff5f1; border-left: 2.5px solid var(--o); } .box.violet { background: #f6f3ff; border-left: 2.5px solid #8b5cf6; }
.box.dark { background: #0f172a; color: #e2e8f0; } .box.dark .mono { color: #fbbf24; font-size: 8.4pt; } .box.dark .small { color: #cbd5e1; } .box.dark b { color: #fff; }
.box .bh { font-weight: 700; margin-bottom: 1.5mm; }
.tcap { font-size: 8pt; color: var(--ink2); margin: 4mm 0 1.5mm; } .tcap b, figcaption b, .fcap b { color: var(--o); }
table { width: 100%; border-collapse: collapse; font-size: 8.2pt; margin: 0 0 4mm; }
thead th { background: #0f172a; color: #fff; text-align: left; font-weight: 600; padding: 1.8mm 2mm; font-size: 7.8pt; }
td { padding: 1.7mm 2mm; border-bottom: 1px solid var(--line); vertical-align: top; } tr { break-inside: avoid; }
.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.dense td { padding: 1.2mm 1.6mm; font-size: 7.6pt; } table.qc td { padding: .9mm 1.3mm; font-size: 6.6pt; } table.qc th { font-size: 6.8pt; }
table.hl1 tbody tr:first-child td { background: #fff5f1; font-weight: 600; }
figure { margin: 3mm 0 5mm; break-inside: avoid; } figcaption, .fcap { font-size: 7.8pt; color: var(--ink2); margin-top: 1.5mm; }
figure.shot img { width: 100%; border-radius: 2mm; display: block; }
.chart { width: 100%; }
.two { display: grid; grid-template-columns: 1.1fr 1fr; gap: 6mm; align-items: center; }
.pipe { display: flex; align-items: stretch; gap: 1.5mm; margin: 3mm 0 1mm; } .pipe > div { flex: 1; border-radius: 2mm; padding: 2.5mm; background: #f8fafc; border-top: 2px solid var(--o); }
.pipe > div:nth-child(3) { border-color: #f59e0b; } .pipe > div:nth-child(5) { border-color: #f43f5e; } .pipe > div:nth-child(7) { border-color: #8b5cf6; } .pipe > div:nth-child(9) { border-color: #0b93d6; }
.pipe b { display: block; font-size: 6.6pt; letter-spacing: .08em; color: var(--o); } .pipe span { display: block; font-weight: 600; font-size: 8pt; } .pipe small { display: block; font-size: 6.8pt; color: var(--ink3); line-height: 1.35; margin-top: 1mm; }
.pipe i { align-self: center; font-style: normal; color: var(--ink3); }
.concepts li { margin-bottom: 1.8mm; }
.toc { columns: 2; column-gap: 10mm; font-size: 10pt; } .toc li { margin-bottom: 2mm; }
.badge { display: inline-block; font-family: "Geist Mono", monospace; font-size: 7pt; padding: .4mm 2mm; border-radius: 9px; background: #e7f7f4; color: #0b7d70; border: 1px solid #9ad8cf; margin-bottom: 2mm; }
.cite { font-family: "Geist Mono", monospace; font-size: 7pt; color: #b45309; }
pre { background: #0f172a; color: #e2e8f0; border-radius: 2.5mm; padding: 4mm 5mm; font-family: "Geist Mono", monospace; font-size: 7.6pt; line-height: 1.6; white-space: pre-wrap; }
.formulas p { background: #0f172a; color: #fbbf24; padding: 2.4mm 4mm; border-radius: 2mm; margin-bottom: 2mm; }
.refs li { font-size: 8pt; margin-bottom: 1.4mm; }
`;

// Charts drawn in the page with Plotly, light theme.
const CHARTS = `
(function () {
  const D = window.DATA, P = window.Plotly;
  const C = { blue: "#0b93d6", amber: "#f5a524", orange: "#e8590c", violet: "#7c5cff", teal: "#0f9d8f", gray: "#94a3b8", ink: "#0f172a", rose: "#f43f5e" };
  const FAM = { solido: [C.orange, "square"], gota: [C.blue, "circle"], gas: [C.violet, "diamond"], humo: [C.teal, "triangle-up"], polvo: [C.teal, "triangle-up"] };
  const ax = (o) => Object.assign({ gridcolor: "#eef0f3", linecolor: "#cbd5e1", zeroline: false, ticks: "", tickfont: { family: "Geist Mono, monospace", size: 8.5, color: "#475569" }, title: { font: { size: 9.5, color: "#334155" } }, automargin: true }, o || {});
  const lay = (t, o) => Object.assign({ font: { family: "Geist, sans-serif", size: 9, color: "#334155" }, paper_bgcolor: "#fff", plot_bgcolor: "#fff", margin: { l: 50, r: 16, t: t ? 30 : 8, b: 36 }, showlegend: false,
    title: t ? { text: "<b>" + t + "</b>", font: { size: 10.5, color: "#0f172a" }, x: 0.01, xanchor: "left" } : undefined, legend: { orientation: "h", y: -0.18, font: { size: 8.5 } } }, o || {}, { xaxis: ax((o || {}).xaxis), yaxis: ax((o || {}).yaxis) });
  const jobs = [];
  const plot = (id, data, layout) => { const el = document.getElementById(id); if (el) jobs.push(P.newPlot(el, data, layout, { staticPlot: true, displayModeBar: false })); };
  const habPts = D.habitats.filter((h) => h.x_o2 < 1);

  plot("c_qc", [{ type: "bar", orientation: "h", y: D.qc.map((q) => q[0].length > 82 ? q[0].slice(0, 80) + "…" : q[0]).reverse(), x: D.qc.map((q) => q[1]).reverse(), marker: { color: C.orange }, text: D.qc.map((q) => q[1]).reverse(), textposition: "outside", textfont: { size: 8 } }],
    lay("Corrections to NASA's tables by type", { margin: { l: 10, r: 30, t: 30, b: 30 }, yaxis: { tickfont: { size: 7.2, family: "Geist, sans-serif" } }, xaxis: { title: { text: "Logged corrections" } }, bargap: 0.35 }));

  const cov = [];
  D.cov.forEach((g) => { const [c, s] = FAM[g.fam] || [C.gray, "circle"]; cov.push({ type: "scatter", mode: "markers", x: g.x.map((v) => 100 * v), y: g.y, name: g.name, marker: { size: 5, symbol: s + (g.assumed || g.burner ? "-open" : ""), color: c, opacity: 0.75, line: { width: 1, color: c } } }); });
  cov.push({ type: "scatter", mode: "lines", x: [100 * D.moonEnv.x_o2_min, 100, 100, 100 * D.moonEnv.x_o2_min, 100 * D.moonEnv.x_o2_min], y: [0.2, 0.2, D.moonEnv.p_atm_max, D.moonEnv.p_atm_max, 0.2], fill: "toself", fillcolor: "rgba(232,89,12,0.08)", line: { color: "rgba(232,89,12,0.5)", width: 1 } });
  cov.push({ type: "scatter", mode: "markers+text", x: D.habitats.map((h) => 100 * h.x_o2), y: D.habitats.map((h) => h.p_atm), text: D.habitats.map((h) => h.name), textposition: "top right", textfont: { size: 8.5, color: C.ink }, marker: { symbol: "cross-thin-open", size: 11, color: C.ink, line: { width: 2, color: C.ink } } });
  plot("c_cov", cov, lay("Only " + 37 + " of 1,613 flight records lie near lunar-base air", { xaxis: { title: { text: "Oxygen, % of the air" }, range: [8, 104], ticksuffix: "%" }, yaxis: { type: "log", title: { text: "Pressure, atm (log scale)" }, range: [Math.log10(0.22), Math.log10(5.5)], tickvals: [0.25, 0.5, 0.7, 1, 2, 3, 5] } }));

  const segs = [["extincion", "Went out on its own", C.blue], ["disrupcion", "Droplet broke apart", C.amber], ["completo", "Burned to completion", C.orange]];
  plot("c_bands", segs.map(([k, l, c]) => ({ type: "bar", orientation: "h", name: l, y: D.bands.map((b) => b.band + " O₂"), x: D.bands.map((b) => b[k] / b.n), marker: { color: c, line: { color: "#fff", width: 1.5 } },
    text: D.bands.map((b) => b[k] / b.n >= 0.09 ? Math.round(100 * b[k] / b.n) + "%" : ""), textposition: "inside", insidetextanchor: "middle", textfont: { color: "#fff", size: 8.5 } })).concat([{ type: "scatter", mode: "text", y: D.bands.map((b) => b.band + " O₂"), x: D.bands.map(() => 1.06), showlegend: false, text: D.bands.map((b) => "n = " + b.n), textfont: { size: 8.5 } }]),
    lay("FLEX: with more oxygen, droplet fires stop putting themselves out", { barmode: "stack", bargap: 0.35, showlegend: true, margin: { l: 70, r: 10, t: 30, b: 40 }, xaxis: { tickformat: ".0%", range: [0, 1.14], tickvals: [0, 0.25, 0.5, 0.75, 1] }, legend: { orientation: "h", y: -0.2 } }));

  const cats = ["0%", "1–20%", "20–30%", ">30%"];
  const co2 = []; [["Reduced pressure (0.7 atm)", C.orange, -0.08], ["≈1 atm and above", C.blue, 0.08]].forEach(([pr, c, off]) => {
    const rows = D.co2.filter((r) => r.pressure.startsWith(pr.slice(0, 6)) || r.pressure === pr); if (!rows.length) return;
    co2.push({ type: "scatter", mode: "lines+markers+text", name: pr, x: rows.map((r) => cats.indexOf(r.co2) + off), y: rows.map((r) => r.rate), text: rows.map((r) => "n=" + r.n), textposition: "bottom center", textfont: { size: 7.5, color: c },
      error_y: { type: "data", symmetric: false, array: rows.map((r) => r.ci[1] - r.rate), arrayminus: rows.map((r) => r.rate - r.ci[0]), color: c, thickness: 1, width: 0 }, line: { color: c, width: 2 }, marker: { color: c, size: 7 } }); });
  plot("c_co2", co2, lay("CO₂ suppression: at 0.7 atm, every droplet above 30% CO₂ went out", { showlegend: true, legend: { x: 0.01, y: 1, orientation: "v" }, xaxis: { tickvals: [0, 1, 2, 3], ticktext: cats.map((c) => c + " CO₂"), range: [-0.4, 3.4] }, yaxis: { tickformat: ".0%", range: [-0.02, 1.08], title: { text: "Tests that self-extinguished" } } }));

  const G = D.saffire2, lab = G.map((g) => g.material + " · " + g.muestra + " · " + g.direccion.toLowerCase());
  plot("c_grav", G.map((g, i) => ({ type: "scatter", mode: "lines", x: [g.ug_estado, g.g1_estado], y: [lab[i], lab[i]], line: { color: "#cbd5e1", width: 2 } })).concat([
    { type: "scatter", mode: "markers", name: "Microgravity (Cygnus)", x: G.map((g) => g.ug_estado), y: lab, marker: { color: C.blue, size: 9 } },
    { type: "scatter", mode: "markers", name: "1 g (ground)", x: G.map((g) => g.g1_estado), y: lab, marker: { color: C.orange, size: 8, symbol: "square" } }]),
    lay("Saffire-II: in 8 of 8 samples, 1 g burned as much or more than microgravity", { showlegend: true, margin: { l: 10, r: 16, t: 30, b: 40 }, xaxis: { tickvals: [0, 1, 2], ticktext: ["No spread", "Partial", "Whole sample"], range: [-0.3, 2.3] }, yaxis: { autorange: "reversed", tickfont: { size: 8, family: "Geist, sans-serif" } } }));

  plot("c_relev", [{ type: "heatmap", z: D.relev.z, x: D.relev.habs, y: D.relev.names, colorscale: [[0, "#fff7ed"], [0.5, "#fb923c"], [1, "#9a3412"]], zmin: 0, zmax: 100, text: D.relev.z.map((r) => r.map((v) => v.toFixed(0))), texttemplate: "%{text}", textfont: { size: 8 }, colorbar: { thickness: 8, len: 0.6, tickfont: { size: 8 } } }],
    lay("Relevance of each investigation per habitat (0–100)", { margin: { l: 10, r: 10, t: 30, b: 30 }, yaxis: { autorange: "reversed", tickfont: { size: 8.2, family: "Geist, sans-serif" } }, xaxis: { side: "top", tickfont: { size: 8.5, family: "Geist, sans-serif" } } }));

  plot("c_sim", [{ type: "heatmap", z: D.sim.matrix, x: D.sim.names, y: D.sim.names, colorscale: [[0, "#ffffff"], [0.5, "#c4b5fd"], [1, "#4c1d95"]], zmin: 0, zmax: 1, colorbar: { thickness: 8, len: 0.6, tickfont: { size: 8 } } }],
    lay("Investigations clustered by kind and hardware", { margin: { l: 10, r: 10, t: 30, b: 10 }, xaxis: { tickangle: -60, tickfont: { size: 7.4, family: "Geist, sans-serif" } }, yaxis: { autorange: "reversed", tickfont: { size: 7.4, family: "Geist, sans-serif" } } }));

  const M = D.val.filter((m) => m.key !== "prior"), short = { lr: "Two-stage", lr6: "Single logistic", gb: "Gradient boosting", o2: "O₂ only" };
  const mcol = (m) => (m.deployed ? C.orange : "#cbd5e1");
  plot("c_val", [["auc", "AUC (higher = better)", "x"], ["brier", "Brier (lower = better)", "x2"], ["log_loss", "Log loss (lower = better)", "x3"]].map(([k, t, xa], j) => ({ type: "bar", x: M.map((m) => short[m.key]), y: M.map((m) => m[k]), xaxis: xa, yaxis: j ? "y" + (j + 1) : "y", marker: { color: M.map(mcol) }, text: M.map((m) => m[k].toFixed(3)), textposition: "outside", textfont: { size: 7.5 } })),
    Object.assign(lay("", { margin: { l: 36, r: 10, t: 22, b: 40 } }), { grid: { rows: 1, columns: 3, pattern: "independent" }, xaxis: ax({ tickfont: { size: 7.2, family: "Geist, sans-serif" } }), xaxis2: ax({ tickfont: { size: 7.2, family: "Geist, sans-serif" } }), xaxis3: ax({ tickfont: { size: 7.2, family: "Geist, sans-serif" } }), yaxis: ax({ range: [0.5, 0.95] }), yaxis2: ax({ range: [0, 0.2] }), yaxis3: ax({ range: [0, 0.6] }),
      annotations: [["AUC (higher = better)", 0.14], ["Brier (lower = better)", 0.5], ["Log loss (lower = better)", 0.86]].map(([t, x]) => ({ text: "<b>" + t + "</b>", x, y: 1.12, xref: "paper", yref: "paper", showarrow: false, font: { size: 9 } })) }));

  plot("c_rel", [{ type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], line: { color: "#94a3b8", width: 1, dash: "dot" } },
    { type: "scatter", mode: "lines+markers", x: D.rel.map((r) => r.pred), y: D.rel.map((r) => r.obs), line: { color: C.orange, width: 2 }, marker: { color: C.amber, size: D.rel.map((r) => 6 + Math.sqrt(r.n)), line: { color: "#fff", width: 1.5 } } }],
    lay("Probabilities are calibrated", { xaxis: { tickformat: ".0%", range: [0, 1], title: { text: "Predicted chance it goes out" } }, yaxis: { tickformat: ".0%", range: [0, 1], title: { text: "Observed" } } }));

  const endTr = (e, xa, ya) => [["e", "Goes out on its own", C.blue], ["d", "Breaks apart", C.amber], ["c", "Burns to the end", C.orange]].map(([k, l, c], j) => ({ type: "scatter", mode: "lines", stackgroup: xa, name: l, showlegend: xa === "x", x: D.ends.o2.map((o) => 100 * o), y: e.map((r) => r[k]), line: { width: 0.5, color: c }, fillcolor: c, xaxis: xa, yaxis: ya }));
  plot("c_ends", endTr(D.ends.cabin, "x", "y").concat(endTr(D.ends.moon, "x2", "y2")),
    Object.assign(lay("", { showlegend: true, margin: { l: 44, r: 10, t: 24, b: 50 }, legend: { orientation: "h", y: -0.22 } }), { grid: { rows: 1, columns: 2, pattern: "independent" }, xaxis: ax({ ticksuffix: "%", title: { text: "O₂ at 14.7 psi" } }), xaxis2: ax({ ticksuffix: "%", title: { text: "O₂ at 10.2 psi" } }), yaxis: ax({ tickformat: ".0%", range: [0, 1] }), yaxis2: ax({ tickformat: ".0%", range: [0, 1] }),
      shapes: [{ type: "line", xref: "x2", yref: "paper", x0: 30, x1: 30, y0: 0, y1: 1, line: { color: C.ink, width: 1, dash: "dot" } }, { type: "line", xref: "x", yref: "paper", x0: 21, x1: 21, y0: 0, y1: 1, line: { color: C.ink, width: 1, dash: "dot" } }],
      annotations: [{ text: "<b>Cabin pressure</b>", x: 0.2, y: 1.1, xref: "paper", yref: "paper", showarrow: false, font: { size: 9 } }, { text: "<b>Lunar-base pressure</b>", x: 0.8, y: 1.1, xref: "paper", yref: "paper", showarrow: false, font: { size: 9 } }, { text: "cabin 21%", xref: "x", yref: "paper", x: 21, y: 0.98, showarrow: false, xanchor: "left", font: { size: 8 } }, { text: "base 30%", xref: "x2", yref: "paper", x: 30, y: 0.98, showarrow: false, xanchor: "left", font: { size: 8 } }] }));

  const ec = { extincion: "#ffffff", disrupcion: C.amber, completo: C.orange };
  plot("c_map", [{ type: "heatmap", x: D.map.o2.map((o) => 100 * o), y: D.map.p, z: D.map.z, colorscale: [[0, "#7c2d12"], [0.5, "#fb923c"], [1, "#e0f2fe"]], zmin: 0, zmax: 1, colorbar: { title: { text: "goes out", side: "right", font: { size: 8 } }, tickformat: ".0%", thickness: 8, tickfont: { size: 8 } } },
    { type: "contour", x: D.map.o2.map((o) => 100 * o), y: D.map.p, z: D.map.z, contours: { start: 0.5, end: 0.5, size: 0.1, coloring: "none" }, line: { color: "#fff", width: 2 }, showscale: false },
    { type: "scatter", mode: "markers", x: D.map.pts.map((t) => 100 * t[0]), y: D.map.pts.map((t) => t[1]), marker: { size: 6, color: D.map.pts.map((t) => ec[t[2]] || "#999"), line: { color: "#0f172a", width: 0.8 } } },
    { type: "scatter", mode: "markers+text", x: habPts.map((h) => 100 * h.x_o2), y: habPts.map((h) => h.p_atm), text: habPts.map((h) => h.name), textposition: "top right", textfont: { size: 8.5, color: "#fff" }, marker: { symbol: "x-thin-open", size: 10, color: "#fff", line: { width: 2, color: "#fff" } } }],
    lay("Model map: the white line marks 50% going out on its own", { xaxis: { ticksuffix: "%", title: { text: "Oxygen" }, range: [12, 42] }, yaxis: { type: "log", title: { text: "Pressure, atm" }, tickvals: [0.4, 0.5, 0.7, 1, 2, 3] } }));

  plot("c_hab", [{ type: "scatter", mode: "markers+text", y: D.hab.map((h) => h.name), x: D.hab.map((h) => h.p), text: D.hab.map((h) => Math.round(100 * h.p) + "%"), textposition: "top center", textfont: { size: 8.5 },
    error_x: { type: "data", symmetric: false, array: D.hab.map((h) => h.hi - h.p), arrayminus: D.hab.map((h) => h.p - h.lo), color: C.amber, thickness: 6, width: 0 }, marker: { size: 10, color: C.ink, line: { color: "#fff", width: 2 } } }],
    lay("Methanol droplet: chance the fire goes out on its own, with 90% interval", { margin: { l: 10, r: 16, t: 30, b: 30 }, xaxis: { tickformat: ".0%", range: [0, 1] }, yaxis: { autorange: "reversed", tickfont: { size: 8.5, family: "Geist, sans-serif" } } }));

  const cf = []; D.cfig.curves.forEach((cv) => { const col = cv.type === "normal" ? C.orange : C.violet;
    cf.push({ type: "scatter", x: cv.tad.concat([...cv.tad].reverse()), y: cv.hi.concat([...cv.lo].reverse()), fill: "toself", showlegend: false, fillcolor: cv.type === "normal" ? "rgba(232,89,12,0.15)" : "rgba(124,92,255,0.15)", line: { width: 0 } });
    cf.push({ type: "scatter", mode: "lines", name: cv.type === "normal" ? "Normal flames" : "Inverse flames", x: cv.tad, y: cv.p, line: { color: col, width: 2 } }); });
  cf.push({ type: "scatter", mode: "markers", showlegend: false, x: D.cfig.points.map((p) => p.tad_k), y: D.cfig.points.map((p, i) => (p.autoextincion ? 1.02 : -0.02) + (((i * 37) % 11) / 11 - 0.5) * 0.04), marker: { size: 4, color: D.cfig.points.map((p) => p.experimento.endsWith("inverse") ? C.violet : C.orange), opacity: 0.5 } });
  plot("c_cfig", cf, lay("Limiting-temperature hypothesis: holds for normal flames, not for inverse ones", { showlegend: true, legend: { x: 0.6, y: 0.95, orientation: "v" }, xaxis: { title: { text: "Adiabatic flame temperature, K" } }, yaxis: { tickformat: ".0%", range: [-0.08, 1.08], title: { text: "P(self-extinction)" } } }));

  const N = D.next, pk = N.picks;
  plot("c_next", [{ type: "heatmap", x: N.map.o2.map((o) => 100 * o), y: N.map.p, z: N.map.spread, colorscale: [[0, "#ffffff"], [0.5, "#c4b5fd"], [1, "#4c1d95"]], colorbar: { title: { text: "90% band", side: "right", font: { size: 8 } }, thickness: 8, tickfont: { size: 8 } } },
    { type: "scatter", mode: "markers", x: D.map.pts.map((t) => 100 * t[0]), y: D.map.pts.map((t) => t[1]), marker: { size: 4, color: "#0f172a", opacity: 0.5 } },
    { type: "scatter", mode: "markers+text", x: pk.map((k) => 100 * k.x_o2), y: pk.map((k) => k.p_atm), text: pk.map((k, i) => String(i + 1)), textfont: { color: "#fff", size: 8 }, marker: { size: 15, color: C.orange, line: { color: "#fff", width: 1.5 } } },
    { type: "scatter", mode: "markers+text", x: habPts.map((h) => 100 * h.x_o2), y: habPts.map((h) => h.p_atm), text: habPts.map((h) => h.name), textposition: "top right", textfont: { size: 8.5 }, marker: { symbol: "x-thin-open", size: 9, color: C.ink, line: { width: 2, color: C.ink } } }],
    lay("Where the model is unsure, and the 6 recommended tests", { xaxis: { ticksuffix: "%", title: { text: "Oxygen" } }, yaxis: { type: "log", title: { text: "Pressure, atm" } } }));

  const Lc = { Prevention: C.amber, Detection: C.blue, Suppression: C.teal };
  plot("c_find", [{ type: "bar", orientation: "h", y: D.findings.map((f, i) => "F" + (i + 1) + "  " + (f.title.length > 70 ? f.title.slice(0, 68) + "…" : f.title)).reverse(), x: D.findings.map((f) => f.score).reverse(), marker: { color: D.findings.map((f) => Lc[f.layer] || C.gray).reverse() }, text: D.findings.map((f) => f.score.toFixed(0)).reverse(), textposition: "outside", textfont: { size: 8 } }],
    lay("Findings ranked by strength of evidence", { margin: { l: 10, r: 26, t: 30, b: 30 }, yaxis: { tickfont: { size: 7.6, family: "Geist, sans-serif" } }, xaxis: { range: [0, 110], title: { text: "Evidence score (0–100)" } } }));

  const B = D.solids.b, inT = B.flow_cm_s.map((u, i) => (B.tested[i] ? B.o2_pct[i] : null)), outT = B.flow_cm_s.map((u, i) => (!B.tested[i] || i === B.tested.lastIndexOf(true) ? B.o2_pct[i] : null));
  plot("c_sol", [{ type: "scatter", mode: "lines", x: B.flow_cm_s, y: outT, line: { color: C.gray, width: 2, dash: "dash" }, connectgaps: false },
    { type: "scatter", mode: "lines", x: B.flow_cm_s, y: inT, line: { color: C.orange, width: 3 }, connectgaps: false },
    { type: "scatter", mode: "markers", x: D.solids.lit.map((r, i) => 20 * (1 + (i - 2) * 0.06)), y: D.solids.lit.map((r) => 100 * r.x_o2), text: D.solids.lit.map((r) => r.sample), marker: { symbol: "diamond", size: 9, color: C.rose, line: { color: "#fff", width: 1 } } }],
    lay("Solids keep burning above the line; Saffire V–VI burned at 26–31% O₂", { xaxis: { type: "log", range: [Math.log10(0.3), Math.log10(300)], title: { text: "Airflow past the sample, cm/s (log)" }, tickvals: [0.3, 1, 2, 5, 10, 20, 50, 100, 200] }, yaxis: { range: [12, 36], ticksuffix: "%", title: { text: "Oxygen" } },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: D.solids.g1, y1: D.solids.g1, line: { color: C.blue, width: 1, dash: "dot" } }].concat(habPts.map((h) => ({ type: "line", xref: "paper", x0: 0, x1: 1, y0: 100 * h.x_o2, y1: 100 * h.x_o2, line: { color: h.id === "moon_base" ? C.orange : "#cbd5e1", width: 1 } }))),
      annotations: [{ xref: "paper", x: 0.99, xanchor: "right", y: D.solids.g1, text: "1 g upward-test limit " + D.solids.g1 + "%", showarrow: false, yshift: 8, font: { size: 8, color: C.blue } }].concat(habPts.map((h) => ({ xref: "paper", x: 0.01, xanchor: "left", y: 100 * h.x_o2, text: h.name + " " + Math.round(1000 * h.x_o2) / 10 + "%", showarrow: false, yshift: 7, font: { size: 8, color: h.id === "moon_base" ? C.orange : "#64748b" } }))) }));

  Promise.all(jobs).then(() => { window.__done = true; }, () => { window.__done = true; });
})();`;

(async () => {
  if (!process.argv.includes("--no-figures")) await screenshots();
  const file = path.join(__dirname, "report.html");
  fs.writeFileSync(file, html());
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 1100 } });
  await p.goto("file://" + file, { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.pdf({ path: path.join(__dirname, "Technical_Report_Skylab_Phoenix.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: '<div style="font-family:Arial;font-size:6.5pt;color:#94a3b8;width:100%;padding:0 17mm;display:flex;justify-content:space-between"><span>Skylab Phoenix · Technical report · NASA Space Apps 2026</span><span style="color:#f2600f;font-weight:bold" class="pageNumber"></span></div>' });
  await b.close();
  if (!process.argv.includes("--keep-html")) fs.unlinkSync(file);
  console.log("report/Technical_Report_Skylab_Phoenix.pdf");
})();
