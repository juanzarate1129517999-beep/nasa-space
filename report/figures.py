"""Report figures for Skylab Phoenix, drawn straight from the pipeline export (web/data/ember.json).

Usage: python report/figures.py      ->  report/figures/*.svg      (Spanish report)
       python report/figures.py en   ->  report/figures_en/*.svg   (English report)
Every number in every figure comes from the gold data; nothing is typed by hand.
"""
import json
import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
EN = len(sys.argv) > 1 and sys.argv[1] == "en"
OUT = ROOT / "report" / ("figures_en" if EN else "figures")
OUT.mkdir(parents=True, exist_ok=True)


def L(es, en):
    """Pick the Spanish or English text for the current report."""
    return en if EN else es


def dec(s):
    """Decimal comma in Spanish, decimal point in English."""
    return s if EN else s.replace(".", ",")


def thou(s):
    """Thousands separator: '.' in Spanish, ',' in English."""
    return s if EN else s.replace(",", ".")

D = json.loads((ROOT / "web" / "data" / "ember.json").read_text(encoding="utf-8"))

# ---------------------------------------------------------------- style (validated palette)
INK, INK2, MUTED, GRID, LIGHT = "#0f172a", "#334155", "#64748b", "#e2e8f0", "#cbd5e1"
ORANGE, BLUE, VIOLET, TEAL = "#ea580c", "#0284c7", "#7c3aed", "#0d9488"
AMBER, ROSE = "#f59e0b", "#e11d48"
FAM = {"solido": (L("Materiales sólidos", "Solid materials"), ORANGE, "s"), "gota": (L("Gotas de combustible", "Fuel droplets"), BLUE, "o"),
       "gas": (L("Llamas de gas", "Gas flames"), VIOLET, "D"), "humo": (L("Humo y polvo", "Smoke & dust"), TEAL, "^"),
       "polvo": (L("Humo y polvo", "Smoke & dust"), TEAL, "^")}
HAB_ES = ({"cabin": "Spacecraft cabin", "eva_prep": "EVA prep", "moon_base": "Lunar base & rover",
           "exploration": "Exploration atmosphere", "suit": "Spacesuit"} if EN else
          {"cabin": "Cabina de nave", "eva_prep": "Preparación EVA", "moon_base": "Base lunar y rover",
           "exploration": "Atmósfera de exploración", "suit": "Traje espacial"})
FIRE = LinearSegmentedColormap.from_list("fire", ["#fff7ed", "#fdba74", "#f97316", "#c2410c", "#431407"])
COOL = LinearSegmentedColormap.from_list("cool", ["#f8fafc", "#c4b5fd", "#7c3aed", "#2e1065"])

plt.rcParams.update({
    "font.family": ["Segoe UI", "Calibri", "Carlito", "Arial", "Liberation Sans", "DejaVu Sans"], "font.size": 9.5, "svg.fonttype": "none",
    "axes.edgecolor": LIGHT, "axes.labelcolor": INK2, "axes.titlesize": 11, "axes.titleweight": "semibold",
    "axes.titlecolor": INK, "axes.titlelocation": "left", "axes.titlepad": 10, "axes.spines.top": False,
    "axes.spines.right": False, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.7,
    "xtick.color": MUTED, "ytick.color": MUTED, "xtick.major.size": 0, "ytick.major.size": 0,
    "legend.frameon": False, "legend.fontsize": 8.5, "figure.dpi": 110,
})


def save(fig, name):
    fig.savefig(OUT / f"{name}.svg", bbox_inches="tight", pad_inches=0.08, transparent=False, facecolor="white")
    plt.close(fig)
    print("  ", name)


def pct(v, d=0):
    return f"{100 * v:.{d}f}%"


