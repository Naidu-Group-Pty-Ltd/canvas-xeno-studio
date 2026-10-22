/**
 * A client's notes to a plan: a pasted list (numbered or bulleted) split
 * into notes, and each note matched to the shots and times it concerns,
 * from the project's storyboard and the version's edit. Reel 1's fourteen
 * notes on its second cut became a plan by hand; here each note says which
 * shots it touches and why, a person corrects what is wrong, and the note
 * is tracked to done.
 *
 * The matching is deterministic and shows its evidence:
 *   an explicit time ("0:42", "1:05.4", "0:40–0:45", "at 42 s"): the shot,
 *   or the edit's clip, it falls in;
 *   a shot named by its id ("04.1", "shot 4.1") or its place in order
 *   ("shot 12"), a block or scene by its number ("block 14");
 *   words quoted from what is said or shown ("Your decision."): where they
 *   are said or shown;
 *   the opening or the close: the first or the last shot;
 *   words the shot is known by (its title, its on-screen text, what it is
 *   made from), weighed by how few shots share them.
 * A note about the whole film ("room to breathe") matches nothing, and a
 * person adds what it concerns, if anything.
 *
 * Pure, shared by the Reviews section and tests.
 */
import { wordTokens } from "../storyboard/timing";
import type { RenderSnapshot, SnapshotShot, TimedText } from "./snapshot";
import type { NoteTarget } from "./store";

export interface SplitNote {
  /** The giver's own number where the list had one; else its place in the list. */
  number: number;
  body: string;
}

export interface SplitNotes {
  notes: SplitNote[];
  /** Words before the first numbered or bulleted line ("My notes on the second cut:"). */
  preamble: string | null;
}

// "1." "1)" "(1)" "1:" "#1" "Note 1:" "1 -": a numbered line.
const NUMBERED =
  /^\s*(?:\(?(\d{1,3})[.):\]]|#(\d{1,3})[.):]?|(?:note|item|point)\s+(\d{1,3})\s*[.):\-–—]?|(\d{1,3})\s+[-–—])\s+(.*)$/i;
// "-" "*" "•" "–" "·": a bulleted line.
const BULLETED = /^\s*[-*•–—·▪◦‣]\s+(.*)$/;

/**
 * A note list split into notes. A numbered or bulleted line starts a note
 * (keeping its number); the lines after it, until the next, carry it on. A
 * list with neither is split into paragraphs, or into lines when it is one
 * paragraph.
 */
export function splitNotes(text: string): SplitNotes {
  const normal = text.replace(/\r\n?/g, "\n");
  const lines = normal.split("\n");
  const marked = lines.some((line) => NUMBERED.test(line) || BULLETED.test(line));
  if (!marked) {
    const paragraphs = normal
      .split(/\n\s*\n/)
      .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean);
    const pieces =
      paragraphs.length > 1 ? paragraphs : lines.map((line) => line.trim()).filter(Boolean);
    return { notes: pieces.map((body, index) => ({ number: index + 1, body })), preamble: null };
  }
  const notes: SplitNote[] = [];
  const preamble: string[] = [];
  let current: { number: number; body: string; gap: boolean } | null = null;
  const close = () => {
    if (current?.body.trim()) notes.push({ number: current.number, body: current.body.trim() });
    current = null;
  };
  for (const line of lines) {
    const numbered = NUMBERED.exec(line);
    const bulleted = numbered ? null : BULLETED.exec(line);
    if (numbered || bulleted) {
      close();
      const given = numbered
        ? Number(numbered[1] ?? numbered[2] ?? numbered[3] ?? numbered[4])
        : null;
      current = {
        number: given ?? (notes.at(-1)?.number ?? 0) + 1,
        body: (numbered ? numbered[5]! : bulleted![1]!).trim(),
        gap: false,
      };
      continue;
    }
    const words = line.trim();
    if (!current) {
      if (words) preamble.push(words);
      continue;
    }
    const note: { number: number; body: string; gap: boolean } = current;
    if (!words) {
      note.gap = true;
      continue;
    }
    // A line carries its note on; after a blank line, as a new paragraph of it.
    note.body += note.gap ? `\n${words}` : ` ${words}`;
    note.gap = false;
  }
  close();
  return { notes, preamble: preamble.join(" ") || null };
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

