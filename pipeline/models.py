from itertools import pairwise

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

from .common import HABITATS

RNG = np.random.default_rng(7)
N_BOOT = 200

FLEX_FEATURES = ["heptane", "x_o2", "log_p", "x_co2", "x_he", "d0_mm"]
FLEX_LABELS = {
    "heptane": "Fuel: heptane (vs methanol)",
    "x_o2": "Oxygen mole fraction",
    "log_p": "Pressure (log)",
    "x_co2": "CO₂ diluent",
    "x_he": "Helium diluent",
    "d0_mm": "Initial droplet diameter",
}

# Physics features computed from the six inputs a test is set up with (nothing measured after ignition).
# t_st: Burke-Schumann stoichiometric flame temperature of the droplet's diffusion flame (no radiation or
# dissociation): T0 + Q·Y_O2 / (cp·(s + Y_O2)), Q = lower heating value, s = mass of O2 per mass of fuel.
# res: log(d0²·p), a flame residence time (d²/D with D ∝ 1/p).
PHYS = {
    "t0_k": 298.0,
    "q_j_kg": {"Methanol": 19.9e6, "Heptane": 44.6e6},
    "s_o2": {"Methanol": 1.5, "Heptane": 3.52},
    "molar_mass": {"o2": 32.0, "n2": 28.0, "co2": 44.0, "he": 4.0},
    "cp_j_mol_k": {"o2": 35.0, "n2": 33.0, "co2": 54.0, "he": 20.8},
}
STAGE_FEATURES = {
    "disruption": FLEX_FEATURES,
    "extinction": ["heptane", "t_st", "res", "x_he", "hep_t_st", "hep_res"],
}
STAGE_LABELS = {
    "t_st": "Stoichiometric flame temperature",
    "res": "Residence time, log(d0²·p)",
    "hep_t_st": "Heptane × flame temperature",
    "hep_res": "Heptane × residence time",
    **FLEX_LABELS,
}


def physics(rows):
    """Six raw inputs [heptane, x_o2, log_p, x_co2, x_he, d0_mm] -> dict of derived feature columns."""
    R = np.atleast_2d(np.asarray(rows, float))
    hep, o2, logp, co2, he, d0 = R.T
    n2 = np.clip(1 - o2 - co2 - he, 0, None)
    M, CP = PHYS["molar_mass"], PHYS["cp_j_mol_k"]
    mass = o2 * M["o2"] + n2 * M["n2"] + co2 * M["co2"] + he * M["he"]
    yo = o2 * M["o2"] / mass
    cp = (o2 * CP["o2"] + n2 * CP["n2"] + co2 * CP["co2"] + he * CP["he"]) / (mass / 1000)
    q = np.where(hep == 1, PHYS["q_j_kg"]["Heptane"], PHYS["q_j_kg"]["Methanol"])
    s = np.where(hep == 1, PHYS["s_o2"]["Heptane"], PHYS["s_o2"]["Methanol"])
    t_st = PHYS["t0_k"] + q * yo / (cp * (s + yo))
    res = np.log(d0**2 * np.exp(logp))
    cols = {
        "heptane": hep,
        "x_o2": o2,
        "log_p": logp,
        "x_co2": co2,
        "x_he": he,
        "d0_mm": d0,
        "t_st": t_st,
        "res": res,
        "hep_t_st": hep * t_st,
        "hep_res": hep * res,
    }
    return cols


def stage_matrix(rows, stage):
    c = physics(rows)
    return np.column_stack([c[f] for f in STAGE_FEATURES[stage]])


