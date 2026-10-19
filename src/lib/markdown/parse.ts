/**
 * Markdown for AI replies, parsed into a typed tree. The renderer turns the tree into React
 * elements, so model output never reaches the page as HTML: tags stay literal text, and links
 * keep only http, https, mailto and same-site paths. It covers the CommonMark + GFM subset models
 * write, is forgiving where they are sloppy (two-space list nesting, half-streamed replies), and
 * stays linear on hostile input so a runaway reply can't freeze the tab. Pure: no React, no DOM.
 */

export type MdHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Column alignment from a table's delimiter row (`:---`, `:---:`, `---:`); null when unset. */
export type MdAlign = "left" | "center" | "right" | null;

export type MdInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: MdInline[] }
  | { type: "em"; children: MdInline[] }
  | { type: "del"; children: MdInline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; title: string | null; external: boolean; children: MdInline[] }
  // Shown as a link to the image: the page never loads remote images.
  | { type: "image"; href: string; alt: string; title: string | null; external: boolean }
  // A hard break: two trailing spaces or a backslash at the end of a line.
  | { type: "break" }
  // A plain newline inside a paragraph. Replies are written line by line, so it shows as one.
  | { type: "softbreak" };

export interface MdListItem {
  /** null for a plain item; true or false for a task item (`- [x]` / `- [ ]`). */
  checked: boolean | null;
  children: MdBlock[];
}

export type MdBlock =
  | { type: "heading"; level: MdHeadingLevel; children: MdInline[] }
  | { type: "paragraph"; children: MdInline[] }
  // `start` is an ordered list's first number (null for bullets); a tight list has no blank
  // lines between its items, so they sit closer together.
  | { type: "list"; ordered: boolean; start: number | null; tight: boolean; items: MdListItem[] }
  | { type: "code"; lang: string | null; text: string }
  | { type: "blockquote"; children: MdBlock[] }
  // Every row, the head included, has exactly `align.length` cells.
  | { type: "table"; align: MdAlign[]; head: MdInline[][]; rows: MdInline[][][] }
  | { type: "hr" };

// Character codes the scanners compare against.
const TAB = 9;
const NEWLINE = 10;
const SPACE = 32;
const BANG = 33;
const QUOTE = 34;
const HASH = 35;
const APOS = 39;
const LPAREN = 40;
const RPAREN = 41;
const STAR = 42;
const PLUS = 43;
const COMMA = 44;
const DASH = 45;
const DOT = 46;
const SLASH = 47;
const COLON = 58;
const SEMICOLON = 59;
const LT = 60;
const GT = 62;
const QUESTION = 63;
const UPPER_H = 72;
const UPPER_W = 87;
const LBRACKET = 91;
const BACKSLASH = 92;
const RBRACKET = 93;
const UNDERSCORE = 95;
const BACKTICK = 96;
const LOWER_H = 104;
const LOWER_W = 119;
const PIPE = 124;
const TILDE = 126;
const DEL = 127;

/**
 * Parses a reply into blocks. With `streaming`, the text is a prefix of a reply still arriving:
 * a half-written closing fence is hidden, and emphasis, inline code or a link left open in the
 * last paragraph render as if closed, so the reply doesn't flash raw `**` and `](https://…`.
 * Unclosed fences are code and header rows without a delimiter row are paragraphs either way.
 * Never throws: on an internal error the text comes back as one plain paragraph.
 */
export function parseMarkdown(text: string, options: { streaming?: boolean } = {}): MdBlock[] {
  const source = typeof text === "string" ? text : "";
  const streaming = options.streaming === true;
  try {
    const lines = source.replace(/\r\n?/g, "\n").replaceAll("\u0000", "\uFFFD").split("\n");
    // While streaming, a lone trailing newline doesn't end the paragraph above it yet.
    const last = lines.length - 1;
    if (streaming && last > 0 && isBlank(lines[last]!) && !isBlank(lines[last - 1]!)) lines.pop();
    return parseBlocks(lines, { depth: 0, inList: false, streaming, atEnd: true }).blocks;
  } catch {
    return source.trim() ? [{ type: "paragraph", children: [{ type: "text", text: source }] }] : [];
  }
}

/** Inline Markdown only (no blocks), for one-line strings such as a title or a table cell. */
export function parseInline(text: string): MdInline[] {
  const source = typeof text === "string" ? text : "";
  return inlines(source.replace(/\r\n?/g, "\n").replaceAll("\u0000", "\uFFFD"), false);
}

const SAFE_SCHEMES = new Set(["http", "https", "mailto"]);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * The href a link may use, or null when it must stay plain text. Only http, https, mailto and
 * same-site paths (`/`, `#`, `?`) pass; javascript:, data:, file: and protocol-relative `//`
 * never do. Control characters go first because browsers ignore them inside URLs, so
 * "java\tscript:" would otherwise slip past the scheme check.
 */
export function safeHref(url: string): { href: string; external: boolean } | null {
  let clean = "";
  let from = 0;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c < SPACE || c === DEL) {
      clean += url.slice(from, i);
      from = i + 1;
    }
  }
  const href = (clean + url.slice(from)).trim();
  if (!href) return null;
  const first = href.charCodeAt(0);
  if (first === HASH || first === QUESTION) return { href, external: false };
  if (first === SLASH) {
    // "//evil.com" and "/\evil.com" both leave the site.
    const second = href.charCodeAt(1);
    return second === SLASH || second === BACKSLASH ? null : { href, external: false };
  }
  const scheme = SCHEME.exec(href)?.[1]?.toLowerCase();
  return scheme && SAFE_SCHEMES.has(scheme) ? { href, external: true } : null;
}

// ---------------------------------------------------------------------------------------------
// Blocks

/** Containers nest at most this deep; deeper markers read as text, so recursion stays bounded. */
const MAX_BLOCK_DEPTH = 12;
/** Inline wrappers nest at most this deep (deeper ones flatten), for the same reason. */
const MAX_INLINE_DEPTH = 32;
/** Parentheses nest at most this deep in a link destination, which keeps link scans short. */
const MAX_PAREN_DEPTH = 32;

