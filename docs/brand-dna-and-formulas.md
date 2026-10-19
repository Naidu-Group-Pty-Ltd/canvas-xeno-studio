# Brand DNA and content formulas

Two layers sit on top of a brand kit's design system (its look, voice and rules):

- **Brand DNA** says what kind of brand it is and what its content is about: SaaS, a product, a
  personal brand or creator, UGC-led, services, a local business or coaching and education; who
  it sells to; its character; its positioning; the moments buyers think of it; what it can prove;
  and what makes it recognisable.
- **Content formulas** are proven structures for videos and posts. Each is a run of timed beats
  (what every moment must do, show and say), with the rules it keeps, the guardrails that keep it
  honest, and the research it rests on. A brand's DNA ranks them, and a brand can keep formulas
  written for it: a library formula rewritten in its words, for one of its audiences.

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
| Who it serves                | Up to eight audiences, each with the job they hire it for and what holds them back. The positioning line names them.                | Jobs to Be Done                                                              |
| What it sells                | Up to ten products or services, each with what it is.                                                                               |                                                                              |
| What buyers use instead      | The alternatives buyers weigh it against: compared fairly, never disparaged.                                                        | Moore's positioning template (the alternative)                               |
| Its guardrails               | Up to twelve rules every piece for the brand keeps (how it words security, what it never promises). They go to the AI first.        | The brand's own rules and its regulators'                                    |
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
prompt assistant and the Supercomputer puts who the brand is first (its kind, archetype,
positioning, its guardrails, who it serves and what it sells), and what its content is about and
made with after its voice (pillars, buying moments, what holds its audiences back, proof, what
buyers use instead, assets, who fronts it, channels, goal, its formulas and its content mix).

A brief has room for 12,000 characters (6,000 for the prompt assistant, 4,500 in a long video's
snapshot). When a brand says more than fits, the lines it needs most are kept, still in reading
order: who it is, its guardrails, its proof, its call to action and the words to spell exactly;
then its voice, what it never shows, its audiences, buying moments and formulas; then what holds
them back, its look and the rest of its content; the look in detail (lighting, grading,
composition) last, as every picture and clip carries the brand's style line anyway. For the prompt
assistant, which writes pictures and clips, the look is kept first instead.

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
- **What it is for**: building the brand, asking for action, or both. Written out for the AI, a
  brand-building formula ends on the brand, its one call to action the brand itself (or following
  it), never a demo, offer or sign-up unless the brief asks for one; the others end on the brand's
  own call to action. (A live check found planners putting the brand's demo ask on everything.)
- **Rules** of its own, the **channel's** rules when one is chosen, and the **house rules** every
  formula keeps (below).
- **Guardrails** that are never broken (below).
- **Why it works**, its **evidence grade** and its **sources**:
  - **A, measured**: a measured result for the format (3 formulas).
  - **B, guided**: official platform guidance or research behind it (25).
  - **C, convention**: an established convention without a measured result (12).

**Ranking.** For a brand and a piece, the library is ranked by how well each formula suits the
brand's kind (and its other kinds), its market, the goal, the channel, the length, who can front
it, and the strength of its evidence. The brand's pinned formulas come first, then those written
for it, unless the piece's channel or length rules them out. Each formula says why it fits and
what to watch for ("Needs real customers", "Runs 15–45 s").

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

### A brand's own formulas

Kept on the brand kit (`brand_kits.formulas`, migration `0024_brand_formulas`; the code is in
`src/lib/brand/own-formulas.ts`). A brand keeps up to 16.

- **Written after the library.** Each names the library formula (or formulas) it was written
  after, the audience it is for and how often it runs. It never drops their guardrails or
  sources, and never claims stronger evidence than they have; one written after none is a
  convention (C).
- **Written two ways.** On the Brand page, under Content formulas: **Write it with AI** rewrites a
  library formula for the brand (its DNA, voice, proof and guardrails), for one of its audiences, a
  channel and a length, for a person to look over and keep; or **Copy it to rewrite by hand**. Both
  open the editor: its name, who it is for, what it does, purpose, goals, channels, who fronts it,
  its lengths, its beats (each with its seconds, whether it is a hook or call to action, and the
  shortest piece it appears in), its rules, what to avoid, its guardrails (those of the formula it
  was written after can't be unticked), how often and why it works.
- **Used like the library's.** They are listed first for their brand, can be pinned, and resolve
  by id wherever the brand's formulas do: the Director, long videos, the agent and the studio API.
  The brief names them among the formulas the brand works with, and a formula written out says who
  it is for, what it was written after and how often it runs.

[Aurixa Systems](brands/aurixa-systems.md) is a worked example: its DNA, field by field, and the
twelve formulas written for it, with the research behind them.

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
- **Illustrative figures**: financial figures on screen (borrowing capacity, cash flow, returns,
  projections) are labelled as an illustrative example on hypothetical figures, with their key
  assumptions, never a forecast or a promised outcome; a published statistic isn't one of these, and
  carries its source and date instead (ASIC RG 234, ACCC).
- **No compliance promises**: never say or imply that a product makes a business compliant, takes
  over its obligations or is endorsed by a regulator (AUSTRAC, ACCC).
- **Label AI**: AI-generated presenters, and AI-generated scenes that could pass as real footage,
  are labelled as AI-generated (the Australian Government's guidance on AI-generated content,
  ACCC). Presenter-led formulas carry it.
- **Pre-release**: features that aren't generally available are labelled as in development or
  early access; waitlists and demos are described as they are (ACCC). Feature launches carry it.

### Channels

Each channel has its shape, lengths and rules from the platform's own guidance: TikTok, Instagram
Reels and YouTube Shorts 9:16; LinkedIn and Facebook feeds 4:5; YouTube, X and the web 16:9.

## Where they are used

- **Brand page**: each kit's DNA (with Suggest from the brand), the formulas written for it (to
  edit, take away or write another, with AI or by hand) and its formulas to pin; the formula
  library, ranked for any kit, with each formula's beats at a length, its rules, guardrails,
  sources and evidence grade, the brand's content mix, and the house rules.
- **Create**: the brand chosen in this browser, else the project's, else the studio default (as in
  the Director), so suggestions and pictures are made in it from the first visit.
