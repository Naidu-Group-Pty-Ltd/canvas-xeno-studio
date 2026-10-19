import { describe, expect, test } from "bun:test";
import {
  BRAND_TYPES,
  CHANNELS,
  EMPTY_DNA,
  FACES,
  GOALS,
  type BrandDna,
} from "../../src/lib/brand/dna";
import {
  CHANNEL_GUIDES,
  contentMix,
  formulaBlock,
  formulaById,
  formulaLine,
  FORMULAS,
  formulasForBrand,
  GUARDRAILS,
  rankFormulas,
  SOURCES,
  sourcesOf,
  timedBeats,
  UNIVERSAL_RULES,
} from "../../src/lib/brand/formulas";

const saasB2b: BrandDna = {
  ...EMPTY_DNA,
  type: "saas",
  market: "b2b",
  goal: "consideration",
  faces: ["founder", "product"],
  channels: ["linkedin", "youtube", "web"],
};

describe("the formula library", () => {
  test("every formula is well formed", () => {
    const ids = new Set<string>();
    for (const formula of FORMULAS) {
      expect(ids.has(formula.id)).toBe(false);
      ids.add(formula.id);
      expect(formula.id).toMatch(/^[a-z0-9-]+$/);
      const { min, ideal, max } = formula.seconds;
      expect(min).toBeLessThanOrEqual(ideal);
      expect(ideal).toBeLessThanOrEqual(max);
      expect(formula.beats.length).toBeGreaterThanOrEqual(2);
      expect(formula.goals.length).toBeGreaterThan(0);
      expect(formula.channels.length).toBeGreaterThan(0);
      expect(formula.sources.length).toBeGreaterThan(0);
      expect(["A", "B", "C"]).toContain(formula.grade);
      for (const type of Object.keys(formula.fit)) expect(BRAND_TYPES).toContain(type as never);
      expect(Object.values(formula.fit).some((fit) => fit >= 2)).toBe(true);
      for (const goal of formula.goals) expect(GOALS).toContain(goal);
      for (const channel of formula.channels) expect(CHANNELS).toContain(channel);
      for (const face of formula.faces) expect(FACES).toContain(face);
      for (const key of formula.sources) expect(SOURCES[key]).toBeDefined();
      for (const key of formula.guardrails) expect(GUARDRAILS[key]).toBeDefined();
      const keys = new Set(formula.beats.map((beat) => beat.key));
      expect(keys.size).toBe(formula.beats.length);
      // Shares are seconds at the ideal length: the beats there add up to it.
      let atIdeal = 0;
      for (const beat of formula.beats) {
        expect(beat.share).toBeGreaterThan(0);
        expect(beat.job && beat.show && beat.say).toBeTruthy();
        if (beat.from) expect(beat.from).toBeLessThanOrEqual(max);
        if (!beat.from || beat.from <= ideal) atIdeal += beat.share;
      }
      expect(Math.abs(atIdeal - ideal)).toBeLessThanOrEqual(Math.max(1, ideal * 0.05));
    }
  });

  test("every kind of brand has formulas made for it", () => {
    for (const type of BRAND_TYPES)
      expect(FORMULAS.filter((formula) => formula.fit[type] === 3).length).toBeGreaterThanOrEqual(
        3,
      );
  });

  test("every source is a link to its publisher, and says how far it was checked", () => {
    for (const source of Object.values(SOURCES)) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.title.length).toBeGreaterThan(3);
      expect(source.publisher.length).toBeGreaterThan(1);
      expect(["opened", "search"]).toContain(source.checked);
    }
    for (const guide of Object.values(CHANNEL_GUIDES))
      for (const key of guide.sources) expect(SOURCES[key]).toBeDefined();
    for (const rule of UNIVERSAL_RULES) {
      expect(rule.sources.length).toBeGreaterThan(0);
      for (const key of rule.sources) expect(SOURCES[key]).toBeDefined();
    }
    for (const guardrail of Object.values(GUARDRAILS))
      for (const key of guardrail.sources) expect(SOURCES[key]).toBeDefined();
    for (const key of ["b2c", "b2b", "both"] as const)
      for (const source of contentMix(key)!.sources) expect(SOURCES[source]).toBeDefined();
    // Every channel has its guide.
    for (const channel of CHANNELS) expect(CHANNEL_GUIDES[channel]).toBeDefined();
  });

  test("testimony stays real: formulas fronted by customers, presenters or creators carry the guardrails", () => {
    for (const formula of FORMULAS) {
      if (formula.faces.includes("customers")) {
        expect(formula.guardrails).toContain("no-synthetic-customers");
        expect(
          formula.guardrails.includes("real-testimony") ||
            formula.guardrails.includes("real-stories"),
        ).toBe(true);
      }
      if (formula.faces.includes("presenter"))
        expect(formula.guardrails).toContain("no-synthetic-customers");
      if (formula.faces.includes("creators")) expect(formula.guardrails).toContain("disclose-paid");
    }
    expect(GUARDRAILS["real-testimony"]!.sources.length).toBeGreaterThan(0);
    expect(GUARDRAILS["no-synthetic-customers"]!.rule).toContain("AI");
  });

  test("a formula is found by its id", () => {
    expect(formulaById("saas-demo-ad")?.name).toBeTruthy();
    expect(formulaById("nope")).toBeNull();
    expect(formulaById(null)).toBeNull();
    expect(formulaLine(formulaById("pas")!)).toMatch(/^.+ \(pas\): /);
  });

  test("a formula's sources include its channel's and its guardrails', each once", () => {
    const formula = formulaById("ugc-ad")!;
    const urls = sourcesOf(formula, "tiktok").map((source) => source.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const key of CHANNEL_GUIDES.tiktok.sources) expect(urls).toContain(SOURCES[key]!.url);
    for (const key of GUARDRAILS["disclose-paid"]!.sources)
      expect(urls).toContain(SOURCES[key]!.url);
  });
});

