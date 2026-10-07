import { createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "./config.js";

export class TaskError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isPrivateAddress(address) {
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80");
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Only https URLs on allow-listed hosts are usable, and the resolved address
 * must be public. This blocks the worker from being used as a proxy into the
 * network it runs in (SSRF).
 */
export async function assertAllowedUrl(rawUrl, suffixes = config.allowedHostSuffixes) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new TaskError("INVALID_SOURCE", "Media URL is not a valid URL");
  }
  if (url.protocol !== "https:") throw new TaskError("INVALID_SOURCE", "Only https media URLs are accepted");

  const host = url.hostname.toLowerCase();
  const allowed = suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!allowed) throw new TaskError("INVALID_SOURCE", `Host ${host} is not on the media allow list`);

  const resolved = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (resolved.length === 0) throw new TaskError("INVALID_SOURCE", `Host ${host} could not be resolved`);
  if (resolved.some((entry) => isPrivateAddress(entry.address))) {
    throw new TaskError("INVALID_SOURCE", `Host ${host} resolves to a private address`);
  }
  return url;
}

/**
 * Streams a source file to disk with a hard size cap: the per-file limit, or
 * less when the caller has less room left.
 */
export async function downloadTo(rawUrl, destination, maxBytes = config.maxDownloadBytes) {
  await assertAllowedUrl(rawUrl);

  const response = await fetch(rawUrl, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new TaskError("SOURCE_UNAVAILABLE", `Source media could not be read (HTTP ${response.status})`);
  }
  if (response.url !== rawUrl) await assertAllowedUrl(response.url);

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared && declared > maxBytes) {
    await response.body.cancel().catch(() => {});
    throw new TaskError("SOURCE_TOO_LARGE", "Source media exceeds the size limit");
  }

  let received = 0;
  const counter = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxBytes) {
        controller.error(new TaskError("SOURCE_TOO_LARGE", "Source media exceeds the size limit"));
        return;
      }
      controller.enqueue(chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body.pipeThrough(counter)), createWriteStream(destination));
  } catch (error) {
    await unlink(destination).catch(() => {});
    if (error instanceof TaskError) throw error;
    throw new TaskError("SOURCE_UNAVAILABLE", "Source media download failed");
  }

  const info = await stat(destination);
  if (info.size === 0) throw new TaskError("SOURCE_UNAVAILABLE", "Source media was empty");
  return info.size;
}

/** Uploads a finished file to the pre-signed destination supplied by the app. */
export async function uploadFile(upload, filePath, contentType) {
  await assertAllowedUrl(upload.url);

  const info = await stat(filePath);
  if (info.size > config.maxOutputBytes) throw new TaskError("OUTPUT_TOO_LARGE", "Rendered file exceeds the size limit");

  const { readFile } = await import("node:fs/promises");
  const body = await readFile(filePath);
  const response = await fetch(upload.url, {
    method: upload.method === "POST" ? "POST" : "PUT",
    headers: { "content-type": contentType, ...(upload.headers ?? {}) },
    body,
  });
  if (!response.ok) {
    throw new TaskError("UPLOAD_FAILED", `Upload rejected by storage (HTTP ${response.status})`);
  }
  return info.size;
}
