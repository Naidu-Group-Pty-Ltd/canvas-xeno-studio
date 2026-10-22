import { describe, expect, test } from "bun:test";
import {
  defaultRights,
  editCredits,
  effectiveRights,
  publicUseCheck,
  timelineUses,
  worstStatus,
  type AssetRights,
  type RecordedRights,
  type RightsFacts,
} from "../../src/lib/rights/rights";

type Asset = RightsFacts["asset"];
type Track = NonNullable<RightsFacts["track"]>;

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset-1",
  title: "A file",
  asset_type: "image",
  source_type: "uploaded",
  storage_bucket: "generation-inputs",
  generation_id: null,
  metadata: {},
  ...overrides,
});

const track = (overrides: Partial<Track> = {}): Track => ({
  id: "track-1",
  title: "National Treasures (Instrumental)",
  artist: "Drake",
  source: "upload",
  provider: null,
  license: "licensed",
  license_version: null,
  license_url: null,
  attribution: null,
  source_url: null,
  usage_notes: "Use only within the licence recorded with the track.",
  rights: {
    licensor: "The client",
    scopes: ["organic_social", "paid_social"],
    territories: "Worldwide",
    expiresOn: null,
    notes: "",
    confirmedBy: "user-1",
    confirmedAt: "2026-10-22T09:00:00Z",
  },
  ...overrides,
});

const recorded = (overrides: Partial<RecordedRights> = {}): RecordedRights => ({
  asset_id: "asset-1",
  source: null,
  licence: null,
  licence_url: null,
  status: "cleared",
  credit_line: null,
  notes: null,
  updated_by: "user-2",
  updated_at: "2026-10-22T10:00:00Z",
  confirmed_by: "user-2",
  confirmed_at: "2026-10-22T10:00:00Z",
  ...overrides,
});

