import { describe, expect, test } from "bun:test";
import {
  archetypeWords,
  articleFor,
  dnaLines,
  dnaOf,
  EMPTY_DNA,
  isEmptyDna,
  positioningLine,
  mergeSuggestion,
  typeWords,
  type BrandDna,
} from "../../src/lib/brand/dna";

const aurixa = (extra: Partial<BrandDna> = {}): BrandDna => ({
  ...EMPTY_DNA,
  type: "saas",
  alsoTypes: ["service"],
  market: "b2b",
  archetype: "sage",
  archetypeAlso: "ruler",
  category: "AI operating system for growing businesses",
  job: "Run operations without adding headcount",
  difference: "It connects every system the business already uses",
  pillars: [
    { name: "Operational intelligence", about: "how work gets done" },
    { name: "Founder lessons", about: null },
  ],
  moments: ["When a manager is buried in admin"],
  proof: ["Used by 40 Australian firms"],
  assets: ["The layered A symbol"],
  faces: ["founder", "product"],
  channels: ["linkedin", "youtube"],
  goal: "consideration",
  ...extra,
});

describe("a brand's DNA, read", () => {
  test("anything that isn't an object is an empty DNA", () => {
    for (const value of [null, undefined, "saas", 3, []]) expect(dnaOf(value)).toEqual(EMPTY_DNA);
    expect(isEmptyDna(dnaOf({}))).toBe(true);
    expect(isEmptyDna(aurixa())).toBe(false);
  });

  test("only known values are kept, each once, and cut to size", () => {
    const dna = dnaOf({
      type: "saas",
      alsoTypes: ["saas", "personal", "nonsense", "personal", "service", "local"],
      market: "b2b",
      archetype: "sage",
      archetypeAlso: "sage",
      category: `  An AI   operating system ${"x".repeat(400)}`,
      pillars: ["Lessons", { name: "lessons" }, { name: "How it works", about: "the product" }, 7],
      moments: ["When admin piles up", "", "when admin piles up", 3],
      faces: ["founder", "robot", "founder"],
      channels: ["linkedin", "myspace"],
      goal: "fame",
      formulas: ["saas-demo-ad", "Bad Id!", "customer-story"],
    });
    expect(dna.type).toBe("saas");
    // The main type isn't repeated, and at most two others are kept.
    expect(dna.alsoTypes).toEqual(["personal", "service"]);
    // A second archetype the same as the first is dropped.
    expect(dna.archetypeAlso).toBeNull();
    expect(dna.category!.startsWith("An AI operating system")).toBe(true);
    expect(dna.category!.length).toBeLessThanOrEqual(201);
    expect(dna.pillars).toEqual([
      { name: "Lessons", about: null },
      { name: "How it works", about: "the product" },
    ]);
    expect(dna.moments).toEqual(["When admin piles up"]);
    expect(dna.faces).toEqual(["founder"]);
    expect(dna.channels).toEqual(["linkedin"]);
    expect(dna.goal).toBeNull();
    expect(dna.formulas).toEqual(["saas-demo-ad", "customer-story"]);
  });

  test("it round-trips through storage", () => {
    expect(dnaOf(JSON.parse(JSON.stringify(aurixa())))).toEqual(aurixa());
  });
});

