"""Renders docs/brands/aurixa-reel-1/README.md from spec.json."""
import json, sys
from pathlib import Path

spec = json.load(open(sys.argv[1]))
out = Path(sys.argv[2])
st = {s["stage"]: s for s in spec["stages"]}
L = []
w = L.append

def ts(t):
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:06.3f}"

w(f"# {spec['title']}: generation spec")
w("")
w("A plan only: nothing in it has been generated. It was built from the 47-page prompt pack (Final Cinematic Edition, Revision 2).")
w("Every still and clip in [`spec.json`](spec.json) is ready to queue: its model, parameters, prompt, and inputs in order.")
w("")
w("**How the keys work.** An input is named by a key: `P` and `D` are the property image and floor plan; `C-…` is a cast sheet; `S-…` is a set; `UP-…` is an upload; `F-…-in` and `F-…-out` are a shot's first and last frames; `V-…` is a clip.")
w("A key becomes a library asset id once its stage is approved. The ids are recorded in [`assets.json`](assets.json), which a rebuild only adds keys to.")
w("Each prompt names its inputs as \"image 1\", \"image 2\" and so on, in the order sent. That's why cast sheets go in as explicit inputs, never as `characterIds`, which would add images in an order of their own.")
w("")
w("**Models.**")
w("- **Stills:** GPT Image 2.5 Sunburst (the studio's *Marketing Studio 2.5 Sunburst*, and its *Image edit*), at 2K, quality High, with Preset mode off.")
w("- **Clips:** first and last frame to video, silent, 1080p. The test on 01A and 04B decides between *Seedance 2.5 (Image to video)* and *Kling 3.0 Pro (Image to video)*.")
w("- **Brand kit:** not passed to any generation. " + spec["brand_kit"]["why"])
w("")
w("## Timing: measured from the recording")
w("")
w(f"The pack's cue times are proportional estimates. These are measured instead, from the voiceover's {spec['voiceover']['timed_from']}. " + spec["timing"]["method"])
w("Speech ends at 105.88 s and the file at 106.031 s.")
w("")
w("| Cue | Measured | Pack | Drift | Words |")
w("|---|---|---|---|---|")
for c in spec["timing"]["cues"]:
    w(f"| {c['n']:02d} | {ts(c['start'])} | {ts(c['pack_estimate'])} | {c['drift']:+.2f} s | {c['text']} |")
w("")
w("| Shot | In | Out | Edit s | Source clip | Clip s | Cast | Set |")
w("|---|---|---|---|---|---|---|---|")
clips = {c["key"]: c for c in st[5]["items"]}
for s in spec["shots"]:
    e = s["edit"]
    clip = clips.get(s["source"])
    w(f"| {s['shot']} | {ts(e['in'])} | {ts(e['out'])} | {e['seconds']:.2f} | {s['source']} | {clip['seconds'] if clip else '–'} | {', '.join(c.title() for c in s['cast']) or '–'} | {s.get('set') or '–'} |")
w("")
w("06B and 07A are one take, cut at the narration boundary, and so are 13A and 14A. Each clip runs `ceil(edit + 1.5)` seconds (at least 4), which leaves handles at both ends.")
w("")

w("## Stage 1: lock the look")
w("")
w(st[1]["gate"] + " Three takes of each, two of the plan.")
w("")
for item in st[1]["items"]:
    p = item["parameters"]
    w(f"### {item['key']} · {item['title']} ({p['aspect_ratio']})")
    w("")
    w(f"Used by: {item['used_by']}." + (f" {item['note']}" if item.get("note") else ""))
    w("")
    w("> " + p["prompt"])
    w("")

w("## Stage 2: sets")
w("")
w("Empty rooms with every screen a blank glowing panel. Each Aurixa-world set is drawn from `image(9)` and `image(10)` once they're uploaded.")
w("")
w("| Set | Model | Inputs | Used by |")
w("|---|---|---|---|")
for item in st[2]["items"]:
    w(f"| {item['key']} · {item['title']} | {spec['models'][item['model']]['name']} | {', '.join(item['inputs']) or '–'} | {', '.join(item['used_by'])} |")
w("")

w("## Stage 3: screen plates (typeset, never generated)")
w("")
w("Every readable screen, sign, phrase and the end card is typeset in Aurixa's palette (navy `#0A192F`/`#10233D`, gold `#C89B3C`, teal `#00A8B5`, selection blue `#1238E8`, white).")
w("The type is Playfair Display for headings and Plus Jakarta Sans for interface text, as on the portals; the Builder / Developer portal adds JetBrains Mono for its labels. Plates are composited in the edit, and the generic problem-scene plates carry no Aurixa branding.")
w("")
w("| Plate | Shot | Kind | What | Text |")
w("|---|---|---|---|---|")
for item in st[3]["items"]:
    w(f"| {item['key']} | {item['shots']} | {item['kind']} | {item['title']} | {' · '.join(item['text'])} |")
w("")

w("## Stage 4: shot frames")
w("")
w(st[4]["gate"] + " Two takes of each.")
w("")
w("| Frame | Inputs, in order |")
w("|---|---|")
for item in st[4]["items"]:
    w(f"| {item['key']} | {', '.join(item['inputs'])} |")
w("")

w("## Stage 5: clips")
w("")
w(st[5]["gate"])
w("")
w("| Clip | Shot | First frame | Last frame | Edit s | Clip s |")
w("|---|---|---|---|---|---|")
for c in st[5]["items"]:
    w(f"| {c['key']} | {c['shot']} | {c['first_frame']} | {c['last_frame'] or '–'} | {c['edit_seconds']:.2f} | {c['seconds']} |")
w("")
w("Handoffs (the pack's transition ledger, by shot):")
w("")
for s in spec["shots"]:
    w(f"- **{s['shot']}**: {s['handoff']}")
w("")

w("## The edit")
w("")
for rule in spec["edit"]["rules"]:
    w(f"- {rule}")
w(f"- The end card ({spec['edit']['end_card']['plate']}) runs from {ts(spec['edit']['end_card']['from'])} to {ts(spec['edit']['end_card']['to'])}. {spec['edit']['end_card']['note']}")
w("")
w("| Start | End | Caption |")
w("|---|---|---|")
for c in spec["edit"]["captions"]:
    w(f"| {ts(c['start'])} | {ts(c['end'])} | {c['text']} |")
for o in spec["edit"]["overlays"]:
    w(f"| {ts(o['start'])} | {ts(o['end'])} | *Overlay:* {o['text']} |")
w("")

w("## Still needed")
w("")
for u in spec["uploads_needed"]:
    w(f"- **{u['key']}**: {u['what']}")
w("")
w("Decisions:")
w("")
for d in spec["decisions"]:
    w(f"- {d}")
w("")
out.write_text("\n".join(L))
print(len(L), "lines")
