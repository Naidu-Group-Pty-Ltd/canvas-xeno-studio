/**
 * Fetching addresses that come from outside (a catalogue entry, a provider's
 * answer) without letting them steer the server into its own network.
 *
 * Only https on the standard port is used, with no credentials, no IP
 * literals and no local names. Every hop's host must resolve only to public
 * addresses, and redirects are followed by hand so each hop is checked again.
 * Names are resolved with DNS over HTTPS, which works the same on every
 * runtime the app is deployed to.
 */

const DNS_OVER_HTTPS = "https://cloudflare-dns.com/dns-query";
const MAX_REDIRECTS = 5;
const LOCAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".home.arpa",
];

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const values = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return values.every((value) => value >= 0 && value <= 255) ? values : null;
}

function publicIPv4([a = 0, b = 0, c = 0]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this network, private, loopback, multicast, reserved
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, including cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocol assignments, documentation
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  return true;
}

function ipv6Hextets(address: string): number[] | null {
  let value = address.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  // An embedded IPv4 tail (::ffff:1.2.3.4) becomes the last two hextets.
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(value)?.[1];
  if (tail) {
    const v4 = ipv4Parts(tail);
    if (!v4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    value = `${value.slice(0, -tail.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const parts = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const hextets = parts.map((part) =>
    /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : Number.NaN,
  );
  return hextets.length === 8 && hextets.every(Number.isInteger) ? hextets : null;
}

function publicIPv6(h: number[]): boolean {
  const [h0 = 0, h1 = 0, h2 = 0, , , h5 = 0, h6 = 0, h7 = 0] = h;
  const v4 = (high: number, low: number) => [high >> 8, high & 0xff, low >> 8, low & 0xff];
  const zeros = (count: number) => h.slice(0, count).every((part) => part === 0);
  if (zeros(6)) return false; // unspecified, loopback, IPv4-compatible
  if (zeros(5) && h5 === 0xffff) return publicIPv4(v4(h6, h7)); // IPv4-mapped
  if (h0 === 0x64 && h1 === 0xff9b && h.slice(2, 6).every((part) => part === 0))
    return publicIPv4(v4(h6, h7)); // NAT64
  if (h0 === 0x2002) return publicIPv4(v4(h1, h2)); // 6to4
  if ((h0 & 0xfe00) === 0xfc00) return false; // unique local
  if ((h0 & 0xffc0) === 0xfe80 || (h0 & 0xffc0) === 0xfec0) return false; // link-local, site-local
  if ((h0 & 0xff00) === 0xff00) return false; // multicast
  if (h0 === 0x2001 && (h1 === 0x0db8 || h1 === 0)) return false; // documentation, Teredo
  if (h0 === 0x0100 && h1 === 0 && h2 === 0) return false; // discard
  return true;
}

/** Whether an IP address is on the public internet (not private, loopback, link-local or reserved). */
export function isPublicAddress(address: string): boolean {
  const v4 = ipv4Parts(address);
  if (v4) return publicIPv4(v4);
  const v6 = ipv6Hextets(address);
  return v6 ? publicIPv6(v6) : false;
}

/** Every A and AAAA answer for a name, or null when it couldn't be looked up. */
async function resolveName(host: string): Promise<string[] | null> {
  const addresses: string[] = [];
  for (const type of ["A", "AAAA"]) {
    let response: Response;
    try {
      response = await fetch(`${DNS_OVER_HTTPS}?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      Status?: number;
      Answer?: { type?: number; data?: string }[];
    } | null;
    // 0 is an answer; 3 means the name doesn't exist.
    if (!body || (body.Status !== 0 && body.Status !== 3)) return null;
    for (const answer of body.Answer ?? []) {
      if ((answer.type === 1 || answer.type === 28) && typeof answer.data === "string")
        addresses.push(answer.data);
    }
  }
  return addresses;
}

/** The URL if it is safe to fetch from the server, else why not. */
export async function checkPublicUrl(
  raw: string,
): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid address" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not an https address" };
  if (url.username || url.password) return { ok: false, reason: "an address with credentials" };
  if (url.port && url.port !== "443") return { ok: false, reason: "an address on an unusual port" };
  // The URL parser has already normalised numeric hosts (0x7f.1, 2130706433…) to dotted form.
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (ipv4Parts(host) || host.startsWith("[") || host.includes(":"))
    return { ok: false, reason: "an IP address rather than a name" };
  if (!host.includes(".") || LOCAL_SUFFIXES.some((suffix) => `.${host}`.endsWith(suffix)))
    return { ok: false, reason: "a local name" };
  const addresses = await resolveName(host);
  if (addresses === null) return { ok: false, reason: "a name that couldn't be looked up" };
  if (!addresses.length) return { ok: false, reason: "a name with no address" };
  if (!addresses.every(isPublicAddress)) return { ok: false, reason: "a private address" };
  return { ok: true, url };
}

/**
 * Fetches an outside address, following up to five redirects by hand and
 * checking every hop. The caller reads (or cancels) the returned body.
 */
export async function fetchPublic(
  raw: string,
  init: Omit<RequestInit, "redirect"> & { signal?: AbortSignal } = {},
): Promise<{ ok: true; response: Response; url: string } | { ok: false; reason: string }> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const checked = await checkPublicUrl(current);
    if (!checked.ok) return checked;
    const response = await fetch(checked.url.href, { ...init, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      try {
        current = new URL(location, checked.url).href;
      } catch {
        return { ok: false, reason: "a redirect to an invalid address" };
      }
      continue;
    }
    return { ok: true, response, url: checked.url.href };
  }
  return { ok: false, reason: "too many redirects" };
}
