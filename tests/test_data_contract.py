"""Data contract of the published outputs, and the headline numbers quoted in the docs.

These tests read only committed files (data/gold, web/data), so they run without the
NASA download and catch an output that drifts from its schema, its physics or the
numbers the README, SUBMISSION and the website quote.
"""

import filecmp
import json
import re

import pandas as pd
import pytest

from pipeline.common import GOLD, HABITATS, ROOT, WEB_DATA

DL = WEB_DATA / "downloads"
EMBER = json.loads((WEB_DATA / "ember.json").read_text(encoding="utf-8"))
ENS = pd.read_csv(DL / "ensayos.csv")
INV = pd.read_csv(DL / "investigaciones.csv")
QC = pd.read_csv(DL / "qc_log.csv", keep_default_na=False)
SI = json.loads(re.sub(r"^window\.SI=|;$", "", (WEB_DATA / "si.js").read_text(encoding="utf-8")))
DOCS = {name: (ROOT / name).read_text(encoding="utf-8") for name in ("README.md", "SUBMISSION.md")}

OUTCOMES = {"autoextincion", "extincion", "flash", "completo", "corte_de_flujo", "disrupcion", "no_ignicion", "soplado"}
GOES_OUT = {"autoextincion", "extincion", "flash"}
KEEPS_BURNING = {"completo", "corte_de_flujo", "disrupcion"}

# ---------------------------------------------------------------- records (ensayos.csv)


def test_records_have_the_published_schema():
    assert list(ENS.columns) == [
        "test_uid", "psi_id", "experimento", "familia", "combustible", "material_familia", "x_o2", "o2_ubicacion",
        "o2_supuesto", "p_atm", "p_supuesta", "x_co2", "x_he", "flujo_cm_s", "barrido_flujo", "direccion_flujo", "d0_mm",
        "gravedad", "ignicion", "autoextincion", "resultado", "llama_fria", "tad_k", "zst", "tasa_quemado",
        "tiempo_quemado_s", "d_ext_mm", "n_eventos", "con_resultado", "fecha", "qc_flags"]
    assert len(ENS) == EMBER["summary"]["records"] == 1955


def test_record_ids_are_unique_and_carry_their_investigation():
    assert ENS["test_uid"].is_unique
    assert (ENS["test_uid"].str.split(":").str[0] == ENS["psi_id"]).all()
    assert set(ENS["psi_id"]) <= set(INV["psi_id"])


def test_gas_mixtures_are_physical():
    for c in ("x_o2", "x_co2", "x_he"):
        v = ENS[c].dropna()
        assert ((v >= 0) & (v <= 1)).all(), c
    total = ENS[["x_o2", "x_co2", "x_he"]].fillna(0).sum(axis=1)
    assert (total <= 1 + 1e-9).all()
    assert (ENS["p_atm"].dropna() > 0).all() and ENS["p_atm"].max() <= 5.0


def test_measurements_are_in_physical_ranges():
    assert ENS["d0_mm"].dropna().between(0.5, 10).all()
    assert ENS["tad_k"].dropna().between(1000, 3500).all()
    assert (ENS["tasa_quemado"].dropna() >= 0).all()
    assert (ENS["gravedad"] == "ug").all()  # flight data only
    for c in ("ignicion", "autoextincion", "llama_fria"):
        assert set(ENS[c].dropna().unique()) <= {0.0, 1.0}, c


def test_outcomes_and_extinction_flag_agree():
    labeled = ENS[ENS["resultado"].notna()]
    assert set(labeled["resultado"]) <= OUTCOMES
    assert (ENS["con_resultado"] == ENS["resultado"].notna()).all()
    assert int(ENS["con_resultado"].sum()) == EMBER["summary"]["with_outcome"] == 688
    out = ENS[ENS["autoextincion"] == 1]["resultado"]
    burn = ENS[ENS["autoextincion"] == 0]["resultado"]
    assert set(out) <= GOES_OUT and set(burn) <= KEEPS_BURNING


def test_atmosphere_counts_quoted_on_the_site():
    # Recomputed from the published CSV with the definitions of pipeline/gold.coverage.
    s = EMBER["summary"]
    moon = next(h for h in HABITATS if h["id"] == "moon_base")
    amb = ENS[ENS["x_o2"].notna() & ENS["p_atm"].notna() & (ENS["o2_ubicacion"] == "ambiente")]
    near_moon = amb[(amb["x_o2"] >= moon["x_o2"] - 0.02) & (amb["p_atm"] <= moon["p_atm"] + 0.05)]
    assert len(amb) == s["ambient"] == 1613
    assert len(near_moon) == s["moon_envelope"] == 37

