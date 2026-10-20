"""Builds the Reel 1 generation spec, docs/brands/aurixa-reel-1/spec.json (see this folder's README).

Everything here is a plan: nothing is generated. Each still and clip names its model, its
parameters, its inputs in order (by key: an anchor, a cast sheet, a set, an upload, an earlier
frame) and its prompt. Keys become library asset ids as each stage is approved: those are kept
in assets.json beside the spec, which a rebuild only adds new keys to.
"""
import json, math, sys
from pathlib import Path

OUT = Path(sys.argv[1])
timing = json.load(open(sys.argv[2]))
SHOT_TIME = {s["shot"]: s for s in timing["shots"]}

# ------------------------------------------------------------------ models
MODELS = {
    "still": {
        "id": "1fd1046f-7f88-509f-b01f-545fd09b6718",
        "name": "Marketing Studio 2.5 Sunburst",
        "is": "GPT Image 2.5 Sunburst (OpenAI, the ChatGPT image model), text to image",
        "role": "reference",
    },
    "still_edit": {
        "id": "58a71f70-c94e-5427-a6a4-2b94350a3b1e",
        "name": "Marketing Studio 2.5 Sunburst (Image edit)",
        "is": "GPT Image 2.5 Sunburst, from up to 16 reference images",
        "role": "reference",
    },
    "clip_seedance": {
        "id": "a12e4ad6-7b6e-4d55-b152-fbee51401b41",
        "name": "Seedance 2.5 (Image to video)",
        "parameters": {"resolution": "1080p", "generate_audio": False, "bitrate_mode": "high"},
        "roles": {"first": "source", "last": "last_frame"},
        "seconds": [4, 30],
    },
    "clip_kling": {
        "id": "69c83597-2e87-59cc-b4a1-a3b6cbce6648",
        "name": "Kling 3.0 Pro (Image to video)",
        "parameters": {"sound": "off", "cfg_scale": 0.5},
        "roles": {"first": "source", "last": "last_frame"},
        "seconds": [3, 15],
    },
}
STILL = {"resolution": "2k", "quality": "high", "enhance_prompt": False, "moderation": "auto"}

# ------------------------------------------------------------------ shared wording
COMMON = (
    "Photorealistic cinematic film still from a premium Australian commercial, vertical 9:16. "
    "Natural skin texture, visible eyes, believable hands with five fingers, stable furniture, glass and screen geometry. "
    "Keep the important subject inside the central safe area (the middle 80% of the width, between 10% and 80% of the height). "
    "No text, letters, numbers, logos, watermarks, signage or interface anywhere in the image."
)
SCREEN_NAVY = "its screen is a flat, evenly lit, softly glowing deep-navy blank panel with clean bezel edges and no content at all"
SCREEN_LIGHT = "its screen is a flat, evenly lit, softly glowing pale grey-white blank panel with clean bezel edges and no content at all"

LOOK = {
    "street": "Warm late-afternoon Australian sunlight on light brick and timber, detailed navy-toned shade, bright natural window reflections without clipping, clear sky with light haze. 35 mm environmental lens look.",
    "home": "A warm, natural home interior in late afternoon: soft warm key light on the face and hands, a small gold practical lamp and its subtle reflection, warm timber; the laptop screen is the brightest area. 50 mm lens look.",
    "office": "An ordinary contemporary Australian office in cool, neutral afternoon daylight: generic, unbranded, believable equipment; face and hands softly and naturally lit; screens crisp and bright. 50 mm lens look. This is not the Aurixa world: no navy architecture, no gold frames.",
    "aurixa": "The Aurixa world: deep navy architecture (#0A192F, shadows #040B16), full-sized glass workplaces with fine gold-edged frames and mullions, panel-navy console surfaces (#10233D), blue-hour city glow beyond the glass. A soft neutral-to-warm key light on faces and hands with a restrained teal or blue edge light; the active screen is the brightest, most colourful area, about one stop above its surround; glow stays off skin and away from the screen's centre. Restrained 35 mm (environment) or 50 mm (people at work) lens look.",
}

CAST = {
    "ALEX": "Alex Morgan, a woman in her late 30s with shoulder-length dark brown hair, a navy tailored jacket over an ivory blouse and a calm manner, exactly as in her character sheet",
    "JORDAN": "Jordan Ellis, a man in his late 30s with short curly dark hair and a light blue open-collar shirt, exactly as in his character sheet",
    "JAMIE": "Jamie Chen, a woman in her early 40s with a straight dark bob, a teal blouse and a navy jacket, exactly as in her character sheet",
    "PRIYA": "Priya Shah, a woman in her 40s with tied-back dark hair, a charcoal jacket and a pale blouse, exactly as in her character sheet",
    "DANIEL": "Daniel Reed, a man in his late 40s with short greying hair and a navy polo shirt, exactly as in his character sheet",
    "MIA": "Mia Patel, a woman in her early 40s with dark hair, subtle thin-framed glasses and a slate-blue blouse, exactly as in her character sheet",
}

# What each input key is, for the "image N is …" line.
REF_LABEL = {
    "P": "the Residence 014 property photograph (the one property image; keep its design exactly)",
    "D": "the Residence 014 floor plan (keep it identical)",
    "C-ALEX": "Alex Morgan's character sheet",
    "C-JORDAN": "Jordan Ellis's character sheet",
    "C-JAMIE": "Jamie Chen's character sheet",
    "C-PRIYA": "Priya Shah's character sheet",
    "C-DANIEL": "Daniel Reed's character sheet",
    "C-MIA": "Mia Patel's character sheet",
    "UP-CONSOLE-9": "the Aurixa glass-console world reference (supplied image 9)",
    "UP-CONSOLE-10": "the Aurixa glass-console world reference (supplied image 10)",
}


def refs_line(refs):
    parts = []
    for n, key in enumerate(refs, 1):
        label = REF_LABEL.get(key)
        if not label and key.startswith("S-"):
            label = f"the set: {SETS[key]['title']} (keep its room, furniture, light direction and materials)"
        if not label and key.startswith("F-"):
            label = f"the approved frame {key[2:]} (match it exactly where this shot continues it)"
        parts.append(f"image {n} is {label}")
    return ("Reference images, in order: " + "; ".join(parts) + ".") if parts else ""


def compose(refs, body, look):
    text = " ".join(filter(None, [refs_line(refs), body, LOOK[look], COMMON]))
    assert len(text) <= 5000, (body[:60], len(text))
    return text