interface Ctx {
  depth: number;
  /** Inside a list item: indented code is off, so a sloppy indent never turns prose into code. */
  inList: boolean;
  streaming: boolean;
  /** These lines run to the end of the text, so the last one may still be arriving. */
  atEnd: boolean;
}

interface Parsed {
  blocks: MdBlock[];
  /** A blank line separated two of the blocks, which is what makes a list item loose. */
  gap: boolean;
}

function parseBlocks(lines: string[], ctx: Ctx): Parsed {
  const blocks: MdBlock[] = [];
  let gap = false;
  let blank = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      blank = true;
      i++;
      continue;
    }
    if (blank && blocks.length > 0) gap = true;
    blank = false;
    const indent = indentWidth(line);
    if (indent >= 4 && !ctx.inList) {
      i = indentedCode(lines, i, blocks);
      continue;
    }
    const rest = line.slice(leadingSpace(line));
    const fence = openFence(rest, indent);
    if (fence) {
      i = fencedCode(lines, i, fence, ctx, blocks);
      continue;
    }
    const heading = atxHeading(rest);
    if (heading) {
      const children = inlines(heading.text, isTail(ctx, lines, i));
      blocks.push({ type: "heading", level: heading.level, children });
      i++;
      continue;
    }
    if (isThematicBreak(rest)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    if (ctx.depth < MAX_BLOCK_DEPTH) {
      if (rest.charCodeAt(0) === GT) {
        i = blockquote(lines, i, ctx, blocks);
        continue;
      }
      const marker = listMarker(line);
      if (marker) {
        i = list(lines, i, marker, ctx, blocks);
        continue;
      }
    }
    const align = tableStart(lines, i);
    if (align) {
      i = table(lines, i, align, blocks);
      continue;
    }
    i = paragraph(lines, i, ctx, blocks);
  }
  return { blocks, gap };
}

/** Whether `last` is the final line of the text while it is still streaming in. */
function isTail(ctx: Ctx, lines: string[], last: number): boolean {
  return ctx.streaming && ctx.atEnd && last === lines.length - 1;
}

function paragraph(lines: string[], start: number, ctx: Ctx, blocks: MdBlock[]): number {
  const parts = [lines[start]!.trimStart()];
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i]!;
    // A table may start on the paragraph's next line: "Intro\n| a | b |\n|---|---|".
    if (isBlank(line) || interrupts(line, ctx) || tableStart(lines, i)) break;
    parts.push(line.trimStart());
    i++;
  }
  blocks.push({
    type: "paragraph",
    children: inlines(parts.join("\n"), isTail(ctx, lines, i - 1)),
  });
  return i;
}

/** Whether a line ends the paragraph above it (CommonMark: only some blocks can interrupt). */
function interrupts(line: string, ctx: Ctx): boolean {
  if (indentWidth(line) >= 4 && !ctx.inList) return false;
  const rest = line.slice(leadingSpace(line));
  if (openFence(rest, 0) || atxHeading(rest) || isThematicBreak(rest)) return true;
  if (ctx.depth >= MAX_BLOCK_DEPTH) return false;
  if (rest.charCodeAt(0) === GT) return true;
  const marker = listMarker(line);
  // "The total is\n14. Fourteen" stays a paragraph: only lists starting at 1 interrupt.
  return marker !== null && !marker.empty && (!marker.ordered || marker.start === 1);
}

/** Whether a line opens a block, so it can't be a lazy continuation of a quote or list item. */
function startsBlock(line: string): boolean {
  if (indentWidth(line) >= 4) return false;
  const rest = line.slice(leadingSpace(line));
  return (
    rest.charCodeAt(0) === GT ||
    openFence(rest, 0) !== null ||
    atxHeading(rest) !== null ||
    isThematicBreak(rest) ||
    listMarker(line) !== null
  );
}

/** Whether a line is paragraph text (lazy continuation lines may follow it). */
function isParagraphLine(line: string): boolean {
  if (isBlank(line)) return false;
  const rest = line.slice(leadingSpace(line));
  return !openFence(rest, 0) && !atxHeading(rest) && !isThematicBreak(rest);
}

function atxHeading(rest: string): { level: MdHeadingLevel; text: string } | null {
  let level = 0;
  while (level < 7 && rest.charCodeAt(level) === HASH) level++;
  if (level === 0 || level > 6) return null;
  const after = rest.charCodeAt(level);
  // "#hashtag" is not a heading: the hashes need a space after them.
  if (level < rest.length && after !== SPACE && after !== TAB) return null;
  let text = rest.slice(level).trim();
  // An optional closing run of hashes, after a space: "## Title ##".
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === HASH) end--;
  if (end === 0) text = "";
  else if (end < text.length && isSpaceOrTab(text.charCodeAt(end - 1))) {
    text = text.slice(0, end).trimEnd();
  }
  return { level: level as MdHeadingLevel, text };
}

function isThematicBreak(rest: string): boolean {
  const ch = rest.charCodeAt(0);
  if (ch !== DASH && ch !== STAR && ch !== UNDERSCORE) return false;
  let count = 0;
  for (let i = 0; i < rest.length; i++) {
    const c = rest.charCodeAt(i);
    if (c === ch) count++;
    else if (!isSpaceOrTab(c)) return false;
  }
  return count >= 3;
}

// Code

interface Fence {
  ch: number;
  len: number;
  indent: number;
  lang: string | null;
}

function openFence(rest: string, indent: number): Fence | null {
  const ch = rest.charCodeAt(0);
  if (ch !== BACKTICK && ch !== TILDE) return null;
  let len = 1;
  while (rest.charCodeAt(len) === ch) len++;
  if (len < 3) return null;
  const info = rest.slice(len).trim();
  // "```js```" on one line is inline code, not a fence.
  if (ch === BACKTICK && info.includes("`")) return null;
  const space = info.search(/\s/);
  const lang = space < 0 ? info : info.slice(0, space);
  return { ch, len, indent, lang: lang || null };
}

