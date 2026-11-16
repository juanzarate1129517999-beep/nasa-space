import ast
import json
import re

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import leaves_list, linkage
from scipy.spatial.distance import squareform

from .common import CATALOG, HABITATS, RAW

HARDWARE = {
    **{k: "ACME · Combustion Integrated Rack" for k in ("PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-159")},
    **{k: "MDCA droplet rig · CIR" for k in ("PSI-69", "PSI-68", "PSI-39")},
    **{k: "MSG fan-driven flow duct" for k in ("PSI-26", "PSI-25", "PSI-107", "PSI-106")},
    **{k: "Saffire module · Cygnus" for k in ("PSI-98", "PSI-99", "PSI-100")},
    **{k: "Smoke & aerosol diagnostics" for k in ("PSI-102", "PSI-101", "PSI-47")},
    **{k: "Ground laboratory / modeling" for k in ("PSI-142", "PSI-62", "PSI-60", "PSI-117", "PSI-115")},
}
FAMILY = {
    "PSI-10": "Gas flames",
    "PSI-20": "Gas flames",
    "PSI-21": "Gas flames",
    "PSI-22": "Gas flames",
    "PSI-23": "Gas flames",
    "PSI-159": "Gas flames",
    "PSI-107": "Gas flames",
    "PSI-106": "Gas flames",
    "PSI-60": "Gas flames",
    "PSI-142": "Gas flames",
    "PSI-117": "Gas flames",
    "PSI-69": "Fuel droplets",
    "PSI-68": "Fuel droplets",
    "PSI-39": "Fuel droplets",
    "PSI-26": "Solid materials",
    "PSI-25": "Solid materials",
    "PSI-98": "Solid materials",
    "PSI-99": "Solid materials",
    "PSI-100": "Solid materials",
    "PSI-62": "Solid materials",
    "PSI-102": "Smoke & dust",
    "PSI-101": "Smoke & dust",
    "PSI-47": "Smoke & dust",
    "PSI-115": "Smoke & dust",
}
SHORT = {
    "PSI-142": "Cool-flame counterflow",
    "PSI-62": "BASS spread modeling",
    "PSI-60": "SPICE analysis",
    "PSI-117": "Cool-flame perturbation",
    "PSI-115": "SAME smoke modeling",
    "PSI-10": "ACME Flame Design",
    "PSI-21": "ACME CLD",
    "PSI-22": "ACME E-FIELD",
    "PSI-23": "ACME s-Flame",
    "PSI-47": "DAFT / DAFT-2",
    "PSI-98": "Saffire-I",
    "PSI-99": "Saffire-II",
    "PSI-100": "Saffire-III",
}
LAYERS = {
    "PSI-101": ["Detection"],
    "PSI-102": ["Detection"],
    "PSI-47": ["Detection"],
    "PSI-115": ["Detection"],
    "PSI-69": ["Suppression", "Prevention"],
    "PSI-68": ["Suppression", "Prevention"],
    "PSI-26": ["Prevention", "Suppression"],
    "PSI-25": ["Prevention", "Suppression"],
}
DIRECTNESS = {
    **{k: 1.0 for k in ("PSI-26", "PSI-25", "PSI-98", "PSI-99", "PSI-100", "PSI-102", "PSI-101", "PSI-69")},
    **{k: 0.75 for k in ("PSI-20", "PSI-47", "PSI-159", "PSI-22")},
}

SKIP_COL = re.compile(
    r"date|gmt|time\b|local time|test ?#|test no|number|^test$|sample #|camera|comment|note|"
    r"identifier|^cir|^day|year|month|session|frames|^pi$|^\W*pi$|radiometer|data id|link|figure",
    re.I,
)
MEASURE_COL = re.compile(
    r"extinction|burn|rate|length|ignit|rt/r0|weight loss|tad|zst|self|cool flame|"
    r"final|test end|spread|flames ignited|smoke|aging",
    re.I,
)


def _clean_col(c):
    c = re.sub(r"\s+", " ", str(c).replace("﻿", "").replace("ï»¿", "")).strip()
    return c.replace("O initial", "O2 initial").replace("CO initial", "CO2 initial").replace("?-g", "µg")


def _fmt(v):
    if isinstance(v, (int, np.integer)):
        return str(v)
    if isinstance(v, (float, np.floating)):
        return f"{v:,.0f}" if abs(v) >= 1000 else f"{v:.3g}"
    return str(v).strip()[:48]


