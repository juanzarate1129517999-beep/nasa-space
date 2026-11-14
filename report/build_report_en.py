import html
import json
import os
import re
import shutil
import subprocess
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REP = ROOT / "report"
D = json.loads((ROOT / "web" / "data" / "ember.json").read_text(encoding="utf-8"))
SI = json.loads(re.sub(r"^window\.SI=|;$", "", (ROOT / "web" / "data" / "si.js").read_text(encoding="utf-8")))
F, CG, S = D["flex"], D["cfig"], D["summary"]
E = html.escape


def n(x, d=0):
    return f"{x:,.{d}f}"


def p(x, d=0):
    return f"{n(100 * x, d)}%"


def model(key):
    return next(m for m in F["validation"]["models"] if m["key"] == key)


LR, GB, O2, PR = model("lr"), model("gb"), model("o2"), model("prior")
HC = {h["habitat"]: h for h in D["habitat_check"]}
cov = D["coverage"]
bands = D["o2_bands"]
hi_band = bands[-1]
nrm, inv = CG["by_type"]["normal"], CG["by_type"]["inverse"]
G2 = D["saffire2"]
worse_1g = sum(g["g1_estado"] >= g["ug_estado"] for g in G2)
s1 = {r["direccion"].strip().lower(): r["tiempo_quemado_s"] for r in D["saffire1"]}
INV = D["investigations"]
picks = D["next"]["picks"]
FIND = D["findings"]
SOL = D["solids"]


def solid_table():
    body = "".join(f"<tr><td>{E(h['name'])}</td><td class='num'>{h['o2_pct']:g}%</td><td>Keeps burning</td>"
                   f"<td class='num'>≈ {h['blowoff_flow_cm_s']:.0f} cm/s</td>"
                   f"<td>{'Extrapolated O₂ and flow' if h['o2_pct'] > SOL['tested_o2_pct'][1] else 'O₂ tested · flow extrapolated'}</td></tr>" for h in SOL["habitats"])
    return "<table class='compact keep'><thead><tr><th>Habitat</th><th class='num'>O₂</th><th>Still air</th><th class='num'>Burns up to</th><th>Status</th></tr></thead><tbody>" + body + "</tbody></table>"
HAB = {"cabin": "Spacecraft cabin (ISS, Gateway, Orion)", "eva_prep": "EVA prep",
       "moon_base": "Lunar base & pressurized rover", "exploration": "Exploration atmosphere (8.2 psi)", "suit": "Spacesuit"}
LAYER_CLASS = {"Prevention": "Prevention", "Detection": "Detection", "Suppression": "Suppression"}


def fig(name, caption, num, wide=False):
    return (f'<figure class="{"wide" if wide else ""}"><img src="figures_en/{name}.svg" alt="{E(caption)}">'
            f'<figcaption><b>Figure {num}.</b> {caption}</figcaption></figure>')


def shot(name, caption, num):
    return (f'<figure class="shot"><img src="screens/{name}.jpg" alt="{E(caption)}">'
            f'<figcaption><b>Figure {num}.</b> {caption}</figcaption></figure>')


def inv_table():
    rows = []
    for r in sorted(INV, key=lambda r: (r["type"] != "Flight", r["family"], -r["n_tests"])):
        rows.append(f"<tr><td><b>{E(r['name'])}</b></td><td class='mono'>{r['psi_id']}</td><td>{E(r['family'])}</td>"
                    f"<td>{E(r['hardware'])}</td><td>{r['type']}</td>"
                    f"<td class='num'>{n(r['n_tests']) if r['n_tests'] else '—'}</td><td class='num'>{n(r['n_with_outcome']) if r['n_with_outcome'] else '—'}</td>"
                    f"<td class='num'>{r['n_publications']}</td></tr>")
    return ("<table><thead><tr><th>Investigation</th><th>PSI</th><th>Family</th><th>Hardware</th><th>Type</th>"
            "<th class='num'>Records</th><th class='num'>With outcome</th><th class='num'>Publ.</th></tr></thead><tbody>"
            + "".join(rows) + "</tbody></table>")


def top_table(hab, k=6):
    rs = sorted(INV, key=lambda r: -r["relevance"][hab]["score"])[:k]
    body = "".join(f"<tr><td class='num'>{i + 1}</td><td><b>{E(r['name'])}</b> <span class='mono dim'>{r['psi_id']}</span></td>"
                   f"<td class='num'>{n(r['relevance'][hab]['score'], 1)}</td><td class='num'>{n(r['relevance'][hab]['proximity'], 2)}</td>"
                   f"<td class='num'>{n(r['relevance'][hab]['evidence'], 2)}</td><td class='num'>{n(r['relevance'][hab]['directness'], 2)}</td></tr>"
                   for i, r in enumerate(rs))
    return ("<table class='compact'><thead><tr><th class='num'>#</th><th>Investigation</th><th class='num'>Score</th>"
            "<th class='num'>Proximity</th><th class='num'>Evidence</th><th class='num'>Directness</th></tr></thead><tbody>" + body + "</tbody></table>")


def metrics_table():
    names = {"lr": "Logistic regression (deployed)", "gb": "Gradient boosting (same inputs)",
             "o2": "Baseline: oxygen only", "prior": "Baseline: constant base rate"}
    body = "".join(f"<tr class='{'hl' if m['deployed'] else ''}'><td>{names[m['key']]}</td><td class='num'>{n(m['auc'], 3)}</td>"
                   f"<td class='num'>{n(m['brier'], 3)}</td><td class='num'>{n(m['log_loss'], 3)}</td><td class='num'>{p(m['accuracy'], 1)}</td></tr>"
                   for m in F["validation"]["models"])
    return ("<table class='keep'><thead><tr><th>Model</th><th class='num'>AUC ↑</th><th class='num'>Brier ↓</th><th class='num'>Log loss ↓</th>"
            "<th class='num'>Accuracy</th></tr></thead><tbody>" + body + "</tbody></table>")


def drivers_table():
    lab = {"x_o2": "O₂ mole fraction", "d0_mm": "Initial droplet diameter (mm)", "heptane": "Fuel: heptane (vs methanol)",
           "x_he": "Helium fraction", "x_co2": "CO₂ fraction", "log_p": "ln(pressure, atm)"}
    body = ""
    for d in F["drivers"]:
        sig = d["lo"] > 0 or d["hi"] < 0
        reading = ("Raises self-extinction" if d["coef"] > 0 else "Lowers self-extinction") if sig else "Inconclusive (interval crosses 0)"
        body += (f"<tr><td>{lab[d['feature']]}</td><td class='num'>{n(d['coef'], 2)}</td><td class='num'>[{n(d['lo'], 2)}; {n(d['hi'], 2)}]</td>"
                 f"<td>{reading}</td></tr>")
    return ("<table class='compact keep'><thead><tr><th>Input</th><th class='num'>Standardized coef.</th><th class='num'>90% CI (bootstrap)</th>"
            "<th>Reading</th></tr></thead><tbody>" + body + "</tbody></table>")


def habitat_table():
    body = ""
    for hab in D["habitats"]:
        h = HC[hab["id"]]
        cells = ""
        for fuel in ("Methanol", "Heptane"):
            r = h["fuels"][fuel]
            xt = " <span class='dim'>· extrapolation</span>" if r.get("status") == "extrapolating" else ""
            cells += ("<td class='num'>outside the data</td>" if r["ood"] else f"<td class='num'>{p(r['p'])} <span class='dim'>({p(r['lo'])}–{p(r['hi'])})</span>{xt}</td>")
        body += (f"<tr><td><b>{HAB[hab['id']]}</b></td><td class='num'>{p(hab['x_o2'], 1 if (hab['x_o2'] * 1000) % 10 else 0)}</td>"
                 f"<td class='num'>{n(hab['p_atm'], 2)} atm · {n(hab['p_atm'] * 14.6959, 1)} psi</td>{cells}</tr>")
    return ("<table class='keep'><thead><tr><th>Habitat</th><th class='num'>O₂</th><th class='num'>Pressure</th><th class='num'>Methanol P(self-ext.)</th>"
            "<th class='num'>Heptane P(self-ext.)</th></tr></thead><tbody>" + body + "</tbody></table>")