# ---------------------------------------------------------------- 1 coverage
def coverage():
    fig, ax = plt.subplots(figsize=(7.2, 4.6))
    moon = next(h for h in D["habitats"] if h["id"] == "moon_base")
    ax.fill_between([30, 105], 0.2, moon["p_atm"], color=ORANGE, alpha=0.08, lw=0, zorder=0)
    ax.plot([30, 30, 105], [0.2, moon["p_atm"], moon["p_atm"]], color=ORANGE, lw=1, alpha=0.6, zorder=1)
    ax.text(52, 0.235, L("Zona de la base lunar (≥30 % O₂, ≤10,2 psi)", "Lunar-base envelope (≥30% O₂, ≤10.2 psi)"), color=ORANGE, fontsize=8.5, ha="center")
    seen = set()
    for g in D["coverage"]["groups"]:
        fam = "humo" if g["family"] == "polvo" else g["family"]
        name, col, mk = FAM[fam]
        hollow = g["assumed"] or g["burner_o2"]
        ax.scatter([100 * v for v in g["x_o2"]], g["p_atm"], s=16 if not hollow else 20, marker=mk,
                   facecolors="none" if hollow else col, edgecolors=col, linewidths=0.8, alpha=0.75,
                   label=name if fam not in seen else None, zorder=3)
        seen.add(fam)
    for h in D["habitats"]:
        ax.scatter(100 * h["x_o2"], h["p_atm"], marker="P", s=150, color=INK, zorder=5, edgecolors="white", linewidths=1.2)
    off = {"cabin": (-34, 22), "eva_prep": (-40, -26), "moon_base": (24, 18), "exploration": (52, -16), "suit": (-30, 20)}
    for h in D["habitats"]:
        ax.annotate(HAB_ES[h["id"]], (100 * h["x_o2"], h["p_atm"]), xytext=off[h["id"]], textcoords="offset points",
                    fontsize=8.5, color=INK, fontweight="semibold", ha="center",
                    bbox=dict(boxstyle="round,pad=0.25", fc="white", ec=LIGHT, lw=0.6),
                    arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.7))
    ax.set_xscale("log"), ax.set_yscale("log")
    ax.set_xlim(10.5, 108), ax.set_ylim(0.2, 5.6)
    xt = [12, 15, 20, 25, 30, 40, 60, 85, 100]
    ax.set_xticks(xt, [f"{v}%" for v in xt]), ax.minorticks_off()
    yt = [0.25, 0.5, 0.7, 1, 2, 3, 5]
    ax.set_yticks(yt, [f"{v:g}" for v in yt])
    ax.set_xlabel(L("Fracción molar de oxígeno (escala log)", "Oxygen mole fraction (log scale)"))
    ax.set_ylabel(L("Presión, atm (escala log)", "Pressure, atm (log scale)"))
    ax.set_title(thou(L(f"Solo {D['coverage']['n_moon_envelope']} de {D['coverage']['n_ambient']:,} registros de vuelo caen cerca de la atmósfera lunar",
                        f"Only {D['coverage']['n_moon_envelope']} of {D['coverage']['n_ambient']:,} flight records lie near lunar-base air")))
    ax.legend(loc="upper left", ncol=4, bbox_to_anchor=(0, -0.13), handletextpad=0.3, columnspacing=1.2)
    save(fig, "f01_cobertura")


# ---------------------------------------------------------------- 2 QC log
def qc():
    from collections import Counter
    labels = {
        "Spreadsheet auto-increment error": "Spreadsheet auto-fill (CH4 → CH5…)",
        "Mole fractions do not sum to 1": "Mole fractions ≠ 1",
        "Value formatted as percent of a percent": "Mis-formatted percent (3400%)",
        "Physically impossible pressure": "Impossible pressure (0 mmHg)",
        "Identical row repeated": "Duplicate rows",
        "Inconsistent capitalization": "Inconsistent capitalization",
        "Momentary 'flash' ignition": "'Flash' ignition labelled separately",
        "Flow ramped during test": "Flow ramped (no single value)",
        "Rows that are not a recognizable": "Rows that are not samples",
        "Missing decimal point": "Missing decimal point",
        "Composite sample": "Composite sample excluded",
    } if EN else {
        "Spreadsheet auto-increment error": "Autollenado de Excel (CH4 → CH5…)",
        "Mole fractions do not sum to 1": "Fracciones molares ≠ 1",
        "Value formatted as percent of a percent": "Porcentaje mal formateado (3400 %)",
        "Physically impossible pressure": "Presión imposible (0 mmHg)",
        "Identical row repeated": "Filas duplicadas",
        "Inconsistent capitalization": "Mayúsculas inconsistentes",
        "Momentary 'flash' ignition": "Ignición «flash» etiquetada aparte",
        "Flow ramped during test": "Flujo en rampa (sin punto único)",
        "Rows that are not a recognizable": "Filas que no son muestras",
        "Missing decimal point": "Punto decimal faltante",
        "Composite sample": "Muestra compuesta excluida",
    }
    c = Counter()
    for q in D["qc"]:
        key = next((v for k, v in labels.items() if q["regla"].startswith(k)), q["regla"])
        c[key] += 1
    items = sorted(c.items(), key=lambda kv: kv[1])
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    y = np.arange(len(items))
    ax.barh(y, [v for _, v in items], color=[ORANGE if v == max(c.values()) else LIGHT for _, v in items], height=0.62)
    for i, (_, v) in enumerate(items):
        ax.text(v + 0.4, i, str(v), va="center", fontsize=8.5, color=INK)
    ax.set_yticks(y, [k for k, _ in items]), ax.grid(axis="y", visible=False)
    ax.set_xlabel(L("Correcciones registradas", "Logged corrections"))
    ax.set_title(L(f"{len(D['qc'])} correcciones a las tablas de NASA; la mayoría son errores de autollenado",
                   f"{len(D['qc'])} corrections to NASA's tables; most are spreadsheet auto-fill errors"))
    save(fig, "f02_calidad")


