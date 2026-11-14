import hashlib
import json
import re

from .common import HABITATS, PSI_TO_ATM, RAW, ROOT, WEB_DATA

SI_DIR = ROOT / "data" / "si"
PACKS = SI_DIR / "evidence_packs.json"
DRAFTS = SI_DIR / "drafts.json"
REPORT = SI_DIR / "verification.json"

NUM = re.compile(r"(?<![A-Za-z]-)(?<![A-Za-z\d.,])(\d[\d,]*(?:\.\d+)?)")
VERDICT = re.compile(r"\b(is|are|be|remains?) (completely |fully |perfectly )?safe\b|\bsafe to\b|\bcertif|\bguarantee|"
                     r"\bapproved for\b|\bno (fire )?risk\b|\brisk-free\b|\bwill never\b", re.I)
MAX_SENTENCE = 420


def pct(p, d=0):
    return f"{100 * p:.{d}f}%"


def o2(x):
    v = 100 * x
    return f"{v:.0f}%" if abs(v - round(v)) < 1e-6 else f"{v:.1f}%"


def psi(p_atm):
    return f"{p_atm / PSI_TO_ATM:.1f} psi"


def norm_num(s):
    v = float(s.replace(",", ""))
    return f"{v:.6g}"


def numbers(text):
    return {norm_num(x) for x in NUM.findall(text)}


STATUS_TXT = {"within": "inside the range of flown ISS tests",
              "extrapolating": "beyond the flown ISS tests (extrapolation, use with caution)"}
FEATURE_TXT = {"x_o2": "oxygen", "log_p": "pressure", "x_co2": "CO2", "x_he": "helium", "d0_mm": "droplet size"}


def _model_item(name, fuel, r, d0, thr):
    if r["status"] == "outside":
        return (f"FLEX model, {fuel.lower()} droplet: prediction withheld for {name}. The atmosphere sits "
                f"{r['ood_distance']:.1f} units from the nearest flown tests, more than twice the out-of-data limit of {thr:.2f}.")
    why = ""
    if r.get("out_of_range"):
        why = f" because its {' and '.join(FEATURE_TXT[f] for f in r['out_of_range'])} lies outside every flown FLEX test"
    return (f"FLEX model, {fuel.lower()} droplet ({d0:.2f} mm, no diluent): {pct(r['p'])} chance the flame puts itself out "
            f"in {name} (90% interval {pct(r['lo'])}–{pct(r['hi'])}); this input is {STATUS_TXT[r['status']]}{why}.")


