import { describe, expect, test } from "bun:test";
import { EMPTY_DNA, type BrandDna } from "../../src/lib/brand/dna";
import {
  formulaBlock,
  formulaById,
  formulasFor,
  formulasForBrand,
  FORMULAS,
  rankFormulas,
  sourcesOf,
  timedBeats,
} from "../../src/lib/brand/formulas";
import {
  copyForBrand,
  freeId,
  OWN_FORMULA_LIMITS,
  ownFormulaOf,
  ownFormulasOf,
  slugOf,
} from "../../src/lib/brand/own-formulas";
import { formulaAdaptRequest } from "../../src/lib/brand/formula-adapt-request";
import { handleBrandFormulaRequest } from "../../src/lib/brand/formula-adapt-stream.server";

const saas: BrandDna = {
  ...EMPTY_DNA,
  type: "saas",
  market: "b2b",
  goal: "consideration",
  channels: ["linkedin"],
  audiences: [{ name: "Buyers agents", job: "prove a property's value", pain: "slow reports" }],
};

const written = (extra: Record<string, unknown> = {}) => ({
  name: "Fragmented to governed",
  summary: "Ten tools become one governed workflow",
  basedOn: ["saas-demo-ad"],
  audience: "Buyers agents",
  cadence: "Fortnightly on LinkedIn",
  beats: [
    {
      label: "Hook",
      share: 3,
      edge: true,
      job: "Name the pain",
      show: "Ten tabs",
      say: "Ten tabs.",
    },
    {
      label: "Show",
      share: 12,
      job: "One workflow",
      show: "The real interface",
      say: "One brief.",
    },
    { label: "Proof", share: 10, job: "Believable", show: "Report", say: "Ten-year cash flow." },
    {
      label: "Call to action",
      share: 5,
      edge: true,
      job: "Book",
      show: "Lockup",
      say: "Book a demo",
    },
  ],
  ...extra,
});

describe("a brand's own formula, read", () => {
  test("keeps what holds together and fills the rest from the formula it was written from", () => {
    const formula = ownFormulaOf(written())!;
    const base = formulaById("saas-demo-ad")!;
    expect(formula.id).toBe("fragmented-to-governed");
    expect(formula.own).toEqual({
      basedOn: ["saas-demo-ad"],
      audience: "Buyers agents",
      cadence: "Fortnightly on LinkedIn",
    });
    expect(formula.origin).toBe(`Written for the brand, after ${base.name}`);
    expect(formula.purpose).toBe(base.purpose);
    expect(formula.channels).toEqual(base.channels);
    expect(formula.seconds).toEqual(base.seconds);
    expect(formula.beats.map((beat) => beat.key)).toEqual([
      "hook",
      "show",
      "proof",
      "call-to-action",
    ]);
    expect(formula.beats[0]!.edge).toBe(true);
    expect(formula.beats[1]!.edge).toBeUndefined();
  });

  test("never drops a guardrail or a source of the formula it was written from", () => {
    const base = formulaById("saas-demo-ad")!;
    const formula = ownFormulaOf(
      written({ guardrails: ["fair-comparison", "made-up"], sources: [] }),
    )!;
    for (const key of base.guardrails) expect(formula.guardrails).toContain(key);
    expect(formula.guardrails).toContain("fair-comparison");
    expect(formula.guardrails).not.toContain("made-up");
    for (const key of base.sources) expect(formula.sources).toContain(key);
  });

  test("never claims stronger evidence than the formula it was written from", () => {
    const base = formulaById("saas-demo-ad")!;
    expect(base.grade).toBe("B");
    expect(ownFormulaOf(written({ grade: "A" }))!.grade).toBe("B");
    expect(ownFormulaOf(written({ grade: "C" }))!.grade).toBe("C");
    expect(ownFormulaOf(written())!.grade).toBe("B");
    // Written from nothing in the library: a convention.
    expect(ownFormulaOf(written({ basedOn: [] }))!.grade).toBe("C");
  });

  test("drops what doesn't hold together", () => {
    expect(ownFormulaOf(null)).toBeNull();
    expect(ownFormulaOf(written({ name: "" }))).toBeNull();
    expect(ownFormulaOf(written({ beats: [{ label: "Only one" }] }))).toBeNull();
    expect(ownFormulaOf(written({ beats: [{ label: "" }, { show: "no label" }] }))).toBeNull();
  });

  test("cuts lengths to size and puts them in order", () => {
    const formula = ownFormulaOf(written({ seconds: { min: 90, ideal: 1, max: 5000 } }))!;
    expect(formula.seconds).toEqual({ min: OWN_FORMULA_LIMITS.seconds.least, ideal: 90, max: 900 });
    const beat = ownFormulaOf(
      written({
        beats: [
          { label: "A", share: -4, from: 99999 },
          { label: "A", share: 2000 },
        ],
      }),
    )!.beats;
    expect(beat[0]!.share).toBe(1);
    expect(beat[0]!.from).toBeUndefined();
    expect(beat[1]!.share).toBe(900);
    // Two beats with one name get two keys.
    expect(new Set(beat.map((entry) => entry.key)).size).toBe(2);
  });

  test("never takes a library formula's id, and keeps each id once", () => {
    expect(ownFormulaOf(written({ id: "saas-demo-ad" }))!.id).toBe("own-saas-demo-ad");
    const kept = ownFormulasOf([written(), written(), "nonsense", written({ name: "Other" })]);
    expect(kept.map((formula) => formula.id)).toEqual([
      "fragmented-to-governed",
      "fragmented-to-governed-2",
      "other",
    ]);
    expect(ownFormulasOf("nope")).toEqual([]);
    expect(
      ownFormulasOf(Array.from({ length: 30 }, (_, n) => written({ name: `F ${n}` }))),
    ).toHaveLength(OWN_FORMULA_LIMITS.formulas);
  });

  test("round-trips through storage", () => {
    const formula = ownFormulaOf(written())!;
    expect(ownFormulaOf(JSON.parse(JSON.stringify(formula)))).toEqual(formula);
  });

  test("a library formula copied to rewrite by hand keeps its structure under a new id", () => {
    const base = formulaById("pas")!;
    const copy = copyForBrand(base, "Aurixa Systems", ["aurixa-systems-pas"]);
    expect(copy.id).toBe("aurixa-systems-pas-2");
    expect(copy.name).toBe(`${base.name} for Aurixa Systems`);
    expect(copy.beats).toEqual(base.beats);
    expect(copy.beats).not.toBe(base.beats);
    expect(copy.own?.basedOn).toEqual(["pas"]);
    expect(ownFormulaOf(copy)).not.toBeNull();
    expect(slugOf("Pain → product proof")).toBe("pain-product-proof");
    expect(slugOf("Crème brûlée")).toBe("creme-brulee");
  });

  test("a new id is always free and fits, however long the name", () => {
    const long = "a".repeat(60);
    expect(freeId(long, (id) => id === long)).toBe(`${"a".repeat(56)}-2`);
    const taken = new Set(["x", "x-2"]);
    expect(freeId("x", (id) => taken.has(id))).toBe("x-3");
    // A long brand name, copied twice: the second copy gets its own id.
    const brand = "The Very Long Name Of A Brand That Goes On And On Pty Ltd";
    const first = copyForBrand(formulaById("pas")!, brand);
    const second = copyForBrand(formulaById("pas")!, brand, [first.id]);
    expect(second.id).not.toBe(first.id);
    expect(second.id.length).toBeLessThanOrEqual(60);
    expect(ownFormulaOf(second)!.id).toBe(second.id);
    // A name without Latin letters still gets a clean id of its own, never a library one.
    const local = copyForBrand(formulaById("pas")!, "日本の会社");
    expect(local.id).toBe("pas-2");
    expect(ownFormulaOf(local)!.id).toBe("pas-2");
  });
});

