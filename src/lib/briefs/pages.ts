/**
 * A brief's text a few pages at a time, for the Supercomputer agent: its
 * context carries only the brief's summary, which says nothing of a long
 * document's detail (a prompt pack's shots, cast and timings).
 *
 * A PDF's text is split at the markers ./parse-document writes ("--- Page N ---");
 * text without them (Word, PowerPoint, plain text) is read by character.
 */

const PAGE_MARKER = /^--- Page (\d+) ---$/gm;

export interface BriefExcerpt {
  text: string;
  /** The pages it covers and how many there are, or null for text without page markers. */
  pages: { from: number; to: number; total: number } | null;
  /** Where to carry on: the next page, or the next character; null at the end. */
  next: { page: number } | { offset: number } | null;
  /** Whether the last page shown was cut short to fit. */
  cut: boolean;
}

export function briefExcerpt(
  full: string,
  options: { fromPage?: number; toPage?: number; offset?: number },
  maxChars: number,
): BriefExcerpt {
  const markers = [...full.matchAll(PAGE_MARKER)];
  if (!markers.length) {
    const start = Math.min(Math.max(0, options.offset ?? 0), full.length);
    const end = Math.min(full.length, start + maxChars);
    return {
      text: full.slice(start, end),
      pages: null,
      next: end < full.length ? { offset: end } : null,
      cut: false,
    };
  }

  const pages = markers.map((marker, index) => ({
    number: Number(marker[1]),
    text: full.slice(marker.index, markers[index + 1]?.index ?? full.length).trim(),
  }));
  const total = Math.max(...pages.map((page) => page.number));
  const from = Math.max(1, options.fromPage ?? 1);
  const to = Math.min(total, Math.max(from, options.toPage ?? total));
  const wanted = pages.filter((page) => page.number >= from && page.number <= to);

  const parts: string[] = [];
  let used = 0;
  let last = from - 1;
  let cut = false;
  for (const page of wanted) {
    const room = maxChars - used;
    if (page.text.length > room) {
      // A page that alone is longer than the room is shown cut, so a read always moves on.
      if (!parts.length) {
        parts.push(page.text.slice(0, room));
        last = page.number;
        cut = true;
      }
      break;
    }
    parts.push(page.text);
    used += page.text.length + 2;
    last = page.number;
  }

  return {
    text: parts.join("\n\n"),
    pages: { from, to: Math.max(from, last), total },
    next: last < to ? { page: last + 1 } : null,
    cut,
  };
}
