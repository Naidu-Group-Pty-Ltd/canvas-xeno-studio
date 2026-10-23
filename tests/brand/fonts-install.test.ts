import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";
import { buildFont } from "../edit/font-fixture";

/** The admin client, with a font bucket: what is stored, and what was uploaded. */
class FontsDb extends FakeDb {
  stored = new Map<string, Uint8Array>();
  override storage = {
    from: () => ({
      download: async (path: string) => {
        const bytes = this.stored.get(path);
        return bytes
          ? { data: new Blob([bytes]), error: null }
          : { data: null, error: { message: "Object not found" } };
      },
      upload: async (path: string, bytes: Uint8Array) => {
        this.stored.set(path, bytes);
        return { data: { path }, error: null };
      },
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://storage.test/${path}` },
        error: null,
      }),
    }),
  };
}

const db = new FontsDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

const ADVANCES = { a: 500, b: 520, c: 480 };
const UPRIGHT = buildFont({ family: "Playfair Display", weight: 500, advances: ADVANCES });
const ITALIC = buildFont({
  family: "Playfair Display",
  weight: 500,
  italic: true,
  advances: ADVANCES,
});

/** Google, as it answers the studio: a stylesheet per family and face, and the TrueType files. */
const stylesheets = new Map<string, string>();
const files = new Map<string, Uint8Array>();
const asked: string[] = [];
function face(style: "normal" | "italic", url: string) {
  return `@font-face {
  font-family: 'Playfair Display';
  font-style: ${style};
  font-weight: 500;
  font-display: swap;
  src: url(${url}) format('truetype');
}`;
}

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    asked.push(url);
    // The public-address check's DNS lookup: Google's hosts are public.
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      const type = new URL(url).searchParams.get("type");
      return Response.json({
        Status: 0,
        Answer: type === "A" ? [{ type: 1, data: "142.250.70.10" }] : [],
      });
    }
    const css = stylesheets.get(url);
    if (css !== undefined)
      return new Response(css, { headers: { "content-type": "text/css; charset=utf-8" } });
    const file = files.get(url);
    if (file) return new Response(file, { headers: { "content-type": "font/ttf" } });
    return new Response("Font family not found", { status: 400 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

type Fonts = typeof import("../../src/lib/brand/fonts.server");
let fonts: Fonts;
beforeAll(async () => {
  fonts = await import("../../src/lib/brand/fonts.server");
});

const ITALIC_CSS =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&display=swap";
const UPRIGHT_CSS =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500&display=swap";

describe("a brand's typeface from Google Fonts", () => {
  test("its italic is installed as an italic of its own, beside the upright face", async () => {
    stylesheets.set(ITALIC_CSS, face("italic", "https://fonts.gstatic.com/s/pd/italic-500.ttf"));
    files.set("https://fonts.gstatic.com/s/pd/italic-500.ttf", ITALIC);
    stylesheets.set(UPRIGHT_CSS, face("normal", "https://fonts.gstatic.com/s/pd/upright-500.ttf"));
    files.set("https://fonts.gstatic.com/s/pd/upright-500.ttf", UPRIGHT);

    const italic = await fonts.installGoogleFont("Playfair Display", 500, "italic");
    expect(italic).toEqual({
      family: "Playfair Display",
      bucket: "generation-inputs",
      path: "brand-fonts/google/playfair-display-500-italic.ttf",
      style: "italic",
    });
    expect(db.stored.get("brand-fonts/google/playfair-display-500-italic.ttf")).toEqual(ITALIC);

    // The upright face as it always was: its own file, taken for the regular.
    const upright = await fonts.installGoogleFont("Playfair Display", 500);
    expect(upright).toEqual({
      family: "Playfair Display",
      bucket: "generation-inputs",
      path: "brand-fonts/google/playfair-display-500.ttf",
    });

    // Installed once: asked again, the stored file serves.
    const before = asked.length;
    expect(await fonts.installGoogleFont("Playfair Display", 500, "italic")).toEqual(italic);
    expect(asked.slice(before).some((url) => url.includes("fonts.gstatic.com"))).toBe(false);
  });

  test("a family with no italic has none installed: never its upright face standing in", async () => {
    // Google refuses the ital axis for it, and offers only its upright face otherwise.
    stylesheets.set(
      "https://fonts.googleapis.com/css2?family=Upright+Only:ital@1&display=swap",
      face("normal", "https://fonts.gstatic.com/s/uo/upright.ttf"),
    );
    files.set("https://fonts.gstatic.com/s/uo/upright.ttf", UPRIGHT);
    expect(await fonts.installGoogleFont("Upright Only", 500, "italic")).toBeNull();
    expect([...db.stored.keys()].some((path) => path.includes("upright-only"))).toBe(false);
  });

  test("a file sent as an italic that isn't one is not kept as one", async () => {
    stylesheets.set(
      "https://fonts.googleapis.com/css2?family=Mislabelled:ital,wght@1,500&display=swap",
      face("italic", "https://fonts.gstatic.com/s/ml/not-italic.ttf"),
    );
    files.set("https://fonts.gstatic.com/s/ml/not-italic.ttf", UPRIGHT);
    expect(await fonts.installGoogleFont("Mislabelled", 500, "italic")).toBeNull();
  });
});
