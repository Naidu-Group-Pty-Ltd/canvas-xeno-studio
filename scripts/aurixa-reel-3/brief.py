"""Reel 3's brief as data: every shot, its beats on the voiceover's words, and the captions.

  python3 -I scripts/aurixa-reel-3/brief.py     # writes docs/brands/aurixa-reel-3/brief.json and BRIEF.md

The cuts are shot_times.py's (Reel 1's rule on the measured words). Every beat is anchored to a word the voice says
(or to its shot's first frame), never typed as a time, so as the film is paced to National Treasures (pacing.json,
written by pacing.py, which holds the voice open in its own silences) every beat and caption moves with its word: a
cut or a beat by every pause before it, a word by every pause at or before it (Reel 1's warp_cut and warp_word).

Every figure a beat names is the product's own, computed on Jordan Ellis's record in the screens harness
(screens/README.md): the capacity by calculate-borrowing-capacity, the purchase and the scenarios by the page's
scenario engine, the Snapshot by its own route and render container. The film says what the product calculates,
never that anything is compliant or approved (PLAN.md 5.1); where a screen carries such a word, its region is named
in the screens' manifest and the scene frames it out.
"""

import itertools
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import shot_times

FPS = 30
DOCS = HERE.parents[1] / "docs" / "brands" / "aurixa-reel-3"
WORDS = DOCS / "voiceover-words.json"
PACING = DOCS / "pacing.json"


def key(text):
    return "".join(ch for ch in text.lower() if ch.isalnum())


def heard(word_key):
    """A recogniser's word, as a key in the script's spelling ("arixa" and "erixa" are both "aurixa")."""
    return shot_times.HEARD_AS.get(word_key, word_key)


# ------------------------------------------------------------------------------------------------ the clocks
def pauses():
    """The pauses pacing.py holds the voice open with."""
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
    """The n-th time the shot's words say `word` (as the script spells it, as a key), plus d seconds."""
    return {"word": key(word), "n": n, "d": d}


