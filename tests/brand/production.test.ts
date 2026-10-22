import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCssColour } from "../../src/lib/brand/colour";
import {
  cubicBezierAt,
  cubicBezierPath,
  formatCubicBezier,
  motionParts,
  parseCubicBezier,
  parseDuration,
} from "../../src/lib/brand/motion";
import {
  brandMotion,
  colourByHand,
  contrastLevel,
  isEmptyProduction,
  motionByHand,
  PRODUCTION_ROLES,
  productionChecks,
  productionOf,
  productionStylesheet,
  productionTokens,
  roleProperties,
  scaleByHand,
  typeByHand,
  withRole,
  type BrandProduction,
  type ProductionRoleKey,
} from "../../src/lib/brand/production";
import {
  nameWords,
  proposeProduction,
  reproposeProduction,
} from "../../src/lib/brand/production-proposal";
import {
  fontRoleOf,
  mergeCodeScans,
  parseRepoRef,
  readCodeFile,
  tokenKind,
  type CodeDesignSystem,
  type FileReading,
  type RepoScan,
} from "../../src/lib/brand/scan-code";
import { fontStackFamily } from "../../src/lib/brand/scan-css";
import { brandKitOf } from "../../src/lib/edit/brand";

/* ------------------------------------------------------------------ */
/* Reel 1's own record, read back through the studio's scanner          */
/* ------------------------------------------------------------------ */

interface Declared {
  repo: string;
  path: string;
  line: number | null;
  by: string;
  value: string;
  written: string;
}

/** aurixa-reel.json: every role reel_css.ts read from the four repositories, and where each is declared. */
const REEL = JSON.parse(
  readFileSync(
    join(import.meta.dir, "../../docs/brands/aurixa-reel-1/system-edition/aurixa-reel.json"),
    "utf8",
  ),
) as {
  read: { repo: string; sha: string }[];
  roles: Record<
    string,
    {
      brief: { token: string; value: string; from: string };
      css: { name: string; value: string }[];
      declared: Declared[];
    }
  >;
};

/** The brief's order: the site is the brand's own source, then the products built on it. */
const REPOS = [
  "Naidu-Group-Pty-Ltd/aurixa-systems",
  "Naidu-Group-Pty-Ltd/aurixa-builders",
  "Naidu-Group-Pty-Ltd/npc-client-dashboard",
  "Naidu-Group-Pty-Ltd/aurixa-mission-control-12b89885",
];

const CHANNELS = /^\d[\d.]*\s+[\d.]+%\s+[\d.]+%$/;

/**
 * The repositories as the scanner would have read them, from the record alone:
 * every custom property a role was read from (in its dark theme where the
 * brief reads it so), the two faces the site loads from Google Fonts (BRIEF.md
 * says so), and the gold its CSS writes out 102 times and never declares.
 */
function reelSystem(): CodeDesignSystem {
  const files = new Map<string, Map<string, FileReading>>();
  const reading = (repo: string, path: string) => {
    const byPath = files.get(repo) ?? new Map<string, FileReading>();
    files.set(repo, byPath);
    const file = byPath.get(path) ?? { ...readCodeFile({ path, kind: "css", text: "" }) };
    byPath.set(path, file);
    return file;
  };
  for (const record of Object.values(REEL.roles)) {
    const dark = /\(\.dark\)/.test(record.brief.token) || record.brief.from.includes("(`.dark`)");
    for (const decl of record.declared) {
      if (!decl.by.startsWith("--")) continue; // a rule's declaration, not a token
      const parsed = parseCssColour(
        CHANNELS.test(decl.value.trim()) ? `hsl(${decl.value})` : decl.value,
      );
      const kind = tokenKind(decl.by, decl.value, parsed?.hex ?? null);
      // Colours and shadows have a dark theme of their own; lengths and curves don't.
      const scheme = dark && ["colour", "shadow", "gradient"].includes(kind) ? "dark" : "default";
      const file = reading(decl.repo, decl.path);
      if (file.tokens.some((token) => token.name === decl.by && token.scheme === scheme)) continue;
      file.tokens.push({
        name: decl.by,
        value: decl.written,
        resolved: decl.value,
        hex: parsed?.hex ?? null,
        alpha: parsed ? Math.round(parsed.alpha * 100) / 100 : null,
        kind,
        scheme,
        context: record.brief.from.includes("@theme")
          ? "@theme"
          : scheme === "dark"
            ? ".dark"
            : ":root",
        source: "css",
        path: decl.path,
        line: decl.line,
      });
      if (kind === "font")
        file.fonts.push({
          family: fontStackFamily(decl.value)!,
          roles: [fontRoleOf(decl.by)],
          loaded: "google",
          weights: [],
          path: decl.path,
          line: decl.line,
        });
    }
  }
  reading(REPOS[0]!, "src/index.css").uses.push({ hex: "#d7b35f", count: 102 });
  const scans: RepoScan[] = REPOS.map((repo) => ({
    ref: parseRepoRef(repo)!,
    sha: REEL.read.find((entry) => entry.repo === repo)?.sha ?? null,
    readings: [...(files.get(repo)?.values() ?? [])],
    plan: { files: [], skipped: [], bytes: 0 },
    failed: [],
    logos: [],
  }));
  return mergeCodeScans(scans);
}

