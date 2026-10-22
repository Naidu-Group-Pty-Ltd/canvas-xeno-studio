/**
 * Captions from the words that were meant, at the times they were said.
 *
 * A voiceover's word timings come from transcription: no punctuation to break
 * cards on, and names it has never heard spelt as it guessed them ("Arixa" for
 * Aurixa). The script the voiceover was read from has the words right, so it
 * is laid over the timings: the two are aligned word by word (a word the
 * transcription heard differently still lines up with its neighbours), and
 * each script word takes the time of the word it met. Script words the
 * transcription missed are given time between their neighbours. Without a
 * script, the brand's own spellings put right the names it got wrong.
 *
 * The cards are phrases: a sentence, or a clause of one, broken at its
 * punctuation and kept short enough to read at a glance, never a word left on
 * its own. They are timed as the Editor times captions from words: up with
 * their first word, lingering a moment after their last, at least long enough
 * to read, and straight on into the next across a short gap.
 *
 * Pure functions, shared by the Editor, the server and tests.
 */
import { emphasisFor } from "./brand-captions";
import { LIMITS, type CaptionSegment } from "./timeline";

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** A word as compared: lower case, letters and digits only ("Aurixa's," → "aurixas"). */
export function wordKey(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Edits (insert, delete, change, swap two neighbours) between two words. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = new Uint16Array(rows * cols);
  for (let i = 0; i < rows; i += 1) d[i * cols] = i;
  for (let j = 0; j < cols; j += 1) d[j] = j;
  for (let i = 1; i < rows; i += 1)
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        d[(i - 1) * cols + j]! + 1,
        d[i * cols + j - 1]! + 1,
        d[(i - 1) * cols + j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        best = Math.min(best, d[(i - 2) * cols + j - 2]! + 1);
      d[i * cols + j] = best;
    }
  return d[rows * cols - 1]!;
}

/** How alike two words are, 0 to 1. */
export function wordSimilarity(a: string, b: string): number {
  const x = wordKey(a);
  const y = wordKey(b);
  if (!x || !y) return x === y ? 1 : 0;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}

/** The words of a script, as written (punctuation kept on the word it follows). */
export function scriptWords(script: string): string[] {
  return (
    script
      .replace(/[—–]/g, (dash) => ` ${dash} `)
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean)
      // A dash standing alone breaks a clause: it rides on the word before.
      .reduce<string[]>((words, word) => {
        if (/^[—–-]+$/.test(word) && words.length) words[words.length - 1] += ` ${word}`;
        else words.push(word);
        return words;
      }, [])
  );
}

/* ------------------------------------------------------------------ */
/* The brand's spellings                                               */
/* ------------------------------------------------------------------ */

/** Edits a heard word may be from a name and still be taken for it. */
function allowedEdits(length: number): number {
  if (length < 4) return 0;
  if (length <= 4) return 1;
  if (length <= 8) return 2;
  return 3;
}

/**
 * Words with the brand's names spelt as the brand spells them. A name of one
 * word replaces a heard word within a couple of letters of it ("Arixa",
 * "Erixa" → "Aurixa"); a name of several words replaces only a run of heard
 * words that, together, is that close, so "Aurixa Systems" never turns every
 * "system" into a name. Punctuation after a word is kept.
 */
