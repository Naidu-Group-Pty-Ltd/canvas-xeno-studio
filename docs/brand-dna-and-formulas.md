# Brand DNA and content formulas

Two layers sit on top of a brand kit's design system (its look, voice and rules):

- **Brand DNA** says what kind of brand it is and what its content is about: SaaS, a product, a
  personal brand or creator, UGC-led, services, a local business or coaching and education; who
  it sells to; its character; its positioning; the moments buyers think of it; what it can prove;
  and what makes it recognisable.
- **Content formulas** are proven structures for videos and posts. Each is a run of timed beats
  (what every moment must do, show and say), with the rules it keeps, the guardrails that keep it
  honest, and the research it rests on. A brand's DNA ranks them.

Both are on the Brand page. The Director, long videos, the Supercomputer agent and the studio API
use them, and the brand brief that goes with every generation carries the DNA.

## Brand DNA

Kept on the brand kit (`brand_kits.dna`, migration `0023_brand_dna`; the code is in
`src/lib/brand/dna.ts`).

| Part                         | What it holds                                                                                                                       | After                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Kind of brand                | The main kind (one of seven) and up to two more: a SaaS that sells through its founder is also a personal brand.                    | The formula library's fit for each kind                                      |
| Who it sells to              | Businesses (B2B), consumers (B2C) or both. Sets the content mix.                                                                    | Binet & Field (IPA; LinkedIn B2B Institute)                                  |
| Archetype                    | One of the twelve, and a second that colours it, so its stories, casting and voice stay one character.                              | Margaret Mark and Carol S. Pearson, _The Hero and the Outlaw_                |
| Category, job and difference | What it is in its buyers' words, the job they hire it for, and why it rather than the alternative. Written as one positioning line. | Geoffrey Moore's positioning template; Clayton Christensen's Jobs to Be Done |
| Content pillars              | The three to five themes its content keeps coming back to.                                                                          |                                                                              |
| Buying moments               | The situations in which buyers think of the category. Hooks start here.                                                             | Category entry points (Ehrenberg-Bass Institute)                             |
| Proof                        | Results, numbers, reviews, awards and clients it stands behind. The AI claims only these.                                           |                                                                              |
| Distinctive assets           | What makes it recognisable at a glance or a listen. Shown early and often.                                                          | Distinctive brand assets (Ehrenberg-Bass Institute)                          |
| Faces, channels and goal     | Who fronts its content, where it publishes, and what most of its content is for now.                                                |                                                                              |
| Formulas                     | The formulas it works with, pinned on the Brand page. They come first wherever its content is planned.                              |                                                                              |

**Filling it in.** Importing a brand from its website or guidelines reads its DNA along with its
design system: the AI reads the site's words, its headings and buttons, and the profiles it links
to elsewhere. An existing kit's **Suggest from the brand** reads it again and fills in only what is
empty, so nothing a person wrote is replaced. People look it over and save it; the AI never pins
formulas.

**In the brief.** The brand brief that goes with generations, the Director, long-video beats, the
prompt assistant and the Supercomputer puts who the brand is first (its kind, archetype and
positioning), and what its content is about and made with after its voice (pillars, buying
moments, proof, assets, who fronts it, channels, goal, its formulas and its content mix).

**The content mix.** Over time, about 60% brand-building to 40% activation for consumer brands,
close to 50:50 for business brands, and about 55:45 for both (Binet & Field). A default to lean on,
not a quota.

## Content formulas

The library is in `src/lib/brand/formula-library.ts`; ranking, timing and writing out are in
`src/lib/brand/formulas.ts`.

A formula has:

- **Beats**: each with a job, what is shown and what is said, timed to the length asked for. Hooks
  and calls to action keep about their length (at most a fifth of the piece each) while the beats
  between share the rest; some beats appear only in longer pieces.
- **Rules** of its own, the **channel's** rules when one is chosen, and the **house rules** every
  formula keeps (below).
- **Guardrails** that are never broken (below).
- **Why it works**, its **evidence grade** and its **sources**:
  - **A, measured**: a measured result for the format (3 formulas).
  - **B, guided**: official platform guidance or research behind it (25).
  - **C, convention**: an established convention without a measured result (12).

