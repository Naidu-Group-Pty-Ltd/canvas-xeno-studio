/**
 * Reading a brand's website from the server: every address is checked as
 * public before it is fetched (see ../net/public-url.server), every body is
 * read only up to a cap, and nothing waits long. A part that can't be read
 * is simply missing from the scan.
 */
import { fetchPublic } from "../net/public-url.server";

/** How the studio introduces itself to the sites it reads (Google Fonts then answers with TrueType files). */
export const BRAND_SCAN_AGENT = "XenoStudio/1.0 (brand import; +https://xeno.studio)";

export type Fetched =
  { ok: true; url: string; type: string; bytes: Uint8Array } | { ok: false; reason: string };

/** Reads a body up to `maxBytes`; past it, the fetch fails (a cut-off file is no use). */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Fetches a public address: its final URL (after redirects), media type and
 * bytes, or why not. `accept` limits the media types taken (by prefix);
 * `hosts` keeps every hop on those domains.
 */
export async function fetchCapped(
  url: string,
  options: {
    maxBytes: number;
    timeoutMs?: number;
    accept?: string[];
    hosts?: string[];
    headers?: Record<string, string>;
  },
): Promise<Fetched> {
  try {
    const fetched = await fetchPublic(url, {
      headers: { "user-agent": BRAND_SCAN_AGENT, ...options.headers },
      signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
      ...(options.hosts ? { hosts: options.hosts } : {}),
    });
    if (!fetched.ok) return fetched;
    const { response } = fetched;
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { ok: false, reason: `the site answered ${response.status}` };
    }
    const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (options.accept && !options.accept.some((prefix) => type.startsWith(prefix))) {
      await response.body?.cancel().catch(() => {});
      return { ok: false, reason: `it is ${type || "an unknown type"}, not what was expected` };
    }
    const bytes = await readCapped(response, options.maxBytes);
    if (!bytes) return { ok: false, reason: "it is too large" };
    return { ok: true, url: fetched.url, type, bytes };
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(error.name + error.message);
    return {
      ok: false,
      reason: timedOut ? "it took too long to answer" : "it couldn't be reached",
    };
  }
}

/** A text body (UTF-8, or the charset the page declares when it is a common one). */
export function decodeText(bytes: Uint8Array, type = ""): string {
  const declared = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase();
  const sniffed = /<meta[^>]+charset=["']?([\w-]+)/i
    .exec(new TextDecoder("latin1").decode(bytes.subarray(0, 2048)))?.[1]
    ?.toLowerCase();
  const charset = declared ?? sniffed ?? "utf-8";
  try {
    return new TextDecoder(["utf-8", "utf8"].includes(charset) ? "utf-8" : charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Runs `work` over `items` with at most `limit` at once, keeping the order. */
export async function inBatches<T, R>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]!, index);
    }
  });
  await Promise.all(lanes);
  return results;
}

/** The kind of image from its first bytes (a site's own label is often wrong), or null. */
export function imageKind(bytes: Uint8Array): { mime: string; extension: string } | null {
  const at = (index: number) => bytes[index] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47)
    return { mime: "image/png", extension: "png" };
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff)
    return { mime: "image/jpeg", extension: "jpg" };
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46)
    return { mime: "image/gif", extension: "gif" };
  if (
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  )
    return { mime: "image/webp", extension: "webp" };
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 1024)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")))
    return { mime: "image/svg+xml", extension: "svg" };
  return null;
}

/** An image's pixel size from its header (PNG, JPEG, GIF, WebP), or null when it can't be read. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = imageKind(bytes)?.mime;
  try {
    if (kind === "image/png") return { width: view.getUint32(16), height: view.getUint32(20) };
    if (kind === "image/gif")
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (kind === "image/webp") {
      const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
      if (chunk === "VP8X")
        return {
          width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
          height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
        };
      if (chunk === "VP8 ")
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      if (chunk === "VP8L") {
        const bits = view.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    if (kind === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1]!;
        const length = view.getUint16(offset + 2);
        // Start-of-frame markers (not DHT, JPG or DAC) carry the size.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
          return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * An SVG safe to keep and show: no scripts, event handlers, embedded HTML or
 * links that run code, and the SVG namespace on it so it draws as an image.
 */
export function sanitizeSvg(svg: string): string | null {
  let text = svg.trim();
  if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) return null;
  text = text
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href\s*=\s*["'])\s*(javascript|data:text\/html)[^"']*(["'])/gi, "$1#$3");
  if (/<script|javascript:/i.test(text)) return null;
  if (!/<svg[^>]*\sxmlns=/i.test(text))
    text = text.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return text;
}
