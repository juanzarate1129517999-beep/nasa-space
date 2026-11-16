"""One check per published item: every investigation, relevance score, correction, SI briefing,
finding, lunar-base fact and recommended experiment the website shows.

Wherever the pipeline computes a number with a formula, the test recomputes it from the
published records (web/data/downloads/ensayos.csv) or the published model, instead of only
checking a range. A failure names the exact item that is wrong.
"""

import json
import math
import re

import numpy as np
import pandas as pd
import pytest

from pipeline import si
from pipeline.common import HABITATS, WEB_DATA
from pipeline.investigations import _kernel
from pipeline.models import flex_ood, flex_predict3
from pipeline.moonbase import TAGS

EMBER = json.loads((WEB_DATA / "ember.json").read_text(encoding="utf-8"))
ENS = pd.read_csv(WEB_DATA / "downloads" / "ensayos.csv")
QC = pd.read_csv(WEB_DATA / "downloads" / "qc_log.csv", keep_default_na=False)
SI = json.loads(re.sub(r"^window\.SI=|;$", "", (WEB_DATA / "si.js").read_text(encoding="utf-8")))
PACKS = {f"{p['kind']}:{p['id']}": p for p in
         json.loads((WEB_DATA / "downloads" / "si_evidence_packs.json").read_text(encoding="utf-8"))}

INVS = {r["psi_id"]: r for r in EMBER["investigations"]}
HAB = {h["id"]: h for h in HABITATS}
PSI_IDS = set(INVS)
EXPERIMENTS = set(ENS["experimento"])

# ---------------------------------------------------------------- relevance of each investigation to each atmosphere


def recompute_relevance(psi, h):
    """pipeline/investigations.build, from the published records."""
    e = ENS[ENS["psi_id"] == psi]
    cond = e.dropna(subset=["x_o2", "p_atm"])
    n_eff = 0.0
    if len(cond):
        w = np.where(cond["o2_ubicacion"].eq("quemador"), 0.5, 1.0)
        w = w * np.where(cond["o2_supuesto"] | cond["p_supuesta"], 0.6, 1.0)
        n_eff += float((_kernel(cond["x_o2"].values, cond["p_atm"].values, h) * w).sum())
    o2_only = e[e["x_o2"].notna() & e["p_atm"].isna()]
    if len(o2_only):
        n_eff += float(0.5 * _kernel(o2_only["x_o2"].values, None, h).sum())
    prox = 1 - math.exp(-n_eff / 8)
    evidence = min(1.0, math.log1p(int(e["con_resultado"].sum())) / math.log1p(300))
    return n_eff, prox, evidence


@pytest.mark.parametrize("psi, hid", [(p, h["id"]) for p in sorted(INVS) for h in HABITATS])
def test_relevance_score_recomputes_from_the_records(psi, hid):
    r = INVS[psi]["relevance"][hid]
    n_eff, prox, evidence = recompute_relevance(psi, HAB[hid])
    assert r["n_near"] == pytest.approx(round(n_eff, 1), abs=0.051)
    assert r["proximity"] == pytest.approx(round(prox, 3), abs=1e-9)
    assert r["evidence"] == pytest.approx(round(evidence, 3), abs=1e-9)
    assert 0 < r["directness"] <= 1
    assert r["score"] == pytest.approx(round(100 * (0.5 * prox + 0.2 * evidence + 0.3 * r["directness"]), 1), abs=1e-9)

# ---------------------------------------------------------------- each investigation's profile


@pytest.mark.parametrize("psi", sorted(INVS))
def test_investigation_profile_matches_its_records(psi):
    r = INVS[psi]
    e = ENS[ENS["psi_id"] == psi]
    cond = e.dropna(subset=["x_o2", "p_atm"])
    assert r["psi_url"] == f"https://psi.nasa.gov/physci/repo/data/investigations/{psi}"
    assert r["type"] in {"Flight", "Ground"} and r["title"].strip() and r["name"].strip()
    assert r["doi"] == "" or r["doi"].startswith("10.")
    assert r["n_with_outcome"] == int(e["con_resultado"].sum())
    if len(e):
        assert r["n_tests"] == int(e["n_eventos"].fillna(1).sum())
    if len(cond):
        assert (r["o2_min"], r["o2_max"]) == (pytest.approx(cond["x_o2"].min()), pytest.approx(cond["x_o2"].max()))
        assert (r["p_min"], r["p_max"]) == (pytest.approx(cond["p_atm"].min()), pytest.approx(cond["p_atm"].max()))
    else:
        assert r["o2_min"] is None and r["p_min"] is None
    assert set(r["layers"]) <= {"Prevention", "Detection", "Suppression"} and r["layers"]
    assert len(r["publications"]) <= 4 and all(p["title"].strip() for p in r["publications"])
    assert all(t["rows"] > 0 for t in r["tables"])
    assert set(r["related"]) <= {x for x in r["related"] if x.startswith("PSI-")}


