import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Film,
  Loader2,
  Play,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSequenceRenders, type RenderRow } from "@/hooks/useEditorData";
import { getMediaWorkerStatus } from "@/lib/media.functions";
import { renderSequence } from "@/lib/edit.functions";
import { formatTime, renderBlockers, type Timeline } from "@/lib/edit/timeline";
import { signedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { renderInProgress } from "@/lib/edit/renders";

interface RenderPanelProps {
  sequenceId: string;
  title: string;
  timeline: Timeline;
  saveNow: () => Promise<number>;
  disabled: boolean;
}

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

/** Render the final video and keep every version that was rendered. */
export function RenderPanel({ sequenceId, title, timeline, saveNow, disabled }: RenderPanelProps) {
  const [starting, setStarting] = useState(false);
  const queryClient = useQueryClient();
  const { data: renders = [] } = useSequenceRenders(sequenceId);
  const { data: worker } = useQuery({
    queryKey: ["media-worker-status"],
    queryFn: () => getMediaWorkerStatus(),
    staleTime: 60_000,
  });
  const blockers = renderBlockers(timeline);
  const active = renders.find((render) => renderInProgress(render));

  async function start() {
    setStarting(true);
    try {
      const version = await saveNow();
      await renderSequence({
        data: { sequenceId, expectedVersion: version, clientRequestId: newRequestId() },
      });
      toast.success("Rendering started. The finished video lands in your library.");
      // Live updates also announce it; fetching now shows progress at once.
      await queryClient.invalidateQueries({ queryKey: ["sequence_renders", sequenceId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The render could not be started");
    } finally {
      setStarting(false);
    }
  }

  const workerProblem =
    worker && !worker.configured
      ? "Rendering needs the media service. An admin can set it up in Settings."
      : worker && !worker.reachable
        ? "The media service isn't responding right now. Try again shortly."
        : null;

  return (
    <div className="space-y-3 p-3">
      <Button
        className="w-full"
        disabled={
          disabled || starting || Boolean(active) || blockers.length > 0 || Boolean(workerProblem)
        }
        onClick={() => void start()}
        data-testid="render-button"
      >
        {starting || active ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Film className="mr-1.5 size-4" />
        )}
        {active ? "Rendering…" : "Render video"}
      </Button>
      {(blockers[0] ?? workerProblem) && (
        <p className="text-xs text-muted-foreground">{blockers[0] ?? workerProblem}</p>
      )}

      {active && (
        <div className="space-y-1.5 rounded-md border border-border p-2.5" aria-live="polite">
          <div className="flex items-center justify-between text-xs">
            <span>{active.stage ?? "Queued"}</span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(active.progress * 100)}%
            </span>
          </div>
          <Progress value={Math.max(3, active.progress * 100)} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">
            You can keep editing; this render uses the version you saved when you pressed Render.
          </p>
        </div>
      )}

      {renders.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="label-eyebrow">Renders</h3>
          <ul className="space-y-1.5">
            {renders.map((render) => (
              <RenderItem key={render.id} render={render} title={title} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RenderItem({ render, title }: { render: RenderRow; title: string }) {
  const [opening, setOpening] = useState(false);
  const stalled =
    (render.status === "queued" || render.status === "rendering") && !renderInProgress(render);
  const when = new Date(render.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function open(download: boolean) {
    if (!render.asset_id) return;
    setOpening(true);
    try {
      const { data } = await supabase
        .from("assets")
        .select("storage_bucket,storage_path")
        .eq("id", render.asset_id)
        .maybeSingle();
      const url = data ? await signedUrl(data.storage_bucket, data.storage_path) : null;
      if (!url) throw new Error("The video could not be opened");
      if (download) {
        const anchor = document.createElement("a");
        anchor.href = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(`${title.replace(/[^\w.-]+/g, "_") || "edit"}.mp4`)}`;
        anchor.click();
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The video could not be opened");
    } finally {
      setOpening(false);
    }
  }

  return (
    <li
      className={cn(
        "rounded-md border p-2 text-xs",
        render.status === "failed" ? "border-destructive/50" : "border-border",
      )}
    >
      <div className="flex items-center gap-1.5">
        {render.status === "completed" ? (
          <CheckCircle2 className="size-3.5 text-success" />
        ) : render.status === "failed" || stalled ? (
          <AlertTriangle className="size-3.5 text-destructive" />
        ) : (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
        <span className="font-medium">Version {render.sequence_version}</span>
        <span className="ml-auto text-muted-foreground">{when}</span>
      </div>
      {render.status === "completed" && (
        <div className="mt-1.5 flex items-center gap-1">
          {render.duration_seconds ? (
            <span className="text-muted-foreground">
              {formatTime(Number(render.duration_seconds))}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2"
            disabled={opening}
            onClick={() => void open(false)}
            aria-label="Play the rendered video"
          >
            <Play className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            disabled={opening}
            onClick={() => void open(true)}
            aria-label="Download the rendered video"
          >
            <Download className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
            <Link to="/assets" aria-label="Open the library">
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      )}
      {render.status === "failed" && (
        <p className="mt-1 text-destructive">{render.error_message ?? "The render failed."}</p>
      )}
      {stalled && (
        <p className="mt-1 text-destructive">This render stopped responding. Render again.</p>
      )}
    </li>
  );
}
