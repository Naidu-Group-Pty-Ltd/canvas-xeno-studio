/**
 * A brand guidelines document read in the browser for a design system
 * import: its text, pictures of the pages that show its colours, type and
 * logo (a guideline's swatches and specimens are pictures, not text), and
 * the pictures in it. The pictures are uploaded to the import's folder for
 * the server and its AI to look at.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  parseBriefDocument,
  type ExtractedImage,
  type ParsedBrief,
} from "@/lib/briefs/parse-document";

/** Pages worth picturing: the cover (often the logo) and those about colour, type, logo or imagery. */
const BRAND_PAGE =
  /colou?rs?\b|palette|pantone|\bpms\b|cmyk|\brgb\b|\bhex\b|swatch|typograph|typeface|font|logo|logotype|wordmark|imagery|photograph|illustration|tone of voice|iconograph/i;

export const GUIDELINE_LIMITS = { pages: 10, images: 6 } as const;

/** Reads a guidelines document (PDF, Word, PowerPoint or text). */
export function readGuidelines(
  file: File,
  onProgress?: (message: string) => void,
): Promise<ParsedBrief> {
  return parseBriefDocument(file, onProgress, {
    pick: (page, text) => page <= 2 || BRAND_PAGE.test(text),
    max: GUIDELINE_LIMITS.pages,
  });
}

export interface UploadedPicture {
  path: string;
  mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  width: number | null;
  height: number | null;
  kind: "page" | "image";
  page: number | null;
  bytes: number;
}

const MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** The pictures sent with a document: its pictured pages, then its largest pictures. */
export function picturesToSend(parsed: ParsedBrief): ExtractedImage[] {
  const pages = parsed.images
    .filter((image) => image.source === "page")
    .slice(0, GUIDELINE_LIMITS.pages);
  const embedded = parsed.images
    .filter((image) => image.source === "embedded")
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, GUIDELINE_LIMITS.images);
  return [...pages, ...embedded].filter((image) => MIMES.has(image.mimeType));
}

/** Uploads a document's pictures into the import's folder. */
export async function uploadGuidelinePictures(
  images: ExtractedImage[],
  folder: string,
  onProgress?: (message: string) => void,
): Promise<UploadedPicture[]> {
  const out: UploadedPicture[] = [];
  for (const [index, image] of images.entries()) {
    onProgress?.(`Uploading picture ${index + 1} of ${images.length}…`);
    const extension =
      image.mimeType === "image/png"
        ? "png"
        : image.mimeType === "image/webp"
          ? "webp"
          : image.mimeType === "image/gif"
            ? "gif"
            : "jpg";
    const name =
      image.source === "page" ? `page-${image.page ?? index + 1}` : `picture-${index + 1}`;
    const path = `${folder}${name}.${extension}`;
    const { error } = await supabase.storage
      .from("generation-inputs")
      .upload(path, image.blob, { contentType: image.mimeType, upsert: true });
    if (error) continue;
    out.push({
      path,
      mime: image.mimeType as UploadedPicture["mime"],
      width: image.width || null,
      height: image.height || null,
      kind: image.source === "page" ? "page" : "image",
      page: image.page,
      bytes: image.blob.size,
    });
  }
  return out;
}
