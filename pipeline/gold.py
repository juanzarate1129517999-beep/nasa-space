import json
import math

import numpy as np
import pandas as pd

from .common import GOLD, HABITATS, QC, WEB_DATA


def wilson(k, n, z=1.645):
    if n == 0:
        return [None, None]
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [max(0.0, c - h), min(1.0, c + h)]


def suppression(ens):
    f = ens[(ens["experimento"] == "FLEX") & ens["p_atm"].notna()].copy()
    f["co2_band"] = pd.cut(f["x_co2"], [-0.001, 0.0001, 0.2, 0.3, 1], labels=["0%", "1–20%", "20–30%", ">30%"])
    f["p_band"] = np.where(f["p_atm"] < 0.85, "Reduced pressure (0.7 atm)", "≈1 atm and above")
    rows = []
    for (pb, cb), g in f.groupby(["p_band", "co2_band"], observed=True):
        k, n = int(g["autoextincion"].sum()), len(g)
        rows.append({"pressure": pb, "co2": str(cb), "n": n, "k": k, "rate": k / n, "ci": wilson(k, n),
                     "o2_range": [float(g["x_o2"].min()), float(g["x_o2"].max())]})
    he = f[f["x_he"] > 0]
    return {"co2": rows, "helium": {"n": int(len(he)), "k": int(he["autoextincion"].sum())}}


def o2_bands(ens):
    f = ens[ens["experimento"] == "FLEX"].copy()
    f["band"] = pd.cut(f["x_o2"], [0, 0.18, 0.22, 0.30, 0.40], right=False,
                       labels=["<18%", "18–22%", "22–30%", "30–34%"])
    out = []
    for b, g in f.groupby("band", observed=True):
        counts = g["resultado"].value_counts()
        out.append({"band": str(b), "n": int(len(g)), "extincion": int(counts.get("extincion", 0)),
                    "disrupcion": int(counts.get("disrupcion", 0)), "completo": int(counts.get("completo", 0))})
    return out


def coverage(ens):
    c = ens.dropna(subset=["x_o2", "p_atm"])
    groups = []
    for (psi, exp), g in c.groupby(["psi_id", "experimento"]):
        groups.append({"psi_id": psi, "experiment": exp, "family": g["familia"].iloc[0],
                       "assumed": bool((g["o2_supuesto"] | g["p_supuesta"]).mean() > 0.5),
                       "burner_o2": bool(g["o2_ubicacion"].eq("quemador").all()),
                       "x_o2": g["x_o2"].round(4).tolist(), "p_atm": g["p_atm"].round(4).tolist(),
                       "outcome": g["resultado"].fillna("").tolist()})
    moon = next(h for h in HABITATS if h["id"] == "moon_base")
    amb = c[c["o2_ubicacion"] == "ambiente"]
    in_moon = amb[(amb["x_o2"] >= moon["x_o2"] - 0.02) & (amb["p_atm"] <= moon["p_atm"] + 0.05)]
    near_suit = amb[(amb["x_o2"] >= 0.8) & (amb["p_atm"] <= 0.5)]
    measured = amb[~(amb["o2_supuesto"] | amb["p_supuesta"])]
    return {"groups": groups, "n_points": int(len(c)), "n_ambient": int(len(amb)), "n_measured": int(len(measured)),
            "n_moon_envelope": int(len(in_moon)), "moon_envelope_experiments": sorted(in_moon["experimento"].unique().tolist()),
            "n_suit_envelope": int(len(near_suit))}


def _score(n, quality, agree, closeness):
    s = 0.35 * min(1.0, math.log1p(n) / math.log1p(300)) + 0.25 * quality + 0.2 * min(1.0, agree / 3) + 0.2 * closeness
    return round(100 * s, 1), {"volume": round(min(1.0, math.log1p(n) / math.log1p(300)), 3), "quality": round(quality, 3),
                               "agreement": round(min(1.0, agree / 3), 3), "closeness": round(closeness, 3)}


