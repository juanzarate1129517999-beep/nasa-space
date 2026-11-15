from pathlib import Path
import json
import re

import numpy as np
import pandas as pd

from .common import HABITATS, QC, RAW

REPORT = "NASA/TM-20210011385, BASS-II Summary Report (PSI-25)"
R0_CM = 0.318
EQ_PAGE = "p. 75, Eq. (6.1)"
G1_UPWARD_LIMIT = 15.4
G1_PAGE = "p. 76 and p. 89"
IGNITION_LIMIT = 14.5
IGNITION_PAGE = "p. 68"
MIN_O2_REPORTED = 13.5
MIN_A = (8.0, 12.0)
TESTED_FLOW = (0.0, 55.0)
TESTED_O2_RODS = (13.6, 22.2)


def boundary_o2(a):
    a = np.asarray(a, float)
    return 6 * np.exp(-0.5 * a) + 0.0167 * a + 13.4


def stretch_to_flow(a, r_cm=R0_CM):
    return np.asarray(a, float) * r_cm / 1.5


def _family(material):
    m = material.lower()
    if "rod" in m:
        return "PMMA rod"
    if "nomex" in m:
        return "Nomex fabric"
    if "sibal" in m or "cotton" in m:
        return "SIBAL fabric"
    if "candle" in m or "wax" in m:
        return "Candle"
    if "sphere" in m or "spherical" in m:
        return "PMMA sphere"
    if "film" in m or "micron" in m or re.search(r"0\.\d+ mm", m):
        return "PMMA thin film"
    if "pmma" in m or "slab" in m:
        return "PMMA slab"
    return "Other"


def bass2_gas():
    sheets = pd.read_excel(RAW / "PSI-25" / "PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx", sheet_name=None, header=0)
    rows = []
    for pi, df in sheets.items():
        df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in df.columns]
        col = {k: next(c for c in df.columns if c.lower().startswith(k)) for k in
               ("test no", "sample no", "material", "calibrated initial o2", "calibrated final o2",
                "initial co2", "final co2", "initial co (ppm)", "final co (ppm)", "air display")}
        df = df[df[col["material"]].notna()]
        for _, r in df.iterrows():
            num = lambda k: pd.to_numeric(r[col[k]], errors="coerce")
            o2f = num("calibrated final o2")
            note = ""
            if pd.notna(o2f) and o2f < 10:
                note = f"final O2 recorded as {o2f:g}% (physically implausible in the 250 L glovebox); not used"
                QC.add("PSI-25", f"BASS-II ({pi})", str(r[col["test no"]]).strip(), "calibrated final O2 % by vol", o2f, "NaN",
                       "Final O2 far below the initial value cannot happen in the 250 L glovebox; excluded")
                o2f = np.nan
            o2i = num("calibrated initial o2")
            test = str(r[col["test no"]]).strip()
            if pd.notna(o2f) and pd.notna(o2i) and o2f > o2i + 5:
                QC.add("PSI-25", f"BASS-II ({pi})", test, "calibrated final O2 % by vol", o2f, "NaN",
                       "Final O2 far above the initial value: a burn cannot add oxygen to the sealed glovebox; excluded")
                o2f = np.nan
            coi, cof = num("initial co (ppm)"), num("final co (ppm)")
            for k, v in (("initial co (ppm)", r[col["initial co (ppm)"]]), ("final co (ppm)", r[col["final co (ppm)"]])):
                if re.fullmatch(r"(?i)\s*(or|over|>\s*\d+)\s*", str(v)):
                    QC.add("PSI-25", f"BASS-II ({pi})", test, k, str(v).strip(), "NaN",
                           "CO above the sensor range (over-range text in a numeric field); value censored, CO produced not computed")
            if pd.notna(coi) and coi < 0:
                QC.add("PSI-25", f"BASS-II ({pi})", test, "Initial CO (ppm)", coi, 0,
                       "Negative concentration is impossible (sensor zero offset); set to 0")
                coi = 0.0
            if pd.notna(coi) and pd.notna(cof) and cof < coi:
                QC.add("PSI-25", f"BASS-II ({pi})", test, "Final CO (ppm)", cof, "NaN",
                       "CO fell during a burn in the sealed glovebox (final below initial); CO produced not computed")
                cof = np.nan
            rows.append({
                "pi": pi, "test": str(r[col["test no"]]).strip(), "sample": str(r[col["sample no"]]).strip(),
                "material": str(r[col["material"]]).strip(), "family": _family(str(r[col["material"]])),
                "o2_initial_pct": num("calibrated initial o2"), "o2_final_pct": o2f,
                "co2_initial_pct": num("initial co2"), "co2_final_pct": num("final co2"),
                "co_initial_ppm": coi, "co_final_ppm": cof,
                "air_display": str(r[col["air display"]]).strip(), "note": note,
            })
    d = pd.DataFrame(rows)
    d["co_produced_ppm"] = d["co_final_ppm"] - d["co_initial_ppm"]
    d["co2_produced_pct"] = d["co2_final_pct"] - d["co2_initial_pct"]
    d["o2_consumed_pct"] = d["o2_initial_pct"] - d["o2_final_pct"]
    return d


