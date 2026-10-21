/**
 * What a Tailwind config says about a brand: the colours, typefaces, radii,
 * shadows, gradients and animations its theme names, and which CSS custom
 * properties they read.
 *
 * The config is code from somebody else's repository, so it is never run.
 * This reads its object literals instead (tailwind.config.js, .cjs, .mjs or
 * .ts, `module.exports =`, `export default` or a `const config =` that is
 * exported later): strings, numbers, nested objects and arrays are read as
 * values, and anything else (a function call, a spread, an imported name
 * such as defaultTheme.fontFamily.sans) is kept as its source text, so a
 * value is never invented. Comments and strings are respected; anything
 * malformed is skipped, never thrown on. Pure, for the server and tests.
 */

/** A value as it is written: a literal, an object, a list, or the source text of anything else. */
export type ConfigValue =
  | { kind: "string"; value: string; at?: number }
  | { kind: "number"; value: number; at?: number }
  | { kind: "object"; entries: [string, ConfigValue][] }
  | { kind: "array"; items: ConfigValue[] }
  | { kind: "raw"; text: string };

export interface TailwindTheme {
  /** Flattened colour names (`primary`, `primary-foreground`, `gold-500`) and what they are set to. */
  colors: Record<string, string>;
  /** Each family list as written (`display`: ["Playfair Display", "serif"]). */
  fontFamily: Record<string, string[]>;
  borderRadius: Record<string, string>;
  boxShadow: Record<string, string>;
  backgroundImage: Record<string, string>;
  /** Animation names to their shorthand, and the keyframe names defined. */
  animation: Record<string, string>;
  keyframes: string[];
  /** Custom properties the theme reads (`--primary` from `hsl(var(--primary))`). */
  variables: string[];
  /** The line each entry is written on, as `colors.primary`, `fontFamily.display`… */
  lines: Record<string, number>;
}

export interface TailwindSignals {
  /** The theme: the config's theme with its extend merged over it (extend wins, as in Tailwind). */
  theme: TailwindTheme;
  /** `darkMode`, as written ("class", ["class"], "media", "selector"). */
  darkMode: string | null;
  /** Plugins by the name they're required or imported by, when it can be read. */
  plugins: string[];
  /** Whether a theme object was found at all. */
  found: boolean;
}

const MAX_INPUT = 400_000;
const MAX_DEPTH = 24;

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

type Token =
  | { t: "punct"; v: string; at: number }
  | { t: "string"; v: string; at: number; end: number }
  | { t: "number"; v: number; at: number; end: number }
  | { t: "word"; v: string; at: number; end: number };

