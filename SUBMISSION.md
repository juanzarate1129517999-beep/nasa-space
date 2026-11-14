# Space Apps 2026 submission: Skylab Phoenix

Ready-to-paste texts for the project page on spaceappschallenge.org, plus the checklist of what the rules require. Everything on the submission page and in linked material must be in **English**.

## Acceptance checklist

Sources: Space Apps [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide) and [2026 Participant Terms](https://www.spaceappschallenge.org/legal/). Check the live pages before submitting; the rules can change between editions.

| Requirement | Status in this repository | Action for the team |
|---|---|---|
| All required fields of the project page completed (submission is blocked otherwise) | Texts below | Paste them; pick the challenge “Flame in Freefall” |
| **Project demo**: a video of up to 30 seconds *or* a slide deck of up to 7 slides (title slide included), hosted outside the Space Apps site | 7-slide deck: [docs/demo/Skylab_Phoenix_demo.pdf](docs/demo/Skylab_Phoenix_demo.pdf); 30-second video script below | Upload the PDF (Google Drive or GitHub link) or record the video |
| Demo in English; **videos with English subtitles** | Deck and script in English | Burn in subtitles if you record the video |
| **Final project link**, publicly accessible with no login, permission or registration | Repository (public) + live dashboard on GitHub Pages | Open both links in a private browser window to confirm |
| English on the submission page and in all linked material | README, dashboard, deck, full technical report and this file in English; Spanish report kept as an extra | Link the English report |
| Say how space-agency open data made the project possible | “Use of NASA data” below | Paste it |
| **Disclose use of AI/SI** where and how it was used | [docs/AI_USE.md](docs/AI_USE.md), dashboard footer, badges on every SI briefing | Paste the “Use of AI” text below |
| SI-generated images/video carry a visible watermark; code and data acknowledge SI in text and metadata | docs/AI_USE.md, README, git co-author metadata, `meta.generator`, `"source": "si"`; no SI images in the dashboard | Confirm the logo and any demo footage; watermark if SI-made |
| No NASA logos, flags, insignia or mission identifiers in generated content; don't use NASA branding | None used | Keep it that way in the deck and video |
| Original content freely available or open source | [MIT License](LICENSE); data CC0 | — |
| Team of 6 or fewer, registered at the local event | 2 members, Barranquilla (CUC) | — |
| Judging criteria: **Impact, Creativity, Validity, Relevance, Presentation** | See “How the project maps to the judging criteria” | Rehearse the 3-minute pitch |

## Project name

Skylab Phoenix

## High-level summary (paste as is)

Artemis surface habitats and pressurized rovers will run at about 30% oxygen and 10.2 psi, where materials burn more readily, yet NASA's microgravity fire data is scattered across 24 investigations in different formats. Skylab Phoenix turns the NASA Physical Sciences Informatics combustion archive into an SI-powered dashboard. It cleans 1,989 flight-test records into one schema (logging 53 corrections to NASA's tables), ranks and compares the investigations for five crewed atmospheres, and runs a validated model live in the browser. The model shows that a fuel-droplet flame puts itself out 72% of the time in cabin air but only 6% in lunar-base air, while just 37 of 1,647 flight records sit near that atmosphere and no solid material has ever burned there. An SI layer writes plain-language briefings for each habitat and investigation; code publishes a briefing only if every sentence cites the data and every number is verified. The result tells crews and engineers what the evidence says, how sure it is, and what NASA should test next.

## Links

- **Final project (repository):** https://github.com/juanzarate1129517999-beep/nasa-space
- **Live dashboard:** https://juanzarate1129517999-beep.github.io/nasa-space/
- **Demo (7 slides):** link to `docs/demo/Skylab_Phoenix_demo.pdf` (GitHub or Google Drive, public)
- **Technical report (English):** https://github.com/juanzarate1129517999-beep/nasa-space/blob/main/report/Technical_Report_Skylab_Phoenix.pdf

## Project details

