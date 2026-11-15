// Builds report/Technical_Report_Skylab_Phoenix.pdf from the pipeline outputs and figures captured from the website.
// Usage: python scripts/serve.py &   then   node report/build_report.js
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "http://127.0.0.1:8765/";
const FIG = path.join(__dirname, "figures");
const E = JSON.parse(fs.readFileSync(path.join(ROOT, "web/data/ember.json"), "utf8"));
const SI = JSON.parse(fs.readFileSync(path.join(ROOT, "web/data/si.js"), "utf8").replace(/^window\.SI=|;\s*$/g, ""));
const CLIPS = JSON.parse(fs.readFileSync(path.join(ROOT, "web/data/clips.js"), "utf8").replace(/^window\.CLIPS = |;\s*$/g, ""));
const PACKS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/si/evidence_packs.json"), "utf8"));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (p, d = 0) => `${(100 * p).toFixed(d)}%`;
const n = (x) => Number(x).toLocaleString("en-US");
const F = E.flex, V = F.validation, S = E.summary, HC = Object.fromEntries(E.habitat_check.map((h) => [h.habitat, h]));
const L = E.solids.literature, mods = E.moonbase.modules, next = E.next.picks;
const PSI_ATM = 14.696;

async function figures() {
  fs.mkdirSync(FIG, { recursive: true });
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  await p.addInitScript(() => { document.documentElement.classList.add("report-capture"); });
  const grab = async (hash, sel, file, before) => {
    await p.goto(SITE + hash, { waitUntil: "load" });
    await p.addStyleTag({ content: ".cb{display:none!important} *{animation:none!important;transition:none!important} .js .rv{opacity:1!important;transform:none!important}" });
    await p.waitForTimeout(2500);
    if (before) { await before(p); await p.waitForTimeout(1500); }
    const el = await p.$(sel);
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
    await el.screenshot({ path: path.join(FIG, file) });
  };
  await grab("#/findings", ".dash", "dashboard.png");
  await grab("#/findings", "#coverage", "coverage.png");
  await grab("#/lab", "#map-chart", "lab_moon.png", async (pg) => { await pg.click('#presets button[data-h="moon_base"]'); });
  await grab("#/lab", "#habitats", "habitats.png");
  await grab("#/findings/evidence", "#band-chart", "bands.png", async (pg) => { await pg.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); await pg.evaluate(() => window.dispatchEvent(new Event("resize"))); });
  await grab("#/flames", "#solid-map", "solids.png");
  await grab("#/data", "#rel-chart", "reliability.png");
  await grab("#/next", "#v-next .card", "next.png");
  await grab("#/flames", "#arch", "clips.png", async (pg) => { await pg.click("#arch-state button[data-s=Gas]"); });
  await b.close();
}

