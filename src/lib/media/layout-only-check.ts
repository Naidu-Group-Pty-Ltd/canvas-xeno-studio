/**
 * The Editor's own check before it lays a library file on a timeline: it
 * saves timelines straight from the browser, so it asks first, as the render
 * and the studio API do (see ./layout-only). A mark it can't read (before
 * migration 0035, or offline) lets the file through: the render still
 * refuses a layout-only one.
 */
import { getPrivacyMarks } from "@/lib/privacy.functions";
import { layoutOnlyRefusal } from "./layout-only";

/** Why these files can't go on a timeline (any of them layout only), or null when they can. */
export async function timelineRefusal(
  files: { id: string; title: string | null }[],
): Promise<string | null> {
  if (!files.length) return null;
  try {
    const marks = await getPrivacyMarks({
      data: { assetIds: [...new Set(files.map((file) => file.id))].slice(0, 200) },
    });
    const held = files.filter((file) => marks[file.id]?.layoutOnly);
    return held.length
      ? layoutOnlyRefusal(
          held.map((file) => file.title),
          "edit",
        )
      : null;
  } catch {
    return null;
  }
}
