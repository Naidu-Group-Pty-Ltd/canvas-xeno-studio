#!/usr/bin/env python3
"""We Are Here's generated pictures, made through Xeno Studio's API and kept with the teaser's work: each shot's
keyframe stills, then its moving take from those stills (shots.json, PLAN.md).

  python3 -I scripts/aurixa-teaser/we-are-here/gen.py still <shot> [--take N] [--model NAME]
  python3 -I scripts/aurixa-teaser/we-are-here/gen.py clip <shot> [--take N] [--model NAME]
  python3 -I scripts/aurixa-teaser/we-are-here/gen.py fetch <shot> still|clip [--take N]
  python3 -I scripts/aurixa-teaser/we-are-here/gen.py list

Each generation is asked for once: its clientRequestId is the shot, the kind and the take, so asking again returns
the first instead of paying for another. What was asked for and what came back are kept in book.json beside the
files, in the work's own folder (we-are-here/), so the work's saves keep them.
"""
import argparse
import fcntl
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://canvas-xeno-studio.lovable.app/api/public/studio"
PROJECT = "5aab251e-737e-4142-8a89-d33578437ff8"  # Aurixa Teaser
WORK = "9dd41db4-0e2f-4f25-8a6f-0f7eb0c6a6a5"  # the Aurixa Teaser work
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2] / ".xeno-work" / WORK / "files" / "we-are-here"
VERSION = 1

MODELS = {
    # Stills: 4K, photographic.
    "flare": "00fb17e2-3aea-5fc9-83e9-012ea26f0df1",  # Marketing Studio 2.5 Flare
    "sunburst": "1fd1046f-7f88-509f-b01f-545fd09b6718",  # Marketing Studio 2.5 Sunburst
    "soul-cinema": "34f23162-96f6-5351-8ac2-2a44c285a3e8",
    # Moving takes from a start frame (and an end frame).
    "kling-4k": "2c114a37-6348-51a6-87cd-e75b43f43c5f",  # Kling 3.0 4K (Image to video)
    "kling-pro": "69c83597-2e87-59cc-b4a1-a3b6cbce6648",  # Kling 3.0 Pro (Image to video)
    "kling-o3": "102b7eaa-29af-51dd-9d67-f9abc1860378",  # Kling O3 (First & last frame)
    "seedance": "a12e4ad6-7b6e-4d55-b152-fbee51401b41",  # Seedance 2.5 (Image to video)
}


