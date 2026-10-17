import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelRegistryEntry } from "../../src/lib/model-schema";
import {
  cameraMovesIn,
  followsPresenterRecipe,
  lipSyncWarnings,
  PRESENTER_NEGATIVE_PROMPT,
  presenterPrompt,
  presenterValues,
} from "../../src/lib/lip-sync/presenter";

const registry = JSON.parse(
  readFileSync(join(import.meta.dir, "../../scripts/higgsfield/registry.json"), "utf8"),
) as ModelRegistryEntry[];
const wan27 = registry.find((row) => row.model_path === "wan/v2.7/image-to-video")!;

describe("the presenter recipe", () => {
  test("is the minimal prompt with a locked-off camera", () => {
    const prompt = presenterPrompt({ who: "The woman", where: "her office at dusk" });
    expect(prompt).toStartWith("The woman speaks directly to the camera in her office at dusk,");
    expect(prompt).toContain("locked off and never moves");
    expect(presenterPrompt({ where: "At the front desk." })).toStartWith(
      "The presenter speaks directly to the camera at the front desk,",
    );
    // Its own words never read as a camera move.
    expect(cameraMovesIn(prompt)).toEqual([]);
  });

  test("turns prompt extension off and adds its negative prompt after the person's own", () => {
    const values = presenterValues(wan27, { prompt_extend: true, negative_prompt: "blurry, Zoom" });
    expect(values["prompt_extend"]).toBe(false);
    expect(values["negative_prompt"]).toBe(
      `blurry, Zoom, ${PRESENTER_NEGATIVE_PROMPT.split(", ")
        .filter((term) => term !== "zoom")
        .join(", ")}`,
    );
    expect(followsPresenterRecipe(wan27, values)).toBe(true);
    expect(followsPresenterRecipe(wan27, { prompt_extend: true })).toBe(false);
    // A model without the settings is left as it is.
    const plain = { parameter_schema: { fields: [] } } as unknown as ModelRegistryEntry;
    expect(presenterValues(plain, { seed: 3 })).toEqual({ seed: 3 });
  });
});

describe("lip-sync guards", () => {
  test("find camera moves a story asks for", () => {
    expect(cameraMovesIn("A slow push-in as she speaks, then the camera pans left.")).toEqual([
      "push-in",
      "pan",
    ]);
    expect(cameraMovesIn("Handheld tracking shot through the office.")).toEqual([
      "moving camera",
      "handheld",
    ]);
    expect(cameraMovesIn("She explains the report. No zoom or dolly.")).toEqual([]);
  });

  test("warn of camera moves, keyframes and an unset recipe", () => {
    const warnings = lipSyncWarnings({
      story: "Slow push-in on Janice.",
      keyframed: true,
      model: wan27,
      values: { prompt_extend: true },
    });
    expect(warnings).toHaveLength(3);
    expect(
      lipSyncWarnings({
        story: presenterPrompt(),
        keyframed: false,
        model: wan27,
        values: presenterValues(wan27, {}),
      }),
    ).toEqual([]);
  });
});
