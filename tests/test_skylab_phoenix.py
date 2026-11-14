import json
import math
import re

import pytest

from pipeline import si
from pipeline.common import HABITATS, ROOT, WEB_DATA
from pipeline.investigations import _sentences
from pipeline.models import data_status, out_of_range

EMBER = json.loads((WEB_DATA / "ember.json").read_text(encoding="utf-8"))
PACKS = {f"{p['kind']}:{p['id']}": p for p in json.loads(si.PACKS.read_text(encoding="utf-8"))}
SI_WEB = json.loads(re.sub(r"^window\.SI=|;$", "", (WEB_DATA / "si.js").read_text(encoding="utf-8")))
HC = {h["habitat"]: h["fuels"] for h in EMBER["habitat_check"]}


def test_summary_counts():
    s = EMBER["summary"]
    assert s["investigations"] == 24 and s["flight"] == 19
    assert s["records"] == 1989 and s["with_outcome"] == 688
    assert s["qc_fixes"] == len(EMBER["qc"]) == 53


def test_every_investigation_has_a_score_for_every_habitat():
    ids = {h["id"] for h in HABITATS}
    for r in EMBER["investigations"]:
        assert set(r["relevance"]) == ids
        for v in r["relevance"].values():
            assert 0 <= v["score"] <= 100


def test_objectives_do_not_end_on_a_dangling_list_marker():
    for r in EMBER["investigations"]:
        assert not re.search(r"\s\(?\d{1,2}[.)]?$", r["objective"]), (r["psi_id"], r["objective"][-40:])


def test_sentence_splitter_keeps_numbered_lists_together():
    txt = "The objectives are as follows. 1. Observe burning. 2. Measure spread. 3. Model it."
    out = _sentences(txt, 1)
    assert out.startswith("The objectives are as follows. 1. Observe burning.")
    assert not out.endswith("2.")


def test_downloads_are_published():
    for name in ("solidos_bass2_gases.csv", "ensayos.csv", "investigaciones.csv", "qc_log.csv", "findings.json", "si_evidence_packs.json", "si_verification.json"):
        assert (WEB_DATA / "downloads" / name).stat().st_size > 0


def test_deployed_model_beats_baselines():
    m = {x["key"]: x for x in EMBER["flex"]["validation"]["models"]}
    assert m["lr"]["deployed"]
    assert m["lr"]["auc"] > m["gb"]["auc"] > 0.5
    assert m["lr"]["auc"] > m["o2"]["auc"]
    assert m["lr"]["brier"] < m["o2"]["brier"] < m["prior"]["brier"]


def test_habitat_predictions_are_probabilities_with_intervals():
    for fuels in HC.values():
        for r in fuels.values():
            assert 0 <= r["lo"] <= r["p"] <= r["hi"] <= 1 or r["status"] == "outside"


def test_more_oxygen_means_fewer_self_extinctions():
    p = [HC[h]["Methanol"]["p"] for h in ("cabin", "eva_prep", "moon_base", "exploration")]
    assert p == sorted(p, reverse=True)
    assert round(100 * HC["cabin"]["Methanol"]["p"]) == 72 and round(100 * HC["moon_base"]["Methanol"]["p"]) == 6


def test_guard_statuses():
    assert HC["cabin"]["Methanol"]["status"] == "within"
    assert HC["moon_base"]["Methanol"]["status"] == "within"
    assert HC["exploration"]["Methanol"]["status"] == "extrapolating"
    assert HC["exploration"]["Methanol"]["out_of_range"] == ["log_p"]
    assert HC["suit"]["Methanol"]["status"] == "outside" and HC["suit"]["Methanol"]["ood"]


def test_single_input_outside_flown_range_is_extrapolation():
    m = EMBER["flex"]
    row = [0, 0.30, math.log(0.40), 0, 0, 3.0]
    assert out_of_range(m, row) == ["log_p"]
    assert data_status(0.1, m["ood_threshold"], out_of_range(m, row)) == "extrapolating"
    assert data_status(0.1, m["ood_threshold"], []) == "within"
    assert data_status(3 * m["ood_threshold"], m["ood_threshold"], []) == "outside"


def test_number_extraction_ignores_formulas_and_ids():
    assert si.numbers("O2 and CO2 in PSI-69 and CFI-G") == set()
    assert si.numbers("72% (90% interval 56%–86%) of 1,647 at 0.70 atm") == {"72", "90", "56", "86", "1647", "0.7"}
    assert si.numbers("between 8-99% and -0.42") == {"8", "99", "0.42"}


