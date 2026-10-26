import { describe, expect, test } from "bun:test";
import { spellTranscript, termsPrompt } from "../../src/lib/voice/transcript";

const words = (...said: [string, number][]) =>
  said.map(([text, start]) => ({ text, start, end: start + 0.3 }));

describe("a transcript in the brand's spellings", () => {
  test("a name heard as the nearest word is put right in the words and the text, and said", () => {
    // As One's reference, as one of its two recognisers heard it.
    const heard = words(["We", 0], ["are", 0.2], ["Arixa", 0.4], ["Systems.", 0.8], ["Arixa", 1.4]);
    const spelt = spellTranscript(heard, "We are Arixa Systems. Arixa", [
      "Aurixa Systems",
      "Aurixa",
    ]);
    expect(spelt.words.map((word) => word.text)).toEqual([
      "We",
      "are",
      "Aurixa",
      "Systems.",
      "Aurixa",
    ]);
    expect(spelt.text).toBe("We are Aurixa Systems. Aurixa");
    expect(spelt.corrections).toEqual([
      { heard: "Arixa", written: "Aurixa", at: 0.4 },
      { heard: "Arixa", written: "Aurixa", at: 1.4 },
    ]);
    // The timings stay as heard.
    expect(spelt.words.map((word) => word.start)).toEqual(heard.map((word) => word.start));
  });

  test("words heard right, and words that only look like a name, stay as heard", () => {
    const heard = words(["Aurixa", 0], ["is", 0.4], ["a", 0.6], ["system", 0.7]);
    const spelt = spellTranscript(heard, "Aurixa is a system", ["Aurixa"]);
    expect(spelt.text).toBe("Aurixa is a system");
    expect(spelt.corrections).toEqual([]);
    // No names at all: nothing changes.
    expect(spellTranscript(heard, "Aurixa is a system", []).words).toEqual(heard);
  });

  test("the text is changed only where a word was put right", () => {
    // Each word in its own place: two names side by side are two corrections.
    const both = spellTranscript(words(["Arixa", 0], ["Arixas", 0.5]), "Arixa, Arixas", ["Aurixa"]);
    expect(both.corrections.map((correction) => correction.heard)).toEqual(["Arixa", "Arixas"]);
    expect(both.text).toBe("Aurixa, Aurixa");
    // Never inside a longer word.
    const one = spellTranscript(words(["Arixa", 0]), "Arixa and Arixanian", ["Aurixa"]);
    expect(one.text).toBe("Aurixa and Arixanian");
    // The whole name only: a lone "Arixa" isn't it, in the words or the text.
    const name = spellTranscript(
      words(["Arixa", 0], ["Systems", 0.4], ["and", 1], ["Arixa", 1.3]),
      "Arixa Systems and Arixa",
      ["Aurixa Systems"],
    );
    expect(name.words.map((word) => word.text)).toEqual(["Aurixa", "Systems", "and", "Arixa"]);
    expect(name.text).toBe("Aurixa Systems and Arixa");
    // A word the text writes another way ("3") is passed over, and the rest still found.
    const figures = spellTranscript(
      words(["We", 0], ["are", 0.2], ["three", 0.4], ["at", 0.7], ["Arixa", 0.9]),
      "We are 3 at Arixa.",
      ["Aurixa"],
    );
    expect(figures.text).toBe("We are 3 at Aurixa.");
    // A recogniser's spelling too far from the name is left for its prompt to prevent.
    expect(spellTranscript(words(["Erixus", 0]), "Erixus", ["Aurixa"]).corrections).toEqual([]);
  });

  test("the prompt names each term once, within the recogniser's 800 characters", () => {
    expect(termsPrompt(["Aurixa", " Aurixa ", "", "Xeno Studio"])).toBe("Aurixa, Xeno Studio.");
    expect(termsPrompt([])).toBe("");
    const many = Array.from({ length: 200 }, (_, index) => `Name${index}`);
    const prompt = termsPrompt(many);
    expect(prompt.length).toBeLessThanOrEqual(801);
    expect(prompt.endsWith(".")).toBe(true);
    expect(prompt.startsWith("Name0, Name1,")).toBe(true);
  });
});