# ------------------------------------------------------------------------------------------------ the shots
# Each shot: its kind, palette ("before" is the light, unbranded opening; "aurixa" is the brand's navy, from 03.1),
# title, what it draws (sources: a graphic G-…, a screen plate from the harness's captures, Reel 1's footage), its
# camera, what it ends on, what is legible on screen, notes, and its beats: (anchor, what happens).
SHOTS = {
    "01.1": {
        "kind": "graphic",
        "palette": "before",
        "title": "Your client has found the property",
        "sources": ["G-QUESTION", "Reel 1's 14 Wattle Grove photograph"],
        "camera": "Composed from its first frame, which is the thumbnail (never faded in); a 3% drift in across the shot.",
        "result": "14 Wattle Grove's card with a gold pin on it, Jordan Ellis's chip beside it.",
        "on_screen": [
            "14 Wattle Grove",
            "Banksia Rise NSW 2155",
            "$1,150,000",
            "New build",
            "4 bed · 2 bath · 2 car · 450 m² land",
            "JE",
        ],
        "notes": "Frame 0 is the thumbnail: everything sits between y 240 and 1,680, inside a profile grid's centred 3:4 crop. Jordan is initials on a chip, no face.",
        "beats": [
            (
                IN(),
                "14 Wattle Grove's card, composed: Reel 1's photograph, the address, $1,150,000, New build, 4 bed · 2 bath · 2 car · 450 m² land; Jordan Ellis's chip (JE) beside it.",
            ),
            (W("found"), "A gold pin drops and settles on the card."),
        ],
    },
    "01.2": {
        "kind": "graphic",
        "palette": "before",
        "title": "The big question",
        "sources": ["G-QUESTION"],
        "camera": "A slow push towards the card.",
        "result": "The card dimmed under a large question mark.",
        "on_screen": ["?"],
        "notes": "",
        "beats": [
            (IN(), "The card dims."),
            (
                W("question"),
                "A large question mark draws in over it, in Playfair Display, stroke by stroke.",
            ),
        ],
    },
    "01.3": {
        "kind": "graphic",
        "palette": "before",
        "title": "Can they afford it?",
        "sources": ["G-QUESTION"],
        "camera": "Still.",
        "result": "The price beside an empty capacity bar whose figure is a question mark.",
        "on_screen": ["$1,150,000", "Borrowing capacity", "?"],
        "notes": "",
        "beats": [
            (
                IN(),
                "The question mark folds into a line: the price, $1,150,000, beside an empty capacity bar.",
            ),
            (W("afford"), "The bar's figure is a question mark; it pulses once."),
        ],
    },
    "02.1": {
        "kind": "graphic",
        "palette": "before",
        "title": "Traditionally, answering that means chasing documents",
        "sources": ["G-OLDWAY"],
        "camera": "Still; the inbox fills the frame's middle.",
        "result": "An unbranded inbox of requests, each sent, unanswered and chased.",
        "on_screen": [
            "Payslips (last 3)",
            "Bank statements (last 3 months)",
            "Car loan statement",
            "Credit card statement",
            "ID",
            "Following up…",
        ],
        "notes": "Today's unbranded tools, in their greys; no document is ever pictured.",
        "beats": [
            (
                IN(),
                "An unbranded inbox: requests go out one after another, payslips, bank statements, the car loan and the credit card statements, ID.",
            ),
            (
                W("chasing"),
                "Each sits unanswered, then is chased: Following up…, again and again.",
            ),
        ],
    },
    "02.2": {
        "kind": "graphic",
        "palette": "before",
        "title": "Juggling spreadsheets",
        "sources": ["G-OLDWAY"],
        "camera": "Still; the windows cascade towards the camera.",
        "result": "Three grey spreadsheet windows, one cell reading #REF!.",
        "on_screen": ["Income", "Expenses", "Capacity", "#REF!"],
        "notes": "The third window is Capacity, not the word the brand keeps out of its content.",
        "beats": [
            (
                W("juggling"),
                "Three grey spreadsheet windows cascade in: Income, Expenses, Capacity.",
            ),
            (W("spreadsheets"), "A cell in the last one reads #REF!."),
        ],
    },
    "02.3": {
        "kind": "graphic",
        "palette": "before",
        "title": "And waiting on internal teams and external partners",
        "sources": ["G-OLDWAY"],
        "camera": "A slow pull back as the frame cools.",
        "result": "Messages waiting on answers, a clock sweeping, a progress bar stalled; the frame cool and still.",
        "on_screen": ["Internal team", "Broker", "Any update?"],
        "notes": "Holds into the silence before the brand's drop.",
        "beats": [
            (
                W("waiting"),
                "Messages from Internal team and Broker: Any update?, typing dots that never resolve.",
            ),
            (
                W("partners"),
                "A clock hand sweeps and a progress bar stalls; the frame cools and holds as the music falls silent.",
            ),
        ],
    },
    "03.1": {
        "kind": "logo",
        "palette": "aurixa",
        "title": "With Aurixa Systems, everything changes",
        "sources": ["Reel 1 logo take A (the A reveal)", "logo-clean", "logo-letters"],
        "camera": "The logo's own footage, full frame; it settles high.",
        "result": "The Aurixa Systems logo, its lettering exact, high in the frame.",
        "on_screen": ["AURIXA SYSTEMS"],
        "notes": "Reel 1's footage (A1), with the supplied lettering laid over it, as in Reel 2.",
        "beats": [
            (
                IN(),
                "On the music's drop the old way sweeps away in a pass of light and the ground turns navy.",
            ),
            (
                W("aurixa"),
                "The logo leaps out of the light: Reel 1's reveal, the lettering laid exact over it.",
            ),
            (W("changes"), "It settles high, held for a breath."),
        ],
    },
    "04.1": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "One simple client questionnaire captures and organises their information",
        "sources": [
            "G-FACTFIND",
            "the fact find workbook (factfind.py)",
            "Add New Client · Advanced · Excel Import (captures/20-clients.cjs)",
        ],
        "camera": "The workbook lands and drops into the import; then in on the import's count tiles.",
        "result": "The import parsed: its seven tiles counted, no warnings.",
        "on_screen": [
            "Client Financial Position & Fact Find",
            "Add New Client",
            "Excel Import",
            "Parse Excel Sheet",
            "Applicants found",
            "Liabilities populated",
            "Living expenses populated",
        ],
        "notes": "The product's questionnaire is its white-label Client Fact Find workbook, imported in one go (PLAN.md 6.1).",
        "beats": [
            (
                IN(),
                "Jordan's fact find lands, filled in: the product's own workbook, Client Financial Position & Fact Find.",
            ),
            (
                W("questionnaire"),
                "It drops into Add New Client, Advanced, on its Excel Import tab.",
            ),
            (
                W("captures"),
                "Parse Excel Sheet is pressed; the import's tiles count up one a beat.",
            ),
            (
                W("organises"),
                "The last tiles land: Liabilities populated, Living expenses populated, Warning count 0.",
            ),
        ],
    },
    "04.2": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Seamlessly populating their client card",
        "sources": [
            "G-FACTFIND",
            "Client Management and Jordan Ellis's client card (captures/20-clients.cjs)",
        ],
        "camera": "Create Client, then the card assembling; the figures fly from the workbook into it.",
        "result": "Jordan Ellis's client card, complete.",
        "on_screen": ["Create Client", "Jordan Ellis", "Client Management"],
        "notes": "",
        "beats": [
            (
                W("seamlessly"),
                "Create Client is pressed and Jordan Ellis's client card assembles in Client Management.",
            ),
            (
                W("populating"),
                "The fact find's figures fly into the record: the base salary, the car loan, the credit card, the rent, the living expenses.",
            ),
            (W("card"), "The card settles, complete."),
        ],
    },
    "05.1": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Now, here's where speed meets opportunity",
        "sources": [
            "The client workspace's Borrowing Capacity tab (bc-card-empty)",
            "KIT pointer",
        ],
        "camera": "In on the card; the pointer travels to its button and waits.",
        "result": "The pointer resting on Calculate Capacity.",
        "on_screen": [
            "Borrowing Capacity",
            "Calculate borrowing power based on income, expenses, and existing commitments.",
            "Calculate Capacity",
        ],
        "notes": "The music falls away under the line; the pointer waits through the held pause before the drop.",
        "beats": [
            (
                IN(),
                "Jordan's workspace, on its Borrowing Capacity tab: the card, with nothing calculated yet.",
            ),
            (W("speed"), "The pointer travels to Calculate Capacity."),
            (W("opportunity"), "It waits there, through the held pause."),
        ],
    },
    "05.2": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "With just one click",
        "sources": ["bc-card-result", "KIT big number", "KIT pointer"],
        "camera": "The press on the drop; the card resolves full frame.",
        "result": "Maximum Borrowing Power $1,049,786, Strong Position, with its surplus, ratio and stress test.",
        "on_screen": [
            "Maximum Borrowing Power",
            "$1,049,786",
            "Strong Position",
            "Monthly Surplus",
            "DTI Ratio",
            "Stress-Tested Capacity",
        ],
        "notes": "One click is literal for a client with no assessment yet (PLAN.md 6.2). The illustrative label sits under the figure.",
        "beats": [
            (
                W("click"),
                "The press lands on the music's drop: the card resolves and Maximum Borrowing Power counts up to $1,049,786.",
            ),
            (
                W("aurixa"),
                "Strong Position, Monthly Surplus $8,827, DTI Ratio 3.6x and Stress-Tested Capacity $964,993 with its bar land in turn.",
            ),
            (W("magic"), "The figure holds, its illustrative label under it."),
        ],
    },
    "05.3": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "An indicative borrowing capacity assessment",
        "sources": ["bc-page-calc (the Borrowing Capacity page)"],
        "camera": "View Full Calculator opens the page; then in on the Results panel.",
        "result": "BORROWING CAPACITY $1,049,786, Stress-tested: $964,993, the indicative line lit.",
        "on_screen": [
            "View Full Calculator",
            "BORROWING CAPACITY",
            "$1,049,786",
            "Stress-tested: $964,993",
            "This calculator is for indicative purposes only. We recommend a formal broker assessment for lending advice.",
        ],
        "notes": "The proposed loan check's verdict and the Results panel's compliance wording stay out of frame (PLAN.md 5.1).",
        "beats": [
            (W("aspect"), "View Full Calculator opens the Borrowing Capacity page."),
            (
                W("indicative"),
                "The page's own line is lit: This calculator is for indicative purposes only.",
            ),
            (
                W("assessment"),
                "BORROWING CAPACITY lands large, $1,049,786, Stress-tested: $964,993.",
            ),
        ],
    },
    "05.4": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Purchasing power, deposit requirements, financial commitments",
        "sources": ["bc-page-calc"],
        "camera": "One beat for each thing the voice names, the camera moving to it on the page.",
        "result": "Existing Liabilities and their Total Monthly Commitments of $820.",
        "on_screen": [
            "$1,049,786",
            "Lenders Mortgage Insurance (LMI)",
            "$1,150,000",
            "$230,000",
            "Loan-to-Value Ratio (LVR)",
            "80.0%",
            "No LMI Required",
            "Car loan",
            "Credit card",
            "Total Monthly Commitments",
            "$820",
        ],
        "notes": "The product computes no deposit requirement: given 14 Wattle Grove's value it gives the LVR and whether LMI applies, which is how a deposit is judged (PLAN.md 6.3).",
        "beats": [
            (
                W("purchasing"),
                "Estimated purchasing power: the capacity figure itself, $1,049,786.",
            ),
            (
                W("deposit"),
                "Deposit requirements: the LMI section on 14 Wattle Grove's $1,150,000, a $230,000 deposit, the LVR at 80.0%, No LMI Required.",
            ),
            (
                W("commitments"),
                "Financial commitments: Existing Liabilities, the car loan $520 and the credit card $300, Total Monthly Commitments $820.",
            ),
        ],
    },
    "05.5": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Key considerations tailored to their specific circumstances",
        "sources": ["bc-page-calc"],
        "camera": "Along Assumptions Used, then the band.",
        "result": "The band green, Strong borrowing position, over Jordan's own assumptions.",
        "on_screen": [
            "Assumptions Used",
            "9.5%",
            "30 years",
            "HEM Benchmark",
            "SERVICEABILITY BAND",
            "Strong borrowing position",
        ],
        "notes": "The engine's Recommendations stay out of frame; the key considerations are the assessment's basis (PLAN.md 6.4).",
        "beats": [
            (
                W("considerations"),
                "Assumptions Used, with Jordan's own figures: the 9.50% assessment rate, 30 years, the HEM benchmark of $3,780.",
            ),
            (
                W("circumstances"),
                "His declared living costs of $6,447 a month, above the benchmark, are the ones used; the band reads green, Strong borrowing position.",
            ),
        ],
    },
    "05.6": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "From information to financial insight in moments",
        "sources": ["G-CHAIN", "the workbook", "bc-card-result", "bc-page-calc"],
        "camera": "A pull back along one line: the fact find, the card, the page.",
        "result": "The three in a row, joined by one gold line.",
        "on_screen": [],
        "notes": "",
        "beats": [
            (
                IN(),
                "The camera pulls back from the page; the card and the fact find come into frame beside it.",
            ),
            (
                W("insight"),
                "A gold line draws from the fact find to the card to the page.",
            ),
            (W("moments"), "It holds, the three joined."),
        ],
    },
    "06.1": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "And why stop there?",
        "sources": ["bc-calc-export (the page's tabs)", "KIT pointer"],
        "camera": "In on the page's tabs.",
        "result": "Portfolio Scenario Modelling pressed.",
        "on_screen": ["Calculator", "Portfolio Scenario Modelling", "History"],
        "notes": "",
        "beats": [
            (
                IN(),
                "The page's tabs: Calculator, Portfolio Scenario Modelling, History.",
            ),
            (W("stop"), "The pointer presses Portfolio Scenario Modelling."),
        ],
    },
    "06.2": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Bring their chosen property into focus",
        "sources": [
            "bc-scen-purchase",
            "bc-scen-head-purchase",
            "KIT listing card (14 Wattle Grove)",
        ],
        "camera": "14 Wattle Grove's card slides in and docks into Model next purchase; then in on its answer.",
        "result": "Effective purchase power $1,281,859, Target achievable.",
        "on_screen": [
            "Model next purchase",
            "Adds stamp duty, LMI, cash-on-hand, and target-price feasibility to the scenario.",
            "1150000",
            "300000",
            "NSW",
            "Investor",
            "New build",
            "Effective purchase power",
            "$1,281,859",
            "Target achievable",
        ],
        "notes": "The product has no way to choose a property into a scenario; its path is Model next purchase with the property's price (PLAN.md 6.3). The section's Phase 2 badge stays out of frame.",
        "beats": [
            (
                W("chosen"),
                "14 Wattle Grove's card slides in and docks into Model next purchase: its price, Jordan's $300,000 of savings, NSW, investor, new build.",
            ),
            (
                W("focus"),
                "Effective purchase power lands, $1,281,859, and the product's verdict beside it: Target achievable.",
            ),
        ],
    },
    "06.3": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Adjust deposits, explore financial structures, model purchasing scenarios",
        "sources": [
            "bc-scen-purchase-250",
            "bc-scen-debts-off",
            "bc-scen-debts-on",
            "bc-scen-head-carloan",
            "bc-scen-rates",
            "bc-scen-head-rates",
            "bc-scen-naming",
            "bc-scen-saved-2",
            "bc-scen-saved-3",
            "bc-scen-saved-4",
        ],
        "camera": "One beat for each phrase, cutting card to card on the page.",
        "result": "Saved Scenarios (4): the base and three, each with its capacity.",
        "on_screen": [
            "Cash on hand",
            "Debt Consolidation",
            "Car loan",
            "+$61,842",
            "Interest Rate Adjustment",
            "+1%",
            "Save Scenario",
            "Saved Scenarios (4)",
            "14 Wattle Grove",
            "14 Wattle Grove · car loan repaid",
            "14 Wattle Grove · rates +1%",
        ],
        "notes": "The headline's line about a serviceable ceiling stays out of frame. The car loan is paid out of the cash on hand through the Capital Flow Canvas, the product's own path for a payoff.",
        "beats": [
            (
                W("deposits"),
                "Adjust deposits: the cash on hand moves from $300,000 to $250,000, and purchase power follows it, then back.",
            ),
            (
                W("structures"),
                "Explore financial structures: Debt Consolidation's switch flips on for the car loan, paid out of cash, and the scenario's capacity rises $61,842 to $1,111,628; then rates a point higher take it to $964,993.",
            ),
            (
                W("scenarios"),
                "Model purchasing scenarios: Save Scenario, three times, and Saved Scenarios (4) lists each with its capacity.",
            ),
        ],
    },
    "06.4": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "And generate professional reports",
        "sources": [
            "bc-calc-export (Export PDF)",
            "the Borrowing Capacity Snapshot's pages (snapshot-scen)",
        ],
        "camera": "Export PDF pressed; the Snapshot's pages run past the camera, held where the voice lands.",
        "result": "The Snapshot's Scenario comparison: the four scenarios side by side.",
        "on_screen": [
            "Export PDF",
            "BORROWING CAPACITY SNAPSHOT",
            "Jordan Ellis",
            "Capacity at a glance",
            "PROPOSED LOAN $920,000",
            "$129,786 of headroom under the assessed capacity.",
            "Scenario comparison",
        ],
        "notes": "Report pages as charts, from the client's notes on Reel 1. The Snapshot is the product's own, drawn by its route and render container from the request the page sends. The page 2 lede (what Jordan can borrow) and the Serviceability headings stay out of frame.",
        "beats": [
            (W("generate"), "Export PDF on the Results panel is pressed."),
            (
                W("reports"),
                "The Borrowing Capacity Snapshot comes up: its cover, Jordan Ellis.",
            ),
            (
                W("numbers"),
                "Capacity at a glance: the $920,000 loan is the bar, the stress-tested and assessed limits named lines, the headroom written under it.",
            ),
            (
                W("decisions"),
                "Scenario comparison: the base and the three scenarios, side by side.",
            ),
        ],
    },
    "07.1": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Ready for the next step?",
        "sources": [
            "Jordan's Overview: Team & Partners, Finance Partners (captures/20-clients.cjs)"
        ],
        "camera": "In on Team & Partners, then Finance.",
        "result": "Jamie Chen of Harbour Finance Group, the finance partner with portal access to Jordan.",
        "on_screen": [
            "Team & Partners",
            "Finance Partners",
            "Finance officers with portal access to this client.",
            "Jamie Chen",
            "Harbour Finance Group",
        ],
        "notes": "",
        "beats": [
            (IN(), "Jordan's Overview: Team & Partners."),
            (
                W("step"),
                "Finance: Jamie Chen of Harbour Finance Group, already his finance partner.",
            ),
        ],
    },
    "07.2": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "One click, one connected handover",
        "sources": ["bc-calc-scenario", "bc-toast-saved", "KIT pointer"],
        "camera": "The calculator with the chosen scenario on it; the press, then the toast.",
        "result": 'Scenario "14 Wattle Grove · car loan repaid" saved as the current assessment.',
        "on_screen": [
            "Scenario Active: 14 Wattle Grove · car loan repaid",
            "Save",
            'Scenario "14 Wattle Grove · car loan repaid" saved as the current assessment',
        ],
        "notes": "The broker receives no send: an allocated finance partner sees every saved assessment in their portal, so this save is the handover (PLAN.md 6.5).",
        "beats": [
            (
                W("click"),
                "The calculator, the chosen scenario on it: Scenario Active: 14 Wattle Grove · car loan repaid. The pointer presses Save.",
            ),
            (
                W("handover"),
                'The product\'s toast: Scenario "14 Wattle Grove · car loan repaid" saved as the current assessment.',
            ),
        ],
    },
    "07.3": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Share assessments and scenarios with yours or their allocated finance broker",
        "sources": ["G-HANDOVER", "Finance Partners (Assign existing, Invite new)"],
        "camera": "The line from the Command Centre to the Finance Portal, across the frame.",
        "result": "The assessment arriving in Jamie's Finance Portal.",
        "on_screen": ["Assign existing", "Invite new", "Finance Portal"],
        "notes": "Yours or theirs is the card's own two doors: Assign existing for your broker, Invite new for theirs.",
        "beats": [
            (
                W("share"),
                "The saved assessment lifts off the calculator and travels along a gold line out of the Command Centre.",
            ),
            (W("yours"), "Assign existing lights: your own broker."),
            (W("their"), "Invite new lights: theirs."),
            (W("broker"), "The line reaches the Finance Portal."),
        ],
    },
    "07.4": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Through Aurixa's partner portal, without repeating the process",
        "sources": [
            "Finance Portal: My Clients, Jordan Ellis, Borrowing Capacity (captures/30-portals.cjs)"
        ],
        "camera": "Down Jamie's path: My Clients, Jordan Ellis, the Borrowing Capacity tab; then in on the latest assessment.",
        "result": "The latest assessment in Jamie's portal: Maximum borrowing $1,111,628, and the inputs used.",
        "on_screen": [
            "Finance Portal",
            "Partner Access",
            "My Clients",
            "Jordan Ellis",
            "Latest assessment",
            "Maximum borrowing",
            "$1,111,628",
            "Inputs used",
        ],
        "notes": "One portal at a time. The panel's footer about compliant rules stays out of frame (PLAN.md 10.3).",
        "beats": [
            (
                W("portal"),
                "Jamie's Finance Portal, Partner Access: My Clients, then Jordan Ellis.",
            ),
            (
                W("review"),
                "The Borrowing Capacity tab: Latest assessment, Maximum borrowing $1,111,628, Monthly surplus, DTI ratio, Stress-tested.",
            ),
            (W("repeating"), "Inputs used: the same figures, nothing keyed in again."),
        ],
    },
    "08.1": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Your client gains clarity and transparency",
        "sources": ["Client Portal: Reports (captures/30-portals.cjs)"],
        "camera": "Jordan's Client Portal, Reports; in on the Snapshot.",
        "result": "The Snapshot open in Jordan's own portal, under its Borrowing Capacity label.",
        "on_screen": ["Reports", "Borrowing Capacity", "Borrowing Capacity Snapshot"],
        "notes": "The portal's dashboard draws no capacity today (PLAN.md 10.2), so the client's clarity is their report.",
        "beats": [
            (
                W("client"),
                "Jordan's Client Portal, Reports: the Snapshot, published to him under its Borrowing Capacity label.",
            ),
            (W("transparency"), "It opens."),
        ],
    },
    "08.2": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "And the broker gains context",
        "sources": [
            "Finance Portal: Jordan Ellis's profile (captures/30-portals.cjs)",
            "G-HANDOVER",
        ],
        "camera": "Back in Jamie's portal, on Jordan's profile.",
        "result": "Jordan's profile in Jamie's portal: its tabs and the assessment's inputs.",
        "on_screen": [
            "Jordan Ellis",
            "Documents",
            "Borrowing Capacity",
            "Message Hub",
            "Inputs used",
        ],
        "notes": "",
        "beats": [
            (
                W("broker"),
                "Jamie's portal, Jordan's profile: the sections he may see, with tabs for Documents, Borrowing Capacity and Message Hub.",
            ),
            (W("context"), "The assessment's Inputs used, the broker's context."),
        ],
    },
    "08.3": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "Your business gains momentum",
        "sources": ["Jordan's Deals tab: the deal's journey (captures/20-clients.cjs)"],
        "camera": "Along the deal's journey.",
        "result": "The deal at Advisory: Strategy agreed before anything is committed.",
        "on_screen": [
            "Onboarding",
            "Advisory",
            "Strategy agreed before anything is committed.",
        ],
        "notes": "The Client Tracker's pipeline is a third party's, so it stays out of shot.",
        "beats": [
            (W("business"), "Jordan's Deals tab: the deal's journey, at Onboarding."),
            (
                W("momentum"),
                "It moves on to Advisory: Strategy agreed before anything is committed.",
            ),
        ],
    },
    "09.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "And that's just the beginning",
        "sources": ["The Command Centre", "G-TILES"],
        "camera": "A pull back to the whole Command Centre, quiet; then a hold.",
        "result": "The Command Centre, still.",
        "on_screen": [],
        "notes": "The breakdown: the longest hold in the film, after the line.",
        "beats": [
            (IN(), "The camera pulls back to the whole Command Centre."),
            (W("beginning"), "It holds, quiet."),
        ],
    },
    "09.2": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Property intelligence, financial analysis, reporting, communication and collaboration, all connected",
        "sources": ["G-TILES", "the sidebar's groups"],
        "camera": "Still; tiles fly in and dock.",
        "result": "Five tiles docked into the sidebar's groups, all lit.",
        "on_screen": [
            "Property Marketplace",
            "Cash Flow Analysis",
            "Generated Reports",
            "Message Hub",
            "Finance Portal",
            "Solicitor Portal",
            "Accountant Portal",
            "Client Portal",
        ],
        "notes": "Each tile is new to this reel. The 10-year cash flow carries the illustrative label.",
        "beats": [
            (
                W("property"),
                "Property intelligence: Property Marketplace flies in and docks.",
            ),
            (
                W("financial"),
                "Financial analysis: Cash Flow Analysis, its 10-year cash flow.",
            ),
            (W("reporting"), "Professional reporting: Generated Reports."),
            (W("communication"), "Client communication: Message Hub."),
            (
                W("collaboration"),
                "Partner collaboration: the Finance, Solicitor, Accountant and Client portals.",
            ),
            (W("connected"), "All connected: the groups light together."),
        ],
    },
    "09.3": {
        "kind": "screen",
        "palette": "aurixa",
        "title": "With the Aurixa Agent in your arsenal",
        "sources": [
            "agent-launcher",
            "agent-card",
            "agent-approved (captures/40-agent.cjs)",
            "KIT pointer",
        ],
        "camera": "The launcher, then the panel; in on the card; the press.",
        "result": "The professional's go-ahead given; the act done.",
        "on_screen": [
            "Aurixa",
            "Needs your go-ahead",
            "Give a finance partner a client",
            "Jamie Chen",
            "Jordan Ellis",
            "Approve",
            "Aurixa may make mistakes",
        ],
        "notes": "The agent as the product shows it, and a person approves its act (guardrail 7). Aurixa may make mistakes stays in shot.",
        "beats": [
            (
                W("agent"),
                "The Aurixa Agent: the launcher, then the panel headed Aurixa.",
            ),
            (
                W("arsenal"),
                "Aurixa prepares the act and asks first: Needs your go-ahead, Give a finance partner a client, Jamie Chen and Jordan Ellis.",
            ),
            (W("supporting"), "The professional presses Approve."),
            (
                W("takes"),
                "The act's own words: Jamie Chen assigned with default permissions; Aurixa may make mistakes stays in shot.",
            ),
        ],
    },
    "10.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Less administration, faster answers, smarter collaboration, more opportunities",
        "sources": ["G-MEANS"],
        "camera": "Still; each phrase arrives on its word, with its callback.",
        "result": "The four phrases set, the keys building under them.",
        "on_screen": [
            "Less administration",
            "Faster answers",
            "Smarter collaboration",
            "More opportunities to deliver results",
        ],
        "notes": "On the track's stop, its bass hit. No captions over the four phrases: they are the type.",
        "beats": [
            (W("less"), "Less administration, with the fact find behind it."),
            (W("faster"), "Faster answers, with the capacity figure."),
            (W("smarter"), "Smarter collaboration, with the Finance Portal."),
            (W("more"), "More opportunities to deliver results, with the Snapshot."),
        ],
    },
    "11.1": {
        "kind": "logo",
        "palette": "aurixa",
        "title": "Aurixa Systems has arrived",
        "sources": [
            "Reel 1 logo take B (the living logo)",
            "logo-clean",
            "logo-letters",
        ],
        "camera": "The logo's own footage, full frame.",
        "result": "The lockup, with Built by property professionals for property professionals under it.",
        "on_screen": [
            "AURIXA SYSTEMS",
            "Built by property professionals for property professionals.",
        ],
        "notes": "On the first bar of the track's biggest section. The line under the lockup is the type, so no captions.",
        "beats": [
            (
                W("aurixa"),
                "The logo arrives at the viewer: Reel 1's living logo footage, its lettering exact.",
            ),
            (
                W("built"),
                "Built by property professionals for property professionals settles under the lockup.",
            ),
        ],
    },
    "12.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Experience the difference with a 14-day free trial",
        "sources": ["G-CTA", "KIT pointer"],
        "camera": "Still, but alive: the button's light breathes on the bars.",
        "result": "START YOUR FREE TRIAL, pressed.",
        "on_screen": ["14-DAY FREE TRIAL", "START YOUR FREE TRIAL"],
        "notes": "Reel 1's living call to action.",
        "beats": [
            (
                W("experience"),
                "The living call to action: 14-DAY FREE TRIAL, the button's gradient breathing on the bars.",
            ),
            (W("14day"), "The pointer presses START YOUR FREE TRIAL."),
        ],
    },
    "13.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Your business, your experience, your decision",
        "sources": ["the statements"],
        "camera": "The film's own screens drift behind, dimmed.",
        "result": "Your decision.",
        "on_screen": ["Your business.", "Your experience.", "Your decision."],
        "notes": "Three statements, one to a hit, each alone in the frame. No captions over them: they are the type.",
        "beats": [
            (W("your"), "Your business."),
            (W("your", 1), "Your experience."),
            (W("your", 2), "Your decision."),
        ],
    },
    "14.1": {
        "kind": "graphic",
        "palette": "aurixa",
        "title": "Aurixa Systems, and the trial: the last word",
        "sources": ["PL-15A", "G-CTA", "KIT pointer"],
        "camera": "Still, but alive: the card's own light moves on the music's bars.",
        "result": "The closing card, pressed on the last hit, held through the music's ring.",
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
                "As the music returns the closing card slams in: a flash, the logo landing with its shock ring, the card's gold lines drawing out.",
            ),
            (W("operating"), "Light runs round the card's edge; the line shimmers."),
            (
                W("start"),
                "As Start your free trial today is said, the pointer arrives and the button rises under it.",
            ),
            (
                W("today", 0, 0.6),
                "The press: a burst from the button, a ring across the card; then everything holds through the ring.",
            ),
        ],
    },
}

