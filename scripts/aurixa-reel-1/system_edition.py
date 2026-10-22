"""Reel 1, system edition: the content brief that extends brief 848af668 (the prompt pack), as data.

  python3 scripts/aurixa-reel-1/system_edition.py docs/brands/aurixa-reel-1/system-edition   # brief.json and BRIEF.md
  npx prettier --write docs/brands/aurixa-reel-1/system-edition
  python3 scripts/aurixa-reel-1/system_edition.py --studio-sql <file>   # the SQL that keeps it in the studio

The client rejected the generated live action (21 October 2026) and asked for a reel about the system itself:
screen actions, system workflows, deliverables, and SaaS graphics in the brand's own design system. This keeps
everything the pack and the working master fixed (the voiceover, its cut points, the captions, the Block 14
phrases, the closing card, the record and the guardrails) and replaces every picture.

Every shot is one continuous composition, and its beats land on the voiceover: a beat or cut named by a
caption sits where timing.py puts any cut before that caption's first word (in the pause before it, else
0.1 s ahead), on the 30 fps grid, and a shot that starts a block starts on the block's own cut. Nothing here
is typed as a time: it is all computed from the measured speech, the captions and the blocks in spec.json,
and checked (no gaps, no overlaps, end to end). Since the third cut (22 October 2026) the voiceover is held open in
its own silences and the film is cut to National Treasures (pacing.py), so every time is moved onto the film's clock.

Writes brief.json (the shots and their beats, for the renderer that will make them) and BRIEF.md (the brief).
"""
import json, math, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import timing  # the measured speech and the cut rule the spec's own cuts were made with
import pacing  # the third cut's pauses and the music the film is cut to
SPEC = json.loads((HERE.parents[1] / "docs" / "brands" / "aurixa-reel-1" / "spec.json").read_text())
FPS = SPEC["delivery"]["fps"]
END = None  # the film's end, from pacing.py once it is solved (set below)
CAPTIONS = SPEC["edit"]["captions"]
BLOCKS = {b["block"]: b for b in SPEC["timing"]["blocks"]}


def snap(t):
    return round(round(t * FPS) / FPS, 3)


def cap(n):
    """Where a cut or beat before caption n (1-based) sits: timing.py's rule, on a frame."""
    return 0.0 if n == 1 else timing.cut_before(CAPTIONS[n - 1]["start"])


def block_in(b):
    return BLOCKS[b]["in"]


def block_out(b):
    return BLOCKS[b]["out"]


# ---------------------------------------------------------------------------------------------- the shots
# kind: screen (a page of the product, performed: pointer, press, its own response), workflow (the record moving
# between the product's parts), deliverable (a document the product makes), graphic (brand motion graphics).
# palette: "before" (the unbranded tools of today: Blocks 01 to 03 and 09A) or "aurixa" (the brand's own CSS).
# sources: library keys (PL- plates, P, D, REF-LOGO), NEW- pages still to build from the products' code, and
# G- graphics from the kit in BRIEF.md. A beat's "at" is a caption number (its cut) or a number of seconds
# after the shot starts; its "do" is what happens, in order.


def shot(id, block, start, kind, palette, title, sources, beats, camera, result, on_screen=(), notes=""):
    return {"id": id, "block": block, "start": start, "kind": kind, "palette": palette, "title": title,
            "sources": list(sources), "beats": beats, "camera": camera, "result": result,
            "on_screen": list(on_screen), "notes": notes}