def profile_table(path):
    df = pd.read_csv(path, encoding="latin-1").dropna(how="all")
    df.columns = [_clean_col(c) for c in df.columns]
    df = df.loc[:, ~df.columns.str.startswith("Unnamed")]
    varied, fixed, measured = [], [], []
    for c in df.columns:
        if SKIP_COL.search(c):
            continue
        s = df[c].dropna()
        s = s[s.astype(str).str.strip().ne("")]
        if s.empty:
            continue
        num = pd.to_numeric(s, errors="coerce")
        if "pressure" in c.lower():
            num = num.where(num > 0)
        is_num = num.notna().mean() > 0.8
        nun = num.dropna().nunique() if is_num else s.astype(str).str.strip().nunique()
        if is_num:
            desc = _fmt(num.min()) if nun == 1 else f"{_fmt(num.min())} – {_fmt(num.max())}"
        else:
            vals = s.astype(str).str.strip().value_counts()
            desc = ", ".join(vals.index[:4]) + (f" (+{len(vals) - 4})" if len(vals) > 4 else "")
        item = {"variable": c, "values": desc, "n_distinct": int(nun)}
        if MEASURE_COL.search(c):
            measured.append(item)
        elif nun > 1:
            varied.append(item)
        else:
            fixed.append(item)
    return {
        "table": path.name.split("Experimental table_")[-1].removesuffix(".csv"),
        "rows": int(len(df)),
        "varied": varied,
        "fixed": fixed,
        "measured": measured,
    }


ENUM = re.compile(r"\(?(?:\d{1,2}|[A-Za-z])[.)]")


def _sentences(text, n=2):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z(\d])", text)
    merged = []
    for p in parts:
        if merged and (ENUM.fullmatch(merged[-1].split(" ")[-1]) or ENUM.fullmatch(merged[-1])):
            merged[-1] += " " + p
        else:
            merged.append(p)
    k = min(n, len(merged))
    while k < len(merged) and re.search(r"(follows|include|includes|were|are)\s*[.:]$", merged[k - 1], re.I):
        k += 1
    out = " ".join(merged[:k])
    return re.sub(r"\s+\(?\d{1,2}[.)]?$", "", out).strip()


def _kernel(x_o2, p_atm, h):
    d2 = ((x_o2 - h["x_o2"]) / O2_SCALE) ** 2
    if p_atm is not None:
        d2 = d2 + (np.log(p_atm / h["p_atm"]) / np.log(P_SCALE)) ** 2
    return np.exp(-d2 / 2)


O2_SCALE, P_SCALE = 0.03, 1.3


def _search_fields():
    path = CATALOG.parent / "search_combustion.json"
    if not path.exists():
        return {}
    out = {}
    for x in json.loads(path.read_text(encoding="utf-8")):
        person = x.get("Person") or {}
        if isinstance(person, list):
            person = person[0] if person else {}
        surnames = [s for s in str(person.get("Last Name", "")).split() if s]
        out[x.get("Accession")] = {
            "team": ", ".join(surnames),
            "earth": _sentences(x.get("Research Impacts/Earth Benefits"), 2),
        }
    return out


