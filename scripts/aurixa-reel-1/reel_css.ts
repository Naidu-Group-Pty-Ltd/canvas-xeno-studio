/**
 * Writes Reel 1's graphics stylesheet, aurixa-reel.css, with Xeno Studio's code scanner. Every
 * role in the brief's table "Token roles the graphics are drawn in" (brief.json `design.roles`) is
 * read from the four Aurixa repositories' own code and written as a custom property, with the
 * repository, file and line it is declared on. Each is checked against the value the brief
 * records. A role the brief draws from a rule (`.compliance-traveller`) gets that rule's own
 * declarations.
 *
 *   bun scripts/aurixa-reel-1/reel_css.ts [owner/repo[=checkout] ...]          writes it
 *   bun scripts/aurixa-reel-1/reel_css.ts [owner/repo[=checkout] ...] --check  exits 1 when the files
 *                                                                              are stale or a role disagrees
 *
 * The repositories default to the four, read from GitHub (GITHUB_TOKEN for private ones); give a
 * checkout with `=path`. Beside the stylesheet it writes aurixa-reel.json: each role's value, where
 * it is declared and whether the brief agrees. Both name the commits read, never a date, so the
 * same commits always write the same files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCssColour } from "../../src/lib/brand/colour";
import { repoLabel, type RepoScan } from "../../src/lib/brand/scan-code";
import { cssRules, type CssRule } from "../../src/lib/brand/scan-css";
import { scanRepos } from "../../src/lib/brand/scan-repos";
import { checkoutSource, reposFrom } from "../brand/checkout-source";

const ROOT = resolve(import.meta.dir, "../..");
const DIR = join(ROOT, "docs/brands/aurixa-reel-1/system-edition");
const OWNER = "Naidu-Group-Pty-Ltd";
/** In the brief's order: the site is the brand's own, then the products built on it. */
const REPOS = [
  "aurixa-systems",
  "aurixa-builders",
  "npc-client-dashboard",
  "aurixa-mission-control-12b89885",
] as const;

type Role = [token: string, value: string, source: string];

/** A value as the reel's graphics read it, and where it comes from. */
interface Property {
  name: string;
  value: string;
  from: string;
}

interface Declared {
  repo: string;
  path: string;
  line: number | null;
  /** The token or rule it is declared by. */
  by: string;
  /** As it reads (another token's value read through), and as written. */
  value: string;
  written: string;
}

interface Resolved {
  properties: Property[];
  declared: Declared[];
  /** Whether the code holds the brief's value: null where there is nothing to compare. */
  agrees: boolean | null;
  note: string | null;
}

/** A role the brief draws from more than one token: the suffix of each after the first. */
const TOKEN_PARTS: Record<string, string[]> = {
  glass: ["", "blur"],
  pointer: ["", "edge"],
};

/**
 * A role the brief draws from a rule: the declaration that is its value (`colour` takes the colour
 * out of a shorthand), and the ones that come with it, each as `--reel-<role>-<property>`.
 */
const RULE_PARTS: Record<string, { main: string; colour?: boolean; with: string[] }> = {
  "press-ring": { main: "outline", colour: true, with: ["outline", "outline-offset"] },
  hairline: { main: "background", with: ["width", "height"] },
  "glow-gold": { main: "box-shadow", with: [] },
  traveller: { main: "background", with: ["width", "height", "border-radius", "box-shadow"] },
  "link-line": { main: "background", with: ["width"] },
  "dot-field": { main: "background-image", with: ["background-size", "opacity"] },
  corners: {
    main: "border-top",
    with: ["width", "height", "border-left", "border-right", "border-bottom"],
  },
  mono: { main: "font", with: ["letter-spacing", "text-transform", "color"] },
};

/** A value the brief names that no repository declares: what it is, and the face it renders as. */
const PLAIN: Record<string, { value: string; note: string }> = {
  "before-surface": { value: "#FFFFFF", note: "plain white: today's tools, in no brand's colour" },
  "before-type": {
    value: '"Selawik", system-ui, sans-serif',
    note: "the system face, set as the plates set it (Selawik, the open Segoe UI)",
  },
};

