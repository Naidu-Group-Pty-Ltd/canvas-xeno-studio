import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  addEndCard,
  applyBrandKit,
  brandKitOf,
  clearBrand,
  contrastOn,
  endCardLayout,
  fontChoices,
  kitForProject,
  safeInsets,
  type BrandKit,
} from "../../src/lib/edit/brand";
import { fontFamily, fontKind, isBrandFontFile } from "../../src/lib/edit/font-family";
import {
  buildRenderRequest,
  layoutTimeline,
  parseTimeline,
  type Timeline,
} from "../../src/lib/edit/timeline";

const A = "11111111-1111-4111-8111-111111111111";
const LOGO = "22222222-2222-4222-8222-222222222222";
const CARD = "33333333-3333-4333-8333-333333333333";
const FONT = { family: "Aurixa Sans", bucket: "generation-inputs", path: "brand-fonts/a.ttf" };

const kit: BrandKit = brandKitOf({
  id: "44444444-4444-4444-8444-444444444444",
  name: "Aurixa Systems",
  is_default: true,
  logo_asset_id: LOGO,
  end_card_asset_id: CARD,
  heading_font: "Aurixa Sans",
  body_font: "Inter",
  fonts: [FONT, { family: "Sneaky", bucket: "generated-assets", path: "renders/x.ttf" }],
  text_color: "#FFFFFF",
  accent_color: "#1e40af",
  background_color: "#0b1020",
  title_backing: "box",
  uppercase_titles: true,
  tagline: "Your business. Your decision.",
  call_to_action: "Start your 14-day trial",
  website: "aurixasystems.com.au",
  terms: ["Aurixa Systems", "", 3],
});

function edit(extra: Record<string, unknown> = {}): Timeline {
  return parseTimeline({
    aspectRatio: "9:16",
    clips: [{ id: "c1", assetId: A, kind: "video", duration: 6 }],
    overlays: [
      { id: "t1", text: "Aurixa Systems", start: 0, end: 2, style: "title" },
      { id: "s1", text: "Fourteen days", start: 2, end: 4, style: "subtitle" },
      { id: "x1", text: "Try it", start: 4, end: 6, style: "cta" },
    ],
    captions: { enabled: true, segments: [{ start: 0, end: 2, text: "Hello" }] },
    ...extra,
  })!;
}

describe("a brand kit", () => {
  test("is read from its row, keeping only fonts kept where brand fonts are", () => {
    expect(kit.fonts).toEqual([FONT]);
    expect(kit.bodyFont).toBeNull();
    expect(kit.textColor).toBe("#ffffff");
    expect(kit.terms).toEqual(["Aurixa Systems"]);
    expect(isBrandFontFile({ bucket: "generation-inputs", path: "brand-fonts/../x" })).toBe(false);
  });

  test("a project's own kit wins over the default", () => {
    const own = { ...kit, id: "p", isDefault: false, projectId: "proj" };
    expect(kitForProject([kit, own], "proj")?.id).toBe("p");
    expect(kitForProject([kit, own], "other")?.id).toBe(kit.id);
    expect(kitForProject([], null)).toBeNull();
  });

  test("applied, sets titles, calls to action and captions in its fonts and colours", () => {
    const branded = applyBrandKit(edit(), kit);
    expect(branded.brandKitId).toBe(kit.id);
    expect(branded.fonts).toEqual([FONT]);
    const [title, subtitle, cta] = branded.overlays;
    expect(title).toMatchObject({
      text: "AURIXA SYSTEMS",
      font: "Aurixa Sans",
      color: "#ffffff",
      accent: "#1e40af",
      backing: "box",
    });
    // Subtitles and captions are in the body font: Inter here.
    expect(subtitle).toMatchObject({ font: null, text: "Fourteen days" });
    // A call to action is a badge in the accent, its text in whichever of black or white reads.
    expect(cta).toMatchObject({ font: "Aurixa Sans", accent: "#1e40af", color: "#ffffff" });
    expect(branded.captions).toMatchObject({ font: null, color: "#ffffff", accent: "#1e40af" });
    expect(contrastOn("#fde047")).toBe("#000000");
    // Mid-bright accents read better in black (orange, teal); a deep rose in white.
    for (const accent of ["#ff8800", "#f97316", "#14b8a6"])
      expect(contrastOn(accent)).toBe("#000000");
    for (const accent of ["#1e40af", "#e11d48"]) expect(contrastOn(accent)).toBe("#ffffff");
  });

  test("a branded edit renders with its font file and colours; an older edit as it did", () => {
    const plain = buildRenderRequest(edit());
    expect(plain.fonts).toEqual([]);
    expect(plain.params["fonts"]).toBeUndefined();
    expect(plain.params["images"]).toBeUndefined();
    const overlays = plain.params["overlays"] as Record<string, unknown>[];
    expect(overlays[0]!["font"]).toBeUndefined();

    const branded = buildRenderRequest(applyBrandKit(edit(), kit));
    expect(branded.fonts).toEqual([FONT]);
    // The font file is sent after every library file.
    expect(branded.params["fonts"]).toEqual([
      { source_index: branded.sources.length, family: "Aurixa Sans" },
    ]);
    const title = (branded.params["overlays"] as Record<string, unknown>[])[0]!;
    expect(title).toMatchObject({ font: "Aurixa Sans", color: "#ffffff", accent: "#1e40af" });
  });

  test("a font the edit doesn't carry isn't asked for: the text is set in Inter", () => {
    const timeline = edit();
    timeline.overlays[0] = { ...timeline.overlays[0]!, font: "Missing Font" };
    const { params, fonts } = buildRenderRequest(timeline);
    expect(fonts).toEqual([]);
    expect((params["overlays"] as Record<string, unknown>[])[0]!["font"]).toBeUndefined();
  });

  test("a font kept anywhere else isn't taken into an edit", () => {
    expect(
      parseTimeline({
        clips: [{ id: "c1", assetId: A, kind: "video", duration: 2 }],
        fonts: [{ family: "X", bucket: "generated-assets", path: "brand-fonts/x.ttf" }],
      }),
    ).toBeNull();
  });

  test("offers each typeface once, Inter first, even when the brand installs Inter too", () => {
    const inter = { family: "Inter", bucket: "generation-inputs", path: "brand-fonts/inter.ttf" };
    expect(fontChoices([FONT, inter])).toEqual(["Inter", "Aurixa Sans"]);
    expect(fontChoices([])).toEqual(["Inter"]);
  });
});