@pytest.fixture
def moon():
    return PACKS["habitat:moon_base"]


@pytest.mark.parametrize("draft_sentences, problem", [
    ([{"text": "Fires go out 12% of the time.", "cites": ["E2"]}], "not in the cited evidence"),
    ([{"text": "Fires go out 6-99% of the time.", "cites": ["E2"]}], "not in the cited evidence"),
    ([{"text": "Only 6% self-extinguish.", "cites": ["E7"]}], "not in the cited evidence"),
    ([{"text": "Fires are dangerous.", "cites": []}], "no citation"),
    ([{"text": "Only 6% self-extinguish.", "cites": ["E99"]}], "unknown citation"),
    ([{"text": "The lunar base is safe at 30% O2.", "cites": ["E1"]}], "safety verdict"),
    ([{"text": "This habitat is certified for flight.", "cites": ["E1"]}], "safety verdict"),
])
def test_firewall_rejects_bad_drafts(moon, draft_sentences, problem):
    problems = si.verify({"sentences": draft_sentences, "pack_hash": moon["hash"]}, moon)
    assert any(problem in p for p in problems), problems


def test_firewall_rejects_stale_drafts(moon):
    problems = si.verify({"sentences": [{"text": "Only 6% self-extinguish.", "cites": ["E2"]}], "pack_hash": "old"}, moon)
    assert any("stale" in p for p in problems)


def test_firewall_accepts_a_faithful_draft(moon):
    assert si.verify({"sentences": [{"text": "Only 6% self-extinguish here.", "cites": ["E2"]}], "pack_hash": moon["hash"]}, moon) == []


def test_every_published_si_briefing_passes_the_firewall():
    assert SI_WEB["meta"]["verified"] == SI_WEB["meta"]["total"] == len(PACKS)
    for kind in ("habitat", "investigation"):
        for pid, b in SI_WEB[kind].items():
            pack = PACKS[f"{kind}:{pid}"]
            assert b["evidence"] == pack["items"]
            if b["source"] == "si":
                draft = {"headline": b["headline"], "sentences": b["sentences"], "pack_hash": pack["hash"]}
                assert si.verify(draft, pack) == []


def test_deterministic_fallback_is_built_from_evidence(moon):
    for s in si.deterministic_brief(moon):
        assert s["text"] == moon["items"][s["cites"][0]]


def test_search_corpus_has_sources():
    corpus = json.loads(re.sub(r"^window\.CORPUS=|;$", "", (WEB_DATA / "corpus.js").read_text(encoding="utf-8")))
    assert len(corpus) > 100
    assert all(d["title"] and d["text"] for d in corpus)
    assert all(d["url"].startswith("https://psi.nasa.gov/") for d in corpus if d["kind"] == "NASA PSI")


@pytest.mark.skipif(not (ROOT / "data" / "psi" / "PSI-69").exists(), reason="raw PSI files not downloaded")
def test_silver_layer_rebuilds_the_same_records():
    from pipeline import silver
    ens, _, _ = silver.build()
    assert len(ens) == EMBER["summary"]["records"]
    assert ens["x_o2"].dropna().between(0, 1).all()
    assert ens["p_atm"].dropna().gt(0).all()


def test_solid_flammability_boundary_matches_the_nasa_report():
    from pipeline import solids
    a = [x / 10 for x in range(1, 400)]
    o2 = solids.boundary_o2(a)
    k = int(o2.argmin())
    assert 13.4 <= o2[k] <= 13.7 and 8 <= a[k] <= 12
    assert abs(float(solids.boundary_o2(0.0)) - 19.4) < 0.01
    S = EMBER["solids"]
    assert S["min_o2_pct"] < S["g1_upward_limit_pct"]
    assert all(h["burns_in_still_air"] for h in S["habitats"])
    assert all(h["extrapolated"] for h in S["habitats"] if h["o2_pct"] > S["tested_o2_pct"][1])


def test_solid_gas_data_is_clean():
    pts = EMBER["solids"]["points"]
    assert len(pts) == EMBER["solids"]["n_tests"] == 129
    assert all(p["o2_final_pct"] is None or p["o2_final_pct"] > 10 for p in pts)
    assert sum(1 for q in EMBER["qc"] if q["psi_id"] == "PSI-25" and "final O2" in q["campo"]) == 3
    S = EMBER["solids"]
    assert S["co_rods_low_o2_median_ppm"] > S["co_rods_high_o2_median_ppm"]
