import { describe, expect, test } from "bun:test";
import {
  followUpMessage,
  kickoffMessage,
  parsePresetInputs,
  parseResultLine,
  parseResumeLine,
  revisionMessage,
  visibleText,
} from "../../src/lib/katana/messages";

const IMAGE_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IMAGE_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VIDEO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("kickoffMessage", () => {
  test("a preset run reads like Higgsfield's own Katana form", () => {
    const message = kickoffMessage({
      mode: "preset",
      presetSlug: "power-suit",
      brief: "Make the suit navy",
      referenceUrl: null,
      inputs: [
        { field: "media.images", kind: "image", mediaId: IMAGE_1 },
        { field: "media.images", kind: "image", mediaId: IMAGE_2 },
      ],
      creditLimit: 300,
    });
    expect(message.split("\n\n")).toEqual([
      "/katana/power-suit",
      `MEDIA:\nmedia.images: image media_id=${IMAGE_1}\nmedia.images: image media_id=${IMAGE_2}`,
      'INPUTS:\nslot_values.prompt: "Make the suit navy"',
      "Credit limit for this run: 300 Higgsfield credits in total. This is the user's numeric budget for the whole run; the studio's credit guard enforces it.",
    ]);
  });

  test("a remix names its reference video and leaves out an empty brief", () => {
    const message = kickoffMessage({
      mode: "remix",
      presetSlug: null,
      brief: "  ",
      referenceUrl: null,
      inputs: [
        { field: "media.reference_video", kind: "video", mediaId: VIDEO },
        { field: "media.images", kind: "image", mediaId: IMAGE_1 },
      ],
      creditLimit: 250.5,
    });
    expect(message.startsWith("/katana\n\nMEDIA:\nmedia.reference_video: video media_id=")).toBe(
      true,
    );
    expect(message).not.toContain("INPUTS:");
    expect(message).toContain("250.5 Higgsfield credits");
  });

  test("a remix from a link puts the link in the request", () => {
    const message = kickoffMessage({
      mode: "remix",
      presetSlug: null,
      brief: "A sigma edit of our founder",
      referenceUrl: "https://www.tiktok.com/@a/video/1",
      inputs: [],
      creditLimit: 100,
    });
    expect(message).toContain("Reference video: https://www.tiktok.com/@a/video/1");
    expect(message).toContain('slot_values.prompt: "A sigma edit of our founder"');
  });

  test("an edit's brief is the request itself", () => {
    const message = kickoffMessage({
      mode: "edit",
      presetSlug: null,
      brief: "make a sigma edit out of it",
      referenceUrl: null,
      inputs: [{ field: "media.videos", kind: "video", mediaId: VIDEO }],
      creditLimit: 50,
    });
    expect(
      message.startsWith(
        "/katana make a sigma edit out of it\n\nMEDIA:\nmedia.videos: video media_id=",
      ),
    ).toBe(true);
    expect(message).not.toContain("INPUTS:");
  });

  test("a brief is written as a JSON string, so quotes and new lines stay intact", () => {
    const message = kickoffMessage({
      mode: "preset",
      presetSlug: "tiger-eyes",
      brief: 'Say "go"\nthen cut',
      referenceUrl: null,
      inputs: [],
      creditLimit: 10,
    });
    expect(message).toContain('slot_values.prompt: "Say \\"go\\"\\nthen cut"');
  });

  test("a preset run needs a valid slug", () => {
    expect(() =>
      kickoffMessage({
        mode: "preset",
        presetSlug: "../x",
        brief: "",
        referenceUrl: null,
        inputs: [],
        creditLimit: 1,
      }),
    ).toThrow();
  });
});

