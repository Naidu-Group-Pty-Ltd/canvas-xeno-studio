"""Reel 2's brief as data: every shot, its beats on the voiceover's words, and the captions.

  python3 -I scripts/aurixa-reel-2/brief.py     # writes docs/brands/aurixa-reel-2/brief.json and BRIEF.md

The cuts are shot_times.py's (Reel 1's rule on the measured words). Every beat is anchored to a word the voice says
(or to its shot's first frame), never typed as a time, so when the film is paced to its music (pacing.json, written by
pacing.py, which holds the voice open in its own silences) every beat and caption moves with its word: a cut or a
beat by every pause before it, a word by every pause at or before it (Reel 1's warp_cut and warp_word).
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import itertools

import shot_times

FPS = 30
DOCS = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-2"
WORDS = DOCS / "voiceover-words.json"
PACING = DOCS / "pacing.json"


def key(text):
    return "".join(ch for ch in text.lower() if ch.isalnum())


# ------------------------------------------------------------------------------------------------ the clocks
def pauses():
    """The pauses pacing.py holds the voice open with (none until the music is chosen)."""
    if not PACING.exists():
        return []
    return json.loads(PACING.read_text())["pauses"]


def warp_cut(t):
    """A cut's or a beat's time on the film's clock: moved by every pause before it."""
    return t + sum(p["frames"] / FPS for p in pauses() if p["at"] < t - 1e-6)


def warp_word(t):
    """A word's time on the film's clock: moved by every pause at or before it."""
    return t + sum(p["frames"] / FPS for p in pauses() if p["at"] <= t + 1e-6)


def on_frame(t):
    return round(round(t * FPS) / FPS, 3)


# ------------------------------------------------------------------------------------------------ the anchors
def IN(d=0.0):
    """The shot's first frame, plus d seconds."""
    return {"in": d}


def W(word, n=0, d=0.0):
    """The n-th time the shot's words say `word` (as a key: lower case, letters and digits), plus d seconds."""
    return {"word": key(word), "n": n, "d": d}


