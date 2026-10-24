"""Reel 2's shots on the voice's clock: where each cut falls, from the voiceover's words.

  python3 -I scripts/aurixa-reel-2/shot_times.py [docs/brands/aurixa-reel-2/voiceover-words.json]

Reel 1's rule (HANDOVER 1.4, step 1): a cut sits in the pause before its cue's first word, 0.15 s
ahead of where speech starts, or 0.1 s ahead mid-phrase, on the 30 fps grid. Where a measured
silence ends just before the cue word, speech starts at the silence's end; otherwise at the word.
These are the voice's own times, before the film is paced to its music (which only adds frames in
the silences, so the order and the words never move). The words are provisional until the studio
prepares the voice, so every time here is too.
"""

import json
import math
import sys
from pathlib import Path

FPS = 30
ROOT = Path(__file__).resolve().parents[2]
WORDS = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else ROOT / "docs/brands/aurixa-reel-2/voiceover-words.json"
)

# (shot, its cue: the first words it covers, the time they are said near, its words as the script spells them)
SHOTS = [
    (
        "01.1",
        "One property",
        0.0,
        "One property, six property professionals, and somehow the client becomes the messenger.",
    ),
    ("01.2", "Sound familiar", 6.6, "Sound familiar?"),
    (
        "02.1",
        "The perfect",
        7.9,
        "The perfect property is found, but the requests keep coming.",
    ),
    (
        "02.2",
        "Another identity",
        12.3,
        "Another identity check, another document, another explanation.",
    ),
    ("02.3", "Suddenly", 17.3, "Suddenly, progress feels like paperwork."),
    (
        "03.1",
        "That's where",
        20.3,
        "That's where Aurixa Systems changes the experience.",
    ),
    (
        "03.2",
        "Built by",
        23.8,
        "Built by property professionals for property professionals,",
    ),
    (
        "03.3",
        "ARIXA brings",
        27.6,
        "Aurixa brings property intelligence, financial analysis, reporting, client management, communication and more into one connected operating environment.",
    ),
    ("03.4", "And here's", 38.2, "And here's where it gets exciting."),
    (
        "04.1",
        "Introducing",
        40.2,
        "Introducing the Aurixa AML/CTF Compliance Passport.",
    ),
    ("04.2", "One digital", 44.7, "One digital passport, one organised client record,"),
    (
        "04.3",
        "identity verification",
        48.6,
        "identity verification, screening and due diligence, all in one place.",
    ),
    (
        "05.1",
        "With appropriate",
        53.9,
        "With appropriate consent and controlled access,",
    ),
    (
        "05.2",
        "authorized property",
        56.6,
        "authorised property partners can securely access the client's Compliance Passport in just a few clicks,",
    ),
    (
        "05.3",
        "supporting legislative",
        63.0,
        "supporting legislative compliance while eliminating unnecessary duplication.",
    ),
    ("06.1", "The result", 67.8, "The result?"),
    (
        "06.2",
        "Less paperwork",
        68.9,
        "Less paperwork, less repetition, better-connected professionals and a smoother property journey, without clients constantly providing the same information.",
    ),
    ("07.1", "And that's", 79.1, "And that's just one part of Aurixa Systems."),
    (
        "07.2",
        "Experience it",
        81.8,
        "Experience it yourself with a 14-day free trial, and discover what a truly connected business can achieve.",
    ),
    (
        "08.1",
        "14 days",
        88.7,
        "Fourteen days. Your business. Your experience. Your decision.",
    ),
    (
        "09.1",
        "ARIXA Systems,",
        93.5,
        "Aurixa Systems. The operating system for modern property professionals. Start your free trial today.",
    ),
]


# What the recogniser writes for what the script says: its own spellings, never the captions'.
HEARD_AS = {
    "aurixa": "arixa",
    "organised": "organized",
    "authorised": "authorized",
    "amlctf": "aml ctf",
    "betterconnected": "better connected",
    "fourteen": "14",
}


BLOCKS = {
    "01": "The messenger",
    "02": "The requests",
    "03": "One connected system",
    "04": "The Passport",
    "05": "Shared, with consent",
    "06": "The result",
    "07": "One part of Aurixa",
    "08": "Your decision",
    "09": "The closing card",
}


def clock(seconds):
    return f"{int(seconds // 60):02d}:{seconds % 60:06.3f}"


def norm(text):
    return "".join(ch for ch in text.lower() if ch.isalnum() or ch == " ").split()


def heard(text):
    """The script's words as the recogniser spells them, to check one against the other."""
    return " ".join(
        HEARD_AS.get(t, t) for t in norm(text.replace("/", "").replace("-", ""))
    ).split()


def shots(data):
    """Each shot on the voice's clock: (id, in, out, seconds, script, first word, word after its last), in order.
    Exits if the script and the voice disagree."""
    words, silences, end = data["words"], data["silences"], data["seconds"]
    rows = []
    for shot, cue, near, _ in SHOTS:
        want = norm(cue)
        hits = [
            i
            for i in range(len(words) - len(want) + 1)
            if [norm(w["text"])[0] for w in words[i : i + len(want)]] == want
        ]
        if not hits:
            sys.exit(f"{shot}: its cue '{cue}' is not in the words")
        i = min(hits, key=lambda k: abs(words[k]["start"] - near))
        start = words[i]["start"]
        before = [
            s for s in silences if s["end"] <= start + 0.08 and s["end"] >= start - 0.4
        ]
        if i == 0:
            cut = 0.0
        elif before:
            cut = max(before[-1]["start"], before[-1]["end"] - 0.15)
        else:
            cut = start - 0.1
        frame = math.floor(cut * FPS + 1e-6)
        rows.append((shot, frame, i))
    out, wrong = [], []
    for n, (shot, frame, i) in enumerate(rows):
        nxt = rows[n + 1][1] if n + 1 < len(rows) else math.ceil(end * FPS)
        last = rows[n + 1][2] if n + 1 < len(rows) else len(words)
        said = [
            t.replace("-", "")
            for w in words[i:last]
            for t in norm(w["text"].replace("-", ""))
        ]
        script = SHOTS[n][3]
        if heard(script) != said:
            wrong.append(f"{shot}: the script says {heard(script)}, the voice {said}")
        out.append((shot, frame / FPS, nxt / FPS, (nxt - frame) / FPS, script, i, last))
    if wrong:
        sys.exit("The script and the voice disagree:\n" + "\n".join(wrong))
    return out


def main():
    out = shots(json.loads(WORDS.read_text()))
    print("| Shot | Block | In | Out | Seconds | Words, as the script spells them |")
    print("| ---- | ----- | -- | --- | ------- | -------------------------------- |")
    for shot, a, b, secs, script, _, _ in out:
        print(
            f"| {shot} | {BLOCKS[shot[:2]]} | {clock(a)} | {clock(b)} | {secs:.3f} | {script} |"
        )


if __name__ == "__main__":
    main()