def findings(ens, models, sup, cov, saffire2, saffire1, bands):
    fx = ens[ens["experimento"] == "FLEX"]
    hi = fx[fx["x_o2"] >= 0.30]
    hi_low_p = hi[hi["p_atm"] < 0.8]
    m1, m2 = models["flex"], models["cfig"]
    auc = next(m["auc"] for m in m1["validation"]["models"] if m["key"] == "lr")
    hc = {h["habitat"]: h for h in models["habitat_check"]}
    cab, moon = hc["cabin"]["fuels"]["Methanol"], hc["moon_base"]["fuels"]["Methanol"]
    red = [r for r in sup["co2"] if r["pressure"].startswith("Reduced")]
    r0 = next((r for r in red if r["co2"] == "0%"), None)
    rmax = max(red, key=lambda r: r["rate"]) if red else None
    nsolid = ens[(ens["familia"] == "solido") & (ens["material_familia"] != "Vela/cera")]
    s1 = {r["direccion"].strip().lower(): r["tiempo_quemado_s"] for _, r in saffire1.iterrows()}
    worse_1g = int((saffire2["g1_estado"] >= saffire2["ug_estado"]).sum())
    norm = m2["by_type"]["normal"]
    inv = m2["by_type"]["inverse"]
    he_drv = next(d for d in m1["drivers"] if d["feature"] == "x_he")
    d0_drv = next(d for d in m1["drivers"] if d["feature"] == "d0_mm")
    F = [
        dict(id="o2_no_self_ext", layer="Prevention", title="Above 30% O₂, flames stop putting themselves out",
             text=f"In FLEX, {len(hi)} droplet fires burned at 30–34% O₂ ({len(hi_low_p)} of them at 0.70 atm, next to the lunar-base "
                  f"atmosphere). Only {int(hi['autoextincion'].sum())} self-extinguished — "
                  f"{int(hi_low_p['autoextincion'].sum())} of the {len(hi_low_p)} at 0.70 atm — against "
                  f"{bands[0]['extincion']} of {bands[0]['n']} below 18% O₂.",
             implication="A fire on a lunar base must be detected and actively suppressed; waiting for it to die out is not an option.",
             source="PSI-69 FLEX", n=len(hi), quality=0.9, agree=2, closeness=1.0),
        dict(id="model_moon", layer="Prevention",
             title=f"Lunar-base air makes self-extinction ~{cab['p'] / moon['p']:.0f}× less likely than cabin air",
             text=f"The validated FLEX model gives a methanol droplet flame a {cab['p']:.0%} chance of self-extinguishing in cabin air "
                  f"(21%, 1 atm) and {moon['p']:.0%} at 30% O₂ and 10.2 psi (90% interval {moon['lo']:.0%}–{moon['hi']:.0%}). "
                  f"Out-of-sample AUC {auc:.2f} with whole test days held out.",
             implication="Material screening done for 21% / 1 atm cannot be reused for the Moon base without re-testing.",
             source="PSI-69 FLEX · Skylab Phoenix model", n=m1["n"], quality=min(1, (auc - 0.5) / 0.4), agree=1, closeness=1.0),
        dict(id="coverage_gap", layer="Prevention", title="Almost no flight data where the Moon base will live",
             text=f"Of {cov['n_ambient']:,} flight-test records with an ambient O₂ and pressure ({cov['n_measured']:,} measured, the rest "
                  f"run in ISS cabin air), {cov['n_moon_envelope']} sit inside the "
                  f"lunar-base envelope (≥28% O₂, ≤0.75 atm), all from {', '.join(cov['moon_envelope_experiments'])}. "
                  f"No solid-material test exceeds {nsolid['x_o2'].max():.1%} O₂ and none was flown at reduced pressure. "
                  f"Spacesuit conditions (100% O₂, 4.3 psi): {cov['n_suit_envelope']} tests.",
             implication="The highest-value next flight experiment is solid-material flammability at ≥30% O₂ and ≤10.2 psi.",
             source="All 24 PSI investigations", n=cov["n_ambient"], quality=1.0, agree=3, closeness=1.0),
        dict(id="co2", layer="Suppression", title="CO₂ dilution suppresses droplet fires at reduced pressure",
             text=(f"At 0.7 atm, droplet flames self-extinguished in {r0['rate']:.0%} of tests without CO₂ (n={r0['n']}) and in "
                   f"{rmax['rate']:.0%} with {rmax['co2']} CO₂ (n={rmax['n']}). Once O₂ is accounted for, the model attributes a "
                   f"smaller, uncertain effect to CO₂ — CO₂ tests were often run at different O₂ levels.") if r0 and rmax else "",
             implication="CO₂ works, but its effect is confounded with O₂ in FLEX: a controlled CO₂ series at lunar-base O₂ is needed.",
             source="PSI-69 FLEX", n=sum(r["n"] for r in red), quality=0.7, agree=1, closeness=0.8),
        dict(id="helium", layer="Suppression", title="Helium and larger droplets push flames toward extinction",
             text=f"Holding everything else fixed, adding helium raises the odds of self-extinction (standardized effect "
                  f"{he_drv['coef']:+.2f}, 90% CI {he_drv['lo']:+.2f} to {he_drv['hi']:+.2f}); so does a larger initial droplet "
                  f"({d0_drv['coef']:+.2f}), consistent with radiative-loss extinction of large microgravity flames.",
             implication="Diluent choice matters: helium-rich atmospheres change fire behavior, not only O₂ level.",
             source="PSI-69 FLEX · Skylab Phoenix model", n=m1["n"], quality=0.8, agree=1, closeness=0.5),
        dict(id="flow_direction", layer="Prevention", title="Concurrent airflow made a large fire burn 6× longer",
             text=f"In Saffire-I the same 94 × 40 cm SIBAL fabric burned for {s1.get('concurrent', float('nan')):.0f} s with concurrent "
                  f"flow and {s1.get('opposed', float('nan')):.0f} s with opposed flow, both at 20 cm/s and ~21.5% O₂.",
             implication="Cabin ventilation direction defines the worst case; fan layout is a fire-safety design variable.",
             source="PSI-98 Saffire-I", n=2, quality=0.5, agree=2, closeness=0.3),
        dict(id="one_g", layer="Prevention", title="At 20 cm/s, the 1-g test was the more severe one",
             text=f"Saffire-II burned the same samples in orbit and on the ground: in {worse_1g} of {len(saffire2)} single-material samples, "
                  "1 g burned as much or more than microgravity (silicone barely spread in orbit but burned fully on the ground). "
                  "BASS's concern — that 1-g screening may not be conservative — applies to low-flow conditions Saffire-II did not test.",
             implication="μg and 1-g results bound partial gravity only for the flow regime that was tested; low-flow is the open question.",
             source="PSI-99 Saffire-II · PSI-25 BASS-II", n=len(saffire2), quality=0.5, agree=2, closeness=0.3),
        dict(id="tad_limit", layer="Prevention", title="One limiting flame temperature? Only for normal gas flames",
             text=f"For ACME CFI-G normal flames, self-extinction becomes more likely as adiabatic flame temperature drops "
                  f"(AUC {norm['metrics']['auc']:.2f}). The 50% point, ≈ {norm['t50']:,.0f} K (90% CI {norm['t50_lo']:,.0f}–"
                  f"{norm['t50_hi']:,.0f} K), lies just above the hottest normal flame tested ({norm['tad_max']:,.0f} K), "
                  f"so it is an extrapolation. "
                  f"For inverse flames the same single-variable rule has no predictive power (AUC {inv['metrics']['auc']:.2f}).",
             implication="Flame temperature alone is not a universal extinction criterion; geometry and flow matter.",
             source="PSI-159 ACME CFI-G", n=m2["n"], quality=max(0, (norm["metrics"]["auc"] - 0.5) / 0.4), agree=1, closeness=0.6),
        dict(id="cool_flames", layer="Detection", title="Cool flames: invisible fire, confirmed in orbit",
             text=f"{m2['ignition']['cool_flames']} cool flames were confirmed in ACME CFI-G, all with "
                  f"{', '.join(m2['cool_flame_conditions']['fuel'])} near {m2['cool_flame_conditions']['o2'][1]:.0%} O₂ and "
                  f"{m2['cool_flame_conditions']['p_atm'][0]:.1f} atm. They burn at low temperature with almost no visible light.",
             implication="Optical flame detectors can miss cool flames; chemical (CO, aldehyde) sensing is a candidate complement.",
             source="PSI-159 ACME CFI-G · PSI-39 CFI", n=m2["ignition"]["cool_flames"], quality=0.6, agree=2, closeness=0.5),
        dict(id="smoke", layer="Detection", title="Smoke differs by material, and ages before it reaches a detector",
             text="SAME and SAME-R measured smoke from Kapton, Teflon, silicone, Pyrell and lamp wick in orbit, including "
                  "how particle size grows with aging time (109 SAME-R tests, 8 SAME).",
             implication="Detector thresholds should be set per material and per transport time, not from 1-g smoke.",
             source="PSI-101 SAME-R · PSI-102 SAME", n=117, quality=0.5, agree=2, closeness=0.4),
        dict(id="pmma", layer="Prevention", title="Solid-material data is dominated by one plastic",
             text=f"{int((nsolid['material_familia'] == 'PMMA').sum())} of {len(nsolid)} solid-material tests (candles excluded) "
                  f"are PMMA; Nomex, silicone and "
                  f"Ultem together have {int(nsolid['material_familia'].isin(['Nomex', 'Silicona', 'Ultem']).sum())}.",
             implication="Cabin fabrics and polymers other than PMMA need flight data before any envelope can be trusted.",
             source="PSI-26 BASS · PSI-25 BASS-II", n=len(nsolid), quality=1.0, agree=2, closeness=0.2),
    ]
    for f in F:
        f["score"], f["components"] = _score(f.pop("n"), f.pop("quality"), f.pop("agree"), f.pop("closeness"))
    F = [f for f in F if f["text"]]
    F.sort(key=lambda f: -f["score"])
    return F


