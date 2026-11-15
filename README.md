# Skylab Phoenix

**NASA Space Apps Challenge 2026 · Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data**
Team Skylab Phoenix (Barranquilla, Colombia): Juan Sebastián Zárate (lead) and Javier Medina · [Leer en español](README.es.md)

> The Moon base will breathe 30% oxygen. Skylab Phoenix answers, from NASA's own flight data, what happens to fire there, how sure that answer is, and where the data runs out.

- **Website:** https://juanzarate1129517999-beep.github.io/nasa-space/ (English and Spanish, no login, the models run in the browser)
- **30-second video:** [docs/video/skylab_phoenix_30s.mp4](docs/video/skylab_phoenix_30s.mp4)
- **Technical report:** [English](report/Technical_Report_Skylab_Phoenix.pdf) · [Spanish](report/Informe_Skylab_Phoenix.pdf)
- **Submission texts:** [SUBMISSION.md](SUBMISSION.md) · **Use of AI:** [docs/AI_USE.md](docs/AI_USE.md)

## The website

| Section | What it shows |
|---|---|
| **Home** | The headline numbers and a 3D Earth with the live ISS orbit and 23 NASA satellites, the Moon and Mars |
| **Learn 3D** | A four-chapter immersive story: NASA's Artemis plan over a real 3D Moon and the descent to a south-pole site on NASA's 5 m/pixel LOLA terrain, lit by the Sun where JPL Horizons places it; five ways a fire starts inside an ISS module, each tied to the NASA investigation that measured it; how one flame changes from Earth to orbit; the same fire in four gravities |
| **Flames** | 43 clips of real flight video (solids, liquids, gases) and the solid-material limits measured by BASS-II |
| **Fire Lab** | Will a fire go out on its own? A two-stage physics model trained on 261 FLEX droplet fires gives the chance it goes out, breaks apart or burns to the end, with a 90% interval, and says when it is extrapolating. The droplet burns in real time by the d² law, with the burning rate and extinction diameter of the five closest flight tests |
| **Findings** | An interactive dashboard over all 1,955 records (every chart filters the others), the coverage of crew atmospheres, a fire audit of a three-module lunar base and the findings ranked by evidence |
| **Ranking** | The 24 PSI combustion investigations ranked for each crew atmosphere with an adjustable score, files and side-by-side comparison |
| **Next flight** | The experiment that would teach the most, the six candidates and the map of where the model is unsure |
| **Ask SI** | Plain-language briefings written by an SI model and published only after code checks every citation and number; a search over NASA's own text |
| **Method** | Nine steps from the question to reproduction, with the 191 logged corrections to NASA's tables and the validation |

## Key results

- A methanol droplet fire puts itself out **75%** of the time in ISS cabin air (21% O₂, 14.7 psi) and only **8%** in lunar-base air (30% O₂, 10.2 psi), 90% interval 1–16%. There the droplet is predicted to break apart 81% of the time and burn to completion 11%: almost no fire ends by going out.
- Only **37 of 1,613** flight records with a known atmosphere sit near lunar-base air. NASA's PSI tables hold **no solid** burned above 22.7% O₂; the only higher burns are four Saffire V and VI samples that NASA published (26–31% O₂, 0.53–0.70 atm, [Urban et al. 2024](https://ntrs.nasa.gov/citations/20240002981)), shown on the site as literature data.
- The two-stage model scores **AUC 0.88** (±0.01 over 20 repeats) and Brier 0.120 on ISS test days it never saw, ahead of the previous single logistic (0.87), gradient boosting (0.84) and an oxygen-only baseline (0.80). Its two steps score 0.86 each: will the droplet break apart, and if not, will the flame go out with fuel left.
- **191** corrections to NASA's tables, each logged with the original value.
- **33 of 33** SI briefings pass the verification firewall.

## Run it

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/fetch_psi_catalog.py combustion
python scripts/fetch_psi.py data/psi PSI-10 PSI-20 PSI-21 PSI-22 PSI-23 PSI-25 PSI-26 PSI-39 PSI-47 PSI-60 PSI-62 PSI-68 PSI-69 PSI-98 PSI-99 PSI-100 PSI-101 PSI-102 PSI-106 PSI-107 PSI-115 PSI-117 PSI-142 PSI-159
python scripts/build_moon_assets.py web/assets/moon     # LOLA terrain, Moon textures, JPL Horizons
python -m pipeline.run                                  # NASA tables -> clean data -> models -> SI firewall -> web/data
python scripts/i18n_es.py web/data/i18n-es.js           # Spanish texts
python -m pytest
python scripts/serve.py                                 # website at http://127.0.0.1:8765
```

GitHub Pages publishes `web/` on every push to `main` (`.github/workflows/pages.yml`).

## Repository

| Path | Role |
|---|---|
| `web/` | The website: `index.html`, `styles.css`, `app.js`, `i18n.js`, the 3D modules (`globe.js`, `moonbase.js`, `sources3d.js`, `lab3d.js`), data, flight video and bundled Plotly and three.js |
| `pipeline/` | Cleaning, profiles and ranking, models, solids, lunar base audit, SI evidence and firewall, web export |
| `scripts/` | Downloads from NASA PSI, lunar assets, SI drafts, Spanish texts, local server |
| `data/` | Versioned outputs: clean tests, investigations, quality log, findings, SI evidence and verification; `data/literature/` holds the published Saffire IV–VI burns, each with its source |
| `tests/` | Data, model, out-of-data guard and SI firewall tests |
| `report/` | Technical report PDFs |
| `docs/` | Use of AI and the 30-second video |

## Data and license

Data: NASA Physical Sciences Informatics (PSI), Combustion Science investigations, public domain (CC0); NASA SVS, LRO LOLA (PGDA) and JPL Horizons for the Moon. Code: [MIT License](LICENSE). The models are research aids, not flight certification. This project is not affiliated with or endorsed by NASA.
