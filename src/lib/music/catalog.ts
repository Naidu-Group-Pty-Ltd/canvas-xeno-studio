import { z } from "zod";

/**
 * Music licences the studio understands, and what each one allows. Every
 * track in the library has exactly one, so the team can see at a glance
 * whether a track may go in a paid ad and what credit it needs.
 */
export const MUSIC_LICENSES = {
  cc0: {
    short: "CC0",
    label: "CC0 · no rights reserved",
    credit: false,
    note: "Free for any use, including paid ads. No credit needed.",
  },
  pdm: {
    short: "Public domain",
    label: "Public domain",
    credit: false,
    note: "Marked as public domain. Free for any use, including paid ads.",
  },
  by: {
    short: "CC BY",
    label: "CC BY · credit the creator",
    credit: true,
    note: "Free for any use, including paid ads and edits, as long as the creator is credited (for example in the post caption or video description).",
  },
  ai_generated: {
    short: "AI music",
    label: "AI music · ElevenLabs",
    credit: false,
    note: "Made for this studio with Eleven Music. Cleared for commercial use, including ads, on a paid ElevenLabs plan. Film, TV and broadcast placements need an ElevenLabs Enterprise plan.",
  },
  licensed: {
    short: "Licensed",
    label: "Licensed",
    credit: false,
    note: "Use only within the licence recorded with the track.",
  },
  owned: {
    short: "Owned",
    label: "Owned by the brand",
    credit: false,
    note: "The brand owns this recording and composition.",
  },
} as const;
export type MusicLicense = keyof typeof MUSIC_LICENSES;
export const MUSIC_LICENSE_IDS = Object.keys(MUSIC_LICENSES) as MusicLicense[];

/**
 * Creative Commons licences that are safe for brand video: commercial use
 * and adaptation (cutting, looping, mixing under a voice) are allowed. NC,
 * ND and SA licences are left out on purpose.
 */
export const SAFE_OPENVERSE_LICENSES = ["cc0", "pdm", "by"] as const;
export type SafeOpenverseLicense = (typeof SAFE_OPENVERSE_LICENSES)[number];
export function isSafeOpenverseLicense(value: unknown): value is SafeOpenverseLicense {
  return (SAFE_OPENVERSE_LICENSES as readonly string[]).includes(String(value));
}

/** Where a licensed track may be used, as recorded when it is added. */
export const RIGHTS_SCOPES = [
  { id: "organic_social", label: "Organic social posts" },
  { id: "paid_social", label: "Paid social and online ads" },
  { id: "web", label: "Website and online video" },
  { id: "broadcast", label: "TV, radio and cinema" },
  { id: "all", label: "All media" },
] as const;
export type RightsScope = (typeof RIGHTS_SCOPES)[number]["id"];

export const licensedRightsSchema = z.object({
  licensor: z.string().trim().min(2).max(200),
  reference: z.string().trim().max(200).default(""),
  scopes: z
    .array(z.enum(RIGHTS_SCOPES.map((scope) => scope.id) as [RightsScope, ...RightsScope[]]))
    .min(1)
    .max(RIGHTS_SCOPES.length),
  territories: z.string().trim().max(200).default("Worldwide"),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  notes: z.string().trim().max(1000).default(""),
});
export type LicensedRights = z.infer<typeof licensedRightsSchema>;

/* ------------------------------------------------------------------ */
/* Eleven Music                                                        */
/* ------------------------------------------------------------------ */

export const MUSIC_MODELS = [
  { id: "music_v2_5", label: "Eleven Music v2.5 · latest" },
  { id: "music_v2", label: "Eleven Music v2" },
  { id: "music_v1", label: "Eleven Music v1" },
] as const;
export type MusicModel = (typeof MUSIC_MODELS)[number]["id"];
export const DEFAULT_MUSIC_MODEL: MusicModel = "music_v2_5";
/** Eleven Music accepts 3 seconds to 10 minutes. */
export const MUSIC_LENGTH = { min: 3, max: 600 } as const;

export const MUSIC_GENRES = [
  "Pop",
  "Electronic",
  "House",
  "Hip-hop",
  "Trap",
  "Lo-fi",
  "R&B",
  "Afrobeats",
  "Latin",
  "Funk",
  "Indie",
  "Rock",
  "Acoustic",
  "Jazz",
  "Cinematic",
  "Orchestral",
  "Ambient",
  "Corporate",
] as const;

export const MUSIC_MOODS = [
  "Upbeat",
  "Energetic",
  "Confident",
  "Playful",
  "Warm",
  "Inspiring",
  "Chill",
  "Dreamy",
  "Luxurious",
  "Nostalgic",
  "Romantic",
  "Tense",
  "Dark",
  "Epic",
] as const;

export interface MusicBrief {
  genre?: string | undefined;
  mood?: string | undefined;
  bpm?: number | null | undefined;
  instruments?: string | undefined;
  vocals: boolean;
  notes?: string | undefined;
  seconds: number;
}