def call(op, body, timeout=600):
    req = urllib.request.Request(f"{BASE}/{op}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                answer = json.load(r)
            break
        except urllib.error.HTTPError as e:
            answer = json.loads(e.read() or b"{}")
            if e.code >= 500 and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"{op}: HTTP {e.code} {answer.get('error')}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    if "error" in answer:
        raise RuntimeError(f"{op}: {answer['error']}")
    return answer.get("result", answer)


def shots():
    return {shot["key"]: shot for shot in json.loads((HERE / "shots.json").read_text())["shots"]}


def style():
    """The look every still is asked for in, after its own description."""
    return json.loads((HERE / "shots.json").read_text()).get("style", "")


def book_path():
    return ROOT / "book.json"


def load_book():
    path = book_path()
    return json.loads(path.read_text()) if path.exists() else {}


def keep(key, entry):
    """Writes one entry into book.json under a lock, so takes asked for side by side never write over each other."""
    ROOT.mkdir(parents=True, exist_ok=True)
    with open(ROOT / "book.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        book = load_book()
        book[key] = entry
        tmp = book_path().with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(book, indent=1, sort_keys=True))
        tmp.replace(book_path())


def request_id(shot, kind, take):
    return f"we-are-here-v{VERSION}-{shot}-{kind}-{take}"


def queue(model, parameters, inputs, rid):
    body = {"modelId": MODELS.get(model, model), "parameters": parameters, "inputs": inputs,
            "clientRequestId": rid, "projectId": PROJECT, "workId": WORK}
    estimate = call("estimate_generation", {k: body[k] for k in ("modelId", "parameters", "inputs")})
    if estimate.get("costUsd") is not None:
        body["estimatedCostUsd"] = estimate["costUsd"]
    answer = call("queue_generation", body)
    return answer, estimate


def wait(generation_id, every=10, limit=1800):
    until = time.time() + limit
    settled = None
    while True:
        g = call("get_generation", {"generationId": generation_id})
        done = g["status"] in ("completed", "failed", "cancelled", "submission_uncertain")
        # A completed generation's files join the library a moment after it is marked done.
        if done and (g["status"] != "completed" or g.get("outputs")):
            return g
        if done:
            settled = settled or time.time()
            if time.time() - settled > 180:
                return g
        if time.time() > until:
            return g
        time.sleep(every)


def download(asset_id, path):
    asset = call("get_asset", {"assetId": asset_id})
    url = asset.get("downloadUrl") or asset.get("url") or asset.get("signedUrl")
    if not url:
        raise RuntimeError(f"no download link for {asset_id}: {sorted(asset)}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=600) as r, open(path, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    return asset


def still(args):
    shot = shots()[args.shot]
    spec = shot["still"]
    model = args.model or spec.get("model", "flare")
    parameters = dict(spec.get("parameters", {}))
    parameters["prompt"] = f"{spec['prompt']} {style()}".strip()
    if model in ("flare", "sunburst"):
        parameters.setdefault("aspect_ratio", "9:16")
        parameters.setdefault("resolution", "4k")
        parameters.setdefault("quality", "high")
    elif model == "soul-cinema":
        parameters.setdefault("aspect_ratio", "9:16")
        parameters.setdefault("resolution", "1080p")
    inputs = [{"assetId": a, "role": "reference"} for a in spec.get("references", [])]
    return run(args.shot, "still", args.take, model, parameters, inputs, ext="png")


def clip(args):
    shot = shots()[args.shot]
    spec = shot["clip"]
    model = args.model or spec.get("model", "kling-4k")
    parameters = dict(spec.get("parameters", {}))
    parameters["prompt"] = spec["prompt"]
    parameters.setdefault("duration", spec.get("duration", 5))
    book = load_book()

    def asset_of(ref):
        # "<shot>:still:<take>" names a still made here; anything else is a library id.
        if ":" in ref:
            entry = book.get(ref.replace(":", "-"))
            if not entry or not entry.get("assets"):
                raise SystemExit(f"{ref} isn't made yet")
            return entry["assets"][0]
        return ref

    first_role = "first_frame" if model == "kling-o3" else "source"
    inputs = [{"assetId": asset_of(spec["start"]), "role": first_role}]
    if spec.get("end"):
        inputs.append({"assetId": asset_of(spec["end"]), "role": "last_frame"})
    if model.startswith("kling") and model != "kling-o3":
        parameters.setdefault("sound", "off")
    if model == "kling-o3":
        parameters.setdefault("sound", "off")
        parameters.setdefault("aspect_ratio", "9:16")
        parameters.setdefault("mode", "pro")
    if model == "seedance":
        parameters.setdefault("generate_audio", False)
        parameters.setdefault("resolution", "1080p")
    return run(args.shot, "clip", args.take, model, parameters, inputs, ext="mp4")


def run(shot, kind, take, model, parameters, inputs, ext):
    key = f"{shot}-{kind}-{take}"
    entry = load_book().get(key)
    if entry and entry.get("status") == "failed":
        # A request refused outright (no credit, a rejected prompt) made nothing: ask again under a new id.
        entry["retries"] = entry.get("retries", 0) + 1
        entry["generationId"] = None
    if not entry or not entry.get("generationId"):
        retries = (entry or {}).get("retries", 0)
        rid = request_id(shot, kind, take) + (f"-r{retries}" if retries else "")
        answer, estimate = queue(model, parameters, inputs, rid)
        entry = {"shot": shot, "kind": kind, "take": take, "model": model, "parameters": parameters,
                 "inputs": inputs, "generationId": answer.get("generationId") or answer.get("id"), "retries": retries,
                 "estimateUsd": estimate.get("costUsd"), "asked": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        keep(key, entry)
        print(f"{key}: queued {entry['generationId']} on {model} (estimate {entry['estimateUsd']})", flush=True)
    g = wait(entry["generationId"])
    entry["status"] = g["status"]
    entry["costUsd"] = g.get("actual_cost_usd") if g.get("actual_cost_usd") is not None else g.get("estimated_cost_usd")
    entry["error"] = g.get("error_message")
    entry["assets"] = [o["id"] for o in g.get("outputs", [])]
    files = []
    for i, asset_id in enumerate(entry["assets"]):
        path = ROOT / f"{kind}s" / f"{shot}-{take}{'' if i == 0 else chr(97 + i)}.{ext}"
        if not path.exists():
            download(asset_id, path)
        files.append(str(path.relative_to(ROOT)))
    entry["files"] = files
    keep(key, entry)
    print(f"{key}: {g['status']} cost {entry['costUsd']} {files} {entry['error'] or ''}", flush=True)
    return entry


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("what", choices=["still", "clip", "list"])
    parser.add_argument("shot", nargs="?")
    parser.add_argument("--take", type=int, default=1)
    parser.add_argument("--model")
    args = parser.parse_args()
    if args.what == "list":
        for key, entry in sorted(load_book().items()):
            print(key, entry.get("status"), entry.get("model"), entry.get("costUsd"), entry.get("files"))
        return
    (still if args.what == "still" else clip)(args)


if __name__ == "__main__":
    sys.exit(main())
