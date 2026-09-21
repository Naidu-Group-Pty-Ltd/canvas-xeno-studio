import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

/**
 * Both directions of the link are signed with the same scheme:
 *   signature = hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 * sent as `x-xeno-timestamp` and `x-xeno-signature: sha256=<hex>`.
 */
export function sign(rawBody, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac("sha256", config.sharedSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  return { timestamp: String(timestamp), signature: `sha256=${digest}` };
}

export function verify(rawBody, timestampHeader, signatureHeader) {
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: "missing signature headers" };

  const timestamp = Number.parseInt(String(timestampHeader), 10);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "invalid timestamp" };

  const skew = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (skew > config.signatureWindowSeconds) return { ok: false, reason: "stale signature" };

  const expected = sign(rawBody, timestamp).signature;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" };

  return { ok: true };
}
