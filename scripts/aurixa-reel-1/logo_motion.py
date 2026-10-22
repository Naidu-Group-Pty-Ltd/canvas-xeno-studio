"""The logo in motion for Reel 1 (system edition): its clean plate, the frames a video model starts and ends
on, and the takes, made through the studio API (docs/studio-api.md) and recorded in logo-takes.json.

At the client's direction (22 October 2026) the logo's moments are made with a video model rather than masks
alone: the reveal in 04.1, and the living logo on the trial and closing cards (10.2, 11.1, 15.1). The model
never draws the lettering, because video models garble text: it is given the logo's clean plate, the supplied
art with AURIXA SYSTEMS taken out, and the supplied wordmark and emblem (exact crops of the art) are laid over
its footage where the art has them.

  python3 scripts/aurixa-reel-1/logo_motion.py clean <assetsDir> <edit.png>   # logo-clean.png from an edit of the art
  python3 scripts/aurixa-reel-1/logo_motion.py frames <assetsDir> <outDir>    # the input frames, as PNG
  python3 scripts/aurixa-reel-1/logo_motion.py price <outDir> [--only A1,B1]   # import them, price every take
  python3 scripts/aurixa-reel-1/logo_motion.py run <outDir> [--only A1] [--take 2] [--confirm]   # queue, wait, download
  python3 scripts/aurixa-reel-1/logo_motion.py fetch <outDir>                 # the takes' state again, and their files

The clean plate: the art was edited once (Marketing Studio 2.5 Sunburst image edit, 2048 x 1360, told to take
the words and their shadow out and keep everything else), registered to the art (ECC, affine; it lay within a
third of a pixel), and blended into the art only where the lettering and its shadow were (the wordmark's alpha,
dilated 45 px and feathered), so every other pixel is the supplied art's own.

A take's request id is its key, take number and the content of its request, so running again returns the take
already made rather than paying twice.
"""
import base64, hashlib, json, subprocess, sys, time, urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from studio import call, SETTLED  # noqa: E402

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
LEDGER = ROOT / "docs" / "brands" / "aurixa-reel-1" / "system-edition" / "logo-takes.json"
MODEL_PATH = "kling-video/v3.0/4k/image-to-video"
# The lockup in the supplied art (2000 x 1333): emblem.png and wordmark.png are exact crops of it.
WORDMARK_IN_ART = (561, 931, 882, 187)
# The cards' crop of the art: 16:9 about its centre (the sky above and the floor below fall under the
# cards' own vignette, which logoArt draws over the art).
CARD_CROP = (0, 104, 2000, 1229)

NO_TEXT = "No text, no letters, no words, no logos other than the emblem itself."
TAKES = {
    "A1": {
        "use": "04.1, the reveal: the dark navy night to the logo",
        "first": "hero-ground.png",
        "last": "hero-logo.png",
        "duration": 5,
        "prompt": (
            "Premium cinematic logo reveal. The frame opens on a dark navy night. A thin line of warm gold light "
            "draws across the horizon from the centre outwards; from it a polished gold triangular emblem rises "
            "and forms, a bright highlight sweeping along its bevelled metal edges. The glass orb at its heart "
            "ignites with a cool blue glow and a soft lens flare. Fine gold rings of light expand around the "
            "emblem and settle. A night city skyline fades up behind it, its windows lighting in gentle waves, "
            "reflected in a dark glossy floor with a glowing blue grid. Tiny gold particles drift and settle. "
            "Locked-off camera with a very slow push in. Elegant, restrained, luxurious; deep navy and gold. "
            + NO_TEXT
        ),
    },
    "A2": {
        "use": "04.1, the reveal made backwards: the logo dissolving into the night, played in reverse",
        "first": "hero-logo.png",
        "duration": 5,
        "reverse": True,
        "prompt": (
            "Locked-off camera. The polished gold triangular emblem slowly breaks apart into thousands of fine "
            "glowing gold particles that drift gently upward and outward and fade into the dark; the gold rings "
            "around it contract and dissolve into light; the glass orb's blue glow dims last. The night city "
            "skyline and its reflections fade away into the dark navy night, and the thin gold horizon line "
            "retracts into a single bright point that goes out. At the end only the dark navy night remains. "
            "Smooth, slow, elegant, premium. " + NO_TEXT
        ),
    },
    "B1": {
        "use": "10.2, 11.1 and 15.1: the logo alive on the trial and closing cards",
        "first": "card-logo.png",
        "last": "card-logo.png",
        "duration": 10,
        "prompt": (
            "Locked-off camera, no zoom, no rotation. The scene stays exactly as it is, subtly alive: a slow soft "
            "highlight glides along the polished gold edges of the triangular emblem; the glass orb at its heart "
            "glows and gently breathes in cool blue; the fine gold rings shimmer softly; the city skyline's "
            "windows twinkle and its reflections ripple faintly on the glossy floor; a few tiny gold particles "
            "drift slowly. Seamless loop, elegant and premium. " + NO_TEXT
        ),
    },
}


