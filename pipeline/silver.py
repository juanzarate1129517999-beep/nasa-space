import importlib
import re
import sys

import numpy as np
import pandas as pd

from .common import BAR_TO_ATM, MMHG_PER_ATM, QC, RAW, ROOT

sys.path.insert(0, str(ROOT / "scripts"))
btt = importlib.import_module("build_tests_table")

SCHEMA = [
    "test_uid", "psi_id", "experimento", "familia", "combustible", "material_familia",
    "x_o2", "o2_ubicacion", "o2_supuesto", "p_atm", "p_supuesta", "x_co2", "x_he",
    "flujo_cm_s", "barrido_flujo", "direccion_flujo", "d0_mm", "gravedad",
    "ignicion", "autoextincion", "resultado", "llama_fria", "tad_k", "zst",
    "tasa_quemado", "tiempo_quemado_s", "n_eventos", "con_resultado", "fecha", "qc_flags",
]


def _csv(psi, name):
    df = pd.read_csv(RAW / psi / f"{psi}_Experimental table_{name}.csv", encoding="latin-1")
    df.columns = [str(c).replace("ï»¿", "").replace("﻿", "").strip() for c in df.columns]
    return df


def _num(s):
    return pd.to_numeric(s, errors="coerce")


def _finish(df, psi, exp, familia):
    df = df.copy()
    df["psi_id"], df["experimento"], df["familia"] = psi, exp, familia
    for c in SCHEMA:
        if c not in df.columns:
            df[c] = np.nan
    df["qc_flags"] = df["qc_flags"].astype(object).fillna("")
    df["n_eventos"] = df["n_eventos"].fillna(1)
    df["gravedad"] = df["gravedad"].astype(object).fillna("ug")
    df["o2_ubicacion"] = df["o2_ubicacion"].astype(object).fillna("ambiente")
    for c in ("o2_supuesto", "p_supuesta", "barrido_flujo", "con_resultado"):
        df[c] = df[c].astype(object).fillna(False).astype(bool)
    df["test_uid"] = psi + ":" + df["test_uid"].astype(str).str.strip()
    return df[SCHEMA]


