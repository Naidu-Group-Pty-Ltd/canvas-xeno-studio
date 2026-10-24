# Work in progress, picked up from anywhere

A job that runs over many sessions (a reel, a campaign, a brand's launch) is a **work**. The
studio keeps it as it goes, so whoever picks it up next carries on from where the last one
stopped: another Claude Code session on any machine or account, the Supercomputer, or a person
in the app.

A session can end at any moment. A usage limit cuts a turn short, a cloud container is
reclaimed, a laptop is closed. Whatever only that session held is gone with it. A work moves that
state into the studio while the session runs, not at the end.

## Why: what happened to Reel 1

Reel 1 was made in a Claude Code cloud session, and almost everything about it lived only in that
session's container:

- the assets folder, the renders and their lossless references;
- `film.json` and the soundtrack;
- the spec and takes not yet committed;
- the decisions behind them.

The studio saw only the generations, and those were filed under no project
(`unassigned/<user>/outputs/…`). Its API had no way to make a project, and nothing to record a job,
a checkpoint or a file. What survived was what had been committed to git (HANDOVER §1.10) and the
master, copied to Google Drive by hand. When the container went, the rest went with it, and shot
12.1 had to be rebuilt from the studio's outputs.

Had a usage limit stopped that session halfway, nothing would have recorded where it stood.

## What a work keeps

| Part    | What it is                                                                                                                                                                                                                                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal    | What it is for, and what finished looks like.                                                                                                                                                                                                                                                                                                                         |
| Plan    | Steps by key (`plates`, `12.1`), each with a title, a status (todo, doing, done, blocked, skipped) and a note.                                                                                                                                                                                                                                                        |
| Journal | Every entry, in order and never changed: what was done, what comes next, what was decided and why, the questions waiting on a person, and who wrote it (which session, for which member). An entry's kind says how it came: a save, an automatic save, a turn's end, a turn cut short, a note, a link, a session taking the work up, taking it over or letting it go. |
| Record  | The work's own JSON (shots, takes, settings), changed by merge patch and versioned. A change made from an old version is refused as a conflict.                                                                                                                                                                                                                       |
| Files   | Every version of every file, under named roots (`records/spec.json`, `work/renders/12.1.mp4`). Each file is cut into parts of 32 MiB, each part stored once a work by its SHA-256 in the private `work-files` bucket, sent straight to storage and checked there.                                                                                                     |
| Code    | The repository, branch and commit it last ran on, whether it had changes not committed, and how many of its commits no remote held. From Claude Code, those commits as a git bundle and the changes as a patch.                                                                                                                                                       |
| Links   | What it made or used in the studio: generations, library files, edits, renders, long videos, review gates, storyboards, briefs, characters, brand kits, motion graphics, conversations, other works.                                                                                                                                                                  |
| Hold    | The session working on it now. Every save renews it; one not renewed lapses (30 minutes for Claude Code, 15 by default), so a session that ends without a word frees its work.                                                                                                                                                                                        |
| Brief   | All of the above in Markdown, written for whoever picks it up: `get_work`, the Work page, and what a resuming session prints.                                                                                                                                                                                                                                         |

A work goes in a project of its own, named after it, unless one is named. Every API operation
that makes something takes a `workId`: what it makes goes in the work's project and is attached
to the work. Nothing is left unassigned.

A save is one transaction (`work_save`). Its entry, its plan and record changes, its files, links
and changes to the work are kept together or not at all. The same `clientRequestId` returns the
first save, so a retry never keeps anything twice. A save is never refused because another
session holds the work: it is kept, and the answer says who holds it.

## Claude Code: `scripts/studio-work/work.py`

One script, standard library only, run from this repository:

```sh
python3 scripts/studio-work/work.py list                      # work in progress, and who is on it
python3 scripts/studio-work/work.py start "Aurixa Reel 2" --goal "A 30-second reel" \
  --root records=docs/brands/aurixa-reel-2 --step plates="Make the plates" --save-now
python3 scripts/studio-work/work.py save -m "Plates made: 11 of 11." --next "Animatic" \
  --decision "Seedream for the plates :: cheaper and sharper" --step plates=done
python3 scripts/studio-work/work.py resume <work id, or words of its title>
python3 scripts/studio-work/work.py status | pull | push | note -m … | link <kind> <id> | track name=folder
python3 scripts/studio-work/work.py restore-code [--here]
python3 scripts/studio-work/work.py release -m "Stopping here: the animatic is next."
```

A work's files sit under its **roots**: names for folders (`records=docs/brands/aurixa-reel-2`),
and `work`, a folder of its own at `.xeno-work/<id>/files` for what doesn't belong in git (frames,
renders, references). `.xeno-work/` is ignored by git. A checkout is on one work at a time: `start`
and `resume` put it on one, `release` and finishing take it off.

