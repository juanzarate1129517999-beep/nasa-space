"""Silver layer: one clean, unit-normalized table per PSI experiment.

Every table is mapped to the same schema (SCHEMA). Values that had to be fixed or
dropped are written to the QC log with the original value and the rule applied.
"""
import re
import sys

import numpy as np
import pandas as pd

from .common import BAR_TO_ATM, MMHG_PER_ATM, QC, RAW, ROOT

sys.path.insert(0, str(ROOT / "scripts"))
import build_tests_table as btt  # noqa: E402  (solid-fuel parsers written earlier)

SCHEMA = [
    "test_uid", "psi_id", "experimento", "familia", "combustible", "material_familia",
    "x_o2", "o2_ubicacion", "o2_supuesto", "p_atm", "p_supuesta", "x_co2", "x_he",
    "flujo_cm_s", "barrido_flujo", "direccion_flujo", "d0_mm", "gravedad",
    "ignicion", "autoextincion", "resultado", "llama_fria", "tad_k", "zst",
    "tasa_quemado", "tiempo_quemado_s", "n_eventos", "con_resultado", "fecha", "qc_flags",
]


def _csv(psi, name):
    df = pd.read_csv(RAW / psi / f"{psi}_Experimental table_{name}.csv", encoding="latin-1")
    df.columns = [str(c).replace("ï»¿", "").replace("﻿", "").strip() for c in df.columns]  # BOM + spaces
    return df


def _num(s):
    return pd.to_numeric(s, errors="coerce")


def _finish(df, psi, exp, familia):
    df = df.copy()
    df["psi_id"], df["experimento"], df["familia"] = psi, exp, familia
    for c in SCHEMA:
        if c not in df.columns:
            df[c] = np.nan
    # cast all-NaN (float) columns to object before filling with text/bool: pandas 4 will refuse the implicit upcast
    df["qc_flags"] = df["qc_flags"].astype(object).fillna("")
    df["n_eventos"] = df["n_eventos"].fillna(1)
    df["gravedad"] = df["gravedad"].astype(object).fillna("ug")
    df["o2_ubicacion"] = df["o2_ubicacion"].astype(object).fillna("ambiente")
    for c in ("o2_supuesto", "p_supuesta", "barrido_flujo", "con_resultado"):
        df[c] = df[c].astype(object).fillna(False).astype(bool)
    df["test_uid"] = psi + ":" + df["test_uid"].astype(str).str.strip()
    return df[SCHEMA]


# ---------------------------------------------------------------- droplets
def flex():
    psi, exp = "PSI-69", "FLEX"
    r = _csv(psi, "FLEX")
    r.columns = ["n", "ident", "fecha", "gmt", "fuel", "p_mmhg", "xo2", "xn2", "xco2", "xhe", "d0", "dext", "k", "tb", "end"]
    df = pd.DataFrame({
        "test_uid": r["n"], "combustible": r["fuel"].str.strip(), "x_o2": _num(r["xo2"]),
        "p_atm": _num(r["p_mmhg"]) / MMHG_PER_ATM, "x_co2": _num(r["xco2"]), "x_he": _num(r["xhe"]),
        "d0_mm": _num(r["d0"]), "tasa_quemado": _num(r["k"]), "tiempo_quemado_s": _num(r["tb"]),
        "resultado": r["end"].astype(str).str.strip().str.lower().map(
            {"extinction": "extincion", "disruption": "disrupcion", "completion": "completo"}),
        "fecha": pd.to_datetime(r["fecha"], format="%m/%d/%Y", errors="coerce").fillna(
            pd.to_datetime(r["fecha"], format="%m/%d/%y", errors="coerce")),  # source mixes 4- and 2-digit years
        "flujo_cm_s": 0.0, "ignicion": 1.0,
    })
    df["autoextincion"] = (df["resultado"] == "extincion").astype(float)
    df["con_resultado"] = df["resultado"].notna()
    bad_p = df["p_atm"] < 0.1
    for i in df.index[bad_p]:
        QC.add(psi, exp, r.loc[i, "n"], "Ambient pressure; mmHg", r.loc[i, "p_mmhg"], "NaN",
               "Physically impossible pressure (0 mmHg); excluded from models")
    df.loc[bad_p, "p_atm"] = np.nan
    df.loc[bad_p, "qc_flags"] = "presion_invalida"
    tot = r[["xo2", "xn2", "xco2", "xhe"]].apply(pd.to_numeric, errors="coerce").sum(axis=1)
    off = (tot - 1).abs() > 0.02
    for i in df.index[off]:
        QC.add(psi, exp, r.loc[i, "n"], "mole fractions", round(tot[i], 3), "flagged",
               "Mole fractions do not sum to 1 (±0.02)")
    df.loc[off, "qc_flags"] = (df.loc[off, "qc_flags"] + " fracciones_no_suman_1").str.strip()
    return _finish(df, psi, exp, "gota")