SHOTS = [
    # 01 · The opportunity and the client
    shot("01.1", "01", ("block", "01"), "graphic", "before", "Somewhere in Australia, one pin turns gold",
         ["G-SATELLITE", "G-PINS", "G-LISTING", "G-STAGE", "P"],
         [(0.0, "The continent from orbit: Australia in satellite colour and relief, tilted away from the camera in depth, a low warm sun from the north-west raking its ranges, the oceans deepening to the horizon under a thin haze of atmosphere. Already falling into it: white location pins, a few, then hundreds, each landing with a small bounce, a soft shadow on the land and a pinpoint of light, dense along the east coast and around the five capitals, sparse across the interior."),
          (1.5, "The rain of pins thickens into the coastal cities; every pin is the same white."),
          (("cap", 2), "One pin on the New South Wales coast, north-west of Sydney, turns gold: it rises out of the field, a ring pulses out from it once, and every other pin dims a little. The camera begins to fall toward it."),
          (3.25, "The camera arrives over Sydney's north-west, the relief sharpening as it nears; the gold pin's head opens and the property pops up from it on a spring: the photograph P, 14 Wattle Grove, Banksia Rise NSW 2155, four facts, a New listing chip."),
          (4.6, "The card settles, lifted off the map by its own shadow, the gold pin still standing beneath it.")],
         "A slow orbit across the continent, then one fall from orbit to the suburb, easing in; the card ends in the upper action zone with the gold pin under it.",
         "The property's card, readable, above its gold pin on the satellite map.",
         ["14 Wattle Grove", "Banksia Rise NSW 2155", "4 bed · 2 bath · 2 car · 450 m² land", "New listing · just now"],
         "The pins are where Australians live (the ABS's population by statistical area, thinned to about 600 pins), so the east coast glows and the interior stays dark. The imagery is NASA's Blue Marble Next Generation and its shaded relief, public domain; nothing on it names a real street."),
    shot("01.2", "01", ("cap", 3), "screen", "before", "The client asks",
         ["PL-01B-a", "PL-01B-b", "G-WINDOW-PLAIN", "G-POINTER", "G-STAGE"],
         [(0.0, "The card shrinks into a link preview in a plain messaging window that swings in from the right, in depth: from Jordan Ellis to Alex Morgan, today's tools in daylight greys, its shadow soft on the paper-white desk beneath."),
          (0.35, "The question types itself in at a reading pace, the window turning gently toward the camera as it does."),
          (("cap", 4), "The pointer reaches Send and presses it: the window's own pressed state, then Sent, and the message lifts into its thread."),
          (3.2, "On the attached card a small chip appears: Expressions of interest close Friday.")],
         "A slow arc around the window from three-quarter to front-on, easing in to the message and Send; holds on Sent.",
         "Sent, with the question readable and the property attached.",
         ["From: Jordan Ellis · To: Alex Morgan", "Can we review whether this suits my plans?", "Send → Sent", "Expressions of interest close Friday"]),
    # 02 · The scattered workflow
    shot("02.1", "02", ("block", "02"), "workflow", "before", "Four tools, one question",
         ["NEW-INBOX", "G-WINDOW-PLAIN", "G-POINTER", "G-STAGE"],
         [(0.0, "The camera pulls back from the sent message: it is one window of a desk of them, in depth, each a different tool in a different style, floating at different distances under the same daylight. The question lands in a generic inbox as its top row; the pointer moves to Reply and stops, because there is nothing to reply with yet."),
          (("cap", 6), "The camera swings to a research tool, nearer and to the left: a map and comparable sales as grey placeholder rows. It comes forward and fills the frame for a moment."),
          (("cap", 7), "A whip to the right, the frames streaking: a spreadsheet, a few labelled columns and one formula cell selected."),
          (("cap", 8), "Another whip, down and left: a contact card for Jordan Ellis in a third tool, in a different style again."),
          (("cap", 9), "The fourth, behind them all: Untitled report, empty, its caret blinking. The camera pulls back until all four hang in the frame together, misaligned and overlapping, none of them finished."),
          (9.2, "The pointer hops once between the four, and stops.")],
         "One continuous move through a desk of floating windows: a pull back, three whips (each with motion blur and a settle), a final pull back.",
         "Four separate windows in depth, none of them finished, and the empty report in front.",
         ["Can we review whether this suits my plans?", "Research", "Financial worksheet", "Client details", "Untitled report"],
         "Each window is a different tool, so each has its own look: none carries a product's brand."),
    # 03 · The pressure while the client waits
    shot("03.1", "03", ("block", "03"), "workflow", "before", "The market moves, the client waits",
         ["NEW-NOTIFICATIONS", "G-TICKER", "G-PHONE", "G-CLOCK", "G-STAGE"],
         [(0.0, "The four windows hold in their depth; the desktop clock in the corner starts to run (Monday 9:14 onward), and a market ticker scrolls across the lower third: new listings, price guides, auction results, moving."),
          (("cap", 11), "The ticker speeds up; Price guide updated and Inspection booked chips blink beside it."),
          (("cap", 12), "Notifications fly in from every edge (mail, chat, calendar, the CRM, a floor plan received for 14 Wattle Grove), each pushing the windows further apart and out of focus."),
          (("cap", 13), "Everything falls away into the dark except a phone on the desk, face up: its lock screen lights with Jordan Ellis's follow-up, Wednesday 4:52 PM. The clock has run to Wednesday."),
          (8.2, "The phone's light fades a little; the frame dims toward dark.")],
         "Locked off while everything moves; then one slow push down to the phone.",
         "The phone's lock screen alone: the client's follow-up, unanswered.",
         ["Jordan Ellis", "Any update on 14 Wattle Grove? EOIs close Friday.", "Wednesday 4:52 PM"],
         "The ticker's listings and figures are the listing site's own kind (new listings, guides, results), never a claim about Aurixa."),
    # 04 · Aurixa arrives and the viewer enters the console
    shot("04.1", "04", ("block", "04"), "graphic", "aurixa", "The brand arrives, on the drop",
         ["REF-LOGO", "G-HAIRLINE", "G-EMBLEM", "PL-11A-c", "G-WINDOW", "G-STAGE"],
         [(0.0, "In the music's silence the dimmed frame becomes the brand's deep navy and a single gold hairline draws across its middle."),
          (("beat", 0), "On the drop the emblem bursts open out of the hairline: its triangle, then the orb's glow, the light flaring once across the frame."),
          (("beat", 2), "Its wordmark, AURIXA SYSTEMS, rises beneath it letter by letter: the supplied logo, never retyped."),
          (("cap", 15), "The emblem lifts into the top left and becomes the Command Centre's own sidebar mark; the Command Centre assembles in its glass window, in depth: the sidebar's groups, the top bar with its Demo workspace badge, then the Overview.")],
         "Still for the emblem; then one slow push as the Command Centre settles into its window, turned a few degrees in depth.",
         "The Command Centre's Overview in the demo workspace, whole, in its window: the only time the Overview is shown.",
         ["AURIXA SYSTEMS", "COMMAND CENTRE", "DEMO WORKSPACE", "Overview"]),
    shot("04.2", "04", ("cap", 16), "workflow", "aurixa", "One connected operating environment, one portal at a time",
         ["G-PORTAL-SPOTLIGHT", "G-SYSTEM-MAP", "NEW-DASHBOARDS", "PL-06A-a", "G-STAGE"],
         [(0.0, "The Command Centre's window swings back and shrinks to the top of the frame: the hub, its label lit."),
          (0.95, "The Client Portal comes forward on its own, almost the width of the frame, turned slightly in depth: its dashboard for Jordan Ellis, CLIENT PORTAL in large mono above it, a gold underline drawing beneath the label. A line of light runs from the hub to it."),
          (2.15, "It swings aside into its place in an orbit around the hub as the Finance Portal comes forward the same way, FINANCE PORTAL above it."),
          (3.35, "Then the Accountant Portal, ACCOUNTANT PORTAL."),
          (4.55, "Then the Solicitor Portal, SOLICITOR PORTAL."),
          (5.75, "Then the Builders Network, in its own teal, BUILDERS NETWORK."),
          (6.95, "The camera pulls back: the hub and the five portals in their orbit, every line lit, a traveller running each one once.")],
         "A spotlight, five times: each portal arrives large and front of frame, holds while its name is read, and swings back into the orbit; one pull back at the end.",
         "The hub and its five portals, each seen on its own first, joined at the end.",
         ["COMMAND CENTRE", "CLIENT PORTAL", "FINANCE PORTAL", "ACCOUNTANT PORTAL", "SOLICITOR PORTAL", "BUILDERS NETWORK"],
         "The client asked for each portal to be seen on its own and clearly (22 October 2026): the orbit is the payoff after all five, never the way they are introduced."),
    # 05 · Research to financial analysis to a report
    shot("05.1", "05", ("block", "05"), "screen", "aurixa", "From research into financial analysis",
         ["PL-05A-a", "PL-05A-b", "G-RAIL", "G-POINTER", "G-FOCUS", "G-STAGE"],
         [(0.0, "The orbit's Command Centre comes forward and opens on the investment report's page: 14 Wattle Grove, Banksia Rise, its Compass on view and its grade card reading A+. The journey rail slides in above the window with Research lit."),
          (("cap", 20), "Focus corners close on + Financial; the pointer presses it, the tier reads preparing and the rail moves to Financial.")],
         "Starts on the record's header and its A+ grade card; a short pan to + Financial.",
         "Financial preparing from the Compass, the rail on Financial.",
         ["14 Wattle Grove, Banksia Rise", "A+ · Investment Grade", "Compass · + Financial", "Preparing Financial from this Compass", "RESEARCH · FINANCIAL · REPORT · TEAM · DECISION"]),
    shot("05.2", "05", ("cap", 21), "deliverable", "aurixa", "Into a report the client can understand",
         ["PL-05C-a", "NEW-REPORT-CHARTS", "G-PAGE-SCROLL", "G-RAIL", "G-POINTER"],
         [(0.0, "Generated Reports: the pointer opens 14 Wattle Grove's report and the rail moves to Report."),
          (0.55, "The document lifts off the page and comes forward: its cover, A+ in gold beside the address."),
          (("cap", 22), "The pages run past the camera one after another, in depth, each held long enough to read its headline figure: the key figures (purchase price, weekly rent, gross yield, a ten-year growth figure), the capital growth chart rising across ten years, the ten-year cash flow in bars."),
          (4.2, "The run slows on the cash flow page, its last bar settling.")],
         "Follows the click, then rides the pages as they pass, slowing at the end.",
         "The client's report: chart pages, never paragraphs.",
         ["Financial Analysis", "14 WATTLE GROVE, BANKSIA RISE NSW 2155", "A+", "Key figures", "Capital growth", "10-year cash flow"],
         "The pages are the Financial Analysis that 05.1 prepares from the Compass (the product keeps the purchase's modelling out of the Compass and in this report), in the product's own unbranded colours (obsidian #251F18, gold #D9A520); the client asked for figures, charts and infographics rather than pages of prose (22 October 2026). Every modelled page carries the illustrative-example label."),
    # 06 · Communication and the supporting agent
    shot("06.1", "06", ("block", "06"), "screen", "aurixa", "The reply the client was waiting for",
         ["NEW-MESSAGE-HUB", "G-WINDOW", "G-POINTER", "G-STAGE"],
         [(0.0, "The Command Centre's Message Hub, Jordan Ellis's thread: his question from Monday at the top, the reply drafted below it."),
          (0.85, "The pointer presses Send; the reply joins the thread with its delivered tick. The rail moves to Team.")],
         "A gentle push in toward the thread.",
         "Question and answer in one thread, inside Aurixa.",
         ["Can we review whether this suits my plans?", "Your 14 Wattle Grove report is ready in your portal. Let's go through it together on Thursday."],
         "The payoff of 03.1: the client asked again on Wednesday; here he is answered."),
    shot("06.2", "06", ("cap", 24), "workflow", "aurixa", "Client relationships and property partners",
         ["PL-06A-a", "PL-06A-b", "G-RECORD-CARD", "G-LINKS", "G-POINTER"],
         [(0.0, "The Client Portal: Welcome back, Jordan Ellis. The pointer presses My Property Team."),
          (0.75, "The team's page: five of five roles engaged."),
          (("cap", 25), "The five team cards lift out of the page and ring 14 Wattle Grove's record card in depth; a line of light draws from each card to it, and a traveller runs each line once.")],
         "Still, then a slow pull back and a slight orbit as the cards ring the record.",
         "Five named professionals linked to one record.",
         ["My Property Team", "5 of 5 roles engaged", "Alex Morgan · Jamie Chen · Priya Shah · Mia Patel · Daniel Reed"]),
    shot("06.3", "06", ("cap", 26), "screen", "aurixa", "Aurixa Agent, beside the work",
         ["PL-06B-a", "PL-06B-b", "G-POINTER"],
         [(0.0, "The report's page with the agent's own floating button; its label shows on hover."),
          (0.75, "The pointer presses it and the agent's panel opens over the report."),
          (1.4, "Its draft for Jordan sets in as a card that reads Needs your go-ahead.")],
         "Pushes to the panel as it opens.",
         "The agent's draft, marked as needing the professional's go-ahead.",
         ["Aurixa", "Draft a short note to Jordan Ellis about his 14 Wattle Grove client summary.", "Needs your go-ahead"],
         "Guardrail 7: the agent drafts and a person reviews; the card says so on screen."),
    # 07 · Professional judgement remains visible
    shot("07.1", "07", ("block", "07"), "screen", "aurixa", "The professional changes it, then approves it",
         ["PL-07A-a", "PL-07A-b", "G-POINTER"],
         [(0.0, "Close on the draft's next step. The caret enters it."),
          (0.45, "The professional types her own change; each new word takes the marker, a fine gold rule, beneath it as it is typed."),
          (("cap", 28), "The pointer presses Approve: the card reads Approved, with the changed line.")],
         "Close and still; the text is the subject.",
         "Approved, with the professional's own words.",
         ["Make the next step: review the remaining questions together", "Approved"]),
    # 08 · Professional work and the client decision
    shot("08.1", "08", ("block", "08"), "screen", "aurixa", "The accountant's part, done in the same system",
         ["PL-08A-a", "PL-08A-b", "G-POINTER"],
         [(0.0, "The Accountant Portal: Jordan Ellis's client file, Requests. FY2026 income statement · Client responded."),
          (1.1, "The pointer presses Mark fulfilled; the request turns Fulfilled.")],
         "Still, with a slow drift.",
         "The request Fulfilled.",
         ["CLIENT FILE · Jordan Ellis", "FY2026 income statement", "Mark fulfilled → Fulfilled"]),
    shot("08.2", "08", ("cap", 30), "deliverable", "aurixa", "What the client is trusting you with",
         ["NEW-REPORT-CHARTS", "G-PAGE-SCROLL", "G-HIGHLIGHT"],
         [(0.0, "The Investment Compass the Financial Analysis was prepared from, further in: How this grade was reached, A+ on a dial, its five dimensions as bars (capital growth, location, rental yield, demand, property risk), every one scored. The marker settles under the composite, 84."),
          (("cap", 31), "The pages run on: the suburb at a glance (its median price, growth, days on market, the share of owners, drawn as figures and icons), then rental comparables on a chart."),
          (4.0, "The run settles on the risk dashboard: each risk a coloured level with its evidence, nothing in prose.")],
         "Rides the pages as they pass: the Compass, where 05.2 rode the Financial Analysis.",
         "The report's grade, area and risk pages: figures the client can read at a glance.",
         ["How this grade was reached", "A+ · 84", "Capital growth · Location · Rental yield · Demand · Property risk", "Illustrative example only: hypothetical client, figures and assumptions. Not a credit assessment or financial advice."],
         "Guardrail 2: anything modelled carries the illustrative label on the page itself. The grade is the product's own for a composite of 84 across all five dimensions: A+, STRONG BUY - Excellent investment opportunity with strong fundamentals across all metrics. None of these pages appears in 05.2."),
    shot("08.3", "08", ("cap", 32), "screen", "aurixa", "The next decision, in the client's portal",
         ["NEW-CLIENT-REPORTS", "G-POINTER"],
         [(0.0, "The Client Portal's Reports page: the report's card, 14 Wattle Grove, Banksia Rise, Investment Report · Compass, marked New."),
          (0.75, "Beside it, the next discussion's card from My Appointments slides in: Report walkthrough with Alex Morgan, Thu, 22 Oct 2026, 10:00 AM – 10:30 AM, Upcoming. The pointer comes to rest on Download Report.")],
         "Still.",
         "The report and the next discussion, side by side for the client.",
         ["Investment Report · Compass · New", "Download Report", "Report walkthrough with Alex Morgan", "Thu, 22 Oct 2026 · 10:00 AM – 10:30 AM · Upcoming"],
         "Guides the decision: nothing on screen makes it."),
    # 09 · The manual gap and the connected matter
    shot("09.1", "09", ("block", "09"), "graphic", "before", "Bridging the gaps by hand",
         ["PL-09A", "G-BRIDGE", "G-STAGE"],
         [(0.0, "Back in today's grey tools, under flat daylight: two plain document lists for 14 Wattle Grove side by side in depth, each with its own copy of the contract and the floor plan."),
          (("cap", 34), "Dashed bridges reach across the gap between them; a document is dragged across by hand, a bridge breaks, a third copy appears."),
          (4.4, "The broken bridges hang; the grey frame holds a moment, unresolved.")],
         "Still, with a slow drift that stops as the bridge breaks.",
         "Two grey lists, three copies of one document, no bridge holding.",
         ["14 Wattle Grove — documents"],
         "The film's last look at today's tools: plain greys, the system face, no glass and no gold."),
    shot("09.2", "09", ("cap", 35), "screen", "aurixa", "One register instead",
         ["G-LIGHT-SWEEP", "PL-09B-a", "PL-09B-b", "G-POINTER"],
         [(0.0, "A band of gold light sweeps across the frame from left to right on the beat: behind it the grey lists burn away and the dark of Aurixa takes their place, so the change from today's tools to the product is a single, visible event."),
          (0.7, "The Solicitor Portal, the matter Ellis: Purchase, 14 Wattle Grove, settles in its glass window; the pointer presses Docs."),
          (1.3, "The document register: four documents, one copy of each, each with its status.")],
         "Locked through the sweep, then a short push to the register.",
         "The register, 3 outstanding of 4, the floor plan Under review.",
         ["Ellis: Purchase, 14 Wattle Grove", "Document register", "Contract of sale (draft) · Floor plan — 14 Wattle Grove · Building specification · Planning certificate"],
         "The client asked for a clear distinction between the generic system and Aurixa's own (22 October 2026): the sweep is it."),
    # 10 · The system is here
    shot("10.1", "10", ("block", "10"), "graphic", "aurixa", "Not on the horizon",
         ["G-SUNRISE"],
         [(0.0, "Dawn: a long gold horizon across the lower third of the navy, and the sun's edge beginning to clear it, its light spreading up the sky and along the line."),
          (1.3, "The sun rises fully above the horizon, its rays fanning across the frame, the navy above it warming toward gold.")],
         "One slow rise with the sun.",
         "The sun clear of the horizon, the frame lit gold.",
         [],
         "Aurixa Systems isn't on the horizon: the sun is already up. The system map is not shown again."),
    shot("10.2", "10", ("cap", 37), "graphic", "aurixa", "We've arrived: the logo, at the viewer, and the invitation",
         ["G-LOGO-JUMP", "PL-11A-a", "G-CTA", "G-POINTER"],
         [(0.0, "Out of the sun the emblem leaps at the viewer: it rushes from small to filling the frame with a burst of light and a ring that ripples outward, overshoots, and settles at the top of the card."),
          (("cap", 37), "AURIXA SYSTEMS sets in beneath it; the trial invitation rises into the centre: 14-DAY FREE TRIAL, and the button START YOUR FREE TRIAL, its gradient pulsing gold to light gold to cyan and back, a soft glow breathing around it."),
          (("cap", 38), "The pointer arrives over the button: it lifts, its glow brightens and the gradient quickens; the press, and a ripple of light runs out from it across the card."),
          (5.1, "The card holds, the button pulsing, as the light settles.")],
         "Still for the logo's leap (the leap is the move); then a slow push to the button.",
         "The invitation, whole, with its button pressed and pulsing.",
         ["AURIXA SYSTEMS", "14-DAY FREE TRIAL", "START YOUR FREE TRIAL"],
         "One shot from the logo to the press: the close-up of the button that repeated it (the second cut's 11.1) is gone, at the client's direction (22 October 2026)."),
    # 11 · The fourteen day invitation
    shot("11.1", "11", ("cap", 39), "screen", "aurixa", "Your fourteen days begin",
         ["NEW-TRIAL-SETUP", "G-WINDOW"],
         [(0.0, "The press carries through into a new window: Setting up your trial workspace, three steps checking themselves off in turn (Workspace created · Demo data loaded · Portals connected)."),
          (1.5, "The window settles on Your 14-day trial is ready, a day counter reading 14 days left beside it.")],
         "A short push as the steps complete.",
         "The trial ready, fourteen days on the counter.",
         ["Setting up your trial workspace", "Workspace created · Demo data loaded · Portals connected", "Your 14-day trial is ready", "14 days left"],
         "Replaces the Overview the second cut showed here, which the brand's arrival (04.1) already shows (22 October 2026)."),
    # 12 · Explore the working partner portals
    shot("12.1", "12", ("block", "12"), "screen", "aurixa", "Explore the platform",
         ["NEW-MARKETPLACE", "G-POINTER", "G-STAGE"],
         [(0.0, "The Command Centre's Property Marketplace, in depth: a grid of listing cards, 14 Wattle Grove among them with its gold A+ chip. The camera glides across the grid as the pointer moves over it, each card it passes lifting under it."),
          (1.5, "The pointer comes to rest on 14 Wattle Grove's card, which lifts and brightens.")],
         "One slow lateral glide across the grid, easing to a stop on the card.",
         "The marketplace, 14 Wattle Grove under the pointer.",
         ["Property Marketplace", "14 Wattle Grove, Banksia Rise", "A+"],
         "The tour has room now: one page, explored, instead of four in a second and a half."),
    shot("12.2", "12", ("cap", 41), "screen", "aurixa", "Alongside the way you work: the builder",
         ["PL-12A-a", "G-FLOORPLAN", "G-POINTER", "G-DOCUMENT"],
         [(0.0, "The Builders Network: Daniel Reed's Stock List, 14 Wattle Grove Selected for a client."),
          (0.85, "The pointer opens its floor plan: the plan lifts out of the page as a sheet, drawn clean and whole, every room named and dimensioned."),
          (2.0, "The plan holds, turned a little toward the camera.")],
         "A gentle push, then still on the plan.",
         "The floor plan, whole, lifted off the builder's page.",
         ["Stock List", "SELECTED FOR A CLIENT", "14 Wattle Grove · Floor plan"],
         "The plan is drawn new for this cut, at the client's direction (22 October 2026): 4 bedrooms, 2 bathrooms, a double garage, every wall and label crisp at the frame's size."),
    shot("12.3", "12", ("cap", 42), "workflow", "aurixa", "The same document, the solicitor's notes",
         ["PL-12B-a", "PL-12B-b", "G-FLOORPLAN", "G-POINTER", "G-DOCUMENT"],
         [(0.0, "The same floor plan (carried over from 12.2 as one object) travels across to the left; the solicitor's matter and its Notes window open beside it."),
          (1.1, "The pointer presses Save notes; the product's toast: Matter updated.")],
         "Follows the plan across, then still.",
         "The plan beside the notes, Matter updated.",
         ["14 Wattle Grove · Floor plan", "Notes", "Matter updated"]),
    shot("12.4", "12", ("cap", 43), "graphic", "aurixa", "What a more connected business could feel like",
         ["G-DEVICES"],
         [(0.0, "A laptop, a tablet and a phone in depth, each showing a different portal on the same record: the Command Centre, the Client Portal, the Builders Network. A pulse of light leaves the laptop and runs to the others; as it arrives each screen updates at once, the same Matter updated on all three."),
          (1.3, "The three settle together, in sync, the pulse fading.")],
         "A slow orbit around the three devices.",
         "Three devices, one record, in sync.",
         ["Matter updated"],
         "Replaces the system map the second cut showed here (22 October 2026)."),
    # 13 · The viewer can assess the experience
    shot("13.1", "13", ("block", "13"), "screen", "aurixa", "A decision recorded, and the journey complete",
         ["PL-13A-a", "PL-13A-b", "G-RAIL", "G-POINTER"],
         [(0.0, "The Finance Portal: Record finance decision for 14 Wattle Grove, Subject to valuation."),
          (0.9, "The pointer presses Record decision; the product's toast: Decision recorded."),
          (("cap", 45), "As the music falls away, the camera pulls back to the journey rail, now complete: Research, Financial, Report, Team, Decision, the last reading Subject to valuation."),
          (4.6, "The rail holds in the quiet.")],
         "Still, then one long pull back into the quiet.",
         "The complete rail, ending on Subject to valuation.",
         ["Record finance decision", "Decision: Subject to valuation", "Decision recorded"],
         "The decision recorded is the broker's call, Subject to valuation: no approval or outcome is shown."),
    # 14 · Four short statements and a personal decision
    shot("14.1", "14", ("block", "14"), "graphic", "aurixa", "Fourteen days. Your business. Your experience. Your decision.",
         ["PL-14A-1", "PL-14A-2", "PL-14A-3", "PL-14A-4", "G-WALL"],
         [(0.0, "A slow lateral drift across a wall of the film's own screens, dimmed and softened."),
          (("phrase", 1), "Fourteen days."), (("phrase", 2), "Your business."), (("phrase", 3), "Your experience."), (("phrase", 4), "Your decision.")],
         "One slow lateral drift, never reversing.",
         "Each phrase alone and readable on the wall of screens, each landing on the music's downbeat.",
         ["Fourteen days.", "Your business.", "Your experience.", "Your decision."],
         "The phrases are set as the captions are, at display size: Playfair Display in the site's silver headline gradient, the key word in its gold italic (Fourteen, business, experience, decision) with the gold rule drawing under it; each key word lands on a downbeat of the breakdown (pacing.py); no captions over them."),
    # 15 · The final brand and trial invitation
    shot("15.1", "15", ("block", "15"), "graphic", "aurixa", "Aurixa Systems, and the trial: the last word",
         ["PL-15A", "G-CTA", "G-POINTER"],
         [(0.0, "On the music's return the closing card slams in with it: a flash of light, the logo landing at full size with a shock ring, the gold lines of the card drawing out from it; the operating-system line, 14-DAY FREE TRIAL, the button and aurixasystems.com.au are there from this first frame."),
          (("bar", 51), "The button's gradient pulses on the bar; light runs around its edge."),
          (("bar", 53), "As Start your free trial today is spoken, the pointer arrives and the button rises under it, glowing."),
          (("bar", 54), "On the last downbeat the press: a burst of light from the button and a ring across the whole card, the logo flaring once; then everything settles and holds, the button still breathing.")],
         "Still, but alive: the card's own light moves on the music's bars.",
         "The closing card, pressed on the last downbeat, held through the ring of the music.",
         ["AURIXA SYSTEMS", "The operating system for modern property professionals.", "14-DAY FREE TRIAL", "START YOUR FREE TRIAL", "aurixasystems.com.au"],
         "The pack's rule still holds: the whole offer is visible from the first frame of Block 15. What moves is light and the press, on the music's bars (pacing.py)."),
]
SHOTS_V3 = SHOTS  # pacing.py reads the cuts from here


