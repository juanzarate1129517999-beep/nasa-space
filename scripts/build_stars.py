"""Pick the bright stars out of NASA's star map so the 3D views can draw them as crisp points.

The equirectangular star map (web/assets/3d/starmap_4k.jpg, NASA SVS) is magnified about three times on a
wide screen, which blurs it. This finds local brightness peaks, converts each pixel to a direction on the sky and
writes their direction, brightness and color to web/assets/3d/stars.json. Nothing is invented: every point is a
peak of the NASA image.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "web" / "assets" / "3d" / "starmap_4k.jpg"
OUT = ROOT / "web" / "assets" / "3d" / "stars.json"
N = 4000

img = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.float32)
h, w, _ = img.shape
lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
bg = ndimage.median_filter(lum, size=15)
peak = lum - bg
is_max = (lum == ndimage.maximum_filter(lum, size=5)) & (peak > 18)
ys, xs = np.nonzero(is_max)
p = peak[ys, xs]
keep = np.argsort(-p)[:N]
ys, xs, p = ys[keep], xs[keep], p[keep]
phi = (xs + 0.5) / w * 2 * np.pi
theta = (ys + 0.5) / h * np.pi
# Same mapping as three.js SphereGeometry (u = phi / 2π, v from the top), so points sit on the texture's stars.
x = -np.cos(phi) * np.sin(theta)
y = np.cos(theta)
z = np.sin(phi) * np.sin(theta)
col = np.stack([ndimage.maximum_filter(img[..., c], size=3)[ys, xs] for c in range(3)], 1)
col = col / np.maximum(col.max(1, keepdims=True), 1)
mag = np.clip((p - p.min()) / (np.percentile(p, 99.5) - p.min()), 0, 1)
data = {"source": "Peaks of NASA SVS star map (starmap_4k.jpg)", "n": int(len(p)),
        "xyz": np.round(np.stack([x, y, z], 1), 3).ravel().tolist(),
        "b": np.round(mag, 3).tolist(), "c": np.round(col, 2).ravel().tolist()}
OUT.write_text(json.dumps(data, separators=(",", ":")))
print(f"{len(p)} stars -> {OUT} ({OUT.stat().st_size // 1024} KB)")
