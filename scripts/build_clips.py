"""Cut web clips from NASA PSI raw flight video.

For each video: download it from the PSI public API, find when and where the flame is, crop to it,
speed it up to about ten seconds, write a small H.264 clip and a poster, and delete the raw file.
Nothing is drawn or generated: each clip is the flight video, cropped and sped up as marked.

    python scripts/build_clips.py bass2 40      # up to 40 new BASS-II clips
    python scripts/build_clips.py cfig 30
    python scripts/build_clips.py index         # rebuild web/data/clips.js from the clip records
"""

import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
API = "https://psi.nasa.gov/geode-py/ws"
OUT = ROOT / "web" / "assets" / "video"
RECORDS = ROOT / "data" / "clips"
TMP = Path(os.environ.get("CLIP_TMP", "/tmp")) / "skylab_clips"
W, H, FPS, TARGET_S = 480, 270, 24, 10.0


def listing(acc):
    cache = TMP / f"{acc}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    with urllib.request.urlopen(f"{API}/repo/investigations/{acc}", timeout=180) as r:
        meta = json.load(r)
    files = {}
    for key in ("experimentalTable", "added", "modified"):
        for f in meta.get(key) or []:
            if isinstance(f, dict) and "file_name" in f:
                files.setdefault(f["file_name"], f)
    TMP.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(list(files.values())))
    return list(files.values())


def download(acc, f, dest):
    q = urllib.parse.urlencode({"file": f["file_name"], "version": f.get("version", 1), "redirect": "false"})
    with urllib.request.urlopen(f"{API}/studies/{acc}/download?{q}", timeout=180) as r:
        url = r.read().decode().strip().strip('"')
    urllib.request.urlretrieve(url, dest)


def probe(path):
    r = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    try:
        j = json.loads(r.stdout)
        return int(j["streams"][0]["width"]), int(j["streams"][0]["height"]), float(j["format"]["duration"])
    except Exception:
        return None


def frames(path, w, h, fps=3):
    r = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "quiet",
            "-i",
            str(path),
            "-vf",
            f"fps={fps},scale={w}:{h}",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ],
        capture_output=True,
    )
    a = np.frombuffer(r.stdout, np.uint8)
    n = len(a) // (w * h * 3)
    return a[: n * w * h * 3].reshape(n, h, w, 3)


def find_flame(path, mask_top=0.0, fps=3, max_area=0.35):
    """Return (t0, t1, crop box in source pixels) for the longest stretch with a flame in a dark frame."""
    info = probe(path)
    if not info:
        return None
    sw, sh, dur = info
    w = 160
    h = int(round(w * sh / sw / 2) * 2)
    fr = frames(path, w, h, fps)
    if len(fr) < fps * 3:
        return None
    lum = fr.max(axis=3).astype(np.float32)
    lum[:, : int(h * mask_top), :] = 0
    dark = np.median(lum, axis=(1, 2)) < 28  # camera looking at lit hardware is not a flame
    base = np.percentile(lum[dark], 20, axis=0) if dark.sum() > 5 else 0
    hot = (lum - base) > 38
    area = hot.sum(axis=(1, 2)) * dark
    on = (area >= 3) & (area < max_area * w * h)
    best, i, gap = None, 0, int(2.5 * fps)
    while i < len(on):
        if not on[i]:
            i += 1
            continue
        j = last = i
        while j < len(on) and j - last <= gap:
            if on[j]:
                last = j
            j += 1
        if best is None or area[i : last + 1].sum() > area[best[0] : best[1] + 1].sum():
            best = (i, last)
        i = last + 1
    if best is None or (best[1] - best[0]) / fps < 4:
        return None
    a, b = best
    freq = hot[a : b + 1].mean(axis=0)
    lab, n = ndimage.label(freq > max(0.02, 0.12 * freq.max()))
    if not n:
        return None
    big = 1 + int(np.argmax(ndimage.sum(freq, lab, range(1, n + 1))))  # the flame, not stray hot pixels
    ys, xs = np.where(lab == big)
    if len(xs) < 2:
        return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    k = sw / w
    cx, cy = (x0 + x1) / 2 * k, (y0 + y1) / 2 * k
    bw, bh = (x1 - x0) * k * 1.7 + 40, (y1 - y0) * k * 1.7 + 40
    cw = max(bw, bh * W / H, sw * 0.3)
    ch = cw * H / W
    if ch > sh * (1 - mask_top):
        ch = sh * (1 - mask_top)
        cw = ch * W / H
    cw, ch = min(cw, sw), min(ch, sh)
    left = min(max(cx - cw / 2, 0), sw - cw)
    top = min(max(cy - ch / 2, sh * mask_top), sh - ch)
    peak = float(area[a : b + 1].max()) / (w * h)
    return {
        "t0": max(0, a / fps - 0.7),
        "t1": min(dur, b / fps + 1.2),
        "crop": [int(cw) // 2 * 2, int(ch) // 2 * 2, int(left), int(top)],
        "peak_area": round(peak, 4),
        "src": [sw, sh],
        "duration_s": round(dur, 1),
    }


def cut(path, found, dest):
    t0, t1 = found["t0"], found["t1"]
    span = t1 - t0
    x = max(1.0, span / TARGET_S)
    cw, ch, cl, ct = found["crop"]
    vf = f"crop={cw}:{ch}:{cl}:{ct},setpts=PTS/{x:.4f},fps={FPS},scale={W}:{H}:flags=lanczos"
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-ss",
            f"{t0:.2f}",
            "-t",
            f"{span:.2f}",
            "-i",
            str(path),
            "-vf",
            vf,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "30",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(dest.with_suffix(".mp4")),
        ],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-ss",
            f"{(span / x) * 0.45:.2f}",
            "-i",
            str(dest.with_suffix(".mp4")),
            "-frames:v",
            "1",
            "-q:v",
            "5",
            str(dest.with_suffix(".jpg")),
        ],
        check=True,
    )
    return round(x, 1)