def picks_table():
    body = "".join(f"<tr class='{'hl' if i == 0 else ''}'><td class='num'>{i + 1}</td><td>{k['fuel']}</td>"
                   f"<td class='num'>{p(k['x_o2'])}</td><td class='num'>{n(k['p_atm'], 2)} atm · {n(k['p_atm'] * 14.6959, 1)} psi</td>"
                   f"<td class='num'>{p(k['x_co2'])}</td><td class='num'>{p(k['p_ext'])} <span class='dim'>({p(k['interval'][0])}–{p(k['interval'][1])})</span></td>"
                   f"<td class='num'>{n(100 * k['uncertainty'], 0)} pts</td></tr>" for i, k in enumerate(picks))
    return ("<table class='keep'><thead><tr><th class='num'>#</th><th>Fuel</th><th class='num'>O₂</th><th class='num'>Pressure</th>"
            "<th class='num'>CO₂</th><th class='num'>P(self-ext.) today</th><th class='num'>90% CI width</th></tr></thead><tbody>" + body + "</tbody></table>")


def findings_table():
    body = ""
    for i, f in enumerate(FIND):
        body += (f"<tr><td class='num'><b>F{i + 1}</b></td><td class='num score'>{n(f['score'])}</td><td><span class='tag t-{f['layer']}'>{f['layer']}</span></td>"
                 f"<td><b>{E(f['title'])}</b><div class='impl'>{E(f['implication'])}</div><div class='src mono'>{E(f['source'])}</div></td></tr>")
    return ("<table class='findings'><thead><tr><th class='num'>#</th><th class='num'>Score</th><th>Layer</th><th>Finding and implication</th></tr></thead><tbody>"
            + body + "</tbody></table>")


def qc_table():
    body = "".join(f"<tr><td class='mono'>{E(q['psi_id'])}</td><td>{E(q['experimento'])}</td><td class='mono'>{E(str(q['registro'])[:22])}</td>"
                   f"<td>{E(q['campo'][:30])}</td><td class='mono'>{E(str(q['valor_original'])[:26])}</td><td class='mono'>{E(str(q['valor_nuevo'])[:26])}</td>"
                   f"<td>{E(q['regla'])}</td></tr>" for q in D["qc"])
    return ("<table class='tiny'><thead><tr><th>PSI</th><th>Experiment</th><th>Record</th><th>Field</th><th>Original</th><th>New</th>"
            "<th>Rule</th></tr></thead><tbody>" + body + "</tbody></table>")


def si_example(hab="moon_base"):
    b = SI["habitat"][hab]
    sents = " ".join(f"{E(s['text'])} <span class='mono dim'>[{', '.join(s['cites'])}]</span>" for s in b["sentences"])
    used = sorted({c for s in b["sentences"] for c in s["cites"]}, key=lambda c: int(c[1:]))
    ev = "".join(f"<tr><td class='mono'>{c}</td><td>{E(b['evidence'][c])}</td></tr>" for c in used)
    return (f"<div class='callout'><b>{E(b['headline'])}</b><br>{sents}</div>"
            f"<table class='compact'><thead><tr><th>Item</th><th>Evidence cited (computed by the pipeline from PSI)</th></tr></thead><tbody>{ev}</tbody></table>")


SCHEMA = [("test_uid", "Unique id: PSI + test"), ("psi_id / experimento", "Source investigation"),
          ("familia", "solid · droplet · gas · smoke · dust"), ("combustible / material_familia", "Fuel or material (PMMA, SIBAL, Nomex…)"),
          ("x_o2", "O₂ mole fraction (0–1)"), ("o2_ubicacion", "ambient or burner (inverse flames)"),
          ("o2_supuesto / p_supuesta", "True when cabin air was assumed because it was not reported"), ("p_atm", "Pressure in atm"),
          ("x_co2 / x_he", "Diluent fractions"), ("flujo_cm_s / barrido_flujo", "Flow speed and whether the test swept it"),
          ("d0_mm", "Initial droplet diameter"), ("gravedad", "ug or 1g"), ("ignicion / autoextincion", "Binary labels"),
          ("resultado", "extinction · disruption · completion · no ignition · blow-off…"), ("llama_fria", "Confirmed cool flame"),
          ("tad_k / zst", "Adiabatic flame temperature and stoichiometric mixture fraction"), ("tasa_quemado / tiempo_quemado_s", "Burning measurements"),
          ("n_eventos", "Flames per record (ACME daily tables)"), ("qc_flags", "Quality flags applied to the row")]

moon = HC["moon_base"]["fuels"]["Methanol"]
cab = HC["cabin"]["fuels"]["Methanol"]
qc_counts = Counter(q["experimento"] for q in D["qc"])
autofill = sum(1 for q in D["qc"] if q["regla"].startswith("Spreadsheet auto-increment"))
logo = (ROOT / "web" / "assets" / "phoenix.svg").read_text(encoding="utf-8")
fig_no = iter(range(1, 100))
tab_no = iter(range(1, 100))
pk_o2 = sorted({k["x_o2"] for k in picks})
pk_p = sorted({k["p_atm"] for k in picks})
pk_co2 = sorted({k["x_co2"] for k in picks if k["x_co2"] > 0})
si_ok, si_total = SI["meta"]["verified"], SI["meta"]["total"]


def T():
    return next(tab_no)


def Fn():
    return next(fig_no)


TODAY = date.today()
DATE = f"{TODAY:%B} {TODAY.day}, {TODAY.year}"

doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Skylab Phoenix · Technical report</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="report.css">
<style>@page {{ @bottom-left {{ content: "Skylab Phoenix · Technical report · NASA Space Apps 2026"; }} }} @page :first {{ @bottom-left {{ content: none; }} }}</style>
</head><body>

<section class="cover">
  <div class="cover-band"></div>
  <div class="logo">{logo}</div>
  <h1 class="title">Skylab Phoenix</h1>
  <p class="subtitle">Fire-safety intelligence from NASA's microgravity combustion data: data engineering, analysis, machine learning and a verified SI layer for the Moon, spacecraft and spacesuits</p>
  <p class="tagline">NASA SPACE APPS CHALLENGE 2026 · FLAME IN FREEFALL · FIRE SAFETY FOR EXPLORATION</p>
  <div class="cover-kpis">
    <div><b>{S['investigations']}</b><span>NASA investigations analysed</span></div>
    <div><b>{n(S['records'])}</b><span>test records unified</span></div>
    <div><b>{n(LR['auc'], 2)}</b><span>model AUC, validated by test day</span></div>
    <div><b>{p(cab['p'])} → {p(moon['p'])}</b><span>self-extinction: cabin → lunar base</span></div>
  </div>
  <table class="meta">
    <tr><td>Team</td><td><b>Skylab Phoenix</b></td></tr>
    <tr><td>Challenge</td><td>Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data</td></tr>
    <tr><td>Team lead</td><td>Juan Sebastián Zárate</td></tr>
    <tr><td>Members</td><td>Juan Sebastián Zárate (lead)<br>Javier Medina</td></tr>
    <tr><td>Data source</td><td>NASA Physical Sciences Informatics (PSI) · 24 <i>Combustion Science</i> investigations · CC0 license</td></tr>
    <tr><td>Tools</td><td>Python · pandas · scikit-learn · SciPy · Plotly · HTML/CSS/JavaScript · Anthropic Claude (SI briefings)</td></tr>
    <tr><td>Keywords</td><td>microgravity, flammability, lunar base, data engineering, machine learning, uncertainty, active learning, verified SI</td></tr>
  </table>
  <p class="cover-date">{DATE} · English edition</p>
