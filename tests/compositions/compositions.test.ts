import { describe, expect, test } from "bun:test";
import { z } from "zod/v4";
import {
  colourByHand,
  EMPTY_PRODUCTION,
  motionByHand,
  withRole,
} from "../../src/lib/brand/production";
import { brandKitOf, type BrandKit } from "../../src/lib/edit/brand";
import { parseTimeline, type Timeline } from "../../src/lib/edit/timeline";
import {
  compositionBrandOf,
  compositionColours,
  kitMotion,
} from "../../src/lib/compositions/brand";
import {
  compositionClip,
  compositionClips,
  compositionLabel,
  withDrawing,
  type Drawing,
} from "../../src/lib/compositions/clips";
import {
  buildScene,
  compileComposition,
  compositionFiles,
  compositionIdentity,
  planStretches,
  STRETCH_FRAMES,
  stateAtFrame,
  stretchIdentity,
  type CompositionBundle,
} from "../../src/lib/compositions/compile";
import {
  DEFAULT_DEMO_RECORD,
  demoList,
  demoPaths,
  demoRecordOf,
  demoValue,
  fillDemo,
  type DemoRecord,
} from "../../src/lib/compositions/demo";
import {
  drawingTimes,
  frameCount,
  QUALITY_SETTINGS,
  renderEstimate,
} from "../../src/lib/compositions/settings";
import {
  compositionCurrent,
  specKey,
  uuidsIn,
  type CompositionSpec,
} from "../../src/lib/compositions/spec";
import { bezier, CompositionState, parseCubicBezier } from "../../src/lib/compositions/state";
import { TEMPLATES, templateById } from "../../src/lib/compositions/templates";
import { gradeBars } from "../../src/lib/compositions/templates/report";
import { recordDocuments } from "../../src/lib/compositions/templates/file";

const SCREEN = "11111111-1111-4111-8111-111111111111";
const LOGO = "22222222-2222-4222-8222-222222222222";
const RENDER = "33333333-3333-4333-8333-333333333333";
const DRAWN = "44444444-4444-4444-8444-444444444444";
const KIT = "55555555-5555-4555-8555-555555555555";

const kit: BrandKit = brandKitOf({
  id: KIT,
  name: "Aurixa Systems",
  logo_asset_id: LOGO,
  text_color: "#f8fafc",
  accent_color: "#00a8b5",
  background_color: "#0a192f",
  tagline: "Property intelligence, end to end",
  call_to_action: "Start your free trial",
  website: "aurixasystems.com",
});
const brand = compositionBrandOf(kit);

const sizes = (assetId: string) =>
  assetId === SCREEN
    ? { width: 1600, height: 1000 }
    : assetId === LOGO
      ? { width: 800, height: 200 }
      : null;

function compiled(
  spec: CompositionSpec,
  quality: "draft" | "final" = "draft",
  width = 1080,
  height = 1920,
) {
  return compileComposition({
    spec,
    brand,
    width,
    height,
    fps: 30,
    settings: QUALITY_SETTINGS[quality],
    imageInfo: sizes,
  });
}

function spec(
  templateId: string,
  params: Record<string, unknown> = {},
  duration?: number,
): CompositionSpec {
  const template = templateById(templateId)!;
  return {
    template: templateId,
    version: template.version,
    params,
    duration: duration ?? template.duration.default,
  };
}

describe("a composition's state, frame by frame", () => {
  test("a frame's changes are only what differs from the last drawing, and the last is brought up to date", () => {
    const last = new Map();
    const first = new CompositionState().set(".box", { opacity: 0, transform: "none" }).diff(last);
    expect(first).toEqual([[".box", null, { opacity: "0", transform: "none" }]]);
    const second = new CompositionState()
      .set(".box", { opacity: 0.5, transform: "none" })
      .diff(last);
    expect(second).toEqual([[".box", null, { opacity: "0.5" }]]);
    expect(
      new CompositionState().set(".box", { opacity: 0.5, transform: "none" }).diff(last),
    ).toEqual([]);
  });

  test("numbers are rounded to thousandths, so a value that barely moves isn't a change", () => {
    const last = new Map();
    new CompositionState().set(".a", { opacity: 0.12341 }).diff(last);
    expect(new CompositionState().set(".a", { opacity: 0.12344 }).diff(last)).toEqual([]);
  });

  test("the nth match of a selector is its own element", () => {
    const updates = new CompositionState()
      .set(".row", { opacity: 1 }, 0)
      .set(".row", { opacity: 0 }, 1)
      .diff(new Map());
    expect(updates).toEqual([
      [".row", 0, { opacity: "1" }],
      [".row", 1, { opacity: "0" }],
    ]);
  });

  test("curves are solved as a browser solves cubic-bezier", () => {
    const linear = bezier(0, 0, 1, 1);
    expect(linear(0.37)).toBeCloseTo(0.37, 4);
    const move = bezier(0.2, 0, 0, 1);
    expect(move(0)).toBe(0);
    expect(move(1)).toBe(1);
    // The emphasized ease is well past half way at half time.
    expect(move(0.5)).toBeGreaterThan(0.8);
    expect(parseCubicBezier("cubic-bezier(0.22, 1, 0.36, 1)")).toEqual([0.22, 1, 0.36, 1]);
    expect(parseCubicBezier("ease-out")).toBeNull();
  });
});

