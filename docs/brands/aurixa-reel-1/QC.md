# Reel 1 quality check, 21 October 2026

A sweep of every finalised asset before any clip is made: the 8 Stage 1 picks, 12 sets, 41 screen
plates and 42 frames. Nothing was generated for it. The portal plates were checked against the
supplied screenshots and against the portals' own code (`npc-client-dashboard`, read only).

## Fixed in the plates (no generation)

| What                                     | Plates                                   | Fix                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong typeface on every portal screen    | 25 portal plates                         | The portals set the system font stack (`src/styles/tokens.css`), so on Windows, where the screenshots were taken, they are Segoe UI. The plates were in Plus Jakarta Sans. They are now in Selawik, Microsoft's open stand-in for Segoe UI (built by `scripts/aurixa-reel-1/selawik.py`). |
| Wrong serif                              | Finance and Builder titles, report pages | Playfair Display Medium, the portals' brand serif (`src/branding/brand-fonts.ts`), bold as the browser makes it, as in the product.                                                                                                                                                       |
| Wrong code face                          | Builder labels and chips                 | Consolas (the portals' mono stack on Windows), drawn in Inconsolata; it was JetBrains Mono.                                                                                                                                                                                               |
| The trial card's logo wasn't good enough | PL-11A-a, PL-11A-b                       | The supplied logo, whole: its emblem, light rings, skyline and lettering, screened onto the card. The CTA reads START YOUR FREE TRIAL in the closing card's capitals.                                                                                                                     |
| The same keyed logo on the closing card  | PL-15A                                   | The same: the supplied logo, whole.                                                                                                                                                                                                                                                       |
| The floor plan overflowed its panel      | PL-12A-b                                 | Sized to the panel; later replaced by the plan's own PDF tab (below).                                                                                                                                                                                                                     |

Measured against the screenshots' own words (mean difference of the inked shapes, lower is closer):
Selawik 0.208, Hind 0.213, Open Sans 0.220, Plus Jakarta Sans (the old face) 0.264.

## Built from the products' code

Update, 21 October 2026, at the client's direction: no more screenshots are needed. The pages below are built from
the products' own code (`npc-client-dashboard`, and `aurixa-builders` for the Builders Network, both read only):
their layout, components, labels and states, in the supplied screenshots' Aurixa Systems tenant styling (blue
actions, Segoe UI). The Builders Network keeps its own look: obsidian navy, teal actions, Playfair Display headings,
Inter, mono labels and square corners on a 24 px setout grid.

| Plates     | Shows                                                                                                                                   | From the code                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| PL-05B-a/b | Jamie's purchase file: Overview, then Finance Decisions at her click (the current position and its history)                             | `FinancePortalPurchaseFileDetail`, `DealTrackerTabs`                               |
| PL-13A-a/b | Record finance decision: Subject to valuation, then Decision recorded                                                                   | `DealTrackerTabs` (the decision dialog and its toast)                              |
| PL-06A-b   | Jordan's My property team: the five roles, and what his accountant needs from him                                                       | `PortalPropertyTeam`, `PropertyTeamPanel`                                          |
| PL-08A-a/b | Mia's client file, Requests: FY2026 income statement, Mark fulfilled, then Fulfilled                                                    | `AccountantClientDetail`                                                           |
| PL-09B-a/b | Priya's matter: Overview, then Docs (its document register) at her click                                                                | `SolicitorPortalLayout`, `SolicitorMatterDetail`, `MatterDocumentsPanel`           |
| PL-12B-a/b | Priya's two windows: the floor plan's PDF, and the matter's Notes; Save notes, then the toast Matter updated                            | `SolicitorMatterDetail` (Notes tab; Open opens a file in a new tab)                |
| PL-12A-a/b | Daniel's Stock List (the Residence 014 plate: elevation and schedule, selected for a client), then his floor plan's PDF in the next tab | `BuilderPortalLayout`, `BuilderStockList`, `builder-drafting.css`                  |
| PL-05C-b   | The report's page, which a click in Generated Reports opens                                                                             | `GeneratedReports` → `InvestmentReportView` (the supplied investment report page)  |
| PL-08B     | The client's report as delivered: its PDF, at the cover Aurixa Systems issues, in the browser's PDF viewer                              | `investmentPdfCover.ts` (the issuer cover), `investmentPdfDocument.ts` (its title) |