/** A prompt for Eleven Music from the generator's choices. */
export function musicPrompt(brief: MusicBrief): string {
  const style = [brief.mood, brief.genre].filter(Boolean).join(" ").toLowerCase();
  const parts = [
    `${style ? `${style[0]!.toUpperCase()}${style.slice(1)} track` : "Track"}${brief.bpm ? ` at ${Math.round(brief.bpm)} BPM` : ""}`,
    brief.instruments?.trim() ? `featuring ${brief.instruments.trim()}` : "",
  ].filter(Boolean);
  const lines = [
    `${parts.join(", ")}.`,
    brief.vocals ? "With vocals." : "Instrumental only, no vocals.",
    `About ${Math.round(brief.seconds)} seconds long, with a clear start and a clean ending on the final beat.`,
    "Made as the music bed for a short brand video, so it leaves room for a voiceover.",
    brief.notes?.trim() ?? "",
  ];
  return lines.filter(Boolean).join(" ").slice(0, 2000);
}

/* ------------------------------------------------------------------ */
/* Tracks                                                              */
/* ------------------------------------------------------------------ */

export interface MusicTrackRow {
  id: string;
  asset_id: string | null;
  title: string;
  artist: string | null;
  kind: "music" | "sound_effect";
  source: "openverse" | "elevenlabs" | "upload" | "derived";
  source_id: string | null;
  source_url: string | null;
  provider: string | null;
  license: MusicLicense;
  license_version: string | null;
  license_url: string | null;
  attribution: string | null;
  usage_notes: string | null;
  rights: Record<string, unknown>;
  parent_track_id: string | null;
  duration_seconds: number | null;
  bpm: number | null;
  beats: number[] | null;
  genres: string[];
  moods: string[];
  tags: string[];
  instrumental: boolean | null;
  prompt: string | null;
  status: "generating" | "ready" | "failed" | "submission_uncertain";
  error_code: string | null;
  error_message: string | null;
  project_id: string | null;
  campaign_id: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The credit to publish with a video that uses the track. CC BY asks for
 * changes to be noted, and music set to picture always counts as changed.
 */
export function videoCreditLine(track: Parameters<typeof creditLine>[0]): string | null {
  const line = creditLine(track);
  return line ? `${line} Edited and synced to this video.` : null;
}

/**
 * The credit to publish with a track whose licence asks for one. CC BY asks
 * for a link to the work wherever one was supplied, which a provider's
 * attribution (Openverse's among them) can leave out, so the work's page is
 * added unless the credit already has it.
 */
export function creditLine(
  track: Pick<
    MusicTrackRow,
    | "title"
    | "artist"
    | "license"
    | "license_version"
    | "license_url"
    | "attribution"
    | "source_url"
  >,
): string | null {
  if (!MUSIC_LICENSES[track.license]?.credit) return null;
  const licence = `CC BY${track.license_version ? ` ${track.license_version}` : ""}`;
  const line =
    track.attribution?.trim() ||
    `“${track.title}” by ${track.artist?.trim() || "unknown artist"}, licensed under ${licence}${track.license_url ? ` (${track.license_url})` : ""}.`;
  const source = track.source_url?.trim();
  if (!source || linksTo(line, source)) return line;
  return `${/[.!?]$/.test(line) ? line : `${line}.`} Source: ${source}.`;
}

/** Whether a credit already gives this address (with or without a closing slash). */
function linksTo(line: string, address: string): boolean {
  const bare = address.replace(/\/+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${bare}(?![\\w-])`).test(line);
}

/**
 * Whether a recorded licence has run out. It covers its last day until that
 * day ends in the first time zone to end it (UTC+14), so it is never used past
 * its end wherever the team is (in Sydney, until about 9 pm).
 */
export function rightsExpired(
  rights: Record<string, unknown> | null | undefined,
  now = Date.now(),
): boolean {
  const day = typeof rights?.["expiresOn"] === "string" ? rights["expiresOn"] : null;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return now > Date.parse(`${day}T23:59:59.999+14:00`);
}

/** Whether a recorded licence covers a use, for licensed tracks. */
export function rightsCover(rights: Record<string, unknown>, scope: RightsScope): boolean | null {
  const scopes = Array.isArray(rights["scopes"]) ? (rights["scopes"] as string[]) : null;
  if (!scopes) return null;
  if (rightsExpired(rights)) return false;
  return scopes.includes("all") || scopes.includes(scope);
}

/** A licensed track's recorded terms, ready to show; null for tracks without recorded terms. */
export function licenceTerms(
  track: Pick<MusicTrackRow, "license" | "rights">,
  now = Date.now(),
): {
  licensor: string | null;
  reference: string | null;
  uses: string[];
  /** Uses the licence doesn't cover (empty when it covers all media). */
  excluded: string[];
  territories: string | null;
  expiresOn: string | null;
  expired: boolean;
  /** Free-form conditions recorded with the licence (credit wording, edit rules, campaigns…). */
  notes: string | null;
  summary: string;
} | null {
  if (track.license !== "licensed") return null;
  const rights = track.rights ?? {};
  const text = (key: string) =>
    typeof rights[key] === "string" && (rights[key] as string).trim()
      ? (rights[key] as string).trim()
      : null;
  const scopes = Array.isArray(rights["scopes"]) ? (rights["scopes"] as string[]) : [];
  const all = scopes.includes("all");
  const uses = all
    ? ["All media"]
    : RIGHTS_SCOPES.filter((scope) => scopes.includes(scope.id)).map((scope) => scope.label);
  const excluded = all
    ? []
    : RIGHTS_SCOPES.filter((scope) => scope.id !== "all" && !scopes.includes(scope.id)).map(
        (scope) => scope.label,
      );
  const expiresOn = text("expiresOn");
  const territories = text("territories");
  const licensor = text("licensor");
  return {
    licensor,
    reference: text("reference"),
    uses,
    excluded,
    territories,
    expiresOn,
    expired: rightsExpired(rights, now),
    notes: text("notes"),
    summary: licenceSummary({ licensor, uses, territories, expiresOn }),
  };
}

/** "From Epidemic Sound · Paid social and online ads · Worldwide · until 2027-01-31". */
function licenceSummary(terms: {
  licensor: string | null;
  uses: string[];
  territories: string | null;
  expiresOn: string | null;
}): string {
  return [
    terms.licensor ? `From ${terms.licensor}` : "Licensed",
    terms.uses.length ? terms.uses.join(", ") : "no uses recorded",
    terms.territories,
    terms.expiresOn ? `until ${terms.expiresOn}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One licence kept with a rendered video (its `music_licences` metadata),
 * worded as the track's terms were when it was rendered: what it was licensed
 * for and where, its reference and conditions; for AI music, who made it and
 * its usage limits.
 */
export function keptLicenceLine(entry: Record<string, unknown>): string {
  const text = (key: string) =>
    typeof entry[key] === "string" && (entry[key] as string).trim()
      ? (entry[key] as string).trim()
      : null;
  const name = text("title") ?? "Music";
  const notes = text("notes");
  if (entry["licence"] !== "licensed")
    return `${name}: ${text("licensor") ?? "licensed"}${notes ? ` · ${notes}` : ""}`;
  const uses = Array.isArray(entry["uses"])
    ? (entry["uses"] as unknown[]).filter((use): use is string => typeof use === "string")
    : [];
  const summary = licenceSummary({
    licensor: text("licensor"),
    uses,
    territories: text("territories"),
    expiresOn: text("expires_on"),
  });
  const reference = text("reference");
  return `${name}: ${summary}${reference ? ` · Ref ${reference}` : ""}${notes ? ` · Conditions: ${notes}` : ""}`;
}

/** Why a track can't go into new work, or null when it can. */
export function licenceBlocker(
  track: Pick<MusicTrackRow, "title" | "license" | "rights">,
  now = Date.now(),
): string | null {
  const terms = licenceTerms(track, now);
  if (terms?.expired)
    return `The licence for “${track.title}” ran out on ${terms.expiresOn}. Renew its licence (Renew licence, on the track) to use it again.`;
  return null;
}

/** Short guidance on commercial recordings (chart songs), shown in the library. */
export const SONG_GUIDANCE = [
  {
    title: "Why a chart song can't just be added",
    body: "A released song needs two licences for video: one for the recording (usually the label) and one for the composition (the publisher). They're negotiated for each use, channel and territory. No self-serve service licenses chart songs for paid brand ads.",
  },
  {
    title: "Posting natively on TikTok or Instagram",
    body: "For organic posts, add the song inside the app from TikTok's Commercial Music Library or Meta's Sound Collection when you publish. Those licences cover that platform only, so render here without the song.",
  },
  {
    title: "A comprehensive pre-cleared catalogue",
    body: "Subscription libraries such as Soundstripe, Epidemic Sound or Artlist license tens of thousands of professional tracks for brand use, including ads, on business plans. Upload a downloaded track here as “Licensed” with its licence ID. Soundstripe and Epidemic Sound also offer partner APIs that can be connected to search their catalogues from inside the studio.",
  },
  {
    title: "A specific hit for a campaign",
    body: "Ask the label and publisher (or a music supervisor) for a sync licence that names the campaign, media and dates. Then upload the track as “Licensed” and record those terms.",
  },
  {
    title: "Just the instrumental",
    body: "An instrumental of a released song still uses the composition, so it needs the same licences. For tracks you own or have licensed, or for AI and Creative Commons tracks, “Make instrumental” separates the vocals.",
  },
] as const;
