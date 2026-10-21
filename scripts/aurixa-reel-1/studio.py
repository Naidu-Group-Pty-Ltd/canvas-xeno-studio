"""Runs Reel 1's spec against the studio API (docs/studio-api.md), one stage at a time.

  python3 scripts/aurixa-reel-1/studio.py import-plates <dir of PL-*.png> [--only PL-02A,...]   # import_image, ids into assets.json
  python3 scripts/aurixa-reel-1/studio.py price <stage> [--only ...] [--model clip_kling]   # estimate_generation: nothing is made or billed
  python3 scripts/aurixa-reel-1/studio.py run <stage> [--only P,C-ALEX] [--takes N] [--model clip_kling] [--confirm]
  python3 scripts/aurixa-reel-1/studio.py takes                             # the takes' state again, into takes.json
  python3 scripts/aurixa-reel-1/studio.py pick P=take1 C-MIA=r3-take1       # approved takes' files into assets.json
  python3 scripts/aurixa-reel-1/studio.py import REF-LOOK-OPS=ops.png       # a picture into the library, its id into assets.json

run prints what it would queue; only with --confirm does it queue (billed by the provider), then it
waits and records every take in takes.json. A take's request id is its key and number (and the
item's revision, once its prompt is revised: r2-take1), so running again returns the takes already
made instead of paying twice; --takes 4 adds a fourth. A failed or blocked take is never tried again
by itself. An input written KEY@take is that named take of a frame (a screen swap starts from the approved one).

Stage 5's clips take --model (clip_cinema, the client's choice; clip_seedance or clip_kling) there: a clip goes
from its first frame to its last (when it has one) for its source seconds, and its takes carry the model's short
name (cinema-take1). Cinema Studio takes its frames as reference images, sent as the studio's long videos send them.

The API is the published studio's (XENO_STUDIO_URL, default https://canvas-xeno-studio.lovable.app),
with a personal token in XENO_STUDIO_TOKEN (or one the network adds).
"""
import base64, hashlib, json, os, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC_DIR = ROOT / "docs" / "brands" / "aurixa-reel-1"
BASE = os.environ.get("XENO_STUDIO_URL", "https://canvas-xeno-studio.lovable.app").rstrip("/")
TOKEN = os.environ.get("XENO_STUDIO_TOKEN")
# The plates' version, for their titles. An import's request id is the plate and its file's content, so a
# re-rendered plate imports anew and an unchanged one returns its earlier import.
PLATES_VERSION = "v4"
# get_generation's last states; submission_uncertain waits on a person, so it ends the wait too.
SETTLED = {"completed", "failed", "nsfw", "canceled", "submission_uncertain"}


