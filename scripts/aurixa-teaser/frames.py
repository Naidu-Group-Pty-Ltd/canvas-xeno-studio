#!/usr/bin/env python3
"""The teaser's nine style frames, as pages (1080 x 1920) for shoot.cjs to photograph.

  python3 -I scripts/aurixa-teaser/frames.py <render dir> <assets dir> <fonts dir>

The render dir holds orbit.py's and city.py's renders in final/ (each at 2160 wide, with its points in a .json); the
pages go to frames/. The assets dir holds the films' own pieces: D.png (14 Wattle Grove's floor plan, as Film 1
draws it), r2-pp-cmd-cover.png (the Compliance Passport's cover, Film 2), r3-bc-card-empty.png (the Borrowing
Capacity card, Film 3), and the supplied logo art, logo-clean.png and logo-art.png. The fonts dir holds the
films' Playfair Display and Inconsolata. The logo is placed and blended, never redrawn; everything else (the
pin, the lines, the windows, the type) is drawn here."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

S, A, FONTS = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT = S / "frames"
OUT.mkdir(exist_ok=True)
# The frames are 1080 wide; the renders are drawn at twice that and taken down here.
for name in ("orbit", "city", "city-q"):
    big, small = S / f"final/{name}-2160.png", S / f"final/{name}-1080.png"
    if not small.exists() or small.stat().st_mtime < big.stat().st_mtime:
        Image.open(big).resize((1080, 1920), Image.LANCZOS).save(small)
# 14 Wattle Grove's floor plan, its navy lines made gold and its paper clear.
plan = np.asarray(Image.open(A / "D.png").convert("RGB")).astype(np.float32) / 255
ink = np.clip((0.97 - plan @ np.array([0.3, 0.55, 0.15], np.float32)) / 0.75, 0, 1)
ys, xs = np.nonzero(ink > 0.15)
gold = np.dstack([np.broadcast_to(np.array([0.96, 0.82, 0.48], np.float32), plan.shape), ink])
gold = gold[ys.min() - 12:ys.max() + 12, xs.min() - 12:xs.max() + 12]
Image.fromarray((gold * 255).astype(np.uint8)).save(OUT / "plan-gold.png")
orbit = json.loads((S / "final/orbit-2160.json").read_text())
cityq = json.loads((S / "final/city-q-2160.json").read_text())
city = json.loads((S / "final/city-2160.json").read_text())
OFF = ("South Windsor", "Edensor Park", "Hornsby")

# The logo art's geometry (Reel 1's logo.cjs: the art is 2000 x 1333), and the emblem's triangle measured on it.
ART_W, ART_H = 2000, 1333
EM_APEX, EM_BL, EM_BR, EM_ORB = (998, 245), (662, 818), (1338, 805), (995, 610)
WORDMARK = (561, 931, 882, 187)


def url(p):
    return "file://" + str(Path(p).resolve())


# ------------------------------------------------------------------ the ground in perspective, for the answer
def perspective_city():
    """The city view tipped back toward a horizon: the camera's tilt as the triangle stands."""
    src = Image.open(S / "final/city-1080.png")
    W, H = 1080, 1920
    # Where the source's corners of a region land: a trapezoid, narrow at the horizon (y 1010), wide at the foot.
    region = [(-240, 300), (1320, 300), (1320, 1700), (-240, 1700)]  # source, clockwise from top left
    dst = [(330, 1010), (750, 1010), (1460, 1920), (-380, 1920)]

    def coeffs(pa, pb):
        m = []
        for (x, y), (u, v) in zip(pa, pb):
            m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
            m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        return np.linalg.solve(np.array(m, float), np.array(pb, float).reshape(8))

    # PIL maps output to input, so solve for dst -> src.
    c = coeffs(dst, region)
    out = src.transform((W, H), Image.PERSPECTIVE, tuple(c), Image.BICUBIC, fillcolor=(4, 11, 22))
    a = np.asarray(out).astype(np.float32) / 255
    y = np.arange(H, dtype=np.float32)[:, None]
    fade = np.clip((y - 1010) / 260, 0, 1) ** 1.4  # the far city fades into the haze at the horizon
    a = a * fade[..., None]
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(OUT / "city-perspective.png")