def test_investigations_are_ranked_by_lunar_base_relevance():
    scores = [r["relevance"]["moon_base"]["score"] for r in EMBER["investigations"]]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.parametrize("i", range(len(EMBER["similarity"]["ids"])))
def test_similarity_row_recomputes(i):
    S, recs = EMBER["similarity"], [INVS[p] for p in EMBER["similarity"]["ids"]]
    a = recs[i]
    for j, b in enumerate(recs):
        ka, kb = {k.lower() for k in a["keywords"]}, {k.lower() for k in b["keywords"]}
        jac = len(ka & kb) / len(ka | kb) if ka | kb else 0
        rel = 1.0 if (b["psi_id"] in a["related"] or a["psi_id"] in b["related"]) else 0.0
        ov = 0.0
        if a["o2_min"] is not None and b["o2_min"] is not None:
            lo, hi = max(a["o2_min"], b["o2_min"]), min(a["o2_max"], b["o2_max"])
            span = max(a["o2_max"], b["o2_max"]) - min(a["o2_min"], b["o2_min"])
            ov = max(0.0, hi - lo) / span if span > 0 else 1.0
        want = 0.30 * jac + 0.25 * (a["family"] == b["family"]) + 0.15 * (a["hardware"] == b["hardware"]) + 0.15 * ov + 0.15 * rel
        if i == j:
            want = 1.0  # the diagonal is set to 1
        assert S["matrix"][i][j] == pytest.approx(want, abs=6e-4), (a["psi_id"], b["psi_id"])
        assert S["matrix"][i][j] == S["matrix"][j][i]

# ---------------------------------------------------------------- each correction to NASA's tables


def test_log_uses_the_same_experiment_names_as_the_records():
    assert "Flame Design" not in set(QC["experimento"])


def _record_ids(row):
    return [x.strip() for x in str(row["registro"]).split(",")]


@pytest.mark.parametrize("i", range(len(QC)))
def test_correction_is_complete_and_traceable(i):
    row = QC.iloc[i]
    assert set(re.findall(r"PSI-\d+", row["psi_id"])) <= PSI_IDS and row["psi_id"].startswith("PSI-")
    assert row["campo"].strip() and row["regla"].strip() and row["registro"].strip()
    assert row["valor_original"].strip() and row["valor_original"] != row["valor_nuevo"]
    # Experiments named in the log exist in the records (BASS-II entries name the PI in brackets).
    assert row["experimento"].split(" (")[0] in EXPERIMENTS | {"BASS-II", "Saffire-I", "Saffire-II", "Saffire-III"}
    # Per-test corrections in FLEX and CFI point at a published record.
    ids = _record_ids(row)
    if row["experimento"] in {"FLEX", "CFI"} and all(x.isdigit() for x in ids):
        uids = set(ENS["test_uid"])
        assert all(f"{row['psi_id']}:{x}" in uids for x in ids), ids

# ---------------------------------------------------------------- each published SI briefing


BRIEFS = [(kind, bid) for kind in ("habitat", "investigation", "module", "base") for bid in SI[kind]]


@pytest.mark.parametrize("kind, bid", BRIEFS)
def test_published_briefing_is_grounded_in_its_evidence(kind, bid):
    b = SI[kind][bid]
    pack = PACKS[f"{kind}:{bid}"]
    assert b["evidence"] == pack["items"] and si.pack_hash(pack) == pack["hash"]
    assert b["source"] == "si" and b["problems"] == []
    assert 1 <= len(b["sentences"]) <= 6
    for s in b["sentences"]:
        assert s["cites"] and set(s["cites"]) <= set(pack["items"]), s
        cited = set().union(*(si.numbers(pack["items"][c]) for c in s["cites"]))
        assert si.numbers(s["text"]) <= cited, s["text"]
        assert not si.VERDICT.search(s["text"]) and len(s["text"]) <= si.MAX_SENTENCE
    allowed = set().union(*(si.numbers(t) for t in pack["items"].values()))
    assert si.numbers(b["headline"]) <= allowed and not si.VERDICT.search(b["headline"])