# ---------------------------------------------------------------- 3 FLEX outcome bands
def bands():
    B = D["o2_bands"]
    fig, ax = plt.subplots(figsize=(7.2, 2.9))
    y = np.arange(len(B))
    left = np.zeros(len(B))
    for key, lab, col in (("extincion", L("Se apagó sola", "Self-extinguished"), BLUE), ("disrupcion", L("Gota se fragmentó", "Droplet disrupted"), AMBER),
                          ("completo", L("Ardió hasta el final", "Burned to completion"), ORANGE)):
        v = np.array([b[key] / b["n"] for b in B])
        ax.barh(y, v, left=left, color=col, height=0.6, label=lab, edgecolor="white", linewidth=1.2)
        for i, (vv, ll) in enumerate(zip(v, left)):
            if vv > 0.09:
                ax.text(ll + vv / 2, i, pct(vv), ha="center", va="center", fontsize=8, color="white", fontweight="semibold")
        left += v
    for i, b in enumerate(B):
        ax.text(1.02, i, f"n = {b['n']}", va="center", fontsize=8.5, color=MUTED)
    ax.set_yticks(y, [f"{b['band']} O₂".replace("<", "< ") for b in B]), ax.set_xlim(0, 1.13)
    ax.set_xticks([0, .25, .5, .75, 1], ["0%", "25%", "50%", "75%", "100%"]), ax.grid(axis="y", visible=False)
    ax.set_title(L("FLEX: con más oxígeno, la llama deja de apagarse sola", "FLEX: with more oxygen, flames stop putting themselves out"))
    ax.legend(loc="upper left", ncol=3, bbox_to_anchor=(0, -0.14))
    save(fig, "f03_flex_oxigeno")


# ---------------------------------------------------------------- 4 suppression
def suppression():
    S = D["suppression"]["co2"]
    cats = ["0%", "1–20%", "20–30%", ">30%"]
    fig, ax = plt.subplots(figsize=(7.2, 3.4))
    for name, lab, col, mk, off in (("Reduced pressure (0.7 atm)", L("Presión reducida (0,7 atm)", "Reduced pressure (0.7 atm)"), ORANGE, "o", -0.08),
                                    ("≈1 atm and above", L("≈1 atm o más", "≈1 atm and above"), BLUE, "D", 0.08)):
        rows = [next((r for r in S if r["pressure"] == name and r["co2"] == c), None) for c in cats]
        xs = [i + off for i, r in enumerate(rows) if r]
        rs = [r for r in rows if r]
        ax.errorbar(xs, [r["rate"] for r in rs], yerr=[[r["rate"] - r["ci"][0] for r in rs], [r["ci"][1] - r["rate"] for r in rs]],
                    fmt=mk + "-", color=col, ms=7, lw=1.4, capsize=0, elinewidth=1.2, label=lab, mec="white", mew=1)
        for x, r in zip(xs, rs):
            ax.text(x, r["ci"][0] - 0.035, f"n={r['n']}", fontsize=7.5, color=col, ha="center", va="top")
    ax.set_xticks(range(4), [f"{c} CO₂" for c in cats]), ax.set_ylim(-0.04, 1.08), ax.set_xlim(-0.4, 3.4)
    ax.set_yticks([0, .25, .5, .75, 1], ["0%", "25%", "50%", "75%", "100%"])
    ax.set_ylabel(L("Ensayos que se apagaron solos", "Tests that self-extinguished")), ax.grid(axis="x", visible=False)
    ax.set_title(L("Supresión con CO₂: a 0,7 atm, sobre 30 % de CO₂ todas las gotas se apagaron",
                   "CO₂ suppression: at 0.7 atm, every droplet above 30% CO₂ went out"))
    ax.legend(loc="upper left")
    save(fig, "f04_supresion_co2")


