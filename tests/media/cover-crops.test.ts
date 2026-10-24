import { describe, expect, test } from "bun:test";
import { coverContent, gridCrop, gridCropText } from "../../src/lib/media/cover-crops";

/** A frame of `width` × `height` on Reel 2's ground (#040B16), RGBA, with what `paint` puts on it. */
function frame(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number] | null = () => null,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y) ?? [4, 11, 22];
      pixels.set([r, g, b, 255], (y * width + x) * 4);
    }
  return pixels;
}

// Reel 2's cover at a quarter of its size: 270 × 480, everything on it from y 48 to 375 (192 to 1,500).
const PASSPORT = (x: number, y: number): [number, number, number] | null =>
  y >= 48 && y < 376 && x >= 30 && x < 240 ? [201, 162, 39] : null;

describe("what is on a cover", () => {
  test("its box against the ground its edges are", () => {
    expect(coverContent(frame(270, 480, PASSPORT), 270, 480)).toEqual({
      top: 48,
      bottom: 376,
      left: 30,
      right: 240,
      ground: "#040b16",
    });
  });

  test("a glow on the ground is ground, and a speck or two isn't a picture", () => {
    const glow = (x: number, y: number): [number, number, number] | null => {
      if (PASSPORT(x, y)) return PASSPORT(x, y);
      // A soft glow, up to 18 levels brighter in the middle; and three stray pixels near the top.
      if ((x === 10 && y === 5) || (x === 200 && y === 8) || (x === 100 && y === 470))
        return [255, 255, 255];
      const fall = Math.max(0, 1 - Math.hypot(x - 135, y - 240) / 200);
      return [4 + 18 * fall, 11 + 18 * fall, 22 + 18 * fall];
    };
    const content = coverContent(frame(270, 480, glow), 270, 480)!;
    expect([content.top, content.bottom]).toEqual([48, 376]);
  });

  test("a picture with no plain ground fills its frame; an empty one has nothing on it", () => {
    let seed = 7;
    const noise = (): [number, number, number] => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = seed >>> 24;
      return [v, 255 - v, (v * 3) % 256];
    };
    expect(coverContent(frame(90, 160, noise), 90, 160)).toEqual({
      top: 0,
      bottom: 160,
      left: 0,
      right: 90,
      ground: null,
    });
    expect(coverContent(frame(90, 160), 90, 160)).toBeNull();
    expect(coverContent(new Uint8ClampedArray(10), 90, 160)).toBeNull();
  });

  test("RGB as well as RGBA", () => {
    const rgba = frame(54, 96, (x, y) => (y >= 20 && y < 60 ? [255, 255, 255] : null));
    const rgb = new Uint8Array(54 * 96 * 3);
    for (let index = 0; index < 54 * 96; index += 1)
      rgb.set(rgba.subarray(index * 4, index * 4 + 3), index * 3);
    expect(coverContent(rgb, 54, 96, 3)).toEqual(coverContent(rgba, 54, 96));
  });
});

describe("the profile grid's 3:4 crop", () => {
  test("Reel 2's cover: centred it cuts the top of the Passport, moved up it keeps it all", () => {
    // At full size: everything from 192 to 1,500, a 1,440 px crop centred from 240.
    const full = { top: 192, bottom: 1501, left: 120, right: 960 };
    const crop = gridCrop(full, 1080, 1920);
    expect(crop).toEqual({
      axis: "vertical",
      size: 1440,
      centred: 240,
      cuts: { before: 48, after: 0 },
      keepsAll: false,
      keepsAllFrom: 127,
    });
    expect(gridCropText(crop, { ...full, ground: "#040b16" })).toBe(
      "In the profile grid's 3:4 crop, centred, 48 px off the top of what is on it is cut. Moved to start 127 px down (in Instagram, Edit profile grid), it keeps all of it.",
    );
  });

  test("what the centred crop already keeps, what no crop can, and a cover that fills its frame", () => {
    const inside = gridCrop({ top: 300, bottom: 1600, left: 0, right: 1080 }, 1080, 1920);
    expect(inside).toMatchObject({ keepsAll: true, keepsAllFrom: 240 });
    expect(
      gridCropText(inside, { top: 300, bottom: 1600, left: 0, right: 1080, ground: "#000000" }),
    ).toBe("In the profile grid's 3:4 crop, centred, everything on it shows.");
    const tall = { top: 100, bottom: 1800, left: 0, right: 1080 };
    const over = gridCrop(tall, 1080, 1920);
    expect(over).toMatchObject({
      cuts: { before: 140, after: 120 },
      keepsAll: false,
      keepsAllFrom: null,
    });
    expect(gridCropText(over, { ...tall, ground: "#000000" })).toBe(
      "What is on it is larger than the profile grid's 3:4 crop (1440 px): centred, the crop cuts 140 px off the top and 120 px off the bottom of it, and some is cut wherever the crop is put.",
    );
    const photo = { top: 0, bottom: 1920, left: 0, right: 1080, ground: null };
    expect(gridCropText(gridCrop(photo, 1080, 1920), photo)).toBe(
      "It fills the frame, so the profile grid's 3:4 crop shows its middle 1440 px, from 240 px down.",
    );
  });

  test("near the frame's edge the move stops at it; a wide cover is cut at the sides; a 3:4 one isn't cut", () => {
    // Everything in the top 1,300 px: centred on it would start above the frame, so it starts at 0.
    expect(gridCrop({ top: 10, bottom: 1310, left: 0, right: 1080 }, 1080, 1920).keepsAllFrom).toBe(
      0,
    );
    const wide = gridCrop({ top: 0, bottom: 1080, left: 100, right: 700 }, 1920, 1080);
    expect(wide).toMatchObject({
      axis: "horizontal",
      size: 810,
      centred: 555,
      cuts: { before: 455, after: 0 },
    });
    // Centred on what is there it would start 5 px before the frame's edge: it starts at it.
    expect(wide.keepsAllFrom).toBe(0);
    expect(gridCrop({ top: 0, bottom: 1440, left: 0, right: 1080 }, 1080, 1440)).toMatchObject({
      axis: null,
      keepsAll: true,
    });
  });
});

describe("the Render panel's cover check", () => {
  test("closed, it is one button: the video is opened only once it is asked for", async () => {
    // Nothing stands in for the studio's client here: a module stood in for stays so for the rest of a run.
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { CoverCheck } = await import("../../src/components/editor/CoverCheck");
    const html = renderToStaticMarkup(
      createElement(CoverCheck, { assetId: "a", duration: 118.033, fps: 30, title: "Reel 2" }),
    );
    expect(html).toContain("Check a cover frame");
    expect(html).not.toContain("<video");
  });
});
