#!/usr/bin/env python3
"""We Are Here's words, as a page for type.cjs to photograph frame by frame with nothing behind them, for comp.py to
lay over the picture (type.js: window.setT(seconds) shows that instant).

  python3 -I scripts/aurixa-teaser/we-are-here/type.py <work files dir>      # writes we-are-here/type/type.html

Every spoken word rises as it is heard, so the teaser reads with the sound off: As One's lines, word for word, in its
styles (Playfair Display, the turn of each line in gold italic with its hairline), set low in the frame over a soft
shade, where a phone's own buttons do not reach. Over the five worlds, each one's name marks its chapter, and the five
bands carry theirs. "Scenes created with AI" stays in the top-left corner throughout: the scenes are realistic, and
the brand labels them.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # run with -I: edit.py is beside it
from edit import BANDS, CUT, FPS  # noqa: E402

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
.say .em .w { font-style:italic; background-image:linear-gradient(180deg, #f5d17a 6%, #d7b35f 52%, #c89b3c 82%, #e6c36e 100%); }
.say .ul { position:absolute; left:.06em; right:.06em; bottom:.04em; height:2px; transform-origin:0 50%; transform:scaleX(0);
  background:linear-gradient(90deg, #c89b3c, #d7b35f 60%, rgba(215,179,95,.15)); }
.ai { position:absolute; left:46px; top:50px; font:400 23px/1 "MONO4", monospace; letter-spacing:.06em; color:rgba(236,242,250,.8);
  text-shadow:0 1px 10px rgba(2,6,14,.85); }
.chapter { position:absolute; left:0; right:0; top:150px; text-align:center; opacity:0; text-shadow:0 1px 14px rgba(2,6,14,.85); }
.chapter .n { font:400 22px/1 "MONO4", monospace; letter-spacing:.3em; color:rgba(245,209,122,.78); padding-left:.3em; }
.chapter .rule { width:46px; height:1px; margin:16px auto 17px; background:linear-gradient(90deg, rgba(245,209,122,0), #f5d17a, rgba(245,209,122,0)); }
.chapter .name { font:700 31px/1 "MONO", monospace; letter-spacing:.42em; color:#f5d17a; padding-left:.42em; }
.band { position:absolute; top:182px; text-align:center; opacity:0; text-shadow:0 1px 10px rgba(2,6,14,.95); }
.band .n { font:400 17px/1 "MONO4", monospace; letter-spacing:.24em; color:rgba(245,209,122,.8); padding-left:.24em; }
.band .rule { width:26px; height:1px; margin:10px auto 11px; background:#d7b35f; opacity:.85; }
.band .name { font:700 17px/1 "MONO", monospace; letter-spacing:.2em; color:#f5d17a; padding-left:.2em; white-space:nowrap; }
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


# The words on screen: As One's lines, word for word, set low. Each block: its text, its top, its size, the sentence
# it is spoken in, and that sentence's first word it shows (s2 and s7 are shown a clause at a time).
BLOCKS = [
    ("b1", "The next generation of <br> property professionals <br> will operate *differently.*", 1168, 68, "s1", 0),
    ("b2a", "Not because they'll use <br> *more software,*", 1222, 68, "s2", 0),
    ("b2b", "not because they'll have <br> *more dashboards,*", 1222, 68, "s2", 6),
    ("b2c", "and not because <br> *AI became another tab.*", 1222, 68, "s2", 12),
    ("b3", "At a certain level of ambition, <br> *the question changes.*", 1226, 64, "s3", 0),
    ("b4", "Research, clients, reports, <br> finance, *communication.*", 1226, 64, "s4", 0),
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

# The five worlds' chapters (each from its cut to the next), and the five bands' marks.
NAMES = ["RESEARCH", "CLIENTS", "REPORTS", "FINANCE", "COMMUNICATION"]
KEYS = ["research", "clients", "reports", "finance", "comms"]
chapters = []
for i, (name, key) in enumerate(zip(NAMES, KEYS)):
    a = CUT[key] / FPS
    b = (CUT[KEYS[i + 1]] if i < 4 else CUT["bands"]) / FPS
    chapters.append({"id": f"ch{i}", "a": a, "b": b})
chapters_html = "".join(
    f'<div class="chapter" id="ch{i}"><div class="n">{i + 1:02d}</div><div class="rule"></div><div class="name">{name}</div></div>'
    for i, name in enumerate(NAMES))
bands_html = "".join(
    f'<div class="band" id="bd{i}" style="left:{s["x0"]}px;width:{s["x1"] - s["x0"]}px"><div class="n">{i + 1:02d}</div>'
    f'<div class="rule"></div><div class="name">{name}</div></div>'
    for i, (name, s) in enumerate(zip(NAMES, BANDS["strips"])))

# The drop's frame: "Powerful on their own." goes with the frame the drop lands in.
DATA = {"cues": cues, "blocks": blocks, "chapters": chapters, "bands": {"a": CUT["bands"] / FPS, "drop": cues["drop"],
        "dropFrame": CUT["drop"] / FPS, "close": BANDS["close"] / FPS}, "fps": FPS}
page = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="frame" id="frame">
  <div class="shade" id="shade"></div>
  {''.join(blocks_html)}
  {chapters_html}
  {bands_html}
  <div class="ai" id="ai">Scenes created with AI</div>
</div>
<script>window.DATA = {json.dumps(DATA)};</script>
<script src="{url(HERE / 'type.js')}"></script>
</body></html>"""
(OUT / "type.html").write_text(page)
print(json.dumps({"page": str(OUT / "type.html"), "blocks": len(BLOCKS), "chapters": len(chapters)}))
