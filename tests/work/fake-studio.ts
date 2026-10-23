import { createHash } from "node:crypto";
import { WorkDb } from "./fake-work-db";
import { currentFiles, mergePatch } from "../../src/lib/work/model";

type Row = Record<string, unknown>;
type Answer = { data: unknown; error: unknown };
type RpcAnswer = Promise<Answer> & {
  select: () => RpcAnswer;
  range: (from: number, to: number) => RpcAnswer;
};

/** The columns a row gets from 0037_work_journal when an insert leaves them out. */
const DEFAULTS: Record<string, () => Row> = {
  works: () => ({
    goal: "",
    status: "active",
    project_id: null,
    campaign_id: null,
    brand_kit_id: null,
    parent_work_id: null,
    steps: [],
    state: {},
    state_version: 0,
    roots: {},
    code: null,
    holder: null,
    holder_label: null,
    holder_kind: null,
    held_since: null,
    heard_at: null,
    lease_expires_at: null,
    last_summary: "",
    next_steps: [],
    questions: [],
    entries: 0,
    last_entry_at: null,
    client_request_id: null,
    created_by: null,
    finished_at: null,
  }),
  work_journal: () => ({
    summary: "",
    next_steps: [],
    decisions: [],
    questions: [],
    step_changes: [],
    state_patch: null,
    state_version: null,
    changes: {},
    code: null,
    files: [],
    links: [],
    actor_kind: "script",
    actor_session: null,
    actor_label: null,
    created_by: null,
    client_request_id: null,
  }),
  work_files: () => ({
    deleted: false,
    sha256: null,
    size: null,
    mime_type: null,
    chunks: [],
    modified_at: null,
    executable: false,
    note: null,
    asset_id: null,
    entry_id: null,
  }),
  work_links: () => ({ role: null, note: null, entry_id: null }),
  work_blobs: () => ({ md5: null, status: "pending", stored_at: null }),
  projects: () => ({ description: null }),
};

/** Postgres raising: what a work function refuses, as supabase-js reports it. */
class Refusal {
  constructor(
    readonly code: string,
    readonly message: string,
  ) {}
}

/**
 * The studio's database and storage as a running deployment has them, in
 * memory: the work functions (work_save, work_claim, work_release,
 * work_files_now) do what 0037_work_journal's do (tests/sql/work.sql checks
 * those against a real Postgres), and storage keeps the bytes PUT to its
 * signed addresses, which `serve` answers over HTTP. Enough for
 * scripts/studio-work/work.py to run against the studio's own API code.
 */
export class StudioDb extends WorkDb {
  origin = "http://127.0.0.1:0";
  bytes = new Map<string, Uint8Array>();
  /** While true, the API answers 503: the studio away. */
  down = false;

  override add(table: string, row: Row): Row {
    return super.add(table, { ...(DEFAULTS[table]?.() ?? {}), ...row });
  }

  override rpc(name: string, args: Row): RpcAnswer {
    this.calls.push({ name, args });
    const handler = this.handlers.get(name);
    let answer: Answer;
    try {
      answer = handler
        ? { data: handler(args), error: null }
        : { data: null, error: { code: "PGRST202", message: `no function ${name}` } };
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      answer = { data: null, error: { code: error.code, message: error.message } };
    }
    const wrap = (value: Answer): RpcAnswer => {
      const promise = Promise.resolve(value) as RpcAnswer;
      promise.select = () => promise;
      promise.range = (from: number, to: number) =>
        wrap({
          ...value,
          data: Array.isArray(value.data) ? value.data.slice(from, to + 1) : value.data,
        });
      return promise;
    };
    return wrap(answer);
  }

