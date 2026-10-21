import { describe, expect, test } from "bun:test";
import {
  codeBrandName,
  codeEvidenceText,
  codeFileKind,
  codeScanSignals,
  codeTokensCss,
  colourUses,
  fontRoleOf,
  googleFontsOf,
  importedFiles,
  mergeCodeScans,
  parseRepoRef,
  planCodeFiles,
  plausibleFamily,
  readCodeFile,
  repoLabel,
  repoUrl,
  stripCodeComments,
  tokenKind,
  type CodeFileKind,
  type RepoScan,
} from "../../src/lib/brand/scan-code";
import { scanCssTokens } from "../../src/lib/brand/scan-css";
import { fontPackageFamily } from "../../src/lib/brand/scan-tokens";

/* Fixtures modelled on the four Aurixa repositories, small enough to read. */

/** The public site: Tailwind 4 `@theme` in hex, its golds and cyans also written out. */
const SITE_CSS = `@import "tailwindcss";
@theme {
  --color-base-950: #040B16;
  --color-prism-cyan: #00A8B5;
  --color-prism-magenta: #C89B3C;
  --color-marketing-panel: #10233D;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-display: "Playfair Display", ui-serif, Georgia, serif;
}
/* a comment
   over two lines */
:root { color-scheme: dark; }
.legal-page { --legal-accent: #5edde8; }
@layer base {
  body { background-color: var(--color-base-950); font-family: var(--font-sans); }
  h1, h2 { font-family: var(--font-display); }
}
.eyebrow { color: #d7b35f; border-color: #D7B35F; }
.corners::before { border-top: 1px solid #5edde8; }
.corners::after { border-bottom: 1px solid #d7b35f; }
@keyframes prism-shine { to { background-position: 200% center; } }
`;

/** The Builders Network: shadcn's bare HSL channels, light by default, and the shared scales. */
const BUILDERS_CSS = `@layer base {
  :root {
    --background: 220 14% 96%;
    --foreground: 221 39% 11%;
    --primary: 184 100% 25%;
    --brand: 41 56% 51%;
    --radius: 0.75rem;
    --font-heading: "Playfair Display", ui-serif, Georgia, serif;
  }
  .dark,
  :root[data-palette='dark'] {
    --background: 217 69% 5%;
    --primary: 184 100% 35%;
  }
  :root {
    --motion-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --radius-xl: 1.25rem;
    --elevation-4: 0 24px 48px -12px hsl(var(--foreground) / 0.18);
    --font-size-sm: 0.875rem;
  }
}
`;

const BUILDERS_TAILWIND = `import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        brand: "hsl(var(--brand) / <alpha-value>)",
        gold: "#C89B3C",
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
      },
      borderRadius: { lg: "var(--radius)" },
    },
  },
  plugins: [animate],
} satisfies Config;
`;

/** Mission Control: Tailwind 4 `@theme inline` over oklch, dark by default, `.light` the alternative. */
const MC_CSS = `@import "tailwindcss" source(none);
@custom-variant dark (&:is(.dark *));
@theme inline {
  --radius-lg: 0px;
  --color-primary: var(--primary);
  --font-sans: "Archivo", ui-sans-serif, system-ui, sans-serif;
}
:root, .dark {
  --background: oklch(0.16 0.018 250);
  --primary: oklch(0.78 0.16 200);
}
.light {
  --background: oklch(0.98 0.005 240);
  --primary: oklch(0.55 0.18 220);
}
`;

const MODULE = `// The site's palette, lifted verbatim.
export const AURIXA_PALETTE = {
  base950: "#040B16",
  gold: "#C89B3C",
  cyan: "#00A8B5",
  fontDisplay: "Playfair Display",
} as const;

export const mix = () => {
  return { x: "#ffffff" };
};
`;

const PACKAGE = JSON.stringify({
  name: "aurixa-builders",
  description: "The Builders Network",
  dependencies: { "@fontsource/inter": "^5.2.0", "@fontsource/playfair-display": "^5.2.0" },
  devDependencies: { tailwindcss: "^3.4.19" },
});

const HTML = `<!doctype html><html><head>
<title>Aurixa Systems | The operating system for property professionals</title>
<meta name="description" content="The connected operating environment for property professionals.">
<meta name="theme-color" content="#040B16">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=Playfair+Display:ital,wght@0,400;0,600;1,400&amp;display=swap" rel="stylesheet">
</head><body></body></html>`;

const SHADCN = JSON.stringify({
  style: "new-york",
  tailwind: {
    config: "",
    css: "src/styles.css",
    baseColor: "slate",
    cssVariables: true,
    prefix: "",
  },
  aliases: { components: "@/components" },
});

const TOKENS = JSON.stringify({
  color: {
    brand: {
      gold: { $type: "color", $value: "#C89B3C" },
      ink: { $value: "{color.brand.gold}" },
    },
  },
  font: { display: { $type: "fontFamily", $value: ["Playfair Display", "serif"] } },
});

const SCSS = `// brand variables
$gold: #c89b3c;
$gold-ink: lighten($gold, 10%);
$accent: $gold;
.card {
  color: $gold; // a comment with { braces } and a: colon
  &:hover { color: #d7b35f; }
}
`;

/** Mission Control's root route: TanStack Start's head, with its fonts linked from Google. */
const ROOT_ROUTE = `import appCss from "../styles.css?url";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { title: "Aurixa Systems - Mission Control" },
      {
        name: "description",
        content: "Operate a fleet of cloned codebases with cascade-driven updates.",
      },
      { name: "theme-color", content: "#040B16" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Lobster" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..700&family=JetBrains+Mono:wght@400;500;600;700&display=swap",
      },
    ],
  }),
});
`;