def test_every_evidence_pack_has_a_published_briefing():
    assert {f"{k}:{b}" for k, b in BRIEFS} == set(PACKS)

# ---------------------------------------------------------------- each finding


@pytest.mark.parametrize("f", EMBER["findings"], ids=lambda f: f["id"])
def test_finding_score_recomputes_from_its_components(f):
    c = f["components"]
    assert set(c) == {"volume", "quality", "agreement", "closeness"} and all(0 <= v <= 1 for v in c.values())
    want = 100 * (0.35 * c["volume"] + 0.25 * c["quality"] + 0.2 * c["agreement"] + 0.2 * c["closeness"])
    assert f["score"] == pytest.approx(want, abs=0.1)
    assert f["layer"] in {"Prevention", "Detection", "Suppression"}
    assert f["title"].strip() and f["text"].strip() and f["source"].strip()


def test_finding_ids_are_unique():
    ids = [f["id"] for f in EMBER["findings"]]
    assert len(ids) == len(set(ids)) == 12

# ---------------------------------------------------------------- lunar-base fire audit

FACTS = [(m["id"], k, i, f) for m in EMBER["moonbase"]["modules"] for k, t in m["tests"].items() for i, f in enumerate(t["facts"])]


@pytest.mark.parametrize("module, test, i, fact", FACTS, ids=[f"{m}-{t}-{i}" for m, t, i, _ in FACTS])
def test_lunar_base_fact_carries_its_provenance(module, test, i, fact):
    assert fact["tag"] in TAGS
    assert str(fact["label"]).strip() and str(fact["value"]).strip() and str(fact["source"]).strip()


@pytest.mark.parametrize("m", EMBER["moonbase"]["modules"], ids=lambda m: m["id"])
def test_lunar_base_module_breathes_its_declared_atmosphere(m):
    h = HAB[m["atmosphere"]]
    assert (m["x_o2"], m["p_atm"]) == (h["x_o2"], h["p_atm"]) and m["volume_m3"] > 0
    assert m["psi"] == pytest.approx(10.2, abs=0.05)
    for t in m["tests"].values():
        assert t["status"] in {"measured", "derived", "model", "extrapolated", "gap"}
        assert t["layer"] in {"Prevention", "Detection", "Suppression"} and t["question"].endswith("?")


def test_lunar_base_report_counts_its_facts():
    r = EMBER["moonbase"]["report"]
    assert r["total_facts"] == len(FACTS) == 60
    assert r["measured_layers"] == sum(f["tag"] == "measured" for *_, f in FACTS)

# ---------------------------------------------------------------- each recommended next experiment

MODEL = EMBER["flex"]
MOON_O2, MOON_P = float(HAB["moon_base"]["x_o2"]), float(HAB["moon_base"]["p_atm"])  # type: ignore[arg-type]


@pytest.mark.parametrize("pick", EMBER["next"]["picks"], ids=lambda p: f"{p['fuel']}-{p['x_o2']}-{p['p_atm']}-{p['x_co2']}")
def test_next_experiment_numbers_recompute_from_the_model(pick):
    row = [1.0 if pick["fuel"] == "Heptane" else 0.0, pick["x_o2"], float(np.log(pick["p_atm"])), pick["x_co2"], 0.0, MODEL["d0_median"]]
    draws = flex_predict3(MODEL, [row], keep_draws=True)["extinction"][0]
    lo, hi = np.percentile(draws, 5), np.percentile(draws, 95)
    dist = float(flex_ood(MODEL, [row])[0])
    near = math.exp(-(((row[1] - MOON_O2) / 0.04) ** 2 + ((row[2] - math.log(MOON_P)) / 0.35) ** 2) / 2)
    score = (hi - lo) * (0.35 + near) * math.exp(-max(0.0, dist - 2 * MODEL["ood_threshold"]))
    assert pick["p_ext"] == pytest.approx(draws.mean()) and pick["interval"] == [pytest.approx(lo), pytest.approx(hi)]
    assert pick["uncertainty"] == pytest.approx(hi - lo) and pick["ood_distance"] == pytest.approx(dist)
    assert pick["near_moon_base"] == pytest.approx(near) and pick["score"] == pytest.approx(score)


def test_next_experiments_are_ranked_by_score():
    s = [p["score"] for p in EMBER["next"]["picks"]]
    assert s == sorted(s, reverse=True) and len(s) == 6
