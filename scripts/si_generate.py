"""Regenerate the SI drafts (data/si/drafts.json) from the evidence packs with Claude.

    pip install anthropic
    export ANTHROPIC_API_KEY=...        # or `ant auth login`
    python -m pipeline.run              # writes data/si/evidence_packs.json
    python scripts/si_generate.py       # writes data/si/drafts.json (only packs whose draft is missing or stale)
    python -m pipeline.run              # verifies every draft and publishes the ones that pass

Options: --all (redo every pack), --only habitat:moon_base,investigation:PSI-69

The model only writes text. Every draft goes through the same firewall as the committed drafts
(pipeline/si.py verify): each sentence must cite evidence items, use only numbers that appear in
them and make no safety verdict. A draft that fails gets one correction round with the list of
problems; if it still fails it is not saved and the dashboard shows the labelled evidence brief.
Written with AI assistance (Anthropic Claude); see docs/AI_USE.md.
"""
import argparse
import json
import sys
from pathlib import Path

import anthropic

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import si  # noqa: E402

MODEL = "claude-opus-5-5"

SYSTEM = """You write short, plain-English fire-safety briefings for a NASA Space Apps dashboard.
Readers range from undergraduates to spacecraft engineers.

You receive an evidence pack: numbered items (E1, E2, ...) computed from NASA's Physical Sciences
Informatics combustion data. Write the briefing ONLY from these items.

Rules, all checked by code before anything is published:
- Every sentence lists the ids of the items it relies on in "cites".
- Every number you write must appear, with the same value, in one of the items that sentence cites.
  Do not round, convert units or compute new numbers (no ratios, no differences).
- Never give a safety verdict or certification ("is safe", "certified", "guaranteed", "no risk").
  Describe evidence, uncertainty and gaps; leave decisions to engineers.
- If the model withholds a prediction or flags an extrapolation, say so plainly.
- 2 sentences for an investigation, 3 or 4 for a habitat; each under 400 characters.
- For a habitat, also write a headline of at most 12 words."""

SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "sentences": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"text": {"type": "string"}, "cites": {"type": "array", "items": {"type": "string"}}},
                "required": ["text", "cites"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "sentences"],
    "additionalProperties": False,
}


def ask(client, pack, feedback=None):
    content = (f"Evidence pack ({pack['kind']}: {pack['title']}):\n"
               + json.dumps(pack["items"], ensure_ascii=False, indent=1))
    messages = [{"role": "user", "content": content}]
    if feedback:
        messages += [{"role": "assistant", "content": json.dumps(feedback["draft"], ensure_ascii=False)},
                     {"role": "user", "content": "The verifier rejected this draft:\n- " + "\n- ".join(feedback["problems"])
                      + "\nRewrite it so that every rule holds."}]
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM,
        messages=messages,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",  # if the model declines, the API re-runs the request on a fallback model
    )
    if response.stop_reason == "refusal":
        raise RuntimeError(f"model declined ({getattr(response.stop_details, 'category', None)})")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="regenerate every pack, not only missing or stale ones")
    ap.add_argument("--only", default="", help="comma-separated keys, e.g. habitat:moon_base,investigation:PSI-69")
    args = ap.parse_args()

    packs = json.loads(si.PACKS.read_text(encoding="utf-8"))
    store = json.loads(si.DRAFTS.read_text(encoding="utf-8")) if si.DRAFTS.exists() else {"meta": {}, "drafts": {}}
    only = {k for k in args.only.split(",") if k}
    client = anthropic.Anthropic()
    done = failed = 0
    for pack in packs:
        key = f"{pack['kind']}:{pack['id']}"
        if only and key not in only:
            continue
        if not args.all and not only and not si.verify(store["drafts"].get(key), pack):
            continue  # current draft already passes
        try:
            draft = ask(client, pack)
            draft["pack_hash"] = pack["hash"]
            problems = si.verify(draft, pack)
            if problems:
                draft = ask(client, pack, {"draft": draft, "problems": problems})
                draft["pack_hash"] = pack["hash"]
                problems = si.verify(draft, pack)
        except (anthropic.APIStatusError, anthropic.APIConnectionError, RuntimeError, json.JSONDecodeError) as e:
            problems = [f"generation failed: {e}"]
        if problems:
            failed += 1
            print(f"✗ {key}: {problems}")
            continue
        if pack["kind"] == "investigation":
            draft["headline"] = ""
        store["drafts"][key] = draft
        done += 1
        print(f"✓ {key}")
    store["meta"] = {"generator": f"Anthropic Claude ({MODEL}) via scripts/si_generate.py",
                     "input": "data/si/evidence_packs.json", "regenerate": "python scripts/si_generate.py",
                     "checked_by": "pipeline/si.py verify(): citations, numbers, no safety verdicts, pack hash"}
    si.DRAFTS.write_text(json.dumps(store, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{done} drafts written, {failed} rejected. Run `python -m pipeline.run` to publish.")


if __name__ == "__main__":
    main()