</section>

<section class="page">
<h2 class="nonum">Abstract</h2>
<p class="lead">Artemis lunar-surface habitats and pressurized rovers will run at <b>30% oxygen or more and 10.2 psi or less</b>. Skylab Phoenix answers, from NASA's own flight data, what happens to fire in that atmosphere and where that data runs out.</p>
<p>We built a data-engineering pipeline that downloads, cleans and unifies the experimental tables of the 24 <i>Combustion Science</i> investigations in NASA's PSI repository. The result is {n(S['records'])} records in one schema, {S['with_outcome']} with a labeled outcome. We corrected {S['qc_fixes']} errors in the source tables and logged every correction. On top of that data we profile and rank each investigation per habitat and train interpretable models with explicit uncertainty.</p>
<p>The main model predicts whether a flame puts itself out. Trained on {F['n']} droplet fires from the FLEX experiment on the ISS and validated by holding out whole test days, it reaches <b>AUC {n(LR['auc'], 2)}</b> and Brier {n(LR['brier'], 3)}, ahead of gradient boosting (AUC {n(GB['auc'], 2)}) and an oxygen-only baseline ({n(O2['auc'], 2)}). According to the model, the chance of self-extinction falls from <b>{p(cab['p'])} in a spacecraft cabin to {p(moon['p'])} in the lunar base</b> (90% interval {p(moon['lo'])}–{p(moon['hi'])}). Only {cov['n_moon_envelope']} of {n(cov['n_ambient'])} flight records lie near that atmosphere, and none is a solid material. For the spacesuit (100% O₂, 4.3 psi) there is no test at all, and the system refuses to predict.</p>
<p>Active learning recommends the next experiment: CO₂ suppression ({p(pk_co2[0])}–{p(pk_co2[-1])} CO₂) at {p(pk_o2[0])}–{p(pk_o2[-1])} O₂ and {n(pk_p[0], 2)}–{n(pk_p[-1], 2)} atm, where the model is least certain. An SI layer writes plain-language briefings for every habitat and investigation; code publishes a briefing only if every sentence cites the data and every number is verified ({si_ok} of {si_total} pass). Everything is presented in an interactive web dashboard where the models run live in the browser.</p>
<div class="callout">
<b>The message in one sentence:</b> with more oxygen, fire in microgravity stops putting itself out, and NASA has almost no flight data in the atmosphere where astronauts will live on the Moon. Skylab Phoenix quantifies it, shows it and says what to test next.
</div>
</section>

<section class="page toc">
<h2 class="nonum">Contents</h2>
<ol>
<li>Introduction</li><li>The challenge and the research question</li><li>Conceptual framework: fire in microgravity</li>
<li>Data: source, scope and inventory</li><li>Data engineering</li><li>Exploratory analysis</li>
<li>Summaries, ranking and similarity of investigations</li><li>Machine learning</li><li>Next experiment: active learning</li>
<li>Fire-safety findings ranked by evidence</li><li>The SI layer: briefings you can check</li><li>The Skylab Phoenix dashboard</li>
<li>Discussion and limitations</li><li>Impact for exploration and on Earth</li><li>Conclusions</li><li>Future work</li><li>Reproducibility</li>
</ol>
<p class="toc-extra">References · Annex A: data dictionary · Annex B: formulas · Annex C: full quality log</p>
<h3 class="nonum">Team</h3>
<table class="compact"><thead><tr><th>Member</th><th>Role</th><th>Responsibilities</th></tr></thead><tbody>
<tr><td><b>Juan Sebastián Zárate</b></td><td>Team lead</td><td>Scientific direction (combustion), data engineering, modeling, validation and presentation</td></tr>
<tr><td><b>Javier Medina</b></td><td>Member</td><td>Research on the challenge and its background, conceptual guidance, review and development support</td></tr>
</tbody></table>
<p class="note">Use of AI: the SI briefings are written by Anthropic Claude and published only after code verification (Section 11); code and documentation were written with AI assistance. Details in docs/AI_USE.md.</p>
</section>

<section class="page">
<h2>Introduction</h2>
<p class="lead">Fire is one of the most serious risks of crewed spaceflight, and in microgravity it behaves differently than on Earth.</p>
<p>The history of spaceflight is a reminder: the Apollo 1 fire in a pure-oxygen cabin (1967), the oxygen-tank explosion on Apollo 13 (1970) and the oxygen-generator fire on the Mir station (1997). During Artemis II, a smoke alarm sounded about 80,000 miles from Earth. NASA's strategy has three layers: <b>prevention</b> (controlling ignition sources and choosing materials by their flammability limits), <b>detection</b> and <b>suppression</b>.</p>
<p>In microgravity there is no buoyancy: hot gas does not rise, a candle flame becomes a blue sphere, and oxygen arrives only by diffusion or ventilation. That changes flammability limits, flame spread and extinction. NASA has measured this for decades on the ISS and on cargo spacecraft and publishes the results in the <i>Physical Sciences Informatics</i> (PSI) repository. The problem the challenge poses is that this volume of data is hard to find, compare and interpret.</p>
<p>The urgency is concrete. To shorten pre-breathing before spacewalks, the lunar base and pressurized rovers will have more oxygen and less pressure than Earth's atmosphere. That combination makes materials <b>much more flammable</b>, and it is exactly where flight data is scarce. Skylab Phoenix sets out to:</p>
<ol>
<li>Turn PSI's scattered data into a clean, unified and traceable dataset.</li>
<li>Extract quantitative knowledge from it with validated models that are honest about their uncertainty.</li>
<li>Present it in a dashboard, with SI briefings, that any researcher, engineer or student can use to make decisions.</li>
</ol>
</section>

<section class="page">
<h2>The challenge and the research question</h2>
<p class="lead">The challenge asks for an SI-powered web dashboard that <b>summarizes, ranks and interprets</b> NASA's combustion investigations. Skylab Phoenix answers each official objective with a data component.</p>
<p class="tcap"><b>Table {T()}.</b> Official challenge objectives and the matching parts of the solution.</p>
<table><thead><tr><th>Official objective</th><th>Skylab Phoenix component</th><th>Section</th></tr></thead><tbody>
<tr><td>Identify the investigations most relevant to habitable crew environments (spacecraft, stations, Moon and Mars bases, pressurized rovers)</td><td>Automatic profile of the 24 investigations and a transparent ranking per habitat; side-by-side comparison</td><td class="num">7</td></tr>
<tr><td>Extract data that supports predictive modeling of flammability</td><td>Bronze → silver → gold pipeline with one schema; validated models that run in the browser</td><td class="num">5, 8</td></tr>
<tr><td>Highlight research that informs next-generation fire-safety controls</td><td>Findings ranked by evidence (prevention, detection, suppression) and the recommended next experiment</td><td class="num">9, 10</td></tr>
<tr><td>SI-powered summaries and interpretation</td><td>Briefings for every habitat and investigation, verified by code; search over NASA's own text</td><td class="num">11</td></tr>
<tr><td>Applications of PSI data to fire safety on Earth (optional)</td><td>Earth benefits reported by PSI for each investigation, included in their profiles</td><td class="num">14</td></tr>
</tbody></table>
<h3>Research question</h3>
<div class="callout q">What does NASA's flight data say about fire behaviour in the atmosphere planned for the lunar base (≥ 30% O₂, ≤ 10.2 psi), how certain is it, and which experiment is missing to answer what is unknown today?</div>
<p>The challenge page gives several hints that we used as a guide. The μg tests with the most oxygen are those of ACME CFI-G (up to 85% O₂ at the burner). PSI has no partial-gravity data yet (it will come from LUCI and FM2). Microgravity and 1 g results can bound intermediate gravity. And ACME's BRE experiment studied material flammability with gases that emulate solids.</p>
<h3>Target users</h3>
<p>Professors, graduate and undergraduate students, researchers and, above all, aerospace engineers who design habitats and select materials. The dashboard offers a guided view for each of these audiences.</p>
</section>

