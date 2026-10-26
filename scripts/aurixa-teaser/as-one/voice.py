#!/usr/bin/env python3
"""As One's voice: the reference's script, word for word (docs/brands/aurixa-teaser/REFERENCE.md), spoken by the
studio's brand voice (Gabby, ElevenLabs) through Xeno Studio's generate_voiceover, kept dry.

  python3 -I scripts/aurixa-teaser/as-one/voice.py <out dir> [take ...]

Each take is asked for once: the same clientRequestId returns the first take instead of paying for another. Writes
<take>.<ext> as the studio keeps it, <take>.wav (48 kHz mono, 24-bit, nothing added) and takes.json (each take's
script, ids, length and words as spoken).
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://canvas-xeno-studio.lovable.app/api/public/studio"
VOICE = "0c84bc60-d601-4345-a165-dc6e031d3128"  # Aurixa Bad Babe: Gabby, ElevenLabs eleven_v4
PROJECT = "5aab251e-737e-4142-8a89-d33578437ff8"  # Aurixa Teaser
VERSION = 1

SCRIPT = [
    "The next generation of property professionals will operate differently.",
    "Not because they'll use more software, not because they'll have more dashboards, and not because AI became another tab.",
    "At a certain level of ambition, the question changes.",
    "Research, clients, reports, finance, communication.",
    "Powerful on their own.",
    "More valuable when they stop behaving like separate destinations.",
    "When intelligence can move, when context can follow, when the business can act as one.",
    "So don't ask what the next tool is.",
    "Ask what happens when the business becomes the system.",
    "Aurixa Systems.",
    "A new operating standard is coming.",
]
# The whole script in one take, as the reference's voice was read: one breath of delivery, cut at its own silences.
TAKES = {"full": " ".join(SCRIPT)}
TAKES.update({f"s{i + 1}": s for i, s in enumerate(SCRIPT)})


def call(op, body, timeout=600):
    req = urllib.request.Request(f"{BASE}/{op}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            answer = json.load(r)
    except urllib.error.HTTPError as e:
        answer = json.loads(e.read() or b"{}")
        raise RuntimeError(f"{op}: HTTP {e.code} {answer.get('error')}") from None
    if "error" in answer:
        raise RuntimeError(f"{op}: {answer['error']}")
    return answer.get("result", answer)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    keys = sys.argv[2:] or ["full"]
    book = out / "takes.json"
    takes = json.loads(book.read_text()) if book.exists() else {}
    for key in keys:
        take = call("generate_voiceover", {"script": TAKES[key], "voiceId": VOICE, "projectId": PROJECT,
                                           "clientRequestId": f"aurixa-as-one-vo-{key}-v{VERSION}"})
        if take.get("status") != "completed":
            raise SystemExit(f"{key}: {take.get('status')}: {json.dumps(take)[:400]}")
        asset = call("get_asset", {"assetId": take["assetId"]})
        url = asset.get("url") or asset.get("signedUrl") or (asset.get("asset") or {}).get("url")
        if not url:
            raise SystemExit(f"{key}: no link in get_asset's answer: {sorted(asset)}")
        ext = {"audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav"}.get(asset.get("mimeType") or asset.get("mime_type"), "mp3")
        src = out / f"{key}.{ext}"
        with urllib.request.urlopen(url, timeout=300) as r:
            src.write_bytes(r.read())
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "48000", "-c:a", "pcm_s24le",
                        str(out / f"{key}.wav")], check=True)
        takes[key] = {"script": TAKES[key], **{k: take.get(k) for k in ("voiceoverId", "assetId", "status", "durationSeconds",
                                                                         "words", "voiceName", "duplicate")}}
        book.write_text(json.dumps(takes, indent=1))
        print(f"{key}: {take.get('durationSeconds')} s, {len(take.get('words') or [])} words"
              f"{' (the first take again)' if take.get('duplicate') else ''}")


if __name__ == "__main__":
    main()