# ------------------------------------------------------------------ stage 1: look locks
SHEET = (
    "Photographic character reference sheet of one fictional person for a premium Australian property-services film. "
    "Seamless warm mid-grey studio backdrop, soft even key light with gentle fill, natural skin texture and true-to-life colour. "
    "Four views side by side, left to right: full-length standing front view; waist-up three-quarter view; head-and-shoulders profile; "
    "a close-up of both hands resting on a desk. The same face, hair, build and wardrobe in every view. "
    "Calm, competent, relaxed expression, not posing; visible eyes; believable fingers. No jewellery or watch. "
    "No text, labels, logos or watermarks. The person: "
)
PEOPLE = [
    ("C-ALEX", "Alex Morgan", "Property professional and main guide", "a woman in her late 30s with shoulder-length dark brown hair, wearing a navy tailored jacket over an ivory blouse, with slim charcoal trousers and dark low-heeled shoes."),
    ("C-JORDAN", "Jordan Ellis", "Prospective client", "a man in his late 30s with short curly dark hair, wearing a light blue open-collar shirt, with dark chinos and brown leather shoes."),
    ("C-JAMIE", "Jamie Chen", "Finance professional", "a woman in her early 40s with a straight dark bob, wearing a teal blouse and a navy jacket, with navy trousers."),
    ("C-PRIYA", "Priya Shah", "Solicitor", "a woman in her 40s with tied-back dark hair, wearing a charcoal jacket and a pale blouse, with charcoal trousers."),
    ("C-DANIEL", "Daniel Reed", "Builder and developer representative", "a man in his late 40s with short greying hair, wearing a navy polo shirt, with grey work trousers and work boots."),
    ("C-MIA", "Mia Patel", "Accountant", "a woman in her early 40s with dark hair and subtle thin-framed glasses, wearing a slate-blue blouse, with dark trousers."),
]
stage1 = [
    {
        "key": "P",
        "title": "Residence 014: the one property image",
        "model": "still",
        "parameters": {**STILL, "aspect_ratio": "9:16", "prompt": (
            "Photorealistic architectural photograph, vertical 9:16. A newly built contemporary two-storey Australian townhouse: "
            "warm light brick, timber detailing, dark metal-framed windows, a small landscaped front garden, and a eucalyptus gum tree at the street edge. "
            "Near-frontal view from human height across a quiet residential street, the facade sitting in the upper-middle of the frame "
            "(its centre near 52% of the width and 42% of the height), with the garden and footpath below. "
            "Warm late-afternoon sunlight on the brick and timber, a trace of warm interior light, bright natural window reflections without clipping, "
            "detailed navy-toned shade. No people, cars, house numbers, letterbox lettering, signs, for-sale boards, prices or text of any kind.")},
        "inputs": [],
        "takes": 3,
        "used_by": "01A's last frame and every later thumbnail, report, dossier and project tile (the P anchor)",
    },
    *[
        {
            "key": key,
            "title": f"{name}: character sheet",
            "model": "still",
            "parameters": {**STILL, "aspect_ratio": "3:2", "prompt": SHEET + line},
            "inputs": [],
            "takes": 3,
            "used_by": role,
            "note": "Trousers and shoes are additions so the full-length view agrees; the pack locks the upper half.",
        }
        for key, name, role, line in PEOPLE
    ],
    {
        "key": "D",
        "title": "Residence 014: the floor plan",
        "model": "still",
        "parameters": {**STILL, "aspect_ratio": "1:1", "prompt": (
            "A crisp fictional architectural floor plan of a two-storey townhouse, ground floor and first floor side by side on a clean white sheet. "
            "Fine dark-navy line work showing walls, doors, windows, stairs and a few furniture outlines. Flat, square-on, evenly lit, "
            "like a high-quality printed plan. No room names, dimensions, numbers, text, logos or north arrow.")},
        "inputs": [],
        "takes": 2,
        "used_by": "12A, 12B and the printed plans in 04A and 12A (the D anchor)",
    },
]

# ------------------------------------------------------------------ stage 2: sets
SETS = {
    "S-HOME": {
        "title": "Jordan's home desk",
        "look": "home",
        "inputs": [],
        "body": "An empty, lived-in Australian home study corner in late afternoon: a timber desk with an open silver laptop facing a chair, "
                "a ceramic cup, a small gold-shaded practical lamp, and a tall window behind with a single warm, gold-lit vertical timber mullion "
                "dividing the glass. Seen at seated eye height, three-quarter from the left. The laptop's screen is a flat, evenly lit, pale blank panel. No people.",
        "used_by": ["01B", "03C"],
    },
    "S-OFFICE": {
        "title": "Alex's ordinary office (before Aurixa)",
        "look": "office",
        "inputs": [],
        "body": "An empty, ordinary contemporary office workstation: a wide monitor on a plain desk, a keyboard and a real mouse, a phone lying at the desk's front edge "
                "beside a printed document, a window to the street with ordinary Australian buildings faintly reflected in the glass. Over-the-shoulder height, "
                "from behind and to the left of the chair. The monitor's screen is a flat, evenly lit, pale grey-white blank panel. No people.",
        "used_by": ["02A", "03A", "03B"],
    },
    "S-ALEX": {
        "title": "Alex's Aurixa glass workspace",
        "look": "aurixa",
        "inputs": ["UP-CONSOLE-9", "UP-CONSOLE-10"],
        "body": "Using the architecture, materials and light of the console-world references: an empty but lived-in, full-sized professional glass workplace. "
                "A gold-edged open doorway on the left of frame leads in; inside, a real console desk with one large monitor, keyboard, mouse and a pale paper document, "
                "a chair turned slightly toward the monitor. Other glass workplaces softly visible beyond, warm-lit. The monitor's screen is a flat, evenly lit, "
                "softly glowing deep-navy blank panel. A blank architectural sign panel on the glass wall where a brand mark will be placed later. No people.",
        "used_by": ["04A", "04B", "05A", "05C", "06B", "07A", "10B", "11A"],
    },
    "S-MEETING": {
        "title": "Meeting table in the Aurixa world",
        "look": "aurixa",
        "inputs": ["UP-CONSOLE-9", "UP-CONSOLE-10"],
        "body": "Using the architecture of the console-world references: a warm, tactile meeting corner inside a glass workplace, a timber table with two chairs side by side, "
                "an open laptop and a physically mounted presentation display at the table's end, a closed paper report folder on the table. Blue-hour glass behind. "
                "The display and laptop screens are flat, evenly lit, pale blank panels. No people.",
        "used_by": ["08B"],
    },
    "S-JAMIE": {
        "title": "Jamie's finance workplace",
        "look": "aurixa",
        "inputs": ["UP-CONSOLE-9", "UP-CONSOLE-10"],
        "body": "Using the architecture of the console-world references: a believable finance workstation inside a glass workplace: a monitor, keyboard, real mouse, "
                "a small notepad and pen beside the keyboard. Gold console edge running vertically at the right of frame. The monitor's screen is a flat, evenly lit, "
                "softly glowing deep-navy blank panel. No people.",
        "used_by": ["05B", "13A", "14A"],
    },
    "S-CLIENT": {
        "title": "Jordan's client workspace (glass module)",
        "look": "aurixa",
        "inputs": ["UP-CONSOLE-9", "UP-CONSOLE-10"],
        "body": "Using the architecture of the console-world references: a full-sized glass workspace furnished for a client: a desk with an open laptop and touchpad, "
                "an adjacent framed glass presentation panel backed by opaque navy, warm lamp light. The laptop's screen is a flat, evenly lit, softly glowing "
                "deep-navy blank panel. No people.",
        "used_by": ["06A"],
    },
    "S-MIA": {
        "title": "Mia's quiet accountant office",
        "look": "aurixa",
        "inputs": ["UP-CONSOLE-9", "UP-CONSOLE-10"],
        "body": "Using the architecture of the console-world references: a quiet accountant's office within a glass workplace: a monitor, mouse and keyboard, "
                "a few pale supporting documents laid beside the screen at a slight angle. The monitor's screen is a flat, evenly lit, softly glowing deep-navy blank panel. No people.",
        "used_by": ["08A"],
    },
    "S-PRIYA": {
        "title": "Priya's solicitor desk (gold-framed glass module)",
        "look": "aurixa",
        "inputs": ["UP-CONSOLE-9", "UP-CONSOLE-10"],
        "body": "Using the architecture of the console-world references: a professional solicitor's desk inside a gold-framed glass module, charcoal and navy depth, "
                "a monitor with a clean bezel, a real mouse, a closed physical property folder on the desk. No courtroom props. The monitor's screen is a flat, "
                "evenly lit, softly glowing pale blank panel. No people.",
        "used_by": ["09A", "09B", "12B", "10A"],
    },
    "S-SITE": {
        "title": "Daniel's site office",
        "look": "aurixa",
        "inputs": [],
        "body": "A believable builder's site office at blue hour: a desk with a monitor and a real mouse, a printed floor plan on the desk beside the mouse, "
                "a safety vest hanging on a wall hook, a window onto a building site in soft dusk light. Navy and teal tones, warm desk light. "
                "The monitor's screen is a flat, evenly lit, softly glowing deep-navy blank panel. No people, no logos or lettering on the vest.",
        "used_by": ["12A"],
    },
    "S-REVEAL": {
        "title": "The occupied consoles (ecosystem reveal)",
        "look": "aurixa",
        "inputs": ["UP-CONSOLE-9", "UP-CONSOLE-10"],
        "body": "Using the architecture of the console-world references: an open circulation area at blue hour looking across a small, believable group of two or three "
                "occupied professional glass workplaces associated with one property, each with a warm-lit person at a softly glowing screen; distant rooms softly suggested. "
                "A gold-framed console edge in the left foreground. Human scale; no skyline, no aerial view. All screens are flat, evenly lit blank panels.",
        "used_by": ["10A"],
    },
}
stage2 = []
for key, s in SETS.items():
    edit = bool(s["inputs"])
    stage2.append({
        "key": key,
        "title": s["title"],
        "model": "still_edit" if edit else "still",
        "parameters": {**STILL, "aspect_ratio": "9:16", "prompt": compose(s["inputs"], s["body"], s["look"])},
        "inputs": s["inputs"],
        "takes": 2,
        "used_by": s["used_by"],
        **({"needs": "image(9) and image(10) uploaded"} if edit else {}),
    })