/** Which of reel_css.ts's roles each production role is, where Reel 1 had one. */
const REEL_ROLE: Partial<Record<ProductionRoleKey, string>> = {
  ground: "ground",
  surface: "surface",
  raised: "surface-raised",
  glass: "glass",
  ink: "ink",
  "ink-muted": "ink-muted",
  signature: "gold",
  line: "border",
  display: "display",
  body: "sans",
  "radius-window": "radius-window",
  "radius-card": "radius-card",
  "shadow-window": "shadow-window",
  "shadow-lift": "shadow-document",
  "blur-backdrop": "blur",
  move: "ease-move",
  settle: "ease-settle",
  press: "motion-press",
};

const reel = reelSystem();
const proposal = proposeProduction(reel, { importId: "55555555-5555-4555-8555-555555555555" });
const production = proposal.production;

describe("roles proposed from Reel 1's own code", () => {
  test("the scheme is the brand's own: the site is dark", () => {
    expect(production.scheme).toBe("dark");
    expect(production.read.map((entry) => entry.repo)).toEqual(REPOS);
    expect(production.read[0]!.sha).toBe("fb9ecba1eb20a225e413a1b6a026fb7d2e026b10");
  });

  test("every role reel_css.ts read from a token comes out the same: token, value and line", () => {
    for (const [key, reelRole] of Object.entries(REEL_ROLE) as [ProductionRoleKey, string][]) {
      const record = REEL.roles[reelRole]!;
      const role = production.roles[key];
      expect(role, key).toBeDefined();
      const token = record.declared.find((decl) => decl.by.startsWith("--"))!;
      const from = role!.kind === "motion" ? (role!.durationFrom ?? role!.from) : role!.from;
      expect(from?.token, key).toBe(token.by);
      // Declared where Reel 1 says, in one of the repositories it names.
      const places = record.declared.filter((decl) => decl.by === token.by);
      expect(
        places.some(
          (decl) =>
            decl.repo === from!.repo && decl.path === from!.path && decl.line === from!.line,
        ),
        key,
      ).toBe(true);
      // The value aurixa-reel.css writes.
      const value = roleProperties(key, role!).map((property) => property.value);
      expect(value, key).toContain(record.css[0]!.value);
    }
  });

  test("glass blur is the glass role's own token, as the brief pairs them", () => {
    const blur = production.roles["blur-glass"];
    expect(blur?.kind === "blur" && blur.value).toBe("16px");
    expect(blur?.from?.token).toBe("--glass-blur");
    expect(
      REEL.roles["glass"]!.css.find((entry) => entry.name === "--reel-glass-blur")?.value,
    ).toBe("16px");
  });

  test("each role says why, from the code", () => {
    expect(production.roles.ground?.why).toContain("near black");
    expect(production.roles.raised?.why).toContain("The step next to the ground's on its scale");
    expect(production.roles.glass?.why).toContain("translucent (55% opaque)");
    expect(production.roles.ink?.why).toContain("reads at 19.7:1 on the ground");
    expect(production.roles.press?.why).toContain("the control scale's slowest step");
  });

  test("the gold written out 102 times is offered, as the code wrote it", () => {
    const written = proposal.candidates.signature!.find(
      (candidate) => !candidate.value.from?.token,
    );
    expect(written?.value.kind === "colour" && written.value.hex).toBe("#d7b35f");
    expect(written?.why).toContain("written out 102× and never a token");
    // The token the brand declares leads: the gold its hairlines and rules are drawn in.
    expect(production.roles.signature?.kind === "colour" && production.roles.signature.hex).toBe(
      "#c89b3c",
    );
  });

  test("motion: arrivals settle, going moves, a title comes in on the scale's slow step", () => {
    const motion = brandMotion(production);
    expect(motion.move.ease).toEqual([0.2, 0, 0, 1]);
    expect(motion.settle.ease).toEqual([0.22, 1, 0.36, 1]);
    expect(motion.enter).toEqual({ ease: [0.22, 1, 0.36, 1], durationMs: 320 });
    expect(motion.press.durationMs).toBe(320);
    // Reel 1's code names no quicker step for going: its curve is proposed, its duration left to a person.
    expect(motion.exit).toEqual({ ease: [0.2, 0, 0, 1], durationMs: null });
  });

  test("roles the code doesn't name are left for a person, never guessed", () => {
    expect(production.roles.selection).toBeUndefined();
    expect(production.roles.danger).toBeUndefined();
    expect(production.roles.mono).toBeUndefined();
    // Nothing navy, near-black or grey is taken for the brand's signature or its accent.
    const accent = production.roles.accent;
    expect(accent?.kind === "colour" && accent.value).toBe("hsl(184 100% 35%)");
    expect(accent?.from?.token).toBe("--primary");
  });
});

