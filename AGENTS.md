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
