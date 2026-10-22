/**
 * The agent's tools for working in sections (see ./sections): planning a
 * reel in sections, giving them to workers, reading where they stand,
 * checking and fixing the joins between them, and, for a section's worker,
 * saving its shots and finishing.
 *
 * Built by ./agent-tools.server with its own helpers (so neither module
 * loads the other at start); the server's side is loaded when a tool runs.
 */
import { z } from "zod/v4";
import { AppError } from "../higgsfield/errors";
import type {
  AgentContext,
  AgentTool,
  assetUrl as assetUrlOf,
  ownTool as defineTool,
  resultText as asText,
} from "./agent-tools.server";
import {
  JOIN_KIND_LABELS,
  planReport,
  REEL_KIND_LABELS,
  REEL_KINDS,
  SECTION_LIMITS,
  type PlanView,
} from "./sections";

export interface SectionToolKit {
  ownTool: typeof defineTool;
  resultText: typeof asText;
  assetUrl: typeof assetUrlOf;
}

const uuid = () => z.string().uuid();

const sectionsUi = (view: PlanView) => ({
  type: "sections" as const,
  planId: view.id,
  title: view.title,
  sections: view.sections.length,
});

/** Planning is the planning conversation's: a worker works on its own section only. */
function planner(context: AgentContext): void {
  if (context.section)
    throw new AppError(
      "INVALID_PARAMETERS",
      "A section's worker works on its own section only: save its shots with save_section and finish with finish_section.",
    );
}

/** Saving and finishing are a worker's. */
function worker(context: AgentContext): NonNullable<AgentContext["section"]> {
  if (!context.section)
    throw new AppError(
      "INVALID_PARAMETERS",
      "Only a section's worker saves into a plan. Plan a reel with plan_sections and give its sections to workers with start_sections.",
    );
  return context.section;
}

async function ownPlan(planId: string, context: AgentContext): Promise<PlanView> {
  const sections = await import("./sections.server");
  const view = await sections.loadPlan(planId);
  const mine = view.threadId === context.threadId || view.id === context.section?.planId;
  if (!mine)
    throw new AppError(
      "INVALID_PARAMETERS",
      "That plan belongs to another conversation: open that conversation to work on it.",
    );
  return view;
}

