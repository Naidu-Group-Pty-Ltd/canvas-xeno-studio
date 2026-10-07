/**
 * Request ids for billable work still waiting for its outcome, kept in the
 * browser across reloads (and shared by its tabs). Asked again after a reload,
 * the same work answers with what it already made instead of starting (and
 * paying for) it again. Kept per place (say, one edit), one per logical
 * attempt (its key hashed, since a key can hold a whole script), the most
 * recent few, for a day. Without usable storage the id lives in memory only.
 */
const KEPT = 8;
const TTL_MS = 24 * 60 * 60_000;

type Saved = Record<string, { id: string; at: number }>;

const storageKey = (place: string) => `xeno:attempts:${place}`;

/** A short, stable name for an attempt's key. */
function hashed(key: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** A copy of each place's attempts, for when the browser's storage can't be used. */
const remembered = new Map<string, Saved>();
/** Places whose latest change couldn't be stored: their copy here is the current one. */
const unstored = new Set<string>();

function fresh(saved: Saved | null | undefined): Saved {
  const kept: Saved = {};
  for (const [hash, entry] of Object.entries(saved ?? {})) {
    if (
      typeof entry?.id === "string" &&
      typeof entry.at === "number" &&
      Date.now() - entry.at < TTL_MS
    )
      kept[hash] = entry;
  }
  return kept;
}

function read(place: string): Saved {
  if (!unstored.has(place)) {
    try {
      return fresh(
        JSON.parse(window.localStorage.getItem(storageKey(place)) ?? "{}") as Saved | null,
      );
    } catch {
      // Unreadable storage: the copy kept here.
    }
  }
  return fresh(remembered.get(place));
}

/** The request id kept for this attempt, if there is one. */
export function savedAttempt(place: string, key: string): string | null {
  return read(place)[hashed(key)]?.id ?? null;
}

/** Keeps an attempt's request id, or forgets it (null) once it has an outcome. */
export function keepAttempt(place: string, key: string, id: string | null): void {
  const attempts = read(place);
  if (id) attempts[hashed(key)] = { id, at: Date.now() };
  else delete attempts[hashed(key)];
  const latest = Object.fromEntries(
    Object.entries(attempts)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, KEPT),
  );
  remembered.set(place, latest);
  try {
    if (Object.keys(latest).length)
      window.localStorage.setItem(storageKey(place), JSON.stringify(latest));
    else window.localStorage.removeItem(storageKey(place));
    unstored.delete(place);
  } catch {
    // Without storage the attempt lives in memory only (until a reload); the
    // server still answers a request for work already being made with that work.
    unstored.add(place);
  }
}
