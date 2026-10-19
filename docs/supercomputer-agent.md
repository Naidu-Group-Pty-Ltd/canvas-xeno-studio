# The Supercomputer agent

With Claude connected, the Supercomputer works as an agent: it thinks a request through, looks
things up (the library, the models, the team's characters and brands, the web), makes images and
videos, looks at what came back and refines it, and writes scripts and plans beside the
conversation. Everything it does is shown as it happens, and nothing that spends Higgsfield credits
runs without a person's say-so, unless the conversation allows it up to an amount.

Without it, the Supercomputer keeps its one-answer mode (ideas and ready-to-run drafts from the
studio's own AI), and every conversation from before stays readable.

## Setup

1. An admin adds an `ANTHROPIC_API_KEY` backend secret.
2. An admin applies migration `drizzle/migrations/0022_supercomputer_agent.sql`, after 0020 and
   0021 (migrations go in order). It adds a conversation's settings and pin, the states an answer
   can be in (streaming, waiting for an approval, stopped), and the memories table.

The page switches over by itself once both are in. Until then admins see a note on the page
saying what is missing (it can be hidden).

## In a conversation

- **Models.** Claude Opus 5.5 (the default), Sonnet 5.5 or Haiku 5.5, chosen per conversation,
  with how hard it thinks (Quick to Maximum, Thorough by default). A new conversation starts with
  the last model and effort chosen in that browser. On Opus and Sonnet, server-side fallback is on:
  if the model is overloaded, another Claude model answers, and the answer shows which one did.
- **What it shows.** Its thinking (folded, summarised), its words in markdown, every tool call with
  what it was asked and what came back, web searches with their sources, and what it made: pictures
  and videos as they finish, documents, brand imports, characters, edits and memories.
- **Spending.** A call that spends credits (a generation, a Soul ID still or training, a presenter
  video, continuing a long video, redoing a clip) waits as a card showing what it would do and the
  provider's estimate. Approve or Decline; Approve all when several wait at once. The answer then
  carries on from where it was. The coin button lets a conversation go ahead on its own with
  actions up to $0.50 to $10 each (never more than $25); anything without an estimate always asks.
  Sending a new message instead declines what was waiting.
- **Editing and redoing.** Editing an earlier message replaces it and everything after it, and the
  conversation picks up from there. Try again gives a fresh answer to the last message. The
  replaced messages are kept in the database but are no longer part of the conversation.
- **Stopping.** The stop button or Esc stops an answer part-way. An answer can also be stopped from
  another page or tab: the server notices within a few seconds. Closing the page stops the answer
  too.
- **Context.** A conversation's project, campaign, brief and brand go with every message: in full
  when they are new to the conversation, and the memories with its first message.
- **Made here.** The documents a conversation wrote (to read, copy, or download as markdown) and
  everything it generated, in one panel.
- **Memory.** What it keeps between conversations: a person's own preferences, or the team's. It
  keeps them itself when asked ("remember that…") and they can be added and forgotten by hand
  (Memory, top right). Only whoever kept a memory, or an admin, can forget it.
- **Slash commands.** `/make`, `/brainstorm`, `/drafts`, `/film`, `/research`, `/critique`,
  `/script`, `/brand` and `/remember` start a message.

Anyone on the team can read a conversation (Team in the sidebar); only whoever started it, or an
admin, can continue it. Chats can be pinned to the top.

## What it can use

| Tools                       | What they do                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_models`, `get_model`  | The generation models, compactly, then one in full.                                                                                                  |
| `estimate_generation`       | The provider's price for a generation, without making it.                                                                                            |
| `queue_generation`          | Makes an image, video or audio (asks first), with references, characters (their Soul IDs on Soul models) and the conversation's brand.               |
| `wait_for_generation`       | Waits up to two and a half minutes for one to finish.                                                                                                |
| `view_media`                | Looks at library files (videos by their poster frame), up to six at once.                                                                            |
| `propose_drafts`            | Ready-to-run drafts, ideas and an edit plan for the person to look over and run themselves.                                                          |
| `write_document`            | A script, shot list, plan or report shown beside the conversation.                                                                                   |
| `import_brand`              | Reads a brand's design system from its website, for review on the Brand page.                                                                        |
| `remember`, `forget`        | Memories kept between conversations.                                                                                                                 |
| `web_search`, `web_fetch`   | Searches the web and reads pages.                                                                                                                    |
| The studio API's operations | The library, generations, long videos, characters and Soul IDs, brand kits, presenter videos, edits and renders (docs/studio-api.md), as the person. |

A turn takes at most 32 steps (it says so and stops; "go on" continues it), and each step writes
at most 32,000 tokens.

## For developers

The page talks to `POST /api/public/supercomputer-agent` with the person's session
(`Authorization: Bearer <Supabase access token>`) and reads a `text/event-stream` back. The body:

| Field                                | Meaning                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `threadId`                           | The conversation (left out or null: a new one).                                          |
| `text`                               | The message.                                                                             |
| `attachmentAssetIds`                 | Up to 16 library files.                                                                  |
| `projectId`, `campaignId`, `briefId` | The conversation's context (left out: it keeps its own).                                 |
| `settings`                           | `{model, effort, autoApproveUsd, brandKitId}`, any of them; kept with the conversation.  |
| `editMessageId`                      | An earlier message of the person's that this one replaces.                               |
| `regenerate`                         | `true`: a fresh answer to the last message.                                              |
| `approval`                           | `{messageId, decisions: {<tool use id>: "approve" or "deny"}}` for an answer that waits. |

Each event is a JSON object (`src/lib/supercomputer/agent-events.ts`): `turn` first (the
conversation and the message ids), then `block`, `text`, `thinking`, `update`, `end` and `drop` to
build what is shown, `model`, `usage` and `title` as they happen, and `status` (`streaming`,
`awaiting_approval`, `complete`, `stopped` or `failed`) last. The same picture is saved with the
answer, so a page opened later shows exactly what streamed. Each answer also keeps its transcript
as Claude wrote it, which the page doesn't read; pictures in it are kept as references to the
library and signed again for each request.

The loop is `src/lib/supercomputer/agent-loop.server.ts`, its tools
`agent-tools.server.ts`, and the endpoint `agent-turn.server.ts`.