What the code changed:

- **Scenario comparison** (05B, 13A) isn't in the purchase file, so Jamie opens Finance Decisions and records
  Subject to valuation: a neutral call, so the reel makes no finance promise.
- **Mark reviewed** (08A) doesn't exist; Mia marks the client's reply fulfilled.
- **My property team** (06A) shows five roles: the product's four (buyer's agent, finance broker, solicitor,
  accountant) and the demo project's builder beside them, as the approved dashboard counts five.
- **The floor plan is never drawn inside a portal.** The Builders Network shows only a stock item's elevation (its
  plate opens nothing), and a solicitor's document opens in the browser's own tab. So Daniel moves to his plan's PDF
  in the next tab (12A), and Priya has the PDF and the matter's Notes side by side in two windows (12B), Notes being a
  separate tab from Docs. Both show the same file, `floorplan-R014.pdf`, for the 12A to 12B match.
- **09B opens the matter's Docs** rather than the matters list: the document register is the answer to 09A's two
  duplicated document lists.
- **The client summary** (05C-b, 08B) was a white page with placeholder bars. 05C's click opens the report's page;
  the meeting display shows the report's PDF cover (the Aurixa emblem, AURIXA SYSTEMS, INVESTMENT COMPASS, the
  address and the photograph; no grade or score on it), so 08B's motion now has Alex point to it rather than bring
  a consideration into view.
