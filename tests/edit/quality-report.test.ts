import { describe, expect, mock, test } from "bun:test";
import {
  brandColoursOf,
  masteringNote,
  qualityLines,
  qualitySummary,
  readQualityReport,
  referenceNote,
  renderQualityOf,
  storedQualityOf,
} from "../../src/lib/edit/quality";
import { buildRenderRequest, parseTimeline } from "../../src/lib/edit/timeline";
// @ts-expect-error The media worker is plain JavaScript.
import { qualityChecks } from "../../media-worker/src/quality.js";

// The database, as a stand-in: what the render request reads, and what a report writes. (What the media
// service can do is given to the render request, so it needn't be asked here.)
const state = {
  asset: {
    id: "",
    width: 1080,
    height: 1920,
    duration_seconds: 10,
    mime_type: "video/mp4",
    metadata: {},
  },
  kit: {
    text_color: "#FFFFFF",
    accent_color: "#0832de",
    background_color: "#0b0c15",
    palette: [{ hex: "#0832de" }, { hex: "#c9a227" }],
  },
  /** The music library's rows for a track, with its bars as found. */
  music: [] as Record<string, unknown>[],
  updates: [] as { table: string; row: Record<string, unknown> }[],
  updateError: null as { code?: string; message: string } | null,
};
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "assets" ? state.asset : table === "brand_kits" ? state.kit : null,
            error: null,
          }),
          limit: async () => ({ data: table === "music_tracks" ? state.music : [], error: null }),
        }),
      }),
      update: (row: Record<string, unknown>) => ({
        eq: async () => {
          state.updates.push({ table, row });
          return { error: state.updateError };
        },
      }),
    }),
  },
}));
const { withRenderExtras } = await import("../../src/lib/edit/render-extras.server");
const { recordRenderQuality } = await import("../../src/lib/edit/quality.server");

const ASSET = "11111111-1111-4111-8111-111111111111";
const KIT = "22222222-2222-4222-8222-222222222222";
const MUSIC = "33333333-3333-4333-8333-333333333333";
state.asset.id = ASSET;

/** A measured report as the media service writes it, its checks judged by its own thresholds. */
function workerReport(overrides: Record<string, unknown> = {}) {
  const report: Record<string, unknown> = {
    version: 1,
    status: "measured",
    reference: "final_pass",
    intermediates: "standard",
    frames: 300,
    fps: 30,
    fidelity: {
      frames_measured: 300,
      every: 1,
      ssim_measure: "luma",
      ssim: {
        mean: 0.9963,
        min: 0.9931,
        worst: [{ frame: 120, time: 4, ssim: 0.9931, psnr_db: 41 }],
      },
      ssim_planes: { y: 0.9963, u: 0.9978, v: 0.9975, all: 0.9968 },
      psnr_db: { mean: 44.6, min: 41, worst: [{ frame: 120, time: 4, ssim: 0.981, psnr_db: 41 }] },
    },
    pixels: {
      every: 4,
      frames: 75,
      edges: { frames: 75, mean: 0.9723, min: 0.951, worst: { frame: 64, time: 2.133 } },
      colour: {
        flat_pixels: 100000,
        delta_e_2000: { mean: 0.12, p99: 0.9, max: 3, share_below_1: 0.99 },
      },
      brand_colours: [
        {
          hex: "#0832de",
          found: true,
          frames: 10,
          pixels: 9000,
          reference: "#0138e6",
          master: "#0138e5",
          delta_e_2000: 0.21,
          drawn_delta_e_2000: 1.78,
        },
        { hex: "#c9a227", found: false },
      ],
      banding: {
        windows: 400,
        gap_code_values: { p99: 0.42, max: 0.66 },
        worst: { frame: 30, time: 1 },
      },
    },
    captions: {
      status: "measured",
      planned: 3,
      missed: [{ caption: 2, start: 2.6, end: 4.2 }],
      missed_count: 1,
    },
    cuts: {
      planned: 2,
      judged: 2,
      missed: 1,
      cuts: [
        { clip: 2, frame: 60, time: 2, reads_as: "cut" },
        { clip: 3, frame: 150, time: 5, reads_as: "missed", found_at: 151, frames_off: 1 },
      ],
    },
    sync: { items: [{ item: 1, status: "measured", offset_ms: 0 }] },
    loudness: { integrated_lufs: -14, range_lu: 5.1, true_peak_dbtp: -1.6, target_lufs: -14 },
    ...overrides,
  };
  const checks = qualityChecks(report) as { result: string }[];
  return {
    ...report,
    checks,
    passes: checks.filter((check) => check.result === "pass").length,
    flags: checks.filter((check) => check.result === "flag").length,
  };
}