<section class="page">
<h2>Conceptual framework: fire in microgravity</h2>
<p class="lead">Without buoyancy, fire depends on transport by diffusion and ventilation. Gravity, airflow, oxygen and pressure therefore interact in ways a test on Earth does not capture.</p>
<h3>Key concepts</h3>
<ul class="defs">
<li><b>Flammability limit.</b> The least favourable combination of conditions (O₂, pressure, flow) in which a material sustains a flame. Microgravity adds a low-flow limit: with little flow, the flame goes out for lack of oxygen and through radiative losses.</li>
<li><b>Self-extinction.</b> The flame goes out on its own before consuming the fuel. It is the target of our main model: if a fire does not go out on its own, it must be detected and suppressed.</li>
<li><b>Concurrent vs opposed flow.</b> When air moves in the direction of flame spread, it preheats the fuel and speeds the flame up. When it moves against it, it slows it down.</li>
<li><b>Normal vs inverse flame.</b> In a normal flame, fuel leaves the burner into an oxidizing ambient. In an inverse flame it is the other way round: O₂ leaves the burner into a fuel-laden ambient.</li>
<li><b>Adiabatic flame temperature (T<sub>ad</sub>).</b> The theoretical maximum temperature of combustion without losses, used as an indicator of how close a flame is to its limit.</li>
<li><b>Cool flames.</b> Low-temperature, nearly invisible combustion seen with fuels such as butane. A distinct risk: an optical detector may miss it.</li>
<li><b>Diluents.</b> CO₂ and helium dilute oxygen and change heat transfer. FLEX tested them as suppressants.</li>
</ul>
<h3>Habitat atmospheres</h3>
<p class="tcap"><b>Table {T()}.</b> Atmospheres used as scenarios. Lunar base and suit: official challenge page. Exploration: NASA standard.</p>
<table class="compact"><thead><tr><th>Habitat</th><th class="num">O₂</th><th class="num">Pressure</th><th>Source</th></tr></thead><tbody>
<tr><td>Spacecraft cabin (ISS, Gateway, Orion)</td><td class="num">21%</td><td class="num">1.00 atm · 14.7 psi</td><td>Sea-level-equivalent air</td></tr>
<tr><td>EVA prep (ISS)</td><td class="num">26.5%</td><td class="num">0.69 atm · 10.2 psi</td><td>Staged pre-breathe (ISS campout); tested in ACME BRE</td></tr>
<tr><td><b>Lunar base &amp; pressurized rover</b></td><td class="num"><b>≥ 30%</b></td><td class="num"><b>≤ 0.69 atm · 10.2 psi</b></td><td>Flame in Freefall challenge page</td></tr>
<tr><td>Exploration atmosphere</td><td class="num">34%</td><td class="num">0.56 atm · 8.2 psi</td><td>NASA exploration habitat standard (NTRS 20240007817)</td></tr>
<tr><td>Spacesuit</td><td class="num">100%</td><td class="num">0.29 atm · 4.3 psi</td><td>Flame in Freefall challenge page</td></tr>
</tbody></table>
<p>Compared with Earth's air, the lunar base will have over 40% more oxygen. Even if the O₂ partial pressure is similar, the higher mole fraction speeds combustion and reduces the ability of the inert gas to cool the flame.</p>
</section>

