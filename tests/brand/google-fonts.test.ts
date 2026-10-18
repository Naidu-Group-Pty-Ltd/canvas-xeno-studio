import { describe, expect, test } from "bun:test";
import {
  googleFontsCssUrl,
  parseFontFaceRules,
  pickFontFile,
  type FontFaceRule,
} from "../../src/lib/brand/google-fonts";

/** What Google sends a browser: WOFF2, a variable weight range, a file per subset. */
const BROWSER_CSS = `/* latin-ext */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7SUc.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}`;

/** What Google sends an agent it doesn't know: TrueType, a static file per weight and style. */
const TRUETYPE_CSS = `@font-face {
  font-family: 'Playfair Display';
  font-style: italic;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/playfairdisplay/v37/italic-700.ttf) format('truetype');
}
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/playfairdisplay/v37/normal-400.ttf) format('truetype');
}
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/playfairdisplay/v37/normal-700.ttf) format('truetype');
}`;

describe("the stylesheet address", () => {
  test("encodes the family and lists each weight once, in order", () => {
    expect(googleFontsCssUrl("Playfair Display", [700, 400, 400])).toBe(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
    );
    expect(googleFontsCssUrl("Inter")).toBe(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
    );
    expect(googleFontsCssUrl(" Noto  Sans & Co ", [Number.NaN])).toBe(
      "https://fonts.googleapis.com/css2?family=Noto+Sans+%26+Co:wght@400&display=swap",
    );
  });
});

describe("reading Google's answer", () => {
  test("one rule per file, a variable range kept as its bounds", () => {
    const faces = parseFontFaceRules(BROWSER_CSS);
    expect(faces).toHaveLength(2);
    expect(faces[1]).toEqual({
      family: "Inter",
      weight: 100,
      weightMax: 900,
      style: "normal",
      url: "https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2",
      format: "woff2",
      unicodeRange:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    });
    const truetype = parseFontFaceRules(TRUETYPE_CSS);
    expect(truetype.map((face) => [face.style, face.weight, face.weightMax, face.format])).toEqual([
      ["italic", 700, 700, "truetype"],
      ["normal", 400, 400, "truetype"],
      ["normal", 700, 700, "truetype"],
    ]);
  });

  test("keywords, missing formats, local() and junk", () => {
    const faces = parseFontFaceRules(`
      @font-face { font-family: "Lora"; font-weight: bold; src: local("Lora Bold"), url("https://example.com/lora-bold.otf"); }
      @font-face { font-family: Lora; font-style: oblique 10deg; src: url(/relative.ttf) format("truetype"); }
      @font-face { src: url(https://example.com/nameless.ttf); }
      @font-face { font-family: "Broken"; font-weight: heavy; src: url('https://example.com/b.ttf') format("truetype") }
      @font-face {`);
    expect(faces).toEqual([
      {
        family: "Lora",
        weight: 700,
        weightMax: 700,
        style: "normal",
        url: "https://example.com/lora-bold.otf",
        format: "opentype",
        unicodeRange: null,
      },
      {
        family: "Broken",
        weight: 400,
        weightMax: 400,
        style: "normal",
        url: "https://example.com/b.ttf",
        format: "truetype",
        unicodeRange: null,
      },
    ]);
    expect(parseFontFaceRules(undefined as unknown as string)).toEqual([]);
  });
});

describe("picking the file", () => {
  const truetype = parseFontFaceRules(TRUETYPE_CSS);
  const variable: FontFaceRule = {
    ...truetype[1]!,
    weight: 400,
    weightMax: 900,
    url: "https://fonts.gstatic.com/s/playfairdisplay/v37/variable.ttf",
  };

  test("only WOFF on offer: nothing the renderer can read", () => {
    expect(pickFontFile(parseFontFaceRules(BROWSER_CSS), 400)).toBeNull();
    expect(pickFontFile([], 400)).toBeNull();
  });

  test("the style, then the nearest weight", () => {
    expect(pickFontFile(truetype, 700)?.url).toEndWith("normal-700.ttf");
    expect(pickFontFile(truetype, 400)?.url).toEndWith("normal-400.ttf");
    expect(pickFontFile(truetype, 700, "italic")?.url).toEndWith("italic-700.ttf");
    // No italic at 300: the italic there is, not an upright at a nearer weight.
    expect(pickFontFile(truetype, 300, "italic")?.url).toEndWith("italic-700.ttf");
    expect(pickFontFile(truetype, 900)?.url).toEndWith("normal-700.ttf");
    expect(pickFontFile(truetype, 100)?.url).toEndWith("normal-400.ttf");
    // Halfway between two, as CSS breaks the tie: heavier for a bold request, lighter for a light one.
    const at = (weight: number) => ({
      ...truetype[1]!,
      weight,
      weightMax: weight,
      url: `https://x/${weight}.ttf`,
    });
    expect(pickFontFile([at(500), at(700)], 600)?.url).toBe("https://x/700.ttf");
    expect(pickFontFile([at(500), at(300)], 400)?.url).toBe("https://x/300.ttf");
    // An unknown style falls back to whatever there is.
    expect(pickFontFile(truetype, 400, "oblique")).not.toBeNull();
  });

  test("a variable range holding the weight wins, though a static file at it is preferred", () => {
    const faces = [...truetype, variable];
    expect(pickFontFile(faces, 800)?.url).toEndWith("variable.ttf");
    expect(pickFontFile(faces, 600)?.url).toEndWith("variable.ttf");
    expect(pickFontFile(faces, 700)?.url).toEndWith("normal-700.ttf");
  });

  test("the Latin subset beats a nearer weight in another", () => {
    const latinExt: FontFaceRule = {
      ...truetype[2]!,
      url: "https://x/latin-ext-700.ttf",
      unicodeRange: "U+0100-02BA, U+1E00-1E9F",
    };
    const latin: FontFaceRule = {
      ...truetype[1]!,
      url: "https://x/latin-400.ttf",
      unicodeRange: "U+0000-00FF, U+0131",
    };
    const wildcard: FontFaceRule = { ...latin, url: "https://x/wild.ttf", unicodeRange: "U+00??" };
    expect(pickFontFile([latinExt, latin], 700)?.url).toBe("https://x/latin-400.ttf");
    expect(pickFontFile([latinExt, wildcard], 700)?.url).toBe("https://x/wild.ttf");
  });

  test("TrueType before OpenType, all else equal", () => {
    const otf = { ...truetype[2]!, url: "https://x/a.otf", format: "opentype" };
    expect(pickFontFile([otf, truetype[2]!], 700)?.url).toEndWith("normal-700.ttf");
    expect(pickFontFile([otf], 700)?.url).toBe("https://x/a.otf");
  });
});