def flex():
    psi, exp = "PSI-69", "FLEX"
    r = _csv(psi, "FLEX")
    r.columns = ["n", "ident", "fecha", "gmt", "fuel", "p_mmhg", "xo2", "xn2", "xco2", "xhe", "d0", "dext", "k", "tb", "end"]
    for c, field in (("d0", "Droplet initial diameter; mm"), ("dext", "Visible flame extinction diameter; mm")):
        dash = r[c].astype(str).str.strip().isin(["\x96", "\u2013", "-"])
        if dash.any():
            QC.add(psi, exp, ", ".join(r.loc[dash, "n"].astype(str)), field, "\u2013 (byte 0x96)", "NaN",
                   f"Windows-1252 en dash used as an empty value in a numeric column ({int(dash.sum())} cells)")
    approx = r["tb"].astype(str).str.strip().str.startswith("~")
    for i in r.index[approx]:
        QC.add(psi, exp, r.loc[i, "n"], "Burn time; s", r.loc[i, "tb"], str(r.loc[i, "tb"]).strip()[1:],
               "Approximate value written with '~' in a numeric column; number kept and flagged")
    short_year = r["fecha"].astype(str).str.match(r"^\d+/\d+/\d\d$")
    if short_year.any():
        QC.add(psi, exp, f"{int(short_year.sum())} rows", "Test Date", "m/d/yy", "m/d/yyyy",
               "Two date formats mixed in one column; normalized")
    df = pd.DataFrame({
        "test_uid": r["n"], "combustible": r["fuel"].str.strip(), "x_o2": _num(r["xo2"]),
        "p_atm": _num(r["p_mmhg"]) / MMHG_PER_ATM, "x_co2": _num(r["xco2"]), "x_he": _num(r["xhe"]),
        "d0_mm": _num(r["d0"]), "tasa_quemado": _num(r["k"]), "tiempo_quemado_s": _num(r["tb"].astype(str).str.replace("~", "", regex=False)),
        "resultado": r["end"].astype(str).str.strip().str.lower().map(
            {"extinction": "extincion", "disruption": "disrupcion", "completion": "completo"}),
        "fecha": pd.to_datetime(r["fecha"], format="%m/%d/%Y", errors="coerce").fillna(
            pd.to_datetime(r["fecha"], format="%m/%d/%y", errors="coerce")),
        "flujo_cm_s": 0.0, "ignicion": 1.0,
    })
    df["autoextincion"] = (df["resultado"] == "extincion").astype(float)
    df["con_resultado"] = df["resultado"].notna()
    df.loc[approx, "qc_flags"] = "tiempo_aproximado"
    big = _num(r["dext"]) > _num(r["d0"])
    for i in r.index[big]:
        QC.add(psi, exp, r.loc[i, "n"], "Visible flame extinction diameter; mm", r.loc[i, "dext"], "flagged",
               f"Droplet diameter at extinction larger than the initial diameter ({r.loc[i, 'd0']} mm); flagged")
    df.loc[big, "qc_flags"] = (df.loc[big, "qc_flags"].fillna("") + " diametro_extincion_mayor").str.strip()
    key = r["ident"].astype(str).str.strip() + "|" + r["fecha"].astype(str) + "|" + r["gmt"].astype(str).str.strip()
    same = key.duplicated(keep=False)
    for k, g in r[same].groupby(key[same]):
        QC.add(psi, exp, ", ".join(g["n"].astype(str)), "FLEX Identifier + Test GMT", f"{g['ident'].iloc[0]} at {g['gmt'].iloc[0]}",
               "flagged", "Two records share identifier, date and GMT second, so they cannot be independent tests; both kept and flagged")
    df.loc[same, "qc_flags"] = (df.loc[same, "qc_flags"].fillna("") + " identificador_repetido").str.strip()
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
    for k in r.index[dup]:
        QC.add(psi, exp, r.loc[k, "Flex Number"], "row", "exact duplicate", "dropped",
               "Identical row repeated in the source table")
    r = r[~dup]
    for c in ("Pressure", "Fuel"):
        pad = r[c].astype(str).ne(r[c].astype(str).str.strip()) & r[c].notna()
        if pad.any():
            QC.add(psi, exp, f"{int(pad.sum())} rows", c, "trailing spaces", "stripped",
                   "Whitespace-padded labels split one category into two; normalized")
    tot = r[["Oxygen", "Nitrogen", "Helium"]].apply(pd.to_numeric, errors="coerce").sum(axis=1)
    for k in r.index[(tot - 1).abs() > 0.02]:
        QC.add(psi, exp, r.loc[k, "Flex Number"], "Oxygen + Nitrogen + Helium", round(tot[k], 3), "flagged",
               "Mole fractions do not sum to 1 (±0.02)")
    df = pd.DataFrame({
        "test_uid": r["Flex Number"], "combustible": r["Fuel"].astype(str).str.strip(),
        "x_o2": _num(r["Oxygen"]), "x_he": _num(r["Helium"]),
        "p_atm": _num(r["Pressure"].astype(str).str.extract(r"(\d+\.?\d*)")[0]),
        "fecha": pd.to_datetime(r["Test Date"], format="%d-%b-%y", errors="coerce"),
    })
    return _finish(df, psi, exp, "gota")


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
    ign = ign.copy()
    contra = ign.eq(0) & n["Self-ext or flow term"].astype(str).str.strip().isin(["SE", "FT"]) & _num(n["burn time (sec)"]).gt(0)
    for k in n.index[contra]:
        QC.add(psi, "CFI-G normal", n.loc[k, "Test"], "Hot ignition", n.loc[k, "Hot ignition"], "Yes",
               "Marked not ignited, yet the same row reports a burn time, a flow-termination outcome and 'hot flame'; set to ignited")
        ign[k] = 1.0
    for k in n.index[n.apply(lambda row: row.astype(str).str.contains("#DIV/0!", regex=False).any(), axis=1)]:
        QC.add(psi, "CFI-G normal", n.loc[k, "Test"], "Tad (K), Zst", "#DIV/0!", "NaN", "Spreadsheet error value exported as data")
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
    blank = i["Test"].isna()
    if blank.any():
        QC.add(psi, "CFI-G inverse", f"{int(blank.sum())} rows", "row", "empty", "dropped", "Empty rows exported below the table")
    i = i[i["Test"].notna()]
    for k in i.index[i.apply(lambda row: row.astype(str).str.contains("#VALUE!", regex=False).any(), axis=1)]:
        QC.add(psi, "CFI-G inverse", i.loc[k, "Test"], "Peak burner temp (K)", "#VALUE!", "NaN", "Spreadsheet error value exported as data")
    for c in ("Flame Type", "Color"):
        v = i[c].dropna().astype(str).str.strip()
        groups = v.groupby(v.str.lower()).agg(lambda x: sorted(set(x)))
        mixed = groups[groups.map(len) > 1]
        if len(mixed):
            QC.add(psi, "CFI-G inverse", f"{int(v.str.lower().isin(mixed.index).sum())} rows", c,
                   " / ".join("|".join(x) for x in mixed), "lowercase", "Inconsistent capitalization normalized")
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
        up = r.apply(lambda col: col.astype(str).str.strip().str.upper())
        ramped = up.isin(["RAMPED", "RAMP"]).any(axis=1)
        if ramped.any():
            QC.add(psi, "Flame Design", f"{int(ramped.sum())} rows ({tag})", "multiple", " / ".join(sorted(set(up[ramped].stack()) & {"RAMPED", "RAMP"})), "NaN",
                   "Flow ramped during test: no single operating point, numeric fields set to NaN")
        for k in r.index[up.eq("LOW O2").any(axis=1)]:
            QC.add(psi, "Flame Design", r.loc[k, "Test"], "XO2 and derived fields", "LOW O2", "NaN",
                   "Text note written into numeric fields; set to NaN")
        day = r["Test"].astype(str).str.extract(r"^(\d{5})")[0]
        mode = day.groupby(r["Day"]).agg(lambda x: x.mode().iloc[0] if len(x.mode()) else None)
        for k in r.index:
            m = mode.get(r.loc[k, "Day"])
            if m and isinstance(day[k], str) and day[k] != m and sorted(day[k]) == sorted(m):
                QC.add(psi, "Flame Design", r.loc[k, "Test"], "Test", r.loc[k, "Test"], r.loc[k, "Test"].replace(day[k], m, 1),
                       f"Test day code has transposed digits ({day[k]} vs {m} for every other test of experiment day {r.loc[k, 'Day']}); flagged")
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
    for _, r in b.iterrows():
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


