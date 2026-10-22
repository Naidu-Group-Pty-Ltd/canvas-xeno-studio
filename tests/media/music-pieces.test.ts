import { describe, expect, test } from "bun:test";
import { pieceCuts, pieceJoins, PIECES } from "../../src/lib/edit/pieces";
import { buildRenderRequest, parseTimeline } from "../../src/lib/edit/timeline";
// @ts-expect-error The media worker is plain JavaScript.
import { fitAudioToSources, mixArgs, planSequence } from "../../media-worker/src/sequence.js";
// @ts-expect-error The media worker is plain JavaScript.
import {
  MIN_PIECE_SECONDS,
  PIECE_CROSSFADE,
  PIECES_LIMIT,
  pieceParts,
  piecesReadEnd,
} from "../../media-worker/src/pieces.js";
// @ts-expect-error The media worker is plain JavaScript.
import { FEATURES } from "../../media-worker/src/tasks.js";

const SOURCES = [
  { role: "image", path: "/tmp/still.png" },
  { role: "audio", path: "/tmp/music.wav" },
  { role: "audio", path: "/tmp/voice.wav" },
];
// Reel 1's four pieces (pacing.json), the last cut at 130 s.
const PIECES_REEL = [
  { from: 0, to: 14.792595 },
  { from: 7.350339, to: 91.075722 },
  { from: 83.633466, to: 104.099671 },
  { from: 107.820799, to: 130 },
];

type Planned = {
  pieces?: Array<{ from: number; to: number }>;
  trimStart: number;
  loop: boolean;
  length: number;
  fadeIn: number;
  fadeOut: number;
};

function plan(audio: Array<Record<string, unknown>>, seconds = 140) {
  return planSequence(
    {
      width: 360,
      height: 640,
      fps: 30,
      clips: [{ source_index: 0, kind: "image", duration: seconds }],
      audio,
    },
    SOURCES,
  ) as { audio: Planned[]; clips: unknown[]; total: number };
}