describe("drawing settings", () => {
  test("one drawing a frame is taken at the frame's own time", () => {
    expect(drawingTimes(3, QUALITY_SETTINGS.draft, 30)).toEqual([0.1]);
  });

  test("eight drawings spread over a 180° shutter, centred on the frame", () => {
    const times = drawingTimes(30, QUALITY_SETTINGS.final, 30);
    expect(times).toHaveLength(8);
    const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
    expect(mean).toBeCloseTo(1, 9);
    // Open for half the frame: from a quarter frame before to a quarter after.
    expect(times[0]! - 1).toBeCloseTo((-0.25 + 1 / 32) / 30, 9);
    expect(times[7]! - 1).toBeCloseTo((0.25 - 1 / 32) / 30, 9);
  });

  test("whole frames, at least one", () => {
    expect(frameCount(5, 30)).toBe(150);
    expect(frameCount(0.01, 30)).toBe(1);
  });

  test("an estimate counts the drawings that change, when it knows them", () => {
    const all = renderEstimate({
      frames: 150,
      settings: QUALITY_SETTINGS.final,
      width: 1080,
      height: 1920,
    });
    const some = renderEstimate({
      frames: 150,
      settings: QUALITY_SETTINGS.final,
      changing: 300,
      width: 1080,
      height: 1920,
    });
    expect(all.drawings).toBe(1200);
    expect(some.drawings).toBe(300);
    expect(some.seconds).toBeLessThan(all.seconds);
    // Measured on this media service: its own cost is used.
    const measured = renderEstimate({
      frames: 150,
      settings: QUALITY_SETTINGS.final,
      changing: 300,
      secondsPerDrawing: 1,
      width: 1080,
      height: 1920,
    });
    expect(measured.seconds).toBe(Math.round(8 + 1.5 + 300 / 2));
  });
});