# ------------------------------------------------------------------ stage 4 + 5: shots
def source_seconds(edit, low=4, high=15):
    return max(low, min(high, math.ceil(edit + 1.5)))

QUIET = ("Silent footage: nobody talks or mouths words, no lip movement toward the camera, no music cues. "
         "Screens stay flat blank glowing panels; no text or interface appears. No morphing of people or rooms, no flashes, "
         "no exposure pulses, no speed ramps; believable hands with five fingers.")

SHOTS = [
    # shot, block, cast, look, set, plate, in(refs, body), out(refs, body) or None, motion, handoff
    dict(shot="01A", block="01", cast=[], look="street", set=None, plates=[],
         first=(["P"], "Reframe the property photograph as the start of a slow reveal: the same townhouse, same light and season, seen from slightly further left at human height, "
                        "with a dark, textured gum-tree trunk filling the left third of the frame in the foreground and the house partly revealed beyond it on the right."),
         last="P",
         motion="A short, slow lateral camera move to the right at human height, out from behind the gum-tree trunk, revealing the townhouse; ease into a near-still, frontal view "
                "with the facade in the upper-middle of the frame, then hold. Leaves move gently; a trace of warm interior light. No people, no cars.",
         handoff="01A to 01B, direct property-image match: the last frame is the P image itself."),
    dict(shot="01B", block="01", cast=["JORDAN"], look="home", set="S-HOME", plates=["PL-01B-a", "PL-01B-b"],
         first=(["P", "S-HOME"], "A tight view of Jordan's open laptop on his home desk: the laptop screen fills most of the frame and shows the property photograph (image 1) "
                                  "in the upper-middle of the screen at the same position, crop and brightness as in image 1, with a plain pale panel beside it. "
                                  "Only the laptop's top edge and a hint of the warm room are visible."),
         last=(["C-JORDAN", "S-HOME", "P"], "Seated eye height, slightly right of the laptop: " + CAST["JORDAN"] + " (image 1) sits at the home desk in image 2 in a thoughtful three-quarter profile, "
                                             "his right hand resting on the laptop's touchpad. The laptop sits in the upper-middle of the frame; its screen shows the property photograph (image 3) small at the top "
                                             "with a plain pale card panel below it. Warm timber, a subtle gold lamp reflection."),
         motion="Begin tight on the laptop screen; ease slightly back and to the right to reveal Jordan's light blue shirt, thoughtful profile and his hand on the touchpad. "
                "He reads once, then makes one deliberate click on the touchpad and rests. The laptop plane stays stable; the camera settles and holds.",
         handoff="01B to 02A, inquiry-card graphic match: the sent card and its property thumbnail stay in the same screen position."),
    dict(shot="02A", block="02", cast=["ALEX"], look="office", set="S-OFFICE", plates=["PL-02A"],
         first=(["C-ALEX", "S-OFFICE"], "Over the shoulder of " + CAST["ALEX"] + " (image 1) at the ordinary office workstation in image 2: her profile visible on the left, "
                                         "her right hand on the real mouse; the monitor in the upper-middle of the frame, " + SCREEN_LIGHT + "."),
         last=(["C-ALEX", "S-OFFICE"], "The same workstation a little to the right: Alex (image 1) seen in soft profile at the left edge, her hand on the mouse; the monitor fills the "
                                        "upper-middle, " + SCREEN_LIGHT + "; the phone and the printed document lie at the desk's front edge."),
         motion="One restrained rightward desk move over Alex's shoulder. She makes four deliberate mouse selections, each with a subtle shift of gaze across the screen, "
                "then a short pause. The camera settles on the monitor and the desk edge. Calm, ordinary, not distressed.",
         handoff="02A to 03A, ordinary continuity cut: the screen layout, cursor area, screen perspective and desk stay fixed."),
    dict(shot="03A", block="03", cast=["ALEX"], look="office", set="S-OFFICE", plates=["PL-03A"],
         first=(["F-02A-out", "C-ALEX"], "A closer view of the same monitor as image 1: the monitor fills the upper two-thirds, " + SCREEN_LIGHT + "; Alex's hand and soft profile (image 2) at the "
                                          "left edge; a faint reflection of an ordinary Australian street in the office glass at the frame's edge, not over the screen; the phone at the desk edge."),
         last=None,
         motion="A tiny rightward camera drift, then settle and hold on the screen and the phone at the desk edge. Alex's hand rests on the mouse. Nearly still.",
         handoff="03A to 03B, same-desk match on the phone and document edge before the vibration."),
    dict(shot="03B", block="03", cast=["ALEX"], look="office", set="S-OFFICE", plates=["PL-03B"],
         first=(["C-ALEX", "S-OFFICE", "F-03A-in"], "Medium close of " + CAST["ALEX"] + " (image 1) at the same workstation (images 2 and 3): the phone lies face up beside the printed document in the "
                                                    "foreground; her hand on the mouse; the monitor behind her hand, " + SCREEN_LIGHT + "."),
         last=None,
         motion="The phone vibrates once beside the printed document. Alex pauses her mouse movement, glances toward the phone, then back toward the monitor. "
                "A restrained focus shift from the phone to her eyes, then settle with the monitor readable behind her resting hand. One clear interruption only.",
         handoff="03B to 03C, inquiry-card match back to Jordan's unchanged conversation."),
    dict(shot="03C", block="03", cast=["JORDAN"], look="home", set="S-HOME", plates=["PL-03C"],
         first=(["C-JORDAN", "S-HOME", "F-01B-out"], "A close three-quarter profile of " + CAST["JORDAN"] + " (image 1) at his home desk (images 2 and 3), the laptop screen partly visible and readable-bright "
                                                     "in the frame's upper-middle; his face, shirt and laptop exactly as in image 3."),
         last=(["C-JORDAN", "S-HOME", "F-03C-in"], "The same scene as image 3, drifted slightly right: Jordan rests his hands and waits with a quiet, considered expression; a warm, gold-lit vertical "
                                                   "window mullion now runs top to bottom through the frame at about 45% of the width, softly out of focus in the foreground."),
         motion="Jordan checks the conversation once, rests his hands and waits, quietly. After the pause the camera drifts gently right so the warm vertical window mullion "
                "moves across the frame and settles at its centre-left. His eyes stay visible.",
         handoff="03C to 04A, matched architectural edge: the mullion's position, width and motion match the gold doorway frame that opens 04A."),
    dict(shot="04A", block="04", cast=["ALEX"], look="aurixa", set="S-ALEX", plates=["PL-SIGN"],
         first=(["S-ALEX", "C-ALEX", "F-03C-out"], "The Aurixa glass workspace (image 1) seen through its open gold-edged doorway: the gold vertical door frame runs top to bottom at about 45% of the width, "
                                                    "matching the mullion position in image 3. Beyond it, " + CAST["ALEX"] + " (image 2) is already seated at her console desk; a nearby colleague, seen from behind, "
                                                    "points to a printed floor plan on the desk; the monitor, " + SCREEN_NAVY + "."),
         last=(["S-ALEX", "C-ALEX", "F-04A-in"], "Closer to the open doorway than image 3: a foreground gold doorway mullion briefly fills the left third of the frame as the camera approaches "
                                                 "Alex's already-occupied desk; Alex, monitor and plan beyond, exactly as in image 3."),
         motion="Continue a rightward movement past the gold doorway frame into the occupied glass workspace. Alex is seated; her colleague indicates a detail on the plan; their gestures "
                "are small and natural. Move a short distance toward the open doorway until the foreground mullion covers part of the frame. No boardroom performance.",
         handoff="04A to 04B, concealed doorway cut behind the foreground mullion."),
    dict(shot="04B", block="04", cast=["ALEX"], look="aurixa", set="S-ALEX", plates=["PL-04B-a", "PL-04B-b"],
         first=(["C-ALEX", "S-ALEX", "F-04A-out"], "Just past the door edge: a close over-the-shoulder view of " + CAST["ALEX"] + " (image 1) in the same chair at the monitor of the workspace in image 2; "
                                                   "her right hand on the mouse; the monitor fills the upper-middle, " + SCREEN_NAVY + "; other occupied glass workspaces softly visible beyond."),
         last=(["C-ALEX", "S-ALEX", "F-04B-in"], "The same over-the-shoulder view as image 3 eased slightly forward: the monitor larger in the upper-middle, " + SCREEN_NAVY + "; her hand still on the mouse."),
         motion="Alex makes one deliberate click with her mouse hand and keeps her hand, cursor area and gaze on the screen. The camera eases forward only until the screen is clear, "
                "then settles and holds nearly still for the result.",
         handoff="04B to 05A, selected-property match: the property image settles at the same upper-middle position."),
    dict(shot="05A", block="05", cast=["ALEX"], look="aurixa", set="S-ALEX", plates=["PL-05A-a", "PL-05A-b"],
         first=(["C-ALEX", "F-04B-out"], "A tight over-the-shoulder insert of " + CAST["ALEX"] + " (image 1) at the same monitor as image 2: the screen fills most of the frame, " + SCREEN_NAVY + "; "
                                         "her mouse hand and a trace of her profile at the lower left."),
         last=None,
         motion="Nearly still. Alex makes one deliberate click; her hand stays visible; hold. No typing, no scrolling, no second action.",
         handoff="05A to 05B, direct property-image match into Jamie's Finance view."),
    dict(shot="05B", block="05", cast=["JAMIE"], look="aurixa", set="S-JAMIE", plates=["PL-05B-a", "PL-05B-b"],
         first=(["C-JAMIE", "S-JAMIE"], CAST["JAMIE"] + " (image 1) at her finance workstation (image 2), seen over her shoulder in partial profile, her hand on the real mouse; the monitor fills the "
                                        "upper-middle at the same position as the previous insert's screen, " + SCREEN_NAVY + "."),
         last=None,
         motion="Nearly stationary camera. Jamie makes one click and holds her gaze on the screen as the result settles. Her skin stays natural; the room rich navy.",
         handoff="05B to 05C, direct property-image match back to Alex's report context."),
    dict(shot="05C", block="05", cast=["ALEX"], look="aurixa", set="S-ALEX", plates=["PL-05C-a", "PL-05C-b"],
         first=(["C-ALEX", "F-05A-in"], "The same monitor and framing as image 2, with " + CAST["ALEX"] + " (image 1): her hand on the mouse, the screen in the upper-middle, " + SCREEN_LIGHT + "."),
         last=None,
         motion="Nearly still. Alex makes one click and her hand stays visible; hold on the bright screen. No scrolling.",
         handoff="05C to 06A, report-card match into Jordan's Client Portal."),
    dict(shot="06A", block="06", cast=["JORDAN"], look="aurixa", set="S-CLIENT", plates=["PL-06A-a", "PL-06A-b"],
         first=(["C-JORDAN", "S-CLIENT"], "A tight view of the laptop in the client glass workspace (image 2): the laptop screen fills the upper-middle, " + SCREEN_NAVY + "; "
                                          "the edge of Jordan Ellis's hand near the touchpad (image 1 is his character sheet: keep his skin tone and light blue shirt cuff)."),
         last=(["C-JORDAN", "S-CLIENT", "F-06A-in"], "Wider than image 3: " + CAST["JORDAN"] + " (image 1) at the laptop in the glass workspace (image 2), face warmly lit, hand on the touchpad; "
                                                     "the adjacent framed glass presentation panel with its opaque navy backing at the right; the laptop screen, " + SCREEN_NAVY + "."),
         motion="Begin on the laptop screen, then widen slightly to reveal Jordan's hand and face. He clicks once with the touchpad, then watches the result. Settle and hold. Natural, warm.",
         handoff="06A to 06B, record-and-panel-edge match into Alex's Command Center."),
    dict(shot="06B", block="06", cast=["ALEX"], look="aurixa", set="S-ALEX", plates=["PL-06B-a", "PL-06B-b", "PL-07A-a", "PL-07A-b"],
         first=(["C-ALEX", "S-ALEX", "F-04B-out"], "The same over-the-shoulder axis as image 3: " + CAST["ALEX"] + " (image 1) at her monitor in the workspace (image 2), her real mouse hand and considered "
                                                   "profile visible; the monitor in the upper-middle, " + SCREEN_NAVY + "; a pale paper document lies on the desk to her right."),
         last=(["C-ALEX", "S-ALEX", "F-06B-in"], "The same scene as image 3 after a very small rightward drift: Alex's hand has come to rest flat on the desk beside the pale paper document, "
                                                 "the monitor still glowing in the upper part of the frame."),
         motion="One continuous, unhurried take on one camera axis with a slow, very small rightward drift. Alex clicks once, reads, makes one short deliberate keyboard gesture, "
                "pauses thoughtfully, clicks once more to save, then lets her hand come to rest beside the pale document. Settle on the hand and paper.",
         continuous_with="07A",
         handoff="06B to 07A, continuous-camera passage (one source take); 07A to 08A, hand-and-paper action match."),
    dict(shot="07A", block="07", cast=["ALEX"], look="aurixa", set="S-ALEX", plates=[], first=None, last=None, motion=None,
         part_of="06B", handoff="Cut from the 06B take at the narration boundary."),
    dict(shot="08A", block="08", cast=["MIA"], look="aurixa", set="S-MIA", plates=["PL-08A-a", "PL-08A-b"],
         first=(["C-MIA", "S-MIA", "F-06B-out"], CAST["MIA"] + " (image 1) at her desk (image 2): her hand rests beside a pale supporting document at the same position, angle and paper "
                                                 "orientation as Alex's hand and document in image 3; the monitor behind, " + SCREEN_NAVY + "."),
         last=(["C-MIA", "S-MIA", "F-08A-in"], "The same desk as image 3 after a slight lateral move: the upper-right corner of the pale supporting document in sharp focus in the lower half of the frame, "
                                               "its diagonal edge running toward the frame's lower right; Mia and the glowing monitor softer behind."),
         motion="Mia compares one item on the paper with the screen, then clicks once with her mouse and watches the acknowledgement. A slight lateral discovery move, then settle "
                "with the pale document's corner in focus.",
         handoff="08A to 08B, pale document-edge match."),
    dict(shot="08B", block="08", cast=["ALEX", "JORDAN"], look="aurixa", set="S-MEETING", plates=["PL-08B"],
         first=(["C-ALEX", "C-JORDAN", "S-MEETING", "F-08A-out"], CAST["ALEX"] + " (image 1) and " + CAST["JORDAN"] + " (image 2) seated side by side at the meeting table (image 3), "
                                                                  "a printed report page (blank apart from fine grey lines and a navy heading bar) in the foreground whose corner and diagonal match image 4; the mounted display at the table's end, " + SCREEN_LIGHT + ". Both faces readable."),
         last=(["C-ALEX", "C-JORDAN", "S-MEETING", "F-08B-in"], "The same scene as image 4 after a short lateral move: Alex's hand rests beside the physical report folder, whose page edge fills the "
                                                                "lower part of the outgoing frame; Jordan attentive; the display still bright."),
         motion="Alex brings one consideration into view with a small touchpad movement and points to the display; Jordan follows and offers a natural, silent question with a look. "
                "A restrained short lateral move discovers their shared attention, then holds as Alex rests her hand beside the report folder.",
         handoff="08B to 09A, property-dossier match on the folder edge."),
    dict(shot="09A", block="09", cast=["PRIYA"], look="aurixa", set="S-PRIYA", plates=["PL-09A"],
         first=(["C-PRIYA", "S-PRIYA", "P", "F-08B-out"], CAST["PRIYA"] + " (image 1) at her desk (image 2) with a physical property folder in the foreground whose edge and orientation match image 4; "
                                                         "a small print of the property photograph (image 3) clipped to the folder. The monitor behind, " + SCREEN_LIGHT + ". Charcoal and navy office depth; no Aurixa branding."),
         last=(["C-PRIYA", "S-PRIYA", "F-09A-in"], "The same desk as image 3 after a short lateral move: the monitor bezel and the property folder with its photograph settle in clear positions; "
                                                   "Priya in soft profile, her hand on the mouse."),
         motion="Priya checks the physical folder, selects with her mouse, then pauses with visible concentration while reconciling. A short lateral move that settles with the "
                "monitor bezel and the folder's photograph clearly placed. Restrained.",
         handoff="09A to 09B, same-monitor comparison cut."),
    dict(shot="09B", block="09", cast=["PRIYA"], look="aurixa", set="S-PRIYA", plates=["PL-09B-a", "PL-09B-b"],
         first=(["C-PRIYA", "F-09A-out"], "The same monitor, folder, lens and exposure as image 2, with " + CAST["PRIYA"] + " (image 1) and her mouse hand; the screen, " + SCREEN_NAVY + "."),
         last=None,
         motion="Nearly still. Priya clicks once; her hand and face stay visible while the result settles. Hold, finishing with the monitor's edge aligned to the gold console frame.",
         handoff="09B to 10A, monitor-edge to console-edge match."),
    dict(shot="10A", block="10", cast=["PRIYA", "ALEX"], look="aurixa", set="S-REVEAL", plates=[],
         first=(["S-REVEAL", "C-PRIYA", "F-09B-in"], "Close through a gold-framed glass console edge: " + CAST["PRIYA"] + " (image 2) at her softly glowing screen inside her glass module, at the same "
                                                     "brightness and position as image 3; the occupied consoles of image 1 just beyond the frame's edge."),
         last=(["S-REVEAL", "C-ALEX", "F-10A-in"], "Wider, from the open circulation area (image 1): two or three occupied glass workplaces in blue-hour navy with warm-lit people at glowing screens; "
                                                   "a fine gold architectural frame on the right leads toward Alex's nearby open doorway, where " + CAST["ALEX"] + " (image 2) is seated, small in frame."),
         motion="A modest backward-right reveal from the open circulation area, not a flight through glass: from Priya's active matter out to a small group of occupied consoles. "
                "People keep working. Finish beside the architectural frame leading right toward Alex's doorway.",
         handoff="10A to 10B, nearby doorway occlusion."),
    dict(shot="10B", block="10", cast=["ALEX"], look="aurixa", set="S-ALEX", plates=["PL-11A-a"],
         first=(["C-ALEX", "S-ALEX", "F-10A-out"], "Past a finely gold-lit doorway edge in the foreground left: " + CAST["ALEX"] + " (image 1) already at her desk in the workspace (image 2), glancing up "
                                                   "with a subtle welcome; the monitor, " + SCREEN_NAVY + "."),
         last=(["C-ALEX", "S-ALEX", "F-04B-out"], "Alex's physical monitor and her resting mouse hand in the over-the-shoulder framing of image 3, the screen glowing in the upper-middle."),
         motion="Continue right past the gold doorway frame; Alex's welcoming glance stays brief and secondary. One short, controlled approach to her monitor; settle on the screen "
                "and her resting mouse hand, and hold that exact composition.",
         handoff="10B to 11A, same-monitor continuity."),
    dict(shot="11A", block="11", cast=["ALEX"], look="aurixa", set="S-ALEX", plates=["PL-11A-a", "PL-11A-b", "PL-11A-c"],
         first="F-10B-out", last=None,
         motion="Nearly still on Alex's monitor and hand. She makes one clear mouse click and keeps her hand in place. Hold. (The cut to the Demo workspace is made in the edit.)",
         handoff="11A to 12A, demo-project match on the Residence 014 tile."),
    dict(shot="12A", block="12", cast=["DANIEL"], look="aurixa", set="S-SITE", plates=["PL-12A-a", "PL-12A-b"],
         first=(["C-DANIEL", "S-SITE", "D"], CAST["DANIEL"] + " (image 1) at the site-office desk (image 2), the printed floor plan (image 3) on the desk beside his mouse, the safety vest on its hook behind; "
                                             "the monitor in the upper-middle, " + SCREEN_NAVY + "."),
         last=(["C-DANIEL", "S-SITE", "D", "F-12A-in"], "The same scene as image 4 after a small rightward move: Daniel studies the monitor and rests a finger beside the matching printed plan (image 3); "
                                                        "the monitor screen held flat and square-on in the upper part of the frame."),
         motion="Daniel clicks once with his mouse, studies the result, then rests a finger beside the matching printed plan. A small rightward discovery move, then settle. One action only.",
         handoff="12A to 12B, exact floor-plan match."),
    dict(shot="12B", block="12", cast=["PRIYA"], look="aurixa", set="S-PRIYA", plates=["PL-12B-a", "PL-12B-b"],
         first=(["C-PRIYA", "S-PRIYA"], "Over the shoulder of " + CAST["PRIYA"] + " (image 1) at her solicitor desk (image 2): her mouse hand, cursor area and part of her face visible; the stable monitor "
                                        "square-on in the upper-middle, " + SCREEN_NAVY + "."),
         last=None,
         motion="Nearly still. Priya reads, then clicks once; her hand, cursor area and part of her face stay visible while the small confirmation appears. Hold.",
         handoff="12B to 13A, record-and-card graphic match into Jamie's finance view."),
    dict(shot="13A", block="13", cast=["JAMIE"], look="aurixa", set="S-JAMIE", plates=["PL-13A-a", "PL-13A-b", "PL-14A-1", "PL-14A-2", "PL-14A-3", "PL-14A-4"],
         first=(["C-JAMIE", "S-JAMIE"], CAST["JAMIE"] + " (image 1) at her finance workstation (image 2), seen at a slight angle with her profile and mouse hand; the monitor in the upper-middle, "
                                        + SCREEN_NAVY + "; a notepad and pen beside the keyboard."),
         last=(["C-JAMIE", "S-JAMIE", "F-13A-in"], "The same scene as image 3 after a slow, minimal rightward track: Jamie has written a short note and rests her hand, looking back at the screen; "
                                                   "a fine gold console edge now runs vertically at the right of the frame, the workspace softly occupied beyond."),
         motion="One calm continuous take with a slow, minimal rightward track, never reversing. Jamie reads, clicks once, considers, starts a brief handwritten note beside the keyboard, "
                "completes it, rests her hand naturally and looks back at the workspace. The camera gradually includes the fine gold console edge. Thoughtful, no testimonial expression.",
         continuous_with="14A",
         handoff="13A to 14A, uninterrupted observation (one source take); 14A to 15A, gold-frame graphic match into the closing card."),
    dict(shot="14A", block="14", cast=["JAMIE"], look="aurixa", set="S-JAMIE", plates=[], first=None, last=None, motion=None,
         part_of="13A", handoff="Cut from the 13A take at the narration boundary."),
    dict(shot="15A", block="15", cast=[], look="aurixa", set=None, plates=["PL-15A"],
         first="F-13A-out", last=None,
         motion="Effectively still: the occupied workspace and gold console edge hold, with only the softest background life. No camera move, no late reveal. "
                "(The navy gradient, emblem, wordmark, offer and CTA are composited in the edit.)",
         handoff="End on the complete stable closing frame through the final word and audio tail."),
]

