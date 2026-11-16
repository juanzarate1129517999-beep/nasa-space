import json

import numpy as np
import pandas as pd

from .common import HABITATS, PSI_TO_ATM, RAW, ROOT
from .models import flex_ood, flex_predict

MOON = ROOT / "web" / "assets" / "moon" / "moon.json"
GLOVEBOX_M3 = 0.25
LUNAR_G = 0.166
MODULES = [
    {
        "id": "habitat",
        "name": "Surface habitat",
        "hab": "moon_base",
        "volume_m3": 106,
        "volume_ref": "ISS Destiny laboratory pressurized volume (106 m³), used as a stand-in",
    },
    {
        "id": "airlock",
        "name": "Airlock and EVA prep",
        "hab": "eva_prep",
        "volume_m3": 34,
        "volume_ref": "ISS Quest airlock volume (34 m³), used as a stand-in",
    },
    {
        "id": "rover",
        "name": "Pressurized rover",
        "hab": "moon_base",
        "volume_m3": 9,
        "volume_ref": "Orion crew module habitable volume (9 m³), used as a stand-in",
    },
]
TAGS = ("measured", "derived", "model", "extrapolated", "assumed", "gap")


def fact(label, value, tag, source):
    assert tag in TAGS
    return {"label": label, "value": value, "tag": tag, "source": source}


def _saffire2_spread():
    d = pd.read_csv(RAW / "PSI-99" / "PSI-99_Experimental table_SAFFIRE-2.csv", encoding="latin-1")
    d.columns = [c.strip() for c in d.columns]
    d = d[d.iloc[:, 0].astype(str).str.match(r"^2-\d")].copy()
    d["Material"] = d["Material"].ffill()
    col = next(c for c in d.columns if c.endswith("-g Spread Length") and not c.startswith("1"))
    sib = d[d["Material"].str.contains("SIBAL", na=False)]
    v = pd.to_numeric(sib[col].astype(str).str.extract(r"(\d+\.?\d*)")[0], errors="coerce").dropna()
    return {"sibal_mm_s": [float(x) for x in v], "sibal_samples": sib.iloc[:, 0].tolist()}


def _co2_needed(F, fuel, x_o2, p_atm, d0):
    grid = np.round(np.arange(0, 0.61, 0.01), 2)
    rows = [[1.0 if fuel == "Heptane" else 0.0, x_o2, np.log(p_atm), c, 0.0, d0] for c in grid if x_o2 + c <= 0.95]
    mean, lo, hi = flex_predict(F, rows)
    dist = flex_ood(F, rows)
    thr = F["ood_threshold"]
    first = lambda mask: float(grid[int(np.argmax(mask))]) if mask.any() else None
    c50 = first(mean >= 0.5)
    c50_lo = first(lo >= 0.5)
    at = lambda c: None if c is None else ("within" if dist[int(round(c * 100))] <= thr else "extrapolating")
    return {
        "co2_for_half": c50,
        "co2_for_half_pessimistic": c50_lo,
        "status_half": at(c50),
        "status_pess": at(c50_lo),
        "curve": [
            [float(c), round(float(m), 3), round(float(lo_), 3), round(float(hi_), 3)]
            for c, m, lo_, hi_ in zip(grid, mean, lo, hi, strict=True)
        ],
    }