export interface NoteContext {
  /** The storyboard's shots, each with its time. */
  shots: SnapshotShot[];
  /** The version's edit, when it is a render: its clips, captions and titles. */
  render?: RenderSnapshot | null;
}

/** Words too common to say which shot a note is about. */
const COMMON = new Set(
  (
    "an the and or nor of to in on at for with by from as is are was were be been being it its " +
    "this that these those we you your our they them their he she his her him me my mine so but " +
    "not no do does did can could should would will shall may might must just more less very too " +
    "also please make made making give gave show shows need needs want wants use using get got have " +
    "has had there here what which who whom how when where why all any some each every one ones " +
    "out up down over under into onto than then now like bit little much many lot lots better best " +
    "good great nice really still again maybe way thing things time times feel feels look looks " +
    "bigger smaller longer shorter quicker slower part parts shot shots scene scenes block blocks " +
    "video film cut version change changes keep add remove take put let " +
    // How a note says what is wrong, rather than what it is about.
    "move moves moving moved go goes going come comes coming fast faster slow slower early " +
    "earlier late later quick quickly slowly hold holds held drag drags rush rushed seem seems " +
    "happen happens appear appears start starts stop stops sit sits try fix fixed wrong right"
  ).split(" "),
);

/** How a matched word is shown in a note's evidence. */
const SHOWN: Record<string, string> = { cta: "call to action" };
const shown = (word: string) =>
  SHOWN[word] ?? word.replace(/^([a-e])plus$/, (_, grade: string) => `${grade.toUpperCase()}+`);