# ------------------------------------------------------------------------------------------------ the shots
# Each shot: its block, kind, palette ("before" is today's paper desktop; "aurixa" is the brand's navy, from 03.1),
# title, the graphics it draws (sources), its camera, what it ends on (result), what is legible on screen, notes,
# and its beats: (anchor, what happens).
SHOTS = {
    "01.1": {
        "kind": "graphic",
        "palette": "before",
        "title": "One property, six professionals, and the client in the middle",
        "sources": ["G-SWITCHBOARD", "KIT listing card (P)"],
        "camera": "Still; the frame is composed from its first frame (never faded in), and drifts in 3% across the shot.",
        "result": "Six lit role chips round the property, the client in the middle, envelopes shuttling through them.",
        "on_screen": [
            "14 Wattle Grove, Banksia Rise NSW 2155",
            "New build",
            "Buyer's agent",
            "Finance broker",
            "Solicitor / conveyancer",
            "Accountant",
            "Builder",
            "Developer",
            "Jordan Ellis",
        ],
        "notes": "Six roles, as decided (the plan, decision 6). The client is initials on a chip: no face anywhere in the reel.",
        "beats": [
            (
                IN(),
                "14 Wattle Grove's card (its photograph, address and New build) sits in the middle of today's paper desktop, ringed by six unlit role chips.",
            ),
            (
                W("six"),
                "The six chips light in turn, about 0.18 s apart: Buyer's agent, Finance broker, Solicitor / conveyancer, Accountant, Builder, Developer.",
            ),
            (
                W("client"),
                "Jordan Ellis's chip (JE, the client) drops into the middle, below the card, and every chip's line now runs through it.",
            ),
            (
                W("messenger"),
                "Envelopes start shuttling along the lines, each one from a professional to the client and on to another.",
            ),
        ],
    },
    "01.2": {
        "kind": "graphic",
        "palette": "before",
        "title": "Sound familiar?",
        "sources": ["G-SWITCHBOARD"],
        "camera": "A slow push towards the client's chip.",
        "result": "The switchboard frozen, the client's chip pulsing.",
        "on_screen": ["Jordan Ellis"],
        "notes": "",
        "beats": [
            (IN(), "Everything freezes mid-flight: the envelopes stop where they are."),
            (W("familiar"), "The client's chip pulses once, a ring going out from it."),
        ],
    },
    "02.1": {
        "kind": "graphic",
        "palette": "before",
        "title": "The perfect property is found, and the requests begin",
        "sources": ["G-PILE", "KIT listing card (P)", "NEW-INBOX"],
        "camera": "The property card lifts towards the top of the frame; the inbox rises under it.",
        "result": "The property found, and an inbox filling with requests to the client.",
        "on_screen": [
            "Found",
            "Certified copy of your ID",
            "Proof of residential address",
            "Bank statements (last 3 months)",
            "Please verify your identity again",
            "Which entity is buying?",
        ],
        "notes": "The inbox is today's unbranded tools, never Aurixa's.",
        "beats": [
            (
                IN(),
                "The switchboard falls away; the property card rises to the top of the frame.",
            ),
            (W("found"), "A green Found tick stamps onto the card."),
            (
                W("requests"),
                "An unbranded inbox slides up under it and requests start landing, one after another, each from a different professional.",
            ),
            (W("coming"), "They keep coming; the unread count climbs."),
        ],
    },
    "02.2": {
        "kind": "graphic",
        "palette": "before",
        "title": "Another identity check, another document, another explanation",
        "sources": ["G-PILE"],
        "camera": "Still; each card lands on the pile.",
        "result": "Three more requests on top of the pile.",
        "on_screen": [
            "Verify your identity",
            "Upload: bank statements",
            "Can you explain the transfer on 2 October?",
        ],
        "notes": "A generic identity page with no document pictured.",
        "beats": [
            (W("another"), "A generic Verify your identity page lands on the pile."),
            (W("another", 1), "An Upload: bank statements request lands on top of it."),
            (
                W("another", 2),
                "A message lands: Can you explain the transfer on 2 October?, with typing dots under it.",
            ),
        ],
    },
    "02.3": {
        "kind": "graphic",
        "palette": "before",
        "title": "Suddenly, progress feels like paperwork",
        "sources": ["G-PILE"],
        "camera": "A slow pull back; the pile now covers the property.",
        "result": "The pile over the property, its progress bar stalled, the frame gone cool.",
        "on_screen": ["Purchase progress"],
        "notes": "Holds before the brand's drop.",
        "beats": [
            (
                W("suddenly"),
                "The pile spreads over the property; a Purchase progress bar appears under it and creeps.",
            ),
            (W("paperwork"), "The bar stalls; the frame cools and holds."),
        ],
    },
    "03.1": {
        "kind": "logo",
        "palette": "aurixa",
        "title": "Aurixa Systems changes the experience",
        "sources": ["Reel 1 logo take A (the A reveal)", "logo-clean", "logo-letters"],
        "camera": "The logo's own footage, full frame.",
        "result": "The Aurixa Systems logo, its lettering exact.",
        "on_screen": ["AURIXA SYSTEMS"],
        "notes": "Reel 1's footage, reused as decided. The lettering is the art's own, laid over the footage by Systems.",
        "beats": [
            (
                IN(),
                "On the music's first drop a sweep of light lifts the pile away and the ground turns navy; the A rises out of the light.",
            ),
            (
                W("systems"),
                "The lettering is exact: the art's own wordmark takes over from the footage.",
            ),
            (W("experience"), "The logo settles and glows."),
        ],
    },
    "03.2": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Built by property professionals, for property professionals",
        "sources": ["G-WINDOW", "Command Centre (Alex Morgan)"],
        "camera": "The logo rises to the top; the Command Centre's glass window draws below it.",
        "result": "The Command Centre, its sidebar filled.",
        "on_screen": ["AURIXA SYSTEMS", "COMMAND CENTRE", "Demo workspace"],
        "notes": "Every screen carries its Demo workspace label.",
        "beats": [
            (IN(), "The logo lifts to the top of the frame as a lockup."),
            (
                W("professionals"),
                "The Command Centre's glass window draws in below it, its Demo workspace label in the top bar.",
            ),
            (W("for"), "Its sidebar fills, group by group."),
        ],
    },
    "03.3": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Property intelligence, financial analysis, reporting, client management, communication and more",
        "sources": ["G-TILES", "G-WINDOW"],
        "camera": "The window recedes; the tiles come forward one at a time, each on its word.",
        "result": "Every part of the platform docked into the Command Centre's navigation.",
        "on_screen": [
            "Property intelligence",
            "Financial analysis",
            "Reporting",
            "Client management",
            "Communication",
            "Builders Network",
            "Market News",
            "Borrowing Capacity",
            "Commercial & Industrial",
            "AML/CTF Compliance",
        ],
        "notes": "The grade and the cash flow on the tiles are the demo's own, marked illustrative.",
        "beats": [
            (
                W("intelligence"),
                "A property intelligence tile arrives: 14 Wattle Grove's record card, its grade A+ 84 and STRONG BUY (illustrative).",
            ),
            (W("financial"), "A financial analysis tile: the ten-year cash flow."),
            (W("reporting"), "A reporting tile: the client's report page."),
            (W("client"), "A client management tile: Jordan Ellis's client file."),
            (W("communication"), "A communication tile: the Message Hub."),
            (
                W("more"),
                "And more: Builders Network, Market News, Borrowing Capacity, Commercial & Industrial and AML/CTF Compliance fan out.",
            ),
            (
                W("connected"),
                "Every tile docks into the Command Centre's sidebar as its own entry.",
            ),
        ],
    },
    "03.4": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "And here's where it gets exciting",
        "sources": ["G-WINDOW", "G-POINTER", "G-FOCUS"],
        "camera": "The camera runs down the sidebar to AML/CTF Compliance.",
        "result": "AML/CTF Compliance pressed; the frame dims.",
        "on_screen": ["AML/CTF COMPLIANCE", "AML/CTF Compliance"],
        "notes": "",
        "beats": [
            (IN(), "The camera runs down the sidebar to the AML/CTF COMPLIANCE group."),
            (
                W("exciting"),
                "The pointer presses AML/CTF Compliance (its cyan ring); the frame dims under a riser.",
            ),
        ],
    },
    "04.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Introducing the Aurixa AML/CTF Compliance Passport",
        "sources": ["G-PASSPORT (the product's own cover)"],
        "camera": "The Passport rises in depth, turning to face the camera.",
        "result": "The Passport, closed, face-on.",
        "on_screen": [
            "AURIXA",
            "SYSTEMS",
            "AML/CTF COMPLIANCE PASSPORT",
            "Jordan Ellis",
        ],
        "notes": "Drawn by the product's own PassportBook from Jordan Ellis's fictional case.",
        "beats": [
            (
                W("introducing"),
                "On the second drop the Passport rises out of the dark, turned away, and turns towards the camera.",
            ),
            (W("compliance"), "A sweep of light crosses its cover."),
            (W("passport"), "It settles face-on and holds."),
        ],
    },
    "04.2": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "One digital passport, one organised client record",
        "sources": ["G-PASSPORT"],
        "camera": "A slow push in as it opens.",
        "result": "The Passport open at Client Identity.",
        "on_screen": [
            "CLIENT IDENTITY",
            "Jordan Ellis",
            "AML-2026-0014",
            "AUX-AML-2026-0014-V1",
        ],
        "notes": "Framed above the leaf's banner.",
        "beats": [
            (W("digital"), "The clasp releases."),
            (W("organised"), "The cover opens to leaf I, Client Identity."),
        ],
    },
    "04.3": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Identity verification, screening and due diligence, all in one place",
        "sources": ["G-PASSPORT", "G-STAMP"],
        "camera": "Still; the pages turn.",
        "result": "The Certification Seals leaf, its earned seals struck.",
        "on_screen": [
            "IDENTITY VERIFICATION",
            "SCREENING",
            "FUNDING & DUE DILIGENCE",
            "CERTIFICATION SEALS",
        ],
        "notes": "The seals are the product's own, struck on their leaf where they were earned, never on another page.",
        "beats": [
            (W("identity"), "The page turns to Identity Verification."),
            (W("screening"), "It turns to Screening."),
            (W("diligence"), "It turns to Funding & Due Diligence."),
            (
                W("all"),
                "The leaves riffle to Certification Seals and the seals strike in one after another.",
            ),
        ],
    },
    "05.1": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "With appropriate consent",
        "sources": ["Client Portal (Jordan Ellis)", "G-POINTER", "G-STAMP"],
        "camera": "The Client Portal's consent step, close.",
        "result": "The client's consent recorded.",
        "on_screen": [
            "Identity & Compliance",
            "Consents and disclosures",
            "Sharing your completed verification with partner organisations",
            "I have read this and I consent.",
            "I confirm",
            "CLIENT CONSENT RECORDED",
        ],
        "notes": "",
        "beats": [
            (IN(), "The Client Portal's Identity & Compliance page, at its consents."),
            (
                W("consent"),
                "The sharing consent is ticked and I confirm is pressed; CLIENT CONSENT RECORDED strikes beside it.",
            ),
            (W("controlled"), "The page recedes."),
        ],
    },
    "05.2": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Authorised partners open it in a few clicks",
        "sources": [
            "Command Centre: Stage 9, Passport & Partners",
            "Solicitor Portal (Priya Shah)",
            "G-PASSPORT",
            "G-STAMP",
            "G-POINTER",
        ],
        "camera": "The partners on the matter; then the solicitor's own portal.",
        "result": "The same Passport, open in Shah Legal's portal.",
        "on_screen": [
            "Passport & Partners",
            "Partners on this matter",
            "Shah Legal",
            "Harbour Finance Group",
            "Patel & Co Accountants",
            "Send the Passport",
            "SOLICITOR PASSPORT SHARED",
            "SOLICITOR PORTAL",
            "AML/CTF Compliance",
            "Jordan Ellis",
        ],
        "notes": "The send is cut on the press: no email address is shown anywhere.",
        "beats": [
            (
                IN(),
                "Stage 9, Passport & Partners: the three partners on Jordan Ellis's matter.",
            ),
            (
                W("partners"),
                "The pointer comes to Send the Passport on Shah Legal's row.",
            ),
            (W("securely"), "It presses; SOLICITOR PASSPORT SHARED strikes."),
            (W("passport"), "Cut to Priya Shah's Solicitor Portal."),
            (W("few"), "Click one: AML/CTF Compliance."),
            (
                W("clicks"),
                "Click two: Jordan Ellis's matter, and the same Passport opens.",
            ),
        ],
    },
    "05.3": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Supporting legislative compliance, without the duplication",
        "sources": ["G-PASSPORT", "G-SWITCHBOARD"],
        "camera": "A pull back from the open Passport.",
        "result": "One Passport, three partners' portals, the responsibility line.",
        "on_screen": [
            "SOLICITOR PORTAL",
            "FINANCE PORTAL",
            "ACCOUNTANT PORTAL",
            "Your business remains responsible for its AML/CTF obligations.",
        ],
        "notes": "The responsibility line, as decided, at least 22 px and on screen for 3 s or more.",
        "beats": [
            (
                IN(),
                "The camera pulls back; gold lines run from the Passport to the three partners' portals.",
            ),
            (
                W("eliminating"),
                "Ghosts of the earlier requests drift in and fold into the Passport.",
            ),
            (W("duplication"), "The responsibility line comes up under it and holds."),
        ],
    },
    "06.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "The result?",
        "sources": ["G-PASSPORT"],
        "camera": "Still.",
        "result": "The Passport alone, closed.",
        "on_screen": [],
        "notes": "The music's breakdown.",
        "beats": [
            (
                IN(),
                "Everything else falls away: the Passport alone on the navy, closed.",
            ),
        ],
    },
    "06.2": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Less paperwork, less repetition, better-connected professionals",
        "sources": ["G-SWITCHBOARD", "the site's Instead of / Aurixa creates chains"],
        "camera": "Still, with a slow drift.",
        "result": "The six professionals connected through the Passport; the client calm.",
        "on_screen": [
            "Instead of",
            "Aurixa creates",
            "Invite",
            "Verify",
            "Review",
            "Approve",
            "Passport",
            "Connect",
            "Progress",
        ],
        "notes": "The chains are the website's own words.",
        "beats": [
            (
                W("paperwork"),
                "The Instead of chain (the requests) comes up and starts to fall away.",
            ),
            (W("repetition"), "It is gone."),
            (
                W("better"),
                "The six chips return, each wired to the Passport rather than to the client.",
            ),
            (
                W("smoother"),
                "The Aurixa creates chain lights, step by step: Invite, Verify, Review, Approve, Passport, Connect, Progress.",
            ),
            (W("without"), "The client's chip, calm, beside the Passport."),
        ],
    },
    "07.1": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "And that's just one part of Aurixa Systems",
        "sources": ["G-TILES", "G-WINDOW"],
        "camera": "The Passport flies back into its tile; a pull back to the Command Centre.",
        "result": "The Command Centre, its parts around it.",
        "on_screen": ["AML/CTF Compliance", "Demo workspace"],
        "notes": "",
        "beats": [
            (IN(), "The Passport flies back into its AML/CTF Compliance tile."),
            (
                W("part"),
                "The camera pulls back to the whole Command Centre and its parts.",
            ),
        ],
    },
    "07.2": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Experience it yourself with a 14-day free trial",
        "sources": ["G-CTA", "Reel 1 logo take B1", "G-POINTER"],
        "camera": "Still, but alive.",
        "result": "The trial pressed; the portals lighting.",
        "on_screen": ["AURIXA SYSTEMS", "14-DAY FREE TRIAL", "START YOUR FREE TRIAL"],
        "notes": "",
        "beats": [
            (
                IN(),
                "The living call to action: the logo, 14-DAY FREE TRIAL and START YOUR FREE TRIAL.",
            ),
            (W("14day"), "The pointer presses START YOUR FREE TRIAL."),
            (W("discover"), "The portals light one at a time around it."),
        ],
    },
    "08.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Fourteen days. Your business. Your experience. Your decision.",
        "sources": ["G-WALL"],
        "camera": "The wall of the film's own screens drifts, dimmed.",
        "result": "Your decision.",
        "on_screen": [
            "Fourteen days.",
            "Your business.",
            "Your experience.",
            "Your decision.",
        ],
        "notes": "No captions over the four statements: they are the type.",
        "beats": [
            (W("14"), "Fourteen days."),
            (W("your"), "Your business."),
            (W("your", 1), "Your experience."),
            (W("your", 2), "Your decision."),
        ],
    },
    "09.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Aurixa Systems, and the trial: the last word",
        "sources": ["PL-15A", "G-CTA", "G-POINTER"],
        "camera": "Still, but alive: the card's own light moves on the music's bars.",
        "result": "The closing card, pressed on the last downbeat, held through the ring of the music.",
        "on_screen": [
            "AURIXA SYSTEMS",
            "The operating system for modern property professionals.",
            "14-DAY FREE TRIAL",
            "START YOUR FREE TRIAL",
            "aurixasystems.com.au",
        ],
        "notes": "Reel 1's closing card, the series' signature. No captions over it.",
        "beats": [
            (
                IN(),
                "On the music's return the closing card slams in: a flash, the logo landing with its shock ring, the card's gold lines drawing out.",
            ),
            (W("operating"), "Light runs round the card's edge; the line shimmers."),
            (
                W("start"),
                "As Start your free trial today is said, the pointer arrives and the button rises under it.",
            ),
            (
                W("today", 0, 0.6),
                "The press: a burst from the button, a ring across the card; then everything holds.",
            ),
        ],
    },
}