def cfi():
    psi, exp = "PSI-39", "CFI"
    r = _csv(psi, "CFI")
    r.columns = [c.strip() for c in r.columns]
    dup = r.duplicated()
    if dup.any():
        QC.add(psi, exp, ", ".join(r.loc[dup, "Flex Number"].astype(str)), "row", "exact duplicate", "dropped",
               "Identical row repeated in the source table")
        r = r[~dup]
    df = pd.DataFrame({
        "test_uid": r["Flex Number"], "combustible": r["Fuel"].astype(str).str.strip(),
        "x_o2": _num(r["Oxygen"]), "x_he": _num(r["Helium"]),
        "p_atm": _num(r["Pressure"].astype(str).str.extract(r"(\d+\.?\d*)")[0]),
        "fecha": pd.to_datetime(r["Test Date"], format="%d-%b-%y", errors="coerce"),
    })
    return _finish(df, psi, exp, "gota")


# ---------------------------------------------------------------- gas flames (ACME)
def _yesno(s, psi, exp, field):
    raw = s.astype(str).str.strip()
    norm = raw.str.lower().map({"yes": 1.0, "no": 0.0, "flash": 1.0})
    changed = raw[raw.isin(["yes", "no"])]
    if len(changed):
        QC.add(psi, exp, f"{len(changed)} rows", field, "yes/no (lowercase)", "Yes/No",
               "Inconsistent capitalization normalized")
    flash = raw.str.lower().eq("flash")
    if flash.any():
        QC.add(psi, exp, f"{int(flash.sum())} rows", field, "flash", "ignited=1, resultado=flash",
               "Momentary 'flash' ignition kept as ignition but labeled separately")
    return norm, flash


def cfig():
    psi = "PSI-159"
    n = _csv(psi, "CFI-G_Normal Flames")
    n.columns = [c.strip() for c in n.columns]
    ign, _ = _yesno(n["Hot ignition"], psi, "CFI-G normal", "Hot ignition")
    se = n["Self-ext or flow term"].astype(str).str.strip().map({"SE": 1.0, "FT": 0.0})
    normal = pd.DataFrame({
        "test_uid": "N-" + n["Test"].astype(str), "combustible": n["Fuel"].astype(str).str.strip(),
        "x_o2": _num(n["XO2 before test"]), "p_atm": _num(n["approx p (bar)"]) * BAR_TO_ATM,
        "tad_k": _num(n["Tad (K)"]), "zst": _num(n["Zst"]), "tasa_quemado": _num(n["mHC (mg/s)"]),
        "tiempo_quemado_s": _num(n["burn time (sec)"]), "ignicion": ign, "autoextincion": se,
        "llama_fria": n["Cool flame?"].astype(str).str.lower().str.startswith("yes").astype(float),
        "resultado": np.where(ign == 0, "no_ignicion", np.where(se == 1, "autoextincion",
                                                                 np.where(se == 0, "corte_de_flujo", None))),
    })
    normal["con_resultado"] = normal["ignicion"].notna()
    normal = _finish(normal, psi, "CFI-G normal", "gas")

    i = _csv(psi, "CFI-G_Inverse Flames")
    i.columns = [c.strip() for c in i.columns]
    i = i[i["Test"].notna()]
    ign, flash = _yesno(i["Hot ignition"], psi, "CFI-G inverse", "Hot ignition")
    se = i["Self -ext or flow term"].astype(str).str.strip().map({"SE": 1.0, "FT": 0.0})
    inv = pd.DataFrame({
        "test_uid": "I-" + i["Test"].astype(str), "combustible": i["Fuel"].astype(str).str.strip(),
        "x_o2": _num(i["XO2"]), "o2_ubicacion": "quemador", "p_atm": _num(i["approx p (bar)"]) * BAR_TO_ATM,
        "tad_k": _num(i["Tad (K)"]), "zst": _num(i["Zst"]), "tasa_quemado": _num(i["HC burnrate (mg/s)"]),
        "tiempo_quemado_s": _num(i["burn time (sec)"]), "ignicion": ign.values, "autoextincion": se.values,
        "llama_fria": 0.0,
    })
    inv["resultado"] = np.where(flash.values, "flash", np.where(inv["ignicion"] == 0, "no_ignicion",
                                np.where(inv["autoextincion"] == 1, "autoextincion",
                                         np.where(inv["autoextincion"] == 0, "corte_de_flujo", None))))
    inv["con_resultado"] = inv["ignicion"].notna()
    inv = _finish(inv, psi, "CFI-G inverse", "gas")
    return pd.concat([normal, inv], ignore_index=True)


