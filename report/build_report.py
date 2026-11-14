"""Build the Skylab Phoenix technical report (Spanish) as HTML and print it to PDF with headless Edge/Chrome.

Usage:
    python -m pipeline.run          # refresh data
    python report/figures.py        # refresh figures
    python report/build_report.py   # -> report/Informe_Skylab_Phoenix.pdf

Every number in the report is read from web/data/ember.json (the pipeline export).
"""
import html
import json
import shutil
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REP = ROOT / "report"
D = json.loads((ROOT / "web" / "data" / "ember.json").read_text(encoding="utf-8"))
F, CG, S = D["flex"], D["cfig"], D["summary"]
E = html.escape


def n(x, d=0):
    """Spanish number format: 1.647 · 0,88."""
    s = f"{x:,.{d}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".")


def p(x, d=0):
    return f"{n(100 * x, d)} %"


def model(key):
    return next(m for m in F["validation"]["models"] if m["key"] == key)


LR, GB, O2, PR = model("lr"), model("gb"), model("o2"), model("prior")
HC = {h["habitat"]: h for h in D["habitat_check"]}
drv = {d["feature"]: d for d in F["drivers"]}
cov = D["coverage"]
bands = D["o2_bands"]
hi_band = bands[-1]
nrm, inv = CG["by_type"]["normal"], CG["by_type"]["inverse"]
G2 = D["saffire2"]
worse_1g = sum(g["g1_estado"] >= g["ug_estado"] for g in G2)
s1 = {r["direccion"].strip().lower(): r["tiempo_quemado_s"] for r in D["saffire1"]}
sup = {(r["pressure"][:3], r["co2"]): r for r in D["suppression"]["co2"]}
INV = D["investigations"]
picks = D["next"]["picks"]
FIND = D["findings"]

FAM_ES = {"Fuel droplets": "Gotas de combustible", "Gas flames": "Llamas de gas", "Solid materials": "Materiales sólidos",
          "Smoke & dust": "Humo y polvo"}
LAYER_ES = {"Prevention": "Prevención", "Detection": "Detección", "Suppression": "Supresión"}
HW_ES = {"MDCA droplet rig · CIR": "MDCA · CIR", "ACME · Combustion Integrated Rack": "ACME · CIR",
         "MSG fan-driven flow duct": "Ducto MSG", "Saffire module · Cygnus": "Saffire · Cygnus",
         "Smoke & aerosol diagnostics": "Diagnóstico de humo", "Ground laboratory / modeling": "Tierra / modelado"}
HAB_ES = {"cabin": "Cabina de nave (ISS, Gateway, Orion)", "eva_prep": "Preparación de EVA",
          "moon_base": "Base lunar y rover presurizado", "suit": "Traje espacial"}
FIND_ES = {
    "coverage_gap": ("Casi no hay datos de vuelo donde vivirá la base lunar",
                     "Siguiente experimento de mayor valor: inflamabilidad de sólidos a ≥ 30 % de O₂ y ≤ 10,2 psi."),
    "model_moon": (f"Con la atmósfera lunar, la autoextinción es ~{round(HC['cabin']['fuels']['Methanol']['p'] / HC['moon_base']['fuels']['Methanol']['p'])} veces menos probable que en cabina",
                   "Lo que se certificó a 21 % / 1 atm no puede reutilizarse en la base lunar sin volver a ensayar."),
    "pmma": ("Los datos de sólidos dependen de un solo plástico (PMMA)",
             "Telas y polímeros de cabina distintos del PMMA necesitan datos de vuelo antes de confiar en una envolvente."),
    "o2_no_self_ext": ("Sobre 30 % de O₂, las llamas dejan de apagarse solas",
                       "Un incendio en la base lunar debe detectarse y suprimirse activamente: esperar a que se apague no es opción."),
    "helium": ("El helio y las gotas grandes empujan la llama a extinguirse",
               "El diluyente importa: una atmósfera con helio cambia el comportamiento del fuego, no solo el nivel de O₂."),
    "co2": ("La dilución con CO₂ suprime el fuego a presión reducida",
            "El CO₂ funciona, pero en FLEX su efecto se confunde con el del O₂: hace falta una serie controlada a O₂ lunar."),
    "tad_limit": ("¿Una temperatura de llama límite? Solo en llamas normales",
                  "La temperatura de llama no es un criterio universal de extinción; la geometría y el flujo cuentan."),
    "smoke": ("El humo cambia según el material y envejece antes de llegar al detector",
              "Los umbrales de los detectores deberían fijarse por material y por tiempo de transporte."),
    "cool_flames": ("Llamas frías: fuego casi invisible, confirmado en órbita",
                    "Un detector óptico puede no verlas; conviene complementar con sensores químicos (CO, aldehídos)."),
    "one_g": ("A 20 cm/s, la prueba en 1 g fue la más severa",
              "μg y 1 g acotan la gravedad parcial solo en el régimen de flujo ensayado; el flujo bajo sigue abierto."),
    "flow_direction": ("El flujo concurrente hizo arder un fuego grande 6 veces más",
                       "La dirección de la ventilación define el peor caso: la disposición de ventiladores es una variable de seguridad."),
}


def fig(name, caption, num, wide=False):
    return (f'<figure class="{"wide" if wide else ""}"><img src="figures/{name}.svg" alt="{E(caption)}">'
            f'<figcaption><b>Figura {num}.</b> {caption}</figcaption></figure>')


def shot(name, caption, num):
    return (f'<figure class="shot"><img src="screens/{name}.jpg" alt="{E(caption)}">'
            f'<figcaption><b>Figura {num}.</b> {caption}</figcaption></figure>')


# ---------------------------------------------------------------- tables built from data
def inv_table():
    rows = []
    for r in sorted(INV, key=lambda r: (r["type"] != "Flight", r["family"], -r["n_tests"])):
        rows.append(f"<tr><td><b>{E(r['name'])}</b></td><td class='mono'>{r['psi_id']}</td><td>{FAM_ES.get(r['family'], r['family'])}</td>"
                    f"<td>{HW_ES.get(r['hardware'], r['hardware'])}</td><td>{'Vuelo' if r['type'] == 'Flight' else 'Tierra'}</td>"
                    f"<td class='num'>{n(r['n_tests']) if r['n_tests'] else '—'}</td><td class='num'>{n(r['n_with_outcome']) if r['n_with_outcome'] else '—'}</td>"
                    f"<td class='num'>{r['n_publications']}</td></tr>")
    return ("<table><thead><tr><th>Investigación</th><th>PSI</th><th>Familia</th><th>Hardware</th><th>Tipo</th>"
            "<th class='num'>Registros</th><th class='num'>Con resultado</th><th class='num'>Publ.</th></tr></thead><tbody>"
            + "".join(rows) + "</tbody></table>")


def top_table(hab, k=6):
    rs = sorted(INV, key=lambda r: -r["relevance"][hab]["score"])[:k]
    body = "".join(f"<tr><td class='num'>{i + 1}</td><td><b>{E(r['name'])}</b> <span class='mono dim'>{r['psi_id']}</span></td>"
                   f"<td class='num'>{n(r['relevance'][hab]['score'], 1)}</td><td class='num'>{n(r['relevance'][hab]['proximity'], 2)}</td>"
                   f"<td class='num'>{n(r['relevance'][hab]['evidence'], 2)}</td><td class='num'>{n(r['relevance'][hab]['directness'], 2)}</td></tr>"
                   for i, r in enumerate(rs))
    return ("<table class='compact'><thead><tr><th class='num'>#</th><th>Investigación</th><th class='num'>Puntaje</th>"
            "<th class='num'>Cercanía</th><th class='num'>Evidencia</th><th class='num'>Relevancia directa</th></tr></thead><tbody>" + body + "</tbody></table>")