# ------------------------------------------------------------------------------------------------ the captions
# Each line as the script spells it, and the phrase it leans on. None over 08.1 or 09.1: there the type is the film's.
CAPTIONS = [
    ("One property,", "One property,"),
    ("six property professionals,", "six"),
    ("and somehow the client becomes the messenger.", "the messenger."),
    ("Sound familiar?", "familiar?"),
    ("The perfect property is found,", "perfect property"),
    ("but the requests keep coming.", "keep coming."),
    ("Another identity check,", "identity check,"),
    ("another document,", "document,"),
    ("another explanation.", "explanation."),
    ("Suddenly, progress feels like paperwork.", "paperwork."),
    ("That's where Aurixa Systems", "Aurixa Systems"),
    ("changes the experience.", "the experience."),
    ("Built by property professionals", "property professionals"),
    ("for property professionals,", "property professionals,"),
    ("Aurixa brings property intelligence,", "property intelligence,"),
    ("financial analysis, reporting,", "financial analysis,"),
    ("client management, communication and more", "communication"),
    ("into one connected operating environment.", "one connected"),
    ("And here's where it gets exciting.", "exciting."),
    ("Introducing the Aurixa AML/CTF Compliance Passport.", "Compliance Passport."),
    ("One digital passport,", "One digital passport,"),
    ("one organised client record,", "organised client record,"),
    ("identity verification,", "identity verification,"),
    ("screening and due diligence,", "due diligence,"),
    ("all in one place.", "one place."),
    ("With appropriate consent", "consent"),
    ("and controlled access,", "controlled access,"),
    ("authorised property partners", "property partners"),
    ("can securely access the client's Compliance Passport", "Compliance Passport"),
    ("in just a few clicks,", "a few clicks,"),
    ("supporting legislative compliance", "supporting"),
    ("while eliminating unnecessary duplication.", "unnecessary duplication."),
    ("The result?", "result?"),
    ("Less paperwork,", "paperwork,"),
    ("less repetition,", "repetition,"),
    ("better-connected professionals", "better-connected"),
    ("and a smoother property journey,", "smoother"),
    (
        "without clients constantly providing the same information.",
        "the same information.",
    ),
    ("And that's just one part of Aurixa Systems.", "one part"),
    ("Experience it yourself", "Experience"),
    ("with a 14-day free trial,", "14-day free trial,"),
    ("and discover what a truly connected business can achieve.", "truly connected"),
]

