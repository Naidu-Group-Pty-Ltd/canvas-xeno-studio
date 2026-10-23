import { beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";

/** The admin client, with an output bucket whose files can be listed. */
class RecoveryDb extends FakeDb {
  /** What is in the output bucket: each file's path and size. */
  files = new Map<string, number>();
  override storage = {
    from: () => ({
      list: async (folder: string, options: { search?: string } = {}) => ({
        data: [...this.files.entries()]
          .filter(([path]) => path.slice(0, path.lastIndexOf("/")) === folder)
          .map(([path, size]) => ({
            name: path.slice(path.lastIndexOf("/") + 1),
            metadata: { size },
          }))
          .filter((file) => !options.search || file.name.includes(options.search)),
        error: null,
      }),
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://storage.test/${path}` },
        error: null,
      }),
    }),
  };
}

const db = new RecoveryDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Render = typeof import("../../src/lib/edit/render.server");
let render: Render;
beforeAll(async () => {
  render = await import("../../src/lib/edit/render.server");
});

const member = db.add("profiles", { is_active: true, role: "member", full_name: "Rugesh" });
const sequence = db.add("sequences", { title: "Reel 1", project_id: null, status: "rendering" });
const timeline = {
  aspectRatio: "9:16",
  clips: [
    { id: "c1", assetId: "44444444-4444-4444-8444-444444444444", kind: "video", duration: 2 },
  ],
};

/** A render whose worker uploaded its files, then never reported back. */
function lostRender(stems: string[]) {
  const renderId = crypto.randomUUID();
  const folder = `unassigned/${member["id"]}/edits/${sequence["id"]}`;
  const paths = [
    `${folder}/${renderId}.mp4`,
    `${folder}/${renderId}.jpg`,
    ...stems.map((role) => `${folder}/${renderId}-${role}.wav`),
  ];
  const task = db.add("media_tasks", {
    status: "processing",
    operation_id: null,
    project_id: null,
    created_by: member["id"],
    storage_bucket: "generated-assets",
    input_payload: {
      render_id: renderId,
      sequence_id: sequence["id"],
      storage_paths: paths,
      ...(stems.length ? { stems } : {}),
    },
  });
  db.add("sequence_renders", {
    id: renderId,
    sequence_id: sequence["id"],
    status: "failed",
    error_code: "STALLED",
    timeline,
    media_task_id: task["id"],
  });
  return { renderId, paths };
}

describe("a render recovered from storage", () => {
  test("keeps the stems that were uploaded, as the media service's report would have", async () => {
    const { renderId, paths } = lostRender(["voiceover", "music"]);
    // The video, its poster and the voiceover stem were uploaded; the music stem never was.
    db.files.set(paths[0]!, 4_000_000);
    db.files.set(paths[1]!, 60_000);
    db.files.set(paths[2]!, 900_000);

    const outcome = await render.recoverSequenceRender({
      renderId,
      userId: member["id"] as string,
    });
    expect(outcome).toEqual({ renderId, status: "completed", recovered: true });

    const kept = db.rows("assets").filter((asset) => asset["storage_path"] === paths[2]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      asset_type: "audio",
      mime_type: "audio/wav",
      file_size: 900_000,
      title: "Reel 1 · Voiceover stem",
    });
    expect(kept[0]!["metadata"]).toMatchObject({ stem: "voiceover", render_id: renderId });
    expect(db.rows("assets").some((asset) => asset["storage_path"] === paths[3])).toBe(false);

    const video = db.rows("assets").find((asset) => asset["storage_path"] === paths[0])!;
    expect(video["metadata"]).toMatchObject({
      probe: { recovered_from_storage: true },
      stems: [{ role: "voiceover", asset_id: kept[0]!["id"] }],
    });
    expect(db.find("sequence_renders", renderId)).toMatchObject({
      status: "completed",
      asset_id: video["id"],
    });
  });

  test("with no stems asked for, keeps the video and poster as before", async () => {
    const { renderId, paths } = lostRender([]);
    db.files.set(paths[0]!, 4_000_000);
    db.files.set(paths[1]!, 60_000);
    const outcome = await render.recoverSequenceRender({
      renderId,
      userId: member["id"] as string,
    });
    expect(outcome.recovered).toBe(true);
    const video = db.rows("assets").find((asset) => asset["storage_path"] === paths[0])!;
    expect(video["metadata"]).not.toHaveProperty("stems");
  });

  test("isn't finished while the video or poster is missing", async () => {
    const { renderId, paths } = lostRender(["voiceover"]);
    db.files.set(paths[0]!, 4_000_000);
    db.files.set(paths[2]!, 900_000);
    const outcome = await render.recoverSequenceRender({
      renderId,
      userId: member["id"] as string,
    });
    expect(outcome).toEqual({ renderId, status: "failed", recovered: false });
    expect(db.rows("assets").some((asset) => asset["storage_path"] === paths[2])).toBe(false);
  });
});