perspective_city()

FONT_CSS = f"""
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500.ttf")}'); font-weight:500; font-style:normal; }}
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500-italic.ttf")}'); font-weight:500; font-style:italic; }}
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-600.ttf")}'); font-weight:600; font-style:normal; }}
@font-face {{ font-family:"MONO"; src:url('{url(FONTS / "inconsolata-700.ttf")}'); font-weight:700; }}
@font-face {{ font-family:"INTER"; src:url('{url("/usr/share/fonts/opentype/inter/Inter-Regular.otf")}'); font-weight:400; }}
@font-face {{ font-family:"INTER"; src:url('{url("/usr/share/fonts/opentype/inter/Inter-Medium.otf")}'); font-weight:500; }}
"""

CSS = FONT_CSS + """
* { box-sizing:border-box; }
html, body { margin:0; width:1080px; height:1920px; background:#040B16; overflow:hidden; }
.frame { position:relative; width:1080px; height:1920px; overflow:hidden; background:#040B16; }
.abs { position:absolute; }
.bg { position:absolute; left:0; top:0; width:1080px; height:1920px; }
/* Type: the site's headline face; silver, its one phrase in gold italic with a hairline under it. */
.say { position:absolute; left:70px; right:70px; text-align:center; font:500 80px/1.12 "PF", serif; letter-spacing:-.012em; }
.say .w { color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #ffffff 8%, #c6cedb 68%, #ffffff); padding:.06em .1em .14em; margin:-.06em -.1em -.14em; }
.say .em { position:relative; display:inline-block; white-space:nowrap; }
.say .em .w { font-style:italic; background-image:linear-gradient(180deg, #f5d17a 6%, #d7b35f 52%, #c89b3c 82%, #e6c36e 100%); }
.say .em::after { content:""; position:absolute; left:.06em; right:.06em; bottom:.04em; height:2px;
  background:linear-gradient(90deg, #c89b3c, #d7b35f 60%, rgba(215,179,95,.15)); }
.eyebrow { position:absolute; left:0; right:0; display:flex; justify-content:center; align-items:center; gap:20px;
  font:700 26px/1 "MONO", monospace; letter-spacing:.28em; text-transform:uppercase; color:#D7B35F; padding-left:.28em; }
.eyebrow i { display:block; width:54px; height:1.5px; background:linear-gradient(90deg, rgba(215,179,95,0), rgba(215,179,95,.8)); }
.eyebrow i.r { background:linear-gradient(90deg, rgba(215,179,95,.8), rgba(215,179,95,0)); }
.label { position:absolute; font:700 19px/1 "MONO", monospace; letter-spacing:.24em; text-transform:uppercase; color:#F5D17A;
  text-shadow:0 0 10px rgba(4,11,22,.95), 0 0 3px rgba(4,11,22,.95); white-space:nowrap; }
.num { position:absolute; font:700 18px/1 "MONO", monospace; letter-spacing:.16em; color:#F5D17A;
  text-shadow:0 0 10px rgba(4,11,22,1), 0 0 3px rgba(4,11,22,1); }
/* The pin: 14 Wattle Grove. A warm core, a ring and its light. */
.pin { position:absolute; width:0; height:0; }
.pin .halo { position:absolute; left:-70px; top:-70px; width:140px; height:140px; border-radius:50%;
  background:radial-gradient(circle, rgba(245,209,122,.50) 0%, rgba(200,155,60,.20) 32%, rgba(200,155,60,0) 70%); }
.pin .ring { position:absolute; left:-19px; top:-19px; width:38px; height:38px; border-radius:50%; border:1.5px solid rgba(245,209,122,.85); }
.pin .core { position:absolute; left:-7px; top:-7px; width:14px; height:14px; border-radius:50%;
  background:radial-gradient(circle, #fffaf0 0%, #f5d17a 55%, #c89b3c 100%); box-shadow:0 0 12px 3px rgba(245,209,122,.75); }
.pin.office .halo { left:-48px; top:-48px; width:96px; height:96px; }
.pin.office .ring { left:-14px; top:-14px; width:28px; height:28px; }
.pin.office .core { left:-5px; top:-5px; width:10px; height:10px; }
.pin.dim { opacity:.55; }
.beam { position:absolute; width:2px; margin-left:-1px; background:linear-gradient(0deg, rgba(245,209,122,.95), rgba(245,209,122,0)); }
/* A window lit in the night: the films' object behind glass, in a gold hairline. */
.win { position:absolute; border-radius:22px; overflow:hidden;
  background:linear-gradient(180deg, rgba(16,35,61,.90), rgba(4,11,22,.94));
  border:1.5px solid rgba(215,179,95,.62);
  box-shadow:0 34px 90px rgba(0,0,0,.6), 0 0 60px rgba(200,155,60,.16), inset 0 1px 0 rgba(255,255,255,.07); }
.win .cap { position:absolute; left:26px; top:22px; font:700 16px/1 "MONO", monospace; letter-spacing:.24em; color:#D7B35F; text-transform:uppercase; }
.win .tag { position:absolute; right:22px; top:18px; font:700 13px/1 "MONO", monospace; letter-spacing:.2em; color:#9fb0c6;
  border:1px solid rgba(159,176,198,.45); border-radius:999px; padding:6px 10px 5px 12px; text-transform:uppercase; }
.win .rule { position:absolute; left:26px; right:26px; top:52px; height:1px; background:linear-gradient(90deg, rgba(215,179,95,.5), rgba(215,179,95,0)); }
.band { position:absolute; left:0; right:0; }
"""