describe("a render's quality report", () => {
  test("the media service's report reads, every check in words, flags first", () => {
    const report = readQualityReport(workerReport())!;
    expect(report.status).toBe("measured");
    const lines = qualityLines(report);
    expect(lines[0]!.result).toBe("flag");
    const text = lines.map((entry) => entry.text).join("\n");
    expect(text).toContain(
      "Edges softened: 97.2% of their contrast kept (98.0% or more expected).",
    );
    expect(text).toContain("1 caption not on its planned frames: 0:02.6 to 0:04.2.");
    expect(text).toContain("The cut into clip 3 (at 0:05.0) lands 1 frame late.");
    expect(text).toContain("SSIM of its luma 0.9963 against its own reference (0.992 or more).");
    expect(text).toContain(
      "The brand's #0832de kept: CIEDE2000 0.21. The edit draws it CIEDE2000 1.78 from the kit's own value.",
    );
    expect(text).toContain(
      "The brand's #c9a227 isn't on screen as a flat area, so it wasn't checked.",
    );
    expect(text).toContain("Loudness -14.0 LUFS on its -14 LUFS target, range 5.1 LU.");
    expect(text).toContain("The voiceover is where it was placed (within 0 ms).");
    expect(qualitySummary(report)).toBe(
      `Measured every frame (300): 3 flags, ${report.passes} passed.`,
    );
    expect(referenceNote(report)).toContain("render as Master");
  });

  test("the music's attack at the cuts on its beats, in words", () => {
    const music = (cuts: Array<Record<string, unknown>>, status = "measured") =>
      readQualityReport(workerReport({ music: { status, cuts } }))!;
    const early = qualityLines(
      music([
        { clip: 2, time: 2, beat: 2, status: "measured", offset_ms: -1.5, from_cut_ms: -1.5 },
        { clip: 5, time: 22.04, beat: 22.03, status: "measured", offset_ms: -37, from_cut_ms: -47 },
        { clip: 6, time: 24, beat: 24, status: "measured", offset_ms: 26 },
      ]),
    );
    expect(early).toContainEqual({
      result: "flag",
      text: "The music's attack at the cut (at 0:22.0) comes 37 ms ahead of its beat (20 ms at most), and off its beat at 1 more cut.",
    });
    const on = qualityLines(
      music([{ clip: 2, time: 2, beat: 2, status: "measured", offset_ms: -1.5 }]),
    ).map((entry) => entry.text);
    expect(on).toContain("The music's attack on its beat at 1 cut (within 2 ms).");
    const none = qualityLines(music([], "no_cut_on_a_beat")).map((entry) => entry.text);
    expect(none).toContain("No cut falls on the music's beat, so its attack wasn't judged at any.");
    const runsOn = qualityLines(
      music([{ clip: 2, time: 2, beat: 2, status: "unclear", rise_db: 3 }]),
    ).map((entry) => entry.text);
    expect(runsOn).toContain(
      "The music runs on through the cuts on its beats, with no clear attack to judge at them.",
    );
  });

  test("a report measured before the luma reads as it was written: SSIM in RGB, on its own line", () => {
    // Kept on renders made before SSIM moved to the luma: its check carries its own limit (0.98).
    const older = readQualityReport({
      version: 1,
      status: "measured",
      frames: 300,
      fps: 30,
      fidelity: {
        frames_measured: 300,
        every: 1,
        ssim: { mean: 0.9893, min: 0.981 },
        psnr_db: { mean: 44.6, min: 41 },
      },
      checks: [{ id: "ssim", result: "pass", value: 0.9893, limit: 0.98 }],
      passes: 1,
      flags: 0,
    })!;
    expect(older.fidelity?.ssim_measure).toBeUndefined();
    expect(qualityLines(older).map((entry) => entry.text)).toEqual([
      "SSIM 0.9893 against its own reference (0.98 or more).",
    ]);
  });

  test("a sampled, a passed-through and an unmeasured render say so", () => {
    const sampled = readQualityReport(
      workerReport({
        fidelity: {
          frames_measured: 1800,
          every: 10,
          ssim: { mean: 0.99, min: 0.985 },
          psnr_db: { mean: 45, min: 42 },
        },
        captions: null,
        cuts: null,
      }),
    )!;
    expect(qualitySummary(sampled)).toMatch(/^Measured 1800 frames \(every 10th\)/);
    const through = readQualityReport({
      version: 1,
      status: "passed_through",
      checks: [],
      passes: 2,
      flags: 0,
    })!;
    expect(qualitySummary(through)).toBe(
      "Passed through untouched: the picture is the source file's own, packet for packet.",
    );
    expect(referenceNote(through)).toBeNull();
    const failed = readQualityReport({
      version: 1,
      status: "unmeasured",
      reason: "took too long",
    })!;
    expect(qualitySummary(failed)).toBe(
      "Not measured: measuring took too long. The video is as rendered.",
    );
    const master = readQualityReport(workerReport({ intermediates: "lossless" }))!;
    expect(referenceNote(master)).toBeNull();
  });

  test("anything else isn't a report", () => {
    for (const value of [
      null,
      "measured",
      {},
      { version: 1, status: "great" },
      { version: 1, status: "measured", checks: [{ id: "x", result: "maybe" }] },
    ])
      expect(readQualityReport(value)).toBeNull();
  });

  test("kept on the render, else read from the video's library record", () => {
    const report = workerReport();
    const metadata = { probe: { quality: report } };
    expect(renderQualityOf(null, metadata)?.flags).toBe(3);
    expect(renderQualityOf(workerReport({ status: "passed_through" }), metadata)?.status).toBe(
      "passed_through",
    );
    expect(renderQualityOf(null, { probe: {} })).toBeNull();
    // As the media service wrote it, every number kept.
    const stored = storedQualityOf(report, null)!;
    expect((stored.raw["fidelity"] as { ssim: { worst: unknown[] } }).ssim.worst).toHaveLength(1);
  });

  test("what a master did with its clips, and a pass-through, in words", () => {
    expect(
      masteringNote({ probe: { mastering: { lossless_clips: [1, 2], standard_clips: [] } } }),
    ).toBe("Master: every clip kept lossless, one fine encode.");
    expect(
      masteringNote({
        probe: {
          mastering: {
            lossless_clips: [1],
            standard_clips: [2, 3],
            needed_bytes: 6.5 * 1024 ** 3,
            budget_bytes: 4 * 1024 ** 3,
          },
        },
      }),
    ).toBe(
      "Master: 2 clips (2, 3) encoded the standard way first: lossless ones needed about 6.5 GB of the media service's 4.0 GB.",
    );
    expect(masteringNote({ probe: { pass_through: { used: true } } })).toBe(
      "Passed through as it is: the file is the source's own.",
    );
    expect(
      masteringNote({ probe: { pass_through: { used: false, reason: "it is rotated" } } }),
    ).toBe("It couldn't go out as it is: it is rotated.");
    expect(masteringNote({ probe: {} })).toBeNull();
  });

  test("a brand kit's own colours, each once", () => {
    expect(brandColoursOf(state.kit)).toEqual(["#ffffff", "#0832de", "#0b0c15", "#c9a227"]);
    expect(brandColoursOf({ text_color: "white", palette: "none" })).toEqual([]);
    expect(brandColoursOf(null)).toEqual([]);
  });
});