describe("the demo record", () => {
  test("a template's text is filled from the record", () => {
    expect(fillDemo("{{record.title}} for {{client.company}}", DEFAULT_DEMO_RECORD)).toEqual({
      text: "Project Aurora for Banksia Partners",
      missing: [],
    });
  });

  test("a field the record lacks is left out, never shown as a placeholder, and reported", () => {
    const filled = fillDemo("Call {{client.phone}} today", DEFAULT_DEMO_RECORD);
    expect(filled.text).toBe("Call today");
    expect(filled.missing).toEqual(["client.phone"]);
    expect(demoPaths("{{a.b}} and {{ a.b }} and {{c.d}}")).toEqual(["a.b", "c.d"]);
  });

  test("renaming the record is one edit", () => {
    const renamed = structuredClone(DEFAULT_DEMO_RECORD);
    renamed.entities.find((entity) => entity.key === "record")!.fields[0]!.value =
      "14 Wattle Grove";
    expect(demoValue(renamed, "record.title")).toBe("14 Wattle Grove");
    const before = compiled(spec("record-card"));
    const after = compileComposition({
      spec: spec("record-card"),
      brand: { ...brand, demo: renamed },
      width: 1080,
      height: 1920,
      fps: 30,
      settings: QUALITY_SETTINGS.draft,
      imageInfo: sizes,
    });
    expect(before.bundle.html).toContain("Project Aurora");
    expect(after.bundle.html).toContain("14 Wattle Grove");
    expect(after.bundle.html).not.toContain("Project Aurora");
    expect(compositionIdentity(after)).not.toBe(compositionIdentity(before));
  });

  test("a stored record is read tolerantly: what doesn't fit is dropped, the rest kept", () => {
    const read = demoRecordOf({
      label: "Aurixa demo",
      entities: [
        {
          key: "record",
          label: "The property",
          fields: [
            { key: "title", label: "Title", value: "14 Wattle Grove" },
            { key: "Bad Key", label: "Nope", value: "x" },
          ],
        },
        { key: "", label: "nameless", fields: [] },
      ],
      lists: [
        { key: "items", label: "Stock", columns: ["Address"], rows: [["12 Banksia Rd"]] },
        "junk",
      ],
    });
    expect(read?.label).toBe("Aurixa demo");
    expect(read?.entities).toHaveLength(1);
    expect(read?.entities[0]!.fields.map((field) => field.key)).toEqual(["title"]);
    expect(demoList(read!, "items")?.rows).toEqual([["12 Banksia Rd"]]);
    expect(demoRecordOf(null)).toBeNull();
    expect(demoRecordOf("nope")).toBeNull();
  });

  test("a kit keeps its own record, and compositions read it", () => {
    const own = structuredClone(DEFAULT_DEMO_RECORD);
    own.label = "Aurixa demo workspace";
    const withRecord = brandKitOf({ id: KIT, name: "Aurixa", demo_record: own });
    expect(withRecord.demoRecord?.label).toBe("Aurixa demo workspace");
    expect(compositionBrandOf(withRecord).demo.label).toBe("Aurixa demo workspace");
    expect(brandKitOf({ id: KIT, name: "Aurixa" }).demoRecord).toBeNull();
    expect(compositionBrandOf(brandKitOf({ id: KIT, name: "Aurixa" })).demo).toEqual(
      DEFAULT_DEMO_RECORD,
    );
  });
});

