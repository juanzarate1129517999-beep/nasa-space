import csv
import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://psi.nasa.gov/geode-py/ws"
query = sys.argv[1] if len(sys.argv) > 1 else "combustion"
out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "catalog")
os.makedirs(out_dir, exist_ok=True)

q = urllib.parse.urlencode({"q": query, "data_source": "psi", "data_type": "investigation", "size": 500})
with urllib.request.urlopen(f"{API}/repo/search?{q}", timeout=120) as r:
    hits = [h["_source"] for h in json.load(r)["hits"]["hits"]]
with open(os.path.join(out_dir, f"search_{query}.json"), "w", encoding="utf-8") as fh:
    json.dump(hits, fh, indent=1, ensure_ascii=False)

rows = []
for h in hits:
    acc = h["Accession"]
    try:
        with urllib.request.urlopen(f"{API}/repo/investigations/{acc}", timeout=120) as r:
            meta = json.load(r)
    except Exception as e:
        print(f"{acc}: no metadata ({e})")
        meta = {}
    files = {}
    for key in ("experimentalTable", "added", "modified"):
        for f in meta.get(key) or []:
            if isinstance(f, dict) and "file_name" in f:
                files.setdefault(f["file_name"], f)
    exp_tables = [n for n in files if "experimental table" in n.lower()]
    person = h.get("Person") or {}
    if isinstance(person, list):
        person = person[0] if person else {}
    rows.append(
        {
            "accession": acc,
            "acronym": (h.get("Acronym") or "").strip(),
            "title": h.get("Title", ""),
            "research_area": h.get("Research Area", ""),
            "subresearch_area": h.get("SubResearch Area", ""),
            "project_type": h.get("Project Type", ""),
            "flight_platform": h.get("Flight Platform", ""),
            "hardware": h.get("Experiment Hardware", ""),
            "pi": f"{person.get('First Name', '')} {person.get('Last Name', '')}".strip(),
            "start": h.get("Investigation Start Date", ""),
            "end": h.get("Investigation End Date", ""),
            "keywords": " | ".join(k for k in (h.get("Keywords") or "").split("     ") if k.strip()),
            "related": (h.get("Related Investigations") or "").replace("     ", " "),
            "n_files": len(files),
            "total_mb": round(sum((f.get("file_size") or 0) for f in files.values()) / 1e6, 1),
            "n_experimental_tables": len(exp_tables),
            "experimental_tables": " | ".join(exp_tables),
            "file_names": " | ".join(sorted(files)),
        }
    )
    print(f"{acc}: {len(files)} files, {len(exp_tables)} experimental tables")

with open(os.path.join(out_dir, f"catalog_{query}.csv"), "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print(f"{len(rows)} investigations -> {out_dir}")