SVG_DEFS = """
<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f5d17a"/><stop offset=".5" stop-color="#d7b35f"/><stop offset="1" stop-color="#c89b3c"/>
  </linearGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b1"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b2"/>
    <feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="bigglow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="b1"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b2"/>
    <feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>"""


def page(name, body):
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="frame">{body}</div></body></html>"""
    (OUT / f"{name}.html").write_text(html)


def say(top, html, size=80):
    return f'<div class="say" style="top:{top}px;font-size:{size}px">{html}</div>'


def words(text):
    """Silver words; *phrase* becomes the gold italic phrase."""
    out, inside = [], False
    for part in text.split("*"):
        if part:
            ws = " ".join(f'<span class="w">{w}</span>' for w in part.split())
            out.append(f'<span class="em">{ws}</span>' if inside else ws)
        inside = not inside
    return " ".join(out).replace("<br> ", "<br>")


def pin(x, y, cls=""):
    return (f'<div class="pin {cls}" style="left:{x}px;top:{y}px"><div class="halo"></div><div class="ring"></div>'
            f'<div class="core"></div></div>')


def arc(p, q, bulge, width=3.0, opacity=1.0, glow="glow"):
    (x0, y0), (x1, y1) = p, q
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    L = (dx * dx + dy * dy) ** 0.5
    nx, ny = -dy / L, dx / L
    cx, cy = mx + nx * bulge * L, my + ny * bulge * L
    return (f'<path d="M{x0:.1f} {y0:.1f} Q{cx:.1f} {cy:.1f} {x1:.1f} {y1:.1f}" stroke="url(#gold)" '
            f'stroke-width="{width}" fill="none" stroke-linecap="round" opacity="{opacity}" filter="url(#{glow})"/>')


def seg(p, q, width=3.0, opacity=1.0, glow="glow", colour="#E2BE6A"):
    """A straight line. Solid: an objectBoundingBox gradient on a vertical or level line has no box and draws nothing."""
    return (f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" stroke="{colour}" '
            f'stroke-width="{width}" stroke-linecap="round" opacity="{opacity}" filter="url(#{glow})"/>')


def svg(inner):
    return f'<svg class="abs" style="left:0;top:0" width="1080" height="1920" viewBox="0 0 1080 1920">{SVG_DEFS}{inner}</svg>'


def text_band(top=1250, bottom=1650, k=0.80):
    return (f'<div class="band" style="top:{top}px;height:{bottom - top}px;background:linear-gradient(180deg, '
            f'rgba(4,11,22,0) 0%, rgba(4,11,22,{k}) 28%, rgba(4,11,22,{k}) 72%, rgba(4,11,22,0) 100%)"></div>')


def eyebrow(top, text):
    return f'<div class="eyebrow" style="top:{top}px"><i></i><span>{text}</span><i class="r"></i></div>'


# ------------------------------------------------------------------ SF1 · the night, and the property
px_, py_ = orbit["property"]
body = f"""
<img class="bg" src="{url(S / 'final/orbit-1080.png')}">
{say(286, words("Every property comes with<br> *three questions.*"), 74)}
<div class="beam" style="left:{px_}px;top:{py_ - 200}px;height:200px"></div>
{pin(px_, py_)}
<div class="label" style="right:{1080 - px_ + 34}px;top:{py_ - 9}px">14 Wattle Grove</div>
"""
page("sf1", body)


# ------------------------------------------------------------------ SF1b · the dive: the city, and the pin
Pq = cityq["property"]
body = f"""
<img class="bg" src="{url(S / 'final/city-q-1080.png')}">
<div class="band" style="top:0;height:1920px;background:radial-gradient(ellipse 40% 22% at {Pq[0] / 10.8:.1f}% {Pq[1] / 19.2:.1f}%, rgba(4,11,22,0), rgba(4,11,22,.35) 100%)"></div>
<div class="beam" style="left:{Pq[0]}px;top:{Pq[1] - 230}px;height:230px"></div>
{pin(*Pq)}
<div class="label" style="left:{Pq[0] + 34}px;top:{Pq[1] - 30}px;font-size:22px">14 Wattle Grove</div>
<div class="label" style="left:{Pq[0] + 34}px;top:{Pq[1] + 2}px;font-size:16px;color:#c9d3e0">Banksia Rise NSW 2155</div>
"""
page("sf1b", body)


# ------------------------------------------------------------------ SF2–SF4 · the three questions
P = cityq["property"]
O = [cityq["offices"][k] for k in OFF]
BULGE = (-0.16, 0.16, 0.10)


def question_frame(name, n, film, line, win_html, win_box, tether_x, size=80):
    spokes = "".join(arc(P, O[i], BULGE[i], 3.0 if i == n else 2.2, 1.0 if i == n else 0.45) for i in range(n + 1))
    x, y, w, h = win_box
    tether = seg((O[n][0], O[n][1] - 16), (tether_x, y + h), 2.0, 0.9, "glow")
    pins = "".join(pin(*O[i], "office" + ("" if i == n else " dim")) for i in range(n + 1))
    nums = "".join(
        f'<div class="num" style="left:{O[i][0] + (22 if i != 0 else -52)}px;top:{O[i][1] + 10}px;opacity:{1 if i == n else .6}">0{i + 1}</div>'
        for i in range(n + 1))
    lines = line.count("<br>") + 1
    say_top = 1372 if lines == 1 else 1360
    body = f"""