describe("the media worker plays music in pieces", () => {
  test("it says so", () => {
    expect(FEATURES).toContain("music_pieces");
    // The app and the worker agree on the limits.
    expect(PIECES_LIMIT).toBe(PIECES.max);
    expect(MIN_PIECE_SECONDS).toBe(PIECES.minSeconds);
    expect(PIECE_CROSSFADE).toBe(PIECES.crossfade);
  });

  test("a track in pieces plays them in place of its trim and loop, as long as they run", () => {
    const [music] = plan([
      {
        source_index: 1,
        role: "music",
        trim_start: 30,
        loop: true,
        fade_out: 5,
        pieces: PIECES_REEL,
      },
    ]).audio;
    expect(music!.pieces).toEqual(PIECES_REEL);
    expect(music!.trimStart).toBe(0);
    expect(music!.loop).toBe(false);
    expect(music!.length).toBeCloseTo(140, 6);
    const short = plan([
      { source_index: 1, role: "music", fade_in: 3, pieces: [{ from: 10, to: 12 }] },
    ]);
    expect(short.audio[0]!.length).toBeCloseTo(2, 9);
    expect(short.audio[0]!.fadeIn).toBeCloseTo(1, 9);
  });

  test("validates every piece: music only, at most 64, each at least half a second, numbers", () => {
    const refused =
      (pieces: unknown, role = "music") =>
      () =>
        plan([{ source_index: 2, role, pieces }]);
    expect(refused([{ from: 0, to: 2 }], "voiceover")).toThrow("only music can play in pieces");
    expect(refused([])).toThrow("at least one piece");
    expect(refused("0-2")).toThrow("at least one piece");
    expect(
      refused(Array.from({ length: 65 }, (_, index) => ({ from: index, to: index + 1 }))),
    ).toThrow("at most 64 pieces");
    expect(refused([{ from: 1, to: 1.2 }])).toThrow("at least 0.5 s");
    expect(refused([{ from: "x", to: 2 }])).toThrow("from must be a number");
    expect(refused([{ from: -1, to: 2 }])).toThrow("between 0 and 86400");
    // A track without pieces plans as ever.
    expect(plan([{ source_index: 1, role: "music", trim_start: 3 }]).audio[0]!.trimStart).toBe(3);
  });

  test("reads the file once from its start, and cuts each piece from it in order", () => {
    const planned = plan([{ source_index: 1, role: "music", pieces: PIECES_REEL }]);
    const args = mixArgs(
      planned,
      ["/tmp/clip.mkv"],
      ["/tmp/music.wav"],
      "/tmp/mix.wav",
    ) as string[];
    const input = args.indexOf("/tmp/music.wav");
    // No seek: "-t", how far it reads, then the file.
    expect(args.slice(input - 3, input)).toEqual([
      "-t",
      piecesReadEnd(PIECES_REEL).toFixed(6),
      "-i",
    ]);
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    // Four pieces: each played alone in part, three joins of two crossfading halves, in order.
    expect(graph).toContain("asplit=10[pc0b0]");
    expect(graph).toContain("concat=n=7:v=0:a=1[pc0]");
    expect(graph.match(/amerge=inputs=2,pan=stereo\|c0=c0\+c2\|c1=c1\+c3/g)).toHaveLength(3);
    expect(graph.match(/curve=qsin/g)).toHaveLength(6);
    // The track's own chain goes on from the pieces: its length, gain and the rest.
    expect(graph).toContain("[pc0]asetpts=PTS-STARTPTS,aresample=48000");
    expect(graph).toContain("atrim=end=140.000000,volume=1");
  });

  test("one piece is a single cut", () => {
    const planned = plan([{ source_index: 1, role: "music", pieces: [{ from: 4, to: 64 }] }]);
    const args = mixArgs(
      planned,
      ["/tmp/clip.mkv"],
      ["/tmp/music.wav"],
      "/tmp/mix.wav",
    ) as string[];
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).not.toContain("asplit");
    expect(graph).toContain(
      "atrim=start=4.000000:end=64.000000,asetpts=PTS-STARTPTS,apad,atrim=end=60.000000[pc0]",
    );
  });

  test("cuts the pieces where the app's preview plays them", () => {
    const parts = pieceParts(PIECES_REEL) as Array<{
      kind: string;
      from?: number;
      to?: number;
      out?: { from: number; to: number };
      in?: { from: number; to: number };
    }>;
    const cuts = pieceCuts(PIECES_REEL);
    const joins = pieceJoins(PIECES_REEL);
    const crossfades = parts.filter((part) => part.kind === "join");
    expect(crossfades).toHaveLength(joins.length);
    crossfades.forEach((part, index) => {
      // The outgoing half ends where the app cuts the piece before; the incoming starts where it cuts the next.
      expect(part.out!.to).toBeCloseTo(cuts[index]!.to, 9);
      expect(part.in!.from).toBeCloseTo(cuts[index + 1]!.from, 9);
      expect(part.in!.to - part.in!.from).toBeCloseTo(PIECES.crossfade, 9);
    });
    // Played end to end, the parts last as long as the pieces.
    const total = parts.reduce(
      (sum, part) => sum + (part.kind === "alone" ? part.to! - part.from! : PIECE_CROSSFADE),
      0,
    );
    expect(total).toBeCloseTo(
      PIECES_REEL.reduce((sum, piece) => sum + piece.to - piece.from, 0),
      9,
    );
  });

  test("a piece outside its file is refused once the file has been measured", async () => {
    const [music] = plan([{ source_index: 1, role: "music", pieces: PIECES_REEL }]).audio;
    expect(await fitAudioToSources([music], async () => 272.3)).toEqual([music]);
    expect(await fitAudioToSources([music], async () => 129.8)).toEqual([music]);
    await expect(fitAudioToSources([music], async () => 100)).rejects.toThrow(
      "runs past the end of its recording",
    );
    // Unmeasured: played as planned.
    expect(await fitAudioToSources([music], async () => null)).toEqual([music]);
  });

  test("the app's render request plans in the worker as the timeline plays", () => {
    const timeline = parseTimeline({
      clips: [
        {
          id: "c",
          assetId: "aaaaaaaa-1111-4111-8111-111111111111",
          kind: "image",
          duration: 131.2,
        },
      ],
      audio: [
        {
          id: "m",
          assetId: "cccccccc-1111-4111-8111-111111111111",
          role: "music",
          pieces: PIECES_REEL,
          fadeOut: 1,
        },
      ],
    })!;
    const { sources, params } = buildRenderRequest(timeline);
    const planned = planSequence(params, [
      { role: "image", path: "/tmp/a" },
      { role: "audio", path: "/tmp/b" },
    ]) as { audio: Planned[] };
    expect(sources.map((source) => source.role)).toEqual(["image", "audio"]);
    expect(planned.audio[0]!.pieces).toEqual(PIECES_REEL);
    expect(planned.audio[0]!.length).toBeCloseTo(131.2, 6);
  });
});