def _jsonable(o):
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, pd.Timestamp):
        return o.strftime("%Y-%m-%d")
    return o


def write(ens, saffire2, saffire1, invs, sim, models):
    GOLD.mkdir(parents=True, exist_ok=True)
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    ens.to_csv(GOLD / "ensayos.csv", index=False)
    qc = pd.DataFrame(QC.rows)
    qc.to_csv(GOLD / "qc_log.csv", index=False)
    saffire2.to_csv(GOLD / "saffire2_ug_vs_1g.csv", index=False)
    pd.DataFrame([{k: v for k, v in r.items() if k not in ("tables", "publications", "relevance")} for r in invs]) \
        .to_csv(GOLD / "investigaciones.csv", index=False)
    sup, cov, bands = suppression(ens), coverage(ens), o2_bands(ens)
    F = findings(ens, models, sup, cov, saffire2, saffire1, bands)
    flex = dict(models["flex"])
    payload = {
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
        "habitats": HABITATS,
        "summary": {"investigations": len(invs), "flight": sum(r["type"] == "Flight" for r in invs),
                    "records": int(len(ens)), "with_outcome": int(ens["con_resultado"].sum()),
                    "qc_fixes": int(len(qc)), "moon_envelope": cov["n_moon_envelope"], "ambient": cov["n_ambient"]},
        "investigations": invs, "similarity": sim, "coverage": cov, "o2_bands": bands, "suppression": sup,
        "saffire2": saffire2.to_dict(orient="records"), "saffire1": saffire1.to_dict(orient="records"),
        "flex": flex, "cfig": models["cfig"], "habitat_check": models["habitat_check"], "next": models["next"],
        "findings": F, "qc": qc.to_dict(orient="records"),
    }
    payload = _jsonable(payload)
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (WEB_DATA / "ember.json").write_text(blob, encoding="utf-8")
    (WEB_DATA / "ember.js").write_text("window.EMBER=" + blob + ";", encoding="utf-8")
    (GOLD / "findings.json").write_text(json.dumps(F, ensure_ascii=False, indent=1), encoding="utf-8")
    dl = WEB_DATA / "downloads"
    dl.mkdir(parents=True, exist_ok=True)
    for name in ("ensayos.csv", "investigaciones.csv", "qc_log.csv", "saffire2_ug_vs_1g.csv", "findings.json"):
        (dl / name).write_bytes((GOLD / name).read_bytes())
    return payload
