import { describe, expect, test } from "bun:test";
import {
  animationInputs,
  animationPrompt,
  anchorFor,
  canStart,
  editInputs,
  failed,
  finished,
  frameRoles,
  letteringTaskParams,
  newRecipe,
  nextForPerson,
  nextWorkerStep,
  NO_LETTERING,
  plateTaskParams,
  recipeOf,
  recipeStatus,
  recipeView,
  retried,
  started,
  upToDate,
  withLanding,
  withMask,
  type CleanPlateRecipe,
  type PlateStep,
} from "../../src/lib/media/clean-plate";
import type { ModelRegistryEntry } from "../../src/lib/model-schema";

const AT = "2026-10-22T10:00:00.000Z";

function recipe(): CleanPlateRecipe {
  return newRecipe({
    title: "Aurixa logo",
    art: { assetId: "art", width: 2000, height: 1333 },
    boxes: [{ x: 0.28, y: 0.7, w: 0.44, h: 0.14 }],
    lettering: null,
    source: "ai",
  });
}

/** A step started and finished with a file, as its job would. */
function done(state: CleanPlateRecipe, step: PlateStep, assetId: string): CleanPlateRecipe {
  const job =
    step === "edit" || step === "animate"
      ? { generationId: `g-${assetId}` }
      : { taskId: `t-${assetId}` };
  return finished(
    started(state, step, { attempt: state.steps[step].attempt + 1, ...job, at: AT }),
    step,
    {
      assetId,
      at: AT,
    },
  );
}

function model(output: "image" | "video", inputs: { role: string; type: "image" | "video" }[]) {
  return {
    id: `model-${output}`,
    output_type: output,
    capabilities: { inputs: inputs.map((input) => ({ ...input, param: input.role })) },
  } as unknown as ModelRegistryEntry;
}