# --------------------------------------------------------------------------------------- resolve and check
def moment(ref, start):
    """A beat's or shot's time on the voiceover's own clock, before pacing.py holds it open: a number is seconds
    after the shot's start."""
    if isinstance(ref, (int, float)):
        return snap(start + ref)
    kind, value = ref
    if kind == "cap":
        return cap(value)
    if kind == "block":
        return block_in(value)
    if kind == "phrase":
        return SPEC["edit"]["overlays"][value - 1]["start"]
    raise ValueError(ref)


def on_frame(t):
    """A music moment on the frame its attack falls in."""
    return round(math.floor(t * FPS + 1e-6) / FPS, 3)


def film_moment(ref, start):
    """A beat's or shot's time on the film's clock: the voiceover's moments moved by pacing.py's pauses (a cut or a
    beat before a word as a cut, a phrase as a word); the music's own moments (`beat` n, `bar` b: 0 is the drop) on
    the frame their attack falls in; a number is seconds after the shot's start."""
    if isinstance(ref, (int, float)):
        return snap(start + ref)
    kind, value = ref
    if kind in ("cap", "block"):
        return snap(pacing.warp_cut(moment(ref, 0)))
    if kind == "phrase":
        return snap(pacing.warp_word(moment(ref, 0)))
    if kind == "beat":
        return on_frame(pacing.film_beat(value))
    if kind == "bar":
        return on_frame(pacing.film_bar(value))
    raise ValueError(ref)


# The third cut's pauses, solved on these shots, and the film's end: the last downbeat and its ring.
pacing.solve([(s["id"], moment(s["start"], 0)) for s in SHOTS], cap(45))
END = round(pacing.end_frame() / FPS, 3)


# A block whose own cut falls inside the shot before it, and that shot: the trial's button is pressed in 10.2, which
# runs on from the invitation (the second cut showed the press on its own, as 11.1; the client asked for it to go).
RUNS_OVER = {"11": "10.2"}


def resolved():
    """Every shot with its in, out, seconds, the voiceover under it and its beats on the film's clock; checked."""
    out = []
    voice = [moment(s["start"], 0) for s in SHOTS]
    starts = [film_moment(s["start"], 0) for s in SHOTS]
    for i, s in enumerate(SHOTS):
        start, end = starts[i], (starts[i + 1] if i + 1 < len(SHOTS) else END)
        v0, v1 = voice[i], (voice[i + 1] if i + 1 < len(SHOTS) else timing.END)
        if end <= start:
            raise SystemExit(f"{s['id']}: starts at {start} but the next shot starts at {end}")
        if s["start"][0] == "block" and s["start"][1] != s["block"]:
            raise SystemExit(f"{s['id']}: a block's first shot must start on the block's cut")
        beats = [{"at": film_moment(at, start), "do": text} for at, text in s["beats"]]
        for a, b in zip(beats, beats[1:]):
            if b["at"] < a["at"]:
                raise SystemExit(f"{s['id']}: beat at {b['at']} comes before the beat at {a['at']}")
        if beats and (beats[0]["at"] < start or beats[-1]["at"] >= end):
            raise SystemExit(f"{s['id']}: a beat falls outside {start}–{end}: {[b['at'] for b in beats]}")
        # The lines this shot carries: the captions whose first word is spoken in it (every cut sits just before a
        # caption, so each line belongs to exactly one shot); a shot no line starts in shows the line it sits in.
        words = [c["text"] for c in CAPTIONS if v0 - 1e-6 <= timing.onset(c["start"]) < v1 - 1e-6]
        if not words:
            words = [c["text"] for c in CAPTIONS if c["start"] < v1 and c["end"] > v0]
        if s["block"] == "14":
            words = [o["text"] for o in SPEC["edit"]["overlays"]]
        if s["block"] == "15":
            words = [c["text"] for c in SPEC["timing"]["cues"] if c["start"] >= v0]
        out.append({**{k: v for k, v in s.items() if k not in ("start", "beats")},
                    "in": start, "out": round(end, 3), "seconds": round(end - start, 3),
                    "voice_in": v0, "voiceover": words, "beats": beats})
    if out[0]["in"] != 0 or abs(sum(s["seconds"] for s in out) - END) > 1e-6:
        raise SystemExit("The shots don't run from 0 to the film's end")
    for b, block in BLOCKS.items():
        first = next(s for s in out if s["block"] == b)
        want = snap(pacing.warp_cut(block["in"]))
        if first["in"] != want:
            host = RUNS_OVER.get(b)
            if not host or not any(s["id"] == host and s["in"] < want < s["out"] for s in out):
                raise SystemExit(f"Block {b} starts at {want} but its first shot starts at {first['in']}")
    return out


# ------------------------------------------------------------------------------------------- the brief's words
TITLE = "Aurixa Systems · Reel 1 · System edition"
EXTENDS = {"brief": "848af668-b28b-4ddb-8ab2-f8916ce314f0",
           "title": "Aurixa Systems Reel 1 Video Production — Final Cinematic Edition / Revision 2",
           "source": SPEC["source"]}

IDEA = ("Watch one property move through one connected system. 14 Wattle Grove arrives as a single enquiry, waits "
        "while today's scattered tools fail to answer it, and then travels through Aurixa Systems: research, "
        "financial analysis, the client's report, the professional team's portals, the agent's draft and the "
        "professional's own judgement, to a recorded decision and a 14-day trial. Every frame is the product "
        "working, readable, or a graphic drawn in the product's own design system.")

