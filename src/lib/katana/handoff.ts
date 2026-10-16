/**
 * Sending the studio's media and characters to Katana. What is sent is added
 * to the Katana form's draft, which this browser tab keeps, so one run can
 * take files from several pages: a render from the Editor as its footage, a
 * track from Music as its soundtrack, a character as its hero. Nothing starts
 * until the person presses Start on the Katana page.
 *
 * The merging is pure (unit-tested); the draft lives in sessionStorage and is
 * read by the Katana page, which also keeps it up to date as the form changes.
 */
import { KATANA_CHARACTERS_MAX, KATANA_IMAGES_MAX } from "./cast";
import type { KatanaMode } from "./messages";

/** Where a file goes in the Katana form, how many each place takes, and what it takes. */
export const KATANA_SLOTS = {
  reference: { max: 1, kind: "video", label: "the reference video" },
  footage: { max: 3, kind: "video", label: "the footage" },
  images: { max: KATANA_IMAGES_MAX, kind: "image", label: "the images" },
  soundtrack: { max: 1, kind: "audio", label: "the soundtrack" },
} as const;

export type KatanaSlot = keyof typeof KATANA_SLOTS;
export const KATANA_SLOT_NAMES = Object.keys(KATANA_SLOTS) as KatanaSlot[];

const MODES: readonly KatanaMode[] = ["remix", "preset", "edit"];
const BRIEF_CHARS = 4000;
const TITLE_CHARS = 120;
/** Arrival notes kept for the Katana page to show. */
const ARRIVALS = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRESET_FIELD = /^media\.[a-z][a-z0-9_]{0,63}$/;

/** The Katana form as this tab keeps it: library files and characters by id. */
export interface KatanaDraft {
  mode: KatanaMode;
  files: Record<KatanaSlot, string[]>;
  characterIds: string[];
  referenceUrl: string;
  brief: string;
  title: string;
  projectId: string | null;
  preset: { slug: string; name: string } | null;
  /** The files for a preset's own media fields. */
  presetFiles: Record<string, string[]>;
  /** What was added since the Katana page last said so. */
  arrivals: string[];
}

export interface KatanaSendFile {
  assetId: string;
  slot: KatanaSlot;
  /** Its name, for saying what was added. */
  title?: string | null;
}

/** Something sent to Katana from elsewhere in the studio. */
export interface KatanaSend {
  /** The tab the form opens on; unset keeps the draft's (images and a soundtrack fit any). */
  mode?: KatanaMode;
  files?: KatanaSendFile[];
  characters?: { id: string; name: string }[];
  /** Added to the brief, after what it already says. */
  brief?: string;
  /** Used when the draft has no title yet. */
  title?: string | null;
  /** Used when the draft has no project yet. */
  projectId?: string | null;
}

export function emptyKatanaDraft(): KatanaDraft {
  return {
    mode: "remix",
    files: { reference: [], footage: [], images: [], soundtrack: [] },
    characterIds: [],
    referenceUrl: "",
    brief: "",
    title: "",
    projectId: null,
    preset: null,
    presetFiles: {},
    arrivals: [],
  };
}

/** Nothing worth keeping: no files, characters, link, words or preset. */
export function isEmptyKatanaDraft(draft: KatanaDraft): boolean {
  return (
    KATANA_SLOT_NAMES.every((slot) => !draft.files[slot].length) &&
    !draft.characterIds.length &&
    !draft.referenceUrl.trim() &&
    !draft.brief.trim() &&
    !draft.title.trim() &&
    !draft.preset &&
    Object.values(draft.presetFiles).every((ids) => !ids.length)
  );
}

const unique = (ids: string[]) => [...new Set(ids)];

