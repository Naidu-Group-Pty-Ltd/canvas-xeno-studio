/**
 * A repository's files from GitHub, for scanning its design system: the
 * commit a branch (or the default branch) is at, the commit's whole file
 * tree, and a file's bytes at that commit.
 *
 * Only api.github.com and raw.githubusercontent.com are ever fetched, at
 * addresses built from a checked owner, repository and path, and redirects
 * are never followed, so a token can't be carried anywhere else. Public
 * repositories need no token; private ones need one that can read them (a
 * fine-grained token with Contents: read). With a token, files are read
 * through the contents API (5,000 reads an hour); without one, GitHub allows
 * 60 API reads an hour from one address, so files come from
 * raw.githubusercontent.com, which that limit doesn't count.
 *
 * Takes its fetch and token from its caller (the server reads the token from
 * its environment), so it is the same in a script and in tests.
 */
import type { RepoRef } from "./scan-code";
import type { RepoSource, RepoTree } from "./scan-repos";

export interface GithubSourceOptions {
  token?: string | null;
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

export interface GithubSource extends RepoSource {
  /** A file's bytes at the commit (a logo), or null when it is gone or larger than `maxBytes`. */
  bytes(
    ref: RepoRef,
    sha: string | null,
    path: string,
    maxBytes: number,
  ): Promise<Uint8Array | null>;
}

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const AGENT = "XenoStudio/1.0 (design system import)";
const SHA = /^[0-9a-f]{40}$/i;

const segments = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** Why GitHub refused, in words a person can act on. */
function refusal(status: number, headers: Headers, what: string, token: boolean): string {
  if (status === 404)
    return token
      ? `${what} wasn't found, or the GitHub token can't read it`
      : `${what} wasn't found (a private repository needs a GitHub token that can read it)`;
  if ((status === 403 || status === 429) && headers.get("x-ratelimit-remaining") === "0")
    return token
      ? "GitHub's rate limit for this token is used up; try again later"
      : "GitHub's limit on reads without a token is used up; add a GitHub token, or try again in an hour";
  if (status === 401) return "The GitHub token was refused (it may have expired)";
  if (status === 403) return `GitHub refused to read ${what}`;
  if (status >= 300 && status < 400) return `GitHub moved ${what} somewhere this won't follow`;
  return `GitHub answered ${status} for ${what}`;
}

export function githubSource(options: GithubSourceOptions = {}): GithubSource {
  const run = options.fetch ?? fetch;
  const token = options.token?.trim() || null;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const headers = (accept: string): Record<string, string> => ({
    accept,
    "user-agent": options.userAgent ?? AGENT,
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });

  const get = async (url: string, accept: string): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await run(url, {
        headers: headers(accept),
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("GitHub didn't answer in time");
      throw new Error(
        error instanceof Error
          ? `GitHub couldn't be reached: ${error.message}`
          : "GitHub couldn't be reached",
      );
    } finally {
      clearTimeout(timer);
    }
  };

  const json = async (url: string, what: string): Promise<Record<string, unknown>> => {
    const response = await get(url, "application/vnd.github+json");
    if (!response.ok) throw new Error(refusal(response.status, response.headers, what, !!token));
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== "object")
      throw new Error(`GitHub's answer for ${what} wasn't readable`);
    return body as Record<string, unknown>;
  };

  /** The commit a branch, tag or commit names (the default branch's, for none). */
  const commitOf = async (ref: RepoRef): Promise<string> => {
    const repo = `${API}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
    const label = `${ref.owner}/${ref.repo}`;
    let name = ref.ref;
    if (!name) {
      const info = await json(repo, label);
      name = typeof info["default_branch"] === "string" ? info["default_branch"] : null;
      if (!name) throw new Error(`${label} has no default branch to read`);
    }
    if (SHA.test(name)) return name.toLowerCase();
    const response = await get(`${repo}/commits/${segments(name)}`, "application/vnd.github.sha");
    if (!response.ok)
      throw new Error(refusal(response.status, response.headers, `${label}@${name}`, !!token));
    const sha = (await response.text()).trim();
    if (!SHA.test(sha)) throw new Error(`GitHub didn't say which commit ${label}@${name} is`);
    return sha.toLowerCase();
  };

  const read = async (ref: RepoRef, sha: string | null, path: string, maxBytes: number) => {
    const at = sha && SHA.test(sha) ? sha : (ref.ref ?? "HEAD");
    const repo = `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
    // A private repository's files are read with the token through the API; a public one's from raw.
    const response = token
      ? await get(
          `${API}/repos/${repo}/contents/${segments(path)}?ref=${encodeURIComponent(at)}`,
          "application/vnd.github.raw",
        )
      : await get(`${RAW}/${repo}/${segments(at)}/${segments(path)}`, "*/*");
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(refusal(response.status, response.headers, path, !!token));
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : bytes;
  };

  return {
    async tree(ref: RepoRef): Promise<RepoTree> {
      const sha = await commitOf(ref);
      const url = `${API}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/trees/${sha}?recursive=1`;
      const body = await json(url, `${ref.owner}/${ref.repo}'s files`);
      const entries = Array.isArray(body["tree"]) ? body["tree"] : [];
      const files = entries.flatMap((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return item["type"] === "blob" && typeof item["path"] === "string"
          ? [{ path: item["path"], size: typeof item["size"] === "number" ? item["size"] : null }]
          : [];
      });
      return { sha, files, truncated: body["truncated"] === true };
    },
    async text(ref, sha, path, maxBytes) {
      const bytes = await read(ref, sha, path, maxBytes);
      return bytes ? new TextDecoder("utf-8").decode(bytes) : null;
    },
    bytes: read,
  };
}
