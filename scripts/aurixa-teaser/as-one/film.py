#!/usr/bin/env python3
"""As One, drawn: one page that shows any instant of its 45.5 seconds, for render.cjs to photograph frame by frame
(film.js: window.setT(seconds) draws that instant and resolves once it is drawn).

  python3 -I scripts/aurixa-teaser/as-one/film.py <work files dir> <textures dir>

It reads, in the work's files:
  assets/logo-clean.png, logo-letters.png   the supplied logo art and its lettering (Three Questions' film.py
                                           measured the emblem's triangle and cut the letters; the same cut here)
  fonts/                                   Playfair Display and Inconsolata
  sound-as-one/cues.json                   where every spoken word falls (sound.py)
and, from textures.py, marble.png and fog.png. Writes film-as-one/film.html and data.json.

The world is drawn by WebGL (gl.js, film.js); the spoken words are type over it, each word its own box so it can rise
as it is heard, in Three Questions' styles.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
W, TEX = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
OUT = W / "film-as-one"
OUT.mkdir(exist_ok=True)
A, FONTS = W / "assets", W / "fonts"
cues = json.loads((W / "sound-as-one/cues.json").read_text())


def url(p):
    return "file://" + str(Path(p).resolve())


# The logo art (2000 x 1333), the emblem's triangle measured on it, the wordmark, and the lettering's letters as
# Three Questions cuts them (AURIXA, then SYSTEMS), each with its halo.
ART = dict(w=2000, h=1333, apex=(998, 245), bl=(662, 818), br=(1338, 805), orb=(995, 610), wordmark=(561, 931, 882, 187))
WX, WY, WW, WH = ART["wordmark"]
HALO = 40
LETTERS = []


def cut(runs, y0, y1):
    for i, (a, b) in enumerate(runs):
        left = -HALO if i == 0 else (runs[i - 1][1] + a) / 2
        right = WW + HALO if i == len(runs) - 1 else (b + runs[i + 1][0]) / 2
        LETTERS.append(dict(l=WX + left, r=WX + right, y0=WY + y0, y1=WY + y1))


RUNS = (([[1, 141], [174, 295], [346, 470], [514, 537], [581, 712], [742, 881]], (-6, 114)),
        ([[137, 186], [224, 280], [318, 367], [407, 457], [498, 544], [588, 647], [690, 739]], (114, 193)))
cut(RUNS[0][0], -HALO, 114)
cut(RUNS[1][0], 114, 187 + HALO)

# The letters keyed from their night (warm and bright, or bright), within each glyph's own columns, so they can move
# over the hall without a box around them; and the emblem alone, keyed the same way, without the wordmark.
lt = np.asarray(Image.open(A / "logo-letters.png").convert("RGBA")).astype(np.float32) / 255
lum = lt[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
warm = lt[..., 0] - lt[..., 2]
key = np.maximum(np.clip((warm - 0.02) / 0.12, 0, 1) * np.clip((lum - 0.22) / 0.25, 0, 1), np.clip((lum - 0.6) / 0.15, 0, 1))
glyphs = np.zeros_like(key)
for runs, (y0, y1) in RUNS:
    for a, b in runs:
        glyphs[WY + y0:WY + y1, WX + a - 4:WX + b + 5] = 1
key = ndimage.gaussian_filter(key * glyphs * lt[..., 3], 0.6)
Image.fromarray((np.dstack([lt[..., :3], np.clip(key, 0, 1)]) * 255).astype(np.uint8)).save(OUT / "letters-key.png")

art = np.asarray(Image.open(A / "logo-clean.png").convert("RGB")).astype(np.float32) / 255
# The emblem's own light over its night: the art's luminance above the background's, faded out around the emblem
# (an ellipse about the triangle) and cut above the wordmark, so the wordmark comes only from the letters.
alum = art @ np.array([0.2126, 0.7152, 0.0722], np.float32)
bg = np.median(alum[:120, :120])
yy, xx = np.mgrid[0:ART["h"], 0:ART["w"]].astype(np.float32)
cx, cy = ART["orb"]
ell = np.clip(1.25 - np.hypot((xx - cx) / 470, (yy - cy) / 430), 0, 1)
ell = ell * np.clip((WY - 30 - yy) / 40, 0, 1)
ea = np.clip((alum - bg) / 0.18, 0, 1) * np.clip(ell * 3, 0, 1)
emb = np.dstack([art, ea])
x0, y0, x1, y1 = 470, 120, 1530, 930
Image.fromarray((emb[y0:y1, x0:x1] * 255).astype(np.uint8)).save(OUT / "emblem.png")
ART["emblem_crop"] = [x0, y0, x1, y1]

DATA = {
    "cues": cues,
    "art": ART,
    "letters": LETTERS,
    "tex": {"marble": url(TEX / "marble.png"), "fog": url(TEX / "fog.png"), "emblem": url(OUT / "emblem.png"),
            "letters": url(OUT / "letters-key.png")},
}

FONT_CSS = f"""
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500.ttf")}'); font-weight:500; font-style:normal; }}
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500-italic.ttf")}'); font-weight:500; font-style:italic; }}
@font-face {{ font-family:"MONO"; src:url('{url(FONTS / "inconsolata-700.ttf")}'); font-weight:700; }}
@font-face {{ font-family:"MONO4"; src:url('{url(FONTS / "inconsolata-400.ttf")}'); font-weight:400; }}
"""
CSS = FONT_CSS + """
* { box-sizing:border-box; }
html, body { margin:0; width:1080px; height:1920px; background:#000; overflow:hidden; }
.frame { position:relative; width:1080px; height:1920px; overflow:hidden; background:#000; }
#gl { position:absolute; left:0; top:0; width:1080px; height:1920px; }
.band { position:absolute; left:0; right:0; opacity:0; pointer-events:none; }
.say { position:absolute; left:64px; right:64px; text-align:center; font:500 70px/1.14 "PF", serif; letter-spacing:-.012em; visibility:hidden;
  text-shadow:0 2px 24px rgba(2,6,14,.55); }
.say .w { display:inline-block; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #ffffff 8%, #c6cedb 68%, #ffffff); padding:.06em .1em .14em; margin:-.06em -.1em -.14em; opacity:0; }
.say .em { position:relative; display:inline-block; white-space:nowrap; }
.say .em .w { font-style:italic; background-image:linear-gradient(180deg, #f5d17a 6%, #d7b35f 52%, #c89b3c 82%, #e6c36e 100%); }
.say .ul { position:absolute; left:.06em; right:.06em; bottom:.04em; height:2px; transform-origin:0 50%; transform:scaleX(0);
  background:linear-gradient(90deg, #c89b3c, #d7b35f 60%, rgba(215,179,95,.15)); }
"""


def words_html(line_text, block_id, start_k=0):
    """The words of a line, each its own span (block_id-w<i>); *phrase* is the gold italic one, with its hairline."""
    out, inside, k = [], False, start_k
    for part in line_text.split("*"):
        if part:
            spans = []
            for w in part.split():
                if w == "<br>":
                    spans.append("<br>")
                    continue
                spans.append(f'<span class="w" id="{block_id}-w{k}">{w}</span>')
                k += 1
            html = " ".join(spans).replace(" <br> ", "<br>").replace("<br> ", "<br>").replace(" <br>", "<br>")
            out.append(f'<span class="em">{html}<i class="ul" id="{block_id}-ul"></i></span>' if inside else html)
        inside = not inside
    return " ".join(out).replace(" <br>", "<br>").replace("<br> ", "<br>"), k - start_k


# The words on screen: each block, the sentence it is spoken in (its words rise as they are heard), and which of that
# sentence's words it shows (S2 and S7 are shown a clause at a time).
BLOCKS = [
    # id, text, top, size, sentence, first word index in the sentence
    ("b1", "The next generation of <br> property professionals <br> will operate *differently.*", 250, 68, "s1", 0),
    ("b2a", "Not because they'll use <br> *more software,*", 290, 68, "s2", 0),
    ("b2b", "not because they'll have <br> *more dashboards,*", 290, 68, "s2", 6),
    ("b2c", "and not because <br> *AI became another tab.*", 290, 68, "s2", 12),
    ("b3", "At a certain level of ambition, <br> *the question changes.*", 290, 64, "s3", 0),
    ("b4", "Research, clients, reports, <br> finance, *communication.*", 290, 64, "s4", 0),
    ("b5", "*Powerful* on their own.", 300, 72, "s5", 0),
    ("b6", "More valuable when they <br> stop behaving like <br> *separate destinations.*", 230, 64, "s6", 0),
    ("b7a", "When *intelligence* can move,", 250, 62, "s7", 0),
    ("b7b", "when *context* can follow,", 330, 62, "s7", 4),
    ("b7c", "when the business <br> can *act as one.*", 410, 62, "s7", 8),
    ("b8", "So don't ask what <br> *the next tool* is.", 290, 68, "s8", 0),
    ("b9", "Ask what happens when <br> the business becomes <br> *the system.*", 230, 64, "s9", 0),
    ("b11", "A new operating standard <br> is *coming.*", 1500, 54, "s11", 0),
]
lines = {ln["key"]: ln for ln in cues["lines"]}
blocks_html, blocks = [], {}
for bid, text, top, size, sent, first in BLOCKS:
    html, n = words_html(text, bid)
    words = lines[sent]["words"][first:first + n]
    said = [w["text"].strip(".,").lower() for w in words]
    shown = [w.strip(".,").lower() for w in text.replace("*", "").replace("<br>", "").split()]
    if said != shown:
        raise SystemExit(f"{bid}: on screen {shown}, spoken {said}")
    blocks[bid] = {"sentence": sent, "words": [{"start": w["start"], "end": w["end"]} for w in words]}
    blocks_html.append(f'<div class="say" id="{bid}" style="top:{top}px;font-size:{size}px">{html}</div>')
DATA["blocks"] = blocks

page = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="frame" id="frame">
  <canvas id="gl"></canvas>
  <div id="bandTop" class="band" style="top:0;height:900px;background:linear-gradient(180deg, rgba(2,5,12,.62) 0%, rgba(2,5,12,.42) 45%, rgba(2,5,12,0) 100%)"></div>
  <div id="bandLow" class="band" style="top:1340px;height:580px;background:linear-gradient(0deg, rgba(2,5,12,.7) 0%, rgba(2,5,12,.4) 50%, rgba(2,5,12,0) 100%)"></div>
  {''.join(blocks_html)}
</div>
<script>window.DATA = {json.dumps(DATA)};</script>
<script src="{url(HERE / 'gl.js')}"></script>
<script src="{url(HERE / 'film.js')}"></script>
</body></html>"""
(OUT / "film.html").write_text(page)
(OUT / "data.json").write_text(json.dumps(DATA, indent=1))
print(json.dumps({"page": str(OUT / "film.html"), "blocks": len(BLOCKS), "letters": len(LETTERS)}))