/* ------------------------------------------------------------------ */
/* Reading the brief's words                                           */
/* ------------------------------------------------------------------ */

const reposIn = (source: string) =>
  REPOS.filter((repo) => source.includes(repo)).sort(
    (x, y) => source.indexOf(x) - source.indexOf(y),
  );
const fileIn = (source: string) => /`((?:[\w.-]+\/)*[\w.-]+\.css)`/.exec(source)?.[1] ?? null;
const tokenNames = (token: string) => [...token.matchAll(/--[\w-]+/g)].map((match) => match[0]);
const darkIn = (token: string, source: string) =>
  /\(\.dark\)/.test(token) || source.includes("(`.dark`)");

/** Values compared as CSS reads them: case, spaces and a trailing "…" aside, or as the same colour. */
const flat = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s*([,/()])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

function sameValue(brief: string, code: string): boolean {
  const [a, b] = [flat(brief), flat(code)];
  if (a === b) return true;
  if (a.endsWith("…")) return b.startsWith(a.slice(0, -1).replace(/,$/, ""));
  const [x, y] = [parseCssColour(brief), parseCssColour(code)];
  return !!x && !!y && x.hex === y.hex && Math.abs(x.alpha - y.alpha) < 0.01;
}

/** Bare HSL channels (`184 100% 35%`) as a colour; a value that still reads another token is no use. */
const CHANNELS = /^\d+(?:\.\d+)?(?:deg)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%(?:\s*\/\s*[\d.]+%?)?$/;
function usable(value: string): string | null {
  const text = value.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  if (text.includes("var(")) return null;
  return CHANNELS.test(text) ? `hsl(${text})` : text;
}