  override storage = {
    from: () => ({
      list: async (folder: string, options: { search?: string } = {}) => ({
        data: [...this.objects.entries()]
          .filter(
            ([path]) =>
              path.startsWith(`${folder}/`) &&
              path.slice(folder.length + 1).includes(options.search ?? ""),
          )
          .map(([path, object]) => ({
            name: path.slice(folder.length + 1),
            metadata: { size: object.size, eTag: `"${object.eTag}"` },
          })),
        error: null,
      }),
      createSignedUploadUrl: async (path: string) => ({
        data: { signedUrl: `${this.origin}/storage/upload/${path}?token=up`, token: "up", path },
        error: null,
      }),
      createSignedUrls: async (paths: string[]) => ({
        data: paths.map((path) => ({
          path,
          signedUrl: `${this.origin}/storage/object/${path}?token=down`,
          error: null,
        })),
        error: null,
      }),
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `${this.origin}/storage/object/${path}?token=down` },
        error: null,
      }),
      remove: async (paths: string[]) => {
        for (const path of paths) {
          this.removed.push(path);
          this.objects.delete(path);
          this.bytes.delete(path);
        }
        return { error: null };
      },
    }),
  };

  journal(workId: unknown): Row[] {
    return this.rows("work_journal")
      .filter((row) => row["work_id"] === workId)
      .sort((a, b) => Number(a["n"]) - Number(b["n"]));
  }

  /** A work's files as they stand: path → its latest row. */
  filesNow(workId: unknown): Map<string, Row> {
    return new Map(
      currentFiles(
        this.rows("work_files").filter((row) => row["work_id"] === workId) as never[],
      ).map((row: Row) => [String(row["path"]), row]),
    );
  }

  /** A file's bytes as the studio holds them: its parts, joined. */
  fileBytes(row: Row): Buffer {
    return Buffer.concat(
      (row["chunks"] as string[]).map((sha) => {
        const blob = this.rows("work_blobs").find(
          (entry) => entry["work_id"] === row["work_id"] && entry["sha256"] === sha,
        );
        return Buffer.from(this.bytes.get(String(blob?.["storage_path"])) ?? new Uint8Array());
      }),
    );
  }
}

const live = (work: Row, now = Date.now()) =>
  !!work["holder"] && new Date(String(work["lease_expires_at"])).getTime() > now;
const leaseUntil = (seconds: unknown) =>
  new Date(Date.now() + Math.min(Math.max(Number(seconds ?? 900), 60), 86400) * 1000).toISOString();
const utc = (iso: unknown) => String(iso).slice(0, 16).replace("T", " ") + " UTC";

function entryOf(db: StudioDb, work: Row, row: Row): Row {
  const n = Math.max(0, ...db.rows("work_journal").map((entry) => Number(entry["n"]))) + 1;
  const entry = db.add("work_journal", { ...row, work_id: work["id"], n });
  work["entries"] = Number(work["entries"] ?? 0) + 1;
  work["last_entry_at"] = entry["created_at"];
  return entry;
}

/** work_merge_steps: a plan's changes by key (a new step at the end, remove takes one out). */
function mergeSteps(steps: unknown, changes: unknown): Row[] {
  const out = (Array.isArray(steps) ? steps : []).map((step) => ({ ...(step as Row) }));
  for (const change of (Array.isArray(changes) ? changes : []) as Row[]) {
    const key = String(change["key"] ?? "").trim();
    if (key.length < 1 || key.length > 80)
      throw new Refusal("23514", "Every step change names its step's key (1 to 80 characters).");
    if (
      "status" in change &&
      !["todo", "doing", "done", "blocked", "skipped"].includes(String(change["status"]))
    )
      throw new Refusal("23514", "A step's status is todo, doing, done, blocked or skipped.");
    const index = out.findIndex((step) => step["key"] === key);
    if (change["remove"]) {
      if (index >= 0) out.splice(index, 1);
      continue;
    }
    const now = new Date().toISOString();
    if (index < 0)
      out.push({
        key,
        title: String(change["title"] ?? "").trim() || key,
        status: change["status"] ?? "todo",
        note: String(change["note"] ?? ""),
        updated_at: now,
      });
    else
      out[index] = {
        ...out[index],
        ...(String(change["title"] ?? "").trim() ? { title: String(change["title"]).trim() } : {}),
        ...(change["status"] ? { status: change["status"] } : {}),
        ...(change["note"] !== undefined && change["note"] !== null
          ? { note: String(change["note"]) }
          : {}),
        updated_at: now,
      };
  }
  return out;
}

