/**
 * A reference screenshot redacted on import. Its text is read with where
 * each piece is, its private details proposed as boxes (emails and phone
 * numbers by their pattern, names and addresses by the studio's AI: see
 * ./text-boxes), the boxes checked by a person, and a copy made with them
 * blurred (the media worker's redact_image). The original never joins the
 * library: it is deleted once the copy is made unless a person asked to keep
 * it, and then only admins can open it. What was read is never kept, only
 * the boxes, whose labels hide most of what they cover. See
 * ./redaction.server and migration 0035_reference_privacy.
 *
 * Shared by the server, the browser and tests.
 */
import {
  boxesInPixels,
  cleanBoxes,
  MAX_BOXES,
  PRIVATE_KINDS,
  type PrivateKind,
  type RedactionBox,
} from "./text-boxes";

export const REDACTION_STATUSES = [
  "uploading",
  "reading",
  "review",
  "applying",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RedactionStatus = (typeof REDACTION_STATUSES)[number];

/** The kinds of picture a screenshot may be, and the most it may weigh. */
export const SCREENSHOT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const SCREENSHOT_MAX_BYTES = 15 * 1024 * 1024;
/** Where originals are kept while they are checked (their uploader's folder), and once kept (kept/). */
export const ORIGINALS_BUCKET = "reference-originals";
/** A screenshot left unchecked this long is cancelled and its original deleted. */
export const UNCHECKED_DAYS = 7;

export interface RedactionView {
  redactionId: string;
  title: string;
  status: RedactionStatus;
  width: number | null;
  height: number | null;
  boxes: RedactionBox[];
  /** What the copy will be marked, and whether the original is kept (for admins). */
  layoutOnly: boolean;
  keepOriginal: boolean;
  /** The original, while it is being checked: for who imported it, and admins. */
  original: { bucket: string; path: string } | null;
  /** The original is kept for admins (see keptOriginal). */
  originalKept: boolean;
  /** The copy in the library, once it is made. */
  redactedAssetId: string | null;
  /** What the reading found, by kind. */
  found: Record<PrivateKind | "drawn", number>;
  /** What happens next, or what went wrong, in words. */
  message: string;
}

/** How many boxes of each kind. */
export function boxCounts(boxes: RedactionBox[]): Record<PrivateKind | "drawn", number> {
  const counts = { name: 0, email: 0, phone: 0, address: 0, drawn: 0 };
  for (const box of boxes) counts[box.kind] += 1;
  return counts;
}

type Json = Record<string, unknown>;

/**
 * Boxes as a person (or a script) gives them back, checked: inside the
 * picture, of a real size, at most MAX_BOXES, each with an id, a kind and a
 * label (a box drawn by hand says so). Anything else is dropped.
 */
export function redactionBoxes(list: unknown): RedactionBox[] {
  if (!Array.isArray(list)) return [];
  const boxes = list.flatMap((entry, index): RedactionBox[] => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Json;
    const [x, y, w, h] = ["x", "y", "w", "h"].map((key) => record[key]);
    if (![x, y, w, h].every((value) => typeof value === "number" && Number.isFinite(value)))
      return [];
    const kind = (PRIVATE_KINDS as readonly unknown[]).includes(record["kind"])
      ? (record["kind"] as PrivateKind)
      : "drawn";
    const source =
      record["source"] === "pattern" || record["source"] === "ai" ? record["source"] : "person";
    const label =
      typeof record["label"] === "string" && record["label"].trim()
        ? record["label"].trim().slice(0, 60)
        : "Marked by hand";
    const id =
      typeof record["id"] === "string" && /^[\w-]{1,40}$/.test(record["id"])
        ? record["id"]
        : `p${index + 1}`;
    return [
      { id, x: x as number, y: y as number, w: w as number, h: h as number, kind, source, label },
    ];
  });
  return cleanBoxes(boxes).slice(0, MAX_BOXES);
}

/** What the media worker's redact_image is asked: the boxes in the picture's pixels. */
export function redactionTaskParams(
  boxes: RedactionBox[],
  width: number,
  height: number,
): { boxes: { x: number; y: number; w: number; h: number }[]; format: "png" } {
  return { boxes: boxesInPixels(boxes, width, height), format: "png" };
}

/** What happens next, in words, for the person (or the script). */
export function redactionMessage(
  status: RedactionStatus,
  boxes: RedactionBox[],
  failure: string | null = null,
): string {
  switch (status) {
    case "uploading":
      return "Waiting for the screenshot to arrive.";
    case "reading":
      return "Reading the screenshot for names, emails, phone numbers and addresses…";
    case "review":
      return boxes.length
        ? `${boxes.length} ${boxes.length === 1 ? "area" : "areas"} to blur. Check every box (remove one that isn't private, drag to add one that is), then blur them.`
        : "Nothing private was found. Look for yourself: drag across anything that must not be shown, or add it as it is.";
    case "applying":
      return "Blurring the boxes in a copy…";
    case "completed":
      return boxes.length
        ? "The copy with its private details blurred is in the library."
        : "The screenshot is in the library as it was: nothing in it was blurred.";
    case "failed":
      return `The copy couldn't be made${failure ? `: ${failure}` : ""}. Check the boxes and try again.`;
    case "cancelled":
      return `Cancelled: the screenshot was deleted${failure ? ` (${failure.toLowerCase()})` : ""}.`;
  }
}
