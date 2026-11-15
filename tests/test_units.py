"""Unit tests for the pure helpers of the pipeline (no NASA download needed)."""

import math

import numpy as np
import pandas as pd
import pytest

from pipeline import common, si
from pipeline.common import HABITATS, PSI_TO_ATM, QCLog
from pipeline.gold import _score, wilson
from pipeline.investigations import _clean_col, _fmt, _kernel, _sentences
from pipeline.models import PHYS, data_status, out_of_range, physics, stage_matrix
from pipeline.moonbase import TAGS, fact
from pipeline.silver import _fix_autofill
from pipeline.solids import _family, boundary_o2, stretch_to_flow

# ---------------------------------------------------------------- units and habitats


def test_unit_constants():
    assert 14.6959 * PSI_TO_ATM == pytest.approx(1.0)
    assert common.BAR_TO_ATM == pytest.approx(1 / 1.01325, rel=1e-5)
    assert common.MMHG_PER_ATM == 760.0


@pytest.mark.parametrize("hid, o2, psi", [("cabin", 0.21, 14.7), ("eva_prep", 0.265, 10.2), ("moon_base", 0.30, 10.2),
                                          ("exploration", 0.34, 8.2), ("suit", 1.0, 4.3)])
def test_habitat_atmospheres_match_their_sources(hid, o2, psi):
    h = next(x for x in HABITATS if x["id"] == hid)
    source = str(h["source"])
    assert h["x_o2"] == o2
    assert float(h["p_atm"]) / PSI_TO_ATM == pytest.approx(psi, abs=0.05)  # type: ignore[arg-type]
    assert f"{psi:g} psi" in source or f"{psi:g} psia" in source or hid == "cabin"


def test_habitat_ids_are_unique():
    ids = [h["id"] for h in HABITATS]
    assert len(ids) == len(set(ids)) == 5


def test_qc_log_keeps_the_original_value():
    log = QCLog()
    log.add("PSI-69", "FLEX", 12, "Burn time; s", "~4.3", "4.3", "approximate value")
    assert log.rows == [{"psi_id": "PSI-69", "experimento": "FLEX", "registro": "12", "campo": "Burn time; s",
                         "valor_original": "~4.3", "valor_nuevo": "4.3", "regla": "approximate value"}]

# ---------------------------------------------------------------- Wilson interval and ranking score


def test_wilson_textbook_value():
    lo, hi = wilson(5, 10, z=1.96)
    assert (lo, hi) == (pytest.approx(0.2366, abs=1e-4), pytest.approx(0.7634, abs=1e-4))


def test_wilson_edges():
    assert wilson(0, 0) == [None, None]
    lo, hi = wilson(0, 20)
    assert lo == 0.0 and 0 < hi < 0.2
    lo, hi = wilson(20, 20)
    assert hi == 1.0 and 0.8 < lo < 1


