"""The cleaning rules of pipeline/silver.py, on small tables in NASA's own format.

Each fixture is a miniature PSI table written the way NASA publishes it (Latin-1, the
Windows-1252 en dash as an empty cell, mixed date formats...) and carrying one example
of every defect the pipeline corrects. The tests check the cleaned record and the entry
in the corrections log, so they run without the NASA download.
"""

import numpy as np
import pandas as pd
import pytest

from pipeline import silver
from pipeline.common import MMHG_PER_ATM, QCLog

FLEX_HEADER = ("Test #,FLEX Identifier,Test Date,Test GMT,Fuel,Ambient pressure; mmHg,O2 mole fraction,N2 mole fraction,"
               "CO2 mole fraction,He mole fraction,Droplet initial diameter; mm,Visible flame extinction diameter; mm,"
               "Burning rate constant; mm2/s,Burn time; s,End of burn")
FLEX_ROWS = [
    "1,F-001,3/5/2009,10:00:01,Methanol,760,0.21,0.79,0,0,2.0,0.9,0.52,4.3,Extinction",       # clean
    "2,F-002,3/5/2009,10:05:00,Heptane ,760,0.21,0.79,0,0,\x96,0.5,0.70,5.0,Disruption",      # en dash as empty
    "3,F-003,3/6/09,11:00:00,Methanol,532,0.30,0.70,0,0,3.0,1.0,0.60,~6.1,Completion",       # 2-digit year, ~ time
    "4,F-004,3/7/2009,12:00:00,Methanol,760,0.21,0.79,0,0,2.0,2.5,0.50,3.0,Extinction",      # d_ext > d0
    "5,F-005,3/8/2009,13:00:00,Methanol,760,0.21,0.79,0,0,2.1,0.8,0.50,3.2,Extinction",      # duplicate of 6
    "6,F-005,3/8/2009,13:00:00,Methanol,760,0.21,0.79,0,0,2.2,0.8,0.50,3.3,Extinction",
    "7,F-007,3/9/2009,14:00:00,Methanol,0,0.21,0.79,0,0,2.0,0.8,0.50,3.0,Extinction",        # 0 mmHg
    "8,F-008,3/9/2009,15:00:00,Methanol,760,0.25,0.70,0.10,0,2.0,0.8,0.50,3.0,EXTINCTION",   # fractions sum to 1.05
]


@pytest.fixture
def raw(tmp_path, monkeypatch):
    """A fresh corrections log and a RAW folder in tmp_path; returns a writer for NASA-style tables."""
    log = QCLog()
    monkeypatch.setattr(silver, "QC", log)
    monkeypatch.setattr(silver, "RAW", tmp_path)

    def write(psi, name, header, rows):
        folder = tmp_path / psi
        folder.mkdir(exist_ok=True)
        text = header + "\r\n" + "\r\n".join(rows) + "\r\n"
        # UTF-8 byte-order mark, Latin-1 body and CRLF line ends, as NASA's files arrive.
        (folder / f"{psi}_Experimental table_{name}.csv").write_bytes(b"\xef\xbb\xbf" + text.encode("latin-1"))
    return write, log


@pytest.fixture
def flex(raw):
    write, log = raw
    write("PSI-69", "FLEX", FLEX_HEADER, FLEX_ROWS)
    return silver.flex().set_index("test_uid"), log


def rules(log, field=None):
    return [r["regla"] for r in log.rows if field is None or r["campo"] == field]


def test_flex_output_has_the_shared_schema(flex):
    df, _ = flex
    assert list(df.reset_index().columns) == silver.SCHEMA
    assert list(df.index) == [f"PSI-69:{i}" for i in range(1, 9)]
    assert (df["psi_id"] == "PSI-69").all() and (df["experimento"] == "FLEX").all() and (df["familia"] == "gota").all()
    assert (df["gravedad"] == "ug").all() and (df["ignicion"] == 1.0).all()


def test_units_and_labels_are_converted(flex):
    df, _ = flex
    r = df.loc["PSI-69:1"]
    assert r["p_atm"] == pytest.approx(1.0) and r["x_o2"] == 0.21 and r["d0_mm"] == 2.0
    assert df.loc["PSI-69:3", "p_atm"] == pytest.approx(532 / MMHG_PER_ATM)
    assert df["resultado"].tolist() == ["extincion", "disrupcion", "completo", "extincion", "extincion", "extincion",
                                        "extincion", "extincion"]
    assert df["autoextincion"].tolist() == [1.0, 0.0, 0.0, 1, 1, 1, 1, 1]
    assert df.loc["PSI-69:2", "combustible"] == "Heptane"   # trailing space removed