describe("what a render asks of the media service", () => {
  const edit = (overrides: Record<string, unknown> = {}) =>
    parseTimeline({
      clips: [{ id: "c1", assetId: ASSET, kind: "video", duration: 10, sourceDuration: 10 }],
      brandKitId: KIT,
      ...overrides,
    })!;

  test("measured with the kit's colours, and one finished video passed through", async () => {
    const timeline = edit();
    const request = await withRenderExtras(timeline, buildRenderRequest(timeline), [
      "mastering",
      "render_quality",
    ]);
    expect(request.params["pass_through"]).toBe(true);
    expect(request.params["measure"]).toEqual({
      brand_colours: ["#ffffff", "#0832de", "#0b0c15", "#c9a227"],
    });
  });

  test("where the music's beats fall, when the service can judge its attack at the cuts on them", async () => {
    // A track whose bars were found: 120 BPM, a beat every half second from 0.25 s.
    const beats = Array.from({ length: 40 }, (_, index) => 0.25 + index * 0.5);
    const bars = beats.filter((_, index) => index % 4 === 0);
    state.music = [
      {
        asset_id: MUSIC,
        structure: {
          bpm: 120,
          beats,
          beatsPerBar: 4,
          downbeats: bars,
          bars: bars.slice(0, -1),
          sections: [{ start: 0, end: 20, kind: "section", energy: 1 }],
          confidence: 1,
        },
        bar_features: {
          version: 1,
          loudness: bars.slice(0, -1).map(() => -12),
          bands: bars.slice(0, -1).map(() => [-20, -20, -20, -20, -20, -20]),
          chroma: bars.slice(0, -1).map(() => Array.from({ length: 12 }, (_, pc) => (pc ? 0 : 1))),
          rhythm: bars.slice(0, -1).map(() => [1, 0, 0.5, 0, 1, 0, 0.5, 0]),
        },
      },
    ];
    // Its music starts a second into the edit, from 0.5 s into the track: its beats from 0.75 s on.
    const timeline = edit({
      audio: [{ id: "m1", assetId: MUSIC, role: "music", start: 1, trimStart: 0.5 }],
    });
    const request = await withRenderExtras(timeline, buildRenderRequest(timeline), [
      "render_quality",
      "music_at_cuts",
    ]);
    const measure = request.params["measure"] as { music_beats: number[] };
    expect(measure.music_beats.slice(0, 3)).toEqual([1.25, 1.75, 2.25]);
    expect(measure.music_beats.every((beat) => beat <= 10)).toBe(true);
    // Not asked of a service that can't, nor for music whose bars haven't been found.
    const older = await withRenderExtras(timeline, buildRenderRequest(timeline), [
      "render_quality",
    ]);
    expect(older.params["measure"]).toEqual({
      brand_colours: ["#ffffff", "#0832de", "#0b0c15", "#c9a227"],
    });
    state.music = [];
    const unfound = await withRenderExtras(timeline, buildRenderRequest(timeline), [
      "render_quality",
      "music_at_cuts",
    ]);
    expect((unfound.params["measure"] as Record<string, unknown>)["music_beats"]).toBeUndefined();
  });

  test("an edit over its clip is only measured; a service without either is asked for neither", async () => {
    const titled = edit({ overlays: [{ id: "o1", text: "Hi", start: 0, end: 2 }] });
    const measuredOnly = await withRenderExtras(titled, buildRenderRequest(titled), [
      "mastering",
      "render_quality",
    ]);
    expect(measuredOnly.params["pass_through"]).toBeUndefined();
    expect(measuredOnly.params["measure"]).toBeDefined();
    const plain = edit();
    const before = buildRenderRequest(plain);
    const older = await withRenderExtras(plain, before, ["brand_text"]);
    expect(older).toBe(before);
  });

  test("a report is kept on the render, and before its migration left with the video", async () => {
    state.updates = [];
    state.updateError = null;
    await recordRenderQuality("r1", { quality: workerReport() });
    expect(state.updates[0]).toMatchObject({ table: "sequence_renders" });
    expect((state.updates[0]!.row["quality"] as { status: string }).status).toBe("measured");
    await recordRenderQuality("r1", { width: 1080 });
    expect(state.updates).toHaveLength(1);
    state.updateError = {
      code: "PGRST204",
      message: "Could not find the 'quality' column of 'sequence_renders' in the schema cache",
    };
    await recordRenderQuality("r1", { quality: workerReport() });
    state.updateError = { code: "08006", message: "connection failure" };
    await expect(recordRenderQuality("r1", { quality: workerReport() })).rejects.toThrow(
      /quality report/,
    );
    state.updateError = null;
  });
});