def clean_plate(assets, edit_file):
    """The art with its lettering taken out: the edit, registered to the art, blended in where the lettering was."""
    import cv2

    art = cv2.imread(str(assets / "logo-art.png")).astype(np.float32)
    h, w = art.shape[:2]
    edit = cv2.resize(cv2.imread(str(edit_file)), (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)
    g1 = cv2.cvtColor(art, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(edit, cv2.COLOR_BGR2GRAY)
    keep = np.zeros((h, w), np.uint8)
    keep[60:880, 60:w - 60] = 255  # registered on what the edit was told to keep: everything above the lettering
    warp = np.eye(2, 3, dtype=np.float32)
    cc, warp = cv2.findTransformECC(g1, g2, warp, cv2.MOTION_AFFINE,
                                    (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), keep, 5)
    edit = cv2.warpAffine(edit, warp, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_REFLECT)
    wm = np.asarray(Image.open(assets / "wordmark.png"))
    x, y, ww, wh = WORDMARK_IN_ART
    letters = np.zeros((h, w), np.uint8)
    letters[y:y + wh, x:x + ww] = (wm[..., 3] > 6).astype(np.uint8) * 255
    m = cv2.dilate(letters, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (91, 91))).astype(np.float32) / 255
    m = np.clip(cv2.GaussianBlur(m, (0, 0), 14) * 1.6, 0, 1)[..., None]
    out = art * (1 - m) + edit * m
    cv2.imwrite(str(assets / "logo-clean.png"), out.clip(0, 255).round().astype(np.uint8))
    kept = np.abs(edit - art).mean(axis=2)[60:880, 60:w - 60].mean()
    print(f"logo-clean.png: registration {cc:.4f}, warp {np.round(warp, 4).tolist()}, "
          f"edit against the art where it was kept: {kept:.2f} levels")


def frames(assets, out):
    out.mkdir(parents=True, exist_ok=True)
    subprocess.run(["node", str(HERE / "logo.cjs"), str(out), str(assets)], check=True)
    Image.open(assets / "logo-clean.png").convert("RGB").crop(CARD_CROP).save(out / "card-logo.png")
    print("card-logo.png")


def load_ledger():
    return json.loads(LEDGER.read_text()) if LEDGER.exists() else {"frames": {}, "takes": {}}


def save_ledger(ledger):
    LEDGER.write_text(json.dumps(ledger, indent=1) + "\n")


def import_frames(out, ledger, keys):
    for name in sorted({TAKES[k][r] for k in keys for r in ("first", "last") if r in TAKES[k]}):
        data = (out / name).read_bytes()
        digest = hashlib.sha256(data).hexdigest()[:16]
        known = ledger["frames"].get(name)
        if known and known["sha"] == digest:
            continue
        result = call("import_image", {
            "title": f"Aurixa Reel 1 · logo motion · {name} ({digest[:8]})",
            "data": base64.b64encode(data).decode(),
            "clientRequestId": f"aurixa-reel1-logo-{name.split('.')[0]}-{digest}",
        }, timeout=300)
        ledger["frames"][name] = {"sha": digest, "assetId": result["assetId"],
                                  "size": [result["width"], result["height"]]}
        print(f"{name}: {result['assetId']} ({'imported' if result['imported'] else 'already imported'}, "
              f"{result['width']}x{result['height']})")
        save_ledger(ledger)


def model_id():
    for m in call("list_models", {"output": "video", "search": "kling 4k"}):
        if m["path"] == MODEL_PATH:
            return m["id"]
    raise SystemExit(f"No active model {MODEL_PATH}")


def request(key, ledger, mid):
    t = TAKES[key]
    inputs = [{"assetId": ledger["frames"][t["first"]]["assetId"], "role": "source"}]
    if "last" in t:
        inputs.append({"assetId": ledger["frames"][t["last"]]["assetId"], "role": "last_frame"})
    return {"modelId": mid, "parameters": {"prompt": t["prompt"], "duration": t["duration"], "sound": "off",
                                           "cfg_scale": 0.5}, "inputs": inputs}


def refused_for_balance(take):
    """A take the provider turned away for its credit balance: nothing was made or billed."""
    return take.get("status") == "failed" and "credit balance" in str(take.get("error") or "")


def download(asset_id, dest):
    a = call("get_asset", {"assetId": asset_id})
    req = urllib.request.Request(a["url"], headers={"user-agent": "aurixa-reel-1/1.0 (studio API script)"})
    with urllib.request.urlopen(req, timeout=900) as r:
        dest.write_bytes(r.read())
    return a


def settle(out, ledger, timeout=60 * 60):
    """Polls every unsettled take, downloads each one's file when it is done, and saves as it goes."""
    deadline = time.monotonic() + timeout
    while True:
        waiting = 0
        for name, take in ledger["takes"].items():
            if take.get("status") in SETTLED and (take["status"] != "completed" or take.get("file")):
                continue
            g = call("get_generation", {"generationId": take["generationId"]})
            take.update(status=g["status"], costUsd=g["actual_cost_usd"] or g["estimated_cost_usd"],
                        error=" ".join(filter(None, [g["error_code"], g["error_message"]])) or None)
            if g["status"] == "completed" and g["outputs"]:
                o = g["outputs"][0]
                dest = out / f"take-{name}.mp4"
                a = download(o["id"], dest)
                take.update(asset=o["id"], file=dest.name, size=[a["width"], a["height"]],
                            seconds=a["duration_seconds"], fps=a.get("fps"))
                print(f"{name}: completed → {dest} ({a['width']}x{a['height']}, {a['duration_seconds']} s, {a.get('fps')} fps)")
            elif g["status"] in SETTLED and g["status"] != "completed":
                print(f"{name}: {g['status']} ({take['error']})")
            else:
                waiting += 1
        save_ledger(ledger)
        if not waiting or time.monotonic() > deadline:
            return waiting
        time.sleep(20)


def main():
    cmd = sys.argv[1]
    if cmd == "clean":
        clean_plate(Path(sys.argv[2]), Path(sys.argv[3]))
        return
    if cmd == "frames":
        frames(Path(sys.argv[2]), Path(sys.argv[3]))
        return
    out = Path(sys.argv[2])
    ledger = load_ledger()
    if cmd == "fetch":
        settle(out, ledger, timeout=0)
        return
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else list(TAKES)
    take_no = int(sys.argv[sys.argv.index("--take") + 1]) if "--take" in sys.argv else 1
    import_frames(out, ledger, only)
    mid = model_id()
    if cmd == "price":
        total = 0.0
        for key in only:
            q = call("estimate_generation", request(key, ledger, mid))
            total += q.get("costUsd") or 0
            print(f"{key}: {TAKES[key]['duration']} s at 4K, US${q.get('costUsd')}"
                  + (f" ({q.get('code')}: {q.get('message')})" if not q.get("ok") else ""))
        print(f"total US${total:.2f}")
        return
    if cmd == "run":
        for key in only:
            body = request(key, ledger, mid)
            digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:12]
            name = f"{key}-take{take_no}"
            q = call("estimate_generation", body)
            print(f"{name}: {TAKES[key]['use']}; {TAKES[key]['duration']} s at 4K, US${q.get('costUsd')}")
            if "--confirm" not in sys.argv:
                continue
            known = ledger["takes"].get(name, {})
            if known.get("status") in ("completed", "queued", "processing", "submitting", "local_queued") \
                    and known.get("digest") == digest:
                print(f"{name}: already {known['status']} as {known['generationId']}")
                continue
            # A take the provider refused for its balance made and billed nothing, so it is asked for again
            # under a request id of its own (the same id would return the refusal).
            refused = [*known.get("refused", []), known["generationId"]] if refused_for_balance(known) else []
            request_id = f"aurixa-reel1-logo-{name}-{digest}" + (f"-after-refusal-{len(refused)}" if refused else "")
            started = call("queue_generation", {**body, "estimatedCostUsd": q.get("costUsd"),
                                                "clientRequestId": request_id}, timeout=300)
            if known.get("generationId") != started["generationId"]:
                ledger["takes"][name] = {"key": key, "use": TAKES[key]["use"], "digest": digest,
                                         "generationId": started["generationId"], "status": started["status"],
                                         "reverse": bool(TAKES[key].get("reverse")),
                                         **({"refused": refused} if refused else {})}
            save_ledger(ledger)
            print(f"{name}: {started['generationId']} {started['status']}"
                  + (f" ({started['budgetWarning']})" if started.get("budgetWarning") else ""))
        if "--confirm" not in sys.argv:
            print("Nothing was queued: add --confirm to queue these (billed by the provider).")
            return
        left = settle(out, ledger)
        if left:
            print(f"{left} still running; `fetch` collects them later")


if __name__ == "__main__":
    main()