# The pack's 15 edit blocks: title and purpose, as written there.
BLOCKS = {
    "01": ("The opportunity and the client", "Give the viewer one recognisable property and one client question. The facade becomes the screen image, then the inquiry becomes the next scene's task."),
    "02": ("The scattered workflow", "Show the practical cost of fragmented tools through repeated attention shifts while the client's answer remains unfinished."),
    "03": ("The pressure while the client waits", "Tie the pressure passage to relevant incoming property information, a real interruption and a waiting person. Each brief insert advances the same unresolved question."),
    "04": ("Aurixa arrives and the viewer enters the console", "Bring the client inquiry into an occupied Aurixa Systems environment, then show a clear human-operated starting point in the Command Center."),
    "05": ("Research to financial analysis to a report", "Connect the prepared research, illustrative finance comparison and client report through the exact same property image. Prioritise one useful result per insert."),
    "06": ("Communication and the supporting agent", "Make the client's professional team visible, then show Aurixa Agent supporting the professional within the same record context."),
    "07": ("Professional judgement remains visible", "Give the professional's considered edit centre stage. The system acknowledges saved work while the person retains judgement."),
    "08": ("Professional work and the client decision", "Show an accountant contributing a concrete review, then reveal how prepared information supports a useful client conversation."),
    "09": ("The manual gap and the connected matter", "Contrast duplicate checking with one selection of an organised matter and its next review task."),
    "10": ("The system is here", "Expand from an active matter to the occupied professional relationship, then guide the eye into the workspace the viewer is invited to explore."),
    "11": ("The fourteen day invitation", "Present the exact 14-day trial invitation as a clear human action, leading by editorial cut into a prepared demonstration workspace."),
    "12": ("Explore the working partner portals", "Give the builder/developer and solicitor one useful action each, connected by the same floor-plan document."),
    "13": ("The viewer can assess the experience", "Show a finance professional using a relevant comparison and considering its usefulness without claiming an investment outcome."),
    "14": ("Four short statements and a personal decision", "Let the four decision phrases land over one uninterrupted professional moment, linking the trial to the viewer's own business and judgement."),
    "15": ("The final brand and trial invitation", "Resolve the tangible work into a stable, memorable Aurixa Systems identity and a clearly readable trial action."),
}