def metrics_table():
    names = {"lr": "Regresión logística (desplegada)", "gb": "Gradient boosting (mismas variables)",
             "o2": "Baseline: solo oxígeno", "prior": "Baseline: tasa base constante"}
    body = "".join(f"<tr class='{'hl' if m['deployed'] else ''}'><td>{names[m['key']]}</td><td class='num'>{n(m['auc'], 3)}</td>"
                   f"<td class='num'>{n(m['brier'], 3)}</td><td class='num'>{n(m['log_loss'], 3)}</td><td class='num'>{p(m['accuracy'], 1)}</td></tr>"
                   for m in F["validation"]["models"])
    return ("<table class='keep'><thead><tr><th>Modelo</th><th class='num'>AUC ↑</th><th class='num'>Brier ↓</th><th class='num'>Log loss ↓</th>"
            "<th class='num'>Exactitud</th></tr></thead><tbody>" + body + "</tbody></table>")


def drivers_table():
    lab = {"x_o2": "Fracción molar de O₂", "d0_mm": "Diámetro inicial de gota (mm)", "heptane": "Combustible heptano (vs metanol)",
           "x_he": "Fracción de helio", "x_co2": "Fracción de CO₂", "log_p": "ln(presión, atm)"}
    body = ""
    for d in F["drivers"]:
        sig = d["lo"] > 0 or d["hi"] < 0
        body += (f"<tr><td>{lab[d['feature']]}</td><td class='num'>{n(d['coef'], 2)}</td><td class='num'>[{n(d['lo'], 2)}; {n(d['hi'], 2)}]</td>"
                 f"<td>{('Aumenta la autoextinción' if d['coef'] > 0 else 'Reduce la autoextinción') if sig else 'No concluyente (el intervalo cruza el 0)'}</td></tr>")
    return ("<table class='compact keep'><thead><tr><th>Variable</th><th class='num'>Coef. estandarizado</th><th class='num'>IC 90 % (bootstrap)</th>"
            "<th>Lectura</th></tr></thead><tbody>" + body + "</tbody></table>")


def habitat_table():
    body = ""
    for hid in ("cabin", "eva_prep", "moon_base", "suit"):
        h = HC[hid]
        hab = next(x for x in D["habitats"] if x["id"] == hid)
        cells = ""
        for fuel in ("Methanol", "Heptane"):
            r = h["fuels"][fuel]
            cells += ("<td class='num'>fuera de los datos</td>" if r["ood"] else f"<td class='num'>{p(r['p'])} <span class='dim'>({p(r['lo'])}–{p(r['hi'])})</span></td>")
        body += (f"<tr><td><b>{HAB_ES[hid]}</b></td><td class='num'>{p(hab['x_o2'], 1 if (hab['x_o2'] * 1000) % 10 else 0)}</td>"
                 f"<td class='num'>{n(hab['p_atm'], 2)} atm · {n(hab['p_atm'] * 14.6959, 1)} psi</td>{cells}</tr>")
    return ("<table class='keep'><thead><tr><th>Hábitat</th><th class='num'>O₂</th><th class='num'>Presión</th><th class='num'>Metanol P(autoext.)</th>"
            "<th class='num'>Heptano P(autoext.)</th></tr></thead><tbody>" + body + "</tbody></table>")


def picks_table():
    body = "".join(f"<tr class='{'hl' if i == 0 else ''}'><td class='num'>{i + 1}</td><td>{'Metanol' if k['fuel'] == 'Methanol' else 'Heptano'}</td>"
                   f"<td class='num'>{p(k['x_o2'])}</td><td class='num'>{n(k['p_atm'], 2)} atm · {n(k['p_atm'] * 14.6959, 1)} psi</td>"
                   f"<td class='num'>{p(k['x_co2'])}</td><td class='num'>{p(k['p_ext'])} <span class='dim'>({p(k['interval'][0])}–{p(k['interval'][1])})</span></td>"
                   f"<td class='num'>{n(100 * k['uncertainty'], 0)} pts</td></tr>" for i, k in enumerate(picks))
    return ("<table class='keep'><thead><tr><th class='num'>#</th><th>Combustible</th><th class='num'>O₂</th><th class='num'>Presión</th>"
            "<th class='num'>CO₂</th><th class='num'>P(autoext.) hoy</th><th class='num'>Ancho IC 90 %</th></tr></thead><tbody>" + body + "</tbody></table>")


def findings_table():
    body = ""
    for i, f in enumerate(FIND):
        t, imp = FIND_ES.get(f["id"], (f["title"], f["implication"]))
        body += (f"<tr><td class='num'><b>H{i + 1}</b></td><td class='num score'>{n(f['score'])}</td><td><span class='tag t-{f['layer']}'>{LAYER_ES[f['layer']]}</span></td>"
                 f"<td><b>{E(t)}</b><div class='impl'>{E(imp)}</div><div class='src mono'>{E(f['source'].replace('Skylab Phoenix model', 'modelo Skylab Phoenix'))}</div></td></tr>")
    return ("<table class='findings'><thead><tr><th class='num'>#</th><th class='num'>Puntaje</th><th>Capa</th><th>Hallazgo e implicación</th></tr></thead><tbody>"
            + body + "</tbody></table>")


def qc_table():
    body = "".join(f"<tr><td class='mono'>{E(q['psi_id'])}</td><td>{E(q['experimento'])}</td><td class='mono'>{E(str(q['registro'])[:22])}</td>"
                   f"<td>{E(q['campo'][:30])}</td><td class='mono'>{E(str(q['valor_original'])[:26])}</td><td class='mono'>{E(str(q['valor_nuevo'])[:26])}</td>"
                   f"<td>{E(q['regla'])}</td></tr>" for q in D["qc"])
    return ("<table class='tiny'><thead><tr><th>PSI</th><th>Experimento</th><th>Registro</th><th>Campo</th><th>Original</th><th>Nuevo</th>"
            "<th>Regla</th></tr></thead><tbody>" + body + "</tbody></table>")


SCHEMA = [("test_uid", "Identificador único: PSI + ensayo"), ("psi_id / experimento", "Investigación de origen"),
          ("familia", "sólido · gota · gas · humo · polvo"), ("combustible / material_familia", "Combustible o material (PMMA, SIBAL, Nomex…)"),
          ("x_o2", "Fracción molar de O₂ (0–1)"), ("o2_ubicacion", "ambiente o quemador (llamas inversas)"),
          ("o2_supuesto / p_supuesta", "Verdadero si se tomó aire de cabina por no reportarse"), ("p_atm", "Presión en atm"),
          ("x_co2 / x_he", "Fracción de diluyentes"), ("flujo_cm_s / barrido_flujo", "Velocidad de flujo y si el ensayo la varió"),
          ("d0_mm", "Diámetro inicial de gota"), ("gravedad", "ug o 1g"), ("ignicion / autoextincion", "Etiquetas binarias"),
          ("resultado", "extinción · disrupción · completo · no ignición · soplado…"), ("llama_fria", "Llama fría confirmada"),
          ("tad_k / zst", "Temperatura adiabática y mezcla estequiométrica"), ("tasa_quemado / tiempo_quemado_s", "Medidas de quemado"),
          ("n_eventos", "Llamas por registro (tablas diarias de ACME)"), ("qc_flags", "Banderas de calidad aplicadas a la fila")]


# ---------------------------------------------------------------- document
moon = HC["moon_base"]["fuels"]["Methanol"]
cab = HC["cabin"]["fuels"]["Methanol"]
eva = HC["eva_prep"]["fuels"]["Methanol"]
r07 = {c: sup[("Red", c)] for c in ("0%", "1–20%", "20–30%", ">30%") if ("Red", c) in sup}
qc_counts = Counter(q["experimento"] for q in D["qc"])
autofill = sum(1 for q in D["qc"] if q["regla"].startswith("Spreadsheet auto-increment"))
logo = (ROOT / "web" / "assets" / "phoenix.svg").read_text(encoding="utf-8")
fig_no = iter(range(1, 100))
tab_no = iter(range(1, 100))


def T():
    return next(tab_no)


def Fn():
    return next(fig_no)


doc = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Skylab Phoenix · Informe técnico</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="report.css">
</head><body>

