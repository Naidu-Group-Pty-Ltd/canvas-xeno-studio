/**
 * Output ingestion only downloads from HeyGen-controlled HTTPS hosts. Arbitrary
 * client-supplied URLs are never fetched server-side (SSRF protection).
 */
const ALLOWED_SUFFIXES = ["heygen.com", "heygen.ai", "amazonaws.com", "cloudfront.net", "liveavatar.com"];

export function assertProviderMediaUrl(raw: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid provider media URL");
  }
  if (u.protocol !== "https:") throw new Error("Provider media must be served over HTTPS");
  const host = u.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host === "localhost") throw new Error("Refusing to fetch an IP or local address");
  if (!ALLOWED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) throw new Error(`Refusing to fetch media from ${host}`);
}
