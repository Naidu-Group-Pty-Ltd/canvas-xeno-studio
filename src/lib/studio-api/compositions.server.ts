/**
 * The studio API's motion graphics (see ../compositions): the templates and
 * their settings, drawing one in a brand kit (a drawing made before is
 * returned at once: the same composition is never drawn twice), drawing one
 * moment of one as a still picture (a thumbnail or a cover in the brand's own
 * type), following a drawing, and setting the demo record a brand's product
 * screens read. They
 * follow the same steps as the Editor's motion graphic dialog, so a script
 * and a person drawing the same composition share one drawing.
 *
 * Drawing a motion graphic costs no provider credits (the studio's media
 * service draws it), so it needs the "edit" scope, not "generate".
 *
 * They join STUDIO_TOOLS in ./tools.server. See docs/studio-api.md and
 * docs/compositions.md.
 */
import { z } from "zod/v4";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { COMPOSITION_MAX_SECONDS } from "../compositions/spec";
import { demoRecordSchema } from "../compositions/demo";
import { RENDER_QUALITIES } from "../compositions/settings";
import { TEMPLATES, templateById } from "../compositions/templates";
import { TEMPLATE_GROUP_LABELS } from "../compositions/types";
import { ASPECT_RATIOS, frameSize, parseTimeline, RESOLUTIONS, type Fps } from "../edit/timeline";
import type { ApiScope } from "./tokens";
import type { ApiCaller } from "./tokens.server";
import type { StudioTool } from "./tools.server";

/** The same shape as tools.server's own `tool`, for operations kept beside it. */
function tool<S extends z.ZodType>(definition: {
  name: string;
  title: string;
  description: string;
  scope: ApiScope;
  readOnly?: boolean;
  input: S;
  run: (args: z.output<S>, caller: ApiCaller) => Promise<unknown>;
}): StudioTool {
  return {
    ...definition,
    readOnly: definition.readOnly ?? definition.scope === "read",
    run: (args, caller) => definition.run(definition.input.parse(args ?? {}), caller),
  };
}

const id = () => z.string().uuid();

async function activeMember(userId: string): Promise<void> {
  const { data } = await db.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "The token's owner is not an active team member");
}

const listMotionTemplates = tool({
  name: "list_motion_templates",
  title: "List the motion graphic templates",
  description:
    "The studio's motion graphic templates (the graphics kit Reel 1 was built from, brand cards, and product pages drawn from a brand's demo record): each one's id, version, what it draws, how long it may run, its settings (each with its kind, limits and what it means) and its default settings. Pass a template's id and settings to draw_motion_graphic. Text settings may name the brand's demo record as {{entity.field}}, e.g. {{record.title}}.",
  scope: "read",
  input: z.object({}),
  run: async (_args, caller) => {
    await activeMember(caller.userId);
    return TEMPLATES.map((template) => {
      const defaults = template.schema.safeParse({});
      return {
        id: template.id,
        version: template.version,
        title: template.title,
        description: template.description,
        group: TEMPLATE_GROUP_LABELS[template.group],
        seconds: template.duration,
        settings: template.fields,
        defaults: defaults.success ? defaults.data : {},
      };
    });
  },
});

const drawMotionGraphic = tool({
  name: "draw_motion_graphic",
  title: "Draw a motion graphic",
  description:
    "Draws a motion graphic from a template in a brand kit, at a frame and rate: a draft (once a frame, quick) or final (twice the size, eight drawings a frame over a 180° shutter, so moves blur as a camera's would). The same composition drawn before (same template, settings, kit, demo record, frame and quality) comes back at once with cached true. Give sequenceId to draw it at that edit's frame and rate, so its render reuses the drawing. Returns the drawing's renderId and status; get_motion_graphic follows it, and once completed its assetId is a library video. To put it in an edit, add a video clip playing that assetId with `composition` set to { spec, brandKitId, renderId, quality, renderedKey: null }; the edit's render then draws it final at the edit's frame.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    template: z.string().min(1).max(60),
    params: z.record(z.string(), z.unknown()).default({}),
    seconds: z
      .number()
      .min(0.5)
      .max(COMPOSITION_MAX_SECONDS)
      .optional()
      .describe("How long it runs (the template's default when left out)"),
    brandKitId: id().nullable().default(null).describe("null: the studio's own look"),
    quality: z.enum(RENDER_QUALITIES).default("draft"),
    sequenceId: id().optional().describe("Draw it at this edit's frame and rate"),
    aspectRatio: z.enum(ASPECT_RATIOS).default("9:16"),
    resolution: z.enum(RESOLUTIONS).default("1080p"),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
    projectId: id().nullable().default(null),
  }),
  run: async (args, caller) => {
    const template = templateById(args.template);
    if (!template)
      throw new AppError(
        "INVALID_PARAMETERS",
        `There is no motion graphic template called "${args.template}" (list_motion_templates has them)`,
      );
    let frame = { ...frameSize(args.aspectRatio, args.resolution), fps: args.fps as Fps };
    let projectId = args.projectId;
    if (args.sequenceId) {
      const { data: sequence } = await db
        .from("sequences")
        .select("timeline,project_id")
        .eq("id", args.sequenceId)
        .maybeSingle();
      const timeline = sequence ? parseTimeline(sequence.timeline) : null;
      if (!timeline) throw new AppError("INVALID_PARAMETERS", "That edit doesn't exist");
      frame = { ...frameSize(timeline.aspectRatio, timeline.resolution), fps: timeline.fps };
      projectId ??= sequence?.project_id ?? null;
    }
    const { startCompositionRender } = await import("../compositions/render.server");
    return startCompositionRender({
      userId: caller.userId,
      projectId,
      spec: {
        template: template.id,
        version: template.version,
        params: args.params,
        duration: args.seconds ?? template.duration.default,
      },
      brandKitId: args.brandKitId,
      quality: args.quality,
      width: frame.width,
      height: frame.height,
      fps: frame.fps,
    });
  },
});