function closesFence(line: string, fence: Fence): boolean {
  if (indentWidth(line) > Math.max(3, fence.indent)) return false;
  const at = leadingSpace(line);
  let end = at;
  while (line.charCodeAt(end) === fence.ch) end++;
  return end - at >= fence.len && isBlank(line.slice(end));
}

/** Follows fences across lines, so scanning a container never splits a code block. */
function trackFence(fence: Fence | null, line: string): Fence | null {
  if (fence) return closesFence(line, fence) ? null : fence;
  return openFence(line.slice(leadingSpace(line)), indentWidth(line));
}

function fencedCode(
  lines: string[],
  start: number,
  fence: Fence,
  ctx: Ctx,
  blocks: MdBlock[],
): number {
  const body: string[] = [];
  let i = start + 1;
  let closed = false;
  while (i < lines.length) {
    const line = lines[i]!;
    i++;
    if (closesFence(line, fence)) {
      closed = true;
      break;
    }
    body.push(stripIndent(line, fence.indent));
  }
  if (!closed) {
    // No closing fence: the rest is still code, never swallowed. While streaming, a last line
    // of "``" is the closing fence arriving, so it isn't shown as code.
    const last = body[body.length - 1];
    if (ctx.streaming && ctx.atEnd && last !== undefined && partialFence(last, fence)) body.pop();
    while (body.length > 0 && isBlank(body[body.length - 1]!)) body.pop();
  }
  blocks.push({ type: "code", lang: fence.lang, text: body.join("\n") });
  return i;
}

function partialFence(line: string, fence: Fence): boolean {
  const text = line.trim();
  if (text.length === 0 || text.length >= fence.len) return false;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) !== fence.ch) return false;
  return true;
}

function indentedCode(lines: string[], start: number, blocks: MdBlock[]): number {
  const body: string[] = [];
  let end = start;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    const blank = isBlank(line);
    if (!blank && indentWidth(line) < 4) break;
    body.push(stripIndent(line, 4));
    if (!blank) end = i + 1;
  }
  // Trailing blank lines are left to the caller: they separate this block from the next.
  blocks.push({ type: "code", lang: null, text: body.slice(0, end - start).join("\n") });
  return end;
}

// Quotes and lists

function blockquote(lines: string[], start: number, ctx: Ctx, blocks: MdBlock[]): number {
  const inner: string[] = [];
  let fence: Fence | null = null;
  let lazy = false;
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    const at = leadingSpace(line);
    if (line.charCodeAt(at) === GT && (ctx.inList || indentWidth(line) < 4)) {
      let content = line.slice(at + 1);
      const c = content.charCodeAt(0);
      if (c === SPACE) content = content.slice(1);
      else if (c === TAB) content = stripIndent(content, 1);
      inner.push(content);
      fence = trackFence(fence, content);
      lazy = fence === null && isParagraphLine(content);
      i++;
      continue;
    }
    // A line without ">" right after quoted prose still belongs to it ("lazy" continuation).
    if (!lazy || isBlank(line) || startsBlock(line)) break;
    inner.push(line.trimStart());
    i++;
  }
  const childCtx: Ctx = { ...ctx, depth: ctx.depth + 1, atEnd: ctx.atEnd && i === lines.length };
  blocks.push({ type: "blockquote", children: parseBlocks(inner, childCtx).blocks });
  return i;
}

interface Marker {
  /** Columns before the marker. */
  indent: number;
  ordered: boolean;
  /** The bullet character, or the "." / ")" after an ordered number. */
  delimiter: number;
  start: number;
  /** Column where the item's text starts; continuation lines are stripped up to it. */
  contentIndent: number;
  content: string;
  empty: boolean;
}

function listMarker(line: string): Marker | null {
  let i = 0;
  let col = 0;
  for (; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === SPACE) col++;
    else if (c === TAB) col += 4 - (col % 4);
    else break;
  }
  const first = line.charCodeAt(i);
  let end = i;
  let ordered = false;
  let start = 1;
  if (first === DASH || first === STAR || first === PLUS) {
    end = i + 1;
  } else {
    while (end - i < 9 && isDigit(line.charCodeAt(end))) end++;
    const after = line.charCodeAt(end);
    if (end === i || (after !== DOT && after !== RPAREN)) return null;
    ordered = true;
    start = Number(line.slice(i, end));
    end++;
  }
  if (end < line.length && !isSpaceOrTab(line.charCodeAt(end))) return null;
  const markerEnd = col + (end - i);
  let textCol = markerEnd;
  let k = end;
  for (; k < line.length; k++) {
    const c = line.charCodeAt(k);
    if (c === SPACE) textCol++;
    else if (c === TAB) textCol += 4 - (textCol % 4);
    else break;
  }
  const empty = k >= line.length;
  return {
    indent: col,
    ordered,
    delimiter: line.charCodeAt(end - 1),
    start,
    contentIndent: empty || textCol - markerEnd > 4 ? markerEnd + 1 : textCol,
    content: line.slice(k),
    empty,
  };
}

const TASK = /^\[([ xX])\](?:[ \t]+|$)/;

