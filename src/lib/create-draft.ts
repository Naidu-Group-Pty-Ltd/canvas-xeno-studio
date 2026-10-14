/**
 * Hand-off store used by Recreate / Create Variation / Animate / Use as reference.
 * The Create page consumes the prefill once and never auto-submits it.
 */
import type { FinaleMode } from "./long-video/plan";

export interface CreatePrefill {
  mediaType?: "image" | "video";
  modelId?: string;
  parameters?: Record<string, unknown>;
  prompt?: string;
  projectId?: string | null;
  campaignId?: string | null;
  parentGenerationId?: string | null;
  inputs?: { assetId: string; role: string }[];
  /** Set when the hand-off came from a storyboard shot, so the result is filed as a take. */
  shotId?: string | null;
  /** Opens Create set up for a long video (the prompt is its story). */
  longVideo?: {
    targetSeconds: number;
    title?: string;
    continuity?: string;
    beats?: string[];
    continuationModelId?: string | null;
    /** The brand finisher it ends on (one of the inputs), or null for none. */
    finisher?: { assetId: string; mode: FinaleMode; seconds: number } | null;
    /** Characters who must look the same throughout. */
    characterIds?: string[];
    /** Paint the keyframes first; null or unset: on with characters, where the model can. */
    keyframes?: boolean | null;
  };
}

const KEY = "xeno.create.prefill";
const DRAFT_KEY = "xeno.create.prompt";

export const PREFILL_EVENT = "xeno:create-prefill";

export function setCreatePrefill(prefill: CreatePrefill) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(prefill));
  // Lets an already-mounted Create page pick the hand-off up immediately.
  window.dispatchEvent(new CustomEvent(PREFILL_EVENT));
}

export function takeCreatePrefill(): CreatePrefill | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as CreatePrefill;
  } catch {
    return null;
  }
}

export function savePromptDraft(prompt: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRAFT_KEY, prompt);
}

export function loadPromptDraft(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(DRAFT_KEY) ?? "";
}