/** The Builders Network's entry module: its fonts as @fontsource imports, weight by weight. */
const MAIN = `import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/400-italic.css";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
createRoot(document.getElementById("root")!).render(<App />);
`;

/** A Next.js layout: next/font, Geist and the site's metadata. */
const LAYOUT = `import { Inter, Playfair_Display as Display } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Display({ weight: ["400", "700"], variable: "--font-display", subsets: ["latin"] });
export const metadata = {
  title: { default: "Acme Homes", template: "%s | Acme Homes" },
  description: "Homes, built well.",
};
export const viewport = { themeColor: "#0A192F" };
`;

/** A module that holds the brand's settings, not its theme: keys, labels and option lists. */
const SETTINGS_MODULE = `export const AURIXA_SANS_STACK = \`"Inter", \${SYSTEM_FONT_STACK}\`;
export const AURIXA_DISPLAY_STACK =
  '"Playfair Display", ui-serif, Georgia, serif';
export const SYSTEM_FONT_STACK = "ui-sans-serif, system-ui, sans-serif";
export const defaultBrandThemeConfig = {
  primaryColor: null,
  fontFamily: "aurixa-sans",
  headingFontFamily: "aurixa-display",
  fontScale: null,
};
export const FONT_OPTIONS: FontOption[] = [
  { key: "aurixa-sans", label: "Aurixa — Inter", stack: AURIXA_SANS_STACK },
];
export const FONT_SCALE_OPTIONS: FontScaleOption[] = [
  { key: "compact", label: "Compact", size: "0.9375rem" },
];
export const theme = {
  fonts: { heading: "'Cormorant Garamond', serif", body: "Lato" },
  typography: { fontFamily: { mono: "IBM Plex Mono" }, fontSize: { base: "1rem" } },
};
`;

const read = (path: string, kind: CodeFileKind, text: string) => readCodeFile({ path, kind, text });

function scanOf(
  label: string,
  files: { path: string; kind: CodeFileKind; text: string }[],
): RepoScan {
  const ref = parseRepoRef(label)!;
  return {
    ref,
    sha: "0123456789abcdef0123456789abcdef01234567",
    readings: files.map((file) => readCodeFile(file)),
    plan: { files: [], skipped: [], bytes: 0 },
    failed: [],
    logos: [],
  };
}

describe("parseRepoRef", () => {
  test("reads the ways a repository is given", () => {
    expect(parseRepoRef("Naidu-Group-Pty-Ltd/aurixa-systems")).toEqual({
      owner: "Naidu-Group-Pty-Ltd",
      repo: "aurixa-systems",
      ref: null,
      path: null,
    });
    expect(parseRepoRef("acme/site@release/2.0")).toEqual({
      owner: "acme",
      repo: "site",
      ref: "release/2.0",
      path: null,
    });
    expect(parseRepoRef("https://github.com/acme/site.git")).toMatchObject({
      owner: "acme",
      repo: "site",
      ref: null,
    });
    expect(parseRepoRef("github.com/acme/site")).toMatchObject({ owner: "acme", repo: "site" });
    expect(parseRepoRef("git@github.com:acme/site.git")).toMatchObject({
      owner: "acme",
      repo: "site",
    });
    expect(parseRepoRef("https://github.com/acme/mono/tree/main/apps/web")).toEqual({
      owner: "acme",
      repo: "mono",
      ref: "main",
      path: "apps/web",
    });
  });

  test("refuses anything else", () => {
    for (const input of [
      "",
      "acme",
      "acme/site/extra",
      "https://gitlab.com/acme/site",
      "https://github.com/acme/site/issues",
      "acme/../site",
      "-acme/site",
      "acme/site@../main",
      "https://github.com/acme/site/tree/main/../../etc",
      "acme site/x",
    ])
      expect(parseRepoRef(input)).toBeNull();
  });

  test("names and addresses", () => {
    const ref = parseRepoRef("https://github.com/acme/mono/tree/main/apps/web")!;
    expect(repoLabel(ref)).toBe("acme/mono");
    expect(repoUrl(ref)).toBe("https://github.com/acme/mono/tree/main/apps/web");
    expect(repoUrl(parseRepoRef("acme/site")!)).toBe("https://github.com/acme/site");
  });
});

