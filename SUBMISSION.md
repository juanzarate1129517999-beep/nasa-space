# Space Apps 2026 submission: Skylab Phoenix

Ready-to-paste texts for the project page on spaceappschallenge.org, and the checklist of what the rules ask for. Everything on the submission page and in linked material must be in **English**.

## Checklist

Sources: Space Apps [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide) and [Participant Terms](https://www.spaceappschallenge.org/legal/). Check the live pages before submitting.

| Requirement | Status | Action for the team |
|---|---|---|
| All required fields of the project page | Texts below | Paste them and pick the challenge “Flame in Freefall” |
| **Project demo**: a video of up to 30 seconds or up to 7 slides, hosted outside the Space Apps site | 28-second video: [docs/video/skylab_phoenix_30s.mp4](docs/video/skylab_phoenix_30s.mp4) | Upload it to YouTube or Google Drive (public) and paste the link |
| Demo in English, videos with English text | All on-screen text is English; the video has music and no voice | — |
| **Final project link**, public, no login | Repository + website on GitHub Pages | Open both in a private window to confirm |
| Say how space-agency open data made the project possible | “Use of NASA data” below | Paste it |
| **Disclose use of AI/SI** | [docs/AI_USE.md](docs/AI_USE.md), website footer, a badge on every SI briefing, a visible watermark in the video | Paste the “Use of AI” text below |
| No NASA logos, insignia or mission patches in generated content | None used | — |
| Original content, open source | [MIT License](LICENSE); data CC0 | — |
| Team of 6 or fewer | 2 members, Barranquilla | — |

## Project name

Skylab Phoenix

## High-level summary (paste as is, 189 words)

Artemis surface habitats and pressurized rovers will run at about 30% oxygen and 10.2 psi, where materials burn more readily, yet NASA's microgravity fire data is scattered across 24 investigations. Skylab Phoenix turns NASA's PSI combustion archive into a bilingual, SI-powered website. It cleans 1,955 flight-test records into one schema (191 logged corrections), ranks the investigations for each crewed atmosphere, and runs a validated model live in the browser: a droplet flame puts itself out 75% of the time in cabin air but only 8% in lunar-base air, where it mostly breaks apart instead, while just 37 of 1,613 records sit near that air and NASA's PSI tables hold no solid burned there. An immersive 3D story takes users from NASA's Artemis plan to a real lunar south-pole site, a Fire Lab replays fires with burning rates measured in orbit, an interactive dashboard filters every record, and a fire audit of a lunar base labels where each number comes from. SI briefings are published only when code verifies every citation and number. The result shows what the evidence says, how sure it is, and what NASA should test next.

## Links

- **Final project (repository):** https://github.com/juanzarate1129517999-beep/nasa-space
- **Website:** https://juanzarate1129517999-beep.github.io/nasa-space/
- **Demo video (28 s):** the public YouTube or Google Drive link of `docs/video/skylab_phoenix_30s.mp4`
- **Technical report:** https://github.com/juanzarate1129517999-beep/nasa-space/blob/main/report/Technical_Report_Skylab_Phoenix.pdf

## Project details

**What it does.** Skylab Phoenix answers one question for each crewed atmosphere (spacecraft cabin, EVA prep, lunar base and NASA's 8.2 psi / 34% O₂ exploration atmosphere): what does NASA's flight data say about fire here, how sure is it, and where does the data stop?

**How it works.**
1. *Data engineering.* A Python pipeline downloads the 24 Combustion Science investigations from the PSI public API, maps every test table to one schema in SI units and logs 191 corrections with the original value (spreadsheet auto-fill errors, “3400%” for 34%, an impossible 0 mmHg pressure, duplicated rows, a GMT-day typo confirmed by NASA's own video file name).
2. *Ranking and comparison.* Each investigation is profiled from its own tables and ranked per atmosphere by a transparent, adjustable score (closeness of the tested conditions, labelled outcomes, directness for crew fire safety).
3. *Machine learning with honest uncertainty.* A two-stage physics model trained on 261 FLEX droplet fires separates the three ways a droplet fire ends (goes out, breaks apart, burns to the end), using the stoichiometric flame temperature and residence time computed from each test's air. It reaches AUC 0.88 (±0.01 over 20 repeats) and Brier 0.120 on ISS test days it never saw. A 200-model bootstrap gives a 90% interval; an out-of-data guard says “extrapolating” or withholds a number far from the flown tests.
4. *Fire Lab.* A droplet burns in real time by the d² law, with the burning rate and extinction diameter of the five closest FLEX tests, next to their measured curves.
5. *Learn 3D.* An immersive story from NASA's Artemis plan over a real 3D Moon (LRO LOLA/LROC) to a south-pole site on NASA's 5 m/pixel terrain lit by the Sun from JPL Horizons; five fire sources inside an ISS module, each tied to the investigation that measured it.
6. *Interactive dashboard and lunar base audit.* Every chart of the 1,955 records filters the others. A three-module lunar base is audited on materials, liquid fires, detection and suppression, and every number is labelled measured, derived, model, assumed, extrapolated or no data.
7. *SI layer.* Claude writes short briefings from numbered evidence packs; a code firewall publishes them only if each sentence cites evidence, each number appears in it and nothing reads as a safety verdict (33 of 33 pass). In Spanish, numbers are copied from the verified English text.
8. *Next flight.* Active learning picks the test that would teach the model most near lunar-base air: CO₂ suppression of a methanol droplet at 28% O₂ and 0.75 atm.

**Key findings.** (1) Above 30% O₂, droplet flames almost stop putting themselves out, so a lunar-base fire must be detected and suppressed. (2) Material screening done at 21% O₂ and 1 atm cannot be reused for the Moon base without re-testing. (3) The highest-value flight test maps the flammability limits of habitat materials at ≥30% O₂ and ≤10.2 psi: NASA's Saffire V and VI showed fabric and acrylic burning at 26–31% O₂ and 0.53–0.70 atm, but at one airflow and with no limit mapped, and that data is not in PSI. (4) No combustion test in PSI ran at lunar gravity.

**Tools.** Python (pandas, NumPy, SciPy, scikit-learn), Anthropic Claude for the SI briefings, HTML/CSS/JavaScript with Plotly and three.js, pytest, GitHub Actions and GitHub Pages.

## Use of NASA data

All data comes from NASA open sources. NASA's Physical Sciences Informatics (PSI) repository, Combustion Science area (public domain, CC0): test tables, metadata and flight video of 24 investigations, including FLEX (PSI-69), ACME CFI-G (PSI-159), BASS (PSI-26), BASS-II (PSI-25), Saffire-I/II/III (PSI-98/99/100), SAME (PSI-102) and SAME-R (PSI-101). The Saffire IV–VI burns at raised oxygen and reduced pressure come from NASA's own paper on NTRS (Urban et al., ICES-2024-365), kept apart from the PSI data and labelled as published. The Moon comes from NASA's SVS CGI Moon Kit (LRO LROC and LOLA), the 5 m/pixel south-pole terrain from NASA GSFC PGDA (LOLA), and the Sun and Earth positions from JPL Horizons. The PSI public API made it possible to rebuild everything from source with one command.

## Space agency partner data

None used.

## Use of AI (paste as is)

AI tools were used in three places. (1) **In the product:** an SI model (Anthropic Claude) writes the short briefings shown on the website, only from evidence packs computed from NASA data. Code checks every briefing before publishing it: each sentence must cite its evidence, every number must appear in that evidence, and no safety verdicts are allowed; otherwise the site shows the raw evidence. Rankings, predictions and the out-of-data guard are deterministic code. (2) **In development:** code and documentation were written with AI assistance (Claude Code) and run, reviewed and tested by the team. (3) **Demo video:** composed with AI assistance from real NASA flight video and real captures of the website; it carries a visible watermark saying so. No AI-generated images are used. Details: docs/AI_USE.md.

## How the project maps to the judging criteria

| Criterion | Evidence |
|---|---|
| **Impact** | Targets the Artemis lunar-base atmosphere, quantifies the data gap NASA must close and proposes the next flight test. |
| **Creativity** | Immersive 3D story on real lunar data; Fire Lab with flight-measured physics; SI behind a verification firewall; a model that refuses to answer outside the data. |
| **Validity** | Cleaned data with a public correction log; models validated on held-out test days against baselines; calibration; tests in CI. |
| **Relevance** | Summarizes, ranks and compares the investigations and interprets them with SI, as the challenge asks. |
| **Presentation** | Bilingual website, 28-second video, technical report in English and Spanish. |