shots_out = []
frames = []
clips = []
for s in SHOTS:
    t = SHOT_TIME[s["shot"]]
    row = {k: s[k] for k in ("shot", "block", "cast", "set", "plates", "handoff") if k in s}
    row["edit"] = {"in": t["in"], "out": t["out"], "seconds": t["seconds"]}
    if s.get("part_of"):
        row["source"] = f"cut from the {s['part_of']} take"
        shots_out.append(row)
        continue
    edit_seconds = t["seconds"]
    if s.get("continuous_with"):
        edit_seconds = round(t["seconds"] + SHOT_TIME[s["continuous_with"]]["seconds"], 3)
    first_key = last_key = None
    if isinstance(s["first"], tuple):
        refs, body = s["first"]
        first_key = f"F-{s['shot']}-in"
        frames.append({"key": first_key, "shot": s["shot"], "model": "still_edit", "inputs": refs,
                       "parameters": {**STILL, "aspect_ratio": "9:16", "prompt": compose(refs, body, s["look"])}, "takes": 2})
    elif isinstance(s["first"], str):
        first_key = s["first"]
    if isinstance(s["last"], tuple):
        refs, body = s["last"]
        last_key = f"F-{s['shot']}-out"
        frames.append({"key": last_key, "shot": s["shot"], "model": "still_edit", "inputs": refs,
                       "parameters": {**STILL, "aspect_ratio": "9:16", "prompt": compose(refs, body, s["look"])}, "takes": 2})
    elif isinstance(s["last"], str):
        last_key = s["last"]
    seconds = source_seconds(edit_seconds)
    clip = {"key": f"V-{s['shot']}", "shot": s["shot"] + (f"+{s['continuous_with']}" if s.get("continuous_with") else ""),
            "first_frame": first_key, "last_frame": last_key, "seconds": seconds,
            "edit_seconds": edit_seconds, "prompt": f"{s['motion']} {QUIET}"}
    assert len(clip["prompt"]) <= 2000, (s["shot"], len(clip["prompt"]))
    clips.append(clip)
    row["source"] = clip["key"]
    shots_out.append(row)

