/**
 * Text as the brand's design system and DNA keep it: cut to size at a word,
 * lists of distinct entries. Shared by the server, the browser and tests.
 */

/** Text cut to `max` characters at a word, or null when empty. */
export function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/** Up to `max` distinct non-empty strings, each cut to `chars`. */
export function wordsOf(value: unknown, max: number, chars = 60): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const text = clip(entry, chars);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}
