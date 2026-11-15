"""Rebuild the published results from the published records, without the NASA download.

web/data/downloads/ensayos.csv is the clean dataset the site offers for download. Feeding
it back through the pipeline must give exactly what the site shows: the gold summaries,
the retrained droplet model (all 200 bootstrap fits), the crew-atmosphere answers, the
next-experiment ranking, and every SI evidence pack and briefing. Anyone can rerun this
to check the published numbers from the published data.
"""

import json
from typing import Any

import pandas as pd
import pytest

from pipeline import gold, models, si
from pipeline.common import WEB_DATA

EMBER = json.loads((WEB_DATA / "ember.json").read_text(encoding="utf-8"))
ENS = pd.read_csv(WEB_DATA / "downloads" / "ensayos.csv", parse_dates=["fecha"])


def as_published(x: Any) -> Any:
    """The same conversion the pipeline applies before writing ember.json."""
    return json.loads(json.dumps(gold._jsonable(x), ensure_ascii=False))


def differences(a: Any, b: Any, path: str = "", tol: float = 1e-9) -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b):
            return [f"{path}: keys {sorted(set(a) ^ set(b))}"]
        return [d for k in a for d in differences(a[k], b[k], f"{path}.{k}", tol)]
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path}: length {len(a)} vs {len(b)}"]
        return [d for i, (x, y) in enumerate(zip(a, b, strict=True)) for d in differences(x, y, f"{path}[{i}]", tol)]
    if isinstance(a, float) or isinstance(b, float):
        if a is None or b is None or abs(a - b) > tol:
            return [f"{path}: {a} vs {b}"]
        return []
    return [] if a == b else [f"{path}: {a!r} vs {b!r}"]


@pytest.mark.parametrize("name, build", [
    ("coverage", gold.coverage), ("suppression", gold.suppression), ("o2_bands", gold.o2_bands),
    ("survival", gold.survival), ("records", gold.records_payload)])
def test_gold_summaries_rebuild_from_the_published_records(name, build):
    assert differences(as_published(build(ENS)), EMBER[name], name) == []


@pytest.fixture(scope="module")
def rebuilt_models():
    return as_published(models.build(ENS))


@pytest.mark.parametrize("part", ["flex", "cfig", "habitat_check", "next"])
def test_models_retrain_to_exactly_the_published_ones(rebuilt_models, part):
    # Seeded bootstrap and cross-validation: the retrained model matches to the last digit.
    assert differences(rebuilt_models[part], EMBER[part], part) == []


def test_retrained_model_keeps_the_headline_numbers(rebuilt_models):
    hc = {h["habitat"]: h["fuels"]["Methanol"] for h in rebuilt_models["habitat_check"]}
    auc = next(m["auc"] for m in rebuilt_models["flex"]["validation"]["models"] if m["key"] == "lr")
    assert round(100 * hc["cabin"]["p"]) == 75 and round(100 * hc["moon_base"]["p"]) == 8
    assert round(auc, 2) == 0.88


def test_si_layer_rebuilds_byte_for_byte(tmp_path, monkeypatch):
    # Write into a temporary folder; the committed drafts are read, nothing in the repo is touched.
    for name, value in {"SI_DIR": tmp_path, "PACKS": tmp_path / "evidence_packs.json",
                        "REPORT": tmp_path / "verification.json", "WEB_DATA": tmp_path / "web"}.items():
        monkeypatch.setattr(si, name, value)
    ok, total = si.build(EMBER)
    assert ok == total == 33
    # corpus.js (the NASA-text search) also needs the PSI catalog download; the weekly rebuild in CI covers it.
    pairs = {
        tmp_path / "evidence_packs.json": WEB_DATA / "downloads" / "si_evidence_packs.json",
        tmp_path / "verification.json": WEB_DATA / "downloads" / "si_verification.json",
        tmp_path / "web" / "si.js": WEB_DATA / "si.js",
    }
    for new, published in pairs.items():
        assert new.read_bytes() == published.read_bytes(), f"{published.name} differs from a rebuild"
