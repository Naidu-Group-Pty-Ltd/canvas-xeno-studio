/**
 * What a prompt asks of an image or video model that the model is known to
 * get wrong, said before anything is spent. Warnings only: nothing here stops
 * a generation.
 *
 * Each was paid for in the Briefing Room thumbnails (Oct 2026):
 *
 *   • Lettering. GPT Image lettered the first tests' charts and report pages
 *     with gibberish, told not to; models spell headlines wrong and draw
 *     logos as near-misses. Type and logos are set over the picture instead
 *     (a motion graphic or still card in the brand's fonts), and a picture
 *     that must carry words is read with check_text.
 *   • Screens and documents. Their contents come out lettered with
 *     gibberish, so the product's real screens are laid over the picture.
 *   • Naming what goes on top. A layout key called "play_button_zone" had
 *     the model draw a play button: a model draws what a prompt names, even
 *     as a space to leave empty, and a model with no negative prompt often
 *     draws what it is told not to. Only light and depth are described where
 *     an overlay will sit.
 *
 * A mention in a clause that already says no ("no screens, panels or text")
 * is not lettering or a screen asked for, so it is not flagged as one; naming
 * an overlay is flagged either way. Shared by the Create page and the studio
 * API, so both say the same.
 */

export type PromptWarningCode = "lettering" | "screens" | "overlay";

export interface PromptWarning {
  code: PromptWarningCode;
  /** The words in the prompt that raised it, as written. */
  found: string[];
  message: string;
}

const LETTERING =
  /\b(headlines?|captions?|taglines?|slogans?|lettering|typography|typeset|wordmarks?|logos?|logotypes?|(?:title|body|overlay) text|text (?:that )?(?:says|reads)|(?:that|which) (?:says|reads)|written (?:on|across)|the words?)\b/gi;
const SCREENS =
  /\b(dashboards?|screens?(?!\s+(?:light|glow|lit)\b)|monitors?|laptops?|tablets?|smartphones?|phones?|apps?|websites?|web pages?|interfaces?|spreadsheets?|charts?|graphs?|documents?|paperwork|invoices?)\b/gi;
/** "UI" in capitals only: "ui" is too often part of something else. */
const UI = /\bUIs?\b/g;
const OVERLAY =
  /\b(play[ _-]?buttons?|buttons?|cursors?|mouse pointers?|progress bars?|scroll ?bars?|watermarks?|badges?|overlays?|placeholders?|safe[ _-]?(?:areas?|zones?)|(?:empty|blank|clear|reserved) (?:areas?|zones?|spaces?) for|[a-z]+(?:_[a-z]+)*_(?:zones?|areas?|slots?))\b/gi;
/** A word that says no, earlier in the same clause. */
const NEGATION = /\b(no|not|never|without|none|nor|avoid|avoiding|free of|zero|don't|do not)\b/i;

/** A quoted phrase of words: something the picture is asked to spell. */
const QUOTED = /["“]([^"”\n]{2,80})["”]/g;

/** A heading that says no: a brief's `"never": [...]`, "Avoid:", "Negative:". */
const NEGATIVE_HEADING =
  /\b(never|avoid|avoids|don'?ts?|exclude|excluded|negative|forbidden|not allowed)\W{0,4}$/i;

/** Whether the words at `index` are in a clause that says no, or under a heading that does. */
function negated(text: string, index: number): boolean {
  const start = Math.max(
    text.lastIndexOf(".", index - 1),
    text.lastIndexOf(";", index - 1),
    text.lastIndexOf(":", index - 1),
    text.lastIndexOf("\n", index - 1),
  );
  if (NEGATION.test(text.slice(start + 1, index))) return true;
  return start >= 0 && NEGATIVE_HEADING.test(text.slice(Math.max(0, start - 24), start + 1));
}

function matches(text: string, pattern: RegExp, negatable: boolean): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (negatable && negated(text, match.index ?? 0)) continue;
    const word = match[0].trim();
    if (!found.some((seen) => seen.toLowerCase() === word.toLowerCase())) found.push(word);
  }
  return found;
}

/**
 * Quoted phrases a picture would have to spell. A structured prompt (a JSON
 * brief) quotes its own keys and values, so it is read for its words only.
 */
function quotedWords(prompt: string): string[] {
  const trimmed = prompt.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return [];
  return matches(prompt, QUOTED, true)
    .map((quoted) => quoted.replace(/^["“]|["”]$/g, ""))
    .filter((words) => /[a-z]{2,}/i.test(words));
}

const list = (words: string[]) =>
  words
    .slice(0, 4)
    .map((word) => `"${word}"`)
    .join(", ");

/** What a prompt asks for that a model is known to get wrong (empty when nothing). */
export function promptWarnings(prompt: string): PromptWarning[] {
  const text = prompt ?? "";
  if (!text.trim()) return [];
  const warnings: PromptWarning[] = [];

  const lettering = [...quotedWords(text), ...matches(text, LETTERING, true)];
  if (lettering.length)
    warnings.push({
      code: "lettering",
      found: lettering,
      message: `Asks for lettering (${list(lettering)}). Image and video models spell words wrong more often than not and draw logos as near-misses. Leave type and logos out of the picture and set them over it in the brand's fonts, or read the result with the text check before using it.`,
    });

  const screens = [...matches(text, SCREENS, true), ...matches(text, UI, true)];
  if (screens.length)
    warnings.push({
      code: "screens",
      found: screens,
      message: `Shows screens or documents (${list(screens)}). Their contents come out lettered with gibberish, even when told not to. Lay the product's real screens over the picture afterwards, or keep them out of focus or facing away.`,
    });

  const overlay = matches(text, OVERLAY, false);
  if (overlay.length)
    warnings.push({
      code: "overlay",
      found: overlay,
      message: `Names something laid over the picture (${list(overlay)}). A model draws what a prompt names, even as a space to leave empty or something not to draw. Describe only the light and depth where it will sit.`,
    });

  return warnings;
}
