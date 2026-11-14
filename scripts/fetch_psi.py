"""Download the lightweight tabular files (experimental tables, test matrices,
readmes, telemetry) for PSI investigations into <out_dir>/<accession>/."""
import json, os, re, sys, urllib.parse, urllib.request

API = "https://psi.nasa.gov/geode-py/ws"
WANTED = re.compile(r"Experimental table|Test[ ._]?Matri|ReadMe|Readme|Telemetry|Sensor Data|Reference Data", re.I)
MAX_MB = 30

out_dir = sys.argv[1]
for acc in sys.argv[2:]:
    with urllib.request.urlopen(f"{API}/repo/investigations/{acc}") as r:
        meta = json.load(r)
    files = {}
    for key in ("experimentalTable", "added", "modified"):
        for f in meta.get(key) or []:
            if isinstance(f, dict) and "file_name" in f:
                files.setdefault(f["file_name"], f)
    os.makedirs(os.path.join(out_dir, acc), exist_ok=True)
    with open(os.path.join(out_dir, acc, "metadata.json"), "w", encoding="utf-8") as fh:
        json.dump({k: meta.get(k) for k in ("accession", "title", "doi", "objective", "hypothesis",
                                             "approach", "licenseName", "publications")}, fh, indent=2, default=str)
    for name, f in files.items():
        size_mb = (f.get("file_size") or 0) / 1e6
        if not WANTED.search(name) or size_mb > MAX_MB or name.lower().endswith((".jpg", ".zip", ".pdf")):
            continue
        dest = os.path.join(out_dir, acc, name)
        if os.path.exists(dest):
            print(f"{acc}: {name} (ya existe)")
            continue
        q = urllib.parse.urlencode({"file": name, "version": f.get("version", 1), "redirect": "false"})
        candidates = []
        try:
            with urllib.request.urlopen(f"{API}/studies/{acc}/download?{q}") as r:
                candidates.append(r.read().decode().strip().strip('"'))
        except Exception as e:
            print(f"{acc}: {name} -> sin URL firmada ({e})")
        if str(f.get("remote_url", "")).startswith("http"):
            candidates.append(f["remote_url"])
        for url in candidates:
            try:
                urllib.request.urlretrieve(url, dest)
                print(f"{acc}: {name} ({size_mb:.2f} MB)")
                break
            except Exception as e:
                print(f"{acc}: {name} -> FALLÓ ({e}) via {url[:60]}")
