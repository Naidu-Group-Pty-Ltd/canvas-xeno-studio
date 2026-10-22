# Aurixa Systems · Reel 1 · System edition

The content brief for the system edition of Reel 1. It extends brief `848af668-b28b-4ddb-8ab2-f8916ce314f0` (_Aurixa Systems Reel 1 Video Production — Final Cinematic Edition / Revision 2_) and the working master built from it (`spec.json`), and replaces every picture in it. Written 21 October 2026, after the client reviewed the first generated clips and asked for a reel about the system itself: screen actions, system workflows and deliverables, with SaaS graphics in the brand's own design system, right down to the CSS in its repositories.

The shots and their beats are data in [`brief.json`](brief.json), written with this page by `scripts/aurixa-reel-1/system_edition.py`, which computes every time from the measured voiceover and checks it.

## The idea

Watch one property move through one connected system. 14 Wattle Grove arrives as a single enquiry, waits while today's scattered tools fail to answer it, and then travels through Aurixa Systems: research, financial analysis, the client's report, the professional team's portals, the agent's draft and the professional's own judgement, to a recorded decision and a 14-day trial. Every frame is the product working, readable, or a graphic drawn in the product's own design system.

## What stays from brief 848af668

- The master voiceover, verbatim and never stretched: 106.031 s, speech ending at 105.88 s. Since the third cut it is held open in its own silences (pacing.py: 51 pauses between its measured speech segments, each a whole number of frames), so the film runs to the music's last downbeat and its ring.
- Its cut points. Each block starts where the working master's block starts, and every new cut uses the spec's timing rule (in the pause before a word, else 0.1 s ahead, on the 30 fps grid).
- The 45 captions, verbatim, at most two lines; none over the Block 14 phrases or the closing card. Since 22 October 2026, at the client's direction, set in the brand's own type and moving (scripts/aurixa-reel-1/captions.cjs): Playfair Display Medium, the site's headline face, in its silver headline gradient, one phrase a line in its italic (silver before the brand arrives, gold after, where a gold hairline draws under it and the light crosses it once), each word rising into focus on its spoken time (the voiceover's measured words), on a panel that reshapes from line to line: a white card of today's tools before the brand, the site's glass after.
- The Block 14 phrases (PL-14A-1 to PL-14A-4) at the edit's own times.
- The closing card (PL-15A), complete from the first frame of Block 15 through the audio tail.
- The record, since the third cut a mock address at the client's direction: 14 Wattle Grove, Banksia Rise NSW 2155 (Banksia Rise is not a real suburb), stock reference WG-14, the property image P and a floor plan drawn new for this cut, still at the evaluation stage, graded A+ on a composite of 84 across all five dimensions in the product's own words (STRONG BUY - Excellent investment opportunity with strong fundamentals across all metrics).
- The names, now only as accounts and records on screen: Jordan Ellis (client), Alex Morgan, Jamie Chen, Priya Shah, Mia Patel, Daniel Reed.
- A Demo workspace label on every Aurixa screen, and fictional demonstration data only.
- Every don't in the pack's brand guidelines, and the twelve guardrails of the studio's Aurixa Systems kit (docs/brands/aurixa-systems.md): no fabricated returns, approvals, valuations or results; no automatic financial, legal or accounting decision; no NPC wording; Aurixa Systems, AURIXA SYSTEMS and Aurixa Agent spelled exactly.
- 9:16, 1080 x 1920, 30 fps.

## What this edition replaces

| The pack said                                                                         | This edition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People, hands, faces, rooms and sets, and the cast's sheets and Soul IDs              | None appear. The product is the cast. (The six characters and their approved Soul IDs stay in the studio, unused here.)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Generated video of any kind                                                           | None, but for the logo's moments, which the client asked to be made with a video model (22 October 2026): 04.1's reveal and the logo alive on the trial and closing cards are footage of the logo's clean plate (the supplied art with its lettering taken out), and the supplied lettering and emblem are laid over it, so no letter is ever drawn by a model. Every other frame is rendered from code: the products' pages as the reel's plates already rebuild them, and graphics written in the brand's CSS. Text is exact and sharp by construction. |
| "Each portal demonstration must show a real hand using a mouse, keyboard or touchpad" | Each portal demonstration shows the product's own pointer, the control under it, the press, and the product's own response, in that order.                                                                                                                                                                                                                                                                                                                                                                                                                |
| "60 percent people and property, 25 percent platform, 15 percent architecture"        | About 70 percent screen actions and workflows, 20 percent deliverables, 10 percent brand graphics (an editorial intention, as before).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| The afternoon-to-blue-hour progression                                                | A colour progression instead: the unbranded tools of today in plain light greys (Blocks 01 to 03, and 09.1), then the brand's deep navy and gold from Block 04 on.                                                                                                                                                                                                                                                                                                                                                                                        |
| "Do not insert raw source screenshots into the film"                                  | Kept, and it matters more now: the supplied screenshots carry real client names, addresses and personal bookmarks. They remain the structural reference; every screen in the film is the code-built page with the demo record.                                                                                                                                                                                                                                                                                                                            |

## The shots

27 shots, each one continuous composition, in 15 blocks. Times are on the voiceover's clock.

| Shot | In        | Out       | Seconds | Kind        | Palette | What happens                                                  | Voiceover                                                                                                                                                |
| ---- | --------- | --------- | ------- | ----------- | ------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01.1 | 00:00.000 | 00:05.467 | 5.467   | graphic     | before  | Somewhere in Australia, one pin turns gold                    | Somewhere in Australia, a property opportunity has just appeared.                                                                                        |
| 01.2 | 00:05.467 | 00:09.633 | 4.166   | screen      | before  | The client asks                                               | A client wants to know if it's right for them, while there's still time to act.                                                                          |
| 02.1 | 00:09.633 | 00:19.900 | 10.267  | workflow    | before  | Four tools, one question                                      | But before you can answer, the research is in one platform, the numbers in another, the client details somewhere else, and the report hasn't even begun. |
| 03.1 | 00:19.900 | 00:28.933 | 9.033   | workflow    | before  | The market moves, the client waits                            | WHAT HAPPENS THEN – The market keeps moving. Your attention is pulled in every direction. And the client is waiting.                                     |
| 04.1 | 00:28.933 | 00:35.733 | 6.800   | graphic     | aurixa  | The brand arrives, on the drop                                | Aurixa Systems was built by property professionals for property professionals                                                                            |
| 04.2 | 00:35.733 | 00:44.533 | 8.800   | workflow    | aurixa  | One connected operating environment, one portal at a time     | We're here, with a connected operating environment designed around how property professionals actually work.                                             |
| 05.1 | 00:44.533 | 00:49.167 | 4.634   | screen      | aurixa  | From research into financial analysis                         | Picture a property moving from research into financial analysis,                                                                                         |
| 05.2 | 00:49.167 | 00:54.300 | 5.133   | deliverable | aurixa  | Into a report the client can understand                       | then into a professional report your client can understand.                                                                                              |
| 06.1 | 00:54.300 | 00:56.633 | 2.333   | screen      | aurixa  | The reply the client was waiting for                          | Picture communication,                                                                                                                                   |
| 06.2 | 00:56.633 | 01:00.333 | 3.700   | workflow    | aurixa  | Client relationships and property partners                    | client relationships and property partners connected to that journey,                                                                                    |
| 06.3 | 01:00.333 | 01:03.633 | 3.300   | screen      | aurixa  | Aurixa Agent, beside the work                                 | with Aurixa Agent supporting the work behind it.                                                                                                         |
| 07.1 | 01:03.633 | 01:08.300 | 4.667   | screen      | aurixa  | The professional changes it, then approves it                 | Not to replace your judgement, but to give it room to lead.                                                                                              |
| 08.1 | 01:08.300 | 01:11.967 | 3.667   | screen      | aurixa  | The accountant's part, done in the same system                | Because clients don't pay you to manage software.                                                                                                        |
| 08.2 | 01:11.967 | 01:17.133 | 5.166   | deliverable | aurixa  | What the client is trusting you with                          | They trust you to identify opportunities, make sense of complexity                                                                                       |
| 08.3 | 01:17.133 | 01:19.467 | 2.334   | screen      | aurixa  | The next decision, in the client's portal                     | and guide the next decision.                                                                                                                             |
| 09.1 | 01:19.467 | 01:24.533 | 5.066   | graphic     | before  | Bridging the gaps by hand                                     | You can keep asking your team to bridge the gaps between disconnected systems.                                                                           |
| 09.2 | 01:24.533 | 01:27.367 | 2.834   | screen      | aurixa  | One register instead                                          | But why should they have to?                                                                                                                             |
| 10.1 | 01:27.367 | 01:30.133 | 2.766   | graphic     | aurixa  | Not on the horizon                                            | Aurixa Systems isn't on the horizon.                                                                                                                     |
| 10.2 | 01:30.133 | 01:36.167 | 6.034   | graphic     | aurixa  | We've arrived: the logo, at the viewer, and the invitation    | We've arrived, and the invitation is open. Experience what we've built                                                                                   |
| 11.1 | 01:36.167 | 01:38.967 | 2.800   | screen      | aurixa  | Your fourteen days begin                                      | with a 14-day free trial.                                                                                                                                |
| 12.1 | 01:38.967 | 01:41.300 | 2.333   | screen      | aurixa  | Explore the platform                                          | Explore the platform,                                                                                                                                    |
| 12.2 | 01:41.300 | 01:44.100 | 2.800   | screen      | aurixa  | Alongside the way you work: the builder                       | put it alongside the way you work today,                                                                                                                 |
| 12.3 | 01:44.100 | 01:46.900 | 2.800   | workflow    | aurixa  | The same document, the solicitor's notes                      | and discover what a more connected business                                                                                                              |
| 12.4 | 01:46.900 | 01:49.200 | 2.300   | graphic     | aurixa  | What a more connected business could feel like                | could feel like.                                                                                                                                         |
| 13.1 | 01:49.200 | 01:55.067 | 5.867   | screen      | aurixa  | A decision recorded, and the journey complete                 | Don't just take our word for it. Let your own experience make the case.                                                                                  |
| 14.1 | 01:55.067 | 02:02.700 | 7.633   | graphic     | aurixa  | Fourteen days. Your business. Your experience. Your decision. | Fourteen days. Your business. Your experience. Your decision.                                                                                            |
| 15.1 | 02:02.700 | 02:11.200 | 8.500   | graphic     | aurixa  | Aurixa Systems, and the trial: the last word                  | Aurixa Systems. The operating system for modern property professionals. Start your free trial today.                                                     |

### Block 01 · The opportunity and the client (00:00.000 to 00:08.267)

_The pack's purpose:_ Give the viewer one recognisable property and one client question. The facade becomes the screen image, then the inquiry becomes the next scene's task.

#### 01.1 · Somewhere in Australia, one pin turns gold

00:00.000 to 00:05.467 (5.467 s) · graphic · palette: before

> Somewhere in Australia, a property opportunity has just appeared.