# ------------------------------------------------------------------------------------------------ the captions
# Each line as the script spells it, and the phrase it leans on. None over 10.1, 11.1, 13.1 or 14.1: there the type is
# the film's.
CAPTIONS = [
    ("Your client has found the property.", "found the property."),
    ("The big question?", "big question?"),
    ("Can they afford it?", "afford it?"),
    ("Traditionally, answering that means", "Traditionally,"),
    ("chasing documents,", "chasing documents,"),
    ("juggling spreadsheets,", "spreadsheets,"),
    ("and waiting on internal teams", "waiting"),
    ("and external partners.", "external partners."),
    ("With Aurixa Systems,", "Aurixa Systems,"),
    ("everything changes.", "everything changes."),
    ("One simple client questionnaire", "questionnaire"),
    ("captures and organises their information,", "captures and organises"),
    ("seamlessly populating their client card.", "client card."),
    ("Now, here's where speed meets opportunity.", "speed meets opportunity."),
    ("With just one click,", "one click,"),
    ("Aurixa turns client information into magic,", "magic,"),
    ("where one aspect allows you to obtain", "obtain"),
    ("an indicative borrowing capacity assessment,", "borrowing capacity"),
    ("revealing estimated purchasing power,", "purchasing power,"),
    ("deposit requirements,", "deposit requirements,"),
    ("financial commitments,", "financial commitments,"),
    ("and key considerations", "key considerations"),
    ("tailored to their specific circumstances.", "specific circumstances."),
    ("From information to financial insight", "financial insight"),
    ("in moments.", "in moments."),
    ("And why stop there?", "stop there?"),
    ("Bring their chosen property into focus.", "chosen property"),
    ("Adjust deposits,", "deposits,"),
    ("explore financial structures,", "financial structures,"),
    ("model purchasing scenarios,", "scenarios,"),
    ("and generate professional reports", "professional reports"),
    ("that turn numbers into meaningful decisions.", "meaningful decisions."),
    ("Ready for the next step?", "next step?"),
    ("One click,", "One click,"),
    ("one connected handover.", "connected handover."),
    ("Share assessments and scenarios", "assessments and scenarios"),
    ("directly with yours or their", "directly"),
    ("allocated finance broker", "finance broker"),
    ("through Aurixa's partner portal,", "partner portal,"),
    ("enabling professional review", "professional review"),
    ("without repeating the entire process.", "without repeating"),
    ("Your client gains clarity and transparency,", "clarity and transparency,"),
    ("and the broker gains context.", "context."),
    ("Your business gains momentum.", "momentum."),
    ("And that's just the beginning.", "the beginning."),
    ("Property intelligence,", "Property intelligence,"),
    ("financial analysis,", "financial analysis,"),
    ("professional reporting,", "professional reporting,"),
    ("client communication", "client communication"),
    ("and partner collaboration", "partner collaboration"),
    ("are all connected,", "all connected,"),
    ("with the Aurixa Agent in your arsenal", "Aurixa Agent"),
    ("supporting you wherever your business takes you.", "wherever"),
    ("Experience the difference", "difference"),
    ("with a 14-day free trial.", "14-day free trial."),
]


