# Use of AI / SI in Skylab Phoenix

The NASA Space Apps rules allow SI tools (machine learning, chatbots, large language models, image generation) and ask teams to say where and how they were used. Code and data generated with SI must be acknowledged in descriptive text and metadata; SI-generated images and videos must carry a visible watermark; generated content must not use or alter NASA branding.

## Where SI is part of the product

| Component | What the SI does | How it is controlled |
|---|---|---|
| **SI briefings** (`data/si/drafts.json`, shown in the dashboard as “SI-written · verified ✓”) | Anthropic **Claude** writes 2–4 sentence briefings for each of the 5 habitats and 24 investigations, only from numbered evidence packs computed by the pipeline (`data/si/evidence_packs.json`). | `pipeline/si.py` publishes a draft only if every sentence cites existing evidence, every number appears in the cited evidence, there is no safety verdict, and the evidence has not changed since the draft (hash). Otherwise the dashboard shows the evidence itself, labelled “Evidence brief · deterministic”. Result per briefing: `data/si/verification.json`. |
| **Regeneration script** (`scripts/si_generate.py`) | Calls the Claude API (Anthropic SDK) with structured JSON output; failed drafts get one correction round with the list of problems. | Same firewall. Needs the team's own `ANTHROPIC_API_KEY`. |

Metadata: every SI briefing carries `"source": "si"` in `web/data/si.js`, the generator is recorded in `data/si/drafts.json → meta.generator`, and the dashboard badge says “SI-written”.

## What is *not* SI

- **Rankings, scores, predictions and the out-of-data guard** are deterministic code (pandas, scikit-learn, NumPy), validated with held-out ISS test days and covered by tests.
- **Ask the archive** is a BM25 keyword search over NASA's own text. It quotes passages; it does not generate text.
- **The data**: every number comes from NASA PSI tables, with each correction logged in `data/gold/qc_log.csv`.

## AI assistance in building the project

- **Code and documentation** were written with AI assistance (Anthropic Claude, through Claude Code), then run, reviewed and tested by the team. Files written this way say so in their header (for example `pipeline/si.py`, `scripts/si_generate.py`, `tests/`). The git history records Claude as co-author on those commits.
- **Research** of the challenge and of NASA sources used web search; every source used is cited in the README, the report and the dashboard.
- **Images and video:** the dashboard has no SI-generated images, video or audio; the charts are plotted from data. *Team to confirm* for the logo (`web/assets/phoenix.svg`) and for any image or video in the demo: if one was generated with SI, add a visible “SI-generated” watermark before submitting.
- **NASA branding:** no NASA logo, insignia or mission patch is used anywhere in the project.