function tokenize(source: string): Token[] {
  const text = source.slice(0, MAX_INPUT);
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const code = text.charCodeAt(i);
    if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end + 1;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let value = "";
      while (j < text.length && text[j] !== c) {
        if (text[j] === "\\" && j + 1 < text.length) {
          const next = text[j + 1]!;
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          j += 2;
        } else {
          value += text[j];
          j += 1;
        }
      }
      out.push({ t: "string", v: value, at: i, end: Math.min(j + 1, text.length) });
      i = j + 1;
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      let j = i;
      while (j < text.length && /[0-9._eExXa-fA-F]/.test(text[j]!)) j += 1;
      out.push({ t: "number", v: Number(text.slice(i, j).replace(/_/g, "")), at: i, end: j });
      i = j;
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < text.length && /[\w$]/.test(text[j]!)) j += 1;
      out.push({ t: "word", v: text.slice(i, j), at: i, end: j });
      i = j;
    } else if (code <= 32) {
      i += 1;
    } else {
      if (c === "." && text.slice(i, i + 3) === "...") {
        out.push({ t: "punct", v: "...", at: i });
        i += 3;
      } else {
        out.push({ t: "punct", v: c, at: i });
        i += 1;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

class Reader {
  at = 0;
  constructor(
    readonly tokens: Token[],
    readonly source: string,
  ) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.at + offset];
  }

  isPunct(v: string, offset = 0): boolean {
    const token = this.peek(offset);
    return !!token && token.t === "punct" && token.v === v;
  }

  /** The value starting here; on anything unexpected, the source text up to the next `,` `}` or `]` at this depth. */
  value(depth = 0): ConfigValue {
    const token = this.peek();
    if (!token) return { kind: "raw", text: "" };
    if (depth > MAX_DEPTH) return this.raw();
    if (token.t === "punct" && token.v === "{") return this.object(depth);
    if (token.t === "punct" && token.v === "[") return this.array(depth);
    const next = this.peek(1);
    const ends = !next || (next.t === "punct" && [",", "}", "]", ")", ";"].includes(next.v));
    if (token.t === "string" && ends) {
      this.at += 1;
      return { kind: "string", value: token.v, at: token.at };
    }
    if (token.t === "number" && ends) {
      this.at += 1;
      return { kind: "number", value: token.v, at: token.at };
    }
    if (token.t === "punct" && token.v === "-" && next?.t === "number") {
      const after = this.peek(2);
      if (!after || (after.t === "punct" && [",", "}", "]", ")", ";"].includes(after.v))) {
        this.at += 2;
        return { kind: "number", value: -next.v };
      }
    }
    return this.raw();
  }

  /** Source text to the end of this value, keeping brackets balanced. */
  raw(): ConfigValue {
    const start = this.peek();
    let depth = 0;
    let last: Token | undefined;
    while (this.at < this.tokens.length) {
      const token = this.peek()!;
      if (token.t === "punct") {
        if (["{", "[", "("].includes(token.v)) depth += 1;
        else if (["}", "]", ")"].includes(token.v)) {
          if (depth === 0) break;
          depth -= 1;
        } else if ((token.v === "," || token.v === ";") && depth === 0) break;
      }
      last = token;
      this.at += 1;
    }
    if (!start || !last) return { kind: "raw", text: "" };
    const end = "end" in last ? last.end : last.at + last.v.length;
    return { kind: "raw", text: this.source.slice(start.at, end).trim() };
  }

  object(depth: number): ConfigValue {
    this.at += 1; // {
    const entries: [string, ConfigValue][] = [];
    while (this.at < this.tokens.length && !this.isPunct("}")) {
      const token = this.peek()!;
      if (token.t === "punct" && token.v === "...") {
        this.at += 1;
        entries.push(["...", this.value(depth + 1)]);
      } else if (token.t === "punct" && token.v === "[") {
        // A computed key: skip it and its value.
        this.raw();
      } else if (token.t === "string" || token.t === "word" || token.t === "number") {
        const key = String(token.v);
        this.at += 1;
        if (this.isPunct(":")) {
          this.at += 1;
          entries.push([key, this.value(depth + 1)]);
        } else if (this.isPunct("(")) {
          // A method (`extend(theme) { ... }`): kept as raw.
          entries.push([key, this.raw()]);
        } else {
          // Shorthand ({ colors }): the name of something defined elsewhere.
          entries.push([key, { kind: "raw", text: key }]);
        }
      } else {
        this.raw();
      }
      if (this.isPunct(",")) this.at += 1;
      else if (!this.isPunct("}")) this.at += 1;
    }
    if (this.isPunct("}")) this.at += 1;
    return { kind: "object", entries };
  }

  array(depth: number): ConfigValue {
    this.at += 1; // [
    const items: ConfigValue[] = [];
    while (this.at < this.tokens.length && !this.isPunct("]")) {
      if (this.isPunct("...")) this.at += 1;
      items.push(this.value(depth + 1));
      if (this.isPunct(",")) this.at += 1;
      else if (!this.isPunct("]")) this.at += 1;
    }
    if (this.isPunct("]")) this.at += 1;
    return { kind: "array", items };
  }
}

function entry(value: ConfigValue | undefined, key: string): ConfigValue | undefined {
  if (!value || value.kind !== "object") return undefined;
  for (let i = value.entries.length - 1; i >= 0; i -= 1) {
    if (value.entries[i]![0] === key) return value.entries[i]![1];
  }
  return undefined;
}

