import { describe, expect, test } from "bun:test";
import { scanCss, type CssSignals } from "../../src/lib/brand/scan-css";

/** A shadcn/ui theme on Tailwind v3: bare hsl channels in custom properties. */
const SHADCN = `
@tailwind base;
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --accent: 24.6 95% 53.1%;
    --border: 214.3 31.8% 91.4%;
    --ring: var(--primary);
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
  }
  * { border-color: hsl(var(--border)); }
  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: var(--font-sans);
  }
}
/* Defined after it's used: still resolved. */
:root { --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif; }
.bg-primary { background-color: hsl(var(--primary)); }
.text-primary-foreground { color: hsl(var(--primary-foreground)); }
.bg-accent { background-color: hsl(var(--accent) / 0.9); }
.hover\\:bg-primary\\/90:hover { background-color: hsl(var(--primary) / 0.9); }
.ring-ring { --tw-ring-color: hsl(var(--ring)); }
h1, h2, .font-display { font-family: "Playfair Display", Georgia, serif; }
.btn { font-family: 'Space Grotesk', sans-serif; background: hsl(var(--primary)); }
`;

/** Tailwind v4: an oklch palette in @layer theme, utilities reading it, a nested dark variant. */
const TAILWIND_V4 = `
@layer theme {
  :root, :host {
    --color-blue-500: oklch(0.623 0.214 259.815);
    --color-slate-900: oklch(0.208 0.042 265.755);
    --color-white: #fff;
    --font-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    --font-display: "Satoshi", "Inter", sans-serif;
  }
}
@layer base {
  html, :host { font-family: var(--default-font-family, var(--font-sans)); }
}
@layer utilities {
  .bg-blue-500 { background-color: var(--color-blue-500); }
  .text-white { color: var(--color-white); }
  .font-display { font-family: var(--font-display); }
  .dark\\:bg-slate-900 {
    &:where(.dark, .dark *) { background-color: var(--color-slate-900); }
  }
  .bg-brand { --brand: 37 99 235; background-color: rgb(var(--brand)); }
}
`;

/** Bootstrap 5.3's way: comma channel triples, opacity variables, a data-bs-theme dark scheme. */
const BOOTSTRAP = `
:root, [data-bs-theme=light] {
  --bs-primary: #0d6efd;
  --bs-primary-rgb: 13, 110, 253;
  --bs-body-font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif;
  --bs-body-color: #212529;
  --bs-body-bg: #fff;
}
[data-bs-theme=dark] { --bs-body-color: #dee2e6; --bs-body-bg: #212529; }
body {
  font-family: var(--bs-body-font-family);
  color: var(--bs-body-color);
  background-color: var(--bs-body-bg);
}
.btn-primary { --bs-btn-bg: #0d6efd; font: 600 1rem/1.5 "Nunito Sans", sans-serif; }
.text-bg-primary { color: #fff !important; background-color: RGBA(var(--bs-primary-rgb), var(--bs-bg-opacity, 1)) !important; }
.bg-primary { --bs-bg-opacity: 1; background-color: rgba(var(--bs-primary-rgb), var(--bs-bg-opacity)) !important; }
.border-danger { border: 1px solid #dc3545; }
.shadow { box-shadow: 0 .5rem 1rem rgba(0, 0, 0, .1), inset 0 0 0 #0000, 0 0 2px #6610f2; }
.hero { background-image: linear-gradient(135deg, #6f42c1 0%, #d63384 100%); }
@media (prefers-color-scheme: dark) { .card { background: #111111 } }
@keyframes pulse { from { background-color: #ff00ff } to { background-color: #00ff00 } }
.icon { background: url(data:image/svg+xml;charset=utf-8,%3Csvg%20fill=%27red%27%3E) no-repeat; }
.quote::before { content: "#ff0000 red"; color: currentColor; }
a { color: var(--bs-link-color, #0a58ca); }
`;