def build(ensayos):
    cat = pd.read_csv(CATALOG)
    cat = cat[cat["research_area"] == "Combustion Science"].copy()
    extra = _search_fields()
    recs = []
    for _, c in cat.iterrows():
        psi = c["accession"]
        meta_path = RAW / psi / "metadata.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
        tables = sorted((RAW / psi).glob(f"{psi}_Experimental table_*.csv"))
        profiles = [profile_table(t) for t in tables]
        e = ensayos[ensayos["psi_id"] == psi]
        cond = e.dropna(subset=["x_o2", "p_atm"])
        hw = ast.literal_eval(c["hardware"]) if isinstance(c["hardware"], str) and c["hardware"].startswith("{") else {}
        pubs = [p for p in meta.get("publications", []) if p.get("title")]
        n_tests = int(e["n_eventos"].fillna(1).sum()) if len(e) else int(sum(p["rows"] for p in profiles))
        n_outcome = int(e["con_resultado"].sum()) if len(e) else 0
        flight = c["project_type"] == "Microgravity Investigation"
        rec = {
            "psi_id": psi,
            "name": SHORT.get(psi) or (c["acronym"] if isinstance(c["acronym"], str) else psi),
            "title": c["title"],
            "family": FAMILY.get(psi, "Other"),
            "hardware": HARDWARE.get(psi, "Other"),
            "hardware_detail": hw.get("Name", ""),
            "layers": LAYERS.get(psi, ["Prevention"]),
            "type": "Flight" if flight else "Ground",
            "platform": c["flight_platform"] if isinstance(c["flight_platform"], str) else "Ground laboratory",
            "pi": extra.get(psi, {}).get("team", ""),
            "earth_benefit": extra.get(psi, {}).get("earth", ""),
            "start": c["start"] if isinstance(c["start"], str) else "",
            "doi": meta.get("doi", ""),
            "objective": _sentences(meta.get("objective"), 2),
            "hypothesis": _sentences(meta.get("hypothesis"), 1),
            "keywords": [k.strip() for k in str(c["keywords"]).split("|") if k.strip() and k.strip() != "nan"],
            "related": [r for r in str(c["related"]).split() if r.startswith("PSI-")],
            "n_publications": len(pubs),
            "publications": [
                {"title": p["title"], "authors": p.get("authorList", ""), "doi": p.get("doi", "")} for p in pubs[:4]
            ],
            "n_tests": n_tests,
            "n_with_outcome": n_outcome,
            "tables": profiles,
            "o2_min": float(cond["x_o2"].min()) if len(cond) else None,
            "o2_max": float(cond["x_o2"].max()) if len(cond) else None,
            "p_min": float(cond["p_atm"].min()) if len(cond) else None,
            "p_max": float(cond["p_atm"].max()) if len(cond) else None,
            "conditions_assumed": bool(len(e) and (e["o2_supuesto"] | e["p_supuesta"]).mean() > 0.5),
            "psi_url": f"https://psi.nasa.gov/physci/repo/data/investigations/{psi}",
            "size_mb": float(c["total_mb"]) if pd.notna(c["total_mb"]) else None,
        }
        directness = DIRECTNESS.get(psi, 0.5 if flight else 0.35)
        evidence = min(1.0, np.log1p(n_outcome) / np.log1p(300))
        scores = {}
        o2_only = e[e["x_o2"].notna() & e["p_atm"].isna()]
        for h in HABITATS:
            n_eff = 0.0
            if len(cond):
                w = np.where(cond["o2_ubicacion"].eq("quemador"), 0.5, 1.0)
                w = w * np.where(cond["o2_supuesto"] | cond["p_supuesta"], 0.6, 1.0)
                n_eff += float((_kernel(cond["x_o2"].values, cond["p_atm"].values, h) * w).sum())
            if len(o2_only):
                n_eff += float(0.5 * _kernel(o2_only["x_o2"].values, None, h).sum())
            prox = 1 - np.exp(-n_eff / 8)
            total = 0.5 * prox + 0.2 * evidence + 0.3 * directness
            scores[h["id"]] = {
                "score": float(round(100 * total, 1)),
                "proximity": float(round(prox, 3)),
                "n_near": float(round(n_eff, 1)),
                "evidence": float(round(evidence, 3)),
                "directness": float(directness),
            }
        rec["relevance"] = scores
        recs.append(rec)
    recs.sort(key=lambda r: -r["relevance"]["moon_base"]["score"])
    return recs, similarity(recs)


def similarity(recs):
    n = len(recs)
    S = np.zeros((n, n))
    for i, a in enumerate(recs):
        for j, b in enumerate(recs):
            ka, kb = {k.lower() for k in a["keywords"]}, {k.lower() for k in b["keywords"]}
            jac = len(ka & kb) / len(ka | kb) if ka | kb else 0
            rel = 1.0 if (b["psi_id"] in a["related"] or a["psi_id"] in b["related"]) else 0.0
            ov = 0.0
            if a["o2_min"] is not None and b["o2_min"] is not None:
                lo, hi = max(a["o2_min"], b["o2_min"]), min(a["o2_max"], b["o2_max"])
                span = max(a["o2_max"], b["o2_max"]) - min(a["o2_min"], b["o2_min"])
                ov = max(0.0, hi - lo) / span if span > 0 else 1.0
            S[i, j] = (
                0.30 * jac
                + 0.25 * (a["family"] == b["family"])
                + 0.15 * (a["hardware"] == b["hardware"])
                + 0.15 * ov
                + 0.15 * rel
            )
    np.fill_diagonal(S, 1.0)
    D = 1 - S
    order = leaves_list(linkage(squareform(D, checks=False), method="average"))
    names = [recs[k]["name"] for k in order]
    ids = [recs[k]["psi_id"] for k in order]
    return {
        "ids": ids,
        "names": names,
        "matrix": np.round(S[np.ix_(order, order)], 3).tolist(),
        "weights": {
            "keywords_jaccard": 0.30,
            "same_family": 0.25,
            "same_hardware": 0.15,
            "o2_range_overlap": 0.15,
            "linked_in_psi": 0.15,
        },
    }