function list(lines: string[], start: number, first: Marker, ctx: Ctx, blocks: MdBlock[]): number {
  const items: MdListItem[] = [];
  const inner: Ctx = { ...ctx, depth: ctx.depth + 1, inList: true };
  let loose = false;
  let marker: Marker | null = first;
  let i = start;
  while (marker) {
    const { indent, contentIndent } = marker;
    let content = marker.content;
    let checked: boolean | null = null;
    const task = TASK.exec(content);
    if (task) {
      checked = task[1] !== " ";
      content = content.slice(task[0].length);
    }
    const body = [content];
    let fence = trackFence(null, content);
    let lazy = fence === null && isParagraphLine(content);
    i++;
    while (i < lines.length) {
      const line = lines[i]!;
      if (isBlank(line)) {
        body.push("");
        lazy = false;
        i++;
        continue;
      }
      const width = indentWidth(line);
      // Two or more columns past the marker nest under it (two to four spaces or a tab, however
      // wide the marker), and an open fence keeps its lines even when a model forgot to indent.
      if (fence !== null || width >= indent + 2) {
        const stripped = stripIndent(line, Math.min(width, contentIndent));
        body.push(stripped);
        fence = trackFence(fence, stripped);
        lazy = fence === null && isParagraphLine(stripped);
        i++;
        continue;
      }
      if (!lazy || startsBlock(line)) break;
      body.push(line.trimStart());
      i++;
    }
    // Trailing blank lines go back to the list: they separate items or end it.
    while (body.length > 1 && isBlank(body[body.length - 1]!)) {
      body.pop();
      i--;
    }
    const parsed = parseBlocks(body, { ...inner, atEnd: ctx.atEnd && i === lines.length });
    if (parsed.gap) loose = true;
    items.push({ checked, children: parsed.blocks });

    let next = i;
    while (next < lines.length && isBlank(lines[next]!)) next++;
    const following = lines[next];
    const sibling = following === undefined ? null : listMarker(following);
    marker = null;
    if (
      following !== undefined &&
      sibling !== null &&
      sibling.ordered === first.ordered &&
      sibling.delimiter === first.delimiter &&
      !isThematicBreak(following.slice(leadingSpace(following)))
    ) {
      if (next > i) loose = true;
      i = next;
      marker = sibling;
    }
  }
  const { ordered } = first;
  blocks.push({ type: "list", ordered, start: ordered ? first.start : null, tight: !loose, items });
  return i;
}

// Tables

/** The column alignments when a table starts at `start` (header row + delimiter row), or null. */
function tableStart(lines: string[], start: number): MdAlign[] | null {
  const header = lines[start];
  const delimiter = lines[start + 1];
  // Both rows need a pipe, so "Some text\n---" stays a paragraph and a break.
  if (header === undefined || delimiter === undefined) return null;
  if (!header.includes("|") || !delimiter.includes("|")) return null;
  const align = delimiterRow(delimiter);
  return align && splitRow(header).length === align.length ? align : null;
}

function delimiterRow(line: string): MdAlign[] | null {
  const align: MdAlign[] = [];
  for (const cell of splitRow(line)) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    align.push(left && right ? "center" : left ? "left" : right ? "right" : null);
  }
  return align.length > 0 ? align : null;
}

/** Splits a row on unescaped pipes; `\|` stays in its cell as a literal pipe. */
function splitRow(line: string): string[] {
  const row = line.trim();
  const cells: string[] = [];
  let from = row.charCodeAt(0) === PIPE ? 1 : 0;
  let trailingPipe = false;
  for (let i = from; i < row.length; i++) {
    const c = row.charCodeAt(i);
    if (c === BACKSLASH) {
      i++;
    } else if (c === PIPE) {
      cells.push(cellText(row, from, i));
      from = i + 1;
      trailingPipe = from >= row.length;
    }
  }
  if (!trailingPipe) cells.push(cellText(row, from, row.length));
  return cells;
}

function cellText(row: string, from: number, to: number): string {
  return row.slice(from, to).trim().replace(/\\\|/g, "|");
}

function table(lines: string[], start: number, align: MdAlign[], blocks: MdBlock[]): number {
  const row = (line: string): MdInline[][] => {
    const cells = splitRow(line);
    // Ragged rows: missing cells are empty, extra cells are dropped (as GitHub does).
    return align.map((_, column) => inlines(cells[column] ?? "", false));
  };
  const head = row(lines[start]!);
  const rows: MdInline[][][] = [];
  let i = start + 2;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line) || !line.includes("|") || startsBlock(line)) break;
    rows.push(row(line));
    i++;
  }
  blocks.push({ type: "table", align, head, rows });
  return i;
}

// ---------------------------------------------------------------------------------------------
// Inlines

function inlines(source: string, tail: boolean): MdInline[] {
  const src = source.trim();
  if (!src) return [];
  try {
    return new InlineParser(src, tail).parse();
  } catch {
    return [{ type: "text", text: src }];
  }
}

type TagKind = "em" | "strong" | "del" | "link" | "image" | "unwrap" | "alt";

/** A wrapper around a run of tokens; "unwrap" keeps just the content, "alt" just its words. */
interface Tag {
  kind: TagKind;
  href: string;
  title: string | null;
  external: boolean;
}

/** A run of `*`, `_` or `~~` that may open or close emphasis (CommonMark's delimiter stack). */
interface Delim {
  tok: number;
  ch: number;
  count: number;
  orig: number;
  canOpen: boolean;
  canClose: boolean;
  prev: Delim | null;
  next: Delim | null;
}

interface Token {
  text: string;
  node: MdInline | null;
  delim: Delim | null;
  /** Wrappers starting here, innermost first. */
  opens: Tag[] | null;
  /** Wrappers ending here, innermost first. */
  closes: Tag[] | null;
}

interface Bracket {
  tok: number;
  image: boolean;
}

function tag(kind: TagKind, href = "", title: string | null = null, external = false): Tag {
  return { kind, href, title, external };
}

/**
 * CommonMark's inline algorithm: one left-to-right scan into tokens, a delimiter stack for
 * emphasis and a bracket stack for links. Matches are recorded as open/close tags on tokens and
 * the tree is built once at the end, so nothing is re-scanned and the work stays linear.
 */
class InlineParser {
  private readonly src: string;
  /** Streaming tail: constructs still open at the end of the text render as if closed. */
  private readonly tail: boolean;
  private pos = 0;
  private textStart = 0;
  private readonly tokens: Token[] = [];
  private top: Delim | null = null;
  private readonly brackets: Bracket[] = [];
  /** Link brackets below this index can no longer form links (links don't nest). */
  private inactiveBelow = 0;
  private ticks: Map<number, number[]> | null = null;
  private readonly tickCursor = new Map<number, number>();