/** A word as matched: its stem, so "pins" meets "pin" and "charts" meets "chart". */
function stem(word: string): string {
  if (/^[a-e]plus$/.test(word)) return word;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(?:ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * The words a text is matched on: "A+" kept as "aplus", "call to action" as
 * "cta" (as graphics are named), each pair of neighbours also written as
 * one ("floor plan" meets "floorplan"), and the common words, single letters
 * and plain numbers left out.
 */
export function matchWords(text: string): string[] {
  const prepared = text
    .replace(/\b([a-e])\+/gi, "$1plus ")
    .replace(/\bcalls? to action\b/gi, "cta");
  const kept = wordTokens(prepared)
    .filter((token) => token.length > 1)
    .map((token) => (COMMON.has(token) || /^\d+$/.test(token) ? null : stem(token)));
  const out: string[] = [];
  kept.forEach((word, index) => {
    if (!word) return;
    out.push(word);
    const next = kept[index + 1];
    if (next && !/\d/.test(word + next)) out.push(`${word}${next}`);
  });
  return out;
}

/** Seconds from "1:05.4", "00:28.933" or "1:02:03". */
function clockSeconds(text: string): number | null {
  const numbers = text.split(":").map(Number);
  if (numbers.length < 2 || numbers.length > 3 || numbers.some((value) => !Number.isFinite(value)))
    return null;
  const [a, b, c] = numbers as [number, number, number | undefined];
  if (c !== undefined) return a * 3600 + b * 60 + c;
  return b >= 60 ? null : a * 60 + b;
}

const CLOCK = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?`;
const RANGE = new RegExp(
  String.raw`(?:between\s+)?(${CLOCK})\s*(?:-|–|—|to|and|until)\s*(${CLOCK})`,
  "gi",
);
// A time of day ("10:00 AM", on a page in the film) isn't a moment in it.
const MOMENT = new RegExp(String.raw`(?<![\d:.])(${CLOCK})(?![\d:]|\s*[ap]\.?m\b)`, "gi");
// "at 42 s" is a moment; "by 2.6 s" or "for 0.8 s" is an amount.
const SECONDS =
  /\b(?:at|around|about|from|near)\s+(\d{1,4}(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/gi;

interface Found {
  start: number;
  end: number;
  text: string;
  /** Where it is in the note: what is used as evidence isn't counted again as words. */
  from: number;
  to: number;
}

/** The times a note names: single moments and ranges, in seconds, with the words they came from. */
export function noteTimes(text: string): Found[] {
  const found: Found[] = [];
  const free = (index: number) => !found.some((entry) => index >= entry.from && index < entry.to);
  for (const match of text.matchAll(RANGE)) {
    const start = clockSeconds(match[1]!);
    const end = clockSeconds(match[2]!);
    if (start === null || end === null || end < start) continue;
    found.push({
      start,
      end,
      text: `${match[1]}–${match[2]}`,
      from: match.index,
      to: match.index + match[0].length,
    });
  }
  for (const match of text.matchAll(MOMENT)) {
    // "9:16" alone is the frame's shape; "at 9:16" is a time.
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    if (match[1] === "9:16" && !/\b(?:at|around|about|from|between|to|until|by)\s*$/i.test(before))
      continue;
    const at = clockSeconds(match[1]!);
    if (at !== null && free(match.index))
      found.push({
        start: at,
        end: at,
        text: match[1]!,
        from: match.index,
        to: match.index + match[0].length,
      });
  }
  for (const match of text.matchAll(SECONDS)) {
    if (!free(match.index)) continue;
    const at = Number(match[1]);
    found.push({
      start: at,
      end: at,
      text: match[0].trim(),
      from: match.index,
      to: match.index + match[0].length,
    });
  }
  return found.sort((a, b) => a.from - b.from);
}

/** "04.1" and "4.1" are the same shot. */
function sameLabel(a: string, b: string): boolean {
  const parts = (value: string) => value.split(/[.-]/).map((part) => String(Number(part)));
  const left = parts(a);
  const right = parts(b);
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

const minutes = (seconds: number) => {
  const whole = Math.floor(seconds / 60);
  return `${whole}:${(seconds - whole * 60).toFixed(1).padStart(4, "0")}`;
};

/** Weights of each kind of evidence: what a note names outright counts more than words in common. */
const WEIGHT = { time: 3, shot: 3, block: 2, quote: 3, place: 2.5, clip: 2, words: 2.5 } as const;

/** A word must be in no more than this share of the shots to say which shot a note is about. */
const RARE = 0.25;

/** Of the shots a note's words point at, those this close to the best are kept. */
const CLOSE_TO_BEST = 0.6;

/**
 * The shots and times a note concerns, best first, each with its evidence
 * (at most six).
 */
export function mapNote(body: string, context: NoteContext): NoteTarget[] {
  const shots = context.shots;
  const clips = context.render?.clips ?? [];
  const found = new Map<string, { target: NoteTarget; score: number }>();
  const used: [number, number][] = [];
  const add = (
    key: string,
    target: Omit<NoteTarget, "evidence" | "by">,
    evidence: NoteTarget["evidence"][number],
    score: number,
  ) => {
    const entry = found.get(key);
    if (!entry) {
      found.set(key, { target: { ...target, evidence: [evidence], by: "auto" }, score });
      return;
    }
    if (
      !entry.target.evidence.some(
        (item) => item.kind === evidence.kind && item.text === evidence.text,
      )
    )
      entry.target.evidence.push(evidence);
    entry.score += score;
  };
  const ofShot = (shot: SnapshotShot) => ({
    shotId: shot.id,
    label: shot.label,
    name: shot.name,
    start: shot.start,
    end: shot.end,
  });
  const ofClip = (clip: { label: string; start: number; end: number }) => ({
    shotId: null,
    label: clip.label,
    name: null,
    start: clip.start,
    end: clip.end,
  });
  // A storyboard's compiled clip is labelled with its shot: "1.2 01.2 · The client asks".
  const shotOfClip = (label: string) =>
    shots.find(
      (shot) =>
        new RegExp(`(^|[^\\d.])${shot.label.replace(/\./g, "\\.")}([^\\d]|$)`).test(label) ||
        label.includes(shot.name),
    ) ?? null;
  const atTime = (key: string, start: number, end: number, label: string) => ({
    key,
    target: { shotId: null, label, name: null, start, end },
  });

  // Explicit times: on the edit's clock when the version is a render, else the storyboard's.
  for (const time of noteTimes(body)) {
    used.push([time.from, time.to]);
    const overlaps = (from: number, to: number) =>
      time.end > time.start
        ? time.start < to && time.end > from
        : time.start >= from && time.start < to;
    if (clips.length) {
      for (const clip of clips.filter((entry) => overlaps(entry.start, entry.end))) {
        const shot = shotOfClip(clip.label);
        const evidence = { kind: "time", text: `${time.text} is in “${clip.label}”` };
        if (shot) add(shot.id, ofShot(shot), evidence, WEIGHT.time);
        else add(`clip:${clip.label}`, ofClip(clip), evidence, WEIGHT.time);
      }
      continue;
    }
    const inside = shots.filter((shot) => overlaps(shot.start, shot.end));
    for (const shot of inside)
      add(
        shot.id,
        ofShot(shot),
        {
          kind: "time",
          text: `${time.text} ${time.end > time.start ? "overlaps" : "is in"} it (${minutes(shot.start)} to ${minutes(shot.end)})`,
        },
        WEIGHT.time,
      );
    if (!inside.length) {
      const { key, target } = atTime(`time:${time.start}`, time.start, time.end, time.text);
      add(key, target, { kind: "time", text: `${time.text}, in no shot` }, WEIGHT.time);
    }
  }

  // Shots by id ("04.1"), by place ("shot 12"), and blocks or scenes by number.
  const named = new Set<string>();
  for (const match of body.matchAll(
    /(?:\bshot\s+)?(?<![\d.:])(\d{1,2}\.\d{1,2})(?!\d|\s*(?:s|sec|secs|seconds|%|x)\b)/gi,
  )) {
    const hits = shots.filter((shot) => sameLabel(shot.label, match[1]!));
    if (hits.length) used.push([match.index, match.index + match[0].length]);
    for (const shot of hits) {
      named.add(shot.id);
      add(shot.id, ofShot(shot), { kind: "shot", text: match[1]! }, WEIGHT.shot);
    }
  }
  for (const match of body.matchAll(/\bshot\s+(?:number\s+)?(\d{1,3})\b(?!\.\d)/gi)) {
    const shot = shots[Number(match[1]) - 1];
    used.push([match.index, match.index + match[0].length]);
    if (shot && !named.has(shot.id))
      add(shot.id, ofShot(shot), { kind: "shot", text: match[0] }, WEIGHT.shot);
  }
  for (const match of body.matchAll(/\b(?:block|scene)\s+(\d{1,3})\b(?!\.\d)/gi)) {
    used.push([match.index, match.index + match[0].length]);
    const number = String(Number(match[1]));
    for (const shot of shots.filter(
      (entry) => String(Number(entry.label.split(".")[0])) === number,
    ))
      add(shot.id, ofShot(shot), { kind: "block", text: match[0] }, WEIGHT.block);
  }

  // Words quoted from what is said or shown.
  for (const match of body.matchAll(/[“"‘']([^“”"‘’']{3,200})[”"’']/g)) {
    const quote = match[1]!.trim();
    const words = wordTokens(quote).join(" ");
    if (!words) continue;
    used.push([match.index, match.index + match[0].length]);
    const says = (line: string) => ` ${wordTokens(line).join(" ")} `.includes(` ${words} `);
    const evidence = { kind: "quote", text: `“${quote}”` };
    for (const shot of shots.filter((entry) =>
      [entry.title ?? "", ...entry.onScreen, ...entry.lines].some(says),
    ))
      add(shot.id, ofShot(shot), evidence, WEIGHT.quote);
    const lines: TimedText[] = [
      ...(context.render?.captions ?? []),
      ...(context.render?.titles ?? []),
    ];
    for (const line of lines.filter((entry) => says(entry.text))) {
      const clip = clips.find((entry) => line.start >= entry.start && line.start < entry.end);
      const shot = clip ? shotOfClip(clip.label) : null;
      const said = { kind: "quote", text: `“${quote}” at ${minutes(line.start)}` };
      if (shot) add(shot.id, ofShot(shot), said, WEIGHT.quote);
      else if (clip) add(`clip:${clip.label}`, ofClip(clip), said, WEIGHT.quote);
      else {
        const { key, target } = atTime(
          `time:${line.start}`,
          line.start,
          line.end,
          minutes(line.start),
        );
        add(key, target, said, WEIGHT.quote);
      }
    }
  }

  // The opening, or the close.
  if (shots.length) {
    const places: [RegExp, SnapshotShot][] = [
      [
        /\b(?:the\s+)?(opening(?:\s+(?:shot|frames?|seconds))?|beginning|first shot|intro)\b/gi,
        shots[0]!,
      ],
      [
        /\b(?:the\s+)?(closing(?:\s+(?:card|shot|frames?|titles?))?|ending|end card|last shot|final (?:card|shot|frame)|outro)\b/gi,
        shots.at(-1)!,
      ],
    ];
    for (const [pattern, shot] of places)
      for (const match of body.matchAll(pattern)) {
        used.push([match.index, match.index + match[0].length]);
        add(shot.id, ofShot(shot), { kind: "place", text: match[1]!.toLowerCase() }, WEIGHT.place);
      }
  }

  // Words the shots are known by, in what the note says besides the above.
  const rest = [...body]
    .map((character, index) =>
      used.some(([from, to]) => index >= from && index < to) ? " " : character,
    )
    .join("");
  const wanted = new Set(matchWords(rest));
  if (wanted.size && shots.length) {
    const known = shots.map((shot) => {
      const counts = new Map<string, number>();
      const count = (text: string, weight: number) => {
        for (const word of new Set(matchWords(text)))
          counts.set(word, (counts.get(word) ?? 0) + weight);
      };
      // The title says most about a shot; its lines only count when quoted.
      count(shot.title ?? shot.name.replace(`${shot.label} · `, ""), 2);
      for (const line of [...shot.onScreen, ...shot.sources]) count(line, 1);
      return counts;
    });
    const share = (word: string) =>
      known.filter((counts) => counts.has(word)).length / shots.length;
    const scored = known.map((counts) => {
      const matched = [...wanted].filter((word) => counts.has(word) && share(word) <= RARE);
      return {
        matched,
        score: matched.reduce(
          (sum, word) => sum + Math.log(1 / share(word)) * (1 + Math.log(counts.get(word)!)),
          0,
        ),
      };
    });
    const best = Math.max(0, ...scored.map((entry) => entry.score));
    scored.forEach((entry, index) => {
      if (!entry.matched.length || entry.score < best * CLOSE_TO_BEST) return;
      const shot = shots[index]!;
      // "floor, plan", not "floor, plan, floorplan".
      const plain = entry.matched.filter(
        (word) =>
          !entry.matched.some(
            (other) => other !== word && word.length > other.length && word.startsWith(other),
          ),
      );
      add(
        shot.id,
        ofShot(shot),
        { kind: "words", text: plain.map(shown).join(", ") },
        Math.min(WEIGHT.words, entry.score / 2),
      );
    });
  }

  // An edit with no storyboard: its clips, by the words of their labels.
  if (!shots.length && clips.length && wanted.size)
    for (const clip of clips) {
      const words = new Set(matchWords(clip.label));
      const matched = [...wanted].filter((word) => words.has(word));
      if (matched.length)
        add(
          `clip:${clip.label}`,
          ofClip(clip),
          { kind: "clip", text: matched.map(shown).join(", ") },
          WEIGHT.clip,
        );
    }

  return [...found.values()]
    .sort((a, b) => b.score - a.score || (a.target.start ?? 0) - (b.target.start ?? 0))
    .slice(0, 6)
    .map((entry) => entry.target);
}

/** Every note of a list, each with what it concerns. */
export function mapNotes(
  text: string,
  context: NoteContext,
): (SplitNote & { targets: NoteTarget[] })[] {
  return splitNotes(text).notes.map((note) => ({ ...note, targets: mapNote(note.body, context) }));
}

/** A person's own target for a note: a shot they chose. */
export function chosenShot(shot: SnapshotShot): NoteTarget {
  return {
    shotId: shot.id,
    label: shot.label,
    name: shot.name,
    start: shot.start,
    end: shot.end,
    evidence: [{ kind: "person", text: "chosen by hand" }],
    by: "person",
  };
}