/* ------------------------------------------------------------------ */
/* A scan with the decoys a real one has                               */
/* ------------------------------------------------------------------ */

const SITE = `@theme {
  --color-base-950: #040B16;
  --color-base-900: #0B162C;
  --color-marketing-panel: #10233D;
  --color-prism-magenta: #C89B3C;
  --color-text-primary: #FFFFFF;
  --color-marketing-muted: #B7C1D0;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-display: "Playfair Display", ui-serif, Georgia, serif;
}
.eyebrow { color: #d7b35f; }
`;

/** A product: shadcn's channels, light by default with a dark theme, and every part's own colour. */
const PRODUCT = `:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 184 100% 25%;
  --primary-foreground: 0 0% 100%;
  --muted-foreground: 215 16% 47%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --ring: 185 75% 40%;
  --chart-1: 12 76% 61%;
  --border: 214 32% 91%;
  --radius-sm: 0.375rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1.25rem;
  --radius-full: 9999px;
  --motion-fast: 120ms;
  --motion-base: 200ms;
  --motion-slow: 320ms;
  --motion-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --motion-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --motion-ease-in: cubic-bezier(0.4, 0, 1, 1);
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
.dark {
  --background: 217 69% 5%;
  --foreground: 0 0% 100%;
  --primary: 184 100% 35%;
  --muted-foreground: 215 20% 65%;
  --ring: 185 75% 64%;
  --border: 0 0% 100% / 0.1;
}
`;

function scanOf(label: string, files: { path: string; text: string }[]): RepoScan {
  return {
    ref: parseRepoRef(label)!,
    sha: "0123456789abcdef0123456789abcdef01234567",
    readings: files.map((file) => readCodeFile({ ...file, kind: "css" })),
    plan: { files: [], skipped: [], bytes: 0 },
    failed: [],
    logos: [],
  };
}