# The script's words as the recogniser heard them (the captions keep the script's).
HEARD = {
    "aurixa": "arixa",
    "organised": "organized",
    "authorised": "authorized",
    "amlctf": ["aml", "ctf"],
    "betterconnected": ["better", "connected"],
}


def heard_keys(text):
    out = []
    for w in text.split():
        k = key(w.replace("/", ""))
        if not k:
            continue
        h = HEARD.get(k, k)
        out.extend(h if isinstance(h, list) else [h])
    return out


def caption_times(words):
    """Each caption's first and last word, found in order in the measured words."""
    keys = [key(w["text"]) for w in words]
    cursor, out = 0, []
    for text, em in CAPTIONS:
        want = heard_keys(text)
        for i in range(cursor, len(keys) - len(want) + 1):
            if keys[i : i + len(want)] == want:
                break
        else:
            sys.exit(
                f"The caption '{text}' isn't in the measured words after word {cursor}"
            )
        a, b = words[i], words[i + len(want) - 1]
        if em not in text:
            sys.exit(f"The caption '{text}' has no phrase '{em}'")
        out.append(
            {
                "text": text,
                "emphasis": em,
                "start": round(warp_word(a["start"]), 3),
                "end": round(warp_word(b["end"]), 3),
                "voice_start": a["start"],
                "voice_end": b["end"],
            }
        )
        cursor = i + len(want)
    return out


