"""Reel 1's cast as studio characters with Soul IDs, from the approved assets alone: each person's
character sheet (C-*), cut into its panels, and their face in the approved frames.

  python3 scripts/aurixa-reel-1/cast.py save <cache dir>      # crop, import_image, save_character
  python3 scripts/aurixa-reel-1/cast.py train [--only ALEX]   # train_soul_id (Soul 2), billed by Higgsfield
  python3 scripts/aurixa-reel-1/cast.py status                # get_character: each Soul ID's state
  python3 scripts/aurixa-reel-1/cast.py proof [--only ALEX] [--attempt 2]   # make_soul_still: one likeness still each, billed
  python3 scripts/aurixa-reel-1/cast.py fetch-proofs <dir>    # waits for them and downloads them
  python3 scripts/aurixa-reel-1/cast.py pack --only JAMIE [--price]          # a training pack: 8 photos each, billed
  python3 scripts/aurixa-reel-1/cast.py fetch-pack <dir> [--only JAMIE]      # waits for them and downloads them
  python3 scripts/aurixa-reel-1/cast.py keep JAMIE=1,2,4                       # adds those pack photos to the training photos

The sheet is four panels in one picture (full length, three-quarter, profile, hands), so it is cut into
its panels: a Soul ID learns from one face per image. The frames give the person in the reel's own light
and angles; only those with the face clear are used, and a frame and its screen-swapped twin count once.
Ids go into docs/brands/aurixa-reel-1/characters.json; a character is saved once and found there after.

A training pack is the studio's own (Characters → Training pack, soul-training.server.ts): its painter
(the first of keyframePainters that paints 3:4, Grok Imagine Image 2.0), with painterValues' settings, the
sheet as reference images in sheetOrder, and packPrompt over PACK_SHOTS in order. Where the sheet and the
frames give a Soul ID too few faces (Jamie, Daniel and Mia had five each), the good ones are added to the
character's training photos and the Soul ID is trained again.
"""
import ast, base64, hashlib, io, json, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import studio
from PIL import Image

