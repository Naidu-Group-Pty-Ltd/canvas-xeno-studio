/** Shapes shared by the Supercomputer server functions and its UI. */

export type MediaKind = "image" | "video" | "audio";

export type SupercomputerIntent = "chat" | "brainstorm" | "drafts" | "deliverables" | "review";

export interface SupercomputerIdea {
  title: string;
  logline: string;
  rationale?: string;
  visualDirection?: string;
  formats?: string[];
}

export interface DraftReference {
  assetId: string;
  role: string;
  assetType: MediaKind;
  title?: string | null;
}

/**
 * A long video a draft makes instead of one clip: clips chained into one
 * continuous shot, all by the draft's model, each as long as it allows. The
 * draft's prompt is the story; the plan is worked out again from these when
 * it is run, so it always matches the catalogue as it is then.
 */
export interface DraftLongVideo {
  title: string;
  targetSeconds: number;
  /** The model's workflow for clips 2 onward (the draft's own model, or its image to video). */
  continuationModelId: string;
  continuationModelName: string;
  /** Clip lengths as planned when the draft was written. */
  durations: number[];
  continuity: string;
  /** What happens in each clip, by clip. */
  beats: string[];
}

/** A ready-to-run generation proposed by the agent, already validated against the registry. */
export interface SupercomputerDraft {
  title: string;
  purpose?: string;
  modelId: string;
  modelName: string;
  outputType: MediaKind;
  operation: string;
  prompt: string;
  parameters: Record<string, unknown>;
  references: DraftReference[];
  notes?: string;
  issues: string[];
  longVideo?: DraftLongVideo;
}

/** How the agent would cut its drafts into one video. Indices refer to `drafts`. */
export interface SupercomputerEditPlan {
  title?: string;
  aspectRatio?: string;
  shots: { draftIndex: number; seconds?: number; transition?: string; note?: string }[];
  voiceoverScript?: string;
  musicDirection?: string;
  captions?: boolean;
  openingTitle?: string;
  closingCta?: string;
}

export interface SupercomputerPayload {
  intent?: SupercomputerIntent;
  ideas?: SupercomputerIdea[];
  drafts?: SupercomputerDraft[];
  editPlan?: SupercomputerEditPlan;
  questions?: string[];
  suggestions?: string[];
  /** Agent proposals that could not be turned into a valid draft. */
  dropped?: string[];
  backend?: string;
}

export interface MessageAttachment {
  assetId: string;
  type: MediaKind;
  title: string | null;
  bucket: string;
  path: string;
}

export interface BriefDeliverable {
  name: string;
  media_type: "image" | "video";
  channel?: string;
  aspect_ratio?: string;
  duration_seconds?: number;
  quantity?: number;
  copy?: string;
  notes?: string;
}

export interface BriefAnalysis {
  title?: string;
  brand?: string;
  summary?: string;
  objective?: string;
  audience?: string;
  key_message?: string;
  supporting_messages?: string[];
  tone?: string;
  visual_direction?: string;
  brand_guidelines?: {
    colours?: string[];
    typography?: string;
    logo_usage?: string;
    dos?: string[];
    donts?: string[];
  };
  mandatories?: string[];
  channels?: string[];
  deliverables?: BriefDeliverable[];
  image_notes?: { asset_id: string; description: string; suggested_use?: string }[];
  timeline?: string;
  budget?: string;
  kpis?: string[];
  open_questions?: string[];
  analysed_at?: string;
  model?: string;
}

export interface PromptSuggestion {
  title: string;
  prompt: string;
  rationale?: string;
}

/** Deterministic idempotency key for a draft run: one click can never bill twice. */
export function draftRunKey(messageId: string, draftIndex: number, runNumber: number): string {
  return `sc:${messageId}:${draftIndex}:${runNumber}`;
}

export function draftRunPrefix(messageId: string): string {
  return `sc:${messageId}:`;
}

/** Parses a run key back into its draft index, or null for unrelated keys. */
export function draftIndexFromKey(
  key: string | null | undefined,
  messageId: string,
): number | null {
  if (!key?.startsWith(draftRunPrefix(messageId))) return null;
  const index = Number(key.slice(draftRunPrefix(messageId).length).split(":")[0]);
  return Number.isInteger(index) ? index : null;
}