# ---------------------------------------------------------------- 5 Saffire μg vs 1g
def saffire():
    G = D["saffire2"]
    fig, ax = plt.subplots(figsize=(7.2, 3.3))
    if EN:
        lab = [f"{g['material']} · {g['muestra']} · {'concurrent' if g['direccion'].lower().startswith('conc') else 'opposed'}" for g in G]
    else:
        lab = [f"{g['material'].replace('SIBAL fabric', 'Tela SIBAL').replace('Silicone', 'Silicona')} · {g['muestra']} · "
               f"{'concurrente' if g['direccion'].lower().startswith('conc') else 'opuesto'}" for g in G]
    for i, g in enumerate(G):
        ax.plot([g["ug_estado"], g["g1_estado"]], [i - 0.12, i + 0.12], color=LIGHT, lw=2, zorder=1)
    ax.scatter([g["ug_estado"] for g in G], [i - 0.12 for i in range(len(G))], s=60, color=BLUE, zorder=3, label=L("Microgravedad (Cygnus)", "Microgravity (Cygnus)"), edgecolors="white")
    ax.scatter([g["g1_estado"] for g in G], [i + 0.12 for i in range(len(G))], s=55, marker="s", color=ORANGE, zorder=3, label=L("1 g (Tierra)", "1 g (ground)"), edgecolors="white")
    ax.set_yticks(range(len(G)), lab), ax.invert_yaxis()
    ax.set_xticks([0, 1, 2], [L("Sin propagación", "No spread"), L("Parcial", "Partial"), L("Toda la muestra", "Whole sample")]), ax.set_xlim(-0.4, 2.4)
    ax.grid(axis="y", visible=False)
    worse = sum(g["g1_estado"] >= g["ug_estado"] for g in G)
    ax.set_title(L(f"Saffire-II: en {worse} de {len(G)} muestras, 1 g quemó igual o más que microgravedad (20 cm/s)",
                   f"Saffire-II: in {worse} of {len(G)} samples, 1 g burned as much as or more than microgravity (20 cm/s)"))
    ax.legend(loc="upper left", ncol=2, bbox_to_anchor=(0, -0.1))
    save(fig, "f05_saffire_gravedad")


# ---------------------------------------------------------------- 6 ranking heatmap
def ranking():
    inv = sorted(D["investigations"], key=lambda r: -r["relevance"]["moon_base"]["score"])
    habs = [h["id"] for h in D["habitats"]]
    Z = np.array([[r["relevance"][h]["score"] for h in habs] for r in inv])
    fig, ax = plt.subplots(figsize=(7.2, 7.4))
    ax.imshow(Z, cmap=FIRE, vmin=0, vmax=100, aspect="auto")
    for i in range(Z.shape[0]):
        for j in range(Z.shape[1]):
            ax.text(j, i, f"{Z[i, j]:.0f}", ha="center", va="center", fontsize=8, color="white" if Z[i, j] > 55 else INK)
    ax.set_xticks(range(len(habs)), [HAB_ES[h].replace(" de ", "\nde ").replace("Exploration ", "Exploration\n").replace("Spacecraft ", "Spacecraft\n") for h in habs], fontsize=8), ax.xaxis.tick_top()
    ax.set_yticks(range(len(inv)), [f"{r['name']}  ({r['psi_id']})" for r in inv])
    ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_title(L("Relevancia (0–100) de cada investigación por hábitat, ordenada para la base lunar",
                   "Relevance (0–100) of each investigation per habitat, sorted for the lunar base"), pad=28)
    save(fig, "f06_ranking_habitat")


