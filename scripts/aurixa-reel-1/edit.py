"""Lays Reel 1 out in the studio's Editor as a draft edit (create_edit), from one take of every clip.

  python3 scripts/aurixa-reel-1/edit.py plan [--take cinema-take1] [--stand-ins]   # prints the timeline; nothing is saved
  python3 scripts/aurixa-reel-1/edit.py save [--take cinema-take1] [--stand-ins]   # saves it as a draft edit (the same one again
                                                                                    # once edit.json names it), captions styled
  python3 scripts/aurixa-reel-1/edit.py save --trim V-11A=0.4                       # a clip's window moved (seconds later)

The picture track is the spec's 26 shots on the voiceover's clock (spec.json shots[].edit), cut from 24 clips: 07A
is cut from the 06B take and 14A from the 13A take, each straight after the shot before, as one passage. A clip is
made a little longer than its shots (about 0.75 s each end), so its shots sit in the middle of it unless --trim moves
them. 11A cuts to the Demo workspace page (PL-11A-c) for its last moment, as the spec says that cut is made in the
edit. The Block 14 phrases and the closing card are laid over the picture as full-frame pictures (their plates are
transparent 1080 x 1920), the voiceover is the only sound, and the captions are the spec's, set in the brand kit's
fonts and colours (the kit's own end card isn't used). The edit is saved with its id in edit.json. ADJUST records
where a take's shots sit when the middle of it is wrong, and why; --stand-ins holds a clip not made yet in its place
with its approved frame (a slow push-in, labelled STAND-IN), so the draft can be watched end to end meanwhile.
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
# Where a take's shots sit when the middle of it is wrong, read off that take (cinema-take1): the second into the
# clip its first shot starts at, and a speed where the shot must end sooner in the source. Measured, not guessed:
# the times are where the take's screen changes, found frame by frame.
ADJUST = {
    "cinema-take1": {
        "V-03A": {"start": 0.0, "speed": 0.88,
                  "why": "the screen's card turns from Floor plan received to Floor plan confirmed at 3.0 s, which no frame asks for; "
                         "the shot plays its first 2.93 s a little slower, which a nearly still shot doesn't show"},
        "V-03B": {"start": 1.0, "why": "the message becomes a document at 3.83 s, which no frame asks for; the shot ends at 3.6 s"},
        "V-05B": {"start": 0.25, "why": "Jamie clicks at 0.54 s, before the middle of the take; the shot starts just before the click"},
        "V-06B": {"start": 2.1, "why": "the Aurixa Agent opens at 6.6 s rather than on the first click, so 06B and 07A sit as late in "
                                     "the take as it allows and 07A carries 2.4 s of the agent"},
    },
}


def frames(seconds):
    return round(seconds * FPS) / FPS


def source_clip(shot):
    """The clip a shot is cut from: its own, or (07A, 14A) the take it is cut from."""
    source = shot["source"]
    return source if source.startswith("V-") else f"V-{source.removeprefix('cut from the ').removesuffix(' take')}"


def layout(take_name, nudges, stand_ins=False):
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
    if missing and not stand_ins:
        sys.exit(f"No completed {take_name} for {', '.join(missing)} (--stand-ins holds their places with their frames)")

    # Where each shot starts inside its clip: the clip's shots in the middle of it, or where ADJUST puts them, then
    # any nudge; a speed below 1 uses less of the source.
    starts, speeds = {}, {}
    adjust = ADJUST.get(take_name, {})
    for key in files:
        group = [shot for shot in shots if source_clip(shot) == key]
        speed = adjust.get(key, {}).get("speed", 1.0)
        used = sum(shot["edit"]["seconds"] for shot in group) * speed
        at = adjust[key]["start"] if "start" in adjust.get(key, {}) else (files[key]["seconds"] - used) / 2
        at = min(max(0.0, at + nudges.get(key, 0.0)), max(0.0, files[key]["seconds"] - used))
        for shot in group:
            starts[shot["shot"]], speeds[shot["shot"]] = frames(at), speed
            at += shot["edit"]["seconds"] * speed

    picture = []
    for shot in shots:
        key = source_clip(shot)
        start, end = shot["edit"]["in"], shot["edit"]["out"]
        label = f"{shot['shot']} · {key}" + ("" if shot["source"] == key else f" ({shot['source']})")
        if key in files:
            piece = {"id": f"shot-{shot['shot']}", "assetId": files[key]["assetId"], "kind": "video",
                     "trimStart": starts[shot["shot"]], "duration": frames(end - start), "speed": speeds[shot["shot"]],
                     "volume": 0, "sourceDuration": files[key]["seconds"], "label": label}
        else:
            # No clip yet: its approved frame holds the place (the last frame for a shot cut later from the take).
            item = clips[key]
            later = shot["source"] != key and item.get("last_frame")
            frame = item["last_frame"] if later else item["first_frame"]
            piece = {"id": f"shot-{shot['shot']}", "assetId": ledger[frame], "kind": "image", "trimStart": 0,
                     "duration": frames(end - start), "motion": "zoom_in",
                     "label": f"STAND-IN {shot['shot']} · {key} not made yet: its frame {frame}"}
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
    return timeline, files, total, spec, missing


def show(timeline, files, total, spec, missing=()):
    print(f"{len(timeline['clips'])} pieces, {total:.3f} s of picture against the voiceover's {spec['voiceover']['seconds']} s")
    at = 0.0
    for piece in timeline["clips"]:
        source = next((f for f in files.values() if f["assetId"] == piece["assetId"]), None)
        tail = f" of {source['seconds']:.2f} s ({source['fps']} fps)" if source else ""
        speed = f" at {piece['speed']}x" if piece.get("speed", 1) != 1 else ""
        print(f"  {at:7.3f}  {piece['label']:<44} from {piece['trimStart']:5.2f} for {piece['duration']:.3f}{speed}{tail}")
        at += piece["duration"]
    print(f"  {len(timeline['captions']['segments'])} captions; {len(timeline['images'])} pictures over the edit; voiceover from 0")


def save(take_name, nudges, stand_ins):
    """A new draft edit, or (once edit.json names one) the same edit at its next version, so its link stays the same."""
    timeline, files, total, spec, missing = layout(take_name, nudges, stand_ins)
    show(timeline, files, total, spec, missing)
    if abs(total - spec["voiceover"]["seconds"]) > 0.05:
        sys.exit(f"The picture runs {total:.3f} s, not the voiceover's {spec['voiceover']['seconds']} s")
    title = f"Aurixa Systems · Reel 1 · draft ({take_name}, Cinema Studio 4.0)" + (f" · {len(missing)} clips to come" if missing else "")
    known = json.loads(RECORD.read_text()) if RECORD.exists() else None
    if known:
        current = studio.call("get_edit", {"sequenceId": known["sequenceId"]})
        made = studio.call("update_edit", {"sequenceId": known["sequenceId"], "expectedVersion": current["version"],
                                           "title": title, "timeline": timeline})
    else:
        made = studio.call("create_edit", {"title": title, "timeline": timeline})
    styled = studio.call("apply_brand_kit", {"sequenceId": made["sequenceId"], "expectedVersion": made["version"],
                                             "brandKitId": spec["brand_kit"]["id"], "endCard": None})
    RECORD.write_text(json.dumps({"sequenceId": made["sequenceId"], "version": styled["version"], "title": title,
                                  "take": take_name, "stand_ins": missing, "adjust": ADJUST.get(take_name, {}),
                                  "nudges": nudges}, indent=2) + "\n")
    print(f"Saved as a draft edit: {made['sequenceId']} (version {styled['version']}), captions in the brand kit's look"
          + (f"; stand-ins for {', '.join(missing)}" if missing else ""))


if __name__ == "__main__":
    command = sys.argv[1]
    take_name = sys.argv[sys.argv.index("--take") + 1] if "--take" in sys.argv else "cinema-take1"
    nudges = {}
    for i, arg in enumerate(sys.argv):
        if arg == "--trim":
            key, _, value = sys.argv[i + 1].partition("=")
            nudges[key] = float(value)
    stand_ins = "--stand-ins" in sys.argv
    if command == "plan":
        show(*layout(take_name, nudges, stand_ins))
    elif command == "save":
        save(take_name, nudges, stand_ins)
