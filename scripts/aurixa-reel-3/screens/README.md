# Reel 3's screens harness

Every Aurixa screen in Reel 3 is the product's own (npc-client-dashboard, checked out beside this repository), drawn on
Jordan Ellis' fictional record. Reel 2's harness rendered the product's presentational components; this one runs the
product's pages with their hooks, and answers their Edge Function calls with **the product's own functions** on the
record:

- `src/stubs/secureInvoke.ts` stands in for the product's `src/lib/secureInvoke.ts` (the network layer every page
  calls the backend through). It posts each `invokeSecureFunction(name, body)` to the harness's backend.
- `engine/server.ts` is that backend. `calculate-borrowing-capacity` is the product's function itself, copied unchanged
  with only its sign-in, entitlement, client-access and cross-site checks answering yes (`engine/product.ts`).
  `get-client-data` is answered from the same record by that function's own rules for each `include`.
- The record is what Add New Client's Excel import writes from Jordan's fact find (`../factfind.py` fills the
  product's own template; the product's parser reads it, `engine/parse_factfind.ts`).

So a figure on a screen is the product's answer, not a number typed in.

## Running it

```sh
cd scripts/aurixa-reel-3/screens
python3 -I ../factfind.py <data dir>                                     # Jordan's workbook
NODE_PATH=$PWD/node_modules bun engine/parse_factfind.ts "<data dir>/Jordan Ellis - Client Fact Find.xlsx" <data dir>/factfind-parsed.json
./harness.sh start <data dir>/factfind-parsed.json <work dir> [harness port 5198] [engine port 5299]
NODE_PATH=$PWD/node_modules node look.cjs "screen=bc-card&engine=5299" out.png        # a quick look
NODE_PATH=$PWD/node_modules node capture.cjs <captures dir> [capture key ...]         # the film's pictures
./harness.sh stop <work dir>
```

Several harnesses can run side by side, each on its own two ports (`REEL_HARNESS_PORT` and `REEL_ENGINE_PORT` for
`capture.cjs`; `&engine=<port>` in a look's query).

## Adding screens

- **A screen** is an entry in a module under `src/screens/` (`export const SCREENS: Record<string, Screen>`); every
  module there is gathered by `src/screens.tsx`. `Screen` and Jordan's ids are in `src/record.ts`.
- **What a page reads beyond the fact find** (the saved assessment, a finance partner's access, a published report, a
  deal) goes in `engine/extras/<name>.json` as `{ "<table>": [rows] }`. A capture names the extras it needs
  (`extras: ["assessment", ...]`) and the record is reset to the import's plus those before it opens its screen.
  `assessment.json` is the assessment Calculate Capacity saves for Jordan (the product's function's own row).
- **A function the backend doesn't answer yet** goes in `engine/handlers/<group>.ts`: a default export of
  `{ "<function name>": (body, db, { client, clock }) => answer }`. The backend refuses (404) and logs any call nobody
  answers, so a page never draws something nobody answered for.
- **The pictures** are declared in `captures/<NN>-<group>.cjs` (see `capture.cjs`): open a screen, work the page as a
  person would (press a button by its words, type into a field, drop a file), take a picture, measure its regions.

## The rules a screen keeps

- **The product's own.** A component runs as the product ships it. Where one cannot run here (a dialog shell with
  dozens of unrelated hooks), its markup is copied from the product's file, every class, word and icon, with its data
  supplied, and the file and lines are named in a comment. Nothing is invented and no wording is changed.
- **The demo workspace.** The product's dark theme under the demo tenant's colours (`src/tenant.css`), Segoe UI drawn
  in Selawik (`src/windows.css`), as the client's team sees it on Windows.
- **Nobody's contact details.** No email address or phone number appears; the record has none, so the product draws its
  own "No email on file".
- **No third parties.** No lender, GoHighLevel, CoreLogic or other company's name.
- **Words the film can't say.** Where the product draws "compliant", "APRA-compliant", "approved", "Serviceable" or
  an engine recommendation, the screen keeps it (the screen is the product's) and the capture names where it is, so the
  scene frames it out.