export function correctSpellings<T extends { text: string }>(words: T[], terms: string[]): T[] {
  const names = terms
    .map((term) => term.trim().split(/\s+/).filter(Boolean))
    .filter((parts) => parts.length > 0 && parts.join("").length >= 3)
    // Longest first, so "Aurixa Systems" is tried before "Aurixa".
    .sort((a, b) => b.length - a.length);
  if (!names.length) return words;
  const out = words.map((word) => ({ ...word }));
  for (let index = 0; index < out.length; index += 1) {
    for (const parts of names) {
      if (index + parts.length > out.length) continue;
      const heard = out.slice(index, index + parts.length);
      const heardKey = heard.map((word) => wordKey(word.text)).join(" ");
      const nameKey = parts.map(wordKey).join(" ");
      if (!heardKey.trim()) continue;
      const distance = editDistance(heardKey, nameKey);
      const exact = distance === 0;
      // One word: within its allowance. Several: within the whole name's, and
      // its first word at least half right, so a name is never found in words
      // that only share its ending.
      const close =
        parts.length === 1
          ? distance <= allowedEdits(nameKey.length) && heardKey.length >= 3
          : distance <= allowedEdits(nameKey.length) &&
            wordSimilarity(heard[0]!.text, parts[0]!) >= 0.5;
      if (!exact && !close) continue;
      heard.forEach((word, offset) => {
        const tail = /[^\p{L}\p{N}]*$/u.exec(word.text)?.[0] ?? "";
        const lead = /^[^\p{L}\p{N}]*/u.exec(word.text)?.[0] ?? "";
        out[index + offset] = { ...word, text: `${lead}${parts[offset]!}${tail}` };
      });
      index += parts.length - 1;
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Laying a script over word timings                                   */
/* ------------------------------------------------------------------ */

/** A heard word taken for a script word is a match from this alike on. */
const MATCH_SIMILARITY = 0.5;

export interface AlignedWord extends TimedWord {
  /** How its time was found: from the word it met, or given between its neighbours. */
  timing: "heard" | "between";
}

/**
 * The script's words, each timed by the heard word it lines up with (see the
 * module comment). Heard words the script doesn't have widen the script word
 * they belong to (a hyphenated word heard as two), or are dropped. Null when
 * there are no timings to lay it on, or the script and the timings have too
 * little in common for one to be the other.
 */
export function alignScript(script: string, heard: TimedWord[]): AlignedWord[] | null {
  const written = scriptWords(script);
  const timed = heard.filter(
    (word) => wordKey(word.text) && Number.isFinite(word.start) && Number.isFinite(word.end),
  );
  if (!written.length || !timed.length) return null;
  const n = written.length;
  const m = timed.length;
  const keys = written.map(wordKey);
  const heardKeys = timed.map((word) => wordKey(word.text));

  // Edit-distance alignment: a script word meets a heard word (free when
  // alike, else a little less than leaving both unmatched), or is left out of
  // one side or the other.
  const GAP = 1;
  const cost = new Float64Array((n + 1) * (m + 1));
  const move = new Uint8Array((n + 1) * (m + 1)); // 1 meet, 2 script only, 3 heard only
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = 1; i <= n; i += 1) {
    cost[at(i, 0)] = i * GAP;
    move[at(i, 0)] = 2;
  }
  for (let j = 1; j <= m; j += 1) {
    cost[at(0, j)] = j * GAP;
    move[at(0, j)] = 3;
  }
  const pairCost = (i: number, j: number) => {
    const a = keys[i - 1]!;
    const b = heardKeys[j - 1]!;
    if (!a) return 3 * GAP; // punctuation alone never takes a heard word's time
    if (a === b) return 0;
    const alike = 1 - editDistance(a, b) / Math.max(a.length, b.length);
    return alike >= MATCH_SIMILARITY ? (1 - alike) * 0.9 : 1.5 * GAP;
  };
  for (let i = 1; i <= n; i += 1)
    for (let j = 1; j <= m; j += 1) {
      const meet = cost[at(i - 1, j - 1)]! + pairCost(i, j);
      const scriptOnly = cost[at(i - 1, j)]! + GAP;
      const heardOnly = cost[at(i, j - 1)]! + GAP;
      if (meet <= scriptOnly && meet <= heardOnly) {
        cost[at(i, j)] = meet;
        move[at(i, j)] = 1;
      } else if (scriptOnly <= heardOnly) {
        cost[at(i, j)] = scriptOnly;
        move[at(i, j)] = 2;
      } else {
        cost[at(i, j)] = heardOnly;
        move[at(i, j)] = 3;
      }
    }

  // Back through the moves: each script word's heard word (or none), and the
  // heard words the script doesn't have, with the script word they follow.
  const met: (number | null)[] = new Array(n).fill(null);
  const strays: { heard: number; after: number }[] = [];
  let matches = 0;
  for (let i = n, j = m; i > 0 || j > 0;) {
    const step = move[at(i, j)];
    if (step === 1) {
      const a = keys[i - 1]!;
      const b = heardKeys[j - 1]!;
      if (
        a &&
        (a === b || 1 - editDistance(a, b) / Math.max(a.length, b.length) >= MATCH_SIMILARITY)
      )
        matches += 1;
      met[i - 1] = j - 1;
      i -= 1;
      j -= 1;
    } else if (step === 2) i -= 1;
    else {
      strays.push({ heard: j - 1, after: i - 1 });
      j -= 1;
    }
  }
  // Too little in common: this isn't the script that was read.
  if (matches < Math.max(1, Math.min(n, m) * 0.35)) return null;

  const words: (AlignedWord | null)[] = written.map((text, index) => {
    const j = met[index];
    if (j === null || j === undefined) return null;
    const word = timed[j]!;
    return { text, start: word.start, end: Math.max(word.start, word.end), timing: "heard" };
  });
  // A heard word the script doesn't have, inside a script word it belongs to
  // ("14-day" heard as "14" "day"), widens that word.
  for (const stray of strays) {
    const word = timed[stray.heard]!;
    const strayKey = heardKeys[stray.heard]!;
    for (const index of [stray.after, stray.after + 1]) {
      const target = words[index];
      if (!target || !keys[index]!.includes(strayKey)) continue;
      target.start = Math.min(target.start, word.start);
      target.end = Math.max(target.end, word.end);
      break;
    }
  }

  // Words the transcription missed: shared out between their timed neighbours, by length.
  const first = timed[0]!.start;
  const last = Math.max(...timed.map((word) => word.end));
  for (let index = 0; index < n;) {
    if (words[index]) {
      index += 1;
      continue;
    }
    let stop = index;
    while (stop < n && !words[stop]) stop += 1;
    const from = index > 0 ? words[index - 1]!.end : first;
    const to = stop < n ? words[stop]!.start : last;
    const lengths = written.slice(index, stop).map((text) => text.length + 1);
    const total = lengths.reduce((sum, value) => sum + value, 0);
    const span = Math.max(0, to - from);
    let cursor = from;
    for (let k = index; k < stop; k += 1) {
      const share = (span * lengths[k - index]!) / total;
      words[k] = { text: written[k]!, start: cursor, end: cursor + share, timing: "between" };
      cursor += share;
    }
    index = stop;
  }
  // Times never run backwards, whatever the transcription said.
  const result = words as AlignedWord[];
  for (let index = 1; index < result.length; index += 1) {
    const before = result[index - 1]!;
    const word = result[index]!;
    if (word.start < before.start) word.start = before.start;
    if (word.end < word.start) word.end = word.start;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Phrase cards                                                        */
/* ------------------------------------------------------------------ */

export interface PhraseOptions {
  /** The most a card holds, in characters (two short lines in a tall video). */
  maxChars?: number;
  /** A pause this long between words always starts a new card. */
  pauseSeconds?: number;
}

const SENTENCE_END = /[.!?…]["”’)\]]*$/;
const CLAUSE_END = /([,;:]|\s[—–-])["”’)\]]*$/;

/** Words grouped into phrases (see the module comment). */
export function phraseCards(
  words: TimedWord[],
  options: PhraseOptions = {},
): { text: string; start: number; end: number; words: number }[] {
  const maxChars = options.maxChars ?? 40;
  const pause = options.pauseSeconds ?? 0.45;
  const timed = words
    .map((word) => ({ text: word.text.trim(), start: word.start, end: word.end }))
    .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));

  // First the sentences (a long pause ends one too). A sentence that fits is
  // one card; a longer one is packed clause by clause, and a clause too long
  // for a card is split as evenly as it can be.
  type Words = typeof timed;
  const textOf = (items: Words) => items.map((word) => word.text).join(" ");
  const sentences: Words[] = [];
  let sentence: Words = [];
  for (const word of timed) {
    const previous = sentence.at(-1);
    if (previous && word.start - previous.end > pause) {
      sentences.push(sentence);
      sentence = [];
    }
    sentence.push(word);
    if (SENTENCE_END.test(word.text)) {
      sentences.push(sentence);
      sentence = [];
    }
  }
  if (sentence.length) sentences.push(sentence);

  /** Words split into cards of about even length, none over the most a card holds. */
  const evenly = (items: Words): Words[] => {
    const parts = Math.ceil(textOf(items).length / maxChars);
    const target = textOf(items).length / parts;
    const out: Words[] = [];
    let card: Words = [];
    for (const [index, word] of items.entries()) {
      if (card.length && textOf([...card, word]).length > maxChars) {
        out.push(card);
        card = [];
      }
      card.push(word);
      // ...never leaving a lone word to end it.
      if (items.length - index - 1 > 1 && textOf(card).length >= target) {
        out.push(card);
        card = [];
      }
    }
    if (card.length) out.push(card);
    return out;
  };

  const cards: Words[] = [];
  for (const items of sentences) {
    if (textOf(items).length <= maxChars) {
      cards.push(items);
      continue;
    }
    const clauses: Words[] = [];
    let clause: Words = [];
    for (const word of items) {
      clause.push(word);
      if (CLAUSE_END.test(word.text)) {
        clauses.push(clause);
        clause = [];
      }
    }
    if (clause.length) clauses.push(clause);
    let card: Words = [];
    for (const part of clauses) {
      if (card.length && textOf([...card, ...part]).length <= maxChars) {
        card.push(...part);
        continue;
      }
      if (card.length) cards.push(card);
      card = [];
      if (textOf(part).length <= maxChars) card = [...part];
      else cards.push(...evenly(part));
    }
    if (card.length) cards.push(card);
  }

  // No word on a card of its own: it joins the card it belongs with (the end
  // of its sentence, else the start of the next), running a little long if it
  // must, unless it is long enough to read alone.
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]!;
    if (card.length !== 1 || card[0]!.text.length >= 14 || cards.length === 1) continue;
    const before = cards[index - 1];
    const after = cards[index + 1];
    const endsSentence = (items: typeof timed | undefined) =>
      !!items && SENTENCE_END.test(items.at(-1)!.text);
    const fitsBefore =
      before &&
      !endsSentence(before) &&
      textOf([...before, ...card]).length <= maxChars + 12 &&
      card[0]!.start - before.at(-1)!.end <= pause * 2;
    const fitsAfter =
      after &&
      !endsSentence(card) &&
      textOf([...card, ...after]).length <= maxChars + 12 &&
      after[0]!.start - card[0]!.end <= pause * 2;
    if (fitsBefore) {
      before.push(...card);
      cards.splice(index, 1);
      index -= 1;
    } else if (fitsAfter) {
      after.unshift(...card);
      cards.splice(index, 1);
      index -= 1;
    } else if (
      before &&
      !endsSentence(before) &&
      textOf([...before, ...card]).length <= maxChars + 20
    ) {
      before.push(...card);
      cards.splice(index, 1);
      index -= 1;
    }
  }

  return cards.map((items) => ({
    text: textOf(items),
    start: items[0]!.start,
    end: Math.max(items[0]!.start, items.at(-1)!.end),
    words: items.length,
  }));
}

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */

export interface PhraseCaptionOptions extends PhraseOptions {
  /** The script the voiceover was read from; its words and punctuation are shown. */
  script?: string | null;
  /** The brand's names, spelt as they should be (put right where the script doesn't). */
  terms?: string[];
  /** Cards stop here (seconds on the edit), e.g. where the closing titles start. */
  until?: number;
  /** Cards before this (seconds on the edit) are left out. */
  from?: number;
}

/**
 * Phrase captions for a voiceover's words, placed `offset` seconds into the
 * edit (see the module comment). With a script, the script's words are shown;
 * one that doesn't fit the timings (another script) is set aside and the
 * heard words used, spelt right. Each card keeps its words' own times (from
 * its start), for captions set word by word, and the phrase it leans on
 * (see ./brand-captions `emphasisFor`).
 */
export function phraseCaptions(
  heard: TimedWord[],
  offset: number,
  options: PhraseCaptionOptions = {},
): { segments: CaptionSegment[]; source: "script" | "words" } {
  const until = Math.min(options.until ?? LIMITS.totalSeconds, LIMITS.totalSeconds);
  const from = options.from ?? 0;
  const spelt = correctSpellings(heard, options.terms ?? []);
  const aligned = options.script?.trim() ? alignScript(options.script, spelt) : null;
  const words = aligned ?? spelt;
  const cards = phraseCards(words, options);
  // The words the cards are made of, in order (as phraseCards takes them).
  const usable = words
    .map((word) => ({ text: word.text.trim(), start: word.start, end: word.end }))
    .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
  let taken = 0;

  const segments: CaptionSegment[] = [];
  cards.forEach((card, index) => {
    const own = usable.slice(taken, taken + card.words);
    taken += card.words;
    const start = card.start + offset;
    if (start >= until) return;
    const nextStart = cards[index + 1] ? cards[index + 1]!.start + offset : Infinity;
    // Linger a moment after the last word, and long enough to read.
    let end = Math.max(card.end + offset + 0.2, start + 0.6);
    if (nextStart - end < 0.3) end = nextStart;
    end = Math.min(end, nextStart, until);
    if (end <= from) return;
    const shown = Math.max(start, from);
    if (end - shown < 0.05) return;
    const segmentStart = Number(Math.max(0, shown).toFixed(3));
    const since = (at: number) => Number(Math.max(0, at + offset - segmentStart).toFixed(3));
    const emphasis = emphasisFor(
      own.map((word) => word.text),
      options.terms ?? [],
    );
    segments.push({
      start: segmentStart,
      end: Number(end.toFixed(3)),
      text: card.text.slice(0, LIMITS.captionChars),
      words: own.slice(0, LIMITS.captionWords).map((word) => ({
        text: word.text.slice(0, 80),
        start: since(word.start),
        end: since(word.end),
      })),
      ...(emphasis ? { emphasis } : {}),
    });
  });
  return { segments: segments.slice(0, LIMITS.captions), source: aligned ? "script" : "words" };
}
