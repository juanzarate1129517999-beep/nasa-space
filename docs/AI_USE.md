# Use of AI / SI in Skylab Phoenix

The NASA Space Apps rules allow SI tools (machine learning, chatbots, large language models, image generation) and ask teams to say where and how they were used. Code and data generated with SI must be acknowledged in descriptive text and metadata; SI-generated images and videos must carry a visible watermark; generated content must not use or alter NASA branding.

## Where SI is part of the product

| Component | What the SI does | How it is controlled |
|---|---|---|
| **SI briefings** (`data/si/drafts.json`, shown on the website as “SI-written · verified ✓”) | Anthropic **Claude** writes 2–4 sentence briefings for each habitat, each of the 24 investigations, each lunar-base module and the base as a whole, only from numbered evidence packs computed by the pipeline (`data/si/evidence_packs.json`). | `pipeline/si.py` publishes a draft only if every sentence cites existing evidence, every number appears in the cited evidence, there is no safety verdict, and the evidence has not changed since the draft (hash). Otherwise the website shows the evidence itself, labelled “Evidence brief · deterministic”. Result per briefing: `data/si/verification.json`. |
| **Regeneration script** (`scripts/si_generate.py`) | Calls the Claude API (Anthropic SDK) with structured JSON output; failed drafts get one correction round with the list of problems. | Same firewall. Needs the team's own `ANTHROPIC_API_KEY`. |

Metadata: every SI briefing carries `"source": "si"` in `web/data/si.js`, the generator is recorded in `data/si/drafts.json → meta.generator`, and the website badge says “SI-written”.

## What is *not* SI

- **Rankings, scores, predictions and the out-of-data guard** are deterministic code (pandas, scikit-learn, NumPy), validated with held-out ISS test days and covered by tests.
- **Ask the archive** is a BM25 keyword search over NASA's own text. It quotes passages; it does not generate text.
- **The data**: every number comes from NASA PSI tables, with each correction logged in `data/gold/qc_log.csv`.

## AI assistance in building the project

- **Code and documentation** were written with AI assistance (Anthropic Claude, through Claude Code), then run, reviewed and tested by the team. This is acknowledged in descriptive text (this file, the README, the website footer, the technical reports and the submission page) and in metadata: `data/si/drafts.json → meta.generator` names the SI model, every SI briefing carries `"source": "si"`, and the demo video's file metadata declares SI assistance.
- **Research** of the challenge and of NASA sources used web search; every source used is cited in the README, the report and the dashboard.
- **Images:** the website has no SI-generated images; charts are plotted from data and the 3D scenes use NASA imagery and terrain.
- **Demo video** (`docs/video/skylab_phoenix_30s.mp4`): composed with AI assistance (Claude Code) from real NASA flight video and real captures of the website, with music synthesized by AI-written code. It carries a visible watermark: “Produced with AI assistance (Claude) · Flight video and data: NASA PSI”, and the file metadata (title, comment, description) states that the video and its audio are SI-assisted.
- **Spanish translation:** the website's Spanish texts were written with AI assistance; numbers in translated SI briefings are copied by code from the verified English text.
- **NASA branding:** no NASA logo, insignia or mission patch is used anywhere in the project.