# ---------------------------------------------------------------- 7 similarity
def similarity():
    S = D["similarity"]
    M = np.array(S["matrix"])
    fig, ax = plt.subplots(figsize=(7.2, 6.6))
    im = ax.imshow(M, cmap=COOL, vmin=0, vmax=1)
    ax.set_xticks(range(len(S["names"])), S["names"], rotation=60, ha="right", fontsize=7.8)
    ax.set_yticks(range(len(S["names"])), S["names"], fontsize=7.8)
    ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)
    cb = fig.colorbar(im, ax=ax, shrink=0.6, pad=0.02)
    cb.outline.set_visible(False), cb.ax.tick_params(labelsize=8)
    ax.set_title(L("Las investigaciones se agrupan por hardware y familia de combustible", "Investigations cluster by hardware and fuel family"))
    save(fig, "f07_similitud")


# ---------------------------------------------------------------- 8 validation
def validation():
    V = D["flex"]["validation"]["models"]
    names = (["Logistic\n(deployed)", "Gradient\nboosting", "Oxygen\nonly", "Base\nrate"] if EN else
             ["Logística\n(desplegado)", "Gradient\nboosting", "Solo\noxígeno", "Tasa\nbase"])
    fig, axes = plt.subplots(1, 3, figsize=(7.6, 2.9))
    for ax, key, lab, _better in ((axes[0], "auc", L("AUC (más alto = mejor)", "AUC (higher = better)"), "hi"),
                                 (axes[1], "brier", L("Brier (más bajo = mejor)", "Brier (lower = better)"), "lo"),
                                 (axes[2], "log_loss", L("Log loss (más bajo = mejor)", "Log loss (lower = better)"), "lo")):
        vals = [m[key] for m in V]
        cols = [ORANGE if m["deployed"] else LIGHT for m in V]
        ax.bar(range(4), vals, color=cols, width=0.62)
        for i, v in enumerate(vals):
            ax.text(i, v + max(vals) * 0.02, dec(f"{v:.3f}"), ha="center", fontsize=7.8, color=INK)
        ax.set_xticks(range(4), names, fontsize=7.4), ax.set_title(lab, fontsize=9.5), ax.grid(axis="x", visible=False)
        ax.set_ylim(0, max(vals) * 1.18)
    fig.suptitle(L("Validación con días de ensayo excluidos: el modelo simple gana", "Validation with whole test days held out: the simple model wins"), x=0.01, ha="left", fontsize=11, fontweight="semibold", color=INK)
    fig.tight_layout()
    save(fig, "f08_validacion")


# ---------------------------------------------------------------- 9 calibration
def calibration():
    R = D["flex"]["validation"]["reliability"]
    fig, ax = plt.subplots(figsize=(4.4, 3.6))
    ax.plot([0, 1], [0, 1], color=LIGHT, lw=1.2, label=L("Calibración perfecta", "Perfect calibration"))
    ax.plot([r["pred"] for r in R], [r["obs"] for r in R], "-o", color=ORANGE, lw=1.8, ms=5, label=L("Modelo (fuera de muestra)", "Model (out of sample)"))
    for r in R:
        ax.scatter(r["pred"], r["obs"], s=12 + 2.2 * r["n"], color=ORANGE, alpha=0.18, lw=0)
        ax.text(r["pred"] + 0.03, r["obs"] - 0.05, f"n={r['n']}", fontsize=7.5, color=MUTED)
    ax.set_xlim(0, 1), ax.set_ylim(0, 1)
    ax.set_xticks([0, .5, 1], ["0%", "50%", "100%"]), ax.set_yticks([0, .5, 1], ["0%", "50%", "100%"])
    ax.set_xlabel(L("Probabilidad predicha", "Predicted probability")), ax.set_ylabel(L("Frecuencia observada", "Observed frequency"))
    ax.set_title(L("Las probabilidades están calibradas", "The probabilities are calibrated"))
    ax.legend(loc="upper left", fontsize=7.8)
    save(fig, "f09_calibracion")


