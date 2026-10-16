import { useEffect, useMemo, useRef, useState } from "react";
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
import { useAssetsByIds, useSequenceRenders, type RenderRow } from "@/hooks/useEditorData";
import { getMediaWorkerStatus } from "@/lib/media.functions";
import { recoverRender, renderSequence, resendRender } from "@/lib/edit.functions";
import { keepAttempt, savedAttempt } from "@/lib/attempts";
import { audibleAudio, formatTime, renderBlockers, type Timeline } from "@/lib/edit/timeline";
import { joinSummary, readJoinReport } from "@/lib/edit/join-report";
import { signedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  RENDER_BUSY_RETRY_MS,
  RENDER_BUSY_STAGE,
  RENDER_RECOVERY_RETRY_MS,
  RENDER_RECOVERY_WINDOW_MS,
  RENDER_UNCONFIRMED_STAGE,
  renderInProgress,
} from "@/lib/edit/renders";
import { useTracksForAssets } from "@/hooks/useMusicData";
import { useStudioVoiceovers } from "@/hooks/useVoiceData";
import {
  keptLicenceLine,
  licenceBlocker,
  licenceTerms,
  MUSIC_LICENSES,
  videoCreditLine,
} from "@/lib/music/catalog";

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
  const [resending, setResending] = useState(false);
  const queryClient = useQueryClient();
  const { data: renders = [] } = useSequenceRenders(sequenceId);
  const { data: worker } = useQuery({
    queryKey: ["media-worker-status"],
    queryFn: () => getMediaWorkerStatus(),
    staleTime: 60_000,
  });
  const blockers = renderBlockers(timeline);
  const active = renders.find((render) => renderInProgress(render));
  const renderedIds = useMemo(
    () =>
      renders
        .filter((render) => render.status === "completed" && render.asset_id)
        .map((render) => render.asset_id!),
    [renders],
  );
  const { data: renderedFiles } = useAssetsByIds(renderedIds);
  // Only audio heard in the render needs a credit or a licence check.
  const audioIds = useMemo(() => audibleAudio(timeline).map((item) => item.assetId), [timeline]);
  const {
    data: musicTracks = [],
    isSuccess: tracksKnown,
    isError: tracksUnknown,
  } = useTracksForAssets(audioIds);
  const credits = [
    ...new Set(
      musicTracks.map((track) => videoCreditLine(track)).filter((line): line is string => !!line),
    ),
  ];
  const {
    data: madeHere,
    isSuccess: voiceoversKnown,
    isError: voiceoversUnknown,
  } = useStudioVoiceovers(audioIds);
  // Audio heard in the edit that isn't a voiceover the studio made, whatever
  // it is used as (music, a sound effect, or a recording from the media bin
  // called a voiceover), can't be rendered until its licence is recorded, as
  // the server checks too; nor while that can't be looked up (before the
  // music library is set up, say). An expired licence stops the render.
  // Limits are shown before rendering.
  const recorded = new Set(musicTracks.map((track) => track.asset_id));
  const heard = audibleAudio(timeline);
  const needsLicence = voiceoversKnown ? heard.filter((item) => !madeHere?.has(item.assetId)) : [];
  const unrecorded = tracksKnown
    ? needsLicence.find((item) => !recorded.has(item.assetId))
    : undefined;
  const licenceProblem =
    (voiceoversUnknown && heard.length
      ? "The edit's voiceovers couldn't be checked, so this edit can't be rendered just now."
      : null) ??
    (tracksUnknown && needsLicence.length
      ? "The music's licences couldn't be looked up, so this edit can't be rendered just now."
      : null) ??
    (unrecorded
      ? unrecorded.role === "voiceover"
        ? `“${unrecorded.label ?? "Some audio"}” is used as a voiceover, but it wasn't made in the Voice tab and has no licence on record. Make or import the voiceover in the Voice tab, or record its licence in the Music tab.`
        : `“${unrecorded.label ?? "Some audio"}” has no licence on record. Record its licence in the Music tab, or use music from the library.`
      : null) ??
    musicTracks.map((track) => licenceBlocker(track)).find((reason) => reason) ??
    null;
  const limits = musicTracks
    .map((track) => ({ track, terms: licenceTerms(track) }))
    .filter(
      (
        entry,
      ): entry is { track: (typeof musicTracks)[number]; terms: NonNullable<typeof entry.terms> } =>
        !!entry.terms && !entry.terms.expired,
    );
  // AI music: where it may run depends on the plan it was made on.
  const aiMusic = musicTracks.filter((track) => track.license === "ai_generated");

  // A render that stopped reporting may still have finished (its result just
  // never arrived): it is checked for the video it uploaded, and finished from
  // it if it's there. While it went quiet recently enough that its worker may
  // still be uploading, it is checked again every RENDER_RECOVERY_RETRY_MS;
  // an older one is checked once.
  const checking = useRef(new Set<string>());
  const checkedOnce = useRef(new Set<string>());
  const lostKey = renders
    .filter(
      (render) =>
        ((render.status === "queued" || render.status === "rendering") &&
          !renderInProgress(render)) ||
        (render.status === "failed" && render.error_code === "STALLED"),
    )
    .map((render) => `${render.id}@${render.updated_at ?? render.created_at}`)
    .join(",");
  useEffect(() => {
    const lost = (lostKey ? lostKey.split(",") : []).map((entry) => {
      const at = entry.indexOf("@");
      const quietSince = Date.parse(entry.slice(at + 1));
      return {
        renderId: entry.slice(0, at),
        recent: () => Date.now() - quietSince < RENDER_RECOVERY_WINDOW_MS,
      };
    });
    if (!lost.length) return;
    const check = (renderId: string) => {
      if (checking.current.has(renderId)) return;
      checking.current.add(renderId);
      checkedOnce.current.add(renderId);
      void recoverRender({ data: { renderId } })
        .then(async (outcome) => {
          if (!outcome.recovered) return;
          toast.success(
            "A render that stopped responding had finished. Its video is in your library.",
          );
          await queryClient.invalidateQueries({ queryKey: ["sequence_renders", sequenceId] });
        })
        .catch(() => {})
        .finally(() => checking.current.delete(renderId));
    };
    for (const { renderId, recent } of lost)
      if (recent() || !checkedOnce.current.has(renderId)) check(renderId);
    const timer = setInterval(() => {
      for (const { renderId, recent } of lost) if (recent()) check(renderId);
    }, RENDER_RECOVERY_RETRY_MS);
    return () => clearInterval(timer);
  }, [lostKey, queryClient, sequenceId]);

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

  // A render the media service never confirmed taking, or was too busy to
  // take, can be sent again: the worker runs a task id once, and one it
  // already has isn't sent again.
  const sending = useRef(false);
  async function resend(renderId: string, quietly = false) {
    if (sending.current) return;
    sending.current = true;
    setResending(true);
    try {
      const sent = await resendRender({ data: { renderId } });
      if (sent.status === "queued" && !quietly)
        toast.message("Sent again. Still waiting for the media service.");
      await queryClient.invalidateQueries({ queryKey: ["sequence_renders", sequenceId] });
    } catch (error) {
      if (!quietly)
        toast.error(error instanceof Error ? error.message : "The render could not be sent again");
    } finally {
      sending.current = false;
      setResending(false);
    }
  }

  // While the media service's queue is full, the render is sent again by
  // itself for as long as this panel is open.
  const resendLatest = useRef(resend);
  useEffect(() => {
    resendLatest.current = resend;
  });
  const waitingForRoom =
    active?.status === "queued" && active.stage === RENDER_BUSY_STAGE ? active.id : null;
  useEffect(() => {
    if (!waitingForRoom) return;
    const timer = setInterval(
      () => void resendLatest.current(waitingForRoom, true),
      RENDER_BUSY_RETRY_MS,
    );
    return () => clearInterval(timer);
  }, [waitingForRoom]);

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
          {waitingForRoom && (
            <p className="text-[11px] text-muted-foreground" data-testid="render-busy">
              The media service&apos;s queue is full. This render is sent again every{" "}
              {RENDER_BUSY_RETRY_MS / 1000} seconds while this panel is open.
            </p>
          )}
          {active.status === "queued" &&
            (active.stage === RENDER_UNCONFIRMED_STAGE || active.stage === RENDER_BUSY_STAGE) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs"
                disabled={resending}
                onClick={() => void resend(active.id)}
                data-testid="render-resend"
              >
                {resending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Send again
              </Button>
            )}
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

      {(limits.length > 0 || aiMusic.length > 0) && (
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
            {aiMusic.map((track) => (
              <li key={track.id} data-testid="music-ai-usage">
                <span className="font-medium">{track.title}</span>:{" "}
                {track.usage_notes ?? MUSIC_LICENSES.ai_generated.note}
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
              <RenderItem
                key={render.id}
                render={render}
                title={title}
                kept={render.asset_id ? renderedFiles?.get(render.asset_id)?.metadata : undefined}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The music credit and terms kept with a rendered video, ready to show. */
function keptMusic(metadata: unknown): { credits: string[]; terms: string[] } {
  const record = (metadata ?? {}) as { music_credits?: unknown; music_licences?: unknown };
  const credits = Array.isArray(record.music_credits)
    ? record.music_credits.filter((line): line is string => typeof line === "string")
    : [];
  const terms = (Array.isArray(record.music_licences) ? record.music_licences : [])
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map(keptLicenceLine);
  return { credits, terms };
}

function RenderItem({
  render,
  title,
  kept,
}: {
  render: RenderRow;
  title: string;
  /** The rendered video's library record metadata, with its music credit and terms. */
  kept?: unknown;
}) {
  const [opening, setOpening] = useState(false);
  // What this version's music asks for, as kept when it was rendered (the edit
  // may use other music by now).
  const music = keptMusic(kept);
  const joins = readJoinReport(kept);
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
      {render.status === "completed" && music.credits.length > 0 && (
        <div className="mt-1.5 space-y-0.5" data-testid="render-music-credit">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Music credit for this version</span>
            <button
              type="button"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(music.credits.join("\n")).then(
                  () => toast.success("Credit copied"),
                  () => toast.error("Couldn't copy"),
                );
              }}
            >
              <Copy className="size-3" /> Copy
            </button>
          </div>
          {music.credits.map((line) => (
            <p key={line} className="text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      )}
      {render.status === "completed" && joins && (
        <p className="mt-1 text-[11px] text-muted-foreground" data-testid="render-joins">
          {joinSummary(joins)}
        </p>
      )}
      {render.status === "completed" && music.terms.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground" data-testid="render-music-terms">
          Music terms: {music.terms.join(" · ")}
        </p>
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
