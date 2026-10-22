import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LayoutGrid, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { makeReviewSheet } from "@/lib/edit.functions";
import { reviewSheetState, type ReviewSheetState } from "@/lib/edit/review-sheet";
import { signedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

type Sheet = ReviewSheetState & { file: { bucket: string; path: string } | null };

/** A review sheet's media task and its picture in the library, asked again while it is being made. */
function useReviewSheet(taskId: string | null) {
  return useQuery({
    queryKey: ["media_tasks", "review_sheet", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<Sheet | null> => {
      const { data: task, error } = await supabase
        .from("media_tasks")
        .select("id,status,result_asset_id,error_message")
        .eq("id", taskId!)
        .maybeSingle();
      if (error) throw error;
      if (!task) return null;
      const state = reviewSheetState(task);
      if (!state.assetId) return { ...state, file: null };
      const { data: asset } = await supabase
        .from("assets")
        .select("storage_bucket,storage_path")
        .eq("id", state.assetId)
        .is("deleted_at", null)
        .maybeSingle();
      // Deleted from the library: as if there were none.
      return asset
        ? { ...state, file: { bucket: asset.storage_bucket, path: asset.storage_path } }
        : null;
    },
    refetchInterval: (query) => (query.state.data?.status === "making" ? 3000 : false),
  });
}

/**
 * A finished render's review sheet (see lib/edit/review-sheet): made on
 * request, kept in the library and opened from here. `taskId` is the sheet's
 * media task as kept on the render (migration 0031_render_quality).
 */
export function ReviewSheet({ renderId, taskId }: { renderId: string; taskId: string | null }) {
  const queryClient = useQueryClient();
  // The sheet asked for here, until the render's own record says so too.
  const [asked, setAsked] = useState<string | null>(null);
  const current = asked ?? taskId;
  const { data: sheet, isLoading } = useReviewSheet(current);
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    try {
      const started = await makeReviewSheet({
        data: { renderId, clientRequestId: newRequestId() },
      });
      setAsked(started.taskId);
      await queryClient.invalidateQueries({ queryKey: ["media_tasks", "review_sheet"] });
      void queryClient.invalidateQueries({ queryKey: ["sequence_renders"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The review sheet couldn't be made");
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    if (!sheet?.file) return;
    const url = await signedUrl(sheet.file.bucket, sheet.file.path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("The review sheet couldn't be opened");
  }

  const making = busy || sheet?.status === "making";
  if (current && isLoading && !busy) return null;
  return (
    <div className="mt-1.5 space-y-0.5 text-[11px]" data-testid="render-review-sheet">
      <div className="flex items-center gap-1">
        {making ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Making the review sheet…
          </span>
        ) : sheet?.status === "ready" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={() => void open()}
          >
            <LayoutGrid className="size-3" /> Review sheet
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            title="Every shot half a second in and on its last frame, labelled, as one picture kept in the library"
            onClick={() => void make()}
          >
            <LayoutGrid className="size-3" />
            {sheet?.status === "failed" ? "Make the review sheet again" : "Make a review sheet"}
          </Button>
        )}
      </div>
      {!making && sheet?.status === "failed" && (
        <p className="flex gap-1 text-destructive">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {sheet.error}
        </p>
      )}
    </div>
  );
}