# ---------------------------------------------------------------- 10 drivers
def drivers():
    lab = ({"x_o2": "Oxygen fraction", "d0_mm": "Initial droplet diameter", "heptane": "Fuel: heptane (vs methanol)",
            "x_he": "Helium diluent", "x_co2": "CO₂ diluent", "log_p": "Pressure (log)"} if EN else
           {"x_o2": "Fracción de oxígeno", "d0_mm": "Diámetro inicial de la gota", "heptane": "Combustible: heptano (vs metanol)",
            "x_he": "Helio como diluyente", "x_co2": "CO₂ como diluyente", "log_p": "Presión (log)"})
    Dr = list(reversed(D["flex"]["drivers"]))
    fig, ax = plt.subplots(figsize=(4.6, 3.6))
    y = np.arange(len(Dr))
    for i, d in enumerate(Dr):
        sig = d["lo"] > 0 or d["hi"] < 0
        col = (BLUE if d["coef"] > 0 else ORANGE) if sig else MUTED
        ax.plot([d["lo"], d["hi"]], [i, i], color=col, lw=2, alpha=0.5)
        ax.scatter(d["coef"], i, color=col, s=45, zorder=3, edgecolors="white")
    ax.axvline(0, color=MUTED, lw=0.9)
    ax.set_yticks(y, [lab[d["feature"]] for d in Dr]), ax.grid(axis="y", visible=False)
    ax.set_xlabel(L("← sigue ardiendo · efecto estandarizado · se apaga →", "← keeps burning · standardized effect · goes out →"), fontsize=8.5)
    ax.set_title(L("El oxígeno domina; el CO₂ y la presión no son concluyentes", "Oxygen dominates; CO₂ and pressure are inconclusive"))
    save(fig, "f10_factores")


# ---------------------------------------------------------------- 11 probability maps
def _prob(fuel_hep, o2, p, co2=0.0, he=0.0, d0=None):
    F = D["flex"]
    d0 = F["d0_median"] if d0 is None else d0
    x = np.array([fuel_hep, o2, math.log(p), co2, he, d0])
    xs = (x - np.array(F["mu"])) / np.array(F["sd"])
    c = np.array(F["coef"])
    return 1 / (1 + math.exp(-(c[0] + xs @ c[1:])))


def probmaps():
    o2 = np.linspace(0.10, 0.40, 121)
    p = np.exp(np.linspace(math.log(0.3), math.log(3.2), 100))
    fig, axes = plt.subplots(1, 2, figsize=(7.4, 3.4), sharey=True)
    tr = D["flex"]["train"]
    for ax, hep, name in ((axes[0], 0.0, L("Metanol", "Methanol")), (axes[1], 1.0, L("Heptano", "Heptane"))):
        Z = np.array([[_prob(hep, a, b) for a in o2] for b in p])
        im = ax.pcolormesh(o2 * 100, p, 1 - Z, cmap=FIRE, vmin=0, vmax=1, shading="auto")
        ax.contour(o2 * 100, p, Z, levels=[0.5], colors="white", linewidths=1.2)
        pts = [t for t in tr if (t["combustible"] == "Heptane") == bool(hep) and t["x_co2"] == 0 and t["x_he"] == 0]
        ax.scatter([100 * t["x_o2"] for t in pts], [t["p_atm"] for t in pts],
                   c=["white" if t["autoextincion"] else INK for t in pts], s=14, edgecolors=INK, linewidths=0.6, zorder=3)
        for h in D["habitats"][:3]:
            ax.scatter(100 * h["x_o2"], h["p_atm"], marker="P", s=110, color="white", edgecolors=INK, linewidths=1, zorder=4)
        ax.set_yscale("log"), ax.set_yticks([0.3, 0.5, 0.7, 1, 2, 3], [dec(v) for v in ("0.3", "0.5", "0.7", "1", "2", "3")]), ax.minorticks_off()
        ax.set_xticks([10, 20, 30, 40], ["10%", "20%", "30%", "40%"]), ax.grid(False)
        ax.set_title(name, fontsize=10), ax.set_xlabel(L("Oxígeno", "Oxygen"))
    axes[0].set_ylabel(L("Presión, atm", "Pressure, atm"))
    cb = fig.colorbar(im, ax=axes, shrink=0.85, pad=0.02)
    cb.set_label(L("P(el fuego sigue ardiendo)", "P(fire keeps burning)"), fontsize=8.5), cb.outline.set_visible(False)
    cb.set_ticks([0, .5, 1], labels=["0%", "50%", "100%"])
    fig.suptitle(L("Mapa del modelo: la línea blanca marca el 50 % de autoextinción", "Model map: the white line marks 50% self-extinction"), x=0.01, ha="left", fontsize=11, fontweight="semibold", color=INK, y=1.02)
    save(fig, "f11_mapa_probabilidad")