def build(P, ens=None):
    F, S = P["flex"], P["solids"]
    hab = {h["id"]: h for h in HABITATS}
    hc = {x["habitat"]: x for x in P["habitat_check"]}
    sflam = {x["habitat"]: x for x in S["habitats"]}
    sup = P["suppression"]["co2"]
    red = {r["co2"]: r for r in sup if r["pressure"].startswith("Reduced")}
    spread = _saffire2_spread()
    cab = hc["cabin"]["fuels"]["Methanol"]
    pick = P["next"]["picks"][0]
    moon = json.loads(MOON.read_text(encoding="utf-8")) if MOON.exists() else {}
    d0 = F["d0_median"]
    mods = []
    for m in MODULES:
        h = hab[m["hab"]]
        x, p = h["x_o2"], h["p_atm"]
        sf, hm = sflam[m["hab"]], hc[m["hab"]]["fuels"]
        dil = GLOVEBOX_M3 / m["volume_m3"]
        co_hi, co_lo = S["co_rods_high_o2_median_ppm"], S["co_rods_low_o2_median_ppm"]
        slab = next(b for b in S["by_family"] if b["family"] == "PMMA slab")
        sup_m = {f: _co2_needed(F, f, x, p, d0) for f in ("Methanol", "Heptane")}
        c30 = next(c for c in sup_m["Methanol"]["curve"] if abs(c[0] - 0.3) < 1e-9)
        co2c = next(d for d in F["drivers"] if d["feature"] == "x_co2")
        tests = {
            "materials": {
                "layer": "Prevention",
                "question": "Will a cabin material keep burning here?",
                "answer": (
                    f"Yes: every solid flown in orbit would keep burning in still air at {100 * x:.1f}% O2. "
                    + (
                        f"Only {S['literature']['elevated']['n']} published Saffire burns (outside PSI) reached this oxygen, all at one airflow; none mapped a limit."
                        if 100 * x <= S["literature"]["max_o2_pct"]
                        else "Nothing has been tested this rich."
                    )
                ),
                "status": "extrapolated",
                "facts": [
                    fact(
                        "PMMA rod, still air: lowest O2 that sustains a flame",
                        f"{S['zero_flow_o2_pct']}%",
                        "measured",
                        "NASA BASS-II flammability boundary (NASA/TM-20210011385, Eq. 6.1)",
                    ),
                    fact("Oxygen in this module", f"{100 * x:.1f}%", "assumed", h["source"]),
                    fact(
                        "Highest O2 any solid has burned at in NASA PSI's tables",
                        f"{S['max_o2_any_solid_pct']}%",
                        "measured",
                        "PSI BASS, BASS-II, Saffire tables",
                    ),
                    fact(
                        "Highest O2 any solid has burned at in orbit (published, outside PSI)",
                        f"{S['literature']['max_o2_pct']}% at {S['literature']['min_p_atm']:.2f} atm",
                        "measured",
                        "NASA Saffire VI on Cygnus: " + S["literature"]["citation"],
                    ),
                    fact(
                        "Airflow needed to blow a PMMA rod flame out here",
                        f"{sf['blowoff_flow_cm_s']:.0f} cm/s",
                        "extrapolated",
                        f"Boundary equation beyond the tested {S['tested_flow_cm_s'][1]:.0f} cm/s and {S['tested_o2_pct'][1]}% O2, 1 atm only",
                    ),
                    fact(
                        "Flame spread over cotton-fiberglass fabric in orbit (20 cm/s air)",
                        " and ".join(f"{v:g}" for v in spread["sibal_mm_s"]) + " mm/s",
                        "measured",
                        f"Saffire-II samples {', '.join(spread['sibal_samples'])} at about 22% O2 (PSI-99)",
                    ),
                ],
            },
            "liquids": {
                "layer": "Prevention",
                "question": "Does a spilled-fuel fire put itself out?",
                "answer": f"Rarely: a methanol droplet fire goes out on its own {100 * hm['Methanol']['p']:.0f}% of the time here, against {100 * cab['p']:.0f}% in cabin air.",
                "status": "model" if hm["Methanol"]["status"] == "within" else "extrapolated",
                "facts": [
                    fact(
                        "Methanol droplet: chance the flame goes out on its own",
                        f"{100 * hm['Methanol']['p']:.0f}% (90% range {100 * hm['Methanol']['lo']:.0f}–{100 * hm['Methanol']['hi']:.0f}%)",
                        "model" if hm["Methanol"]["status"] == "within" else "extrapolated",
                        f"FLEX model, 200 bootstrap fits, n = {F['n']} ISS fires",
                    ),
                    fact(
                        "Heptane droplet: chance the flame goes out on its own",
                        f"{100 * hm['Heptane']['p']:.0f}% (90% range {100 * hm['Heptane']['lo']:.0f}–{100 * hm['Heptane']['hi']:.0f}%)",
                        "model" if hm["Heptane"]["status"] == "within" else "extrapolated",
                        "FLEX model",
                    ),
                    fact(
                        "Same methanol fire in ISS cabin air",
                        f"{100 * cab['p']:.0f}%",
                        "model",
                        "FLEX model at 21% O2, 1 atm",
                    ),
                ],
            },
            "detection": {
                "layer": "Detection",
                "question": "How strong is the carbon-monoxide signal of a small fire?",
                "answer": (
                    f"Weak once mixed: one BASS-II-size burn adds about {co_hi * dil:.2f} ppm of CO to {m['volume_m3']} m³, so a CO sensor must sit near likely sources."
                    if m["volume_m3"] > 30
                    else f"Strong and fast: the same burn adds about {co_hi * dil:.2f} ppm of CO to the {m['volume_m3']} m³ cabin, {MODULES[0]['volume_m3'] / m['volume_m3']:.0f}× the habitat signal; easier to detect, but the crew breathes it sooner."
                ),
                "status": "derived",
                "facts": [
                    fact(
                        "CO added by one PMMA rod burn in the 250 L glovebox (≥20% O2)",
                        f"{co_hi:g} ppm (median of {S['n_rods_high']})",
                        "measured",
                        "BASS-II test matrices, PSI-25",
                    ),
                    fact(
                        "Same, near the oxygen limit (<17% O2)",
                        f"{co_lo:g} ppm (median of {S['n_rods_low']})",
                        "measured",
                        "BASS-II test matrices",
                    ),
                    fact(
                        "PMMA slab burns (median)",
                        f"{slab['co_median']:g} ppm (n = {slab['n']})",
                        "measured",
                        "BASS-II test matrices",
                    ),
                    fact("Module free volume", f"{m['volume_m3']} m³", "assumed", m["volume_ref"]),
                    fact(
                        "One rod burn, mixed into this module",
                        f"{co_hi * dil:.2f} ppm",
                        "derived",
                        f"{co_hi:g} ppm × 0.25 m³ / {m['volume_m3']} m³, well-mixed air",
                    ),
                    fact(
                        "One slab burn, mixed into this module",
                        f"{slab['co_median'] * dil:.2f} ppm",
                        "derived",
                        f"{slab['co_median']:g} ppm × 0.25 m³ / {m['volume_m3']} m³",
                    ),
                ],
            },
            "suppression": {
                "layer": "Suppression",
                "question": "How much CO2 makes a fire put itself out?",
                "answer": (
                    f"Unknown for this air: in FLEX, more than 30% CO2 put out {red['>30%']['k']} of {red['>30%']['n']} fires, but only at "
                    f"{100 * red['>30%']['o2_range'][0]:.0f}–{100 * red['>30%']['o2_range'][1]:.0f}% O2. At {100 * x:.1f}% O2 the model gives only "
                    f"{100 * c30[1]:.0f}% with 30% CO2 added."
                ),
                "status": "gap",
                "facts": [
                    fact(
                        "FLEX at 0.7 atm, no CO2: fires that went out on their own",
                        f"{red['0%']['k']} of {red['0%']['n']}",
                        "measured",
                        f"FLEX, O2 {100 * red['0%']['o2_range'][0]:.0f}–{100 * red['0%']['o2_range'][1]:.0f}%",
                    ),
                    fact(
                        "FLEX at 0.7 atm, 20–30% CO2",
                        f"{red['20–30%']['k']} of {red['20–30%']['n']}",
                        "measured",
                        f"FLEX, O2 {100 * red['20–30%']['o2_range'][0]:.0f}–{100 * red['20–30%']['o2_range'][1]:.0f}%",
                    ),
                    fact(
                        "FLEX at 0.7 atm, more than 30% CO2",
                        f"{red['>30%']['k']} of {red['>30%']['n']}",
                        "measured",
                        f"FLEX, O2 {100 * red['>30%']['o2_range'][0]:.0f}–{100 * red['>30%']['o2_range'][1]:.0f}%",
                    ),
                    fact(
                        "Methanol fire in this air with 30% CO2 added: chance it goes out",
                        f"{100 * c30[1]:.0f}% (90% range {100 * c30[2]:.0f}–{100 * c30[3]:.0f}%)",
                        "extrapolated",
                        "FLEX model; no FLEX test combined this much oxygen with CO2",
                    ),
                    fact(
                        "CO2 effect in the model (change in the chance a flame goes out per standard deviation of CO2, 90% interval)",
                        f"{100 * co2c['lo']:+.0f} to {100 * co2c['hi']:+.0f} points",
                        "model",
                        (
                            "Includes zero: the flights cannot yet separate the CO2 effect from the oxygen effect"
                            if co2c["lo"] < 0 < co2c["hi"]
                            else "CO2 helps, but every FLEX CO2 test ran at 25% O2 or less, so the effect at base oxygen is extrapolated"
                        ),
                    ),
                ],
                "curve": sup_m["Methanol"]["curve"],
            },
        }
        mods.append(
            {
                **{k: m[k] for k in ("id", "name", "volume_m3", "volume_ref")},
                "atmosphere": m["hab"],
                "x_o2": x,
                "p_atm": p,
                "psi": round(p / PSI_TO_ATM, 1),
                "tests": tests,
                "gravity": {
                    "g": LUNAR_G,
                    "tag": "gap",
                    "text": "No combustion test at lunar gravity is in NASA PSI yet; every answer above comes from microgravity or 1 g.",
                },
            }
        )
    report = {
        "measured_layers": sum(f["tag"] == "measured" for mm in mods for t in mm["tests"].values() for f in t["facts"]),
        "total_facts": sum(len(t["facts"]) for mm in mods for t in mm["tests"].values()),
        "flight_tests_needed": [
            {
                "what": "Flammability limits of habitat materials (fabric, PMMA, Nomex) at ≥30% O2 and ≤10.2 psi",
                "why": "NASA PSI's tables hold no solid "
                f"burned above {S['max_o2_any_solid_pct']}% O2 or at reduced pressure. Saffire V and VI (published, not in PSI) burned "
                f"{S['literature']['elevated']['n']} samples at {S['literature']['elevated']['o2_pct'][0]}–{S['literature']['elevated']['o2_pct'][1]}% O2, "
                "all at one airflow and with no limit mapped, so every materials limit for the base is still extrapolated.",
            },
            {
                "what": f"{pick['fuel']} droplet at {100 * pick['x_o2']:.0f}% O2, {pick['p_atm']:.2f} atm, {100 * pick['x_co2']:.0f}% CO2",
                "why": f"Where the 200 models disagree most near lunar-base air (90% range {100 * pick['interval'][0]:.0f}–{100 * pick['interval'][1]:.0f}%).",
            },
            {
                "what": "Any flame at lunar gravity (0.17 g)",
                "why": "PSI holds microgravity and 1 g data only; partial-gravity facilities (LUCI, FM2) have no data in PSI yet.",
            },
        ],
    }
    site = {}
    if moon:
        site = {
            "name": moon["site"]["name"],
            "lat": moon["base"]["lat"],
            "lon": moon["base"]["lon"],
            "z": moon["base"]["z"],
            "slope_deg": moon["base"]["slope_deg"],
            "dem": moon["source"]["dem"],
        }
        sun = np.array(moon["ephem"]["sun"])
        site["sun_above_plane_share"] = round(float((sun[:, 1] > 0).mean()), 3)
        site["sun_elev_range"] = [float(sun[:, 1].min()), float(sun[:, 1].max())]
    return {"site": site, "glovebox_m3": GLOVEBOX_M3, "modules": mods, "report": report, "sources": {"spread": spread}}
