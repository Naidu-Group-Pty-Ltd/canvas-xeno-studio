#!/usr/bin/env python3
"""We Are Here's words, as a page for type.cjs to photograph frame by frame with nothing behind them, for comp.py to
lay over the picture (type.js: window.setT(seconds) shows that instant).

  python3 -I scripts/aurixa-teaser/we-are-here/type.py <work files dir>      # writes we-are-here/type/type.html

Every spoken word rises as it is heard, so the teaser reads with the sound off: As One's lines, word for word, in its
styles (Playfair Display, the turn of each line in italic with its hairline), set low in the frame over a soft shade,
where a phone's own buttons do not reach. The turn and the tiers' names are in the system's electric cyan (space.CYAN,
#00E7FF), which stands out over the gold land where the brand's gold did not. One line is not set low: "Research,
clients, reports, finance, communication." Each of those five words is set where its tier is, on its ring about the
core, as it is said (comp.py --labels writes where, frame by frame, to type/labels.json; run it first).

Nothing in the film is a generated scene, so it carries no label for one: the space, the land and the light are drawn
in code, and the emblem is the supplied art.
"""
import json
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
.tier { position:absolute; left:0; top:0; opacity:0; will-change:transform; }
.tier .dot { position:absolute; left:-5px; top:-5px; width:10px; height:10px; border-radius:50%; background:#c8fbff;
  box-shadow:0 0 10px 3px rgba(0,231,255,.55); }
.tier .rule { position:absolute; height:1px; background:linear-gradient(90deg, rgba(0,231,255,.95), rgba(0,231,255,.25)); }
.tier .name { position:absolute; white-space:nowrap; font:700 30px/1 "MONO", monospace; color:#3ce6ff;
  text-shadow:0 1px 12px rgba(2,6,14,.95), 0 0 2px rgba(2,6,14,.8); }
.tier.left .rule { left:-56px; top:0; width:50px; transform:scaleX(-1); }
.tier.left .name { right:66px; top:-15px; text-align:right; }
.tier.right .rule { left:6px; top:0; width:50px; }
.tier.right .name { left:66px; top:-15px; }
.tier.down .rule { left:0; top:6px; width:1px; height:40px; background:linear-gradient(180deg, rgba(0,231,255,.95), rgba(0,231,255,.25)); }
.tier.down .name { left:0; top:56px; transform:translateX(-50%); }
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

# The five tiers' names, where their tiers are, as they are said: the spoken words, in the labels' capitals.
labels = json.loads((OUT / "labels.json").read_text())
said = [w["text"].strip(".,").lower() for w in lines["s4"]["words"]]
if said != [n.lower() for n in labels["names"]]:
    raise SystemExit(f"tiers: named {labels['names']}, spoken {said}")


def side(dx, dy):
    """Where a name sits from its point: beyond it, on the side of the frame its tier faces."""
    return "down" if dy > 0.7 else ("left" if dx < 0 else "right")


row0 = labels["frames"][str(labels["first"])]
tiers_html = "".join(
    f'<div class="tier {side(row[3], row[4])}" id="tier{i}"><i class="dot"></i><i class="rule"></i>'
    f'<span class="name" id="tier{i}-name">{name}</span></div>'
    for i, (name, row) in enumerate(zip(labels["names"], row0)))
DATA = {"cues": cues, "blocks": blocks, "labels": labels, "dropFrame": round(cues["drop"] * FPS) / FPS,
        "fps": FPS}
page = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="frame" id="frame">
  <div class="shade" id="shade"></div>
  {''.join(blocks_html)}
  {tiers_html}
</div>
<script>window.DATA = {json.dumps(DATA)};</script>
<script src="{url(HERE / 'type.js')}"></script>
</body></html>"""
(OUT / "type.html").write_text(page)
print(json.dumps({"page": str(OUT / "type.html"), "blocks": len(BLOCKS), "tiers": len(labels["names"])}))