def test_wilson_narrows_with_more_tests():
    widths = [np.subtract(*wilson(n // 2, n)[::-1]) for n in (10, 40, 160)]
    assert widths[0] > widths[1] > widths[2]


def test_score_bounds_and_weights():
    best, parts = _score(300, 1.0, 3, 1.0)
    assert best == 100.0 and set(parts) == {"volume", "quality", "agreement", "closeness"}
    assert _score(0, 0.0, 0, 0.0)[0] == 0.0
    # Volume saturates at 300 tests and agreement at 3 investigations.
    assert _score(10_000, 1.0, 9, 1.0)[0] == 100.0
    assert _score(300, 1.0, 3, 0.0)[0] == pytest.approx(80.0)

# ---------------------------------------------------------------- physics features of the droplet model


def test_flame_temperature_of_methanol_in_air_by_hand():
    # Methanol in 21% O2 / 79% N2: Y_O2 = 6.72 / 28.84, cp = 33.42 J/mol/K over 0.02884 kg/mol.
    yo = 0.21 * 32 / (0.21 * 32 + 0.79 * 28)
    cp = (0.21 * 35 + 0.79 * 33) / ((0.21 * 32 + 0.79 * 28) / 1000)
    expected = 298 + 19.9e6 * yo / (cp * (1.5 + yo))
    got = physics([[0, 0.21, 0.0, 0, 0, 3.0]])["t_st"][0]
    assert got == pytest.approx(expected) and got == pytest.approx(2607, abs=2)


def test_flame_temperature_responds_to_oxygen_fuel_and_diluents():
    t = lambda *row: physics([row])["t_st"][0]  # noqa: E731
    air = t(0, 0.21, 0, 0, 0, 3)
    assert t(0, 0.30, 0, 0, 0, 3) > air                      # more oxygen burns hotter
    assert t(1, 0.21, 0, 0, 0, 3) > air                      # heptane releases more heat than methanol
    assert t(0, 0.21, 0, 0.2, 0, 3) < air                    # CO2 soaks up heat
    # Helium in place of nitrogen raises the adiabatic temperature (monatomic, lower molar heat capacity);
    # its real-world cooling through fast heat diffusion enters the model separately, as x_he.
    assert t(0, 0.21, 0, 0, 0.2, 3) > air


def test_residence_time_feature():
    c = physics([[0, 0.21, np.log(0.5), 0, 0, 2.0]])
    assert c["res"][0] == pytest.approx(np.log(4.0 * 0.5))
    assert c["hep_res"][0] == 0 and c["hep_t_st"][0] == 0


def test_stage_matrices_have_the_declared_columns():
    rows = [[1, 0.25, 0.1, 0.05, 0.0, 3.1], [0, 0.18, -0.3, 0.0, 0.1, 2.0]]
    assert stage_matrix(rows, "disruption").shape == (2, 6)
    ext = stage_matrix(rows, "extinction")
    assert ext.shape == (2, 6) and np.allclose(ext[:, 0], [1, 0])


def test_physics_constants_are_the_published_ones():
    assert PHYS["q_j_kg"] == {"Methanol": 19.9e6, "Heptane": 44.6e6}
    assert PHYS["molar_mass"] == {"o2": 32.0, "n2": 28.0, "co2": 44.0, "he": 4.0}

# ---------------------------------------------------------------- out-of-data guard


@pytest.mark.parametrize("dist, beyond, status", [
    (0.0, (), "within"), (1.0, (), "within"), (1.0000001, (), "extrapolating"), (0.5, ("x_o2",), "extrapolating"),
    (2.0, (), "extrapolating"), (2.0000001, (), "outside"), (5.0, ("x_o2",), "outside")])
def test_data_status_boundaries(dist, beyond, status):
    assert data_status(dist, 1.0, beyond) == status


def test_out_of_range_ignores_fuel_and_tolerates_rounding():
    model = {"features": ["heptane", "x_o2", "log_p"], "ranges": {"heptane": [0, 1], "x_o2": [0.12, 0.34], "log_p": [-0.4, 1.1]}}
    assert out_of_range(model, [5, 0.34 + 5e-10, 1.1]) == []
    assert out_of_range(model, [0, 0.35, 1.2]) == ["x_o2", "log_p"]
    assert out_of_range(model, [0, 0.11, 0.0]) == ["x_o2"]

# ---------------------------------------------------------------- SI firewall helpers


def test_number_formatting():
    assert si.pct(0.0781) == "8%" and si.pct(0.0781, 1) == "7.8%"
    assert si.o2(0.3) == "30%" and si.o2(0.265) == "26.5%"
    assert si.psi(1.0) == "14.7 psi" and si.psi(0.694) == "10.2 psi"


@pytest.mark.parametrize("text, nums", [
    ("75% in cabin air, 8% in lunar-base air", {"75", "8"}),
    ("1,955 records and 191 corrections", {"1955", "191"}),
    ("0.70 atm equals 0.7 atm", {"0.7"}),
    ("PSI-69 and NTRS-20240007817", set()),          # identifiers after a letter and hyphen are skipped
    ("ICES-2024-128", {"128"}),                        # later segments count, which only makes the check stricter
    ("no numbers here", set())])
def test_numbers_extracted_for_the_firewall(text, nums):
    assert si.numbers(text) == nums


@pytest.mark.parametrize("text", ["The base is safe.", "It is completely safe", "safe to use", "certified material",
                                  "We guarantee it", "approved for flight", "no fire risk", "risk-free", "it will never ignite"])
def test_firewall_catches_safety_verdicts(text):
    assert si.VERDICT.search(text)


@pytest.mark.parametrize("text", ["fire safety insights", "safety margin", "the data stop at 22.7% O2"])
def test_firewall_allows_safety_vocabulary(text):
    assert not si.VERDICT.search(text)


def test_check_sentence_reports_each_problem():
    items = {"E1": "Methanol goes out on its own 75% of the time."}
    assert si.check_sentence({"text": "It goes out 75% of the time.", "cites": ["E1"]}, items) == []
    problems = si.check_sentence({"text": "It is safe: 90% go out.", "cites": ["E9"]}, items)
    assert any("unknown citation" in p for p in problems)
    assert any("not in the cited evidence" in p for p in problems)
    assert any("safety verdict" in p for p in problems)
    assert si.check_sentence({"text": "x" * 500, "cites": ["E1"]}, items) == ["sentence too long"]
    assert "no citation" in si.check_sentence({"text": "Plain words.", "cites": []}, items)


def test_verify_requires_a_fresh_short_draft():
    pack = {"hash": "abc", "items": {"E1": "37 records near lunar-base air."}}
    ok = {"pack_hash": "abc", "headline": "37 records", "sentences": [{"text": "Only 37 records.", "cites": ["E1"]}]}
    assert si.verify(ok, pack) == []
    assert si.verify(None, pack) == ["no draft"]
    assert si.verify({**ok, "pack_hash": "old"}, pack)[0].startswith("stale")
    assert "a brief needs 1 to 6 sentences" in si.verify({**ok, "sentences": []}, pack)
    assert any(p.startswith("headline") for p in si.verify({**ok, "headline": "99 records"}, pack))

# ---------------------------------------------------------------- text and table helpers


def test_sentences_stop_after_n_and_trim_dangling_markers():
    assert _sentences("One. Two. Three.", 2) == "One. Two."
    assert _sentences("Goals are as follows. 1. Burn. 2. Measure.", 1).startswith("Goals are as follows. 1. Burn.")
    assert _sentences(None) == "" and _sentences("  spaced   out  ") == "spaced out"


def test_clean_col_repairs_nasa_headers():
    assert _clean_col("﻿O initial  (%)") == "O2 initial (%)"
    assert _clean_col("CO initial") == "CO2 initial"
    assert _clean_col("Mass ?-g") == "Mass µg"


def test_fmt():
    assert _fmt(np.int64(7)) == "7" and _fmt(12345.6) == "12,346" and _fmt(0.012345) == "0.0123"
    assert len(_fmt("x" * 100)) == 48


def test_kernel_peaks_at_the_habitat():
    h = {"x_o2": 0.30, "p_atm": 0.694}
    assert _kernel(0.30, 0.694, h) == pytest.approx(1.0)
    assert _kernel(0.33, 0.694, h) == pytest.approx(math.exp(-0.5))
    assert _kernel(0.30, None, h) == pytest.approx(1.0)
    assert _kernel(0.30, 0.694 * 1.3, h) == pytest.approx(math.exp(-0.5))


def test_autofill_errors_are_fixed_and_logged(monkeypatch):
    from pipeline import silver
    log = QCLog()
    monkeypatch.setattr(silver, "QC", log)
    s = pd.Series(["CH4", "CH5", "C2H6 + N3", "CO2"])
    out = _fix_autofill(s, "PSI-21", "ACME", "Fuel")
    assert out.tolist() == ["CH4", "CH4", "C2H4 + N2", "CO2"]
    assert [r["valor_original"] for r in log.rows] == ["CH5", "C2H6 + N3"]

# ---------------------------------------------------------------- solids and lunar-base facts


def test_bass2_boundary_equation():
    # NASA/TM-20210011385 Eq. (6.1): minimum at moderate stretch, rising slowly at high stretch.
    a = np.array([1.0, 4.0, 8.0, 12.0, 40.0])
    o2 = boundary_o2(a)
    assert o2[0] == pytest.approx(6 * math.exp(-0.5) + 0.0167 + 13.4)
    assert o2[0] > o2[1] > o2[2] and o2[-1] > o2[3]
    assert stretch_to_flow(1.5, r_cm=1.0) == pytest.approx(1.0)


@pytest.mark.parametrize("material, family", [("PMMA rod 1 cm", "PMMA rod"), ("Nomex HT90-40", "Nomex fabric"),
                                              ("SIBAL cotton", "SIBAL fabric")])
def test_material_families(material, family):
    assert _family(material) == family


def test_facts_must_carry_a_provenance_tag():
    assert fact("O2", 0.3, "assumed", "challenge page")["tag"] == "assumed"
    assert set(TAGS) >= {"measured", "model", "gap"}
    with pytest.raises(AssertionError):
        fact("O2", 0.3, "guess", "nowhere")
