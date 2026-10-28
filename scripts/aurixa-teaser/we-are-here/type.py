#!/usr/bin/env python3
"""We Are Here's words, as a page for type.cjs to photograph frame by frame with nothing behind them, for comp.py to
lay over the picture (type.js: window.setT(seconds) shows that instant).

  python3 -I scripts/aurixa-teaser/we-are-here/type.py <work files dir>      # writes we-are-here/type/type.html

Every spoken word rises as it is heard, so the teaser reads with the sound off: As One's lines, word for word, in its
styles (Playfair Display, the turn of each line in italic with its hairline), set low in the frame over a soft shade,
where a phone's own buttons do not reach. The turn of each line is in the system's electric cyan (space.CYAN), which
stands out over the gold land where the brand's gold did not. One line is not set low: "Research, clients, reports,
finance, communication." Each of those five words names a box of glass that comes in about the core as it is said,
joined by a line of light to its tier's ring (comp.py --labels writes where each ring is, frame by frame, to
type/labels.json; run it first). type/boxes.json says where each box stands, for comp.py's frosted glass.

Nothing in the film is a generated scene, so it carries no label for one: the space, the land and the light are drawn
in code, and the emblem is the supplied art.
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FPS = 24

W = Path(sys.argv[1]).resolve()
OUT = W / "we-are-here" / "type"
OUT.mkdir(parents=True, exist_ok=True)
FONTS = W / "fonts"
cues = json.loads((W / "sound-as-one/cues.json").read_text())


def url(p):
    return "file://" + str(Path(p).resolve())


FONT_CSS = f"""
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500.ttf")}'); font-weight:500; font-style:normal; }}
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500-italic.ttf")}'); font-weight:500; font-style:italic; }}
@font-face {{ font-family:"MONO"; src:url('{url(FONTS / "inconsolata-700.ttf")}'); font-weight:700; }}
@font-face {{ font-family:"MONO4"; src:url('{url(FONTS / "inconsolata-400.ttf")}'); font-weight:400; }}
"""
CSS = FONT_CSS + """
* { box-sizing:border-box; }
html, body { margin:0; width:1080px; height:1920px; background:transparent; overflow:hidden; }
.frame { position:relative; width:1080px; height:1920px; overflow:hidden; }
.shade { position:absolute; left:0; right:0; top:900px; height:1020px; opacity:0; pointer-events:none;
  background:linear-gradient(180deg, rgba(2,5,12,0) 0%, rgba(2,5,12,.36) 26%, rgba(2,5,12,.5) 44%, rgba(2,5,12,.44) 62%, rgba(2,5,12,.3) 100%); }
.say { position:absolute; left:64px; right:64px; text-align:center; font:500 70px/1.14 "PF", serif; letter-spacing:-.012em; visibility:hidden;
  filter:drop-shadow(0 2px 16px rgba(2,6,14,.7)) drop-shadow(0 1px 2px rgba(2,6,14,.45)); }