/** The colours, lengths and keywords a brief value is made of, each to be found in the code. */
function partsOf(value: string): string[] {
  const text = flat(value);
  return [
    ...(text.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/g) ?? []),
    ...(text.match(/(?<![\w#.])-?\d*\.?\d+(?:px|rem|em|%)(?![\w])/g) ?? []),
    ...(text.match(/\b(?:uppercase|lowercase)\b/g) ?? []),
  ];
}

/* ------------------------------------------------------------------ */
/* Finding it in the code                                              */
/* ------------------------------------------------------------------ */

const where = (item: { repo: string; path: string; line: number | null }) =>
  `${item.repo.split("/")[1]} ${item.path}${item.line ? `:${item.line}` : ""}`;

function scanOf(scans: RepoScan[], repo: string): RepoScan | null {
  return scans.find((scan) => scan.ref.repo === repo) ?? null;
}

/** A custom property where the brief says it is: its repository, file, `@theme` and scheme. */
function declaredToken(
  scans: RepoScan[],
  repos: string[],
  name: string,
  hint: { file: string | null; theme: boolean; dark: boolean },
): Declared[] {
  const out: Declared[] = [];
  for (const repo of repos) {
    const scan = scanOf(scans, repo);
    if (!scan) continue;
    const pool = scan.readings
      .flatMap((reading) => reading.tokens)
      .filter(
        (token) =>
          token.name === name &&
          (!hint.file || token.path.endsWith(hint.file)) &&
          (!hint.theme || token.context === "@theme"),
      );
    // The dark theme's own value, else the root's (which the dark theme inherits); never a fallback's.
    const pick =
      (hint.dark ? pool.find((token) => token.scheme === "dark") : undefined) ??
      pool.find((token) => token.scheme === "default") ??
      pool.find((token) => token.scheme === "light");
    if (pick)
      out.push({
        repo: repoLabel(scan.ref),
        path: pick.path,
        line: pick.line,
        by: name,
        value: pick.resolved,
        written: pick.value,
      });
  }
  return out;
}

const selectorKey = (selector: string) =>
  selector
    .replace(/\s*([>+~])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function selectorParts(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < selector.length; at += 1) {
    const char = selector[at];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(selector.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** A rule for the brief's selector: itself, its ::before and ::after, or (for a state) any element in it. */
function ruleMatches(rule: CssRule, selector: string): boolean {
  const want = selectorKey(selector);
  return selectorParts(rule.selector).some((part) => {
    const key = selectorKey(part);
    return (
      key === want || key.startsWith(`${want}::`) || (want.startsWith(":") && key.endsWith(want))
    );
  });
}

/* ------------------------------------------------------------------ */
/* Each role                                                           */
/* ------------------------------------------------------------------ */

async function resolveRole(
  role: string,
  [token, value, source]: Role,
  scans: RepoScan[],
  texts: (repo: string, path: string) => Promise<string | null>,
): Promise<Resolved> {
  const repos = reposIn(source);
  const reel = `--reel-${role}`;

  const plain = PLAIN[role];
  if (plain)
    return {
      properties: [{ name: reel, value: plain.value, from: plain.note }],
      declared: [],
      agrees: null,
      note: plain.note,
    };

  // A rule's device: `.compliance-traveller`, `:focus-visible outline`.
  if (/^[.:]/.test(token)) {
    const parts = RULE_PARTS[role];
    if (!parts) throw new Error(`${role}: a rule role with no RULE_PARTS entry`);
    const words = token.trim().split(/\s+/);
    const property = ["outline", "box-shadow", "background", "color", "border"].includes(
      words.at(-1)!,
    )
      ? words.pop()!
      : null;
    const selector = words.join(" ");
    const repo = repos[0];
    const file = fileIn(source);
    const scan = repo ? scanOf(scans, repo) : null;
    if (!scan || !file) return { properties: [], declared: [], agrees: false, note: "not found" };
    const text = await texts(repo!, file);
    if (!text) return { properties: [], declared: [], agrees: false, note: `${file} not read` };
    const colours = partsOf(value).filter((part) => part.startsWith("#") || part.startsWith("rgb"));
    const matched = cssRules(text).filter((rule) => ruleMatches(rule, selector));
    // The rule itself, not a small screen's or a fallback's version of it.
    let rules = matched.some((rule) => !rule.condition)
      ? matched.filter((rule) => !rule.condition)
      : matched;
    if (property) {
      rules = rules.filter((rule) => rule.declarations.some((decl) => decl.property === property));
      // The one drawn in the brief's colour (the focus ring is cyan on the pages, gold on the skip link).
      const coloured = rules.filter((rule) =>
        rule.declarations.some(
          (decl) =>
            decl.property === property && colours.every((hex) => flat(decl.value).includes(hex)),
        ),
      );
      rules = coloured.length ? coloured.slice(0, 1) : rules.slice(0, 1);
    }
    // Each property as the first matching rule declares it (a later @media override is the smaller screen's).
    const first = new Map<string, Declared & { property: string }>();
    for (const rule of rules)
      for (const decl of rule.declarations)
        if (!first.has(decl.property))
          first.set(decl.property, {
            repo: repoLabel(scan.ref),
            path: file,
            line: decl.line,
            by: `${rule.selector} { ${decl.property} }`,
            value: decl.value,
            written: decl.value,
            property: decl.property,
          });
    const main = first.get(parts.main);
    if (!main)
      return {
        properties: [],
        declared: [],
        agrees: false,
        note: `no ${parts.main} in ${selector}`,
      };
    const mainValue = parts.colour
      ? (/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i.exec(main.value)?.[0] ?? main.value)
      : main.value;
    const declared = [main, ...parts.with.flatMap((name) => first.get(name) ?? [])].filter(
      (decl, index, list) => list.findIndex((other) => other.property === decl.property) === index,
    );
    const code = declared.map((decl) => flat(decl.value)).join(" ");
    const missing = partsOf(value).filter((part) => !code.includes(part));
    return {
      properties: [
        { name: reel, value: mainValue, from: `${main.by.split(" {")[0]} · ${where(main)}` },
        ...parts.with.flatMap((name) => {
          const decl = first.get(name);
          return decl ? [{ name: `${reel}-${name}`, value: decl.value, from: where(decl) }] : [];
        }),
      ],
      declared,
      agrees: missing.length === 0,
      note: missing.length ? `the code doesn't have ${missing.join(", ")}` : null,
    };
  }

  // A value written out and never a token: its uses in the file the brief names.
  if (token === "none") {
    const repo = repos[0];
    const file = fileIn(source);
    const text = repo && file ? await texts(repo, file) : null;
    const hex = value.toLowerCase();
    if (!repo || !file || !text)
      return { properties: [], declared: [], agrees: false, note: "not found" };
    const uses = text.match(new RegExp(`${hex.replace("#", "#")}(?![0-9a-f])`, "gi"))?.length ?? 0;
    const firstRule = cssRules(text).find((rule) =>
      rule.declarations.some((decl) => flat(decl.value).includes(hex)),
    );
    const firstDecl = firstRule?.declarations.find((decl) => flat(decl.value).includes(hex));
    const scan = scanOf(scans, repo)!;
    const declaredAt: Declared = {
      repo: repoLabel(scan.ref),
      path: file,
      line: firstDecl?.line ?? null,
      by: firstRule ? `${firstRule.selector} { ${firstDecl!.property} }` : "written out",
      value: hex,
      written: firstDecl?.value ?? hex,
    };
    return {
      properties: [
        {
          name: reel,
          value: hex,
          from: `written out ${uses}× in ${where({ ...declaredAt, line: null })}, never a token; first in ${firstRule?.selector ?? "?"} (line ${declaredAt.line ?? "?"})`,
        },
      ],
      declared: [declaredAt],
      agrees: uses > 0,
      note: uses ? `${uses} uses` : "not written in the file",
    };
  }

  // One or more custom properties.
  const names = tokenNames(token);
  if (!names.length) throw new Error(`${role}: no token, rule or plain value in "${token}"`);
  const suffixes = TOKEN_PARTS[role] ?? [""];
  if (names.length !== suffixes.length)
    throw new Error(`${role}: ${names.length} tokens and ${suffixes.length} TOKEN_PARTS entries`);
  // "hsl(220 60% 11% / 0.55) · 16px" is two values; a slash inside a colour is not a separator.
  const values = names.length > 1 ? value.split(value.includes(" · ") ? " · " : " / ") : [value];
  const hint = {
    file: fileIn(source),
    theme: source.includes("`@theme`"),
    dark: darkIn(token, source),
  };
  const properties: Property[] = [];
  const declared: Declared[] = [];
  const notes: string[] = [];
  let agrees = true;
  for (const [index, name] of names.entries()) {
    const found = declaredToken(scans, repos, name, hint);
    if (!found.length) {
      agrees = false;
      notes.push(`${name} not found in ${repos.join(", ")}`);
      continue;
    }
    declared.push(...found);
    const want = values[index] ?? value;
    for (const decl of found)
      if (!sameValue(want, decl.written) && !sameValue(want, decl.value)) {
        agrees = false;
        notes.push(`${name} is ${decl.written} in ${where(decl)}, the brief has ${want}`);
      }
    const lead = found[0]!;
    const css = usable(lead.value);
    if (!css) {
      agrees = false;
      notes.push(`${name} still reads another token: ${lead.value}`);
      continue;
    }
    const others = found.slice(1).map((decl) => decl.repo.split("/")[1]);
    properties.push({
      name: suffixes[index] ? `${reel}-${suffixes[index]}` : reel,
      value: css,
      from: `${name}${hint.dark ? " (dark)" : ""} · ${where(lead)}${others.length ? `; the same in ${others.join(", ")}` : ""}${css !== lead.written ? `; written ${lead.written}` : ""}`,
    });
  }
  return { properties, declared, agrees, note: notes.length ? notes.join("; ") : null };
}

/* ------------------------------------------------------------------ */
/* Writing it                                                          */
/* ------------------------------------------------------------------ */

const comment = (text: string) => text.replace(/\*\//g, "* /");

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const specs = args.filter((arg) => !arg.startsWith("--"));
  const { refs, checkouts } = reposFrom(
    specs.length ? specs : REPOS.map((repo) => `${OWNER}/${repo}`),
  );
  const source = checkoutSource(checkouts);
  const { scans, failed } = await scanRepos(refs, source);
  if (failed.length)
    throw new Error(failed.map((entry) => `${entry.repo}: ${entry.why}`).join("; "));
  const texts = async (repo: string, path: string) => {
    const scan = scanOf(scans, repo);
    return scan ? source.text(scan.ref, scan.sha, path, 5_000_000) : null;
  };

  const brief = JSON.parse(readFileSync(join(DIR, "brief.json"), "utf8")) as {
    design: { roles: Record<string, Role> };
  };
  const results: [string, Role, Resolved][] = [];
  for (const [role, entry] of Object.entries(brief.design.roles))
    results.push([role, entry, await resolveRole(role, entry, scans, texts)]);

  const read = scans.map((scan) => ({ repo: repoLabel(scan.ref), sha: scan.sha }));
  const agree = results.filter(([, , result]) => result.agrees === true).length;
  const disagree = results.filter(([, , result]) => result.agrees === false);
  const lines = [
    "/*",
    " * Aurixa Reel 1 · system edition · the graphics kit's tokens",
    " *",
    " * Written by scripts/aurixa-reel-1/reel_css.ts with Xeno Studio's code scanner",
    " * (src/lib/brand/scan-code.ts) from the code of:",
    ...read.map((entry) => ` *   ${entry.repo} @ ${entry.sha?.slice(0, 12) ?? "?"}`),
    " * Each value is the code's own, with the repository, file and line it is declared on.",
    ` * ${agree} of ${results.length} roles hold the brief's value${disagree.length ? `; ${disagree.length} differ (aurixa-reel.json says how)` : ""}; ${results.length - agree - disagree.length} name no code.`,
    " * Never edited by hand: scan again when the brand's code changes.",
    " */",
    "",
    ":root {",
  ];
  for (const [role, , result] of results) {
    lines.push(`  /* ${role} */`);
    for (const property of result.properties)
      lines.push(`  ${property.name}: ${property.value}; /* ${comment(property.from)} */`);
  }
  lines.push("}", "");
  const css = lines.join("\n");
  const json = `${JSON.stringify(
    {
      read,
      roles: Object.fromEntries(
        results.map(([role, [token, value, from], result]) => [
          role,
          {
            brief: { token, value, from },
            css: result.properties.map(({ name, value: written }) => ({ name, value: written })),
            declared: result.declared,
            agrees: result.agrees,
            note: result.note,
          },
        ]),
      ),
    },
    null,
    2,
  )}\n`;

  for (const [role, , result] of results)
    console.log(
      `${result.agrees === true ? "agrees " : result.agrees === false ? "DIFFERS" : "plain  "} ${role}: ${result.properties.map((property) => `${property.name}: ${property.value}`).join("; ") || "-"}${result.note && result.agrees === false ? `  (${result.note})` : ""}`,
    );
  console.log(`\n${agree} of ${results.length} agree with the brief; ${disagree.length} differ.`);

  const cssPath = join(DIR, "aurixa-reel.css");
  const jsonPath = join(DIR, "aurixa-reel.json");
  if (check) {
    const stale = [
      [cssPath, css],
      [jsonPath, json],
    ].filter(([path, text]) => {
      try {
        return readFileSync(path!, "utf8") !== text;
      } catch {
        return true;
      }
    });
    for (const [path] of stale) console.error(`stale: ${path}`);
    process.exit(stale.length || disagree.length ? 1 : 0);
  }
  writeFileSync(cssPath, css);
  writeFileSync(jsonPath, json);
  console.log(`Wrote ${cssPath} and ${jsonPath}`);
}

await main();