/** The object that becomes the config: `module.exports =`, `export default`, or a named const exported by name. */
function configObject(reader: Reader): ConfigValue | undefined {
  const tokens = reader.tokens;
  const consts = new Map<string, number>();
  let exported: number | null = null;
  let exportedName: string | null = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.t !== "word") continue;
    if (
      token.v === "module" &&
      tokens[i + 1]?.v === "." &&
      tokens[i + 2]?.v === "exports" &&
      tokens[i + 3]?.v === "="
    ) {
      if (tokens[i + 4]?.t === "punct" && tokens[i + 4]?.v === "{") exported = i + 4;
      else if (tokens[i + 4]?.t === "word") exportedName = String(tokens[i + 4]!.v);
    } else if (token.v === "export" && tokens[i + 1]?.v === "default") {
      let j = i + 2;
      // export default defineConfig({ ... }) / satisfies / as: take the first object after it.
      while (
        j < tokens.length &&
        j < i + 8 &&
        !(tokens[j]!.t === "punct" && tokens[j]!.v === "{")
      ) {
        if (tokens[j]!.t === "word" && j === i + 2 && tokens[j + 1]?.v !== "(") {
          exportedName = String(tokens[j]!.v);
          break;
        }
        j += 1;
      }
      if (tokens[j]?.t === "punct" && tokens[j]?.v === "{") exported = j;
    } else if (
      (token.v === "const" || token.v === "let" || token.v === "var") &&
      tokens[i + 1]?.t === "word"
    ) {
      // const config = { ... }, or const config: Config = { ... }
      let j = i + 2;
      while (j < tokens.length && j < i + 10 && !(tokens[j]!.t === "punct" && tokens[j]!.v === "="))
        j += 1;
      if (tokens[j]?.v === "=") {
        let k = j + 1;
        while (
          k < tokens.length &&
          k < j + 4 &&
          !(tokens[k]!.t === "punct" && tokens[k]!.v === "{")
        )
          k += 1;
        if (tokens[k]?.t === "punct" && tokens[k]?.v === "{")
          consts.set(String(tokens[i + 1]!.v), k);
      }
    }
  }
  const start =
    exported ?? (exportedName ? consts.get(exportedName) : undefined) ?? [...consts.values()][0];
  if (start === undefined) return undefined;
  reader.at = start;
  return reader.object(0);
}

/* ------------------------------------------------------------------ */
/* The theme                                                           */
/* ------------------------------------------------------------------ */

function text(value: ConfigValue | undefined): string | null {
  if (!value) return null;
  if (value.kind === "string") return value.value;
  if (value.kind === "number") return String(value.value);
  if (value.kind === "raw") return value.text || null;
  return null;
}

/** Where a value starts in the source, when it is a literal. */
const offsetOf = (value: ConfigValue | undefined): number | undefined =>
  value && (value.kind === "string" || value.kind === "number")
    ? value.at
    : value?.kind === "array"
      ? offsetOf(value.items[0]?.kind === "array" ? value.items[0].items[0] : value.items[0])
      : undefined;

type Where = Map<string, number>;

/** A nested colour object flattened the way Tailwind names its classes (DEFAULT drops out). */
function flattenColours(
  value: ConfigValue | undefined,
  prefix: string,
  out: Record<string, string>,
  where: Where,
): void {
  if (!value || value.kind !== "object") return;
  for (const [key, child] of value.entries) {
    if (key === "...") continue;
    const name = key === "DEFAULT" ? prefix : prefix ? `${prefix}-${key}` : key;
    if (child.kind === "object") flattenColours(child, name, out, where);
    else {
      const written = text(child);
      if (written && name) {
        out[name] = written;
        const at = offsetOf(child);
        if (at !== undefined) where.set(`colors.${name}`, at);
      }
    }
  }
}

function flatStrings(
  value: ConfigValue | undefined,
  group: string,
  out: Record<string, string>,
  where: Where,
): void {
  if (!value || value.kind !== "object") return;
  for (const [key, child] of value.entries) {
    if (key === "...") continue;
    const written =
      child.kind === "array" ? child.items.map(text).filter(Boolean).join(", ") : text(child);
    if (!written) continue;
    out[key] = written;
    const at = offsetOf(child);
    if (at !== undefined) where.set(`${group}.${key}`, at);
  }
}