describe("the clean-plate recipe", () => {
  test("it starts with its mask proposed, nothing made, the spread 2% of the art's shorter side", () => {
    const state = recipe();
    expect(state.mask.revision).toBe(0);
    expect(state.mask.grow).toBe(27);
    expect(state.mask.feather).toBe(27);
    expect(Object.values(state.steps).every((step) => step.status === "waiting")).toBe(true);
    expect(nextWorkerStep(state)).toBeNull();
    expect(recipeStatus(state)).toBe("waiting");
    expect(nextForPerson(state)).toBe("Check the boxes over the lettering, then use the mask.");
  });

  test("once a person uses the mask it is drawn; the blend waits for the edit, the take for the plate", () => {
    let state = withMask(recipe(), {});
    expect(state.mask.revision).toBe(1);
    expect(nextWorkerStep(state)).toBe("mask");
    expect(canStart(state, "animate")).toEqual({
      ok: false,
      reason: "Make the clean plate first: use the mask, make the edit, and let it blend.",
    });
    state = done(state, "mask", "mask-1");
    expect(nextWorkerStep(state)).toBeNull();
    expect(nextForPerson(state)).toBe("Make the edit that takes the lettering out of the art.");
    expect(canStart(state, "edit")).toEqual({ ok: true });
    state = done(state, "edit", "edit-1");
    expect(nextWorkerStep(state)).toBe("blend");
    state = done(state, "blend", "plate-1");
    expect(nextWorkerStep(state)).toBeNull();
    expect(canStart(state, "animate")).toEqual({ ok: true });
    state = done(state, "animate", "take-1");
    expect(nextWorkerStep(state)).toBe("align");
    state = done(state, "align", "aligned-1");
    expect(nextWorkerStep(state)).toBe("overlay");
    state = done(state, "overlay", "final-1");
    expect(nextWorkerStep(state)).toBeNull();
    expect(recipeStatus(state)).toBe("completed");
    expect(nextForPerson(state)).toBe(
      "Done: the lettering is laid back over the take, exactly as supplied.",
    );
  });

  test("a step being made holds the ones after it, and a billed one can't be started twice", () => {
    let state = done(withMask(recipe(), {}), "mask", "mask-1");
    state = started(state, "edit", { attempt: 1, generationId: "g-1", at: AT });
    expect(canStart(state, "edit")).toEqual({
      ok: false,
      reason: "The lettering taken out is being made. Wait for it to finish.",
    });
    expect(recipeStatus(state)).toBe("running");
    state = finished(state, "edit", { assetId: "edit-1", at: AT });
    state = started(state, "blend", { attempt: 1, taskId: "t-1", at: AT });
    expect(nextWorkerStep(state)).toBeNull();
  });

  test("a new mask is drawn and blended again, and the take put on the new plate and lettered again; the take itself is kept", () => {
    let state = withMask(recipe(), {});
    for (const [step, id] of [
      ["mask", "mask-1"],
      ["edit", "edit-1"],
      ["blend", "plate-1"],
      ["animate", "take-1"],
      ["align", "aligned-1"],
      ["overlay", "final-1"],
    ] as const)
      state = done(state, step, id);
    state = withMask(state, { grow: 40, boxes: [{ x: 0.25, y: 0.68, w: 0.5, h: 0.18 }] });
    expect(state.mask.source).toBe("person");
    expect(recipeStatus(state)).toBe("waiting");
    const order: PlateStep[] = [];
    for (let step = nextWorkerStep(state); step; step = nextWorkerStep(state)) {
      order.push(step);
      state = done(state, step, `${step}-2`);
    }
    expect(order).toEqual(["mask", "blend", "align", "overlay"]);
    // The take was made from the first plate: it is kept (it was paid for), and says so.
    expect(state.steps.animate.assetId).toBe("take-1");
    expect(upToDate(state, "animate")).toBe(false);
    expect(recipeStatus(state)).toBe("completed");
  });

  test("a step that failed waits for a person, and then starts again", () => {
    let state = done(done(withMask(recipe(), {}), "mask", "mask-1"), "edit", "edit-1");
    state = started(state, "blend", { attempt: 1, taskId: "t-1", at: AT });
    state = failed(
      state,
      "blend",
      { code: "RENDER_FAILED", message: "The edit couldn't be read" },
      AT,
    );
    expect(nextWorkerStep(state)).toBeNull();
    expect(recipeStatus(state)).toBe("failed");
    expect(nextForPerson(state)).toBe(
      "The clean plate failed: The edit couldn't be read. Try it again.",
    );
    state = retried(state, "blend");
    expect(nextWorkerStep(state)).toBe("blend");
    // A new edit is new to it too: it starts again by itself.
    state = failed(
      started(state, "blend", { attempt: 2, taskId: "t-2", at: AT }),
      "blend",
      { code: "X", message: "no" },
      AT,
    );
    state = done(state, "edit", "edit-2");
    expect(nextWorkerStep(state)).toBe("blend");
  });

  test("the take's landing is kept within the worker's limits and decides the alignment's anchor", () => {
    const state = withLanding(recipe(), { end: "both", crossSeconds: 9, holdSeconds: -1 });
    expect(state.landing).toEqual({ end: "both", crossSeconds: 3, holdSeconds: 0 });
    expect(anchorFor("first")).toBe("first");
    expect(anchorFor("last")).toBe("last");
    expect(anchorFor("both")).toBe("last");
  });
});