describe("a brand's DNA, in words", () => {
  test("its kind and character", () => {
    expect(typeWords(aurixa())).toBe("SaaS & software, also Services & B2B");
    expect(typeWords(EMPTY_DNA)).toBeNull();
    expect(archetypeWords(aurixa())).toBe("The Sage with The Ruler");
    expect(archetypeWords({ ...aurixa(), archetypeAlso: null })).toBe("The Sage");
  });

  test("its positioning, after Moore's template", () => {
    expect(
      positioningLine(aurixa(), { name: "Aurixa", audience: "Small Australian businesses" }),
    ).toBe(
      "For small Australian businesses who need to run operations without adding headcount, Aurixa is an AI operating system for growing businesses. It connects every system the business already uses.",
    );
    expect(positioningLine(aurixa({ difference: null }), { name: "Aurixa" })).toBe(
      "Aurixa is an AI operating system for growing businesses.",
    );
    expect(
      positioningLine(aurixa({ category: "the accounting platform." }), { name: "Aurixa" }),
    ).toBe(
      "Aurixa is the accounting platform. It connects every system the business already uses.",
    );
    expect(positioningLine(aurixa({ category: null }), { name: "Aurixa" })).toBeNull();
  });

  test("a or an, by how the word sounds", () => {
    expect(articleFor("AI operating system")).toBe("an");
    expect(articleFor("SEO agency")).toBe("an");
    expect(articleFor("B2B platform")).toBe("a");
    expect(articleFor("URL shortener")).toBe("a");
    expect(articleFor("useful tool")).toBe("a");
    expect(articleFor("hour tracker")).toBe("an");
    expect(articleFor("online shop")).toBe("an");
    expect(articleFor("bakery")).toBe("a");
    expect(articleFor("e-commerce brand")).toBe("an");
  });

  test("its lines for the AI, in order, and the job said once", () => {
    const lines = dnaLines(aurixa(), { name: "Aurixa", audience: "small businesses" }, [
      "Pain → product proof (saas-demo-ad)",
    ]);
    expect(lines.map((line) => line.split(":")[0])).toEqual([
      "Brand type",
      "Archetype",
      "Positioning",
      "Content pillars",
      "Buying moments (hooks start here)",
      "Proof it stands behind (use only these)",
      "Distinctive assets (show early and often)",
      "Fronted by",
      "Publishes on",
      "Most content is for",
      "Content formulas it works with",
    ]);
    expect(lines[0]).toBe(
      "Brand type: SaaS & software, also Services & B2B, selling to businesses (B2B)",
    );
    expect(lines[3]).toBe(
      "Content pillars: Operational intelligence (how work gets done); Founder lessons",
    );
    // Without an audience the positioning leaves the job out, so it gets its own line.
    const noAudience = dnaLines(aurixa(), { name: "Aurixa" });
    expect(noAudience).toContain(
      "The job buyers hire it for: Run operations without adding headcount",
    );
    expect(dnaLines(EMPTY_DNA, { name: "Aurixa" })).toEqual([]);
  });
});

describe("a suggested DNA, merged", () => {
  test("fills only what a person left empty, and never touches their formulas", () => {
    const mine = {
      ...EMPTY_DNA,
      type: "personal" as const,
      pillars: [{ name: "Mine", about: null }],
      formulas: ["story-lesson"],
    };
    const merged = mergeSuggestion(mine, {
      ...aurixa(),
      alsoTypes: ["personal", "service"],
      formulas: ["saas-demo-ad"],
    });
    expect(merged.type).toBe("personal");
    // A suggested extra kind that is now the main one is dropped.
    expect(merged.alsoTypes).toEqual(["service"]);
    expect(merged.pillars).toEqual([{ name: "Mine", about: null }]);
    expect(merged.category).toBe(aurixa().category);
    expect(merged.channels).toEqual(["linkedin", "youtube"]);
    expect(merged.formulas).toEqual(["story-lesson"]);
    // A person's archetype keeps their second one too (even when empty).
    expect(mergeSuggestion({ ...EMPTY_DNA, archetype: "hero" }, aurixa()).archetypeAlso).toBeNull();
    expect(mergeSuggestion(EMPTY_DNA, aurixa()).archetypeAlso).toBe("ruler");
  });
});