function quoted(title: string | null | undefined): string | null {
  const clean = title?.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return `“${clean.length > 60 ? `${clean.slice(0, 59)}…` : clean}”`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The brief with more added after what it says, within Katana's length. */
export function joinBrief(current: string, added: string): string {
  const before = current.trim();
  const after = added.trim();
  if (!after || before.includes(after)) return current;
  return (before ? `${before}\n\n${after}` : after).slice(0, BRIEF_CHARS);
}

/**
 * The draft with something sent added. A place that takes one file (the
 * reference, the soundtrack) takes the one sent; the others add it to theirs,
 * and when that is more than they take, the oldest goes. Each change is noted
 * for the Katana page to say.
 */
export function addToKatanaDraft(draft: KatanaDraft, send: KatanaSend): KatanaDraft {
  const next: KatanaDraft = {
    ...draft,
    files: { ...draft.files },
    characterIds: [...draft.characterIds],
  };
  const notes: string[] = [];
  if (send.mode && MODES.includes(send.mode)) next.mode = send.mode;

  for (const slot of KATANA_SLOT_NAMES) {
    const sent = (send.files ?? []).filter((file) => file.slot === slot && UUID.test(file.assetId));
    if (!sent.length) continue;
    const { max, label } = KATANA_SLOTS[slot];
    const before = next.files[slot];
    const names = sent.map((file) => quoted(file.title));
    const named =
      sent.length === 1
        ? (names[0] ?? "A file")
        : `${sent.length} ${slot === "images" ? "images" : "files"}`;
    if (max === 1) {
      const chosen = sent.at(-1)!;
      next.files[slot] = [chosen.assetId];
      const replaced = before.length > 0 && before[0] !== chosen.assetId;
      notes.push(
        `${names.at(-1) ?? "A file"} is now ${label}${replaced ? ", in place of the one before" : ""}.`,
      );
      continue;
    }
    const merged = unique([...before, ...sent.map((file) => file.assetId)]);
    const kept = merged.slice(-max);
    next.files[slot] = kept;
    notes.push(`${named} added to ${label}.`);
    const dropped = merged.length - kept.length;
    if (dropped > 0) {
      notes.push(
        `${capitalized(label)} takes ${max} at most, so the oldest ${dropped === 1 ? "one was" : `${dropped} were`} taken out.`,
      );
    }
  }

  const characters = (send.characters ?? []).filter((character) => UUID.test(character.id));
  if (characters.length) {
    const fresh = characters.filter((character) => !next.characterIds.includes(character.id));
    const merged = unique([...next.characterIds, ...characters.map((character) => character.id)]);
    next.characterIds = merged.slice(-KATANA_CHARACTERS_MAX);
    if (fresh.length) {
      const names = fresh.map((character) => character.name.trim() || "A character");
      notes.push(
        `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`} ${names.length === 1 ? "joins" : "join"} the cast.`,
      );
    }
    if (merged.length > KATANA_CHARACTERS_MAX) {
      notes.push(
        `A run keeps ${KATANA_CHARACTERS_MAX} characters the same at most, so the first ${merged.length - KATANA_CHARACTERS_MAX === 1 ? "one was" : `${merged.length - KATANA_CHARACTERS_MAX} were`} taken out.`,
      );
    }
  }

  if (send.brief?.trim()) {
    const brief = joinBrief(next.brief, send.brief);
    if (brief !== next.brief) {
      notes.push(
        next.brief.trim() ? "The brief was added after yours." : "The brief was filled in.",
      );
      next.brief = brief;
    }
  }
  if (!next.title.trim() && send.title?.trim())
    next.title = send.title.trim().slice(0, TITLE_CHARS);
  if (!next.projectId && send.projectId && UUID.test(send.projectId))
    next.projectId = send.projectId;
  next.arrivals = [...draft.arrivals, ...notes].slice(-ARRIVALS);
  return next;
}

const ids = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? unique(value.filter((id): id is string => typeof id === "string" && UUID.test(id))).slice(
        0,
        max,
      )
    : [];

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : "";

/** A draft as stored, checked: anything that isn't one is left out. */
export function parseKatanaDraft(value: unknown): KatanaDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const files = (record["files"] ?? {}) as Record<string, unknown>;
  const preset = record["preset"] as Record<string, unknown> | null | undefined;
  const presetFiles = (record["presetFiles"] ?? {}) as Record<string, unknown>;
  const draft: KatanaDraft = {
    mode: MODES.includes(record["mode"] as KatanaMode) ? (record["mode"] as KatanaMode) : "remix",
    files: {
      reference: ids(files["reference"], KATANA_SLOTS.reference.max),
      footage: ids(files["footage"], KATANA_SLOTS.footage.max),
      images: ids(files["images"], KATANA_SLOTS.images.max),
      soundtrack: ids(files["soundtrack"], KATANA_SLOTS.soundtrack.max),
    },
    characterIds: ids(record["characterIds"], KATANA_CHARACTERS_MAX),
    referenceUrl: text(record["referenceUrl"], 2048),
    brief: text(record["brief"], BRIEF_CHARS),
    title: text(record["title"], TITLE_CHARS),
    projectId:
      typeof record["projectId"] === "string" && UUID.test(record["projectId"])
        ? record["projectId"]
        : null,
    preset:
      preset && typeof preset === "object" && typeof preset["slug"] === "string"
        ? { slug: preset["slug"].slice(0, 140), name: text(preset["name"], 200) }
        : null,
    presetFiles:
      typeof presetFiles === "object" && !Array.isArray(presetFiles)
        ? Object.fromEntries(
            Object.entries(presetFiles)
              .filter(([field]) => PRESET_FIELD.test(field))
              .map(([field, list]) => [field, ids(list, KATANA_IMAGES_MAX)]),
          )
        : {},
    arrivals: Array.isArray(record["arrivals"])
      ? record["arrivals"]
          .filter((note): note is string => typeof note === "string")
          .slice(-ARRIVALS)
      : [],
  };
  return draft;
}

/** A library file, as far as sending it to Katana goes. */
export interface KatanaFile {
  id: string;
  asset_type: string;
  title: string | null;
  project_id?: string | null;
}

export interface KatanaChoice {
  key: string;
  label: string;
  detail: string;
  send: KatanaSend;
}

/**
 * The ways a library file can go to Katana, by what it is: a video as the
 * footage to edit or the reference to remix, an image among the images, a
 * track as the soundtrack. `extra` goes along with each (the characters in
 * it, a title for the run).
 */
export function katanaChoices(
  file: KatanaFile,
  extra: Pick<KatanaSend, "characters" | "title"> = {},
): KatanaChoice[] {
  const along: KatanaSend = {
    projectId: file.project_id ?? null,
    ...(extra.characters?.length ? { characters: extra.characters } : {}),
    ...(extra.title ? { title: extra.title } : {}),
  };
  const sent = (slot: KatanaSlot): KatanaSendFile[] => [
    { assetId: file.id, slot, title: file.title },
  ];
  switch (file.asset_type) {
    case "video":
      return [
        {
          key: "edit",
          label: "Edit it with Katana",
          detail: "Katana recuts it to your brief: pacing, captions, effects.",
          send: { ...along, mode: "edit", files: sent("footage") },
        },
        {
          key: "remix",
          label: "Remix its style with Katana",
          detail: "Katana remakes this edit's look and rhythm for another subject.",
          send: { ...along, mode: "remix", files: sent("reference") },
        },
      ];
    case "image":
      return [
        {
          key: "images",
          label: "Use it in Katana",
          detail: "As the subject of a remix, or a still in an edit.",
          send: { ...along, files: sent("images") },
        },
      ];
    case "audio":
      return [
        {
          key: "soundtrack",
          label: "Cut to it in Katana",
          detail: "Katana cuts the video to it, as the soundtrack.",
          send: { ...along, files: sent("soundtrack") },
        },
      ];
    default:
      return [];
  }
}

// ---------- The tab's draft ----------

const KEY = "xeno.katana.draft";

/** Fired when something is sent, so a Katana page already open picks it up. */
export const KATANA_DRAFT_EVENT = "xeno:katana-draft";

export function readKatanaDraft(): KatanaDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? parseKatanaDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Keeps the draft (or forgets it, given null or an empty one). */
export function writeKatanaDraft(draft: KatanaDraft | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!draft || isEmptyKatanaDraft(draft)) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the send still opens Katana, just without the draft.
  }
}

/** Adds what is sent to this tab's Katana draft. The caller opens the Katana page. */
export function sendToKatana(send: KatanaSend): KatanaDraft {
  const next = addToKatanaDraft(readKatanaDraft() ?? emptyKatanaDraft(), send);
  writeKatanaDraft(next);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(KATANA_DRAFT_EVENT));
  return next;
}

// ---------- Briefs ----------

export interface EditBriefShot {
  title: string;
  seconds?: number | null;
  note?: string | null;
  /** How it comes in from the shot before ("cut" says nothing). */
  transition?: string | null;
}

/**
 * An edit brief from a plan the studio already has (the Supercomputer's edit
 * plan): the clips in order, then the voiceover, music, captions and titles.
 */
export function editBrief(plan: {
  title?: string | null;
  aspectRatio?: string | null;
  shots: EditBriefShot[];
  /** Stills sent along as images, by name. */
  stills?: string[];
  voiceover?: string | null;
  music?: string | null;
  captions?: boolean | null;
  openingTitle?: string | null;
  closingCta?: string | null;
}): string {
  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
  const total = plan.shots.reduce((sum, shot) => sum + (shot.seconds ?? 0), 0);
  const shape = [total > 0 ? `about ${Math.round(total)} s` : "", clean(plan.aspectRatio)].filter(
    Boolean,
  );
  const clips = plan.shots.length === 1 ? "this clip" : `these ${plan.shots.length} clips`;
  const named = clean(plan.title) ? `, “${clean(plan.title)}”` : "";
  const sized = shape.length ? ` (${shape.join(", ")})` : "";
  const head = `Cut ${clips} into one edit${named}${sized}${plan.shots.length > 1 ? ", in this order:" : "."}`;
  const lines = [head];
  if (plan.shots.length > 1 || clean(plan.shots[0]?.note)) {
    plan.shots.forEach((shot, index) => {
      const transition = clean(shot.transition);
      const parts = [
        `${index + 1}. ${clean(shot.title) || `Clip ${index + 1}`}`,
        shot.seconds ? ` (${Math.round(shot.seconds * 10) / 10} s)` : "",
        clean(shot.note) ? `: ${clean(shot.note)}` : "",
        index > 0 && transition && !/^cut$/i.test(transition) ? ` (${transition} in)` : "",
      ];
      lines.push(parts.join(""));
    });
  }
  const stills = (plan.stills ?? []).map(clean).filter(Boolean);
  if (stills.length)
    lines.push(`Stills to use where they fit: ${stills.map((still) => `“${still}”`).join(", ")}.`);
  if (clean(plan.voiceover)) lines.push(`Voiceover: “${clean(plan.voiceover)}”`);
  if (clean(plan.music)) lines.push(`Music: ${clean(plan.music)}`);
  if (plan.captions) lines.push("Add captions.");
  const titles = [
    clean(plan.openingTitle) ? `Opening title: “${clean(plan.openingTitle)}”.` : "",
    clean(plan.closingCta) ? `End card: “${clean(plan.closingCta)}”.` : "",
  ].filter(Boolean);
  if (titles.length) lines.push(titles.join(" "));
  const brief = lines.join("\n");
  return brief.length > BRIEF_CHARS ? `${brief.slice(0, BRIEF_CHARS - 1)}…` : brief;
}
