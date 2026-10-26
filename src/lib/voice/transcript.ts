/**
 * A transcript in the brand's spellings. A recogniser hears a brand's name
 * as words it knows: the two that read As One's reference spelt the client's
 * name their own ways ("Arixa", "Erixus"), where the screen spells it Aurixa
 * Systems. It is told the names to listen for (termsPrompt), and the
 * captions' own correction (correctSpellings, which takes a heard word for a
 * name within a couple of letters of it) puts the timed words right; each
 * word put right is changed in the punctuated text where it was heard, so
 * every other word stays as it was heard. Pure, so it is unit-testable.
 */
import { correctSpellings } from "../edit/captions";
import type { TimedWord } from "./catalog";

export interface SpellingCorrection {
  heard: string;
  written: string;
  /** When the first word of it was heard, in seconds. */
  at: number;
}

const core = (text: string) => text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
/** A word as a pattern that matches only itself. */
const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The names a recogniser is told to listen for, as its prompt (at most 800 characters). */
export function termsPrompt(terms: string[]): string {
  const unique = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
  let prompt = "";
  for (const term of unique) {
    const next = prompt ? `${prompt}, ${term}` : term;
    if (next.length > 800) break;
    prompt = next;
  }
  return prompt ? `${prompt}.` : "";
}

/** How far past the last word found the text is searched for the next: past a number written as figures. */
const LOOKAHEAD = 40;

/**
 * The text with the words put right changed where each was heard: each heard
 * word is found in it in turn, a little after the one before, so a word the
 * recogniser wrote differently in its text ("3" for "three") is passed over
 * and no other occurrence of a name is touched.
 */
function respell(text: string, heard: TimedWord[], spelt: TimedWord[]): string {
  let out = "";
  let cursor = 0;
  heard.forEach((word, index) => {
    const said = core(word.text);
    if (!said) return;
    const found = new RegExp(`(?<![\\p{L}\\p{N}])${literally(said)}(?![\\p{L}\\p{N}])`, "iu").exec(
      text.slice(cursor, cursor + said.length + LOOKAHEAD),
    );
    if (!found) return;
    const at = cursor + found.index;
    const written = core(spelt[index]!.text);
    out += text.slice(cursor, at) + (written === said ? found[0] : written);
    cursor = at + found[0].length;
  });
  return out + text.slice(cursor);
}

/**
 * The words and text with the brand's names spelt as the brand spells them,
 * and each word that was changed: what was heard, what is written, and when.
 */
export function spellTranscript(
  words: TimedWord[],
  text: string,
  terms: string[],
): { words: TimedWord[]; text: string; corrections: SpellingCorrection[] } {
  const spelt = correctSpellings(words, terms);
  const corrections = spelt.flatMap((word, index) =>
    word.text === words[index]!.text
      ? []
      : [{ heard: core(words[index]!.text), written: core(word.text), at: words[index]!.start }],
  );
  return {
    words: spelt,
    text: corrections.length ? respell(text, words, spelt) : text,
    corrections,
  };
}
