# Aurixa Systems · Reel 1 · System edition

The content brief for the system edition of Reel 1. It extends brief `848af668-b28b-4ddb-8ab2-f8916ce314f0` (_Aurixa Systems Reel 1 Video Production — Final Cinematic Edition / Revision 2_) and the working master built from it (`spec.json`), and replaces every picture in it. Written 21 October 2026, after the client reviewed the first generated clips and asked for a reel about the system itself: screen actions, system workflows and deliverables, with SaaS graphics in the brand's own design system, right down to the CSS in its repositories.

The shots and their beats are data in [`brief.json`](brief.json), written with this page by `scripts/aurixa-reel-1/system_edition.py`, which computes every time from the measured voiceover and checks it.

## The idea

Watch one property move through one connected system. Residence 014 arrives as a single enquiry, waits while today's scattered tools fail to answer it, and then travels through Aurixa Systems: research, financial analysis, the client's report, the professional team's portals, the agent's draft and the professional's own judgement, to a recorded decision and a 14-day trial. Every frame is the product working, readable, or a graphic drawn in the product's own design system.

## What stays from brief 848af668

- The master voiceover, verbatim and never stretched: 106.031 s, speech ending at 105.88 s.
- Its cut points. Each block starts where the working master's block starts, and every new cut uses the spec's timing rule (in the pause before a word, else 0.1 s ahead, on the 30 fps grid).
- The 45 captions, verbatim, at most two lines; none over the Block 14 phrases or the closing card.
- The Block 14 phrases (PL-14A-1 to PL-14A-4) at the edit's own times.
- The closing card (PL-15A), complete from the first frame of Block 15 through the audio tail.
- The record: Project Banksia / Residence 014 / BK-014, the property image P and the floor plan D, in Australia with no real street address, still at the evaluation stage.
- The names, now only as accounts and records on screen: Jordan Ellis (client), Alex Morgan, Jamie Chen, Priya Shah, Mia Patel, Daniel Reed.
- A Demo workspace label on every Aurixa screen, and fictional demonstration data only.
- Every don't in the pack's brand guidelines, and the twelve guardrails of the studio's Aurixa Systems kit (docs/brands/aurixa-systems.md): no fabricated returns, approvals, valuations or results; no automatic financial, legal or accounting decision; no NPC wording; Aurixa Systems, AURIXA SYSTEMS and Aurixa Agent spelled exactly.
- 9:16, 1080 x 1920, 30 fps.

## What this edition replaces

| The pack said                                                                         | This edition                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People, hands, faces, rooms and sets, and the cast's sheets and Soul IDs              | None appear. The product is the cast. (The six characters and their approved Soul IDs stay in the studio, unused here.)                                                                                                          |
| Generated video of any kind                                                           | None. Every frame is rendered from code: the products' pages as the reel's plates already rebuild them, and graphics written in the brand's CSS. Text is exact and sharp by construction, and nothing is billed to make a frame. |
| "Each portal demonstration must show a real hand using a mouse, keyboard or touchpad" | Each portal demonstration shows the product's own pointer, the control under it, the press, and the product's own response, in that order.                                                                                       |
| "60 percent people and property, 25 percent platform, 15 percent architecture"        | About 70 percent screen actions and workflows, 20 percent deliverables, 10 percent brand graphics (an editorial intention, as before).                                                                                           |
| The afternoon-to-blue-hour progression                                                | A colour progression instead: the unbranded tools of today in plain light greys (Blocks 01 to 03, and 09.1), then the brand's deep navy and gold from Block 04 on.                                                               |
| "Do not insert raw source screenshots into the film"                                  | Kept, and it matters more now: the supplied screenshots carry real client names, addresses and personal bookmarks. They remain the structural reference; every screen in the film is the code-built page with the demo record.   |

## The shots

29 shots, each one continuous composition, in 15 blocks. Times are on the voiceover's clock.

| Shot | In        | Out       | Seconds | Kind        | Palette | What happens                                                  | Voiceover                                                                                                                                                |
| ---- | --------- | --------- | ------- | ----------- | ------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01.1 | 00:00.000 | 00:04.200 | 4.200   | graphic     | before  | Somewhere in Australia, one listing                           | Somewhere in Australia, a property opportunity has just appeared.                                                                                        |
| 01.2 | 00:04.200 | 00:08.267 | 4.067   | screen      | before  | The client asks                                               | A client wants to know if it's right for them, while there's still time to act.                                                                          |
| 02.1 | 00:08.267 | 00:17.600 | 9.333   | workflow    | before  | Four tools, one question                                      | But before you can answer, the research is in one platform, the numbers in another, the client details somewhere else, and the report hasn't even begun. |
| 03.1 | 00:17.600 | 00:25.867 | 8.267   | workflow    | before  | The market moves, the client waits                            | WHAT HAPPENS THEN – The market keeps moving. Your attention is pulled in every direction. And the client is waiting.                                     |
| 04.1 | 00:25.867 | 00:30.867 | 5.000   | graphic     | aurixa  | The brand arrives, then its Command Centre                    | Aurixa Systems was built by property professionals for property professionals                                                                            |
| 04.2 | 00:30.867 | 00:33.833 | 2.966   | workflow    | aurixa  | One connected operating environment                           | We're here, with a connected operating environment                                                                                                       |
| 04.3 | 00:33.833 | 00:37.400 | 3.567   | screen      | aurixa  | Reports: the work starts the way it actually starts           | designed around how property professionals actually work.                                                                                                |
| 05.1 | 00:37.400 | 00:41.400 | 4.000   | screen      | aurixa  | From research into financial analysis                         | Picture a property moving from research into financial analysis,                                                                                         |
| 05.2 | 00:41.400 | 00:45.233 | 3.833   | deliverable | aurixa  | Into a report the client can understand                       | then into a professional report your client can understand.                                                                                              |
| 06.1 | 00:45.233 | 00:47.000 | 1.767   | screen      | aurixa  | The reply the client was waiting for                          | Picture communication,                                                                                                                                   |
| 06.2 | 00:47.000 | 00:50.700 | 3.700   | workflow    | aurixa  | Client relationships and property partners                    | client relationships and property partners connected to that journey,                                                                                    |
| 06.3 | 00:50.700 | 00:53.567 | 2.867   | screen      | aurixa  | Aurixa Agent, beside the work                                 | with Aurixa Agent supporting the work behind it.                                                                                                         |
| 07.1 | 00:53.567 | 00:57.633 | 4.066   | screen      | aurixa  | The professional changes it, then approves it                 | Not to replace your judgement, but to give it room to lead.                                                                                              |
| 08.1 | 00:57.633 | 01:00.700 | 3.067   | screen      | aurixa  | The accountant's part, done in the same system                | Because clients don't pay you to manage software.                                                                                                        |
| 08.2 | 01:00.700 | 01:05.100 | 4.400   | deliverable | aurixa  | What the client is trusting you with                          | They trust you to identify opportunities, make sense of complexity                                                                                       |
| 08.3 | 01:05.100 | 01:07.033 | 1.933   | screen      | aurixa  | The next decision, in the client's portal                     | and guide the next decision.                                                                                                                             |
| 09.1 | 01:07.033 | 01:11.500 | 4.467   | graphic     | before  | Bridging the gaps by hand                                     | You can keep asking your team to bridge the gaps between disconnected systems.                                                                           |
| 09.2 | 01:11.500 | 01:13.367 | 1.867   | screen      | aurixa  | One register instead                                          | But why should they have to?                                                                                                                             |
| 10.1 | 01:13.367 | 01:16.000 | 2.633   | graphic     | aurixa  | Not on the horizon                                            | Aurixa Systems isn't on the horizon.                                                                                                                     |
| 10.2 | 01:16.000 | 01:19.267 | 3.267   | graphic     | aurixa  | The invitation is open                                        | We've arrived, and the invitation is open.                                                                                                               |
| 11.1 | 01:19.267 | 01:20.700 | 1.433   | screen      | aurixa  | Start the trial                                               | Experience what we've built                                                                                                                              |
| 11.2 | 01:20.700 | 01:22.933 | 2.233   | screen      | aurixa  | The demo workspace opens                                      | with a 14-day free trial.                                                                                                                                |
| 12.1 | 01:22.933 | 01:24.333 | 1.400   | screen      | aurixa  | Explore the platform                                          | Explore the platform,                                                                                                                                    |
| 12.2 | 01:24.333 | 01:26.533 | 2.200   | screen      | aurixa  | Alongside the way you work: the builder                       | put it alongside the way you work today,                                                                                                                 |
| 12.3 | 01:26.533 | 01:28.800 | 2.267   | workflow    | aurixa  | The same document, the solicitor's notes                      | and discover what a more connected business                                                                                                              |
| 12.4 | 01:28.800 | 01:30.133 | 1.333   | graphic     | aurixa  | A more connected business                                     | could feel like.                                                                                                                                         |
| 13.1 | 01:30.133 | 01:34.400 | 4.267   | screen      | aurixa  | A decision recorded, and the journey complete                 | Don't just take our word for it. Let your own experience make the case.                                                                                  |
| 14.1 | 01:34.400 | 01:39.467 | 5.067   | graphic     | aurixa  | Fourteen days. Your business. Your experience. Your decision. | Fourteen days. Your business. Your experience. Your decision.                                                                                            |
| 15.1 | 01:39.467 | 01:46.031 | 6.564   | graphic     | aurixa  | Aurixa Systems, and the trial                                 | Aurixa Systems. The operating system for modern property professionals. Start your free trial today.                                                     |

