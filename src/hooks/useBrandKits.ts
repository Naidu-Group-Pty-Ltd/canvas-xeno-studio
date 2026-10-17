import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingTableError } from "@/lib/edit/errors";
import { brandKitOf, kitForProject, type BrandFont, type BrandKit } from "@/lib/edit/brand";
import type { Timeline } from "@/lib/edit/timeline";
import {
  BRAND_FONT_BUCKET,
  BRAND_FONT_PREFIX,
  fontFamily,
  fontKind,
  FONT_FAMILY_PATTERN,
} from "@/lib/edit/font-family";

/**
 * The team's brand kits (not archived), the default first. `supported` is
 * false before the database has them (migration 0018), when none are offered.
 */
export function useBrandKits() {
  return useQuery({
    queryKey: ["brand_kits"],
    staleTime: 60_000,
    queryFn: async (): Promise<{ supported: boolean; kits: BrandKit[] }> => {
      const { data, error } = await supabase
        .from("brand_kits")
        .select("*")
        .eq("is_archived", false)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) {
        if (isMissingTableError(error)) return { supported: false, kits: [] };
        throw error;
      }
      return {
        supported: true,
        kits: (data ?? []).map((row) => brandKitOf(row as Record<string, unknown>)),
      };
    },
  });
}

/** The kit an edit is styled from: the one it names, else its project's, else the default. */
export function useEditBrandKit(
  timeline: Pick<Timeline, "brandKitId">,
  projectId: string | null,
): { kit: BrandKit | null; kits: BrandKit[]; supported: boolean } {
  const { data } = useBrandKits();
  const kits = data?.kits ?? [];
  const kit =
    (timeline.brandKitId ? kits.find((entry) => entry.id === timeline.brandKitId) : undefined) ??
    kitForProject(kits, projectId);
  return { kit, kits, supported: data?.supported ?? false };
}

/** The largest font file taken (a family's whole set of weights is rarely more). */
const FONT_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Uploads a brand font: read first as a font (TrueType or OpenType; WOFF
 * isn't one the render can use), by the family it names itself by, then
 * kept where brand fonts are. The kit keeps it once saved.
 */
export async function uploadBrandFont(file: File): Promise<BrandFont> {
  if (file.size > FONT_MAX_BYTES) throw new Error("That font file is over 12 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = fontKind(bytes);
  if (!kind) throw new Error("Upload the font as a TrueType (.ttf) or OpenType (.otf) file");
  const family = fontFamily(bytes);
  if (!family || !FONT_FAMILY_PATTERN.test(family))
    throw new Error("That font's name couldn't be read from the file");
  const path = `${BRAND_FONT_PREFIX}${crypto.randomUUID()}.${kind}`;
  const { error } = await supabase.storage.from(BRAND_FONT_BUCKET).upload(path, bytes, {
    contentType: kind === "otf" ? "font/otf" : "font/ttf",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { family, bucket: BRAND_FONT_BUCKET, path };
}

/** Fonts loaded into this page, by file: each once. */
const loaded = new Map<string, Promise<void>>();

/**
 * Loads brand fonts into the page, so the Editor's preview sets titles in
 * them as the render will. Returns how many have loaded, which changes as
 * each arrives so the preview draws again.
 */
export function useBrandFontFaces(
  fonts: { family: string; bucket: string; path: string }[],
): number {
  const [ready, setReady] = useState(0);
  const key = fonts.map((font) => `${font.family}|${font.bucket}/${font.path}`).join(",");
  useEffect(() => {
    if (!fonts.length || typeof document === "undefined" || !("fonts" in document)) return;
    let live = true;
    for (const font of fonts) {
      const id = `${font.bucket}/${font.path}`;
      let work = loaded.get(id);
      if (!work) {
        work = (async () => {
          const { data } = await supabase.storage
            .from(font.bucket)
            .createSignedUrl(font.path, 3600);
          if (!data?.signedUrl) throw new Error("unreadable");
          const face = new FontFace(font.family, `url(${JSON.stringify(data.signedUrl)})`);
          document.fonts.add(await face.load());
        })();
        loaded.set(id, work);
        work.catch(() => loaded.delete(id));
      }
      void work.then(
        () => live && setReady((count) => count + 1),
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
    // The fonts are named by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ready;
}
