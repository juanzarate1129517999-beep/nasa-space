"""Unify the BASS, BASS-II and Saffire test tables from NASA PSI into one CSV.

Usage: python scripts/build_tests_table.py data/psi data/processed/psi_tests_unified.csv

Outcomes are only *hints* parsed from free-text notes and flow sequences
(e.g. "5, down to ext"); they still need expert review before modeling.
"""
import os, re, sys
import pandas as pd

EXT = re.compile(r"\bext|extinguish|went out|died", re.I)
BLOWOFF = re.compile(r"blew off|blow ?off", re.I)
NOIGN = re.compile(r"not ignit|no ignit|failed to ignite|did not ignite|re-ignition attempts failed", re.I)


def family(m):
    m = str(m).lower()
    if "candle" in m or "wax" in m:
        return "Vela/cera"
    if "nomex" in m:
        return "Nomex"
    if "sibal" in m or "cotton" in m:
        return "SIBAL"
    if "silicone" in m:
        return "Silicona"
    if "ultem" in m:
        return "Ultem"
    if any(k in m for k in ("pmma", "rod", "sphere", "film", "slab", "spherical")):
        return "PMMA"
    return None


def hint(text):
    if NOIGN.search(text):
        return "no_ignicion"
    if BLOWOFF.search(text):
        return "soplado"
    if EXT.search(text):
        return "extincion"
    return ""


def bass(root):
    df = pd.read_excel(os.path.join(root, "PSI-26", "PSI-26_Science Documents_As Run_Test Matrix.xlsx"),
                       sheet_name="as run matrix", header=2)
    obs = [c for c in df.columns if isinstance(c, str) and c.startswith("Test Observations")][0]
    df = df[df["material"].notna()]
    return pd.DataFrame({
        "experimento": "BASS",
        "psi_id": "PSI-26",
        "ensayo": df["As run test no."].astype(str),
        "investigador": "",
        "material": df["material"].astype(str).str.strip(),
        "o2_inicial_pct": pd.to_numeric(df["O2 % by volume"], errors="coerce") * 100,
        "o2_final_pct": float("nan"),
        "flujo_cm_s_texto": df["Air display"].astype(str),
        "ventilador_texto": df["Fan display"].astype(str),
        "direccion_flujo": "",
        "observaciones": df[obs].fillna("").astype(str),
    })


def bass2(root):
    sheets = pd.read_excel(os.path.join(root, "PSI-25", "PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx"),
                           sheet_name=None, header=0)
    parts = []
    for pi, df in sheets.items():
        df.columns = [str(c).strip() for c in df.columns]
        col = lambda key, df=df: [c for c in df.columns if key.lower() in c.lower()][0]
        df = df[df[col("Material")].notna()]
        parts.append(pd.DataFrame({
            "experimento": "BASS-II",
            "psi_id": "PSI-25",
            "ensayo": df[col("Test no")].astype(str),
            "investigador": pi,
            "material": df[col("Material")].astype(str).str.strip(),
            "o2_inicial_pct": pd.to_numeric(df[col("initial O2")], errors="coerce"),
            "o2_final_pct": pd.to_numeric(df[col("final O2")], errors="coerce"),
            "flujo_cm_s_texto": df[col("Air display")].astype(str),
            "ventilador_texto": df[col("Fan display")].astype(str),
            "direccion_flujo": "",
            "observaciones": "",
        }))
    return pd.concat(parts, ignore_index=True)


def saffire(root):
    specs = [("Saffire-I", "PSI-98", "PSI-98_Experimental table_SAFFIRE-1.csv"),
             ("Saffire-II", "PSI-99", "PSI-99_Experimental table_SAFFIRE-2.csv"),
             ("Saffire-III", "PSI-100", "PSI-100_Experimental table_SAFFIRE-3.csv")]
    parts = []
    for name, acc, fn in specs:
        df = pd.read_csv(os.path.join(root, acc, fn), encoding="latin-1")
        df.columns = [str(c).strip() for c in df.columns]
        df = df[df.iloc[:, 0].astype(str).str.match(r"^(S\d|\d-\d)")]
        get = lambda key, df=df: next((df[c] for c in df.columns if key.lower() in c.lower()), pd.Series("", index=df.index))
        notes = ("ug_burn_length=" + get("-g Burn Length").astype(str) + "; ug_spread=" + get("-g Spread").astype(str)
                 + "; 1g_burn_length=" + get("1-g Burn Length").astype(str) + "; 1g_spread_rate=" + get("1-g Spread Rate").astype(str)
                 + "; burn_time=" + get("Burn Time").astype(str))
        o2 = get("O2").astype(str).str.extract(r"(\d+\.?\d*)")[0]
        parts.append(pd.DataFrame({
            "experimento": name,
            "psi_id": acc,
            "ensayo": df.iloc[:, 0].astype(str),
            "investigador": "",
            "material": get("Material").ffill().astype(str),
            "o2_inicial_pct": pd.to_numeric(o2, errors="coerce"),
            "o2_final_pct": float("nan"),
            "flujo_cm_s_texto": get("Air Flow").astype(str),
            "ventilador_texto": "",
            "direccion_flujo": get("Direction").astype(str),
            "observaciones": notes,
        }))
    return pd.concat(parts, ignore_index=True)


if __name__ == "__main__":
    root, out = sys.argv[1], sys.argv[2]
    df = pd.concat([bass(root), bass2(root), saffire(root)], ignore_index=True)
    for c in ("observaciones", "flujo_cm_s_texto", "ventilador_texto", "direccion_flujo"):
        df[c] = df[c].fillna("").astype(str).replace("nan", "")
    df["familia_material"] = df["material"].map(family)
    text = df["observaciones"] + " " + df["flujo_cm_s_texto"] + " " + df["ventilador_texto"]
    df["resultado_pista"] = text.map(hint)
    df["barrido_de_flujo"] = df["flujo_cm_s_texto"].str.contains(r"[,>]|down", regex=True)
    df.loc[df["experimento"].str.startswith("Saffire"), "barrido_de_flujo"] = False
    os.makedirs(os.path.dirname(out), exist_ok=True)
    df.to_csv(out, index=False, encoding="utf-8")
    print(f"{len(df)} ensayos -> {out}")
    print(df.groupby("experimento").agg(ensayos=("ensayo", "size"),
                                        o2_min=("o2_inicial_pct", "min"), o2_max=("o2_inicial_pct", "max"),
                                        con_pista_resultado=("resultado_pista", lambda s: (s != "").sum()),
                                        barridos=("barrido_de_flujo", "sum")).to_string())
    print(df.groupby(["familia_material"], dropna=False).size().to_string())
    print(df["resultado_pista"].value_counts().to_string())