- The Builder portal is drawn at the Command Centre's 125% (its stock plate's elevation is 34rem wide in the code).
- Figures: Residence 014 at $1,150,000 (the finance file's purchase price), four bedrooms and one bathroom as its
  floor plan (D) draws them.

## Screens that needed the product's real pages (resolved)

Update, 21 October 2026: the Command Centre's Generated Reports, an investment report, the agent open over it and
Overview were supplied, and 05A, 05C-a, 06B, 07A and 11A-c are rebuilt on them (the agent's mascot rendered from the
portals' own sources). Still needed: the client-facing document (05C-b, 08B) and the other portals' pages below.
With them, 13 frames can have their screens redone now (F-04A-in/out, F-04B-in/out, F-05A-in/out, F-05C-in, F-06A-in,
F-06B-in/out, F-10B-in/out, F-11A-out); 16 still wait on pages.

These plates show pages the screenshots don't cover, so their content was invented: placeholder
bars, and in two places features the product doesn't have.

| Plates                                  | Shows                                        | Page in the product                                                                               |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| PL-05C-b, PL-08B                        | The client summary (white, placeholder bars) | Command Centre, Generated Reports, a report opened: `/generated-reports/:reportId` (ReportViewer) |
| PL-05C-a, PL-06B-a/b, PL-07A-a/b (page) | Generated Reports                            | `/generated-reports` (GeneratedReports)                                                           |
| PL-06B-b, PL-07A-a/b (panel)            | Aurixa Agent with a draft                    | The agent chat, opened from the floating emblem (AgentChatWidget), with a reply drafted           |
| PL-05A-a/b                              | The analysis after New Build                 | `/investment-report/:id` (InvestmentReportView), its top and its section list                     |
| PL-11A-c                                | Demo workspace                               | `/dashboard` (Overview) in the demo workspace                                                     |
| PL-05B-a/b, PL-13A-a/b                  | Finance purchase file, "Scenario comparison" | `/finance/purchase-files/:fileId`: the Overview tab and the Finance Decisions (or Borrowing) tab  |
| PL-06A-b                                | Client, My Property Team                     | `/client/team` (PortalPropertyTeam)                                                               |
| PL-08A-a/b                              | Accountant, "Mark reviewed"                  | `/accountant` with an item in Needs you next, and `/accountant/clients/:clientId`                 |
| PL-09B-a                                | Solicitor, Matters                           | `/solicitor/matters` (SolicitorMatters)                                                           |
| PL-09B-b, PL-12B-a/b                    | Solicitor, document review and a note        | `/solicitor/matters/:matterId`: the Docs tab, and Overview with its Notes card                    |
| PL-12A-a/b                              | Builder, Stock List and a floor plan         | The Builder portal on the Builders Network: Stock List, and a stock item with its floor plan      |

Not in the product:

- **Scenario comparison** (Finance, 05B and 13A). The purchase file's tabs are Overview, Critical
  Dates, Documents, Finance Decisions, Action Items, Conditions, Valuation, Risks, Settlement Runway,
  Legal Coordination, Borrowing and more. Scenario comparison exists only in Commercial assessments.
- **Mark reviewed** (Accountant, 08A). No such button exists.

## Frame defects

| Frame                   | Defect                                                                                                                    | Severity | Fix                                                      | Outcome                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F-05C-out               | The camera moved: the monitor shrinks and slides left (difference 16.1; the other five after-click frames are 1.9 to 3.4) | High     | Redo from F-05C-in with only the screen changed          | Fixed: made again from F-05C-in with only the screen changed (r2-take2, drift 2.3)                                     |
| F-04A-in → F-04A-out    | The AURIXA sign jumps from left of the door frame to above the desk on the right in a 5 s move                            | High     | Redo F-04A-out with the sign where F-04A-in has it       | Fixed: no sign in F-04A-out, the foreground door frame hides it (r3-take2)                                             |
| F-08B-in, F-08B-out     | The client summary display runs off the right edge; its content is placeholder bars                                       | Medium   | With the real report page, keep the display inside frame | Fixed: reframed from the approved takes so the whole display fits, with the report's PDF in its viewer (r3-take1 each) |
| F-02A-out → F-03A-in    | The pack's matched cut (screen layout, perspective and desk fixed) is a much closer angle                                 | Medium   | Redo F-03A-in at F-02A-out's framing, or accept as a cut | Accepted as a cut                                                                                                      |
| F-10B-in                | Alex smiles into the lens: the pack's "subtle welcome", but against the 03B direction                                     | Decision | Your call                                                | Kept, awaiting your call                                                                                               |
| F-13A-out               | The pen lies between Jamie's fingers                                                                                      | Low      | Optional                                                 | Left as it is                                                                                                          |
| F-04B-out, F-05A-in/out | Nearly the same framing (05A was meant to be a tight insert); plays as one continuous move                                | Low      | Accept                                                   | Accepted                                                                                                               |
| F-10A-in                | Priya's monitor, at the edge, is blank blue where 09B showed the Solicitor portal                                         | Low      | Accept                                                   | Accepted                                                                                                               |

Hands, faces, likeness and screen text were checked at full resolution; nothing else was found.
Stage 1 (P, D, the six cast sheets) and Stage 2 (CW-9, CW-10, the ten sets) have no defects.

## What the plate changes mean for the frames

Update, 21 October 2026: done. All 29 frames whose plates changed have their screens redone, and every one of the
42 frames' picks is of its current revision. 26 are screen swaps or after-click frames made from their swapped first
frames; F-04A-out was made again without the sign; F-08B-in and F-08B-out were reframed. Where a take dropped what a
plate shows (06B-in's agent button behind the lamp; 12A-out's and 08B's PDF viewer, the page stretched to fill the
screen), its prompt now names what to keep and it was made again. Outside the screens, the swaps drift 2 to 4 on a
255 scale from the approved frames.

The frames carry their screens, so a frame whose plate changed needs its screen redone. The
proposal is a screen swap: the approved frame and the new plate in, everything but the screen kept.

- **Ready now (fonts or the logo only), 8:** F-04A-in, F-04A-out, F-04B-in, F-04B-out, F-06A-in,
  F-10B-in, F-10B-out, F-11A-out.
- **After the product's pages, 21:** F-05A-in/out, F-05B-in/out, F-05C-in/out, F-06A-out,
  F-06B-in/out, F-08A-in/out, F-08B-in/out, F-09B-in/out, F-12A-in/out, F-12B-in/out, F-13A-in/out.
- **Unchanged, 13:** F-01A-in, F-01B-in/out, F-02A-in/out, F-03A-in, F-03B-in, F-03C-in/out,
  F-09A-in/out, F-10A-in/out (their screens are the generic ones, or none).

The generic screens (01B, 02A, 03A to 03C, 09A) are unbranded on purpose and were left as they are;
some show placeholder lines and wide empty windows, which could be filled with real text if wanted
(that would redo their frames too).

## Clips, first pass (Cinema Studio 4.0, cinema-take1)

One take of each clip, made on Cinema Studio 4.0 in the studio (21 October 2026). Each was sent as the studio's own long
videos send that model: the approved first frame as reference image 1 with the line that says the clip starts on it,
the cast's sheet views named in the characters line, and the approved last frame last with the line that says the
clip ends on it; 9:16, 720p, no sound, single-shot pacing. Every take comes back 720 x 1280 at 24 fps, silent, and
0.04 s longer than asked.

15 of the 24 are made. The other 9 (09A, 09B, 10A, 10B, 11A, 12A, 12B, 13A, 15A) were refused by Higgsfield for its
balance (`not_enough_credits`), so nothing of them was made or billed (US$26.87 at the studio's estimate); the draft
edit holds their places with their approved frames, labelled STAND-IN, until they are made.

Each made take was checked frame by frame: none has a cut in it (no frame-to-frame change in any take is above 17 on a 0 to 255 scale, where a cut is several times that), the larger jumps in the nearly still takes are their screens changing, and each starts on its first frame and ends on its last, where it has one.

| Clip | What the take does                                                                                     | In the draft edit                                                          |
| ---- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 01A  | Moves out from behind the gum, then dissolves (3.1 to 3.9 s) into P rather than moving to it: a morph  | Middle of the take; the dissolve shows. To review                          |
| 01B  | From the laptop close-up out to Jordan at his desk, the enquiry sent                                   | Middle of the take                                                         |
| 02A  | Alex at the four windows, nearly still                                                                 | Middle of the take                                                         |
| 03A  | The incoming card turns from Floor plan received to Floor plan confirmed at 3.0 s, which no frame asks | From 0 s at 0.88x speed, so the shot ends before it (2.93 s of the take)   |
| 03B  | The message becomes a document at 3.83 s, which no frame asks for                                      | From 1.0 s, ending at 3.6 s                                                |
| 03C  | Jordan rests his hands; the mullion drifts across                                                      | Middle of the take                                                         |
| 04A  | Tracks past the gold doorway to Alex and the colleague with the plan                                   | Middle of the take                                                         |
| 04B  | One continuous push-in to the screen and the New Build selection                                       | Middle of the take                                                         |
| 05A  | Nearly still; the click                                                                                | Middle of the take                                                         |
| 05B  | Jamie clicks at 0.54 s, early                                                                          | From 0.27 s, so the click is in the shot                                   |
| 05C  | Generated Reports to the report's page at 1.9 s                                                        | Middle of the take                                                         |
| 06A  | From the laptop out to Jordan; My property team opens                                                  | Middle of the take                                                         |
| 06B  | The Aurixa Agent opens at 6.6 s rather than on the first click                                         | 06B from 2.1 s, so 07A (cut from the same take) carries 2.4 s of the agent |
| 08A  | Mia marks the request fulfilled; the camera finds the notepad                                          | Middle of the take                                                         |
| 08B  | Alex's gesture to the display is larger than the open gesture asked for; the display holds             | Middle of the take                                                         |