def flame_design():
    psi = "PSI-10"
    out = []
    for name, o2col, loc, tag in (("Flame Design_Normal Flame", "XO2 (init)", "ambiente", "N"),
                                  ("Flame Design_Inverse Flame", "XO2", "quemador", "I")):
        r = _csv(psi, name)
        ramped = r.apply(lambda row: row.astype(str).str.upper().eq("RAMPED").any(), axis=1)
        if ramped.any():
            QC.add(psi, "Flame Design", f"{int(ramped.sum())} rows ({tag})", "multiple", "RAMPED", "NaN",
                   "Flow ramped during test: no single operating point, numeric fields set to NaN")
        fuel = r["Fuel"] if "Fuel" in r.columns else pd.Series("C2H4", index=r.index)
        df = pd.DataFrame({
            "test_uid": tag + "-" + r["Test"].astype(str), "combustible": fuel.astype(str),
            "x_o2": _num(r[o2col]), "o2_ubicacion": loc, "p_atm": _num(r["pmean (atm)"]),
            "tad_k": _num(r["Tad (K)"]), "zst": _num(r["mean Zst"]),
        })
        bad = df["x_o2"] > 1
        for k in df.index[bad]:
            QC.add(psi, "Flame Design", df.loc[k, "test_uid"], o2col, df.loc[k, "x_o2"], "NaN",
                   "Mole fraction > 1 is impossible")
        df.loc[bad, "x_o2"] = np.nan
        out.append(_finish(df, psi, "ACME Flame Design", "gas"))
    return pd.concat(out, ignore_index=True)


_AUTOFILL = [(re.compile(r"\bCH(?!4\b)\d+\b"), "CH4"), (re.compile(r"\bC2H(?!4\b)\d+\b"), "C2H4"),
             (re.compile(r"\bN(?!2\b)\d+\b"), "N2")]


def _fix_autofill(s, psi, exp, field):
    out = s.astype(str)
    for idx, val in out.items():
        new = val
        for pat, rep in _AUTOFILL:
            new = pat.sub(rep, new)
        if new != val:
            QC.add(psi, exp, idx, field, val, new, "Spreadsheet auto-increment error (e.g. CH4 -> CH5 -> CH6)")
            out[idx] = new
    return out


def acme_daily():
    """ACME CLD, E-FIELD, s-Flame and SLICE report flames per test day (no per-flame outcome)."""
    rows = []
    c = _csv("PSI-21", "CLD Flame")
    fuel = _fix_autofill(c["Fuel Bottle"], "PSI-21", "ACME CLD", "Fuel Bottle")
    rows.append(_finish(pd.DataFrame({
        "test_uid": c["Test Day"].astype(str) + "-" + c.index.astype(str), "combustible": fuel,
        "x_o2": 0.21, "o2_supuesto": True, "p_atm": 1.0, "p_supuesta": True,
        "n_eventos": _num(c["Flames ignited"])}), "PSI-21", "ACME CLD", "gas"))

    e = _csv("PSI-22", "ACME E-FIELD Flames")
    e = e[e["Fuel Bottle"].notna()]
    rows.append(_finish(pd.DataFrame({
        "test_uid": e["Test Day"].astype("Int64").astype(str) + "-" + e.index.astype(str),
        "combustible": e["Fuel Bottle"].astype(str), "x_o2": 0.21, "o2_supuesto": True, "p_atm": 1.0,
        "p_supuesta": True, "n_eventos": _num(e["Flames Ignited"])}), "PSI-22", "ACME E-FIELD", "gas"))

    s = _csv("PSI-23", "ACME s-Flame")
    atm = _fix_autofill(s["Atmosphere*"], "PSI-23", "ACME s-Flame", "Atmosphere*")
    fuel = _fix_autofill(s["Fuel Bottle"], "PSI-23", "ACME s-Flame", "Fuel Bottle")
    for idx in s.index:
        for o2 in re.findall(r"~?(\d+)%\s*O2", atm[idx]) or re.findall(r"~(\d+)%", atm[idx]):
            rows.append(_finish(pd.DataFrame([{
                "test_uid": f"{s.loc[idx, 'Test Day*']}-{o2}", "combustible": fuel[idx], "x_o2": int(o2) / 100,
                "p_atm": 1.0, "p_supuesta": True,
                "n_eventos": _num(pd.Series([s.loc[idx, "Flames Ignited*"]]))[0]}]), "PSI-23", "ACME s-Flame", "gas"))

    b = _csv("PSI-20", "ACME BRE")
    for idx, r in b.iterrows():
        raw = str(r["Oxygen Conc (percent)"])
        vals = [float(v) for v in re.findall(r"\d+\.?\d*", raw)]
        if "%" in raw and len(vals) == 1 and vals[0] > 100:
            QC.add("PSI-20", "ACME BRE", f"{r['Year']}-{r['Month']}-{r['Date']}", "Oxygen Conc (percent)", raw,
                   vals[0] / 100, "Value formatted as percent of a percent (3400% -> 34)")
            vals = [vals[0] / 100]
        for v in vals:
            rows.append(_finish(pd.DataFrame([{
                "test_uid": f"{r['Year']}-{r['Month']}-{r['Date']}-{v}", "combustible": r["Fuel Bottle"],
                "x_o2": v / 100, "p_atm": np.nan, "qc_flags": "presion_no_reportada",
                "n_eventos": np.nan}]), "PSI-20", "ACME BRE", "gas"))
    return pd.concat(rows, ignore_index=True)