<!-- =============================== PORTADA -->
<section class="cover">
  <div class="cover-band"></div>
  <div class="logo">{logo}</div>
  <h1 class="title">Skylab Phoenix</h1>
  <p class="subtitle">Inteligencia de seguridad contra incendios a partir de los datos de combustión en microgravedad de NASA: ingeniería de datos, análisis y machine learning para la Luna, las naves y los trajes espaciales</p>
  <p class="tagline">NASA SPACE APPS CHALLENGE 2026 · FLAME IN FREEFALL · SEGURIDAD CONTRA INCENDIOS EN EXPLORACIÓN</p>
  <div class="cover-kpis">
    <div><b>{S['investigations']}</b><span>investigaciones de NASA analizadas</span></div>
    <div><b>{n(S['records'])}</b><span>registros de ensayo unificados</span></div>
    <div><b>{n(LR['auc'], 2)}</b><span>AUC del modelo, validado por días</span></div>
    <div><b>{p(cab['p'])} → {p(moon['p'])}</b><span>autoextinción: cabina → base lunar</span></div>
  </div>
  <table class="meta">
    <tr><td>Equipo</td><td><b>Skylab Phoenix</b></td></tr>
    <tr><td>Reto</td><td>Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data</td></tr>
    <tr><td>Líder del equipo</td><td>Juan Sebastián Zárate</td></tr>
    <tr><td>Integrantes</td><td>Juan Sebastián Zárate (líder)<br>Javier Medina</td></tr>
    <tr><td>Fuente de datos</td><td>NASA Physical Sciences Informatics (PSI) · 24 investigaciones de <i>Combustion Science</i> · licencia CC0</td></tr>
    <tr><td>Herramientas</td><td>Python · pandas · scikit-learn · SciPy · Plotly · HTML/CSS/JavaScript</td></tr>
    <tr><td>Palabras clave</td><td>microgravedad, inflamabilidad, base lunar, ingeniería de datos, machine learning, incertidumbre, aprendizaje activo</td></tr>
  </table>
  <p class="cover-date">13 de noviembre de 2026</p>
</section>

<!-- =============================== RESUMEN -->
<section class="page">
<h2 class="nonum">Resumen</h2>
<p class="lead">La base lunar y los rovers presurizados de Artemis tendrán una atmósfera con <b>30 % de oxígeno o más y 10,2 psi o menos</b>. Skylab Phoenix responde con los propios datos de vuelo de NASA qué le pasa al fuego en esa atmósfera y dónde se acaban esos datos.</p>
<p>Construimos un pipeline de ingeniería de datos que descarga, limpia y unifica las tablas experimentales de las 24 investigaciones de <i>Combustion Science</i> del repositorio PSI de NASA. Resultan {n(S['records'])} registros en un mismo esquema, {S['with_outcome']} de ellos con desenlace etiquetado. Corregimos {S['qc_fixes']} errores de las tablas originales y dejamos cada corrección registrada. Sobre esos datos perfilamos y rankeamos cada investigación por hábitat, y entrenamos modelos interpretables con incertidumbre explícita.</p>
<p>El modelo principal predice si una llama se apaga sola. Se entrenó con {F['n']} incendios de gotas del experimento FLEX en la ISS y, validado dejando fuera días completos de ensayo, obtiene <b>AUC {n(LR['auc'], 2)}</b> y Brier {n(LR['brier'], 3)}. Supera a gradient boosting (AUC {n(GB['auc'], 2)}) y a un baseline que solo usa el oxígeno ({n(O2['auc'], 2)}). Según el modelo, la probabilidad de autoextinción cae de <b>{p(cab['p'])} en una cabina de nave a {p(moon['p'])} en la base lunar</b> (intervalo del 90 %: {p(moon['lo'])}–{p(moon['hi'])}). Al mismo tiempo, solo {cov['n_moon_envelope']} de {n(cov['n_ambient'])} registros de vuelo caen cerca de esa atmósfera, ninguno de un material sólido. Para el traje espacial (100 % O₂, 4,3 psi) no hay ningún ensayo, y el sistema se niega a predecir.</p>
<p>Con aprendizaje activo, Skylab Phoenix recomienda el siguiente experimento: supresión con CO₂ (15–30 %) entre 25 y 27 % de O₂ y 0,55–0,70 atm, donde el modelo más duda. Todo se presenta en un dashboard web interactivo en el que los modelos corren en vivo en el navegador.</p>
<h3 class="nonum">Abstract</h3>
<p class="en">Lunar surface habitats are expected to run at ≥30% O₂ and ≤10.2 psi. Skylab Phoenix cleans and unifies every NASA PSI combustion investigation ({n(S['records'])} records, {S['qc_fixes']} logged corrections), ranks the 24 investigations per crewed habitat, and trains interpretable, calibrated models with explicit uncertainty. A logistic model trained on {F['n']} ISS droplet fires (FLEX) reaches AUC {LR['auc']:.2f} on held-out test days. It shows that the chance a fire self-extinguishes drops from {round(100 * cab['p'])}% in cabin air to {round(100 * moon['p'])}% in lunar-base air, while only {cov['n_moon_envelope']} of {cov['n_ambient']:,} flight records lie near that atmosphere. An out-of-distribution guard withholds predictions where NASA has never flown a test, and active learning proposes the next experiment to fly.</p>
<div class="callout">
<b>Mensaje en una frase:</b> con más oxígeno, el fuego en microgravedad deja de apagarse solo, y NASA casi no tiene datos de vuelo en la atmósfera donde vivirán los astronautas en la Luna. Skylab Phoenix lo cuantifica, lo muestra y dice qué ensayar después.
</div>
</section>

<!-- =============================== ÍNDICE -->
<section class="page toc">
<h2 class="nonum">Contenido</h2>
<ol>
<li>Introducción</li><li>El reto y la pregunta de investigación</li><li>Marco conceptual: el fuego en microgravedad</li>
<li>Datos: fuente, alcance e inventario</li><li>Ingeniería de datos</li><li>Análisis exploratorio</li>
<li>Resumen, ranking y similitud de investigaciones</li><li>Machine learning</li><li>Próximo experimento: aprendizaje activo</li>
<li>Hallazgos de seguridad rankeados por evidencia</li><li>El dashboard Skylab Phoenix</li><li>Discusión y limitaciones</li>
<li>Impacto en la exploración y en la Tierra</li><li>Conclusiones</li><li>Trabajo futuro</li><li>Reproducibilidad</li>
</ol>
<p class="toc-extra">Referencias · Anexo A: diccionario de datos · Anexo B: fórmulas · Anexo C: registro de calidad completo</p>
<h3 class="nonum">Equipo</h3>
<table class="compact"><thead><tr><th>Integrante</th><th>Rol</th><th>Responsabilidades</th></tr></thead><tbody>
<tr><td><b>Juan Sebastián Zárate</b></td><td>Líder del equipo</td><td>Dirección científica (combustión), ingeniería de datos, modelado, validación y presentación</td></tr>
<tr><td><b>Javier Medina</b></td><td>Integrante</td><td>Investigación del reto y de sus fundamentos, guía conceptual del proyecto, revisión y apoyo en el desarrollo</td></tr>
</tbody></table>
</section>

<!-- =============================== 1 -->
<section class="page">
<h2>Introducción</h2>
<p class="lead">El fuego es uno de los riesgos más graves de los vuelos tripulados, y en microgravedad se comporta distinto que en la Tierra.</p>
<p>La historia del programa espacial lo recuerda: el incendio del Apolo 1 en una cabina llena de oxígeno puro (1967), la explosión de un tanque de oxígeno del Apolo 13 (1970) y el incendio de un generador de oxígeno en la estación Mir (1997). Durante Artemis II, una alarma de humo sonó a unas 80.000 millas de la Tierra. La estrategia de NASA tiene tres capas: <b>prevención</b> (controlar fuentes de ignición y escoger materiales según sus límites de inflamabilidad), <b>detección</b> y <b>supresión</b>.</p>
<p>En microgravedad no hay flotación: los gases calientes no suben, la llama de una vela se vuelve una esfera azul y el oxígeno llega solo por difusión o por la ventilación. Eso cambia los límites de inflamabilidad, la velocidad de propagación y la extinción. NASA lleva décadas midiéndolo en la ISS y en naves de carga, y publica los resultados en el repositorio <i>Physical Sciences Informatics</i> (PSI). El problema que plantea el reto es que el volumen de datos es difícil de encontrar, comparar e interpretar.</p>
<p>La urgencia es concreta. Para acortar el tiempo de prerrespiración antes de salir en traje, la base lunar y los rovers presurizados tendrán más oxígeno y menos presión que la atmósfera terrestre. Esa combinación vuelve los materiales <b>mucho más inflamables</b>, y es justo donde los datos de vuelo escasean. Skylab Phoenix se propone tres cosas:</p>
<ol>
<li>Convertir los datos dispersos de PSI en un conjunto limpio, unificado y trazable.</li>
<li>Extraer de él conocimiento cuantitativo con modelos validados y honestos sobre su incertidumbre.</li>
<li>Presentarlo en un dashboard que cualquier investigador o ingeniero pueda usar para tomar decisiones.</li>
</ol>
</section>