# ---------------------------------------------------------------- 12 habitat predictions
def habitats():
    H = [h for h in D["habitat_check"] if h["habitat"] != "suit"]
    fig, ax = plt.subplots(figsize=(7.2, 2.7))
    for fuel, col, off in (("Methanol", ORANGE, -0.13), ("Heptane", BLUE, 0.13)):
        for i, h in enumerate(H):
            r = h["fuels"][fuel]
            ax.plot([r["lo"], r["hi"]], [i + off, i + off], color=col, lw=2.2, alpha=0.45)
            ax.scatter(r["p"], i + off, color=col, s=52, zorder=3, edgecolors="white", label=(L("Metanol", "Methanol") if fuel == "Methanol" else L("Heptano", "Heptane")) if i == 0 else None)
            ax.text(r["hi"] + 0.015, i + off, pct(r["p"]), va="center", fontsize=8, color=INK)
    ax.set_yticks(range(len(H)), [HAB_ES[h["habitat"]] for h in H]), ax.invert_yaxis()
    ax.set_xlim(0, 1), ax.set_xticks([0, .25, .5, .75, 1], ["0%", "25%", "50%", "75%", "100%"]), ax.grid(axis="y", visible=False)
    ax.set_xlabel(L("Probabilidad de que la llama se apague sola (punto e intervalo del 90 %)",
                    "Chance the flame puts itself out (point and 90% interval)"))
    cab = next(h for h in H if h["habitat"] == "cabin")["fuels"]["Methanol"]["p"]
    moon = next(h for h in H if h["habitat"] == "moon_base")["fuels"]["Methanol"]["p"]
    ax.set_title(L(f"De la cabina a la base lunar, la autoextinción cae de {100 * cab:.0f} % a {100 * moon:.0f} %",
                   f"From cabin to lunar base, self-extinction falls from {100 * cab:.0f}% to {100 * moon:.0f}%"))
    ax.legend(loc="lower right")
    save(fig, "f12_habitats")


# ---------------------------------------------------------------- 13 CFI-G Tad
def tad():
    CG = D["cfig"]
    fig, ax = plt.subplots(figsize=(7.2, 3.3))
    for typ, lab, col in (("normal", L("Llamas normales", "Normal flames"), ORANGE), ("inverse", L("Llamas inversas", "Inverse flames"), VIOLET)):
        c = next(x for x in CG["curves"] if x["type"] == typ)
        ax.fill_between(c["tad"], c["lo"], c["hi"], color=col, alpha=0.13, lw=0)
        ax.plot(c["tad"], c["p"], color=col, lw=2, label=f"{lab} (AUC {dec(format(CG['by_type'][typ]['metrics']['auc'], '.2f'))})")
        pts = [p for p in CG["points"] if (p["experimento"] == "CFI-G normal") == (typ == "normal")]
        jit = np.linspace(-0.04, 0.04, len(pts))
        ax.scatter([p["tad_k"] for p in pts], [p["autoextincion"] + (j if p["autoextincion"] == 0 else -j) * (1 if typ == "normal" else -1) + (0.03 if p["autoextincion"] == 0 else -0.03) for p, j in zip(pts, jit)],
                   s=7, color=col, alpha=0.45, lw=0)
    n = CG["by_type"]["normal"]
    tmax = max(p["tad_k"] for p in CG["points"] if p["experimento"] == "CFI-G normal")
    ax.axvline(n["t50"], color=MUTED, lw=1, ls=(0, (3, 3)))
    ax.axvspan(tmax, 3100, color=GRID, alpha=0.5, lw=0)
    note = thou(L(f"50 % ≈ {n['t50']:,.0f} K (extrapolado)\nmáx. ensayado: {tmax:,.0f} K",
                  f"50% ≈ {n['t50']:,.0f} K (extrapolated)\nhottest tested: {tmax:,.0f} K"))
    ax.text(n["t50"] - 20, 0.14, note, ha="right", fontsize=8, color=INK2)
    ax.set_ylim(-0.08, 1.08), ax.set_yticks([0, .5, 1], ["0%", "50%", "100%"])
    ax.set_xlabel(L("Temperatura adiabática de llama, K", "Adiabatic flame temperature, K")), ax.set_ylabel(L("P(autoextinción)", "P(self-extinction)"))
    ax.set_title(L("Hipótesis de temperatura límite: se cumple en llamas normales, no en inversas",
                   "Limiting-temperature hypothesis: holds for normal flames, not for inverse flames"))
    ax.legend(loc="lower left")
    save(fig, "f13_temperatura_limite")