# ---------------------------------------------------------------- MSG duct: SPICE / SLICE
def spice_slice():
    sp = _csv("PSI-107", "Spice")
    spice = _finish(pd.DataFrame({
        "test_uid": sp.index.astype(str), "combustible": sp["Fuel"].astype(str), "x_o2": 0.21, "o2_supuesto": True,
        "p_atm": 1.0, "p_supuesta": True, "flujo_cm_s": _num(sp["Air Rate (cm/s)"])}), "PSI-107", "SPICE", "gas")
    sl = _csv("PSI-106", "Slice")
    slice_ = _finish(pd.DataFrame({
        "test_uid": sl.index.astype(str), "combustible": sl["Fuel Type"].astype(str).str.slice(0, 40), "x_o2": 0.21,
        "o2_supuesto": True, "p_atm": 1.0, "p_supuesta": True}), "PSI-106", "SLICE", "gas")
    return pd.concat([spice, slice_], ignore_index=True)


# ---------------------------------------------------------------- smoke & dust
def smoke():
    r = _csv("PSI-101", "SAME-R")
    same_r = _finish(pd.DataFrame({
        "test_uid": r["SAME Test #"].astype(str) + "-" + r.index.astype(str), "combustible": r["Sample Type"].astype(str),
        "x_o2": 0.21, "o2_supuesto": True, "p_atm": 1.0, "p_supuesta": True,
        "flujo_cm_s": _num(r["Inlet velocity (cm/s)"])}), "PSI-101", "SAME-R", "humo")
    s = _csv("PSI-102", "SAME")
    s.columns = [c.strip() for c in s.columns]
    same = _finish(pd.DataFrame({
        "test_uid": s["Sample #"].astype(str), "combustible": s["Sample Material"].astype(str).str.strip(),
        "x_o2": 0.21, "o2_supuesto": True, "p_atm": 1.0, "p_supuesta": True, "flujo_cm_s": _num(s["Air Flow (cm/s)"]),
        "tasa_quemado": _num(s["Weight loss rate (mg/min)"])}), "PSI-102", "SAME", "humo")
    d = _csv("PSI-47", "DAFT")
    daft = _finish(pd.DataFrame({"test_uid": d["Session Name"], "combustible": "Arizona road dust (aerosol)",
                                 "p_atm": 1.0, "p_supuesta": True}), "PSI-47", "DAFT", "polvo")
    return pd.concat([same_r, same, daft], ignore_index=True)


# ---------------------------------------------------------------- solids: BASS / BASS-II / Saffire
def _first_flow(text):
    m = re.search(r"\d+\.?\d*", str(text))
    return float(m.group()) if m else np.nan