describe("the platform's clear area and the end card", () => {
  test("an end card's parts sit inside the area the platform leaves clear, in order", () => {
    for (const area of ["tiktok", "reels", "shorts", "youtube", "none"] as const) {
      for (const aspect of ["9:16", "1:1", "16:9"] as const) {
        const insets = safeInsets(area, aspect);
        const place = endCardLayout(aspect, area);
        for (const y of [place.logoY, place.taglineY, place.ctaY, place.websiteY]) {
          expect(y).toBeGreaterThan(insets.top);
          expect(y).toBeLessThan(1 - insets.bottom);
        }
        expect(place.logoY).toBeLessThan(place.taglineY);
        expect(place.taglineY).toBeLessThan(place.ctaY);
        expect(place.x).toBeGreaterThan(insets.left);
        expect(place.x).toBeLessThan(1 - insets.right);
      }
    }
    // TikTok's buttons run up the right: the card's middle moves left of the frame's.
    expect(endCardLayout("9:16", "tiktok").x).toBeLessThan(0.5);
  });

  test("is added after the last clip: its background, the logo over it, and the kit's words", () => {
    const base = edit();
    const next = addEndCard(base, kit, {
      seconds: 3,
      area: "reels",
      background: { assetId: CARD, kind: "image", durationSeconds: null },
      logoAssetId: LOGO,
    });
    expect(next.clips).toHaveLength(2);
    const card = next.clips[1]!;
    expect(card).toMatchObject({ assetId: CARD, kind: "image", duration: 3, label: "End card" });
    expect(card.transition).toEqual({ type: "fade", duration: 0.5 });
    const laid = layoutTimeline(next).clips[1]!;

    expect(next.images).toHaveLength(1);
    const logo = next.images[0]!;
    expect(logo).toMatchObject({ assetId: LOGO, y: endCardLayout("9:16", "reels").logoY });
    expect(logo.start).toBeGreaterThanOrEqual(laid.start + laid.transitionIn);
    expect(logo.end).toBeCloseTo(laid.end, 3);

    const added = next.overlays.slice(base.overlays.length);
    expect(added.map((overlay) => [overlay.style, overlay.text])).toEqual([
      ["subtitle", "Your business. Your decision."],
      ["cta", "Start your 14-day trial"],
      ["subtitle", "aurixasystems.com.au"],
    ]);
    expect(added[1]).toMatchObject({ font: "Aurixa Sans", accent: "#1e40af" });
    // The heading font's file goes with the edit, for the call to action.
    expect(next.fonts).toEqual([FONT]);
    expect(next.brandKitId).toBe(kit.id);
    // ...and it renders: the background and the logo are both library files.
    const request = buildRenderRequest(next);
    expect(request.sources.map((source) => source.role)).toEqual(["video", "image", "image"]);
    expect(request.params["images"]).toHaveLength(1);
  });

  test("a very short video background still shows the logo and words", () => {
    const next = addEndCard(edit(), kit, {
      seconds: 3,
      area: "none",
      background: { assetId: CARD, kind: "video", durationSeconds: 0.6 },
      logoAssetId: LOGO,
    });
    const logo = next.images[0]!;
    expect(logo.end - logo.start).toBeGreaterThan(0.1);
    for (const overlay of next.overlays.slice(3))
      expect(overlay.end - overlay.start).toBeGreaterThan(0.1);
  });

  test("an edit can go back to the studio's own text style", () => {
    const plain = clearBrand(applyBrandKit(edit(), kit));
    expect(plain.brandKitId).toBeNull();
    expect(plain.fonts).toEqual([]);
    expect(
      plain.overlays.every((overlay) => !overlay.font && !overlay.color && !overlay.accent),
    ).toBe(true);
    expect(buildRenderRequest(plain).fonts).toEqual([]);
  });

  test("a video background is held only as long as it runs", () => {
    const next = addEndCard(edit(), kit, {
      seconds: 5,
      area: "none",
      background: { assetId: CARD, kind: "video", durationSeconds: 2.5 },
      logoAssetId: null,
    });
    expect(next.clips[1]!.duration).toBe(2.5);
    expect(next.images).toEqual([]);
  });
});

describe("a font file's own name", () => {
  const sample = ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"].find((path) =>
    existsSync(path),
  );

  test.skipIf(!sample)("is read from its name table", () => {
    const bytes = new Uint8Array(readFileSync(sample!));
    expect(fontKind(bytes)).toBe("ttf");
    expect(fontFamily(bytes)).toBe("Liberation Sans");
  });

  test("anything else isn't taken for a font", () => {
    expect(fontKind(new TextEncoder().encode("wOFF0000000000000"))).toBeNull();
    expect(fontFamily(new Uint8Array(8))).toBeNull();
  });
});