function html() {
  const fig = (f, cap) => `<figure><img src="figures/${f}"><figcaption>${cap}</figcaption></figure>`;
  const hab = E.habitats.filter((h) => h.x_o2 < 1);
  const qcRules = {};
  E.qc.forEach((q) => { const k = String(q.regla).replace(/\(\d+ cells?\)/, "").replace(/\d+/g, "#").slice(0, 90); qcRules[k] = (qcRules[k] || 0) + 1; });
  const qcTop = Object.entries(qcRules).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const byExp = {};
  E.records.rows.forEach((r) => { const e = E.records.experiments[r[0]]; byExp[e] = (byExp[e] || 0) + 1; });
  const moonBrief = SI.habitat.moon_base;
  const out = (k) => F.outcomes[k];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Skylab Phoenix · Technical report</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=block" rel="stylesheet">
<style>
@page { size: A4; }
body { font-family: Geist, Inter, Arial, sans-serif; color: #111; font-size: 10.2pt; line-height: 1.5; }
h1 { font-size: 30pt; letter-spacing: -.03em; margin: 0 0 6mm; line-height: 1.05; font-weight: 600; }
h2 { font-size: 15pt; margin: 9mm 0 3mm; letter-spacing: -.02em; font-weight: 600; break-after: avoid; border-top: 1.5px solid #f2600f; padding-top: 3mm; }
h3 { font-size: 11pt; margin: 5mm 0 2mm; font-weight: 600; break-after: avoid; }
p { margin: 0 0 2.6mm; } ul { margin: 0 0 3mm; padding-left: 5mm; } li { margin-bottom: 1.2mm; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; }
.cover .eyebrow { font-family: "Geist Mono", monospace; font-size: 9pt; letter-spacing: .08em; color: #f2600f; text-transform: uppercase; }
.cover .lead { font-size: 14pt; color: #333; max-width: 150mm; }
.cover .meta { font-size: 9.5pt; color: #444; border-top: 1px solid #ddd; padding-top: 4mm; }
.kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 4mm 0; }
.kpi div { border: 1px solid #e3e3e3; border-radius: 3mm; padding: 3mm; } .kpi b { display: block; font-size: 17pt; font-weight: 600; color: #f2600f; letter-spacing: -.02em; }
.kpi span { font-size: 8.4pt; color: #444; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.8pt; break-inside: avoid; }
th, td { text-align: left; padding: 1.4mm 2mm; border-bottom: 1px solid #e6e6e6; vertical-align: top; } th { font-weight: 600; background: #f6f6f6; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
figure { margin: 3mm 0 5mm; break-inside: avoid; } figure img { display: block; max-width: 100%; max-height: 105mm; margin: 0 auto; border-radius: 2mm; border: 1px solid #ddd; background: #000; }
figcaption { font-size: 8.4pt; color: #555; margin-top: 1.5mm; }
.box { border-left: 3px solid #f2600f; background: #fff6f0; padding: 3mm 4mm; margin: 3mm 0; break-inside: avoid; }
.mono { font-family: "Geist Mono", monospace; font-size: 8.6pt; }
.badge { display: inline-block; font-family: "Geist Mono", monospace; font-size: 7.6pt; padding: .4mm 2mm; border-radius: 9px; background: #e7f7f4; color: #0b7d70; border: 1px solid #9ad8cf; }
.cite { font-family: "Geist Mono", monospace; font-size: 7.4pt; color: #a14a12; }
.small { font-size: 8.6pt; color: #444; }
</style></head><body>

<section class="cover"><div>
<p class="eyebrow">NASA Space Apps Challenge 2026 · Flame in Freefall · Technical report</p>
<h1>Skylab Phoenix</h1>
<p class="lead">What NASA's microgravity fire data says about fire in the air of an Artemis Moon base, how sure that answer is, and where the data runs out.</p>
<div class="kpi">
<div><b>${n(S.records)}</b><span>flight-test records from ${S.investigations} NASA PSI investigations, cleaned into one schema</span></div>
<div><b>${S.qc_fixes}</b><span>corrections to NASA's tables, each logged with the original value</span></div>
<div><b>${pct(HC.cabin.fuels.Methanol.p)} → ${pct(HC.moon_base.fuels.Methanol.p)}</b><span>chance a methanol droplet fire goes out on its own: ISS cabin air → Moon-base air</span></div>
<div><b>${S.moon_envelope} / ${n(S.ambient)}</b><span>records with a known atmosphere that sit near Moon-base air</span></div>
</div></div>
<div class="meta">Team Skylab Phoenix · Barranquilla, Colombia · Juan Sebastián Zárate (lead) and Javier Medina<br>
Website: juanzarate1129517999-beep.github.io/nasa-space · Code and data: github.com/juanzarate1129517999-beep/nasa-space<br>
Generated ${esc(E.generated)} from the pipeline outputs. Data: NASA Physical Sciences Informatics (public domain). The models are research aids, not flight certification. Not affiliated with or endorsed by NASA.</div>
</section>

<h2>1 · Summary</h2>
<p>Artemis surface habitats and pressurized rovers are planned at about 30% oxygen and 10.2 psi (0.69 atm). Materials burn more readily as the oxygen fraction rises, yet NASA's flight fire data is spread across ${S.investigations} investigations in the Physical Sciences Informatics (PSI) archive. Skylab Phoenix rebuilds that archive into one clean table, profiles and ranks each investigation for each crewed atmosphere, models how droplet fires end, audits a three-module lunar base for fire, and publishes plain-language briefings written by an SI model only after code verifies every citation and number.</p>
<ul>
<li><b>Droplet fires stop putting themselves out.</b> In ISS cabin air (21% O₂, 14.7 psi) the model gives a methanol droplet fire a ${pct(HC.cabin.fuels.Methanol.p)} chance of going out on its own (90% interval ${pct(HC.cabin.fuels.Methanol.lo)}–${pct(HC.cabin.fuels.Methanol.hi)}); in Moon-base air only ${pct(HC.moon_base.fuels.Methanol.p)} (${pct(HC.moon_base.fuels.Methanol.lo)}–${pct(HC.moon_base.fuels.Methanol.hi)}). There the droplet is predicted to break apart ${pct(HC.moon_base.fuels.Methanol.disruption.p)} of the time and burn to completion ${pct(HC.moon_base.fuels.Methanol.completion.p)}.</li>
<li><b>The data runs thin exactly where crews will live.</b> Only ${S.moon_envelope} of ${n(S.ambient)} flight records with a known atmosphere sit inside the Moon-base envelope (≥28% O₂, ≤0.75 atm). NASA's PSI tables hold no solid burned above ${E.solids.max_o2_any_solid_pct}% O₂; NASA's Saffire V and VI burned ${L.elevated.n} large samples at ${L.elevated.o2_pct[0]}–${L.elevated.o2_pct[1]}% O₂, published outside PSI.</li>
<li><b>The model is validated on days it never saw.</b> AUC ${V.models[0].auc.toFixed(3)} ± ${V.models[0].auc_sd.toFixed(3)} and Brier ${V.models[0].brier.toFixed(3)} with whole ISS test days held out (${V.reps} repeats), ahead of the previous single logistic model, gradient boosting and an oxygen-only baseline.</li>
<li><b>Every SI briefing is checked by code.</b> ${SI.meta.verified} of ${SI.meta.total} briefings pass the firewall: each sentence cites evidence, each number appears in it, and nothing reads as a safety verdict.</li>
</ul>

<h2>2 · The question and the crewed atmospheres</h2>
<p>For each atmosphere: what does NASA's flight data say about fire here, how sure is it, and where does the data stop?</p>
<table><tr><th>Atmosphere</th><th class="n">O₂</th><th class="n">Pressure</th><th>Source</th></tr>
${E.habitats.map((h) => `<tr><td>${esc(h.name)}<br><span class="small">${esc(h.detail)}</span></td><td class="n">${pct(h.x_o2, h.x_o2 * 100 % 1 ? 1 : 0)}</td><td class="n">${(h.p_atm * PSI_ATM).toFixed(1)} psi · ${h.p_atm.toFixed(2)} atm</td><td class="small">${esc(h.source)}</td></tr>`).join("")}</table>

<h2>3 · Data: NASA PSI, cleaned and logged</h2>
<p>A Python pipeline downloads the ${S.investigations} Combustion Science investigations from the PSI public API (${S.flight} flight investigations; 18 publish per-test tables) and maps every table to one schema in SI units: fuel or material, oxygen and diluent fractions, pressure, flow, gravity, ignition and outcome. Missing values stay missing. Each correction keeps the original value, the new value and the rule in <span class="mono">data/gold/qc_log.csv</span> (${S.qc_fixes} entries).</p>
<table><tr><th>Most frequent corrections</th><th class="n">Entries</th></tr>${qcTop.map(([k, v]) => `<tr><td class="small">${esc(k)}</td><td class="n">${v}</td></tr>`).join("")}</table>
<table><tr><th>Experiment</th><th class="n">Records</th><th>Experiment</th><th class="n">Records</th></tr>
${(() => { const ent = Object.entries(byExp).sort((a, b) => b[1] - a[1]); const h = Math.ceil(ent.length / 2); return ent.slice(0, h).map(([e, c], i) => `<tr><td>${esc(e)}</td><td class="n">${c}</td><td>${ent[i + h] ? esc(ent[i + h][0]) : ""}</td><td class="n">${ent[i + h] ? ent[i + h][1] : ""}</td></tr>`).join(""); })()}</table>
${fig("dashboard.png", `Findings dashboard on the website: every chart over the ${n(S.records)} records filters the others.`)}

<h2>4 · Coverage: where NASA flew fire, and where crews will live</h2>
<p>Of ${n(S.ambient)} flight records with an ambient O₂ and pressure (${n(E.coverage.n_measured)} measured, the rest run in ISS cabin air), ${S.moon_envelope} sit inside the Moon-base envelope, all from ${esc(E.coverage.moon_envelope_experiments.join(" and "))}. The spacesuit atmosphere (100% O₂, 4.3 psi) has no flight fire test.</p>
${fig("coverage.png", "Flight tests near each crewed atmosphere (a test counts as near when its oxygen is within 3 points and its pressure within 30%).")}

<h2>5 · How droplet fires end: a two-stage physics model</h2>
<p>NASA's FLEX table records how each of its droplet burns ended: the flame went out with fuel left (<i>Extinction</i>, ${out("extincion")} of ${F.n}), the droplet broke apart (<i>Disruption</i>, ${out("disrupcion")}) or it burned to completion (<i>Completion</i>, ${out("completo")}). NASA's table does not record what the fragments of a disrupted droplet did, so a disrupted droplet counts as "did not go out on its own", and the model keeps the three endings apart instead of folding two of them into "kept burning".</p>
<div class="box"><b>Why it matters.</b> Treating disruption as "kept burning" made the earlier single model look more certain than the data allows. Near Moon-base air, ${HC.moon_base.fuels.Methanol.disruption.p > 0.5 ? "most" : "many"} droplets end by breaking apart; if a droplet burns steadily, the model gives it a ${pct(HC.moon_base.fuels.Methanol.steady_extinction.p)} chance of going out with fuel left.</div>
<h3>Model</h3>
<p><b>Stage 1</b> predicts disruption from the six inputs a test is set up with: fuel, O₂, log pressure, CO₂, helium and initial droplet diameter. <b>Stage 2</b>, for droplets that do not break apart, predicts extinction against completion from physics features computed from those inputs: the Burke–Schumann stoichiometric flame temperature <span class="mono">T_st = T₀ + Q·Y_O₂ / (c_p (s + Y_O₂))</span> (lower heating value Q, mass of O₂ per mass of fuel s, mixture heat capacity of O₂/N₂/CO₂/He), a residence time <span class="mono">log(d₀²·p)</span>, helium, and their interactions with the fuel. Nothing measured after ignition (burn time, burning rate, extinction diameter) is used. The chance of each ending is P(out) = (1 − P_D)·P_E, P(break apart) = P_D, P(burn out) = (1 − P_D)(1 − P_E). A paired, day-level bootstrap of ${F.stages.extinction.boot.length} refits gives the 90% intervals, and an out-of-data guard says "extrapolating" or withholds a number far from flown tests.</p>
<table><tr><th>Model (whole ISS test days held out, ${V.reps} repeats)</th><th class="n">AUC</th><th class="n">Brier</th><th class="n">Accuracy</th></tr>
${V.models.map((m) => `<tr><td>${esc(m.name)}${m.deployed ? " <b>(deployed)</b>" : ""}</td><td class="n">${m.auc.toFixed(3)}${m.auc_sd ? ` ± ${m.auc_sd.toFixed(3)}` : ""}</td><td class="n">${m.brier.toFixed(3)}</td><td class="n">${pct(m.accuracy, 1)}</td></tr>`).join("")}
${Object.values(V.stages).map((m) => `<tr><td class="small">Step: ${esc(m.question)} (n = ${m.n})</td><td class="n">${m.auc.toFixed(3)} ± ${m.auc_sd.toFixed(3)}</td><td class="n">${m.brier.toFixed(3)}</td><td class="n">${pct(m.accuracy, 1)}</td></tr>`).join("")}</table>
<p class="small">About twenty variants were compared on the same repeated held-out days before choosing this one (gradient boosting, splines, history of earlier burns in the chamber); the figures are therefore slightly optimistic. The gain over the earlier model comes mainly from the extinction-versus-completion step (AUC from about 0.80 to ${V.stages.extinction.auc.toFixed(2)}).</p>
<table><tr><th>Atmosphere · fuel</th><th class="n">Goes out on its own</th><th class="n">Breaks apart</th><th class="n">Burns to the end</th><th>Data status</th></tr>
${E.habitat_check.filter((h) => h.habitat !== "suit").flatMap((h) => Object.entries(h.fuels).map(([fu, r]) => `<tr><td>${esc(h.name)} · ${fu}</td><td class="n">${pct(r.p)} (${pct(r.lo)}–${pct(r.hi)})</td><td class="n">${pct(r.disruption.p)}</td><td class="n">${pct(r.completion.p)}</td><td>${r.status}</td></tr>`)).join("")}
<tr><td>Spacesuit · both fuels</td><td class="n" colspan="3">prediction withheld: far outside every flown test</td><td>outside</td></tr></table>
<table><tr><th>Input (+1 standard deviation)</th><th class="n">Change in chance it goes out</th><th class="n">90% interval</th></tr>
${F.drivers.map((d) => `<tr><td>${esc(d.label)}</td><td class="n">${d.coef >= 0 ? "+" : ""}${(100 * d.coef).toFixed(0)} pts</td><td class="n">${(100 * d.lo).toFixed(0)} to ${(100 * d.hi).toFixed(0)} pts</td></tr>`).join("")}</table>
${fig("lab_moon.png", "Fire Lab in Moon-base air: out of 100 methanol droplet fires, how many go out on their own, break apart or burn to the end.")}
${fig("reliability.png", "Calibration on held-out ISS test days: predicted against observed chance of going out on its own.")}

<h2>6 · Solid materials</h2>
<p>BASS-II measured the flammability boundary of PMMA rods in microgravity (NASA/TM-20210011385, p. 75, Eq. 6.1): a rod keeps burning in still air above ${E.solids.zero_flow_o2_pct}% O₂ and, at the gentle flows near surfaces, down to ${E.solids.min_o2_pct}% O₂, against ${E.solids.g1_upward_limit_pct}% in the 1 g upward test. NASA PSI's tables hold no solid burned above ${E.solids.max_o2_any_solid_pct}% O₂ or at reduced pressure. NASA's Saffire experiments on Cygnus did burn large samples at raised oxygen and reduced pressure; those burns are published (${esc(L.citation)}) and kept apart from the PSI data:</p>
<table><tr><th>Sample</th><th>Material</th><th class="n">O₂</th><th class="n">Pressure</th><th class="n">Burn</th><th class="n">CO₂ rise</th></tr>
${L.rows.map((r) => `<tr><td>${esc(r.sample)}</td><td>${esc(r.material)}</td><td class="n">${r.x_o2 == null ? "—" : pct(r.x_o2, 1)}</td><td class="n">${r.p_atm == null ? "—" : r.p_atm.toFixed(2) + " atm"}</td><td class="n">${r.ignited ? r.burn_s + " s" : "did not ignite"}</td><td class="n">${r.co2_increase_ppm == null ? "—" : n(r.co2_increase_ppm) + " ppm"}</td></tr>`).join("")}</table>
<p>They show that cotton-fiberglass fabric and acrylic burn in Moon-base-like air, at one airflow (20 cm/s); they do not show where those materials stop burning. Every materials limit for 30% oxygen is therefore still an extrapolation.</p>
${fig("solids.png", "BASS-II flammability boundary of PMMA rods (tested range solid, extrapolation dashed) with the crewed atmospheres; diamonds are the published Saffire IV–VI burns.")}

<h2>7 · A three-module lunar base, audited for fire</h2>
<p>A surface habitat, an airlock for EVA preparation and a pressurized rover, at the challenge's atmospheres and stand-in volumes, sited on the Connecting ridge near the lunar south pole (NASA LOLA 5 m/pixel terrain, Sun position from JPL Horizons). Each module is checked on materials, liquid fires, detection and suppression; every number is labelled measured, derived, model, assumed, extrapolated or no data (${E.moonbase.report.measured_layers} of ${E.moonbase.report.total_facts} are NASA measurements).</p>
<table><tr><th>Module</th><th class="n">O₂ · psi · m³</th><th>Liquid fire (methanol droplet)</th></tr>
${mods.map((m) => `<tr><td>${esc(m.name)}</td><td class="n">${pct(m.x_o2, 1)} · ${m.psi} · ${m.volume_m3}</td><td class="small">${esc(m.tests.liquids.facts[0].value)} goes out on its own</td></tr>`).join("")}</table>
<h3>Flight tests the data asks for</h3>
<ul>${E.moonbase.report.flight_tests_needed.map((t) => `<li><b>${esc(t.what)}.</b> ${esc(t.why)}</li>`).join("")}</ul>

<h2>8 · The next flight experiment</h2>
<p>Active learning scores candidate FLEX tests by ${esc(E.next.score_formula)}. The top pick is a ${next[0].fuel.toLowerCase()} droplet at ${pct(next[0].x_o2)} O₂, ${next[0].p_atm.toFixed(2)} atm and ${pct(next[0].x_co2)} CO₂, where the model's 90% interval for going out on its own is ${pct(next[0].interval[0])}–${pct(next[0].interval[1])}.</p>
<table><tr><th>#</th><th>Fuel</th><th class="n">O₂</th><th class="n">atm</th><th class="n">CO₂</th><th class="n">Chance it goes out (90%)</th></tr>
${next.map((k, i) => `<tr><td>${i + 1}</td><td>${k.fuel}</td><td class="n">${pct(k.x_o2)}</td><td class="n">${k.p_atm.toFixed(2)}</td><td class="n">${pct(k.x_co2)}</td><td class="n">${pct(k.p_ext)} (${pct(k.interval[0])}–${pct(k.interval[1])})</td></tr>`).join("")}</table>

<h2>9 · The SI layer and its firewall</h2>
<p>An SI model (Anthropic Claude) writes 2–5 sentence briefings for each atmosphere, each of the ${S.investigations} investigations, each lunar-base module and the base, only from numbered evidence packs computed by the pipeline (<span class="mono">data/si/evidence_packs.json</span>). <span class="mono">pipeline/si.py</span> publishes a draft only if every sentence cites existing evidence, every number appears in the cited evidence, nothing reads as a safety verdict and the evidence has not changed since the draft (hash). Otherwise the site shows the evidence itself, labelled as a deterministic brief. Result: ${SI.meta.verified} of ${SI.meta.total} briefings published.</p>
<div class="box"><span class="badge">SI-written · verified ✓</span> <b>${esc(moonBrief.headline)}</b><br>
${moonBrief.sentences.map((s) => `${esc(s.text)} <span class="cite">[${s.cites.join(", ")}]</span>`).join(" ")}</div>
<p>On the website the briefings live in a floating "Ask SI" chat, next to a BM25 keyword search over NASA's own text that quotes passages with their source. Nothing in the chat is generated on the fly.</p>

<h2>10 · The website</h2>
<ul>
<li><b>Home:</b> 3D Earth with the ISS and 23 NASA satellites on today's orbital elements, the Moon (LRO color and LOLA relief) and Mars; the stars are peaks of NASA's star map.</li>
<li><b>Learn 3D:</b> NASA's Artemis plan over a real 3D Moon and the descent to a south-pole site on 5 m/pixel LOLA terrain; five fire sources inside an ISS module; one flame in four gravities.</li>
<li><b>Flames:</b> ${CLIPS.length} clips of real flight video (${CLIPS.filter((c) => c.state === "Solid").length} solids, ${CLIPS.filter((c) => c.state === "Liquid").length} liquids, ${CLIPS.filter((c) => c.state === "Gas").length} gases). ${CLIPS.filter((c) => c.gen).length} were cut by <span class="mono">scripts/build_clips.py</span>, which downloads NASA PSI raw video, finds the flame, crops and speeds it up; each was reviewed and 27 were rejected.</li>
<li><b>Fire Lab, Findings, Ranking, Next flight, Method:</b> the model, dashboard, lunar-base audit, adjustable ranking of the ${S.investigations} investigations, the next experiment and the nine steps from question to reproduction.</li>
</ul>
${fig("clips.png", "Flight archive filtered to gas flames: ACME CFI-G spherical flames, s-Flame and SPICE jets from NASA PSI raw video.")}

<h2>11 · Limitations</h2>
<ul>
<li>All flight fire data is microgravity or 1 g; nothing in PSI ran at lunar gravity (LUCI and FM2 data are not in PSI).</li>
<li>The droplet model covers methanol and heptane droplets; it is not a model of solid-material or gas fires. The Moon-base numbers rest on ${S.moon_envelope} nearby records and 17 nearby FLEX droplets.</li>
<li>NASA's table does not say what disrupted droplets did after breaking apart.</li>
<li>Saffire IV–VI values are transcribed from a NASA paper; four burns at one airflow, no limits mapped.</li>
<li>Model choice was made after comparing variants on the same held-out scheme, so scores are slightly optimistic. These are research aids, not flight certification.</li>
</ul>

<h2>12 · Use of AI</h2>
<p>(1) In the product, Anthropic Claude writes the SI briefings described in section 9, behind the code firewall; rankings, predictions and the out-of-data guard are deterministic code. (2) Code, documentation, this report and the demo video were produced with AI assistance (Claude Code) and run, reviewed and tested by the team. (3) The demo video is edited by AI-written code from real NASA flight video and real captures of the website, with music synthesized by code, and carries a visible watermark. No AI-generated images are used; no NASA logos or insignia are used.</p>

<h2>13 · Sources</h2>
<ul class="small">
<li>NASA Physical Sciences Informatics, Combustion Science investigations (public domain): ${E.investigations.filter((r) => r.doi).slice(0, 24).map((r) => `${esc(r.name)} (${esc(r.psi_id)}, doi:${esc(r.doi)})`).join("; ")}.</li>
<li>${esc(L.citation)}, ${esc(L.url)}.</li>
<li>${esc(E.solids.source)}.</li>
<li>Exploration habitat atmosphere: NTRS 20240007817 (ICES-2024-128).</li>
<li>NASA SVS CGI Moon Kit (LRO LROC color, LOLA elevation); NASA GSFC PGDA LOLA 5 m/pixel south-pole terrain; JPL Horizons; NASA SVS star map and Orbit Viewer elements.</li>
</ul>
</body></html>`;
}

(async () => {
  if (!process.argv.includes("--no-figures")) await figures();
  const file = path.join(__dirname, "report.html");
  fs.writeFileSync(file, html());
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + file, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: path.join(__dirname, "Technical_Report_Skylab_Phoenix.pdf"), format: "A4", printBackground: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: '<div style="font-size:7pt;width:100%;padding:0 17mm;color:#777;display:flex;justify-content:space-between;font-family:Arial"><span>Skylab Phoenix · Technical report</span><span class="pageNumber"></span></div>',
    margin: { top: "18mm", bottom: "18mm", left: "17mm", right: "17mm" } });
  await b.close();
  fs.unlinkSync(file);
  console.log("report/Technical_Report_Skylab_Phoenix.pdf");
})();
