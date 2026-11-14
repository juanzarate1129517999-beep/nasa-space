# Skylab Phoenix: technical summary (English)

English summary of the 37-page Spanish report [report/Informe_Skylab_Phoenix.pdf](../report/Informe_Skylab_Phoenix.pdf). Every number below is produced by `python -m pipeline.run`.

## 1. Problem

Artemis surface habitats and pressurized rovers are expected to run at **30% O₂ or more and 10.2 psi or less**, and NASA's exploration habitat standard is **8.2 psi with 34% O₂**. A higher oxygen fraction makes materials burn more readily, and in microgravity there is no buoyancy, so flames are slow, round and fed only by diffusion or ventilation. NASA has flown two decades of combustion experiments, but the results sit in 24 Physical Sciences Informatics (PSI) investigations with different formats, units and levels of detail. The challenge asks for an SI-powered dashboard that summarizes, ranks and interprets them for crew fire safety.

**Research question.** What does NASA's flight data say about fire in the atmospheres crews will live in, how certain is it, and where does it stop?

## 2. Data engineering

- **Source:** PSI public API, 24 Combustion Science investigations (19 flight, 5 ground), CC0.
- **Silver layer:** one parser per experiment maps every table to a common schema in SI units (O₂ mole fraction, pressure in atm, flow in cm/s, droplet diameter in mm), with flags for assumed cabin air and for O₂ measured at the burner rather than in the room.
- **Result:** 1,989 test records, 688 with a labeled outcome.
- **Quality:** 50 corrections, each logged with the original value and the rule applied (`data/gold/qc_log.csv`): spreadsheet auto-fill errors (CH4 → CH5, CH6…), “3400%” instead of 34%, an impossible 0 mmHg pressure, mole fractions that do not sum to 1, duplicate rows, inconsistent labels.

## 3. Summaries, ranking and similarity

Each investigation is profiled from its own tables: what varied, what was held fixed, what was measured, the conditions covered, hardware and platform. Relevance per habitat is a transparent score:

`relevance = 0.5 × proximity + 0.2 × labeled evidence + 0.3 × fire-safety directness`

where proximity counts test-equivalents within about 3 points of O₂ and 30% of the habitat pressure (Gaussian kernel). Similarity between investigations combines shared keywords, fuel family, hardware, overlapping O₂ range and PSI links, and is ordered by hierarchical clustering. For the lunar base, FLEX ranks first (95.1/100), then ACME CFI-G (66.8) and ACME BRE (48.1).

## 4. Machine learning

**FLEX self-extinction model.** Logistic regression on six physical inputs (fuel, O₂, log pressure, CO₂, helium, initial droplet diameter), trained on 261 ISS droplet fires.

| Model (5-fold, whole test days held out, 80 days) | AUC | Brier |
|---|---|---|
| **Skylab Phoenix logistic (deployed)** | **0.882** | **0.125** |
| Gradient boosting, same inputs | 0.843 | 0.144 |
| Oxygen only | 0.796 | 0.158 |
| Base rate | 0.500 | 0.220 |

A 200-model bootstrap (resampling whole test days) gives the 90% interval of every prediction; the dashboard runs the ensemble live in the browser.

| Habitat (methanol droplet, 3 mm, no diluent) | P(flame puts itself out) | 90% interval | Data status |
|---|---|---|---|
| Spacecraft cabin, 21% O₂, 14.7 psi | 72% | 56–86% | within flown tests |
| EVA prep, 26.5% O₂, 10.2 psi | 21% | 8–37% | within |
| Lunar base, 30% O₂, 10.2 psi | 6% | 2–14% | within |
| Exploration, 34% O₂, 8.2 psi | 1% | 0–4% | **extrapolating** (pressure below every flown test) |
| Spacesuit, 100% O₂, 4.3 psi | withheld | — | **outside** all flight data |

**Out-of-data guard.** Mean distance to the 5 nearest flown tests in standardized input space, with the 95th percentile among flown tests as the limit: within 1× → predict; 1–2× → warn; beyond 2× → withhold. Since this update, leaving the flown range of any single input also counts as extrapolation.

**CFI-G limiting temperature.** For normal gas flames, self-extinction rises as adiabatic flame temperature falls (the 50% point, about 2,858 K, lies just above the hottest flame tested, so it is an extrapolation); for inverse flames a single-temperature rule has no predictive power.

**Next experiment (active learning).** Among atmospheres near lunar-base air, the pipeline picks where the bootstrap models disagree most: a methanol droplet at 27% O₂, 0.60 atm and 30% CO₂ (current 90% interval 10–51%), that is, the CO₂ needed to suppress a fire at lunar-base conditions.

## 5. SI layer

For each habitat and investigation the pipeline writes a numbered evidence pack. An SI model (Anthropic Claude) writes a 2–4 sentence briefing; each sentence lists the items it relies on. A verification firewall publishes the briefing only if every sentence cites existing evidence, every number appears in the cited evidence, there is no safety verdict, and the evidence is unchanged since the draft (hash). 29 of 29 briefings pass; any that fail are replaced by a labelled deterministic brief. “Ask the archive” is a BM25 search over NASA's own text, which quotes rather than generates.

## 6. Findings (ranked by evidence score)

1. **Almost no flight data where the Moon base will live:** 37 of 1,647 records sit inside the lunar-base envelope; no solid-material test exceeds 22.7% O₂ or was flown at reduced pressure.
2. **Lunar-base air makes self-extinction about 11× less likely than cabin air** (72% → 6%), so material screening at 21% O₂ and 1 atm cannot be reused without re-testing.
3. **Solid-material data is dominated by one plastic (PMMA).**
4. **Above 30% O₂, droplet flames stop putting themselves out:** 2 of 24 fires at 30–34% O₂, and 0 of 17 at 0.70 atm.
5. **CO₂ dilution suppresses droplet fires at reduced pressure**, but its effect is confounded with O₂ in FLEX: a controlled series is needed.
6. **Cool flames were confirmed in orbit** and burn with almost no visible light, so optical detectors can miss them.
7. **Airflow direction matters:** the same Saffire-I fabric burned about 6× longer with concurrent flow.

## 7. Limitations

- Droplet and gas-flame models do not transfer directly to solid cabin materials.
- PSI has no partial-gravity combustion data; microgravity and 1 g results only bound lunar and Martian behaviour.
- Several tables omit pressure or O₂; those tests are marked as assumed cabin air and down-weighted.
- The models are research aids, not flight certification.