function families(
  value: ConfigValue | undefined,
  out: Record<string, string[]>,
  where: Where,
): void {
  if (!value || value.kind !== "object") return;
  for (const [key, child] of value.entries) {
    if (key === "...") continue;
    let list: string[] = [];
    if (child.kind === "array") {
      // [["Inter", ...], { fontFeatureSettings }] is Tailwind's family-with-settings form.
      const first = child.items[0];
      const items = first?.kind === "array" ? first.items : child.items;
      list = items.map((item) => text(item)).filter((item): item is string => !!item);
    } else {
      const written = text(child);
      if (written) list = written.split(",").map((part) => part.trim());
    }
    if (!list.length) continue;
    out[key] = list.map((item) =>
      item.startsWith("...") ? item : item.replace(/^["']|["']$/g, ""),
    );
    const at = offsetOf(child);
    if (at !== undefined) where.set(`fontFamily.${key}`, at);
  }
}

const VAR_NAME = /var\(\s*(--[\w-]+)/g;

function emptyTheme(): TailwindTheme {
  return {
    colors: {},
    fontFamily: {},
    borderRadius: {},
    boxShadow: {},
    backgroundImage: {},
    animation: {},
    keyframes: [],
    variables: [],
    lines: {},
  };
}

function readTheme(value: ConfigValue | undefined, into: TailwindTheme, where: Where): void {
  if (!value || value.kind !== "object") return;
  flattenColours(entry(value, "colors"), "", into.colors, where);
  families(entry(value, "fontFamily"), into.fontFamily, where);
  flatStrings(entry(value, "borderRadius"), "borderRadius", into.borderRadius, where);
  flatStrings(entry(value, "boxShadow"), "boxShadow", into.boxShadow, where);
  flatStrings(entry(value, "backgroundImage"), "backgroundImage", into.backgroundImage, where);
  flatStrings(entry(value, "animation"), "animation", into.animation, where);
  const keyframes = entry(value, "keyframes");
  if (keyframes?.kind === "object")
    for (const [key] of keyframes.entries)
      if (key !== "..." && !into.keyframes.includes(key)) into.keyframes.push(key);
}

/** The 1-based line an offset falls on. */
function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let at = source.indexOf("\n"); at >= 0 && at < offset; at = source.indexOf("\n", at + 1))
    line += 1;
  return line;
}

/** What a Tailwind config's theme names, read as literals (never run). Never throws. */
export function scanTailwindConfig(source: string): TailwindSignals {
  const empty = { theme: emptyTheme(), darkMode: null, plugins: [], found: false };
  if (typeof source !== "string" || !source) return empty;
  try {
    const code = source.slice(0, MAX_INPUT);
    const reader = new Reader(tokenize(code), code);
    const config = configObject(reader);
    const theme = emptyTheme();
    const where: Where = new Map();
    const themeValue = entry(config, "theme");
    readTheme(themeValue, theme, where);
    readTheme(entry(themeValue, "extend"), theme, where);
    for (const [key, offset] of where) theme.lines[key] = lineAt(code, offset);
    const all = [
      ...Object.values(theme.colors),
      ...Object.values(theme.borderRadius),
      ...Object.values(theme.boxShadow),
      ...Object.values(theme.backgroundImage),
      ...Object.values(theme.fontFamily).flat(),
    ].join(" ");
    theme.variables = [...new Set([...all.matchAll(VAR_NAME)].map((m) => m[1]!))];

    const darkMode = entry(config, "darkMode");
    const darkText =
      darkMode?.kind === "array"
        ? darkMode.items.map(text).filter(Boolean).join(", ")
        : text(darkMode);
    const pluginsValue = entry(config, "plugins");
    const plugins: string[] = [];
    if (pluginsValue?.kind === "array")
      for (const item of pluginsValue.items) {
        const raw = text(item) ?? "";
        const required = /require\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(raw)?.[1];
        plugins.push(required ?? raw.replace(/\(.*$/s, "").trim());
      }
    // Imported plugins: import animate from "tailwindcss-animate", used as `plugins: [animate]`.
    const imports = new Map<string, string>();
    for (const m of code.matchAll(/import\s+([\w$]+)\s+from\s+["'`]([^"'`]+)["'`]/g))
      imports.set(m[1]!, m[2]!);
    const named = plugins.map((name) => imports.get(name) ?? name).filter(Boolean);
    return { theme, darkMode: darkText, plugins: [...new Set(named)], found: !!themeValue };
  } catch {
    return empty;
  }
}

/* ------------------------------------------------------------------ */
/* Theme objects in modules                                            */
/* ------------------------------------------------------------------ */

export interface ModuleValue {
  /** Its path in the module: the object's name, then its keys (`AURIXA_PALETTE.gold`). */
  name: string;
  value: string;
  line: number;
}

const MAX_OBJECTS = 40;
const MAX_VALUES = 2000;

/**
 * The literal values of the objects a module names at its top level
 * (`export const AURIXA_PALETTE = { gold: "#C89B3C" }`, `as const` or not),
 * flattened to their paths: where a codebase keeps its theme in TypeScript
 * rather than CSS. Read, never run; anything that isn't a literal is left
 * out. Never throws.
 */
export function namedObjects(source: string): ModuleValue[] {
  if (typeof source !== "string" || !source) return [];
  try {
    const code = source.slice(0, MAX_INPUT);
    const tokens = tokenize(code);
    const reader = new Reader(tokens, code);
    const out: ModuleValue[] = [];
    const seen = new Set<string>();
    let objects = 0;
    let depth = 0;
    const walk = (prefix: string, value: ConfigValue) => {
      if (out.length >= MAX_VALUES) return;
      if (value.kind === "object")
        for (const [key, child] of value.entries) {
          if (key !== "...") walk(`${prefix}.${key}`, child);
        }
      else if (value.kind === "array")
        value.items.forEach((item, index) => walk(`${prefix}.${index}`, item));
      else if ((value.kind === "string" || value.kind === "number") && value.at !== undefined)
        out.push({ name: prefix, value: String(value.value), line: lineAt(code, value.at) });
    };
    for (let i = 0; i < tokens.length && objects < MAX_OBJECTS; i += 1) {
      const token = tokens[i]!;
      if (token.t === "punct" && (token.v === "{" || token.v === "(")) depth += 1;
      else if (token.t === "punct" && (token.v === "}" || token.v === ")"))
        depth = Math.max(0, depth - 1);
      // Only declarations at the module's top level: a const inside a function is not its theme.
      if (depth !== 0 || token.t !== "word" || !["const", "let", "var"].includes(token.v)) continue;
      const nameToken = tokens[i + 1];
      if (nameToken?.t !== "word") continue;
      let j = i + 2;
      while (j < tokens.length && j < i + 12 && !(tokens[j]!.t === "punct" && tokens[j]!.v === "="))
        j += 1;
      if (tokens[j]?.v !== "=") continue;
      // `= {`, `= Object.freeze({`, `= <const>{`.
      let k = j + 1;
      while (k < tokens.length && k < j + 6 && !(tokens[k]!.t === "punct" && tokens[k]!.v === "{"))
        k += 1;
      if (!(tokens[k]?.t === "punct" && tokens[k]?.v === "{")) continue;
      // An arrow function's body (`= () => {`) is not an object, and the first object in an
      // array (`= [{ key: "compact" }]`, a list of options) is not one named by the declaration.
      if (
        tokens
          .slice(j + 1, k)
          .some((part) => part.t === "punct" && (part.v === "=" || part.v === "["))
      )
        continue;
      const name = String(nameToken.v);
      if (seen.has(name)) continue;
      seen.add(name);
      reader.at = k;
      const value = reader.object(0);
      objects += 1;
      walk(name, value);
      // The declaration's own braces were read by the reader; carry on after them.
      i = Math.max(i, reader.at - 1);
    }
    return out;
  } catch {
    return [];
  }
}
