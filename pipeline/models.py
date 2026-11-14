import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

from .common import HABITATS

RNG = np.random.default_rng(7)
N_BOOT = 200

FLEX_FEATURES = ["heptane", "x_o2", "log_p", "x_co2", "x_he", "d0_mm"]
FLEX_LABELS = {"heptane": "Fuel: heptane (vs methanol)", "x_o2": "Oxygen mole fraction", "log_p": "Pressure (log)",
               "x_co2": "CO₂ diluent", "x_he": "Helium diluent", "d0_mm": "Initial droplet diameter"}


def _metrics(y, p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return {"auc": float(roc_auc_score(y, p)), "brier": float(brier_score_loss(y, p)),
            "log_loss": float(log_loss(y, p)), "accuracy": float(((p > 0.5) == y).mean())}


def _reliability(y, p, bins=5):
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
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


def flex_model(ens):
    d = ens[(ens["experimento"] == "FLEX") & ens["p_atm"].notna() & ens["autoextincion"].notna()].copy()
    d["heptane"] = (d["combustible"].str.lower() == "heptane").astype(float)
    d["log_p"] = np.log(d["p_atm"])
    d = d.dropna(subset=FLEX_FEATURES)
    X = d[FLEX_FEATURES].to_numpy(float)
    y = d["autoextincion"].to_numpy(int)
    groups = d["fecha"].dt.strftime("%Y-%m-%d").fillna("na").to_numpy()
    Xs, mu, sd = _standardize(X)
    C = 1.0

    logit = lambda: LogisticRegression(C=C, max_iter=2000)
    oof_lr = _oof(logit, Xs, y, groups)
    oof_gb = _oof(lambda: HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200,
                                                         min_samples_leaf=10), Xs, y, groups)
    o2_col = FLEX_FEATURES.index("x_o2")
    oof_o2 = _oof(logit, Xs[:, [o2_col]], y, groups)
    oof_prior = _oof(lambda: _Prior(), Xs, y, groups)
    validation = {
        "scheme": f"GroupKFold (5 folds), whole test days held out · {len(np.unique(groups))} test days · n = {len(y)}",
        "models": [
            {"name": "Skylab Phoenix logistic (6 physical inputs)", "key": "lr", **_metrics(y, oof_lr), "deployed": True},
            {"name": "Gradient boosting (same inputs)", "key": "gb", **_metrics(y, oof_gb), "deployed": False},
            {"name": "Baseline: oxygen only", "key": "o2", **_metrics(y, oof_o2), "deployed": False},
            {"name": "Baseline: always predict the base rate", "key": "prior", **_metrics(y, oof_prior),
             "auc": 0.5, "deployed": False},
        ],
        "reliability": _reliability(y, oof_lr),
    }
    full = logit().fit(Xs, y)
    boots = _bootstrap_logit(Xs, y, C, groups)
    knn = _knn_dist(Xs)
    coef_ci = np.percentile(boots[:, 1:], [5, 95], axis=0)
    drivers = [{"feature": f, "label": FLEX_LABELS[f], "coef": float(full.coef_[0, i]),
                "lo": float(coef_ci[0, i]), "hi": float(coef_ci[1, i])} for i, f in enumerate(FLEX_FEATURES)]
    drivers.sort(key=lambda r: -abs(r["coef"]))
    train = d.assign(p_oof=oof_lr)[["test_uid", "combustible", "x_o2", "p_atm", "x_co2", "x_he", "d0_mm",
                                   "resultado", "autoextincion", "p_oof", "fecha"]]
    train["fecha"] = train["fecha"].dt.strftime("%Y-%m-%d")
    return {
        "features": FLEX_FEATURES, "labels": FLEX_LABELS, "mu": mu.tolist(), "sd": sd.tolist(),
        "coef": np.r_[full.intercept_, full.coef_.ravel()].tolist(), "boot": np.round(boots, 5).tolist(),
        "ood_threshold": float(np.percentile(knn, 95)), "ood_k": 5,
        "ranges": {f: [float(X[:, i].min()), float(X[:, i].max())] for i, f in enumerate(FLEX_FEATURES)},
        "d0_median": float(round(1.1 + np.round((np.median(d["d0_mm"]) - 1.1) / 0.05) * 0.05, 2)),
        "train": train.round(4).to_dict(orient="records"), "train_std": np.round(Xs, 4).tolist(),
        "validation": validation, "drivers": drivers, "n": int(len(y)), "base_rate": float(y.mean()),
    }


class _Prior:
    def fit(self, X, y):
        self.p = y.mean()
        return self

    def predict_proba(self, X):
        return np.c_[np.full(len(X), 1 - self.p), np.full(len(X), self.p)]


def flex_predict(model, rows, use_boot=True):
    Xs = (np.asarray(rows, float) - np.array(model["mu"])) / np.array(model["sd"])
    B = np.array(model["boot"]) if use_boot else np.array([model["coef"]])
    z = B[:, :1].T + Xs @ B[:, 1:].T
    p = 1 / (1 + np.exp(-z))
    return p.mean(axis=1), np.percentile(p, 5, axis=1), np.percentile(p, 95, axis=1)