def habitat_flammability():
    out = []
    a_hi = lambda x: (x - 13.4) / 0.0167
    for h in HABITATS:
        x = 100 * h["x_o2"]
        if x >= 100:
            continue
        zero_flow = float(boundary_o2(0.0))
        blowoff_flow = float(stretch_to_flow(a_hi(x)))
        out.append({
            "habitat": h["id"], "name": h["name"], "o2_pct": x,
            "burns_in_still_air": bool(x > zero_flow),
            "blowoff_flow_cm_s": round(blowoff_flow, 1),
            "extrapolated": bool(x > TESTED_O2_RODS[1] or blowoff_flow > TESTED_FLOW[1]),
            "pressure_note": "boundary measured at 1 atm only",
        })
    return out


LITERATURE = Path(__file__).resolve().parents[1] / "data" / "literature" / "saffire_iv_vi.csv"
LIT_URL = "https://ntrs.nasa.gov/citations/20240002981"


def literature():
    """Saffire IV-VI burns on Cygnus, transcribed from NASA's paper (not in PSI's tables)."""
    lit = pd.read_csv(LITERATURE)
    lit["p_atm"] = (lit["p_kpa"] / 101.325).round(3)
    burned = lit[lit["ignited"] == 1]
    return {
        "rows": json.loads(lit.to_json(orient="records")),
        "citation": "Urban, Ruff, Ferkul et al., Preliminary Results from the Saffire VI Experiment, ICES-2024-365 (NTRS 20240002981)",
        "url": LIT_URL,
        "n_burned": int(len(burned)), "max_o2_pct": round(100 * float(burned["x_o2"].max()), 1),
        "min_p_atm": float(burned["p_atm"].min()),
        "elevated": {"n": int((burned["x_o2"] >= 0.25).sum()),
                     "o2_pct": [round(100 * float(burned.loc[burned["x_o2"] >= 0.25, "x_o2"].min()), 1),
                                round(100 * float(burned.loc[burned["x_o2"] >= 0.25, "x_o2"].max()), 1)],
                     "p_atm": [float(burned.loc[burned["x_o2"] >= 0.25, "p_atm"].min()),
                               float(burned.loc[burned["x_o2"] >= 0.25, "p_atm"].max())]},
    }


def build():
    gas = bass2_gas()
    a = np.exp(np.linspace(np.log(0.05), np.log(1500), 240))
    u = stretch_to_flow(a)
    o2 = boundary_o2(a)
    rods = gas[gas["family"] == "PMMA rod"]
    by_family = (gas.dropna(subset=["co_produced_ppm"]).groupby("family")
                 .agg(n=("test", "size"), co_median=("co_produced_ppm", "median"), o2_min=("o2_initial_pct", "min"),
                      o2_max=("o2_initial_pct", "max")).reset_index())
    low = rods[rods["o2_initial_pct"] < 17].dropna(subset=["co_produced_ppm"])
    high = rods[rods["o2_initial_pct"] >= 20].dropna(subset=["co_produced_ppm"])
    payload = {
        "source": REPORT,
        "boundary": {"flow_cm_s": np.round(u, 4).tolist(), "o2_pct": np.round(o2, 3).tolist(),
                     "tested": [bool(TESTED_FLOW[0] <= v <= TESTED_FLOW[1]) for v in u],
                     "equation": "X_O2(%) = 6 exp(-0.5 a) + 0.0167 a + 13.4, a = 1.5 U / r for the 0.318 cm base rod",
                     "page": EQ_PAGE, "rod_radius_cm": R0_CM},
        "min_o2_pct": MIN_O2_REPORTED, "min_flow_cm_s": [round(float(stretch_to_flow(v)), 2) for v in MIN_A],
        "g1_upward_limit_pct": G1_UPWARD_LIMIT, "g1_page": G1_PAGE,
        "ignition_limit_pct": IGNITION_LIMIT, "ignition_page": IGNITION_PAGE,
        "zero_flow_o2_pct": round(float(boundary_o2(0.0)), 1),
        "tested_flow_cm_s": list(TESTED_FLOW), "tested_o2_pct": list(TESTED_O2_RODS),
        "lowest_final_o2_rods_pct": float(rods["o2_final_pct"].min()),
        "n_tests": int(len(gas)), "n_with_gas": int(gas["co_produced_ppm"].notna().sum()),
        "co_rods_low_o2_median_ppm": float(low["co_produced_ppm"].median()) if len(low) else None,
        "co_rods_high_o2_median_ppm": float(high["co_produced_ppm"].median()) if len(high) else None,
        "n_rods_low": int(len(low)), "n_rods_high": int(len(high)),
        "by_family": by_family.round(2).to_dict(orient="records"),
        "points": gas[["pi", "test", "material", "family", "o2_initial_pct", "o2_final_pct", "co_produced_ppm",
                       "co2_produced_pct", "o2_consumed_pct", "note"]].round(3).to_dict(orient="records"),
        "habitats": habitat_flammability(),
    }
    payload["literature"] = literature()
    return gas, payload