KEEPS = [
    "The master voiceover, verbatim and never stretched: 106.031 s, speech ending at 105.88 s. Since the third cut it is held open in its own silences (pacing.py: 51 pauses between its measured speech segments, each a whole number of frames), so the film runs to the music's last downbeat and its ring.",
    "Its cut points. Each block starts where the working master's block starts, and every new cut uses the spec's timing rule (in the pause before a word, else 0.1 s ahead, on the 30 fps grid).",
    "The 45 captions, verbatim, at most two lines; none over the Block 14 phrases or the closing card. Since 22 October 2026, at the client's direction, set in the brand's own type and moving (scripts/aurixa-reel-1/captions.cjs): Playfair Display Medium, the site's headline face, in its silver headline gradient, one phrase a line in its italic (silver before the brand arrives, gold after, where a gold hairline draws under it and the light crosses it once), each word rising into focus on its spoken time (the voiceover's measured words), on a panel that reshapes from line to line: a white card of today's tools before the brand, the site's glass after.",
    "The Block 14 phrases (PL-14A-1 to PL-14A-4) at the edit's own times.",
    "The closing card (PL-15A), complete from the first frame of Block 15 through the audio tail.",
    "The record, since the third cut a mock address at the client's direction: 14 Wattle Grove, Banksia Rise NSW 2155 (Banksia Rise is not a real suburb), stock reference WG-14, the property image P and a floor plan drawn new for this cut, still at the evaluation stage, graded A+ on a composite of 84 across all five dimensions in the product's own words (STRONG BUY - Excellent investment opportunity with strong fundamentals across all metrics).",
    "The names, now only as accounts and records on screen: Jordan Ellis (client), Alex Morgan, Jamie Chen, Priya Shah, Mia Patel, Daniel Reed.",
    "A Demo workspace label on every Aurixa screen, and fictional demonstration data only.",
    "Every don't in the pack's brand guidelines, and the twelve guardrails of the studio's Aurixa Systems kit (docs/brands/aurixa-systems.md): no fabricated returns, approvals, valuations or results; no automatic financial, legal or accounting decision; no NPC wording; Aurixa Systems, AURIXA SYSTEMS and Aurixa Agent spelled exactly.",
    "9:16, 1080 x 1920, 30 fps.",
]

REPLACES = [
    ("People, hands, faces, rooms and sets, and the cast's sheets and Soul IDs",
     "None appear. The product is the cast. (The six characters and their approved Soul IDs stay in the studio, unused here.)"),
    ("Generated video of any kind",
     "None, but for the logo's moments, which the client asked to be made with a video model (22 October 2026): 04.1's reveal and the logo alive on the trial and closing cards are footage of the logo's clean plate (the supplied art with its lettering taken out), and the supplied lettering and emblem are laid over it, so no letter is ever drawn by a model. Every other frame is rendered from code: the products' pages as the reel's plates already rebuild them, and graphics written in the brand's CSS. Text is exact and sharp by construction."),
    ("\"Each portal demonstration must show a real hand using a mouse, keyboard or touchpad\"",
     "Each portal demonstration shows the product's own pointer, the control under it, the press, and the product's own response, in that order."),
    ("\"60 percent people and property, 25 percent platform, 15 percent architecture\"",
     "About 70 percent screen actions and workflows, 20 percent deliverables, 10 percent brand graphics (an editorial intention, as before)."),
    ("The afternoon-to-blue-hour progression",
     "A colour progression instead: the unbranded tools of today in plain light greys (Blocks 01 to 03, and 09.1), then the brand's deep navy and gold from Block 04 on."),
    ("\"Do not insert raw source screenshots into the film\"",
     "Kept, and it matters more now: the supplied screenshots carry real client names, addresses and personal bookmarks. They remain the structural reference; every screen in the film is the code-built page with the demo record."),
]

SCREEN_RULES = [
    "One action per shot beat, and a result held at least 0.8 s before anything else moves (the montage 12.1 is the one exception).",
    "The pointer is the product's: a standard arrow at 1.6 times its size so it reads on a phone, white with a dark edge. It travels on a gentle curve (the products' emphasized ease) and never jumps. A press is the control's own pressed state plus a fine ring in the focus cyan that grows and fades over the products' slow step, 320 ms.",
    "Typing appears at a reading pace (about 16 characters a second) with the product's own caret.",
    "Toasts, progress and page changes are the product's own components with their own timing.",
    "A screen only changes because of an action the viewer sees, and only to the page that action really opens.",
    "Anything the voiceover names is at least 22 px tall on the final 1080 x 1920 frame; smaller text is context, never the point.",
    "Desktop pages keep their desktop layout, at the zoom their plates were drawn at, inside a window: the frame opens on the whole window for orientation, then a virtual camera moves in on the part that acts.",
]

FRAME_ZONES = [
    ("Top", "0 to 250 px", "kept clear for the platform's own interface"),
    ("Rail", "250 to 360 px", "the journey rail (G-RAIL) when it is on screen"),
    ("Action", "360 to 1300 px", "the window, the action and its result"),
    ("Captions", "1300 to 1560 px", "the captions (lower third); nothing the viewer must read sits behind them"),
    ("Bottom", "1560 to 1920 px", "kept clear for the platform's own interface; nothing important within 120 px of the right edge"),
]

PRODUCTION = [
    ("Compositions", "Each shot is one HTML composition at 1080 x 1920: the plate builders' own pages (scripts/aurixa-reel-1/portals.cjs, built from the products' code) placed in the graphics kit's window, with a timeline that sets every element's state at time t from the shot's beats in brief.json."),
    ("Rendering", "Frame by frame in Chromium (Playwright): set t = frame / 30, let the page lay out, capture, and encode at 30 fps with ffmpeg (H.264, yuv420p, high quality; an overlay with transparency as ProRes 4444). Deterministic: the same brief renders the same film, and a change to one shot re-renders only that shot."),
    ("Design tokens", "The kit's colours, type, radii, shadows, glass and motion come from one stylesheet written from the four Aurixa repositories' own code (see The design system, from the code), not from values picked by eye."),
    ("Assembly", "scripts/aurixa-reel-1/render.cjs draws the whole reel, shot by shot from scenes/, and encodes it as one master with its soundtrack: the method the client approved on 22 October 2026 after the proof of 04.1 to 05.2. The studio's Editor is not in the picture's path."),
    ("Soundtrack", "National Treasures under the whole film and the voiceover held open in its silences (pacing.py), laid out as a studio edit's audio items on the Editor's mixer channels (the voiceover on its own channel, the music and its four pieces on Music & FX, each with its gain, fades and ducking under speech) and mixed by the studio's own media worker code, with two-pass loudness normalisation (soundtrack.py)."),
    ("Cost", "Nothing billed by a provider but the logo's moments: one image edit for its clean plate and the video model's takes (logo-takes.json); the rest is building the kit, the pages and the compositions, then rendering."),
]

REVIEW_GATES = [
    "Style frames: one still per block, at its key beat, in the final look. Approve before anything moves.",
    "Animatic: the shots as timed stills on the voiceover, with the captions. Approve the timing before the final renders.",
    "First render: the full reel in the Editor as a draft, then shot by shot changes.",
]

DECISIONS = [
    ("The music's licence", "National Treasures is the client's choice (22 October 2026) and is in the film. Its licence for paid or public use is the client's to confirm before the film runs anywhere but review."),
    ("Real product footage", "If the client can record the live Command Centre on the demo workspace, those recordings can replace any composition one for one. The code-built pages are the default because they are exact, fictional and ready now."),
    ("The opening palette", "Blocks 01 to 03 are deliberately unbranded and light, so Block 04's turn to navy and gold reads as Aurixa arriving. The alternative is to open in the brand's navy and keep the problem in muted tones."),
]


# ----------------------------------------------------------------------------------------- the graphics kit
# Each graphic is built once, as HTML and CSS on the design tokens (DESIGN below), and used across shots. Its
# roles name the tokens it is drawn in; DESIGN resolves each role to a declaration in one of the repositories.
GRAPHICS = {
    "G-WINDOW": ("The glass window", "The Aurixa pages' holder: the page at its drawn zoom inside a rounded window of the products' own glass (fill, sheen and hairline stroke), lifted by their largest glass shadow, floating on the site's ground in the frame's action zone.", ["ground", "glass", "sheen", "border", "radius-window", "shadow-window"]),
    "G-WINDOW-PLAIN": ("The plain window", "The same window for today's tools: white, a grey system title bar, the system's own type, no brand colour and no glass.", ["before-surface", "before-border", "before-ink", "before-type"]),
    "G-POINTER": ("The pointer and its press", "A standard arrow at 1.6x, white with a dark edge, moving on the products' emphasized ease; a press draws a 1 px ring in the focus cyan that grows from 0 to 24 px and fades over 320 ms.", ["pointer", "ease-move", "press-ring", "motion-press"]),
    "G-FOCUS": ("Focus corners", "The site's own corner marks (.compliance-corners): a 1 px cyan corner top left and a gold one bottom right, 1rem long, closing in on the part of a page that acts.", ["corners", "ease-settle"]),
    "G-RAIL": ("The journey rail", "Research · Financial · Report · Team · Decision, set in the site's eyebrow (mono, .28em, uppercase) on a panel strip above the window; the current stage in gold ink with the eyebrow's gold rule, the ones passed ticked, the rest muted. The film's one recurring chapter device.", ["surface", "mono", "gold-ink", "hairline", "ink-muted"]),
    "G-SYSTEM-MAP": ("The system map", "The Command Centre as the hub, five portal windows around it (Client, Finance, Accountant, Solicitor, Builders Network), each on its own dashboard, on the site's cyan dot field. Each is joined to the hub by the site's rail line (cyan to gold), which draws in; a traveller dot runs along a line when something passes along it. Labels in the eyebrow mono on panel chips; the Builders Network window carries its own teal. Never rotates.", ["ground", "dot-field", "glass", "surface", "link-line", "traveller", "mono", "gold-ink", "teal-builders"]),
    "G-RECORD-CARD": ("The record card", "14 Wattle Grove · WG-14 with the image P: the object the film follows. The same card in every scene it appears in, its title in the display serif, settling on the products' ease-out.", ["surface-raised", "border", "radius-card", "ink", "display", "sans", "ease-settle"]),
    "G-LINKS": ("Links", "The site's rail line (1 px, cyan to gold) drawn from one card to another, with a traveller dot that runs it once and settles; used for the team ringing the record.", ["link-line", "traveller", "ease-move"]),
    "G-DOCUMENT": ("The document", "A PDF that lifts off a page as an object: its cover in front, its pages fanned behind, each the report's own page as the product prints it, with the products' deepest elevation beneath. The floor plan travels between portals as the same object.", ["shadow-document", "ease-settle"]),
    "G-HIGHLIGHT": ("The marker", "The eyebrow's 1 px gold rule, drawn under the passage the voiceover points to and under the words the professional types.", ["hairline", "gold", "ease-settle"]),
    "G-HAIRLINE": ("The hairline", "One gold line drawn across the frame on the site's ground, with the traveller's gold glow at its leading end: the turn from today's tools to Aurixa.", ["ground", "hairline", "glow-gold"]),
    "G-EMBLEM": ("The emblem build", "The supplied logo, at half the frame's width, revealed out of the night by a video model's take of its clean plate that ends exactly on the supplied art; then its own lettering, the art's pixels and the shadow they stand in, rising letter by letter and the light crossing it once; then the emblem, the supplied file, lifts into the Command Centre. The logo is the supplied file, never redrawn or retyped.", ["ground", "hairline", "glow-gold", "ease-settle"]),
    "G-WALL": ("The wall of screens", "The film's own screens tiled at a slight angle in their glass windows, dimmed and softened by the products' strongest glass blur, drifting slowly sideways behind the Block 14 phrases.", ["ground", "blur", "shadow-window"]),
    "G-LISTING": ("The listing card", "A plain property-site card (no product's brand): the image P, the address line, four facts and small status chips.", ["before-surface", "before-border", "before-ink", "before-ink-muted", "before-type"]),
    "G-CLOCK": ("The desktop clock", "A small clock in the corner of today's desktop that runs from Monday to Wednesday through Block 03.", ["before-ink", "before-type"]),
    "G-BRIDGE": ("The bridges", "Dashed lines that try to join two plain document lists and break; a document dragged across by hand.", ["before-ink-muted", "before-border"]),
    "G-SATELLITE": ("The continent from orbit", "Australia in NASA's Blue Marble Next Generation colour with its shaded relief multiplied in, graded toward night (deeper oceans, lifted ranges, a low warm sun from the north-west), laid on a plane the camera views in perspective and falls toward; a thin haze of atmosphere at the horizon, a vignette, and the relief sharpening as the camera nears. Public-domain imagery: no street is named on it.", ["satellite", "perspective", "ground"]),
    "G-PINS": ("The pins", "Hundreds of white location pins, a stem and a head with a soft shadow on the land and a pinpoint of light, placed where Australians live and landing in waves with a small bounce; one turns gold, rises out of the field and pulses a ring while the rest dim.", ["ink", "gold", "glow-gold"]),
    "G-STAGE": ("The stage in depth", "Windows and documents set in a space instead of on a flat page: the site's own perspective (its grid-forward keyframe), a few degrees of turn, soft shadows on a ground that fades into the distance (paper white for today's tools, the brand's night after), depth of field on what is not the subject, and camera moves with motion blur.", ["perspective", "shadow-window", "blur", "before-paper"]),
    "G-TICKER": ("The market ticker", "A strip of listings and prices scrolling across today's desktop (New listing · Price guide updated · Auction result) in the system face, speeding up as the pressure builds.", ["before-ink", "before-ink-muted", "before-type"]),
    "G-PHONE": ("The phone", "A plain phone face up on the desk, its lock screen lighting with the client's follow-up: no product's brand, the system's own type.", ["before-surface", "before-ink", "before-type"]),
    "G-PORTAL-SPOTLIGHT": ("One portal at a time", "Each portal comes forward on its own, almost the frame's width and turned slightly in depth, its dashboard live and its name above it in the eyebrow's mono at display size with a gold rule drawing under it; then it swings into its place in an orbit around the hub as the next comes forward, a line of light running from the hub to it.", ["glass", "mono", "gold-ink", "hairline", "link-line"]),
    "G-PAGE-SCROLL": ("The pages, running past", "The report's pages travel past the camera one after another in depth, each with the document's own deep shadow, slowing on each long enough to read its headline figure.", ["shadow-document", "ease-move"]),
    "G-LIGHT-SWEEP": ("The light sweep", "A band of gold light, the hairline's colour with the traveller's glow, sweeping across the frame on a beat: today's grey tools burn away behind it and the brand's night takes their place.", ["gold", "glow-gold", "traveller"]),
    "G-SUNRISE": ("The sunrise", "A long gold horizon across the navy and the sun clearing it: its disc in the traveller's light, rays fanning up, the sky warming above it.", ["ground", "gold", "glow-gold", "traveller"]),
    "G-LOGO-JUMP": ("The logo, at the viewer", "The supplied emblem rushing from small to filling the frame on the products' emphasized ease, with a burst of light and a ring rippling outward, overshooting and settling on their ease-out: the supplied file, never redrawn.", ["ease-move", "ease-settle", "glow-gold"]),
    "G-CTA": ("The button, alive", "START YOUR FREE TRIAL on the site's own prismatic button (.btn-chrome-prismatic: its marketing gradient at -45 degrees through gold and cyan, moving on prism-shine), quickened into a pulse, with pulse-glow's gold halo breathing around it; under the pointer it lifts and brightens, and its press is the focus ring's ripple.", ["cta-gradient", "pulse-glow", "press-ring", "motion-press"]),
    "G-DEVICES": ("The business in sync", "A laptop, a tablet and a phone in depth, each showing a different portal on the same record; a pulse of light runs between them along the rail line and each screen updates as it arrives.", ["glass", "link-line", "traveller", "perspective"]),
    "G-FLOORPLAN": ("The floor plan", "14 Wattle Grove drawn clean at the frame's own size: walls in solid ink, doors and windows as an architect draws them, every room named and dimensioned, a north point and a scale bar; a sheet that lifts off the page as the document does.", ["display", "sans", "hairline", "shadow-document"]),
}

