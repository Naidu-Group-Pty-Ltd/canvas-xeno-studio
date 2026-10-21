# A design system read from code

A brand kit can be imported from the brand's **code** as well as from its website or its guidelines.
Name the GitHub repositories the brand is built in, and the studio reads their styling code together.
It reads the code as text and never runs it. The result is a design system in which every value
says where it is declared:

> `#C89B3C` is `--color-prism-magenta` in aurixa-systems `src/index.css:18`, `colors.brand` in
> aurixa-builders `tailwind.config.ts:61` and `AURIXA_PALETTE.gold` in aurixa-mission-control
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

The code lives in `src/lib/brand/`:

- `scan-code.ts`: planning, reading and merging;
- `scan-css.ts`, `scan-tailwind.ts` and `scan-tokens.ts`: the readers;
- `scan-repos.ts`: the steps over any source of files;
- `github-source.ts`: GitHub;
- `imports.server.ts`: the import itself.

Tests are in `tests/brand/scan-code.test.ts` and `tests/brand/scan-repos.test.ts`.
