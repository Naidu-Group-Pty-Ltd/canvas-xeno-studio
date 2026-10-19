/**
 * Events over text/event-stream, as the studio's streaming endpoints send
 * them (the Supercomputer agent, brand imports): one JSON object per event,
 * each with a `type`. Shared by the server, the browser and tests.
 */

/** Encodes an event for an event stream. */
export function encodeStreamEvent(event: { type: string }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** A comment line that keeps a quiet stream from timing out on the way. */
export const KEEP_ALIVE = ": keep-alive\n\n";

/**
 * Reads events out of an event stream's text as it arrives: the complete
 * ones, and what is left over until more arrives. A malformed event is
 * skipped (the next arrives on its own).
 */
export function decodeEventStream<T extends { type: string }>(
  buffer: string,
): { events: T[]; rest: string } {
  const events: T[] = [];
  let rest = buffer;
  for (;;) {
    const end = rest.indexOf("\n\n");
    if (end < 0) break;
    const chunk = rest.slice(0, end);
    rest = rest.slice(end + 2);
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const parsed = JSON.parse(data) as T;
      if (parsed && typeof parsed === "object" && typeof parsed.type === "string")
        events.push(parsed);
    } catch {
      // Skipped.
    }
  }
  return { events, rest };
}
