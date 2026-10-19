/**
 * How the studio's AI reads a brand's DNA (see ./dna): the fields it answers
 * with and their JSON schema. Shared by the import's reader (it reads the
 * DNA with the design system) and the DNA suggester for a kit that has one.
 */

/** What each DNA field asks for, as a list (indent it to nest it in a longer prompt). */
export const DNA_FIELDS = `- type: the kind of brand it mainly is: "saas" (software, apps, platforms), "product" (physical products, e-commerce), "personal" (a person is the brand: founder, expert, creator, influencer), "ugc" (its content is mainly customers' and creators' own voices), "service" (agencies, consultancies, professional or business services), "local" (a place people visit or book), "education" (courses, coaching, programmes). alsoTypes: up to 2 other kinds it also is.
- market: "b2b", "b2c" or "both".
- archetype: its brand archetype (Mark & Pearson), judged from its promise, voice and imagery: innocent, explorer, sage, hero, outlaw, magician, everyman, lover, jester, caregiver, creator or ruler. archetypeAlso: a second one only if it clearly shows.
- category: what it is, in the words its buyers would use (at most 12 words). job: the job buyers hire it for (at most 15 words). difference: why it rather than the alternative, only as the evidence states it.
- pillars: 3 to 5 themes its content keeps coming back to, each {name (2 to 4 words), about (one short sentence)}.
- moments: up to 5 buying moments: situations in which a buyer would think of it ("when …").
- proof: claims the evidence itself states (numbers, clients, certifications, awards, reviews), quoted closely; never invent or round up.
- assets: its distinctive assets: what makes it recognisable (logo mark, colours, characters, sounds, taglines), up to 6, described in a few words each.
- faces: who fronts its content in the evidence: founder, team, customers, creators, presenter, product (product alone, no faces).
- channels: where it publishes, from its profiles and links: tiktok, reels (Instagram), shorts, youtube, linkedin, facebook, x, web.
- goal: what its content is mostly for now: awareness, consideration, conversion or retention.`;

const TEXT = { type: "string" };
const TEXTS = { type: "array", items: { type: "string" } };
const NULLABLE = { type: ["string", "null"] };

export const DNA_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    type: NULLABLE,
    alsoTypes: TEXTS,
    market: NULLABLE,
    archetype: NULLABLE,
    archetypeAlso: NULLABLE,
    category: NULLABLE,
    job: NULLABLE,
    difference: NULLABLE,
    pillars: {
      type: "array",
      items: {
        type: "object",
        properties: { name: TEXT, about: NULLABLE },
        required: ["name", "about"],
      },
    },
    moments: TEXTS,
    proof: TEXTS,
    assets: TEXTS,
    faces: TEXTS,
    channels: TEXTS,
    goal: NULLABLE,
  },
  required: [
    "type",
    "alsoTypes",
    "market",
    "archetype",
    "category",
    "job",
    "difference",
    "pillars",
    "moments",
    "proof",
    "assets",
    "faces",
    "channels",
    "goal",
  ],
};
