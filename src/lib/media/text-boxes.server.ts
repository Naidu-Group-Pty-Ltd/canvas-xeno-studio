/**
 * Reading the text in a picture with where each piece is (see ./text-boxes):
 * the studio's AI is shown the picture and lists every piece of lettering
 * with its box, and, for a reference screenshot, what kind of detail each is.
 * A sibling of the text check (./text-check.server), which judges whether
 * lettering is garbled rather than where it is.
 */
import { textPieces, TEXT_KINDS, type TextPiece } from "./text-boxes";

export type TextBoxPurpose = "lettering" | "privacy";

const BOX_RULES = `For each piece give:
- "text": what it says, as closely as you can read it;
- "box": where it is, as {"x0", "y0", "x1", "y1"}: its left, top, right and bottom edges, in thousandths of the picture's width (x) and height (y), measured from its top-left corner. Draw the box tight round the letters, one box per line of text.`;

const SYSTEM: Record<TextBoxPurpose, string> = {
  lettering: `You find the lettering in a piece of artwork (a logo, a lockup, a poster, a packshot) so it can be taken out of the art and laid back exactly.

List every piece of lettering: words, letters and numbers, a logo's wordmark and any tagline. Do not list pictures, symbols, emblems or shapes that aren't letters.

${BOX_RULES}
- "kind": always "other".

If there is no lettering, return no findings.`,
  privacy: `You read screenshots of software (dashboards, client portals, CRMs, inboxes, browsers) to find the private details in them before the picture is shared as a layout reference.

List every piece of visible text: headings, labels, menu items, table cells, buttons, browser tabs, bookmarks, address bars, notifications.

${BOX_RULES}
- "kind": "name" for a person's name (a client, contact, user or member of staff, whole or in part) or a private client's business; "address" for a street or postal address or part of one (a number and street, a suburb with its postcode); "email" for an email address; "phone" for a phone number; "other" for everything else (the product's own name and menus, headings, labels, buttons, dates, amounts).

If there is no text, return no findings.`,
};

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          box: {
            type: "object",
            properties: {
              x0: { type: "number" },
              y0: { type: "number" },
              x1: { type: "number" },
              y1: { type: "number" },
            },
            required: ["x0", "y0", "x1", "y1"],
          },
          kind: { type: "string", enum: [...TEXT_KINDS] },
        },
        required: ["text", "box", "kind"],
      },
    },
  },
  required: ["findings"],
};

/** Reads the text in one picture (a signed URL) with where each piece is. */
export async function readTextBoxes(input: {
  url: string;
  purpose: TextBoxPurpose;
  /** Names that may appear and are spelt so (a brand's own). */
  expected?: string[];
  timeoutMs?: number;
}): Promise<
  { ok: true; pieces: TextPiece[]; model: string | null } | { ok: false; message: string }
> {
  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("qc");
  if (!route) return { ok: false, message: "No AI model is set up to read pictures" };
  const expected = (input.expected ?? []).map((name) => name.trim()).filter(Boolean);
  const answer = await route.provider.generateStructured<unknown>({
    system: SYSTEM[input.purpose],
    input: [
      input.purpose === "lettering" ? "ARTWORK: one picture." : "SCREENSHOT: one picture.",
      expected.length
        ? `Names that may appear, spelt exactly like this: ${expected.slice(0, 20).join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    schemaName: "text_boxes",
    schema: SCHEMA,
    model: route.model,
    images: [input.url],
    timeoutMs: Math.min(90_000, Math.max(5_000, input.timeoutMs ?? 60_000)),
  });
  if (!answer.ok || !answer.data)
    return { ok: false, message: answer.errorMessage ?? "The AI didn't answer" };
  return { ok: true, pieces: textPieces(answer.data), model: answer.model ?? route.model };
}