<section class="page">
<h2>Data: source, scope and inventory</h2>
<p class="lead">We use a single data source, the one the challenge names: NASA's PSI repository (CC0 license). Of its 133 results for “combustion”, 24 belong to <i>Combustion Science</i>: 19 flight experiments and 5 ground investigations.</p>
<p>The other 109 investigations (materials, fluids, biophysics) only mention the word and are discarded. Everything is retrieved without login from PSI's public API: metadata (objective, hypothesis, approach, team, publications, Earth benefit) and experimental tables in CSV or Excel. Videos and raw images weigh hundreds of GB and are not needed. The challenge's other resources (Researcher's Guide, NASA Combustion Science, Apollo, Mir and the spinoffs) served as context, not for training models.</p>
<p class="tcap"><b>Table {T()}.</b> Inventory of the 24 investigations, generated by the pipeline. “Records” in ACME's daily tables = flames lit.</p>
{inv_table()}
<p class="note">Hardware grouping as on the challenge page: the CIR combustion rack with ACME (gases) or MDCA (droplets), the fan-driven duct of the Microgravity Science Glovebox (MSG), and the Saffire module inside the Cygnus spacecraft.</p>
</section>

<section class="page">
<h2>Data engineering</h2>
<p class="lead">A layered pipeline, reproducible with one command, turns 22 heterogeneous tables into one schema in SI units. Every correction is logged with the original value and the rule applied.</p>
<div class="arch">
  <div class="st s1"><span>BRONZE</span><b>NASA PSI API</b><p>Catalog, metadata and experimental tables of the 24 investigations, no login</p></div>
  <div class="arrow">→</div>
  <div class="st s2"><span>SILVER</span><b>One table per experiment</b><p>Common schema, SI units, normalized labels, quality rules, correction log</p></div>
  <div class="arrow">→</div>
  <div class="st s3"><span>GOLD</span><b>Analytic tables</b><p>{n(S['records'])} tests, 24 profiles, similarity, per-habitat ranking, findings</p></div>
  <div class="arrow">→</div>
  <div class="st s4"><span>MODELS + SI</span><b>Validated ML</b><p>FLEX + 200-model bootstrap, CFI-G test, out-of-data guard, active learning, SI firewall</p></div>
  <div class="arrow">→</div>
  <div class="st s5"><span>WEB</span><b>Dashboard</b><p>Exported JSON; the models run in the browser</p></div>
</div>
<p class="fcap"><b>Figure {Fn()}.</b> Skylab Phoenix pipeline architecture. Command: <code>python -m pipeline.run</code> (≈ 4 s).</p>
<h3>Layers</h3>
<ul>
<li><b>Bronze</b> (<code>scripts/fetch_psi*.py</code>): downloads the catalog and the lightweight files of each investigation (≈ 55 MB).</li>
<li><b>Silver</b> (<code>pipeline/silver.py</code>): one function per experiment maps each table to the common schema (Annex A). It converts mmHg and bar to atm and percentages to mole fractions, normalizes labels (“Extinction”, “SE”/“FT”, yes/Yes/flash) and extracts the outcome from the operator's notes in BASS. It also separates flow sweeps and flags O₂ and pressure when they are not reported.</li>
<li><b>Gold</b> (<code>pipeline/gold.py</code>, <code>pipeline/investigations.py</code>): unified test table, profile of each investigation, similarity, per-habitat ranking, findings with evidence scores and web export.</li>
</ul>
<h3>Quality rules</h3>
<p>The pipeline fails on duplicate ids, mole fractions outside [0, 1] or pressures outside [0.1, 6] atm. It also applies correction rules: physically impossible values, mole fractions that do not sum to 1, spreadsheet auto-fill errors, duplicate rows and mis-formatted percentages. The full log is in Annex C.</p>
{fig('f02_calidad', f'Corrections by type. {autofill} of the {S["qc_fixes"]} are spreadsheet auto-fill errors, such as “40% CH4” turning into CH5, CH6… CH14 row after row in ACME CLD, or “N2” turning into N3, N4… in ACME s-Flame.', Fn())}
<p>Examples: a 0 mmHg pressure in FLEX (excluded from the models), “3400%” and “2100%” in ACME BRE (34% and 21%), 8 identical duplicate rows in CFI, a missing decimal point in Saffire-II (“037 mm” → 0.37 mm) and 19 lowercase “yes/no” labels in CFI-G. None was fixed silently: all can be audited.</p>
</section>

<section class="page">
<h2>Exploratory analysis</h2>
<p class="lead">Before any model, the data shows three patterns: almost no tests near lunar-base air, fires stop putting themselves out as oxygen rises, and CO₂ suppresses fires at reduced pressure.</p>
<h3>Coverage: where NASA has flown fire</h3>
{fig('f01_cobertura', f'Every flight record with an ambient O₂ and pressure, against the habitat atmospheres. Hollow markers: conditions not reported (cabin air assumed) or burner O₂ (inverse flames). Of {n(cov["n_ambient"])} records ({n(cov["n_measured"])} with measured conditions), only {cov["n_moon_envelope"]} fall in the lunar envelope, all from {", ".join(cov["moon_envelope_experiments"])}. No solid exceeds 22.7% O₂.', Fn(), True)}
<h3>With more oxygen, flames stop putting themselves out</h3>
{fig('f03_flex_oxigeno', f'Outcome of the {sum(b["n"] for b in bands)} FLEX droplets by O₂ band. Below 18% O₂, {bands[0]["extincion"]} of {bands[0]["n"]} went out on their own. Between 30 and 34%, only {hi_band["extincion"]} of {hi_band["n"]}, and none of the 17 at 0.70 atm, next to lunar-base air.', Fn())}
<h3>CO₂ suppression</h3>
{fig('f04_supresion_co2', 'Self-extinction rate by CO₂ level, with 90% Wilson intervals. At 0.7 atm the rate rises from 50% without CO₂ to 100% above 30%. The dip at 1–20% is explained by those tests using more O₂ (23–25%): the effect of CO₂ is confounded with oxygen.', Fn())}
<h3>Gravity: microgravity vs 1 g on the same samples</h3>
{fig('f05_saffire_gravedad', f'Saffire-II burned the same samples in orbit (Cygnus) and on the ground, at 20 cm/s and ≈ 22% O₂. In {worse_1g} of {len(G2)} samples, 1 g burned as much or more. Silicone barely spread in orbit but burned fully on the ground.', Fn())}
<p>This qualifies a BASS-II hypothesis: that NASA's standard 1 g test (NASA-STD-6001, Test 1) may not be conservative in space. At 20 cm/s, Saffire-II shows it was. The question stays open for <b>low flow</b>, a regime Saffire-II did not test. In Saffire-I, the same 94 × 40 cm SIBAL fabric burned <b>{n(s1.get('concurrent', 0))} s with concurrent flow and {n(s1.get('opposed', 0))} s with opposed flow</b>: ventilation direction defines the worst case.</p>
<h3>Cool flames</h3>
<p>Of {CG['ignition']['tests']} ACME CFI-G tests, {CG['ignition']['ignited']} ignited and <b>{CG['ignition']['cool_flames']} produced confirmed cool flames</b>, all with {', '.join(CG['cool_flame_conditions']['fuel'])}, near {p(CG['cool_flame_conditions']['o2'][1])} O₂ and {n(CG['cool_flame_conditions']['p_atm'][0], 1)} atm. They are rare, but an optical detector may miss them.</p>
</section>

<section class="page">
<h2>Summaries, ranking and similarity of investigations</h2>
<p class="lead">Each investigation has a profile generated from its data and a relevance score per habitat. The score is a visible formula, not a black box.</p>
<h3>Automatic profile</h3>
<p>For each experimental table, the pipeline classifies every column as <b>varied</b> (with its range), <b>fixed</b> (with its value) or <b>measured</b> (an outcome). This directly answers the challenge's question: “how did the tests within one investigation differ, and how were they alike?”. The profile adds the objective, hypothesis, team, hardware, conditions covered, publications with DOI and the Earth benefit reported by PSI.</p>
<h3>Ranking per habitat</h3>
<div class="formula">Relevance = 100 × ( 0.5 · proximity + 0.2 · evidence + 0.3 · directness )</div>
<ul>
<li><b>Proximity:</b> 1 − e<sup>−n/8</sup>, where n is the effective number of tests near the habitat atmosphere, with a Gaussian kernel of 3 points of O₂ and 30% of pressure. It counts half when the O₂ is at the burner or the conditions were assumed.</li>
<li><b>Evidence:</b> log(1 + tests with an outcome), normalized to 300.</li>
<li><b>Directness:</b> 1.0 if the challenge page names it as core (BASS, BASS-II, Saffire, SAME, SAME-R, FLEX); 0.75 if it mentions it (BRE, DAFT, CFI-G, E-FIELD); 0.5 for other flight investigations; 0.35 for ground ones.</li>
</ul>
{fig('f06_ranking_habitat', 'Relevance of the 24 investigations for each habitat. FLEX leads for the lunar base thanks to its tests at 30–34% O₂ and 0.70 atm; ACME CFI-G leads for the exploration atmosphere. BASS and BASS-II lead for the cabin. None comes close to the spacesuit.', Fn(), True)}
<p class="tcap"><b>Table {T()}.</b> The six most relevant investigations for the lunar base.</p>
{top_table('moon_base')}
<h3>Similarity between investigations</h3>
<div class="formula">Similarity = 0.30 · Jaccard(keywords) + 0.25 · same family + 0.15 · same hardware + 0.15 · overlap of O₂ range + 0.15 · linked in PSI</div>
{fig('f07_similitud', 'Similarity matrix ordered by hierarchical clustering (average linkage). Clear blocks emerge: droplets (FLEX, FLEX-2, CFI), Saffire, BASS, smoke (SAME, SAME-R, DAFT) and the ACME family.', Fn(), True)}
</section>

<section class="page">
<h2>Machine learning</h2>
<p class="lead">With hundreds of tests rather than millions, we chose small, interpretable, calibrated models. We compare them with baselines and validate them without letting tests from the same day leak between training and testing.</p>
<h3>8.1 Problem formulation</h3>
<p>Target: <b>does the flame put itself out?</b> (FLEX: “Extinction” = 1; “Disruption” or “Completion” = 0). Base rate: {p(F['base_rate'], 1)}. We used {F['n']} of the 274 tests: 13 were excluded, one with an invalid pressure and twelve without an initial diameter.</p>
<p class="tcap"><b>Table {T()}.</b> Inputs (six, each with a physical meaning).</p>
<table class="compact"><thead><tr><th>Input</th><th>Why</th></tr></thead><tbody>
<tr><td>O₂ mole fraction</td><td>Controls reaction rate and flame temperature</td></tr>
<tr><td>ln(pressure)</td><td>Pressure changes diffusion and soot radiation</td></tr>
<tr><td>CO₂ and helium fractions</td><td>Suppressing diluents: heat capacity (CO₂) and diffusivity (He)</td></tr>
<tr><td>Initial droplet diameter</td><td>Large droplets make large flames, with more radiative loss</td></tr>
<tr><td>Fuel (heptane / methanol)</td><td>Heptane soots more and burns differently than methanol</td></tr>
</tbody></table>
<h3>8.2 Validation design</h3>
<ul>
<li>5-fold <b>GroupKFold</b> with <b>{F['validation']['scheme'].split('·')[1].strip()}</b> as groups: each whole day is either in training or in testing, never both.</li>
<li>Out-of-sample metrics: AUC (ranking ability), Brier and log loss (quality of the probabilities) and accuracy.</li>
<li>Comparison with gradient boosting (same inputs) and two baselines: oxygen only, and a constant base rate.</li>
<li>Uncertainty: <b>200 bootstrap models</b> resampling whole days. Each prediction reports the mean and the 90% interval.</li>
</ul>
<h3>8.3 Results</h3>
<p class="tcap"><b>Table {T()}.</b> Out-of-sample performance (whole days held out). Highlighted row: deployed model.</p>
{metrics_table()}
{fig('f08_validacion', 'Logistic regression beats gradient boosting on all three metrics. With little data, the simpler model generalizes better, so it is the one deployed.', Fn(), True)}
<div class="two">
{fig('f09_calibracion', 'Calibration diagram: when the model says 70%, it happens about 70% of the time.', Fn())}
{fig('f10_factores', 'Standardized coefficients with 90% bootstrap intervals. Grey: inconclusive.', Fn())}
</div>
<h3>8.4 Interpretation</h3>
{drivers_table()}
<p>Oxygen dominates: more O₂, less self-extinction. Large droplets and helium favour extinction, consistent with radiative-loss extinction of large flames in microgravity. Heptane sustains a flame better than methanol. The effects of CO₂ and pressure are <b>inconclusive</b> once O₂ is accounted for, and we report them as such.</p>
<h3>8.5 Probability maps and predictions per habitat</h3>
{fig('f11_mapa_probabilidad', 'P(fire keeps burning) according to the model, without diluent and with a 3 mm droplet. White line: 50% self-extinction. Dots: flown FLEX tests (white = went out; dark = kept burning). Crosses: cabin, EVA prep and lunar base.', Fn(), True)}
<p class="tcap"><b>Table {T()}.</b> Probability of self-extinction per habitat (3 mm droplet, no suppressant), with 90% interval.</p>
{habitat_table()}
{fig('f12_habitats', f'From cabin to lunar base, the chance that a methanol droplet flame puts itself out falls from {p(cab["p"])} to {p(moon["p"])}. The exploration atmosphere is an extrapolation; the spacesuit is outside the data.', Fn())}
<h3>8.6 “Out-of-data” guard</h3>
<p>A model always returns a number, even when the question is far from what was tested. To prevent that, we compute the mean distance to the 5 nearest tests in the standardized input space. The limit is the 95th percentile of that distance among the tests themselves (<b>{n(F['ood_threshold'], 2)}</b>). Up to 1× the limit: within the data. Between 1× and 2×: extrapolation (shown with a warning). Beyond 2×: <b>no prediction</b>. In addition, if any single input leaves the range flown in FLEX (for example, a pressure below every test), the prediction is flagged as an extrapolation even when the distance is small: this is the case of the exploration atmosphere (34% O₂, 8.2 psi). The lunar base sits at {n(HC['moon_base']['fuels']['Methanol']['ood_distance'], 2)} (within the data). The spacesuit sits at {n(HC['suit']['fuels']['Methanol']['ood_distance'], 1)}, about ten times the limit, so Skylab Phoenix gives no number and reports a gap.</p>
<h3>8.7 Hypothesis test: a limiting flame temperature? (ACME CFI-G)</h3>
{fig('f13_temperatura_limite', f'P(self-extinction) versus adiabatic flame temperature, for tests that ignited (normal n = {nrm["n"]}, inverse n = {inv["n"]}). The relationship holds for normal flames (AUC {n(nrm["metrics"]["auc"], 2)}); for inverse flames it has no predictive power (AUC {n(inv["metrics"]["auc"], 2)}). Grey band: beyond the hottest flame tested.', Fn(), True)}
<p>For normal flames, self-extinction becomes more likely as flame temperature falls. The 50% point (≈ {n(nrm['t50'])} K; 90% CI {n(nrm['t50_lo'])}–{n(nrm['t50_hi'])} K) lies <b>just above the hottest flame tested ({n(nrm['tad_max'])} K)</b>, so it is an extrapolation. For inverse flames, no single temperature explains extinction. Conclusion: flame temperature is not a universal criterion, and reporting this negative result is part of the project's scientific honesty.</p>
</section>

<section class="page">
<h2>Next experiment: active learning</h2>
<p class="lead">If NASA could fly one more test, which one would teach the most? Skylab Phoenix searches near lunar-base air for the conditions where the 200 bootstrap models disagree most.</p>
<div class="formula">Score = width of the 90% CI × (0.35 + closeness to lunar-base air) × penalty if the distance exceeds 2× the out-of-data limit</div>
<p>The search sweeps a grid of O₂ (21–40%), pressure (0.30–1.00 atm), CO₂ (0–30%) and both fuels. To keep recommendations diverse, it allows at most two per fuel–CO₂ combination.</p>
{fig('f14_incertidumbre', 'Model uncertainty (width of the 90% interval) without CO₂, with the flown tests and the 6 recommendations. The recommendations add CO₂ (see table).', Fn(), True)}
<p class="tcap"><b>Table {T()}.</b> Recommended tests, ordered by expected information gain.</p>
{picks_table()}
<p><b>Reading:</b> the model is most unsure about <b>how much CO₂ it takes to put out a fire at the reduced pressure and elevated O₂ of the lunar base</b>. That is exactly the suppression question a lunar habitat must answer before choosing extinguishers. Since PSI has no partial-gravity data, these conditions are also the first worth repeating in LUCI or FM2.</p>
</section>

<section class="page">
<h2>Fire-safety findings ranked by evidence</h2>
<p class="lead">The pipeline produces {len(FIND)} findings. Each has an evidence score and a design implication. Every number in them is computed from the PSI tables, except the solid-material limits, which are quoted from NASA's BASS-II report stored in PSI.</p>
<div class="formula">Evidence = 100 × ( 0.35 · volume + 0.25 · quality + 0.20 · agreement + 0.20 · closeness to the Moon )</div>
<p class="note">Volume = log(1 + n)/log(301). Quality = model validation or type of measurement. Agreement = investigations pointing the same way (max. 3). Closeness = how near lunar-base air the evidence is.</p>
{fig('f15_hallazgos', 'Evidence score of each finding, coloured by safety layer.', Fn())}
<p class="tcap"><b>Table {T()}.</b> Findings with their implication for habitat design.</p>
{findings_table()}
</section>

<section class="page">
<h3>Solid materials: the limits measured in orbit</h3>
<p>Fabrics and plastics are what burns in a spacecraft, and the challenge points to BASS, BASS-II and Saffire. From the BASS-II test matrices (PSI-25) we extracted the oxygen, CO and CO₂ readings of {SOL['n_tests']} tests, and from NASA's BASS-II summary report (NASA/TM-20210011385, also in PSI) the flammability boundary that the investigators fitted to their PMMA rod tests: X<sub>O₂</sub> = 6·exp(−0.5a) + 0.0167a + 13.4 (%), where a = 1.5U/r is the stretch rate ({SOL['boundary']['page']}).</p>
<ul>
<li>The boundary bottoms out at about <b>{SOL['min_o2_pct']}% O₂</b> near {SOL['min_flow_cm_s'][0]:.1f}–{SOL['min_flow_cm_s'][1]:.1f} cm/s of airflow, below the <b>{SOL['g1_upward_limit_pct']}%</b> limit of the normal-gravity upward test ({SOL['g1_page']}). In the gentle airflow typical near spacecraft surfaces, solids burn at less oxygen than Earth tests indicate.</li>
<li>Rods needed about {SOL['ignition_limit_pct']}% O₂ to ignite ({SOL['ignition_page']}); once lit, flames survived to {SOL['lowest_final_o2_rods_pct']:.1f}% (BASS-II table).</li>
<li>Near the limit, flames run fuel-rich: PMMA rods released a median <b>{SOL['co_rods_low_o2_median_ppm']:.0f} ppm</b> of CO below 17% O₂ ({SOL['n_rods_low']} tests) against {SOL['co_rods_high_o2_median_ppm']:.0f} ppm above 20% ({SOL['n_rods_high']} tests).</li>
<li>Three final-O₂ values in NASA's table (0.6–1.6%) are physically impossible in the 250 L glovebox; they are logged in the quality log and excluded.</li>
</ul>
<p class="tcap"><b>Table {T()}.</b> What the boundary implies for each habitat (PMMA rod, 1 atm).</p>
{solid_table()}
<p class="note">With no forced airflow the boundary sits at {SOL['zero_flow_o2_pct']}% O₂, below every habitat. No solid has burned in orbit above {SOL['max_o2_any_solid_pct']}% O₂ or at reduced pressure, so every habitat above cabin air is an extrapolation, which is why solid-material flammability at ≥30% O₂ and ≤10.2 psi is the flight test the data asks for.</p>
{shot('11_solidos', 'Solid materials in the dashboard: NASA flammability boundary with habitat oxygen levels, CO released by each BASS-II test, and the implication per habitat.', Fn())}
</section>

<section class="page">
<h2>The SI layer: briefings you can check</h2>
<p class="lead">The challenge asks for a super intelligence (SI) powered dashboard. Skylab Phoenix uses SI where it is strong, turning evidence into plain language, and keeps it away from decisions: rankings, predictions and the out-of-data guard stay deterministic and tested.</p>
<h3>11.1 How it works</h3>
<ol>
<li><b>Evidence packs.</b> For each of the 5 habitats and 24 investigations, <code>pipeline/si.py</code> writes numbered evidence items (E1, E2…) computed from the gold data: model predictions with their intervals, the most relevant investigations, coverage, validation and the top findings.</li>
<li><b>SI drafts.</b> An SI model (Anthropic Claude) writes a 2–4 sentence briefing from each pack. Each sentence lists the evidence items it relies on. <code>scripts/si_generate.py</code> regenerates the drafts through the Anthropic API.</li>
<li><b>Verification firewall.</b> Code publishes a briefing only if every sentence cites existing evidence, every number appears in the evidence it cites, nothing reads as a safety verdict (“is safe”, “certified”, “guaranteed”…), and the evidence is unchanged since the draft was written (hash). Otherwise the dashboard shows the evidence itself, labelled “Evidence brief”.</li>
</ol>
<p>Result: <b>{si_ok} of {si_total}</b> briefings pass. The firewall was exercised during development: correcting the EVA-prep pressure (10.3 → 10.2 psi) changed the evidence of 14 packs, and the firewall blocked exactly those 14 drafts, naming the outdated numbers, until they were rewritten. The test suite checks that invented numbers, wrong citations, uncited sentences, verdicts and stale drafts are all rejected.</p>
<h3>11.2 Example: lunar-base briefing as published</h3>
{si_example('moon_base')}
<h3>11.3 Ask the archive</h3>
<p>A BM25 keyword search, running in the browser, over NASA's own text for the 24 investigations (objectives, hypotheses, approach, Earth benefits, publication titles), our findings, the habitat definitions and a short glossary. It returns ranked passages with their source and a link to the PSI record. It quotes; it does not generate, so it cannot invent an answer, and it says so when no passage fits.</p>
{shot('09_si_briefing', 'SI briefing with citations and the evidence behind each sentence (left), and Ask the archive answering “Which suppressants did NASA test?” with NASA passages (right).', Fn())}
</section>

<section class="page">
<h2>The Skylab Phoenix dashboard</h2>
<p class="lead">A static website with its own design. The models run in the browser, so every control is a live prediction and there is no server that could fail during a demo. Plotly is bundled, so it also works without internet once loaded.</p>
<p>Sections: home with indicators, habitat cards and lessons from history (Apollo 1, Apollo 13, Mir); SI briefing and Ask the archive, with guided views for undergraduates, graduate students, professors, researchers and engineers; coverage; investigations (ranking, profile, side-by-side comparison and similarity); scenario simulator with shareable links; solid materials; evidence; findings; next experiment; applications on Earth; and data and validation with downloads and links to all ten resources the challenge lists. It works on desktop and mobile and is published on GitHub Pages: juanzarate1129517999-beep.github.io/nasa-space.</p>
{shot('01_inicio', 'Home: headline, key indicators and self-extinction probability per habitat. The spacesuit appears as “outside the data”.', Fn())}
{shot('02_cobertura', 'Coverage: every flight test against the habitat atmospheres, with filters by family.', Fn())}
{shot('03_investigaciones', 'Investigations: ranking by habitat and safety layer, and a profile generated from the data (what varied, what was measured, score breakdown).', Fn())}
{shot('10_comparar', 'Side-by-side comparison of up to three investigations; rows that differ are highlighted.', Fn())}
{shot('04_simulador', 'Simulator: habitat presets and controls for O₂, pressure, CO₂, helium, droplet size and fuel. Result in plain words with its interval and data status, and a live curve of the chance that the fire goes out on its own, with the atmospheres no flight test reached shaded.', Fn())}
{shot('05_evidencia', 'Evidence: outcome by O₂, CO₂ suppression, limiting temperature and microgravity versus 1 g.', Fn())}
{shot('07_proximo', 'Next experiment: the recommended flight test in plain language, how sure the model is today for each candidate, and the test conditions.', Fn())}
{shot('08_validacion', 'Data and validation: architecture, metrics against baselines, calibration and quality log.', Fn())}
</section>

<section class="page">
<h2>Discussion and limitations</h2>
<p class="lead">Saying clearly what the data does not allow is part of the result.</p>
<ul>
<li><b>Droplets, not cabin materials.</b> The main model was trained on methanol and heptane droplets. The defensible conclusion is that, in every fuel family NASA tested in μg, self-extinction disappears at ≥ 30% O₂. It is not a direct prediction for fabrics or polymers.</li>
<li><b>Little data near the Moon.</b> {cov['n_moon_envelope']} records in the lunar envelope and none of solids. The intervals reflect it and the out-of-data guard watches it.</li>
<li><b>CO₂ effect confounded with O₂.</b> In FLEX, each CO₂ level was tested at a different O₂. We therefore show empirical rates and do not extrapolate a CO₂ dose.</li>
<li><b>BASS outcomes extracted from text.</b> They come from regular expressions over operator notes and are hints for a combustion expert to review.</li>
<li><b>Solids concentrated in PMMA</b> (177 of 238 tests). Other materials have very little data.</li>
<li><b>No partial gravity.</b> PSI has no lunar or Martian data. Saffire-II bounds only the 20 cm/s regime.</li>
<li><b>Assumed conditions.</b> In SPICE, SLICE, SAME, CLD and E-FIELD, O₂ and pressure are not reported per test and cabin air was assumed. They are flagged and down-weighted in the ranking.</li>
<li><b>Extrapolated limiting temperature.</b> The 50% point in CFI-G lies above the hottest temperature tested.</li>
<li><b>SI text is interpretation, not evidence.</b> The firewall guarantees citations and numbers, not that an interpretation is the best one; the evidence behind every sentence is one click away.</li>
</ul>
<h3>What we did to mitigate it</h3>
<p>Validation by whole test days, comparison with baselines, bootstrap intervals, a calibration diagram, an out-of-data guard with a per-input range check, a public correction log, a verified SI layer, automated tests in continuous integration, and wording that separates what was measured from what was extrapolated.</p>
</section>

<section class="page">
<h2>Impact for exploration and on Earth</h2>
<ul>
<li><b>Lunar habitat design.</b> Quantifies how much the risk grows from cabin air to lunar-base air and what must be measured before certifying materials.</li>
<li><b>Experiment planning.</b> The active-learning recommendation prioritizes tests for the ISS, LUCI or FM2 where they add the most information.</li>
<li><b>Detection and suppression.</b> Flags cool flames as a risk for optical detectors, CO₂ and helium as suppressants with measurable effects, and ventilation as a design variable.</li>
<li><b>Open data engineering.</b> The clean dataset and the PSI correction log serve any researcher.</li>
<li><b>On Earth.</b> The same questions (oxygen-enriched atmospheres in hospitals, submarines and mines; smoke detection that tells smoke from dust; firefighter equipment) benefit from this data. The profiles include the Earth benefits PSI reports for each investigation.</li>
</ul>
<h2>Conclusions</h2>
<ol>
<li>NASA's flight data shows that <b>at ≥ 30% O₂ fire stops putting itself out</b>: in FLEX, {hi_band['extincion']} of {hi_band['n']} droplets, and 0 of 17 at 0.70 atm.</li>
<li>A simple, calibrated model (out-of-sample AUC {n(LR['auc'], 2)}) estimates that self-extinction falls from {p(cab['p'])} in the cabin to {p(moon['p'])} in the lunar base.</li>
<li>The <b>data gap</b> is the most important finding for NASA: {cov['n_moon_envelope']} records near lunar-base air, none of solids, none for the suit.</li>
<li>The highest-value next test is <b>CO₂ suppression at lunar-base O₂ and pressure</b>.</li>
<li>Everything is reproducible and traceable, and it is presented in a dashboard, with verified SI briefings, that says when it does not know.</li>
</ol>
<h2>Future work</h2>
<ul>
<li>A flammability envelope for solids (PMMA, SIBAL) with a Gaussian process in the flow–O₂ plane, after turning BASS flow sweeps into expert-reviewed points.</li>
<li>Extract results from PSI publications with an SI model and cross-check them against the tables with the same firewall.</li>
<li>Add partial-gravity data (LUCI, FM2) when PSI publishes it, and retrain.</li>
<li>A survival model for gas-flame burn time that treats flames still burning at fuel cut-off as censored.</li>
</ul>
<h2>Reproducibility</h2>
<pre>python -m venv .venv &amp;&amp; source .venv/bin/activate
pip install -r requirements.txt
python scripts/fetch_psi_catalog.py combustion
python scripts/fetch_psi.py data/psi PSI-10 PSI-20 … PSI-159
python -m pipeline.run              # silver → gold → models → SI firewall → web/data
python -m pytest                    # tests
python report/figures.py en         # English figures
python report/build_report_en.py    # this PDF
python scripts/serve.py             # dashboard at http://127.0.0.1:8765</pre>
<p class="tcap"><b>Table {T()}.</b> Repository layout.</p>
<table class="compact"><thead><tr><th>Path</th><th>Contents</th></tr></thead><tbody>
<tr><td class="mono">scripts/</td><td>PSI download (bronze), SI draft generation and local dashboard server</td></tr>
<tr><td class="mono">pipeline/</td><td>silver.py, investigations.py, models.py, gold.py, si.py, run.py</td></tr>
<tr><td class="mono">data/gold/, data/si/</td><td>Tests, investigations, QC log, findings; evidence packs, SI drafts and verification</td></tr>
<tr><td class="mono">web/</td><td>Dashboard (index.html, styles.css, app.js, data/, bundled Plotly)</td></tr>
<tr><td class="mono">tests/</td><td>pytest suite run in continuous integration</td></tr>
<tr><td class="mono">report/</td><td>Figures, screenshots and the report generators (Spanish and English)</td></tr>
</tbody></table>
</section>

<section class="page refs">
<h2 class="nonum">References</h2>
<ol>
<li>NASA Space Apps Challenge 2026. <i>Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data</i>. spaceappschallenge.org/2026/challenges/flame-in-freefall</li>
<li>NASA Physical Sciences Informatics (PSI). Repository, search “combustion”. psi.nasa.gov/physci/repo · CC0 license</li>
<li>NASA Glenn Research Center. <i>Combustion Science</i>. nasa.gov/glenn</li>
<li>NASA. <i>A Researcher's Guide to International Space Station Combustion Science</i> (2015).</li>
<li>NASA exploration atmosphere: 8.2 psia, 34% O₂. NTRS 20240007817 (ICES-2024-128).</li>
<li>Urban, D. L., et al. “Flame spread: Effects of microgravity and scale”. <i>Combustion and Flame</i> (2019). DOI 10.1016/j.combustflame.2018.10.012</li>
<li>Olson, S. L., Ferkul, P. V. “Microgravity flammability boundary for PMMA rods in axial stagnation flow”. <i>Combustion and Flame</i> (2017). DOI 10.1016/j.combustflame.2017.03.001</li>
<li>Bhattacharjee, S., et al. “The critical flow velocity for radiative extinction in opposed-flow flame spread in a microgravity environment”. <i>Combustion and Flame</i> (2016). DOI 10.1016/j.combustflame.2015.10.023</li>
<li>Bhattacharjee, S., et al. “Opposed-flow flame spread: A comparison of microgravity and normal gravity experiments”. <i>Fire Safety Journal</i> (2016). DOI 10.1016/j.firesaf.2015.11.011</li>
<li>Nayagam, V., Dietrich, D. L., Hicks, M. C., Williams, F. A. “Methanol droplet combustion in oxygen-inert environments in microgravity” (FLEX, PSI-69).</li>
<li>NASA-STD-6001B. <i>Flammability, Offgassing, and Compatibility Requirements and Test Procedures</i> (Test 1, upward flame propagation).</li>
<li>Pedregosa, F., et al. “Scikit-learn: Machine Learning in Python”. <i>JMLR</i> 12 (2011).</li>
<li>Wilson, E. B. “Probable inference, the law of succession, and statistical inference”. <i>JASA</i> 22 (1927).</li>
<li>Robertson, S., Zaragoza, H. “The Probabilistic Relevance Framework: BM25 and Beyond”. <i>Foundations and Trends in IR</i> 3 (2009).</li>
</ol>
<p class="note">The DOIs of each PSI dataset and its publications appear in the dashboard profiles.</p>

<h2 class="nonum">Annex A. Data dictionary (gold test table)</h2>
<p class="note">Field names are the ones used in the code (Spanish).</p>
<table class="compact"><thead><tr><th>Field</th><th>Description</th></tr></thead><tbody>
{''.join(f"<tr><td class='mono'>{a}</td><td>{b}</td></tr>" for a, b in SCHEMA)}
</tbody></table>

<h2 class="nonum">Annex B. Formulas</h2>
<div class="formula">Logistic regression: P(self-extinction) = 1 / (1 + e<sup>−(β₀ + Σ βᵢ zᵢ)</sup>), with zᵢ = (xᵢ − μᵢ)/σᵢ</div>
<div class="formula">Wilson interval (z = 1.645): ( p̂ + z²/2n ± z·√( p̂(1−p̂)/n + z²/4n² ) ) / (1 + z²/n)</div>
<div class="formula">Brier = (1/N) Σ (pᵢ − yᵢ)² · Log loss = −(1/N) Σ [ yᵢ ln pᵢ + (1−yᵢ) ln(1−pᵢ) ]</div>
<div class="formula">Out-of-data distance = mean of the 5 smallest Euclidean distances to the tests, in standardized inputs; plus a per-input check against the flown range</div>
<div class="formula">Closeness to a habitat: kernel = exp( −½ [ ((x<sub>O₂</sub> − h<sub>O₂</sub>)/0.03)² + (ln(p/h<sub>p</sub>)/ln 1.3)² ] )</div>
</section>

<section class="page annex">
<h2 class="nonum">Annex C. Full quality log ({len(D['qc'])} corrections)</h2>
<p class="note">Generated by the pipeline (<code>data/gold/qc_log.csv</code>).</p>
{qc_table()}
</section>

</body></html>
"""

out_html = REP / "report_en.html"
out_html.write_text(doc, encoding="utf-8")
print("HTML ->", out_html)

browsers = [Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            Path(shutil.which("chromium") or "/nonexistent"),
            *sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux64/chrome"))]
exe = next((b for b in browsers if b.exists()), None)
if exe:
    pdf = REP / "Technical_Report_Skylab_Phoenix.pdf"
    before = pdf.stat().st_mtime if pdf.exists() else 0
    args = [str(exe), "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=15000"]
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        args.append("--no-sandbox")
    run = subprocess.run(args + [f"--print-to-pdf={pdf}", out_html.as_uri()], check=False, capture_output=True, timeout=180)
    if pdf.exists() and pdf.stat().st_mtime > before:
        print("PDF  ->", pdf, f"{pdf.stat().st_size / 1e6:.1f} MB")
    else:
        print("PDF NOT updated: the browser failed.\n", run.stderr.decode(errors="replace")[-600:])
else:
    print("No Edge/Chrome found: open report/report_en.html and print to PDF.")
