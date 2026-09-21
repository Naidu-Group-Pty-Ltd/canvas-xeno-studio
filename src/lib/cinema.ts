/**
 * Cinema Mode — director-grade shot controls.
 *
 * Two kinds of control exist:
 *  - NATIVE: the selected model exposes a real parameter with the same key, so
 *    the value is sent as a provider parameter (rendered by ParameterFields).
 *  - PROMPT: the concept has no provider parameter, so it is compiled into the
 *    prompt as an explicit cinematography clause.
 *
 * Which is which is decided from the model registry, never from model names.
 */
import type { ModelRegistryEntry } from "./model-schema";

export interface CinemaGroup {
  key: string;
  label: string;
  /** Wording used when the choice is compiled into the prompt. */
  phrase: (value: string) => string;
  options: string[];
}

export const CINEMA_GROUPS: CinemaGroup[] = [
  {
    key: "shot_size",
    label: "Shot size",
    phrase: (v) => `${v.toLowerCase()} shot`,
    options: ["Extreme Wide", "Wide", "Medium Wide", "Medium", "Medium Close-Up", "Close-Up", "Extreme Close-Up"],
  },
  {
    key: "camera_angle",
    label: "Camera angle",
    phrase: (v) => `${v.toLowerCase()} angle`,
    options: ["Eye Level", "Low", "High", "Overhead", "Dutch", "Ground Level"],
  },
  {
    key: "camera_movement",
    label: "Camera movement",
    phrase: (v) => `${v.toLowerCase()} camera move`,
    options: [
      "Static",
      "Pan",
      "Tilt",
      "Dolly In",
      "Dolly Out",
      "Truck",
      "Pedestal",
      "Orbit",
      "Handheld",
      "Tracking",
      "Crane",
      "Drone-style",
      "Push In",
    ],
  },
  {
    key: "lens",
    label: "Lens",
    phrase: (v) => `${v.toLowerCase()} lens`,
    options: ["Ultra Wide", "Wide", "Standard", "Short Telephoto", "Telephoto", "Macro"],
  },
  {
    key: "focus",
    label: "Focus",
    phrase: (v) => v.toLowerCase(),
    options: ["Deep focus", "Shallow depth of field", "Rack focus"],
  },
  {
    key: "lighting",
    label: "Lighting",
    phrase: (v) => `${v.toLowerCase()} lighting`,
    options: ["Natural", "Golden Hour", "Overcast", "Hard Key", "Soft Key", "Backlit", "Low Key", "High Key", "Studio"],
  },
  {
    key: "atmosphere",
    label: "Atmosphere",
    phrase: (v) => `${v.toLowerCase()} atmosphere`,
    options: ["Clean", "Haze", "Fog", "Rain", "Dust", "Smoke"],
  },
];

export type CinemaSelection = Record<string, string>;

/** Cinema Mode is offered for models the registry tags as cinematic or camera-controllable. */
export function cinemaSupported(model: ModelRegistryEntry | null | undefined): boolean {
  if (!model) return false;
  const tags = (model as ModelRegistryEntry & { capability_tags?: string[] | null }).capability_tags ?? [];
  return model.output_type === "video" && (tags.includes("cinematic") || tags.includes("camera_control"));
}

/** Groups the model implements as a real provider parameter. */
export function nativeCinemaKeys(model: ModelRegistryEntry): Set<string> {
  const keys = new Set((model.parameter_schema?.fields ?? []).map((field) => field.key));
  return new Set(CINEMA_GROUPS.filter((group) => keys.has(group.key)).map((group) => group.key));
}

export function promptCinemaGroups(model: ModelRegistryEntry): CinemaGroup[] {
  const native = nativeCinemaKeys(model);
  return CINEMA_GROUPS.filter((group) => !native.has(group.key));
}

const MARKER = "Cinematography:";

/** Strips any clause a previous compile added, so recompiling never stacks up. */
export function stripCinemaClause(prompt: string): string {
  const index = prompt.indexOf(MARKER);
  return (index === -1 ? prompt : prompt.slice(0, index)).trimEnd().replace(/[\n\s]+$/u, "");
}

/** Builds the final prompt actually sent to the provider. */
export function compileCinemaPrompt(prompt: string, selection: CinemaSelection, groups: CinemaGroup[]): string {
  const base = stripCinemaClause(prompt ?? "");
  const parts = groups
    .filter((group) => selection[group.key])
    .map((group) => group.phrase(selection[group.key] as string));
  if (!parts.length) return base;
  return `${base}${base ? "\n\n" : ""}${MARKER} ${parts.join(", ")}.`;
}