# Pages a shot needs that no plate has yet: each is built from the product's own code, like the 41 plates.
NEW_PAGES = {
    "NEW-INBOX": ("A generic inbox", "Today's tools: a plain mail client with Jordan Ellis's question as the top row, and Reply.", "01.2's question; no product's brand"),
    "NEW-NOTIFICATIONS": ("Today's notifications", "Plain toasts from mail, chat, a calendar and a CRM, and the floor plan received for 14 Wattle Grove (PL-03A's item).", "unbranded system notifications"),
    "NEW-MESSAGE-HUB": ("Command Centre · Message Hub, Jordan Ellis's thread", "Two states. First, his question from Monday at the top and Alex Morgan's reply typed in the composer, his row in the list reading Draft; then sent, with its delivered tick, and his row moved to Today: Your 14 Wattle Grove report is ready in your portal. Let's go through it together on Thursday.", "npc-client-dashboard's Message Hub (the list, the thread and its Details)"),
    "NEW-CLIENT-REPORTS": ("Client Portal · the report and the next discussion", "Two pages. Reports: 14 Wattle Grove, Banksia Rise, Investment Report · Compass, New, with Download Report. My Appointments: Report walkthrough with Alex Morgan, Thu, 22 Oct 2026, 10:00 AM – 10:30 AM, Upcoming.", "npc-client-dashboard's Client Portal: its Reports and My Appointments pages"),
    "NEW-DASHBOARDS": ("The Solicitor, Accountant, Finance and Builders Network dashboards", "Each portal's home page with the demo record. Shah Legal (Priya Shah): Welcome back, Open matters, 1 active matter; Ellis: Purchase, 14 Wattle Grove in Contract review, marked Watch after 13 days in the stage. Patel & Co Accountants (Mia Patel): Good to see you, Mia, 1 allocated client; Needs you next: Jordan Ellis, purchasing entity not yet confirmed. Harbour Finance Group (Jamie Chen): Welcome back, Jamie, the agreement templates (download only), and Today: You're clear for today. Reed Constructions (Daniel Reed): Welcome back, the organisation's title block, 1 project; Recent activity and Project delivery attention, both empty. The Client Portal's is PL-06A-a.", "the supplied dashboard screenshots' layout, the portals' code (npc-client-dashboard, aurixa-builders) and the plates' own sidebars"),
    "NEW-REPORT-CHARTS": ("Investment Compass · the client's report, in figures", "The product's report in its own unbranded colours (white pages under the issuer's running head, gold #D9A520 and obsidian #251F18), drawn as figures instead of prose: the cover with A+ beside the address; Key figures (purchase price $1,150,000, weekly rent $850, gross yield 3.8 percent, ten-year median growth); capital growth, the council area's median price across ten years as a line; the ten-year cash flow in bars; How this grade was reached, A+ on a dial and its five dimensions as bars, composite 84; the suburb at a glance in figures and icons; rental comparables on a chart; the risk dashboard in levels. Every modelled page carries the illustrative-example label.", "npc-client-dashboard's standard Investment PDF (its running head, palette and chart primitives: gauge, bars, line, tiles) and its grade composer (scoringV2Production.pure.ts: A+ from 80, STRONG BUY across all metrics)"),
    "NEW-TRIAL-SETUP": ("The trial's first minute", "Setting up your trial workspace: three steps checking themselves off (Workspace created · Demo data loaded · Portals connected), then Your 14-day trial is ready with a day counter at 14 days left, in the Command Centre's own cards and progress steps.", "npc-client-dashboard's Command Centre components and the site's 14-day trial"),
    "NEW-MARKETPLACE": ("Command Centre · Property Marketplace", "The Listings page as the product draws it: a grid of listing cards (photograph, address, price, beds, baths, cars) under its filters; 14 Wattle Grove among them with its A+, the rest mock addresses in neighbouring suburbs.", "npc-client-dashboard's Listings page (the Property Marketplace) and its listing card"),
}