def habitat_pack(h, P):
    hc = next(x for x in P["habitat_check"] if x["habitat"] == h["id"])
    F = P["flex"]
    thr, d0 = F["ood_threshold"], F["d0_median"]
    lr = next(m for m in F["validation"]["models"] if m["key"] == "lr")
    ranked = sorted(P["investigations"], key=lambda r: -r["relevance"][h["id"]]["score"])[:3]
    items = [
        f"{h['name']}: {o2(h['x_o2'])} O2 at {psi(h['p_atm'])} ({h['p_atm']:.2f} atm). Source: {h['source']}.",
        _model_item(HAB_IN[h["id"]], "Methanol", hc["fuels"]["Methanol"], d0, thr),
        _model_item(HAB_IN[h["id"]], "Heptane", hc["fuels"]["Heptane"], d0, thr),
    ]
    if h["id"] != "cabin":
        cab = next(x for x in P["habitat_check"] if x["habitat"] == "cabin")["fuels"]["Methanol"]
        items.append(f"For comparison, the same model gives a methanol droplet flame a {pct(cab['p'])} chance of putting itself out "
                     f"in spacecraft cabin air (21% O2, 14.7 psi).")
    items.append("Most relevant PSI investigations for this habitat (relevance score out of 100): " + "; ".join(
        f"{r['name']} ({r['psi_id']}, {r['relevance'][h['id']]['score']:.1f})" for r in ranked) + ".")
    top = ranked[0]
    items.append(f"{top['name']} has about {top['relevance'][h['id']]['n_near']:.1f} test-equivalents within about 3 points of O2 "
                 f"and 30% of the pressure of this habitat.")
    cov = P["coverage"]
    items.append(f"Across all PSI flight tests with an ambient O2 and pressure, {cov['n_moon_envelope']} of {cov['n_ambient']:,} records sit "
                 f"inside the lunar-base envelope (at least 28% O2, at most 0.75 atm), and no solid-material test was flown there.")
    items.append(f"The FLEX model was validated on held-out ISS test days: AUC {lr['auc']:.2f} and Brier score {lr['brier']:.3f} "
                 f"(n = {F['n']}), better than an oxygen-only baseline.")
    for f in P["findings"][:4]:
        items.append(f"Finding ({f['layer']}, evidence score {f['score']:.0f}/100): {f['title']}. Implication: {f['implication']}")
    if h["id"] in ("eva_prep", "moon_base", "exploration"):
        k = P["next"]["picks"][0]
        items.append(f"Highest-value next flight test near lunar-base air: {k['fuel'].lower()} droplet at {o2(k['x_o2'])} O2, "
                     f"{k['p_atm']:.2f} atm and {o2(k['x_co2'])} CO2, where the model's 90% interval is "
                     f"{pct(k['interval'][0])}–{pct(k['interval'][1])}.")
    return {"kind": "habitat", "id": h["id"], "title": h["name"],
            "items": {f"E{i + 1}": t for i, t in enumerate(items)}}


HAB_IN = {"cabin": "spacecraft cabin air", "eva_prep": "EVA-prep air", "moon_base": "lunar-base air",
          "exploration": "the exploration atmosphere", "suit": "the spacesuit"}
HAB_SHORT = {"cabin": "cabin", "eva_prep": "EVA prep", "moon_base": "lunar base", "exploration": "exploration atmosphere",
             "suit": "spacesuit"}


def investigation_pack(r, P, rank_moon):
    items = [f"{r['name']} ({r['psi_id']}): {r['title']}. {r['type']} investigation, platform: {r['platform']}; hardware: {r['hardware']}."]
    if r.get("objective"):
        items.append(f"Objective, from NASA PSI: {r['objective']}")
    if r["n_tests"] and r["tables"]:
        items.append(f"{r['n_tests']:,} records in its PSI experimental tables, {r['n_with_outcome']:,} with a labeled outcome.")
    else:
        items.append("No experimental data table in PSI: this is a ground, analysis or modeling investigation.")
    if r["o2_min"] is not None:
        rng = (f"{o2(r['o2_min'])}–{o2(r['o2_max'])} O2" if r["o2_max"] > r["o2_min"] else f"{o2(r['o2_min'])} O2")
        prs = (f"{r['p_min']:.2f}–{r['p_max']:.2f} atm" if r["p_max"] > r["p_min"] else f"{r['p_min']:.2f} atm")
        items.append(f"Conditions tested: {rng}, {prs}" + (" (cabin air assumed where not reported)." if r["conditions_assumed"] else "."))
    varied = [v["variable"] for t in r["tables"] for v in t["varied"]][:6]
    measured = [v["variable"] for t in r["tables"] for v in t["measured"]][:5]
    if varied or measured:
        items.append(f"Varied: {', '.join(varied) or 'none'}. Measured: {', '.join(measured) or 'none'}.")
    items.append("Relevance score out of 100 by habitat: " + ", ".join(
        f"{HAB_SHORT[h['id']]} {r['relevance'][h['id']]['score']:.1f}" for h in HABITATS) +
        f". Rank {rank_moon} of {len(P['investigations'])} for the lunar base.")
    if r.get("earth_benefit"):
        items.append(f"Benefit on Earth, from NASA PSI: {r['earth_benefit']}")
    S = P["similarity"]
    i = S["ids"].index(r["psi_id"])
    sims = sorted(((S["matrix"][i][j], S["names"][j]) for j in range(len(S["ids"])) if j != i), reverse=True)[:2]
    items.append(f"Most similar investigations (similarity 0 to 1): {sims[0][1]} ({sims[0][0]:.2f}) and {sims[1][1]} ({sims[1][0]:.2f}).")
    items.append(f"Layers of fire safety it informs: {', '.join(r['layers'])}. Publications listed in PSI: {r['n_publications']}.")
    return {"kind": "investigation", "id": r["psi_id"], "title": f"{r['name']} · {r['psi_id']}",
            "items": {f"E{k + 1}": t for k, t in enumerate(items)}}