def flex_ood(model, rows):
    Xs = (np.asarray(rows, float) - np.array(model["mu"])) / np.array(model["sd"])
    T = np.array(model["train_std"])
    d = np.sqrt(((Xs[:, None, :] - T[None, :, :]) ** 2).sum(-1))
    return np.sort(d, axis=1)[:, :model["ood_k"]].mean(axis=1)


def cfig_model(ens):
    d = ens[ens["experimento"].str.startswith("CFI-G") & (ens["ignicion"] == 1) & ens["autoextincion"].notna()
            & ens["tad_k"].notna()].copy()
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
            "n": int(len(yy)), "n_se": int(yy.sum()), "metrics": _metrics(yy, oof),
            "t50": float(np.median(t50)) if len(t50) else None,
            "t50_lo": float(np.percentile(t50, 5)) if len(t50) else None,
            "t50_hi": float(np.percentile(t50, 95)) if len(t50) else None,
            "slope_negative_share": float((boots[:, 1] < 0).mean()), "tad_min": float(t.min()), "tad_max": float(t.max()),
            "coef": [float(full.intercept_[0]), float(full.coef_[0, 0])], "mu": float(mu[0]), "sd": float(sd[0]),
        }
        curves.append({"type": typ, "tad": np.round(grid, 1).tolist(),
                       "p": np.round(np.median(P, axis=0), 4).tolist(),
                       "lo": np.round(np.percentile(P, 5, axis=0), 4).tolist(),
                       "hi": np.round(np.percentile(P, 95, axis=0), 4).tolist()})
    out["curves"] = curves
    pts = d[["test_uid", "experimento", "combustible", "x_o2", "p_atm", "tad_k", "autoextincion", "llama_fria"]]
    out["points"] = pts.round(4).to_dict(orient="records")
    ign = ens[ens["experimento"].str.startswith("CFI-G")]
    out["ignition"] = {"tests": int(ign["ignicion"].notna().sum()), "ignited": int((ign["ignicion"] == 1).sum()),
                       "cool_flames": int((ign["llama_fria"] == 1).sum())}
    cool = ign[ign["llama_fria"] == 1]
    out["cool_flame_conditions"] = {"fuel": sorted(cool["combustible"].unique().tolist()),
                                    "o2": [float(cool["x_o2"].min()), float(cool["x_o2"].max())],
                                    "p_atm": [float(cool["p_atm"].min()), float(cool["p_atm"].max())]}
    return out


def out_of_range(model, row):
    return [f for f, v in zip(model["features"], row) if f != "heptane" and not
            (model["ranges"][f][0] - 1e-9 <= v <= model["ranges"][f][1] + 1e-9)]


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
            mean, lo, hi = flex_predict(m1, x)
            dist = float(flex_ood(m1, x)[0])
            beyond = out_of_range(m1, x[0])
            status = data_status(dist, m1["ood_threshold"], beyond)
            row["fuels"][fuel] = {"p": float(mean[0]), "lo": float(lo[0]), "hi": float(hi[0]), "ood_distance": dist,
                                  "status": status, "ood": status == "outside", "out_of_range": beyond}
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
    Xs = (rows - np.array(m1["mu"])) / np.array(m1["sd"])
    B = np.array(m1["boot"])
    P = 1 / (1 + np.exp(-(B[:, :1].T + Xs @ B[:, 1:].T)))
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
        picks.append({"fuel": f, "x_o2": float(a), "p_atm": float(b), "x_co2": float(c),
                      "p_ext": float(P[i].mean()), "interval": [float(np.percentile(P[i], 5)), float(np.percentile(P[i], 95))],
                      "uncertainty": float(spread[i]), "ood_distance": float(dist[i]),
                      "near_moon_base": float(near[i]), "score": float(score[i])})
        if len(picks) == top:
            break
    go2 = np.round(np.arange(0.12, 0.4001, 0.01), 3)
    gp = np.round(np.exp(np.linspace(np.log(0.3), np.log(3.2), 36)), 4)
    grid = []
    for a in go2:
        r = []
        for b in gp:
            xx = np.array([[0.0, a, np.log(b), 0, 0, m1["d0_median"]], [1.0, a, np.log(b), 0, 0, m1["d0_median"]]])
            xs = (xx - np.array(m1["mu"])) / np.array(m1["sd"])
            pp = 1 / (1 + np.exp(-(B[:, :1].T + xs @ B[:, 1:].T)))
            r.append(float(np.mean(np.percentile(pp, 95, axis=1) - np.percentile(pp, 5, axis=1))))
        grid.append(r)
    return {"picks": picks, "map": {"o2": go2.tolist(), "p": gp.tolist(), "spread": np.round(grid, 4).T.tolist()},
            "score_formula": "uncertainty (90% band width) × (0.35 + closeness to lunar-base atmosphere) × "
                             "penalty if more than 2× the out-of-data threshold from any flown test"}


def build(ens):
    m1 = flex_model(ens)
    m2 = cfig_model(ens)
    return {"flex": m1, "cfig": m2, "habitat_check": habitat_check(m1), "next": next_experiment(m1)}