describe("timing a formula", () => {
  test("its beats run end to end, from 0 to the length, at every length", () => {
    for (const formula of FORMULAS) {
      const { min, ideal, max } = formula.seconds;
      for (const seconds of [min, ideal, max, 6, 15, 30, 60, 90]) {
        const beats = timedBeats(formula, seconds);
        expect(beats[0]!.from).toBe(0);
        expect(beats.at(-1)!.to).toBe(seconds);
        beats.forEach((beat, index) => {
          expect(beat.to).toBeGreaterThan(beat.from);
          if (index) expect(beat.from).toBe(beats[index - 1]!.to);
        });
      }
    }
  });

  test("at its ideal length each beat runs its share", () => {
    const formula = formulaById("demo-walkthrough")!;
    const beats = timedBeats(formula);
    for (const beat of beats) expect(beat.to - beat.from).toBeCloseTo(beat.share, 0);
  });

  test("hooks keep their length when the piece is longer; beats for longer pieces come in", () => {
    const formula = formulaById("saas-demo-ad")!;
    const hook = (seconds: number) => timedBeats(formula, seconds)[0]!;
    expect(hook(15).to).toBe(3);
    expect(hook(60).to).toBe(3);
    const aida = formulaById("aida")!;
    expect(timedBeats(aida, 30).map((beat) => beat.key)).not.toContain("objection");
    expect(timedBeats(aida, 60).map((beat) => beat.key)).toContain("objection");
  });
});