# ------------------------------------------------------------------------------------------ the design system
# Read from the four repositories' code on 21 October 2026. Every value names the file it is declared in; a
# role is what a graphic is drawn in, resolved here to one declaration (check_sources checks the two agree).
SITE, BUILDERS, NPC = "aurixa-systems", "aurixa-builders", "npc-client-dashboard"
BOTH = f"{NPC} and {BUILDERS} `src/styles/tokens.css`"
DESIGN = {
    "intro": (
        "The brand is written down four times, in four repositories, and they do not agree. This edition takes its graphics "
        "from the one the others name as their source: the public site's `@theme` (aurixa-systems, `src/index.css`). The "
        "Builders Network's `tokens.css` is that palette converted to HSL, and Mission Control's `aurixa-brand.ts` says its "
        "values are lifted verbatim from it. The scales the site never declares (radius, depth, glass and motion) come from "
        "the products' own `tokens.css`, where npc-client-dashboard and aurixa-builders declare the same values. The "
        "products' pages keep their own look, as the live product shows it. Every value below was read from the code on "
        "21 October 2026 and names the file it is declared in."),
    "sections": [
        {"title": "The four repositories",
         "header": ["Repository", "What it is", "Where its styling lives", "What the reel takes"],
         "rows": [
             [SITE, "The public website, aurixasystems.com.au", "`src/index.css`: Tailwind 4 `@theme` in hex, dark only; Inter and Playfair Display from Google Fonts (`index.html`)", "The palette, the type and the brand's own motifs (eyebrow, corners, rail line, traveller, dot field). The canonical source."],
             [BUILDERS, "The Builders Network", "`src/styles/tokens.css` and `glass.css`: HSL channels (Tailwind 3.4), light and `.dark`; Inter and Playfair Display as `@fontsource` packages; the `.bd-*` drawing set in `builder-drafting.css`", "The site's palette in HSL (its comments name the site as the source), and the radius, elevation, glass and motion scales"],
             [NPC, "The Command Centre and the Client, Finance, Accountant and Solicitor portals", "`src/styles/tokens.css` and `glass.css`: HSL channels (Tailwind 3), light and `.dark`; the workspace's brand colour written at run time by `src/branding/token-resolver.ts`", "The screens (through the plates), the same scales as the Builders Network, and its report's pages (from its PDF code)"],
             ["aurixa-mission-control-12b89885", "The operators' console", "`src/styles.css`: Tailwind 4 `@theme inline` in oklch; Archivo and JetBrains Mono; 0 px radius", "Nothing: it is not in the film, and its electric cyan and lime are its own, not the brand's"],
         ]},
        {"title": "The palette",
         "header": ["Colour", "Token", "Value", "Declared in", "In the reel"],
         "rows": [
             ["Ground", "`--color-base-950`", "`#040B16`", f"{SITE} `@theme`; the site's `body` lays three faint radials over it (navy, cyan and gold, at 5 to 8 percent)", "The field every Aurixa frame stands on"],
             ["Page navy", "`--color-marketing-page`", "`#0A192F`", f"{SITE} `@theme` (also as `--color-prism-violet`, which is navy, not violet)", "Block 04's turn from the dimmed frame"],
             ["Panel", "`--color-marketing-panel`", "`#10233D`", f"{SITE} `@theme`", "Strips and chips: the rail, the system map's labels"],
             ["Raised", "`--color-base-900`", "`#0B162C`", f"{SITE} `@theme`; the Builders Network's dark `--card` (`220 60% 11%`)", "The record card"],
             ["Recessed", "`--color-marketing-recessed`", "`#081629`", f"{SITE} `@theme`", "Behind a card that lifts"],
             ["Gold", "`--color-prism-magenta`", "`#C89B3C`", f"{SITE} `@theme` (named magenta, it is the gold); the Builders Network's `--brand` (`41 56% 51%`)", "Hairlines, rules, the pin, the horizon"],
             ["Gold ink", "none", "`#D7B35F`", f"{SITE} `src/index.css`: the gold its eyebrows, corner marks and labels are set in (102 uses in its CSS), never declared as a token", "Mono labels and the rail's lit stage"],
             ["Gold light", "`--color-prism-gold`", "`#F5D17A`", f"{SITE} `@theme`", "The traveller dot"],
             ["Cyan", "`--color-prism-cyan`", "`#00A8B5`", f"{SITE} `@theme`; the Builders Network's dark `--primary` (`184 100% 35%`)", "The rail line's start, the Builders Network's own accent"],
             ["Focus cyan", "none (the Builders Network's `--ring`)", "`#5EDDE8`", f"{SITE} `src/index.css`: the focus outline and the top-left corner mark (104 uses); the Builders Network's dark `--ring` (`185 75% 64%`)", "The press ring, the top-left focus corner, the dot field"],
             ["Ink", "`--color-text-primary`", "`#FFFFFF`", f"{SITE} `@theme`", "Text on the ground"],
             ["Ink, muted", "`--color-marketing-muted`", "`#B7C1D0`", f"{SITE} `@theme`", "Secondary text, the rail's later stages"],
             ["The report's pages", "none (the PDF's own code)", "`#FFFFFF` pages, `#D9A520` gold, `#251F18` obsidian, `#333333` text", f"{NPC} `brandFamily.pure.ts` (no brand colour) and `investmentPdfDocument.ts`", "The client's report, exactly as the product prints it"],
             ["Chrome greys", "`--color-chrome-100` to `-900`", "`#F3F4F6` `#D1D5DB` `#6B7280` `#374151` `#111827`", f"{SITE} `@theme`", "The before palette: today's tools in the brand's own neutral greys, and nothing else"],
         ]},
        {"title": "Type",
         "text": ("The site sets Inter and Playfair Display, and so do the Builders Network and the reel's plates. Every face "
                  "here is a file the renderer loads, so every frame sets the same letters on every machine."),
         "header": ["Use", "Declared as", "Set in", "Declared in"],
         "rows": [
             ["Interface and body", "`--font-sans: \"Inter\", system-ui, sans-serif`", "Inter, 300 to 700", f"{SITE} `@theme`; the Builders Network loads the same weights as `@fontsource/inter`"],
             ["Display", "`--font-display: \"Playfair Display\", ui-serif, Georgia, …`", "Playfair Display, 400 to 900 and italics", f"{SITE} `@theme` and `index.html`; the Builders Network's `--font-heading`"],
             ["Eyebrow (the mono label)", "`.compliance-eyebrow { font: 700 .625rem/1.5 ui-monospace, monospace; letter-spacing: .28em; text-transform: uppercase }`, after a `2.8rem` by `1px` rule in `#c89b3c`", "Inconsolata 700: the face the plates already use for the products' monospace, which falls to Consolas on the client's Windows machines", f"{SITE} `src/index.css`"],
             ["The products' own pages", "`system-ui` (the Command Centre and portals), Inter (the Builders Network)", "Selawik, the plates' open stand-in for Segoe UI; the products' Playfair Display Medium as Aurixa Display", f"{NPC} `tokens.css` and `brand-fonts.ts`; `scripts/aurixa-reel-1/plates.cjs`"],
             ["Today's tools", "`system-ui`", "Selawik", "the before palette"],
         ]},
        {"title": "Shape, depth, glass and motion",
         "text": ("The site declares none of these (its panels are square, 2 px), so they come from the products' `tokens.css`, "
                  "where npc-client-dashboard and aurixa-builders declare the same values. One rule decides between the two "
                  "shapes: anything that holds the product (a window, a card) is the product's, rounded and glass; anything "
                  "that is only the brand (an eyebrow, a corner, a rule) is the site's, square and 1 px. The durations are a "
                  "control's; a camera move or a window's arrival takes its beat's own length, on the same curves."),
         "header": ["Token", "Value (dark)", "Declared in", "In the reel"],
         "rows": [
             ["`--radius-sm` to `--radius-2xl`", "`0.375rem` `0.5rem` `0.75rem` `1.25rem` `1.5rem`", BOTH, "Windows at `xl`, cards at `lg`"],
             ["`--glass-fill` / `--glass-stroke`", "`hsl(var(--card) / 0.55)` / `hsl(0 0% 100% / 0.10)`", f"{BUILDERS} `tokens.css` (`.dark`)", "The window's pane and hairline"],
             ["`--glass-blur-sm` / `--glass-blur` / `--glass-blur-lg`", "`8px` / `16px` / `28px`", f"{BUILDERS} `tokens.css`", "The window's pane (16), the wall of screens (28)"],
             ["`--glass-sheen`", "`linear-gradient(160deg, var(--glass-specular) 0%, hsl(0 0% 100% / 0) 46%, hsl(var(--primary) / 0.06) 100%)`", f"{BUILDERS} `tokens.css` (`.dark`)", "The light along a window's top edge"],
             ["`--glass-shadow-lg`", "`0 28px 70px -24px hsl(0 0% 0% / 0.78), 0 8px 22px -12px hsl(0 0% 0% / 0.50)`", f"{BUILDERS} `tokens.css` (`.dark`)", "Under every window"],
             ["`--elevation-4`", "`0 24px 48px -12px hsl(0 0% 0% / 0.65), 0 8px 16px -8px hsl(0 0% 0% / 0.45)`", f"{BOTH} (`.dark`)", "Under a document that lifts"],
             ["`--motion-fast` / `--motion-base` / `--motion-slow`", "`120ms` / `200ms` / `320ms`", BOTH, "A control's own response (fast, base); the press ring (slow)"],
             ["`--motion-ease-out`", "`cubic-bezier(0.22, 1, 0.36, 1)`", BOTH, "Anything that arrives and settles"],
             ["`--motion-ease-emphasized`", "`cubic-bezier(0.2, 0, 0, 1)`", BOTH, "The pointer and the virtual camera"],
         ]},
        {"title": "The brand's own motifs, from the site's CSS",
         "header": ["Motif", "Declared as", "Declared in", "In the reel"],
         "rows": [
             ["The ground", "`body { background-color: var(--color-base-950); background-image: radial-gradient(circle at 50% -20%, rgba(10, 25, 47, 0.08) 0%, transparent 60%), radial-gradient(circle at -20% 120%, rgba(0, 168, 181, 0.05) 0%, transparent 60%), radial-gradient(circle at 120% 120%, rgba(200, 155, 60, 0.05) 0%, transparent 60%) }`", f"{SITE} `src/index.css`", "Every Aurixa frame"],
             ["The eyebrow rule", "`.compliance-eyebrow > span { width: 2.8rem; height: 1px; background: #c89b3c }`", f"{SITE} `src/index.css`", "The hairline, the marker, the rail's lit stage"],
             ["Corner marks", "`.compliance-corners`: `1rem`, `1px`, `#5edde8` top left, `#d7b35f` bottom right", f"{SITE} `src/index.css`", "Focus corners"],
             ["The rail line", "`.framework-rail { width: 1px; background: linear-gradient(transparent, #5edde8 20%, #c89b3c 80%, transparent) }`", f"{SITE} `src/index.css`", "Links and the system map"],
             ["The traveller", "`.compliance-traveller { width: 6px; height: 6px; border-radius: 50%; background: #f5d17a; box-shadow: 0 0 14px #d7b35f; animation: compliance-travel 12s ease-in-out infinite }`", f"{SITE} `src/index.css`", "A dot that runs a line once: the record moving between portals"],
             ["The dot field", "`.framework-visual::before { background-image: radial-gradient(rgba(94,221,232,.2) .7px, transparent .7px); background-size: 22px 22px; mask-image: radial-gradient(circle, #000, transparent 70%) }`", f"{SITE} `src/index.css`", "Under the system map"],
         ]},
        {"title": "Where the code disagrees, and what the reel does",
         "header": ["What differs", "The values", "The reel uses", "Why"],
         "rows": [
             ["The gold", "`#C89B3C` (the site, the Builders Network's `--brand`, Mission Control's `aurixa-brand.ts`); `43 74% 49%`, about `#D9A520` (npc-client-dashboard's `--brand`)", "`#C89B3C`, with `#D7B35F` for type", "Three of the four agree, and the fourth is NPC Services' house gold, which the kit's guardrails keep out"],
             ["The products' accent", "the workspace's own brand colour in the Command Centre and portals (the selection blue the pack names, `#1238E8`, written at run time by `token-resolver.ts` and in no stylesheet); teal in the Builders Network; electric cyan in Mission Control", "Each screen keeps the accent the live product shows; the graphics never use it", "A product's accent belongs to the workspace that set it; the brand's graphics are in the brand's gold and cyan"],
             ["Corners", "a rem scale (the products); `0px` (Mission Control); about `2px` (the site's panels)", "Rounded for what holds the product, square for the brand's marks", "Each follows the code it comes from"],
             ["The interface face", "`system-ui` (npc-client-dashboard); Inter (the Builders Network and the site); Archivo (Mission Control)", "The pages keep their own (Selawik for `system-ui`); the graphics set Inter", "The site and the Builders Network agree on Inter"],
             ["Names that mislead", "`--color-prism-magenta` is gold; `--color-prism-violet` is navy; `.text-metallic-gold` and `.text-gradient-gold` render grey", "Values, never names", "A token is read by what it is set to"],
             ["Values used and never declared", "`#D7B35F` (102 uses) and `#5EDDE8` (104 uses) in the site's CSS", "Both, as values with their source", "They are the brand as the site actually renders it"],
         ]},
        {"title": "The stylesheet the renders read",
         "text": ("The graphics kit reads one stylesheet, `aurixa-reel.css` (beside this brief): a custom property for every "
                  "role below, each with a comment naming the repository, file and line it is declared on. Xeno Studio's code "
                  "scanner writes it from the four repositories (`scripts/aurixa-reel-1/reel_css.ts`), so a change to the "
                  "brand's code reaches the reel by scanning again, never by retyping a value. Each role is read from the code "
                  "and checked against this table: the 35 that name code all hold the value below, and the other 2 (plain "
                  "white and the system face) name none. `aurixa-reel-tokens.png` draws every token as the code declares it.")},
    ],
    "roles": {
        "ground": ("--color-base-950", "#040B16", f"{SITE} `@theme`, under the body's three radials"),
        "surface": ("--color-marketing-panel", "#10233D", f"{SITE} `@theme`"),
        "surface-raised": ("--color-base-900", "#0B162C", f"{SITE} `@theme`"),
        "glass": ("--glass-fill · --glass-blur", "hsl(220 60% 11% / 0.55) · 16px", f"{BUILDERS} `tokens.css` (`.dark`)"),
        "sheen": ("--glass-sheen", "linear-gradient(160deg, var(--glass-specular) 0%, hsl(0 0% 100% / 0) 46%, hsl(var(--primary) / 0.06) 100%)", f"{BUILDERS} `tokens.css` (`.dark`)"),
        "border": ("--glass-stroke", "hsl(0 0% 100% / 0.10)", f"{BUILDERS} `tokens.css` (`.dark`)"),
        "radius-window": ("--radius-xl", "1.25rem", BOTH),
        "radius-card": ("--radius-lg", "0.75rem", BOTH),
        "shadow-window": ("--glass-shadow-lg", "0 28px 70px -24px hsl(0 0% 0% / 0.78), 0 8px 22px -12px hsl(0 0% 0% / 0.50)", f"{BUILDERS} `tokens.css` (`.dark`)"),
        "shadow-document": ("--elevation-4", "0 24px 48px -12px hsl(0 0% 0% / 0.65), 0 8px 16px -8px hsl(0 0% 0% / 0.45)", f"{BOTH} (`.dark`)"),
        "blur": ("--glass-blur-lg", "28px", f"{BUILDERS} `tokens.css`"),
        "pointer": ("--color-text-primary, edged in --color-base-950", "#FFFFFF / #040B16", f"{SITE} `@theme`"),
        "ease-move": ("--motion-ease-emphasized", "cubic-bezier(0.2, 0, 0, 1)", BOTH),
        "ease-settle": ("--motion-ease-out", "cubic-bezier(0.22, 1, 0.36, 1)", BOTH),
        "press-ring": (":focus-visible outline", "#5EDDE8", f"{SITE} `src/index.css`; the Builders Network's dark `--ring`"),
        "motion-press": ("--motion-slow", "320ms", BOTH),
        "gold": ("--color-prism-magenta", "#C89B3C", f"{SITE} `@theme`"),
        "gold-ink": ("none", "#D7B35F", f"{SITE} `src/index.css` (`.compliance-eyebrow` and 101 other uses)"),
        "hairline": (".compliance-eyebrow > span", "1px · #c89b3c", f"{SITE} `src/index.css`"),
        "glow-gold": (".compliance-traveller box-shadow", "0 0 14px #d7b35f", f"{SITE} `src/index.css`"),
        "traveller": (".compliance-traveller", "6px · #f5d17a · 0 0 14px #d7b35f", f"{SITE} `src/index.css`"),
        "link-line": (".framework-rail", "1px · linear-gradient(transparent, #5edde8 20%, #c89b3c 80%, transparent)", f"{SITE} `src/index.css`"),
        "dot-field": (".framework-visual::before", "radial-gradient(rgba(94,221,232,.2) .7px, transparent .7px) · 22px", f"{SITE} `src/index.css`"),
        "corners": (".compliance-corners", "1rem · 1px · #5edde8 top left · #d7b35f bottom right", f"{SITE} `src/index.css`"),
        "mono": (".compliance-eyebrow", "700 .625rem/1.5 ui-monospace · .28em · uppercase", f"{SITE} `src/index.css`, set in Inconsolata"),
        "sans": ("--font-sans", "\"Inter\", system-ui, sans-serif", f"{SITE} `@theme`"),
        "display": ("--font-display", "\"Playfair Display\", ui-serif, Georgia, …", f"{SITE} `@theme`"),
        "ink": ("--color-text-primary", "#FFFFFF", f"{SITE} `@theme`"),
        "ink-muted": ("--color-marketing-muted", "#B7C1D0", f"{SITE} `@theme`"),
        "teal-builders": ("--primary (.dark)", "184 100% 35%", f"{BUILDERS} `tokens.css`"),
        "before-paper": ("--color-chrome-100", "#F3F4F6", f"{SITE} `@theme`"),
        "before-surface": ("none", "#FFFFFF", "white"),
        "before-border": ("--color-chrome-300", "#D1D5DB", f"{SITE} `@theme`"),
        "before-ink": ("--color-chrome-700", "#374151", f"{SITE} `@theme`"),
        "before-ink-muted": ("--color-chrome-500", "#6B7280", f"{SITE} `@theme`"),
        "satellite": ("none", "Blue Marble Next Generation · shaded relief", "NASA Earth Observatory imagery, public domain (the basemap-data and three-globe packages' copies)"),
        "perspective": ("@keyframes grid-forward", "perspective(1000px) rotateX(70deg)", f"{SITE} `src/index.css`"),
        "cta-gradient": (".btn-chrome-prismatic · --background-image-marketing-cta", "linear-gradient(-45deg, #111827 0%, #C89B3C 25%, #00A8B5 50%, #0A192F 75%, #111827 100%) · 300% · prism-shine", f"{SITE} `src/index.css`"),
        "pulse-glow": ("@keyframes pulse-glow", "0 0 10px rgba(200,155,60,.1) → 0 0 40px rgba(200,155,60,.4)", f"{SITE} `src/index.css`"),
        "before-type": ("system-ui", "Selawik", "the system face, as the plates set it"),
    },
}


