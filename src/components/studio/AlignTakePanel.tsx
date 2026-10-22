import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AssetRow } from "@/hooks/useStudioData";
import { alignTakeToPicture, getAlignTake } from "@/lib/takes.functions";
import {
  ALIGN_DEFAULTS,
  ALIGN_LIMITS,
  alignmentSummary,
  type AlignAnchor,
} from "@/lib/media/align-take";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** How often, and how many times, the alignment is asked after while the media service works. */
const POLL_MS = 4_000;
const POLLS = 90;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A take that must land on an exact picture (a logo's reveal ending on the
 * logo): the media service puts the take on the picture, matches its colour
 * and crosses to the picture itself. The aligned take joins the library.
 */
export function AlignTakePanel({ asset }: { asset: AssetRow }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [picture, setPicture] = useState<AssetRow | null>(null);
  const [anchor, setAnchor] = useState<AlignAnchor>("last");
  const [cross, setCross] = useState(String(ALIGN_DEFAULTS.cross));
  const [hold, setHold] = useState(String(ALIGN_DEFAULTS.hold));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ assetId: string | null; summary: string } | null>(null);
  if (asset.asset_type !== "video") return null;

  const seconds = (value: string, most: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(most, Math.max(0, parsed)) : 0;
  };

  async function run() {
    if (!picture) return;
    setBusy(true);
    setDone(null);
    try {
      let state = await alignTakeToPicture({
        data: {
          takeAssetId: asset.id,
          pictureAssetId: picture.id,
          anchor,
          crossSeconds: seconds(cross, ALIGN_LIMITS.cross),
          holdSeconds: seconds(hold, ALIGN_LIMITS.hold),
          clientRequestId: crypto.randomUUID(),
        },
      });
      for (let poll = 0; state.status === "processing" && poll < POLLS; poll += 1) {
        await wait(POLL_MS);
        state = await getAlignTake({ data: { taskId: state.taskId } });
      }
      if (state.status === "failed") {
        toast.error(state.message ?? "The take couldn't be aligned.");
        return;
      }
      if (state.status === "processing") {
        toast.message("Still aligning. The aligned take appears in the library when it is done.");
        return;
      }
      setDone({
        assetId: state.assetId,
        summary: state.alignment ? alignmentSummary(state.alignment) : "Aligned.",
      });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The take couldn't be aligned.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid="align-take">
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Land on a picture</h4>
      <p className="text-[11px] text-muted-foreground">
        For a take that must end (or start) on an exact picture, such as a logo: it is put on the
        picture, its colour matched, and it crosses to the picture itself before anything moves.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
          {picture ? "Change picture" : "Choose the picture"}
        </Button>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {picture?.title ?? "None chosen"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">It must</Label>
          <Select value={anchor} onValueChange={(value) => setAnchor(value as AlignAnchor)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last">End on it</SelectItem>
              <SelectItem value="first">Start on it</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Cross (s)</Label>
          <Input
            className="h-9"
            inputMode="decimal"
            value={cross}
            onChange={(event) => setCross(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Hold (s)</Label>
          <Input
            className="h-9"
            inputMode="decimal"
            value={hold}
            onChange={(event) => setHold(event.target.value)}
          />
        </div>
      </div>
      <Button size="sm" disabled={!picture || busy} onClick={() => void run()}>
        {busy ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Crosshair className="mr-1.5 size-3.5" />
        )}
        {busy ? "Aligning…" : "Align the take"}
      </Button>
      {done && (
        <div className="space-y-1 text-xs">
          <p>{done.summary}</p>
          {done.assetId && (
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => navigate({ to: "/assets", search: { asset: done.assetId! } })}
            >
              Open the aligned take
            </Button>
          )}
        </div>
      )}
      <LibraryPicker
        open={picking}
        onOpenChange={setPicking}
        accept={["image"]}
        max={1}
        title="The picture it must land on"
        onConfirm={(assets) => {
          setPicture(assets[0] ?? null);
          setPicking(false);
        }}
      />
    </div>
  );
}