| At        | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:00.000 | The continent from orbit: Australia in satellite colour and relief, tilted away from the camera in depth, a low warm sun from the north-west raking its ranges, the oceans deepening to the horizon under a thin haze of atmosphere. Already falling into it: white location pins, a few, then hundreds, each landing with a small bounce, a soft shadow on the land and a pinpoint of light, dense along the east coast and around the five capitals, sparse across the interior. |
| 00:01.500 | The rain of pins thickens into the coastal cities; every pin is the same white.                                                                                                                                                                                                                                                                                                                                                                                                    |
| 00:02.367 | One pin on the New South Wales coast, north-west of Sydney, turns gold: it rises out of the field, a ring pulses out from it once, and every other pin dims a little. The camera begins to fall toward it.                                                                                                                                                                                                                                                                         |
| 00:03.267 | The camera arrives over Sydney's north-west, the relief sharpening as it nears; the gold pin's head opens and the property pops up from it on a spring: the photograph P, 14 Wattle Grove, Banksia Rise NSW 2155, four facts, a New listing chip.                                                                                                                                                                                                                                  |
| 00:04.600 | The card settles, lifted off the map by its own shadow, the gold pin still standing beneath it.                                                                                                                                                                                                                                                                                                                                                                                    |

- **Camera:** A slow orbit across the continent, then one fall from orbit to the suburb, easing in; the card ends in the upper action zone with the gold pin under it.
- **Ends on:** The property's card, readable, above its gold pin on the satellite map.
- **On screen, exactly:** "14 Wattle Grove" · "Banksia Rise NSW 2155" · "4 bed · 2 bath · 2 car · 450 m² land" · "New listing · just now"
- **Made from:** `G-SATELLITE`, `G-PINS`, `G-LISTING`, `G-STAGE`, `P`
- **Note:** The pins are where Australians live (the ABS's population by statistical area, thinned to about 600 pins), so the east coast glows and the interior stays dark. The imagery is NASA's Blue Marble Next Generation and its shaded relief, public domain; nothing on it names a real street.

#### 01.2 · The client asks

00:05.467 to 00:09.633 (4.166 s) · screen · palette: before

> A client wants to know if it's right for them, while there's still time to act.

| At        | What happens                                                                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:05.467 | The card shrinks into a link preview in a plain messaging window that swings in from the right, in depth: from Jordan Ellis to Alex Morgan, today's tools in daylight greys, its shadow soft on the paper-white desk beneath. |
| 00:05.833 | The question types itself in at a reading pace, the window turning gently toward the camera as it does.                                                                                                                       |
| 00:07.600 | The pointer reaches Send and presses it: the window's own pressed state, then Sent, and the message lifts into its thread.                                                                                                    |
| 00:08.667 | On the attached card a small chip appears: Expressions of interest close Friday.                                                                                                                                              |

- **Camera:** A slow arc around the window from three-quarter to front-on, easing in to the message and Send; holds on Sent.
- **Ends on:** Sent, with the question readable and the property attached.
- **On screen, exactly:** "From: Jordan Ellis · To: Alex Morgan" · "Can we review whether this suits my plans?" · "Send → Sent" · "Expressions of interest close Friday"
- **Made from:** `PL-01B-a`, `PL-01B-b`, `G-WINDOW-PLAIN`, `G-POINTER`, `G-STAGE`

### Block 02 · The scattered workflow (00:08.267 to 00:17.600)

_The pack's purpose:_ Show the practical cost of fragmented tools through repeated attention shifts while the client's answer remains unfinished.

#### 02.1 · Four tools, one question

00:09.633 to 00:19.900 (10.267 s) · workflow · palette: before

> But before you can answer, the research is in one platform, the numbers in another, the client details somewhere else, and the report hasn't even begun.

| At        | What happens                                                                                                                                                                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:09.633 | The camera pulls back from the sent message: it is one window of a desk of them, in depth, each a different tool in a different style, floating at different distances under the same daylight. The question lands in a generic inbox as its top row; the pointer moves to Reply and stops, because there is nothing to reply with yet. |
| 00:11.733 | The camera swings to a research tool, nearer and to the left: a map and comparable sales as grey placeholder rows. It comes forward and fills the frame for a moment.                                                                                                                                                                   |
| 00:13.833 | A whip to the right, the frames streaking: a spreadsheet, a few labelled columns and one formula cell selected.                                                                                                                                                                                                                         |
| 00:15.567 | Another whip, down and left: a contact card for Jordan Ellis in a third tool, in a different style again.                                                                                                                                                                                                                               |
| 00:17.567 | The fourth, behind them all: Untitled report, empty, its caret blinking. The camera pulls back until all four hang in the frame together, misaligned and overlapping, none of them finished.                                                                                                                                            |
| 00:18.833 | The pointer hops once between the four, and stops.                                                                                                                                                                                                                                                                                      |

- **Camera:** One continuous move through a desk of floating windows: a pull back, three whips (each with motion blur and a settle), a final pull back.
- **Ends on:** Four separate windows in depth, none of them finished, and the empty report in front.
- **On screen, exactly:** "Can we review whether this suits my plans?" · "Research" · "Financial worksheet" · "Client details" · "Untitled report"
- **Made from:** `NEW-INBOX`, `G-WINDOW-PLAIN`, `G-POINTER`, `G-STAGE`
- **Note:** Each window is a different tool, so each has its own look: none carries a product's brand.

### Block 03 · The pressure while the client waits (00:17.600 to 00:25.867)

_The pack's purpose:_ Tie the pressure passage to relevant incoming property information, a real interruption and a waiting person. Each brief insert advances the same unresolved question.

#### 03.1 · The market moves, the client waits

00:19.900 to 00:28.933 (9.033 s) · workflow · palette: before

> WHAT HAPPENS THEN – The market keeps moving. Your attention is pulled in every direction. And the client is waiting.

| At        | What happens                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 00:19.900 | The four windows hold in their depth; the desktop clock in the corner starts to run (Monday 9:14 onward), and a market ticker scrolls across the lower third: new listings, price guides, auction results, moving. |
| 00:21.867 | The ticker speeds up; Price guide updated and Inspection booked chips blink beside it.                                                                                                                             |
| 00:23.833 | Notifications fly in from every edge (mail, chat, calendar, the CRM, a floor plan received for 14 Wattle Grove), each pushing the windows further apart and out of focus.                                          |
| 00:26.767 | Everything falls away into the dark except a phone on the desk, face up: its lock screen lights with Jordan Ellis's follow-up, Wednesday 4:52 PM. The clock has run to Wednesday.                                  |
| 00:28.100 | The phone's light fades a little; the frame dims toward dark.                                                                                                                                                      |

- **Camera:** Locked off while everything moves; then one slow push down to the phone.
- **Ends on:** The phone's lock screen alone: the client's follow-up, unanswered.
- **On screen, exactly:** "Jordan Ellis" · "Any update on 14 Wattle Grove? EOIs close Friday." · "Wednesday 4:52 PM"
- **Made from:** `NEW-NOTIFICATIONS`, `G-TICKER`, `G-PHONE`, `G-CLOCK`, `G-STAGE`
- **Note:** The ticker's listings and figures are the listing site's own kind (new listings, guides, results), never a claim about Aurixa.

### Block 04 · Aurixa arrives and the viewer enters the console (00:25.867 to 00:37.400)

_The pack's purpose:_ Bring the client inquiry into an occupied Aurixa Systems environment, then show a clear human-operated starting point in the Command Center.

#### 04.1 · The brand arrives, on the drop

00:28.933 to 00:35.733 (6.800 s) · graphic · palette: aurixa

> Aurixa Systems was built by property professionals for property professionals

| At        | What happens                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:28.933 | In the music's silence the dimmed frame becomes the brand's deep navy and a single gold hairline draws across its middle.                                                                                                             |
| 00:29.667 | On the drop the emblem bursts open out of the hairline: its triangle, then the orb's glow, the light flaring once across the frame.                                                                                                   |
| 00:30.600 | Its wordmark, AURIXA SYSTEMS, rises beneath it letter by letter: the supplied logo, never retyped.                                                                                                                                    |
| 00:33.500 | The emblem lifts into the top left and becomes the Command Centre's own sidebar mark; the Command Centre assembles in its glass window, in depth: the sidebar's groups, the top bar with its Demo workspace badge, then the Overview. |

- **Camera:** Still for the emblem; then one slow push as the Command Centre settles into its window, turned a few degrees in depth.
- **Ends on:** The Command Centre's Overview in the demo workspace, whole, in its window: the only time the Overview is shown.
- **On screen, exactly:** "AURIXA SYSTEMS" · "COMMAND CENTRE" · "DEMO WORKSPACE" · "Overview"
- **Made from:** `REF-LOGO`, `G-HAIRLINE`, `G-EMBLEM`, `PL-11A-c`, `G-WINDOW`, `G-STAGE`

#### 04.2 · One connected operating environment, one portal at a time

00:35.733 to 00:44.533 (8.800 s) · workflow · palette: aurixa

> We're here, with a connected operating environment designed around how property professionals actually work.

| At        | What happens                                                                                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:35.733 | The Command Centre's window swings back and shrinks to the top of the frame: the hub, its label lit.                                                                                                                                                            |
| 00:36.667 | The Client Portal comes forward on its own, almost the width of the frame, turned slightly in depth: its dashboard for Jordan Ellis, CLIENT PORTAL in large mono above it, a gold underline drawing beneath the label. A line of light runs from the hub to it. |
| 00:37.867 | It swings aside into its place in an orbit around the hub as the Finance Portal comes forward the same way, FINANCE PORTAL above it.                                                                                                                            |
| 00:39.067 | Then the Accountant Portal, ACCOUNTANT PORTAL.                                                                                                                                                                                                                  |
| 00:40.267 | Then the Solicitor Portal, SOLICITOR PORTAL.                                                                                                                                                                                                                    |
| 00:41.467 | Then the Builders Network, in its own teal, BUILDERS NETWORK.                                                                                                                                                                                                   |
| 00:42.667 | The camera pulls back: the hub and the five portals in their orbit, every line lit, a traveller running each one once.                                                                                                                                          |

- **Camera:** A spotlight, five times: each portal arrives large and front of frame, holds while its name is read, and swings back into the orbit; one pull back at the end.
- **Ends on:** The hub and its five portals, each seen on its own first, joined at the end.
- **On screen, exactly:** "COMMAND CENTRE" · "CLIENT PORTAL" · "FINANCE PORTAL" · "ACCOUNTANT PORTAL" · "SOLICITOR PORTAL" · "BUILDERS NETWORK"
- **Made from:** `G-PORTAL-SPOTLIGHT`, `G-SYSTEM-MAP`, `NEW-DASHBOARDS`, `PL-06A-a`, `G-STAGE`
- **Note:** The client asked for each portal to be seen on its own and clearly (22 October 2026): the orbit is the payoff after all five, never the way they are introduced.

### Block 05 · Research to financial analysis to a report (00:37.400 to 00:45.233)

_The pack's purpose:_ Connect the prepared research, illustrative finance comparison and client report through the exact same property image. Prioritise one useful result per insert.

#### 05.1 · From research into financial analysis

00:44.533 to 00:49.167 (4.634 s) · screen · palette: aurixa

> Picture a property moving from research into financial analysis,

| At        | What happens                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 00:44.533 | The orbit's Command Centre comes forward and opens on the investment report's page: 14 Wattle Grove, Banksia Rise, its Compass on view and its grade card reading A+. The journey rail slides in above the window with Research lit. |
| 00:47.267 | Focus corners close on + Financial; the pointer presses it, the tier reads preparing and the rail moves to Financial.                                                                                                                |

- **Camera:** Starts on the record's header and its A+ grade card; a short pan to + Financial.
- **Ends on:** Financial preparing from the Compass, the rail on Financial.
- **On screen, exactly:** "14 Wattle Grove, Banksia Rise" · "A+ · Investment Grade" · "Compass · + Financial" · "Preparing Financial from this Compass" · "RESEARCH · FINANCIAL · REPORT · TEAM · DECISION"
- **Made from:** `PL-05A-a`, `PL-05A-b`, `G-RAIL`, `G-POINTER`, `G-FOCUS`, `G-STAGE`

#### 05.2 · Into a report the client can understand

00:49.167 to 00:54.300 (5.133 s) · deliverable · palette: aurixa

> then into a professional report your client can understand.

| At        | What happens                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:49.167 | Generated Reports: the pointer opens 14 Wattle Grove's report and the rail moves to Report.                                                                                                                                                                                           |
| 00:49.733 | The document lifts off the page and comes forward: its cover, A+ in gold beside the address.                                                                                                                                                                                          |
| 00:51.367 | The pages run past the camera one after another, in depth, each held long enough to read its headline figure: the key figures (purchase price, weekly rent, gross yield, a ten-year growth figure), the capital growth chart rising across ten years, the ten-year cash flow in bars. |
| 00:53.367 | The run slows on the cash flow page, its last bar settling.                                                                                                                                                                                                                           |

- **Camera:** Follows the click, then rides the pages as they pass, slowing at the end.
- **Ends on:** The client's report: chart pages, never paragraphs.
- **On screen, exactly:** "Financial Analysis" · "14 WATTLE GROVE, BANKSIA RISE NSW 2155" · "A+" · "Key figures" · "Capital growth" · "10-year cash flow"
- **Made from:** `PL-05C-a`, `NEW-REPORT-CHARTS`, `G-PAGE-SCROLL`, `G-RAIL`, `G-POINTER`
- **Note:** The pages are the Financial Analysis that 05.1 prepares from the Compass (the product keeps the purchase's modelling out of the Compass and in this report), in the product's own unbranded colours (obsidian #251F18, gold #D9A520); the client asked for figures, charts and infographics rather than pages of prose (22 October 2026). Every modelled page carries the illustrative-example label.

### Block 06 · Communication and the supporting agent (00:45.233 to 00:53.567)

_The pack's purpose:_ Make the client's professional team visible, then show Aurixa Agent supporting the professional within the same record context.

#### 06.1 · The reply the client was waiting for

00:54.300 to 00:56.633 (2.333 s) · screen · palette: aurixa

> Picture communication,

| At        | What happens                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| 00:54.300 | The Command Centre's Message Hub, Jordan Ellis's thread: his question from Monday at the top, the reply drafted below it. |
| 00:55.133 | The pointer presses Send; the reply joins the thread with its delivered tick. The rail moves to Team.                     |

- **Camera:** A gentle push in toward the thread.
- **Ends on:** Question and answer in one thread, inside Aurixa.
- **On screen, exactly:** "Can we review whether this suits my plans?" · "Your 14 Wattle Grove report is ready in your portal. Let's go through it together on Thursday."
- **Made from:** `NEW-MESSAGE-HUB`, `G-WINDOW`, `G-POINTER`, `G-STAGE`
- **Note:** The payoff of 03.1: the client asked again on Wednesday; here he is answered.

#### 06.2 · Client relationships and property partners

00:56.633 to 01:00.333 (3.700 s) · workflow · palette: aurixa

> client relationships and property partners connected to that journey,

| At        | What happens                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:56.633 | The Client Portal: Welcome back, Jordan Ellis. The pointer presses My Property Team.                                                                                       |
| 00:57.367 | The team's page: five of five roles engaged.                                                                                                                               |
| 00:58.967 | The five team cards lift out of the page and ring 14 Wattle Grove's record card in depth; a line of light draws from each card to it, and a traveller runs each line once. |

- **Camera:** Still, then a slow pull back and a slight orbit as the cards ring the record.
- **Ends on:** Five named professionals linked to one record.
- **On screen, exactly:** "My Property Team" · "5 of 5 roles engaged" · "Alex Morgan · Jamie Chen · Priya Shah · Mia Patel · Daniel Reed"
- **Made from:** `PL-06A-a`, `PL-06A-b`, `G-RECORD-CARD`, `G-LINKS`, `G-POINTER`

#### 06.3 · Aurixa Agent, beside the work

01:00.333 to 01:03.633 (3.300 s) · screen · palette: aurixa

> with Aurixa Agent supporting the work behind it.

| At        | What happens                                                                      |
| --------- | --------------------------------------------------------------------------------- |
| 01:00.333 | The report's page with the agent's own floating button; its label shows on hover. |
| 01:01.067 | The pointer presses it and the agent's panel opens over the report.               |
| 01:01.733 | Its draft for Jordan sets in as a card that reads Needs your go-ahead.            |

- **Camera:** Pushes to the panel as it opens.
- **Ends on:** The agent's draft, marked as needing the professional's go-ahead.
- **On screen, exactly:** "Aurixa" · "Draft a short note to Jordan Ellis about his 14 Wattle Grove client summary." · "Needs your go-ahead"
- **Made from:** `PL-06B-a`, `PL-06B-b`, `G-POINTER`
- **Note:** Guardrail 7: the agent drafts and a person reviews; the card says so on screen.

### Block 07 · Professional judgement remains visible (00:53.567 to 00:57.633)

_The pack's purpose:_ Give the professional's considered edit centre stage. The system acknowledges saved work while the person retains judgement.

#### 07.1 · The professional changes it, then approves it

01:03.633 to 01:08.300 (4.667 s) · screen · palette: aurixa

> Not to replace your judgement, but to give it room to lead.

| At        | What happens                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| 01:03.633 | Close on the draft's next step. The caret enters it.                                                                |
| 01:04.067 | The professional types her own change; each new word takes the marker, a fine gold rule, beneath it as it is typed. |
| 01:06.100 | The pointer presses Approve: the card reads Approved, with the changed line.                                        |

- **Camera:** Close and still; the text is the subject.
- **Ends on:** Approved, with the professional's own words.
- **On screen, exactly:** "Make the next step: review the remaining questions together" · "Approved"
- **Made from:** `PL-07A-a`, `PL-07A-b`, `G-POINTER`

### Block 08 · Professional work and the client decision (00:57.633 to 01:07.033)

_The pack's purpose:_ Show an accountant contributing a concrete review, then reveal how prepared information supports a useful client conversation.

#### 08.1 · The accountant's part, done in the same system

01:08.300 to 01:11.967 (3.667 s) · screen · palette: aurixa

> Because clients don't pay you to manage software.

| At        | What happens                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------- |
| 01:08.300 | The Accountant Portal: Jordan Ellis's client file, Requests. FY2026 income statement · Client responded. |
| 01:09.400 | The pointer presses Mark fulfilled; the request turns Fulfilled.                                         |

- **Camera:** Still, with a slow drift.
- **Ends on:** The request Fulfilled.
- **On screen, exactly:** "CLIENT FILE · Jordan Ellis" · "FY2026 income statement" · "Mark fulfilled → Fulfilled"
- **Made from:** `PL-08A-a`, `PL-08A-b`, `G-POINTER`

#### 08.2 · What the client is trusting you with

01:11.967 to 01:17.133 (5.166 s) · deliverable · palette: aurixa

> They trust you to identify opportunities, make sense of complexity

| At        | What happens                                                                                                                                                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:11.967 | The Investment Compass the Financial Analysis was prepared from, further in: How this grade was reached, A+ on a dial, its five dimensions as bars (capital growth, location, rental yield, demand, property risk), every one scored. The marker settles under the composite, 84. |
| 01:15.233 | The pages run on: the suburb at a glance (its median price, growth, days on market, the share of owners, drawn as figures and icons), then rental comparables on a chart.                                                                                                         |
| 01:15.967 | The run settles on the risk dashboard: each risk a coloured level with its evidence, nothing in prose.                                                                                                                                                                            |

- **Camera:** Rides the pages as they pass: the Compass, where 05.2 rode the Financial Analysis.
- **Ends on:** The report's grade, area and risk pages: figures the client can read at a glance.
- **On screen, exactly:** "How this grade was reached" · "A+ · 84" · "Capital growth · Location · Rental yield · Demand · Property risk" · "Illustrative example only: hypothetical client, figures and assumptions. Not a credit assessment or financial advice."
- **Made from:** `NEW-REPORT-CHARTS`, `G-PAGE-SCROLL`, `G-HIGHLIGHT`
- **Note:** Guardrail 2: anything modelled carries the illustrative label on the page itself. The grade is the product's own for a composite of 84 across all five dimensions: A+, STRONG BUY - Excellent investment opportunity with strong fundamentals across all metrics. None of these pages appears in 05.2.

#### 08.3 · The next decision, in the client's portal

01:17.133 to 01:19.467 (2.334 s) · screen · palette: aurixa

> and guide the next decision.

| At        | What happens                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:17.133 | The Client Portal's Reports page: the report's card, 14 Wattle Grove, Banksia Rise, Investment Report · Compass, marked New.                                                                              |
| 01:17.867 | Beside it, the next discussion's card from My Appointments slides in: Report walkthrough with Alex Morgan, Thu, 22 Oct 2026, 10:00 AM – 10:30 AM, Upcoming. The pointer comes to rest on Download Report. |

- **Camera:** Still.
- **Ends on:** The report and the next discussion, side by side for the client.
- **On screen, exactly:** "Investment Report · Compass · New" · "Download Report" · "Report walkthrough with Alex Morgan" · "Thu, 22 Oct 2026 · 10:00 AM – 10:30 AM · Upcoming"
- **Made from:** `NEW-CLIENT-REPORTS`, `G-POINTER`
- **Note:** Guides the decision: nothing on screen makes it.

### Block 09 · The manual gap and the connected matter (01:07.033 to 01:13.367)

_The pack's purpose:_ Contrast duplicate checking with one selection of an organised matter and its next review task.

#### 09.1 · Bridging the gaps by hand

01:19.467 to 01:24.533 (5.066 s) · graphic · palette: before

> You can keep asking your team to bridge the gaps between disconnected systems.

| At        | What happens                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:19.467 | Back in today's grey tools, under flat daylight: two plain document lists for 14 Wattle Grove side by side in depth, each with its own copy of the contract and the floor plan. |
| 01:21.500 | Dashed bridges reach across the gap between them; a document is dragged across by hand, a bridge breaks, a third copy appears.                                                  |
| 01:23.867 | The broken bridges hang; the grey frame holds a moment, unresolved.                                                                                                             |

- **Camera:** Still, with a slow drift that stops as the bridge breaks.
- **Ends on:** Two grey lists, three copies of one document, no bridge holding.
- **On screen, exactly:** "14 Wattle Grove — documents"
- **Made from:** `PL-09A`, `G-BRIDGE`, `G-STAGE`
- **Note:** The film's last look at today's tools: plain greys, the system face, no glass and no gold.

#### 09.2 · One register instead

01:24.533 to 01:27.367 (2.834 s) · screen · palette: aurixa

> But why should they have to?

| At        | What happens                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:24.533 | A band of gold light sweeps across the frame from left to right on the beat: behind it the grey lists burn away and the dark of Aurixa takes their place, so the change from today's tools to the product is a single, visible event. |
| 01:25.233 | The Solicitor Portal, the matter Ellis: Purchase, 14 Wattle Grove, settles in its glass window; the pointer presses Docs.                                                                                                             |
| 01:25.833 | The document register: four documents, one copy of each, each with its status.                                                                                                                                                        |

- **Camera:** Locked through the sweep, then a short push to the register.
- **Ends on:** The register, 3 outstanding of 4, the floor plan Under review.
- **On screen, exactly:** "Ellis: Purchase, 14 Wattle Grove" · "Document register" · "Contract of sale (draft) · Floor plan — 14 Wattle Grove · Building specification · Planning certificate"
- **Made from:** `G-LIGHT-SWEEP`, `PL-09B-a`, `PL-09B-b`, `G-POINTER`
- **Note:** The client asked for a clear distinction between the generic system and Aurixa's own (22 October 2026): the sweep is it.

### Block 10 · The system is here (01:13.367 to 01:19.267)

_The pack's purpose:_ Expand from an active matter to the occupied professional relationship, then guide the eye into the workspace the viewer is invited to explore.

#### 10.1 · Not on the horizon

01:27.367 to 01:30.133 (2.766 s) · graphic · palette: aurixa

> Aurixa Systems isn't on the horizon.

| At        | What happens                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:27.367 | Dawn: a long gold horizon across the lower third of the navy, and the sun's edge beginning to clear it, its light spreading up the sky and along the line. |
| 01:28.667 | The sun rises fully above the horizon, its rays fanning across the frame, the navy above it warming toward gold.                                           |

- **Camera:** One slow rise with the sun.
- **Ends on:** The sun clear of the horizon, the frame lit gold.
- **Made from:** `G-SUNRISE`
- **Note:** Aurixa Systems isn't on the horizon: the sun is already up. The system map is not shown again.

#### 10.2 · We've arrived: the logo, at the viewer, and the invitation

01:30.133 to 01:36.167 (6.034 s) · graphic · palette: aurixa

> We've arrived, and the invitation is open. Experience what we've built

| At        | What happens                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:30.133 | Out of the sun the emblem leaps at the viewer: it rushes from small to filling the frame with a burst of light and a ring that ripples outward, overshoots, and settles at the top of the card.                                    |
| 01:30.133 | AURIXA SYSTEMS sets in beneath it; the trial invitation rises into the centre: 14-DAY FREE TRIAL, and the button START YOUR FREE TRIAL, its gradient pulsing gold to light gold to cyan and back, a soft glow breathing around it. |
| 01:34.333 | The pointer arrives over the button: it lifts, its glow brightens and the gradient quickens; the press, and a ripple of light runs out from it across the card.                                                                    |
| 01:35.233 | The card holds, the button pulsing, as the light settles.                                                                                                                                                                          |

- **Camera:** Still for the logo's leap (the leap is the move); then a slow push to the button.
- **Ends on:** The invitation, whole, with its button pressed and pulsing.
- **On screen, exactly:** "AURIXA SYSTEMS" · "14-DAY FREE TRIAL" · "START YOUR FREE TRIAL"
- **Made from:** `G-LOGO-JUMP`, `PL-11A-a`, `G-CTA`, `G-POINTER`
- **Note:** One shot from the logo to the press: the close-up of the button that repeated it (the second cut's 11.1) is gone, at the client's direction (22 October 2026).

### Block 11 · The fourteen day invitation (01:19.267 to 01:22.933)

_The pack's purpose:_ Present the exact 14-day trial invitation as a clear human action, leading by editorial cut into a prepared demonstration workspace.

#### 11.1 · Your fourteen days begin

01:36.167 to 01:38.967 (2.800 s) · screen · palette: aurixa

> with a 14-day free trial.

| At        | What happens                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:36.167 | The press carries through into a new window: Setting up your trial workspace, three steps checking themselves off in turn (Workspace created · Demo data loaded · Portals connected). |
| 01:37.667 | The window settles on Your 14-day trial is ready, a day counter reading 14 days left beside it.                                                                                       |

- **Camera:** A short push as the steps complete.
- **Ends on:** The trial ready, fourteen days on the counter.
- **On screen, exactly:** "Setting up your trial workspace" · "Workspace created · Demo data loaded · Portals connected" · "Your 14-day trial is ready" · "14 days left"
- **Made from:** `NEW-TRIAL-SETUP`, `G-WINDOW`
- **Note:** Replaces the Overview the second cut showed here, which the brand's arrival (04.1) already shows (22 October 2026).

### Block 12 · Explore the working partner portals (01:22.933 to 01:30.133)

_The pack's purpose:_ Give the builder/developer and solicitor one useful action each, connected by the same floor-plan document.

#### 12.1 · Explore the platform

01:38.967 to 01:41.300 (2.333 s) · screen · palette: aurixa

> Explore the platform,

| At        | What happens                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:38.967 | The Command Centre's Property Marketplace, in depth: a grid of listing cards, 14 Wattle Grove among them with its gold A+ chip. The camera glides across the grid as the pointer moves over it, each card it passes lifting under it. |
| 01:40.467 | The pointer comes to rest on 14 Wattle Grove's card, which lifts and brightens.                                                                                                                                                       |

- **Camera:** One slow lateral glide across the grid, easing to a stop on the card.
- **Ends on:** The marketplace, 14 Wattle Grove under the pointer.
- **On screen, exactly:** "Property Marketplace" · "14 Wattle Grove, Banksia Rise" · "A+"
- **Made from:** `NEW-MARKETPLACE`, `G-POINTER`, `G-STAGE`
- **Note:** The tour has room now: one page, explored, instead of four in a second and a half.

#### 12.2 · Alongside the way you work: the builder

01:41.300 to 01:44.100 (2.800 s) · screen · palette: aurixa

> put it alongside the way you work today,

| At        | What happens                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 01:41.300 | The Builders Network: Daniel Reed's Stock List, 14 Wattle Grove Selected for a client.                                                |
| 01:42.133 | The pointer opens its floor plan: the plan lifts out of the page as a sheet, drawn clean and whole, every room named and dimensioned. |
| 01:43.300 | The plan holds, turned a little toward the camera.                                                                                    |

- **Camera:** A gentle push, then still on the plan.
- **Ends on:** The floor plan, whole, lifted off the builder's page.
- **On screen, exactly:** "Stock List" · "SELECTED FOR A CLIENT" · "14 Wattle Grove · Floor plan"
- **Made from:** `PL-12A-a`, `G-FLOORPLAN`, `G-POINTER`, `G-DOCUMENT`
- **Note:** The plan is drawn new for this cut, at the client's direction (22 October 2026): 4 bedrooms, 2 bathrooms, a double garage, every wall and label crisp at the frame's size.

#### 12.3 · The same document, the solicitor's notes

01:44.100 to 01:46.900 (2.800 s) · workflow · palette: aurixa

> and discover what a more connected business

| At        | What happens                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:44.100 | The same floor plan (carried over from 12.2 as one object) travels across to the left; the solicitor's matter and its Notes window open beside it. |
| 01:45.200 | The pointer presses Save notes; the product's toast: Matter updated.                                                                               |

- **Camera:** Follows the plan across, then still.
- **Ends on:** The plan beside the notes, Matter updated.
- **On screen, exactly:** "14 Wattle Grove · Floor plan" · "Notes" · "Matter updated"
- **Made from:** `PL-12B-a`, `PL-12B-b`, `G-FLOORPLAN`, `G-POINTER`, `G-DOCUMENT`

#### 12.4 · What a more connected business could feel like

01:46.900 to 01:49.200 (2.300 s) · graphic · palette: aurixa

> could feel like.

| At        | What happens                                                                                                                                                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:46.900 | A laptop, a tablet and a phone in depth, each showing a different portal on the same record: the Command Centre, the Client Portal, the Builders Network. A pulse of light leaves the laptop and runs to the others; as it arrives each screen updates at once, the same Matter updated on all three. |
| 01:48.200 | The three settle together, in sync, the pulse fading.                                                                                                                                                                                                                                                 |

- **Camera:** A slow orbit around the three devices.
- **Ends on:** Three devices, one record, in sync.
- **On screen, exactly:** "Matter updated"
- **Made from:** `G-DEVICES`
- **Note:** Replaces the system map the second cut showed here (22 October 2026).

### Block 13 · The viewer can assess the experience (01:30.133 to 01:34.400)

_The pack's purpose:_ Show a finance professional using a relevant comparison and considering its usefulness without claiming an investment outcome.

#### 13.1 · A decision recorded, and the journey complete

01:49.200 to 01:55.067 (5.867 s) · screen · palette: aurixa

> Don't just take our word for it. Let your own experience make the case.

| At        | What happens                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:49.200 | The Finance Portal: Record finance decision for 14 Wattle Grove, Subject to valuation.                                                                                |
| 01:50.100 | The pointer presses Record decision; the product's toast: Decision recorded.                                                                                          |
| 01:51.533 | As the music falls away, the camera pulls back to the journey rail, now complete: Research, Financial, Report, Team, Decision, the last reading Subject to valuation. |
| 01:53.800 | The rail holds in the quiet.                                                                                                                                          |

- **Camera:** Still, then one long pull back into the quiet.
- **Ends on:** The complete rail, ending on Subject to valuation.
- **On screen, exactly:** "Record finance decision" · "Decision: Subject to valuation" · "Decision recorded"
- **Made from:** `PL-13A-a`, `PL-13A-b`, `G-RAIL`, `G-POINTER`
- **Note:** The decision recorded is the broker's call, Subject to valuation: no approval or outcome is shown.

### Block 14 · Four short statements and a personal decision (01:34.400 to 01:39.467)

_The pack's purpose:_ Let the four decision phrases land over one uninterrupted professional moment, linking the trial to the viewer's own business and judgement.

#### 14.1 · Fourteen days. Your business. Your experience. Your decision.

01:55.067 to 02:02.700 (7.633 s) · graphic · palette: aurixa

> Fourteen days. Your business. Your experience. Your decision.

| At        | What happens                                                                       |
| --------- | ---------------------------------------------------------------------------------- |
| 01:55.067 | A slow lateral drift across a wall of the film's own screens, dimmed and softened. |
| 01:55.233 | Fourteen days.                                                                     |
| 01:56.833 | Your business.                                                                     |
| 01:58.633 | Your experience.                                                                   |
| 02:00.500 | Your decision.                                                                     |

- **Camera:** One slow lateral drift, never reversing.
- **Ends on:** Each phrase alone and readable on the wall of screens, each landing on the music's downbeat.
- **On screen, exactly:** "Fourteen days." · "Your business." · "Your experience." · "Your decision."
- **Made from:** `PL-14A-1`, `PL-14A-2`, `PL-14A-3`, `PL-14A-4`, `G-WALL`
- **Note:** The phrases are set as the captions are, at display size: Playfair Display in the site's silver headline gradient, the key word in its gold italic (Fourteen, business, experience, decision) with the gold rule drawing under it; each key word lands on a downbeat of the breakdown (pacing.py); no captions over them.

### Block 15 · The final brand and trial invitation (01:39.467 to 01:46.031)

_The pack's purpose:_ Resolve the tangible work into a stable, memorable Aurixa Systems identity and a clearly readable trial action.

#### 15.1 · Aurixa Systems, and the trial: the last word

02:02.700 to 02:11.200 (8.500 s) · graphic · palette: aurixa

> Aurixa Systems. The operating system for modern property professionals. Start your free trial today.

| At        | What happens                                                                                                                                                                                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02:02.700 | On the music's return the closing card slams in with it: a flash of light, the logo landing at full size with a shock ring, the gold lines of the card drawing out from it; the operating-system line, 14-DAY FREE TRIAL, the button and aurixasystems.com.au are there from this first frame. |
| 02:04.567 | The button's gradient pulses on the bar; light runs around its edge.                                                                                                                                                                                                                           |
| 02:08.300 | As Start your free trial today is spoken, the pointer arrives and the button rises under it, glowing.                                                                                                                                                                                          |
| 02:10.167 | On the last downbeat the press: a burst of light from the button and a ring across the whole card, the logo flaring once; then everything settles and holds, the button still breathing.                                                                                                       |

- **Camera:** Still, but alive: the card's own light moves on the music's bars.
- **Ends on:** The closing card, pressed on the last downbeat, held through the ring of the music.
- **On screen, exactly:** "AURIXA SYSTEMS" · "The operating system for modern property professionals." · "14-DAY FREE TRIAL" · "START YOUR FREE TRIAL" · "aurixasystems.com.au"
- **Made from:** `PL-15A`, `G-CTA`, `G-POINTER`
- **Note:** The pack's rule still holds: the whole offer is visible from the first frame of Block 15. What moves is light and the press, on the music's bars (pacing.py).

## How every screen behaves

- One action per shot beat, and a result held at least 0.8 s before anything else moves (the montage 12.1 is the one exception).
- The pointer is the product's: a standard arrow at 1.6 times its size so it reads on a phone, white with a dark edge. It travels on a gentle curve (the products' emphasized ease) and never jumps. A press is the control's own pressed state plus a fine ring in the focus cyan that grows and fades over the products' slow step, 320 ms.
- Typing appears at a reading pace (about 16 characters a second) with the product's own caret.
- Toasts, progress and page changes are the product's own components with their own timing.
- A screen only changes because of an action the viewer sees, and only to the page that action really opens.
- Anything the voiceover names is at least 22 px tall on the final 1080 x 1920 frame; smaller text is context, never the point.
- Desktop pages keep their desktop layout, at the zoom their plates were drawn at, inside a window: the frame opens on the whole window for orientation, then a virtual camera moves in on the part that acts.

The 1080 x 1920 frame is used in zones, so captions and the platforms' own buttons never cover the work:

| Zone     | Height          | Use                                                                                            |
| -------- | --------------- | ---------------------------------------------------------------------------------------------- |
| Top      | 0 to 250 px     | kept clear for the platform's own interface                                                    |
| Rail     | 250 to 360 px   | the journey rail (G-RAIL) when it is on screen                                                 |
| Action   | 360 to 1300 px  | the window, the action and its result                                                          |
| Captions | 1300 to 1560 px | the captions (lower third); nothing the viewer must read sits behind them                      |
| Bottom   | 1560 to 1920 px | kept clear for the platform's own interface; nothing important within 120 px of the right edge |

## The design system, from the code

The brand is written down four times, in four repositories, and they do not agree. This edition takes its graphics from the one the others name as their source: the public site's `@theme` (aurixa-systems, `src/index.css`). The Builders Network's `tokens.css` is that palette converted to HSL, and Mission Control's `aurixa-brand.ts` says its values are lifted verbatim from it. The scales the site never declares (radius, depth, glass and motion) come from the products' own `tokens.css`, where npc-client-dashboard and aurixa-builders declare the same values. The products' pages keep their own look, as the live product shows it. Every value below was read from the code on 21 October 2026 and names the file it is declared in.

### The four repositories

| Repository                      | What it is                                                                   | Where its styling lives                                                                                                                                                                          | What the reel takes                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| aurixa-systems                  | The public website, aurixasystems.com.au                                     | `src/index.css`: Tailwind 4 `@theme` in hex, dark only; Inter and Playfair Display from Google Fonts (`index.html`)                                                                              | The palette, the type and the brand's own motifs (eyebrow, corners, rail line, traveller, dot field). The canonical source. |
| aurixa-builders                 | The Builders Network                                                         | `src/styles/tokens.css` and `glass.css`: HSL channels (Tailwind 3.4), light and `.dark`; Inter and Playfair Display as `@fontsource` packages; the `.bd-*` drawing set in `builder-drafting.css` | The site's palette in HSL (its comments name the site as the source), and the radius, elevation, glass and motion scales    |
| npc-client-dashboard            | The Command Centre and the Client, Finance, Accountant and Solicitor portals | `src/styles/tokens.css` and `glass.css`: HSL channels (Tailwind 3), light and `.dark`; the workspace's brand colour written at run time by `src/branding/token-resolver.ts`                      | The screens (through the plates), the same scales as the Builders Network, and its report's pages (from its PDF code)       |
| aurixa-mission-control-12b89885 | The operators' console                                                       | `src/styles.css`: Tailwind 4 `@theme inline` in oklch; Archivo and JetBrains Mono; 0 px radius                                                                                                   | Nothing: it is not in the film, and its electric cyan and lime are its own, not the brand's                                 |

### The palette

| Colour             | Token                                  | Value                                                               | Declared in                                                                                                                                     | In the reel                                                                          |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Ground             | `--color-base-950`                     | `#040B16`                                                           | aurixa-systems `@theme`; the site's `body` lays three faint radials over it (navy, cyan and gold, at 5 to 8 percent)                            | The field every Aurixa frame stands on                                               |
| Page navy          | `--color-marketing-page`               | `#0A192F`                                                           | aurixa-systems `@theme` (also as `--color-prism-violet`, which is navy, not violet)                                                             | Block 04's turn from the dimmed frame                                                |
| Panel              | `--color-marketing-panel`              | `#10233D`                                                           | aurixa-systems `@theme`                                                                                                                         | Strips and chips: the rail, the system map's labels                                  |
| Raised             | `--color-base-900`                     | `#0B162C`                                                           | aurixa-systems `@theme`; the Builders Network's dark `--card` (`220 60% 11%`)                                                                   | The record card                                                                      |
| Recessed           | `--color-marketing-recessed`           | `#081629`                                                           | aurixa-systems `@theme`                                                                                                                         | Behind a card that lifts                                                             |
| Gold               | `--color-prism-magenta`                | `#C89B3C`                                                           | aurixa-systems `@theme` (named magenta, it is the gold); the Builders Network's `--brand` (`41 56% 51%`)                                        | Hairlines, rules, the pin, the horizon                                               |
| Gold ink           | none                                   | `#D7B35F`                                                           | aurixa-systems `src/index.css`: the gold its eyebrows, corner marks and labels are set in (102 uses in its CSS), never declared as a token      | Mono labels and the rail's lit stage                                                 |
| Gold light         | `--color-prism-gold`                   | `#F5D17A`                                                           | aurixa-systems `@theme`                                                                                                                         | The traveller dot                                                                    |
| Cyan               | `--color-prism-cyan`                   | `#00A8B5`                                                           | aurixa-systems `@theme`; the Builders Network's dark `--primary` (`184 100% 35%`)                                                               | The rail line's start, the Builders Network's own accent                             |
| Focus cyan         | none (the Builders Network's `--ring`) | `#5EDDE8`                                                           | aurixa-systems `src/index.css`: the focus outline and the top-left corner mark (104 uses); the Builders Network's dark `--ring` (`185 75% 64%`) | The press ring, the top-left focus corner, the dot field                             |
| Ink                | `--color-text-primary`                 | `#FFFFFF`                                                           | aurixa-systems `@theme`                                                                                                                         | Text on the ground                                                                   |
| Ink, muted         | `--color-marketing-muted`              | `#B7C1D0`                                                           | aurixa-systems `@theme`                                                                                                                         | Secondary text, the rail's later stages                                              |
| The report's pages | none (the PDF's own code)              | `#FFFFFF` pages, `#D9A520` gold, `#251F18` obsidian, `#333333` text | npc-client-dashboard `brandFamily.pure.ts` (no brand colour) and `investmentPdfDocument.ts`                                                     | The client's report, exactly as the product prints it                                |
| Chrome greys       | `--color-chrome-100` to `-900`         | `#F3F4F6` `#D1D5DB` `#6B7280` `#374151` `#111827`                   | aurixa-systems `@theme`                                                                                                                         | The before palette: today's tools in the brand's own neutral greys, and nothing else |

### Type

The site sets Inter and Playfair Display, and so do the Builders Network and the reel's plates. Every face here is a file the renderer loads, so every frame sets the same letters on every machine.

| Use                      | Declared as                                                                                                                                                            | Set in                                                                                                                                 | Declared in                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Interface and body       | `--font-sans: "Inter", system-ui, sans-serif`                                                                                                                          | Inter, 300 to 700                                                                                                                      | aurixa-systems `@theme`; the Builders Network loads the same weights as `@fontsource/inter` |
| Display                  | `--font-display: "Playfair Display", ui-serif, Georgia, …`                                                                                                             | Playfair Display, 400 to 900 and italics                                                                                               | aurixa-systems `@theme` and `index.html`; the Builders Network's `--font-heading`           |
| Eyebrow (the mono label) | `.compliance-eyebrow { font: 700 .625rem/1.5 ui-monospace, monospace; letter-spacing: .28em; text-transform: uppercase }`, after a `2.8rem` by `1px` rule in `#c89b3c` | Inconsolata 700: the face the plates already use for the products' monospace, which falls to Consolas on the client's Windows machines | aurixa-systems `src/index.css`                                                              |
| The products' own pages  | `system-ui` (the Command Centre and portals), Inter (the Builders Network)                                                                                             | Selawik, the plates' open stand-in for Segoe UI; the products' Playfair Display Medium as Aurixa Display                               | npc-client-dashboard `tokens.css` and `brand-fonts.ts`; `scripts/aurixa-reel-1/plates.cjs`  |
| Today's tools            | `system-ui`                                                                                                                                                            | Selawik                                                                                                                                | the before palette                                                                          |

### Shape, depth, glass and motion

The site declares none of these (its panels are square, 2 px), so they come from the products' `tokens.css`, where npc-client-dashboard and aurixa-builders declare the same values. One rule decides between the two shapes: anything that holds the product (a window, a card) is the product's, rounded and glass; anything that is only the brand (an eyebrow, a corner, a rule) is the site's, square and 1 px. The durations are a control's; a camera move or a window's arrival takes its beat's own length, on the same curves.

| Token                                                  | Value (dark)                                                                                                 | Declared in                                                                | In the reel                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `--radius-sm` to `--radius-2xl`                        | `0.375rem` `0.5rem` `0.75rem` `1.25rem` `1.5rem`                                                             | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           | Windows at `xl`, cards at `lg`                               |
| `--glass-fill` / `--glass-stroke`                      | `hsl(var(--card) / 0.55)` / `hsl(0 0% 100% / 0.10)`                                                          | aurixa-builders `tokens.css` (`.dark`)                                     | The window's pane and hairline                               |
| `--glass-blur-sm` / `--glass-blur` / `--glass-blur-lg` | `8px` / `16px` / `28px`                                                                                      | aurixa-builders `tokens.css`                                               | The window's pane (16), the wall of screens (28)             |
| `--glass-sheen`                                        | `linear-gradient(160deg, var(--glass-specular) 0%, hsl(0 0% 100% / 0) 46%, hsl(var(--primary) / 0.06) 100%)` | aurixa-builders `tokens.css` (`.dark`)                                     | The light along a window's top edge                          |
| `--glass-shadow-lg`                                    | `0 28px 70px -24px hsl(0 0% 0% / 0.78), 0 8px 22px -12px hsl(0 0% 0% / 0.50)`                                | aurixa-builders `tokens.css` (`.dark`)                                     | Under every window                                           |
| `--elevation-4`                                        | `0 24px 48px -12px hsl(0 0% 0% / 0.65), 0 8px 16px -8px hsl(0 0% 0% / 0.45)`                                 | npc-client-dashboard and aurixa-builders `src/styles/tokens.css` (`.dark`) | Under a document that lifts                                  |
| `--motion-fast` / `--motion-base` / `--motion-slow`    | `120ms` / `200ms` / `320ms`                                                                                  | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           | A control's own response (fast, base); the press ring (slow) |
| `--motion-ease-out`                                    | `cubic-bezier(0.22, 1, 0.36, 1)`                                                                             | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           | Anything that arrives and settles                            |
| `--motion-ease-emphasized`                             | `cubic-bezier(0.2, 0, 0, 1)`                                                                                 | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           | The pointer and the virtual camera                           |

### The brand's own motifs, from the site's CSS

| Motif            | Declared as                                                                                                                                                                                                                                                                                                                  | Declared in                    | In the reel                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| The ground       | `body { background-color: var(--color-base-950); background-image: radial-gradient(circle at 50% -20%, rgba(10, 25, 47, 0.08) 0%, transparent 60%), radial-gradient(circle at -20% 120%, rgba(0, 168, 181, 0.05) 0%, transparent 60%), radial-gradient(circle at 120% 120%, rgba(200, 155, 60, 0.05) 0%, transparent 60%) }` | aurixa-systems `src/index.css` | Every Aurixa frame                                             |
| The eyebrow rule | `.compliance-eyebrow > span { width: 2.8rem; height: 1px; background: #c89b3c }`                                                                                                                                                                                                                                             | aurixa-systems `src/index.css` | The hairline, the marker, the rail's lit stage                 |
| Corner marks     | `.compliance-corners`: `1rem`, `1px`, `#5edde8` top left, `#d7b35f` bottom right                                                                                                                                                                                                                                             | aurixa-systems `src/index.css` | Focus corners                                                  |
| The rail line    | `.framework-rail { width: 1px; background: linear-gradient(transparent, #5edde8 20%, #c89b3c 80%, transparent) }`                                                                                                                                                                                                            | aurixa-systems `src/index.css` | Links and the system map                                       |
| The traveller    | `.compliance-traveller { width: 6px; height: 6px; border-radius: 50%; background: #f5d17a; box-shadow: 0 0 14px #d7b35f; animation: compliance-travel 12s ease-in-out infinite }`                                                                                                                                            | aurixa-systems `src/index.css` | A dot that runs a line once: the record moving between portals |
| The dot field    | `.framework-visual::before { background-image: radial-gradient(rgba(94,221,232,.2) .7px, transparent .7px); background-size: 22px 22px; mask-image: radial-gradient(circle, #000, transparent 70%) }`                                                                                                                        | aurixa-systems `src/index.css` | Under the system map                                           |

### Where the code disagrees, and what the reel does

| What differs                   | The values                                                                                                                                                                                                                                         | The reel uses                                                                  | Why                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| The gold                       | `#C89B3C` (the site, the Builders Network's `--brand`, Mission Control's `aurixa-brand.ts`); `43 74% 49%`, about `#D9A520` (npc-client-dashboard's `--brand`)                                                                                      | `#C89B3C`, with `#D7B35F` for type                                             | Three of the four agree, and the fourth is NPC Services' house gold, which the kit's guardrails keep out       |
| The products' accent           | the workspace's own brand colour in the Command Centre and portals (the selection blue the pack names, `#1238E8`, written at run time by `token-resolver.ts` and in no stylesheet); teal in the Builders Network; electric cyan in Mission Control | Each screen keeps the accent the live product shows; the graphics never use it | A product's accent belongs to the workspace that set it; the brand's graphics are in the brand's gold and cyan |
| Corners                        | a rem scale (the products); `0px` (Mission Control); about `2px` (the site's panels)                                                                                                                                                               | Rounded for what holds the product, square for the brand's marks               | Each follows the code it comes from                                                                            |
| The interface face             | `system-ui` (npc-client-dashboard); Inter (the Builders Network and the site); Archivo (Mission Control)                                                                                                                                           | The pages keep their own (Selawik for `system-ui`); the graphics set Inter     | The site and the Builders Network agree on Inter                                                               |
| Names that mislead             | `--color-prism-magenta` is gold; `--color-prism-violet` is navy; `.text-metallic-gold` and `.text-gradient-gold` render grey                                                                                                                       | Values, never names                                                            | A token is read by what it is set to                                                                           |
| Values used and never declared | `#D7B35F` (102 uses) and `#5EDDE8` (104 uses) in the site's CSS                                                                                                                                                                                    | Both, as values with their source                                              | They are the brand as the site actually renders it                                                             |

### The stylesheet the renders read

The graphics kit reads one stylesheet, `aurixa-reel.css` (beside this brief): a custom property for every role below, each with a comment naming the repository, file and line it is declared on. Xeno Studio's code scanner writes it from the four repositories (`scripts/aurixa-reel-1/reel_css.ts`), so a change to the brand's code reaches the reel by scanning again, never by retyping a value. Each role is read from the code and checked against this table: the 35 that name code all hold the value below, and the other 2 (plain white and the system face) name none. `aurixa-reel-tokens.png` draws every token as the code declares it.

### Token roles the graphics are drawn in

| Role             | Token                                                      | Value                                                                                                           | From                                                                                              |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ground           | `--color-base-950`                                         | `#040B16`                                                                                                       | aurixa-systems `@theme`, under the body's three radials                                           |
| surface          | `--color-marketing-panel`                                  | `#10233D`                                                                                                       | aurixa-systems `@theme`                                                                           |
| surface-raised   | `--color-base-900`                                         | `#0B162C`                                                                                                       | aurixa-systems `@theme`                                                                           |
| glass            | `--glass-fill · --glass-blur`                              | `hsl(220 60% 11% / 0.55) · 16px`                                                                                | aurixa-builders `tokens.css` (`.dark`)                                                            |
| sheen            | `--glass-sheen`                                            | `linear-gradient(160deg, var(--glass-specular) 0%, hsl(0 0% 100% / 0) 46%, hsl(var(--primary) / 0.06) 100%)`    | aurixa-builders `tokens.css` (`.dark`)                                                            |
| border           | `--glass-stroke`                                           | `hsl(0 0% 100% / 0.10)`                                                                                         | aurixa-builders `tokens.css` (`.dark`)                                                            |
| radius-window    | `--radius-xl`                                              | `1.25rem`                                                                                                       | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`                                  |
| radius-card      | `--radius-lg`                                              | `0.75rem`                                                                                                       | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`                                  |
| shadow-window    | `--glass-shadow-lg`                                        | `0 28px 70px -24px hsl(0 0% 0% / 0.78), 0 8px 22px -12px hsl(0 0% 0% / 0.50)`                                   | aurixa-builders `tokens.css` (`.dark`)                                                            |
| shadow-document  | `--elevation-4`                                            | `0 24px 48px -12px hsl(0 0% 0% / 0.65), 0 8px 16px -8px hsl(0 0% 0% / 0.45)`                                    | npc-client-dashboard and aurixa-builders `src/styles/tokens.css` (`.dark`)                        |
| blur             | `--glass-blur-lg`                                          | `28px`                                                                                                          | aurixa-builders `tokens.css`                                                                      |
| pointer          | `--color-text-primary, edged in --color-base-950`          | `#FFFFFF / #040B16`                                                                                             | aurixa-systems `@theme`                                                                           |
| ease-move        | `--motion-ease-emphasized`                                 | `cubic-bezier(0.2, 0, 0, 1)`                                                                                    | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`                                  |
| ease-settle      | `--motion-ease-out`                                        | `cubic-bezier(0.22, 1, 0.36, 1)`                                                                                | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`                                  |
| press-ring       | `:focus-visible outline`                                   | `#5EDDE8`                                                                                                       | aurixa-systems `src/index.css`; the Builders Network's dark `--ring`                              |
| motion-press     | `--motion-slow`                                            | `320ms`                                                                                                         | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`                                  |
| gold             | `--color-prism-magenta`                                    | `#C89B3C`                                                                                                       | aurixa-systems `@theme`                                                                           |
| gold-ink         | `none`                                                     | `#D7B35F`                                                                                                       | aurixa-systems `src/index.css` (`.compliance-eyebrow` and 101 other uses)                         |
| hairline         | `.compliance-eyebrow > span`                               | `1px · #c89b3c`                                                                                                 | aurixa-systems `src/index.css`                                                                    |
| glow-gold        | `.compliance-traveller box-shadow`                         | `0 0 14px #d7b35f`                                                                                              | aurixa-systems `src/index.css`                                                                    |
| traveller        | `.compliance-traveller`                                    | `6px · #f5d17a · 0 0 14px #d7b35f`                                                                              | aurixa-systems `src/index.css`                                                                    |
| link-line        | `.framework-rail`                                          | `1px · linear-gradient(transparent, #5edde8 20%, #c89b3c 80%, transparent)`                                     | aurixa-systems `src/index.css`                                                                    |
| dot-field        | `.framework-visual::before`                                | `radial-gradient(rgba(94,221,232,.2) .7px, transparent .7px) · 22px`                                            | aurixa-systems `src/index.css`                                                                    |
| corners          | `.compliance-corners`                                      | `1rem · 1px · #5edde8 top left · #d7b35f bottom right`                                                          | aurixa-systems `src/index.css`                                                                    |
| mono             | `.compliance-eyebrow`                                      | `700 .625rem/1.5 ui-monospace · .28em · uppercase`                                                              | aurixa-systems `src/index.css`, set in Inconsolata                                                |
| sans             | `--font-sans`                                              | `"Inter", system-ui, sans-serif`                                                                                | aurixa-systems `@theme`                                                                           |
| display          | `--font-display`                                           | `"Playfair Display", ui-serif, Georgia, …`                                                                      | aurixa-systems `@theme`                                                                           |
| ink              | `--color-text-primary`                                     | `#FFFFFF`                                                                                                       | aurixa-systems `@theme`                                                                           |
| ink-muted        | `--color-marketing-muted`                                  | `#B7C1D0`                                                                                                       | aurixa-systems `@theme`                                                                           |
| teal-builders    | `--primary (.dark)`                                        | `184 100% 35%`                                                                                                  | aurixa-builders `tokens.css`                                                                      |
| before-paper     | `--color-chrome-100`                                       | `#F3F4F6`                                                                                                       | aurixa-systems `@theme`                                                                           |
| before-surface   | `none`                                                     | `#FFFFFF`                                                                                                       | white                                                                                             |
| before-border    | `--color-chrome-300`                                       | `#D1D5DB`                                                                                                       | aurixa-systems `@theme`                                                                           |
| before-ink       | `--color-chrome-700`                                       | `#374151`                                                                                                       | aurixa-systems `@theme`                                                                           |
| before-ink-muted | `--color-chrome-500`                                       | `#6B7280`                                                                                                       | aurixa-systems `@theme`                                                                           |
| satellite        | `none`                                                     | `Blue Marble Next Generation · shaded relief`                                                                   | NASA Earth Observatory imagery, public domain (the basemap-data and three-globe packages' copies) |
| perspective      | `@keyframes grid-forward`                                  | `perspective(1000px) rotateX(70deg)`                                                                            | aurixa-systems `src/index.css`                                                                    |
| cta-gradient     | `.btn-chrome-prismatic · --background-image-marketing-cta` | `linear-gradient(-45deg, #111827 0%, #C89B3C 25%, #00A8B5 50%, #0A192F 75%, #111827 100%) · 300% · prism-shine` | aurixa-systems `src/index.css`                                                                    |
| pulse-glow       | `@keyframes pulse-glow`                                    | `0 0 10px rgba(200,155,60,.1) → 0 0 40px rgba(200,155,60,.4)`                                                   | aurixa-systems `src/index.css`                                                                    |
| before-type      | `system-ui`                                                | `Selawik`                                                                                                       | the system face, as the plates set it                                                             |

## The graphics kit

Built once, in HTML and CSS on the tokens above, and reused. Every graphic is the brand's own material: glass, gold hairlines, the mono labels and the type of its site and products, never stock footage or generic templates.

| Graphic                                     | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                        | Drawn in                                                                               | Used in                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `G-WINDOW` · The glass window               | The Aurixa pages' holder: the page at its drawn zoom inside a rounded window of the products' own glass (fill, sheen and hairline stroke), lifted by their largest glass shadow, floating on the site's ground in the frame's action zone.                                                                                                                                                                                                        | ground, glass, sheen, border, radius-window, shadow-window                             | 04.1, 06.1, 11.1                                                                                     |
| `G-WINDOW-PLAIN` · The plain window         | The same window for today's tools: white, a grey system title bar, the system's own type, no brand colour and no glass.                                                                                                                                                                                                                                                                                                                           | before-surface, before-border, before-ink, before-type                                 | 01.2, 02.1                                                                                           |
| `G-POINTER` · The pointer and its press     | A standard arrow at 1.6x, white with a dark edge, moving on the products' emphasized ease; a press draws a 1 px ring in the focus cyan that grows from 0 to 24 px and fades over 320 ms.                                                                                                                                                                                                                                                          | pointer, ease-move, press-ring, motion-press                                           | 01.2, 02.1, 05.1, 05.2, 06.1, 06.2, 06.3, 07.1, 08.1, 08.3, 09.2, 10.2, 12.1, 12.2, 12.3, 13.1, 15.1 |
| `G-FOCUS` · Focus corners                   | The site's own corner marks (.compliance-corners): a 1 px cyan corner top left and a gold one bottom right, 1rem long, closing in on the part of a page that acts.                                                                                                                                                                                                                                                                                | corners, ease-settle                                                                   | 05.1                                                                                                 |
| `G-RAIL` · The journey rail                 | Research · Financial · Report · Team · Decision, set in the site's eyebrow (mono, .28em, uppercase) on a panel strip above the window; the current stage in gold ink with the eyebrow's gold rule, the ones passed ticked, the rest muted. The film's one recurring chapter device.                                                                                                                                                               | surface, mono, gold-ink, hairline, ink-muted                                           | 05.1, 05.2, 13.1                                                                                     |
| `G-SYSTEM-MAP` · The system map             | The Command Centre as the hub, five portal windows around it (Client, Finance, Accountant, Solicitor, Builders Network), each on its own dashboard, on the site's cyan dot field. Each is joined to the hub by the site's rail line (cyan to gold), which draws in; a traveller dot runs along a line when something passes along it. Labels in the eyebrow mono on panel chips; the Builders Network window carries its own teal. Never rotates. | ground, dot-field, glass, surface, link-line, traveller, mono, gold-ink, teal-builders | 04.2                                                                                                 |
| `G-RECORD-CARD` · The record card           | 14 Wattle Grove · WG-14 with the image P: the object the film follows. The same card in every scene it appears in, its title in the display serif, settling on the products' ease-out.                                                                                                                                                                                                                                                            | surface-raised, border, radius-card, ink, display, sans, ease-settle                   | 06.2                                                                                                 |
| `G-LINKS` · Links                           | The site's rail line (1 px, cyan to gold) drawn from one card to another, with a traveller dot that runs it once and settles; used for the team ringing the record.                                                                                                                                                                                                                                                                               | link-line, traveller, ease-move                                                        | 06.2                                                                                                 |
| `G-DOCUMENT` · The document                 | A PDF that lifts off a page as an object: its cover in front, its pages fanned behind, each the report's own page as the product prints it, with the products' deepest elevation beneath. The floor plan travels between portals as the same object.                                                                                                                                                                                              | shadow-document, ease-settle                                                           | 12.2, 12.3                                                                                           |
| `G-HIGHLIGHT` · The marker                  | The eyebrow's 1 px gold rule, drawn under the passage the voiceover points to and under the words the professional types.                                                                                                                                                                                                                                                                                                                         | hairline, gold, ease-settle                                                            | 08.2                                                                                                 |
| `G-HAIRLINE` · The hairline                 | One gold line drawn across the frame on the site's ground, with the traveller's gold glow at its leading end: the turn from today's tools to Aurixa.                                                                                                                                                                                                                                                                                              | ground, hairline, glow-gold                                                            | 04.1                                                                                                 |
| `G-EMBLEM` · The emblem build               | The supplied logo, at half the frame's width, revealed out of the night by a video model's take of its clean plate that ends exactly on the supplied art; then its own lettering, the art's pixels and the shadow they stand in, rising letter by letter and the light crossing it once; then the emblem, the supplied file, lifts into the Command Centre. The logo is the supplied file, never redrawn or retyped.                              | ground, hairline, glow-gold, ease-settle                                               | 04.1                                                                                                 |
| `G-WALL` · The wall of screens              | The film's own screens tiled at a slight angle in their glass windows, dimmed and softened by the products' strongest glass blur, drifting slowly sideways behind the Block 14 phrases.                                                                                                                                                                                                                                                           | ground, blur, shadow-window                                                            | 14.1                                                                                                 |
| `G-LISTING` · The listing card              | A plain property-site card (no product's brand): the image P, the address line, four facts and small status chips.                                                                                                                                                                                                                                                                                                                                | before-surface, before-border, before-ink, before-ink-muted, before-type               | 01.1                                                                                                 |
| `G-CLOCK` · The desktop clock               | A small clock in the corner of today's desktop that runs from Monday to Wednesday through Block 03.                                                                                                                                                                                                                                                                                                                                               | before-ink, before-type                                                                | 03.1                                                                                                 |
| `G-BRIDGE` · The bridges                    | Dashed lines that try to join two plain document lists and break; a document dragged across by hand.                                                                                                                                                                                                                                                                                                                                              | before-ink-muted, before-border                                                        | 09.1                                                                                                 |
| `G-SATELLITE` · The continent from orbit    | Australia in NASA's Blue Marble Next Generation colour with its shaded relief multiplied in, graded toward night (deeper oceans, lifted ranges, a low warm sun from the north-west), laid on a plane the camera views in perspective and falls toward; a thin haze of atmosphere at the horizon, a vignette, and the relief sharpening as the camera nears. Public-domain imagery: no street is named on it.                                      | satellite, perspective, ground                                                         | 01.1                                                                                                 |
| `G-PINS` · The pins                         | Hundreds of white location pins, a stem and a head with a soft shadow on the land and a pinpoint of light, placed where Australians live and landing in waves with a small bounce; one turns gold, rises out of the field and pulses a ring while the rest dim.                                                                                                                                                                                   | ink, gold, glow-gold                                                                   | 01.1                                                                                                 |
| `G-STAGE` · The stage in depth              | Windows and documents set in a space instead of on a flat page: the site's own perspective (its grid-forward keyframe), a few degrees of turn, soft shadows on a ground that fades into the distance (paper white for today's tools, the brand's night after), depth of field on what is not the subject, and camera moves with motion blur.                                                                                                      | perspective, shadow-window, blur, before-paper                                         | 01.1, 01.2, 02.1, 03.1, 04.1, 04.2, 05.1, 06.1, 09.1, 12.1                                           |
| `G-TICKER` · The market ticker              | A strip of listings and prices scrolling across today's desktop (New listing · Price guide updated · Auction result) in the system face, speeding up as the pressure builds.                                                                                                                                                                                                                                                                      | before-ink, before-ink-muted, before-type                                              | 03.1                                                                                                 |
| `G-PHONE` · The phone                       | A plain phone face up on the desk, its lock screen lighting with the client's follow-up: no product's brand, the system's own type.                                                                                                                                                                                                                                                                                                               | before-surface, before-ink, before-type                                                | 03.1                                                                                                 |
| `G-PORTAL-SPOTLIGHT` · One portal at a time | Each portal comes forward on its own, almost the frame's width and turned slightly in depth, its dashboard live and its name above it in the eyebrow's mono at display size with a gold rule drawing under it; then it swings into its place in an orbit around the hub as the next comes forward, a line of light running from the hub to it.                                                                                                    | glass, mono, gold-ink, hairline, link-line                                             | 04.2                                                                                                 |
| `G-PAGE-SCROLL` · The pages, running past   | The report's pages travel past the camera one after another in depth, each with the document's own deep shadow, slowing on each long enough to read its headline figure.                                                                                                                                                                                                                                                                          | shadow-document, ease-move                                                             | 05.2, 08.2                                                                                           |
| `G-LIGHT-SWEEP` · The light sweep           | A band of gold light, the hairline's colour with the traveller's glow, sweeping across the frame on a beat: today's grey tools burn away behind it and the brand's night takes their place.                                                                                                                                                                                                                                                       | gold, glow-gold, traveller                                                             | 09.2                                                                                                 |
| `G-SUNRISE` · The sunrise                   | A long gold horizon across the navy and the sun clearing it: its disc in the traveller's light, rays fanning up, the sky warming above it.                                                                                                                                                                                                                                                                                                        | ground, gold, glow-gold, traveller                                                     | 10.1                                                                                                 |
| `G-LOGO-JUMP` · The logo, at the viewer     | The supplied emblem rushing from small to filling the frame on the products' emphasized ease, with a burst of light and a ring rippling outward, overshooting and settling on their ease-out: the supplied file, never redrawn.                                                                                                                                                                                                                   | ease-move, ease-settle, glow-gold                                                      | 10.2                                                                                                 |
| `G-CTA` · The button, alive                 | START YOUR FREE TRIAL on the site's own prismatic button (.btn-chrome-prismatic: its marketing gradient at -45 degrees through gold and cyan, moving on prism-shine), quickened into a pulse, with pulse-glow's gold halo breathing around it; under the pointer it lifts and brightens, and its press is the focus ring's ripple.                                                                                                                | cta-gradient, pulse-glow, press-ring, motion-press                                     | 10.2, 15.1                                                                                           |
| `G-DEVICES` · The business in sync          | A laptop, a tablet and a phone in depth, each showing a different portal on the same record; a pulse of light runs between them along the rail line and each screen updates as it arrives.                                                                                                                                                                                                                                                        | glass, link-line, traveller, perspective                                               | 12.4                                                                                                 |
| `G-FLOORPLAN` · The floor plan              | 14 Wattle Grove drawn clean at the frame's own size: walls in solid ink, doors and windows as an architect draws them, every room named and dimensioned, a north point and a scale bar; a sheet that lifts off the page as the document does.                                                                                                                                                                                                     | display, sans, hairline, shadow-document                                               | 12.2, 12.3                                                                                           |

## Screens

Everything on screen is a page the reel's plates rebuild from the products' own code, with the demo record, or one of the pages still to build the same way.

### Built on the supplied screenshots

The screenshots carry real client names, addresses, e-mail addresses and personal bookmarks, so nothing of their content reaches the film. Each is the layout a screen is built on, filled with the demo record: a portal's dashboard gave the shell (its sidebar and header) of every page drawn in that portal, as well as the dashboard itself.

| Screenshot                                                                | What it shows                                                                                                                                                   | Built into                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Solicitor Portal · Dashboard                                              | Welcome banner with Open matters; three counts (active, settling in 30 days, flagged at risk); five pipeline figures; At risk & stuck matters; Stage mix        | `NEW-DASHBOARDS`, `PL-09B-a`, `PL-09B-b`, `PL-12B-a`, `PL-12B-b` |
| Accountant Portal · Dashboard                                             | Greeting with All clients; four counts (allocated clients, entities to confirm, income evidence outstanding, open requests); Needs you next; Recently allocated | `NEW-DASHBOARDS`, `PL-08A-a`, `PL-08A-b`                         |
| Finance Portal · Dashboard                                                | Greeting; agreement templates (download only); the partner's sidebar from Active Purchase Files to Earnings                                                     | `NEW-DASHBOARDS`, `PL-13A-a`, `PL-13A-b`                         |
| Client Portal · Dashboard                                                 | Welcome banner; Your property team; four figures; Active Deals; Your Properties; Quick Access                                                                   | `PL-06A-a`, `PL-06A-b`, `NEW-CLIENT-REPORTS`                     |
| Builders Network · Dashboard                                              | Welcome back on the setout grid; the organisation's title block; four counts in mono labels; Recent activity; Action required                                   | `NEW-DASHBOARDS`, `PL-12A-a`                                     |
| The Aurixa Systems logo                                                   | The emblem and the wordmark on the city at night                                                                                                                | `REF-LOGO`, `PL-11A-a`, `PL-15A`                                 |
| Command Centre · Reports (five, from the top to Pre-Generation Overrides) | The Investment Report Workspace: generator, build type, analysis scope, overrides                                                                               | `PL-04B-a`, `PL-04B-b`                                           |
| Command Centre · Generated Reports                                        | The library: totals, report types, the report cards                                                                                                             | `PL-05C-a`                                                       |
| Command Centre · an investment report                                     | The report's page: its tiers, its grade card and its actions                                                                                                    | `PL-05A-a`, `PL-05A-b`, `PL-05C-b`, `PL-06B-a`                   |
| Command Centre · the investment report with the Aurixa Agent open         | The agent's panel over the report                                                                                                                               | `PL-06B-b`, `PL-07A-a`, `PL-07A-b`                               |
| Command Centre · Overview                                                 | Today's position, the quick actions and the counts                                                                                                              | `PL-11A-c`                                                       |

### Every source the shots use

| Source     | What it is                                                                     | Used in    |
| ---------- | ------------------------------------------------------------------------------ | ---------- |
| `PL-01B-a` | Enquiry composer, before Send                                                  | 01.2       |
| `PL-01B-b` | Enquiry sent                                                                   | 01.2       |
| `PL-05A-a` | Command Centre · the investment report (Compass), before the click             | 05.1       |
| `PL-05A-b` | Financial being prepared from the Compass                                      | 05.1       |
| `PL-05C-a` | Command Centre · Generated Reports, Residence 014 under the pointer            | 05.2       |
| `PL-06A-a` | Client Portal dashboard, before the click                                      | 04.2, 06.2 |
| `PL-06A-b` | Client Portal · My property team                                               | 06.2       |
| `PL-06B-a` | The investment report with Financial prepared; the pointer on the Aurixa Agent | 06.3       |
| `PL-06B-b` | The Aurixa Agent open over the report                                          | 06.3       |
| `PL-07A-a` | Alex types her change                                                          | 07.1       |
| `PL-07A-b` | The changed note, approved                                                     | 07.1       |
| `PL-08A-a` | Accountant Portal · Jordan Ellis's client file, Requests                       | 08.1       |
| `PL-08A-b` | Fulfilled                                                                      | 08.1       |
| `PL-09A`   | Two generic document lists with duplicate references                           | 09.1       |
| `PL-09B-a` | Solicitor Portal · the matter's Overview, before the click                     | 09.2       |
| `PL-09B-b` | Solicitor Portal · the matter's Docs                                           | 09.2       |
| `PL-11A-a` | Campaign trial invitation                                                      | 10.2       |
| `PL-11A-c` | Command Centre · Overview in the demo workspace                                | 04.1       |
| `PL-12A-a` | Builders Network · Builder / Developer Portal · Stock List, before the click   | 12.2       |
| `PL-12B-a` | Priya's two windows: the floor plan's PDF beside the matter's Notes            | 12.3       |
| `PL-12B-b` | Notes saved                                                                    | 12.3       |
| `PL-13A-a` | Finance Portal · Record finance decision                                       | 13.1       |
| `PL-13A-b` | Decision recorded                                                              | 13.1       |
| `PL-14A-1` | Editorial phrase, one at a time in one clear area                              | 14.1       |
| `PL-14A-2` | Editorial phrase, one at a time in one clear area                              | 14.1       |
| `PL-14A-3` | Editorial phrase, one at a time in one clear area                              | 14.1       |
| `PL-14A-4` | Editorial phrase, one at a time in one clear area                              | 14.1       |
| `PL-15A`   | Closing card (from the start of Block 15)                                      | 15.1       |
| `P`        | The property image, 14 Wattle Grove                                            | 01.1       |
| `REF-LOGO` | The supplied Aurixa Systems logo                                               | 04.1       |

Not used in this edition: `PL-02A`, `PL-03A`, `PL-03B`, `PL-03C`, `PL-04B-a`, `PL-04B-b`, `PL-05B-a`, `PL-05B-b`, `PL-05C-b`, `PL-08B`, `PL-11A-b`, `PL-12A-b`, `PL-SIGN`.

### Pages still to build

| Page                                                                                  | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Built from                                                                                                                                                                                                                | Used in    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `NEW-INBOX` · A generic inbox                                                         | Today's tools: a plain mail client with Jordan Ellis's question as the top row, and Reply.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 01.2's question; no product's brand                                                                                                                                                                                       | 02.1       |
| `NEW-NOTIFICATIONS` · Today's notifications                                           | Plain toasts from mail, chat, a calendar and a CRM, and the floor plan received for 14 Wattle Grove (PL-03A's item).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | unbranded system notifications                                                                                                                                                                                            | 03.1       |
| `NEW-MESSAGE-HUB` · Command Centre · Message Hub, Jordan Ellis's thread               | Two states. First, his question from Monday at the top and Alex Morgan's reply typed in the composer, his row in the list reading Draft; then sent, with its delivered tick, and his row moved to Today: Your 14 Wattle Grove report is ready in your portal. Let's go through it together on Thursday.                                                                                                                                                                                                                                                                                                                                                                                            | npc-client-dashboard's Message Hub (the list, the thread and its Details)                                                                                                                                                 | 06.1       |
| `NEW-CLIENT-REPORTS` · Client Portal · the report and the next discussion             | Two pages. Reports: 14 Wattle Grove, Banksia Rise, Investment Report · Compass, New, with Download Report. My Appointments: Report walkthrough with Alex Morgan, Thu, 22 Oct 2026, 10:00 AM – 10:30 AM, Upcoming.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | npc-client-dashboard's Client Portal: its Reports and My Appointments pages                                                                                                                                               | 08.3       |
| `NEW-DASHBOARDS` · The Solicitor, Accountant, Finance and Builders Network dashboards | Each portal's home page with the demo record. Shah Legal (Priya Shah): Welcome back, Open matters, 1 active matter; Ellis: Purchase, 14 Wattle Grove in Contract review, marked Watch after 13 days in the stage. Patel & Co Accountants (Mia Patel): Good to see you, Mia, 1 allocated client; Needs you next: Jordan Ellis, purchasing entity not yet confirmed. Harbour Finance Group (Jamie Chen): Welcome back, Jamie, the agreement templates (download only), and Today: You're clear for today. Reed Constructions (Daniel Reed): Welcome back, the organisation's title block, 1 project; Recent activity and Project delivery attention, both empty. The Client Portal's is PL-06A-a.    | the supplied dashboard screenshots' layout, the portals' code (npc-client-dashboard, aurixa-builders) and the plates' own sidebars                                                                                        | 04.2       |
| `NEW-REPORT-CHARTS` · Investment Compass · the client's report, in figures            | The product's report in its own unbranded colours (white pages under the issuer's running head, gold #D9A520 and obsidian #251F18), drawn as figures instead of prose: the cover with A+ beside the address; Key figures (purchase price $1,150,000, weekly rent $850, gross yield 3.8 percent, ten-year median growth); capital growth, the council area's median price across ten years as a line; the ten-year cash flow in bars; How this grade was reached, A+ on a dial and its five dimensions as bars, composite 84; the suburb at a glance in figures and icons; rental comparables on a chart; the risk dashboard in levels. Every modelled page carries the illustrative-example label. | npc-client-dashboard's standard Investment PDF (its running head, palette and chart primitives: gauge, bars, line, tiles) and its grade composer (scoringV2Production.pure.ts: A+ from 80, STRONG BUY across all metrics) | 05.2, 08.2 |
| `NEW-TRIAL-SETUP` · The trial's first minute                                          | Setting up your trial workspace: three steps checking themselves off (Workspace created · Demo data loaded · Portals connected), then Your 14-day trial is ready with a day counter at 14 days left, in the Command Centre's own cards and progress steps.                                                                                                                                                                                                                                                                                                                                                                                                                                         | npc-client-dashboard's Command Centre components and the site's 14-day trial                                                                                                                                              | 11.1       |
| `NEW-MARKETPLACE` · Command Centre · Property Marketplace                             | The Listings page as the product draws it: a grid of listing cards (photograph, address, price, beds, baths, cars) under its filters; 14 Wattle Grove among them with its A+, the rest mock addresses in neighbouring suburbs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | npc-client-dashboard's Listings page (the Property Marketplace) and its listing card                                                                                                                                      | 12.1       |

## How it is made

- **Compositions.** Each shot is one HTML composition at 1080 x 1920: the plate builders' own pages (scripts/aurixa-reel-1/portals.cjs, built from the products' code) placed in the graphics kit's window, with a timeline that sets every element's state at time t from the shot's beats in brief.json.
- **Rendering.** Frame by frame in Chromium (Playwright): set t = frame / 30, let the page lay out, capture, and encode at 30 fps with ffmpeg (H.264, yuv420p, high quality; an overlay with transparency as ProRes 4444). Deterministic: the same brief renders the same film, and a change to one shot re-renders only that shot.
- **Design tokens.** The kit's colours, type, radii, shadows, glass and motion come from one stylesheet written from the four Aurixa repositories' own code (see The design system, from the code), not from values picked by eye.
- **Assembly.** scripts/aurixa-reel-1/render.cjs draws the whole reel, shot by shot from scenes/, and encodes it as one master with its soundtrack: the method the client approved on 22 October 2026 after the proof of 04.1 to 05.2. The studio's Editor is not in the picture's path.
- **Soundtrack.** National Treasures under the whole film and the voiceover held open in its silences (pacing.py), laid out as a studio edit's audio items on the Editor's mixer channels (the voiceover on its own channel, the music and its four pieces on Music & FX, each with its gain, fades and ducking under speech) and mixed by the studio's own media worker code, with two-pass loudness normalisation (soundtrack.py).
- **Cost.** Nothing billed by a provider but the logo's moments: one image edit for its clean plate and the video model's takes (logo-takes.json); the rest is building the kit, the pages and the compositions, then rendering.

## Review gates

1. Style frames: one still per block, at its key beat, in the final look. Approve before anything moves.
2. Animatic: the shots as timed stills on the voiceover, with the captions. Approve the timing before the final renders.
3. First render: the full reel in the Editor as a draft, then shot by shot changes.

## Decisions for the client

- **The music's licence.** National Treasures is the client's choice (22 October 2026) and is in the film. Its licence for paid or public use is the client's to confirm before the film runs anywhere but review.
- **Real product footage.** If the client can record the live Command Centre on the demo workspace, those recordings can replace any composition one for one. The code-built pages are the default because they are exact, fictional and ready now.
- **The opening palette.** Blocks 01 to 03 are deliberately unbranded and light, so Block 04's turn to navy and gold reads as Aurixa arriving. The alternative is to open in the brand's navy and keep the problem in muted tones.