def solids():
    raw = str(RAW)
    parts = []
    for fn, psi in ((btt.bass, "PSI-26"), (btt.bass2, "PSI-25"), (btt.saffire, None)):
        d = fn(raw)
        parts.append(d)
    d = pd.concat(parts, ignore_index=True)
    for c in ("observaciones", "flujo_cm_s_texto", "ventilador_texto", "direccion_flujo"):
        d[c] = d[c].fillna("").astype(str).replace("nan", "")
    d["familia_material"] = d["material"].map(btt.family)
    text = d["observaciones"] + " " + d["flujo_cm_s_texto"] + " " + d["ventilador_texto"]
    d["pista"] = text.map(btt.hint)
    sweep = d["flujo_cm_s_texto"].str.contains(r"[,>]|down", regex=True) & ~d["experimento"].str.startswith("Saffire")
    out = pd.DataFrame({
        "test_uid": d["ensayo"].astype(str) + "-" + d.index.astype(str), "psi_id": d["psi_id"],
        "experimento": d["experimento"], "combustible": d["material"], "material_familia": d["familia_material"],
        "x_o2": d["o2_inicial_pct"] / 100, "p_atm": 1.0, "p_supuesta": True,
        "flujo_cm_s": d["flujo_cm_s_texto"].map(_first_flow), "barrido_flujo": sweep,
        "direccion_flujo": d["direccion_flujo"].str.strip().str.lower().replace("", np.nan),
        "resultado": d["pista"].replace("", np.nan), "qc_flags": "",
    })
    out["con_resultado"] = out["resultado"].notna()
    out.loc[out["resultado"].notna(), "qc_flags"] = "resultado_extraido_de_texto"
    nonsolid = d["familia_material"].isna()
    if nonsolid.any():
        QC.add("PSI-25/26", "BASS", f"{int(nonsolid.sum())} rows", "material", "unrecognized", "dropped",
               "Rows that are not a recognizable fuel sample (headers, calibrations)")
    res = []
    for (psi, exp), g in out[~nonsolid].groupby(["psi_id", "experimento"]):
        res.append(_finish(g.drop(columns=["psi_id", "experimento"]), psi, exp, "solido"))
    return pd.concat(res, ignore_index=True)


def saffire_gravity():
    """Saffire-II: the same samples burned in microgravity (Cygnus) and in 1 g on the ground."""
    r = _csv("PSI-99", "SAFFIRE-2")
    r = r[r.iloc[:, 0].astype(str).str.match(r"^2-\d")].copy()
    r.columns = [c.strip() for c in r.columns]
    r["Material"] = r["Material"].ffill()
    flat_len = 29.0  # cm, length of the flat silicone / SIBAL samples

    def state(v):
        v = str(v).lower()
        if "complete" in v or v.strip().startswith("29"):
            return 2  # burned the whole sample
        m = re.search(r"(\d+\.?\d*)", v.replace("~", ""))
        if m and float(m.group()) > 0:
            return 1  # partial
        return 0  # no propagation

    rows = []
    ug_col = [c for c in r.columns if c.endswith("-g Burn Length") and not c.startswith("1")][0]
    for _, x in r.iterrows():
        if "&" in str(x["Material"]):
            continue  # composite PMMA+Nomex sample: outcome is not a single material
        rows.append({
            "muestra": x.iloc[0], "material": x["Material"].replace("Cotton-Fiberglass (SIBAL)", "SIBAL fabric"),
            "espesor": str(x["Samle Thickness"]).replace("037", "0.37"), "flujo": x["Air Flow (cm/s)"],
            "direccion": x["Flow Direction"], "o2": x["Percent O2 (Note 1)"],
            "ug_texto": str(x[ug_col]).strip(), "g1_texto": str(x["1-g Burn Length"]).strip(),
            "ug_estado": state(x[ug_col]), "g1_estado": state(x["1-g Burn Length"]),
        })
    df = pd.DataFrame(rows)
    QC.add("PSI-99", "Saffire-II", "2-4..2-6", "Samle Thickness", "037 mm", "0.37 mm", "Missing decimal point")
    QC.add("PSI-99", "Saffire-II", "2-7", "Material", "PMMA & Nomex", "excluded from μg-vs-1g comparison",
           "Composite sample: PMMA burned fully, Nomex never ignited")
    df.attrs["flat_len_cm"] = flat_len
    return df


def saffire_one():
    r = _csv("PSI-98", "SAFFIRE-1")
    r = r[r["Sample Number"].astype(str).str.match(r"^S\d")]
    return pd.DataFrame({"muestra": r["Sample Number"], "direccion": r["Flow Direction"],
                         "tiempo_quemado_s": _num(r["Burn Time (s)"]), "flujo_cm_s": _num(r["Air Flow (cm/s)"]),
                         "material": r["Material"]})


def build():
    parts = [flex(), cfi(), cfig(), flame_design(), acme_daily(), spice_slice(), smoke(), solids()]
    ens = pd.concat(parts, ignore_index=True)
    ens["fecha"] = pd.to_datetime(ens["fecha"], errors="coerce")
    assert not ens["test_uid"].duplicated().any(), "duplicate test_uid after cleaning"
    assert ens["x_o2"].dropna().between(0, 1).all(), "O2 mole fraction outside [0, 1]"
    assert ens["p_atm"].dropna().between(0.1, 6).all(), "pressure outside [0.1, 6] atm"
    return ens, saffire_gravity(), saffire_one()
