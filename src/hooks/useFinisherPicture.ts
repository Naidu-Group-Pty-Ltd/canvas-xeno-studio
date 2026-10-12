import { useEffect, useState } from "react";
import type { Picture } from "@/lib/media/compose";
import { loadFinisher, type EndCardSource } from "@/lib/media/end-card";

/** A finisher loaded for previews, or null while it loads (or if it can't be). */
export function useFinisherPicture(source: EndCardSource | null): Picture | null {
  const [picture, setPicture] = useState<{ id: string; picture: Picture } | null>(null);
  const id = source?.assetId ?? null;
  const bucket = source?.bucket ?? null;
  const path = source?.path ?? null;
  useEffect(() => {
    if (!id) return;
    let current = true;
    loadFinisher({ assetId: id, bucket, path })
      .then((loaded) => {
        if (current) setPicture({ id, picture: loaded });
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [id, bucket, path]);
  return picture && picture.id === id ? picture.picture : null;
}