# ---------------------------------------------------------------- corrections log and investigations


def test_every_correction_keeps_its_original_value_and_rule():
    assert len(QC) == EMBER["summary"]["qc_fixes"] == 191
    assert list(QC.columns) == ["psi_id", "experimento", "registro", "campo", "valor_original", "valor_nuevo", "regla"]
    for c in ("psi_id", "campo", "valor_original", "regla"):
        assert (QC[c].astype(str).str.strip() != "").all(), c
    assert (QC["valor_original"] != QC["valor_nuevo"]).all()
    ids = {p for v in QC["psi_id"] for p in re.findall(r"PSI-\d+", v)}
    assert ids <= set(INV["psi_id"])


def test_investigations_table():
    assert len(INV) == EMBER["summary"]["investigations"] == 24
    assert INV["psi_id"].is_unique
    assert (INV["o2_min"].dropna() <= INV.loc[INV["o2_min"].notna(), "o2_max"]).all()
    assert INV["psi_url"].str.startswith("https://").all()


def test_gold_layer_and_downloads_are_the_same_files():
    for f in GOLD.iterdir():
        assert filecmp.cmp(f, DL / f.name, shallow=False), f.name

# ---------------------------------------------------------------- the site's data file (ember.json)


def test_site_habitats_are_the_pipeline_habitats():
    assert [h["id"] for h in EMBER["habitats"]] == [h["id"] for h in HABITATS]
    assert [h["habitat"] for h in EMBER["habitat_check"]] == [h["id"] for h in HABITATS]


def test_model_export_is_complete_and_consistent():
    m = EMBER["flex"]
    assert m["n"] == len(m["train"]) == len(m["train_std"]) == sum(m["outcomes"].values())
    assert len(m["mu"]) == len(m["sd"]) == len(m["features"]) == 6 and all(s > 0 for s in m["sd"])
    for st in m["stages"].values():
        assert len(st["coef"]) == len(st["features"]) + 1
        assert len(st["boot"]) >= 100 and all(len(b) == len(st["coef"]) for b in st["boot"])

# ---------------------------------------------------------------- numbers quoted in the docs


def _hc(habitat, fuel="Methanol"):
    return next(h for h in EMBER["habitat_check"] if h["habitat"] == habitat)["fuels"][fuel]


def _pct(p):
    return f"{100 * p:.0f}%"


def headline_numbers():
    s, v = EMBER["summary"], {x["key"]: x for x in EMBER["flex"]["validation"]["models"]}
    moon, cabin = _hc("moon_base"), _hc("cabin")
    return {
        "README.md": [
            f"**{_pct(cabin['p'])}**", f"**{_pct(moon['p'])}**", f"interval {100 * moon['lo']:.0f}–{_pct(moon['hi'])}",
            f"apart {_pct(moon['disruption']['p'])}", f"completion {_pct(moon['completion']['p'])}",
            f"**{s['moon_envelope']} of {s['ambient']:,}**", f"above {EMBER['solids']['max_o2_any_solid_pct']}% O₂",
            f"**AUC {v['lr']['auc']:.2f}**", f"±{v['lr']['auc_sd']:.2f}", f"Brier {v['lr']['brier']:.3f}",
            f"({v['lr6']['auc']:.2f})", f"({v['gb']['auc']:.2f})", f"({v['o2']['auc']:.2f})",
            f"**{s['qc_fixes']}**", f"**{SI['meta']['verified']} of {SI['meta']['total']}**", f"{s['records']:,}"],
        "SUBMISSION.md": [
            f"{_pct(cabin['p'])} of the time in cabin air", f"only {_pct(moon['p'])} in lunar-base air",
            f"{s['moon_envelope']} of {s['ambient']:,} records", f"{s['records']:,} flight-test records",
            f"({s['qc_fixes']} logged corrections)", f"AUC {v['lr']['auc']:.2f}", f"Brier {v['lr']['brier']:.3f}",
            f"{SI['meta']['verified']} of {SI['meta']['total']} pass"],
    }


@pytest.mark.parametrize("doc", ["README.md", "SUBMISSION.md"])
def test_docs_quote_the_current_numbers(doc):
    missing = [n for n in headline_numbers()[doc] if n not in DOCS[doc]]
    assert not missing, f"{doc} does not quote these current values: {missing}"


def test_every_si_briefing_passed_the_firewall():
    assert SI["meta"]["verified"] == SI["meta"]["total"] == sum(len(v) for k, v in SI.items() if k != "meta")