describe("a file's rights, worked out until someone records them", () => {
  test("music from the library takes its track's licence and credit", () => {
    const licensed = defaultRights({ asset: asset({ asset_type: "audio" }), track: track() });
    expect(licensed).toMatchObject({
      basis: "music_library",
      musicTrackId: "track-1",
      status: "cleared",
      source: "Uploaded to the music library, licensed from The client",
      licence:
        "Licensed: From The client · Organic social posts, Paid social and online ads · Worldwide",
      confirmedBy: "user-1",
      creditLine: null,
    });
    const free = defaultRights({
      asset: asset({ asset_type: "audio", storage_bucket: "generated-assets" }),
      track: track({
        source: "openverse",
        provider: "Freesound",
        artist: "Jo",
        title: "Rain",
        license: "by",
        license_version: "4.0",
        license_url: "https://creativecommons.org/licenses/by/4.0/",
        source_url: "https://freesound.org/s/1/",
        rights: {},
      }),
    });
    expect(free).toMatchObject({
      status: "cleared",
      source: "Found through Openverse (Freesound), by Jo",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    });
    expect(free.creditLine).toContain("“Rain” by Jo, licensed under CC BY 4.0");
  });

  test("a licence that has run out isn't cleared, and one never confirmed is to confirm", () => {
    const expired = defaultRights({
      asset: asset({ asset_type: "audio" }),
      track: track({ rights: { ...track().rights, expiresOn: "2026-01-31" } }),
    });
    expect(expired.status).toBe("not_cleared");
    expect(expired.notes).toContain("ran out on 2026-01-31");
    const unconfirmed = defaultRights({
      asset: asset({ asset_type: "audio" }),
      track: track({ license: "owned", rights: {} }),
    });
    expect(unconfirmed.status).toBe("to_confirm");
  });

  test("a studio generation is under Higgsfield's terms, said by name", () => {
    const made = defaultRights({
      asset: asset({
        storage_bucket: "generated-assets",
        source_type: "generated",
        generation_id: "g-1",
      }),
      generation: {
        modelName: "Marketing Studio 2.5 Sunburst",
        modelPath: "marketing-studio/image/sunburst",
      },
    });
    expect(made).toMatchObject({
      basis: "provider_terms",
      status: "cleared",
      source: "Generated with Marketing Studio 2.5 Sunburst through Higgsfield",
      licence: "Higgsfield's terms of service",
    });
    const katana = defaultRights({
      asset: asset({
        storage_bucket: "generated-assets",
        source_type: "generated",
        metadata: { provider: "higgsfield_katana" },
      }),
    });
    expect(katana.source).toBe("Made with Higgsfield's Katana");
  });

  test("a generation made from a file that isn't cleared is to confirm, and says from what", () => {
    const screenshot = defaultRights({
      asset: asset({ id: "shot", title: "Command Centre screenshot" }),
    });
    const frame = defaultRights({
      asset: asset({
        storage_bucket: "generated-assets",
        source_type: "generated",
        generation_id: "g-2",
      }),
      generation: { modelName: "Sunburst", modelPath: null },
      inputs: [screenshot],
    });
    expect(frame.status).toBe("to_confirm");
    expect(frame.notes).toBe(
      "Made from “Command Centre screenshot” (to confirm): its rights follow theirs.",
    );
  });

  test("a voiceover made in the Voice tab is under ElevenLabs' terms; one imported is to confirm", () => {
    const made = defaultRights({
      asset: asset({
        asset_type: "audio",
        storage_bucket: "generated-assets",
        source_type: "generated",
      }),
      voiceover: { provider: "elevenlabs", voiceName: "Janice" },
    });
    expect(made).toMatchObject({
      status: "cleared",
      source: "A voiceover made in the studio with ElevenLabs (Janice)",
      licence: "ElevenLabs' terms of service",
    });
    const imported = defaultRights({
      asset: asset({
        asset_type: "audio",
        metadata: {
          source: "studio_api",
          imported_voiceover: {
            statement:
              "Recorded by or for the brand, with the speaker's permission to use their voice in its content.",
          },
        },
      }),
    });
    expect(imported).toMatchObject({ status: "to_confirm", basis: "api_import" });
    expect(imported.licence).toContain("with the speaker's permission");
  });

  test("uploads and API imports are to confirm", () => {
    expect(defaultRights({ asset: asset(), uploaderName: "Alex" })).toMatchObject({
      status: "to_confirm",
      basis: "upload",
      source: "Uploaded by Alex",
      licence: "Not recorded",
    });
    expect(
      defaultRights({
        asset: asset({
          metadata: { source: "studio_api", origin: "https://example.com/logo.png" },
        }),
      }),
    ).toMatchObject({
      status: "to_confirm",
      basis: "api_import",
      source: "Imported through the studio's API from https://example.com/logo.png",
    });
    // A file outside the output bucket isn't the studio's, whatever its record says.
    expect(
      defaultRights({ asset: asset({ source_type: "generated", generation_id: "g-9" }) }).status,
    ).toBe("to_confirm");
  });

  test("what the studio cut from a file, or rendered, follows what it was made from", () => {
    const from: AssetRights = defaultRights({
      asset: asset({
        id: "clip",
        title: "Clip 4",
        storage_bucket: "generated-assets",
        generation_id: "g-3",
      }),
      generation: { modelName: "Kling 3.0 Pro", modelPath: null },
    });
    const frame = defaultRights({
      asset: asset({
        storage_bucket: "generated-assets",
        source_type: "generated",
        metadata: { derived: true, derived_from_asset_id: "clip" },
      }),
      derivedFrom: from,
    });
    expect(frame).toMatchObject({
      basis: "derived",
      status: "cleared",
      source: "Made by the studio from “Clip 4”",
      licence: "Higgsfield's terms of service",
    });
    const render = defaultRights({
      asset: asset({
        asset_type: "video",
        storage_bucket: "generated-assets",
        source_type: "generated",
        metadata: {
          task_type: "render_sequence",
          credit_lines: ["Map data © GeoNames (CC BY 4.0)."],
          rights_check: {
            status: "cleared",
            confirmed_by: "user-2",
            confirmed_at: "2026-10-22T11:00:00Z",
          },
        },
      }),
    });
    expect(render).toMatchObject({
      basis: "studio_render",
      status: "cleared",
      creditLine: "Map data © GeoNames (CC BY 4.0).",
      confirmedBy: "user-2",
    });
  });

  test("the worst of several statuses", () => {
    expect(worstStatus(["cleared", "to_confirm"])).toBe("to_confirm");
    expect(worstStatus(["cleared", "not_cleared", "to_confirm"])).toBe("not_cleared");
    expect(worstStatus([])).toBe("cleared");
  });
});