describe("roles from a scan with decoys", () => {
  const system = mergeCodeScans([
    scanOf("acme/site", [{ path: "src/index.css", text: SITE }]),
    scanOf("acme/app", [{ path: "src/styles/tokens.css", text: PRODUCT }]),
  ]);
  const { production: roles } = proposeProduction(system);
  const hex = (key: ProductionRoleKey) => {
    const role = roles.roles[key];
    return role?.kind === "colour" ? role.hex : null;
  };

  test("a product's light root is passed over for its dark theme, and the brand's own leads", () => {
    expect(roles.scheme).toBe("dark");
    expect(hex("ground")).toBe("#040b16");
    expect(roles.roles.ground?.from?.repo).toBe("acme/site");
    expect(hex("ink")).toBe("#ffffff");
  });

  test("a part's own colour (a foreground on the accent, a chart series) is never a role", () => {
    for (const key of ["accent", "ink", "ink-muted", "signature"] as const)
      expect(roles.roles[key]?.from?.token, key).not.toMatch(/foreground$|chart/);
    expect(roles.roles.accent?.from?.token).toBe("--primary");
    expect(roles.roles.accent?.from?.scheme).toBe("dark");
  });

  test("selection and danger are found by their names, in the dark theme", () => {
    expect(roles.roles.selection?.from?.token).toBe("--ring");
    expect(hex("selection")).toBe("#5edde8");
    expect(roles.roles.danger?.from?.token).toBe("--destructive");
  });

  test("motion: ease-in-out moves, ease-out settles, ease-in goes; durations by step", () => {
    const motion = brandMotion(roles);
    expect(motion.move.ease).toEqual([0.4, 0, 0.2, 1]);
    expect(motion.settle.ease).toEqual([0.22, 1, 0.36, 1]);
    expect(motion.exit).toEqual({ ease: [0.4, 0, 1, 1], durationMs: 200 });
    expect(motion.enter).toEqual({ ease: [0.22, 1, 0.36, 1], durationMs: 320 });
    expect(motion.press.durationMs).toBe(320);
  });

  test("corners: a pill is never a window's, and the card isn't the window", () => {
    const value = (key: ProductionRoleKey) => {
      const role = roles.roles[key];
      return role?.kind === "radius" ? role.value : null;
    };
    expect(value("radius-window")).toBe("1.25rem");
    expect(value("radius-card")).toBe("0.75rem");
  });

  test("the mono face, and an eyebrow set in it for a person to finish", () => {
    const mono = roles.roles.mono;
    expect(mono?.kind === "type" && mono.family).toBe("JetBrains Mono");
    const eyebrow = roles.roles.eyebrow;
    expect(eyebrow?.kind === "type" && eyebrow.family).toBe("JetBrains Mono");
    expect(eyebrow?.why).toContain("Give it the brand's tracking and case");
  });

  test("a light brand reads its own scheme", () => {
    const light = mergeCodeScans([
      scanOf("acme/light", [
        {
          path: "src/index.css",
          text: ":root { --background: #FAFAF7; --foreground: #1A1A1A; --surface: #F0EFEA; --brand: #E4572E; }",
        },
      ]),
    ]);
    const proposed = proposeProduction(light).production;
    expect(proposed.scheme).toBe("light");
    const ground = proposed.roles.ground;
    expect(ground?.kind === "colour" && ground.hex).toBe("#fafaf7");
    const surface = proposed.roles.surface;
    expect(surface?.kind === "colour" && surface.hex).toBe("#f0efea");
    const signature = proposed.roles.signature;
    expect(signature?.kind === "colour" && signature.hex).toBe("#e4572e");
  });

  test("where the repositories disagree, the brand's own value is chosen and nothing is written for a person", () => {
    const disagreeing = mergeCodeScans([
      scanOf("acme/site", [{ path: "a.css", text: ":root { --brand: #C89B3C; }" }]),
      scanOf("acme/app", [{ path: "b.css", text: ":root { --brand: #D9A520; }" }]),
    ]);
    const { production: proposed } = proposeProduction(disagreeing);
    expect(proposed.decisions).toHaveLength(1);
    expect(proposed.decisions[0]).toMatchObject({ token: "--brand", chosen: "#C89B3C", note: "" });
    expect(productionChecks(proposed).decisions).toEqual({
      decided: 0,
      total: 1,
      open: ["--brand"],
    });
  });

  test("a token's name, as words", () => {
    expect(nameWords("--color-marketing-panel")).toBe("color marketing panel");
    expect(nameWords("colors.primary.DEFAULT")).toBe("colors primary default");
    expect(nameWords("AURIXA_PALETTE.goldInk")).toBe("aurixa palette gold ink");
  });
});

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