def bass2_jobs():
    gas = pd.read_csv(ROOT / "data" / "gold" / "solidos_bass2_gases.csv")
    gas["key"] = gas["test"].astype(str).str.strip().str.lower()
    rows = {r["key"]: r for _, r in gas.iterrows()}
    jobs = []
    for f in listing("PSI-25"):
        n = f["file_name"]
        m = re.search(r"TEST_?([A-Za-z]+\d+[a-z]?)(_Still_Sequence)?\.mp4$", n)
        if not m or "2ND_VIEW" in n.upper():
            continue
        key = m.group(1).lower()
        if key not in rows:
            continue
        r = rows[key]
        still = bool(m.group(2))
        meta = {
            "test": str(r["test"]).strip(),
            "material": r["material"],
            "family": r["family"],
            "state": "Solid",
            "psi": "PSI-25",
            "o2": None if pd.isna(r["o2_initial_pct"]) else float(r["o2_initial_pct"]),
            "air": None if pd.isna(r["air_display"]) else str(r["air_display"]),
            "co": None if pd.isna(r["co_produced_ppm"]) else float(r["co_produced_ppm"]),
            "cam": "still sequence" if still else "video camera",
        }
        jobs.append(
            {
                "id": f"b2-{key}{'-s' if still else ''}",
                "acc": "PSI-25",
                "file": f,
                "dir": "bass2x",
                "mask_top": 0.0 if still else 0.2,
                "meta": meta,
                "rank": (0 if still else 1, f.get("file_size") or 0),
            }
        )
    return jobs


def cfig_jobs():
    ens = pd.read_csv(ROOT / "data" / "gold" / "ensayos.csv", low_memory=False)
    ens = ens[ens["experimento"].str.startswith("CFI-G") & (ens["ignicion"] == 1) & ens["x_o2"].notna()]
    rows = {
        re.sub(r"[^0-9A-Z]", "", u.split(":")[1].upper())[1:]: r
        for u, r in zip(ens["test_uid"], ens.to_dict("records"), strict=True)
    }
    res_txt = {
        "autoextincion": "went out on its own",
        "corte_de_flujo": "still burning when the fuel was cut",
        "flash": "flashed and went out",
    }
    jobs = []
    for f in listing("PSI-159"):
        n = f["file_name"]
        m = re.search(r"udp_+(\d{5}[A-Z]\d+)\.ts$", n)
        if not m or m.group(1) not in rows:
            continue
        r = rows[m.group(1)]
        inv = r["experimento"].endswith("inverse")
        meta = {
            "test": m.group(1),
            "material": f"{r['combustible']} {'(inverse flame)' if inv else 'from a spherical burner'}",
            "family": "Spherical gas flame",
            "state": "Gas",
            "psi": "PSI-159",
            "o2": round(100 * float(r["x_o2"]), 1),
            "m": f"{r['p_atm']:.1f} atm · ACME CFI-G · {res_txt.get(r['resultado'], '')}".rstrip(" ·"),
            "out": None if pd.isna(r["autoextincion"]) else int(r["autoextincion"]),
        }
        burn = r.get("tiempo_quemado_s")
        if pd.isna(burn) or burn < 20:
            continue
        jobs.append(
            {
                "id": f"cfig-{m.group(1).lower()}",
                "acc": "PSI-159",
                "file": f,
                "dir": "cfig",
                "mask_top": 0.0,
                "max_area": 0.05,
                "meta": {**meta, "burn_s": float(burn)},
                "rank": (0, f.get("file_size") or 0),
            }
        )
    return jobs