def spice_slice():
    psi, exp = "PSI-107", "SPICE"
    sp = _csv(psi, "Spice")
    dup = sp.duplicated()
    for k in sp.index[dup]:
        QC.add(psi, exp, f"line {k + 2}", "row", "exact duplicate of an earlier row", "dropped", "Identical row repeated in the source table")
    sp = sp[~dup].copy()
    fuel = sp["Fuel"].astype(str).str.strip().str.replace(r"(\d+)\s*%", r"\1 %", regex=True)
    ch = fuel.ne(sp["Fuel"].astype(str).str.strip())
    if ch.any():
        QC.add(psi, exp, f"{int(ch.sum())} rows", "Fuel", "75% Propylene", "75 % Propylene", "Same fuel written two ways; normalized")
    ratio = _num(sp["Fuel Rate (mg/s)"]) / _num(sp["Fuel Rate (sccm)"])
    med = ratio.groupby(fuel).transform("median")
    off = (ratio / med - 1).abs() > 0.2
    for d, g in sp[off].groupby("GMT date"):
        QC.add(psi, exp, f"GMT day {d} ({len(g)} rows)", "Fuel Rate (mg/s)", f"{ratio[g.index].median() * 60:.2f} mg per cm³",
               "flagged", f"Mass flow implies a gas density {ratio[g.index].median() / med[g.index].median():.0%} of the other {fuel[g.index].iloc[0]} rows (close to methane); mass rates flagged")
    air = _num(sp["Air Rate (cm/s)"])
    for k in sp.index[air < 0]:
        new = 0.0 if air[k] > -1 else np.nan
        QC.add(psi, exp, f"line {k + 2}", "Air Rate (cm/s)", air[k], "0" if new == 0 else "NaN",
               "Negative air speed: zero offset of the sensor, set to 0" if new == 0 else "Negative air speed is impossible; set to NaN")
        air[k] = new
    los = sp["GMT ignition"].astype(str).str.strip().eq("LOS")
    if los.any():
        QC.add(psi, exp, f"{int(los.sum())} rows", "GMT ignition", "LOS", "NaN", "Loss-of-signal note written in a time column")
    t_on = pd.to_timedelta(sp["GMT ignition"].astype(str).str.strip(), errors="coerce")
    t_off = pd.to_timedelta(sp["GMT  Flame Off"].astype(str).str.strip(), errors="coerce")
    for k in sp.index[t_off < t_on]:
        QC.add(psi, exp, f"line {k + 2}", "GMT Flame Off", f"{sp.loc[k, 'GMT  Flame Off']} < ignition {sp.loc[k, 'GMT ignition']}", "flagged",
               "Flame-off time earlier than the ignition time (likely an hour typo); duration not used")
    spice = _finish(pd.DataFrame({
        "test_uid": sp.index.astype(str), "combustible": fuel, "x_o2": 0.21, "o2_supuesto": True,
        "p_atm": 1.0, "p_supuesta": True, "flujo_cm_s": air}), "PSI-107", "SPICE", "gas")
    sl = _csv("PSI-106", "Slice")
    pad = sl["Fuel Type"].astype(str).ne(sl["Fuel Type"].astype(str).str.strip())
    if pad.any():
        QC.add("PSI-106", "SLICE", f"{int(pad.sum())} rows", "Fuel Type", "leading space", "stripped",
               "Leading spaces made the same fuel appear as two fuels; normalized")
    slice_ = _finish(pd.DataFrame({
        "test_uid": sl.index.astype(str), "combustible": sl["Fuel Type"].astype(str).str.strip().str.slice(0, 40), "x_o2": 0.21,
        "o2_supuesto": True, "p_atm": 1.0, "p_supuesta": True}), "PSI-106", "SLICE", "gas")
    return pd.concat([spice, slice_], ignore_index=True)


