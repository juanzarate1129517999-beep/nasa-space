# Skylab Phoenix: fire-safety intelligence from NASA's microgravity combustion data

**NASA Space Apps Challenge 2026 · Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data**
Team **Skylab Phoenix** (Barranquilla, Colombia): Juan Sebastián Zárate (lead) and Javier Medina · [Leer en español](README.es.md)

**Live dashboard:** https://juanzarate1129517999-beep.github.io/nasa-space/ (static site; models run in your browser, no login, works offline once loaded)
**Technical report (Spanish, 37 pages):** [report/Informe_Skylab_Phoenix.pdf](report/Informe_Skylab_Phoenix.pdf) · **English summary:** [docs/TECHNICAL_SUMMARY.md](docs/TECHNICAL_SUMMARY.md)
**Submission texts and checklist:** [SUBMISSION.md](SUBMISSION.md) · **Use of AI/SI:** [docs/AI_USE.md](docs/AI_USE.md)

> The Moon base will breathe 30% oxygen. Skylab Phoenix answers, from NASA's own flight data, what happens to fire there, and shows where that data runs out.

## What it does

| Challenge objective | What Skylab Phoenix delivers |
|---|---|
| **SI-powered** summaries and interpretation | An SI layer writes a briefing for each habitat and each of the 24 investigations. A code **firewall** publishes it only if every sentence cites numbered evidence, every number appears in that evidence, and nothing reads as a safety verdict (29/29 pass). |
| **Summarize, rank and compare** investigations | 24 PSI Combustion Science investigations profiled from their own tables (what varied, what was fixed, what was measured), ranked per habitat with a transparent score, and compared side by side. |
| **Identify** investigations relevant to crew habitats | Coverage map of every flight test against five habitat atmospheres: cabin, EVA prep, lunar base, NASA's 8.2 psi / 34% O₂ exploration atmosphere and the spacesuit. |
| Data for **predictive flammability modeling** | 1,989 test records in one schema with SI units, 50 logged corrections to NASA's tables, and a validated self-extinction model that runs live in the browser. |
| **Next-generation fire-safety** insights | Findings ranked by strength of evidence (prevention, detection, suppression) and an active-learning pick of the next flight experiment. |
| Audiences named in the challenge | “Choose your view” paths for undergraduates, graduate students, professors, researchers and engineers; **Ask the archive** search over NASA's own text with sources. |

## Key results (computed by the pipeline, not written by hand)

- **Self-extinction model (FLEX):** AUC 0.88 and Brier 0.125 with whole ISS test days held out (80 days, n = 261), better than gradient boosting (0.84) and an oxygen-only baseline (0.80).
- **Cabin vs Moon:** a methanol droplet flame puts itself out 72% of the time in cabin air (21% O₂, 1 atm) and 6% in lunar-base air (30% O₂, 10.2 psi), 90% interval 2–14%.
- **Coverage gap:** of 1,647 flight records with an ambient O₂ and pressure, only 37 sit near lunar-base air, and **no solid material** has ever been burned there.
- **Honest limits:** the model says *extrapolating* when any input leaves the flown range (the 8.2 psi exploration atmosphere is below every FLEX test) and *withholds* a number far from the data (the spacesuit).
- **Data quality:** 50 corrections to NASA's tables, each logged with the original value (spreadsheet auto-fill errors, "3400%" for 34%, a 0 mmHg pressure, duplicate rows).

## How the SI layer stays honest

```
gold data ──► evidence packs (E1, E2, … computed from PSI tables)
                 │
                 ├─► SI model writes a briefing; each sentence lists the items it cites
                 │
                 ▼
          verification firewall (pipeline/si.py)
           ✓ every sentence cites existing evidence
           ✓ every number appears in the cited evidence
           ✓ no safety verdicts ("is safe", "certified", …)
           ✓ evidence unchanged since the draft (hash)
                 │
        pass ────┴──── fail
         │               │
 "SI-written ·      "Evidence brief ·
  verified ✓"        deterministic"
```

The SI interprets; it never decides. Rankings, predictions and the out-of-data guard are deterministic and tested. Regenerate the drafts with Claude: `python scripts/si_generate.py` (needs `ANTHROPIC_API_KEY`).

## Run it

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/fetch_psi_catalog.py combustion           # PSI catalog (public API, no login)
python scripts/fetch_psi.py data/psi PSI-10 PSI-20 PSI-21 PSI-22 PSI-23 PSI-25 PSI-26 PSI-39 PSI-47 PSI-60 PSI-62 PSI-68 PSI-69 PSI-98 PSI-99 PSI-100 PSI-101 PSI-102 PSI-106 PSI-107 PSI-115 PSI-117 PSI-142 PSI-159
python -m pipeline.run                                   # silver -> gold -> models -> SI firewall -> web/data (~4 s)
python -m pytest                                         # tests
python scripts/serve.py                                  # dashboard at http://127.0.0.1:8765
```

Optional: `pip install anthropic` and `python scripts/si_generate.py` to regenerate the SI drafts; `python report/figures.py` and `python report/build_report.py` rebuild the Spanish report (needs Chrome or Edge).

The dashboard is a static site in `web/` (Plotly is bundled, no CDN). It also works by opening `web/index.html` from disk. GitHub Pages serves the `gh-pages` branch; the workflow in `.github/workflows/pages.yml` publishes `web/` there on every push to `main`.

## Repository layout

| Path | Role |
|---|---|
| `scripts/fetch_psi*.py` | **Bronze:** metadata and experimental tables from NASA PSI's public API |
| `pipeline/silver.py` | **Silver:** one parser per experiment → common schema, SI units, quality rules and correction log |
| `pipeline/investigations.py` | **Gold:** automatic profile of the 24 investigations, similarity and per-habitat ranking |
| `pipeline/models.py` | **ML:** FLEX self-extinction model (logistic + 200-model bootstrap), CFI-G limiting-temperature test, out-of-data guard, next experiment |
| `pipeline/gold.py` | Findings with evidence scores, analytic tables, web export and downloads |
| `pipeline/si.py` | **SI layer:** evidence packs, verification firewall, deterministic fallback, search corpus |
| `scripts/si_generate.py` | Regenerates SI drafts with Claude through the Anthropic API |
| `data/gold/`, `data/si/` | Versioned outputs: tests, investigations, QC log, findings, evidence packs, SI drafts and verification |
| `web/` | Dashboard (HTML/CSS/JS + bundled Plotly) |
| `tests/` | Pytest suite: data integrity, model behaviour, out-of-data guard, SI firewall |
| `report/` | Spanish technical report and figures |
| `docs/` | English summary, use of AI, comparison with other approaches |

## Data and license

Data: NASA Physical Sciences Informatics (PSI), Combustion Science investigations, public domain (CC0): [PSI search "combustion"](https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation). Exploration atmosphere: NASA's 8.2 psia / 34% O₂ habitat standard ([NTRS 20240007817](https://ntrs.nasa.gov/citations/20240007817)).

Code: [MIT License](LICENSE). The models are research aids, not flight certification. This project is not affiliated with or endorsed by NASA.