/** The work functions, doing what 0037_work_journal's do. */
export function answerLikePostgres(db: StudioDb) {
  db.handlers.set("work_save", (args) => {
    const work = db.find("works", args["p_work_id"]);
    if (!work) return { found: false };
    const given = (args["p_entry"] ?? {}) as Row;
    const request = (given["client_request_id"] as string | null) || null;
    if (request) {
      const before = db
        .rows("work_journal")
        .find((row) => row["work_id"] === work["id"] && row["client_request_id"] === request);
      if (before)
        return {
          found: true,
          duplicate: true,
          entryId: before["id"],
          n: before["n"],
          stateVersion: work["state_version"],
          status: work["status"],
        };
    }
    const patch = args["p_state_patch"] as Row | null | undefined;
    if (patch && (typeof patch !== "object" || Array.isArray(patch)))
      throw new Refusal("23514", "A change to the record is a JSON object (a merge patch).");
    const base = args["p_base_version"];
    if (patch && base !== undefined && base !== null && base !== work["state_version"])
      return {
        found: true,
        conflict: true,
        stateVersion: work["state_version"],
        baseVersion: base,
      };
    let state = work["state"];
    let version = Number(work["state_version"]);
    let stateChanged = false;
    if (patch) {
      const next = mergePatch(state as never, patch as never);
      if (JSON.stringify(next) !== JSON.stringify(state)) {
        state = next;
        version += 1;
        stateChanged = true;
      }
    }
    const steps = mergeSteps(work["steps"], args["p_step_changes"]);
    const kind = String(given["kind"] || "save");
    const summary = String(given["summary"] ?? "").slice(0, 20000);
    const entry = entryOf(db, work, {
      kind,
      summary,
      next_steps: given["next_steps"] ?? [],
      decisions: given["decisions"] ?? [],
      questions: given["questions"] ?? [],
      step_changes: args["p_step_changes"] ?? [],
      state_patch: stateChanged ? patch : null,
      state_version: stateChanged ? version : null,
      changes: args["p_changes"] ?? {},
      code: given["code"] ?? null,
      actor_kind: given["actor_kind"] || "script",
      actor_session: given["actor_session"] || null,
      actor_label: given["actor_label"] || null,
      created_by: args["p_user"],
      client_request_id: request,
    });
    const files: Row[] = [];
    for (const file of (args["p_files"] ?? []) as Row[]) {
      const path = String(file["path"]);
      const latest = db
        .rows("work_files")
        .filter((row) => row["work_id"] === work["id"] && row["path"] === path)
        .sort((a, b) => Number(b["version"]) - Number(a["version"]))[0];
      if (file["deleted"]) {
        if (!latest || latest["deleted"]) continue;
        const version = Number(latest["version"]) + 1;
        db.add("work_files", {
          work_id: work["id"],
          path,
          version,
          deleted: true,
          entry_id: entry["id"],
          created_by: args["p_user"],
        });
        files.push({ path, version, deleted: true });
        continue;
      }
      if (latest && !latest["deleted"] && latest["sha256"] === file["sha256"]) continue;
      const chunks = file["chunks"] as string[];
      const stored = chunks.map((sha) =>
        db
          .rows("work_blobs")
          .find(
            (blob) =>
              blob["work_id"] === work["id"] &&
              blob["sha256"] === sha &&
              blob["status"] === "stored",
          ),
      );
      if (stored.some((blob) => !blob))
        throw new Refusal(
          "23514",
          `The file ${path} has ${stored.filter(Boolean).length} of its ${chunks.length} parts stored: upload the rest first.`,
        );
      const total = stored.reduce((sum, blob) => sum + Number(blob!["size"]), 0);
      if (total !== Number(file["size"]))
        throw new Refusal(
          "23514",
          `The file ${path}'s parts add up to ${total} bytes, not ${String(file["size"])}.`,
        );
      const version = Number(latest?.["version"] ?? 0) + 1;
      db.add("work_files", {
        work_id: work["id"],
        path,
        version,
        sha256: file["sha256"],
        size: file["size"],
        mime_type: file["mime_type"] || null,
        chunks,
        modified_at: file["modified_at"] ?? null,
        executable: !!file["executable"],
        note: file["note"] || null,
        entry_id: entry["id"],
        created_by: args["p_user"],
      });
      files.push({ path, version, sha256: file["sha256"], size: file["size"] });
    }
    const links: Row[] = [];
    for (const link of (args["p_links"] ?? []) as Row[]) {
      const before = db
        .rows("work_links")
        .find(
          (row) =>
            row["work_id"] === work["id"] &&
            row["kind"] === link["kind"] &&
            row["object_id"] === link["object_id"],
        );
      if (before) {
        if (link["role"]) before["role"] = link["role"];
        if (link["note"]) before["note"] = link["note"];
      }
      const row =
        before ??
        db.add("work_links", {
          work_id: work["id"],
          kind: link["kind"],
          object_id: link["object_id"],
          role: link["role"] || null,
          note: link["note"] || null,
          entry_id: entry["id"],
          created_by: args["p_user"],
        });
      links.push({ kind: row["kind"], id: row["object_id"], role: row["role"], added: !before });
    }
    entry["files"] = files;
    entry["links"] = links;
    const changes = (args["p_changes"] ?? {}) as Row;
    const status = String(changes["status"] || work["status"]);
    const finished = ["done", "abandoned"].includes(status);
    Object.assign(work, {
      state,
      state_version: version,
      steps,
      title: String(changes["title"] ?? "").trim() || work["title"],
      goal: "goal" in changes ? String(changes["goal"] ?? "") : work["goal"],
      roots:
        "roots" in changes
          ? mergePatch(work["roots"] as never, changes["roots"] as never)
          : work["roots"],
      project_id: "project_id" in changes ? changes["project_id"] : work["project_id"],
      brand_kit_id: "brand_kit_id" in changes ? changes["brand_kit_id"] : work["brand_kit_id"],
      status,
      finished_at: finished ? (work["finished_at"] ?? new Date().toISOString()) : null,
      code: given["code"] ?? work["code"],
      last_summary:
        summary.trim() && !["claim", "takeover", "release", "link", "auto"].includes(kind)
          ? summary
          : work["last_summary"],
      next_steps: "next_steps" in given ? given["next_steps"] : work["next_steps"],
      questions: "questions" in given ? given["questions"] : work["questions"],
    });
    let hold: string | null = null;
    const holderBefore = { ...work };
    if (finished) {
      Object.assign(work, {
        holder: null,
        holder_label: null,
        holder_kind: null,
        held_since: null,
        lease_expires_at: null,
      });
      hold = "released";
    } else if (args["p_holder"] && entry["actor_kind"] !== "studio") {
      if (!live(work) || work["holder"] === args["p_holder"]) {
        Object.assign(work, {
          holder: args["p_holder"],
          holder_label: given["actor_label"] || null,
          holder_kind: entry["actor_kind"],
          heard_at: new Date().toISOString(),
          lease_expires_at: leaseUntil(args["p_seconds"]),
        });
        hold = "held";
      } else hold = "held_by_other";
    }
    return {
      found: true,
      duplicate: false,
      entryId: entry["id"],
      n: entry["n"],
      stateVersion: version,
      stateChanged,
      files,
      links,
      status,
      hold,
      ...(hold === "held_by_other"
        ? {
            holder: holderBefore["holder"],
            holderLabel: holderBefore["holder_label"],
            heardAt: holderBefore["heard_at"],
          }
        : {}),
    };
  });

  db.handlers.set("work_claim", (args) => {
    const work = db.find("works", args["p_work_id"]);
    if (!work) return { found: false };
    const holder = String(args["p_holder"]);
    const isLive = live(work);
    if (args["p_renew_only"] && work["holder"] !== holder)
      return {
        found: true,
        claimed: false,
        renewOnly: true,
        holder: work["holder"],
        holderLabel: work["holder_label"],
        holderKind: work["holder_kind"],
        heardAt: work["heard_at"],
        leaseExpiresAt: work["lease_expires_at"],
      };
    if (isLive && work["holder"] !== holder && !args["p_take_over"])
      return {
        found: true,
        claimed: false,
        holder: work["holder"],
        holderLabel: work["holder_label"],
        holderKind: work["holder_kind"],
        heardAt: work["heard_at"],
        leaseExpiresAt: work["lease_expires_at"],
      };
    const before = { ...work };
    let entryId: unknown = null;
    if (work["holder"] !== holder || work["status"] !== "active") {
      const summary =
        (work["holder"] === holder
          ? "Picked up again."
          : isLive
            ? `Taken over from ${String(work["holder_label"] ?? work["holder"])}, last heard from ${utc(work["heard_at"])}.`
            : work["holder"]
              ? `Picked up: ${String(work["holder_label"] ?? work["holder"])} had stopped renewing its hold (last heard from ${utc(work["heard_at"])}).`
              : "Picked up.") +
        (work["status"] !== "active"
          ? ` It was ${String(work["status"])}; it is active again.`
          : "");
      entryId = entryOf(db, work, {
        kind: isLive && work["holder"] !== holder ? "takeover" : "claim",
        summary,
        changes: work["status"] !== "active" ? { status: "active" } : {},
        actor_kind: args["p_kind"],
        actor_session: holder,
        actor_label: args["p_label"],
        created_by: args["p_user"],
      })["id"];
    }
    Object.assign(work, {
      holder,
      holder_label: args["p_label"],
      holder_kind: args["p_kind"],
      held_since:
        work["holder"] === holder && isLive ? work["held_since"] : new Date().toISOString(),
      heard_at: new Date().toISOString(),
      lease_expires_at: leaseUntil(args["p_seconds"]),
      status: "active",
      finished_at: null,
    });
    const changed = before["holder"] !== holder;
    return {
      found: true,
      claimed: true,
      entryId,
      previousHolder: changed ? before["holder"] : null,
      previousLabel: changed ? before["holder_label"] : null,
      previousHeardAt: changed ? before["heard_at"] : null,
      tookOver: isLive && before["holder"] !== holder,
    };
  });

  db.handlers.set("work_release", (args) => {
    const work = db.find("works", args["p_work_id"]);
    if (!work) return { found: false };
    if (work["holder"] !== args["p_holder"])
      return {
        found: true,
        released: false,
        holder: work["holder"],
        holderLabel: work["holder_label"],
      };
    entryOf(db, work, {
      kind: "release",
      summary: String(args["p_summary"] ?? "").trim() || "Let go.",
      actor_kind: args["p_kind"],
      actor_session: args["p_holder"],
      actor_label: args["p_label"],
      created_by: args["p_user"],
    });
    Object.assign(work, {
      holder: null,
      holder_label: null,
      holder_kind: null,
      held_since: null,
      heard_at: new Date().toISOString(),
      lease_expires_at: null,
    });
    return { found: true, released: true };
  });

  db.handlers.set("work_files_now", (args) =>
    currentFiles(
      db.rows("work_files").filter((row) => row["work_id"] === args["p_work_id"]) as never[],
    ),
  );
}