# The cast's look as the spec writes it (build_spec.py runs when imported, so its CAST is read from its source).
CAST = next(ast.literal_eval(node.value) for node in ast.parse((Path(__file__).parent / "build_spec.py").read_text()).body
            if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", None) == "CAST")

RECORD = studio.SPEC_DIR / "characters.json"
NAMES = {"ALEX": "Alex Morgan", "JORDAN": "Jordan Ellis", "JAMIE": "Jamie Chen", "PRIYA": "Priya Shah",
         "DANIEL": "Daniel Reed", "MIA": "Mia Patel"}
# Each sheet's panels, (x0, y0, x1, y1) on the 2048 x 1360 sheet: its separators found by their light rule.
SHEET = {
    "ALEX": {"front": (0, 0, 433, 1360), "three_quarter": (440, 0, 1004, 820), "side": (1011, 0, 1565, 820)},
    "JORDAN": {"front": (0, 0, 452, 1360), "three_quarter": (459, 0, 1004, 820), "side": (1011, 0, 1543, 820)},
    "JAMIE": {"front": (0, 0, 475, 1360), "three_quarter": (482, 0, 1164, 880), "side": (1171, 0, 2048, 880)},
    "PRIYA": {"front": (0, 0, 490, 1360), "three_quarter": (497, 0, 1048, 820), "side": (1055, 0, 1530, 820)},
    "DANIEL": {"front": (0, 0, 582, 1360), "three_quarter": (589, 0, 1276, 800), "side": (1283, 0, 2048, 755)},
    "MIA": {"front": (0, 0, 425, 1360), "three_quarter": (432, 0, 1041, 820), "side": (1048, 0, 1600, 820)},
}
# The person's head and shoulders in the approved frames (1520 x 2688), where the face is clear.
FRAMES = {
    "ALEX": {"F-02A-in": (0, 520, 620, 1260), "F-03A-in": (0, 240, 560, 960), "F-03B-in": (0, 460, 640, 1220),
             "F-04A-out": (360, 850, 760, 1300), "F-08B-in": (0, 880, 470, 1380), "F-10B-in": (380, 700, 780, 1130)},
    "JORDAN": {"F-03C-in": (860, 420, 1520, 1160), "F-06A-out": (60, 600, 740, 1300), "F-08B-in": (430, 860, 880, 1380)},
    "JAMIE": {"F-05B-in": (100, 560, 700, 1240), "F-13A-in": (0, 520, 600, 1240)},
    "PRIYA": {"F-09A-in": (300, 600, 860, 1220), "F-09A-out": (60, 620, 700, 1260), "F-10A-in": (500, 780, 1040, 1320)},
    "DANIEL": {"F-12A-in": (80, 720, 680, 1360), "F-12A-out": (80, 680, 640, 1340)},
    "MIA": {"F-08A-in": (0, 380, 640, 1260), "F-08A-out": (0, 260, 600, 1100)},
}
SOUL_VERSION = "v2"  # Soul 2, the studio's default Soul model
# The studio's training pack (src/lib/characters/soul.ts PACK_SHOTS and packPrompt; keyframes.ts painterValues).
PACK_PAINTER = "59826145-422a-4247-b630-bb59cf6f4090"  # Grok Imagine Image 2.0, keyframePainters' first at 3:4
PACK_VALUES = {"aspect_ratio": "3:4", "resolution": "2k", "quality": "medium"}
PACK_SIZE = 8  # the studio's smallest pack (PACK_SIZES)
PACK_SHOTS = [
    "A head-and-shoulders portrait facing the camera, neutral relaxed expression, soft even studio light, plain light-grey background.",
    "A head-and-shoulders portrait turned three-quarters to the left, a gentle smile, soft window light.",
    "A head-and-shoulders portrait turned three-quarters to the right, serious expression, soft daylight.",
    "A close side profile facing left, calm expression, even light, plain background.",
    "A close-up of the face, laughing naturally, warm indoor light.",
    "A waist-up photo facing the camera, arms relaxed, bright overcast daylight outdoors.",
    "A head-and-shoulders portrait looking slightly down, thoughtful expression, warm lamp light, indoors.",
    "A head-and-shoulders portrait looking slightly up, confident expression, cool blue evening light.",
]
SHEET_ORDER = ["face", "front", "three_quarter", "side", "back", "outfit", "expression", "other"]
PROOF_SCENE = ("A head-and-shoulders portrait facing the camera, a calm, natural expression, soft even light, a plain "
               "light-grey background; a sharp, true-to-life photograph.")


def load_record():
    return json.loads(RECORD.read_text()) if RECORD.exists() else {}


def save_record(record):
    RECORD.write_text(json.dumps(record, indent=2) + "\n")


def approved_file(key, cache):
    """The approved take of a frame or sheet, as a PIL image (downloaded once into the cache)."""
    ledger = studio.load("assets.json")
    path = Path(cache) / f"{key}-{ledger[key]}.png"
    if not path.exists():
        url = studio.call("get_asset", {"assetId": ledger[key]})["url"]
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, path)
    return Image.open(path).convert("RGB")


def import_crop(image, title):
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    data = buffer.getvalue()
    result = studio.call("import_image", {
        "title": title,
        "data": base64.b64encode(data).decode(),
        "clientRequestId": f"aurixa-cast-{hashlib.sha256(data).hexdigest()[:24]}",
    })
    return result["assetId"]