.say .w { display:inline-block; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #ffffff 8%, #c6cedb 68%, #ffffff); padding:.06em .1em .14em; margin:-.06em -.1em -.14em; opacity:0; }
.say .em { position:relative; display:inline-block; white-space:nowrap; }
.say .em .w { font-style:italic; background-image:linear-gradient(180deg, #adf9ff 6%, #3ce6ff 52%, #00bde8 82%, #6febff 100%); }
.say .ul { position:absolute; left:.06em; right:.06em; bottom:.04em; height:2px; transform-origin:0 50%; transform:scaleX(0);
  background:linear-gradient(90deg, #00bde8, #3ce6ff 60%, rgba(60,230,255,.15)); }
#net { position:absolute; left:0; top:0; overflow:visible; }
.box { position:absolute; left:0; top:0; width:300px; height:232px; opacity:0; will-change:transform, opacity; }
.box .glass { position:absolute; inset:0; border-radius:26px;
  background:linear-gradient(155deg, rgba(22,58,90,.70) 0%, rgba(9,24,44,.62) 52%, rgba(6,14,28,.70) 100%);
  border:1.5px solid rgba(60,232,255,.58);
  box-shadow:0 1px 0 rgba(255,255,255,.20) inset, 0 0 0 1px rgba(255,255,255,.04) inset, 0 24px 54px rgba(0,0,0,.45),
    0 0 36px rgba(0,231,255,.24); }
.box .glass::after { content:""; position:absolute; inset:0; border-radius:26px;
  background:linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,0) 36%); }
.box .head { position:absolute; left:22px; top:19px; right:22px; height:32px; display:flex; align-items:center; gap:12px; }
.box .head svg { width:28px; height:28px; overflow:visible; }
.box .name { font:700 22px/1 "MONO", monospace; letter-spacing:.16em; color:#e2fdff; white-space:nowrap;
  text-shadow:0 0 12px rgba(0,231,255,.6); }
.box .live { position:absolute; right:22px; top:30px; width:9px; height:9px; border-radius:50%; background:#3ce6ff;
  box-shadow:0 0 10px 3px rgba(0,231,255,.75); }
.box .rule { position:absolute; left:22px; right:22px; top:62px; height:1px; transform-origin:0 50%;
  background:linear-gradient(90deg, rgba(60,232,255,.75), rgba(60,232,255,.06)); }
.box .vis { position:absolute; left:16px; top:72px; width:268px; height:150px; overflow:visible; }
.ln { fill:none; stroke:#3ce6ff; stroke-width:1.6; stroke-linecap:round; }
.faint { fill:none; stroke:rgba(60,232,255,.30); stroke-width:1.2; }
.hot { fill:#e9feff; }
.cy { fill:#3ce6ff; }
"""


def words_html(line_text, block_id, start_k=0):
    """The words of a line, each its own span (block_id-w<i>); *phrase* is the cyan italic one, with its hairline."""
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


# The words on screen: As One's lines, word for word, set low. Each block: its text, its top, its size, the sentence
# it is spoken in, and that sentence's first word it shows (s2 and s7 are shown a clause at a time).
BLOCKS = [
    ("b1", "The next generation of <br> property professionals <br> will operate *differently.*", 1168, 68, "s1", 0),
    ("b2a", "Not because they'll use <br> *more software,*", 1222, 68, "s2", 0),
    ("b2b", "not because they'll have <br> *more dashboards,*", 1222, 68, "s2", 6),
    ("b2c", "and not because <br> *AI became another tab.*", 1222, 68, "s2", 12),
    ("b3", "At a certain level of ambition, <br> *the question changes.*", 1226, 64, "s3", 0),
    ("b5", "*Powerful* on their own.", 1262, 72, "s5", 0),
    ("b6", "More valuable when they <br> stop behaving like <br> *separate destinations.*", 1172, 64, "s6", 0),
    ("b7a", "When *intelligence* can move,", 1186, 62, "s7", 0),
    ("b7b", "when *context* can follow,", 1266, 62, "s7", 4),
    ("b7c", "when the business <br> can *act as one.*", 1226, 62, "s7", 8),
    ("b8", "So don't ask what <br> *the next tool* is.", 1222, 68, "s8", 0),
    ("b9", "Ask what happens when <br> the business becomes <br> *the system.*", 1172, 64, "s9", 0),
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

# The five tiers' names, as they are said: the spoken words, in the labels' capitals.
labels = json.loads((OUT / "labels.json").read_text())
said = [w["text"].strip(".,").lower() for w in lines["s4"]["words"]]
if said != [n.lower() for n in labels["names"]]:
    raise SystemExit(f"tiers: named {labels['names']}, spoken {said}")


# The five tiers, each a box of glass that comes in on its word and shows, in motion, what it does: research a sweep
# that finds what it looks for, clients a constellation of people joined to one, reports pages that gather into one
# with its chart, finance a line of growth over its bars, communication messages back and forth. A line of light joins
# each to its own ring (type/labels.json: the point of the ring toward its box, frame by frame), and as each comes in
# it is joined to the boxes beside it, until the five stand about the core as one network, pulses running all of it.
# On "Powerful on their own" the lines let go and the boxes drift apart, each on its own. They are set about the core
# as a pentagon, communication at its head, inside the frame a phone's buttons leave clear.
BOX_W, BOX_H, BOX_R = 300, 232, 26
BOX_SCALE = 1.12  # drawn at 300 x 232 and set a little larger, so their names read on a phone
BOX_AT = [(210, 640), (870, 640), (260, 1420), (820, 1420), (540, 360)]  # research, clients, reports, finance, comm.
EDGES = [(0, 2), (2, 3), (3, 1), (1, 4), (4, 0)]  # the pentagon: each box to those beside it


def ease_out(x):
    return 1 - (1 - x) ** 3


def lin(t, a, b):
    return min(1.0, max(0.0, (t - a) / (b - a)))


def ss(t, a, b):
    x = lin(t, a, b)
    return x * x * (3 - 2 * x)


names_t = [w["start"] for w in lines["s4"]["words"]]
powerful = lines["s5"]["words"][0]["start"]


def box_state(i, t):
    """Box i at t: its centre on the frame, its scale and how far it shows (0 to 1)."""
    t_in = names_t[i] - 0.06
    out = ss(t, powerful - 0.26, powerful + 0.06)
    o = ease_out(lin(t, t_in, t_in + 0.38)) * (1 - out)
    s_ = BOX_SCALE * (0.86 + 0.14 * ease_out(lin(t, t_in, t_in + 0.5)))
    cx, cy = BOX_AT[i]
    dx, dy = cx - 540.0, cy - 1010.0
    d = (dx * dx + dy * dy) ** 0.5
    return [round(cx + 40 * out * dx / d, 2), round(cy + 40 * out * dy / d, 2), round(s_, 4), round(o, 4)]


b_first, b_last = int((names_t[0] - 0.3) * FPS), int((powerful + 0.2) * FPS) + 1
boxes = {"w": BOX_W, "h": BOX_H, "r": BOX_R, "first": b_first, "last": b_last, "names": labels["names"],
         "start": names_t, "out": powerful, "edges": EDGES,
         "frames": {str(n): [box_state(i, n / FPS) for i in range(5)] for n in range(b_first, b_last + 1)}}
(OUT / "boxes.json").write_text(json.dumps(boxes))  # comp.py lays frosted glass under each, where it is

ICONS = [
    '<circle cx="11" cy="11" r="7" class="ln"/><path d="M16.5 16.5 L23 23" class="ln"/>',
    '<circle cx="9" cy="8" r="4" class="ln"/><path d="M2 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5" class="ln"/>'
    '<circle cx="18" cy="9" r="3" class="ln"/><path d="M17 14.5c3 0 5.5 1.8 5.5 5" class="ln"/>',
    '<path d="M6 2.5h9l5 5V22H6z" class="ln"/><path d="M15 2.5V7.5h5" class="ln"/><path d="M9 13h8M9 17h6" class="ln"/>',
    '<path d="M3 20h19" class="ln"/><path d="M4 16l5-5 4 3 7-8" class="ln"/><path d="M16 6h4v4" class="ln"/>',
    '<path d="M3.5 4.5h17v11h-10l-5 4v-4h-2z" class="ln"/><circle cx="8.5" cy="10" r="1.2" class="cy"/>'
    '<circle cx="12" cy="10" r="1.2" class="cy"/><circle cx="15.5" cy="10" r="1.2" class="cy"/>',
]


def research_vis():
    dots = []
    for yy in range(8, 150, 12):
        for xx in range(14, 262, 12):
            d = ((xx - 134) ** 2 + (yy - 75) ** 2) ** 0.5
            a = max(0.0, 1 - d / 150) * 0.55
            if a > 0.03:
                dots.append(f'<circle cx="{xx}" cy="{yy}" r="1.1" class="cy" opacity="{a:.2f}"/>')
    wedges = []
    for k in range(7):  # the sweep's trail, fading behind its edge
        a0, a1 = -7.0 * (k + 1), -7.0 * k
        x0, y0 = 68 * math.cos(math.radians(a0)), 68 * math.sin(math.radians(a0))
        x1, y1 = 68 * math.cos(math.radians(a1)), 68 * math.sin(math.radians(a1))
        wedges.append(f'<path d="M0 0L{x0:.1f} {y0:.1f}A68 68 0 0 1 {x1:.1f} {y1:.1f}Z" class="cy" '
                      f'opacity="{0.34 * (1 - k / 7):.3f}"/>')
    blips = [(50, 20), (30, 75), (60, 130), (40, 200), (58, 250), (22, 300), (48, 335), (64, 95)]
    bl = "".join(f'<g id="b0-blip{k}" opacity="0"><circle r="3.4" class="hot"/><circle r="9" class="ln" '
                 f'id="b0-blipr{k}" opacity=".7"/></g>' for k in range(len(blips)))
    return (f'{"".join(dots)}<g transform="translate(134,75)"><circle r="22" class="faint"/><circle r="44" class="faint"/>'
            f'<circle r="66" class="faint"/><path d="M-70 0H70M0 -70V70" class="faint"/>'
            f'<g id="b0-sweep">{"".join(wedges)}<path d="M0 0L68 0" class="ln" stroke-width="2.2"/></g>{bl}</g>'), blips


def clients_vis():
    nodes = []
    for k, (ang, r) in enumerate(zip(range(15, 375, 51), [58, 50, 62, 54, 60, 48, 56])):
        nodes.append((r * 1.62 * math.cos(math.radians(ang)), r * 0.98 * math.sin(math.radians(ang))))
    links = "".join(f'<path id="b1-l{k}" d="M0 0L{x:.1f} {y:.1f}" class="ln" opacity=".85"/>' for k, (x, y) in enumerate(nodes))
    sat = "".join(f'<path id="b1-s{k}" d="M{x:.1f} {y:.1f}L{nodes[(k + 1) % 7][0]:.1f} {nodes[(k + 1) % 7][1]:.1f}" '
                  f'class="faint"/>' for k, (x, y) in enumerate(nodes))
    nd = "".join(f'<g id="b1-n{k}" transform="translate({x:.1f},{y:.1f})" opacity="0"><circle r="8" class="ln"/>'
                 f'<circle r="2.8" class="hot"/></g>' for k, (x, y) in enumerate(nodes))
    pulses = "".join(f'<circle id="b1-p{k}" r="2.4" class="hot" opacity="0"/>' for k in range(7))
    centre = ('<circle r="21" class="ln" stroke-width="2"/><circle cx="0" cy="-5" r="5.5" class="ln"/>'
              '<path d="M-10 11c0-6 4.5-8.5 10-8.5s10 2.5 10 8.5" class="ln"/>')
    return f'<g transform="translate(134,76)"><g id="b1-rot">{sat}{links}{pulses}{nd}<g id="b1-c">{centre}</g></g></g>', nodes


def reports_vis():
    lines_ = "".join(f'<rect id="b2-t{k}" x="11" y="{27 + 9 * k}" width="{w}" height="4" rx="2" class="cy" opacity=".55"/>'
                     for k, w in enumerate([62, 54, 60, 44]))
    bars = "".join(f'<rect id="b2-c{k}" x="{13 + 13 * k}" y="{106 - h}" width="8" height="{h}" rx="1.5" class="cy"/>'
                   for k, h in enumerate([14, 22, 18, 30, 38]))
    page = ('<rect width="88" height="116" rx="7" fill="rgba(220,250,255,.10)" stroke="#3ce6ff" stroke-width="1.6"/>'
            '<path d="M70 0 L88 18" class="faint"/><rect x="11" y="11" width="46" height="7" rx="2" class="hot" opacity=".9"/>'
            f'{lines_}{bars}')
    back = ('<rect width="88" height="116" rx="7" fill="rgba(220,250,255,.05)" stroke="rgba(60,232,255,.45)" stroke-width="1.4"/>')
    ring = ('<circle r="27" class="faint" stroke-width="3"/><circle id="b2-ring" r="27" class="ln" stroke-width="3.2" '
            'transform="rotate(-90)" stroke-dasharray="169.6" stroke-dashoffset="169.6"/>'
            '<path id="b2-check" d="M-11 1 L-3 9 L12 -8" class="ln" stroke-width="3.4" stroke-dasharray="34" '
            'stroke-dashoffset="34"/>')
    return (f'<g transform="translate(58,16)"><g id="b2-p2" opacity="0">{back}</g><g id="b2-p1" opacity="0">{back}</g>'
            f'<g id="b2-front" opacity="0">{page}</g></g><g transform="translate(214,74)">{ring}</g>')


def finance_vis():
    pts = [(14, 120), (44, 108), (74, 113), (104, 90), (134, 96), (164, 70), (194, 62), (222, 40), (252, 26)]
    d = f"M{pts[0][0]} {pts[0][1]}"
    for k in range(len(pts) - 1):  # through every point, smoothly (Catmull-Rom as cubic Beziers)
        p0, p1, p2, p3 = pts[max(k - 1, 0)], pts[k], pts[k + 1], pts[min(k + 2, len(pts) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]} {p2[1]}"
    grid = "".join(f'<path d="M8 {y}H260" class="faint" opacity=".55"/>' for y in (34, 68, 102, 136))
    bars = "".join(f'<rect id="b3-bar{k}" x="{20 + 30 * k}" y="{136 - h}" width="14" height="{h}" rx="2" class="cy" '
                   f'opacity=".26"/>' for k, h in enumerate([26, 34, 30, 50, 46, 66, 74, 92]))
    return (f'<defs><linearGradient id="b3-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ce6ff" '
            f'stop-opacity=".42"/><stop offset="1" stop-color="#3ce6ff" stop-opacity="0"/></linearGradient></defs>'
            f'{grid}{bars}<path id="b3-area" d="{d} L252 136 L14 136 Z" fill="url(#b3-fill)" opacity="0"/>'
            f'<path id="b3-line" d="{d}" class="ln" stroke-width="3.2"/><g id="b3-head" opacity="0"><circle r="5" class="hot"/>'
            f'<circle r="11" class="ln" opacity=".6"/></g>'
            f'<g transform="translate(232,112)"><circle r="17" class="faint" stroke-width="3"/><circle id="b3-gauge" r="17" '
            f'class="ln" stroke-width="3.2" transform="rotate(-90)" stroke-dasharray="106.8" stroke-dashoffset="106.8"/></g>')


def comm_vis():
    def bubble(i, x, y, w, h, mine):
        fill = "rgba(60,232,255,.88)" if mine else "rgba(220,250,255,.10)"
        ink = "rgba(5,20,34,.75)" if mine else "rgba(60,232,255,.75)"
        tail = (f'<path d="M{w - 14} {h - 2} L{w + 2} {h + 8} L{w - 26} {h - 2}" fill="{fill}"/>' if mine
                else f'<path d="M14 {h - 2} L-2 {h + 8} L26 {h - 2}" fill="{fill}"/>')
        return (f'<g id="b4-m{i}" transform="translate({x},{y})" opacity="0"><rect width="{w}" height="{h}" rx="{h / 2:.0f}" '
                f'fill="{fill}" stroke="rgba(60,232,255,.75)" stroke-width="1.3"/>{tail}'
                f'<rect x="16" y="{h / 2 - 7:.0f}" width="{w * 0.62:.0f}" height="4" rx="2" fill="{ink}"/>'
                f'<rect x="16" y="{h / 2 + 2:.0f}" width="{w * 0.4:.0f}" height="4" rx="2" fill="{ink}"/></g>')
    dots = "".join(f'<circle id="b4-d{k}" cx="{12 + 11 * k}" cy="12" r="3.6" class="cy"/>' for k in range(3))
    return (bubble(0, 6, 6, 150, 36, False) + f'<g id="b4-typing" transform="translate(178,62)" opacity="0">'
            f'<rect width="56" height="24" rx="12" fill="rgba(220,250,255,.10)" stroke="rgba(60,232,255,.6)"/>{dots}</g>'
            + bubble(1, 100, 56, 156, 36, True) + bubble(2, 6, 106, 124, 34, False))


r_vis, BLIPS = research_vis()
c_vis, NODES = clients_vis()
VIS = [r_vis, c_vis, reports_vis(), finance_vis(), comm_vis()]
boxes_html = "".join(
    f'<div class="box" id="box{i}"><div class="glass"></div><div class="head"><svg viewBox="0 0 24 24">{ICONS[i]}</svg>'
    f'<span class="name">{name}</span></div><i class="live" id="box{i}-live"></i><i class="rule" id="box{i}-rule"></i>'
    f'<svg class="vis" viewBox="0 0 268 150">{VIS[i]}</svg></div>'
    for i, name in enumerate(labels["names"]))
net_html = ('<svg id="net" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><filter id="glow" x="-50%" y="-50%" '
            'width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/>'
            '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#glow)">'
            + "".join(f'<path id="c{i}" class="ln" stroke-width="2.2" opacity="0"/>' for i in range(5))
            + "".join(f'<path id="e{k}" class="ln" stroke-width="1.8" opacity="0"/>' for k in range(len(EDGES)))
            + "".join(f'<circle id="a{i}" r="6" class="hot" opacity="0"/>' for i in range(5))
            + "".join(f'<circle id="q{j}" r="4.2" class="hot" opacity="0"/>' for j in range(40))
            + '</g></svg>')
DATA = {"cues": cues, "blocks": blocks, "labels": labels, "dropFrame": round(cues["drop"] * FPS) / FPS,
        "fps": FPS, "boxes": boxes, "blips": BLIPS, "nodes": [[round(x, 1), round(y, 1)] for x, y in NODES]}
page = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="frame" id="frame">
  <div class="shade" id="shade"></div>
  {net_html}
  {boxes_html}
  {''.join(blocks_html)}
</div>
<script>window.DATA = {json.dumps(DATA)};</script>
<script src="{url(HERE / 'type.js')}"></script>
</body></html>"""
(OUT / "type.html").write_text(page)
print(json.dumps({"page": str(OUT / "type.html"), "blocks": len(BLOCKS), "boxes": len(labels["names"])}))