def smoke():
    r = _csv("PSI-101", "SAME-R")
    v = r["Description"].dropna().astype(str).str.strip()
    groups = v.groupby(v.str.lower()).agg(lambda x: sorted(set(x)))
    mixed = groups[groups.map(len) > 1]
    if len(mixed):
        QC.add("PSI-101", "SAME-R", f"{int(v.str.lower().isin(mixed.index).sum())} rows", "Description",
               " / ".join("|".join(x) for x in mixed), "one spelling", "Inconsistent capitalization normalized")
    na = r["Net aging time (sec)"].astype(str).str.strip().str.lower().eq("n/a")
    if na.any():
        QC.add("PSI-101", "SAME-R", f"{int(na.sum())} rows", "Net aging time (sec)", "n/a", "NaN", "Text placeholder in a numeric column")
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


def _first_flow(text):
    m = re.search(r"\d+\.?\d*", str(text))
    return float(m.group()) if m else np.nan


def solids():
    raw = str(RAW)
    d = pd.concat([fn(raw) for fn in (btt.bass, btt.bass2, btt.saffire)], ignore_index=True)
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
    r = _csv("PSI-99", "SAFFIRE-2")
    r = r[r.iloc[:, 0].astype(str).str.match(r"^2-\d")].copy()
    r.columns = [c.strip() for c in r.columns]
    r["Material"] = r["Material"].ffill()
    flat_len = 29.0

    def state(v):
        v = str(v).lower()
        if "complete" in v or v.strip().startswith("29"):
            return 2
        m = re.search(r"(\d+\.?\d*)", v.replace("~", ""))
        if m and float(m.group()) > 0:
            return 1
        return 0

    rows = []
    ug_col = [c for c in r.columns if c.endswith("-g Burn Length") and not c.startswith("1")][0]
    for _, x in r.iterrows():
        if "&" in str(x["Material"]):
            continue
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


