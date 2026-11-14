# Skylab Phoenix vs the strongest public Flame in Freefall projects

*Flame in Freefall* is new in 2026, so there are no projects from earlier editions. On 14 November 2026 we read the README of 111 public GitHub repositories for this challenge and compared Skylab Phoenix with the two that were strongest on paper. Their claims come from their own READMEs and were **not** independently verified.

- **FlameBound** (Melbourne local event): https://github.com/prattaybanik03/flamebound-flame-in-freefall
- **Flame in Freefall** (Zewail City of Science and Technology and Cairo University): https://github.com/Mohammed-Ayman-2023/Flame-in-FreeFall-NASA-Space-Apps

**No code was copied.** These teams compete in the same challenge, and the Space Apps rules expect each solution to be the team's own work. Where they had a useful idea we lacked, we built our own version on our own data and code, and we credit the idea here.

## Side by side

| | **Skylab Phoenix** | FlameBound | Zewail / Cairo |
|---|---|---|---|
| SI layer | Briefings per habitat and per investigation; firewall checks citations, numbers, verdicts and evidence hash; deterministic fallback | SI evidence briefing with a citation/number firewall; RAG over 193 NASA passages | Gemini RAG over 4,086 report chunks; offline TF-IDF search |
| Search over NASA text | BM25 over objectives, hypotheses, approach, publications, findings, glossary (quotes only) | BM25 + SI answer | TF-IDF + SI answer |
| Models | FLEX logistic, 200-model bootstrap, AUC 0.88 (day-grouped CV) vs GBM 0.84 and O₂-only 0.80; calibration plot; CFI-G limiting-temperature test | None (deterministic match score) | Solids GBM (AUC 0.958), gas-flame survival model, droplet Gaussian process |
| Out-of-data handling | kNN distance **and** per-input flown range → within / extrapolating / withheld | O₂ gate ±2 points + score threshold | In/out of tested range label |
| Next experiment | Active learning on the bootstrap ensemble | — | 5 recommended experiments |
| Data quality | 53 logged corrections | Status per value (recorded, approx, suspect…) | 103 logged corrections |
| Habitats | Cabin, EVA prep, lunar base, exploration 8.2 psi / 34%, suit | ISS, lunar base, exploration, EVA | Mission presets incl. Moon, Mars |
| Audiences | “Choose your view” for 5 audiences | Engineer focus | 5 audience views |
| Compare investigations | Up to 3 side by side, differences highlighted | — | Up to 3 side by side |
| Share / export | Scenario in the URL; Markdown briefing; CSV/JSON downloads | Scenario URL; PDF/Markdown report; BibTeX | CSV downloads; one-page HTML briefing |
| Tests / CI | pytest (data, models, guard, firewall) + GitHub Actions | 84 tests, CI, accessibility audit | Unit and acceptance tests |
| Documentation | English README + 37-page Spanish report + English summary | Architecture and data docs | Submission summary, deploy notes |

## What we added after the comparison (our own implementation)

| Idea seen in | What we built |
|---|---|
| Both | **SI briefings with a verification firewall** (`pipeline/si.py`), evidence shown behind every sentence |
| Both | **Ask the archive**: BM25 search over NASA's own text, in the browser, with sources |
| Both | **Exploration atmosphere** (8.2 psi, 34% O₂) as a fifth habitat, with a NASA source |
| Zewail / Cairo | **Audience views** for the five audiences named in the challenge |
| Both | **Side-by-side comparison** of investigations |
| FlameBound | **Shareable scenario links** |
| Zewail / Cairo | **Downloads** of every table and the SI evidence |
| FlameBound | **Tests and continuous integration** |

## What we kept that sets Skylab Phoenix apart

1. **Validation a NASA reviewer can trust:** cross-validation that holds out whole ISS test days, with gradient boosting and oxygen-only baselines and a calibration plot.
2. **Uncertainty everywhere:** a 200-model bootstrap runs live in the browser, so every slider position has a 90% interval.
3. **A guard that refuses to answer:** it now also catches single-input extrapolation (the 8.2 psi atmosphere is below every flown FLEX test).
4. **Active learning for the next flight test**, not only a list of gaps.
5. **One-command reproducibility** from NASA's public API, with every correction logged.

## What we chose not to add, and why

- **A fitted solid-materials classifier:** PSI has no labeled solid-material flight test above 22.7% O₂, so a black-box model would extrapolate exactly where the decision matters. Instead we use NASA's own fitted flammability boundary from the BASS-II report, add the CO and CO₂ measured in 129 BASS-II tests, and mark every habitat above cabin air as extrapolation.
- **A 3D scene or hardware sensors:** they look good but add no evidence.
- **Free-form SI answers to any question:** our search quotes NASA text, and SI text appears only where code can verify it.
