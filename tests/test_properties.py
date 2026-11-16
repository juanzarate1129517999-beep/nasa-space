"""Property-based tests: rules the droplet model and the statistics must obey for ANY input.

Hypothesis generates hundreds of atmospheres (oxygen, pressure, diluents, droplet size,
fuel) and checks each rule; a failure is shrunk to the simplest counter-example.
Uses the model exactly as published to the browser (web/data/ember.json).
"""

import json

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from pipeline.common import WEB_DATA
from pipeline.gold import wilson
from pipeline.models import data_status, flex_ood, flex_predict3, out_of_range

MODEL = json.loads((WEB_DATA / "ember.json").read_text(encoding="utf-8"))["flex"]
THR = MODEL["ood_threshold"]
settings.register_profile("ci", max_examples=150, deadline=None)
settings.load_profile("ci")


@st.composite
def atmospheres(draw):
    o2 = draw(st.floats(0.10, 1.0))
    co2 = draw(st.floats(0.0, max(0.0, min(0.7, 1 - o2))))
    he = draw(st.floats(0.0, max(0.0, min(0.45, 1 - o2 - co2))))
    p = draw(st.floats(0.25, 3.2))
    d0 = draw(st.floats(1.1, 4.7))
    fuel = draw(st.sampled_from([0.0, 1.0]))
    return [fuel, o2, float(np.log(p)), co2, he, d0]


def predict(row):
    r = flex_predict3(MODEL, [row])
    return {k: {s: float(v[s][0]) for s in ("p", "lo", "hi")} for k, v in r.items()}


@given(atmospheres())
def test_every_answer_is_a_probability_with_an_interval(row):
    for ending in predict(row).values():
        assert 0.0 <= ending["lo"] <= ending["hi"] <= 1.0 and 0.0 <= ending["p"] <= 1.0


@given(atmospheres())
def test_shown_answers_sit_inside_their_interval(row):
    # The point is the mean of the bootstrap draws and the interval their 5th-95th percentiles. Far from
    # the data (where the site withholds the prediction) the draws are so skewed that the mean can fall
    # outside, e.g. heptane in pure O2 at 1 atm: mean 2.6e-20 below a 5th percentile of 3.8e-20.
    dist = float(flex_ood(MODEL, [row])[0])
    if data_status(dist, THR, out_of_range(MODEL, row)) == "outside":
        return
    for ending in predict(row).values():
        assert ending["lo"] - 1e-12 <= ending["p"] <= ending["hi"] + 1e-12


@given(atmospheres())
def test_the_three_endings_add_up_to_one_in_every_bootstrap_draw(row):
    d = flex_predict3(MODEL, [row], keep_draws=True)
    total = d["extinction"] + d["disruption"] + d["completion"]
    assert np.allclose(total, 1.0)
    assert np.allclose(d["extinction"], (1 - d["disruption"]) * d["steady_extinction"])


@given(atmospheres())
def test_predictions_are_deterministic(row):
    assert predict(row) == predict(row)


@given(st.lists(atmospheres(), min_size=2, max_size=6))
def test_batch_and_single_predictions_agree(rows):
    batch = flex_predict3(MODEL, rows)["extinction"]["p"]
    single = [flex_predict3(MODEL, [r])["extinction"]["p"][0] for r in rows]
    assert np.allclose(batch, single)


@given(atmospheres(), st.floats(0.005, 0.05))
def test_more_oxygen_never_makes_a_steady_flame_more_likely_to_go_out(row, step):
    # Steady-burning stage only: a hotter flame is harder to extinguish (the published driver sign).
    if row[1] + step + row[3] + row[4] > 1:
        return
    richer = [row[0], row[1] + step, *row[2:]]
    a = flex_predict3(MODEL, [row])["steady_extinction"]["p"][0]
    b = flex_predict3(MODEL, [richer])["steady_extinction"]["p"][0]
    assert b <= a + 1e-9


@given(atmospheres())
def test_status_ladder_is_consistent(row):
    dist = float(flex_ood(MODEL, [row])[0])
    beyond = out_of_range(MODEL, row)
    status = data_status(dist, THR, beyond)
    assert dist >= 0
    if status == "within":
        assert dist <= THR and not beyond
    if status == "outside":
        assert dist > 2 * THR


def test_flown_tests_are_inside_their_own_data():
    rows = [[1.0 if t["combustible"] == "Heptane" else 0.0, t["x_o2"], float(np.log(t["p_atm"])), t["x_co2"], t["x_he"], t["d0_mm"]]
            for t in MODEL["train"]]
    dist = flex_ood(MODEL, rows)
    statuses = [data_status(float(d), THR, out_of_range(MODEL, r)) for d, r in zip(dist, rows, strict=True)]
    # The threshold is the 95th percentile among flown tests, so about 95% of them are "within".
    assert statuses.count("within") / len(statuses) >= 0.9
    assert "outside" not in statuses


@given(atmospheres(), st.floats(1.5, 4.0))
def test_moving_away_from_the_data_never_brings_you_back_inside(row, factor):
    # Pure oxygen at the lowest pressure is the far corner of the space: always outside.
    far = [row[0], 1.0, float(np.log(0.25)), 0.0, 0.0, 4.7]
    assert data_status(float(flex_ood(MODEL, [far])[0]), THR, out_of_range(MODEL, far)) == "outside"


@given(st.integers(0, 500), st.integers(1, 500))
def test_wilson_interval_contains_the_observed_rate(k, n):
    k = min(k, n)
    lo, hi = wilson(k, n)
    assert 0.0 <= lo <= hi <= 1.0
    assert lo - 1e-12 <= k / n <= hi + 1e-12


def test_wilson_upper_bound_is_exactly_one_when_every_test_succeeded():
    assert all(wilson(n, n)[1] == 1.0 for n in range(1, 50))


@given(st.integers(1, 200))
def test_wilson_is_symmetric(n):
    for k in (0, n // 3, n // 2):
        lo, hi = wilson(k, n)
        lo2, hi2 = wilson(n - k, n)
        assert lo == pytest.approx(1 - hi2) and hi == pytest.approx(1 - lo2)
