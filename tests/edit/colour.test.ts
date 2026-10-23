import { describe, expect, test } from "bun:test";
import {
  asImage,
  handedOver,
  handedOverHex,
  matrixOf,
  matrixOver,
  overlayTo,
  RENDER_TO_JPEG,
  SCRIPT_MATRIX,
  scriptForDrawing,
  STILL_TO_BT709,
  toMatrix,
  videoToBt709,
  ycbcrOf,
  // @ts-expect-error The media worker is plain JavaScript.
} from "../../media-worker/src/colour.js";
// @ts-expect-error The media worker is plain JavaScript.
import { deltaE } from "../../media-worker/src/quality.js";
import {
  clipArgs,
  finalArgs,
  planSequence,
  buildSubtitles,
  squaredSource,
  // @ts-expect-error The media worker is plain JavaScript.
} from "../../media-worker/src/sequence.js";

type Rgb = [number, number, number];

/** What a player shows for a limited-range Y, Cb, Cr read with BT.709's matrix. */
function shown709([y, cb, cr]: number[]): Rgb {
  const [Y, Cb, Cr] = [(y! - 16) / 219, (cb! - 128) / 224, (cr! - 128) / 224];
  const r = Y + 1.5748 * Cr;
  const b = Y + 1.8556 * Cb;
  const g = (Y - 0.2126 * r - 0.0722 * b) / 0.7152;
  return [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as Rgb;
}

/** A colour as a drawing in `matrix` writes it into a picture (8-bit, rounded). */
function drawn(rgb: Rgb, matrix: string) {
  return (ycbcrOf(rgb, matrix) as number[]).map(Math.round);
}

const BRAND: Record<string, Rgb> = {
  teal: [0, 168, 181],
  red: [225, 29, 72],
  green: [22, 163, 74],
  gold: [200, 155, 60],
  navy: [16, 32, 64],
  cream: [245, 236, 214],
};

describe("colours handed over to a drawing", () => {
  test("a brand's colour, drawn in BT.601 as FFmpeg draws, plays back in BT.709 as itself", () => {
    for (const [name, rgb] of Object.entries(BRAND)) {
      const plain = deltaE(shown709(drawn(rgb, "bt601")), rgb);
      const handed = deltaE(shown709(drawn(handedOver(rgb, "bt601"), "bt601")), rgb);
      expect({ name, close: handed <= 0.6 }).toEqual({ name, close: true });
      // And it was worth doing: the colour drawn as it is plays back visibly off.
      if (name !== "gold" && name !== "cream" && name !== "navy") expect(plain).toBeGreaterThan(3);
    }
  });

  test("greys are the same in either matrix, and nothing changes when the drawing is BT.709", () => {
    for (const grey of [0, 16, 128, 235, 255])
      expect(handedOver([grey, grey, grey], "bt601")).toEqual([grey, grey, grey]);
    expect(handedOver(BRAND.teal, "bt709")).toEqual(BRAND.teal);
    expect(handedOverHex("#00a8b5", "bt709")).toBe("#00a8b5");
    expect(handedOverHex("#00a8b5", "bt601")).toBe("#0fb9b3");
  });

  test("into a BT.601 picture, a BT.601 drawing needs nothing", () => {
    expect(handedOver(BRAND.red, "bt601", "bt601")).toEqual(BRAND.red);
  });

  test("a script's colours are handed over, its alphas, drawings and words left as they were", () => {
    const script = [
      "[Script Info]",
      SCRIPT_MATRIX,
      "Style: Caption,Inter,40,&H00B5A800,&H000000FF,&H59000000,&H80FFFFFF,-1,0,0,0,100,100,0,0,3,8,0,2,10,10,10,1",
      "Dialogue: 0,0:00:00.00,0:00:01.00,Caption,,0,0,0,,{\\1c&HB5A800&\\3c&H000000&\\4a&H80&\\alpha&H20&\\clip(0,0,10,10)}Teal {\\c&H483DE1&}red",
      "Dialogue: 0,0:00:00.00,0:00:01.00,Caption,,0,0,0,,{\\p1}m 0 0 l 16 0 16 16 0 16{\\p0}",
    ].join("\n");
    const out = scriptForDrawing(script, "bt601").split("\n");
    expect(out[1]).toBe(SCRIPT_MATRIX);
    // Teal (BBGGRR B5A800) and red handed over, each keeping its alpha; black and white are unchanged.
    expect(out[2]).toBe(
      "Style: Caption,Inter,40,&H00B3B90F,&H000200E9,&H59000000,&H80FFFFFF,-1,0,0,0,100,100,0,0,3,8,0,2,10,10,10,1",
    );
    expect(out[3]).toContain(
      "{\\1c&HB3B90F&\\3c&H000000&\\4a&H80&\\alpha&H20&\\clip(0,0,10,10)}Teal {\\c&H",
    );
    expect(out[3]).not.toContain("483DE1");
    expect(out[3]!.endsWith("&}red")).toBe(true);
    expect(out[4]).toBe(script.split("\n")[4]);
    expect(scriptForDrawing(script, "bt709")).toBe(script);
  });
});

describe("pictures brought into BT.709", () => {
  test("a picture's matrix: its tags', a still's own BT.601, a player's guess for an untagged video", () => {
    expect(matrixOf({ color_space: "bt709", width: 640, height: 480 })).toBe("bt709");
    expect(matrixOf({ color_space: "smpte170m", width: 1920, height: 1080 })).toBe("bt601");
    expect(matrixOf({ color_space: "bt470bg" })).toBe("bt601");
    expect(matrixOf({ pix_fmt: "yuv420p", format: "webp_pipe", width: 1024, height: 1024 })).toBe(
      "bt601",
    );
    expect(matrixOf({ pix_fmt: "yuv420p", width: 1080, height: 1920 })).toBe("bt709");
    expect(matrixOf({ pix_fmt: "yuv420p", width: 1280, height: 720 })).toBe("bt709");
    expect(matrixOf({ pix_fmt: "yuv420p", width: 720, height: 576 })).toBe("bt601");
    // HDR's BT.2020 is beyond a matrix: an HD one is taken as it comes.
    expect(matrixOver({ color_space: "bt2020nc", width: 3840, height: 2160 })).toBe("bt709");
    expect(matrixOver({ color_space: "fcc" })).toBe("bt709");
    expect(matrixOver({ color_space: "smpte170m" })).toBe("bt601");
  });

  test("a video is converted only when it isn't BT.709 at limited range already", () => {
    expect(
      videoToBt709({ pix_fmt: "yuv420p", color_space: "bt709", width: 1080, height: 1920 }),
    ).toBeNull();
    expect(videoToBt709({ pix_fmt: "yuv420p10le", width: 1080, height: 1920 })).toBeNull();
    // A motion graphic's lossless master, an animation's palette, a grey picture.
    for (const pix_fmt of ["bgr0", "rgb24", "gbrp", "pal8", "rgba64le", "gray"])
      expect(videoToBt709({ pix_fmt })).toBe("out_color_matrix=bt709:out_range=tv");
    expect(
      videoToBt709({ pix_fmt: "yuv420p", color_space: "smpte170m", width: 1920, height: 1080 }),
    ).toBe("in_color_matrix=bt601:in_range=tv:out_color_matrix=bt709:out_range=tv");
    expect(videoToBt709({ pix_fmt: "yuvj422p", width: 1920, height: 1080 })).toBe(
      "in_color_matrix=bt709:in_range=pc:out_color_matrix=bt709:out_range=tv",
    );
    expect(toMatrix({ pix_fmt: "rgba", format: "png_pipe" }, "bt601")).toBe(
      "out_color_matrix=bt601:out_range=tv",
    );
    expect(
      toMatrix({ pix_fmt: "yuvj420p", color_space: "bt470bg", format: "jpeg_pipe" }, "bt709"),
    ).toBe("in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv");
    expect(STILL_TO_BT709).toBe("in_color_matrix=bt601:out_color_matrix=bt709:out_range=tv");
    expect(overlayTo("bt601")).toBe(
      "scale=in_color_matrix=bt601:out_color_matrix=bt601:out_range=tv,format=yuva444p",
    );
  });

  test("a frame taken out is read as a player shows it, in its image format's own colour", () => {
    const hd = { pix_fmt: "yuv420p", width: 1080, height: 1920 };
    expect(asImage(hd, "jpg")).toBe(
      "in_color_matrix=bt709:in_range=tv:out_color_matrix=bt601:out_range=pc",
    );
    expect(asImage(hd, "webp")).toBe(
      "in_color_matrix=bt709:in_range=tv:out_color_matrix=bt601:out_range=tv",
    );
    expect(asImage(hd, "png")).toBe("in_color_matrix=bt709:in_range=tv");
    expect(RENDER_TO_JPEG).toBe(asImage(hd, "jpg"));
    // A JPEG read as the BT.601 at full range it is.
    expect(
      asImage({ pix_fmt: "yuvj420p", color_space: "bt470bg", format: "jpeg_pipe" }, "png"),
    ).toBe("in_color_matrix=bt601:in_range=pc");
  });
});

describe("a render's colour", () => {
  const sources = [
    { path: "still.png", role: "image" },
    { path: "motion.mkv", role: "video" },
    { path: "logo.png", role: "image" },
  ];
  const plan = planSequence(
    {
      width: 720,
      height: 1280,
      fps: 25,
      clips: [
        { source_index: 0, kind: "image", duration: 1 },
        { source_index: 1, duration: 1, transition: { type: "fade", duration: 0.2 } },
        { source_index: 0, kind: "image", duration: 1, motion: "zoom_in" },
      ],
      images: [{ source_index: 2, start: 0, end: 1, x: 0.5, y: 0.25, width: 0.25 }],
      overlays: [{ start: 1, end: 2, text: "GO", style: "cta", accent: "#00a8b5" }],
    },
    sources,
  );
  const graph = (args: string[]) => args[args.indexOf("-filter_complex") + 1]!;
  const tags = "-color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709";

  test("a still's picture is brought into BT.709 before it is encoded, with motion or without", () => {
    for (const clip of [plan.clips[0], plan.clips[2]]) {
      const args = clipArgs(clip, plan, "still.png", false, "clip.mkv") as string[];
      expect(graph(args)).toContain(`[framed]scale=${STILL_TO_BT709},format=yuv444p,`);
      expect(args.join(" ")).toContain(`-pix_fmt yuv420p ${tags}`);
    }
  });

  test("a video's picture is converted by its probe: a motion graphic's RGB master is, a BT.709 camera's isn't", () => {
    const master = graph(
      clipArgs(plan.clips[1], plan, "motion.mkv", false, "clip.mkv", null, 25, {
        pix_fmt: "bgr0",
        width: 720,
        height: 1280,
      }) as string[],
    );
    expect(master).toContain(
      "[0:v]scale=trunc(iw*sar/2)*2:ih:out_color_matrix=bt709:out_range=tv,format=yuv444p,setsar=1,",
    );
    const camera = graph(
      clipArgs(plan.clips[1], plan, "camera.mp4", false, "clip.mkv", null, 25, {
        pix_fmt: "yuv420p",
        color_space: "bt709",
        width: 1080,
        height: 1920,
      }) as string[],
    );
    expect(camera).toContain("[0:v]scale=trunc(iw*sar/2)*2:ih,setsar=1,");
    // Unprobed (as before), it is taken as it comes: nothing known of it, it is BT.709.
    expect(squaredSource(null)).toBe("scale=trunc(iw*sar/2)*2:ih,setsar=1");
    expect(matrixOf(null)).toBe("bt709");
  });

  test("the final pass lays logos over in BT.709, tags the picture before drawing text into it, and says it is BT.709", () => {
    const args = finalArgs(
      plan,
      ["a.mkv", "b.mkv", "c.mkv"],
      "mix.wav",
      "text.drawn.ass",
      null,
      "out.mp4",
      ["logo.png"],
    ) as string[];
    const lines = graph(args);
    expect(lines).toContain(`colorchannelmixer=aa=1.000,${overlayTo("bt709")},loop=loop=-1:size=1`);
    expect(lines).toContain(
      "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,ass=filename=text.drawn.ass",
    );
    expect(args.join(" ")).toContain(`-g 50 ${tags} -c:a aac`);
  });

  test("its script names the matrix its colours are for", () => {
    const script = buildSubtitles(plan) as string;
    expect(script.split("\n").slice(0, 8)).toContain(SCRIPT_MATRIX);
    expect(script).toContain("\\3c&HB5A800&\\4c&HB5A800&");
  });
});
