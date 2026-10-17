/**
 * Text in generated pictures. Image and video models letter signs, screens,
 * dashboards and documents with gibberish more often than not: invented
 * glyphs, misspelt or nonsense words, letters that melt between frames. In
 * the Aurixa job every B-roll shot had to be stepped through frame by frame
 * for it. The studio's AI reads every piece of lettering in a picture (or in
 * frames taken through a video) and says whether a viewer could read it
 * without noticing anything wrong; the verdict is kept with the file
 * (assets.metadata.text_check). See ./text-check.server.
 *
 * Shared by the server, the browser and tests.
 */

export const TEXT_VERDICTS = ["none", "legible", "garbled"] as const;
export type TextVerdict = (typeof TEXT_VERDICTS)[number];

export interface TextFinding {
  /** What it says, as near as can be read (? for a character that can't). */
  text: string;
  /** Where it is, in a few words ("the laptop screen, top left"). */
  where: string;
  /** Real, correctly spelt words or numbers a viewer could read without noticing anything wrong. */
  legible: boolean;
}

export interface TextCheckResult {
  verdict: TextVerdict;
  findings: TextFinding[];
  /** One line for people, e.g. "Garbled: the dashboard's headings; the report title". */
  summary: string;
  /** How many pictures were read (1 for an image, a few frames through a video). */
  frames: number;
  model: string | null;
  checkedAt: string;
}

/** Points through a video its frames are read at. */
export const TEXT_SAMPLE_POINTS = [0.12, 0.37, 0.62, 0.88] as const;

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

/** The verdict a set of findings comes to: garbled if any is, else legible if there is text at all. */
export function textVerdict(findings: TextFinding[]): TextVerdict {
  if (findings.some((finding) => !finding.legible)) return "garbled";
  return findings.length ? "legible" : "none";
}

/** The one line a check is summed up in. */
export function textSummary(findings: TextFinding[]): string {
  const verdict = textVerdict(findings);
  if (verdict === "none") return "No text in the picture.";
  const garbled = findings.filter((finding) => !finding.legible);
  if (verdict === "legible")
    return `Readable text: ${findings
      .slice(0, 3)
      .map((finding) => `“${finding.text}”`)
      .join(", ")}${findings.length > 3 ? "…" : ""}.`;
  return `Garbled text: ${garbled
    .slice(0, 3)
    .map((finding) => finding.where || `“${finding.text}”`)
    .join("; ")}${garbled.length > 3 ? "…" : ""}.`;
}

/** The AI's answer, cleaned: findings with their text, place and legibility. */
export function textFindings(answer: unknown): TextFinding[] {
  const entries = asRecord(answer)["findings"];
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      const record = asRecord(entry);
      return {
        text: typeof record["text"] === "string" ? record["text"].trim().slice(0, 160) : "",
        where: typeof record["where"] === "string" ? record["where"].trim().slice(0, 120) : "",
        legible: record["legible"] === true,
      };
    })
    .filter((finding) => finding.text || finding.where)
    .slice(0, 20);
}

/** A file's text check, as kept with it (null if it hasn't been checked). */
export function textCheckOf(metadata: unknown): TextCheckResult | null {
  const check = asRecord(asRecord(metadata)["text_check"]);
  const verdict = check["verdict"];
  if (!(TEXT_VERDICTS as readonly unknown[]).includes(verdict)) return null;
  const findings = textFindings(check);
  return {
    verdict: verdict as TextVerdict,
    findings,
    summary: typeof check["summary"] === "string" ? check["summary"] : textSummary(findings),
    frames: typeof check["frames"] === "number" ? check["frames"] : 1,
    model: typeof check["model"] === "string" ? check["model"] : null,
    checkedAt: typeof check["checkedAt"] === "string" ? check["checkedAt"] : "",
  };
}