- **Director**: a brand (the project's, else the studio default) and a formula, with a channel and
  length. The plan's scenes follow the formula's beats and timing, and its creative summary says
  which formula it follows. Revisions keep to the same brand and formula.
- **Long videos**: a formula for the AI's beats, its stages spread over the clips. What a beat says
  goes in the voiceover or the edit's captions, not the picture.
- **Supercomputer agent**: content for a brand follows a formula that fits its DNA, goal and
  channel, preferring those written for it (`list_brand_formulas`, then `get_brand_formula`), and
  the agent says which it used.
- **Studio API and MCP**: `list_brand_formulas` and `get_brand_formula`, each with the brand's
  `brandKitId` for the formulas written for it (docs/studio-api.md); `get_brand_kit` returns the
  kit's DNA, its formulas and those written for it.

## The research, and how far it was checked

The library rests on 109 sources:

- **Official platform guidance**: Google and YouTube, TikTok, Meta and Instagram, LinkedIn, Google
  Business Profile.
- **Effectiveness research**: the IPA (Binet & Field), the LinkedIn B2B Institute,
  Ehrenberg-Bass, System1, Kantar, Nielsen, Gartner, Forrester, Edelman, the Spiegel Research
  Center and BrightLocal.
- **Regulators and government**: the ACCC, ASIC, AUSTRAC, the OAIC, the Department of Industry,
  Science and Resources, and the US Federal Trade Commission.
- **Industry research** for business brands in regulated work: Investment Trends, the Property
  Council of Australia and ON24.
- **The originators** of the copywriting and story frameworks, and work on their history.

Every source is linked in the app and says how far it was checked:

- **Read in full**: the page itself was opened. Only Google's ABCD Detector repository (GitHub).
- **Read via search**: its text was read from the publisher's own page through web search, the
  page not yet opened. All the others: the network policy of the session that built the library
  refused the publishers' sites it tried.

Figures are the publishers' own, attributed to them. Platform figures (TikTok's, Meta's, Google's,
LinkedIn's) come from the platform's own data, and the Google/Kantar ABCD lift is a correlation
with Kantar's model predictions, not measured sales.

**Opening the sources.** The sources read via search are on these 51 hosts: about.instagram.com,
ads.tiktok.com, blog.google, blog.youtube, business.google.com, business.linkedin.com,
contentmarketinginstitute.com, creators.instagram.com, help.instagram.com, investmenttrends.com,
ipa.co.uk, marketingscience.info, newsroom.tiktok.com, podcasts.apple.com, sell.g2.com,
seller-us.tiktok.com, services.google.com, spiegel.medill.northwestern.edu, storybrand.com,
support.google.com, system1group.com, transparency.meta.com, wistia.com, www.accc.gov.au,
www.aerogrammestudio.com, www.asic.gov.au, www.austrac.gov.au, www.awai.com, www.brightlocal.com,
www.christenseninstitute.org, www.edelman.com, www.entrepreneur.com, www.facebook.com,
www.forrester.com, www.ftc.gov, www.gartner.com, www.hbs.edu, www.huthwaiteinternational.com,
www.industry.gov.au, www.jstage.jst.go.jp, www.kantar.com, www.linkedin.com, www.nielsen.com,
www.npr.org, www.oaic.gov.au, www.on24.com, www.propertycouncil.com.au, www.tandfonline.com,
www.thinkwithgoogle.com, www.tiktok.com and www.vidyard.com. With them allowed in the environment's network access settings, a later session can
open each page, check what the library says against it, and mark it read in full.

**Not covered yet.** Pinterest and Snapchat guidance; Australia's TGA and Ahpra rules on
testimonials and before-and-after images for health services (a health brand's testimonial and
before-and-after content should go to its compliance review).