const numbers = (values: number[]) =>
  values.length === 1
    ? String(values[0])
    : `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;

export function sectionTools(kit: SectionToolKit): AgentTool[] {
  const { ownTool, resultText, assetUrl } = kit;

  const planSections = ownTool({
    name: "plan_sections",
    description: `Splits a reel (an Editor edit, a long video or a storyboard) into sections, runs of whole shots, for workers to build one after another, each in its own conversation with a brief that carries its neighbours' last and first frames (stills taken from the reel's media), so it starts and ends where they meet it. Makes the integration edit every section is merged into as its worker saves. Sections break between scenes, then at cuts, and only last where one shot carries straight on; each gets a step limit set from its work (at most ${SECTION_LIMITS.turnSteps}). Give sections (how many; otherwise as many as the work needs, at most ${SECTION_LIMITS.maxSections}) or starts (the shot numbers sections begin at) to choose the split. The plan shows in the conversation; give its sections to workers with start_sections.`,
    input: z.object({
      kind: z.enum(REEL_KINDS),
      id: uuid().describe("The edit's sequenceId, the long video's id, or the storyboard's id"),
      sections: z.number().int().min(1).max(SECTION_LIMITS.maxSections).optional(),
      starts: z
        .array(z.number().int().min(2).max(1000))
        .max(SECTION_LIMITS.maxSections - 1)
        .optional()
        .describe("Shot numbers (from 1) where sections begin, for a split chosen by hand"),
      title: z.string().min(1).max(200).optional(),
    }),
    label: (input) => `Planning the ${REEL_KIND_LABELS[input.kind]} in sections`,
    run: async (input, context) => {
      planner(context);
      const sections = await import("./sections.server");
      const view = await sections.createSectionPlan({
        threadId: context.threadId,
        userId: context.userId,
        kind: input.kind,
        id: input.id,
        sections: input.sections ?? null,
        starts: input.starts ?? null,
        title: input.title ?? null,
      });
      const steps = view.sections.reduce((sum, section) => sum + section.budget, 0);
      return {
        content: resultText(
          `${planReport(view)}\n\nGive the sections to their workers with start_sections (all, or some, with a note for them). They run one after another on this conversation's page, where the person follows each one and approves what it spends.`,
        ),
        summary: `${view.sections.length} sections, up to ${steps} steps in all`,
        ui: sectionsUi(view),
      };
    },
  });

  const startSections = ownTool({
    name: "start_sections",
    description:
      "Gives a plan's sections to their workers: they run one after another on this conversation's page, each in its own conversation with its brief, within its step limit, asking before it spends exactly as this conversation does. sections: their numbers (from 1; left out: every section not done). note: what their workers should do this time (a join to put right); a section already done can be run again with one.",
    input: z.object({
      planId: uuid(),
      sections: z
        .array(z.number().int().min(1).max(SECTION_LIMITS.maxSections))
        .max(SECTION_LIMITS.maxSections)
        .optional(),
      note: z.string().min(1).max(1200).optional(),
    }),
    label: (input) =>
      input.sections?.length
        ? `Giving section${input.sections.length === 1 ? "" : "s"} ${numbers(input.sections)} to workers`
        : "Giving the sections to workers",
    run: async (input, context) => {
      planner(context);
      await ownPlan(input.planId, context);
      const sections = await import("./sections.server");
      const view = await sections.queueSections({
        planId: input.planId,
        positions: input.sections?.map((number) => number - 1) ?? null,
        note: input.note ?? null,
      });
      const queued = view.sections.filter((section) => section.status === "queued");
      return {
        content: queued.length
          ? `Queued section${queued.length === 1 ? "" : "s"} ${numbers(queued.map((section) => section.position + 1))}. They run one after another on this conversation's page, each in its own conversation with its brief: the person follows each one in the Sections panel and approves what it spends there. Check back with get_sections; check the joins with check_joins as sections finish.`
          : "Nothing was queued: every section asked for is done or being worked on. Run one again with a note to change it.",
        summary: queued.length ? `${queued.length} queued` : "Nothing to queue",
        ui: sectionsUi(view),
      };
    },
  });

  const getSections = ownTool({
    name: "get_sections",
    description:
      "Where a plan stands: each section's state, its steps used of its limit, what its worker saved and said, and every join's check. Left out, the conversation's latest plan. A section's worker sees its own brief again, with its neighbours' frames as pictures (for frames that weren't ready when it started).",
    input: z.object({ planId: uuid().optional() }),
    label: () => "Reading the sections",
    run: async (input, context) => {
      const sections = await import("./sections.server");
      const planId =
        input.planId ?? context.section?.planId ?? (await sections.latestPlanId(context.threadId));
      if (!planId)
        throw new AppError(
          "INVALID_PARAMETERS",
          "This conversation has no plan in sections yet: make one with plan_sections.",
        );
      const view = await ownPlan(planId, context);
      if (!context.section)
        return {
          content: resultText(planReport(view)),
          summary: `${view.sections.filter((section) => section.status === "done").length} of ${view.sections.length} done`,
          ui: sectionsUi(view),
        };
      const own = await sections.sectionBriefNow(context.section.sectionId, context.userId);
      return {
        content: [
          { type: "text" as const, text: resultText(`${planReport(view)}\n\n${own.brief}`) },
          ...own.frames.flatMap((frame) => [
            { type: "text" as const, text: `${frame.label}:` },
            {
              type: "image" as const,
              source: { type: "url" as const, url: assetUrl(frame.bucket, frame.path) },
            },
          ]),
        ],
        summary: `Section ${context.section.position + 1}'s brief`,
      };
    },
  });

  const checkJoins = ownTool({
    name: "check_joins",
    description:
      "Checks the joins between a plan's sections on both sides: the last frame before each cut and the first after it, taken from the integration edit's clips, looked at by the studio's AI for framing, colour and continuity, with the last render's smart-join measurement and the character and lettering checks. A join holds to what it is: one shot carrying straight on must be the same picture either side; a cut within a scene keeps its grade and continuity; a cut to another scene only its cast and lettering. Takes the frames first (up to a minute or so): if it says they're still being taken, call it again. joins: their numbers (from 1; left out: all). again: check joins whose frames haven't changed once more. Returns each join's verdict, what doesn't match and the fixes, with its two frames.",
    input: z.object({
      planId: uuid(),
      joins: z.array(z.number().int().min(1).max(SECTION_LIMITS.maxSections)).max(20).optional(),
      again: z.boolean().default(false),
    }),
    label: () => "Checking the joins between sections",
    run: async (input, context) => {
      await ownPlan(input.planId, context);
      const sections = await import("./sections.server");
      const view = await sections.checkJoins({
        planId: input.planId,
        positions: input.joins?.map((number) => number - 1) ?? null,
        userId: context.userId,
        waitMs: 75_000,
        again: input.again,
        look: true,
      });
      const shown = view.joins.filter(
        (join) => !input.joins?.length || input.joins.includes(join.position + 1),
      );
      const images = shown.flatMap((join) =>
        [
          { side: join.before, words: "the last frame before it" },
          { side: join.after, words: "the first frame after it" },
        ].flatMap(({ side, words }) =>
          side?.frame.status === "ready" && side.frame.bucket && side.frame.path
            ? [
                {
                  type: "text" as const,
                  text: `Join ${join.position + 1} (${JOIN_KIND_LABELS[join.kind]}), ${words}:`,
                },
                {
                  type: "image" as const,
                  source: {
                    type: "url" as const,
                    url: assetUrl(side.frame.bucket, side.frame.path),
                  },
                },
              ]
            : [],
        ),
      );
      const differs = shown.filter((join) => join.status === "differs").length;
      const taking = shown.filter((join) => join.status === "framing").length;
      return {
        content: [
          {
            type: "text" as const,
            text: resultText(
              `${planReport(view)}${taking ? `\n\n${taking} join${taking === 1 ? "'s frames are" : "s' frames are"} still being taken: check again in a minute.` : ""}${differs ? "\n\nOffer the person the fixes for what doesn't match (fix_join), or explain why it can stay." : ""}`,
            ),
          },
          ...images.slice(0, 24),
        ],
        summary: differs
          ? `${differs} of ${shown.length} ${shown.length === 1 ? "join doesn't" : "joins don't"} match`
          : taking
            ? "Still taking frames"
            : `${shown.length} ${shown.length === 1 ? "join" : "joins"} checked`,
        ui: sectionsUi(view),
      };
    },
  });

  const fixJoin = ownTool({
    name: "fix_join",
    description:
      "Puts a join between two sections right. smart_blend: the render puts the later clip back in register with the earlier (framing, colour, detail), for two videos carrying straight on; colour_match: the render matches its colour only; both are free and need a render to show. redo_after: the later section's worker makes its first shot again from the earlier section's last frame; redo_before: the earlier section's worker makes its last shot again to land on the later's first frame: these queue that section with a note, and it asks before it spends, as ever.",
    input: z.object({
      planId: uuid(),
      join: z.number().int().min(1).max(SECTION_LIMITS.maxSections),
      fix: z.enum(["smart_blend", "colour_match", "redo_after", "redo_before"]),
    }),
    label: (input) => `Putting join ${input.join} right`,
    run: async (input, context) => {
      planner(context);
      await ownPlan(input.planId, context);
      const sections = await import("./sections.server");
      const { view, done } = await sections.fixJoin({
        planId: input.planId,
        position: input.join - 1,
        fix: input.fix,
      });
      return {
        content: resultText(`${done}\n\n${planReport(view)}`),
        summary: done,
        ui: sectionsUi(view),
      };
    },
  });

  const saveSection = ownTool({
    name: "save_section",
    description:
      "For a section's worker: saves shots of your section as soon as each is right: its shot number (as the brief numbers them) and the library file that now shows it, with how long it runs if not its planned length, and where in the file it starts. They go into the integration edit at once and are kept even if you are stopped. Saving a shot again replaces it.",
    input: z.object({
      shots: z
        .array(
          z.object({
            shot: z.number().int().min(1).max(1000),
            assetId: uuid(),
            seconds: z.number().min(0.1).max(300).optional(),
            trimStart: z.number().min(0).max(86_400).optional(),
          }),
        )
        .min(1)
        .max(40),
    }),
    label: (input) =>
      `Saving shot${input.shots.length === 1 ? "" : "s"} ${numbers(input.shots.map((entry) => entry.shot))}`,
    run: async (input, context) => {
      const own = worker(context);
      const sections = await import("./sections.server");
      const { saved, merge, left, section } = await sections.saveSectionShots({
        sectionId: own.sectionId,
        shots: input.shots,
      });
      const lines = [
        `Saved ${saved
          .map((entry) => `shot ${entry.shot + 1} (library file ${entry.assetId})`)
          .join(
            ", ",
          )}. The integration edit shows ${merge.placed} of section ${section.position + 1}'s ${section.last - section.first + 1} shots.`,
        ...merge.notes,
        left.length
          ? `Still to save: shot${left.length === 1 ? "" : "s"} ${numbers(left.map((index) => index + 1))}.`
          : "Every shot of the section is saved: finish with finish_section.",
      ];
      return {
        content: lines.join("\n"),
        summary: `${saved.length} saved${left.length ? `, ${left.length} to go` : ", all in"}`,
      };
    },
  });

  const finishSection = ownTool({
    name: "finish_section",
    description:
      "For a section's worker: ends your section with a line on what you made, and anything left for the person. Call it once its shots are saved; your turn then ends, and the joins either side are checked.",
    input: z.object({
      summary: z.string().min(1).max(600),
      left: z.string().max(600).optional(),
    }),
    label: () => "Finishing the section",
    run: async (input, context) => {
      const own = worker(context);
      const sections = await import("./sections.server");
      const work = await sections.finishSection({
        sectionId: own.sectionId,
        summary: input.summary,
        left: input.left ?? null,
      });
      const view = await sections.loadPlan(own.planId);
      const section = view.sections.find((entry) => entry.id === own.sectionId);
      const saved = new Set(work.shots.map((entry) => entry.shot));
      const unsaved = section
        ? Array.from(
            { length: section.last - section.first + 1 },
            (_, offset) => section.first + offset,
          ).filter((index) => !saved.has(index))
        : [];
      return {
        content: unsaved.length
          ? `Section ${own.position + 1} is marked done, but shot${unsaved.length === 1 ? "" : "s"} ${numbers(unsaved.map((index) => index + 1))} ${unsaved.length === 1 ? "isn't" : "aren't"} saved: save ${unsaved.length === 1 ? "it" : "them"} with save_section, or say in your answer why ${unsaved.length === 1 ? "it is" : "they are"} left. Then end your turn.`
          : `Section ${own.position + 1} is done. End your turn with a short line for the person.`,
        summary: "Done",
      };
    },
  });

  return [
    planSections,
    startSections,
    getSections,
    checkJoins,
    fixJoin,
    saveSection,
    finishSection,
  ];
}
