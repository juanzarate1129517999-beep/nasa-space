import argparse
import importlib
import json
import sys
from pathlib import Path

import anthropic

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
si = importlib.import_module("pipeline.si")

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
        max_tokens=16000,
        system=SYSTEM,
        messages=messages,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise RuntimeError(f"model declined ({getattr(response.stop_details, 'category', None)})")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("response cut at max_tokens")
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
            continue
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
    store["meta"] = {"generator": "Anthropic Claude via scripts/si_generate.py",
                     "input": "data/si/evidence_packs.json", "regenerate": "python scripts/si_generate.py",
                     "checked_by": "pipeline/si.py verify(): citations, numbers, no safety verdicts, pack hash"}
    si.DRAFTS.write_text(json.dumps(store, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{done} drafts written, {failed} rejected. Run `python -m pipeline.run` to publish.")


if __name__ == "__main__":
    main()