def table_checks():
    b = _csv("PSI-26", "BASS")
    b = b[b["Fuel Sample Material"].notna()]
    d = pd.to_datetime(b["Date"], format="%m/%d/%Y", errors="coerce")
    g = _num(b["GMT"])
    for k in b.index[(d.dt.dayofyear != g) & d.notna() & g.notna()]:
        QC.add("PSI-26", "BASS", f"as-run {b.loc[k, 'As Run Test #']:g} (test {b.loc[k, 'Test #']})", "Date vs GMT day",
               f"{b.loc[k, 'Date']} is day {d[k].dayofyear}, GMT column says {g[k]:g}", "flagged",
               "Calendar date and GMT day-of-year disagree")
    ar = _num(b["As Run Test #"])
    for v, grp in b[ar.duplicated(keep=False) & ar.notna()].groupby(ar):
        if grp["Date"].nunique() > 1:
            QC.add("PSI-26", "BASS", f"as-run {v:g}", "As Run Test #", " and ".join(f"test {t} on {dt}" for t, dt in zip(grp["Test #"], grp["Date"])),
                   "flagged", "One as-run number used for two different tests on different days")
    mat = b["Fuel Sample Material"].astype(str).str.strip()
    shape = mat.str.lower().str.contains("sphere")
    for (t, smp), grp in b.groupby([b["Test #"].astype(str), b["Sample #"]]):
        if len(grp) > 1 and shape[grp.index].nunique() > 1:
            QC.add("PSI-26", "BASS", f"test {t}, sample {smp:g}", "Fuel Sample Material", " vs ".join(mat[grp.index]), "flagged",
                   "Same test and sample number described as a sphere in one row and a flat sample in another")
    groups = mat.groupby(mat.str.lower().str.replace(r"\s+", " ", regex=True)).agg(lambda x: sorted(set(x)))
    mixed = groups[groups.map(len) > 1]
    if len(mixed):
        QC.add("PSI-26", "BASS", f"{int(mat.str.lower().str.replace(r'\\s+', ' ', regex=True).isin(mixed.index).sum())} rows", "Fuel Sample Material",
               " / ".join("|".join(x) for x in mixed), "one spelling", "Same material written with different capitalization or spacing")
    for wrong, right in (("parrafin", "paraffin"), ("oppsed", "opposed")):
        hit = mat.str.lower().str.contains(wrong)
        if hit.any():
            QC.add("PSI-26", "BASS", f"{int(hit.sum())} rows", "Fuel Sample Material", wrong, right, "Spelling error in a material label")


    s1 = _csv("PSI-98", "SAFFIRE-1")
    s1 = s1[s1.iloc[:, 0].astype(str).str.match(r"^S\d")]
    for k in s1.index:
        smp = str(s1.loc[k, s1.columns[0]]).strip()
        QC.add("PSI-98", "Saffire-I", smp, "Sample Thickness (cm)", f"{s1.loc[k, 'Sample Thickness (cm)']} cm", "0.37 mm",
               "Unit error: SIBAL fabric is 0.37 mm thick (Saffire-II lists the same fabric as 0.37 mm); 0.37 cm would be ten times thicker")
        if _num(pd.Series([s1.loc[k, "Sample Length (cm)"]]))[0] < _num(pd.Series([s1.loc[k, "Sample Width (cm)"]]))[0]:
            QC.add("PSI-98", "Saffire-I", smp, "Sample Length / Width (cm)", f"{s1.loc[k, 'Sample Length (cm)']} / {s1.loc[k, 'Sample Width (cm)']}",
                   f"{s1.loc[k, 'Sample Width (cm)']} / {s1.loc[k, 'Sample Length (cm)']}", "Length and width swapped: the Saffire sample is 94 cm long and 40.6 cm wide (as in the Saffire-III table)")
    s3 = _csv("PSI-100", "SAFFIRE-3")
    for k in s3.index:
        v = str(s3.loc[k, "Sample Thickness"]).strip()
        if v.endswith("cm"):
            QC.add("PSI-100", "Saffire-III", str(s3.loc[k, s3.columns[0]]).strip(), "Sample Thickness", v, ("0" + v if v.startswith(".") else v).replace("cm", "mm"),
                   "Unit error: a SIBAL fabric sample a third of a centimeter thick is ten times the fabric's thickness; read as mm")
    s2 = _csv("PSI-99", "SAFFIRE-2")
    s2 = s2[s2.iloc[:, 0].astype(str).str.match(r"^2-\d")]
    for k in s2.index:
        smp, c1, c2 = str(s2.loc[k, s2.columns[0]]).strip(), str(s2.loc[k, "Camera 1"]).strip(), str(s2.loc[k, "Camera 2"]).strip()
        n = smp.split("-")[1]
        if c2 not in ("nan", f"S{n}C2"):
            QC.add("PSI-99", "Saffire-II", smp, "Camera 2", c2, f"S{n}C2", "Camera file name does not match the sample (pattern S<n>C2)")
    blank = s2["Material"].isna()
    if blank.any():
        QC.add("PSI-99", "Saffire-II", ", ".join(s2.loc[blank, s2.columns[0]].astype(str)), "Material", "blank (merged cell)", "filled from the row above",
               "Merged spreadsheet cell exported as an empty value")
    raw_head = (RAW / "PSI-99" / "PSI-99_Experimental table_SAFFIRE-2.csv").read_bytes().split(b"\n")[0].decode("latin-1")
    if "?-g" in raw_head:
        QC.add("PSI-99", "Saffire-II", "header", "?-g Burn Length, ?-g Spread Length", "?-g", "μ-g", "Character lost in export: the Greek letter μ (micro-gravity) became '?'")
    if "Samle" in raw_head:
        QC.add("PSI-99", "Saffire-II", "header", "Samle Thickness", "Samle", "Sample", "Spelling error in a column name")

    b2 = _csv("PSI-25", "BASS-II")
    b2 = b2[b2["Test #"].notna()]
    d2 = pd.to_datetime(b2["Date"], format="%m/%d/%Y", errors="coerce")
    g2 = _num(b2["GMT"])
    vids = {"O10": 203}
    for k in b2.index[(d2.dt.dayofyear != g2) & d2.notna() & g2.notna()]:
        t = str(b2.loc[k, "Test #"]).strip()
        doy = d2[k].dayofyear
        ok = vids.get(t) == doy
        QC.add("PSI-25", "BASS-II", t, "GMT", f"{g2[k]:g}", f"{doy}" if ok else "flagged",
               f"GMT day disagrees with the date {b2.loc[k, 'Date']} (day {doy})" + (f"; NASA's raw video for this test is 'BASS_GMT{doy}_SAMPLE_210_TEST_{t}', so the GMT column is the typo (also in the test matrix)" if ok else ""))
    m2 = b2["Fuel Sample Material"].astype(str)
    fixes = [(r'^(?:\d/\d)"(?:\S)', "missing space after the inch mark"), (r'^(?:\d/\d) (?:clear|black)', "missing inch mark"), (r"\s+$", "trailing space")]
    for pat, why in fixes:
        hit = m2.str.contains(pat, regex=True)
        if hit.any():
            QC.add("PSI-25", "BASS-II", ", ".join(b2.loc[hit, "Test #"].astype(str).str.strip()), "Fuel Sample Material",
                   " | ".join(sorted(set(m2[hit].str.strip()))), "normalized", f"Material label written inconsistently ({why})")
    both = m2.str.contains(r"mm thick", regex=True) & m2.str.contains(r"cm thick", regex=True)
    for k in b2.index[both]:
        QC.add("PSI-25", "BASS-II", str(b2.loc[k, "Test #"]).strip(), "Fuel Sample Material", m2[k].strip(), "flagged",
               "Two thicknesses in one label ('mm thick' and 'cm thick'); the second is probably the width")


def build():
    parts = [flex(), cfi(), cfig(), flame_design(), acme_daily(), spice_slice(), smoke(), solids()]
    ens = pd.concat(parts, ignore_index=True)
    ens["fecha"] = pd.to_datetime(ens["fecha"], errors="coerce")
    assert not ens["test_uid"].duplicated().any(), "duplicate test_uid after cleaning"
    assert ens["x_o2"].dropna().between(0, 1).all(), "O2 mole fraction outside [0, 1]"
    assert ens["p_atm"].dropna().between(0.1, 6).all(), "pressure outside [0.1, 6] atm"
    table_checks()
    return ens, saffire_gravity(), saffire_one()