describe("a kit's look and motion", () => {
  test("any kit, or none, gives every role", () => {
    for (const colours of [compositionColours(null), compositionColours(kit)])
      for (const value of Object.values(colours)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    expect(compositionColours(kit).ground).toBe("#0a192f");
  });

  test("a kit's production roles come first: Aurixa's gold is its signature, drawn as the highlight", () => {
    let production = withRole(EMPTY_PRODUCTION, "ground", colourByHand("#040B16"));
    production = withRole(production, "surface", colourByHand("#0B162C"));
    production = withRole(production, "signature", colourByHand("#C89B3C"));
    production = withRole(production, "line", colourByHand("hsl(0 0% 100% / 0.5)"));
    const produced = brandKitOf({
      id: KIT,
      name: "Aurixa",
      background_color: "#0a192f",
      production,
    });
    const colours = compositionColours(produced);
    expect(colours.ground).toBe("#040b16");
    expect(colours.surface).toBe("#0b162c");
    expect(colours.highlight).toBe("#c89b3c");
    // A translucent line is seen over the surface it is drawn on.
    expect(colours.line).toBe("#858b96");
  });

  test("a kit's curves and press time move its compositions", () => {
    let production = withRole(
      EMPTY_PRODUCTION,
      "move",
      motionByHand("cubic-bezier(0.2, 0, 0, 1)", null),
    );
    production = withRole(
      production,
      "settle",
      motionByHand("cubic-bezier(0.22, 1, 0.36, 1)", null),
    );
    production = withRole(production, "press", motionByHand(null, 320));
    const moving = brandKitOf({ id: KIT, name: "Aurixa", production });
    expect(kitMotion(moving)).toEqual({
      move: [0.2, 0, 0, 1],
      settle: [0.22, 1, 0.36, 1],
      pressSeconds: 0.32,
    });
    expect(compositionBrandOf(moving).motion.settle).toEqual([0.22, 1, 0.36, 1]);
    // What a composition is asked to move with wins over the kit's.
    expect(compositionBrandOf(moving, { motion: { pressSeconds: 0.5 } }).motion.pressSeconds).toBe(
      0.5,
    );
    expect(kitMotion(null)).toEqual({});
  });
});

describe("the templates", () => {
  test("thirteen, each with a unique id, defaults for every setting, and a length it may run", () => {
    expect(TEMPLATES).toHaveLength(13);
    expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(13);
    for (const template of TEMPLATES) {
      expect(template.schema.safeParse({}).success).toBe(true);
      expect(template.duration.min).toBeLessThanOrEqual(template.duration.default);
      expect(template.duration.default).toBeLessThanOrEqual(template.duration.max);
      for (const field of template.fields)
        expect(field.key in template.schema.parse({})).toBe(true);
    }
  });

  for (const template of TEMPLATES)
    for (const [width, height] of [
      [1080, 1920],
      [1920, 1080],
      [1080, 1080],
    ] as const)
      test(`${template.id} builds and plays at ${width}x${height}`, () => {
        const params =
          template.id === "product-window"
            ? { image: SCREEN }
            : template.id === "pages-running-past"
              ? { pages: [SCREEN, SCREEN] }
              : {};
        const scene = buildScene({
          spec: spec(template.id, params),
          brand,
          width,
          height,
          fps: 30,
          imageInfo: sizes,
          imageUrl: (assetId) => `https://example.test/${assetId}`,
          fontUrl: () => "",
        });
        expect(scene.document).toContain('<div class="cx-frame" id="cx-frame">');
        expect(scene.document).not.toContain("{{");
        expect(scene.missing).toEqual([]);
        for (const time of [0, template.duration.default / 2, template.duration.default]) {
          const updates = scene.scene.state(time).diff(new Map());
          expect(Array.isArray(updates)).toBe(true);
          for (const [, , props] of updates)
            for (const value of Object.values(props))
              expect(value).not.toMatch(/NaN|undefined|Infinity/);
        }
        for (const beat of scene.scene.beats) {
          expect(beat.at).toBeGreaterThanOrEqual(0);
          expect(beat.at).toBeLessThanOrEqual(template.duration.max);
        }
      });

  const reportPage = (
    demo: DemoRecord,
    params: Record<string, unknown> = {},
    [width, height] = [1080, 1920],
  ) =>
    buildScene({
      spec: spec("report-page", params),
      brand: { ...brand, demo },
      width,
      height,
      fps: 30,
      imageInfo: sizes,
      imageUrl: () => "",
      fontUrl: () => "",
    });

  test("a report page with no bars of its own draws the record's grade, and a record without one the illustrative bars", () => {
    const bars = (demo: DemoRecord, params: Record<string, unknown> = {}) => {
      const document = reportPage(demo, params).document;
      const values = [...document.matchAll(/id="rp-val-\d+"[^>]*>([^<]*)</g)].map((m) => m[1]);
      const row = /<div class="rp-labels">(.*?)<\/div>/.exec(document)?.[1] ?? "";
      const labels = [...row.matchAll(/<span>([^<]*)<\/span>/g)].map((m) => m[1]);
      return { values, labels };
    };
    const graded: DemoRecord = {
      ...DEFAULT_DEMO_RECORD,
      lists: [
        {
          key: "grade",
          label: "How the grade was reached",
          columns: ["Dimension", "Score", "Weight"],
          rows: [
            ["Capital growth", "86 / 100", "40%"],
            ["Location", "90 / 100", "25%"],
            ["Rental yield", "72 / 100", "15%"],
            ["", "50", "5%"],
          ],
        },
      ],
    };
    // The record's own scores, its first number a row (never "86 / 100" read as 86100); a row with no label left out.
    expect(bars(graded)).toEqual({
      values: ["86", "90", "72"],
      labels: ["Capital growth", "Location", "Rental yield"],
    });
    expect(gradeBars(graded)).toEqual(["Capital growth: 86", "Location: 90", "Rental yield: 72"]);
    // Bars a person set win; a record with no grade list draws the plainly illustrative five.
    expect(bars(graded, { bars: ["Risk: 40"] }).values).toEqual(["40"]);
    expect(gradeBars(DEFAULT_DEMO_RECORD)).toBeNull();
    expect(bars(DEFAULT_DEMO_RECORD).values).toEqual(["78", "92", "64", "85", "71"]);
  });

  test("under the record's own bars, a report page shows how the grade was reached, as many rows as it has room for", () => {
    const grade = (rows: number) => ({
      key: "grade",
      label: "How the grade was reached",
      columns: ["Dimension", "Score", "Weight", "Points", "Note"],
      rows: Array.from({ length: rows }, (_, k) => [
        `Dimension ${k + 1}`,
        `${80 + k} / 100`,
        "20%",
        `${16 + k}.00`,
        "x",
      ]),
    });
    const working = (
      demo: DemoRecord,
      params: Record<string, unknown> = {},
      size?: [number, number],
    ) => {
      const scene = reportPage(demo, params, size);
      const html = scene.document;
      const cells = (id: string) =>
        [
          ...(new RegExp(`id="${id}">(.*?)</div>`).exec(html)?.[1] ?? "").matchAll(
            /<span>([^<]*)<\/span>/g,
          ),
        ].map((m) => m[1]);
      const rows = [...html.matchAll(/id="rp-row-(\d+)"/g)].map((m) => cells(`rp-row-${m[1]}`));
      return {
        title: /id="rp-work-title">([^<]*)</.exec(html)?.[1] ?? null,
        head: cells("rp-row-head"),
        rows,
        scene,
      };
    };
    const five = { ...DEFAULT_DEMO_RECORD, lists: [grade(5)] };
    // The record's own rows under its bars, in its own columns (at most four), each row arriving after the last bar.
    const shown = working(five);
    expect(shown.title).toBe("How the grade was reached");
    expect(shown.head).toEqual(["Dimension", "Score", "Weight", "Points"]);
    expect(shown.rows).toEqual(grade(5).rows.map((row) => row.slice(0, 4)));
    const beats = shown.scene.scene.beats.map((beat) => beat.label);
    expect(beats.indexOf("How the grade was reached is shown")).toBe(
      beats.indexOf("The chart is drawn") + 1,
    );
    const lastBeat = shown.scene.scene.beats.at(-1)!;
    expect(lastBeat.at).toBeLessThanOrEqual(5 - 0.8);
    // None when it's turned off, when the bars are a person's own, or when the record has no grade list.
    expect(working(five, { working: false }).rows).toEqual([]);
    expect(working(five, { bars: ["Risk: 40", "Yield: 50"] }).rows).toEqual([]);
    expect(working(DEFAULT_DEMO_RECORD).rows).toEqual([]);
    // A page takes as many rows as it has room for, each at least 30 units high: five on a phone's page and on a
    // landscape one, and of eight, more on a phone's than on the shorter landscape page.
    const eight = { ...DEFAULT_DEMO_RECORD, lists: [grade(8)] };
    expect(working(five, {}, [1920, 1080]).rows.length).toBe(5);
    const wide = working(eight, {}, [1920, 1080]);
    expect(working(eight).rows.length).toBeGreaterThan(wide.rows.length);
    expect(wide.rows.length).toBeGreaterThanOrEqual(2);
    for (const time of [0, 2.5, 5])
      for (const [, , props] of wide.scene.scene.state(time).diff(new Map()))
        for (const value of Object.values(props))
          expect(value).not.toMatch(/NaN|undefined|Infinity/);
  });

  test("a client's file with no documents of its own lists the record's, and a record without any the illustrative three", () => {
    const listed = (demo: DemoRecord, params: Record<string, unknown> = {}) => {
      const document = buildScene({
        spec: spec("client-file", params),
        brand: { ...brand, demo },
        width: 1080,
        height: 1920,
        fps: 30,
        imageInfo: sizes,
        imageUrl: () => "",
        fontUrl: () => "",
      }).document;
      return [...document.matchAll(/id="fl-doc-\d+"><i><\/i>([^<]*)</g)].map((m) => m[1]);
    };
    const withDocuments: DemoRecord = {
      ...DEFAULT_DEMO_RECORD,
      lists: [
        {
          key: "documents",
          label: "The matter's documents",
          columns: ["Document", "From", "Status"],
          rows: [
            ["Contract of sale (draft)", "Other side", "Under review"],
            ["", "Builder", "Accepted"],
            ["Planning certificate", "Other side", "Requested"],
          ],
        },
      ],
    };
    // The record's own papers by name, a row without one left out; a person's own list wins.
    expect(listed(withDocuments)).toEqual(["Contract of sale (draft)", "Planning certificate"]);
    expect(recordDocuments(withDocuments)).toEqual([
      "Contract of sale (draft)",
      "Planning certificate",
    ]);
    expect(listed(withDocuments, { documents: ["Deposit receipt.pdf"] })).toEqual([
      "Deposit receipt.pdf",
    ]);
    expect(recordDocuments(DEFAULT_DEMO_RECORD)).toBeNull();
    expect(listed(DEFAULT_DEMO_RECORD)).toEqual([
      "Engagement letter.pdf",
      "Project Aurora report.pdf",
      "Signed approval.pdf",
    ]);
  });

  test("settings a template can't take are refused, with which and why", () => {
    expect(() =>
      buildScene({
        spec: spec("record-card", { title: "x".repeat(500) }),
        brand,
        width: 1080,
        height: 1920,
        fps: 30,
        imageUrl: () => "",
        fontUrl: () => "",
      }),
    ).toThrow(/title/);
    expect(() =>
      buildScene({
        spec: { template: "nope", version: 1, params: {}, duration: 3 },
        brand,
        width: 1080,
        height: 1920,
        fps: 30,
        imageUrl: () => "",
        fontUrl: () => "",
      }),
    ).toThrow(/no composition template/);
  });

  test("the pictures a composition shows are the ones its settings name", () => {
    const scene = compiled(spec("product-window", { image: SCREEN }));
    expect(scene.imageIds).toEqual([SCREEN]);
    expect(scene.bundle.images).toEqual([SCREEN]);
    expect(scene.bundle.html).toContain("https://composition.local/image/0");
    expect(
      [...uuidsIn({ a: [SCREEN, { b: LOGO.toUpperCase() }], c: "not-a-uuid" })].sort(),
    ).toEqual([SCREEN, LOGO].sort());
  });
});

describe("compiling for the media service", () => {
  test("a drawing a frame at draft, each still frame reusing the one before", () => {
    const { bundle, changing } = compiled(spec("big-number", {}, 4));
    expect(bundle.frames).toBe(120);
    expect(bundle.drawings).toHaveLength(120);
    expect(bundle.drawings[0]).not.toBe(0);
    const reused = bundle.drawings.filter((drawing) => drawing === 0).length;
    expect(reused).toBeGreaterThan(10);
    expect(changing).toBe(120 - reused);
  });

  test("eight drawings a frame at final", () => {
    const { bundle } = compiled(spec("big-number", {}, 4), "final");
    expect(bundle.drawings).toHaveLength(960);
    expect(bundle.settings).toEqual(QUALITY_SETTINGS.final);
  });

  test("its identity is the same for the same composition, and differs for any change that draws differently", () => {
    const one = compositionIdentity(compiled(spec("title-card")));
    expect(compositionIdentity(compiled(spec("title-card")))).toBe(one);
    expect(compositionIdentity(compiled(spec("title-card"), "final"))).not.toBe(one);
    expect(compositionIdentity(compiled(spec("title-card"), "draft", 1080, 1080))).not.toBe(one);
    expect(compositionIdentity(compiled(spec("title-card", { headline: "Hello" })))).not.toBe(one);
    expect(compositionFiles(compiled(spec("title-card")))).toEqual([`image:${LOGO}`]);
  });

  test("a long composition's stretches are whole frames, in order, covering it once", () => {
    for (const frames of [1, 100, 239, 360, 361, 1800, 3600]) {
      const stretches = planStretches(frames);
      expect(stretches[0]!.from).toBe(0);
      expect(stretches.at(-1)!.to).toBe(frames);
      for (let k = 1; k < stretches.length; k += 1)
        expect(stretches[k]!.from).toBe(stretches[k - 1]!.to);
      for (const { from, to } of stretches)
        expect(to - from).toBeLessThanOrEqual(Math.ceil(STRETCH_FRAMES * 1.5));
    }
  });

  test("a change to one stretch leaves the others' identities, and so their drawings, as they were", () => {
    const { bundle } = compiled(spec("big-number", {}, 20));
    const plan = planStretches(bundle.frames, 240);
    expect(plan).toHaveLength(3);
    const files: string[] = [];
    const before = plan.map(({ from, to }) => stretchIdentity(bundle, from, to, files));
    // The last stretch's drawings change; the first two are untouched.
    const changed: CompositionBundle = structuredClone(bundle);
    changed.drawings[plan[2]!.from * changed.settings.drawings + 5] = [[0, -1, { opacity: "0.5" }]];
    const after = plan.map(({ from, to }) => stretchIdentity(changed, from, to, files));
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).not.toBe(before[2]);
  });

  test("the state a stretch starts from is everything set before it, said one way", () => {
    const { bundle } = compiled(spec("big-number", {}, 4));
    const at = stateAtFrame(bundle, 60);
    expect(stateAtFrame(structuredClone(bundle), 60)).toBe(at);
    expect(stateAtFrame(bundle, 0)).toBe("[]");
  });
});