def call(operation, args, timeout=180):
    request = urllib.request.Request(
        f"{BASE}/api/public/studio/{operation}",
        data=json.dumps(args).encode(),
        # Cloudflare refuses Python's default user agent (error 1010).
        headers={"content-type": "application/json", "user-agent": "aurixa-reel-1/1.0 (studio API script)",
                 **({"authorization": f"Bearer {TOKEN}"} if TOKEN else {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read())["result"]
    except urllib.error.HTTPError as failure:
        body = failure.read().decode(errors="replace")
        try:
            error = json.loads(body)["error"]
        except (ValueError, KeyError):
            error = {"code": failure.code, "message": body[:300]}
        raise RuntimeError(f"{operation}: {error.get('code')} {error.get('message')}") from None


def load(name):
    return json.loads((SPEC_DIR / name).read_text())


def save_ledger(ledger):
    (SPEC_DIR / "assets.json").write_text(json.dumps(ledger, indent=2) + "\n")


def import_plates(folder, only=None):
    ledger = load("assets.json")
    spec = load("spec.json")
    plates = {p["key"]: p for p in next(s for s in spec["stages"] if s["stage"] == 3)["items"]}
    for key, plate in plates.items():
        if only and key not in only:
            continue
        file = Path(folder) / f"{key}.png"
        if not file.exists():
            print(f"{key}: no {file.name}, skipped")
            continue
        data = file.read_bytes()
        result = call("import_image", {
            "title": f"Aurixa Reel 1 · plate {key} · {plate['title']} ({PLATES_VERSION})"[:200],
            "data": base64.b64encode(data).decode(),
            "clientRequestId": f"aurixa-reel1-{key}-{hashlib.sha256(data).hexdigest()[:12]}",
        })
        replaced = ledger.get(key) if ledger.get(key) != result["assetId"] else None
        ledger[key] = result["assetId"]
        print(f"{key}: {result['assetId']} ({'imported' if result['imported'] else 'already imported'}, {result['width']}x{result['height']})"
              + (f"; replaces {replaced}" if replaced else ""))
        save_ledger(ledger)


def asset_of(key, ledger, record):
    """An input's library asset: a ledger key, KEY@take for one named take of a frame (a screen swap's approved take),
    or asset:<id> for a library file named directly (a character's sheet view)."""
    if key.startswith("asset:"):
        return key[len("asset:"):]
    if "@" in key:
        name, take = key.split("@", 1)
        made = record.get(name, {}).get(take, {})
        return made["assets"][0] if made.get("status") == "completed" and made.get("assets") else None
    return ledger.get(key)


def request_for(item, spec, model_key=None):
    """An item's model, parameters, (input key, role) pairs and take-name prefix: a still as the spec writes it,
    a clip (Stage 5) on the model given, from its first frame to its last, for its source seconds."""
    if "first_frame" in item:
        if not model_key:
            sys.exit("Stage 5's clips need --model (clip_cinema, clip_seedance or clip_kling)")
        model = spec["models"][model_key]
        low, high = model["seconds"]
        if not low <= item["seconds"] <= high:
            sys.exit(f"{item['key']}: {item['seconds']} s is outside {model['name']}'s {low} to {high} s")
        if model.get("reference_frames"):
            pairs, prompt = reference_frames(item, spec, model)
        else:
            pairs = [(item["first_frame"], model["roles"]["first"])]
            if item.get("last_frame"):
                pairs.append((item["last_frame"], model["roles"]["last"]))
            prompt = item["prompt"]
        parameters = {**model["parameters"], "prompt": prompt, "duration": item["seconds"]}
        return model, parameters, pairs, model_key.removeprefix("clip_") + "-"
    model = spec["models"][item["model"]]
    return model, item["parameters"], [(key, model["role"]) for key in item.get("inputs", [])], ""


_characters = {}


def reference_frames(item, spec, model):
    """A clip for a model that takes its frames as reference images (Cinema Studio), sent as the studio's long videos
    send it: the first frame as image 1 with the opening that says the clip starts on it, the clip's cast's sheet
    views (everyone's best view first) named in the characters line right after the action, and the last frame as
    the last image with the ending that says the clip ends on it."""
    way = model["reference_frames"]
    role = model["roles"]["first"]
    cast = []
    for shot in spec["shots"]:
        # A clip carries its shot and any shot cut from it (07A from the 06B take, 14A from 13A).
        if shot["source"] == item["key"] or shot["source"] == f"cut from the {item['key'][2:]} take":
            cast += [who for who in shot["cast"] if who not in cast]
    record = json.loads((SPEC_DIR / "characters.json").read_text())
    views = [[(who, record[who]["sheet"][view]) for view in way["cast_views"] if view in record[who]["sheet"]] for who in cast]
    sheets = [entry for round_ in zip(*views) for entry in round_] if views else []  # interleaved, as interleaveSheets
    pairs = [(item["first_frame"], role)] + [(f"asset:{asset}", role) for _, asset in sheets]
    people = []
    for who in cast:
        if who not in _characters:
            _characters[who] = call("get_character", {"characterId": record[who]["characterId"]})
        character = _characters[who]
        where = ", ".join(f"<<<image_{2 + i}>>>" for i, (owner, _) in enumerate(sheets) if owner == who)
        people.append(f"{character['name']} (shown in {where}): {character['description'].strip().rstrip('.')}")
    paragraphs = [way["opening"], item["prompt"]]
    if people:
        keep = "each character" if len(people) > 1 else "them"
        paragraphs.append(f"{'Characters' if len(people) > 1 else 'Character'}: {'. '.join(people)}. Keep {keep} exactly as in "
                          f"their reference images: the same face, hair, build and clothes in every frame.")
    if item.get("last_frame"):
        pairs.append((item["last_frame"], model["roles"]["last"]))
        paragraphs.append(way["ending"].format(n=len(pairs)))
    return pairs, "\n\n".join(paragraphs)


def price(stage_number, only=None, model_key=None):
    spec = load("spec.json")
    ledger = load("assets.json")
    stage = next(s for s in spec["stages"] if s["stage"] == stage_number)
    total, unpriced = 0.0, []
    for item in stage["items"]:
        if only and item["key"] not in only:
            continue
        model, parameters, pairs, _ = request_for(item, spec, model_key)
        record = load_takes()
        inputs = [{"assetId": asset_of(key, ledger, record), "role": role} for key, role in pairs if asset_of(key, ledger, record)]
        missing = [key for key, _ in pairs if not asset_of(key, ledger, record)]
        if missing:
            print(f"{item['key']}: waits on {', '.join(missing)}")
            unpriced.append(item["key"])
            continue
        quote = call("estimate_generation", {"modelId": model["id"], "parameters": parameters, "inputs": inputs})
        takes = item.get("takes", 1)
        if quote.get("ok") and quote.get("costUsd") is not None:
            total += quote["costUsd"] * takes
            print(f"{item['key']}: US${quote['costUsd']:.3f} each × {takes} = US${quote['costUsd'] * takes:.3f}")
        elif quote.get("ok"):
            # Metered (GPT Image is billed by tokens): the rates, settled on completion.
            unpriced.append(item["key"])
            print(f"{item['key']}: metered × {takes}: {quote.get('pricingDescription')}")
        else:
            unpriced.append(item["key"])
            print(f"{item['key']}: not priced ({quote.get('code')}: {quote.get('message') or quote.get('pricingDescription')})")
    print(f"Stage {stage_number}: US${total:.2f} for what was priced" + (f"; not priced: {', '.join(unpriced)}" if unpriced else ""))


def load_takes():
    file = SPEC_DIR / "takes.json"
    return json.loads(file.read_text()) if file.exists() else {}


def save_takes(record):
    (SPEC_DIR / "takes.json").write_text(json.dumps(record, indent=1) + "\n")


def settled(take):
    # A generation reads completed a moment before its file is in the library, so a completed take waits for its file.
    return take["status"] in SETTLED and (take["status"] != "completed" or bool(take.get("assets")))


def settle(record, timeout=45 * 60):
    """Polls every unsettled take until it settles or the time is up, saving as it goes."""
    deadline = time.monotonic() + timeout
    while True:
        waiting = 0
        for key, takes in record.items():
            for name, take in takes.items():
                if settled(take):
                    continue
                g = call("get_generation", {"generationId": take["generationId"]})
                take.update(status=g["status"], assets=[o["id"] for o in g["outputs"]],
                            costUsd=g["actual_cost_usd"] or g["estimated_cost_usd"],
                            error=" ".join(filter(None, [g["error_code"], g["error_message"]])) or None)
                if settled(take):
                    print(f"{key} {name}: {g['status']}" + (f" ({take['error']})" if take["error"] else f", {', '.join(take['assets'])}"))
                else:
                    waiting += 1
        save_takes(record)
        if not waiting or time.monotonic() > deadline:
            break
        time.sleep(15)
    takes = [t for ts in record.values() for t in ts.values()]
    done = [t for t in takes if t["status"] == "completed"]
    cost = sum(float(t["costUsd"] or 0) for t in takes)
    print(f"{len(done)} of {len(takes)} takes made; US${cost:.2f} charged or held" + (f"; {waiting} still running (run takes later)" if waiting else ""))


def pick(choices):
    """Puts each approved take's library file into the ledger, where later stages take their inputs from."""
    record = load_takes()
    ledger = load("assets.json")
    for choice in choices:
        key, _, name = choice.partition("=")
        take = record.get(key, {}).get(name)
        if not take or take["status"] != "completed" or not take.get("assets"):
            sys.exit(f"{choice}: no completed take by that name in takes.json")
        if key not in ledger:
            sys.exit(f"{choice}: {key} isn't in the spec's ledger")
        ledger[key] = take["assets"][0]
        print(f"{key}: {name}, {ledger[key]}")
    save_ledger(ledger)


def import_files(choices):
    """Imports pictures for ledger keys (references, uploads); the same file imported again returns the first import."""
    ledger = load("assets.json")
    for choice in choices:
        key, _, path = choice.partition("=")
        if key not in ledger:
            sys.exit(f"{choice}: {key} isn't in the spec's ledger")
        data = Path(path).read_bytes()
        result = call("import_image", {
            "title": f"Aurixa Reel 1 · reference {key}",
            "data": base64.b64encode(data).decode(),
            "clientRequestId": f"aurixa-reel1-{key}-{hashlib.sha256(data).hexdigest()[:12]}",
        })
        ledger[key] = result["assetId"]
        print(f"{key}: {result['assetId']} ({'imported' if result['imported'] else 'already imported'}, {result['width']}x{result['height']})")
        save_ledger(ledger)


def run(stage_number, only=None, takes=None, confirm=False, model_key=None):
    spec = load("spec.json")
    ledger = load("assets.json")
    stage = next(s for s in spec["stages"] if s["stage"] == stage_number)
    record = load_takes()
    queued = 0
    for item in stage["items"]:
        if only and item["key"] not in only:
            continue
        model, parameters, pairs, prefix = request_for(item, spec, model_key)
        missing = [key for key, _ in pairs if not asset_of(key, ledger, record)]
        if missing:
            print(f"{item['key']}: waits on {', '.join(missing)}")
            continue
        inputs = [{"assetId": asset_of(key, ledger, record), "role": role} for key, role in pairs]
        settings = ", ".join(f"{k} {v}" for k, v in parameters.items() if k != "prompt")
        revision = item.get("revision", 1)
        for take in range(1, (takes or item.get("takes", 1)) + 1):
            name = prefix + (f"take{take}" if revision == 1 else f"r{revision}-take{take}")
            if not confirm:
                print(f"{item['key']} {name}: {model['name']} ({settings}); inputs {', '.join(f'{k} as {r}' for k, r in pairs)}; prompt {len(parameters['prompt'])} characters")
                continue
            started = call("queue_generation", {"modelId": model["id"], "parameters": parameters, "inputs": inputs,
                                                "clientRequestId": f"aurixa-reel1-{item['key']}-{name}"})
            known = record.get(item["key"], {}).get(name)
            if not known or known["generationId"] != started["generationId"]:
                record.setdefault(item["key"], {})[name] = {"generationId": started["generationId"], "status": started["status"]}
            queued += 1
            print(f"{item['key']} {name}: {started['generationId']} {started['status']}" + (f" ({started['budgetWarning']})" if started.get("budgetWarning") else ""))
            save_takes(record)
    if not confirm:
        print("Nothing was queued: add --confirm to queue these (billed by the provider).")
    elif queued:
        settle(record)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("command", choices=["import-plates", "import", "price", "run", "takes", "pick"])
    parser.add_argument("target", nargs="*")
    parser.add_argument("--only", help="item keys, comma separated")
    parser.add_argument("--takes", type=int, help="takes per item (numbered from 1)")
    parser.add_argument("--model", help="Stage 5: the clip model (clip_cinema, clip_seedance or clip_kling)")
    parser.add_argument("--confirm", action="store_true", help="queue for real (billed)")
    args = parser.parse_args()
    if args.command == "import-plates":
        import_plates(args.target[0], set(args.only.split(",")) if args.only else None)
    elif args.command == "price":
        price(int(args.target[0]), set(args.only.split(",")) if args.only else None, args.model)
    elif args.command == "run":
        run(int(args.target[0]), set(args.only.split(",")) if args.only else None, args.takes, args.confirm, args.model)
    elif args.command == "pick":
        pick(args.target)
    elif args.command == "import":
        import_files(args.target)
    else:
        settle(load_takes(), timeout=0)