describe("a brand's own formulas, used", () => {
  const own = ownFormulasOf([written(), written({ name: "Layer by layer", audience: null })]);

  test("resolve before the library's, and only for their brand", () => {
    expect(formulaById("fragmented-to-governed", own)?.own).toBeTruthy();
    expect(formulaById("fragmented-to-governed")).toBeNull();
    expect(formulaById("pas", own)?.id).toBe("pas");
    expect(formulasFor(own)).toHaveLength(FORMULAS.length + 2);
    expect(formulasFor()).toBe(FORMULAS);
  });

  test("rank after the pinned ones and before the rest, unless the piece rules them out", () => {
    const ranked = rankFormulas({ ...saas, formulas: ["bumper"] }, {}, formulasFor(own));
    expect(ranked.slice(0, 3).map((entry) => entry.formula.id)).toEqual([
      "bumper",
      "fragmented-to-governed",
      "layer-by-layer",
    ]);
    expect(ranked[1]!.reasons[0]).toBe("Written for the brand, for Buyers agents");
    // A 10-minute piece rules a 45-second formula out.
    const long = rankFormulas(saas, { seconds: 600 }, formulasFor(own));
    expect(long[0]!.formula.own).toBeUndefined();
  });

  test("are the brand's formulas when none are pinned", () => {
    expect(formulasForBrand(saas, 3, own).map((formula) => formula.id)).toEqual([
      "fragmented-to-governed",
      "layer-by-layer",
    ]);
    expect(
      formulasForBrand({ ...saas, formulas: ["pas"] }, 3, own).map((formula) => formula.id),
    ).toEqual(["pas", "fragmented-to-governed", "layer-by-layer"]);
  });

  test("written out, say who they're for, what from and how often", () => {
    const block = formulaBlock(own[0]!, { seconds: 30 });
    expect(block.split("\n")[1]).toBe(
      `Written for this brand, for Buyers agents, after the proven ${formulaById("saas-demo-ad")!.name} formula. How often: Fortnightly on LinkedIn.`,
    );
    const beats = timedBeats(own[0]!, 30);
    expect(beats.at(-1)!.to).toBe(30);
    expect(sourcesOf(own[0]!).length).toBeGreaterThan(0);
  });
});

describe("writing a formula for a brand", () => {
  const request = {
    formulaId: "saas-demo-ad",
    brand: {
      name: "Aurixa Systems",
      website: "aurixasystems.com.au",
      tagline: null,
      callToAction: "Book Your Free Demo",
      terms: ["Aurixa"],
      design: {},
      dna: saas as unknown as Record<string, unknown>,
    },
    audience: "Buyers agents",
    channel: "linkedin",
    seconds: 30,
    note: null,
    taken: [],
  };

  test("takes a library formula, the brand and what it's for", () => {
    expect(formulaAdaptRequest.safeParse(request).success).toBe(true);
    expect(formulaAdaptRequest.safeParse({ ...request, channel: "myspace" }).success).toBe(false);
    expect(formulaAdaptRequest.safeParse({ ...request, seconds: 2 }).success).toBe(false);
    expect(formulaAdaptRequest.safeParse({ ...request, brand: { name: "" } }).success).toBe(false);
  });

  test("refuses a request without a session, in words", async () => {
    const response = await handleBrandFormulaRequest(
      new Request("https://studio.example/api/public/brand-formula", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Sign in again to write a formula for a brand",
    });
  });
});