def save(cache, only=None):
    record = load_record()
    ledger = studio.load("assets.json")
    for who, name in NAMES.items():
        if only and who not in only:
            continue
        if record.get(who, {}).get("characterId"):
            print(f"{who}: already saved as {record[who]['characterId']}")
            continue
        sheet_image = approved_file(f"C-{who}", cache)
        sheet = [{"assetId": import_crop(sheet_image.crop(box), f"Aurixa Reel 1 · {name} · sheet, {view.replace('_', '-')}"), "view": view}
                 for view, box in SHEET[who].items()]
        # The whole sheet too, as the frames were made from it (sent as references by non-Soul models).
        sheet.append({"assetId": ledger[f"C-{who}"], "view": "other"})
        photos = {key: import_crop(approved_file(key, cache).crop(box), f"Aurixa Reel 1 · {name} · in {key[2:]}")
                  for key, box in FRAMES[who].items()}
        description = CAST[who].split(", exactly as in")[0].split(", ", 1)[1]
        result = studio.call("save_character", {"name": name, "description": description, "sheet": sheet,
                                                "photos": list(photos.values())})
        record[who] = {"characterId": result["characterId"], "name": name,
                       "sheet": {item["view"]: item["assetId"] for item in sheet},
                       "photos": photos,
                       "training": [item["assetId"] for item in sheet if item["view"] != "other"] + list(photos.values())}
        save_record(record)
        print(f"{who}: {name} saved, {result['characterId']}, {result['added']} images; {len(record[who]['training'])} to train on")


def train(only=None):
    record = load_record()
    for who, entry in record.items():
        if only and who not in only:
            continue
        result = studio.call("train_soul_id", {"characterId": entry["characterId"], "version": SOUL_VERSION,
                                               "assetIds": entry["training"]})
        entry.setdefault("soul", {})[SOUL_VERSION] = {"status": result.get("status")}
        save_record(record)
        print(f"{who}: Soul ID training {result.get('status')} on {len(entry['training'])} images")


def status():
    record = load_record()
    for who, entry in record.items():
        character = studio.call("get_character", {"characterId": entry["characterId"]})
        souls = character.get("souls") or []
        entry["souls"] = [{k: soul.get(k) for k in ("version", "referenceId", "likenessScore", "approved") if k in soul}
                          for soul in souls]
        entry["training_state"] = character.get("training") or character.get("soulStatus") or character.get("soul_status")
        print(who, json.dumps(entry["training_state"])[:200], json.dumps(entry["souls"])[:200])
    save_record(record)


def proof(only=None, attempt=1):
    """One likeness still each; a failed one is made again with --attempt 2 (its own request key)."""
    record = load_record()
    for who, entry in record.items():
        if only and who not in only:
            continue
        result = studio.call("make_soul_still", {"characterId": entry["characterId"], "scene": PROOF_SCENE,
                                                 "aspectRatio": "3:4", "version": SOUL_VERSION,
                                                 "clientRequestId": f"aurixa-cast-proof-{who.lower()}-{attempt}"})
        entry["proof"] = result.get("generationId") or result.get("id")
        save_record(record)
        print(f"{who}: likeness still {entry['proof']}")


def fetch_proofs(folder, only=None):
    """Waits for each likeness still and downloads it to <folder>/proof-<WHO>.png."""
    import time
    record = load_record()
    for who, entry in record.items():
        if (only and who not in only) or not entry.get("proof"):
            continue
        for _ in range(90):
            generation = studio.call("get_generation", {"generationId": entry["proof"]})
            # A completed generation's file can be attached a moment after its status turns.
            if generation.get("status") in studio.SETTLED and (generation["status"] != "completed" or generation.get("outputs")):
                break
            time.sleep(10)
        files = generation.get("outputs") or []
        if generation.get("status") != "completed" or not files:
            print(f"{who}: likeness still {generation.get('status')}")
            continue
        asset_id = files[0]["id"] if isinstance(files[0], dict) else files[0]
        path = Path(folder) / f"proof-{who}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(studio.call("get_asset", {"assetId": asset_id})["url"], path)
        entry["proofAsset"] = asset_id
        save_record(record)
        print(f"{who}: likeness still {path}")