describe("follow-ups and revisions", () => {
  test("a follow-up is the person's words and any new media", () => {
    expect(followUpMessage({ text: "Make it shorter", inputs: [] })).toBe("Make it shorter");
    expect(
      followUpMessage({
        text: "Use this logo",
        inputs: [{ field: "media.images", kind: "image", mediaId: IMAGE_1 }],
      }),
    ).toBe(`Use this logo\n\nMEDIA:\nmedia.images: image media_id=${IMAGE_1}`);
  });

  test("a revision starts from Katana's own resume line", () => {
    const resume =
      "RESUME katana slug=power-suit state=https://x/state.tgz stage=delivered jobs=j1:completed";
    const message = revisionMessage({
      resumeLine: resume,
      text: "Brighter grade",
      inputs: [],
      creditLimit: 80,
    });
    expect(message.startsWith(`${resume}\n\n`)).toBe(true);
    expect(message).toContain("Brighter grade");
    expect(message).toContain("80 Higgsfield credits");
  });
});

describe("reading Katana's messages", () => {
  test("a delivered result line", () => {
    expect(
      parseResultLine(
        `Done!\nXENO_RESULT media_id=${VIDEO} url=https://cdn.higgsfield.ai/v/final.mp4`,
      ),
    ).toEqual({
      delivered: true,
      mediaId: VIDEO,
      url: "https://cdn.higgsfield.ai/v/final.mp4",
      reason: null,
    });
  });

  test("the last result line wins, and code formatting is tolerated", () => {
    const text = `XENO_RESULT media_id=${IMAGE_1}\nRevised.\n\`XENO_RESULT media_id=${VIDEO}\``;
    expect(parseResultLine(text)?.mediaId).toBe(VIDEO);
  });

  test("a stop without a video", () => {
    expect(parseResultLine("XENO_RESULT none reason=credit limit reached")).toEqual({
      delivered: false,
      mediaId: null,
      url: null,
      reason: "credit limit reached",
    });
  });

  test("no result line, or one with nothing usable", () => {
    expect(parseResultLine("All good")).toBeNull();
    expect(parseResultLine("XENO_RESULT media_id=nope")).toBeNull();
  });

  test("resume lines and visible text", () => {
    const text =
      "Stage done.\nRESUME katana slug=x state=https://s/1 stage=plan jobs=\nXENO_RESULT none reason=x";
    expect(parseResumeLine(text)).toBe("RESUME katana slug=x state=https://s/1 stage=plan jobs=");
    expect(parseResumeLine("no resume here")).toBeNull();
    expect(visibleText(text)).toBe(
      "Stage done.\nRESUME katana slug=x state=https://s/1 stage=plan jobs=",
    );
  });
});

describe("parsePresetInputs", () => {
  // From Higgsfield's /katana/power-suit instructions.
  const markdown = `# Katana preset: Power Suit (/katana/power-suit)

- Reference video: the preset's video, https://static-public-media.higgsfield.ai/katana-presets/131af3b6.mp4 (600×450).

## Inputs

The preset's form (field path, label, kind; required or optional):

- \`media.images\` ("Add your characters or other details", "Upload reference images of the elements you want to recreate or modify"): image files, 1–10; required
- \`slot_values.prompt\` ("Wishes (optional)", "Optional wishes about the inputs or the result. Keep the preset defaults unless a change is explicitly requested."): text; optional

---

## Katana: edit supplied media or remix a reference
- \`media.videos\` ("Not an input", "x"): video file; required
`;

  test("reads each field of the preset's form", () => {
    expect(parsePresetInputs(markdown)).toEqual([
      {
        field: "media.images",
        label: "Add your characters or other details",
        description: "Upload reference images of the elements you want to recreate or modify",
        kind: "image",
        min: 1,
        max: 10,
        required: true,
      },
      {
        field: "slot_values.prompt",
        label: "Wishes (optional)",
        description:
          "Optional wishes about the inputs or the result. Keep the preset defaults unless a change is explicitly requested.",
        kind: "text",
        min: 0,
        max: 1,
        required: false,
      },
    ]);
  });

  test("a single optional video", () => {
    const inputs = parsePresetInputs(
      '## Inputs\n- `media.reference_video` ("Your clip"): video file; optional',
    );
    expect(inputs).toEqual([
      {
        field: "media.reference_video",
        label: "Your clip",
        description: "",
        kind: "video",
        min: 0,
        max: 1,
        required: false,
      },
    ]);
  });

  test("no inputs section", () => {
    expect(parsePresetInputs("# Nothing here")).toEqual([]);
  });
});