describe("a composition as an edit keeps it", () => {
  const made = spec("title-card", { headline: "Every property, one view" });
  const drawing: Drawing = {
    assetId: DRAWN,
    renderId: RENDER,
    spec: made,
    brandKitId: KIT,
    quality: "draft",
  };

  test("its key is the same whatever order its settings are written in", () => {
    const a = specKey({ ...made, params: { a: 1, b: { c: 2, d: 3 } } }, KIT);
    const b = specKey({ ...made, params: { b: { d: 3, c: 2 }, a: 1 } }, KIT);
    expect(a).toBe(b);
    expect(specKey(made, null)).not.toBe(specKey(made, KIT));
  });

  test("a drawing placed as a clip plays whole, keeps its composition, and is current", () => {
    const clip = compositionClip(drawing);
    expect(clip.assetId).toBe(DRAWN);
    expect(clip.kind).toBe("video");
    expect(clip.duration).toBe(made.duration);
    expect(clip.label).toBe("Motion · Title card");
    expect(compositionCurrent(clip.composition!)).toBe(true);
    expect(compositionCurrent({ ...clip.composition!, spec: { ...made, duration: 9 } })).toBe(
      false,
    );
  });

  test("an edit with a composition clip reads back with it, and older edits read as they did", () => {
    const clip = compositionClip(drawing);
    const timeline = parseTimeline({ fps: 30, clips: [clip] }) as Timeline;
    expect(compositionClips(timeline)).toHaveLength(1);
    expect(timeline.clips[0]!.composition?.renderId).toBe(RENDER);
    const plain = parseTimeline({
      fps: 30,
      clips: [{ id: "c", assetId: SCREEN, kind: "video", duration: 3 }],
    })!;
    expect(plain.clips[0]!.composition).toBeUndefined();
    expect(compositionClips(plain)).toEqual([]);
  });

  test("a new drawing of the clip keeps its trim when it runs as long, and plays whole when not", () => {
    const placed = compositionClip(drawing);
    const timeline = parseTimeline({
      fps: 30,
      clips: [
        { ...placed, trimStart: 0.5, duration: 2, transition: { type: "fade", duration: 0.5 } },
      ],
    })!;
    const id = timeline.clips[0]!.id;
    const again = withDrawing(timeline, id, { ...drawing, assetId: SCREEN, quality: "final" });
    expect(again.clips[0]!.trimStart).toBe(0.5);
    expect(again.clips[0]!.duration).toBe(2);
    expect(again.clips[0]!.assetId).toBe(SCREEN);
    expect(again.clips[0]!.composition?.quality).toBe("final");
    expect(again.clips[0]!.transition.type).toBe("fade");
    const longer = withDrawing(timeline, id, { ...drawing, spec: { ...made, duration: 6 } });
    expect(longer.clips[0]!.trimStart).toBe(0);
    expect(longer.clips[0]!.duration).toBe(6);
    expect(withDrawing(timeline, "gone", drawing)).toBe(timeline);
  });

  test("a label the person named stays; one named after the template follows it", () => {
    const placed = compositionClip(drawing);
    const timeline = parseTimeline({ fps: 30, clips: [placed] })!;
    const id = timeline.clips[0]!.id;
    const swapped = withDrawing(timeline, id, { ...drawing, spec: spec("big-number") });
    expect(swapped.clips[0]!.label).toBe(compositionLabel(spec("big-number")));
    const named = parseTimeline({ fps: 30, clips: [{ ...placed, label: "Opening card" }] })!;
    expect(
      withDrawing(named, named.clips[0]!.id, { ...drawing, spec: spec("big-number") }).clips[0]!
        .label,
    ).toBe("Opening card");
  });
});

describe("the studio API's motion graphics", () => {
  test("each operation's input can be described to an API client", async () => {
    const { COMPOSITION_TOOLS } = await import("../../src/lib/studio-api/compositions.server");
    expect(COMPOSITION_TOOLS.map((tool) => tool.name)).toEqual([
      "list_motion_templates",
      "draw_motion_graphic",
      "get_motion_graphic",
      "set_demo_record",
    ]);
    for (const tool of COMPOSITION_TOOLS) {
      const schema = z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" });
      expect(schema).toHaveProperty("type", "object");
    }
    expect(COMPOSITION_TOOLS.find((tool) => tool.name === "draw_motion_graphic")?.scope).toBe(
      "edit",
    );
  });
});
