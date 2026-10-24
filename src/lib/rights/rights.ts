/**
 * The licence and credits ledger (migration 0027_asset_rights): every file
 * the studio uses carries where it came from, its licence and its status for
 * public use (cleared, to confirm, not cleared), with the credit line owed
 * where there is one.
 *
 * Until a person records them, a file's rights are worked out from what the
 * studio knows of it:
 *   - music from the library takes its track's licence and credit, read from
 *     the music library each time (it stays the record of music; nothing is
 *     copied from it);
 *   - what the studio made (a generation, a Katana video, a voiceover in the
 *     Voice tab) is under its provider's terms, said by name: cleared, unless
 *     a file it was made from isn't;
 *   - what the studio rendered or cut from another file follows what it was
 *     made from;
 *   - an upload, or a file imported through the API, is to confirm.
 * What a person records stands instead (with who set it and when, and who
 * confirmed it and when), except that a music track's licence and credit
 * stay the music library's, and a licence that has run out is never cleared.
 *
 * An edit's credits are every file it uses with its licence and status, and
 * the credit lines owed. A render for public use is held until every file it
 * uses is cleared, or someone confirms the exceptions.
 *
 * Pure: no I/O, so it is unit-testable.
 */
import {
  creditLine,
  licenceBlocker,
  licenceTerms,
  MUSIC_LICENSES,
  type MusicTrackRow,
} from "../music/catalog";

export const RIGHTS_STATUSES = ["cleared", "to_confirm", "not_cleared"] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const STATUS_LABELS: Record<RightsStatus, string> = {
  cleared: "Cleared",
  to_confirm: "To confirm",
  not_cleared: "Not cleared",
};

/** Said where rights are recorded before the database has the ledger. */
export const RIGHTS_NEED_UPDATE =
  "Recording a file's rights needs a database update (migration 0027_asset_rights). Ask an admin to apply it.";

/** Where a file's rights come from when nobody has recorded them. */
export type RightsBasis =
  | "music_library"
  | "provider_terms"
  | "studio_render"
  | "derived"
  | "upload"
  | "api_import"
  | "unknown";