describe("checks", () => {
  test("Reel 1's ink reads on its ground and its surface at AAA", () => {
    const checks = productionChecks(production);
    const pair = (text: string, on: string) =>
      checks.contrast.find((check) => check.text === text && check.on === on);
    expect(pair("ink", "ground")).toMatchObject({ ratio: 19.73, level: "AAA", required: true });
    expect(pair("ink", "surface")).toMatchObject({ ratio: 15.79, level: "AAA", required: true });
    // Glass is seen over the ground.
    expect(pair("ink", "glass")!.ratio).toBeGreaterThan(15);
    expect(checks.list.find((check) => check.key === "contrast")?.ok).toBe(true);
  });

  test("WCAG levels", () => {
    expect(contrastLevel(21)).toBe("AAA");
    expect(contrastLevel(7)).toBe("AAA");
    expect(contrastLevel(6.99)).toBe("AA");
    expect(contrastLevel(4.5)).toBe("AA");
    expect(contrastLevel(3.2)).toBe("AA large");
    expect(contrastLevel(2.9)).toBe("fails");
  });

  test("ink that doesn't read on the surface fails the check", () => {
    const pale = withRole(production, "surface", colourByHand("#E8E8E8"));
    const check = productionChecks(pale).list.find((entry) => entry.key === "contrast")!;
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("ink on surface 1.2");
  });

  test("every required role filled; a motion role needs what it is for", () => {
    const checks = productionChecks(production);
    // Exit has its curve but no duration in Reel 1's code.
    expect(checks.roles.missing).toEqual(["exit"]);
    expect(checks.roles.unused).toEqual(["selection", "danger", "mono", "eyebrow"]);
    const filled = withRole(production, "exit", motionByHand("cubic-bezier(0.2, 0, 0, 1)", 220));
    expect(productionChecks(filled).roles.missing).toEqual([]);
    expect(productionChecks(filled).list[0]).toMatchObject({ key: "roles", ok: true });
  });

  test("each face loaded: by the code, by the kit's own file, never a system face", () => {
    const checks = productionChecks(production);
    expect(checks.faces.every((face) => face.loaded)).toBe(true);
    expect(checks.faces.find((face) => face.role === "display")?.detail).toBe(
      "Loaded by the brand's code from Google Fonts.",
    );
    const unloaded = withRole(production, "body", typeByHand("Aurixa Sans"));
    const face = productionChecks(unloaded).faces.find((entry) => entry.role === "body")!;
    expect(face.loaded).toBe(false);
    expect(face.detail).toContain("upload its file");
    expect(
      productionChecks(unloaded, { fonts: [{ family: "Aurixa Sans" }] }).faces.find(
        (entry) => entry.role === "body",
      )?.loaded,
    ).toBe(true);
    const system = withRole(production, "mono", typeByHand("ui-monospace"));
    expect(productionChecks(system).faces.find((entry) => entry.role === "mono")?.loaded).toBe(
      false,
    );
  });

  test("a disagreement is decided once a note says why", () => {
    const disagreeing: BrandProduction = {
      ...production,
      decisions: [
        {
          token: "--brand",
          scheme: "default",
          values: [
            { value: "#C89B3C", hex: "#c89b3c", repos: REPOS.slice(0, 2) },
            { value: "43 74% 49%", hex: "#d9a520", repos: [REPOS[2]!] },
          ],
          chosen: "#C89B3C",
          note: "",
        },
      ],
    };
    expect(productionChecks(disagreeing).decisions.open).toEqual(["--brand"]);
    disagreeing.decisions[0]!.note =
      "Three of the four agree; the fourth is NPC Services' house gold.";
    expect(productionChecks(disagreeing).decisions).toEqual({ decided: 1, total: 1, open: [] });
  });
});

/* ------------------------------------------------------------------ */
/* The stylesheet                                                      */
/* ------------------------------------------------------------------ */

