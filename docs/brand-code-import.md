# A design system read from code

A brand kit can be imported from the brand's **code** as well as from its website or its guidelines.
Name the GitHub repositories the brand is built in, and the studio reads their styling code together.
It reads the code as text and never runs it. The result is a design system in which every value
says where it is declared:

> `#C89B3C` is `--color-prism-magenta` in aurixa-systems `src/index.css:18`, `colors.brand` in
> aurixa-builders `tailwind.config.ts:61` and `AURIXA_PALETTE.gold` in aurixa-mission-control-12b89885
> `src/lib/brand/aurixa-brand.ts:50`.

Code shows a brand's colours, type and scales exactly. It doesn't show the look of the brand's
pictures or its voice. So a kit read from code updates the colours and type of a kit read from the
website, and keeps that kit's look, voice and rules.

## Where

- **Brand page → Import a design system → Code.** List up to six repositories, one a line
  (`owner/name`, a GitHub address, or an address into a branch and folder such as
  `github.com/acme/mono/tree/main/apps/web`). The first is the brand's own source: where the
  repositories disagree, its names and values lead. The review then has a **Code** tab:
  - the repositories and the commits read;
  - every colour with its tokens, each linked to the line on GitHub;
  - the typefaces and how each loads;
  - the radius, shadow, motion, blur and gradient scales;
  - where the repositories disagree.

  It downloads the tokens as `tokens.css` or the whole reading as JSON.

- **The Supercomputer agent**: `import_brand_code` runs the same import, for review on the Brand
  page.
- **The studio API**: `read_brand_code` answers with the design system, and with `includeCss` its
  `tokens.css`, without keeping anything (docs/studio-api.md).
- **The command line**: `bun scripts/brand/scan-repos.ts owner/repo[=checkout] … --out <dir>` reads
  from GitHub or from local checkouts. It writes `design-system.json` and `tokens.css`.

## Private repositories

GitHub is reached at `api.github.com` and `raw.githubusercontent.com` only, at addresses built from
a checked owner, repository and path, and redirects are never followed. A token therefore can't be
carried anywhere else.

Public repositories need no token. A private one needs a token that can read its contents (a
fine-grained token with **Contents: read** on those repositories). It can be given two ways:

- as the studio's `GITHUB_TOKEN` secret, used for every code import;
- in the import's token field, used for that one scan and never kept.

With a token, files are read through the contents API (5,000 reads an hour). Without one they come
from raw.githubusercontent.com, so GitHub's limit of 60 API reads an hour falls only on listing
each repository.

## What is read

Each repository's file tree is listed at one commit. The most telling styling files are then read,
within a budget of 40 files and 3 MB a repository and 600 KB a file:

1. the shadcn config (`components.json`), which names the theme's stylesheet;
2. the Tailwind config;
3. `package.json`, for the fonts it installs, its Tailwind version and its `homepage`;
4. entry stylesheets (`index.css`, `globals.css`…), then those named for tokens or themes, then the
   others;
5. design-token JSON (DTCG and Style Dictionary);
6. `index.html` and an app's entry module or root route (`src/main.tsx`, TanStack's
   `routes/__root.tsx`, Next's `app/layout.tsx`), for the fonts it loads (Google Fonts links,
   `next/font`, `@fontsource` imports with their weights) and the site's name;
7. theme modules named for it (`theme.ts`, `aurixa-brand.ts`, `brand-defaults.ts`), for their
   literal colours and fonts;
8. the web manifest, and up to four logo files, which are staged for the review.

A second round reads the stylesheets those files import, including ones in folders the planner
passes over. The planner never reads:

- build output and dependencies;
- tests, fixtures and documentation;
- tooling folders (`scripts`, `supabase`, any dot folder);
- minified files.

It also never offers an email signature, a share card or another company's logo as the brand's
logo.

Custom properties are read for every scheme:

- Tailwind 4's `@theme` and `@theme inline`;
- shadcn's bare HSL channels, read through `hsl(var(--x))`;
- `oklch`;
- `:root`, `.dark`, `.light`, `[data-palette='dark']` and `:root:not(.dark)`.

A `@theme` alias resolves to the root's own value. SCSS and Less variables are read through one
another.

## How colours are weighed

Each repository is one vote, and the brand's own counts twice. A repository's say is shared out
among its colours, so a product with a thousand tokens and a site with fifty count the same. Within
a repository:

| Rule                                                                                      | Weight            |
| ----------------------------------------------------------------------------------------- | ----------------- |
| A token named for its job in the brand (`primary`, `brand`, `accent`…)                    | 3 times           |
| A token named for its job in the interface (a warning, a chart series, a border, a ring…) | 0.4 times         |
| A token set inside one component (`.passport { … }`)                                      | 0.35 times        |
| A dark-scheme token                                                                       | 0.75 times        |
| A token that only points at another (`var(--x)`)                                          | 0.3 times         |
| A colour written out in the code                                                          | `2·log2(1+count)` |