/**
 * The studio over HTTP on a port of its own: its API (the deployment's own
 * code, handleRestRequest) and storage's signed addresses. A part PUT twice
 * is refused as storage refuses it (the resource already exists).
 */
export function serve(db: StudioDb, handle: (request: Request, tool: string) => Promise<Response>) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const upload = url.pathname.match(/^\/storage\/upload\/(.+)$/);
      if (upload && request.method === "PUT") {
        const path = decodeURIComponent(upload[1]!);
        if (db.objects.has(path) && request.headers.get("x-upsert") !== "true")
          return Response.json(
            { statusCode: "409", error: "Duplicate", message: "The resource already exists" },
            { status: 400 },
          );
        const bytes = new Uint8Array(await request.arrayBuffer());
        db.bytes.set(path, bytes);
        db.objects.set(path, {
          size: bytes.length,
          eTag: createHash("md5").update(bytes).digest("hex"),
        });
        return Response.json({ Key: `work-files/${path}` });
      }
      const object = url.pathname.match(/^\/storage\/object\/(.+)$/);
      if (object && request.method === "GET") {
        const bytes = db.bytes.get(decodeURIComponent(object[1]!));
        return bytes
          ? new Response(bytes)
          : Response.json({ error: "not_found", message: "Object not found" }, { status: 404 });
      }
      const tool = url.pathname.match(/^\/api\/public\/studio\/([a-z_]+)$/);
      if (tool) {
        if (db.down)
          return Response.json(
            { error: { code: "UNAVAILABLE", message: "The studio is away" } },
            { status: 503 },
          );
        return handle(request, tool[1]!);
      }
      return new Response("not found", { status: 404 });
    },
  });
  db.origin = `http://127.0.0.1:${server.port}`;
  return server;
}
