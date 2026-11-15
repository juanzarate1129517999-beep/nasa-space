"""Build the lunar assets used by the Moon base view.

Sources (all NASA, public):
  - LOLA 5 m/pix south-pole DEMs, NASA GSFC PGDA product 78 (Barker et al. 2021).
  - CGI Moon Kit (NASA SVS 4720): LROC color and LOLA displacement maps.
  - JPL Horizons API: Sun and Earth azimuth/elevation seen from the base site.

Usage:
  python scripts/build_moon_assets.py web/assets/moon [--raw /tmp/moonraw]
"""
import argparse
import json
import math
import struct
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp"
SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
R_MOON_KM = 1737.4
SITES = {
    "Site01": "Connecting ridge", "Site04": "Shackleton rim", "Site06": "Nobile rim 1", "Site07": "Peak near Shackleton",
    "Site11": "de Gerlache rim", "Site20": "Leibnitz beta plateau", "Site23": "Malapert massif",
    "Haworth": "Haworth", "Shoemaker": "Shoemaker", "DM2": "Nobile rim 2",
}
BASE_SITE = "Site01"
GRID = 512
TEX = 2048
START, STOP = "2026-11-01", "2027-11-01"


def fetch(url, dest, rng=None):
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    req = urllib.request.Request(url, headers={"Range": f"bytes=0-{rng}"} if rng else {})
    with urllib.request.urlopen(req, timeout=600) as r:
        dest.write_bytes(r.read())
    return dest


def geotiff_frame(path):
    b = Path(path).read_bytes()[:400000]
    off = struct.unpack("<I", b[4:8])[0]
    n = struct.unpack("<H", b[off:off + 2])[0]
    tags = {}
    for i in range(n):
        tag, typ, cnt, val = struct.unpack("<HHII", b[off + 2 + 12 * i: off + 14 + 12 * i])
        tags[tag] = (typ, cnt, val)
    dbl = lambda t: struct.unpack("<%dd" % tags[t][1], b[tags[t][2]: tags[t][2] + 8 * tags[t][1]])
    scale, tie = dbl(33550), dbl(33922)
    return {"w": tags[256][2], "h": tags[257][2], "px": scale[0], "x0": tie[3], "y0": tie[4]}


def stereo_to_latlon(x_m, y_m):
    rho = math.hypot(x_m, y_m) / 1000
    c = 2 * math.atan(rho / (2 * R_MOON_KM))
    return -90 + math.degrees(c), math.degrees(math.atan2(x_m, y_m)) % 360


def horizons(target, lon, lat, alt_km, step, quantities="4"):
    q = {"format": "json", "COMMAND": f"'{target}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
         "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'", "SITE_COORD": f"'{lon:.4f},{lat:.4f},{alt_km:.4f}'",
         "START_TIME": f"'{START}'", "STOP_TIME": f"'{STOP}'", "STEP_SIZE": f"'{step}'", "QUANTITIES": f"'{quantities}'",
         "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'"}
    with urllib.request.urlopen(HORIZONS + "?" + urllib.parse.urlencode(q), timeout=120) as r:
        res = json.loads(r.read())["result"]
    rows = res[res.index("$$SOE") + 5: res.index("$$EOE")].strip().splitlines()
    out = []
    for line in rows:
        p = [x.strip() for x in line.split(",")]
        out.append([round(float(p[-3]), 3), round(float(p[-2]), 3)])
    return out


def subsolar(step="1d"):
    q = {"format": "json", "COMMAND": "'301'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
         "CENTER": "'500@399'", "START_TIME": f"'{START}'", "STOP_TIME": f"'{STOP}'", "STEP_SIZE": f"'{step}'",
         "QUANTITIES": "'14,15'", "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'"}
    with urllib.request.urlopen(HORIZONS + "?" + urllib.parse.urlencode(q), timeout=120) as r:
        res = json.loads(r.read())["result"]
    rows = res[res.index("$$SOE") + 5: res.index("$$EOE")].strip().splitlines()
    out = []
    for line in rows:
        p = [x.strip() for x in line.split(",") if x.strip() != ""]
        nums = [float(v) for v in p[1:] if _isnum(v)]
        out.append([round(nums[0], 2), round(nums[1], 2), round(nums[2], 2), round(nums[3], 2)])
    return out


def _isnum(v):
    try:
        float(v)
        return True
    except ValueError:
        return False


