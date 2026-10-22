/**
 * The studio API's review operations: a project's review gates, and adding
 * a version, commenting and deciding, as the token's owner. They follow the
 * same steps as the app's Reviews section (../reviews/store), so a script
 * and a person reviewing the same gate agree, and each decision records
 * that it came through the API.
 *
 * Who may approve: any active team member, in the app as themselves or
 * through the API as the token's owner (a token with the "edit" scope).
 * A decision recorded for someone outside the team, such as a client who
 * approved on a call, names them in onBehalfOf.
 *
 * They join STUDIO_TOOLS in ./tools.server. See docs/studio-api.md.
 */
import { z } from "zod/v4";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import {
  gateStates,
  GATE_STATUS_LABELS,
  REVIEW_DECISIONS,
  VERSION_FILE_LIMIT,
} from "../reviews/gates";
import {
  addComment,
  addGate,
  addVersion,
  decide,
  loadProjectReviews,
  REVIEWS_NEED_UPDATE,
} from "../reviews/store";
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
const requestId = () =>
  z
    .string()
    .min(8)
    .max(64)
    .describe(
      "Your own unique id for this request (8-64 characters). Sending the same id again returns the first result instead of doing it twice.",
    );

/** Reviews are for active team members: the token's owner must still be one. */
async function activeMember(userId: string): Promise<void> {
  const { data } = await db.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "The token's owner is not an active team member");
}

const listReviewGates = tool({
  name: "list_review_gates",
  title: "List a project's review gates",
  description:
    "A project's review gates in order (style frames, animatic, proof, film…): each gate's state (in review, changes asked for, approved), whether it is held until the one before is approved, its versions (newest first) with their files, render or storyboard, the latest decision on each (who, when, any note, and on whose behalf), how many comments each has (or the comments themselves, with includeComments), and the notes given on the gate with their shots and whether each is done.",
  scope: "read",
  input: z.object({
    projectId: id(),
    gateId: id().optional().describe("Only this gate"),
    includeComments: z.boolean().default(false),
  }),
  run: async (args, caller) => {
    await activeMember(caller.userId);
    const { data: project } = await db
      .from("projects")
      .select("id,name")
      .eq("id", args.projectId)
      .maybeSingle();
    if (!project) throw new AppError("INVALID_PARAMETERS", "That project doesn't exist");
    const reviews = await loadProjectReviews(db, args.projectId);
    if (!reviews.supported) throw new AppError("UNKNOWN", REVIEWS_NEED_UPDATE);
    const name = (userId: string | null) => (userId ? (reviews.people[userId] ?? null) : null);
    const states = gateStates(reviews.gates, reviews.versions, reviews.decisions).filter(
      (state) => !args.gateId || state.gate.id === args.gateId,
    );
    return {
      project: { id: project.id, name: project.name },
      gates: states.map((state) => ({
        id: state.gate.id,
        name: state.gate.name,
        position: state.gate.position,
        heldUntilPrevious: state.gate.held_until_previous,
        status: state.status,
        statusLabel: GATE_STATUS_LABELS[state.status],
        heldBy: state.heldBy ? { id: state.heldBy.id, name: state.heldBy.name } : null,
        lastApprovedVersion: state.lastApproved?.version.number ?? null,
        versions: state.versions.map((version) => {
          const decisions = reviews.decisions
            .filter((entry) => entry.version_id === version.id)
            .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
          const latest = decisions.at(-1) ?? null;
          const comments = reviews.comments.filter((comment) => comment.version_id === version.id);
          return {
            id: version.id,
            number: version.number,
            kind: version.kind,
            label: version.label,
            note: version.note,
            addedBy: name(version.created_by),
            addedAt: version.created_at,
            renderId: version.render_id,
            storyboardId: version.storyboard_id,
            files: reviews.files
              .filter((file) => file.version_id === version.id)
              .map((file) => ({
                assetId: file.asset_id,
                title: file.asset?.title ?? file.title,
                type: file.asset?.asset_type ?? null,
                inLibrary: !!file.asset,
              })),
            decision: latest
              ? {
                  decision: latest.decision,
                  by: name(latest.decided_by),
                  at: latest.created_at,
                  note: latest.note,
                  onBehalfOf: latest.on_behalf_of,
                  via: latest.via,
                }
              : null,
            decisions: decisions.length,
            comments: args.includeComments
              ? comments.map((comment) => ({
                  id: comment.id,
                  body: comment.body,
                  at: comment.at_seconds,
                  frame: comment.frame,
                  point:
                    comment.x !== null && comment.y !== null
                      ? { x: comment.x, y: comment.y }
                      : null,
                  assetId:
                    reviews.files.find((file) => file.id === comment.file_id)?.asset_id ?? null,
                  shotId: comment.shot_id,
                  by: name(comment.created_by),
                  via: comment.via,
                  writtenAt: comment.created_at,
                }))
              : comments.length,
          };
        }),
        notes: reviews.notes
          .filter((note) => note.gate_id === state.gate.id)
          .map((note) => ({
            id: note.id,
            number: note.number,
            body: note.body,
            givenBy: note.given_by,
            status: note.status,
            shots: note.targets.map((target) => target.label),
            answeredInVersion:
              reviews.versions.find((version) => version.id === note.answered_in_version_id)
                ?.number ?? null,
          })),
      })),
    };
  },
});