describe("its generations", () => {
  const kling = model("video", [
    { role: "source", type: "image" },
    { role: "last_frame", type: "image" },
  ]);
  const wan = model("video", [{ role: "source", type: "image" }]);
  const textOnly = model("video", []);
  const editor = model("image", [{ role: "image", type: "image" }]);

  test("the plate goes in as the take's first frame, its last, or both", () => {
    expect(frameRoles(kling)).toEqual({ first: "source", last: "last_frame" });
    expect(animationInputs(kling, "plate", "both")).toEqual({
      ok: true,
      inputs: [
        { assetId: "plate", role: "source", position: 0 },
        { assetId: "plate", role: "last_frame", position: 1 },
      ],
    });
    expect(animationInputs(kling, "plate", "last")).toEqual({
      ok: true,
      inputs: [{ assetId: "plate", role: "last_frame", position: 0 }],
    });
    expect(animationInputs(wan, "plate", "first")).toEqual({
      ok: true,
      inputs: [{ assetId: "plate", role: "source", position: 0 }],
    });
  });

  test("a model that can't take the plate where it must go is refused, saying what would", () => {
    expect(animationInputs(wan, "plate", "last")).toEqual({
      ok: false,
      reason:
        "That model can't be given the picture to end on. Choose one with an end frame, or start the take on the plate.",
    });
    expect(animationInputs(textOnly, "plate", "first")).toEqual({
      ok: false,
      reason: "That model doesn't start from a picture. Choose another.",
    });
    expect(animationInputs(editor, "plate", "first")).toEqual({
      ok: false,
      reason: "Choose a video model to animate the plate.",
    });
  });

  test("the edit takes the art in the image model's picture", () => {
    expect(editInputs(editor, "art")).toEqual({
      ok: true,
      inputs: [{ assetId: "art", role: "image", position: 0 }],
    });
    expect(editInputs(kling, "art")).toEqual({
      ok: false,
      reason: "Choose an image model to make the edit.",
    });
    expect(editInputs(model("image", []), "art")).toEqual({
      ok: false,
      reason: "That model doesn't take a picture to edit. Choose another.",
    });
  });

  test("the video model is always told to draw no lettering, once", () => {
    expect(animationPrompt("A slow highlight glides along the emblem")).toBe(
      `A slow highlight glides along the emblem. ${NO_LETTERING}`,
    );
    expect(animationPrompt("The orb breathes.")).toBe(`The orb breathes. ${NO_LETTERING}`);
    expect(animationPrompt(`Calm. ${NO_LETTERING}`)).toBe(`Calm. ${NO_LETTERING}`);
    expect(animationPrompt("  ")).toBe(NO_LETTERING);
  });
});

describe("what the media worker is asked", () => {
  test("the plate's mask in the art's pixels, and the letters' mask half as far out", () => {
    const state = withMask(
      newRecipe({
        title: "Logo",
        art: { assetId: "art", width: 2000, height: 1333 },
        boxes: [{ x: 0.28, y: 0.7, w: 0.44, h: 0.14 }],
        lettering: { assetId: "letters", x: 0.25, y: 0.65, w: 0.5, h: 0.2 },
        source: "file",
      }),
      { grow: 45, feather: 14 },
    );
    expect(plateTaskParams(state, "plate")).toEqual({
      output: "plate",
      boxes: [{ x: 560, y: 933, w: 880, h: 187 }],
      lettering_rect: { x: 500, y: 866, w: 1000, h: 268 },
      grow: 45,
      feather: 14,
    });
    expect(letteringTaskParams(state)).toEqual({
      letters: "art",
      boxes: [{ x: 560, y: 933, w: 880, h: 187 }],
      lettering_rect: { x: 500, y: 866, w: 1000, h: 268 },
      grow: 23,
      feather: 9.1,
    });
  });
});

describe("as it is kept and shown", () => {
  test("what isn't a recipe reads as none; one kept reads back whole", () => {
    expect(recipeOf(null)).toBeNull();
    expect(recipeOf({ version: 2 })).toBeNull();
    const kept = JSON.parse(JSON.stringify(withMask(recipe(), {})));
    delete kept.steps.overlay;
    const back = recipeOf(kept)!;
    expect(back.steps.overlay.status).toBe("waiting");
    expect(back.mask.revision).toBe(1);
  });

  test("the view lists the six steps in order, the billed two marked", () => {
    const view = recipeView("r-1", done(withMask(recipe(), {}), "mask", "mask-1"));
    expect(view.steps.map((step) => [step.step, step.billed, step.status, step.upToDate])).toEqual([
      ["mask", false, "completed", true],
      ["edit", true, "waiting", false],
      ["blend", false, "waiting", false],
      ["animate", true, "waiting", false],
      ["align", false, "waiting", false],
      ["overlay", false, "waiting", false],
    ]);
    expect(view.next).toBe("Make the edit that takes the lettering out of the art.");
  });
});
