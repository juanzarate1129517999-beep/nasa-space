"""Reference answers for the Fire Lab parity test (tests/e2e/parity.test.mjs).

Uses the model exactly as published to the browser (web/data/ember.json) and the
pipeline's own functions, so the browser test checks that web/app.js computes
the same chances, intervals and data status as pipeline/models.py.

Prints JSON: {"cases": [...], "habitats": [...]}.
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pipeline.models import data_status, flex_ood, flex_predict3, out_of_range  # noqa: E402

STEPS = {"o2": 0.005, "p": 0.005, "co2": 0.01, "he": 0.01, "d0": 0.05}


def on_grid(v, step):
    return round(round(v / step) * step, 4)


def reference(model, fuel, o2, p, co2, he, d0):
    row = [1.0 if fuel == "Heptane" else 0.0, o2, float(np.log(p)), co2, he, d0]
    r = flex_predict3(model, [row])
    dist = float(flex_ood(model, [row])[0])
    status = data_status(dist, model["ood_threshold"], out_of_range(model, row))
    pick = lambda k: {s: float(r[k][s][0]) for s in ("p", "lo", "hi")}  # noqa: E731
    return {"fuel": fuel, "o2": o2, "p": p, "co2": co2, "he": he, "d0": d0, "status": status,
            "extinction": pick("extinction"), "disruption": pick("disruption")}


def main(n_random=24, seed=2026):
    ember = json.loads((ROOT / "web" / "data" / "ember.json").read_text(encoding="utf-8"))
    model = ember["flex"]
    rng = np.random.default_rng(seed)
    cases = []
    R = model["ranges"]
    # Near flown ISS tests (mostly "within" the data), on the slider grid so the browser can set them exactly.
    train = model["train"]
    for i in rng.choice(len(train), n_random, replace=False):
        t = train[i]
        o2, co2, he = (on_grid(t[k], STEPS[s]) for k, s in (("x_o2", "o2"), ("x_co2", "co2"), ("x_he", "he")))
        if o2 + co2 + he > 1 or not 0.25 <= t["p_atm"] <= 3.2:
            continue
        cases.append(reference(model, t["combustible"], o2, on_grid(t["p_atm"], STEPS["p"]), co2, he,
                               on_grid(min(4.7, max(1.1, t["d0_mm"])), STEPS["d0"])))
    # Anywhere in a wide box around the flown range (mostly extrapolating or outside).
    while len(cases) < 2 * n_random:
        fuel = "Heptane" if rng.random() < 0.5 else "Methanol"
        o2 = on_grid(rng.uniform(0.12, 0.40), STEPS["o2"])
        p = on_grid(float(np.exp(rng.uniform(np.log(0.3), np.log(3.0)))), STEPS["p"])
        co2 = on_grid(rng.choice([0.0, 0.0, rng.uniform(0, 0.3)]), STEPS["co2"])
        he = on_grid(rng.choice([0.0, 0.0, rng.uniform(0, 0.3)]), STEPS["he"])
        d0 = on_grid(rng.uniform(R["d0_mm"][0], R["d0_mm"][1]), STEPS["d0"])
        if o2 + co2 + he > 0.95:
            continue
        cases.append(reference(model, fuel, o2, p, co2, he, d0))
    # Far outside the data (pure oxygen at low pressure, like a suit): prediction must be withheld.
    cases.append(reference(model, "Methanol", 1.0, 0.3, 0.0, 0.0, 3.0))
    statuses = {c["status"] for c in cases}
    assert {"within", "outside"} <= statuses, f"cases must cover several data statuses, got {statuses}"
    habitats = [{"id": h["habitat"], **{f: h["fuels"][f]["p"] for f in h["fuels"]},
                 "status": {f: h["fuels"][f]["status"] for f in h["fuels"]}} for h in ember["habitat_check"]]
    json.dump({"d0_median": model["d0_median"], "cases": cases, "habitats": habitats}, sys.stdout)


if __name__ == "__main__":
    main()