A written-out colour counts no more than its token's name allows: a warning's yellow written eighty
times is still a warning's.

Codes within ΔE 2.5 of each other are folded into one colour. This catches a palette converted to
HSL and back, which drifts by a step. A colour several repositories agree on counts 50% more for
each repository beyond the first.

Typefaces are held to how code writes one: quoted, a stack, or a capitalised name. So
`fontFamily: "aurixa-sans"`, a setting's key, or `"Aurixa — Inter"`, a label, is not taken for a
typeface.

## What is kept

The import keeps the whole reading as its `code`: the repositories and commits, the colours with
their tokens, the typefaces, the scales, the disagreements and up to 1,500 tokens. Lists of imports
don't load it. Keeping the import as a kit records it as the kit's source (`kind: "repos"`). Its
**Re-read** button then reads the same repositories again.

The AI reads the code's own reading (`codeEvidenceText`) and the raster logos. It answers with the
palette, held to the colours found, and with the typefaces. From code, it says what the brand's
graphics are made of (corners, glass, gradients, shadows), and nothing about photography or
lighting.

Updating a kit from code works like this:

- The palette and the type come from the code.
- What its graphics are made of comes from the code too.
- The kit's look, voice, rules, style line and style references stay as they are.
- Anything the kit leaves empty is filled from the reading.
- The kit keeps its own logo unless one found in the code is picked.

Needs migration `0026_brand_code_imports`, which allows the `repos` import kind and adds
`brand_imports.code`. Without it, importing from code says so, and nothing else changes.

## From code to production

The review of a code import has a **Production** tab: the roles the brand's graphics are drawn in,
each read from a token in the code, with the repository, file and line it is declared on. Reel 1
needed a script for this step (`scripts/aurixa-reel-1/reel_css.ts`); this is it in the studio.

| Kind    | Roles                                                                                      |
| ------- | ------------------------------------------------------------------------------------------ |
| Colour  | ground, surface, raised, glass, ink, muted ink, accent, signature, line, selection, danger |
| Type    | display, display italic, body, mono, eyebrow                                               |
| Corners | window, card                                                                               |
| Shadows | window, lift                                                                               |
| Blur    | glass, backdrop                                                                            |
| Motion  | move, settle, enter, exit, press: each an easing curve (cubic-bezier) and a duration       |

Each role is proposed from the tokens' names (`--color-base-950` is a ground, `--motion-ease-out`
a settle), their values (a ground is near black in a dark brand, glass is translucent, ink reads on
the ground) and how much the code uses them, the brand's own repository and its own theme first.
The review shows why each was proposed and the other candidates the code holds; a person can pick
another or set any value by hand, and one set by hand says so. Selection, danger, mono and the
eyebrow are proposed only when the code names them.

Four checks sit above the roles:

- every role filled (selection, danger, glass, mono, eyebrow and the lift shadow and blurs only if
  the brand uses them);
- the ink's WCAG contrast on the ground and on the surface (AA, 4.5:1), and on the rest;
- each face loaded, by the brand's code or as one of the kit's own font files;
- every value the repositories disagree on decided: the value production uses, and a note why.

It downloads as a stylesheet of `--brand-*` custom properties (each with its source in a comment,
the checks and the decisions in its header, as `aurixa-reel.css` has), as JSON, and as a token
sheet drawn in the browser. The roles are kept on the kit (`production`, migration
`0029_brand_production`): the kit editor has the same panel, `get_brand_kit` returns them, and
`src/lib/brand/production.ts` writes the stylesheet for compositions (`productionStylesheet`,
`productionTokens`). Without the migration, kits read with none, and saving some says so.

The motion roles move titles too: applying the kit in the Editor gives its titles the enter and
exit curves and durations (`src/lib/edit/overlay-motion.ts`). A title rises into place on the
enter curve and lifts away on the exit curve; the preview and the render draw it the same, frame
by frame (the media worker's `overlay_motion`).

The code lives in `src/lib/brand/`:

- `scan-code.ts`: planning, reading and merging;
- `scan-css.ts`, `scan-tailwind.ts` and `scan-tokens.ts`: the readers;
- `scan-repos.ts`: the steps over any source of files;
- `github-source.ts`: GitHub;
- `imports.server.ts`: the import itself;
- `production.ts`: the production roles, their checks and the stylesheet;
- `production-proposal.ts`: how the roles are proposed from what was read;
- `motion.ts`: easing curves and durations as code writes them.

Tests are in `tests/brand/scan-code.test.ts`, `tests/brand/scan-repos.test.ts` and
`tests/brand/production.test.ts` (which reads Reel 1's own record back through the scanner), and
`tests/edit/overlay-motion.test.ts` for titles.