describe("planCodeFiles", () => {
  const tree = [
    { path: "package.json", size: 4000 },
    { path: "components.json", size: 400 },
    { path: "tailwind.config.ts", size: 3000 },
    { path: "index.html", size: 2500 },
    { path: "src/index.css", size: 60_000 },
    { path: "src/styles/tokens.css", size: 30_000 },
    { path: "src/styles/glass.css", size: 9000 },
    { path: "src/components/report.css", size: 120_000 },
    { path: "src/lib/brand/aurixa-brand.ts", size: 5000 },
    { path: "src/branding/BrandProvider.tsx", size: 9000 },
    { path: "src/hooks/useTheme.ts", size: 900 },
    { path: "src/styles/huge.css", size: 900_000 },
    { path: "dist/assets/index-3f2a9c1d7e.css", size: 80_000 },
    { path: "node_modules/tailwindcss/base.css", size: 10_000 },
    { path: "src/app.min.css", size: 4000 },
    { path: "tests/fixtures/theme.css", size: 100 },
    { path: "src/__tests__/tokens.test.ts", size: 100 },
    { path: "mobile/design-tokens.json", size: 20_000 },
    { path: "public/brand/aurixa-mark.svg", size: 9000 },
    { path: "public/brand/aurixa-favicon-192.png", size: 6000 },
    { path: "public/images/hero.jpg", size: 300_000 },
    { path: "docs/notes.md", size: 100 },
    { path: "docs/manifest.json", size: 100 },
    { path: ".claude/skills/brand/tokens/typography.css", size: 4000 },
    { path: ".storybook/theme.ts", size: 900 },
    { path: "scripts/theme.ts", size: 900 },
    { path: "supabase/functions/_shared/brand.ts", size: 900 },
    { path: "src/main.tsx", size: 900 },
    { path: "src/App.tsx", size: 9000 },
    { path: "src/routes/__root.tsx", size: 5000 },
    { path: "src/routes/index.tsx", size: 5000 },
    { path: "src/components/layout.tsx", size: 5000 },
    { path: "public/images/npc-signature-logo.png", size: 90_000 },
    { path: "public/images/npc-og-logo.jpg", size: 90_000 },
    { path: "src/assets/openai-logo.svg", size: 900 },
    { path: "public/brands/stripe-logo.svg", size: 900 },
    { path: "public/brand/partner-logo.svg", size: 900 },
  ];

  test("picks the styling files, most telling first", () => {
    const plan = planCodeFiles(tree);
    const paths = plan.files.map((file) => file.path);
    expect(paths.slice(0, 3)).toEqual(["components.json", "tailwind.config.ts", "package.json"]);
    expect(paths).toContain("src/index.css");
    expect(paths).toContain("src/styles/tokens.css");
    expect(paths).toContain("src/lib/brand/aurixa-brand.ts");
    expect(paths).toContain("mobile/design-tokens.json");
    expect(paths).toContain("index.html");
    expect(paths.indexOf("src/index.css")).toBeLessThan(paths.indexOf("src/components/report.css"));
    expect(paths.indexOf("src/styles/tokens.css")).toBeLessThan(
      paths.indexOf("src/components/report.css"),
    );
    // A mark drawn in SVG before its favicon.
    expect(paths.indexOf("public/brand/aurixa-mark.svg")).toBeLessThan(
      paths.indexOf("public/brand/aurixa-favicon-192.png"),
    );
    for (const never of [
      "dist/assets/index-3f2a9c1d7e.css",
      "node_modules/tailwindcss/base.css",
      "src/app.min.css",
      "tests/fixtures/theme.css",
      "src/__tests__/tokens.test.ts",
      "src/branding/BrandProvider.tsx",
      "src/hooks/useTheme.ts",
      "public/images/hero.jpg",
      "docs/notes.md",
      // Documentation, tooling, back ends and dot folders (an assistant's skills) aren't the app.
      "docs/manifest.json",
      ".claude/skills/brand/tokens/typography.css",
      ".storybook/theme.ts",
      "scripts/theme.ts",
      "supabase/functions/_shared/brand.ts",
      // A route page and a component aren't where the app loads its fonts.
      "src/routes/index.tsx",
      "src/components/layout.tsx",
      // An email signature, a share card and other companies' logos aren't the brand's logo.
      "public/images/npc-signature-logo.png",
      "public/images/npc-og-logo.jpg",
      "src/assets/openai-logo.svg",
      "public/brands/stripe-logo.svg",
    ])
      expect(paths).not.toContain(never);
    expect(paths).toContain("src/main.tsx");
    expect(paths).toContain("src/routes/__root.tsx");
    expect(plan.files.find((file) => file.path === "src/main.tsx")?.kind).toBe("entry");
    expect(plan.skipped).toContainEqual({ path: "src/styles/huge.css", why: "over 600 KB" });
  });

  test("a logo named for the brand comes first", () => {
    const plan = planCodeFiles(tree, { brand: ["aurixa"] });
    const logos = plan.files.filter((file) => file.kind === "logo").map((file) => file.path);
    expect(logos[0]).toBe("public/brand/aurixa-mark.svg");
    expect(logos.indexOf("public/brand/aurixa-favicon-192.png")).toBeLessThan(
      logos.indexOf("public/brand/partner-logo.svg"),
    );
  });

  test("a folder is read as if it were the repository", () => {
    const mono = planCodeFiles(
      [
        { path: "apps/web/src/main.tsx", size: 900 },
        { path: "apps/web/src/index.css", size: 900 },
        { path: "apps/web/package.json", size: 900 },
        { path: "apps/docs/src/index.css", size: 900 },
        { path: "examples/site/src/index.css", size: 900 },
      ],
      { path: "apps/web" },
    );
    expect(mono.files.map((file) => [file.path, file.kind])).toEqual([
      ["apps/web/package.json", "package"],
      ["apps/web/src/index.css", "css"],
      ["apps/web/src/main.tsx", "entry"],
    ]);
    // A folder the planner would otherwise pass over is still read when it is the one asked for.
    expect(
      planCodeFiles([{ path: "examples/site/src/index.css", size: 900 }], {
        path: "examples/site",
      }).files.map((file) => file.path),
    ).toEqual(["examples/site/src/index.css"]);
  });

  test("keeps to its budget and to a folder", () => {
    const plan = planCodeFiles(tree, { limits: { files: 3 } });
    expect(plan.files.filter((file) => file.kind !== "logo")).toHaveLength(3);
    expect(plan.skipped.some((file) => file.why === "over the scan's budget")).toBe(true);
    const folder = planCodeFiles(tree, { path: "src/styles" });
    expect(folder.files.map((file) => file.path).sort()).toEqual([
      "src/styles/glass.css",
      "src/styles/tokens.css",
    ]);
  });

  test("names what a file is", () => {
    expect(codeFileKind("tailwind.config.mjs")).toBe("tailwind");
    expect(codeFileKind("src/theme.scss")).toBe("scss");
    expect(codeFileKind("styles/vars.less")).toBe("less");
    expect(codeFileKind("tokens/brand.tokens.json")).toBe("tokens");
    expect(codeFileKind("tsconfig.json")).toBeNull();
    expect(codeFileKind("public/manifest.json")).toBe("manifest");
    expect(codeFileKind("src/theme/palette.ts")).toBe("module");
    expect(codeFileKind("src/types/theme.d.ts")).toBeNull();
    expect(codeFileKind("src/components/logo.svg")).toBeNull();
    // Theme modules are named for it, not modules that mention a theme.
    expect(codeFileKind("src/branding/brand-defaults.ts")).toBe("module");
    expect(codeFileKind("src/lib/brand/aurixa-brand.ts")).toBe("module");
    expect(codeFileKind("src/branding/BrandLogo.tsx")).toBeNull();
    expect(codeFileKind("src/lib/billing/token-usage.ts")).toBeNull();
    // Entry modules at the top of the app, root routes and layouts one level down.
    expect(codeFileKind("src/main.tsx")).toBe("entry");
    expect(codeFileKind("src/routes/__root.tsx")).toBe("entry");
    expect(codeFileKind("app/layout.tsx")).toBe("entry");
    expect(codeFileKind("src/pages/_app.tsx")).toBe("entry");
    expect(codeFileKind("src/features/index.ts")).toBeNull();
  });
});