def test_en_dash_becomes_an_empty_value_and_is_logged(flex):
    df, log = flex
    assert np.isnan(df.loc["PSI-69:2", "d0_mm"])
    entry = next(r for r in log.rows if r["campo"] == "Droplet initial diameter; mm")
    assert entry["registro"] == "2" and entry["valor_nuevo"] == "NaN" and "en dash" in entry["regla"]


def test_approximate_burn_time_is_kept_and_flagged(flex):
    df, log = flex
    assert df.loc["PSI-69:3", "tiempo_quemado_s"] == pytest.approx(6.1)
    assert "tiempo_aproximado" in df.loc["PSI-69:3", "qc_flags"]
    entry = next(r for r in log.rows if r["campo"] == "Burn time; s")
    assert (entry["valor_original"], entry["valor_nuevo"]) == ("~6.1", "6.1")


def test_two_digit_years_are_read_as_the_same_dates(flex):
    df, log = flex
    assert df.loc["PSI-69:3", "fecha"] == pd.Timestamp("2009-03-06")
    assert df["fecha"].notna().all()
    assert any("date formats" in r for r in rules(log, "Test Date"))


def test_extinction_diameter_larger_than_the_droplet_is_dropped(flex):
    df, log = flex
    assert np.isnan(df.loc["PSI-69:4", "d_ext_mm"]) and "diametro_extincion_mayor" in df.loc["PSI-69:4", "qc_flags"]
    assert df.loc["PSI-69:1", "d_ext_mm"] == 0.9
    assert any("larger than the initial diameter" in r for r in rules(log))


def test_duplicate_identifier_and_time_flags_both_records(flex):
    df, log = flex
    for uid in ("PSI-69:5", "PSI-69:6"):
        assert "identificador_repetido" in df.loc[uid, "qc_flags"]
    entry = next(r for r in log.rows if r["campo"] == "FLEX Identifier + Test GMT")
    assert entry["registro"] == "5, 6"


def test_zero_pressure_is_excluded(flex):
    df, log = flex
    assert np.isnan(df.loc["PSI-69:7", "p_atm"]) and df.loc["PSI-69:7", "qc_flags"] == "presion_invalida"
    assert any("impossible pressure" in r for r in rules(log))


def test_mole_fractions_that_do_not_sum_to_one_are_logged(flex):
    _, log = flex
    entry = next(r for r in log.rows if r["campo"] == "mole fractions")
    assert entry["registro"] == "8" and entry["valor_original"] == "1.05"




def test_mole_fractions_that_do_not_sum_to_one_are_flagged(flex):
    df, _ = flex
    assert "fracciones_no_suman_1" in df.loc["PSI-69:8", "qc_flags"]


def test_published_records_carry_the_mole_fraction_flag():
    from pipeline.common import WEB_DATA
    qc = pd.read_csv(WEB_DATA / "downloads" / "qc_log.csv")
    ens = pd.read_csv(WEB_DATA / "downloads" / "ensayos.csv", keep_default_na=False).set_index("test_uid")
    ids = [f"PSI-69:{r}" for r in qc.loc[qc["campo"] == "mole fractions", "registro"]]
    assert len(ids) == 6
    assert all("fracciones_no_suman_1" in str(ens.loc[i, "qc_flags"]) for i in ids)


def test_clean_record_carries_no_flag(flex):
    df, log = flex
    assert df.loc["PSI-69:1", "qc_flags"] == ""
    assert not any(r["registro"] == "1" for r in log.rows)


def test_every_correction_keeps_the_original_value(flex):
    _, log = flex
    assert len(log.rows) == 7  # one per defect planted in FLEX_ROWS
    for r in log.rows:
        assert r["valor_original"] != "" and r["regla"] != "" and r["valor_original"] != r["valor_nuevo"]

# ---------------------------------------------------------------- helpers shared by several tables


def test_yes_no_answers_are_normalized_and_flashes_kept_apart(raw):
    _, log = raw
    s = pd.Series(["Yes", "no", "No", "yes", "Flash", "?"])
    norm, flash = silver._yesno(s, "PSI-159", "CFI-G", "Ignition")
    assert norm.tolist()[:5] == [1.0, 0.0, 0.0, 1.0, 1.0] and np.isnan(norm.iloc[5])
    assert flash.tolist() == [False, False, False, False, True, False]
    assert [r["valor_original"] for r in log.rows] == ["yes/no (lowercase)", "flash"]


@pytest.mark.parametrize("text, flow", [("10 cm/s", 10.0), ("Flow 2.5 then 5", 2.5), ("none", None), (None, None)])
def test_first_flow_reads_the_first_number(text, flow):
    got = silver._first_flow(text)
    assert (np.isnan(got) if flow is None else got == flow)


def test_reading_strips_the_byte_order_mark(raw):
    write, _ = raw
    write("PSI-1", "T", "Name, Value ", ["a,1"])
    df = silver._csv("PSI-1", "T")
    assert list(df.columns) == ["Name", "Value"]
