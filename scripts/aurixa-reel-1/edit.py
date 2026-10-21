"""Lays Reel 1 out in the studio's Editor as a draft edit (create_edit), from one take of every clip.

  python3 scripts/aurixa-reel-1/edit.py plan [--take cinema-take1]          # prints the timeline; nothing is saved
  python3 scripts/aurixa-reel-1/edit.py create [--take cinema-take1]        # saves it as a new draft edit, then styles its captions
  python3 scripts/aurixa-reel-1/edit.py create --trim V-11A=0.4             # a clip's window moved (seconds later; negative earlier)

The picture track is the spec's 26 shots on the voiceover's clock (spec.json shots[].edit), cut from 24 clips: 07A
is cut from the 06B take and 14A from the 13A take, each straight after the shot before, as one passage. A clip is
made a little longer than its shots (about 0.75 s each end), so its shots sit in the middle of it unless --trim moves
them. 11A cuts to the Demo workspace page (PL-11A-c) for its last moment, as the spec says that cut is made in the
edit. The Block 14 phrases and the closing card are laid over the picture as full-frame pictures (their plates are
transparent 1080 x 1920), the voiceover is the only sound, and the captions are the spec's, set in the brand kit's
fonts and colours (the kit's own end card isn't used). The edit is saved with its id in edit.json.
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import studio

FPS = 30
# Where 11A cuts to the Demo workspace (on the voiceover's clock): after the click, on "free trial", so the page
# holds into 12A's match on the Residence 014 tile.
DEMO_CUT = 81.6
RECORD = studio.SPEC_DIR / "edit.json"


def frames(seconds):
    return round(seconds * FPS) / FPS


def source_clip(shot):
    """The clip a shot is cut from: its own, or (07A, 14A) the take it is cut from."""
    source = shot["source"]
    return source if source.startswith("V-") else f"V-{source.removeprefix('cut from the ').removesuffix(' take')}"


def layout(take_name, nudges):
    spec = studio.load("spec.json")
    ledger = studio.load("assets.json")
    takes = studio.load_takes()
    clips = {item["key"]: item for item in next(s for s in spec["stages"] if s["stage"] == 5)["items"]}
    shots = spec["shots"]

    # Each clip's file and its length (as the library measured it).
    files, missing = {}, []
    for key in clips:
        take = takes.get(key, {}).get(take_name)
        if not take or take.get("status") != "completed" or not take.get("assets"):
            missing.append(key)
            continue
        asset = studio.call("get_asset", {"assetId": take["assets"][0]})
        files[key] = {"assetId": asset["id"], "seconds": float(asset["duration_seconds"] or clips[key]["seconds"]),
                      "fps": asset.get("fps")}
    if missing:
        sys.exit(f"No completed {take_name} for {', '.join(missing)}")

    # Where each shot starts inside its clip: the clip's shots in the middle of it, then any nudge.
    starts = {}
    for key in clips:
        group = [shot for shot in shots if source_clip(shot) == key]
        used = sum(shot["edit"]["seconds"] for shot in group)
        at = max(0.0, (files[key]["seconds"] - used) / 2 + nudges.get(key, 0.0))
        at = min(at, max(0.0, files[key]["seconds"] - used))
        for shot in group:
            starts[shot["shot"]] = frames(at)
            at += shot["edit"]["seconds"]

    picture = []
    for shot in shots:
        key = source_clip(shot)
        start, end = shot["edit"]["in"], shot["edit"]["out"]
        label = f"{shot['shot']} · {key}" + ("" if shot["source"] == key else f" ({shot['source']})")
        piece = {"id": f"shot-{shot['shot']}", "assetId": files[key]["assetId"], "kind": "video",
                 "trimStart": starts[shot["shot"]], "duration": frames(end - start), "volume": 0,
                 "sourceDuration": files[key]["seconds"], "label": label}
        if shot["shot"] == "11A":
            piece["duration"] = frames(DEMO_CUT - start)
            picture.append(piece)
            picture.append({"id": "shot-11A-demo", "assetId": ledger["PL-11A-c"], "kind": "image", "trimStart": 0,
                            "duration": frames(end - DEMO_CUT), "fit": "blur_pad", "motion": "zoom_in",
                            "label": "11A · the Demo workspace (PL-11A-c), cut in the edit"})
            continue
        picture.append(piece)

    edit = spec["edit"]
    images = [{"id": f"phrase-{n}", "assetId": ledger[f"PL-14A-{n}"], "start": phrase["start"], "end": phrase["end"],
               "x": 0.5, "y": 0.5, "width": 1.0, "opacity": 1, "fade": 0.2, "label": f"14A · {phrase['text']}"}
              for n, phrase in enumerate(edit["overlays"], 1)]
    card = edit["end_card"]
    images.append({"id": "closing-card", "assetId": ledger[card["plate"]], "start": card["from"], "end": card["to"],
                   "x": 0.5, "y": 0.5, "width": 1.0, "opacity": 1, "fade": 0, "label": "15A · the closing card (PL-15A)"})

    timeline = {
        "version": 1, "aspectRatio": "9:16", "resolution": "1080p", "fps": FPS, "fit": "cover",
        "clips": picture,
        "audio": [{"id": "voiceover", "assetId": spec["voiceover"]["asset_id"], "role": "voiceover", "start": 0,
                   "trimStart": 0, "duration": None, "volume": 1, "duck": False, "label": "Voiceover"}],
        "captions": {"enabled": True, "style": "clean", "position": "lower_third", "size": 1, "uppercase": False,
                     "segments": [{"start": c["start"], "end": c["end"], "text": c["text"]} for c in edit["captions"]]},
        "overlays": [],
        "images": images,
        "fadeIn": 0, "fadeOut": 0, "normalizeLoudness": True,
        # The clips are silent (made without sound); the voiceover is the only track.
        "mix": {"picture": {"level": 1, "muted": True}, "voiceover": {"level": 1, "muted": False},
                "audio": {"level": 1, "muted": False}},
        # Cinema Studio makes 720p, and not at 30 fps: blended to 30 and sharpened up to 1080p.
        "frameRateConversion": "blend", "upscale": "sharp",
        "safeArea": "reels",
    }
    total = sum(piece["duration"] for piece in picture)
    return timeline, files, total, spec


def show(timeline, files, total, spec):
    print(f"{len(timeline['clips'])} pieces, {total:.3f} s of picture against the voiceover's {spec['voiceover']['seconds']} s")
    at = 0.0
    for piece in timeline["clips"]:
        source = next((f for f in files.values() if f["assetId"] == piece["assetId"]), None)
        tail = f" of {source['seconds']:.2f} s ({source['fps']} fps)" if source else ""
        print(f"  {at:7.3f}  {piece['label']:<44} from {piece['trimStart']:5.2f} for {piece['duration']:.3f}{tail}")
        at += piece["duration"]
    print(f"  {len(timeline['captions']['segments'])} captions; {len(timeline['images'])} pictures over the edit; voiceover from 0")


def create(take_name, nudges):
    timeline, files, total, spec = layout(take_name, nudges)
    show(timeline, files, total, spec)
    if abs(total - spec["voiceover"]["seconds"]) > 0.05:
        sys.exit(f"The picture runs {total:.3f} s, not the voiceover's {spec['voiceover']['seconds']} s")
    title = f"Aurixa Systems · Reel 1 · draft ({take_name}, Cinema Studio 4.0)"
    made = studio.call("create_edit", {"title": title, "timeline": timeline})
    styled = studio.call("apply_brand_kit", {"sequenceId": made["sequenceId"], "expectedVersion": made["version"],
                                             "brandKitId": spec["brand_kit"]["id"], "endCard": None})
    RECORD.write_text(json.dumps({"sequenceId": made["sequenceId"], "version": styled["version"], "title": title,
                                  "take": take_name, "nudges": nudges}, indent=2) + "\n")
    print(f"Saved as a draft edit: {made['sequenceId']} (version {styled['version']}), captions in the brand kit's look")


if __name__ == "__main__":
    command = sys.argv[1]
    take_name = sys.argv[sys.argv.index("--take") + 1] if "--take" in sys.argv else "cinema-take1"
    nudges = {}
    for i, arg in enumerate(sys.argv):
        if arg == "--trim":
            key, _, value = sys.argv[i + 1].partition("=")
            nudges[key] = float(value)
    if command == "plan":
        show(*layout(take_name, nudges))
    elif command == "create":
        create(take_name, nudges)