def _metrics(y, p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return {
        "auc": float(roc_auc_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "log_loss": float(log_loss(y, p)),
        "accuracy": float(((p > 0.5) == y).mean()),
    }


def _reliability(y, p, bins=5):
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in pairwise(edges):
        m = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if m.sum():
            out.append({"pred": float(p[m].mean()), "obs": float(y[m].mean()), "n": int(m.sum())})
    return out


def _oof(make, X, y, groups, k=5):
    p = np.zeros(len(y))
    for tr, te in GroupKFold(n_splits=k).split(X, y, groups):
        if len(np.unique(y[tr])) < 2:
            p[te] = y[tr].mean()
            continue
        m = make().fit(X[tr], y[tr])
        p[te] = m.predict_proba(X[te])[:, 1]
    return p


def _standardize(X):
    mu, sd = X.mean(axis=0), X.std(axis=0)
    sd[sd == 0] = 1
    return (X - mu) / sd, mu, sd


def _bootstrap_logit(Xs, y, C, groups=None):
    coefs = []
    idx_all = np.arange(len(y))
    for _ in range(N_BOOT):
        if groups is not None:
            g = np.unique(groups)
            pick = RNG.choice(g, size=len(g), replace=True)
            idx = np.concatenate([idx_all[groups == x] for x in pick])
        else:
            idx = RNG.choice(idx_all, size=len(idx_all), replace=True)
        if len(np.unique(y[idx])) < 2:
            continue
        m = LogisticRegression(C=C, max_iter=2000).fit(Xs[idx], y[idx])
        coefs.append(np.r_[m.intercept_, m.coef_.ravel()])
    return np.array(coefs)


def _knn_dist(Xs, k=5):
    d = np.sqrt(((Xs[:, None, :] - Xs[None, :, :]) ** 2).sum(-1))
    np.fill_diagonal(d, np.inf)
    return np.sort(d, axis=1)[:, :k].mean(axis=1)


def _fit_stage(X, y, C=1.0):
    Xs, mu, sd = _standardize(X)
    m = LogisticRegression(C=C, max_iter=5000).fit(Xs, y)
    return mu, sd, np.r_[m.intercept_, m.coef_.ravel()]


def _stage_p(coefs, mu, sd, X):
    Xs = (X - mu) / sd
    B = np.atleast_2d(coefs)
    return 1 / (1 + np.exp(-(B[:, :1].T + Xs @ B[:, 1:].T)))


def _two_stage_oof(raw, res, groups, reps=20, seed=11):
    """Repeated GroupKFold: whole ISS test days held out, fold assignment reshuffled each repeat."""
    rng = np.random.default_rng(seed)
    XA, XB = stage_matrix(raw, "disruption"), stage_matrix(raw, "extinction")
    yD, yE = res == "disrupcion", res == "extincion"
    runs = []
    for _ in range(reps):
        ug = np.unique(groups)
        perm = {u: i for i, u in enumerate(rng.permutation(ug))}
        gg = np.array([perm[g] for g in groups])
        pD, pE = np.zeros(len(res)), np.zeros(len(res))
        for tr, te in GroupKFold(n_splits=5).split(raw, res, gg):
            muA, sdA, cA = _fit_stage(XA[tr], yD[tr])
            pD[te] = _stage_p(cA, muA, sdA, XA[te])[:, 0]
            trB = tr[~yD[tr]]
            muB, sdB, cB = _fit_stage(XB[trB], yE[trB])
            pE[te] = _stage_p(cB, muB, sdB, XB[te])[:, 0]
        runs.append((pD, pE))
    return runs


def _repeated_oof(make, X, y, groups, reps=20, seed=11):
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(reps):
        ug = np.unique(groups)
        perm = {u: i for i, u in enumerate(rng.permutation(ug))}
        out.append(_oof(make, X, y, np.array([perm[g] for g in groups])))
    return out


def _mean_metrics(y, ps):
    ms = [_metrics(y, p) for p in ps]
    out = {k: float(np.mean([m[k] for m in ms])) for k in ms[0]}
    out["auc_sd"] = float(np.std([m["auc"] for m in ms]))
    return out


def flex_model(ens):
    d = ens[(ens["experimento"] == "FLEX") & ens["p_atm"].notna() & ens["autoextincion"].notna()].copy()
    d["heptane"] = (d["combustible"].str.lower() == "heptane").astype(float)
    d["log_p"] = np.log(d["p_atm"])
    d = d.dropna(subset=FLEX_FEATURES)
    raw = d[FLEX_FEATURES].to_numpy(float)
    res = d["resultado"].to_numpy(str)
    y = (res == "extincion").astype(int)
    groups = d["fecha"].dt.strftime("%Y-%m-%d").fillna("na").to_numpy()
    Xs_raw, mu, sd = _standardize(raw)
    reps = 20

    runs = _two_stage_oof(raw, res, groups, reps)
    pE_runs = [(1 - pD) * pE for pD, pE in runs]
    pD_runs = [pD for pD, _ in runs]
    steady = res != "disrupcion"
    logit = lambda: LogisticRegression(C=1.0, max_iter=2000)
    lr6 = _repeated_oof(logit, Xs_raw, y, groups, reps)
    gb = _repeated_oof(
        lambda: HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=10),
        Xs_raw,
        y,
        groups,
        5,
    )
    o2_col = FLEX_FEATURES.index("x_o2")
    o2 = _repeated_oof(logit, Xs_raw[:, [o2_col]], y, groups, reps)
    prior = _repeated_oof(lambda: _Prior(), Xs_raw, y, groups, 1)
    oof_E = np.mean(pE_runs, axis=0)
    oof_D = np.mean(pD_runs, axis=0)
    validation = {
        "scheme": f"GroupKFold (5 folds), whole ISS test days held out, repeated {reps} times with reshuffled folds · "
        f"{len(np.unique(groups))} test days · n = {len(y)}",
        "reps": reps,
        "models": [
            {
                "name": "Skylab Phoenix two-stage physics model",
                "key": "lr",
                **_mean_metrics(y, pE_runs),
                "deployed": True,
            },
            {
                "name": "Single logistic on the 6 raw inputs (previous model)",
                "key": "lr6",
                **_mean_metrics(y, lr6),
                "deployed": False,
            },
            {"name": "Gradient boosting (6 raw inputs)", "key": "gb", **_mean_metrics(y, gb), "deployed": False},
            {"name": "Baseline: oxygen only", "key": "o2", **_mean_metrics(y, o2), "deployed": False},
            {
                "name": "Baseline: always predict the base rate",
                "key": "prior",
                **_mean_metrics(y, prior),
                "auc": 0.5,
                "deployed": False,
            },
        ],
        "stages": {
            "disruption": {
                **_mean_metrics((res == "disrupcion").astype(int), pD_runs),
                "question": "Does the droplet break apart (disruption)?",
                "n": int(len(y)),
            },
            "extinction": {
                **_mean_metrics(y[steady], [pE[steady] for _, pE in runs]),
                "question": "If it burns steadily, does the flame go out with fuel left (vs burning to completion)?",
                "n": int(steady.sum()),
            },
            "completion": {
                **_mean_metrics((res == "completo").astype(int), [(1 - pD) * (1 - pE) for pD, pE in runs]),
                "question": "Does the droplet burn to completion?",
                "n": int(len(y)),
            },
        },
        "reliability": _reliability(y, oof_E),
    }

    # Final fits and a paired, day-level bootstrap: both stages are refit on the same resampled test days.
    XA, XB = stage_matrix(raw, "disruption"), stage_matrix(raw, "extinction")
    yD = res == "disrupcion"
    stages = {}
    for name, X, yy, mask in (("disruption", XA, yD, np.ones(len(y), bool)), ("extinction", XB, y == 1, steady)):
        m_, s_, c_ = _fit_stage(X[mask], yy[mask])
        stages[name] = {
            "features": STAGE_FEATURES[name],
            "labels": [STAGE_LABELS[f] for f in STAGE_FEATURES[name]],
            "mu": m_.tolist(),
            "sd": s_.tolist(),
            "coef": c_.tolist(),
            "boot": [],
        }
    idx_all = np.arange(len(y))
    ug = np.unique(groups)
    while len(stages["disruption"]["boot"]) < N_BOOT:
        pick = RNG.choice(ug, size=len(ug), replace=True)
        idx = np.concatenate([idx_all[groups == g] for g in pick])
        ib = idx[steady[idx]]
        if len(np.unique(yD[idx])) < 2 or len(np.unique(y[ib])) < 2:
            continue
        for name, X, yy, ii in (("disruption", XA, yD, idx), ("extinction", XB, y == 1, ib)):
            st = stages[name]
            Xs = (X[ii] - np.array(st["mu"])) / np.array(st["sd"])
            mm = LogisticRegression(C=1.0, max_iter=5000).fit(Xs, yy[ii])
            st["boot"].append(np.round(np.r_[mm.intercept_, mm.coef_.ravel()], 5).tolist())

    model = {
        "features": FLEX_FEATURES,
        "labels": FLEX_LABELS,
        "mu": mu.tolist(),
        "sd": sd.tolist(),
        "stages": stages,
        "phys": PHYS,
        "n": int(len(y)),
        "base_rate": float(y.mean()),
        "outcomes": {k: int((res == k).sum()) for k in ("extincion", "disrupcion", "completo")},
    }

    # Drivers: average change in the chance the flame goes out on its own for +1 SD of each input
    # (heptane: methanol -> heptane), with the 90% bootstrap interval.
    def effects(use_boot):
        out = []
        for i, f in enumerate(FLEX_FEATURES):
            lo_, hi_ = raw.copy(), raw.copy()
            if f == "heptane":
                lo_[:, i], hi_[:, i] = 0.0, 1.0
            else:
                lo_[:, i] -= sd[i] / 2
                hi_[:, i] += sd[i] / 2
            a = flex_predict3(model, hi_, use_boot, keep_draws=True)["extinction"]
            b = flex_predict3(model, lo_, use_boot, keep_draws=True)["extinction"]
            out.append((a - b).mean(axis=0))
        return np.array(out)

    point = effects(False)[:, 0]
    draws = effects(True)
    ci = np.percentile(draws, [5, 95], axis=1)
    drivers = [
        {"feature": f, "label": FLEX_LABELS[f], "coef": float(point[i]), "lo": float(ci[0, i]), "hi": float(ci[1, i])}
        for i, f in enumerate(FLEX_FEATURES)
    ]
    drivers.sort(key=lambda r: -abs(r["coef"]))
    knn = _knn_dist(Xs_raw)
    train = d.assign(p_oof=oof_E, p_disr_oof=oof_D)[
        [
            "test_uid",
            "combustible",
            "x_o2",
            "p_atm",
            "x_co2",
            "x_he",
            "d0_mm",
            "resultado",
            "autoextincion",
            "p_oof",
            "p_disr_oof",
            "fecha",
            "tasa_quemado",
            "tiempo_quemado_s",
            "d_ext_mm",
        ]
    ]
    train["fecha"] = train["fecha"].dt.strftime("%Y-%m-%d")
    model.update(
        {
            "ood_threshold": float(np.percentile(knn, 95)),
            "ood_k": 5,
            "ranges": {f: [float(raw[:, i].min()), float(raw[:, i].max())] for i, f in enumerate(FLEX_FEATURES)},
            "d0_median": float(round(1.1 + np.round((np.median(d["d0_mm"]) - 1.1) / 0.05) * 0.05, 2)),
            "train": train.round(4).to_dict(orient="records"),
            "train_std": np.round(Xs_raw, 4).tolist(),
            "validation": validation,
            "drivers": drivers,
        }
    )
    return model


class _Prior:
    def fit(self, X, y):
        self.p = y.mean()
        return self

    def predict_proba(self, X):
        return np.c_[np.full(len(X), 1 - self.p), np.full(len(X), self.p)]


def flex_predict3(model, rows, use_boot=True, keep_draws=False):
    """Chance of each ending: extinction (goes out on its own), disruption (breaks apart), completion (burns out)."""
    rows = np.atleast_2d(np.asarray(rows, float))
    St = model["stages"]
    out = {}
    pr = {}
    for name in ("disruption", "extinction"):
        st = St[name]
        B = np.array(st["boot"]) if use_boot else np.array([st["coef"]])
        pr[name] = _stage_p(B, np.array(st["mu"]), np.array(st["sd"]), stage_matrix(rows, name))
    pD, pS = pr["disruption"], pr["extinction"]
    draws = {"extinction": (1 - pD) * pS, "disruption": pD, "completion": (1 - pD) * (1 - pS), "steady_extinction": pS}
    if keep_draws:
        return draws
    for k, P in draws.items():
        out[k] = {"p": P.mean(axis=1), "lo": np.percentile(P, 5, axis=1), "hi": np.percentile(P, 95, axis=1)}
    return out


def flex_predict(model, rows, use_boot=True):
    r = flex_predict3(model, rows, use_boot)["extinction"]
    return r["p"], r["lo"], r["hi"]


def flex_ood(model, rows):
    Xs = (np.asarray(rows, float) - np.array(model["mu"])) / np.array(model["sd"])
    T = np.array(model["train_std"])
    d = np.sqrt(((Xs[:, None, :] - T[None, :, :]) ** 2).sum(-1))
    return np.sort(d, axis=1)[:, : model["ood_k"]].mean(axis=1)


def cfig_model(ens):
    d = ens[
        ens["experimento"].str.startswith("CFI-G")
        & (ens["ignicion"] == 1)
        & ens["autoextincion"].notna()
        & ens["tad_k"].notna()
    ].copy()
    d["inverse"] = (d["experimento"] == "CFI-G inverse").astype(float)
    y = d["autoextincion"].to_numpy(int)
    groups = d["test_uid"].str.extract(r"[NI]-(\d{5})")[0].fillna("na").to_numpy()
    out = {"n": int(len(y)), "n_se": int(y.sum()), "by_type": {}}
    curves = []
    for typ, sub in (("normal", d[d["inverse"] == 0]), ("inverse", d[d["inverse"] == 1])):
        t = sub["tad_k"].to_numpy(float)
        yy = sub["autoextincion"].to_numpy(int)
        g = groups[(d["inverse"] == (typ == "inverse")).to_numpy()]
        Xs, mu, sd = _standardize(t[:, None])
        oof = _oof(lambda: LogisticRegression(C=1.0, max_iter=2000), Xs, yy, g)
        boots = _bootstrap_logit(Xs, yy, 1.0, g)
        t50 = mu[0] - sd[0] * boots[:, 0] / boots[:, 1]
        t50 = t50[np.isfinite(t50) & (boots[:, 1] < 0)]
        grid = np.linspace(t.min() - 50, t.max() + 50, 80)
        gs = (grid - mu[0]) / sd[0]
        P = 1 / (1 + np.exp(-(boots[:, :1] + boots[:, 1:2] * gs[None, :])))
        full = LogisticRegression(C=1.0, max_iter=2000).fit(Xs, yy)
        out["by_type"][typ] = {
            "n": int(len(yy)),
            "n_se": int(yy.sum()),
            "metrics": _metrics(yy, oof),
            "t50": float(np.median(t50)) if len(t50) else None,
            "t50_lo": float(np.percentile(t50, 5)) if len(t50) else None,
            "t50_hi": float(np.percentile(t50, 95)) if len(t50) else None,
            "slope_negative_share": float((boots[:, 1] < 0).mean()),
            "tad_min": float(t.min()),
            "tad_max": float(t.max()),
            "coef": [float(full.intercept_[0]), float(full.coef_[0, 0])],
            "mu": float(mu[0]),
            "sd": float(sd[0]),
        }
        curves.append(
            {
                "type": typ,
                "tad": np.round(grid, 1).tolist(),
                "p": np.round(np.median(P, axis=0), 4).tolist(),
                "lo": np.round(np.percentile(P, 5, axis=0), 4).tolist(),
                "hi": np.round(np.percentile(P, 95, axis=0), 4).tolist(),
            }
        )
    out["curves"] = curves
    pts = d[["test_uid", "experimento", "combustible", "x_o2", "p_atm", "tad_k", "autoextincion", "llama_fria"]]
    out["points"] = pts.round(4).to_dict(orient="records")
    ign = ens[ens["experimento"].str.startswith("CFI-G")]
    out["ignition"] = {
        "tests": int(ign["ignicion"].notna().sum()),
        "ignited": int((ign["ignicion"] == 1).sum()),
        "cool_flames": int((ign["llama_fria"] == 1).sum()),
    }
    cool = ign[ign["llama_fria"] == 1]
    out["cool_flame_conditions"] = {
        "fuel": sorted(cool["combustible"].unique().tolist()),
        "o2": [float(cool["x_o2"].min()), float(cool["x_o2"].max())],
        "p_atm": [float(cool["p_atm"].min()), float(cool["p_atm"].max())],
    }
    return out


def out_of_range(model, row):
    return [
        f
        for f, v in zip(model["features"], row, strict=True)
        if f != "heptane" and not (model["ranges"][f][0] - 1e-9 <= v <= model["ranges"][f][1] + 1e-9)
    ]


def data_status(dist, threshold, outside_range=()):
    if dist > 2 * threshold:
        return "outside"
    return "extrapolating" if dist > threshold or outside_range else "within"


def habitat_check(m1):
    out = []
    for h in HABITATS:
        row = {"habitat": h["id"], "name": h["name"], "x_o2": h["x_o2"], "p_atm": h["p_atm"], "fuels": {}}
        for fuel, hep in (("Methanol", 0.0), ("Heptane", 1.0)):
            x = [[hep, h["x_o2"], np.log(h["p_atm"]), 0.0, 0.0, m1["d0_median"]]]
            r3 = flex_predict3(m1, x)
            dist = float(flex_ood(m1, x)[0])
            beyond = out_of_range(m1, x[0])
            status = data_status(dist, m1["ood_threshold"], beyond)
            e = r3["extinction"]
            row["fuels"][fuel] = {
                "p": float(e["p"][0]),
                "lo": float(e["lo"][0]),
                "hi": float(e["hi"][0]),
                **{
                    f"{k}": {"p": float(r3[k]["p"][0]), "lo": float(r3[k]["lo"][0]), "hi": float(r3[k]["hi"][0])}
                    for k in ("disruption", "completion", "steady_extinction")
                },
                "ood_distance": dist,
                "status": status,
                "ood": status == "outside",
                "out_of_range": beyond,
            }
        out.append(row)
    return out


def next_experiment(m1, top=6):
    o2 = np.round(np.arange(0.21, 0.4001, 0.01), 3)
    p = np.round(np.arange(0.30, 1.0001, 0.05), 3)
    co2 = np.array([0.0, 0.05, 0.10, 0.15, 0.20, 0.30])
    rows, meta = [], []
    for fuel, hep in (("Methanol", 0.0), ("Heptane", 1.0)):
        for a in o2:
            for b in p:
                for c in co2:
                    if a + c > 0.95:
                        continue
                    rows.append([hep, a, np.log(b), c, 0.0, m1["d0_median"]])
                    meta.append((fuel, a, b, c))
    rows = np.array(rows)
    P = flex_predict3(m1, rows, keep_draws=True)["extinction"]
    spread = np.percentile(P, 95, axis=1) - np.percentile(P, 5, axis=1)
    dist = flex_ood(m1, rows)
    moon = next(h for h in HABITATS if h["id"] == "moon_base")
    near = np.exp(-(((rows[:, 1] - moon["x_o2"]) / 0.04) ** 2 + ((rows[:, 2] - np.log(moon["p_atm"])) / 0.35) ** 2) / 2)
    score = spread * (0.35 + near) * np.exp(-np.maximum(0, dist - 2 * m1["ood_threshold"]))
    order = np.argsort(-score)
    picks, seen, per_combo = [], set(), {}
    for i in order:
        f, a, b, c = meta[i]
        key = (f, round(a / 0.03), round(np.log(b) / 0.25), c)
        combo = (f, c)
        if key in seen or per_combo.get(combo, 0) >= 2:
            continue
        seen.add(key)
        per_combo[combo] = per_combo.get(combo, 0) + 1
        picks.append(
            {
                "fuel": f,
                "x_o2": float(a),
                "p_atm": float(b),
                "x_co2": float(c),
                "p_ext": float(P[i].mean()),
                "interval": [float(np.percentile(P[i], 5)), float(np.percentile(P[i], 95))],
                "uncertainty": float(spread[i]),
                "ood_distance": float(dist[i]),
                "near_moon_base": float(near[i]),
                "score": float(score[i]),
            }
        )
        if len(picks) == top:
            break
    go2 = np.round(np.arange(0.12, 0.4001, 0.01), 3)
    gp = np.round(np.exp(np.linspace(np.log(0.3), np.log(3.2), 36)), 4)
    grid = []
    for a in go2:
        r = []
        for b in gp:
            xx = np.array([[0.0, a, np.log(b), 0, 0, m1["d0_median"]], [1.0, a, np.log(b), 0, 0, m1["d0_median"]]])
            pp = flex_predict3(m1, xx, keep_draws=True)["extinction"]
            r.append(float(np.mean(np.percentile(pp, 95, axis=1) - np.percentile(pp, 5, axis=1))))
        grid.append(r)
    return {
        "picks": picks,
        "map": {"o2": go2.tolist(), "p": gp.tolist(), "spread": np.round(grid, 4).T.tolist()},
        "score_formula": "uncertainty (90% band width) × (0.35 + closeness to lunar-base atmosphere) × "
        "penalty if more than 2× the out-of-data threshold from any flown test",
    }


def build(ens):
    m1 = flex_model(ens)
    m2 = cfig_model(ens)
    return {"flex": m1, "cfig": m2, "habitat_check": habitat_check(m1), "next": next_experiment(m1)}