# Frames named as inputs must exist (or be anchors/uploads/sets).
known = {f["key"] for f in frames} | {i["key"] for i in stage1} | set(SETS) | {"UP-CONSOLE-9", "UP-CONSOLE-10"}
for f in frames:
    for key in f["inputs"]:
        assert key in known, (f["key"], key)
for c in clips:
    for key in (c["first_frame"], c["last_frame"]):
        assert key is None or key in known, (c["key"], key)

# ------------------------------------------------------------------ stage 3: plates (typeset, never generated)
PLATES = [
    ("PL-01B-a", "01B", "generic", "Enquiry composer, before Send", ["Project Banksia / Residence 014 (property thumbnail P)", "From: Jordan Ellis", "To: Alex Morgan",
        "Can we review whether this suits my plans?", "Send (under the cursor)"]),
    ("PL-01B-b", "01B", "generic", "Enquiry sent", ["The same enquiry", "Sent"]),
    ("PL-02A", "02A", "generic", "Four separate unbranded windows, in the order spoken", ["Research", "Financial worksheet", "Client details", "Report draft (blank: intentional)"]),
    ("PL-03A", "03A", "generic", "Incoming item beside the empty report", ["Floor plan received — Residence 014", "Report draft (still empty)"]),
    ("PL-03B", "03B", "generic", "The original enquiry card behind Alex's hand", ["Can we review whether this suits my plans?", "Jordan Ellis · Residence 014"]),
    ("PL-03C", "03C", "generic", "Jordan's conversation, still unanswered", ["Can we review whether this suits my plans?", "(no reply yet)", "Optional emphasis caption: WHAT HAPPENS THEN"]),
    ("PL-SIGN", "04A", "aurixa", "Architectural sign on the glass", ["Approved triangular emblem", "AURIXA SYSTEMS"]),
    ("PL-04B-a", "04B", "aurixa", "Command Center · Reports, before the selection", ["Sidebar: AURIXA SYSTEMS (grouped navigation)", "Banner eyebrow: AURIXA REPORTING COMMAND CENTER", "Page: Reports",
        "Tabs: Manual (active) · URL Extraction · PDF Upload", "Cards: Existing Property · New Build · Land Only", "Demo workspace"]),
    ("PL-04B-b", "04B", "aurixa", "Command Center · Reports, New Build selected", ["New Build card in saturated blue (#1238E8)", "Context: Project Banksia / Residence 014 · BK-014 (thumbnail P)", "Demo workspace"]),
    ("PL-05A-a", "05A", "aurixa", "Research brief, before the click", ["Prepared context: Project Banksia / Residence 014 (P)", "Research brief (under the cursor)", "Next: Financial analysis", "Demo workspace"]),
    ("PL-05A-b", "05A", "aurixa", "Location overview, the result", ["Research brief", "Location overview (large, selected)", "Property characteristics", "Questions for review"]),
    ("PL-05B-a", "05B", "aurixa", "Finance · purchase file, before the click", ["Welcome back, Jamie", "Active purchase file: Project Banksia / Residence 014 (P)", "Tabs: Overview (active) · Scenario comparison (under the cursor) · Documents", "Demo workspace"]),
    ("PL-05B-b", "05B", "aurixa", "Finance · Scenario comparison", ["Scenario comparison (active tab)", "Base case · Alternative case", "Illustrative scenario", "Questions for discussion"]),
    ("PL-05C-a", "05C", "aurixa", "Client summary preview control", ["Client summary", "Open preview (under the cursor)", "thumbnail P", "Demo workspace"]),
    ("PL-05C-b", "05C", "aurixa", "The prepared report (white reading surface)", ["Project Banksia / Residence 014 (image P)", "Client summary (navy heading)", "Key considerations", "Questions for discussion", "fine gold dividers"]),
    ("PL-06A-a", "06A", "aurixa", "Client Portal dashboard, before the click", ["Welcome back, Jordan Ellis", "Your property team · 5 professionals working on Residence 014", "My Property Team (under the cursor)", "Demo workspace"]),
    ("PL-06A-b", "06A", "aurixa", "Client Portal · Your property team", ["My Property Team (selected)", "Your property team: Property · Finance · Legal · Builder / Developer · Accounting", "Residence 014",
        "Next discussion: Client summary", "Optional: one framed-glass enlargement of the team strip"]),
    ("PL-06B-a", "06B", "aurixa", "Command Center record with the Aurixa Agent launcher", ["Prepared context: Residence 014", "Questions for review", "Aurixa Agent (launcher, under the cursor)", "Demo workspace"]),
    ("PL-06B-b", "06B", "aurixa", "Aurixa Agent panel open", ["Aurixa Agent", "Draft client summary: Discuss the next step", "Review required", "Question to verify"]),
    ("PL-07A-a", "07A", "aurixa", "Draft before Alex's edit", ["Questions for review", "Draft: Discuss the next step"]),
    ("PL-07A-b", "07A", "aurixa", "Draft after the edit, saved", ["Draft: Review the remaining questions together", "Save draft → Draft saved (restrained teal)"]),
    ("PL-08A-a", "08A", "aurixa", "Accountant Portal · Needs you next", ["Needs you next", "Supporting information · Jordan Ellis · Residence 014", "Mark reviewed", "Demo workspace"]),
    ("PL-08A-b", "08A", "aurixa", "Reviewed", ["Supporting information · Reviewed (teal)"]),
    ("PL-08B", "08B", "aurixa", "Client summary on the mounted display", ["Client summary · Residence 014", "Key considerations", "Questions for discussion"]),
    ("PL-09A", "09A", "generic", "Two generic document lists with duplicate references", ["Residence 014 — documents (list A)", "Residence 014 — documents (list B, duplicates)", "No Aurixa branding"]),
    ("PL-09B-a", "09B", "aurixa", "Solicitor Portal · Open matters, before the click", ["Open matters (active)", "Project Banksia / Residence 014 (under the cursor)", "Demo workspace"]),
    ("PL-09B-b", "09B", "aurixa", "Solicitor Portal · the matter opened", ["Project Banksia / Residence 014 (selected, blue)", "Document review: Contract of sale (draft) · Floor plan · Building specification", "Next discussion"]),
    ("PL-11A-a", "10B, 11A", "aurixa", "Campaign trial invitation", ["Approved emblem", "AURIXA SYSTEMS", "14-DAY FREE TRIAL", "Start your free trial (saturated blue CTA)"]),
    ("PL-11A-b", "11A", "aurixa", "CTA selected state", ["Start your free trial (pressed state)"]),
    ("PL-11A-c", "11A", "aurixa", "Demo workspace", ["Demo workspace", "Explore your workspace", "Project tile: Residence 014 (image P)"]),
    ("PL-12A-a", "12A", "aurixa", "Builder / Developer Portal · Stock List", ["AURIXA SYSTEMS · BUILDER / DEVELOPER PORTAL", "Projects · Stock List", "Project Banksia", "Residence 014 (row, under the cursor)", "Demo workspace"]),
    ("PL-12A-b", "12A", "aurixa", "Floor plan preview", ["Floor plan (image D)", "Residence 014"]),
    ("PL-12B-a", "12B", "aurixa", "Solicitor matter view with the plan and a prepared note", ["Floor plan (image D)", "Note: Discuss the remaining document questions.", "Save note"]),
    ("PL-12B-b", "12B", "aurixa", "Note saved", ["Note saved (small teal confirmation)", "Matter remains under review"]),
    ("PL-13A-a", "13A", "aurixa", "Finance scenario view", ["Active Purchase Files", "Project Banksia / Residence 014", "Scenario comparison", "Base case · Alternative case", "Illustrative scenario", "Questions for discussion", "Demo workspace"]),
    ("PL-13A-b", "13A", "aurixa", "Alternative case selected", ["Alternative case (selected, blue)", "Illustrative scenario"]),
    *[(f"PL-14A-{n}", "14A", "overlay", "Editorial phrase, one at a time in one clear area", [text])
      for n, text in enumerate(["Fourteen days.", "Your business.", "Your experience.", "Your decision."], 1)],
    ("PL-15A", "15A", "endcard", "Closing card (from the start of Block 15)", ["Approved emblem", "AURIXA SYSTEMS", "The operating system for modern property professionals.", "14-DAY FREE TRIAL",
        "START YOUR FREE TRIAL", "aurixasystems.com.au"]),
]
stage3 = [{"key": k, "shots": s, "kind": kind, "title": title, "text": text} for k, s, kind, title, text in PLATES]
for row in shots_out:
    for p in row.get("plates", []):
        assert any(x["key"] == p for x in stage3), (row["shot"], p)