def caption_times(words):
    """Each caption's first and last word, found in order in the measured words."""
    keys = [heard(key(w["text"])) for w in words]
    cursor, out = 0, []
    for text, em in CAPTIONS:
        want = [k for k in (key(w) for w in text.split()) if k]
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
                hits = [w for w in own if heard(key(w["text"])) == anchor["word"]]
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
                # The lines it carries, as the studio's storyboard import reads a brief (one line here).
                "voiceover": [script],
                "beats": beats,
            }
        )
    brief = {
        "title": "Aurixa Reel 3: Borrowing Capacity",
        "idea": "Can they afford it?, answered in the product: one questionnaire fills the client's record, and one click gives an indicative borrowing capacity assessment. The chosen property is modelled in scenarios and a report, and the assessment reaches the client's finance broker in their own portal, with nothing keyed in again.",
        "plan": "docs/brands/aurixa-reel-3/PLAN.md",
        "frame": {"width": 1080, "height": 1920, "fps": FPS},
        "delivery": {
            "aspect_ratio": "9:16",
            "size": "1080x1920",
            "fps": FPS,
            "seconds": round(end, 3),
        },
        "voiceover": {
            "file": data.get("file"),
            "asset_id": (data.get("studio") or {}).get("asset"),
            "seconds": data["seconds"],
            "speech_end": round(words[-1]["end"], 3),
            "timed_from": "voiceover-words.json: the words measured on this machine (transcribe.py, refine.py), held open in its silences by pacing.py",
            "studio": data.get("studio"),
        },
        "blocks": [{"block": b, "title": t} for b, t in shot_times.BLOCKS.items()],
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
        "Written by `scripts/aurixa-reel-3/brief.py` from the plan and the voiceover's measured words; do not edit by hand.",
        f"Times are on the film's clock ({'paced to National Treasures by pacing.py' if brief['paced'] else 'the voice´s own, before the film is paced to its music'}); every beat is anchored to a word, so it moves with it.",
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
            f'{clock(s["in"])} to {clock(s["out"])} ({s["seconds"]:.3f} s), {s["kind"]}, {s["palette"]}. Voiceover: "{" ".join(s["voiceover"])}"',
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