describe("the production stylesheet", () => {
  const kit = { name: "Aurixa Systems", production };
  const css = productionStylesheet(kit);

  test("each value with the repository, file and line it is declared on, as aurixa-reel.css writes it", () => {
    expect(css).toContain(
      "  --brand-ground: #040B16; /* --color-base-950 · aurixa-systems src/index.css:7 */",
    );
    expect(css).toContain(
      "  --brand-glass: hsl(220 60% 11% / 0.55); /* --glass-fill (dark) · aurixa-builders src/styles/tokens.css:463; written hsl(var(--card) / 0.55) */",
    );
    expect(css).toContain(
      "  --brand-signature: #C89B3C; /* --color-prism-magenta · aurixa-systems src/index.css:18 */",
    );
    expect(css).toContain(
      '  --brand-display: "Playfair Display", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif; /* --font-display · aurixa-systems src/index.css:36 */',
    );
    expect(css).toMatch(
      /--brand-radius-window: 1\.25rem; \/\* --radius-xl · (?:aurixa-builders src\/styles\/tokens\.css:297; the same in npc-client-dashboard|npc-client-dashboard src\/styles\/tokens\.css:305; the same in aurixa-builders) \*\//,
    );
    expect(css).toContain(
      "  --brand-ease-move: cubic-bezier(0.2, 0, 0, 1); /* --motion-ease-emphasized",
    );
    expect(css).toContain("  --brand-duration-press: 320ms; /* --motion-slow");
    expect(css).toContain("  --brand-display-italic-style: italic;");
  });

  test("its header names the commits read, the checks and what is left to do", () => {
    expect(css.startsWith("/*\n * Aurixa Systems · production stylesheet")).toBe(true);
    expect(css).toContain(" *   Naidu-Group-Pty-Ltd/aurixa-systems @ fb9ecba1eb20");
    expect(css).toContain(
      " * Checked: ink reads on the ground and the surface. ink on ground 19.73:1 (AAA), ink on surface 15.79:1 (AAA)",
    );
    expect(css).toContain(" * Not yet: every role filled. 1 still to fill: exit.");
  });

  test("the same kit always writes the same stylesheet, and a value can't break out of it", () => {
    expect(productionStylesheet(kit)).toBe(css);
    const opened = (css.match(/\/\*/g) ?? []).length;
    const closed = (css.match(/\*\//g) ?? []).length;
    expect(opened).toBe(closed);
    expect(css.match(/^ {2}--brand-[\w-]+: [^;{}]+;/gm)?.length).toBeGreaterThan(25);
    // A role set by hand says so.
    const byHand = withRole(production, "selection", colourByHand("#5EDDE8", "the focus cyan"));
    expect(productionStylesheet({ ...kit, production: byHand })).toContain(
      "  --brand-selection: #5EDDE8; /* set by hand: the focus cyan */",
    );
  });

  test("its decisions are written in its header", () => {
    const decided: BrandProduction = {
      ...production,
      decisions: [
        {
          token: "--brand",
          scheme: "default",
          values: [
            { value: "#C89B3C", hex: "#c89b3c", repos: REPOS.slice(0, 2) },
            { value: "43 74% 49%", hex: "#d9a520", repos: [REPOS[2]!] },
          ],
          chosen: "#C89B3C",
          note: "Three of the four agree */ and the fourth is NPC's house gold.",
        },
      ],
    };
    const written = productionStylesheet({ ...kit, production: decided });
    expect(written).toContain(
      " *   --brand: #C89B3C (#c89b3c in aurixa-systems, aurixa-builders; #d9a520 in npc-client-dashboard). Three of the four agree * / and the fourth is NPC's house gold.",
    );
  });

  test("as JSON: the same properties, each role with its source", () => {
    const json = productionTokens(kit);
    expect(json.properties["--brand-ground"]).toBe("#040B16");
    expect(json.properties["--brand-ease-settle"]).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    const ground = json.roles.find((role) => role.key === "ground")!;
    expect(ground.value.from).toMatchObject({
      token: "--color-base-950",
      repo: "Naidu-Group-Pty-Ltd/aurixa-systems",
      path: "src/index.css",
      line: 7,
    });
    expect(json.checks.contrast[0]!.ratio).toBe(19.73);
    expect(JSON.parse(JSON.stringify(json)).properties).toEqual(json.properties);
  });
});

/* ------------------------------------------------------------------ */
/* Stored, changed and read again                                       */
/* ------------------------------------------------------------------ */

describe("a stored production", () => {
  test("reads back as it was saved", () => {
    expect(productionOf(JSON.parse(JSON.stringify(production)))).toEqual(production);
  });

  test("a kit from before production roles has none", () => {
    expect(isEmptyProduction(productionOf(undefined))).toBe(true);
    expect(isEmptyProduction(productionOf({}))).toBe(true);
    expect(isEmptyProduction(production)).toBe(false);
    // A kit's row before migration 0029 has no production column; after it, its roles read back.
    expect(isEmptyProduction(brandKitOf({ id: "k1", name: "Aurixa" }).production)).toBe(true);
    const stored = JSON.parse(JSON.stringify(production)) as unknown;
    expect(brandKitOf({ id: "k1", name: "Aurixa", production: stored }).production).toEqual(
      production,
    );
  });

  test("anything malformed or unsafe is dropped, the rest kept", () => {
    const read = productionOf({
      scheme: "light",
      roles: {
        ground: { kind: "colour", value: "#fff; } body { background: red" },
        ink: { kind: "colour", value: "#111111", from: { repo: "a/b", path: "x.css", line: 3 } },
        surface: { kind: "colour", value: "url(https://example.com/x.png)" },
        display: {
          kind: "type",
          family: "Playfair Display",
          stack: '"Playfair Display", serif',
          weight: 1200,
        },
        "radius-window": { kind: "radius", value: "1rem /* */" },
        move: { kind: "motion", ease: [2, 0, 0, 1], durationMs: 200 },
        settle: { kind: "motion", ease: [0.22, 1, 0.36, 1], durationMs: -5 },
        press: { kind: "motion" },
        nonsense: { kind: "colour", value: "#000000" },
      },
      decisions: [
        {
          token: "--brand",
          values: [{ value: "#c89b3c", repos: ["a/b"] }],
          chosen: "#c89b3c",
          note: "  Ours.  ",
        },
      ],
    });
    expect(read.scheme).toBe("light");
    expect(Object.keys(read.roles).sort()).toEqual(["display", "ink", "move", "settle"]);
    expect(read.roles.ink?.from).toMatchObject({
      repo: "a/b",
      path: "x.css",
      line: 3,
      scheme: "default",
    });
    const display = read.roles.display;
    expect(display?.kind === "type" && display.weight).toBeNull();
    const move = read.roles.move;
    expect(move?.kind === "motion" && move).toMatchObject({ ease: null, durationMs: 200 });
    const settle = read.roles.settle;
    expect(settle?.kind === "motion" && settle).toMatchObject({ durationMs: null });
    expect(read.decisions[0]).toMatchObject({ token: "--brand", note: "Ours.", scheme: "default" });
  });

  test("read again from code, what a person set and wrote is kept", () => {
    let edited = withRole(production, "selection", colourByHand("#5EDDE8", "the focus cyan"));
    edited = withRole(edited, "ground", null);
    edited = {
      ...edited,
      decisions: [
        { token: "--brand", scheme: "default", values: [], chosen: "#C89B3C", note: "Ours." },
      ],
    };
    const next = {
      ...production,
      decisions: [
        { token: "--brand", scheme: "default" as const, values: [], chosen: "#D9A520", note: "" },
      ],
    };
    const merged = reproposeProduction(edited, next);
    expect(merged.roles.selection?.from).toBeNull();
    expect(merged.roles.selection?.kind === "colour" && merged.roles.selection.hex).toBe("#5edde8");
    // A role from code comes from the code read now.
    expect(merged.roles.ground).toEqual(production.roles.ground);
    expect(merged.decisions[0]).toMatchObject({ chosen: "#C89B3C", note: "Ours." });
  });

  test("read again from code, a candidate a person picked is kept, read afresh where it still is", () => {
    const goldInk = proposal.candidates.signature!.find(
      (candidate) => !candidate.value.from?.token,
    )!;
    const picked = withRole(production, "signature", {
      ...goldInk.value,
      why: goldInk.why,
      picked: true,
    });
    // The flag is kept with the kit.
    expect(productionOf(JSON.parse(JSON.stringify(picked))).roles.signature?.picked).toBe(true);
    const again = reproposeProduction(picked, production, proposal.candidates);
    const signature = again.roles.signature;
    expect(signature?.kind === "colour" && signature.hex).toBe("#d7b35f");
    expect(signature?.picked).toBe(true);
    expect(signature?.why).toContain("written out 102×");
    // Gone from the code read now: still the person's choice, saying so.
    const gone = reproposeProduction(picked, production, {});
    expect(gone.roles.signature?.kind === "colour" && gone.roles.signature.hex).toBe("#d7b35f");
    expect(gone.roles.signature?.why).toBe(
      "Picked by a person; no longer declared in the code read now.",
    );
  });

  test("values a person types", () => {
    expect(colourByHand("tomato")).toMatchObject({ hex: "#ff6347", alpha: 1, from: null });
    expect(colourByHand("hsl(220 60% 11% / 0.55)")).toMatchObject({ alpha: 0.55 });
    expect(colourByHand("not a colour")).toBeNull();
    expect(colourByHand("red; } a { color: blue")).toBeNull();
    expect(typeByHand('"Playfair Display"')).toMatchObject({
      family: "Playfair Display",
      stack: '"Playfair Display", serif',
    });
    expect(typeByHand("JetBrains Mono")?.stack).toBe('"JetBrains Mono", ui-monospace, monospace');
    expect(typeByHand("<script>")).toBeNull();
    expect(scaleByHand("radius", "12px")).toMatchObject({ kind: "radius", value: "12px" });
    expect(scaleByHand("radius", "big")).toBeNull();
    expect(scaleByHand("shadow", "0 8px 24px rgb(0 0 0 / 0.4)")?.value).toBe(
      "0 8px 24px rgb(0 0 0 / 0.4)",
    );
    expect(motionByHand("ease-out", 250)).toMatchObject({ ease: [0, 0, 0.58, 1], durationMs: 250 });
    expect(motionByHand("steps(4)", null)).toBeNull();
  });

  test("the catalogue: every role has a kind, a label and what it is for", () => {
    const keys = PRODUCTION_ROLES.map((role) => role.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const role of PRODUCTION_ROLES) {
      expect(role.label.length).toBeGreaterThan(2);
      expect(role.about.endsWith(".")).toBe(true);
    }
    expect(
      PRODUCTION_ROLES.filter((role) => role.kind === "motion").map((role) => role.key),
    ).toEqual(["move", "settle", "enter", "exit", "press"]);
  });
});

/* ------------------------------------------------------------------ */
/* Curves and durations                                                */
/* ------------------------------------------------------------------ */

describe("curves and durations, as code writes them", () => {
  test("cubic-bezier curves and CSS's keywords", () => {
    expect(parseCubicBezier("cubic-bezier(0.2, 0, 0, 1)")).toEqual([0.2, 0, 0, 1]);
    expect(parseCubicBezier("cubic-bezier(.22,1,.36,1)")).toEqual([0.22, 1, 0.36, 1]);
    expect(parseCubicBezier("cubic-bezier(0.34, 1.56, 0.64, 1)")).toEqual([0.34, 1.56, 0.64, 1]);
    expect(parseCubicBezier("ease-out")).toEqual([0, 0, 0.58, 1]);
    expect(parseCubicBezier("EASE")).toEqual([0.25, 0.1, 0.25, 1]);
    expect(parseCubicBezier("cubic-bezier(1.2, 0, 0, 1)")).toBeNull();
    expect(parseCubicBezier("cubic-bezier(0.2, 0, 1)")).toBeNull();
    expect(parseCubicBezier("steps(4, end)")).toBeNull();
    expect(parseCubicBezier("var(--ease)")).toBeNull();
    expect(formatCubicBezier([0.22, 1, 0.36, 1])).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  });

  test("durations", () => {
    expect(parseDuration("320ms")).toBe(320);
    expect(parseDuration("0.32s")).toBe(320);
    expect(parseDuration(".2s")).toBe(200);
    expect(parseDuration("1.5S")).toBe(1500);
    expect(parseDuration("320")).toBeNull();
    expect(parseDuration("-1s")).toBeNull();
    expect(parseDuration("20s")).toBeNull();
  });

  test("a token's motion: one value, or a transition shorthand", () => {
    expect(motionParts("320ms")).toEqual({ durationMs: 320, ease: null });
    expect(motionParts("cubic-bezier(0.2, 0, 0, 1)")).toEqual({
      durationMs: null,
      ease: [0.2, 0, 0, 1],
    });
    expect(motionParts("transform 320ms cubic-bezier(0.22, 1, 0.36, 1) 40ms, opacity 1s")).toEqual({
      durationMs: 320,
      ease: [0.22, 1, 0.36, 1],
    });
    expect(motionParts("opacity .2s ease-out")).toEqual({ durationMs: 200, ease: [0, 0, 0.58, 1] });
    expect(motionParts("var(--motion-slow)")).toEqual({ durationMs: null, ease: null });
  });

  test("a curve solved at a moment, as a browser solves it", () => {
    expect(cubicBezierAt([0, 0, 1, 1], 0.37)).toBeCloseTo(0.37, 6);
    expect(cubicBezierAt([0.42, 0, 0.58, 1], 0.5)).toBeCloseTo(0.5, 6);
    expect(cubicBezierAt([0.2, 0, 0, 1], 0)).toBe(0);
    expect(cubicBezierAt([0.2, 0, 0, 1], 1)).toBe(1);
    expect(cubicBezierAt([0.2, 0, 0, 1], -1)).toBe(0);
    // An ease-out is most of the way there by half its time; ease-settle more so.
    expect(cubicBezierAt([0, 0, 0.58, 1], 0.5)).toBeCloseTo(0.68465, 4);
    expect(cubicBezierAt([0.22, 1, 0.36, 1], 0.5)).toBeGreaterThan(0.9);
    // A spring overshoots.
    const spring = [0.34, 1.56, 0.64, 1] as const;
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((x) => cubicBezierAt(spring, x)))).toBeGreaterThan(
      1,
    );
    expect(cubicBezierPath([0.2, 0, 0, 1], 100)).toBe("M 0 100 C 20 100, 0 0, 100 0");
  });
});