def pack_prompt(shot, description):
    """packPrompt: the description is short enough here that trimDescription(…, 300) leaves it whole."""
    look = description.strip().rstrip(".")
    return " ".join([
        f"The reference images show one person. Make a new, natural photo of exactly the same person: the same face, "
        f"age, skin tone, hair and build{f' ({look})' if look else ''}.",
        shot,
        "They may wear different everyday clothes. Photorealistic, natural skin texture, sharp focus on the face, one "
        "person only, no text, logos or watermarks.",
    ])


def pack_request(who, entry, index):
    character = studio.call("get_character", {"characterId": entry["characterId"]})
    sheet = sorted(character["sheet"], key=lambda image: SHEET_ORDER.index(image["view"]))[:10]  # the painter's slot max
    return {"modelId": PACK_PAINTER,
            "parameters": {**PACK_VALUES, "prompt": pack_prompt(PACK_SHOTS[index], character["description"])},
            "inputs": [{"assetId": image["assetId"], "role": "reference"} for image in sheet]}


def pack(only, price=False):
    record = load_record()
    for who in only:
        entry = record[who]
        if price:
            print(who, json.dumps(studio.call("estimate_generation", pack_request(who, entry, 0)))[:300], f"x {PACK_SIZE}")
            continue
        generations = entry.setdefault("pack", {})
        for index in range(PACK_SIZE):
            request = pack_request(who, entry, index)
            result = studio.call("queue_generation", {**request, "clientRequestId": f"aurixa-cast-pack-{who.lower()}-{index + 1}"})
            generations[str(index + 1)] = {"generationId": result.get("generationId") or result.get("id")}
            save_record(record)
            print(f"{who} pack {index + 1}: {generations[str(index + 1)]['generationId']}")


def fetch_pack(folder, only=None):
    import time
    record = load_record()
    for who, entry in record.items():
        if (only and who not in only) or not entry.get("pack"):
            continue
        for number, item in entry["pack"].items():
            for _ in range(90):
                generation = studio.call("get_generation", {"generationId": item["generationId"]})
                if generation.get("status") in studio.SETTLED and (generation["status"] != "completed" or generation.get("outputs")):
                    break
                time.sleep(10)
            files = generation.get("outputs") or []
            item["status"] = generation.get("status")
            if item["status"] != "completed" or not files:
                print(f"{who} pack {number}: {item['status']}")
                save_record(record)
                continue
            item["assetId"] = files[0]["id"] if isinstance(files[0], dict) else files[0]
            path = Path(folder) / f"pack-{who}-{number}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                urllib.request.urlretrieve(studio.call("get_asset", {"assetId": item["assetId"]})["url"], path)
            save_record(record)
            print(f"{who} pack {number}: {path}")


def keep(choices):
    """JAMIE=1,2,4: those pack photos become training photos too, and the next train uses them."""
    record = load_record()
    for choice in choices:
        who, numbers = choice.split("=")
        entry = record[who]
        kept = [entry["pack"][n]["assetId"] for n in numbers.split(",")]
        for n in entry["pack"]:
            entry["pack"][n]["kept"] = n in numbers.split(",")
        result = studio.call("save_character", {"characterId": entry["characterId"], "photos": kept})
        entry["training"] = [a for a in entry["training"] if a not in kept] + kept
        save_record(record)
        print(f"{who}: {len(kept)} pack photos added ({result.get('added')}); {len(entry['training'])} to train on")


if __name__ == "__main__":
    command = sys.argv[1]
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    if command == "save":
        save(sys.argv[2], only)
    elif command == "train":
        train(only)
    elif command == "status":
        status()
    elif command == "proof":
        proof(only, int(sys.argv[sys.argv.index("--attempt") + 1]) if "--attempt" in sys.argv else 1)
    elif command == "fetch-proofs":
        fetch_proofs(sys.argv[2], only)
    elif command == "pack":
        pack(only, "--price" in sys.argv)
    elif command == "fetch-pack":
        fetch_pack(sys.argv[2], only)
    elif command == "keep":
        keep(sys.argv[2:])