### Block 01 · The opportunity and the client (00:00.000 to 00:08.267)

_The pack's purpose:_ Give the viewer one recognisable property and one client question. The facade becomes the screen image, then the inquiry becomes the next scene's task.

#### 01.1 · Somewhere in Australia, one listing

00:00.000 to 00:04.200 (4.200 s) · graphic · palette: before

> Somewhere in Australia, a property opportunity has just appeared.

| At        | What happens                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 00:00.000 | A dot-matrix map of Australia draws itself in fine ink on paper white, from the west coast east.                                     |
| 00:00.600 | One pin drops on the New South Wales coast, in the brand's gold: the only colour in the frame. A soft ring pulses once.              |
| 00:01.500 | The pin opens into a listing card, the way a map marker opens on a property site: the photograph P, the address line and four facts. |
| 00:03.100 | A small chip reads New listing · just now.                                                                                           |

- **Camera:** A slow push from the whole continent to the card; the card ends centred in the upper action zone.
- **Ends on:** The listing card, readable, with the gold pin above it.
- **On screen, exactly:** "Banksia Rise NSW 2155" · "Residence 014 · Project Banksia" · "4 bed · 1 bath · 1 car · 290 m² land" · "New listing · just now"
- **Made from:** `G-MAP`, `G-LISTING`, `P`

#### 01.2 · The client asks

00:04.200 to 00:08.267 (4.067 s) · screen · palette: before

> A client wants to know if it's right for them, while there's still time to act.

