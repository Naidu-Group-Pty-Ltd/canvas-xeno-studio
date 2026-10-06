import { supabase } from "@/integrations/supabase/client";
import {
  DOCUMENT_BUCKET,
  sanitizeFilename,
  storageScope,
  uploadAssetBlob,
  uploadDocument,
} from "@/lib/storage";
import type { ExtractedImage, ParsedBrief } from "./parse-document";

const DOCUMENT_MIME: Record<ParsedBrief["kind"], string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  text: "text/plain",
};

export interface ImportBriefOptions {
  userId: string;
  title: string;
  projectId: string | null;
  campaignId: string | null;
  images: ExtractedImage[];
  onProgress?: (message: string) => void;
}

/**
 * Stores an imported brief: the record (with its text), the original document,
 * and every selected image as a library asset linked to the brief. Images are
 * ordinary uploaded assets, so they work as references anywhere in the studio.
 */
export async function importBrief(
  file: File,
  parsed: ParsedBrief,
  options: ImportBriefOptions,
): Promise<string> {
  const briefId = crypto.randomUUID();
  const base = `${storageScope({ userId: options.userId, projectId: options.projectId })}/briefs/${briefId}`;
  const sourcePath = `${base}/${sanitizeFilename(file.name) || "brief"}`;
  const title = options.title.trim().slice(0, 300) || "Untitled brief";

  // The record goes first: if the briefs tables are missing nothing is uploaded.
  options.onProgress?.("Saving brief…");
  const { error } = await supabase.from("creative_briefs").insert({
    id: briefId,
    title,
    project_id: options.projectId,
    campaign_id: options.campaignId,
    source_filename: file.name,
    source_mime: file.type || DOCUMENT_MIME[parsed.kind],
    source_bucket: DOCUMENT_BUCKET,
    source_path: sourcePath,
    source_size: file.size,
    page_count: parsed.pageCount,
    extracted_text: parsed.text,
    status: "draft",
    created_by: options.userId,
  });
  if (error) {
    throw new Error(
      /schema cache|does not exist/i.test(error.message)
        ? "Brief import needs a database update. Apply migration 0002_supercomputer_and_creative_briefs, then try again."
        : error.message,
    );
  }

  options.onProgress?.("Uploading the original document…");
  try {
    await uploadDocument(file, sourcePath, file.type || DOCUMENT_MIME[parsed.kind]);
  } catch {
    // The text is already saved; a missing original only disables "download source".
    await supabase
      .from("creative_briefs")
      .update({ source_bucket: null, source_path: null })
      .eq("id", briefId);
  }

  for (const [index, image] of options.images.entries()) {
    options.onProgress?.(`Saving image ${index + 1} of ${options.images.length}…`);
    const extension =
      image.mimeType === "image/png"
        ? "png"
        : image.mimeType === "image/webp"
          ? "webp"
          : image.mimeType === "image/gif"
            ? "gif"
            : "jpg";
    const label =
      image.caption ?? (image.source === "page" ? `Page ${image.page}` : `Image ${index + 1}`);
    const asset = await uploadAssetBlob(image.blob, {
      userId: options.userId,
      projectId: options.projectId,
      path: `${base}/image-${index + 1}.${extension}`,
      mimeType: image.mimeType,
      kind: "image",
      title: `${title} · ${label}`,
      width: image.width,
      height: image.height,
      metadata: {
        source: "brief",
        brief_id: briefId,
        brief_image_source: image.source,
        ...(image.page ? { page: image.page } : {}),
      },
    });
    const { error: linkError } = await supabase.from("creative_brief_assets").insert({
      brief_id: briefId,
      asset_id: asset.id,
      position: index,
      source: image.source,
      caption: image.caption,
      page_number: image.page,
    });
    if (linkError) throw new Error(linkError.message);
  }

  return briefId;
}