<img class="bg" src="{url(S / 'final/city-q-1080.png')}" style="filter:brightness(.92)">
<div class="band" style="top:0;height:900px;background:radial-gradient(ellipse 70% 50% at 50% 34%, rgba(4,11,22,.55), rgba(4,11,22,0) 75%)"></div>
{text_band(1240, 1660, 0.82)}
{svg(spokes + tether)}
{pins}{nums}
{pin(*P)}
<div class="label" style="left:{P[0] + 30}px;top:{P[1] - 34}px;font-size:16px">14 Wattle Grove</div>
<div class="win" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">{win_html}</div>
{eyebrow(1306, film)}
{say(say_top, words(line), size)}
"""
    page(name, body)


# SF2: Film 1. The floor plan of 14 Wattle Grove, as Film 1 draws it, in gold.
w1 = (O[0][0] - 2, 300, 540, 470)
question_frame(
    "sf2", 0, "Film 1 · The system", "Is it *right* for them?",
    f"""<div class="cap">14 Wattle Grove</div><div class="cap" style="left:auto;right:26px">Floor plan</div><div class="rule"></div>
<img src="{url(OUT / 'plan-gold.png')}" style="position:absolute;left:{(540 - 380) // 2}px;top:72px;width:380px;height:380px;opacity:.95">""",
    w1, w1[0] + 2)

# SF3: Film 2. The Compliance Passport's cover.
pw, ph = 300, 414
w2 = (O[1][0] - 360 + 2, 280, 360, 500)
question_frame(
    "sf3", 1, "Film 2 · The Compliance Passport", "Are they *who they say*<br> they are?",
    f"""<div class="cap">Passport</div><div class="tag">Demo workspace</div><div class="rule"></div>
