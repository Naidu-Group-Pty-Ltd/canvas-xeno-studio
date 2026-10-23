/**
 * Text in a picture with where it is. The studio's AI reads every piece of
 * lettering with its box (see ./text-boxes.server), so a person can see what
 * was found, and add or remove boxes before anything is done with them:
 *   - a logo's lettering is taken out of its art by them (the clean-plate
 *     recipe), so a video model never draws a letter;
 *   - a reference screenshot's private details are blurred by them: emails
 *     and phone numbers found by their pattern, names and addresses by the AI.
 *
 * A box is a share of the picture's width and height from its top-left
 * corner (0-1), so it holds at any size. Shared by the server, the browser
 * and tests.
 */

export const TEXT_KINDS = ["name", "email", "phone", "address", "other"] as const;
export type TextKind = (typeof TEXT_KINDS)[number];

/** What a reference screenshot must not show. */
export const PRIVATE_KINDS = ["name", "email", "phone", "address"] as const;
export type PrivateKind = (typeof PRIVATE_KINDS)[number];

export const PRIVATE_KIND_LABELS: Record<PrivateKind | "drawn", string> = {
  name: "Name",
  email: "Email",
  phone: "Phone number",
  address: "Address",
  drawn: "Marked by hand",
};

/** The most boxes kept for one picture. */
export const MAX_BOXES = 200;
/** The smallest box kept, as a share of the picture each way. */
const MIN_SIDE = 0.002;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A piece of text as read: what it says, its box, and what the AI took it for. */
export interface TextPiece {
  text: string;
  box: Box;
  kind: TextKind;
}

/** A box to blur on a reference screenshot, with what it covers. */
export interface RedactionBox extends Box {
  id: string;
  kind: PrivateKind | "drawn";
  /** Found by its pattern (emails, phone numbers), by the AI, or drawn by a person. */
  source: "pattern" | "ai" | "person";
  /** What it covers, with most of it hidden: "J••• S••••", "j•••@•••". */
  label: string;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** A box from the AI's answer, {x0, y0, x1, y1} in thousandths of the picture; null if it isn't one. */
export function boxFromAnswer(value: unknown): Box | null {
  const record = asRecord(value);
  // Worked in thousandths, so a box read as whole numbers stays exact.
  const read = (key: string) => {
    const raw = record[key];
    return typeof raw === "number" && Number.isFinite(raw)
      ? Math.max(0, Math.min(1000, raw))
      : null;
  };
  const [x0, y0, x1, y1] = [read("x0"), read("y0"), read("x1"), read("y1")];
  if (x0 === null || y0 === null || x1 === null || y1 === null) return null;
  const box = {
    x: Math.min(x0, x1) / 1000,
    y: Math.min(y0, y1) / 1000,
    w: Math.abs(x1 - x0) / 1000,
    h: Math.abs(y1 - y0) / 1000,
  };
  return box.w >= MIN_SIDE && box.h >= MIN_SIDE ? box : null;
}

/** The AI's answer, cleaned: pieces with their text, a real box and a known kind. */
export function textPieces(answer: unknown): TextPiece[] {
  const entries = asRecord(answer)["findings"];
  if (!Array.isArray(entries)) return [];
  return entries
    .flatMap((entry): TextPiece[] => {
      const record = asRecord(entry);
      const box = boxFromAnswer(record["box"]);
      if (!box) return [];
      const kind = (TEXT_KINDS as readonly unknown[]).includes(record["kind"])
        ? (record["kind"] as TextKind)
        : "other";
      const text = typeof record["text"] === "string" ? record["text"].trim().slice(0, 200) : "";
      return [{ text, box, kind }];
    })
    .slice(0, MAX_BOXES);
}

/** An email address, allowing the stray spaces a reading can put round its "@". */
const EMAIL = /[a-z0-9._%+-]+ ?@ ?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;

export function looksLikeEmail(text: string): boolean {
  return EMAIL.test(text);
}

/**
 * A phone number: a run of 8 to 15 digits with the spaces, dots, dashes and
 * brackets numbers are written with, perhaps after a +. Dates (2026-10-22)
 * and amounts grouped in thousands (12.345.678) are not.
 */
export function looksLikePhone(text: string): boolean {
  const runs = text.match(/\+?\(?\d[\d ().-]{6,}\d/g) ?? [];
  return runs.some((run) => {
    const trimmed = run.trim();
    const digits = trimmed.replace(/\D/g, "").length;
    if (digits < 8 || digits > 15) return false;
    if (/^\d{1,4}[-.]\d{1,2}[-.]\d{1,4}$/.test(trimmed)) return false;
    if (/^\d{1,3}([.]\d{3})+$/.test(trimmed)) return false;
    return true;
  });
}

/**
 * Whether a piece of text is private, and as what. Emails and phone numbers
 * are found by their pattern, whatever the AI took them for; names and
 * addresses by the AI. An email or phone number the AI saw that a reading
 * slip keeps from matching its pattern is kept as well: a person checks the
 * boxes, and a box too many costs nothing.
 */
export function privateKind(piece: Pick<TextPiece, "text" | "kind">): PrivateKind | null {
  if (looksLikeEmail(piece.text)) return "email";
  if (looksLikePhone(piece.text)) return "phone";
  return piece.kind === "other" ? null : piece.kind;
}

/** What a box covers, with most of it hidden, so the list can say which is which. */
export function maskedText(text: string, kind: PrivateKind): string {
  const shown = text.trim();
  if (!shown) return "•••";
  if (kind === "email") return `${shown.charAt(0)}•••@•••`;
  if (kind === "phone") return `••• ${shown.replace(/\D/g, "").slice(-2)}`;
  return shown
    .split(/\s+/)
    .slice(0, 6)
    .map((word) => `${word.charAt(0)}${"•".repeat(Math.min(4, Math.max(1, word.length - 1)))}`)
    .join(" ");
}

/**
 * A box grown by `around` of its own height on every side (text boxes are
 * read tight, and a blur or an edit must cover every stroke), kept inside the
 * picture. `aspect` is the picture's width over its height, so the growth is
 * the same in pixels each way.
 */
export function padBox(box: Box, { aspect, around }: { aspect: number; around: number }): Box {
  const down = box.h * around;
  const across = (box.h * around) / Math.max(0.05, aspect);
  const x = clamp(box.x - across);
  const y = clamp(box.y - down);
  return {
    x,
    y,
    w: clamp(box.x + box.w + across) - x,
    h: clamp(box.y + box.h + down) - y,
  };
}

const overlaps = (a: Box, b: Box, gap: number) =>
  a.x <= b.x + b.w + gap &&
  b.x <= a.x + a.w + gap &&
  a.y <= b.y + b.h + gap &&
  b.y <= a.y + a.h + gap;

/** Boxes that overlap (or come within `gap`) joined into one, until none do. */
export function mergeBoxes(boxes: Box[], gap = 0): Box[] {
  const out = boxes.map((box) => ({ ...box }));
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i += 1) {
      for (let j = i + 1; j < out.length && !merged; j += 1) {
        const a = out[i]!;
        const b = out[j]!;
        if (!overlaps(a, b, gap)) continue;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        out[i] = {
          x,
          y,
          w: Math.max(a.x + a.w, b.x + b.w) - x,
          h: Math.max(a.y + a.h, b.y + b.h) - y,
        };
        out.splice(j, 1);
        merged = true;
      }
    }
  }
  return out;
}

