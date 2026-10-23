/**
 * Motion graphics in the Editor (see src/lib/compositions): the brand each is
 * drawn in (its kit, with the kit's demo record), its scene built here in the
 * browser for the live preview, whether a clip's drawing still matches it,
 * and how a drawing is getting on.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandKits } from "@/hooks/useBrandKits";
import { useAssetsByIds, useSignedMedia, type SignedMedia } from "@/hooks/useEditorData";
import type { AssetRow } from "@/hooks/useStudioData";
import type { BrandFont } from "@/lib/edit/brand";
import { frameSize, type Timeline } from "@/lib/edit/timeline";
import { compositionBrandOf, fontFilesFor, type CompositionBrand } from "@/lib/compositions/brand";
import {
  buildScene,
  compileComposition,
  compositionIdentity,
  type Scene,
} from "@/lib/compositions/compile";
import { compositionClips } from "@/lib/compositions/clips";
import { QUALITY_SETTINGS, type RenderQuality } from "@/lib/compositions/settings";
import { specKey, uuidsIn, type CompositionSpec } from "@/lib/compositions/spec";
import { getCompositionCosts, getCompositionRender } from "@/lib/compositions.functions";
import { getPrivacyMarks } from "@/lib/privacy.functions";

const EMPTY_ASSETS = new Map<string, AssetRow>();
const EMPTY_MEDIA = new Map<string, SignedMedia>();
const EMPTY_FONTS = new Map<string, string>();
/** Shown where a picture is still being fetched, so the layout holds. */
const BLANK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * The brand a composition is drawn in, by the kit it names (none: the
 * studio's own look), as the server draws it.
 */
export function useCompositionBrands(): {
  brandOf: (kitId: string | null) => CompositionBrand;
  ready: boolean;
} {
  const { data: kits, isSuccess: ready } = useBrandKits();
  return useMemo(() => {
    const cache = new Map<string, CompositionBrand>();
    const brandOf = (kitId: string | null) => {
      const key = kitId ?? "";
      let brand = cache.get(key);
      if (!brand) {
        const kit = kitId ? (kits?.kits.find((entry) => entry.id === kitId) ?? null) : null;
        brand = compositionBrandOf(kit);
        cache.set(key, brand);
      }
      return brand;
    };
    return { brandOf, ready };
  }, [kits, ready]);
}

/** Signed links to brand font files, by "bucket/path", for a composition's page. */
export function useSignedFonts(fonts: BrandFont[]) {
  const key = [...new Set(fonts.map((font) => `${font.bucket}/${font.path}`))].sort().join("|");
  return useQuery({
    queryKey: ["signed-fonts", key],
    enabled: fonts.length > 0,
    staleTime: 45 * 60_000,
    refetchInterval: 45 * 60_000,
    queryFn: async () => {
      const signed = new Map<string, string>();
      for (const font of fonts) {
        const id = `${font.bucket}/${font.path}`;
        if (signed.has(id)) continue;
        const { data } = await supabase.storage.from(font.bucket).createSignedUrl(font.path, 3600);
        if (data?.signedUrl) signed.set(id, data.signedUrl);
      }
      return signed;
    },
  });
}

/**
 * Which of these library files are marked layout only (a client's screen, see
 * src/lib/media/layout-only): never placed in a frame, so never drawn in a
 * motion graphic. None before migration 0035.
 */
export function useLayoutOnly(assetIds: string[]): Set<string> {
  const key = [...new Set(assetIds)].sort().join(",");
  const { data } = useQuery({
    queryKey: ["privacy-marks", "motion", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: () => getPrivacyMarks({ data: { assetIds: key.split(",") } }),
  });
  return useMemo(
    () =>
      new Set(
        Object.entries(data ?? {})
          .filter(([, mark]) => mark?.layoutOnly)
          .map(([assetId]) => assetId),
      ),
    [data],
  );
}

/** The library images compositions name (their settings, their brands' logos), with links to show them. */
export function useCompositionImages(ids: string[]): {
  assets: Map<string, AssetRow>;
  media: Map<string, SignedMedia>;
  loading: boolean;
} {
  const { data: assets = EMPTY_ASSETS, isLoading } = useAssetsByIds(ids);
  const images = useMemo(
    () => [...assets.values()].filter((asset) => asset.asset_type === "image"),
    [assets],
  );
  const { data: media = EMPTY_MEDIA } = useSignedMedia(images);
  return { assets, media, loading: ids.length > 0 && isLoading };
}

/** The library images a composition may show: those its settings name, and its brand's logo. */
export function imageIdsFor(spec: CompositionSpec, brand: CompositionBrand): string[] {
  const ids = uuidsIn(spec.params);
  if (brand.logoAssetId) ids.add(brand.logoAssetId);
  return [...ids];
}

/** What the library knows of an image's size, as the server frames it. */
function imageInfoFrom(assets: Map<string, AssetRow>) {
  return (assetId: string) => {
    const asset = assets.get(assetId);
    return asset?.asset_type === "image" && asset.width && asset.height
      ? { width: asset.width, height: asset.height }
      : null;
  };
}

/** A composition's scene for the live preview, its pictures and fonts read from signed links. */
export function previewScene(input: {
  spec: CompositionSpec;
  brand: CompositionBrand;
  width: number;
  height: number;
  fps: number;
  assets: Map<string, AssetRow>;
  media: Map<string, SignedMedia>;
  fonts: Map<string, string>;
}): { scene: Scene | null; error: string | null } {
  try {
    return {
      scene: buildScene({
        spec: input.spec,
        brand: input.brand,
        width: input.width,
        height: input.height,
        fps: input.fps,
        imageInfo: imageInfoFrom(input.assets),
        imageUrl: (assetId) => input.media.get(assetId)?.url ?? BLANK_IMAGE,
        fontUrl: (font) => input.fonts.get(`${font.bucket}/${font.path}`) ?? "",
      }),
      error: null,
    };
  } catch (problem) {
    return {
      scene: null,
      error: problem instanceof Error ? problem.message : "This motion graphic can't be drawn",
    };
  }
}

/** The text that decides a composition's frames, as the server hashes it (null if it can't be compiled). */
export function identityFor(input: {
  spec: CompositionSpec;
  brand: CompositionBrand;
  width: number;
  height: number;
  fps: number;
  quality: RenderQuality;
  assets: Map<string, AssetRow>;
}): string | null {
  try {
    return compositionIdentity(
      compileComposition({
        spec: input.spec,
        brand: input.brand,
        width: input.width,
        height: input.height,
        fps: input.fps,
        settings: QUALITY_SETTINGS[input.quality],
        imageInfo: imageInfoFrom(input.assets),
      }),
    );
  } catch {
    return null;
  }
}

/** Hashes worked out lately, by the text hashed: an edit asks again on every change. */
const hashes = new Map<string, Promise<string>>();

function sha256(text: string): Promise<string> {
  let work = hashes.get(text);
  if (!work) {
    work = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(text))
      .then((digest) =>
        [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
      );
    hashes.set(text, work);
    work.catch(() => hashes.delete(text));
    // Kept to the last few: each text is a whole composition.
    if (hashes.size > 8) hashes.delete(hashes.keys().next().value!);
  }
  return work;
}

/** A composition clip as the Editor shows it. */
export interface ClipDrawing {
  /**
   * Its drawing no longer matches it (its settings, its brand, its demo
   * record or the edit's frame changed since): null until that is known.
   */
  stale: boolean | null;
  /** Its scene, to play live while it is stale. */
  scene: Scene | null;
  /** Why it can't be drawn, if it can't. */
  error: string | null;
}

/**
 * Each composition clip's state in the Editor: whether its drawing still
 * matches it (the hash the server drew it under against the one worked out
 * here from the clip as it is now), and its scene to play live meanwhile.
 */
export function useClipDrawings(
  timeline: Pick<Timeline, "clips" | "aspectRatio" | "resolution" | "fps">,
  /** The clips' files: a drawing records which composition it is. */
  files: Map<string, AssetRow>,
): Map<string, ClipDrawing> {
  const { brandOf, ready } = useCompositionBrands();
  const { width, height } = frameSize(timeline.aspectRatio, timeline.resolution);
  const fps = timeline.fps;
  // Worked out again only when a composition clip changes, not on every change to the edit.
  const key = compositionClips(timeline)
    .map(
      (clip) =>
        `${clip.id}|${clip.assetId}|${clip.composition.quality}|${specKey(clip.composition.spec, clip.composition.brandKitId)}`,
    )
    .join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clips = useMemo(() => compositionClips(timeline), [key]);
  const brands = useMemo(
    () => clips.map((clip) => brandOf(clip.composition.brandKitId)),
    [clips, brandOf],
  );
  const imageIds = useMemo(
    () => [
      ...new Set(
        clips.flatMap((clip, index) => imageIdsFor(clip.composition.spec, brands[index]!)),
      ),
    ],
    [clips, brands],
  );
  const { assets, media, loading } = useCompositionImages(imageIds);
  const fontFiles = useMemo(() => brands.flatMap((brand) => fontFilesFor(brand)), [brands]);
  const { data: fonts = EMPTY_FONTS } = useSignedFonts(fontFiles);

  // What decides each clip's frames now, at the quality it was drawn at.
  const identities = useMemo(() => {
    if (!ready || loading) return null;
    return clips.map((clip, index) =>
      identityFor({
        spec: clip.composition.spec,
        brand: brands[index]!,
        width,
        height,
        fps,
        quality: clip.composition.quality,
        assets,
      }),
    );
  }, [clips, brands, width, height, fps, assets, ready, loading]);

  const [hashed, setHashed] = useState<Map<string, string | null>>(new Map());
  useEffect(() => {
    if (!identities) return;
    let live = true;
    void Promise.all(
      identities.map((text) => (text ? sha256(text).catch(() => null) : Promise.resolve(null))),
    ).then((values) => {
      if (live) setHashed(new Map(clips.map((clip, index) => [clip.id, values[index] ?? null])));
    });
    return () => {
      live = false;
    };
  }, [identities, clips]);

  return useMemo(() => {
    const out = new Map<string, ClipDrawing>();
    clips.forEach((clip, index) => {
      // undefined: not worked out yet; null: its settings can't be compiled.
      const now = hashed.get(clip.id);
      const drawn = drawnHash(files.get(clip.assetId));
      const stale =
        now === undefined ? null : now === null ? true : drawn === null ? null : now !== drawn;
      const built =
        stale === true
          ? previewScene({
              spec: clip.composition.spec,
              brand: brands[index]!,
              width,
              height,
              fps,
              assets,
              media,
              fonts,
            })
          : { scene: null, error: null };
      out.set(clip.id, {
        stale,
        scene: built.scene,
        error:
          built.error ?? (now === null ? "This motion graphic's settings can't be drawn" : null),
      });
    });
    return out;
  }, [clips, files, hashed, brands, width, height, fps, assets, media, fonts]);
}

/** The hash a library video was drawn under, if it is a composition's drawing. */
export function drawnHash(asset: AssetRow | undefined): string | null {
  const record = (asset?.metadata?.["composition"] ?? null) as Record<string, unknown> | null;
  return typeof record?.["hash"] === "string" ? record["hash"] : null;
}

/** The composition render a library video is the drawing of, if it is one. */
export function drawnRenderId(asset: Pick<AssetRow, "metadata">): string | null {
  const record = (asset.metadata?.["composition"] ?? null) as Record<string, unknown> | null;
  return typeof record?.["render_id"] === "string" ? record["render_id"] : null;
}

const SETTLED = new Set(["completed", "failed"]);

/** Composition renders under way, each followed until it settles. */
export function useCompositionRenders(renderIds: string[]) {
  return useQueries({
    queries: renderIds.map((renderId) => ({
      queryKey: ["composition-render", renderId],
      queryFn: () => getCompositionRender({ data: { renderId } }),
      refetchInterval: (query: { state: { data?: unknown } }) => {
        const status = (query.state.data as { status?: string } | undefined)?.status;
        return status && SETTLED.has(status) ? false : 2500;
      },
      retry: 2,
    })),
  });
}

/** What one drawing has been measured to take at each quality, for estimates (null: not measured yet). */
export function useCompositionCosts() {
  return useQuery({
    queryKey: ["composition-costs"],
    queryFn: () => getCompositionCosts(),
    staleTime: 10 * 60_000,
    retry: false,
  });
}
