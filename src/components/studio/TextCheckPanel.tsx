import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ScanText, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { AssetRow } from "@/hooks/useStudioData";
import { checkAssetText } from "@/lib/media.functions";
import { textCheckOf, type TextCheckResult } from "@/lib/media/text-check";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How often, and how many times, a video's check is asked again while its frames are taken. */
const POLL_MS = 4_000;
const POLLS = 45;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether a picture or video has garbled text in it (signs, screens and
 * documents that generators letter with gibberish), read by the studio's AI
 * and kept with the file.
 */
export function TextCheckPanel({ asset }: { asset: AssetRow }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"checking" | "sampling" | null>(null);
  const [fresh, setFresh] = useState<TextCheckResult | null>(null);
  const kept = fresh ?? textCheckOf(asset.metadata);
  if (asset.asset_type !== "image" && asset.asset_type !== "video") return null;

  async function run(again: boolean) {
    setBusy("checking");
    try {
      for (let poll = 0; poll < POLLS; poll += 1) {
        const outcome = await checkAssetText({
          data: { assetId: asset.id, again: again && poll === 0 },
        });
        if (outcome.status === "checked") {
          setFresh(outcome.result);
          await queryClient.invalidateQueries({ queryKey: ["assets"] });
          return;
        }
        if (outcome.status === "failed") {
          toast.error(outcome.message);
          return;
        }
        setBusy("sampling");
        await wait(POLL_MS);
      }
      toast.message("Its frames are still being taken. Check again in a minute.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The text check failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md border border-border p-3" data-testid="text-check">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Text check</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void run(!!kept)}
          disabled={busy !== null}
        >
          {busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <ScanText className="mr-1.5 size-3.5" />
          )}
          {busy === "sampling" ? "Taking frames…" : kept ? "Check again" : "Check for garbled text"}
        </Button>
      </div>
      {kept ? (
        <div className="mt-2 space-y-1 text-xs">
          <p
            className={cn(
              "flex items-start gap-1.5",
              kept.verdict === "garbled" ? "text-warning" : "text-foreground",
            )}
          >
            {kept.verdict === "garbled" ? (
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
            )}
            {kept.summary}
          </p>
          {kept.findings.length > 0 && (
            <ul className="space-y-0.5 pl-5 text-muted-foreground">
              {kept.findings.slice(0, 8).map((finding, index) => (
                <li key={index}>
                  {finding.legible ? "Readable" : "Garbled"}: “{finding.text}”
                  {finding.where ? ` (${finding.where})` : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            Read by the studio's AI from{" "}
            {kept.frames === 1 ? "the picture" : `${kept.frames} frames through the video`}. Check
            the frames yourself before anything goes out.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Generators often letter screens, signs and documents with gibberish. The AI reads every
          piece of text{asset.asset_type === "video" ? " in frames taken through the video" : ""}{" "}
          and says whether it is readable.
        </p>
      )}
    </div>
  );
}