const FACES = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap");
@import "theme.css" screen;
@import url(print.css) print;
@font-face {
  font-family: "Aurixa Sans";
  font-style: normal;
  font-weight: 100 900;
  src: url("../fonts/aurixa.woff2") format("woff2"),
    url(../fonts/aurixa.ttf) format('truetype'),
    local("Aurixa Sans"),
    url(data:font/woff2;base64,d09GMgABAAAAA) format("woff2");
}
@font-face {
  font-family: '__Inter_aaf875';
  src: url(/_next/static/media/inter.woff2) format('woff2');
  font-display: swap;
}
@font-face { font-family: '__Inter_Fallback_aaf875'; src: local("Arial"); }
.title { font-family: '__Inter_aaf875', '__Inter_Fallback_aaf875'; }
`;

const colour = (signals: CssSignals, hex: string) => signals.colours.find((c) => c.hex === hex);
const variable = (signals: CssSignals, name: string, dark = false) =>
  signals.variables.find((v) => v.name === name && v.dark === dark);

describe("a shadcn theme", () => {
  const signals = scanCss(SHADCN);

  test("bare hsl channels are read through the hsl() they're used in", () => {
    expect(variable(signals, "--primary")).toEqual({
      name: "--primary",
      value: "222.2 47.4% 11.2%",
      hex: "#0f172a",
      dark: false,
    });
    expect(variable(signals, "--primary", true)?.hex).toBe("#f8fafc");
    expect(variable(signals, "--foreground")?.hex).toBe("#020817");
    expect(variable(signals, "--accent")?.hex).toBe("#f97316");
    // An alias takes the colour function its own uses read it through.
    expect(variable(signals, "--ring")?.hex).toBe("#0f172a");
    expect(variable(signals, "--radius")?.hex).toBeNull();
  });

  test("the brand-named primary outweighs everything else", () => {
    const primary = signals.colours[0]!;
    expect(primary.hex).toBe("#0f172a");
    expect(primary.neutral).toBe(false);
    expect(primary.properties).toContain("background-color");
    expect(primary.properties).toContain("background");
    expect(primary.variables).toContain("--primary");
    expect(colour(signals, "#f97316")!.weight).toBeGreaterThan(colour(signals, "#e2e8f0")!.weight);
    // Brand variables come first in the list.
    expect(signals.variables.slice(0, 3).map((v) => v.name)).toContain("--primary");
  });

  test("dark-scheme definitions count for half", () => {
    const light = colour(signals, "#f8fafc");
    expect(light).toBeDefined();
    expect(light!.weight).toBeLessThan(colour(signals, "#0f172a")!.weight);
  });

  test("fonts by role: body, headings, buttons", () => {
    expect(signals.fonts.map((font) => [font.family, font.roles, font.weight])).toEqual([
      ["Inter", ["body"], 2],
      ["Playfair Display", ["heading"], 2],
      ["Space Grotesk", ["button"], 1],
    ]);
    expect(signals.fonts[0]!.stack).toBe('"Inter", ui-sans-serif, system-ui, sans-serif');
  });
});

describe("a Tailwind v4 stylesheet", () => {
  const signals = scanCss(TAILWIND_V4);

  test("reads its oklch palette and space-separated rgb channels", () => {
    expect(colour(signals, "#2b7fff")?.properties).toEqual(["background-color"]);
    expect(colour(signals, "#2b7fff")?.variables).toEqual(["--color-blue-500"]);
    expect(colour(signals, "#2563eb")?.weight).toBeGreaterThan(0);
    expect(variable(signals, "--brand")?.hex).toBe("#2563eb");
    const slate = variable(signals, "--color-slate-900")!.hex!;
    expect(slate.startsWith("#0f17")).toBe(true);
    // Used only under a nested .dark variant: half weight.
    expect(colour(signals, slate)!.weight).toBe(0.5 + 1);
  });

  test("a system font stack names no typeface; a theme font does", () => {
    expect(signals.fonts.map((font) => font.family)).toEqual(["Satoshi"]);
    expect(signals.fonts[0]!.roles).toEqual(["heading"]);
  });
});

describe("a Bootstrap-like stylesheet", () => {
  const signals = scanCss(BOOTSTRAP);

  test("comma channel triples and opacity variables resolve", () => {
    expect(variable(signals, "--bs-primary-rgb")?.hex).toBe("#0d6efd");
    const primary = colour(signals, "#0d6efd")!;
    expect(signals.colours[0]!.hex).toBe("#0d6efd");
    expect(primary.properties).toContain("background-color");
    expect(primary.variables).toEqual(
      expect.arrayContaining(["--bs-primary", "--bs-primary-rgb", "--bs-btn-bg"]),
    );
  });

  test("weights follow where a colour is used", () => {
    // A border counts half, a shadow a quarter, a gradient once, keyframes a quarter.
    expect(colour(signals, "#dc3545")?.weight).toBe(0.5);
    expect(colour(signals, "#6610f2")?.weight).toBe(0.25);
    expect(colour(signals, "#6f42c1")?.weight).toBe(1);
    expect(colour(signals, "#ff00ff")?.weight).toBe(0.5);
    expect(colour(signals, "#111111")?.weight).toBe(1);
    // rgba(0,0,0,.1) is too faint to count; #0000 is fully transparent.
    expect(colour(signals, "#000000")).toBeUndefined();
    expect(colour(signals, "#0a58ca")?.weight).toBe(1.5);
  });

  test("nothing is read from urls, strings or currentColor", () => {
    expect(colour(signals, "#ff0000")).toBeUndefined();
  });

  test("the dark scheme's variables are kept apart", () => {
    expect(variable(signals, "--bs-body-bg")).toMatchObject({ hex: "#ffffff", dark: false });
    expect(variable(signals, "--bs-body-bg", true)).toMatchObject({ hex: "#212529", dark: true });
    expect(colour(signals, "#212529")!.weight).toBeGreaterThan(colour(signals, "#dee2e6")!.weight);
  });

  test("a system stack names no typeface; the font shorthand is read", () => {
    expect(signals.fonts).toEqual([
      { family: "Nunito Sans", stack: '"Nunito Sans", sans-serif', weight: 1, roles: ["button"] },
    ]);
  });
});

describe("font files and imports", () => {
  const signals = scanCss(FACES, { baseUrl: "https://example.com/assets/css/site.css" });

  test("@font-face sources resolve against the stylesheet; data URLs and local() are skipped", () => {
    expect(signals.fontFaces).toEqual([
      {
        family: "Aurixa Sans",
        weight: "100 900",
        style: "normal",
        sources: [
          { url: "https://example.com/assets/fonts/aurixa.woff2", format: "woff2" },
          { url: "https://example.com/assets/fonts/aurixa.ttf", format: "truetype" },
        ],
      },
      {
        family: "Inter",
        weight: null,
        style: null,
        sources: [{ url: "https://example.com/_next/static/media/inter.woff2", format: "woff2" }],
      },
      { family: "Inter Fallback", weight: null, style: null, sources: [] },
    ]);
  });

  test("next/font's hashed names read as the family", () => {
    expect(signals.fonts).toEqual([
      {
        family: "Inter",
        stack: "'__Inter_aaf875', '__Inter_Fallback_aaf875'",
        weight: 2,
        roles: ["heading"],
      },
    ]);
  });

  test("@import in both forms, made absolute", () => {
    expect(signals.imports).toEqual([
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
      "https://example.com/assets/css/theme.css",
      "https://example.com/assets/css/print.css",
    ]);
  });
});

describe("whatever it's given", () => {
  test("nested rules take their parent's selector", () => {
    const signals =
      scanCss(`.card { color: #222222; .title { font-family: Lora, serif; } &:hover { color: #333333 } }
      .prose :is(h2, h3) { font: italic 700 2rem/1.1 Fraunces, serif }`);
    expect(signals.fonts.map((font) => [font.family, font.roles])).toEqual([
      ["Lora", ["heading"]],
      ["Fraunces", ["heading"]],
    ]);
    expect(signals.colours.map((c) => c.hex).sort()).toEqual(["#222222", "#333333"]);
  });

  test("custom properties that refer to each other don't loop", () => {
    const signals = scanCss(
      ":root { --a: var(--b); --b: var(--a); } .x { color: var(--a, #123456); background: var(--nope) }",
    );
    expect(signals.colours.map((c) => c.hex)).toEqual(["#123456"]);
  });

  test("malformed CSS gives what it can and never throws", () => {
    for (const css of [
      "a{color:red;;;}}}} b{{color:#00f}",
      "/* unterminated",
      'a { content: "unterminated; color: #fff }',
      "a { color: rgb(1 2 }",
      "@media screen { a { color: #abc ",
      "{}{}{}:;:;",
      "a { color: var(--x, var(--y, var(--z, #010203))) }",
      "x".repeat(50_000),
      "a{" + "b{".repeat(500) + "color:#123}",
      undefined as unknown as string,
    ])
      expect(() => scanCss(css)).not.toThrow();
    expect(scanCss("a{color:red;;;}}}} b{{color:#00f}").colours.map((c) => c.hex)).toContain(
      "#ff0000",
    );
    expect(scanCss("a { color: var(--x, var(--y, var(--z, #010203))) }").colours[0]?.hex).toBe(
      "#010203",
    );
    expect(scanCss("")).toEqual({
      colours: [],
      variables: [],
      fonts: [],
      fontFaces: [],
      imports: [],
    });
  });

  test("a huge stylesheet is read up to its cap, quickly", () => {
    const rule = (index: number) =>
      `.c${index} { color: #${(index * 7919).toString(16).padStart(6, "0").slice(-6)}; }\n`;
    const css = Array.from({ length: 80_000 }, (_, index) => rule(index)).join("");
    const started = Date.now();
    const signals = scanCss(css);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(signals.colours.length).toBeLessThanOrEqual(40);
  });
});