# ------------------------------------------------------------------------------------------------ the brief
def main():
    data = json.loads(WORDS.read_text())
    words = data["words"]
    rows = shot_times.shots(data)
    if [r[0] for r in rows] != list(SHOTS):
        sys.exit("brief.py and shot_times.py list different shots")
    end = max(warp_word(words[-1]["end"]), warp_cut(data["seconds"]))
    if PACING.exists():
        end = json.loads(PACING.read_text()).get("end", end)
    shots = []
    for n, (sid, a, b, secs, script, i, last) in enumerate(rows):
        d = SHOTS[sid]
        t_in = on_frame(warp_cut(a))
        t_out = on_frame(warp_cut(b)) if n + 1 < len(rows) else on_frame(end)
        own = words[i:last]
        beats = []
        for anchor, do in d["beats"]:
            if "in" in anchor:
                at = t_in + anchor["in"]
            else:
                heard = HEARD.get(anchor["word"], anchor["word"])
                heard = heard[0] if isinstance(heard, list) else heard
                hits = [w for w in own if key(w["text"]) == heard]
                if len(hits) <= anchor["n"]:
                    sys.exit(
                        f"{sid}: no word '{anchor['word']}' #{anchor['n']} in its words"
                    )
                at = warp_word(hits[anchor["n"]]["start"]) + anchor["d"]
            at = on_frame(min(max(at, t_in), t_out - 1 / FPS))
            beats.append({"at": at, "anchor": anchor, "do": do})
        if any(x["at"] > y["at"] for x, y in itertools.pairwise(beats)):
            sys.exit(f"{sid}: its beats are out of order")
        shots.append(
            {
                "id": sid,
                "block": sid[:2],
                "block_title": shot_times.BLOCKS[sid[:2]],
                "kind": d["kind"],
                "palette": d["palette"],
                "title": d["title"],
                "sources": d["sources"],
                "camera": d["camera"],
                "result": d["result"],
                "on_screen": d["on_screen"],
                "notes": d["notes"],
                "in": t_in,
                "out": t_out,
                "seconds": round(t_out - t_in, 3),
                "voice_in": round(a, 3),
                "voiceover": script,
                "beats": beats,
            }
        )
    brief = {
        "title": "Aurixa Reel 2: the AML/CTF Compliance Passport",
        "plan": "docs/brands/aurixa-reel-2/PLAN.md",
        "frame": {"width": 1080, "height": 1920, "fps": FPS},
        "voiceover": {
            "file": data.get("file"),
            "seconds": data["seconds"],
            "studio": data.get("studio"),
        },
        "paced": PACING.exists(),
        "end": round(end, 3),
        "shots": shots,
        "captions": caption_times(words),
    }
    (DOCS / "brief.json").write_text(
        json.dumps(brief, indent=1, ensure_ascii=False) + "\n"
    )
    (DOCS / "BRIEF.md").write_text(markdown(brief))
    print(
        f"{len(shots)} shots, {sum(len(s['beats']) for s in shots)} beats, {len(brief['captions'])} captions, {brief['end']:.3f} s"
    )