  constructor(src: string, tail: boolean) {
    this.src = src;
    this.tail = tail;
  }

  parse(): MdInline[] {
    const { src } = this;
    while (this.pos < src.length) {
      const c = src.charCodeAt(this.pos);
      switch (c) {
        case BACKSLASH:
          this.escape();
          break;
        case BACKTICK:
          this.codeSpan();
          break;
        case STAR:
        case UNDERSCORE:
        case TILDE:
          this.delimiterRun(c);
          break;
        case BANG:
          if (src.charCodeAt(this.pos + 1) === LBRACKET) this.openBracket(true);
          else this.pos++;
          break;
        case LBRACKET:
          this.openBracket(false);
          break;
        case RBRACKET:
          this.closeBracket();
          break;
        case LT:
          this.autolink();
          break;
        case NEWLINE:
          this.lineBreak();
          break;
        case LOWER_H:
        case UPPER_H:
        case LOWER_W:
        case UPPER_W:
          this.bareUrl();
          break;
        default:
          this.pos++;
      }
    }
    this.flush(src.length);
    this.processEmphasis(-1, this.tail);
    return build(this.tokens);
  }

  private push(text: string, node: MdInline | null = null): number {
    this.tokens.push({ text, node, delim: null, opens: null, closes: null });
    return this.tokens.length - 1;
  }

  /** Emits the plain text scanned since the last construct. */
  private flush(end: number): void {
    if (end > this.textStart) this.push(this.src.slice(this.textStart, end));
  }

  /** Moves past a construct; plain text starts again after it. */
  private take(end: number): void {
    this.pos = end;
    this.textStart = end;
  }

  private escape(): void {
    const { src, pos } = this;
    const next = src.charCodeAt(pos + 1);
    if (next === NEWLINE) {
      this.flush(pos);
      this.push("", { type: "break" });
      this.take(skipSpaces(src, pos + 2));
    } else if (isAsciiPunct(next)) {
      this.flush(pos);
      this.push(src.charAt(pos + 1));
      this.take(pos + 2);
    } else {
      this.pos++;
    }
  }

  private lineBreak(): void {
    const { src, pos } = this;
    let end = pos;
    while (end > this.textStart && src.charCodeAt(end - 1) === SPACE) end--;
    this.flush(end);
    this.push("", pos - end >= 2 ? { type: "break" } : { type: "softbreak" });
    this.take(skipSpaces(src, pos + 1));
  }

  private codeSpan(): void {
    const { src, pos } = this;
    let end = pos;
    while (src.charCodeAt(end) === BACKTICK) end++;
    const close = this.closingTicks(end - pos, end);
    if (close >= 0) {
      this.flush(pos);
      this.push("", { type: "code", text: codeText(src.slice(end, close)) });
      this.take(close + end - pos);
    } else if (this.tail && /\S/.test(src.slice(end))) {
      this.flush(pos);
      this.push("", { type: "code", text: codeText(src.slice(end)) });
      this.take(src.length);
    } else {
      // No closing run of the same length: the backticks are literal.
      this.pos = end;
    }
  }

  /** Start of the first backtick run of exactly `len` at or after `from`, or -1. */
  private closingTicks(len: number, from: number): number {
    this.ticks ??= backtickRuns(this.src);
    const runs = this.ticks.get(len);
    if (!runs) return -1;
    // Openers only move forward, so each length's cursor does too: no rescanning.
    let k = this.tickCursor.get(len) ?? 0;
    while (k < runs.length && runs[k]! < from) k++;
    this.tickCursor.set(len, k);
    return runs[k] ?? -1;
  }

  private delimiterRun(ch: number): void {
    const { src, pos } = this;
    let end = pos;
    while (src.charCodeAt(end) === ch) end++;
    const count = end - pos;
    // Only "~~" strikes through, so "~5 min" stays text.
    if (ch === TILDE && count !== 2) {
      this.pos = end;
      return;
    }
    const before = codePointBefore(src, pos);
    const after = codePointAt(src, end);
    const beforeSpace = isSpace(before);
    const afterSpace = isSpace(after);
    const beforePunct = isPunct(before);
    const afterPunct = isPunct(after);
    const left = !afterSpace && (!afterPunct || beforeSpace || beforePunct);
    const right = !beforeSpace && (!beforePunct || afterSpace || afterPunct);
    // Underscores inside a word never emphasize: snake_case_name stays as written.
    const canOpen = ch === UNDERSCORE ? left && (!right || beforePunct) : left;
    const canClose = ch === UNDERSCORE ? right && (!left || afterPunct) : right;
    if (!canOpen && !canClose) {
      this.pos = end;
      return;
    }
    this.flush(pos);
    const tok = this.push("");
    const delim: Delim = {
      tok,
      ch,
      count,
      orig: count,
      canOpen,
      canClose,
      prev: this.top,
      next: null,
    };
    if (this.top) this.top.next = delim;
    this.top = delim;
    this.tokens[tok]!.delim = delim;
    this.take(end);
  }

  private openBracket(image: boolean): void {
    const { pos } = this;
    this.flush(pos);
    this.brackets.push({ tok: this.push(image ? "![" : "["), image });
    this.take(pos + (image ? 2 : 1));
  }

  private closeBracket(): void {
    const { src, pos } = this;
    const index = this.brackets.length - 1;
    const bracket = this.brackets[index];
    if (!bracket) {
      this.pos++;
      return;
    }
    if (!bracket.image && index < this.inactiveBelow) {
      this.popBracket();
      this.pos++;
      return;
    }
    const link = linkTail(src, pos + 1);
    if (link.ok) {
      this.flush(pos);
      const safe = safeHref(link.url);
      const kind = bracket.image ? "image" : "link";
      // An unsafe URL keeps its words but loses the link: "[click](javascript:…)" → "click".
      const wrapper = safe
        ? tag(kind, safe.href, link.title, safe.external)
        : tag(bracket.image ? "alt" : "unwrap");
      this.wrap(bracket, wrapper, false);
      if (!bracket.image) this.inactiveBelow = this.brackets.length;
      this.take(link.end);
    } else if (this.tail && link.atEnd) {
      // "[docs](https://exa" while streaming: show the label, not the half-written URL.
      this.flush(pos);
      this.wrap(bracket, tag(bracket.image ? "alt" : "unwrap"), true);
      this.take(src.length);
    } else {
      this.popBracket();
      this.pos++;
    }
  }