### The hooks

`.claude/settings.json` runs the script by itself, in every Claude Code session on this
repository, cloud sessions included. Each hook exits cleanly whatever happens. The ones that run
while the session works save in a process of their own, so the session never waits for them; only
its start (a few seconds at most) and its end wait for the studio. `XENO_WORK_HOOKS=0` turns them
off.

| Event                                                | What it does                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SessionStart                                         | On a checkout that is on a work: takes it up again and prints its brief into the session's context. On one that isn't: lists the work in progress, with how to carry one on.                                                                               |
| PostToolUse (Bash, Write, Edit, MultiEdit, Notebook) | Every three minutes at most, an automatic save in the background: the files that changed and the code. With nothing changed, the hold is renewed and nothing is written.                                                                                   |
| Stop                                                 | The turn's last words, and the tools it used, saved as a `turn` entry with its files and code.                                                                                                                                                             |
| StopFailure                                          | A turn cut short (a usage limit, an outage, an error): an `interrupted` entry with the error, what the turn had been asked, what it said last and the tools it used, read from the session's transcript. Its files and code are saved and the work let go. |
| PreCompact                                           | An automatic save before the context is compacted.                                                                                                                                                                                                         |
| SessionEnd                                           | One last save, then the hold let go.                                                                                                                                                                                                                       |

The hooks save what changed. Say what was done, what comes next and what was decided after every
meaningful step with `work.py save`: the journal's words are what lets the next session carry on
rather than start again. `AGENTS.md` asks every session to.

### The code

Every save keeps the code as it stands under `work/code/`:

- `commits.bundle`: the commits no remote holds yet (all of them where there is no remote);
- `uncommitted.patch`: every change not committed, staged or not, with the files git doesn't
  ignore and doesn't track (up to 64 MB each; larger ones are named, not kept), outside the
  work's own roots, whose files are kept as the work's;
- `state.json`: the branch, the commit, and what the other two hold.

The patch is made in an index and an object store of the script's own, so the checkout's are never
touched.

`resume` puts the code back wherever that disturbs nothing, which means the checkout has no
changes of its own and one of these holds:

- it already has the work's commit: the patch is applied;
- it is on the work's branch, behind it: the branch is fast-forwarded;
- it is a fresh checkout of the default branch: the work's branch is checked out at its commit, and
  the default branch is left as it was;
- it is on a branch just made from the default branch, with no commits of its own (as a cloud
  session starts): the work's commits are brought onto it, by fast-forward or a merge, so they keep
  who they are and pushing the branch pushes them.

Otherwise it says how. `restore-code` checks out the work's branch at its commit and applies the
patch; `restore-code --here` merges the work's commits into the branch you are on, then applies the
patch.

A checkout that hasn't taken up the work's code never replaces it. Until `restore-code` puts it
there, or `restore-code --mine` says this checkout's code is the work's now, saves from it keep
their files and words but leave the work's code as it was, and say so.

### What happens when

- **A usage limit cuts a turn short.** StopFailure keeps the files and code as they stood, an
  account of the turn from its transcript, and lets the work go. The next session, here or
  anywhere, takes it up without having to take it over.
- **The container is reclaimed without a word.** What changed since the last save is lost: at most
  the three minutes since the last automatic save, and the turn in progress. The hold lapses half
  an hour after it was last renewed, and the next session takes the work up.
- **The studio can't be reached.** A save's words are kept on the machine (`outbox/`) and sent,
  oldest first, by the next save that reaches it, saying they arrived late. Changed files are found
  again by the next save.
- **Another session holds the work.** `resume` says who, and when they were last heard from.
  `--take-over` takes it, and the journal says so. `--read-only` puts its files back without
  taking it.
- **A file changed here and in the studio.** Pull keeps this machine's and puts the studio's beside
  it, as `name.studio-v<version>`. A file unchanged here since it was last kept is brought up to
  date, and one the studio deleted goes.
- **The code is on a branch with work of its own.** `resume` leaves it and says how to bring the
  work's over; the work keeps its code meanwhile.

Every part and every file is checked against its SHA-256 on the way back, and storage checks each
part's size (and MD5 where it gives one) before a save may name it.

### Long jobs, other machines, and review gates

What Reel 2 taught about keeping a work while it waits on something long:

- **A long job is run under the work.** While a session waits on a job it runs no tool and so no
  hook, and Reel 2's renders outlived the 30-minute hold several times.
  `work.py run -m "Drawing the film" -- <command>` does three things:
  - it renews the hold every ten minutes while the job runs;
  - it keeps the work's files every few minutes, so what the job writes into the work's folder is
    kept as it goes;
  - when the job ends, it saves a journal entry saying what ran and how it ended.

  Its exit code is the job's. Run it in the background like the job itself.

