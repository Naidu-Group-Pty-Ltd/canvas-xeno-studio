<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Avatar Studio lives in `src/features/avatar-studio` with its own `avatar_*` tables, jobs and provider modules; never share job/provider code with Creative Studio. Why: the verticals must fail and evolve independently.
- Avatar provider calls (HeyGen, LiveAvatar) run only in `*.server.ts` modules loaded inside server-function handlers; uncertain mutating calls become `submission_uncertain` and are never auto-retried. Why: keys stay server-side and billable work is never duplicated.
- Work that runs over more than one session is kept in the studio as it goes ([docs/work.md](docs/work.md)): carry one on with `python3 scripts/studio-work/work.py resume <id>`, start a job of more than a few steps with `work.py start "<title>" --goal "..."`, and after every meaningful step `work.py save -m "what was done" --next "what comes next"` (with `--decision "what :: why"` and `--step key=done`). Put what doesn't belong in git (frames, renders, references) in the work's own folder, `.xeno-work/<id>/files`, or a root it tracks. The hooks in `.claude/settings.json` also keep its files and code every few minutes and each turn's last words, and say when a turn is cut short. Why: a session can end at any moment (a usage limit, a reclaimed container), and what only it held is lost; Reel 1's working state was.