def pack_hash(pack):
    return hashlib.sha256(json.dumps(pack["items"], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def build_packs(P):
    ranked = sorted(P["investigations"], key=lambda r: -r["relevance"]["moon_base"]["score"])
    rank = {r["psi_id"]: i + 1 for i, r in enumerate(ranked)}
    packs = [habitat_pack(h, P) for h in HABITATS] + [investigation_pack(r, P, rank[r["psi_id"]]) for r in ranked]
    for p in packs:
        p["hash"] = pack_hash(p)
    return packs


def check_sentence(s, items):
    problems = []
    text, cites = s.get("text", ""), s.get("cites", [])
    if not cites:
        problems.append("no citation")
    unknown = [c for c in cites if c not in items]
    if unknown:
        problems.append(f"unknown citation {unknown}")
    allowed = set().union(*(numbers(items[c]) for c in cites if c in items)) if cites else set()
    invented = sorted(numbers(text) - allowed)
    if invented:
        problems.append(f"number(s) not in the cited evidence: {invented}")
    if VERDICT.search(text):
        problems.append(f"safety verdict: '{VERDICT.search(text).group(0)}'")
    if len(text) > MAX_SENTENCE:
        problems.append("sentence too long")
    if not text.strip():
        problems.append("empty sentence")
    return problems


def verify(draft, pack):
    if not draft:
        return ["no draft"]
    problems = []
    if draft.get("pack_hash") != pack["hash"]:
        problems.append("stale: evidence changed since the draft was written")
    sents = draft.get("sentences") or []
    if not 1 <= len(sents) <= 6:
        problems.append("a brief needs 1 to 6 sentences")
    for i, s in enumerate(sents):
        problems += [f"sentence {i + 1}: {p}" for p in check_sentence(s, pack["items"])]
    head = draft.get("headline", "")
    if head:
        invented = sorted(numbers(head) - set().union(*(numbers(t) for t in pack["items"].values())))
        if invented:
            problems.append(f"headline: number(s) not in the evidence: {invented}")
        if VERDICT.search(head):
            problems.append("headline: safety verdict")
    return problems


def deterministic_brief(pack):
    items = pack["items"]
    if pack["kind"] == "habitat":
        ranked = next(k for k, t in items.items() if t.startswith("Most relevant PSI investigations"))
        keys = ["E2", ranked]
    else:
        keys = ["E2" if "E2" in items else "E1", "E3"]
    return [{"text": items[k], "cites": [k]} for k in keys if k in items]


GLOSSARY = [
    ("Self-extinction", "A flame that goes out on its own before the fuel is used up, without any suppressant. In FLEX this is the "
     "'extinction' outcome; in ACME CFI-G it is a flame that went out before the fuel flow was stopped."),
    ("Cool flame", "A low-temperature flame that burns with almost no visible light. Cool flames were confirmed in orbit by CFI and "
     "ACME CFI-G and can be missed by optical detectors."),
    ("Microgravity", "Near-weightless conditions such as on the ISS. Hot gas does not rise, so flames become slow and round and fresh "
     "oxygen arrives only by diffusion or ventilation."),
    ("Partial gravity", "Gravity between orbit and Earth, such as the Moon (about 1/6 g) or Mars (about 3/8 g). PSI has no combustion "
     "data at partial gravity yet; microgravity and 1 g results only bound it."),
    ("Out-of-data guard", "Skylab Phoenix measures how far a scenario is from the flown tests. Inside the 95th-percentile distance the "
     "model predicts; up to twice that it warns; beyond that it withholds the prediction."),
    ("Exploration atmosphere", "A reduced-pressure, oxygen-enriched cabin (8.2 psi, 34% O2) chosen so crews can start spacewalks with "
     "little pre-breathing. Materials burn more readily as the oxygen fraction rises."),
    ("Limiting oxygen", "The lowest oxygen level at which a material keeps burning. NASA's 1 g screening may not be conservative in "
     "microgravity at low airflow, which is why flight data matter."),
    ("AUC", "Area under the ROC curve: how well a model ranks positives above negatives. 0.5 is chance and 1.0 is perfect."),
]


def corpus(P):
    out = []
    for r in P["investigations"]:
        meta_path = RAW / r["psi_id"] / "metadata.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
        src = {"psi": r["psi_id"], "url": r["psi_url"]}
        for field, label in (("objective", "Objective"), ("hypothesis", "Hypothesis"), ("approach", "Approach")):
            txt = re.sub(r"\s+", " ", str(meta.get(field) or "")).strip()
            if txt:
                out.append({"kind": "NASA PSI", "title": f"{r['name']} · {label}", "text": txt, **src})
        if r.get("earth_benefit"):
            out.append({"kind": "NASA PSI", "title": f"{r['name']} · Benefit on Earth", "text": r["earth_benefit"], **src})
        pubs = [p.get("title", "") for p in meta.get("publications", []) if p.get("title")]
        if pubs:
            out.append({"kind": "NASA PSI", "title": f"{r['name']} · Publications ({len(pubs)})", "text": " · ".join(pubs), **src})
    for f in P["findings"]:
        out.append({"kind": "Skylab Phoenix finding", "title": f["title"], "text": f"{f['text']} {f['implication']}",
                    "psi": f["source"], "url": "#findings"})
    for h in HABITATS:
        out.append({"kind": "Habitat", "title": h["name"], "text": f"{h['detail']}. {o2(h['x_o2'])} O2 at {psi(h['p_atm'])}. {h['source']}.",
                    "psi": "", "url": "#scenario"})
    for t, d in GLOSSARY:
        out.append({"kind": "Glossary", "title": t, "text": d, "psi": "", "url": ""})
    return out


def build(P):
    SI_DIR.mkdir(parents=True, exist_ok=True)
    packs = build_packs(P)
    PACKS.write_text(json.dumps(packs, ensure_ascii=False, indent=1), encoding="utf-8")
    store = json.loads(DRAFTS.read_text(encoding="utf-8")) if DRAFTS.exists() else {"meta": {}, "drafts": {}}
    out = {"meta": store.get("meta", {}), "habitat": {}, "investigation": {}}
    report, n_ok = {}, 0
    for p in packs:
        key = f"{p['kind']}:{p['id']}"
        draft = store["drafts"].get(key)
        problems = verify(draft, p)
        ok = not problems
        n_ok += ok
        report[key] = problems
        out[p["kind"]][p["id"]] = {
            "source": "si" if ok else "deterministic",
            "headline": (draft or {}).get("headline", "") if ok else "",
            "sentences": draft["sentences"] if ok else deterministic_brief(p),
            "evidence": p["items"], "problems": problems,
        }
    out["meta"].update({"verified": n_ok, "total": len(packs)})
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    dl = WEB_DATA / "downloads"
    dl.mkdir(parents=True, exist_ok=True)
    (dl / "si_evidence_packs.json").write_bytes(PACKS.read_bytes())
    (dl / "si_verification.json").write_bytes(REPORT.read_bytes())
    (WEB_DATA / "si.js").write_text("window.SI=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";", encoding="utf-8")
    (WEB_DATA / "corpus.js").write_text("window.CORPUS=" + json.dumps(corpus(P), ensure_ascii=False, separators=(",", ":")) + ";",
                                        encoding="utf-8")
    return n_ok, len(packs)
