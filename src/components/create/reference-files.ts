import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { assignRoles } from "@/lib/references";
import { conversionHint, mediaKindFor, uploadReference } from "@/lib/storage";
import { isBriefFile } from "@/lib/briefs/parse-document";
import { useAuth } from "@/hooks/useAuth";

export interface ReferenceItem {
  assetId: string;
  role: string;
  assetType: "image" | "video" | "audio";
  bucket: string;
  path: string;
  title: string | null;
  mimeType?: string | null;
}

export const MAX_REFERENCES = 40;

/**
 * Upload handling shared by the tray, page-level drag and drop, and paste.
 * Documents are handed off to brief import; media becomes references mapped
 * onto the selected model's input slots.
 */
export function useReferenceFiles(options: {
  model: ModelRegistryEntry | null;
  projectId: string | null;
  items: ReferenceItem[];
  onChange: (items: ReferenceItem[]) => void;
  onDocument: (file: File) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(0);
  const latest = useRef(options);
  latest.current = options;

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!user || !files.length) return;
      const document = files.find(isBriefFile);
      if (document) latest.current.onDocument(document);
      const media = files.filter((file) => !isBriefFile(file));
      for (const file of media) {
        const kind = mediaKindFor(file.type);
        if (!kind) {
          toast.error(`${file.name} is not an image, video or audio file.`);
          continue;
        }
        if (latest.current.items.length >= MAX_REFERENCES) {
          toast.info(`Up to ${MAX_REFERENCES} references.`);
          break;
        }
        setUploading((count) => count + 1);
        try {
          const asset = await uploadReference(file, {
            userId: user.id,
            projectId: latest.current.projectId,
          });
          const item: ReferenceItem = {
            assetId: asset.id,
            role: "",
            assetType: asset.asset_type,
            bucket: asset.storage_bucket,
            path: asset.storage_path,
            title: asset.title,
            mimeType: asset.mime_type,
          };
          const next = assignRoles([...latest.current.items, item], latest.current.model);
          latest.current.onChange(next);
          const hint = conversionHint(kind, asset.mime_type);
          if (hint) toast.warning(`${file.name}: ${hint}`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `${file.name}: ${error.message}`
              : `${file.name} could not be uploaded`,
          );
        } finally {
          setUploading((count) => count - 1);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    [user, queryClient],
  );

  return { addFiles, uploading };
}