const addReviewGate = tool({
  name: "add_review_gate",
  title: "Add a review gate",
  description:
    "Adds a review gate to a project, last in its order (such as Style frames, Animatic, Proof or Film). With heldUntilPrevious, nothing can be added to it, or approved, until the gate before it is approved.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    projectId: id(),
    name: z.string().min(1).max(80),
    heldUntilPrevious: z.boolean().default(true),
  }),
  run: async (args, caller) => {
    await activeMember(caller.userId);
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("id", args.projectId)
      .maybeSingle();
    if (!project) throw new AppError("INVALID_PARAMETERS", "That project doesn't exist");
    const gateId = await addGate(db, {
      projectId: args.projectId,
      name: args.name,
      heldUntilPrevious: args.heldUntilPrevious,
      userId: caller.userId,
    });
    return { gateId };
  },
});

const addReviewVersion = tool({
  name: "add_review_version",
  title: "Add a version to a review gate",
  description: `Puts something up for review in a gate, numbered after its last version: library stills or videos (assetIds, up to ${VERSION_FILE_LIMIT}: style frames, a proof's clip), a finished render (renderId, from render_edit and get_render; its clips and captions are kept with it), or a storyboard (storyboardId; its shots and their times are kept as they stand). A gate held until the one before it is approved takes none yet. Returns the version's id and number.`,
  scope: "edit",
  readOnly: false,
  input: z.object({
    gateId: id(),
    assetIds: z.array(id()).min(1).max(VERSION_FILE_LIMIT).optional(),
    renderId: id().optional(),
    storyboardId: id().optional(),
    note: z.string().max(4000).optional().describe("What changed since the version before"),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    await activeMember(caller.userId);
    return addVersion(db, {
      gateId: args.gateId,
      userId: caller.userId,
      via: "api",
      assetIds: args.assetIds ?? null,
      renderId: args.renderId ?? null,
      storyboardId: args.storyboardId ?? null,
      note: args.note ?? null,
      clientRequestId: args.clientRequestId,
    });
  },
});

const commentOnReview = tool({
  name: "comment_on_review",
  title: "Comment on a review version",
  description:
    "Comments on a version as the token's owner: pinned to a time in its video (at, seconds) or a frame (either gives the other, at the video's frame rate), a point on the picture (point, 0 to 1 across and down), one of its files (assetId, for a version of several stills), or a storyboard's shot (shotId).",
  scope: "edit",
  readOnly: false,
  input: z.object({
    versionId: id(),
    body: z.string().min(1).max(4000),
    at: z.number().min(0).max(36_000).optional().describe("Seconds into the video"),
    frame: z.number().int().min(0).optional(),
    point: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
    assetId: id().optional(),
    shotId: id().optional(),
    clientRequestId: requestId().optional(),
  }),
  run: async (args, caller) => {
    await activeMember(caller.userId);
    return addComment(db, {
      versionId: args.versionId,
      userId: caller.userId,
      via: "api",
      body: args.body,
      atSeconds: args.at ?? null,
      frame: args.frame ?? null,
      point: args.point ?? null,
      assetId: args.assetId ?? null,
      shotId: args.shotId ?? null,
      clientRequestId: args.clientRequestId ?? null,
    });
  },
});

const decideReview = tool({
  name: "decide_review",
  title: "Approve a review version, or ask for changes",
  description:
    "Approves a gate's latest version, or asks for changes to it, as the token's owner; the decision records that it came through the API. Name a client who decided outside the studio in onBehalfOf. Only the latest version is decided, and a held gate can't be approved until the gate before it is. Decisions are kept: a new one supersedes the last.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    versionId: id(),
    decision: z.enum(REVIEW_DECISIONS),
    note: z.string().max(4000).optional(),
    onBehalfOf: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Who decided, when not the token\'s owner: "Aurixa (the client, by email)"'),
    clientRequestId: requestId().optional(),
  }),
  run: async (args, caller) => {
    await activeMember(caller.userId);
    return decide(db, {
      versionId: args.versionId,
      userId: caller.userId,
      via: "api",
      decision: args.decision,
      note: args.note ?? null,
      onBehalfOf: args.onBehalfOf ?? null,
      clientRequestId: args.clientRequestId ?? null,
    });
  },
});

/** The review operations, in the order they are listed. */
export const REVIEW_TOOLS: StudioTool[] = [
  listReviewGates,
  addReviewGate,
  addReviewVersion,
  commentOnReview,
  decideReview,
];
