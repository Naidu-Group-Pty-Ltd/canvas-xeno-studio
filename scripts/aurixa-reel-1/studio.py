"""Runs Reel 1's spec against the studio API (docs/studio-api.md), one stage at a time.

  python3 scripts/aurixa-reel-1/studio.py import-plates <dir of PL-*.png>   # import_image, ids into assets.json
  python3 scripts/aurixa-reel-1/studio.py price <stage>                     # estimate_generation: nothing is made or billed

The API is the published studio's (XENO_STUDIO_URL, default https://canvas-xeno-studio.lovable.app),
with a personal token in XENO_STUDIO_TOKEN (or one the network adds). Nothing here queues a generation.
"""
import base64, json, os, sys, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC_DIR = ROOT / "docs" / "brands" / "aurixa-reel-1"
BASE = os.environ.get("XENO_STUDIO_URL", "https://canvas-xeno-studio.lovable.app").rstrip("/")
TOKEN = os.environ.get("XENO_STUDIO_TOKEN")
# The plates' version: a new one imports new assets; the same one returns the earlier import.
PLATES_VERSION = "v2"


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


def import_plates(folder):
    ledger = load("assets.json")
    spec = load("spec.json")
    plates = {p["key"]: p for p in next(s for s in spec["stages"] if s["stage"] == 3)["items"]}
    for key, plate in plates.items():
        file = Path(folder) / f"{key}.png"
        if not file.exists():
            print(f"{key}: no {file.name}, skipped")
            continue
        result = call("import_image", {
            "title": f"Aurixa Reel 1 · plate {key} · {plate['title']} ({PLATES_VERSION})"[:200],
            "data": base64.b64encode(file.read_bytes()).decode(),
            # One id per plate and version: importing again returns the first import.
            "clientRequestId": f"aurixa-reel1-{key}-{PLATES_VERSION}",
        })
        replaced = ledger.get(key) if ledger.get(key) != result["assetId"] else None
        ledger[key] = result["assetId"]
        print(f"{key}: {result['assetId']} ({'imported' if result['imported'] else 'already imported'}, {result['width']}x{result['height']})"
              + (f"; replaces {replaced}" if replaced else ""))
        save_ledger(ledger)


def price(stage_number):
    spec = load("spec.json")
    ledger = load("assets.json")
    stage = next(s for s in spec["stages"] if s["stage"] == stage_number)
    models = spec["models"]
    total, unpriced = 0.0, []
    for item in stage["items"]:
        model = models[item["model"]]
        inputs = [{"assetId": ledger[key], "role": model["role"]} for key in item.get("inputs", []) if ledger.get(key)]
        missing = [key for key in item.get("inputs", []) if not ledger.get(key)]
        if missing:
            print(f"{item['key']}: waits on {', '.join(missing)}")
            unpriced.append(item["key"])
            continue
        quote = call("estimate_generation", {"modelId": model["id"], "parameters": item["parameters"], "inputs": inputs})
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


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "import-plates":
        import_plates(sys.argv[2])
    elif command == "price":
        price(int(sys.argv[2]))
    else:
        sys.exit(__doc__)