- **Another machine can draw a part.** A helper session never resumes the work. It pulls only what
  it needs (`work.py pull --work <id> --only work/assets`) and keeps its part in a work of its own
  (`work.py start "<part>" --parent <id>`). The session that joins the parts pulls them back from
  there, and the helper marks its work done (`work.py save --work <its id> --status done`), so it
  leaves the list of work in progress. Reel 2's four helpers each also drew three frames already
  drawn here. Their frames agreed with this machine's to within 3 code values, so one renderer
  drew the whole film, whichever machine drew each scene.
- **A review gate is posted from here.**
  - `work.py gate post <gate> --note-file note.txt "Title=file" ...` imports each picture and
    video into the project's library and adds them as the gate's next version. `--add` makes the
    gate if the project has none of that name.
  - A video over the library's 50 MB upload goes as a review copy that fits (two-pass x264,
    BT.709, AAC), made once and kept in the work's folder. Reel 2's 147 MB master went to its Film
    gate as a 46 MB copy.
  - `work.py gate decide <gate> approved|changes_requested --note ...` records a decision on the
    latest version, and `work.py gate list` shows each gate and its versions.
  - Each request is named by what it sends, so running one again returns the first answer.

### Local state

`.xeno-work/<id>/` holds `work.json` (the work's roots and whether this checkout is on it),
`index.json` (each file's size, time and SHA-256, so a save only reads what changed), `outbox/`,
`turns/` (a turn's words on their way), and `log.txt` (what the background saves said).

| Variable                     | Default                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `XENO_STUDIO_URL`            | `https://canvas-xeno-studio.lovable.app`                      |
| `XENO_STUDIO_TOKEN`          | A personal token (read and edit), unless the network adds one |
| `XENO_WORK_HOOKS`            | `1`; `0` turns the hooks off                                  |
| `XENO_WORK_CODE`             | `1`; `0` keeps no code with saves                             |
| `XENO_WORK_AUTOSAVE_SECONDS` | `180`: the most often a tool's use starts an automatic save   |
| `XENO_WORK_MAX_FILE_BYTES`   | 20 GB: larger files are named and left out                    |
| `XENO_WORK_RENEW_SECONDS`    | `600`: how often `run` renews the hold while its job runs     |

## The Supercomputer

A conversation can be on a work (Continue in Supercomputer on the Work page, or the agent's own
`start_work`). Its first message is told the work's brief, and later ones what other sessions or
people wrote since. It holds the work for each turn, and every turn's end goes in the journal (cut
short or failed, as `interrupted`). Whatever it makes is attached to the work. It saves its own
account with `save_work` as it goes.

## The studio's API and MCP

`start_work`, `list_works`, `get_work`, `claim_work` (with `renew` for a heartbeat that never takes
a hold), `release_work`, `save_work`, `upload_work_files`, `get_work_files`,
`get_work_file_history`, `attach_to_work` and `create_project`: see
[studio-api.md](studio-api.md#work-in-progress). Any client can keep a work: these are what
`work.py` uses.

## People

The **Work in progress** page lists every work: who is on it, its plan's progress, what was last
done and what comes next. A work's page shows its journal (live), plan, notes, files with every
version, what it made in the studio, its record and its brief. From there a person can change a
step or the status, write a note, answer what waits on them, let go of a stuck hold, continue it in
the Supercomputer, or copy what to tell Claude Code. A project's page lists its works too.

## Limits

- The hooks run where Claude Code runs this repository's settings. A session in another
  repository needs the script and the hooks copied there.
- A turn's words are its last message, and a turn cut short is read from its transcript. A
  session's own saves say more, which is why it is asked for them.
- Session transcripts aren't kept: they can hold secrets. The journal names each session, with its
  web address for a cloud one.
- The Supercomputer reads a work's brief and journal; it doesn't fetch its files.

## Setting it up

1. An admin applies `drizzle/migrations/0037_work_journal.sql`: the tables, the functions and the
   private `work-files` bucket. Until then every work operation says it needs it.
2. A token with the `read` and `edit` scopes (Settings → API access) in `XENO_STUDIO_TOKEN`, for
   machines the network doesn't add one for.

## Tests

- `tests/sql/work.sql` checks the migration's functions on a real Postgres 16, built as the live
  database is (`scripts/db/scratch.sh`): saves, conflicts, holds, heartbeats, files, links and who
  may read and write.
- `tests/work/cli.test.ts` runs the script against the studio's own API code over HTTP, with two
  checkouts standing for two machines: a work started, saved, cut short by a usage limit, and
  carried on elsewhere from exactly there, its unpushed commit and its changes not committed
  included; and a long job run under the work, its hold renewed and its files kept as it runs.
- `tests/work/gate.test.ts` posts a version to a review gate, a video over the upload limit as a
  review copy the real ffmpeg makes, then decides on it and lists the gates.
