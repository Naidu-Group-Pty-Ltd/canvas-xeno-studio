import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
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
import { keepAttempt, savedAttempt } from "@/lib/attempts";
import { audibleAudio, formatTime, renderBlockers, type Timeline } from "@/lib/edit/timeline";
import { signedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { renderInProgress } from "@/lib/edit/renders";
import { useTracksForAssets } from "@/hooks/useMusicData";
import { creditLine, licenceBlocker, licenceTerms } from "@/lib/music/catalog";

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
  // Only audio heard in the render needs a credit or a licence check.
  const audioIds = useMemo(() => audibleAudio(timeline).map((item) => item.assetId), [timeline]);
  const { data: musicTracks = [] } = useTracksForAssets(audioIds);
  const credits = [
    ...new Set(
      musicTracks.map((track) => creditLine(track)).filter((line): line is string => !!line),
    ),
  ];
  // Licensed music: an expired licence stops the render; limits are shown before rendering.
  const licenceProblem =
    musicTracks.map((track) => licenceBlocker(track)).find((reason) => reason) ?? null;
  const limits = musicTracks
    .map((track) => ({ track, terms: licenceTerms(track) }))
    .filter(
      (
        entry,
      ): entry is { track: (typeof musicTracks)[number]; terms: NonNullable<typeof entry.terms> } =>
        !!entry.terms && !entry.terms.expired,
    );

  async function start() {
    setStarting(true);
    try {
      const version = await saveNow();
      // A render of this version keeps its request id until the server
      // answers (across reloads too), so pressing again after a lost answer
      // reaches the render already recorded (and sends it, if it never was).
      const key = `${sequenceId}:${version}`;
      const ask = (clientRequestId: string) => {
        keepAttempt("render", key, clientRequestId);
        return renderSequence({ data: { sequenceId, expectedVersion: version, clientRequestId } });
      };
      let started = await ask(savedAttempt("render", key) ?? newRequestId());
      // That request's render had already failed for good: this press is a new render.
      if (started.duplicate && started.status === "failed") started = await ask(newRequestId());
      keepAttempt("render", key, null);
      if (started.status === "completed") toast.success("This version is already rendered.");
      else toast.success("Rendering started. The finished video lands in your library.");
      // Live updates also announce it; fetching now shows progress at once.
      await queryClient.invalidateQueries({ queryKey: ["sequence_renders", sequenceId] });
    } catch (error) {
      // The answer may have been lost: the request id stays for the next press.
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
          disabled ||
          starting ||
          Boolean(active) ||
          blockers.length > 0 ||
          Boolean(workerProblem) ||
          Boolean(licenceProblem)
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
      {(blockers[0] ?? licenceProblem ?? workerProblem) && (
        <p
          className={cn(
            "text-xs",
            !blockers[0] && licenceProblem ? "text-destructive" : "text-muted-foreground",
          )}
          data-testid="render-blocker"
        >
          {blockers[0] ?? licenceProblem ?? workerProblem}
        </p>
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

      {credits.length > 0 && (
        <div
          className="space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs"
          data-testid="music-credits"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">Music credit to publish</p>
            <button
              type="button"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(credits.join("\n")).then(
                  () => toast.success("Credit copied"),
                  () => toast.error("Couldn't copy"),
                );
              }}
            >
              <Copy className="size-3" /> Copy
            </button>
          </div>
          <p className="text-muted-foreground">
            The licence asks for this credit wherever the video is posted (caption or description).
          </p>
          <ul className="space-y-1">
            {credits.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {limits.length > 0 && (
        <div
          className="space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs"
          data-testid="music-licence-limits"
        >
          <p className="font-medium">Music licence terms</p>
          <p className="text-muted-foreground">
            Use this video only where its music is licensed. The terms are kept with the finished
            video.
          </p>
          <ul className="space-y-1">
            {limits.map(({ track, terms }) => (
              <li key={track.id}>
                <span className="font-medium">{track.title}</span>: {terms.summary}
                {terms.excluded.length > 0 && (
                  <span className="text-warning"> · Not for {terms.excluded.join(", ")}</span>
                )}
                {terms.notes && <span> · Conditions: {terms.notes}</span>}
              </li>
            ))}
          </ul>
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
