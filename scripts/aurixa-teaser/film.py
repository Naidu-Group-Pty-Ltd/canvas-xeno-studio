#!/usr/bin/env python3
"""The teaser, drawn: one page that shows any instant of its 37.5 seconds, for render.cjs to photograph frame by
frame (film.js: window.setT(seconds) draws that instant and resolves once every picture on it has decoded).

  python3 -I scripts/aurixa-teaser/film.py <work files dir> <dir with the living logo take, logo-B1-*.jpg>

It reads, in the work's files:
  plates/orbit-dive.png, .json   the night (orbit.py), drawn with margins so the dive can turn it (else the
                                 style frame's style-frames/final/orbit-2160.png, which has none)
  plates/city-{wide,mid,q}.png   the city at 2.5, 7 and 18 px a km (city.py): the same streets at each scale
  plates/city-q.json             where the property and the three offices are on the closest plate
  assets/                        the product's pieces in the windows, the supplied logo art and its lettering
  fonts/                         Playfair Display and Inconsolata
  sound/cues.json                where each spoken word falls on the teaser's clock (sound.py)
and writes film/film.html, film/data.json (what film.js is given), the haze and the floor plan in gold.

The camera is one zoom and centre for every plate: all three share the property's frame, the closest plate's centre
and its turn, and differ only in scale, so a plate is placed by its scale alone and the dive passes from one to the
next without the streets moving. The orbit is laid over them about the pin, and film.js turns and shears it onto
them by the local shape of the orbit's picture at the pin, measured here through orbit.py's own camera
(orbitcam.py). The lines, pins, windows and words are drawn in the screen's own pixels from the same camera, so they
stay sharp at any zoom. The logo is the supplied art and its lettering, placed and blended, never redrawn.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import orbitcam  # noqa: E402

W, B1 = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
OUT = W / "film"
OUT.mkdir(exist_ok=True)
A, FONTS = W / "assets", W / "fonts"
PROPERTY = (150.915, -33.692)  # 14 Wattle Grove (citydata.py, orbit.py)


def url(p):
    return "file://" + str(Path(p).resolve())


# ------------------------------------------------------------------ inputs
dive = W / "plates/orbit-dive.png"
orbit_png = dive if dive.exists() else W / "style-frames/final/orbit-2160.png"
orbit_meta = json.loads(orbit_png.with_suffix(".json").read_text())
pad = orbit_meta.get("pad", [0.0, 0.0])
q_meta = json.loads((W / "plates/city-q.json").read_text())
cues = json.loads((W / "sound/cues.json").read_text())
OFF = ("South Windsor", "Edensor Park", "Hornsby")
b1_frames = sorted(B1.glob("logo-B1-*.jpg"))
if len(b1_frames) < 200:
    raise SystemExit(f"the living logo take has {len(b1_frames)} frames in {B1}")

# The orbit's picture about the pin: a kilometre east and north of 14 Wattle Grove, in frame px (1080 wide).
cam = orbitcam.camera(orbit_meta["params"], 1080, 1920)
xs, ys = orbitcam.at_km(cam, *PROPERTY, [0, 1, -1, 0, 0], [0, 0, 0, 1, -1])
J = [[(xs[1] - xs[2]) / 2, (xs[3] - xs[4]) / 2], [(ys[1] - ys[2]) / 2, (ys[3] - ys[4]) / 2]]
J = [[float(v) for v in row] for row in J]
mean = float(np.sqrt(abs(J[0][0] * J[1][1] - J[0][1] * J[1][0])))
if np.hypot(xs[0] - orbit_meta["property"][0], ys[0] - orbit_meta["property"][1]) > 0.01:
    raise SystemExit("orbitcam.py and orbit.py put the pin in different places")
# The plates' east and north on the screen (citydata.km_to_px: the screen's top faces the bearing `up`).
b = np.radians(q_meta["view"]["up"])
plate_frame = {"e": [float(np.cos(b)), float(-np.sin(b))], "n": [float(-np.sin(b)), float(-np.cos(b))]}

# The logo art (Reel 1's logo.cjs: 2000 x 1333), the emblem's triangle measured on it, the wordmark, and the
# lettering's letters as Reel 3's g-lockup.cjs cuts them (AURIXA, then SYSTEMS, each with its shadow's halo).
ART = dict(w=2000, h=1333, apex=(998, 245), bl=(662, 818), br=(1338, 805), orb=(995, 610),
           wordmark=(561, 931, 882, 187), card_crop=(0, 104, 2000, 1125))
WX, WY, WW, WH = ART["wordmark"]
HALO = 40
LETTERS = []


def cut(runs, y0, y1):
    for i, (a, b_) in enumerate(runs):
        left = -HALO if i == 0 else (runs[i - 1][1] + a) / 2
        right = WW + HALO if i == len(runs) - 1 else (b_ + runs[i + 1][0]) / 2
        LETTERS.append(dict(l=WX + left, r=WX + right, y0=WY + y0, y1=WY + y1))


RUNS = (([[1, 141], [174, 295], [346, 470], [514, 537], [581, 712], [742, 881]], (-6, 114)),
        ([[137, 186], [224, 280], [318, 367], [407, 457], [498, 544], [588, 647], [690, 739]], (114, 193)))
cut(RUNS[0][0], -HALO, 114)
cut(RUNS[1][0], 114, 187 + HALO)

# The letters alone, to move: logo-letters.png cuts each letter with the art's own night around it (so at rest the
# letters are the supplied ones, pixel for pixel), and that patch would show as a box while a letter rose out of a
# blur. Here the glyphs are keyed from it (warm and bright, or bright: their tops catch white), within each glyph's
# own columns and line; film.js moves these and gives way to the exact patch as each letter lands.
lt = np.asarray(Image.open(A / "logo-letters.png").convert("RGBA")).astype(np.float32) / 255
lum = lt[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
warm = lt[..., 0] - lt[..., 2]
key = np.maximum(np.clip((warm - 0.02) / 0.12, 0, 1) * np.clip((lum - 0.22) / 0.25, 0, 1), np.clip((lum - 0.6) / 0.15, 0, 1))
glyphs = np.zeros_like(key)
for runs, (y0, y1) in RUNS:
    for a, b_ in runs:
        glyphs[WY + y0:WY + y1, WX + a - 4:WX + b_ + 5] = 1
key = ndimage.gaussian_filter(key * glyphs * lt[..., 3], 0.6)
Image.fromarray((np.dstack([lt[..., :3], np.clip(key, 0, 1)]) * 255).astype(np.uint8)).save(OUT / "letters-key.png")

# The haze the camera falls through: two thin decks of night cloud, a dark veil lit faintly by the moon, its
# density wandering slowly across it, thickest where the moonlight catches it. Soft at every scale, so it reads as
# air and never as shapes, and faded to nothing at its edges, so it can grow past the frame.
for i, seed in enumerate((6, 11)):
    rng = np.random.default_rng(seed)
    hz = np.zeros((960, 540), np.float32)
    for scale, amp in ((110, 1.0), (48, 0.42), (20, 0.16)):
        hz += amp * ndimage.gaussian_filter(rng.normal(0, 1, (960, 540)).astype(np.float32), scale)
    hz = (hz - hz.mean()) / (hz.std() + 1e-6)
    yy, xx = np.mgrid[0:960, 0:540].astype(np.float32)
    edge = np.clip(np.minimum.reduce([xx, 539 - xx, yy, 959 - yy]) / 140, 0, 1) ** 1.5
    dens = np.clip((hz + 1.1) / 2.8, 0, 1)
    dens = dens * dens * (3 - 2 * dens)  # smooth
    lit = np.clip((hz - 0.4) / 1.6, 0, 1)  # the moonlit tops of the thicker cloud
    rgba = np.zeros((960, 540, 4), np.float32)
    rgba[..., 0] = 0.13 + 0.16 * lit
    rgba[..., 1] = 0.18 + 0.19 * lit
    rgba[..., 2] = 0.27 + 0.23 * lit
    rgba[..., 3] = (0.25 + 0.6 * dens) * edge
    Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8)).resize((1080, 1920), Image.BICUBIC).save(OUT / f"haze{i}.png")

# 14 Wattle Grove's floor plan, its navy lines made gold and its paper clear (as frames.py makes it).
plan = np.asarray(Image.open(A / "D.png").convert("RGB")).astype(np.float32) / 255
ink = np.clip((0.97 - plan @ np.array([0.3, 0.55, 0.15], np.float32)) / 0.75, 0, 1)
ys_, xs_ = np.nonzero(ink > 0.15)
gold = np.dstack([np.broadcast_to(np.array([0.96, 0.82, 0.48], np.float32), plan.shape), ink])
gold = gold[ys_.min() - 12:ys_.max() + 12, xs_.min() - 12:xs_.max() + 12]
Image.fromarray((gold * 255).astype(np.uint8)).save(OUT / "plan-gold.png")

P_Q = [q_meta["view"]["cx"], q_meta["view"]["cy"]]
O_Q = [q_meta["offices"][k] for k in OFF]

# ------------------------------------------------------------------ the windows (as the style frames drew them)
w1 = [round(O_Q[0][0] - 2, 1), 300, 540, 470]
pw, ph_full, ph = 480, 3240 * 480 / 2350, 268
w2 = [round(O_Q[1][0] - 540 + 2, 1), 330, 540, 72 + ph + 30]
w3 = [round(O_Q[2][0] - 440), 400, 880, 340]
cw = 820
ch = round(cw * 630 / 2280)
pointer = [30 + cw * 1290 / 2280, 84 + ch * 425 / 630]  # the pointer's tip on the button's label

K7 = 0.78  # the name's logo: the emblem's apex at y 390 (frames.py's SF7)
name_top = round(390 - ART["apex"][1] * K7 + (WY + WH) * K7 + 80)

DATA = {
    "orbit": {"pin": orbit_meta["property"], "pad": pad, "mean": mean, "J": J,
              "size": [1080 + 2 * pad[0], 1920 + 2 * pad[1]]},
    "plateFrame": plate_frame,
    "plates": {"wide": 2.5, "mid": 7.0, "q": 18.0},
    "property": P_Q,
    "offices": O_Q,
    "lines": cues["lines"],
    "art": ART,
    "letters": LETTERS,
    "b1": [url(p) for p in b1_frames],
    "windows": [{"box": w1}, {"box": w2}, {"box": w3}],
    "pointer": pointer,
}

FONT_CSS = f"""
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500.ttf")}'); font-weight:500; font-style:normal; }}
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500-italic.ttf")}'); font-weight:500; font-style:italic; }}
@font-face {{ font-family:"MONO"; src:url('{url(FONTS / "inconsolata-700.ttf")}'); font-weight:700; }}
@font-face {{ font-family:"INTER"; src:url('{url("/usr/share/fonts/opentype/inter/Inter-Regular.otf")}'); font-weight:400; }}
"""

# The style frames' own styles (frames.py), with what moving them needs: every placed thing at left 0, top 0 and
# moved by its transform; each word its own box, to rise.
CSS = FONT_CSS + """
* { box-sizing:border-box; }
html, body { margin:0; width:1080px; height:1920px; background:#040B16; overflow:hidden; }
.frame { position:relative; width:1080px; height:1920px; overflow:hidden; background:#040B16; }
.abs { position:absolute; left:0; top:0; }
.full { position:absolute; left:0; top:0; width:1080px; height:1920px; }
#orbit { transform-origin:0 0; }
#world { transform-origin:0 0; }
.plate { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:540px 960px;
  -webkit-mask-composite:source-in; mask-composite:intersect; }
.haze { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:540px 960px; visibility:hidden; }
.say { position:absolute; left:70px; right:70px; text-align:center; font:500 80px/1.12 "PF", serif; letter-spacing:-.012em; visibility:hidden; }
.say .w { display:inline-block; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #ffffff 8%, #c6cedb 68%, #ffffff); padding:.06em .1em .14em; margin:-.06em -.1em -.14em; opacity:0; }
.say .em { position:relative; display:inline-block; white-space:nowrap; }
.say .em .w { font-style:italic; background-image:linear-gradient(180deg, #f5d17a 6%, #d7b35f 52%, #c89b3c 82%, #e6c36e 100%); }
.say .ul { position:absolute; left:.06em; right:.06em; bottom:.04em; height:2px; transform-origin:0 50%; transform:scaleX(0);
  background:linear-gradient(90deg, #c89b3c, #d7b35f 60%, rgba(215,179,95,.15)); }
.eyebrow { position:absolute; left:0; right:0; display:flex; justify-content:center; align-items:center; gap:20px; visibility:hidden;
  font:700 26px/1 "MONO", monospace; letter-spacing:.28em; text-transform:uppercase; color:#D7B35F; padding-left:.28em; }
.eyebrow i { display:block; width:54px; height:1.5px; background:linear-gradient(90deg, rgba(215,179,95,0), rgba(215,179,95,.8)); }
.eyebrow i.r { background:linear-gradient(90deg, rgba(215,179,95,.8), rgba(215,179,95,0)); }
.label { position:absolute; font:700 19px/1 "MONO", monospace; letter-spacing:.24em; text-transform:uppercase; color:#F5D17A;
  text-shadow:0 0 10px rgba(4,11,22,.95), 0 0 3px rgba(4,11,22,.95); white-space:nowrap; }
.num { position:absolute; font:700 18px/1 "MONO", monospace; letter-spacing:.16em; color:#F5D17A; visibility:hidden;
  text-shadow:0 0 10px rgba(4,11,22,1), 0 0 3px rgba(4,11,22,1); }
.pin { position:absolute; left:0; top:0; width:0; height:0; }
.pin .halo { position:absolute; left:-70px; top:-70px; width:140px; height:140px; border-radius:50%;
  background:radial-gradient(circle, rgba(245,209,122,.50) 0%, rgba(200,155,60,.20) 32%, rgba(200,155,60,0) 70%); }
.pin .ring { position:absolute; left:-19px; top:-19px; width:38px; height:38px; border-radius:50%; border:1.5px solid rgba(245,209,122,.85); }
.pin .core { position:absolute; left:-7px; top:-7px; width:14px; height:14px; border-radius:50%;
  background:radial-gradient(circle, #fffaf0 0%, #f5d17a 55%, #c89b3c 100%); box-shadow:0 0 12px 3px rgba(245,209,122,.75); }
.pin .pulse { position:absolute; left:-30px; top:-30px; width:60px; height:60px; border-radius:50%; border:2px solid rgba(245,209,122,.9); opacity:0; }
.pin.office .halo { left:-48px; top:-48px; width:96px; height:96px; }
.pin.office .ring { left:-14px; top:-14px; width:28px; height:28px; }
.pin.office .core { left:-5px; top:-5px; width:10px; height:10px; }
.beam { position:absolute; left:0; top:0; width:2px; margin-left:-1px; background:linear-gradient(0deg, rgba(245,209,122,.95), rgba(245,209,122,0)); }
.win { position:absolute; border-radius:22px; overflow:hidden; visibility:hidden;
  background:linear-gradient(180deg, rgba(16,35,61,.90), rgba(4,11,22,.94));
  border:1.5px solid rgba(215,179,95,.62);
  box-shadow:0 34px 90px rgba(0,0,0,.6), 0 0 60px rgba(200,155,60,.16), inset 0 1px 0 rgba(255,255,255,.07); }
.win .cap { position:absolute; left:26px; top:22px; font:700 16px/1 "MONO", monospace; letter-spacing:.24em; color:#D7B35F; text-transform:uppercase; }
.win .tag { position:absolute; right:22px; top:18px; font:700 13px/1 "MONO", monospace; letter-spacing:.2em; color:#9fb0c6;
  border:1px solid rgba(159,176,198,.45); border-radius:999px; padding:6px 10px 5px 12px; text-transform:uppercase; }
.win .rule { position:absolute; left:26px; right:26px; top:52px; height:1px; background:linear-gradient(90deg, rgba(215,179,95,.5), rgba(215,179,95,0)); }
.band { position:absolute; left:0; right:0; opacity:0; }
#logo { position:absolute; left:0; top:0; width:2000px; height:1333px; transform-origin:0 0; mix-blend-mode:screen; visibility:hidden;
  -webkit-mask-image:radial-gradient(ellipse 52% 50% at 50% 50%, #000 64%, transparent 100%);
  mask-image:radial-gradient(ellipse 52% 50% at 50% 50%, #000 64%, transparent 100%); }
#b1 { position:absolute; left:0; -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 7%, #000 93%, transparent 100%);
  mask-image:linear-gradient(to bottom, transparent 0, #000 7%, #000 93%, transparent 100%); }
.letter { position:absolute; background-repeat:no-repeat; opacity:0; }
.sweep { position:absolute; mix-blend-mode:screen; opacity:0; background-repeat:no-repeat; background-size:40% 100%;
  background-image:linear-gradient(105deg, rgba(255,240,205,0) 0%, rgba(255,240,205,.9) 50%, rgba(255,240,205,0) 100%); }
#flash { background-repeat:no-repeat; }
"""


def words_html(line_text, block_id):
    """The words of a line, each its own span (block_id-w<i>); *phrase* is the gold italic one, with its hairline."""
    out, inside, k = [], False, 0
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
            out.append(f'<span class="em" id="{block_id}-em">{html}<i class="ul" id="{block_id}-ul"></i></span>' if inside else html)
        inside = not inside
    return " ".join(out).replace(" <br>", "<br>").replace("<br> ", "<br>"), k


# The words on screen, each block with the take it is spoken in (its words rise as they are heard).
BLOCKS = [
    # id, text, top, size, take (None: timed by film.js)
    ("t0", "Every property comes with <br> *three questions.*", 286, 74, "l1"),
    ("q1", "Is it *right* for them?", 1372, 80, "l2"),
    ("q2", "Are they *who they say* <br> they are?", 1360, 76, "l3"),
    ("q3", "Can they *afford* it?", 1372, 80, "l4"),
    ("gap", "Until now, each one was <br> answered *somewhere else.*", 1316, 72, "l5b"),
    ("shape", "We've been building *the answer.*", 1352, 76, "l6b"),
    ("name", "Built for the people <br> who *ask them.*", name_top, 54, None),
    ("soon", "*Soon.*", 1010, 150, "l8b"),
]
blocks_html, block_words = [], {}
for bid, text, top, size, take in BLOCKS:
    html, n = words_html(text, bid)
    if take and len(next(c for c in cues["lines"] if c["take"] == take)["words"]) != n:
        raise SystemExit(f"{bid}: {n} words on screen, not the take's")
    block_words[bid] = {"n": n, "take": take}
    lh = 1 if size >= 150 else 1.12 if size > 60 else 1.2
    blocks_html.append(f'<div class="say" id="{bid}" style="top:{top}px;font-size:{size}px;line-height:{lh}">{html}</div>')
DATA["blocks"] = block_words

letters_html = "".join(
    f'<div class="letter" id="{kind}{i}" style="left:{d["l"]}px;top:{d["y0"]}px;width:{d["r"] - d["l"]}px;height:{d["y1"] - d["y0"]}px;'
    f'background-image:url(\'{src}\');background-position:{-d["l"]}px {-d["y0"]}px;background-size:2000px 1333px"></div>'
    for kind, src in (("K", url(OUT / "letters-key.png")), ("L", url(A / "logo-letters.png")))
    for i, d in enumerate(LETTERS))
# A light across each line of the lettering, masked to the letters themselves.
LET = url(OUT / "letters-key.png")
sweeps_html = "".join(
    f'<div class="sweep" id="sweep{i}" style="left:{WX}px;top:{WY + y0}px;width:{WW}px;height:{y1 - y0}px;'
    f"-webkit-mask-image:url('{LET}');-webkit-mask-size:2000px 1333px;-webkit-mask-position:{-WX}px {-(WY + y0)}px;-webkit-mask-repeat:no-repeat;"
    f"mask-image:url('{LET}');mask-size:2000px 1333px;mask-position:{-WX}px {-(WY + y0)}px;mask-repeat:no-repeat\"></div>"
    for i, (y0, y1) in enumerate(((-10, 114), (114, 197))))

windows_html = f"""
<div class="win" id="win0" style="left:{w1[0]}px;top:{w1[1]}px;width:{w1[2]}px;height:{w1[3]}px">
  <div class="cap">14 Wattle Grove</div><div class="cap" style="left:auto;right:26px">Floor plan</div><div class="rule"></div>
  <img id="plan" src="{url(OUT / 'plan-gold.png')}" style="position:absolute;left:80px;top:72px;width:380px;height:380px;opacity:.95">
</div>
<div class="win" id="win1" style="left:{w2[0]}px;top:{w2[1]}px;width:{w2[2]}px;height:{w2[3]}px">
  <div class="cap">Passport</div><div class="tag">Demo workspace</div><div class="rule"></div>
  <div style="position:absolute;left:30px;top:72px;width:{pw}px;height:{ph}px;overflow:hidden;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.6)">
    <img src="{url(A / 'r2-pp-cmd-cover.png')}" style="position:absolute;left:0;top:{-0.585 * ph_full:.1f}px;width:{pw}px;height:{ph_full:.1f}px">
    <div id="ppsweep" style="position:absolute;top:0;bottom:0;left:0;width:200px;mix-blend-mode:screen;transform:translateX(-220px);
      background:linear-gradient(100deg, rgba(255,240,205,0) 0%, rgba(255,240,205,.30) 50%, rgba(255,240,205,0) 100%)"></div>
  </div>
</div>
<div class="win" id="win2" style="left:{w3[0]}px;top:{w3[1]}px;width:{w3[2]}px;height:{w3[3]}px">
  <div class="cap">Jordan Ellis</div><div class="tag">Demo workspace</div><div class="rule"></div>
  <img src="{url(A / 'r3-bc-card-empty.png')}" style="position:absolute;left:30px;top:84px;width:{cw}px;height:{ch}px;border-radius:12px">
  <svg id="pointer" style="position:absolute;left:0;top:0;opacity:0" width="30" height="40" viewBox="0 0 30 40"><path d="M2 2 L2 30 L9 23 L14 35 L19 33 L14 21 L24 21 Z" fill="#fff" stroke="#0b1424" stroke-width="2" stroke-linejoin="round"/></svg>
</div>"""

PIN = '<div class="halo"></div><div class="ring"></div><div class="core"></div><div class="pulse"></div>'
ow, oh = DATA["orbit"]["size"]
page = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="frame" id="frame">
  <img id="orbit" class="abs" src="{url(orbit_png)}" style="width:{ow}px;height:{oh}px">
  <div id="world" class="full">
    <img id="pwide" class="plate" src="{url(W / 'plates/city-wide.png')}" style="visibility:hidden">
    <img id="pmid" class="plate" src="{url(W / 'plates/city-mid.png')}" style="visibility:hidden">
    <img id="pq" class="plate" src="{url(W / 'plates/city-q.png')}" style="visibility:hidden">
    <div id="dim" style="position:absolute;left:-420px;top:-700px;width:1920px;height:3000px;background:#000;opacity:0"></div>
  </div>
  <div id="horizon" class="full" style="opacity:0;background:linear-gradient(180deg, #040B16 0%, #040B16 49%, rgba(8,24,48,.72) 54.5%, rgba(4,11,22,.25) 62%, rgba(4,11,22,0) 70%)"></div>
  <img id="hz0" class="haze" src="{url(OUT / 'haze0.png')}">
  <img id="hz1" class="haze" src="{url(OUT / 'haze1.png')}">
  <div id="topshade" class="band" style="top:0;height:900px;background:radial-gradient(ellipse 70% 50% at 50% 34%, rgba(4,11,22,.55), rgba(4,11,22,0) 75%)"></div>
  <div id="logo">
    <img src="{url(A / 'logo-clean.png')}" style="position:absolute;left:0;top:0;width:2000px;height:1333px">
    <img id="b1" src="{DATA['b1'][0]}" style="top:{ART['card_crop'][1]}px;width:2000px;height:{ART['card_crop'][3]}px">
    {letters_html}
    {sweeps_html}
  </div>
  <svg id="fx" class="abs" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <filter id="glow" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1680" height="2520">
        <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b1"/><feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b2"/>
        <feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="bigglow" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1680" height="2520">
        <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="b1"/><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b2"/>
        <feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <radialGradient id="tfill" gradientUnits="userSpaceOnUse" cx="540" cy="1000" r="420">
        <stop offset="0" stop-color="#f5d17a" stop-opacity=".16"/><stop offset="1" stop-color="#c89b3c" stop-opacity=".03"/></radialGradient>
      <linearGradient id="trailg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFF0CD" stop-opacity=".95"/><stop offset=".45" stop-color="#F5D17A" stop-opacity=".35"/><stop offset="1" stop-color="#F5D17A" stop-opacity="0"/></linearGradient>
    </defs>
    <polygon id="fill" points="0,0 0,0 0,0" fill="url(#tfill)" opacity="0"/>
    {''.join(f'<path id="sp{i}" d="M0 0" fill="none" stroke="#E2BE6A" stroke-linecap="round" filter="url(#glow)" opacity="0"/>' for i in range(3))}
    {''.join(f'<path id="dp{i}" d="M0 0" fill="none" stroke="#E2BE6A" stroke-width="2" stroke-dasharray="3 14" stroke-linecap="round" filter="url(#glow)" opacity="0"/>' for i in range(3))}
    <line id="tether" stroke="#E2BE6A" stroke-width="2" stroke-linecap="round" filter="url(#glow)" opacity="0"/>
    {''.join(f'<line id="e{i}" stroke="#F0CD78" stroke-width="4.2" stroke-linecap="round" filter="url(#bigglow)" opacity="0"/>' for i in range(3))}
    <line id="trail" stroke="url(#trailg)" stroke-width="3" stroke-linecap="round" opacity="0"/>
    <path id="trailseg" d="M0 0" fill="none" stroke="#FFF0CD" stroke-width="3.2" stroke-linecap="round" filter="url(#glow)" opacity="0"/>
    <circle id="spark" r="6" fill="#FFF6DC" filter="url(#bigglow)" opacity="0"/>
  </svg>
  {''.join(f'<div class="pin office" id="o{i}" style="opacity:0">{PIN}</div>' for i in range(3))}
  {''.join(f'<div class="num" id="n{i}">0{i + 1}</div>' for i in range(3))}
  <div class="beam" id="beam" style="height:200px"></div>
  <div class="beam" id="beampulse" style="height:60px;opacity:0;background:linear-gradient(0deg, rgba(255,246,220,0), rgba(255,246,220,1) 50%, rgba(255,246,220,0))"></div>
  <div class="pin" id="pin">{PIN}</div>
  <div class="label" id="lab0">14 Wattle Grove</div>
  <div class="label" id="lab1" style="font-size:22px;opacity:0">14 Wattle Grove</div>
  <div class="label" id="lab2" style="font-size:16px;color:#c9d3e0;opacity:0">Banksia Rise NSW 2155</div>
  <div class="label" id="lab3" style="font-size:16px;opacity:0">14 Wattle Grove</div>
  {windows_html}
  <div id="band" class="band" style="top:1240px;height:420px;background:linear-gradient(180deg, rgba(4,11,22,0) 0%, rgba(4,11,22,.84) 28%, rgba(4,11,22,.84) 72%, rgba(4,11,22,0) 100%)"></div>
  <div id="nameband" class="band" style="top:{name_top - 90}px;height:{1640 - name_top + 90}px;background:linear-gradient(180deg, rgba(4,11,22,0) 0%, rgba(4,11,22,.7) 22%, rgba(4,11,22,.7) 78%, rgba(4,11,22,0) 100%)"></div>
  <div class="eyebrow" id="eb0" style="top:1306px"><i></i><span>The adviser's question</span><i class="r"></i></div>
  <div class="eyebrow" id="eb1" style="top:1306px"><i></i><span>The compliance question</span><i class="r"></i></div>
  <div class="eyebrow" id="eb2" style="top:1306px"><i></i><span>The broker's question</span><i class="r"></i></div>
  {''.join(blocks_html)}
  <div id="orb" class="abs" style="opacity:0;width:340px;height:340px;border-radius:50%;
    background:radial-gradient(circle, rgba(255,250,235,.95) 0%, rgba(245,209,122,.55) 9%, rgba(200,155,60,.16) 30%, rgba(200,155,60,0) 62%)"></div>
  <div id="orbcore" class="abs" style="opacity:0;width:18px;height:18px;border-radius:50%;
    background:radial-gradient(circle, #fffaf0 0%, #f5d17a 60%, #c89b3c 100%);box-shadow:0 0 18px 6px rgba(245,209,122,.8)"></div>
  <div id="url" class="abs" style="top:1236px;width:1080px;text-align:center;font:400 26px/1 'INTER';color:#9fb0c6;letter-spacing:.02em;opacity:0">aurixasystems.com.au</div>
  <div id="flash" class="full" style="opacity:0;background-image:radial-gradient(circle at 540px 1000px, rgba(255,246,220,.9), rgba(245,209,122,.25) 30%, rgba(4,11,22,0) 62%)"></div>
</div>
<script>window.DATA = {json.dumps(DATA)};</script>
<script src="{url(HERE / 'film.js')}"></script>
</body></html>"""
(OUT / "film.html").write_text(page)
(OUT / "data.json").write_text(json.dumps(DATA, indent=1))
print(json.dumps({"page": str(OUT / "film.html"), "orbit": str(orbit_png), "pad": pad, "orbit_mean_px_km": round(mean, 4),
                  "letters": len(LETTERS), "living_logo_frames": len(b1_frames), "name_top": name_top}))