# ---------------------------------------------------------------- 14 uncertainty + picks
def uncertainty():
    N = D["next"]
    Z = np.array(N["map"]["spread"])
    fig, ax = plt.subplots(figsize=(7.2, 3.8))
    im = ax.pcolormesh(np.array(N["map"]["o2"]) * 100, N["map"]["p"], Z, cmap=COOL, shading="auto")
    tr = [t for t in D["flex"]["train"] if t["x_co2"] == 0 and t["x_he"] == 0]
    ax.scatter([100 * t["x_o2"] for t in tr], [t["p_atm"] for t in tr], s=9, color="white", edgecolors=INK, linewidths=0.5, zorder=3, label=L("Ensayos FLEX volados (sin diluyente)", "Flown FLEX tests (no diluent)"))
    for i, pk in enumerate(N["picks"]):
        ax.scatter(100 * pk["x_o2"], pk["p_atm"], s=150, color=ORANGE, edgecolors="white", linewidths=1.2, zorder=5)
        ax.text(100 * pk["x_o2"], pk["p_atm"], str(i + 1), ha="center", va="center", fontsize=7.5, color="white", fontweight="bold", zorder=6)
    offs = {"cabin": (-30, 22), "eva_prep": (-70, -30), "moon_base": (46, 22)}
    for h in D["habitats"][:3]:
        ax.scatter(100 * h["x_o2"], h["p_atm"], marker="P", s=90, color=INK, edgecolors="white", linewidths=1, zorder=4)
        ax.annotate(HAB_ES[h["id"]], (100 * h["x_o2"], h["p_atm"]), xytext=offs[h["id"]], textcoords="offset points", ha="center", fontsize=8,
                    color=INK, bbox=dict(boxstyle="round,pad=0.2", fc="white", ec=LIGHT, lw=0.5), arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.6))
    ax.set_yscale("log"), ax.set_yticks([0.3, 0.5, 0.7, 1, 2, 3], [dec(v) for v in ("0.3", "0.5", "0.7", "1", "2", "3")]), ax.minorticks_off()
    ax.set_xticks([15, 20, 25, 30, 35, 40], ["15%", "20%", "25%", "30%", "35%", "40%"]), ax.grid(False)
    ax.set_xlabel(L("Oxígeno", "Oxygen")), ax.set_ylabel(L("Presión, atm", "Pressure, atm"))
    cb = fig.colorbar(im, ax=ax, shrink=0.85, pad=0.02)
    cb.set_label(L("Ancho del intervalo del 90 %", "Width of the 90% interval"), fontsize=8.5), cb.outline.set_visible(False)
    ax.set_title(L("Dónde duda el modelo, y los 6 ensayos recomendados (en naranja)", "Where the model is unsure, and the 6 recommended tests (orange)"))
    ax.legend(loc="upper right", fontsize=7.8)
    save(fig, "f14_incertidumbre")


# ---------------------------------------------------------------- 15 findings scores
def findings():
    F = list(reversed(D["findings"]))
    es = {"Prevention": (L("Prevención", "Prevention"), ORANGE), "Detection": (L("Detección", "Detection"), TEAL),
          "Suppression": (L("Supresión", "Suppression"), BLUE)}
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    y = np.arange(len(F))
    ax.barh(y, [f["score"] for f in F], color=[es[f["layer"]][1] for f in F], height=0.6)
    for i, f in enumerate(F):
        ax.text(f["score"] + 1, i, f"{f['score']:.0f}", va="center", fontsize=8, color=INK)
    ax.set_yticks(y, [f"{L('H', 'F')}{len(F) - i}" for i in range(len(F))]), ax.set_xlim(0, 108), ax.grid(axis="y", visible=False)
    ax.set_xlabel(L("Puntaje de evidencia (0–100)", "Evidence score (0–100)"))
    from matplotlib.patches import Patch
    ax.legend(handles=[Patch(color=c, label=l) for l, c in es.values()], loc="lower right")
    ax.set_title(L("Hallazgos ordenados por fuerza de la evidencia", "Findings ranked by strength of evidence"))
    save(fig, "f15_hallazgos")


if __name__ == "__main__":
    print("Figures ->", OUT)
    for f in (coverage, qc, bands, suppression, saffire, ranking, similarity, validation, calibration, drivers,
              probmaps, habitats, tad, uncertainty, findings):
        f()