describe("what a person records", () => {
  test("stands over what was worked out, with who set it and confirmed it", () => {
    const upload = defaultRights({ asset: asset({ title: "Globe pins" }) });
    const set = effectiveRights(
      upload,
      recorded({
        source: "GeoNames gazetteer",
        licence: "CC BY 4.0",
        licence_url: "https://creativecommons.org/licenses/by/4.0/",
        credit_line: "Place data © GeoNames (geonames.org), CC BY 4.0.",
      }),
    );
    expect(set).toMatchObject({
      recorded: true,
      status: "cleared",
      source: "GeoNames gazetteer",
      licence: "CC BY 4.0",
      creditLine: "Place data © GeoNames (geonames.org), CC BY 4.0.",
      confirmedBy: "user-2",
      updatedBy: "user-2",
    });
    expect(effectiveRights(upload, null)).toBe(upload);
  });

  test("a music track's licence stays the library's; only its status is a person's to set", () => {
    const music = defaultRights({ asset: asset({ asset_type: "audio" }), track: track() });
    const held = effectiveRights(
      music,
      recorded({
        status: "to_confirm",
        licence: "Something else",
        credit_line: "A credit",
        notes: "The client confirms public use before release.",
        confirmed_by: null,
        confirmed_at: null,
      }),
    );
    expect(held.status).toBe("to_confirm");
    expect(held.licence).toBe(music.licence);
    expect(held.creditLine).toBeNull();
    expect(held.notes).toBe("The client confirms public use before release.");
    // A licence that has run out isn't cleared by anyone's say-so.
    const expired = defaultRights({
      asset: asset({ asset_type: "audio" }),
      track: track({ rights: { ...track().rights, expiresOn: "2026-01-31" } }),
    });
    expect(effectiveRights(expired, recorded({ status: "cleared" })).status).toBe("not_cleared");
  });
});

describe("an edit's credits", () => {
  const rights = new Map<string, AssetRights>([
    [
      "music",
      defaultRights({
        asset: asset({
          id: "music",
          title: "Rain",
          asset_type: "audio",
          storage_bucket: "generated-assets",
        }),
        track: track({
          title: "Rain",
          license: "by",
          license_version: "4.0",
          rights: {},
          artist: "Jo",
        }),
      }),
    ],
    [
      "voice",
      defaultRights({ asset: asset({ id: "voice", title: "Paced master", asset_type: "audio" }) }),
    ],
    [
      "clip",
      defaultRights({
        asset: asset({
          id: "clip",
          title: "Logo take 2",
          storage_bucket: "generated-assets",
          generation_id: "g",
        }),
        generation: { modelName: "Kling 3.0 Pro", modelPath: null },
      }),
    ],
    [
      "map",
      effectiveRights(
        defaultRights({ asset: asset({ id: "map", title: "Globe" }) }),
        recorded({ asset_id: "map", credit_line: "Place data © GeoNames, CC BY 4.0." }),
      ),
    ],
  ]);
  const uses = timelineUses({
    clips: [
      { assetId: "clip", kind: "video" },
      { assetId: "map", kind: "image" },
      { assetId: "clip", kind: "video" },
    ],
    images: [{ assetId: "map" }],
    audio: [
      { assetId: "voice", role: "voiceover" },
      { assetId: "music", role: "music" },
    ],
  });

  test("lists every file it uses once, with how it uses it, and the credit lines owed once each", () => {
    const credits = editCredits(uses, rights);
    expect(credits.files.map((file) => [file.title, file.uses, file.status])).toEqual([
      ["Logo take 2", ["clip"], "cleared"],
      ["Globe", ["still", "picture"], "cleared"],
      ["Paced master", ["voiceover"], "to_confirm"],
      ["Rain", ["music"], "cleared"],
    ]);
    expect(credits.creditLines).toHaveLength(2);
    expect(credits.creditLines[0]).toBe("Place data © GeoNames, CC BY 4.0.");
    expect(credits.creditLines[1]).toContain("“Rain” by Jo, licensed under CC BY 4.0");
    expect(credits.notCleared.map((file) => file.assetId)).toEqual(["voice"]);
    expect(credits.cleared).toBe(false);
  });

  test("a file no longer in the library isn't cleared", () => {
    const credits = editCredits([{ assetId: "gone", use: "clip" }], rights);
    expect(credits.files[0]).toMatchObject({ status: "not_cleared", source: "Not in the library" });
  });

  test("a render for public use is held until every file is cleared or its exceptions are confirmed", () => {
    const credits = editCredits(uses, rights);
    const held = publicUseCheck(credits, false);
    expect(held.held).toBe(true);
    expect(held.message).toBe(
      "This render is for public use, but 1 file it uses isn't cleared: “Paced master” (to confirm). Clear it in the library (the file's details), or confirm it as an exception to render anyway.",
    );
    expect(publicUseCheck(credits, ["clip"]).held).toBe(true);
    const confirmed = publicUseCheck(credits, ["voice"]);
    expect(confirmed).toMatchObject({ held: false, message: null });
    expect(confirmed.exceptions.map((file) => file.assetId)).toEqual(["voice"]);
    expect(publicUseCheck(credits, true).exceptions).toHaveLength(1);
    const allClear = editCredits([{ assetId: "clip", use: "clip" }], rights);
    expect(publicUseCheck(allClear, false)).toEqual({ held: false, exceptions: [], message: null });
  });
});