# The screenshots the client supplied (21 October 2026). They carry real client names, addresses, e-mail addresses
# and personal bookmarks, so nothing of their content reaches the film: each is the layout a screen is built on,
# filled with the demo record. The Command Centre's are the README's REF-CC-REPORTS and REF-CC-PAGES.
SCREENSHOTS = [
    ("Solicitor Portal · Dashboard", "Welcome banner with Open matters; three counts (active, settling in 30 days, flagged at risk); five pipeline figures; At risk & stuck matters; Stage mix", ["NEW-DASHBOARDS", "PL-09B-a", "PL-09B-b", "PL-12B-a", "PL-12B-b"]),
    ("Accountant Portal · Dashboard", "Greeting with All clients; four counts (allocated clients, entities to confirm, income evidence outstanding, open requests); Needs you next; Recently allocated", ["NEW-DASHBOARDS", "PL-08A-a", "PL-08A-b"]),
    ("Finance Portal · Dashboard", "Greeting; agreement templates (download only); the partner's sidebar from Active Purchase Files to Earnings", ["NEW-DASHBOARDS", "PL-13A-a", "PL-13A-b"]),
    ("Client Portal · Dashboard", "Welcome banner; Your property team; four figures; Active Deals; Your Properties; Quick Access", ["PL-06A-a", "PL-06A-b", "NEW-CLIENT-REPORTS"]),
    ("Builders Network · Dashboard", "Welcome back on the setout grid; the organisation's title block; four counts in mono labels; Recent activity; Action required", ["NEW-DASHBOARDS", "PL-12A-a"]),
    ("The Aurixa Systems logo", "The emblem and the wordmark on the city at night", ["REF-LOGO", "PL-11A-a", "PL-15A"]),
    ("Command Centre · Reports (five, from the top to Pre-Generation Overrides)", "The Investment Report Workspace: generator, build type, analysis scope, overrides", ["PL-04B-a", "PL-04B-b"]),
    ("Command Centre · Generated Reports", "The library: totals, report types, the report cards", ["PL-05C-a"]),
    ("Command Centre · an investment report", "The report's page: its tiers, its grade card and its actions", ["PL-05A-a", "PL-05A-b", "PL-05C-b", "PL-06B-a"]),
    ("Command Centre · the investment report with the Aurixa Agent open", "The agent's panel over the report", ["PL-06B-b", "PL-07A-a", "PL-07A-b"]),
    ("Command Centre · Overview", "Today's position, the quick actions and the counts", ["PL-11A-c"]),
]


def check_sources(shots):
    ledger = json.loads((HERE.parents[1] / "docs" / "brands" / "aurixa-reel-1" / "assets.json").read_text())
    for s in shots:
        for key in s["sources"]:
            known = key in GRAPHICS or key in NEW_PAGES or key in ledger
            if not known:
                raise SystemExit(f"{s['id']}: {key} is neither a library key, a graphic nor a new page")
    for name, _, into in SCREENSHOTS:
        for key in into:
            if key not in ledger and key not in NEW_PAGES:
                raise SystemExit(f"The screenshot {name} is built into {key}, which is neither a plate nor a new page")
    used = {k for s in shots for k in s["sources"]}
    unused = sorted(k for k in list(GRAPHICS) + list(NEW_PAGES) if k not in used)
    if unused:
        raise SystemExit(f"Defined but never used: {', '.join(unused)}")
    named = {role for _, _, roles in GRAPHICS.values() for role in roles}
    if named - set(DESIGN["roles"]):
        raise SystemExit(f"Graphics drawn in roles DESIGN doesn't resolve: {', '.join(sorted(named - set(DESIGN['roles'])))}")
    if set(DESIGN["roles"]) - named:
        raise SystemExit(f"Roles no graphic is drawn in: {', '.join(sorted(set(DESIGN['roles']) - named))}")


# ----------------------------------------------------------------------------------------------- writing it
def ts(t):
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:06.3f}"


# A plate whose title describes the live action it was drawn for, described as this edition uses it.
EDITION_TITLES = {"PL-08B": "The client's report as delivered: its PDF in the viewer, at the cover (drawn for the working master's meeting-room display, used here on its own)"}


def screens_inventory(shots):
    """Every library source and the shots that use it, from the ledger's plate titles."""
    plates = {p["key"]: p for p in next(s for s in SPEC["stages"] if s["stage"] == 3)["items"]}
    rows = {}
    for s in shots:
        for key in s["sources"]:
            if key.startswith(("PL-", "P", "D", "REF-")) and key not in GRAPHICS and key not in NEW_PAGES:
                rows.setdefault(key, []).append(s["id"])
    out = []
    for key in sorted(rows, key=lambda k: (not k.startswith("PL-"), k)):
        what = EDITION_TITLES.get(key) or plates[key]["title"] if key in plates else {"P": "The property image, 14 Wattle Grove", "D": "The floor plan, 14 Wattle Grove", "REF-LOGO": "The supplied Aurixa Systems logo"}.get(key, key)
        out.append((key, what, rows[key]))
    unused = sorted(k for k in plates if k not in rows)
    return out, unused


def markdown(shots, design):
    L = []
    w = L.append
    w(f"# {TITLE}")
    w("")
    w(f"The content brief for the system edition of Reel 1. It extends brief `{EXTENDS['brief']}` "
      f"(*{EXTENDS['title']}*) and the working master built from it (`spec.json`), and replaces every picture in it. "
      "Written 21 October 2026, after the client reviewed the first generated clips and asked for a reel about the system itself: "
      "screen actions, system workflows and deliverables, with SaaS graphics in the brand's own design system, right down to the CSS in its repositories.")
    w("")
    w("The shots and their beats are data in [`brief.json`](brief.json), written with this page by "
      "`scripts/aurixa-reel-1/system_edition.py`, which computes every time from the measured voiceover and checks it.")
    w("")
    w("## The idea")
    w("")
    w(IDEA)
    w("")
    w("## What stays from brief 848af668")
    w("")
    for k in KEEPS:
        w(f"- {k}")
    w("")
    w("## What this edition replaces")
    w("")
    w("| The pack said | This edition |")
    w("|---|---|")
    for a, b in REPLACES:
        w(f"| {a} | {b} |")
    w("")
    w("## The shots")
    w("")
    w(f"{len(shots)} shots, each one continuous composition, in {len(BLOCKS)} blocks. Times are on the voiceover's clock.")
    w("")
    w("| Shot | In | Out | Seconds | Kind | Palette | What happens | Voiceover |")
    w("|---|---|---|---|---|---|---|---|")
    for s in shots:
        vo = " ".join(s["voiceover"])
        w(f"| {s['id']} | {ts(s['in'])} | {ts(s['out'])} | {s['seconds']:.3f} | {s['kind']} | {s['palette']} | {s['title']} | {vo} |")
    w("")
    current = None
    for s in shots:
        if s["block"] != current:
            current = s["block"]
            b = BLOCKS[current]
            w(f"### Block {current} · {b['title']} ({ts(b['in'])} to {ts(b['out'])})")
            w("")
            w(f"*The pack's purpose:* {b['purpose']}")
            w("")
        w(f"#### {s['id']} · {s['title']}")
        w("")
        w(f"{ts(s['in'])} to {ts(s['out'])} ({s['seconds']:.3f} s) · {s['kind']} · palette: {s['palette']}")
        w("")
        w("> " + " ".join(s["voiceover"]))
        w("")
        w("| At | What happens |")
        w("|---|---|")
        for b in s["beats"]:
            w(f"| {ts(b['at'])} | {b['do']} |")
        w("")
        w(f"- **Camera:** {s['camera']}")
        w(f"- **Ends on:** {s['result']}")
        if s["on_screen"]:
            w("- **On screen, exactly:** " + " · ".join(f"\"{t}\"" for t in s["on_screen"]))
        w("- **Made from:** " + ", ".join(f"`{k}`" for k in s["sources"]))
        if s["notes"]:
            w(f"- **Note:** {s['notes']}")
        w("")
    w("## How every screen behaves")
    w("")
    for r in SCREEN_RULES:
        w(f"- {r}")
    w("")
    w("The 1080 x 1920 frame is used in zones, so captions and the platforms' own buttons never cover the work:")
    w("")
    w("| Zone | Height | Use |")
    w("|---|---|---|")
    for z in FRAME_ZONES:
        w(f"| {z[0]} | {z[1]} | {z[2]} |")
    w("")
    w("## The design system, from the code")
    w("")
    w(design["intro"])
    w("")
    for section in design["sections"]:
        w(f"### {section['title']}")
        w("")
        if section.get("text"):
            w(section["text"])
            w("")
        if section.get("rows"):
            w("| " + " | ".join(section["header"]) + " |")
            w("|" + "---|" * len(section["header"]))
            for row in section["rows"]:
                w("| " + " | ".join(row) + " |")
            w("")
    w("### Token roles the graphics are drawn in")
    w("")
    w("| Role | Token | Value | From |")
    w("|---|---|---|---|")
    for role, (token, value, source) in design["roles"].items():
        w(f"| {role} | `{token}` | `{value}` | {source} |")
    w("")
    w("## The graphics kit")
    w("")
    w("Built once, in HTML and CSS on the tokens above, and reused. Every graphic is the brand's own material: glass, gold hairlines, "
      "the mono labels and the type of its site and products, never stock footage or generic templates.")
    w("")
    w("| Graphic | What it is | Drawn in | Used in |")
    w("|---|---|---|---|")
    for key, (name, what, tokens) in GRAPHICS.items():
        used = [s["id"] for s in shots if key in s["sources"]]
        w(f"| `{key}` · {name} | {what} | {', '.join(tokens)} | {', '.join(used)} |")
    w("")
    w("## Screens")
    w("")
    w("Everything on screen is a page the reel's plates rebuild from the products' own code, with the demo record, or one of the pages "
      "still to build the same way.")
    w("")
    w("### Built on the supplied screenshots")
    w("")
    w("The screenshots carry real client names, addresses, e-mail addresses and personal bookmarks, so nothing of their content reaches the film. "
      "Each is the layout a screen is built on, filled with the demo record: a portal's dashboard gave the shell (its sidebar and header) of "
      "every page drawn in that portal, as well as the dashboard itself.")
    w("")
    w("| Screenshot | What it shows | Built into |")
    w("|---|---|---|")
    for name, what, into in SCREENSHOTS:
        w(f"| {name} | {what} | {', '.join(f'`{k}`' for k in into)} |")
    w("")
    w("### Every source the shots use")
    w("")
    inventory, unused = screens_inventory(shots)
    w("| Source | What it is | Used in |")
    w("|---|---|---|")
    for key, what, used in inventory:
        w(f"| `{key}` | {what} | {', '.join(used)} |")
    w("")
    if unused:
        w("Not used in this edition: " + ", ".join(f"`{k}`" for k in unused) + ".")
        w("")
    w("### Pages still to build")
    w("")
    w("| Page | What it shows | Built from | Used in |")
    w("|---|---|---|---|")
    for key, (name, what, source) in NEW_PAGES.items():
        used = [s["id"] for s in shots if key in s["sources"]]
        w(f"| `{key}` · {name} | {what} | {source} | {', '.join(used)} |")
    w("")
    w("## How it is made")
    w("")
    for name, text in PRODUCTION:
        w(f"- **{name}.** {text}")
    w("")
    w("## Review gates")
    w("")
    for i, g in enumerate(REVIEW_GATES, 1):
        w(f"{i}. {g}")
    w("")
    w("## Decisions for the client")
    w("")
    for name, text in DECISIONS:
        w(f"- **{name}.** {text}")
    w("")
    return "\n".join(L)


