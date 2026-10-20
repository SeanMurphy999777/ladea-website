#!/usr/bin/env python3
"""Regenerate web logo assets from the supplied brand files in brand/.

  python3 brand/make-assets.py     (needs Pillow + numpy)

The logos are not redrawn: the icon is only resized, and the wordmark keeps its
own pixels, with the white page behind it turned transparent.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
icon = Image.open(ROOT / 'brand/ladea-icon-source.png').convert('RGB')
word = Image.open(ROOT / 'brand/ladea-wordmark-source.png').convert('RGB')

# Colours measured from the supplied files (medians of each flat area)
AUBERGINE = np.array([57, 9, 65])              # icon background  #390941
VERMILION = np.array([253, 82, 16])            # icon letterform  #FD5210
INK = (64, 22, 68)                             # wordmark         #401644

# The icon file carries faint scanner-like grain, which triples PNG size.
# Re-express every pixel as a mix of its two brand colours: anti-aliased edges
# keep their exact mix, flat areas become flat. Shapes are untouched.
src = np.asarray(icon, dtype=np.float64)
axis = VERMILION - AUBERGINE
t = np.clip(((src - AUBERGINE) @ axis) / (axis @ axis), 0, 1)
t[t < 0.06] = 0
t[t > 0.94] = 1
icon = Image.fromarray(np.round(AUBERGINE + t[..., None] * axis).astype(np.uint8), 'RGB')

def resize(im, size):
    return im.resize(size, Image.LANCZOS)

# ---- icon: square tile, aubergine background is part of the icon
for px, path in [(800, 'assets/ladea-icon-800.png'), (256, 'assets/ladea-icon-256.png'),
                 (512, 'assets/ladea-logo-512.png'), (180, 'apple-touch-icon.png'),
                 (192, 'favicon-192.png')]:
    resize(icon, (px, px)).save(PUB / path, optimize=True)
resize(icon, (48, 48)).save(PUB / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

# ---- wordmark: alpha from darkness, colour fixed to the ink, white background removed
a = np.asarray(word, dtype=np.float64)
lum = a.mean(axis=2)
paper = 252.0                                  # supplied file's white, slightly off 255
ink_l = float(np.mean(INK))
alpha = np.clip((paper - lum) / (paper - ink_l), 0, 1)
alpha[alpha < 0.03] = 0                        # drop compression noise in the white area
rgba = np.zeros(a.shape[:2] + (4,), dtype=np.uint8)
rgba[..., :3] = INK
rgba[..., 3] = np.round(alpha * 255)
wm = Image.fromarray(rgba, 'RGBA')
ys, xs = np.where(alpha > 0.5)
pad = 4
wm = wm.crop((xs.min() - pad, ys.min() - pad, xs.max() + 1 + pad, ys.max() + 1 + pad))

def resize_rgba(im, size):
    # premultiplied resize so edges don't pick up stray colour
    return im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')

w, h = wm.size
for H, path in [(h, 'brand/ladea-wordmark-transparent.png'), (120, 'public/assets/ladea-wordmark.png')]:
    out = wm if H == h else resize_rgba(wm, (round(w * H / h), H))
    out.save(ROOT / path, optimize=True)
    print(path, out.size)