| At        | What happens                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| 00:04.200 | A plain messaging window (no product's brand) with the listing attached as a card, from Jordan Ellis to Alex Morgan. |
| 00:04.500 | The question types itself in, at a reading pace.                                                                     |
| 00:06.333 | The pointer reaches Send and presses it; the window's own pressed state, then Sent.                                  |
| 00:07.100 | On the attached card a small chip appears: Expressions of interest close Friday.                                     |

- **Camera:** Starts on the composer, eases in to the message and the Send button, holds on Sent.
- **Ends on:** Sent, with the question readable and the attached listing.
- **On screen, exactly:** "From: Jordan Ellis · To: Alex Morgan" · "Can we review whether this suits my plans?" · "Send → Sent" · "Expressions of interest close Friday"
- **Made from:** `PL-01B-a`, `PL-01B-b`, `G-WINDOW-PLAIN`, `G-POINTER`

### Block 02 · The scattered workflow (00:08.267 to 00:17.600)

_The pack's purpose:_ Show the practical cost of fragmented tools through repeated attention shifts while the client's answer remains unfinished.

#### 02.1 · Four tools, one question

00:08.267 to 00:17.600 (9.333 s) · workflow · palette: before

> But before you can answer, the research is in one platform, the numbers in another, the client details somewhere else, and the report hasn't even begun.

| At        | What happens                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 00:08.267 | The question lands in a generic inbox as the top row; the pointer moves to Reply and stops, because there is nothing to reply with yet. |
| 00:10.000 | A research tool opens over it: a map and a list of comparable sales, as grey placeholder rows.                                          |
| 00:11.900 | A spreadsheet opens, offset: a few labelled columns, one formula cell selected.                                                         |
| 00:13.433 | A contact card for Jordan Ellis opens in a third tool, in a different style again.                                                      |
| 00:15.267 | A fourth window: Untitled report, empty, its caret blinking. The pointer hops between the four windows once each.                       |

- **Camera:** Pulls back a little with each window, so all four are in frame by the last beat, overlapping and misaligned.
- **Ends on:** Four separate windows, none of them finished, and the empty report in front.
- **On screen, exactly:** "Can we review whether this suits my plans?" · "Research" · "Financial worksheet" · "Client details" · "Untitled report"
- **Made from:** `PL-02A`, `NEW-INBOX`, `G-WINDOW-PLAIN`, `G-POINTER`
- **Note:** PL-02A has the four windows in one plate; here they arrive one by one, so each is built as its own window.

### Block 03 · The pressure while the client waits (00:17.600 to 00:25.867)

_The pack's purpose:_ Tie the pressure passage to relevant incoming property information, a real interruption and a waiting person. Each brief insert advances the same unresolved question.

#### 03.1 · The market moves, the client waits

00:17.600 to 00:25.867 (8.267 s) · workflow · palette: before

> WHAT HAPPENS THEN – The market keeps moving. Your attention is pulled in every direction. And the client is waiting.

| At        | What happens                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:17.600 | The four windows hold; in the corner the desktop clock starts to run (Monday 9:14 onward).                                                      |
| 00:18.967 | The listing card slides back in over them: its enquiry count ticks up, a Price guide updated chip and an Inspection booked chip appear.         |
| 00:20.933 | Notifications arrive from every edge (mail, chat, calendar, the CRM, a floor plan received for Residence 014) and the windows are nudged apart. |
| 00:23.867 | Everything clears except the client's question: Sent Monday 9:14, No reply yet. The clock now reads Wednesday.                                  |
| 00:25.200 | The frame dims toward dark.                                                                                                                     |

- **Camera:** Locked off; the notifications move, not the camera. The last beat is a slow push to the question.
- **Ends on:** The unanswered question alone, with No reply yet.
- **On screen, exactly:** "Can we review whether this suits my plans?" · "Sent Monday 9:14 · No reply yet"
- **Made from:** `NEW-NOTIFICATIONS`, `G-LISTING`, `PL-03A`, `PL-03C`, `G-CLOCK`
- **Note:** The listing figures that move are the listing site's own (enquiries, inspections), never a claim about Aurixa.

### Block 04 · Aurixa arrives and the viewer enters the console (00:25.867 to 00:37.400)

_The pack's purpose:_ Bring the client inquiry into an occupied Aurixa Systems environment, then show a clear human-operated starting point in the Command Center.

#### 04.1 · The brand arrives, then its Command Centre

00:25.867 to 00:30.867 (5.000 s) · graphic · palette: aurixa

> Aurixa Systems was built by property professionals for property professionals

| At        | What happens                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 00:25.867 | The dimmed frame becomes the brand's deep navy. A single gold hairline draws across the middle.                                                                                            |
| 00:26.333 | The supplied logo's emblem opens out of the hairline: its triangle, then the orb's glow.                                                                                                   |
| 00:27.267 | Its wordmark, AURIXA SYSTEMS, opens beneath it letter by letter: the supplied logo, never retyped.                                                                                         |
| 00:28.633 | The emblem lifts into the top left and becomes the Command Centre's own sidebar mark; the sidebar's groups set in, then the top bar with its Demo workspace badge, then the Overview page. |

- **Camera:** Still for the emblem; one slow push as the Command Centre settles into its glass window.
- **Ends on:** The Command Centre's Overview in the demo workspace, whole, in its window.
- **On screen, exactly:** "AURIXA SYSTEMS" · "COMMAND CENTRE" · "DEMO WORKSPACE" · "Overview"
- **Made from:** `REF-LOGO`, `G-HAIRLINE`, `G-EMBLEM`, `PL-11A-c`, `G-WINDOW`

#### 04.2 · One connected operating environment

00:30.867 to 00:33.833 (2.966 s) · workflow · palette: aurixa

> We're here, with a connected operating environment

| At        | What happens                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 00:30.867 | The Command Centre's window shrinks to the centre and becomes the hub.                                                                                                                                             |
| 00:31.900 | Five portal windows arrive around it, each on its own dashboard: Client, Finance, Accountant, Solicitor, the Builders Network. A line draws from the hub to each as it arrives, and each takes a small mono label. |

- **Camera:** A slow pull back; nothing rotates.
- **Ends on:** The hub and its five portals, every link drawn and every label readable.
- **On screen, exactly:** "COMMAND CENTRE" · "CLIENT PORTAL" · "FINANCE PORTAL" · "ACCOUNTANT PORTAL" · "SOLICITOR PORTAL" · "BUILDERS NETWORK"
- **Made from:** `G-SYSTEM-MAP`, `PL-11A-c`, `PL-06A-a`, `NEW-DASHBOARDS`

#### 04.3 · Reports: the work starts the way it actually starts

00:33.833 to 00:37.400 (3.567 s) · screen · palette: aurixa

> designed around how property professionals actually work.

| At        | What happens                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:33.833 | The camera pushes from the hub into the Command Centre: Reports, the Investment Report Workspace preparing for Jordan Ellis, with Residence 014's card. |
| 00:34.833 | The pointer travels to New Build.                                                                                                                       |
| 00:35.633 | It presses: the card takes the product's selected blue. Focus corners close in on the three build types.                                                |
| 00:35.833 | Hold on the selection with Residence 014's card beside it.                                                                                              |

- **Camera:** One push in, then still.
- **Ends on:** New Build selected, Residence 014 · BK-014 unchanged beside it.
- **On screen, exactly:** "Reports" · "Investment Report Workspace" · "Project Banksia / Residence 014 · BK-014" · "Existing Property · New Build · Land Only"
- **Made from:** `PL-04B-a`, `PL-04B-b`, `G-WINDOW`, `G-POINTER`, `G-FOCUS`

### Block 05 · Research to financial analysis to a report (00:37.400 to 00:45.233)

_The pack's purpose:_ Connect the prepared research, illustrative finance comparison and client report through the exact same property image. Prioritise one useful result per insert.

#### 05.1 · From research into financial analysis

00:37.400 to 00:41.400 (4.000 s) · screen · palette: aurixa

> Picture a property moving from research into financial analysis,

| At        | What happens                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:37.400 | The investment report's page: Project Banksia / Residence 014, its Compass on view. The journey rail slides in above the window with Research lit. |
| 00:39.500 | The pointer presses + Financial; the tier reads preparing and the rail moves to Financial.                                                         |

- **Camera:** Starts on the record's header and tiers; a short pan to + Financial.
- **Ends on:** Financial preparing from the Compass, the rail on Financial.
- **On screen, exactly:** "Compass · + Financial" · "Preparing Financial from this Compass" · "RESEARCH · FINANCIAL · REPORT · TEAM · DECISION"
- **Made from:** `PL-05A-a`, `PL-05A-b`, `G-RAIL`, `G-POINTER`

#### 05.2 · Into a report the client can understand

00:41.400 to 00:45.233 (3.833 s) · deliverable · palette: aurixa

> then into a professional report your client can understand.

| At        | What happens                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:41.400 | Generated Reports: the pointer is on Residence 014.                                                                                                               |
| 00:41.900 | It opens: the report's page, Prepared from this Compass: Financial. The rail moves to Report.                                                                     |
| 00:43.200 | The document itself lifts out of the page: the Investment Compass cover, then its pages fan out behind it (the contents, The property's photograph, the summary). |

- **Camera:** Follows the click, then holds while the document comes forward.
- **Ends on:** The client's report: the cover in front, its pages fanned behind.
- **On screen, exactly:** "Generated Reports" · "Investment Compass" · "RESIDENCE 014, PROJECT BANKSIA, BANKSIA RISE NSW 2155"
- **Made from:** `PL-05C-a`, `PL-05C-b`, `PL-08B`, `NEW-REPORT-PAGES`, `G-RAIL`, `G-DOCUMENT`, `G-POINTER`
- **Note:** The pages are the product's standard PDF, which since 21 October 2026 draws no floor-plan sheet. The cover carries no grade or score. Its colours are the ones the product resolves for an issuer with no brand colour, obsidian #251F18 and gold #D9A520 (NEW-REPORT-PAGES); PL-08B still shows the navy it was approved in and should take the same three colours before the film is drawn.

### Block 06 · Communication and the supporting agent (00:45.233 to 00:53.567)

_The pack's purpose:_ Make the client's professional team visible, then show Aurixa Agent supporting the professional within the same record context.

#### 06.1 · The reply the client was waiting for

00:45.233 to 00:47.000 (1.767 s) · screen · palette: aurixa

> Picture communication,

| At        | What happens                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| 00:45.233 | The Command Centre's Message Hub, Jordan Ellis's thread: his question from 01.2 at the top, the reply drafted below it. |
| 00:45.833 | The pointer presses Send; the reply joins the thread with its delivered tick. The rail moves to Team.                   |

- **Camera:** Still.
- **Ends on:** Question and answer in one thread, inside Aurixa.
- **On screen, exactly:** "Can we review whether this suits my plans?" · "Your Residence 014 report is ready in your portal. Let's go through it together on Thursday."
- **Made from:** `NEW-MESSAGE-HUB`, `G-WINDOW`, `G-POINTER`
- **Note:** The payoff of 03.1: the same words, now answered. The Message Hub sits in the Command Centre's Client & CRM group, and its Details name the professional's side Command Center, the product's own spelling.

#### 06.2 · Client relationships and property partners

00:47.000 to 00:50.700 (3.700 s) · workflow · palette: aurixa

> client relationships and property partners connected to that journey,

| At        | What happens                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:47.000 | The Client Portal: Welcome back, Jordan Ellis. The pointer presses My Property Team.                                                                              |
| 00:47.700 | The team's page: five of five roles engaged.                                                                                                                      |
| 00:49.333 | The five team cards lift out of the page and ring Residence 014's record card; the rail line draws from each card to it, and a traveller dot runs each line once. |

- **Camera:** Still, then a pull back as the cards ring the record.
- **Ends on:** Five named professionals linked to one record.
- **On screen, exactly:** "My Property Team" · "5 of 5 roles engaged" · "Alex Morgan · Jamie Chen · Priya Shah · Mia Patel · Daniel Reed"
- **Made from:** `PL-06A-a`, `PL-06A-b`, `G-RECORD-CARD`, `G-LINKS`, `G-POINTER`

#### 06.3 · Aurixa Agent, beside the work

00:50.700 to 00:53.567 (2.867 s) · screen · palette: aurixa

> with Aurixa Agent supporting the work behind it.

| At        | What happens                                                                      |
| --------- | --------------------------------------------------------------------------------- |
| 00:50.700 | The report's page with the agent's own floating button; its label shows on hover. |
| 00:51.400 | The pointer presses it and the agent's panel opens over the report.               |
| 00:52.000 | Its draft for Jordan sets in as a card that reads Needs your go-ahead.            |

- **Camera:** Pushes to the panel as it opens.
- **Ends on:** The agent's draft, marked as needing the professional's go-ahead.
- **On screen, exactly:** "Aurixa" · "Draft a short note to Jordan Ellis about his Residence 014 client summary." · "Needs your go-ahead"
- **Made from:** `PL-06B-a`, `PL-06B-b`, `G-POINTER`
- **Note:** Guardrail 7: the agent drafts and a person reviews; the card says so on screen.

### Block 07 · Professional judgement remains visible (00:53.567 to 00:57.633)

_The pack's purpose:_ Give the professional's considered edit centre stage. The system acknowledges saved work while the person retains judgement.

#### 07.1 · The professional changes it, then approves it

00:53.567 to 00:57.633 (4.066 s) · screen · palette: aurixa

> Not to replace your judgement, but to give it room to lead.

| At        | What happens                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| 00:53.567 | Close on the draft's next step. The caret enters it.                                                                |
| 00:53.967 | The professional types her own change; each new word takes the marker, a fine gold rule, beneath it as it is typed. |
| 00:55.667 | The pointer presses Approve: the card reads Approved, with the changed line.                                        |

- **Camera:** Close and still; the text is the subject.
- **Ends on:** Approved, with the professional's own words.
- **On screen, exactly:** "Make the next step: review the remaining questions together" · "Approved"
- **Made from:** `PL-07A-a`, `PL-07A-b`, `G-POINTER`

### Block 08 · Professional work and the client decision (00:57.633 to 01:07.033)

_The pack's purpose:_ Show an accountant contributing a concrete review, then reveal how prepared information supports a useful client conversation.

#### 08.1 · The accountant's part, done in the same system

00:57.633 to 01:00.700 (3.067 s) · screen · palette: aurixa

> Because clients don't pay you to manage software.

| At        | What happens                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------- |
| 00:57.633 | The Accountant Portal: Jordan Ellis's client file, Requests. FY2026 income statement · Client responded. |
| 00:58.633 | The pointer presses Mark fulfilled; the request turns Fulfilled.                                         |

- **Camera:** Still.
- **Ends on:** The request Fulfilled.
- **On screen, exactly:** "CLIENT FILE · Jordan Ellis" · "FY2026 income statement" · "Mark fulfilled → Fulfilled"
- **Made from:** `PL-08A-a`, `PL-08A-b`, `G-POINTER`

#### 08.2 · What the client is trusting you with

01:00.700 to 01:05.100 (4.400 s) · deliverable · palette: aurixa

> They trust you to identify opportunities, make sense of complexity

| At        | What happens                                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:00.700 | The client's report in the PDF viewer at its summary, page 4 of 22: Executive Verdict, the purchase price and the rent, and the readiness statement. The marker settles under the case it sets out. |
| 01:03.500 | The page turns to page 19, How this grade was reached: three dimensions scored and two not, under the illustrative label. The marker settles under the two that were not scored.                    |

- **Camera:** Still; the pages turn.
- **Ends on:** Two pages of the client's own report, each with one marked passage.
- **On screen, exactly:** "Investment Compass" · "How this grade was reached" · "Illustrative example only: hypothetical client, figures and assumptions. Not a credit assessment or financial advice."
- **Made from:** `NEW-REPORT-PAGES`, `G-DOCUMENT`, `G-HIGHLIGHT`
- **Note:** Guardrail 2: anything modelled carries the illustrative label on the page itself. The verdict line is the product's own for a B+ assessed on 3 of 5 dimensions (BUY - Good investment opportunity with favourable metrics in most of the areas assessed); the camera and the marker stay on the case and on the readiness statement, which says the grade is not permission to proceed.

#### 08.3 · The next decision, in the client's portal

01:05.100 to 01:07.033 (1.933 s) · screen · palette: aurixa

> and guide the next decision.

| At        | What happens                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:05.100 | The Client Portal's Reports page: the report's card, Project Banksia / Residence 014, Investment Report · Compass, marked New.                                                                            |
| 01:05.800 | Beside it, the next discussion's card from My Appointments slides in: Report walkthrough with Alex Morgan, Thu, 22 Oct 2026, 10:00 AM – 10:30 AM, Upcoming. The pointer comes to rest on Download Report. |

- **Camera:** Still.
- **Ends on:** The report and the next discussion, side by side for the client.
- **On screen, exactly:** "Investment Report · Compass · New" · "Download Report" · "Report walkthrough with Alex Morgan" · "Thu, 22 Oct 2026 · 10:00 AM – 10:30 AM · Upcoming"
- **Made from:** `NEW-CLIENT-REPORTS`, `G-POINTER`
- **Note:** The two cards are on two pages of the Client Portal (Reports and My Appointments), and no page holds both, so the second is brought in as a graphic. Guides the decision: nothing on screen makes it.

### Block 09 · The manual gap and the connected matter (01:07.033 to 01:13.367)

_The pack's purpose:_ Contrast duplicate checking with one selection of an organised matter and its next review task.

#### 09.1 · Bridging the gaps by hand

01:07.033 to 01:11.500 (4.467 s) · graphic · palette: before

> You can keep asking your team to bridge the gaps between disconnected systems.

| At        | What happens                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 01:07.033 | Two plain document lists for Residence 014 side by side, each with its own copy of the contract and the floor plan.            |
| 01:08.467 | Dashed bridges reach across the gap between them; a document is dragged across by hand, a bridge breaks, a third copy appears. |

- **Camera:** Still.
- **Ends on:** Two lists, three copies of one document, no bridge holding.
- **On screen, exactly:** "Residence 014 — documents"
- **Made from:** `PL-09A`, `G-BRIDGE`

#### 09.2 · One register instead

01:11.500 to 01:13.367 (1.867 s) · screen · palette: aurixa

> But why should they have to?

| At        | What happens                                                                               |
| --------- | ------------------------------------------------------------------------------------------ |
| 01:11.500 | The Solicitor Portal: the matter Ellis: Purchase, Residence 014. The pointer presses Docs. |
| 01:12.000 | The document register: four documents, one copy of each, each with its status.             |

- **Camera:** Still.
- **Ends on:** The register, 3 outstanding of 4, the floor plan Under review.
- **On screen, exactly:** "Ellis: Purchase, Residence 014" · "Document register" · "Contract of sale (draft) · Floor plan — Residence 014 · Building specification · Planning certificate"
- **Made from:** `PL-09B-a`, `PL-09B-b`, `G-POINTER`

### Block 10 · The system is here (01:13.367 to 01:19.267)

_The pack's purpose:_ Expand from an active matter to the occupied professional relationship, then guide the eye into the workspace the viewer is invited to explore.

#### 10.1 · Not on the horizon

01:13.367 to 01:16.000 (2.633 s) · graphic · palette: aurixa

> Aurixa Systems isn't on the horizon.

| At        | What happens                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:13.367 | A gold horizon line across the lower third, the traveller's glow along it.                                                                                          |
| 01:14.367 | The camera tilts down past it into the system map, every portal live: small confirmations seen earlier (Selected, Approved, Fulfilled) blink once in their portals. |

- **Camera:** One tilt down.
- **Ends on:** The whole system, live.
- **Made from:** `G-HORIZON`, `G-SYSTEM-MAP`

#### 10.2 · The invitation is open

01:16.000 to 01:19.267 (3.267 s) · graphic · palette: aurixa

> We've arrived, and the invitation is open.

| At        | What happens                                                             |
| --------- | ------------------------------------------------------------------------ |
| 01:16.000 | The system map dims; the trial invitation rises into the centre over it. |
| 01:18.200 | The pointer arrives over START YOUR FREE TRIAL; its hover state.         |

- **Camera:** Still.
- **Ends on:** The invitation, whole, with the pointer on its button.
- **On screen, exactly:** "14-DAY FREE TRIAL" · "START YOUR FREE TRIAL"
- **Made from:** `PL-11A-a`, `G-SYSTEM-MAP`, `G-POINTER`

### Block 11 · The fourteen day invitation (01:19.267 to 01:22.933)

_The pack's purpose:_ Present the exact 14-day trial invitation as a clear human action, leading by editorial cut into a prepared demonstration workspace.

#### 11.1 · Start the trial

01:19.267 to 01:20.700 (1.433 s) · screen · palette: aurixa

> Experience what we've built

| At        | What happens                                         |
| --------- | ---------------------------------------------------- |
| 01:19.267 | Close on the button.                                 |
| 01:19.633 | The press: the button sinks and takes its gold edge. |

- **Camera:** Close and still.
- **Ends on:** The pressed button.
- **On screen, exactly:** "START YOUR FREE TRIAL"
- **Made from:** `PL-11A-a`, `PL-11A-b`, `G-POINTER`

#### 11.2 · The demo workspace opens

01:20.700 to 01:22.933 (2.233 s) · screen · palette: aurixa

> with a 14-day free trial.

| At        | What happens                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------- |
| 01:20.700 | The Command Centre's Overview opens in the demo workspace; the Demo workspace badge glows once. |
| 01:21.900 | Focus settles on the Demo project card: Residence 014.                                          |

- **Camera:** A short push to the demo project.
- **Ends on:** The demo workspace, with Residence 014 waiting in it.
- **On screen, exactly:** "DEMO WORKSPACE" · "Demo project · Residence 014 · Project Banksia · New Build"
- **Made from:** `PL-11A-c`, `G-WINDOW`

### Block 12 · Explore the working partner portals (01:22.933 to 01:30.133)

_The pack's purpose:_ Give the builder/developer and solicitor one useful action each, connected by the same floor-plan document.

#### 12.1 · Explore the platform

01:22.933 to 01:24.333 (1.400 s) · screen · palette: aurixa

> Explore the platform,

| At        | What happens                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 01:22.933 | The pointer runs down the sidebar: Overview, Reports, Generated Reports, then the report, each page changing as the product changes pages. |

- **Camera:** Still; the pages change under it.
- **Ends on:** The report's page, where the tour stops.
- **On screen, exactly:** "Overview · Reports · Generated Reports"
- **Made from:** `PL-11A-c`, `PL-04B-a`, `PL-05C-a`, `PL-05A-a`, `G-POINTER`
- **Note:** The one montage in the film: no single page is held to read.

#### 12.2 · Alongside the way you work: the builder

01:24.333 to 01:26.533 (2.200 s) · screen · palette: aurixa

> put it alongside the way you work today,

| At        | What happens                                                                         |
| --------- | ------------------------------------------------------------------------------------ |
| 01:24.333 | The Builders Network: Daniel Reed's Stock List, Residence 014 Selected for a client. |
| 01:25.033 | The pointer opens the floorplan-R014.pdf tab; the floor plan, whole.                 |

- **Camera:** Still.
- **Ends on:** The floor plan in its own tab.
- **On screen, exactly:** "Stock List" · "SELECTED FOR A CLIENT" · "floorplan-R014.pdf"
- **Made from:** `PL-12A-a`, `PL-12A-b`, `G-POINTER`, `G-DOCUMENT`

#### 12.3 · The same document, the solicitor's notes

01:26.533 to 01:28.800 (2.267 s) · workflow · palette: aurixa

> and discover what a more connected business

| At        | What happens                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| 01:26.533 | The same floor plan (carried over from 12.2 as one object) slides to the left; the matter's Notes window opens beside it. |
| 01:27.533 | The pointer presses Save notes; the product's toast: Matter updated.                                                      |

- **Camera:** Still.
- **Ends on:** The plan beside the notes, Matter updated.
- **On screen, exactly:** "floorplan-R014.pdf" · "Notes" · "Matter updated"
- **Made from:** `PL-12B-a`, `PL-12B-b`, `G-POINTER`, `G-DOCUMENT`

#### 12.4 · A more connected business

01:28.800 to 01:30.133 (1.333 s) · graphic · palette: aurixa

> could feel like.

| At        | What happens                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| 01:28.800 | Back to the system map: one pulse travels from the hub to each portal in turn and every link brightens once. |

- **Camera:** A slight pull back.
- **Ends on:** The system map at rest.
- **Made from:** `G-SYSTEM-MAP`

### Block 13 · The viewer can assess the experience (01:30.133 to 01:34.400)

_The pack's purpose:_ Show a finance professional using a relevant comparison and considering its usefulness without claiming an investment outcome.

#### 13.1 · A decision recorded, and the journey complete

01:30.133 to 01:34.400 (4.267 s) · screen · palette: aurixa

> Don't just take our word for it. Let your own experience make the case.

| At        | What happens                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 01:30.133 | The Finance Portal: Record finance decision for Residence 014, Subject to valuation.                                                         |
| 01:30.933 | The pointer presses Record decision; the product's toast: Decision recorded.                                                                 |
| 01:31.967 | The camera pulls back to the journey rail, now complete: Research, Financial, Report, Team, Decision, the last reading Subject to valuation. |

- **Camera:** Still, then one pull back.
- **Ends on:** The complete rail, ending on Subject to valuation.
- **On screen, exactly:** "Record finance decision" · "Decision: Subject to valuation" · "Decision recorded"
- **Made from:** `PL-13A-a`, `PL-13A-b`, `G-RAIL`, `G-POINTER`
- **Note:** The decision recorded is the broker's call, Subject to valuation: no approval or outcome is shown.

### Block 14 · Four short statements and a personal decision (01:34.400 to 01:39.467)

_The pack's purpose:_ Let the four decision phrases land over one uninterrupted professional moment, linking the trial to the viewer's own business and judgement.

#### 14.1 · Fourteen days. Your business. Your experience. Your decision.

01:34.400 to 01:39.467 (5.067 s) · graphic · palette: aurixa

> Fourteen days. Your business. Your experience. Your decision.

| At        | What happens                                                                       |
| --------- | ---------------------------------------------------------------------------------- |
| 01:34.400 | A slow lateral drift across a wall of the film's own screens, dimmed and softened. |
| 01:34.570 | Fourteen days.                                                                     |
| 01:35.870 | Your business.                                                                     |
| 01:36.980 | Your experience.                                                                   |
| 01:38.270 | Your decision.                                                                     |

- **Camera:** One slow lateral drift, never reversing.
- **Ends on:** Each phrase alone and readable on the wall of screens.
- **On screen, exactly:** "Fourteen days." · "Your business." · "Your experience." · "Your decision."
- **Made from:** `PL-14A-1`, `PL-14A-2`, `PL-14A-3`, `PL-14A-4`, `G-WALL`
- **Note:** The phrases are the edit's own overlays at the spec's times; no captions over them.

### Block 15 · The final brand and trial invitation (01:39.467 to 01:46.031)

_The pack's purpose:_ Resolve the tangible work into a stable, memorable Aurixa Systems identity and a clearly readable trial action.

#### 15.1 · Aurixa Systems, and the trial

01:39.467 to 01:46.031 (6.564 s) · graphic · palette: aurixa

> Aurixa Systems. The operating system for modern property professionals. Start your free trial today.

| At        | What happens                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01:39.467 | The closing card, complete from its first frame: the logo, the operating-system line, 14-DAY FREE TRIAL, START YOUR FREE TRIAL and aurixasystems.com.au.     |
| 01:44.667 | As the last line is spoken, the site's own shimmer (.pricing-shimmer-text: white, focus cyan, white) crosses START YOUR FREE TRIAL once; nothing else moves. |

- **Camera:** Still.
- **Ends on:** The closing card, held through the audio tail.
- **On screen, exactly:** "AURIXA SYSTEMS" · "The operating system for modern property professionals." · "14-DAY FREE TRIAL" · "START YOUR FREE TRIAL" · "aurixasystems.com.au"
- **Made from:** `PL-15A`
- **Note:** The pack's rule: the whole offer is visible from the start of Block 15, so nothing builds on.

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

| Role             | Token                                             | Value                                                                                                        | From                                                                       |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| ground           | `--color-base-950`                                | `#040B16`                                                                                                    | aurixa-systems `@theme`, under the body's three radials                    |
| surface          | `--color-marketing-panel`                         | `#10233D`                                                                                                    | aurixa-systems `@theme`                                                    |
| surface-raised   | `--color-base-900`                                | `#0B162C`                                                                                                    | aurixa-systems `@theme`                                                    |
| glass            | `--glass-fill · --glass-blur`                     | `hsl(220 60% 11% / 0.55) · 16px`                                                                             | aurixa-builders `tokens.css` (`.dark`)                                     |
| sheen            | `--glass-sheen`                                   | `linear-gradient(160deg, var(--glass-specular) 0%, hsl(0 0% 100% / 0) 46%, hsl(var(--primary) / 0.06) 100%)` | aurixa-builders `tokens.css` (`.dark`)                                     |
| border           | `--glass-stroke`                                  | `hsl(0 0% 100% / 0.10)`                                                                                      | aurixa-builders `tokens.css` (`.dark`)                                     |
| radius-window    | `--radius-xl`                                     | `1.25rem`                                                                                                    | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           |
| radius-card      | `--radius-lg`                                     | `0.75rem`                                                                                                    | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           |
| shadow-window    | `--glass-shadow-lg`                               | `0 28px 70px -24px hsl(0 0% 0% / 0.78), 0 8px 22px -12px hsl(0 0% 0% / 0.50)`                                | aurixa-builders `tokens.css` (`.dark`)                                     |
| shadow-document  | `--elevation-4`                                   | `0 24px 48px -12px hsl(0 0% 0% / 0.65), 0 8px 16px -8px hsl(0 0% 0% / 0.45)`                                 | npc-client-dashboard and aurixa-builders `src/styles/tokens.css` (`.dark`) |
| blur             | `--glass-blur-lg`                                 | `28px`                                                                                                       | aurixa-builders `tokens.css`                                               |
| pointer          | `--color-text-primary, edged in --color-base-950` | `#FFFFFF / #040B16`                                                                                          | aurixa-systems `@theme`                                                    |
| ease-move        | `--motion-ease-emphasized`                        | `cubic-bezier(0.2, 0, 0, 1)`                                                                                 | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           |
| ease-settle      | `--motion-ease-out`                               | `cubic-bezier(0.22, 1, 0.36, 1)`                                                                             | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           |
| press-ring       | `:focus-visible outline`                          | `#5EDDE8`                                                                                                    | aurixa-systems `src/index.css`; the Builders Network's dark `--ring`       |
| motion-press     | `--motion-slow`                                   | `320ms`                                                                                                      | npc-client-dashboard and aurixa-builders `src/styles/tokens.css`           |
| gold             | `--color-prism-magenta`                           | `#C89B3C`                                                                                                    | aurixa-systems `@theme`                                                    |
| gold-ink         | `none`                                            | `#D7B35F`                                                                                                    | aurixa-systems `src/index.css` (`.compliance-eyebrow` and 101 other uses)  |
| hairline         | `.compliance-eyebrow > span`                      | `1px · #c89b3c`                                                                                              | aurixa-systems `src/index.css`                                             |
| glow-gold        | `.compliance-traveller box-shadow`                | `0 0 14px #d7b35f`                                                                                           | aurixa-systems `src/index.css`                                             |
| traveller        | `.compliance-traveller`                           | `6px · #f5d17a · 0 0 14px #d7b35f`                                                                           | aurixa-systems `src/index.css`                                             |
| link-line        | `.framework-rail`                                 | `1px · linear-gradient(transparent, #5edde8 20%, #c89b3c 80%, transparent)`                                  | aurixa-systems `src/index.css`                                             |
| dot-field        | `.framework-visual::before`                       | `radial-gradient(rgba(94,221,232,.2) .7px, transparent .7px) · 22px`                                         | aurixa-systems `src/index.css`                                             |
| corners          | `.compliance-corners`                             | `1rem · 1px · #5edde8 top left · #d7b35f bottom right`                                                       | aurixa-systems `src/index.css`                                             |
| mono             | `.compliance-eyebrow`                             | `700 .625rem/1.5 ui-monospace · .28em · uppercase`                                                           | aurixa-systems `src/index.css`, set in Inconsolata                         |
| sans             | `--font-sans`                                     | `"Inter", system-ui, sans-serif`                                                                             | aurixa-systems `@theme`                                                    |
| display          | `--font-display`                                  | `"Playfair Display", ui-serif, Georgia, …`                                                                   | aurixa-systems `@theme`                                                    |
| ink              | `--color-text-primary`                            | `#FFFFFF`                                                                                                    | aurixa-systems `@theme`                                                    |
| ink-muted        | `--color-marketing-muted`                         | `#B7C1D0`                                                                                                    | aurixa-systems `@theme`                                                    |
| teal-builders    | `--primary (.dark)`                               | `184 100% 35%`                                                                                               | aurixa-builders `tokens.css`                                               |
| before-paper     | `--color-chrome-100`                              | `#F3F4F6`                                                                                                    | aurixa-systems `@theme`                                                    |
| before-surface   | `none`                                            | `#FFFFFF`                                                                                                    | white                                                                      |
| before-border    | `--color-chrome-300`                              | `#D1D5DB`                                                                                                    | aurixa-systems `@theme`                                                    |
| before-ink       | `--color-chrome-700`                              | `#374151`                                                                                                    | aurixa-systems `@theme`                                                    |
| before-ink-muted | `--color-chrome-500`                              | `#6B7280`                                                                                                    | aurixa-systems `@theme`                                                    |
| before-type      | `system-ui`                                       | `Selawik`                                                                                                    | the system face, as the plates set it                                      |

## The graphics kit

Built once, in HTML and CSS on the tokens above, and reused. Every graphic is the brand's own material: glass, gold hairlines, the mono labels and the type of its site and products, never stock footage or generic templates.

| Graphic                                 | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                        | Drawn in                                                                               | Used in                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `G-WINDOW` · The glass window           | The Aurixa pages' holder: the page at its drawn zoom inside a rounded window of the products' own glass (fill, sheen and hairline stroke), lifted by their largest glass shadow, floating on the site's ground in the frame's action zone.                                                                                                                                                                                                        | ground, glass, sheen, border, radius-window, shadow-window                             | 04.1, 04.3, 06.1, 11.2                                                                                     |
| `G-WINDOW-PLAIN` · The plain window     | The same window for today's tools: white, a grey system title bar, the system's own type, no brand colour and no glass.                                                                                                                                                                                                                                                                                                                           | before-surface, before-border, before-ink, before-type                                 | 01.2, 02.1                                                                                                 |
| `G-POINTER` · The pointer and its press | A standard arrow at 1.6x, white with a dark edge, moving on the products' emphasized ease; a press draws a 1 px ring in the focus cyan that grows from 0 to 24 px and fades over 320 ms.                                                                                                                                                                                                                                                          | pointer, ease-move, press-ring, motion-press                                           | 01.2, 02.1, 04.3, 05.1, 05.2, 06.1, 06.2, 06.3, 07.1, 08.1, 08.3, 09.2, 10.2, 11.1, 12.1, 12.2, 12.3, 13.1 |
| `G-FOCUS` · Focus corners               | The site's own corner marks (.compliance-corners): a 1 px cyan corner top left and a gold one bottom right, 1rem long, closing in on the part of a page that acts.                                                                                                                                                                                                                                                                                | corners, ease-settle                                                                   | 04.3                                                                                                       |
| `G-RAIL` · The journey rail             | Research · Financial · Report · Team · Decision, set in the site's eyebrow (mono, .28em, uppercase) on a panel strip above the window; the current stage in gold ink with the eyebrow's gold rule, the ones passed ticked, the rest muted. The film's one recurring chapter device.                                                                                                                                                               | surface, mono, gold-ink, hairline, ink-muted                                           | 05.1, 05.2, 13.1                                                                                           |
| `G-SYSTEM-MAP` · The system map         | The Command Centre as the hub, five portal windows around it (Client, Finance, Accountant, Solicitor, Builders Network), each on its own dashboard, on the site's cyan dot field. Each is joined to the hub by the site's rail line (cyan to gold), which draws in; a traveller dot runs along a line when something passes along it. Labels in the eyebrow mono on panel chips; the Builders Network window carries its own teal. Never rotates. | ground, dot-field, glass, surface, link-line, traveller, mono, gold-ink, teal-builders | 04.2, 10.1, 10.2, 12.4                                                                                     |
| `G-RECORD-CARD` · The record card       | Residence 014 · BK-014 with the image P: the object the film follows. The same card in every scene it appears in, its title in the display serif, settling on the products' ease-out.                                                                                                                                                                                                                                                             | surface-raised, border, radius-card, ink, display, sans, ease-settle                   | 06.2                                                                                                       |
| `G-LINKS` · Links                       | The site's rail line (1 px, cyan to gold) drawn from one card to another, with a traveller dot that runs it once and settles; used for the team ringing the record.                                                                                                                                                                                                                                                                               | link-line, traveller, ease-move                                                        | 06.2                                                                                                       |
| `G-DOCUMENT` · The document             | A PDF that lifts off a page as an object: its cover in front, its pages fanned behind, each the report's own page as the product prints it, with the products' deepest elevation beneath. The floor plan travels between portals as the same object.                                                                                                                                                                                              | shadow-document, ease-settle                                                           | 05.2, 08.2, 12.2, 12.3                                                                                     |
| `G-HIGHLIGHT` · The marker              | The eyebrow's 1 px gold rule, drawn under the passage the voiceover points to and under the words the professional types.                                                                                                                                                                                                                                                                                                                         | hairline, gold, ease-settle                                                            | 08.2                                                                                                       |
| `G-HAIRLINE` · The hairline             | One gold line drawn across the frame on the site's ground, with the traveller's gold glow at its leading end: the turn from today's tools to Aurixa.                                                                                                                                                                                                                                                                                              | ground, hairline, glow-gold                                                            | 04.1                                                                                                       |
| `G-EMBLEM` · The emblem build           | The supplied logo revealed in two parts: its emblem through a mask that opens from the hairline (the triangle, then the orb's glow), then its wordmark through a mask that opens letter by letter. The logo is the supplied file, never redrawn or retyped.                                                                                                                                                                                       | ground, hairline, glow-gold, ease-settle                                               | 04.1                                                                                                       |
| `G-HORIZON` · The horizon               | A gold horizon line across the lower third with the traveller's glow along it; the camera tilts down past it into the system map.                                                                                                                                                                                                                                                                                                                 | ground, gold, glow-gold                                                                | 10.1                                                                                                       |
| `G-WALL` · The wall of screens          | The film's own screens tiled at a slight angle in their glass windows, dimmed and softened by the products' strongest glass blur, drifting slowly sideways behind the Block 14 phrases.                                                                                                                                                                                                                                                           | ground, blur, shadow-window                                                            | 14.1                                                                                                       |
| `G-MAP` · The map                       | A dot-matrix map of Australia in fine ink on paper white, with one gold pin and one pulse.                                                                                                                                                                                                                                                                                                                                                        | before-paper, before-ink, gold                                                         | 01.1                                                                                                       |
| `G-LISTING` · The listing card          | A plain property-site card (no product's brand): the image P, the address line, four facts and small status chips.                                                                                                                                                                                                                                                                                                                                | before-surface, before-border, before-ink, before-ink-muted, before-type               | 01.1, 03.1                                                                                                 |
| `G-CLOCK` · The desktop clock           | A small clock in the corner of today's desktop that runs from Monday to Wednesday through Block 03.                                                                                                                                                                                                                                                                                                                                               | before-ink, before-type                                                                | 03.1                                                                                                       |
| `G-BRIDGE` · The bridges                | Dashed lines that try to join two plain document lists and break; a document dragged across by hand.                                                                                                                                                                                                                                                                                                                                              | before-ink-muted, before-border                                                        | 09.1                                                                                                       |

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

| Source     | What it is                                                                                                                                        | Used in                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `PL-01B-a` | Enquiry composer, before Send                                                                                                                     | 01.2                   |
| `PL-01B-b` | Enquiry sent                                                                                                                                      | 01.2                   |
| `PL-02A`   | Four separate unbranded windows, in the order spoken                                                                                              | 02.1                   |
| `PL-03A`   | Incoming item beside the empty report                                                                                                             | 03.1                   |
| `PL-03C`   | Jordan's conversation, still unanswered                                                                                                           | 03.1                   |
| `PL-04B-a` | Command Centre · Reports, before the selection (the supplied Reports page)                                                                        | 04.3, 12.1             |
| `PL-04B-b` | Command Centre · Reports, New Build selected                                                                                                      | 04.3                   |
| `PL-05A-a` | Command Centre · the investment report (Compass), before the click                                                                                | 05.1, 12.1             |
| `PL-05A-b` | Financial being prepared from the Compass                                                                                                         | 05.1                   |
| `PL-05C-a` | Command Centre · Generated Reports, Residence 014 under the pointer                                                                               | 05.2, 12.1             |
| `PL-05C-b` | The report's page, opened from Generated Reports                                                                                                  | 05.2                   |
| `PL-06A-a` | Client Portal dashboard, before the click                                                                                                         | 04.2, 06.2             |
| `PL-06A-b` | Client Portal · My property team                                                                                                                  | 06.2                   |
| `PL-06B-a` | The investment report with Financial prepared; the pointer on the Aurixa Agent                                                                    | 06.3                   |
| `PL-06B-b` | The Aurixa Agent open over the report                                                                                                             | 06.3                   |
| `PL-07A-a` | Alex types her change                                                                                                                             | 07.1                   |
| `PL-07A-b` | The changed note, approved                                                                                                                        | 07.1                   |
| `PL-08A-a` | Accountant Portal · Jordan Ellis's client file, Requests                                                                                          | 08.1                   |
| `PL-08A-b` | Fulfilled                                                                                                                                         | 08.1                   |
| `PL-08B`   | The client's report as delivered: its PDF in the viewer, at the cover (drawn for the working master's meeting-room display, used here on its own) | 05.2                   |
| `PL-09A`   | Two generic document lists with duplicate references                                                                                              | 09.1                   |
| `PL-09B-a` | Solicitor Portal · the matter's Overview, before the click                                                                                        | 09.2                   |
| `PL-09B-b` | Solicitor Portal · the matter's Docs                                                                                                              | 09.2                   |
| `PL-11A-a` | Campaign trial invitation                                                                                                                         | 10.2, 11.1             |
| `PL-11A-b` | CTA selected state                                                                                                                                | 11.1                   |
| `PL-11A-c` | Command Centre · Overview in the demo workspace                                                                                                   | 04.1, 04.2, 11.2, 12.1 |
| `PL-12A-a` | Builders Network · Builder / Developer Portal · Stock List, before the click                                                                      | 12.2                   |
| `PL-12A-b` | The floor plan's own tab                                                                                                                          | 12.2                   |
| `PL-12B-a` | Priya's two windows: the floor plan's PDF beside the matter's Notes                                                                               | 12.3                   |
| `PL-12B-b` | Notes saved                                                                                                                                       | 12.3                   |
| `PL-13A-a` | Finance Portal · Record finance decision                                                                                                          | 13.1                   |
| `PL-13A-b` | Decision recorded                                                                                                                                 | 13.1                   |
| `PL-14A-1` | Editorial phrase, one at a time in one clear area                                                                                                 | 14.1                   |
| `PL-14A-2` | Editorial phrase, one at a time in one clear area                                                                                                 | 14.1                   |
| `PL-14A-3` | Editorial phrase, one at a time in one clear area                                                                                                 | 14.1                   |
| `PL-14A-4` | Editorial phrase, one at a time in one clear area                                                                                                 | 14.1                   |
| `PL-15A`   | Closing card (from the start of Block 15)                                                                                                         | 15.1                   |
| `P`        | The property image, Residence 014                                                                                                                 | 01.1                   |
| `REF-LOGO` | The supplied Aurixa Systems logo                                                                                                                  | 04.1                   |

Not used in this edition: `PL-03B`, `PL-05B-a`, `PL-05B-b`, `PL-SIGN`.

### Pages still to build

| Page                                                                                  | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Built from                                                                                                                                                                                                           | Used in    |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `NEW-INBOX` · A generic inbox                                                         | Today's tools: a plain mail client with Jordan Ellis's question as the top row, and Reply.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 01.2's question; no product's brand                                                                                                                                                                                  | 02.1       |
| `NEW-NOTIFICATIONS` · Today's notifications                                           | Plain toasts from mail, chat, a calendar and a CRM, and the floor plan received for Residence 014 (PL-03A's item).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | unbranded system notifications                                                                                                                                                                                       | 03.1       |
| `NEW-MESSAGE-HUB` · Command Centre · Message Hub, Jordan Ellis's thread               | Two states. First, his question from Monday at the top and Alex Morgan's reply typed in the composer, his row in the list reading Draft; then sent, with its delivered tick, and his row moved to Today: Your Residence 014 report is ready in your portal. Let's go through it together on Thursday.                                                                                                                                                                                                                                                                                                                                                                                         | npc-client-dashboard's Message Hub (the list, the thread and its Details)                                                                                                                                            | 06.1       |
| `NEW-CLIENT-REPORTS` · Client Portal · the report and the next discussion             | Two pages. Reports: Project Banksia / Residence 014, Investment Report · Compass, New, with Download Report. My Appointments: Report walkthrough with Alex Morgan, Thu, 22 Oct 2026, 10:00 AM – 10:30 AM, Upcoming.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | npc-client-dashboard's Client Portal: its Reports and My Appointments pages                                                                                                                                          | 08.3       |
| `NEW-DASHBOARDS` · The Solicitor, Accountant, Finance and Builders Network dashboards | Each portal's home page with the demo record. Shah Legal (Priya Shah): Welcome back, Open matters, 1 active matter; Ellis: Purchase, Residence 014 in Contract review, marked Watch after 13 days in the stage. Patel & Co Accountants (Mia Patel): Good to see you, Mia, 1 allocated client; Needs you next: Jordan Ellis, purchasing entity not yet confirmed. Harbour Finance Group (Jamie Chen): Welcome back, Jamie, the agreement templates (download only), and Today: You're clear for today. Reed Constructions (Daniel Reed): Welcome back, the organisation's title block, 1 project; Recent activity and Project delivery attention, both empty. The Client Portal's is PL-06A-a. | the supplied dashboard screenshots' layout, the portals' code (npc-client-dashboard, aurixa-builders) and the plates' own sidebars                                                                                   | 04.2       |
| `NEW-REPORT-PAGES` · Investment Compass · the client's report, inside                 | The standard PDF as the product draws it for an issuer with no brand colour: white pages under the issuer's running head, in gold #D9A520 and obsidian #251F18. Its cover, the contents, The property, the summary (page 4: Executive Verdict, the purchase price and the rent, the readiness statement) and How this grade was reached (page 19: capital growth, location and rental yield scored; demand and property risk not), each on its own for the document fan, and the PDF viewer at pages 4 and 19. Every modelled page carries the illustrative-example label.                                                                                                                    | npc-client-dashboard's standard Investment PDF (investmentPdfDocument.ts, investmentPdfCover.ts, investmentPdfIssuerPage.ts, measured from a render of that code) and its grade composer (strategyPositions.pure.ts) | 05.2, 08.2 |

## How it is made

- **Compositions.** Each shot is one HTML composition at 1080 x 1920: the plate builders' own pages (scripts/aurixa-reel-1/portals.cjs, built from the products' code) placed in the graphics kit's window, with a timeline that sets every element's state at time t from the shot's beats in brief.json.
- **Rendering.** Frame by frame in Chromium (Playwright): set t = frame / 30, let the page lay out, capture, and encode at 30 fps with ffmpeg (H.264, yuv420p, high quality; an overlay with transparency as ProRes 4444). Deterministic: the same brief renders the same film, and a change to one shot re-renders only that shot.
- **Design tokens.** The kit's colours, type, radii, shadows, glass and motion come from one stylesheet written from the four Aurixa repositories' own code (see The design system, from the code), not from values picked by eye.
- **Assembly.** The 29 renders go into the studio's library and are laid out in the Editor on the voiceover's clock with the captions, the Block 14 phrases and the closing card, as the working master's edit was (scripts/aurixa-reel-1/edit.py, extended to take these shots).
- **Cost.** No generation and nothing billed by a provider; the work is building the kit, the six new pages and the compositions, then rendering.

## Review gates

1. Style frames: one still per block, at its key beat, in the final look. Approve before anything moves.
2. Animatic: the 29 shots as timed stills on the voiceover, with the captions. Approve the timing before the final renders.
3. First render: the full reel in the Editor as a draft, then shot by shot changes.

## Decisions for the client

- **Sound under the voiceover.** The pack keeps the voiceover as the only spoken track and asks whether there is a licensed score. Recommended for this edition: quiet interface sounds on presses and page changes (well under the voiceover), and either no music or a licensed bed. Which?
- **Real product footage.** If the client can record the live Command Centre on the demo workspace, those recordings can replace any composition one for one. The code-built pages are the default because they are exact, fictional and ready now.
- **The opening palette.** Blocks 01 to 03 are deliberately unbranded and light, so Block 04's turn to navy and gold reads as Aurixa arriving. The alternative is to open in the brand's navy and keep the problem in muted tones.