  /** Wraps the bracket's content; emphasis inside resolves first, so it can't leak out. */
  private wrap(bracket: Bracket, wrapper: Tag, autoClose: boolean): void {
    this.processEmphasis(bracket.tok, autoClose);
    const open = this.tokens[bracket.tok]!;
    open.text = "";
    open.opens = [wrapper];
    this.tokens.push({ text: "", node: null, delim: null, opens: null, closes: [wrapper] });
    this.popBracket();
  }

  private popBracket(): void {
    this.brackets.pop();
    this.inactiveBelow = Math.min(this.inactiveBelow, this.brackets.length);
  }

  private autolink(): void {
    const { src, pos } = this;
    let end = pos + 1;
    while (end < src.length) {
      const c = src.charCodeAt(end);
      if (c === GT || c === LT || c <= SPACE) break;
      end++;
    }
    if (end === pos + 1 || src.charCodeAt(end) !== GT) {
      this.pos++;
      return;
    }
    const inner = src.slice(pos + 1, end);
    const href = URI_AUTOLINK.test(inner)
      ? inner
      : EMAIL_AUTOLINK.test(inner)
        ? `mailto:${inner}`
        : null;
    const safe = href === null ? null : safeHref(href);
    // <div>, <javascript:…> and friends aren't links we allow: they stay literal text.
    if (!safe) {
      this.pos++;
      return;
    }
    this.flush(pos);
    const children: MdInline[] = [{ type: "text", text: inner }];
    this.push("", {
      type: "link",
      href: safe.href,
      title: null,
      external: safe.external,
      children,
    });
    this.take(end + 1);
  }

  /** GFM's bare links: "https://…", "http://…" and "www.…" after a space or opening mark. */
  private bareUrl(): void {
    const { src, pos } = this;
    if (
      pos > 0 &&
      !URL_BOUNDARY.has(src.charCodeAt(pos - 1)) &&
      !isSpace(codePointBefore(src, pos))
    ) {
      this.pos++;
      return;
    }
    const head = src.slice(pos, pos + 8).toLowerCase();
    const prefix = head.startsWith("https://")
      ? 8
      : head.startsWith("http://")
        ? 7
        : head.startsWith("www.")
          ? 4
          : 0;
    const domain = src.charCodeAt(pos + prefix);
    if (prefix === 0 || !(isAlphaNumeric(domain) || (domain > 127 && !isSpace(domain)))) {
      this.pos++;
      return;
    }
    // Inside link text the URL stops at "]", so "[https://a.com](…)" still forms its link.
    const inBrackets = this.brackets.length > 0;
    let end = pos + prefix;
    while (end < src.length) {
      const c = src.charCodeAt(end);
      if (c <= SPACE || c === LT || c === DEL || (inBrackets && c === RBRACKET)) break;
      if (c > 127 && isSpace(c)) break;
      end++;
    }
    end = trimUrl(src, pos + prefix, end);
    if (end <= pos + prefix) {
      this.pos++;
      return;
    }
    const text = src.slice(pos, end);
    const href = prefix === 4 ? `https://${text}` : text;
    this.flush(pos);
    const children: MdInline[] = [{ type: "text", text }];
    this.push("", { type: "link", href, title: null, external: true, children });
    this.take(end);
  }

  /**
   * Pairs the delimiters above `bottom` into emphasis (CommonMark's "process emphasis"), then
   * drops them. `openersBottom` remembers where a search already failed, so no closer looks
   * past it twice.
   */
  private processEmphasis(bottom: number, autoClose: boolean): void {
    let first: Delim | null = null;
    for (let d = this.top; d && d.tok > bottom; d = d.prev) first = d;
    const openersBottom = new Map<number, number>();
    let closer = first;
    while (closer) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const key = closer.ch * 8 + (closer.canOpen ? 4 : 0) + (closer.orig % 3);
      const floor = Math.max(bottom, openersBottom.get(key) ?? bottom);
      let opener = closer.prev;
      while (opener && opener.tok > floor && !pairs(opener, closer)) opener = opener.prev;
      if (opener && opener.tok > floor) {
        const use = closer.ch === TILDE || (closer.count >= 2 && opener.count >= 2) ? 2 : 1;
        const kind = closer.ch === TILDE ? "del" : use === 2 ? "strong" : "em";
        this.match(opener, closer, tag(kind));
        opener.count -= use;
        closer.count -= use;
        // Delimiters between the pair can't match anything any more.
        opener.next = closer;
        closer.prev = opener;
        if (opener.count === 0) this.unlink(opener);
        if (closer.count === 0) {
          const next = closer.next;
          this.unlink(closer);
          closer = next;
        }
      } else {
        openersBottom.set(key, closer.prev ? closer.prev.tok : bottom);
        const next = closer.next;
        if (!closer.canOpen) this.unlink(closer);
        closer = next;
      }
    }
    if (autoClose) this.closeAtEnd(bottom);
    while (this.top && this.top.tok > bottom) this.top = this.top.prev;
    if (this.top) this.top.next = null;
  }

  /**
   * Streaming: openers still waiting for a closer close at the end of the text. Only clear
   * openers ("**bold", " _note") qualify; an intraword "2*3" stays literal.
   */
  private closeAtEnd(bottom: number): void {
    let end = -1;
    for (let d = this.top; d && d.tok > bottom; d = d.prev) {
      if (!d.canOpen || d.canClose) continue;
      while (d.count >= (d.ch === TILDE ? 2 : 1)) {
        const use = d.ch === TILDE || d.count >= 2 ? 2 : 1;
        if (end < 0) end = this.push("");
        const wrapper = tag(d.ch === TILDE ? "del" : use === 2 ? "strong" : "em");
        this.tokens[d.tok]!.opens ??= [];
        this.tokens[d.tok]!.opens!.push(wrapper);
        this.tokens[end]!.closes ??= [];
        this.tokens[end]!.closes!.push(wrapper);
        d.count -= use;
      }
    }
  }

  private match(opener: Delim, closer: Delim, wrapper: Tag): void {
    const open = this.tokens[opener.tok]!;
    const close = this.tokens[closer.tok]!;
    (open.opens ??= []).push(wrapper);
    (close.closes ??= []).push(wrapper);
  }

  private unlink(d: Delim): void {
    if (d.prev) d.prev.next = d.next;
    if (d.next) d.next.prev = d.prev;
    if (this.top === d) this.top = d.prev;
  }
}