/** Boxes as a person or a script gives them: inside the picture, of a real size, at most MAX_BOXES. */
export function cleanBoxes<T extends Box>(boxes: T[]): T[] {
  return boxes
    .map((box) => {
      const x = clamp(box.x);
      const y = clamp(box.y);
      return { ...box, x, y, w: clamp(box.x + box.w) - x, h: clamp(box.y + box.h) - y };
    })
    .filter((box) => box.w >= MIN_SIDE && box.h >= MIN_SIDE)
    .slice(0, MAX_BOXES);
}

/** Boxes in a picture's own pixels (as the media worker takes them), each at least a pixel each way. */
export function boxesInPixels(
  boxes: Box[],
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number }[] {
  // A share's float noise (0.1 + 0.2 is a hair over 0.3) never reaches a pixel more.
  const down = (value: number) => Math.floor(value + 1e-6);
  const up = (value: number) => Math.ceil(value - 1e-6);
  return boxes.map((box) => {
    const x = Math.min(width - 1, Math.max(0, down(box.x * width)));
    const y = Math.min(height - 1, Math.max(0, down(box.y * height)));
    const right = Math.min(width, up((box.x + box.w) * width));
    const bottom = Math.min(height, up((box.y + box.h) * height));
    return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
  });
}

/**
 * The boxes a reference screenshot's private details are blurred in: each
 * private piece of text, grown a quarter of its height all round, with what
 * it covers. A person checks them before they are applied.
 */
export function proposeRedaction(pieces: TextPiece[], aspect: number): RedactionBox[] {
  return pieces.flatMap((piece, index): RedactionBox[] => {
    const kind = privateKind(piece);
    if (!kind) return [];
    const byPattern = looksLikeEmail(piece.text) || looksLikePhone(piece.text);
    return [
      {
        ...padBox(piece.box, { aspect, around: 0.25 }),
        id: `t${index + 1}`,
        kind,
        source: byPattern ? "pattern" : "ai",
        label: maskedText(piece.text, kind),
      },
    ];
  });
}

/**
 * The boxes a logo's lettering is taken out of its art by: every piece the
 * AI read, grown a fifth of its height all round, and the pieces of a line
 * (or a stacked lockup) joined.
 */
export function letteringBoxes(pieces: TextPiece[], aspect: number): Box[] {
  return mergeBoxes(
    pieces.map((piece) => padBox(piece.box, { aspect, around: 0.2 })),
    0.005,
  );
}
