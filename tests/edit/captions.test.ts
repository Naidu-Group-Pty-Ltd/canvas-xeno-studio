import { describe, expect, test } from "bun:test";
import {
  alignScript,
  correctSpellings,
  phraseCaptions,
  phraseCards,
  scriptWords,
  type TimedWord,
} from "../../src/lib/edit/captions";

/** Words as transcription gives them: no punctuation, names as it guessed them. */
function heard(text: string, start = 0, wordSeconds = 0.3, gapSeconds = 0.05): TimedWord[] {
  let at = start;
  return text.split(" ").map((word) => {
    const item = { text: word, start: at, end: at + wordSeconds };
    at += wordSeconds + gapSeconds;
    return item;
  });
}

describe("the brand's spellings", () => {
  test("put right a name heard a letter or two off, keeping punctuation", () => {
    const words = heard("welcome to Arixa where Erixa, helps");
    const fixed = correctSpellings(words, ["Aurixa"]).map((word) => word.text);
    expect(fixed).toEqual(["welcome", "to", "Aurixa", "where", "Aurixa,", "helps"]);
  });

  test("never turn ordinary words into part of a longer name", () => {
    const words = heard("our system works with arixa systems today");
    const fixed = correctSpellings(words, ["Aurixa Systems"]).map((word) => word.text);
    expect(fixed).toEqual(["our", "system", "works", "with", "Aurixa", "Systems", "today"]);
  });

  test("leave short words and unrelated words alone", () => {
    const words = heard("a matrix of the data");
    expect(correctSpellings(words, ["Aurixa", "Xeno"]).map((word) => word.text)).toEqual([
      "a",
      "matrix",
      "of",
      "the",
      "data",
    ]);
  });
});

describe("laying a script over word timings", () => {
  test("gives every script word the time of the word it met", () => {
    const words = heard("welcome to arixa systems your home for property analysis");
    const aligned = alignScript(
      "Welcome to Aurixa Systems: your home for property analysis.",
      words,
    )!;
    expect(aligned.map((word) => word.text)).toEqual(
      scriptWords("Welcome to Aurixa Systems: your home for property analysis."),
    );
    aligned.forEach((word, index) => {
      expect(word.timing).toBe("heard");
      expect(word.start).toBeCloseTo(words[index]!.start, 9);
      expect(word.end).toBeCloseTo(words[index]!.end, 9);
    });
  });

  test("shares out time for words the transcription missed, and drops words the script hasn't", () => {
    const words = heard("so what happens um then");
    const aligned = alignScript("So, what really happens then?", words)!;
    expect(aligned.map((word) => word.text)).toEqual(["So,", "what", "really", "happens", "then?"]);
    const really = aligned[2]!;
    expect(really.timing).toBe("between");
    expect(really.start).toBeCloseTo(words[1]!.end, 9);
    expect(really.end).toBeCloseTo(words[2]!.start, 9);
    // "um" is left out; "then?" keeps its own time.
    expect(aligned[4]!.start).toBeCloseTo(words[4]!.start, 9);
  });

  test("widens a hyphenated word heard as two", () => {
    const words = heard("start your 14 day free trial");
    const aligned = alignScript("Start your 14-day free trial.", words)!;
    const day = aligned.find((word) => word.text === "14-day")!;
    expect(day.start).toBeCloseTo(words[2]!.start, 9);
    expect(day.end).toBeCloseTo(words[3]!.end, 9);
  });

  test("refuses a script that isn't what was read", () => {
    expect(
      alignScript("Completely different words entirely here.", heard("hello there friend")),
    ).toBe(null);
    expect(alignScript("Anything.", [])).toBe(null);
  });

  test("never runs time backwards", () => {
    const words = heard("one two three four five six");
    const aligned = alignScript("One, two, three. Four five six.", words)!;
    for (let index = 1; index < aligned.length; index += 1)
      expect(aligned[index]!.start).toBeGreaterThanOrEqual(aligned[index - 1]!.start);
  });
});

describe("phrase cards", () => {
  test("break at sentences and clauses, and stay short enough to read at a glance", () => {
    const script =
      "Picture this. Your listings, your appraisals, your reports, all living in different glass cases that never talk to each other. What happens then?";
    const aligned = alignScript(script, heard(script.replace(/[^\w\s-]/g, "").toLowerCase()))!;
    const cards = phraseCards(aligned);
    for (const card of cards) expect(card.text.length).toBeLessThanOrEqual(52);
    expect(cards[0]!.text).toBe("Picture this.");
    expect(cards.at(-1)!.text).toBe("What happens then?");
    expect(cards.some((card) => card.words === 1)).toBe(false);
  });

  test("never leave a word on its own card", () => {
    const words = [
      ...heard("all the data in one place for", 0),
      ...heard("analysis", 3, 0.5),
      ...heard("and opportunities everywhere", 3.6),
    ];
    const cards = phraseCards(words, { maxChars: 32 });
    expect(cards.every((card) => card.words > 1)).toBe(true);
  });

  test("start a new card after a long pause", () => {
    const words = [...heard("first part here", 0), ...heard("second part here", 3)];
    expect(phraseCards(words).map((card) => card.text)).toEqual([
      "first part here",
      "second part here",
    ]);
  });
});

describe("phrase captions", () => {
  const script = "Welcome to Aurixa Systems. Fourteen days, your decision.";
  const words = heard("welcome to arixa systems 14 days your decision", 1);

  test("show the script's words where they were said, placed on the edit", () => {
    const { segments, source } = phraseCaptions(words, 2, { script });
    expect(source).toBe("script");
    expect(segments.map((segment) => segment.text)).toEqual([
      "Welcome to Aurixa Systems.",
      "Fourteen days, your decision.",
    ]);
    expect(segments[0]!.start).toBeCloseTo(words[0]!.start + 2, 3);
    // Each card stays until the next replaces it across a short gap.
    expect(segments[0]!.end).toBeLessThanOrEqual(segments[1]!.start);
  });

  test("fall back to the heard words, spelt right, without a script", () => {
    const { segments, source } = phraseCaptions(words, 0, { terms: ["Aurixa"] });
    expect(source).toBe("words");
    expect(segments.map((segment) => segment.text).join(" ")).toContain("Aurixa");
  });

  test("stop where the closing titles start", () => {
    const { segments } = phraseCaptions(words, 0, { script, until: 2.2 });
    expect(segments.every((segment) => segment.end <= 2.2)).toBe(true);
    expect(segments).toHaveLength(1);
  });
});