# ------------------------------------------------------------------ stage 7: captions and overlays from the measured words
CAPTIONS = [
    (0.00, 1.14, "Somewhere in Australia,"), (1.68, 3.72, "a property opportunity has just appeared."),
    (4.44, 6.24, "A client wants to know if it's right for them,"), (6.52, 8.00, "while there's still time to act."),
    (8.50, 9.70, "But before you can answer,"), (10.22, 11.70, "the research is in one platform,"), (12.02, 13.02, "the numbers in another,"),
    (13.44, 15.16, "the client details somewhere else,"), (15.32, 17.10, "and the report hasn't even begun."),
    (17.78, 18.74, "WHAT HAPPENS THEN –"), (19.14, 20.56, "The market keeps moving."),
    (21.12, 23.38, "Your attention is pulled in every direction."), (24.04, 25.48, "And the client is waiting."),
    (26.00, 28.80, "Aurixa Systems was built by property professionals"), (28.80, 30.44, "for property professionals"),
    (31.26, 31.66, "We're here,"), (32.06, 33.82, "with a connected operating environment"), (33.82, 37.34, "designed around how property professionals actually work."),
    (37.74, 39.68, "Picture a property moving from research"), (39.68, 41.10, "into financial analysis,"), (41.66, 43.38, "then into a professional report"),
    (43.38, 44.84, "your client can understand."), (45.41, 46.50, "Picture communication,"), (47.18, 49.28, "client relationships and property partners"),
    (49.28, 50.60, "connected to that journey,"), (50.82, 53.52, "with Aurixa Agent supporting the work behind it."),
    (54.07, 55.48, "Not to replace your judgement,"), (55.92, 57.68, "but to give it room to lead."),
    (57.79, 60.26, "Because clients don't pay you to manage software."), (60.85, 63.18, "They trust you to identify opportunities,"),
    (63.68, 64.82, "make sense of complexity"), (65.28, 66.68, "and guide the next decision."),
    (67.19, 68.64, "You can keep asking your team"), (68.64, 71.18, "to bridge the gaps between disconnected systems."),
    (71.65, 73.08, "But why should they have to?"), (73.55, 75.64, "Aurixa Systems isn't on the horizon."),
    (76.18, 78.94, "We've arrived, and the invitation is open."), (79.42, 80.66, "Experience what we've built"), (80.66, 82.50, "with a 14-day free trial."),
    (83.09, 84.10, "Explore the platform,"), (84.51, 86.50, "put it alongside the way you work today,"), (86.64, 88.96, "and discover what a more connected business"),
    (88.96, 89.92, "could feel like."), (90.31, 91.86, "Don't just take our word for it."), (92.13, 94.08, "Let your own experience make the case."),
]
captions = []
for i, (a, b, text) in enumerate(CAPTIONS):
    nxt = CAPTIONS[i + 1][0] if i + 1 < len(CAPTIONS) else 94.4
    captions.append({"start": a, "end": round(min(nxt - 0.05, b + 0.5), 2), "text": text})