export interface AssetRights {
  assetId: string;
  title: string | null;
  source: string;
  licence: string;
  licenceUrl: string | null;
  status: RightsStatus;
  creditLine: string | null;
  notes: string | null;
  basis: RightsBasis;
  /** A music library track: its licence and credit are the library's. */
  musicTrackId: string | null;
  /** Set by a person (else worked out). */
  recorded: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

/** A row of asset_rights, as the database keeps it. */
export interface RecordedRights {
  asset_id: string;
  source: string | null;
  licence: string | null;
  licence_url: string | null;
  status: string;
  credit_line: string | null;
  notes: string | null;
  updated_by: string | null;
  updated_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

/** What the studio knows of a file, for working out its rights. */
export interface RightsFacts {
  asset: {
    id: string;
    title: string | null;
    asset_type: string;
    source_type: string;
    storage_bucket: string;
    generation_id: string | null;
    metadata: Record<string, unknown> | null;
  };
  /** Its music library track, if it has one. */
  track?: Pick<
    MusicTrackRow,
    | "id"
    | "title"
    | "artist"
    | "source"
    | "provider"
    | "license"
    | "license_version"
    | "license_url"
    | "attribution"
    | "source_url"
    | "usage_notes"
    | "rights"
  > | null;
  /** The generation that made it (a studio generation), with its model's name. */
  generation?: { modelName: string | null; modelPath: string | null } | null;
  /** A voiceover the studio made of it (the Voice tab), and whose voice. */
  voiceover?: { provider: string | null; voiceName: string | null } | null;
  /** The files it was made from (a generation's inputs), as their rights stand. */
  inputs?: AssetRights[];
  /** The file it was cut or made from (a frame, a trim, a prepared voiceover), as its rights stand. */
  derivedFrom?: AssetRights | null;
  /** Who added it, for an upload. */
  uploaderName?: string | null;
}

/** The bucket only the server writes: what is in it the studio made (or imported for the library). */
export const OUTPUT_BUCKET = "generated-assets";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function worked(
  facts: RightsFacts,
  rights: Pick<AssetRights, "source" | "licence" | "status" | "basis"> & Partial<AssetRights>,
): AssetRights {
  return {
    assetId: facts.asset.id,
    title: facts.asset.title,
    licenceUrl: null,
    creditLine: null,
    notes: null,
    musicTrackId: null,
    recorded: false,
    updatedBy: null,
    updatedAt: null,
    confirmedBy: null,
    confirmedAt: null,
    ...rights,
  };
}

/** Where a music library track came from, in words. */
function trackSource(track: NonNullable<RightsFacts["track"]>): string {
  if (track.source === "openverse")
    return `Found through Openverse${track.provider ? ` (${track.provider})` : ""}${track.artist ? `, by ${track.artist}` : ""}`;
  if (track.source === "elevenlabs") return "Made in the studio with Eleven Music (ElevenLabs)";
  if (track.source === "derived")
    return track.provider === "tempo"
      ? "A library track the studio changed the tempo of, its pitch kept"
      : "An instrumental the studio made of a library track";
  const licensor = text(track.rights?.["licensor"]);
  return `Uploaded to the music library${licensor ? `, licensed from ${licensor}` : ""}`;
}

/** A music library track's rights, read from the library. */
function musicRights(facts: RightsFacts, track: NonNullable<RightsFacts["track"]>): AssetRights {
  const licence = MUSIC_LICENSES[track.license];
  const terms = licenceTerms(track);
  const expired = licenceBlocker({
    title: track.title,
    license: track.license,
    rights: track.rights,
  });
  const confirmedBy = text(track.rights?.["confirmedBy"]);
  const confirmedAt = text(track.rights?.["confirmedAt"]);
  // A licence the brand holds is cleared once it was confirmed (by whoever added it).
  const held = track.license === "licensed" || track.license === "owned";
  const status: RightsStatus = expired
    ? "not_cleared"
    : held && !confirmedBy
      ? "to_confirm"
      : "cleared";
  const named =
    track.license === "by"
      ? `CC BY${track.license_version ? ` ${track.license_version}` : ""}`
      : (licence?.label ?? track.license);
  return worked(facts, {
    source: trackSource(track),
    licence: terms ? `${named}: ${terms.summary}` : named,
    licenceUrl: track.license_url ?? null,
    status,
    creditLine: creditLine(track),
    notes:
      expired ??
      ([terms?.notes ? `Conditions: ${terms.notes}` : null, track.usage_notes ?? licence?.note]
        .filter(Boolean)
        .join(" ") ||
        null),
    basis: "music_library",
    musicTrackId: track.id,
    confirmedBy: held ? confirmedBy : null,
    confirmedAt: held ? confirmedAt : null,
  });
}

/** The worst of several statuses: not cleared, then to confirm, then cleared. */
export function worstStatus(statuses: readonly RightsStatus[]): RightsStatus {
  if (statuses.includes("not_cleared")) return "not_cleared";
  if (statuses.includes("to_confirm")) return "to_confirm";
  return "cleared";
}

/** Made from files that aren't all cleared: those files, in words. */
function uncleared(inputs: readonly AssetRights[]): string | null {
  const open = inputs.filter((input) => input.status !== "cleared");
  if (!open.length) return null;
  const names = open
    .slice(0, 3)
    .map((input) => `“${input.title ?? "a file"}” (${STATUS_LABELS[input.status].toLowerCase()})`)
    .join(", ");
  return `Made from ${names}${open.length > 3 ? ` and ${open.length - 3} more` : ""}: its rights follow theirs.`;
}

/**
 * A file's rights as worked out when nobody has recorded them (see the
 * module's comment). Only the server writes files in the output bucket, so
 * what is there and says it was made by the studio was; anything else
 * someone added is an upload.
 */
export function defaultRights(facts: RightsFacts): AssetRights {
  const { asset } = facts;
  const metadata = asset.metadata ?? {};
  if (facts.track) return musicRights(facts, facts.track);
  const madeHere = asset.storage_bucket === OUTPUT_BUCKET;

  if (madeHere && metadata["task_type"] === "render_sequence") {
    const check = (metadata["rights_check"] ?? null) as Record<string, unknown> | null;
    const lines = Array.isArray(metadata["credit_lines"])
      ? (metadata["credit_lines"] as unknown[]).filter(
          (line): line is string => typeof line === "string",
        )
      : [];
    const status = (check?.["status"] as RightsStatus | undefined) ?? "to_confirm";
    return worked(facts, {
      source: "Rendered by the studio from an edit",
      licence: "As the files it was made from (see its credits)",
      status: RIGHTS_STATUSES.includes(status) ? status : "to_confirm",
      creditLine: lines.length ? lines.join(" ") : null,
      notes:
        status === "cleared" && check?.["confirmed_by"]
          ? "Rendered for public use, with the exceptions confirmed."
          : status === "cleared"
            ? "Every file it was made from was cleared when it was rendered."
            : "Not every file it was made from was cleared when it was rendered.",
      basis: "studio_render",
      confirmedBy: text(check?.["confirmed_by"]),
      confirmedAt: text(check?.["confirmed_at"]),
    });
  }

  if (madeHere && facts.voiceover)
    return worked(facts, {
      source: `A voiceover made in the studio with ElevenLabs${facts.voiceover.voiceName ? ` (${facts.voiceover.voiceName})` : ""}`,
      licence: "ElevenLabs' terms of service",
      status: "cleared",
      notes: "Commercial use of ElevenLabs voices needs a paid ElevenLabs plan.",
      basis: "provider_terms",
    });

  if (madeHere && (asset.generation_id || metadata["provider"] === "higgsfield_katana")) {
    const katana = metadata["provider"] === "higgsfield_katana";
    const model = facts.generation?.modelName ?? facts.generation?.modelPath ?? null;
    const madeFrom = uncleared(facts.inputs ?? []);
    return worked(facts, {
      source: katana
        ? "Made with Higgsfield's Katana"
        : `Generated with ${model ?? "a model"} through Higgsfield`,
      licence: "Higgsfield's terms of service",
      status: madeFrom ? "to_confirm" : "cleared",
      notes:
        madeFrom ??
        "Under Higgsfield's terms for what its models make; the model's own maker may have terms too.",
      basis: "provider_terms",
    });
  }

  if (madeHere && metadata["derived"] === true) {
    const from = facts.derivedFrom ?? null;
    return worked(facts, {
      source: from?.title
        ? `Made by the studio from “${from.title}”`
        : "Made by the studio from another file",
      licence: from?.licence ?? "As the file it was made from",
      licenceUrl: from?.licenceUrl ?? null,
      status: from?.status ?? "to_confirm",
      creditLine: from?.creditLine ?? null,
      notes: from
        ? "Its rights follow the file it was made from."
        : "The file it was made from isn't in the library.",
      basis: "derived",
    });
  }

  const imported = metadata["source"] === "studio_api";
  const voiceover = (metadata["imported_voiceover"] ?? null) as Record<string, unknown> | null;
  if (asset.source_type === "uploaded" || !madeHere) {
    const origin = text(metadata["origin"]);
    return worked(facts, {
      source: imported
        ? `Imported through the studio's API${origin ? ` from ${origin}` : ""}`
        : `Uploaded${facts.uploaderName ? ` by ${facts.uploaderName}` : ""}`,
      licence: voiceover
        ? "Recorded by or for the brand, with the speaker's permission (as confirmed when it was imported)"
        : "Not recorded",
      status: "to_confirm",
      notes: voiceover
        ? `A voiceover recorded elsewhere. Confirmed on import: “${text(voiceover["statement"]) ?? "recorded by or for the brand"}”`
        : null,
      basis: imported ? "api_import" : "upload",
    });
  }

  return worked(facts, {
    source: "Made by the studio",
    licence: "Not recorded",
    status: "to_confirm",
    basis: "unknown",
  });
}

/**
 * A file's rights as they stand: what a person recorded over what is worked
 * out. A music track's licence, source and credit stay the music library's,
 * and a licence that has run out is never cleared.
 */
export function effectiveRights(
  base: AssetRights,
  recorded: RecordedRights | null | undefined,
): AssetRights {
  if (!recorded) return base;
  const status = RIGHTS_STATUSES.includes(recorded.status as RightsStatus)
    ? (recorded.status as RightsStatus)
    : base.status;
  const music = base.basis === "music_library";
  const expired = music && base.status === "not_cleared" && !!base.notes?.includes("ran out");
  return {
    ...base,
    source: (!music && recorded.source) || base.source,
    licence: (!music && recorded.licence) || base.licence,
    licenceUrl: (!music && recorded.licence_url) || base.licenceUrl,
    creditLine: (!music && recorded.credit_line) || base.creditLine,
    status: expired ? "not_cleared" : status,
    notes: (expired ? base.notes : recorded.notes) ?? base.notes,
    recorded: true,
    updatedBy: recorded.updated_by,
    updatedAt: recorded.updated_at,
    confirmedBy: recorded.confirmed_by ?? (status === base.status ? base.confirmedBy : null),
    confirmedAt: recorded.confirmed_at ?? (status === base.status ? base.confirmedAt : null),
  };
}

/** How an edit uses a file. */
export type FileUse = "clip" | "still" | "picture" | "voiceover" | "music" | "sound_effect";

export const USE_LABELS: Record<FileUse, string> = {
  clip: "Clip",
  still: "Still",
  picture: "Picture over the edit",
  voiceover: "Voiceover",
  music: "Music",
  sound_effect: "Sound effect",
};

export interface EditCredit extends AssetRights {
  /** How the edit uses it (each way, when more than one). */
  uses: FileUse[];
}

export interface EditCredits {
  /** Every file the edit uses, in the order it first appears. */
  files: EditCredit[];
  /** The credit lines owed, each once. */
  creditLines: string[];
  /** The files that aren't cleared. */
  notCleared: EditCredit[];
  /** Every file cleared. */
  cleared: boolean;
}

/** The files a timeline uses, as it uses them: clips, pictures laid over it, and the sound heard. */
export function timelineUses(timeline: {
  clips: { assetId: string; kind: string }[];
  images: { assetId: string }[];
  audio: { assetId: string; role: string }[];
}): { assetId: string; use: FileUse }[] {
  return [
    ...timeline.clips.map((clip) => ({
      assetId: clip.assetId,
      use: (clip.kind === "image" ? "still" : "clip") as FileUse,
    })),
    ...timeline.images.map((image) => ({ assetId: image.assetId, use: "picture" as FileUse })),
    ...timeline.audio.map((item) => ({
      assetId: item.assetId,
      use: (item.role === "voiceover"
        ? "voiceover"
        : item.role === "sfx"
          ? "sound_effect"
          : "music") as FileUse,
    })),
  ];
}

/** An edit's credits: every file it uses with its rights, and the credit lines owed. */
export function editCredits(
  uses: readonly { assetId: string; use: FileUse }[],
  rights: ReadonlyMap<string, AssetRights>,
): EditCredits {
  const files = new Map<string, EditCredit>();
  for (const { assetId, use } of uses) {
    const known = files.get(assetId);
    if (known) {
      if (!known.uses.includes(use)) known.uses.push(use);
      continue;
    }
    const found = rights.get(assetId);
    files.set(assetId, {
      ...(found ??
        worked(
          {
            asset: {
              id: assetId,
              title: null,
              asset_type: "image",
              source_type: "uploaded",
              storage_bucket: "",
              generation_id: null,
              metadata: null,
            },
          },
          {
            source: "Not in the library",
            licence: "Not recorded",
            status: "not_cleared",
            notes: "This file is no longer in the library.",
            basis: "unknown",
          },
        )),
      uses: [use],
    });
  }
  const list = [...files.values()];
  const creditLines = [
    ...new Set(list.map((file) => file.creditLine).filter((line): line is string => !!line)),
  ];
  const notCleared = list.filter((file) => file.status !== "cleared");
  return { files: list, creditLines, notCleared, cleared: notCleared.length === 0 };
}

/** What a render for public use asks about the files it uses. */
export interface PublicUseCheck {
  /** Not started: files aren't cleared and their exceptions aren't confirmed. */
  held: boolean;
  /** The files rendered anyway, as confirmed exceptions. */
  exceptions: EditCredit[];
  message: string | null;
}

/**
 * Whether a render for public use may start: every file it uses cleared, or
 * the ones that aren't confirmed as exceptions (all of them, or each by id).
 */
export function publicUseCheck(
  credits: EditCredits,
  confirmed: boolean | readonly string[],
): PublicUseCheck {
  if (credits.cleared) return { held: false, exceptions: [], message: null };
  const ids = confirmed === true ? null : new Set(confirmed === false ? [] : confirmed);
  const open = credits.notCleared.filter((file) => ids !== null && !ids.has(file.assetId));
  if (!open.length) return { held: false, exceptions: credits.notCleared, message: null };
  const names = open
    .slice(0, 5)
    .map((file) => `“${file.title ?? "a file"}” (${STATUS_LABELS[file.status].toLowerCase()})`)
    .join(", ");
  const more = open.length > 5 ? ` and ${open.length - 5} more` : "";
  return {
    held: true,
    exceptions: [],
    message: `This render is for public use, but ${open.length === 1 ? "1 file it uses isn't" : `${open.length} files it uses aren't`} cleared: ${names}${more}. Clear ${open.length === 1 ? "it" : "them"} in the library (the file's details), or confirm ${open.length === 1 ? "it as an exception" : "them as exceptions"} to render anyway.`,
  };
}
