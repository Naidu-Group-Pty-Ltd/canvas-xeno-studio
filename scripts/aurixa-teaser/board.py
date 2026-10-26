#!/usr/bin/env python3
"""The teaser's storyboard: its nine beats, each with its style frame, its time, what we see, hear and read.

  python3 -I scripts/aurixa-teaser/board.py <render dir> <fonts dir>

The beats are the script's (docs/brands/aurixa-teaser/script.json), the frames frames.py's, photographed by
shoot.cjs. Writes frames/board.html in the render dir, for shoot_board.cjs to photograph whole."""
import html
import json
import sys
from pathlib import Path

S, FONTS = Path(sys.argv[1]), Path(sys.argv[2])
SCRIPT = Path(__file__).resolve().parents[2] / "docs/brands/aurixa-teaser/script.json"
script = json.loads(SCRIPT.read_text())


def url(p):
    return "file://" + str(Path(p).resolve())


def t(x):
    m, s = divmod(x, 60)
    whole, frac = int(s), round(s - int(s), 2)
    return f"{int(m)}:{whole:02d}" + (f"{frac:.2f}".lstrip("0").rstrip("0") if frac else "")


def emph(s):
    out, inside = [], False
    for part in html.escape(s).split("*"):
        out.append(f"<em>{part}</em>" if inside and part else part)
        inside = not inside
    return "".join(out)


cells = []
for b in script["beats"]:
    voice = " ".join(f"“{html.escape(v)}” <span class='at'>{t(at)}</span>" for v, at in b["voice"]) or "<span class='none'>No voice</span>"
    cells.append(f"""
<div class="cell">
  <img src="{url(S / 'frames' / (b['frame'] + '.png'))}">
  <div class="head"><span class="n">{b['n']:02d}</span><span class="name">{html.escape(b['name'])}</span>
    <span class="time">{t(b['start'])}–{t(b['end'])} · bars {b['bars']}</span></div>
  <p class="pic">{html.escape(b['picture'])}</p>
  <p class="voice"><b>Voice</b> {voice}</p>
  <p class="screen"><b>On screen</b> {emph(b['screen'])}</p>
  <p class="sound"><b>Sound</b> {html.escape(b['sound'])}</p>
</div>""")

page = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500.ttf")}'); font-weight:500; }}
@font-face {{ font-family:"PF"; src:url('{url(FONTS / "playfair-display-500-italic.ttf")}'); font-weight:500; font-style:italic; }}
@font-face {{ font-family:"MONO"; src:url('{url(FONTS / "inconsolata-700.ttf")}'); font-weight:700; }}
@font-face {{ font-family:"INTER"; src:url('{url("/usr/share/fonts/opentype/inter/Inter-Regular.otf")}'); font-weight:400; }}
@font-face {{ font-family:"INTER"; src:url('{url("/usr/share/fonts/opentype/inter/Inter-SemiBold.otf")}'); font-weight:600; }}
* {{ box-sizing:border-box; }}
html, body {{ margin:0; background:#040B16; color:#dfe6ef; width:1500px; }}
.sheet {{ padding:56px 54px 60px; }}
.eyebrow {{ font:700 20px/1 "MONO"; letter-spacing:.28em; color:#D7B35F; text-transform:uppercase; }}
h1 {{ font:500 64px/1.1 "PF"; margin:14px 0 10px; color:#fff; letter-spacing:-.01em; }}
h1 em {{ color:#E2BE6A; }}
.sub {{ font:400 21px/1.5 "INTER"; color:#9fb0c6; max-width:1250px; }}
.grid {{ display:grid; grid-template-columns:repeat(3, 1fr); gap:40px 36px; margin-top:44px; }}
.cell img {{ width:100%; aspect-ratio:9/16; display:block; border-radius:14px; border:1px solid rgba(215,179,95,.35); }}
.head {{ display:flex; align-items:baseline; gap:12px; margin:16px 0 8px; flex-wrap:wrap; }}
.n {{ font:700 20px/1 "MONO"; color:#F5D17A; letter-spacing:.12em; }}
.name {{ font:500 30px/1.1 "PF"; color:#fff; }}
.time {{ font:700 15px/1 "MONO"; color:#9fb0c6; letter-spacing:.14em; margin-left:auto; }}
p {{ margin:0 0 8px; font:400 16.5px/1.5 "INTER"; color:#c9d3e0; }}
p b {{ font:700 13px/1 "MONO"; letter-spacing:.2em; text-transform:uppercase; color:#D7B35F; margin-right:6px; }}
.voice {{ font:italic 500 19px/1.45 "PF"; color:#fff; }}
.voice .at {{ font:700 13px/1 "MONO"; color:#9fb0c6; letter-spacing:.1em; font-style:normal; }}
.voice .none {{ font:400 16px "INTER"; color:#7d8ca1; font-style:normal; }}
em {{ font-family:"PF"; font-style:italic; color:#E2BE6A; }}
.foot {{ margin-top:40px; font:400 15px/1.6 "INTER"; color:#7d8ca1; border-top:1px solid rgba(215,179,95,.25); padding-top:18px; }}
</style></head><body><div class="sheet">
<div class="eyebrow">Aurixa Systems · Teaser · Storyboard · 26 October 2026</div>
<h1>Three <em>Questions</em></h1>
<div class="sub">35 seconds, 9:16. One property, three questions, three films, one system. Each question is one of the films; the
answer is the brand. The style frames are drawn in code: the night views from public map data, the windows from the films' own
objects, the logo the supplied art. Nothing here is generated yet.</div>
<div class="grid">{''.join(cells)}</div>
<div class="foot">Map data: GeoNames (CC BY 4.0) for where people live; GSHHG shorelines (Wessel and Smith); NASA Blue Marble,
Natural Earth relief and NOAA GLOBE land mask (public domain) for the Earth from orbit. The streets are drawn from where people
live, not traced from any map, and no street or suburb is named on screen except the films' own fictional address. Product
screens carry DEMO WORKSPACE, as in the films.</div>
</div></body></html>"""
(S / "frames" / "board.html").write_text(page)
print("board.html written")