<!-- =============================== 2 -->
<section class="page">
<h2>El reto y la pregunta de investigación</h2>
<p class="lead">El reto pide un dashboard web impulsado por «súper inteligencia» que <b>resuma, rankee e interprete</b> las investigaciones de combustión de NASA. Skylab Phoenix responde cada objetivo oficial con un componente de datos.</p>
<p class="tcap"><b>Tabla {T()}.</b> Correspondencia entre los objetivos oficiales del reto y la solución.</p>
<table><thead><tr><th>Objetivo oficial</th><th>Componente de Skylab Phoenix</th><th>Sección</th></tr></thead><tbody>
<tr><td>Identificar las investigaciones más relevantes para los ambientes habitables (naves, estaciones, bases en la Luna y Marte, rovers presurizados)</td><td>Perfil automático de las 24 investigaciones y ranking transparente por hábitat</td><td class="num">7</td></tr>
<tr><td>Extraer datos que apoyen el modelado predictivo de la inflamabilidad</td><td>Pipeline bronze → silver → gold con esquema común; modelos validados que corren en el navegador</td><td class="num">5, 8</td></tr>
<tr><td>Destacar la investigación que orienta los controles de seguridad de próxima generación</td><td>Hallazgos rankeados por evidencia (prevención, detección, supresión) y recomendación del próximo experimento</td><td class="num">9, 10</td></tr>
<tr><td>Aplicaciones de los datos de PSI a la seguridad en la Tierra (opcional)</td><td>Beneficios en la Tierra que reporta PSI para cada investigación, incluidos en sus fichas</td><td class="num">13</td></tr>
</tbody></table>
<h3>Pregunta de investigación</h3>
<div class="callout q">¿Qué dicen los datos de vuelo de NASA sobre el comportamiento del fuego en la atmósfera prevista para la base lunar (≥ 30 % O₂, ≤ 10,2 psi), con qué certeza lo dicen y qué experimento falta para responder lo que hoy no se sabe?</div>
<p>La página del reto da varias pistas que usamos como guía. Los ensayos de μg con más oxígeno son los de ACME CFI-G (hasta 85 % de O₂ en el quemador). PSI no tiene todavía datos de gravedad parcial (vendrán de LUCI y FM2). Los resultados en microgravedad y en 1 g pueden servir de cotas para la gravedad intermedia. Y el experimento BRE de ACME estudió la inflamabilidad de materiales con gases que emulan sólidos.</p>
<h3>Usuarios objetivo</h3>
<p>Profesores, estudiantes de posgrado y pregrado, investigadores y, sobre todo, ingenieros aeroespaciales que diseñan hábitats y seleccionan materiales. El dashboard está en inglés porque el jurado es internacional. Este informe está en español para el equipo y los jurados locales.</p>
</section>

<!-- =============================== 3 -->
<section class="page">
<h2>Marco conceptual: el fuego en microgravedad</h2>
<p class="lead">Sin flotación, el fuego depende del transporte por difusión y por la ventilación. Por eso la gravedad, el flujo de aire, el oxígeno y la presión interactúan de formas que una prueba en la Tierra no captura.</p>
<h3>Conceptos clave</h3>
<ul class="defs">
<li><b>Límite de inflamabilidad.</b> La combinación mínima de condiciones (O₂, presión, flujo) en la que un material sostiene una llama. En microgravedad aparece un límite de flujo bajo: con poco flujo, la llama se apaga por falta de oxígeno y por pérdidas por radiación.</li>
<li><b>Autoextinción.</b> La llama se apaga sola antes de consumir el combustible. Es la variable objetivo de nuestro modelo principal: si el fuego no se apaga solo, hay que detectarlo y suprimirlo.</li>
<li><b>Flujo concurrente vs opuesto.</b> Si el aire va en la misma dirección que la propagación de la llama, la precalienta y la acelera. Si va en contra, la frena.</li>
<li><b>Llama normal vs inversa.</b> En una llama normal el combustible sale del quemador hacia el ambiente oxidante. En una inversa ocurre lo contrario: el O₂ sale del quemador hacia un ambiente con combustible.</li>
<li><b>Temperatura adiabática de llama (T<sub>ad</sub>).</b> La temperatura máxima teórica de la combustión sin pérdidas. Se usa como indicador de qué tan cerca está una llama de su límite.</li>
<li><b>Llamas frías.</b> Una combustión de baja temperatura, casi invisible, que se observa con combustibles como el butano. Es un riesgo distinto: un detector óptico puede no verla.</li>
<li><b>Diluyentes.</b> El CO₂ y el helio diluyen el oxígeno y cambian la transferencia de calor. FLEX los ensayó como supresores.</li>
</ul>
<h3>Atmósferas de los hábitats</h3>
<p class="tcap"><b>Tabla {T()}.</b> Atmósferas usadas como escenarios. Base lunar y traje: página oficial del reto.</p>
<table class="compact"><thead><tr><th>Hábitat</th><th class="num">O₂</th><th class="num">Presión</th><th>Fuente</th></tr></thead><tbody>
<tr><td>Cabina de nave (ISS, Gateway, Orion)</td><td class="num">21 %</td><td class="num">1,00 atm · 14,7 psi</td><td>Aire equivalente al nivel del mar</td></tr>
<tr><td>Preparación de EVA (ISS)</td><td class="num">26,5 %</td><td class="num">0,70 atm · 10,2 psi</td><td>Atmósfera de exploración; ensayada en ACME BRE</td></tr>
<tr><td><b>Base lunar y rover presurizado</b></td><td class="num"><b>≥ 30 %</b></td><td class="num"><b>≤ 0,69 atm · 10,2 psi</b></td><td>Página del reto Flame in Freefall</td></tr>
<tr><td>Traje espacial</td><td class="num">100 %</td><td class="num">0,29 atm · 4,3 psi</td><td>Página del reto Flame in Freefall</td></tr>
</tbody></table>
<p>Respecto al aire terrestre, la base lunar tendrá más de 40 % más oxígeno. Aunque la presión parcial de O₂ sea parecida, la fracción molar más alta acelera la combustión y reduce la capacidad del gas inerte para enfriar la llama.</p>
</section>