def clock(t):
    return f"{int(t // 60)}:{t % 60:06.3f}"


def markdown(brief):
    out = [
        f"# {brief['title']}: the brief",
        "",
        "Written by `scripts/aurixa-reel-2/brief.py` from the plan and the voiceover's measured words; do not edit by hand.",
        f"Times are on the film's clock ({'paced to its music by pacing.py' if brief['paced'] else 'the voice´s own, before the film is paced to its music'}); every beat is anchored to a word, so it moves with it.",
        "",
        f"{len(brief['shots'])} shots, 1080 × 1920 at 30 fps, {clock(brief['end'])} long.",
        "",
    ]
    block = None
    for s in brief["shots"]:
        if s["block"] != block:
            block = s["block"]
            out += [f"## {block}. {s['block_title']}", ""]
        out += [
            f"### {s['id']}. {s['title']}",
            "",
            f'{clock(s["in"])} to {clock(s["out"])} ({s["seconds"]:.3f} s), {s["kind"]}, {s["palette"]}. Voiceover: "{s["voiceover"]}"',
            "",
            f"- **Draws:** {', '.join(s['sources'])}.",
            f"- **Camera:** {s['camera']}",
            f"- **Ends on:** {s['result']}",
        ]
        if s["on_screen"]:
            out.append(f"- **On screen:** {'; '.join(s['on_screen'])}.")
        if s["notes"]:
            out.append(f"- **Notes:** {s['notes']}")
        out += ["", "| At | Beat |", "| -- | ---- |"]
        out += [f"| {clock(b['at'])} | {b['do']} |" for b in s["beats"]]
        out.append("")
    out += [
        "## Captions",
        "",
        "| Start | End | Line | Leans on |",
        "| ----- | --- | ---- | -------- |",
    ]
    out += [
        f"| {clock(c['start'])} | {clock(c['end'])} | {c['text']} | {c['emphasis']} |"
        for c in brief["captions"]
    ]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    main()