describe("who it serves, what it sells and what buyers use instead", () => {
  test("are read as named rows and lines, each once and cut to size", () => {
    const dna = dnaOf({
      audiences: [
        { name: "Buyers agents", job: "prove value fast", pain: "slow due diligence" },
        "Wealth advisers",
        { name: "buyers agents", job: "a duplicate" },
        { job: "no name" },
      ],
      offers: [{ name: "Compliance Passport", what: "a guided AML/CTF journey" }, { name: "" }],
      alternatives: ["Spreadsheets", "spreadsheets", "", 4, "A separate CRM"],
    });
    expect(dna.audiences).toEqual([
      { name: "Buyers agents", job: "prove value fast", pain: "slow due diligence" },
      { name: "Wealth advisers", job: null, pain: null },
    ]);
    expect(dna.offers).toEqual([{ name: "Compliance Passport", what: "a guided AML/CTF journey" }]);
    expect(dna.alternatives).toEqual(["Spreadsheets", "A separate CRM"]);
    expect(
      dnaOf({ audiences: Array.from({ length: 20 }, (_, n) => `A${n}`) }).audiences,
    ).toHaveLength(8);
  });

  test("go to the AI with who it is, and what buyers use instead with its proof", () => {
    const lines = dnaLines(
      aurixa({
        audiences: [
          { name: "Buyers agents", job: "Prove a property's value", pain: "Slow due diligence" },
          { name: "Developers", job: null, pain: null },
        ],
        offers: [{ name: "Compliance Passport", what: "A guided AML/CTF journey." }],
        alternatives: ["Spreadsheets"],
      }),
      { name: "Aurixa", audience: "small businesses" },
    );
    expect(lines).toContain(
      "Who it serves: Buyers agents (to prove a property's value); Developers",
    );
    expect(lines).toContain("What holds them back: Buyers agents: slow due diligence");
    expect(lines).toContain("What it sells: Compliance Passport (A guided AML/CTF journey)");
    expect(lines).toContain(
      "What buyers use instead (compare fairly, never disparage): Spreadsheets",
    );
    const at = (start: string) => lines.findIndex((line) => line.startsWith(start));
    expect(at("Who it serves")).toBeGreaterThan(at("Positioning"));
    // What holds them back is where hooks come from: with the buying moments.
    expect(at("What holds them back")).toBeGreaterThan(at("Buying moments"));
    expect(at("What buyers use instead")).toBeGreaterThan(at("Proof it stands behind"));
    // Its audiences say who it is for, so the positioning names them.
    expect(lines.find((line) => line.startsWith("Positioning"))).toContain(
      "For buyers agents and developers who need to",
    );
  });

  test("its own guardrails come straight after who it is", () => {
    const lines = dnaLines(
      aurixa({ guardrails: ["Never say 'SOC 2 certified'.", "Label every figure illustrative"] }),
      { name: "Aurixa", audience: "small businesses" },
    );
    expect(lines[3]).toBe(
      "Its guardrails (every piece keeps these): Never say 'SOC 2 certified'; Label every figure illustrative",
    );
    expect(lines[2]!.startsWith("Positioning")).toBe(true);
  });

  test("who fronts it reads as one of them for each piece", () => {
    const fronted = (faces: string[]) =>
      dnaLines(dnaOf({ faces }), { name: "Aurixa" }).find((line) => line.startsWith("Fronted by"));
    expect(fronted(["product"])).toBe("Fronted by: the product alone, no faces");
    expect(fronted(["product", "founder", "presenter"])).toBe(
      "Fronted by: the product itself, the founder or a presenter (person or avatar)",
    );
  });

  test("a suggestion fills them only when they're empty", () => {
    const mine = { ...EMPTY_DNA, audiences: [{ name: "Mine", job: null, pain: null }] };
    const merged = mergeSuggestion(mine, {
      ...EMPTY_DNA,
      audiences: [{ name: "Theirs", job: null, pain: null }],
      offers: [{ name: "Offer", what: null }],
      alternatives: ["Spreadsheets"],
    });
    expect(merged.audiences.map((audience) => audience.name)).toEqual(["Mine"]);
    expect(merged.offers.map((offer) => offer.name)).toEqual(["Offer"]);
    expect(merged.alternatives).toEqual(["Spreadsheets"]);
  });
});