**What it does.** Skylab Phoenix answers one question for each crewed atmosphere (spacecraft cabin, EVA prep, lunar base, NASA's 8.2 psi / 34% O₂ exploration atmosphere and the spacesuit): what does NASA's flight data say about fire here, how certain is it, and where does the data stop?

**How it works.**
1. *Data engineering.* A Python pipeline downloads the 24 Combustion Science investigations from the PSI public API, maps every experimental table to one schema in SI units and logs each correction with the original value (spreadsheet auto-fill errors, “3400%” for 34%, an impossible 0 mmHg pressure, duplicate rows).
2. *Summaries and ranking.* Each investigation is profiled from its own tables (what varied, what was held fixed, what was measured) and ranked per habitat by a transparent score: closeness of the tested conditions, volume of labeled outcomes and directness for crew fire safety. A side-by-side view compares up to three investigations.
3. *Machine learning with honest uncertainty.* A logistic model trained on 261 FLEX droplet fires reaches AUC 0.88 and Brier 0.125 with whole ISS test days held out, ahead of gradient boosting (0.84) and an oxygen-only baseline (0.80). A 200-model bootstrap gives a 90% interval for every prediction. An out-of-data guard says “extrapolating” when any input leaves the flown range and withholds a number far from the data.
4. *SI layer.* For every habitat and investigation the pipeline builds a numbered evidence pack. Claude writes a short briefing from it; a verification firewall publishes the briefing only if each sentence cites evidence, each number appears in the cited evidence, and nothing reads as a safety verdict (29 of 29 pass). Users can open the evidence behind every sentence, download a briefing, and search NASA's own text with “Ask the archive”.
5. *Solid materials.* From the BASS-II test matrices we extract O₂, CO and CO₂ for 129 solid-fuel tests, and from NASA's BASS-II report the microgravity flammability boundary for PMMA. Solids keep burning at about 13.5% O₂ in a gentle 2 cm/s breeze, below the 15.4% limit of the normal-gravity test; near the limit they release more than twice as much CO. No solid has burned in orbit above 22.7% O₂, which is why solid-material flammability at ≥30% O₂ and ≤10.2 psi is the flight test the data asks for.
6. *Next experiment.* Active learning picks the flight test that would teach the model most near lunar-base air: CO₂ suppression of a methanol droplet at 27% O₂ and 0.60 atm.

**History and Earth.** The dashboard ties the challenge's resources to the data: Apollo 1, Apollo 13 and Mir (all oxygen-related fires), and Earth applications (smoke-versus-dust detection linked to SAME and DAFT, firefighter air tanks and clothing, water mist). All ten listed resources are linked where they are used.

**Benefits.** Engineers get the closest NASA evidence for their atmosphere with its uncertainty; researchers get a cleaned, documented dataset and the open questions; students and professors get guided paths and plain-language explanations. Everything is reproducible with one command, and the dashboard is a static site that works offline.

**Key findings.** (1) Above 30% O₂, droplet flames almost stop putting themselves out, so a lunar-base fire must be detected and suppressed. (2) Material screening done at 21% O₂ and 1 atm cannot be reused for the Moon base without re-testing. (3) The highest-value next flight experiment is solid-material flammability at ≥30% O₂ and ≤10.2 psi. (4) Cool flames, confirmed in orbit, burn with almost no visible light, so optical detectors can miss them and chemical sensing is a candidate complement.

**Tools.** Python (pandas, NumPy, SciPy, scikit-learn), Anthropic Claude API for the SI drafts, HTML/CSS/JavaScript with Plotly, pytest, GitHub Actions and GitHub Pages.

## Use of NASA data

All data comes from NASA's Physical Sciences Informatics (PSI) repository, Combustion Science area, public domain (CC0): experimental tables and metadata of 24 investigations, including FLEX (PSI-69), ACME CFI-G (PSI-159), ACME BRE (PSI-20), BASS (PSI-26), BASS-II (PSI-25), Saffire-I/II/III (PSI-98/99/100), SAME (PSI-102) and SAME-R (PSI-101). The PSI public API made it possible to rebuild everything from source with one command. Habitat atmospheres come from the challenge statement and from NASA's 8.2 psia / 34% O₂ exploration atmosphere (NTRS 20240007817).

## Space agency partner data

None used.

## Use of AI (paste as is)

AI tools were used in two places. (1) **In the product:** an SI model (Anthropic Claude) writes the short briefings shown in the dashboard, only from evidence packs computed from NASA data. Code checks every briefing before publishing it: each sentence must cite its evidence, every number must appear in that evidence, and no safety verdicts are allowed; otherwise the dashboard shows the raw evidence instead. Rankings, predictions and the out-of-data guard are deterministic code, not AI. (2) **In development:** code and documentation were written with AI assistance (Claude Code) and run, reviewed and tested by the team. No AI-generated images, video or audio are used. Details: docs/AI_USE.md in the repository.

## References

- NASA Physical Sciences Informatics, Combustion Science investigations: https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation
- Space Apps 2026, Flame in Freefall challenge: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- NASA exploration atmosphere (8.2 psia, 34% O₂): https://ntrs.nasa.gov/citations/20240007817
- Dataset DOIs and publications for each investigation are linked from the dashboard.

## 30-second video script (if you choose video instead of slides)

| Time | On screen | Voice / subtitle |
|---|---|---|
| 0–4 s | Team names over the hero | “We are Skylab Phoenix, from Barranquilla, Colombia.” |
| 4–10 s | Habitat cards: 72% → 6% | “NASA's own flight data shows a fire that puts itself out 72% of the time in cabin air does so only 6% of the time in Moon-base air.” |
| 10–16 s | Coverage map, empty lunar envelope | “And only 37 of 1,647 flight tests were run anywhere near that air. No solid material, ever.” |
| 16–23 s | SI briefing, click a citation | “Our SI writes the briefing; our code checks every number against the data before you see it.” |
| 23–30 s | Next-experiment map | “Skylab Phoenix tells crews what the data says, how sure it is, and what NASA should fly next.” |

## How the project maps to the judging criteria

| Criterion | Evidence in the project |
|---|---|
| **Impact** | Targets the Artemis lunar-base atmosphere; quantifies the gap NASA must close; proposes the next flight test. |
| **Creativity** | SI with a verification firewall; out-of-data guard that refuses to answer; active learning for experiment design. |
| **Validity** | Cleaned data with a correction log; models validated on held-out test days against baselines; calibration plot; tests in CI. |
| **Relevance** | Every challenge objective mapped to a dashboard section (see the README table); SI-powered as the title requires. |
| **Presentation** | Live dashboard, guided views per audience, downloadable briefings, 7-slide deck, English and Spanish documentation. |