def build(out, raw):
    out.mkdir(parents=True, exist_ok=True)
    raw.mkdir(parents=True, exist_ok=True)

    sites = []
    for s, name in SITES.items():
        h = fetch(f"{PGDA}/{s}/{s}_final_adj_5mpp_surf.tif", raw / f"h_{s}.tif", rng=200000)
        f = geotiff_frame(h)
        cx, cy = f["x0"] + f["w"] * f["px"] / 2, f["y0"] - f["h"] * f["px"] / 2
        lat, lon = stereo_to_latlon(cx, cy)
        sites.append({"id": s, "name": name, "lat": round(lat, 3), "lon": round(lon, 2), "size_km": f["w"] * f["px"] / 1000})

    tif = fetch(f"{PGDA}/{BASE_SITE}/{BASE_SITE}_final_adj_5mpp_surf.tif", raw / f"{BASE_SITE}_surf.tif")
    fr = geotiff_frame(tif)
    z = np.array(Image.open(tif), dtype=np.float32)
    n = z.shape[0]
    k = n // GRID
    zg = z[: GRID * k, : GRID * k].reshape(GRID, k, GRID, k).mean(axis=(1, 3))
    cell = fr["px"] * k
    gy, gx = np.gradient(zg, cell)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    flat = slope < 5
    score = np.where(flat, zg, -1e9)
    m = GRID // 8
    score[:m, :] = score[-m:, :] = score[:, :m] = score[:, -m:] = -1e9
    w = 9
    pad = np.pad(flat.astype(np.float32), w // 2)
    win = sum(pad[i:i + GRID, j:j + GRID] for i in range(w) for j in range(w)) / (w * w)
    score = np.where(win > 0.9, score, -1e9)
    bi, bj = np.unravel_index(np.argmax(score), score.shape)
    bx = fr["x0"] + (bj + 0.5) * cell
    by = fr["y0"] - (bi + 0.5) * cell
    blat, blon = stereo_to_latlon(bx, by)
    bz = float(zg[bi, bj])

    dz = np.round(zg * 10).astype("<i2")
    (out / "terrain_site01.bin").write_bytes(dz.tobytes())

    t = Image.fromarray(z).resize((TEX, TEX), Image.BILINEAR)
    za = np.array(t, dtype=np.float32)
    tp = fr["px"] * n / TEX
    ty, tx = np.gradient(za, tp)
    sl = np.degrees(np.arctan(np.hypot(tx, ty)))
    from scipy.ndimage import gaussian_filter
    blur = gaussian_filter(za, 6)
    local = np.clip((za - blur) / 12.0, -1, 1)
    alb = 0.58 + 0.16 * local - 0.004 * np.clip(sl, 0, 40)
    rng = np.random.default_rng(7)
    alb += rng.normal(0, 0.018, alb.shape)
    g = np.clip(alb * 255, 0, 255).astype(np.uint8)
    Image.fromarray(np.dstack([g, g, (g * 0.985).astype(np.uint8)])).save(out / "terrain_site01.jpg", quality=84)

    alt_km = (bz + 2) / 1000
    sun = horizons("10", blon, blat, alt_km, "3h")
    earth = horizons("399", blon, blat, alt_km, "3h")
    ss = subsolar("1d")

    meta = {
        "source": {
            "dem": f"NASA GSFC PGDA product 78, LOLA 5 m/pix LDEM {BASE_SITE}_final_adj_5mpp_surf.tif (Barker et al. 2021, PSS 203, 105119)",
            "globe": "NASA SVS CGI Moon Kit (4720): LROC color and LOLA displacement",
            "ephemeris": "JPL Horizons API, observer at the base site (geodetic, body 301)",
        },
        "site": {"id": BASE_SITE, "name": SITES[BASE_SITE], "x0": fr["x0"], "y0": fr["y0"], "size_m": GRID * cell,
                 "grid": GRID, "cell_m": cell, "z_min": float(zg.min()), "z_max": float(zg.max())},
        "base": {"i": int(bi), "j": int(bj), "x": bx, "y": by, "lat": round(blat, 4), "lon": round(blon, 3), "z": round(bz, 1),
                 "slope_deg": round(float(slope[bi, bj]), 1)},
        "sites": sites,
        "ephem": {"start": START, "step_h": 3, "sun": sun, "earth": earth},
        "subsolar": {"start": START, "step_d": 1, "rows": ss, "cols": ["earth_sub_lon", "earth_sub_lat", "sun_sub_lon", "sun_sub_lat"]},
    }
    (out / "moon.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")

    for name in ("lroc_color_2k.jpg", "ldem_3_8bit.jpg"):
        fetch(f"{SVS}/{name}", out / name)
    print(f"base at {blat:.4f}, {blon:.3f}  z={bz:.0f} m  slope={slope[bi, bj]:.1f} deg · sun rows {len(sun)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--raw", default="/tmp/moonraw")
    a = ap.parse_args()
    build(Path(a.out), Path(a.raw))
