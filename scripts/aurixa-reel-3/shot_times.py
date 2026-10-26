"""Reel 3's shots on the voice's clock: where each cut falls, from the voiceover's words.

  python3 -I scripts/aurixa-reel-3/shot_times.py [docs/brands/aurixa-reel-3/voiceover-words.json]

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
    else ROOT / "docs/brands/aurixa-reel-3/voiceover-words.json"
)

# (shot, its cue: the first words it covers, the time they are said near, its words as the script spells them)
SHOTS = [
    ("01.1", "Your client has", 0.0, "Your client has found the property."),
    ("01.2", "The big", 2.3, "The big question?"),
    ("01.3", "Can they", 3.4, "Can they afford it?"),
    (
        "02.1",
        "Traditionally",
        4.9,
        "Traditionally, answering that means chasing documents,",
    ),
    ("02.2", "juggling", 8.1, "juggling spreadsheets,"),
    (
        "02.3",
        "and waiting",
        9.6,
        "and waiting on internal teams and external partners.",
    ),
    ("03.1", "With ARIXA", 12.8, "With Aurixa Systems, everything changes."),
    (
        "04.1",
        "One simple",
        16.1,
        "One simple client questionnaire captures and organises their information,",
    ),
    ("04.2", "seamlessly", 20.6, "seamlessly populating their client card."),
    ("05.1", "Now", 23.3, "Now, here's where speed meets opportunity."),
    (
        "05.2",
        "With just",
        26.4,
        "With just one click, Aurixa turns client information into magic,",
    ),
    (
        "05.3",
        "where one",
        30.9,
        "where one aspect allows you to obtain an indicative borrowing capacity assessment,",
    ),
    (
        "05.4",
        "revealing",
        35.6,
        "revealing estimated purchasing power, deposit requirements, financial commitments,",
    ),
    (
        "05.5",
        "and key",
        40.7,
        "and key considerations tailored to their specific circumstances.",
    ),
    (
        "05.6",
        "From information",
        45.4,
        "From information to financial insight in moments.",
    ),
    ("06.1", "And why", 49.0, "And why stop there?"),
    ("06.2", "Bring their", 50.5, "Bring their chosen property into focus."),
    (
        "06.3",
        "Adjust deposits",
        52.9,
        "Adjust deposits, explore financial structures, model purchasing scenarios,",
    ),
    (
        "06.4",
        "and generate",
        58.1,
        "and generate professional reports that turn numbers into meaningful decisions.",
    ),
    ("07.1", "Ready for", 63.0, "Ready for the next step?"),
    ("07.2", "One click", 64.5, "One click, one connected handover."),
    (
        "07.3",
        "Share assessments",
        67.3,
        "Share assessments and scenarios directly with yours or their allocated finance broker",
    ),
    (
        "07.4",
        "through ARIXA's",
        72.5,
        "through Aurixa's partner portal, enabling professional review without repeating the entire process.",
    ),
    ("08.1", "Your client gains", 78.9, "Your client gains clarity and transparency,"),
    ("08.2", "and the broker", 81.7, "and the broker gains context."),
    ("08.3", "Your business gains", 83.8, "Your business gains momentum."),
    ("09.1", "And that's", 86.1, "And that's just the beginning."),
    (
        "09.2",
        "Property intelligence",
        87.9,
        "Property intelligence, financial analysis, professional reporting, client communication and partner collaboration are all connected,",
    ),
    (
        "09.3",
        "with the",
        96.2,
        "with the Aurixa Agent in your arsenal supporting you wherever your business takes you.",
    ),
    (
        "10.1",
        "This means",
        101.6,
        "This means less administration, faster answers, smarter collaboration, more opportunities to deliver results.",
    ),
    (
        "11.1",
        "Erixa Systems has",
        109.8,
        "Aurixa Systems has arrived and has been built by property professionals for property professionals.",
    ),
    (
        "12.1",
        "Experience the",
        116.2,
        "Experience the difference with a 14-day free trial.",
    ),
    (
        "13.1",
        "Your business your",
        119.6,
        "Your business, your experience, your decision.",
    ),
    (
        "14.1",
        "Erixa Systems the",
        123.3,
        "Aurixa Systems, the operating system for modern property professionals. Start your free trial today.",
    ),
]

# What the recognisers write for what the script says: their own spellings, never the captions'. Both read
# "Aurixa" two ways (ARIXA, Erixa); each is held to the script's one spelling here.
HEARD_AS = {
    "arixa": "aurixa",
    "erixa": "aurixa",
    "arixas": "aurixas",
    "erixas": "aurixas",
    "organizes": "organises",
}

BLOCKS = {
    "01": "The question",
    "02": "The old way",
    "03": "Everything changes",
    "04": "The questionnaire",
    "05": "One click",
    "06": "The chosen property",
    "07": "The handover",
    "08": "What each gains",
    "09": "Just the beginning",
    "10": "What it means",
    "11": "Arrived",
    "12": "The free trial",
    "13": "Your decision",
    "14": "The closing card",
}


def clock(seconds):
    return f"{int(seconds // 60):02d}:{seconds % 60:06.3f}"


def norm(text):
    return "".join(ch for ch in text.lower() if ch.isalnum() or ch == " ").split()


def heard(word):
    """A recogniser's word as the script spells it."""
    return HEARD_AS.get(word, word)


def shots(data):
    """Each shot on the voice's clock: (id, in, out, seconds, script, first word, word after its last), in order.
    Exits if the script and the voice disagree."""
    words, silences, end = data["words"], data["silences"], data["seconds"]
    rows = []
    for shot, cue, near, _ in SHOTS:
        want = [heard(t) for t in norm(cue)]
        hits = [
            i
            for i in range(len(words) - len(want) + 1)
            if [heard(norm(w["text"])[0]) for w in words[i : i + len(want)]] == want
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
            heard(t) for w in words[i:last] for t in norm(w["text"].replace("-", ""))
        ]
        script = SHOTS[n][3]
        written = [heard(t) for t in norm(script.replace("-", ""))]
        if written != said:
            wrong.append(f"{shot}: the script says {written}, the voice {said}")
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