describe("importedFiles", () => {
  const paths = new Set([
    "src/index.css",
    "src/styles/tokens.css",
    "src/styles/glass.css",
    "src/styles/_mixins.scss",
    "src/styles/theme.scss",
  ]);
  test("follows a stylesheet's imports within the repository", () => {
    const css = `@import "tailwindcss";
@import "./styles/tokens.css";
@import url('./styles/glass.css');
@import "@/styles/tokens.css";
@import "https://fonts.googleapis.com/css2?family=Inter";`;
    expect(importedFiles(css, "src/index.css", paths)).toEqual([
      "src/styles/tokens.css",
      "src/styles/glass.css",
    ]);
    expect(importedFiles(`@use "mixins";\n@use "./theme";`, "src/styles/main.scss", paths)).toEqual(
      ["src/styles/_mixins.scss", "src/styles/theme.scss"],
    );
    expect(importedFiles(`@import "../../../etc/x.css";`, "src/index.css", paths)).toEqual([]);
  });

  test("follows the stylesheets a module imports, never a commented-out one", () => {
    const main = `import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// import "./styles/glass.css";
import appCss from "./styles/tokens.css?url";
import "tailwindcss/index.css";`;
    expect(importedFiles(main, "src/main.tsx", paths)).toEqual([
      "src/index.css",
      "src/styles/tokens.css",
    ]);
    expect(
      importedFiles(
        `/* @import "./styles/glass.css"; */ @import "./styles/tokens.css";`,
        "src/index.css",
        paths,
      ),
    ).toEqual(["src/styles/tokens.css"]);
  });
});

