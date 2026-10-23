import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AssetRow } from "@/hooks/useStudioData";
import { useAuth } from "@/hooks/useAuth";
import {
  getPrivacyMarks,
  getReferencePrivacyStatus,
  getReferenceRedaction,
  openKeptOriginal,
  setAssetLayoutOnly,
} from "@/lib/privacy.functions";
import { Button } from "@/components/ui/button";

/**
 * A library file's privacy, in its detail: whether it is layout only (a
 * reference for how a screen is laid out, never placed in a frame) and
 * whether it is a screenshot's redacted copy. Any member marks a file layout
 * only; only an admin lifts the mark, and only an admin opens a kept original.
 */
export function PrivacyPanel({ asset }: { asset: AssetRow }) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const visual = asset.asset_type === "image" || asset.asset_type === "video";
  const { data: status } = useQuery({
    queryKey: ["reference-privacy-status"],
    queryFn: () => getReferencePrivacyStatus(),
    enabled: visual,
    staleTime: 60_000,
  });
  const { data: marks } = useQuery({
    queryKey: ["privacy-marks", asset.id],
    queryFn: () => getPrivacyMarks({ data: { assetIds: [asset.id] } }),
    enabled: visual && status?.ready === true,
  });
  const mark = marks?.[asset.id] ?? null;
  const redactionId = mark?.redactionId ?? null;
  const { data: redaction } = useQuery({
    queryKey: ["reference-redaction", redactionId],
    queryFn: () => getReferenceRedaction({ data: { redactionId: redactionId! } }),
    enabled: isAdmin && !!redactionId,
  });
  if (!visual) return null;

  async function change(layoutOnly: boolean) {
    setBusy(true);
    try {
      await setAssetLayoutOnly({ data: { assetId: asset.id, layoutOnly } });
      await queryClient.invalidateQueries({ queryKey: ["privacy-marks"] });
      toast.success(
        layoutOnly
          ? "Marked layout only: nothing can place it in a frame."
          : "The mark is lifted: it may be used like any picture.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The mark couldn't be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function openOriginal() {
    if (!redactionId) return;
    try {
      const { url } = await openKeptOriginal({ data: { redactionId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The original couldn't be opened.");
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid="privacy">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Privacy</h4>
        {status?.ready && (!mark?.layoutOnly || isAdmin) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void change(!mark?.layoutOnly)}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <EyeOff className="mr-1.5 size-3.5" />
            )}
            {mark?.layoutOnly ? "Lift the mark" : "Mark layout only"}
          </Button>
        )}
      </div>
      {status && !status.ready ? (
        <p className="text-[11px] text-muted-foreground">{status.message}</p>
      ) : mark?.layoutOnly ? (
        <p className="text-[11px] text-muted-foreground">
          Layout only: a reference for how a screen is laid out. It can be looked at and built from,
          but no generation, edit or copy can place it in a frame.
          {isAdmin ? "" : " Only an admin can lift the mark."}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          A screen that shows a real client&apos;s details can be marked layout only: it stays here
          to look at and build from, and nothing can place it in a frame.
        </p>
      )}
      {mark?.note && <p className="text-[11px] text-muted-foreground">Why: {mark.note}</p>}
      {mark?.redactedAreas ? (
        <p className="text-[11px] text-muted-foreground">
          A screenshot&apos;s redacted copy: {mark.redactedAreas}{" "}
          {mark.redactedAreas === 1 ? "area" : "areas"} blurred.
          {redaction
            ? redaction.originalKept
              ? " The original is kept for admins."
              : " The original was deleted."
            : ""}
        </p>
      ) : null}
      {isAdmin && redaction?.originalKept && (
        <Button size="sm" variant="ghost" onClick={() => void openOriginal()}>
          <KeyRound className="mr-1.5 size-3.5" />
          Open the original
        </Button>
      )}
    </div>
  );
}