overlays = [
    {"start": 94.57, "end": 95.82, "text": "Fourteen days."}, {"start": 95.87, "end": 96.93, "text": "Your business."},
    {"start": 96.98, "end": 98.22, "text": "Your experience."}, {"start": 98.27, "end": 99.40, "text": "Your decision."},
]
end_card = {"from": SHOT_TIME["15A"]["in"], "to": timing["end"], "plate": "PL-15A",
            "note": "Visible from the first frame of Block 15 through the last word (105.88 s) and the audio tail. No captions over it: its words would duplicate the card."}

spec = {
    "title": "Aurixa Systems · Reel 1 working master",
    "source": "Aurixa_Systems_Reel_1_Video_Prompt_Pack - Final.pdf (Final Cinematic Edition, Revision 2), brief 848af668-b28b-4ddb-8ab2-f8916ce314f0",
    "status": "plan only: nothing generated",
    "delivery": {"aspect_ratio": "9:16", "size": "1080x1920", "fps": 30, "seconds": timing["end"]},
    "voiceover": {"asset_id": "84c0abf7-60d1-4439-84fd-e7038feffc01", "seconds": 106.031, "speech_end": 105.88,
                  "timed_from": "audio_preparations c47a30e0-edcd-4389-b98f-6c3fa11887d7 (265 measured words and speech segments)"},
    "brand_kit": {"id": "db6e1011-b5b9-4e0c-a618-223e49bbe1de", "use_in_generations": False,
                  "why": "The kit's night-office look and avoid line would override the pack's afternoon-to-blue-hour progression and its unbranded problem scenes; the pack's own direction is written into every prompt."},
    "models": MODELS,
    "still_defaults": STILL,
    "clip_defaults": {"aspect_ratio": "from the first frame (9:16)", "audio": "off", "handles": "about 0.75 s each end; seconds = ceil(edit + 1.5), min 4"},
    "uploads_needed": [
        {"key": "UP-CONSOLE-9", "what": "image(9).png, the principal physical-world reference"},
        {"key": "UP-CONSOLE-10", "what": "image(10).png, the principal physical-world reference"},
        {"key": "UP-PORTALS", "what": "the Command Center screenshot (CC), the last of the six portals; the CC plates follow the other five portals' shell until then"},
        {"key": "UP-EMBLEM", "what": "the approved emblem and AURIXA SYSTEMS wordmark at full size (SVG or a PNG at least 2000 px wide); the library's logo is 720 px"},
    ],
    "decisions": [
        "Confirmed 20 October 2026: the closing CTA is the pack's START YOUR FREE TRIAL, not the brand kit's Book Your Free Demo (the kit's automatic end card is not used).",
        "Confirmed 20 October 2026: the small label on recreated screens is the pack's Demo workspace, not the brand rules' Concept.",
        "The colleague in 04A is unnamed and seen from behind, so no seventh face needs locking.",
    ],
    "timing": {"method": "Each cut sits in the pause before the cue's first word (0.15 s ahead of its speech onset), or 0.1 s ahead of a word mid-phrase, snapped to 30 fps.",
               "cues": timing["cues"],
               "blocks": [{**b, "title": BLOCKS[b["block"]][0], "purpose": BLOCKS[b["block"]][1]} for b in timing["blocks"]]},
    "stages": [
        {"stage": 1, "name": "Lock the look", "gate": "Pick one P, one sheet per person and one D.", "items": stage1},
        {"stage": 2, "name": "Sets", "gate": "Approve each set.", "items": stage2},
        {"stage": 3, "name": "Screen plates (typeset, no credits)", "gate": "Approve the plates: brand, source content, readability.", "items": stage3},
        {"stage": 4, "name": "Shot frames", "gate": "Block by block, each first frame built from the approved frame before it.", "items": frames},
        {"stage": 5, "name": "Clips", "gate": "Test 01A and 04B on both clip models, choose one, then block by block.",
         "test": {"shots": ["01A", "04B"], "models": ["clip_seedance", "clip_kling"]}, "items": clips},
    ],
    "shots": shots_out,
    "edit": {"captions": captions, "overlays": overlays, "end_card": end_card,
             "rules": ["The voiceover is the only spoken track and is never stretched.", "Captions at most two lines, worded from the script (spellings: Aurixa Systems, Aurixa Agent, judgement).",
                       "No captions over the Block 14 phrases or the end card.", "Render 1080x1920 at 30 fps."]},
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "spec.json").write_text(json.dumps(spec, indent=1, ensure_ascii=False) + "\n")

# The ledger of approved assets: every key, its library asset id once approved (else null).
ledger_file = OUT / "assets.json"
ledger = json.loads(ledger_file.read_text()) if ledger_file.exists() else {}
keys = [i["key"] for i in stage1] + [i["key"] for i in stage2] + [u["key"] for u in spec["uploads_needed"]] \
    + [i["key"] for i in stage3] + [f["key"] for f in frames] + [c["key"] for c in clips]
for key in keys:
    ledger.setdefault(key, None)
# Keys the spec no longer has (a plate split into its states) are dropped.
ledger = {key: ledger[key] for key in keys}
ledger_file.write_text(json.dumps(ledger, indent=1) + "\n")
print("stills: stage1", sum(i["takes"] for i in stage1), "stage2", sum(i["takes"] for i in stage2), "frames", len(frames), "x2 =", 2 * len(frames))
print("clips", len(clips), "source seconds", sum(c["seconds"] for c in clips))
print("plates", len(stage3), "captions", len(captions))