describe("reading files", () => {
  test("a Tailwind 4 stylesheet: @theme tokens with their lines, fonts, the colours written out", () => {
    const reading = read("src/index.css", "css", SITE_CSS);
    const cyan = reading.tokens.find((token) => token.name === "--color-prism-cyan")!;
    expect(cyan).toMatchObject({
      hex: "#00a8b5",
      scheme: "default",
      context: "@theme",
      line: 4,
      kind: "colour",
      source: "css",
    });
    expect(reading.tokens.find((token) => token.name === "--legal-accent")).toMatchObject({
      scheme: "scoped",
      line: 13,
    });
    expect(reading.tokens.find((token) => token.name === "--font-display")?.kind).toBe("font");
    const families = reading.fonts.map((font) => font.family);
    expect(families).toContain("Inter");
    expect(families).toContain("Playfair Display");
    expect(
      reading.fonts.find((font) => font.family === "Playfair Display" && font.line === 8)?.roles,
    ).toEqual(["display"]);
    expect(reading.uses.find((use) => use.hex === "#d7b35f")?.count).toBe(3);
    expect(reading.uses.find((use) => use.hex === "#5edde8")?.count).toBe(2);
    expect(reading.keyframes).toEqual(["prism-shine"]);
    expect(reading.imports).toEqual(["tailwindcss"]);
  });

  test("shadcn's channels in light and dark, and the scales", () => {
    const reading = read("src/styles/tokens.css", "css", BUILDERS_CSS);
    const primary = reading.tokens.filter((token) => token.name === "--primary");
    expect(primary.map((token) => [token.scheme, token.hex])).toEqual([
      ["default", "#007780"],
      ["dark", "#00a7b3"],
    ]);
    expect(reading.tokens.find((token) => token.name === "--motion-ease-out")?.kind).toBe("motion");
    expect(reading.tokens.find((token) => token.name === "--radius-xl")?.kind).toBe("radius");
    expect(reading.tokens.find((token) => token.name === "--elevation-4")?.kind).toBe("shadow");
    expect(reading.tokens.find((token) => token.name === "--font-size-sm")?.kind).toBe("other");
  });

  test("a theme the root sets dark, with a light one beside it", () => {
    const reading = read("src/styles.css", "css", MC_CSS);
    const primary = reading.tokens.find((token) => token.name === "--color-primary")!;
    const dark = reading.tokens.find(
      (token) => token.name === "--primary" && token.scheme === "dark",
    )!;
    const light = reading.tokens.find(
      (token) => token.name === "--primary" && token.scheme === "light",
    )!;
    // @theme reads the root's value (the dark one), not the light theme's.
    expect(primary.hex).toBe(dark.hex);
    expect(light.hex).not.toBe(dark.hex);
    expect(reading.tokens.find((token) => token.name === "--radius-lg")).toMatchObject({
      kind: "radius",
      value: "0px",
    });
  });

  test("a Tailwind config: its colours, fonts and radii with their lines", () => {
    const reading = read("tailwind.config.ts", "tailwind", BUILDERS_TAILWIND);
    expect(reading.tokens.find((token) => token.name === "colors.gold")).toMatchObject({
      hex: "#c89b3c",
      line: 13,
    });
    expect(reading.tokens.find((token) => token.name === "colors.primary")).toMatchObject({
      value: "hsl(var(--primary))",
      kind: "colour",
    });
    expect(reading.tokens.find((token) => token.name === "borderRadius.lg")?.kind).toBe("radius");
    expect(reading.fontVariables).toEqual([
      { variable: "--font-heading", roles: ["heading"], path: "tailwind.config.ts", line: 16 },
    ]);
    expect(reading.fonts).toMatchObject([{ family: "Inter", roles: ["body"], line: 17 }]);
    expect(reading.tailwind).toEqual({ darkMode: "class", plugins: ["tailwindcss-animate"] });
  });

  test("a theme module, package.json, index.html, a manifest, shadcn's config and token JSON", () => {
    const module = read("src/lib/brand/aurixa-brand.ts", "module", MODULE);
    expect(module.tokens.map((token) => [token.name, token.hex, token.line])).toEqual([
      ["AURIXA_PALETTE.base950", "#040b16", 3],
      ["AURIXA_PALETTE.gold", "#c89b3c", 4],
      ["AURIXA_PALETTE.cyan", "#00a8b5", 5],
    ]);
    expect(module.fonts.map((font) => font.family)).toEqual(["Playfair Display"]);

    const pkg = read("package.json", "package", PACKAGE);
    expect(pkg.packages).toMatchObject({
      name: "aurixa-builders",
      description: "The Builders Network",
      tailwind: 3,
    });
    expect(pkg.fonts.map((font) => [font.family, font.loaded])).toEqual([
      ["Inter", "fontsource"],
      ["Playfair Display", "fontsource"],
    ]);

    const html = read("index.html", "html", HTML);
    expect(html.html).toEqual({
      title: "Aurixa Systems | The operating system for property professionals",
      description: "The connected operating environment for property professionals.",
      themeColours: ["#040b16"],
    });
    expect(html.fonts.map((font) => [font.family, font.weights])).toEqual([
      ["Inter", [300, 400, 500, 600, 700]],
      ["Playfair Display", [400, 600]],
    ]);

    const manifest = read(
      "public/manifest.json",
      "manifest",
      JSON.stringify({ name: "Aurixa", theme_color: "#040B16" }),
    );
    expect(manifest.html?.themeColours).toEqual(["#040b16"]);

    expect(read("components.json", "shadcn", SHADCN).shadcn).toMatchObject({
      css: "src/styles.css",
      baseColor: "slate",
    });

    const tokens = read("tokens/brand.tokens.json", "tokens", TOKENS);
    expect(tokens.tokens.find((token) => token.name === "color.brand.ink")).toMatchObject({
      hex: "#c89b3c",
      kind: "colour",
    });
    expect(tokens.fonts.map((font) => font.family)).toEqual(["Playfair Display"]);
  });

  test("an app's root route: the fonts it links, its stylesheet and the site's name", () => {
    const reading = read("src/routes/__root.tsx", "entry", ROOT_ROUTE);
    expect(reading.fonts.map((font) => [font.family, font.loaded, font.weights])).toEqual([
      ["Archivo", "google", [400, 500, 600, 700]],
      ["JetBrains Mono", "google", [400, 500, 600, 700]],
    ]);
    expect(reading.html).toEqual({
      title: "Aurixa Systems - Mission Control",
      description: "Operate a fleet of cloned codebases with cascade-driven updates.",
      themeColours: ["#040b16"],
    });
    expect(reading.imports).toEqual(["../styles.css?url"]);
  });

  test("an entry module's @fontsource imports, with their weights", () => {
    const reading = read("src/main.tsx", "entry", MAIN);
    expect(reading.fonts.map((font) => [font.family, font.loaded, font.weights])).toEqual([
      ["Inter", "fontsource", [400, 600]],
      ["Playfair Display", "fontsource", [400, 700]],
      ["JetBrains Mono", "fontsource", []],
    ]);
    expect(reading.imports).toEqual(["./index.css"]);
    expect(reading.html).toBeNull();
  });

  test("a Next.js layout: next/font and Geist, and its metadata", () => {
    const reading = read("app/layout.tsx", "entry", LAYOUT);
    expect(
      reading.fonts.map((font) => [font.family, font.loaded, font.roles, font.weights]),
    ).toEqual([
      ["Inter", "google", ["body"], []],
      ["Playfair Display", "google", ["display"], [400, 700]],
      ["Geist Mono", "package", ["mono"], []],
    ]);
    expect(reading.html).toEqual({
      title: "Acme Homes",
      description: "Homes, built well.",
      themeColours: ["#0a192f"],
    });
  });

  test("a settings module's keys and labels aren't typefaces; its stacks and theme fonts are", () => {
    const reading = read("src/branding/brand-fonts.ts", "module", SETTINGS_MODULE);
    expect(reading.fonts.map((font) => [font.family, font.roles[0]])).toEqual([
      ["Cormorant Garamond", "heading"],
      ["Lato", "body"],
      ["IBM Plex Mono", "mono"],
      ["Inter", "body"],
      ["Playfair Display", "display"],
    ]);
    // An option list's first entry isn't an object the module names.
    expect(reading.tokens).toEqual([]);
  });

  test("SCSS variables, read through each other; line comments aren't CSS", () => {
    const reading = read("src/theme.scss", "scss", SCSS);
    expect(reading.tokens.find((token) => token.name === "$gold")).toMatchObject({
      hex: "#c89b3c",
      line: 2,
    });
    expect(reading.tokens.find((token) => token.name === "$accent")).toMatchObject({
      resolved: "#c89b3c",
      hex: "#c89b3c",
    });
    expect(reading.tokens.find((token) => token.name === "$gold-ink")?.hex).toBeNull();
    expect(reading.uses.find((use) => use.hex === "#d7b35f")?.count).toBe(1);
  });

  test("malformed files read as nothing, never throw", () => {
    for (const kind of [
      "css",
      "scss",
      "tailwind",
      "tokens",
      "package",
      "html",
      "manifest",
      "module",
      "shadcn",
    ] as CodeFileKind[]) {
      const reading = read("x", kind, "{{{ not :: valid ;; }");
      expect(reading.path).toBe("x");
      expect(Array.isArray(reading.tokens)).toBe(true);
    }
  });
});