/** Whether an opener and a closer can pair, including CommonMark's "rule of three". */
function pairs(opener: Delim, closer: Delim): boolean {
  if (opener.ch !== closer.ch || !opener.canOpen) return false;
  if (closer.ch === TILDE) return true;
  if ((opener.canClose || closer.canOpen) && (opener.orig + closer.orig) % 3 === 0) {
    return opener.orig % 3 === 0 && closer.orig % 3 === 0;
  }
  return true;
}

interface Frame {
  wrapper: Tag;
  children: MdInline[];
  /** Past the depth limit: the content is kept, the wrapper dropped. */
  flat: boolean;
}

/** Builds the inline tree from tokens and the open/close tags recorded on them. */
function build(tokens: Token[]): MdInline[] {
  const root: MdInline[] = [];
  const stack: Frame[] = [];
  const target = (): MdInline[] => stack[stack.length - 1]?.children ?? root;
  const close = (): void => {
    const frame = stack.pop()!;
    append(target(), frame.flat ? frame.children : finish(frame.wrapper, frame.children));
  };
  for (const token of tokens) {
    for (const wrapper of token.closes ?? []) {
      let at = stack.length - 1;
      while (at >= 0 && stack[at]!.wrapper !== wrapper) at--;
      while (at >= 0 && stack.length > at) close();
    }
    if (token.node) {
      append(target(), [token.node]);
    } else {
      const text = token.delim
        ? String.fromCharCode(token.delim.ch).repeat(token.delim.count)
        : token.text;
      if (text) append(target(), [{ type: "text", text }]);
    }
    const opens = token.opens ?? [];
    for (let k = opens.length - 1; k >= 0; k--) {
      stack.push({ wrapper: opens[k]!, children: [], flat: stack.length >= MAX_INLINE_DEPTH });
    }
  }
  while (stack.length > 0) close();
  return root;
}

function finish(wrapper: Tag, children: MdInline[]): MdInline[] {
  switch (wrapper.kind) {
    case "em":
    case "strong":
    case "del":
      return [{ type: wrapper.kind, children }];
    case "link": {
      const { href, title, external } = wrapper;
      return [{ type: "link", href, title, external, children: delink(children) }];
    }
    case "image": {
      const { href, title, external } = wrapper;
      return [{ type: "image", href, alt: plainText(children), title, external }];
    }
    case "alt":
      return [{ type: "text", text: plainText(children) }];
    case "unwrap":
      return children;
  }
}

/** Appends nodes, merging neighbouring text so the tree stays small. */
function append(into: MdInline[], nodes: MdInline[]): void {
  for (const node of nodes) {
    const last = into[into.length - 1];
    if (node.type === "text" && last?.type === "text") last.text += node.text;
    else into.push(node);
  }
}

/** Links can't nest in HTML: a link or image inside link text keeps only its words. */
function delink(nodes: MdInline[]): MdInline[] {
  const out: MdInline[] = [];
  for (const node of nodes) {
    if (node.type === "link") append(out, delink(node.children));
    else if (node.type === "image") append(out, [{ type: "text", text: node.alt }]);
    else if (node.type === "strong" || node.type === "em" || node.type === "del") {
      out.push({ type: node.type, children: delink(node.children) });
    } else append(out, [node]);
  }
  return out;
}

function plainText(nodes: MdInline[]): string {
  let text = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "code") text += node.text;
    else if (node.type === "image") text += node.alt;
    else if (node.type === "break" || node.type === "softbreak") text += " ";
    else text += plainText(node.children);
  }
  return text;
}

function codeText(raw: string): string {
  const text = raw.replace(/\n/g, " ");
  // One space on each side is padding ("`` `a` ``"), unless the span is only spaces.
  return text.startsWith(" ") && text.endsWith(" ") && /[^ ]/.test(text) ? text.slice(1, -1) : text;
}

function backtickRuns(src: string): Map<number, number[]> {
  const runs = new Map<number, number[]>();
  let i = src.indexOf("`");
  while (i >= 0) {
    const start = i;
    while (src.charCodeAt(i) === BACKTICK) i++;
    const len = i - start;
    const list = runs.get(len);
    if (list) list.push(start);
    else runs.set(len, [start]);
    i = src.indexOf("`", i);
  }
  return runs;
}

type LinkTail =
  { ok: true; url: string; title: string | null; end: number } | { ok: false; atEnd: boolean };