<img src="{url(A / 'r2-pp-cmd-cover.png')}"
  style="position:absolute;left:{(360 - pw) // 2}px;top:70px;width:{pw}px;height:{ph}px;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.6)">""",
    w2, w2[0] + w2[2] - 2, 76)

# SF4: Film 3. The Borrowing Capacity card, the pointer waiting on Calculate Capacity.
cw = 820
ch = round(cw * 630 / 2280)
w3 = (round(O[2][0] - 440), 400, 880, 340)
bx = 30 + cw * 1290 / 2280  # the pointer's tip: on the button's label (card px 1290, 425)
by_ = 84 + ch * 425 / 630
question_frame(
    "sf4", 2, "Film 3 · Borrowing Capacity", "Can they *afford* it?",
    f"""<div class="cap">Jordan Ellis</div><div class="tag">Demo workspace</div><div class="rule"></div>
<img src="{url(A / 'r3-bc-card-empty.png')}" style="position:absolute;left:30px;top:84px;width:{cw}px;height:{ch}px;border-radius:12px">
<svg style="position:absolute;left:{bx:.0f}px;top:{by_:.0f}px" width="30" height="40" viewBox="0 0 30 40"><path d="M2 2 L2 30 L9 23 L14 35 L19 33 L14 21 L24 21 Z" fill="#fff" stroke="#0b1424" stroke-width="2" stroke-linejoin="round"/></svg>
""",
    w3, w3[0] + w3[2] // 2)

# ------------------------------------------------------------------ SF5 · the shape
P5 = city["property"]
O5 = [city["offices"][k] for k in OFF]
edges = "".join(seg(O5[i], O5[(i + 1) % 3], 4.2, 1.0, "bigglow", "#F0CD78") for i in range(3))
spokes = "".join(arc(P5, O5[i], BULGE[i], 2.0, 0.55) for i in range(3))
tri_pts = " ".join(f"{o[0]:.1f},{o[1]:.1f}" for o in O5)
fill = (f'<defs><radialGradient id="tfill" gradientUnits="userSpaceOnUse" cx="{P5[0]:.1f}" cy="{P5[1]:.1f}" r="420">'
        '<stop offset="0" stop-color="#f5d17a" stop-opacity=".16"/><stop offset="1" stop-color="#c89b3c" stop-opacity=".03"/>'
        f'</radialGradient></defs><polygon points="{tri_pts}" fill="url(#tfill)"/>')
body = f"""
<img class="bg" src="{url(S / 'final/city-1080.png')}" style="filter:brightness(.6) saturate(.9)">
{svg(fill + spokes + edges)}
{"".join(pin(*o, "office") for o in O5)}
{"".join(f'<div class="num" style="font-size:22px;left:{o[0] + (24 if i != 0 else -62)}px;top:{o[1] + 14}px">0{i + 1}</div>' for i, o in enumerate(O5))}
<div class="beam" style="left:{P5[0]}px;top:{P5[1] - 150}px;height:150px"></div>
{pin(*P5)}
"""
page("sf5", body)

# ------------------------------------------------------------------ SF6–SF8 · the answer, the titles, the brand
K6 = 1.0
OX6, OY6 = 540 - EM_APEX[0] * K6, 430 - EM_APEX[1] * K6


def at6(p, k=K6, ox=OX6, oy=OY6):
    return (ox + p[0] * k, oy + p[1] * k)


ART_MASK = ("-webkit-mask-image:radial-gradient(ellipse 52% 50% at 50% 50%, #000 64%, transparent 100%);"
            "mask-image:radial-gradient(ellipse 52% 50% at 50% 50%, #000 64%, transparent 100%)")


def art(src, k, ox, oy, extra=""):
    return (f'<img src="{url(src)}" style="position:absolute;left:{ox:.1f}px;top:{oy:.1f}px;width:{ART_W * k:.1f}px;'
            f'height:{ART_H * k:.1f}px;mix-blend-mode:screen;{ART_MASK};{extra}">')


ground = f'<img class="bg" src="{url(OUT / "city-perspective.png")}" style="mix-blend-mode:screen;opacity:.9">'
a6, l6, r6, o6 = at6(EM_APEX), at6(EM_BL), at6(EM_BR), at6(EM_ORB)
tri6 = seg(a6, l6, 3.2, 0.9, "bigglow") + seg(l6, r6, 3.2, 0.9, "bigglow") + seg(r6, a6, 3.2, 0.9, "bigglow")
trail = (f'<div class="abs" style="left:{o6[0] - 1.5:.1f}px;top:{o6[1]:.1f}px;width:3px;height:{1250 - o6[1]:.1f}px;'
         'background:linear-gradient(180deg, rgba(255,240,205,.95), rgba(245,209,122,.35) 45%, rgba(245,209,122,0));'
         'filter:blur(.6px)"></div>')
body = f"""
{ground}
{art(A / 'logo-clean.png', K6, OX6, OY6, 'opacity:.78')}
{trail}
{svg(tri6)}
<div class="abs" style="left:{o6[0] - 60:.1f}px;top:{o6[1] - 60:.1f}px;width:120px;height:120px;border-radius:50%;
  background:radial-gradient(circle, rgba(255,250,235,.95) 0%, rgba(245,209,122,.55) 22%, rgba(245,209,122,0) 62%)"></div>