describe("small readers", () => {
  test("colours written out are counted exactly; entities, fragments and ids aren't colours", () => {
    const uses = colourUses(`a { color: #FFF; background: rgb(0 168 181 / 0.4); }
      <a href="#top">&#123; url(#gradient) <a href="/x#bad"> #app { } b { color: #fff }
      const gold = "#C89B3C"; className="bg-[#C89B3C]/20 text-[#00A8B5]"`);
    expect(uses).toEqual([
      { hex: "#ffffff", count: 2 },
      { hex: "#00a8b5", count: 2 },
      { hex: "#c89b3c", count: 2 },
    ]);
  });

  test("comments out, strings and addresses kept", () => {
    const text = `a: "http://x"; // gone\n/* gone */ b: 'c // kept';`;
    expect(stripCodeComments(text)).toBe(`a: "http://x"; \n  b: 'c // kept';`);
    expect(stripCodeComments("u: url(//cdn/x) // c", { lines: false })).toBe(
      "u: url(//cdn/x) // c",
    );
  });

  test("Google Fonts addresses, both versions", () => {
    expect(
      googleFontsOf(
        "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..700&family=JetBrains+Mono:wght@400;500",
      ),
    ).toEqual([
      { family: "Archivo", weights: [400, 500, 600, 700] },
      { family: "JetBrains Mono", weights: [400, 500] },
    ]);
    expect(
      googleFontsOf("https://fonts.googleapis.com/css?family=Lato:400,700|Roboto+Slab"),
    ).toEqual([
      { family: "Lato", weights: [400, 700] },
      { family: "Roboto Slab", weights: [] },
    ]);
    expect(googleFontsOf("https://example.com/css?family=Inter")).toEqual([]);
  });

  test("a typeface's name, as a person or a package writes it", () => {
    for (const name of [
      "Inter",
      "Playfair Display",
      "JetBrains Mono",
      "Noto Sans JP",
      "inter",
      "Söhne",
    ])
      expect(plausibleFamily(name)).toBe(true);
    for (const name of ["Aurixa — Inter", "inherit", "swap", "var(--font)", "#C89B3C", "", "a/b"])
      expect(plausibleFamily(name)).toBe(false);
    expect(fontPackageFamily("jetbrains-mono")).toBe("JetBrains Mono");
    expect(fontPackageFamily("dm-serif-display")).toBe("DM Serif Display");
    expect(fontPackageFamily("ibm-plex-sans")).toBe("IBM Plex Sans");
    expect(fontPackageFamily("playfair-display")).toBe("Playfair Display");
  });

  test("a font's job and a token's kind, from their names", () => {
    expect(fontRoleOf("headingFontFamily")).toBe("heading");
    expect(fontRoleOf("AURIXA_DISPLAY_STACK")).toBe("display");
    expect(fontRoleOf("--font-display")).toBe("display");
    expect(fontRoleOf("--font-heading")).toBe("heading");
    expect(fontRoleOf("--font-sans")).toBe("body");
    expect(fontRoleOf("mono")).toBe("mono");
    expect(tokenKind("--aurixa-glow", "43 74% 55%", "#e5b23c")).toBe("colour");
    expect(tokenKind("--glass-shadow", "0 12px 34px -12px hsl(0 0% 0% / 0.62)", "#000000")).toBe(
      "shadow",
    );
    expect(tokenKind("--marketing-cta", "linear-gradient(#000, #fff)", null)).toBe("gradient");
    expect(tokenKind("--release-date", "2026", null)).toBe("other");
    expect(tokenKind("--duration-slow", "320ms", null)).toBe("motion");
  });
});