<!-- =============================== 4 -->
<section class="page">
<h2>Datos: fuente, alcance e inventario</h2>
<p class="lead">Usamos una sola fuente de datos, la que señala el reto: el repositorio PSI de NASA (licencia CC0). De sus 133 resultados para «combustion», 24 son de <i>Combustion Science</i>: 19 experimentos de vuelo y 5 investigaciones en tierra.</p>
<p>Las otras 109 investigaciones (materiales, fluidos, biofísica) solo mencionan la palabra y se descartan. Todo se obtiene sin login desde la API pública de PSI: metadatos (objetivo, hipótesis, enfoque, equipo, publicaciones, beneficio en la Tierra) y las tablas experimentales en CSV o Excel. Los videos y las imágenes crudas pesan cientos de GB y no los necesitamos. El resto de recursos del reto (Researcher's Guide, NASA Combustion Science, Apolo, Mir y los <i>spinoffs</i>) se usó como contexto, no para entrenar modelos.</p>
<p class="tcap"><b>Tabla {T()}.</b> Inventario de las 24 investigaciones, generado por el pipeline. «Registros» en las tablas diarias de ACME = llamas encendidas.</p>
{inv_table()}
<p class="note">Agrupación por hardware según la página del reto: rack de combustión CIR con ACME (gases) o MDCA (gotas), ducto con ventilador del Microgravity Science Glovebox (MSG) y módulo Saffire dentro de la nave Cygnus.</p>
</section>

<!-- =============================== 5 -->
<section class="page">
<h2>Ingeniería de datos</h2>
<p class="lead">Un pipeline por capas, reproducible con un solo comando, convierte 22 tablas heterogéneas en un esquema común con unidades SI. Cada corrección queda registrada con el valor original y la regla aplicada.</p>
<div class="arch">
  <div class="st s1"><span>BRONZE</span><b>API de NASA PSI</b><p>Catálogo, metadatos y tablas experimentales de las 24 investigaciones, sin login</p></div>
  <div class="arrow">→</div>
  <div class="st s2"><span>SILVER</span><b>Una tabla por experimento</b><p>Esquema común, unidades SI, etiquetas normalizadas, reglas de calidad, registro de correcciones</p></div>
  <div class="arrow">→</div>
  <div class="st s3"><span>GOLD</span><b>Tablas analíticas</b><p>{n(S['records'])} ensayos, 24 perfiles, similitud, ranking por hábitat, hallazgos</p></div>
  <div class="arrow">→</div>
  <div class="st s4"><span>MODELOS</span><b>ML validado</b><p>FLEX + bootstrap de 200 modelos, prueba CFI-G, detector fuera de datos, aprendizaje activo</p></div>
  <div class="arrow">→</div>
  <div class="st s5"><span>WEB</span><b>Dashboard</b><p>JSON exportado; los modelos corren en el navegador</p></div>
</div>
<p class="fcap"><b>Figura {Fn()}.</b> Arquitectura del pipeline de Skylab Phoenix. Comando: <code>python -m pipeline.run</code> (≈ 3 s).</p>
<h3>Capas</h3>
<ul>
<li><b>Bronze</b> (<code>scripts/fetch_psi*.py</code>): descarga el catálogo y los archivos livianos de cada investigación (≈ 55 MB).</li>
<li><b>Silver</b> (<code>pipeline/silver.py</code>): una función por experimento lleva cada tabla al esquema común (Anexo A). Convierte mmHg y bar a atm y porcentajes a fracciones molares, normaliza etiquetas («Extinction» → extinción, «SE»/«FT», yes/Yes/flash) y extrae el desenlace del texto del operador en BASS. También separa los barridos de flujo y marca con banderas el O₂ y la presión cuando no se reportan.</li>
<li><b>Gold</b> (<code>pipeline/gold.py</code>, <code>pipeline/investigations.py</code>): tabla unificada de ensayos, perfil de cada investigación, similitud, ranking por hábitat, hallazgos con puntaje de evidencia y exportación a la web.</li>
</ul>
<h3>Reglas de calidad</h3>
<p>El pipeline falla si encuentra identificadores duplicados, fracciones molares fuera de [0, 1] o presiones fuera de [0,1; 6] atm. Además aplica reglas de corrección: valores físicamente imposibles, fracciones molares que no suman 1, errores de autollenado de hojas de cálculo, filas duplicadas y porcentajes mal formateados. El registro completo está en el Anexo C.</p>
{fig('f02_calidad', f'Correcciones por tipo. {autofill} de las {S["qc_fixes"]} son errores de autollenado de Excel, como «40 % CH4» que se volvió CH5, CH6… CH14 fila tras fila en ACME CLD, o «N2» que se volvió N3, N4… en ACME s-Flame.', Fn())}
<p>Ejemplos de correcciones: una presión de 0 mmHg en FLEX (excluida de los modelos), «3400 %» y «2100 %» en ACME BRE (34 % y 21 %), 8 filas idénticas repetidas en CFI, un punto decimal faltante en Saffire-II («037 mm» → 0,37 mm) y 19 etiquetas «yes/no» en minúscula en CFI-G. Ninguna se corrigió en silencio: todas pueden auditarse.</p>
</section>

<!-- =============================== 6 -->
<section class="page">
<h2>Análisis exploratorio</h2>
<p class="lead">Los datos muestran tres patrones antes de cualquier modelo: casi no hay ensayos cerca de la atmósfera lunar, con más oxígeno el fuego deja de apagarse solo, y el CO₂ suprime a presión reducida.</p>
<h3>Cobertura: dónde ha volado NASA fuego</h3>
{fig('f01_cobertura', f'Cada registro de vuelo con O₂ y presión ambiente, frente a las atmósferas de los hábitats. Marcadores huecos: condiciones no reportadas (aire de cabina asumido) u O₂ del quemador (llamas inversas). De {n(cov["n_ambient"])} registros ({n(cov["n_measured"])} con condiciones medidas), solo {cov["n_moon_envelope"]} caen en la zona lunar, todos de {", ".join(cov["moon_envelope_experiments"])}. Ningún sólido supera 22,7 % de O₂.', Fn(), True)}
<h3>Con más oxígeno, la llama deja de apagarse sola</h3>
{fig('f03_flex_oxigeno', f'Desenlace de las {sum(b["n"] for b in bands)} gotas de FLEX por banda de O₂. Bajo 18 % de O₂, {bands[0]["extincion"]} de {bands[0]["n"]} se apagaron solas. Entre 30 y 34 %, solo {hi_band["extincion"]} de {hi_band["n"]}, y ninguna de las 17 a 0,70 atm, junto a la atmósfera lunar.', Fn())}
<h3>Supresión con CO₂</h3>
{fig('f04_supresion_co2', 'Tasa de autoextinción por nivel de CO₂, con intervalos de Wilson del 90 %. A 0,7 atm, la tasa sube de 50 % sin CO₂ a 100 % con más de 30 %. La caída en 1–20 % se explica porque esos ensayos usaron más O₂ (23–25 %): el efecto del CO₂ se confunde con el del oxígeno.', Fn())}
<h3>Gravedad: microgravedad vs 1 g en las mismas muestras</h3>
{fig('f05_saffire_gravedad', f'Saffire-II quemó las mismas muestras en órbita (Cygnus) y en tierra, a 20 cm/s y ≈ 22 % de O₂. En {worse_1g} de {len(G2)} muestras, 1 g quemó igual o más. La silicona casi no se propagó en órbita y se quemó entera en tierra.', Fn())}
<p>Este resultado matiza una hipótesis de BASS-II: que la prueba estándar de NASA en 1 g (NASA-STD-6001, Test 1) podría no ser conservadora en el espacio. A 20 cm/s, Saffire-II muestra que sí lo fue. La duda sigue abierta para <b>flujo bajo</b>, un régimen que Saffire-II no probó. En Saffire-I, la misma tela SIBAL de 94 × 40 cm ardió <b>{n(s1.get('concurrent', 0))} s con flujo concurrente y {n(s1.get('opposed', 0))} s con flujo opuesto</b>: la dirección de la ventilación define el peor caso.</p>
<h3>Llamas frías</h3>
<p>De {CG['ignition']['tests']} ensayos de ACME CFI-G, {CG['ignition']['ignited']} encendieron y <b>{CG['ignition']['cool_flames']} produjeron llamas frías confirmadas</b>. Todas con {', '.join(CG['cool_flame_conditions']['fuel'])}, cerca de {p(CG['cool_flame_conditions']['o2'][1])} de O₂ y {n(CG['cool_flame_conditions']['p_atm'][0], 1)} atm. Son raras, pero un detector óptico puede no verlas.</p>
</section>

<!-- =============================== 7 -->
<section class="page">
<h2>Resumen, ranking y similitud de investigaciones</h2>
<p class="lead">Cada investigación tiene una ficha generada desde sus datos y un puntaje de relevancia por hábitat. El puntaje es una fórmula visible, no una caja negra.</p>
<h3>Perfil automático</h3>
<p>Para cada tabla experimental, el pipeline clasifica cada columna como <b>variada</b> (con su rango), <b>fija</b> (con su valor) o <b>medida</b> (resultado). Así responde directamente la pregunta del reto: «¿en qué se diferenciaron y en qué se parecieron los ensayos de una misma investigación?». La ficha suma el objetivo, la hipótesis, el equipo, el hardware, las condiciones cubiertas, las publicaciones con DOI y el beneficio en la Tierra que reporta PSI.</p>
<h3>Ranking por hábitat</h3>
<div class="formula">Relevancia = 100 × ( 0,5 · cercanía + 0,2 · evidencia + 0,3 · relevancia directa )</div>
<ul>
<li><b>Cercanía:</b> 1 − e<sup>−n/8</sup>. Aquí n es el número efectivo de ensayos cerca de la atmósfera del hábitat, con un núcleo gaussiano de 3 puntos de O₂ y un 30 % de presión. Pesa la mitad si el O₂ es del quemador o si las condiciones se asumieron.</li>
<li><b>Evidencia:</b> log(1 + ensayos con desenlace) normalizado a 300.</li>
<li><b>Relevancia directa:</b> 1,0 si la página del reto la nombra como núcleo (BASS, BASS-II, Saffire, SAME, SAME-R, FLEX); 0,75 si la menciona (BRE, DAFT, CFI-G, E-FIELD); 0,5 para otros vuelos; 0,35 para tierra.</li>
</ul>
{fig('f06_ranking_habitat', 'Relevancia de las 24 investigaciones para cada hábitat. FLEX lidera para la base lunar por sus ensayos a 30–34 % de O₂ y 0,70 atm. BASS y BASS-II lideran para la cabina. Ninguna se acerca al traje espacial.', Fn(), True)}
<p class="tcap"><b>Tabla {T()}.</b> Las seis investigaciones más relevantes para la base lunar.</p>
{top_table('moon_base')}
<h3>Similitud entre investigaciones</h3>
<div class="formula">Similitud = 0,30 · Jaccard(palabras clave) + 0,25 · misma familia + 0,15 · mismo hardware + 0,15 · solapamiento del rango de O₂ + 0,15 · vinculadas en PSI</div>
{fig('f07_similitud', 'Matriz de similitud ordenada por agrupamiento jerárquico (enlace promedio). Se forman bloques claros: gotas (FLEX, FLEX-2, CFI), Saffire, BASS, humo (SAME, SAME-R, DAFT) y la familia ACME.', Fn(), True)}
</section>

<!-- =============================== 8 -->
<section class="page">
<h2>Machine learning</h2>
<p class="lead">Con cientos de ensayos y no millones, elegimos modelos pequeños, interpretables y calibrados. Los comparamos con baselines y los validamos sin dejar que ensayos del mismo día se filtren entre entrenamiento y prueba.</p>
<h3>8.1 Formulación del problema</h3>
<p>Variable objetivo: <b>¿la llama se apaga sola?</b> (FLEX: «Extinction» = 1; «Disruption» o «Completion» = 0). Tasa base: {p(F['base_rate'], 1)}. Se usaron {F['n']} de los 274 ensayos: se excluyeron 13, uno con presión inválida y doce sin diámetro inicial.</p>
<p class="tcap"><b>Tabla {T()}.</b> Variables de entrada (seis, con sentido físico).</p>
<table class="compact"><thead><tr><th>Variable</th><th>Por qué</th></tr></thead><tbody>
<tr><td>Fracción molar de O₂</td><td>Controla la velocidad de reacción y la temperatura de llama</td></tr>
<tr><td>ln(presión)</td><td>La presión cambia la difusión y la radiación del hollín</td></tr>
<tr><td>Fracción de CO₂ y de helio</td><td>Diluyentes supresores: capacidad calorífica (CO₂) y difusividad (He)</td></tr>
<tr><td>Diámetro inicial de gota</td><td>Las gotas grandes forman llamas grandes, con más pérdidas por radiación</td></tr>
<tr><td>Combustible (heptano / metanol)</td><td>El heptano forma más hollín y quema distinto que el metanol</td></tr>
</tbody></table>
<h3>8.2 Diseño de la validación</h3>
<ul>
<li><b>GroupKFold</b> de 5 particiones con <b>{F['validation']['scheme'].split('·')[1].strip().replace('test days', 'días de ensayo')}</b> como grupos: cada día completo queda en entrenamiento o en prueba, nunca en ambos.</li>
<li>Métricas fuera de muestra: AUC (capacidad de ordenar), Brier y log loss (calidad de las probabilidades) y exactitud.</li>
<li>Comparación con gradient boosting (con las mismas variables) y con dos baselines: solo oxígeno, y tasa base constante.</li>
<li>Incertidumbre: <b>200 modelos bootstrap</b> remuestreando días completos. Cada predicción reporta la media y el intervalo del 90 %.</li>
</ul>
<h3>8.3 Resultados</h3>
<p class="tcap"><b>Tabla {T()}.</b> Desempeño fuera de muestra (días completos excluidos). Fila resaltada: modelo desplegado.</p>
{metrics_table()}
{fig('f08_validacion', 'La regresión logística supera a gradient boosting en las tres métricas. Con pocos datos, el modelo más simple generaliza mejor, y por eso es el que se despliega.', Fn(), True)}
<div class="two">
{fig('f09_calibracion', 'Diagrama de calibración: cuando el modelo dice 70 %, ocurre cerca del 70 % de las veces.', Fn())}
{fig('f10_factores', 'Coeficientes estandarizados con intervalo bootstrap del 90 %. Gris: no concluyente.', Fn())}
</div>
<h3>8.4 Interpretación</h3>
{drivers_table()}
<p>El oxígeno domina: más O₂, menos autoextinción. Las gotas grandes y el helio favorecen que la llama se apague, lo que concuerda con la extinción por pérdidas de radiación de las llamas grandes en microgravedad. El heptano sostiene mejor la llama que el metanol. El efecto del CO₂ y el de la presión <b>no son concluyentes</b> una vez que se tiene en cuenta el O₂, y así lo reportamos.</p>
<h3>8.5 Mapas de probabilidad y predicción por hábitat</h3>
{fig('f11_mapa_probabilidad', 'P(el fuego sigue ardiendo) según el modelo, sin diluyente y con gota de 3 mm. Línea blanca: 50 % de autoextinción. Puntos: ensayos FLEX volados (blanco = se apagó; oscuro = siguió ardiendo). Cruces: cabina, EVA y base lunar.', Fn(), True)}
<p class="tcap"><b>Tabla {T()}.</b> Probabilidad de autoextinción por hábitat (gota de 3 mm, sin supresor), con intervalo del 90 %.</p>
{habitat_table()}
{fig('f12_habitats', f'De la cabina a la base lunar, la probabilidad de que una gota de metanol se apague sola cae de {p(cab["p"])} a {p(moon["p"])}. El traje espacial queda fuera de los datos.', Fn())}
<h3>8.6 Detector «fuera de los datos»</h3>
<p>Un modelo siempre devuelve un número, aunque la pregunta esté lejos de lo ensayado. Para evitarlo, calculamos la distancia media a los 5 ensayos más cercanos en el espacio estandarizado de entrada. El umbral es el percentil 95 de esa distancia entre los propios ensayos (<b>{n(F['ood_threshold'], 2)}</b>). Hasta 1× el umbral: dentro de los datos. Entre 1× y 2×: extrapolación (se muestra con advertencia). Más de 2×: <b>no se predice</b>. La base lunar está a {n(HC['moon_base']['fuels']['Methanol']['ood_distance'], 2)} (dentro de los datos). El traje espacial está a {n(HC['suit']['fuels']['Methanol']['ood_distance'], 1)}, unas diez veces el umbral, así que Skylab Phoenix no da un número y lo señala como brecha.</p>
<h3>8.7 Prueba de hipótesis: ¿temperatura de llama límite? (ACME CFI-G)</h3>
{fig('f13_temperatura_limite', f'P(autoextinción) frente a la temperatura adiabática, en los ensayos que encendieron (normales n = {nrm["n"]}, inversas n = {inv["n"]}). En llamas normales la relación existe (AUC {n(nrm["metrics"]["auc"], 2)}). En inversas no predice (AUC {n(inv["metrics"]["auc"], 2)}). Zona gris: más allá de la temperatura más alta ensayada.', Fn(), True)}
<p>En las llamas normales, la autoextinción se vuelve más probable cuando baja la temperatura de llama. El punto del 50 % (≈ {n(nrm['t50'])} K; IC 90 %: {n(nrm['t50_lo'])}–{n(nrm['t50_hi'])} K) queda <b>justo por encima de la llama más caliente ensayada ({n(nrm['tad_max'])} K)</b>, así que es una extrapolación. En las llamas inversas, una sola temperatura no explica la extinción. Conclusión: la temperatura de llama no es un criterio universal, y reportar este resultado negativo es parte de la honestidad científica del proyecto.</p>
</section>

<!-- =============================== 9 -->
<section class="page">
<h2>Próximo experimento: aprendizaje activo</h2>
<p class="lead">Si NASA pudiera volar un ensayo más, ¿cuál enseñaría más? Skylab Phoenix busca, cerca de la atmósfera lunar, las condiciones donde los 200 modelos bootstrap más discrepan.</p>
<div class="formula">Puntaje = ancho del IC 90 % × (0,35 + cercanía a la atmósfera lunar) × penalización si la distancia supera 2× el umbral de datos</div>
<p>La búsqueda recorre una rejilla de O₂ (21–40 %), presión (0,30–1,00 atm), CO₂ (0–30 %) y los dos combustibles. Para dar recomendaciones variadas, permite como máximo dos por combinación de combustible y CO₂.</p>
{fig('f14_incertidumbre', 'Incertidumbre del modelo (ancho del intervalo del 90 %) sin CO₂, con los ensayos volados y las 6 recomendaciones. Las recomendaciones añaden CO₂ (ver tabla).', Fn(), True)}
<p class="tcap"><b>Tabla {T()}.</b> Ensayos recomendados, ordenados por ganancia de información esperada.</p>
{picks_table()}
<p><b>Lectura:</b> el modelo duda sobre todo de <b>cuánto CO₂ hace falta para apagar un fuego a la presión reducida y el O₂ elevado de la base lunar</b>. Es justo la pregunta de supresión que un hábitat lunar debe resolver antes de elegir extintores. Como PSI no tiene datos de gravedad parcial, estas condiciones son también las primeras que convendría repetir en LUCI o FM2.</p>
</section>

<!-- =============================== 10 -->
<section class="page">
<h2>Hallazgos de seguridad rankeados por evidencia</h2>
<p class="lead">El pipeline genera {len(FIND)} hallazgos. Cada uno tiene un puntaje de evidencia y una implicación de diseño, y todos sus números se calculan desde las tablas de PSI.</p>
<div class="formula">Evidencia = 100 × ( 0,35 · volumen + 0,25 · calidad + 0,20 · concordancia + 0,20 · cercanía a la Luna )</div>
<p class="note">Volumen = log(1 + n)/log(301). Calidad = validación del modelo o tipo de medición. Concordancia = investigaciones que apuntan en la misma dirección (máx. 3). Cercanía = qué tan cerca de la atmósfera lunar está la evidencia.</p>
{fig('f15_hallazgos', 'Puntaje de evidencia de cada hallazgo, coloreado por capa de seguridad.', Fn())}
<p class="tcap"><b>Tabla {T()}.</b> Hallazgos con su implicación para el diseño de hábitats.</p>
{findings_table()}
</section>

<!-- =============================== 11 -->
<section class="page">
<h2>El dashboard Skylab Phoenix</h2>
<p class="lead">Un sitio web estático con diseño propio. Los modelos corren en el navegador, así que cada control es una predicción en vivo y no hace falta un servidor que pueda fallar durante la demo.</p>
<p>Secciones: inicio con indicadores y tarjetas por hábitat; cobertura; investigaciones (ranking, ficha y similitud); simulador de escenarios; evidencia; hallazgos; próximo experimento; y datos y validación. Funciona en escritorio y en móvil, y se publica tal cual en GitHub Pages, Vercel o Netlify.</p>
{shot('01_inicio', 'Inicio: titular, equipo, indicadores clave y probabilidad de autoextinción por hábitat. El traje espacial aparece como «fuera de los datos».', Fn())}
{shot('02_cobertura', 'Cobertura: todos los ensayos de vuelo frente a las atmósferas de los hábitats, con filtros por familia.', Fn())}
{shot('03_investigaciones', 'Investigaciones: ranking por hábitat y capa de seguridad, y ficha generada desde los datos (qué varió, qué se midió, desglose del puntaje).', Fn())}
{shot('04_simulador', 'Simulador: presets de hábitat y controles de O₂, presión, CO₂, helio, diámetro y combustible. Resultado con intervalo, estado «dentro o fuera de los datos» y mapa de probabilidad en vivo.', Fn())}
{shot('05_evidencia', 'Evidencia: desenlace según O₂, supresión con CO₂, temperatura límite y microgravedad frente a 1 g.', Fn())}
{shot('07_proximo', 'Próximo experimento: mapa de incertidumbre y ensayos recomendados.', Fn())}
{shot('08_validacion', 'Datos y validación: arquitectura, métricas frente a baselines, calibración y registro de calidad.', Fn())}
</section>

<!-- =============================== 12 -->
<section class="page">
<h2>Discusión y limitaciones</h2>
<p class="lead">Decir con claridad lo que los datos no permiten es parte del resultado.</p>
<ul>
<li><b>Gotas, no materiales de cabina.</b> El modelo principal se entrenó con gotas de metanol y heptano. La conclusión que se puede defender es que, en todas las familias de combustible que NASA ensayó en μg, la autoextinción desaparece con ≥ 30 % de O₂. No es una predicción directa para telas o polímeros.</li>
<li><b>Pocos datos cerca de la Luna.</b> {cov['n_moon_envelope']} registros en la zona lunar y ninguno de sólidos. Los intervalos lo reflejan y el detector fuera de datos lo vigila.</li>
<li><b>Efecto del CO₂ confundido con el O₂.</b> En FLEX, cada nivel de CO₂ se ensayó con un O₂ distinto. Por eso mostramos tasas empíricas y no extrapolamos una dosis de CO₂.</li>
<li><b>Desenlaces de BASS extraídos de texto.</b> Salen de expresiones regulares sobre las notas del operador. Son pistas que el experto en combustión debe revisar.</li>
<li><b>Sólidos concentrados en PMMA</b> (177 de 238 ensayos). Otros materiales tienen muy pocos datos.</li>
<li><b>Sin gravedad parcial.</b> PSI no tiene datos lunares ni marcianos. Saffire-II acota solo el régimen de 20 cm/s.</li>
<li><b>Condiciones asumidas.</b> En SPICE, SLICE, SAME, CLD y E-FIELD, el O₂ y la presión no se reportan por ensayo y se asumió aire de cabina. Están marcados y pesan menos en el ranking.</li>
<li><b>Temperatura límite extrapolada.</b> El punto del 50 % en CFI-G queda por encima de la temperatura máxima ensayada.</li>
</ul>
<h3>Lo que hicimos para mitigarlo</h3>
<p>Validación por días completos, comparación con baselines, intervalos bootstrap, diagrama de calibración, detector fuera de datos, registro público de correcciones y textos que distinguen lo medido de lo extrapolado.</p>
</section>

<!-- =============================== 13-16 -->
<section class="page">
<h2>Impacto en la exploración y en la Tierra</h2>
<ul>
<li><b>Diseño de hábitats lunares.</b> Cuantifica cuánto empeora el riesgo al pasar de la atmósfera de cabina a la lunar y qué falta medir antes de certificar materiales.</li>
<li><b>Planificación de experimentos.</b> La recomendación por aprendizaje activo prioriza ensayos para ISS, LUCI o FM2 donde más información aportan.</li>
<li><b>Detección y supresión.</b> Señala las llamas frías como riesgo para los detectores ópticos, el CO₂ y el helio como supresores con efectos medibles y la ventilación como variable de diseño.</li>
<li><b>Ingeniería de datos abierta.</b> El conjunto limpio y el registro de correcciones de PSI sirven a cualquier investigador.</li>
<li><b>En la Tierra.</b> Las mismas preguntas (atmósferas enriquecidas en oxígeno en hospitales, submarinos y minas; detección de humo que distinga polvo; trajes de bombero) se benefician de estos datos. Las fichas incluyen los beneficios terrestres que reporta PSI para cada investigación.</li>
</ul>
<h2>Conclusiones</h2>
<ol>
<li>Los datos de vuelo de NASA muestran que <b>con ≥ 30 % de O₂ el fuego deja de apagarse solo</b>: en FLEX, {hi_band['extincion']} de {hi_band['n']} gotas, y 0 de 17 a 0,70 atm.</li>
<li>Un modelo simple y calibrado (AUC {n(LR['auc'], 2)} fuera de muestra) estima que la autoextinción cae de {p(cab['p'])} en cabina a {p(moon['p'])} en la base lunar.</li>
<li>La <b>brecha de datos</b> es el hallazgo más importante para NASA: {cov['n_moon_envelope']} registros cerca de la atmósfera lunar, ninguno de sólidos, ninguno para el traje.</li>
<li>El siguiente ensayo de mayor valor es la <b>supresión con CO₂ a O₂ y presión lunares</b>.</li>
<li>Todo es reproducible, trazable y se presenta en un dashboard que dice cuándo no sabe.</li>
</ol>
<h2>Trabajo futuro</h2>
<ul>
<li>Envolvente de inflamabilidad de sólidos (PMMA, SIBAL) con un proceso gaussiano en el plano flujo–O₂, tras convertir los barridos de flujo de BASS en puntos revisados por el experto.</li>
<li>Caja de preguntas en lenguaje natural que responda citando ensayos y DOI, con verificación numérica contra las tablas gold.</li>
<li>Extracción de resultados de las publicaciones de PSI con un LLM y verificación cruzada con las tablas.</li>
<li>Incorporar datos de gravedad parcial (LUCI, FM2) cuando PSI los publique, y volver a entrenar.</li>
<li>Pruebas automáticas del pipeline e integración continua.</li>
</ul>
<h2>Reproducibilidad</h2>
<pre>python -m venv .venv &amp;&amp; .venv\\Scripts\\activate
pip install -r requirements.txt
python scripts/fetch_psi_catalog.py combustion
python scripts/fetch_psi.py data/psi PSI-10 PSI-20 … PSI-159
python -m pipeline.run          # silver → gold → modelos → web/data
python report/figures.py        # figuras del informe
python report/build_report.py   # este PDF
python scripts/serve.py         # dashboard en http://127.0.0.1:8765</pre>
<p class="tcap"><b>Tabla {T()}.</b> Estructura del repositorio.</p>
<table class="compact"><thead><tr><th>Ruta</th><th>Contenido</th></tr></thead><tbody>
<tr><td class="mono">scripts/</td><td>Descarga de PSI (bronze) y servidor local del dashboard</td></tr>
<tr><td class="mono">pipeline/</td><td>silver.py, investigations.py, models.py, gold.py, run.py</td></tr>
<tr><td class="mono">data/gold/</td><td>ensayos.csv, investigaciones.csv, qc_log.csv, findings.json</td></tr>
<tr><td class="mono">web/</td><td>Dashboard (index.html, styles.css, app.js, data/ember.json)</td></tr>
<tr><td class="mono">report/</td><td>Figuras, capturas y generador de este informe</td></tr>
</tbody></table>
</section>

<!-- =============================== REFERENCIAS + ANEXOS -->
<section class="page refs">
<h2 class="nonum">Referencias</h2>
<ol>
<li>NASA Space Apps Challenge 2026. <i>Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data</i>. spaceappschallenge.org/2026/challenges/flame-in-freefall</li>
<li>NASA Physical Sciences Informatics (PSI). Repositorio, búsqueda «combustion». psi.nasa.gov/physci/repo · licencia CC0</li>
<li>NASA Glenn Research Center. <i>Combustion Science</i>. nasa.gov/glenn</li>
<li>NASA. <i>A Researcher's Guide to International Space Station Combustion Science</i> (2015).</li>
<li>Urban, D. L., et al. «Flame spread: Effects of microgravity and scale». <i>Combustion and Flame</i> (2019). DOI 10.1016/j.combustflame.2018.10.012</li>
<li>Olson, S. L., Ferkul, P. V. «Microgravity flammability boundary for PMMA rods in axial stagnation flow». <i>Combustion and Flame</i> (2017). DOI 10.1016/j.combustflame.2017.03.001</li>
<li>Bhattacharjee, S., et al. «The critical flow velocity for radiative extinction in opposed-flow flame spread in a microgravity environment». <i>Combustion and Flame</i> (2016). DOI 10.1016/j.combustflame.2015.10.023</li>
<li>Bhattacharjee, S., et al. «Opposed-flow flame spread: A comparison of microgravity and normal gravity experiments». <i>Fire Safety Journal</i> (2016). DOI 10.1016/j.firesaf.2015.11.011</li>
<li>Nayagam, V., Dietrich, D. L., Hicks, M. C., Williams, F. A. «Methanol droplet combustion in oxygen-inert environments in microgravity» (FLEX, PSI-69).</li>
<li>NASA-STD-6001B. <i>Flammability, Offgassing, and Compatibility Requirements and Test Procedures</i> (Test 1, upward flame propagation).</li>
<li>Pedregosa, F., et al. «Scikit-learn: Machine Learning in Python». <i>JMLR</i> 12 (2011).</li>
<li>Wilson, E. B. «Probable inference, the law of succession, and statistical inference». <i>JASA</i> 22 (1927).</li>
</ol>
<p class="note">Los DOI de cada conjunto de datos de PSI y sus publicaciones aparecen en las fichas del dashboard.</p>

<h2 class="nonum">Anexo A. Diccionario de datos (tabla gold de ensayos)</h2>
<table class="compact"><thead><tr><th>Campo</th><th>Descripción</th></tr></thead><tbody>
{''.join(f"<tr><td class='mono'>{a}</td><td>{b}</td></tr>" for a, b in SCHEMA)}
</tbody></table>

<h2 class="nonum">Anexo B. Fórmulas</h2>
<div class="formula">Regresión logística: P(autoextinción) = 1 / (1 + e<sup>−(β₀ + Σ βᵢ zᵢ)</sup>), con zᵢ = (xᵢ − μᵢ)/σᵢ</div>
<div class="formula">Intervalo de Wilson (z = 1,645): ( p̂ + z²/2n ± z·√( p̂(1−p̂)/n + z²/4n² ) ) / (1 + z²/n)</div>
<div class="formula">Brier = (1/N) Σ (pᵢ − yᵢ)² · Log loss = −(1/N) Σ [ yᵢ ln pᵢ + (1−yᵢ) ln(1−pᵢ) ]</div>
<div class="formula">Distancia fuera de datos = media de las 5 menores distancias euclídeas a los ensayos, en variables estandarizadas</div>
<div class="formula">Cercanía a un hábitat: núcleo = exp( −½ [ ((x<sub>O₂</sub> − h<sub>O₂</sub>)/0,03)² + (ln(p/h<sub>p</sub>)/ln 1,3)² ] )</div>
</section>

<section class="page annex">
<h2 class="nonum">Anexo C. Registro de calidad completo ({len(D['qc'])} correcciones)</h2>
<p class="note">Generado por el pipeline (<code>data/gold/qc_log.csv</code>). Las reglas se muestran en inglés, tal como las registra el código.</p>
{qc_table()}
</section>

</body></html>
"""

out_html = REP / "informe.html"
out_html.write_text(doc, encoding="utf-8")
print("HTML ->", out_html)

browsers = [Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            Path(shutil.which("chromium") or "/nonexistent")]
exe = next((b for b in browsers if b.exists()), None)
if exe:
    pdf = REP / "Informe_Skylab_Phoenix.pdf"
    subprocess.run([str(exe), "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=15000",
                    f"--print-to-pdf={pdf}", out_html.as_uri()], check=False, capture_output=True, timeout=180)
    print("PDF  ->", pdf, pdf.exists() and f"{pdf.stat().st_size / 1e6:.1f} MB")
else:
    print("No Edge/Chrome found: open report/informe.html and print to PDF.")