describe("ranking for a brand", () => {
  test("a SaaS brand selling to businesses gets formulas made for SaaS first", () => {
    const ranked = rankFormulas(saasB2b);
    expect(ranked).toHaveLength(FORMULAS.length);
    for (const entry of ranked.slice(0, 5))
      expect(entry.formula.fit.saas ?? 0).toBeGreaterThanOrEqual(2);
    expect(ranked[0]!.fit).toBe("strong");
    expect(ranked[0]!.reasons).toContain("Made for SaaS and software brands");
    // Consumer-only formulas sink, with the reason.
    const unboxing = ranked.find((entry) => entry.formula.id === "unboxing")!;
    expect(unboxing.cautions).toContain("Made for B2C audiences");
    expect(ranked.indexOf(unboxing)).toBeGreaterThan(ranked.length / 2);
  });

  test("what's asked counts: the channel, the length, who can front it", () => {
    const ranked = rankFormulas(saasB2b, { channel: "tiktok", seconds: 200 });
    const demo = ranked.find((entry) => entry.formula.id === "saas-demo-ad")!;
    expect(demo.cautions).toContain("Not usually made for TikTok");
    expect(demo.cautions).toContain("Runs 15–45 s");
    const story = rankFormulas(saasB2b).find((entry) => entry.formula.id === "customer-story")!;
    expect(story.cautions).toContain("Needs real customers");
  });

  test("a brand's own formulas come first, in its order, unless the piece rules one out", () => {
    const pinned = { ...saasB2b, formulas: ["bumper", "aida"] };
    const ranked = rankFormulas(pinned);
    expect(ranked.slice(0, 2).map((entry) => entry.formula.id)).toEqual(["bumper", "aida"]);
    expect(ranked[0]!.reasons[0]).toBe("One of the brand's formulas");
    // A 6-second bumper can't be a 60-second LinkedIn video.
    const asked = rankFormulas(pinned, { channel: "linkedin", seconds: 60 });
    expect(asked[0]!.formula.id).not.toBe("bumper");
    expect(formulasForBrand(pinned).map((formula) => formula.id)).toEqual(["bumper", "aida"]);
    // Ids no longer in the library are skipped.
    expect(
      formulasForBrand({ ...saasB2b, formulas: ["gone", "pas"] }).map((formula) => formula.id),
    ).toEqual(["pas"]);
  });

  test("a brand without a kind gets no formulas of its own", () => {
    expect(formulasForBrand(EMPTY_DNA)).toEqual([]);
    expect(formulasForBrand(saasB2b, 2)).toHaveLength(2);
  });

  test("stronger evidence ranks higher between formulas that fit as well", () => {
    const local = { ...EMPTY_DNA, type: "local" as const };
    const ranked = rankFormulas(local, { goal: "conversion" });
    const at = (id: string) => ranked.findIndex((entry) => entry.formula.id === id);
    // Both made for local businesses and for conversion; the measured one first.
    expect(formulaById("review-spotlight")!.grade).toBe("A");
    expect(formulaById("offer-post")!.grade).toBe("B");
    expect(at("review-spotlight")).toBeLessThan(at("offer-post"));
  });
});

describe("the content mix", () => {
  test("by who the brand sells to, after Binet & Field", () => {
    expect(contentMix("b2c")).toMatchObject({ brand: 60, activation: 40 });
    expect(contentMix("b2b")).toMatchObject({ brand: 50, activation: 50 });
    expect(contentMix("both")).toMatchObject({ brand: 55, activation: 45 });
    expect(contentMix(null)).toBeNull();
    for (const key of ["b2c", "b2b", "both"] as const) {
      const mix = contentMix(key)!;
      expect(mix.brand + mix.activation).toBe(100);
      expect(mix.short).toContain("Binet & Field");
    }
  });
});

describe("a formula written out for the AI", () => {
  test("its beats timed, the channel's rules, the house rules, its guardrails and why", () => {
    const block = formulaBlock(formulaById("saas-demo-ad")!, { seconds: 30, channel: "linkedin" });
    const lines = block.split("\n");
    expect(lines[0]).toMatch(/^FORMULA: .+ \(saas-demo-ad\): /);
    expect(lines[1]).toBe("Length: 30 s (it works from 15 to 45 s). Shape: 4:5. For LinkedIn.");
    expect(block).toContain("1. Hook (0–3 s): ");
    expect(block).toMatch(/\n4\. Call to action \([\d.]+–30 s\): /);
    expect(block).toContain("\nOn LinkedIn: ");
    expect(block).toContain(
      "\nAlways: Land the hook and the product or key message in the first 3 seconds",
    );
    expect(block).toContain("\nGuardrails (never break these): ");
    expect(block).toContain(GUARDRAILS["real-testimony"]!.rule.split(":")[0]!);
    expect(block).toContain("\nWhy it works: ");
    // Without a channel: its own shape and no channel line.
    const plain = formulaBlock(formulaById("bumper")!);
    expect(plain).toContain("Length: 6 s");
    expect(plain).not.toContain("\nOn ");
  });
});