# ------------------------------------------------------------------------------------------ in the studio
# The brief is kept in Xeno Studio as a creative brief beside 848af668, so the agent reads it (read_brief pages
# it by the --- Page N --- markers the studio's own importer writes) and the Supercomputer shows it. Its id is
# fixed, so writing it again updates the same brief.
import uuid
STUDIO_BRIEF_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "xeno-studio:aurixa-reel-1:system-edition"))
STUDIO_OWNER = "d569926c-6bb9-4efc-8fa0-1c97e2b85c46"  # who imported 848af668


def studio_pages(shots):
    """The brief as the studio's brief text: a page per section and per block, each opened by its marker."""
    pages, current = [], []
    for line in markdown(shots, DESIGN).splitlines():
        if (line.startswith("## ") or line.startswith("### Block ")) and current:
            pages.append(current)
            current = []
        current.append(line)
    pages.append(current)
    return [("\n".join(page)).strip() for page in pages]


def studio_analysis(shots):
    """The brief's summary in the studio's BriefAnalysis shape, kept under the 8,000 characters the agent is shown."""
    colour_names = [("Ground", "#040B16"), ("Page navy", "#0A192F"), ("Panel", "#10233D"), ("Raised", "#0B162C"),
                    ("Gold", "#C89B3C"), ("Gold ink", "#D7B35F"), ("Gold light", "#F5D17A"), ("Cyan", "#00A8B5"),
                    ("Focus cyan", "#5EDDE8"), ("Ink", "#FFFFFF"), ("Ink muted", "#B7C1D0"),
                    ("Before: paper", "#F3F4F6"), ("Before: ink", "#374151")]
    return {
        "title": TITLE,
        "brand": "Aurixa Systems",
        "summary": (f"Extends brief {EXTENDS['brief']} (the Reel 1 prompt pack) and replaces every picture in it. " + IDEA +
                    " It keeps the pack's voiceover, cut points, captions, Block 14 phrases, closing card, record and guardrails."),
        "objective": ("Show how Aurixa Systems connects the work around one property opportunity through the product's own screens, "
                      "workflows and deliverables, keeping professional judgement visible, then invite viewers to start a 14-day free trial."),
        "audience": "Property professionals in Australia.",
        "key_message": ("Aurixa Systems is a connected operating environment designed around how property professionals actually work, "
                        "with Aurixa Agent supporting, not replacing, professional judgement."),
        "supporting_messages": [
            "Every frame is the product working, readable, or a graphic in the brand's own design system.",
            "One property, 14 Wattle Grove, moves through research, financial analysis, the client's report, the team's portals, the agent's draft and the professional's own change, to a recorded decision.",
            "Every action shows its consequence: the pointer, the press, then the product's own response.",
            "The graphics are drawn in the brand's code: the site's palette and motifs, the products' glass, depth and motion.",
        ],
        "tone": "Precise, calm and premium: a product film in which the product does the talking. Nothing is staged or acted.",
        "visual_direction": (f"No people and no generated video. {len(shots)} continuous compositions rendered from code: the products' pages "
                             "(rebuilt from their code with the demo record) in glass windows, and brand motion graphics (the hairline, the "
                             "journey rail, the system map, documents that lift off the page) in the site's navy, gold and cyan. Blocks 01 to 03 "
                             "and 09.1 are in the unbranded greys of today's tools; Aurixa's navy and gold arrive in Block 04."),
        "brand_guidelines": {
            "colours": [f"{name} {hex_}" for name, hex_ in colour_names],
            "typography": ("Inter for interface and body, Playfair Display for display (the site's @theme); the site's eyebrow, 700 .625rem "
                           "ui-monospace, .28em, uppercase, set in Inconsolata; the products' pages keep their own faces (Selawik for system-ui)."),
            "logo_usage": ("Aurixa Systems is the only spelling: AURIXA SYSTEMS for the wordmark, Aurixa Agent for the assistant. The logo is "
                           "the supplied file, revealed by masks, never redrawn or retyped."),
            "dos": SCREEN_RULES,
            "donts": ["No people, hands, faces, rooms or sets.", "No generated video.",
                      "No raw screenshots: they carry real client data; screens are rebuilt with the demo record.",
                      "No NPC wording.", "No fabricated returns, approvals, valuations or results.",
                      "No automatic financial, legal or accounting decision on screen.",
                      "No workspace accent (the selection blue) in the brand's graphics."],
        },
        "mandatories": KEEPS,
        "channels": [],
        "deliverables": [
            {"name": "Aurixa Systems Reel 1 · System edition", "media_type": "video", "aspect_ratio": "9:16",
             "duration_seconds": END, "quantity": 1,
             "copy": "Closing card: AURIXA SYSTEMS; the operating-system line; 14-DAY FREE TRIAL; START YOUR FREE TRIAL; aurixasystems.com.au.",
             "notes": f"1080 x 1920, 30 fps. {len(shots)} compositions rendered from code, assembled in the Editor on the master voiceover with its captions."},
            {"name": "Style frames", "media_type": "image", "aspect_ratio": "9:16", "quantity": len(BLOCKS),
             "notes": "One still per block at its key beat, approved before anything moves."},
        ],
        "timeline": " Then ".join(REVIEW_GATES),
        "budget": "No generation spend: every frame is rendered from code.",
        "kpis": [],
        "open_questions": [f"{name}: {text}" for name, text in DECISIONS],
        "extends": {"brief_id": EXTENDS["brief"], "title": EXTENDS["title"]},
        "analysed_at": "2026-10-21T00:00:00Z",
        "model": "none: written from brief.json",
    }


def studio_sql(shots):
    """The SQL that keeps the brief in the studio (insert, or update the same row)."""
    pages = studio_pages(shots)
    text = "\n\n".join(f"--- Page {n} ---\n{page}" for n, page in enumerate(pages, 1))
    analysis = json.dumps(studio_analysis(shots), ensure_ascii=False, separators=(",", ":"))
    shown = {k: v for k, v in json.loads(analysis).items() if k not in ("analysed_at", "model")}
    if len(json.dumps(shown, ensure_ascii=False)) > 8000:
        raise SystemExit("The summary is longer than the 8,000 characters the agent is shown")
    if "$brief$" in text or "$brief$" in analysis:
        raise SystemExit("The brief contains its own quote tag")
    title = TITLE.replace("'", "''")
    sql = (f"INSERT INTO public.creative_briefs (id, title, source_filename, source_mime, page_count, extracted_text, analysis, status, created_by)\n"
           f"VALUES ('{STUDIO_BRIEF_ID}', '{title}', 'BRIEF.md', 'text/markdown', {len(pages)},\n$brief${text}$brief$,\n$brief${analysis}$brief$::jsonb, 'ready', '{STUDIO_OWNER}')\n"
           "ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, page_count = EXCLUDED.page_count, extracted_text = EXCLUDED.extracted_text,\n"
           "  analysis = EXCLUDED.analysis, status = 'ready', error_message = NULL, is_archived = false, updated_at = now()\n"
           "RETURNING id, page_count, md5(extracted_text) AS text_md5, md5(analysis::text) AS analysis_md5;")
    return sql, text, analysis, len(pages)


def write(folder):
    shots = resolved()
    check_sources(shots)
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    brief = {"title": TITLE, "extends": EXTENDS, "written": "2026-10-21", "idea": IDEA,
             "delivery": SPEC["delivery"], "voiceover": SPEC["voiceover"], "keeps": KEEPS,
             "replaces": [{"pack": a, "now": b} for a, b in REPLACES], "screen_rules": SCREEN_RULES,
             "frame_zones": [{"zone": z, "height": h, "use": u} for z, h, u in FRAME_ZONES],
             "design": DESIGN, "graphics": {k: {"name": n, "what": w, "tokens": t} for k, (n, w, t) in GRAPHICS.items()},
             "new_pages": {k: {"name": n, "what": w, "from": f} for k, (n, w, f) in NEW_PAGES.items()},
             "screenshots": [{"screenshot": n, "shows": w, "built_into": i} for n, w, i in SCREENSHOTS],
             "shots": shots, "production": [{"step": a, "how": b} for a, b in PRODUCTION],
             "review_gates": REVIEW_GATES, "decisions": [{"decision": a, "detail": b} for a, b in DECISIONS],
             "studio": {"brief_id": STUDIO_BRIEF_ID, "extends": EXTENDS["brief"]}}
    (folder / "brief.json").write_text(json.dumps(brief, indent=1, ensure_ascii=False) + "\n")
    (folder / "BRIEF.md").write_text(markdown(shots, DESIGN) + "\n")
    print(f"{len(shots)} shots, {sum(s['seconds'] for s in shots):.3f} s; wrote {folder / 'brief.json'} and {folder / 'BRIEF.md'}")


if __name__ == "__main__":
    if sys.argv[1:2] == ["--studio-sql"]:
        import hashlib
        sql, text, analysis, pages = studio_sql(resolved())
        Path(sys.argv[2]).write_text(sql)
        print(f"{STUDIO_BRIEF_ID}: {pages} pages, {len(text)} characters; text md5 {hashlib.md5(text.encode()).hexdigest()}; wrote {sys.argv[2]}")
    elif sys.argv[1:] == ["--check"]:
        for s in resolved():
            print(f"{s['id']:5} {s['in']:8.3f} {s['out']:8.3f} {s['seconds']:6.3f}  {s['kind']:11} {s['title']}")
            for b in s["beats"]:
                print(f"        {b['at']:8.3f}  {b['do'][:90]}")
    else:
        write(sys.argv[1])