/** Reads `(destination "title")` after a `]`; `atEnd` says the text ran out midway. */
function linkTail(src: string, start: number): LinkTail {
  const n = src.length;
  if (src.charCodeAt(start) !== LPAREN) return { ok: false, atEnd: false };
  let i = skipWhitespace(src, start + 1);
  if (i >= n) return { ok: false, atEnd: true };
  let url: string;
  if (src.charCodeAt(i) === LT) {
    let j = i + 1;
    for (; j < n; j++) {
      const c = src.charCodeAt(j);
      if (c === BACKSLASH) j++;
      else if (c === GT || c === LT || c === NEWLINE) break;
    }
    if (j >= n) return { ok: false, atEnd: true };
    if (src.charCodeAt(j) !== GT) return { ok: false, atEnd: false };
    url = unescapePunct(src.slice(i + 1, j));
    i = j + 1;
  } else {
    let j = i;
    let depth = 0;
    for (; j < n; j++) {
      const c = src.charCodeAt(j);
      if (c === BACKSLASH && isAsciiPunct(src.charCodeAt(j + 1))) j++;
      else if (c === LPAREN) {
        if (++depth > MAX_PAREN_DEPTH) return { ok: false, atEnd: false };
      } else if (c === RPAREN) {
        if (depth === 0) break;
        depth--;
      } else if (c <= SPACE || c === DEL) break;
    }
    if (j >= n) return { ok: false, atEnd: true };
    if (depth > 0) return { ok: false, atEnd: false };
    url = unescapePunct(src.slice(i, j));
    i = j;
  }
  const afterUrl = i;
  i = skipWhitespace(src, i);
  if (i >= n) return { ok: false, atEnd: true };
  let title: string | null = null;
  const quote = src.charCodeAt(i);
  if (i > afterUrl && (quote === QUOTE || quote === APOS || quote === LPAREN)) {
    const closing = quote === LPAREN ? RPAREN : quote;
    let j = i + 1;
    for (; j < n; j++) {
      const c = src.charCodeAt(j);
      if (c === BACKSLASH) j++;
      else if (c === closing) break;
      else if (quote === LPAREN && c === LPAREN) return { ok: false, atEnd: false };
    }
    if (j >= n) return { ok: false, atEnd: true };
    title = unescapePunct(src.slice(i + 1, j));
    i = skipWhitespace(src, j + 1);
    if (i >= n) return { ok: false, atEnd: true };
  }
  if (src.charCodeAt(i) !== RPAREN) return { ok: false, atEnd: false };
  return { ok: true, url, title, end: i + 1 };
}

const URI_AUTOLINK = /^[a-z][a-z0-9+.-]{1,31}:/i;
const EMAIL_AUTOLINK =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/** What may come right before a bare URL besides whitespace: an opening mark or quote. */
const URL_BOUNDARY = new Set([STAR, UNDERSCORE, TILDE, LPAREN, LBRACKET, QUOTE, APOS]);
/** Punctuation that ends a sentence rather than a bare URL: "see https://x.com." */
const URL_TRAILING = new Set([
  QUESTION,
  BANG,
  DOT,
  COMMA,
  COLON,
  SEMICOLON,
  STAR,
  UNDERSCORE,
  TILDE,
  APOS,
  QUOTE,
]);

/** GFM's trailing-punctuation rule: "(see https://x.com/a_(b))." keeps only the balanced ")". */
function trimUrl(src: string, start: number, end: number): number {
  let open = 0;
  let close = 0;
  for (let i = start; i < end; i++) {
    const c = src.charCodeAt(i);
    if (c === LPAREN) open++;
    else if (c === RPAREN) close++;
  }
  while (end > start) {
    const c = src.charCodeAt(end - 1);
    if (URL_TRAILING.has(c)) end--;
    else if (c === RPAREN && close > open) {
      close--;
      end--;
    } else break;
  }
  return end;
}

function unescapePunct(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

// ---------------------------------------------------------------------------------------------
// Characters

function isBlank(line: string): boolean {
  for (let i = 0; i < line.length; i++) if (!isSpaceOrTab(line.charCodeAt(i))) return false;
  return true;
}

function leadingSpace(line: string): number {
  let i = 0;
  while (i < line.length && isSpaceOrTab(line.charCodeAt(i))) i++;
  return i;
}

/** Leading whitespace in columns, with tabs stopping every four columns. */
function indentWidth(line: string): number {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === SPACE) col++;
    else if (c === TAB) col += 4 - (col % 4);
    else break;
  }
  return col;
}

/** Removes up to `columns` of indentation; a tab only partly removed leaves its spaces behind. */
function stripIndent(line: string, columns: number): string {
  let col = 0;
  let i = 0;
  while (i < line.length && col < columns) {
    const c = line.charCodeAt(i);
    if (c === SPACE) col++;
    else if (c === TAB) {
      const next = col + 4 - (col % 4);
      if (next > columns) return " ".repeat(next - columns) + line.slice(i + 1);
      col = next;
    } else break;
    i++;
  }
  return line.slice(i);
}

function skipSpaces(src: string, i: number): number {
  while (i < src.length && isSpaceOrTab(src.charCodeAt(i))) i++;
  return i;
}

function skipWhitespace(src: string, i: number): number {
  while (i < src.length) {
    const c = src.charCodeAt(i);
    if (c !== SPACE && c !== TAB && c !== NEWLINE) break;
    i++;
  }
  return i;
}

function isSpaceOrTab(c: number): boolean {
  return c === SPACE || c === TAB;
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function isAlphaNumeric(c: number): boolean {
  return isDigit(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isAsciiPunct(c: number): boolean {
  return (
    (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126)
  );
}

const UNICODE_SPACE = /\p{Zs}/u;
const UNICODE_PUNCT = /[\p{P}\p{S}]/u;

/** Unicode whitespace; -1 stands for the start or end of the text, which count as whitespace. */
function isSpace(cp: number): boolean {
  if (cp < 0) return true;
  if (cp < 128) return cp === SPACE || (cp >= TAB && cp <= 13);
  return UNICODE_SPACE.test(String.fromCodePoint(cp));
}

function isPunct(cp: number): boolean {
  if (cp < 0) return false;
  if (cp < 128) return isAsciiPunct(cp);
  return UNICODE_PUNCT.test(String.fromCodePoint(cp));
}

function codePointBefore(src: string, i: number): number {
  if (i <= 0) return -1;
  const low = src.charCodeAt(i - 1);
  if (low >= 0xdc00 && low <= 0xdfff && i >= 2) {
    const high = src.charCodeAt(i - 2);
    if (high >= 0xd800 && high <= 0xdbff) return (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
  }
  return low;
}

function codePointAt(src: string, i: number): number {
  return src.codePointAt(i) ?? -1;
}