**Ranking.** For a brand and a piece, the library is ranked by how well each formula suits the
brand's kind (and its other kinds), its market, the goal, the channel, the length, who can front
it, and the strength of its evidence. The brand's pinned formulas come first unless the piece's
channel or length rules them out. Each formula says why it fits and what to watch for ("Needs real
customers", "Runs 15–45 s").

| Formula                       | Id                      | Made for                                                       | Length   | Evidence |
| ----------------------------- | ----------------------- | -------------------------------------------------------------- | -------- | -------- |
| Pain → product proof          | `saas-demo-ad`          | SaaS & software                                                | 15–45 s  | B        |
| Feature launch                | `feature-launch`        | SaaS & software                                                | 15–45 s  | C        |
| Demo walkthrough              | `demo-walkthrough`      | SaaS & software                                                | 90–300 s | B        |
| Customer story                | `customer-story`        | SaaS & software, Services & B2B                                | 30–120 s | B        |
| Expert point of view          | `expert-pov`            | SaaS & software, Services & B2B, Personal brand & creator      | 30–90 s  | B        |
| Explainer                     | `explainer`             | SaaS & software                                                | 45–90 s  | B        |
| Honest comparison             | `honest-comparison`     | Suits SaaS & software, Product & e-commerce, Services & B2B    | 15–90 s  | C        |
| Problem → solution demo       | `problem-solution-demo` | Product & e-commerce                                           | 15–40 s  | B        |
| Honest review                 | `honest-review`         | Product & e-commerce, UGC-led                                  | 20–45 s  | A        |
| Unboxing                      | `unboxing`              | Product & e-commerce, UGC-led                                  | 15–40 s  | B        |
| Before → after → bridge       | `before-after`          | Product & e-commerce, Local business                           | 15–60 s  | B        |
| Three reasons why             | `three-reasons`         | Product & e-commerce                                           | 20–30 s  | C        |
| How to use it                 | `how-to`                | Product & e-commerce                                           | 20–45 s  | B        |
| "It made me buy it"           | `made-me-buy-it`        | UGC-led, Product & e-commerce                                  | 15–30 s  | B        |
| UGC ad                        | `ugc-ad`                | UGC-led, Product & e-commerce                                  | 15–34 s  | A        |
| Testimonial                   | `testimonial`           | UGC-led, Services & B2B                                        | 15–45 s  | B        |
| Reaction                      | `reaction`              | UGC-led                                                        | 15–30 s  | C        |
| Story → lesson                | `story-lesson`          | Personal brand & creator                                       | 30–60 s  | B        |
| Tips and mistakes             | `tips-list`             | Personal brand & creator, Coaching & education, Services & B2B | 30–60 s  | B        |
| Myth buster                   | `myth-buster`           | Services & B2B, Coaching & education                           | 20–45 s  | B        |
| Day in the life               | `day-in-the-life`       | Personal brand & creator                                       | 20–60 s  | B        |
| Question and answer           | `qa-reply`              | Personal brand & creator                                       | 20–60 s  | C        |
| Hook → story → offer          | `hook-story-offer`      | Personal brand & creator, Coaching & education                 | 15–60 s  | C        |
| Meet the expert               | `meet-the-expert`       | Services & B2B                                                 | 20–45 s  | B        |
| How we work                   | `process`               | Services & B2B                                                 | 45–90 s  | C        |
| Customer as hero              | `storybrand`            | Services & B2B, SaaS & software                                | 30–90 s  | C        |
| Review spotlight              | `review-spotlight`      | Local business                                                 | 10–20 s  | A        |
| Behind the scenes             | `behind-the-scenes`     | Local business                                                 | 15–30 s  | B        |
| Offer or event                | `offer-post`            | Local business                                                 | 10–15 s  | B        |
| What to expect                | `what-to-expect`        | Local business                                                 | 15–30 s  | B        |
| First-visit guide             | `first-visit-faq`       | Local business                                                 | 20–40 s  | C        |
| Transformation story          | `transformation-story`  | Coaching & education                                           | 20–90 s  | B        |
| Webinar promo                 | `webinar-promo`         | Coaching & education                                           | 15–30 s  | B        |
| ABCD video ad                 | `abcd-ad`               | Product & e-commerce                                           | 15–60 s  | B        |
| Six-second bumper             | `bumper`                | Product & e-commerce                                           | 5–6 s    | B        |
| Brand story film              | `story-film`            | Personal brand & creator                                       | 30–90 s  | B        |
| AIDA                          | `aida`                  | Local business                                                 | 15–60 s  | C        |
| Problem → agitate → solve     | `pas`                   | SaaS & software, Services & B2B                                | 15–60 s  | B        |
| Feature → advantage → benefit | `fab`                   | Product & e-commerce, SaaS & software                          | 15–60 s  | C        |
| Jobs to be done               | `job-story`             | SaaS & software, Services & B2B                                | 15–60 s  | C        |

### House rules

Every formula keeps these:

1. Land the hook and the product or key message in the first 3 seconds; never open on a logo card
   (TikTok, Meta, Google).
2. Show the brand early (within 5 seconds) and again, in sight and sound, woven into the story
   (Google's ABCDs, Kantar).
3. Use the brand's distinctive assets the same way every time (Ehrenberg-Bass).
4. Carry the message with the sound off: captions for every spoken line, and on-screen text that
   backs up what is said (Meta, LinkedIn, Google).
5. One message and one call to action, said and shown (TikTok, Google).
6. Put people and feeling at the centre rather than a flat list of features (Google, System1, the
   IPA, Kantar).
7. Hooks and calls to action pass the 4 U's: urgent, unique, ultra-specific and useful (AWAI).
8. Never be dull (System1).

### Guardrails

A formula carries the guardrails its kind of content needs. Formulas fronted by real customers or a
presenter carry **no synthetic customers**; those fronted by creators carry **disclose paid**.

- **Real testimony**: never write a customer's quote, review, rating or testimonial. Testimony is a
  real person's own words, used with their permission and kept on record (ACCC, FTC).
- **No synthetic customers**: never present an AI-generated person, avatar or voice as a real
  customer, user, reviewer or expert. An AI presenter speaks for the brand (FTC, ACCC).
- **Disclose paid**: paid, gifted or affiliate creator content says so up front, with the
  platform's branded-content label (ACCC, FTC).
- **Typical results**: results shown are genuine and typical, or the generally expected result is
  stated beside them (FTC).
- **Real before and after**: real footage of the real product, never an AI-made "after"; no
  idealised before-and-after for health or weight loss (Meta, TikTok Shop).
- **No unrealistic outcomes** for health, weight loss or making money (Meta).
- **Real proof**: ratings, review counts and numbers are the real ones (Spiegel Research Center,
  ACCC).
- **Real places**: pictures and video of a business show it as it is (Google Business Profile).
- **Substantiated claims**: every claim is one the brand can prove; health and money claims go to
  the brand's compliance review first (FTC, Meta).
- The studio's own policy: **real demos** (generated footage never stands in as proof of how a
  product performs), **real stories** (founder and personal stories are never invented) and **fair
  comparisons** (factual, sourced, dated).

### Channels

Each channel has its shape, lengths and rules from the platform's own guidance: TikTok, Instagram
Reels and YouTube Shorts 9:16; LinkedIn and Facebook feeds 4:5; YouTube, X and the web 16:9.

## Where they are used

- **Brand page**: each kit's DNA (with Suggest from the brand) and its formulas to pin; the
  formula library, ranked for any kit, with each formula's beats at a length, its rules,
  guardrails, sources and evidence grade, the brand's content mix, and the house rules.
- **Director**: a brand (the project's, else the studio default) and a formula, with a channel and
  length. The plan's scenes follow the formula's beats and timing, and its creative summary says
  which formula it follows. Revisions keep to the same brand and formula.
- **Long videos**: a formula for the AI's beats, its stages spread over the clips. What a beat says
  goes in the voiceover or the edit's captions, not the picture.
- **Supercomputer agent**: content for a brand follows a formula that fits its DNA, goal and
  channel (`list_brand_formulas`, then `get_brand_formula`), and the agent says which it used.
- **Studio API and MCP**: `list_brand_formulas` and `get_brand_formula` (docs/studio-api.md);
  `get_brand_kit` returns the kit's DNA and its formulas.

## The research, and how far it was checked

The library rests on 96 sources:

- **Official platform guidance**: Google and YouTube, TikTok, Meta and Instagram, LinkedIn, Google
  Business Profile.
- **Effectiveness research**: the IPA (Binet & Field), the LinkedIn B2B Institute,
  Ehrenberg-Bass, System1, Kantar, Nielsen, Gartner, Forrester, Edelman, the Spiegel Research
  Center and BrightLocal.
- **Regulators**: the ACCC and the US Federal Trade Commission.
- **The originators** of the copywriting and story frameworks, and work on their history.

Every source is linked in the app and says how far it was checked:

- **Read in full**: the page itself was opened. Only Google's ABCD Detector repository (GitHub).
- **Read via search**: its text was read from the publisher's own page through web search, the
  page not yet opened. All the others: the network policy of the session that built the library
  refused the publishers' sites it tried.

Figures are the publishers' own, attributed to them. Platform figures (TikTok's, Meta's, Google's,
LinkedIn's) come from the platform's own data, and the Google/Kantar ABCD lift is a correlation
with Kantar's model predictions, not measured sales.

**Opening the sources.** The sources read via search are on these 44 hosts: about.instagram.com,
ads.tiktok.com, blog.google, blog.youtube, business.google.com, business.linkedin.com,
contentmarketinginstitute.com, creators.instagram.com, help.instagram.com, ipa.co.uk,
marketingscience.info, newsroom.tiktok.com, podcasts.apple.com, sell.g2.com, seller-us.tiktok.com,
services.google.com, spiegel.medill.northwestern.edu, storybrand.com, support.google.com,
system1group.com, transparency.meta.com, wistia.com, www.accc.gov.au, www.aerogrammestudio.com,
www.awai.com, www.brightlocal.com, www.christenseninstitute.org, www.edelman.com,
www.entrepreneur.com, www.facebook.com, www.forrester.com, www.ftc.gov, www.gartner.com,
www.hbs.edu, www.huthwaiteinternational.com, www.jstage.jst.go.jp, www.kantar.com, www.linkedin.com,
www.nielsen.com, www.npr.org, www.tandfonline.com, www.thinkwithgoogle.com, www.tiktok.com and
www.vidyard.com. With them allowed in the environment's network access settings, a later session can
open each page, check what the library says against it, and mark it read in full.

**Not covered yet.** Pinterest and Snapchat guidance; Australia's TGA and Ahpra rules on
testimonials and before-and-after images for health services (a health brand's testimonial and
before-and-after content should go to its compliance review).