"""
page("sf6", body)

body = f"""
{ground.replace('opacity:.9', 'opacity:.55')}
{art(A / 'logo-clean.png', K6, OX6, OY6, 'opacity:.58')}
{text_band(1150, 1700, 0.72)}
{say(1196, words("Three *questions.*"), 84)}
{say(1300, words("Three *films.*"), 84)}
{say(1404, words("One *system.*"), 84)}
"""
page("sf7", body)

K8 = 0.78
OX8, OY8 = 540 - EM_APEX[0] * K8, 390 - EM_APEX[1] * K8
wm_bottom = OY8 + (WORDMARK[1] + WORDMARK[3]) * K8
body = f"""
{ground.replace('opacity:.9', 'opacity:.38')}
{art(A / 'logo-art.png', K8, OX8, OY8)}
{text_band(int(wm_bottom) - 10, 1640, 0.7)}
<div class="say" style="top:{wm_bottom + 70:.0f}px;font-size:46px;line-height:1.25">{words("The operating system for<br> modern property professionals.")}</div>
<div class="abs" style="left:484px;top:{wm_bottom + 222:.0f}px;width:112px;height:2px;background:linear-gradient(90deg, rgba(200,155,60,0), #c89b3c 22%, #d7b35f 50%, #c89b3c 78%, rgba(200,155,60,0))"></div>
{eyebrow(int(wm_bottom + 262), "Three films · Watch now")}
<div class="abs" style="left:0;right:0;top:{wm_bottom + 330:.0f}px;text-align:center;font:400 26px/1 'INTER';color:#9fb0c6;letter-spacing:.02em">aurixasystems.com.au</div>
"""
page("sf8", body)
print("pages written:", sorted(p.name for p in OUT.glob("sf*.html")))