SETS = {"bass2": bass2_jobs, "cfig": cfig_jobs}


def run(kind, limit):
    RECORDS.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    jobs = sorted(SETS[kind](), key=lambda j: j["rank"])
    done = made = 0
    seen_tests = {
        json.loads(p.read_text())["test"] for p in RECORDS.glob("*.json") if json.loads(p.read_text()).get("ok")
    }
    old = (ROOT / "web" / "data" / "clips.js").read_text(encoding="utf-8")
    seen_tests |= {c["test"] for c in json.loads(old[old.index("[") : old.rindex("]") + 1]) if c.get("dir") == "bass2"}
    for j in jobs:
        rec = RECORDS / f"{j['id']}.json"
        if rec.exists() or (kind == "bass2" and j["meta"]["test"] in seen_tests):
            continue
        if made >= limit or (j["file"].get("file_size") or 0) > 420e6:
            continue
        raw = TMP / ("raw" + Path(j["file"]["file_name"]).suffix)
        out = {"id": j["id"], "source": j["file"]["file_name"], **j["meta"], "ok": False}
        try:
            download(j["acc"], j["file"], raw)
            found = find_flame(raw, j["mask_top"], max_area=j.get("max_area", 0.35))
            if found:
                x = cut(raw, found, OUT / j["dir"] / j["id"])
                out.update(
                    {
                        "ok": True,
                        "x": x,
                        "dir": j["dir"],
                        "f": j["id"],
                        **{k: found[k] for k in ("t0", "t1", "crop", "peak_area")},
                    }
                )
                made += 1
                seen_tests.add(j["meta"]["test"])
            else:
                out["why"] = "no flame found, or the file does not decode"
        except Exception as e:
            out["why"] = f"{type(e).__name__}: {e}"[:200]
        finally:
            raw.unlink(missing_ok=True)
        rec.write_text(json.dumps(out, indent=1, default=float))
        done += 1
        print(f"[{kind}] {j['id']}: {'clip ×' + str(out.get('x')) if out['ok'] else out.get('why')}", flush=True)
    print(f"[{kind}] {made} clips from {done} files")


def index():
    """Merge the generated clips into web/data/clips.js, after the hand-picked ones, without touching those."""
    js = ROOT / "web" / "data" / "clips.js"
    s = js.read_text(encoding="utf-8")
    base = [c for c in json.loads(s[s.index("[") : s.rindex("]") + 1]) if not c.get("gen")]
    have = {(c.get("psi", "PSI-25" if c.get("dir") == "bass2" else ""), c["test"]) for c in base}
    gen = []
    for p in sorted(RECORDS.glob("*.json")):
        r = json.loads(p.read_text())
        if not r.get("ok") or (r.get("psi"), r["test"]) in have:
            continue
        c = {k: r.get(k) for k in ("test", "f", "material", "family", "o2", "air", "x", "state", "dir", "psi")}
        c["material"] = c["material"][:1].upper() + c["material"][1:]
        c["co"] = None if r.get("co") is None else int(round(r["co"]))
        if r.get("m"):
            c["m"] = r["m"]
        c["gen"] = True
        gen.append(c)
        have.add((r.get("psi"), r["test"]))
    js.write_text("window.CLIPS = " + json.dumps(base + gen, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"{len(base)} hand-picked + {len(gen)} generated clips -> {js}")


if __name__ == "__main__":
    if sys.argv[1:2] == ["index"]:
        index()
    elif len(sys.argv) > 2:
        run(sys.argv[1], int(sys.argv[2]))