describe("weighing colours across repositories", () => {
  /** The brand's own site: a small palette, its gold named for its job. */
  const site = scanOf("acme/site", [
    {
      path: "src/index.css",
      kind: "css",
      text: `:root { --brand: #C89B3C; --background: #040B16; --foreground: #FFFFFF; --link: #00A8B5; }
.cta { color: #C89B3C; } .rule { border-color: #00A8B5; }`,
    },
  ]);
  /** A product built on it with a thousand-token stylesheet and a warning yellow written everywhere. */
  const product = scanOf("acme/product", [
    {
      path: "src/styles/tokens.css",
      kind: "css",
      text: [
        ":root {",
        "  --brand: #C89B3C;",
        "  --warning: #D9A520;",
        ...Array.from({ length: 300 }, (_, index) => {
          const hue = (index * 37) % 360;
          return `  --chart-${index}: hsl(${hue} ${40 + (index % 50)}% ${30 + (index % 40)}%);`;
        }),
        "}",
        ...Array.from({ length: 80 }, (_, index) => `.alert-${index} { color: #D9A520; }`),
      ].join("\n"),
    },
  ]);
  const system = mergeCodeScans([site, product]);
  const rank = (hex: string) => system.colours.findIndex((colour) => colour.hex === hex);

  test("a large repository counts once, and doesn't drown the brand's own colours", () => {
    // Only neutrals (the ground and the ink) can come before the brand's gold.
    expect(system.colours.slice(0, rank("#c89b3c")).every((colour) => colour.neutral)).toBe(true);
    expect(rank("#c89b3c")).toBeLessThan(rank("#d9a520"));
    expect(rank("#00a8b5")).toBeLessThan(rank("#d9a520"));
    // Every one of the product's three hundred chart colours ranks below the site's link colour.
    const link = system.colours[rank("#00a8b5")]!.weight;
    const charts = system.colours.filter(
      (colour) =>
        colour.tokens.some((token) => token.name.startsWith("--chart-")) &&
        !colour.tokens.some((token) => token.repo === "acme/site"),
    );
    expect(charts.length).toBeGreaterThan(0);
    for (const chart of charts) expect(chart.weight).toBeLessThan(link);
  });

  test("a warning written eighty times is still a warning's colour", () => {
    const warning = system.colours[rank("#d9a520")]!;
    const gold = system.colours[rank("#c89b3c")]!;
    // Eighty rules and its own declaration.
    expect(warning.uses).toBe(81);
    expect(gold.weight).toBeGreaterThan(warning.weight * 2);
  });

  test("an Adobe Fonts kit is reported though its families aren't named", () => {
    const kit = scanOf("acme/site", [
      {
        path: "index.html",
        kind: "html",
        text: `<link rel="stylesheet" href="https://use.typekit.net/abc1234.css">`,
      },
    ]);
    const merged = mergeCodeScans([kit]);
    expect(merged.adobeFonts).toBe(true);
    expect(merged.fonts).toEqual([]);
    expect(codeScanSignals(merged).adobeFonts).toBe(true);
  });
});