const drawStill = tool({
  name: "draw_still",
  title: "Draw a still",
  description:
    "Draws one moment of a motion graphic as a picture twice the frame's size, in a brand kit: a 1080p 16:9 frame is a 3840 x 2160 PNG, a 9:16 one 2160 x 3840. Every letter is set by the page in the kit's own fonts, every image is a library file (a stage made by a model, the product's own screens, the logo), so nothing is lettered by a model. The cover template is made for it (a stage, the headline with its last word in the accent, the logo, the call to action and the product's screens leaning in depth); any template can be drawn this way. `at` is the moment (seconds; the end, where everything has arrived, when left out). The same still drawn before comes back at once with cached true. Returns the drawing's renderId; get_motion_graphic follows it, and once completed its assetId is a library picture. Read it back with check_text if it carries words a model drew.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    template: z.string().min(1).max(60).default("cover"),
    params: z.record(z.string(), z.unknown()).default({}),
    seconds: z
      .number()
      .min(0.5)
      .max(COMPOSITION_MAX_SECONDS)
      .optional()
      .describe("The composition's length (the template's default when left out)"),
    at: z.number().min(0).max(COMPOSITION_MAX_SECONDS).optional().describe("The moment drawn"),
    brandKitId: id().nullable().default(null).describe("null: the studio's own look"),
    aspectRatio: z.enum(ASPECT_RATIOS).default("16:9"),
    resolution: z
      .enum(RESOLUTIONS)
      .default("1080p")
      .describe("The frame it is laid out in; the picture is twice it"),
    projectId: id().nullable().default(null),
  }),
  run: async (args, caller) => {
    const template = templateById(args.template);
    if (!template)
      throw new AppError(
        "INVALID_PARAMETERS",
        `There is no motion graphic template called "${args.template}" (list_motion_templates has them)`,
      );
    const frame = frameSize(args.aspectRatio, args.resolution);
    const { startCompositionRender } = await import("../compositions/render.server");
    return startCompositionRender({
      userId: caller.userId,
      projectId: args.projectId,
      spec: {
        template: template.id,
        version: template.version,
        params: args.params,
        duration: args.seconds ?? template.duration.default,
      },
      brandKitId: args.brandKitId,
      quality: "still",
      stillAt: args.at ?? null,
      width: frame.width,
      height: frame.height,
      fps: 30,
    });
  },
});

const getMotionGraphic = tool({
  name: "get_motion_graphic",
  title: "Get a motion graphic's drawing",
  description:
    "A motion graphic's drawing (or a still's): its status (queued, drawing, joining, completed or failed), progress, stage, about how long it takes, the demo record fields its text names but the record lacks, and once completed the library video (assetId) an edit's clip plays, or for a still (quality still) the library picture, with how its frames were checked (checks and checksSummary: every drawing is kept once two captures of it agree, and a final drawing has a share of its frames drawn again by a browser of its own and put to the vote; recaptured, unsettled, voted, disagreed, replaced and unresolved). Also what was drawn: its spec, brand kit, frame and rate, and the hash that keeps it.",
  scope: "read",
  input: z.object({ renderId: id() }),
  run: async (args, caller) => {
    await activeMember(caller.userId);
    const { compositionRender } = await import("../compositions/render.server");
    return compositionRender(args.renderId);
  },
});

const setDemoRecord = tool({
  name: "set_demo_record",
  title: "Set a brand's demo record",
  description:
    "Sets the fictional record a brand kit's product screens show in motion graphics: what the screens say they are (label), its entities (each a key, a label and fields, each a key, a label and a value: {{entity.field}} in a template's text reads one) and its lists (a key, a label, columns and rows). Every motion graphic in that kit draws from it the next time it is drawn, so a rename is one call. null goes back to the studio's own fictional record. get_brand_kit returns the kit's record as demoRecord.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    brandKitId: id(),
    record: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe(
        "{ label, entities: [{ key, label, fields: [{ key, label, value }] }], lists: [{ key, label, columns, rows }] }, or null",
      ),
  }),
  run: async (args, caller) => {
    await activeMember(caller.userId);
    const checked = args.record === null ? null : demoRecordSchema.safeParse(args.record);
    if (checked && !checked.success)
      throw new AppError(
        "INVALID_PARAMETERS",
        `That demo record isn't valid: ${checked.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`)
          .join("; ")}`,
      );
    const record = checked ? checked.data : null;
    const { data, error } = await db
      .from("brand_kits")
      .update({ demo_record: record })
      .eq("id", args.brandKitId)
      .eq("is_archived", false)
      .select("id");
    if (error) {
      if (/demo_record/.test(error.message))
        throw new AppError(
          "INVALID_PARAMETERS",
          "Demo records need a database update (migration 0034_compositions). Ask an admin to apply it.",
        );
      throw new AppError("UNKNOWN", "The demo record couldn't be saved. Try again.");
    }
    if (!data?.length) throw new AppError("INVALID_PARAMETERS", "That brand kit doesn't exist");
    return { brandKitId: args.brandKitId, record };
  },
});

export const COMPOSITION_TOOLS: StudioTool[] = [
  listMotionTemplates,
  drawMotionGraphic,
  drawStill,
  getMotionGraphic,
  setDemoRecord,
];
