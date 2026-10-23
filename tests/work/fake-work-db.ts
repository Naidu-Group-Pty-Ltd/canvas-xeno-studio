import { FakeDb } from "../long-video/fake-db";
import { currentFiles } from "../../src/lib/work/model";

type Row = Record<string, unknown>;
type Answer = { data: unknown; error: unknown };
/** A function's answer as supabase-js gives it: awaitable, with select and range to chain. */
type RpcAnswer = Promise<Answer> & {
  select: () => RpcAnswer;
  range: (from: number, to: number) => RpcAnswer;
};

/**
 * The fake database with the work functions (0037_work_journal) answering as
 * told, and storage keeping objects in memory. What the functions themselves
 * do is checked against a real Postgres (tests/sql/work.sql); here, what the
 * API asks of them and how it reads their answers.
 */
export class WorkDb extends FakeDb {
  calls: { name: string; args: Row }[] = [];
  handlers = new Map<string, (args: Row) => unknown>();
  objects = new Map<string, { size: number; eTag: string }>();
  removed: string[] = [];

  override rpc(name: string, args: Row): RpcAnswer {
    this.calls.push({ name, args });
    const handler = this.handlers.get(name);
    const answer = handler
      ? { data: handler(args), error: null }
      : {
          data: null,
          error: { code: "PGRST202", message: `Could not find the function public.${name}` },
        };
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
        data: {
          signedUrl: `https://storage.test/object/upload/sign/work-files/${path}?token=t`,
          token: "t",
          path,
        },
        error: null,
      }),
      createSignedUrls: async (paths: string[]) => ({
        data: paths.map((path) => ({
          path,
          signedUrl: `https://storage.test/object/sign/work-files/${path}?token=d`,
          error: null,
        })),
        error: null,
      }),
      createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/file" } }),
      remove: async (paths: string[]) => {
        for (const path of paths) {
          this.removed.push(path);
          this.objects.delete(path);
        }
        return { error: null };
      },
    }),
  };
}

/** The functions answer as a saved work would: a new entry each time, the record's version moving on. */
export function answerSaves(db: WorkDb) {
  let version = 0;
  let entries = 0;
  db.handlers.set("work_save", (args) => {
    const changesRecord = !!args["p_state_patch"];
    if (changesRecord) version += 1;
    entries += 1;
    const files = ((args["p_files"] as Row[] | undefined) ?? []).map((file) => {
      db.add("work_files", {
        work_id: args["p_work_id"],
        path: file["path"],
        version: 1,
        deleted: !!file["deleted"],
        sha256: file["sha256"] ?? null,
        size: file["size"] ?? null,
        chunks: file["chunks"] ?? [],
        mime_type: file["mime_type"] ?? null,
        modified_at: null,
        executable: false,
        note: file["note"] ?? null,
        asset_id: null,
        entry_id: null,
      });
      return { path: file["path"], version: 1, sha256: file["sha256"], size: file["size"] };
    });
    return {
      found: true,
      duplicate: false,
      entryId: crypto.randomUUID(),
      n: entries,
      stateVersion: version,
      stateChanged: changesRecord,
      files,
      links: ((args["p_links"] as Row[] | undefined) ?? []).map((link) => ({
        kind: link["kind"],
        id: link["object_id"],
        role: link["role"],
        added: true,
      })),
      status: "active",
      hold: args["p_holder"] ? "held" : null,
    };
  });
  db.handlers.set("work_claim", () => ({
    found: true,
    claimed: true,
    entryId: crypto.randomUUID(),
    tookOver: false,
  }));
  db.handlers.set("work_release", () => ({ found: true, released: true }));
  db.handlers.set("work_files_now", (args) =>
    currentFiles(
      db.rows("work_files").filter((row) => row["work_id"] === args["p_work_id"]) as never[],
    ),
  );
}