describe("mergeCodeScans", () => {
  const site = scanOf("Naidu-Group-Pty-Ltd/aurixa-systems", [
    { path: "src/index.css", kind: "css", text: SITE_CSS },
    { path: "index.html", kind: "html", text: HTML },
  ]);
  const builders = scanOf("Naidu-Group-Pty-Ltd/aurixa-builders", [
    { path: "src/styles/tokens.css", kind: "css", text: BUILDERS_CSS },
    { path: "tailwind.config.ts", kind: "tailwind", text: BUILDERS_TAILWIND },
    { path: "package.json", kind: "package", text: PACKAGE },
  ]);
  const control = scanOf("Naidu-Group-Pty-Ltd/aurixa-mission-control", [
    { path: "src/styles.css", kind: "css", text: MC_CSS },
    { path: "src/lib/brand/aurixa-brand.ts", kind: "module", text: MODULE },
  ]);
  const system = mergeCodeScans([site, builders, control]);

  test("the first repository leads", () => {
    expect(system.primary).toBe("Naidu-Group-Pty-Ltd/aurixa-systems");
    expect(system.repos.map((repo) => [repo.label, repo.defaultScheme])).toEqual([
      ["Naidu-Group-Pty-Ltd/aurixa-systems", "dark"],
      ["Naidu-Group-Pty-Ltd/aurixa-builders", "light"],
      ["Naidu-Group-Pty-Ltd/aurixa-mission-control", "dark"],
    ]);
    expect(system.repos[0]!.stack).toContain("Tailwind 4 (@theme)");
    expect(system.repos[1]!.stack).toContain("Tailwind 3");
    expect(system.title).toBe("Aurixa Systems | The operating system for property professionals");
    expect(codeBrandName(system)).toBe("Aurixa Systems");
  });

  test("one colour, however many repositories and spellings it has, with every name it goes by", () => {
    const gold = system.colours.find((colour) => colour.hex === "#c89b3c")!;
    expect(gold.repos.sort()).toEqual([
      "Naidu-Group-Pty-Ltd/aurixa-builders",
      "Naidu-Group-Pty-Ltd/aurixa-mission-control",
      "Naidu-Group-Pty-Ltd/aurixa-systems",
    ]);
    const names = gold.tokens.map((token) => token.name);
    expect(names[0]).toBe("--color-prism-magenta");
    expect(names).toContain("--brand");
    expect(names).toContain("colors.brand");
    expect(names).toContain("AURIXA_PALETTE.gold");
    expect(gold.tokens[0]).toMatchObject({
      repo: "Naidu-Group-Pty-Ltd/aurixa-systems",
      path: "src/index.css",
      line: 5,
    });
    // The Builders Network's HSL drifts a step from the site's hex; it folds in.
    expect(gold.variants.length).toBeGreaterThan(0);
    const cyan = system.colours.find((colour) => colour.hex === "#00a8b5")!;
    expect(cyan.variants).toContain("#00a7b3");
    // A colour only written out is still found, and counts.
    expect(system.colours.find((colour) => colour.hex === "#d7b35f")).toMatchObject({
      declared: false,
      uses: 3,
    });
  });

  test("Tailwind's references are read through the repository's own custom properties", () => {
    const primary = system.tokens.find((token) => token.name === "colors.primary")!;
    expect(primary.hex).toBe("#007780");
    // 41 56% 51% is a step off the site's #C89B3C, as converted.
    expect(system.tokens.find((token) => token.name === "colors.brand")?.hex).toBe("#c89c3c");
    const heading = system.fonts.find((font) => font.family === "Playfair Display")!;
    expect(heading.roles).toContain("heading");
    expect(heading.roles).toContain("display");
    expect(heading.loaded.sort()).toEqual(["fontsource", "google"]);
    expect(heading.repos.length).toBe(3);
    expect(system.fonts.find((font) => font.family === "Inter")?.weights).toEqual([
      300, 400, 500, 600, 700,
    ]);
    expect(system.fonts.map((font) => font.family)).toContain("Archivo");
  });

  test("scales, animations and where the repositories disagree", () => {
    expect(system.scales.radius.map((token) => token.name)).toContain("--radius-xl");
    expect(system.scales.motion.map((token) => token.name)).toContain("--motion-ease-out");
    expect(system.scales.shadow.map((token) => token.name)).toContain("--elevation-4");
    expect(system.keyframes).toEqual([
      { name: "prism-shine", repos: ["Naidu-Group-Pty-Ltd/aurixa-systems"] },
    ]);
    const font = system.conflicts.find((conflict) => conflict.name === "--font-sans")!;
    expect(font.values.map((value) => value.value)).toEqual([
      '"Inter", system-ui, sans-serif',
      '"Archivo", ui-sans-serif, system-ui, sans-serif',
    ]);
    expect(
      system.conflicts.some(
        (conflict) => conflict.name === "--primary" && conflict.scheme === "default",
      ),
    ).toBe(true);
    expect(system.conflicts.some((conflict) => conflict.name === "--background")).toBe(true);
  });

  test("as a brand import's findings and the AI's evidence", () => {
    const signals = codeScanSignals(system);
    expect(signals.url).toBe("https://github.com/Naidu-Group-Pty-Ltd/aurixa-systems");
    expect(signals.colours.length).toBeGreaterThan(5);
    expect(signals.colours.reduce((sum, colour) => sum + colour.share, 0)).toBeCloseTo(1, 1);
    expect(signals.colours.find((colour) => colour.hex === "#c89b3c")?.from[0]).toBe(
      "--color-prism-magenta",
    );
    expect(signals.googleFonts.sort()).toEqual(["Inter", "Playfair Display"]);
    const evidence = codeEvidenceText(system);
    expect(evidence).toContain("Naidu-Group-Pty-Ltd/aurixa-systems @ 0123456");
    expect(evidence).toContain("#c89b3c");
    expect(evidence).toContain("--color-prism-magenta in aurixa-systems src/index.css:5");
    expect(evidence).toContain("Where the repositories disagree");
  });

  test("as a stylesheet that names where each value comes from, and reads back", () => {
    const css = codeTokensCss(system, { generatedAt: "2026-10-21" });
    expect(css).toContain("--color-prism-magenta: #C89B3C; /* aurixa-systems src/index.css:5 */");
    expect(css).toContain(
      "--brand: 41 56% 51%; /* aurixa-builders src/styles/tokens.css:6; #c89c3c */",
    );
    expect(css).toMatch(
      /--font-sans: "Inter", system-ui, sans-serif; \/\* aurixa-systems src\/index\.css:7; also aurixa-mission-control: "Archivo"/,
    );
    expect(css).toContain(".dark {");
    expect(css).toContain(".light {");
    const back = scanCssTokens(css).tokens;
    expect(back.find((token) => token.name === "--color-prism-magenta")?.hex).toBe("#c89b3c");
    expect(back.filter((token) => token.scheme === "dark").length).toBeGreaterThan(0);
  });

  test("each scale hears from every repository, and says which scheme a value is for", () => {
    const radiusRepos = system.scales.radius.slice(0, 3).map((token) => token.repo);
    expect(new Set(radiusRepos).size).toBeGreaterThan(1);
    const evidence = codeEvidenceText(system);
    expect(evidence).toContain(
      "- --primary (dark): #00a7b3 in aurixa-builders; #00d4df in aurixa-mission-control",
    );
    expect(evidence).toContain("--background (light) in aurixa-mission-control src/styles.css:13");
  });

  test("an empty scan is an empty design system", () => {
    const empty = mergeCodeScans([]);
    expect(empty.primary).toBeNull();
    expect(empty.colours).toEqual([]);
    expect(codeScanSignals(empty).colours).toEqual([]);
    expect(codeBrandName(empty)).toBe("Brand");
  });
});
