import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CloudOff,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  SkipBack,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import type { AssetRow } from "@/hooks/useStudioData";
import {
  useAssetsByIds,
  useEditorRealtime,
  useSignedMedia,
  type SequenceRow,
} from "@/hooks/useEditorData";
import {
  audioFromSource,
  clipFromSource,
  duplicateClip,
  formatTime,
  insertClips,
  layoutTimeline,
  LIMITS,
  parseTimeline,
  removeClip,
  splitClipAt,
  type AudioRole,
  type Timeline,
} from "@/lib/edit/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Inspector } from "./Inspector";
import { MediaBin } from "./MediaBin";
import { probeDuration } from "@/lib/edit/probe";
import { PreviewPlayer } from "./PreviewPlayer";
import { RenderPanel } from "./RenderPanel";
import { TimelineView } from "./TimelineView";
import {
  PlaybackClock,
  useAutosave,
  useClockPlaying,
  useClockTime,
  useTimelineHistory,
  type SaveStatus,
  type Selection,
} from "./state";

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "Saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  error: "Not saved",
  conflict: "Changed elsewhere",
};

export function EditorWorkspace({ sequence }: { sequence: SequenceRow }) {
  const initial = useMemo(() => parseTimeline(sequence.timeline), [sequence.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!initial) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        This edit's timeline could not be read. It may have been saved by a newer version of the
        studio.
      </div>
    );
  }
  return <Workspace sequence={sequence} initial={initial} />;
}

function Workspace({ sequence, initial }: { sequence: SequenceRow; initial: Timeline }) {
  const history = useTimelineHistory(initial);
  const { timeline, change, undo, redo, reset } = history;
  const [title, setTitle] = useState(sequence.title);
  const [selection, setSelection] = useState<Selection>(null);
  const [remote, setRemote] = useState<SequenceRow | null>(null);
  const clockRef = useRef<PlaybackClock | null>(null);
  clockRef.current ??= new PlaybackClock();
  const clock = clockRef.current;

  const layout = useMemo(() => layoutTimeline(timeline), [timeline]);
  useEffect(() => clock.setTotal(layout.total), [clock, layout.total]);
  useEffect(() => () => clock.dispose(), [clock]);

  const save = useAutosave({
    sequenceId: sequence.id,
    initialVersion: sequence.version,
    timeline,
    title,
    enabled: true,
  });

  const assetIds = useMemo(
    () => [
      ...timeline.clips.map((clip) => clip.assetId),
      ...timeline.audio.map((item) => item.assetId),
    ],
    [timeline.clips, timeline.audio],
  );
  const { data: assetMap = new Map<string, AssetRow>() } = useAssetsByIds(assetIds);
  const assetList = useMemo(() => [...assetMap.values()], [assetMap]);
  const { data: media = new Map() } = useSignedMedia(assetList);
  const usedAssetIds = useMemo(() => new Set(assetIds), [assetIds]);

  // A teammate's save arrives over realtime; ours (even an early echo) are recognised by version.
  const { isOwnSave } = save;
  const onRemoteSave = useCallback(
    (row: SequenceRow) => {
      if (!isOwnSave(row.version)) setRemote(row);
    },
    [isOwnSave],
  );
  useEditorRealtime(sequence.id, onRemoteSave);
  // Once our save lands on or past a version, that version was never a teammate's.
  useEffect(() => {
    if (remote && remote.version <= save.version) setRemote(null);
  }, [remote, save.version]);

  const loadRemote = useCallback(
    (row: SequenceRow) => {
      const parsed = parseTimeline(row.timeline);
      if (!parsed) {
        toast.error("That version could not be read");
        return;
      }
      reset(parsed);
      setTitle(row.title);
      save.adopt({ version: row.version, timeline: parsed, title: row.title });
      setRemote(null);
      setSelection(null);
    },
    [reset, save],
  );

  /* -------------------------- adding media -------------------------- */

  const addVisual = useCallback(
    async (asset: AssetRow) => {
      if (timeline.clips.length >= LIMITS.clips) {
        toast.error(`An edit can hold up to ${LIMITS.clips} clips`);
        return;
      }
      const duration = asset.asset_type === "video" ? await probeDuration(asset) : null;
      const clip = clipFromSource({
        assetId: asset.id,
        kind: asset.asset_type === "image" ? "image" : "video",
        durationSeconds: duration,
        title: asset.title,
      });
      const after =
        selection?.kind === "clip"
          ? timeline.clips.findIndex((item) => item.id === selection.id) + 1
          : timeline.clips.length;
      change(insertClips(timeline, [clip], after || timeline.clips.length));
      setSelection({ kind: "clip", id: clip.id });
    },
    [timeline, change, selection],
  );

  const addAudio = useCallback(
    async (asset: AssetRow, role: AudioRole) => {
      if (timeline.audio.length >= LIMITS.audio) {
        toast.error(`An edit can hold up to ${LIMITS.audio} audio tracks`);
        return;
      }
      const duration = await probeDuration(asset);
      const item = audioFromSource(
        { assetId: asset.id, durationSeconds: duration, title: asset.title },
        role,
        role === "music" ? 0 : Number(clock.getTime().toFixed(2)),
      );
      change({ ...timeline, audio: [...timeline.audio, item] });
      setSelection({ kind: "audio", id: item.id });
    },
    [timeline, change, clock],
  );

  /* ---------------------------- keyboard ---------------------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const role = target?.getAttribute("role");
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          role === "combobox" ||
          role === "slider" ||
          role === "menuitem" ||
          role === "option")
      )
        return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        clock.toggle();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const step = event.shiftKey ? 1 : 1 / timeline.fps;
        clock.seek(clock.getTime() + (event.key === "ArrowLeft" ? -step : step));
        return;
      }
      if (event.key === "Home") {
        clock.seek(0);
        return;
      }
      if (event.key.toLowerCase() === "s" && !mod) {
        change(splitClipAt(timeline, clock.getTime()));
        return;
      }
      if (mod && event.key.toLowerCase() === "d" && selection?.kind === "clip") {
        event.preventDefault();
        change(duplicateClip(timeline, selection.id));
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection) {
        event.preventDefault();
        if (selection.kind === "clip") change(removeClip(timeline, selection.id));
        else if (selection.kind === "audio")
          change({ ...timeline, audio: timeline.audio.filter((item) => item.id !== selection.id) });
        else if (selection.kind === "overlay")
          change({
            ...timeline,
            overlays: timeline.overlays.filter((item) => item.id !== selection.id),
          });
        setSelection(null);
        return;
      }
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timeline, change, undo, redo, clock, selection]);

  /* ------------------------------ zoom ------------------------------ */

  const timelineBox = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(40);
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !timelineBox.current || layout.total <= 0) return;
    fitted.current = true;
    const available = timelineBox.current.getBoundingClientRect().width - 120;
    setPps(Math.max(12, Math.min(160, Math.floor(available / Math.max(4, layout.total + 1)))));
  }, [layout.total]);

  const statusIcon =
    save.status === "saved" ? (
      <Check className="size-3.5 text-success" />
    ) : save.status === "saving" ? (
      <Loader2 className="size-3.5 animate-spin" />
    ) : save.status === "conflict" || save.status === "error" ? (
      <CloudOff className="size-3.5 text-destructive" />
    ) : (
      <span className="size-1.5 rounded-full bg-warning" />
    );

  const bin = (
    <MediaBin
      projectId={sequence.project_id}
      usedAssetIds={usedAssetIds}
      onAddVisual={(asset) => void addVisual(asset)}
      onAddAudio={(asset, role) => void addAudio(asset, role)}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[560px] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
          <Link to="/editor" aria-label="All edits">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          className="h-8 w-[min(320px,45vw)] font-display text-sm font-semibold"
          aria-label="Edit title"
        />
        <span
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          aria-live="polite"
          data-testid="save-status"
        >
          {statusIcon}
          {STATUS_LABEL[save.status]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <ToolButton label="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={undo}>
            <Undo2 className="size-4" />
          </ToolButton>
          <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={redo}>
            <Redo2 className="size-4" />
          </ToolButton>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 lg:hidden">
                Media
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] p-0">
              <SheetHeader className="border-b border-border p-3">
                <SheetTitle>Media</SheetTitle>
              </SheetHeader>
              <div className="h-[calc(100%-3.5rem)]">{bin}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {save.status === "error" && save.error && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-xs"
          role="alert"
        >
          <span>Your latest changes aren't saved: {save.error}</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7"
            onClick={() => void save.saveNow().catch(() => undefined)}
          >
            Try again
          </Button>
        </div>
      )}

      {(save.status === "conflict" || remote) && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-xs"
          role="alert"
        >
          <span>
            {save.status === "conflict"
              ? "Someone else saved this edit while you were working. Your latest changes are not saved yet."
              : "A teammate just saved a newer version of this edit."}
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={async () => {
                const { supabase } = await import("@/integrations/supabase/client");
                const { data } = await supabase
                  .from("sequences")
                  .select("*")
                  .eq("id", sequence.id)
                  .maybeSingle();
                if (data) loadRemote(data as unknown as SequenceRow);
              }}
            >
              Load their version
            </Button>
            <Button
              size="sm"
              className="h-7"
              onClick={async () => {
                try {
                  await save.keepMine();
                  setRemote(null);
                  toast.success("Your version is saved");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not save");
                }
              }}
            >
              Keep mine
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[264px] shrink-0 border-r border-border lg:block">{bin}</aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 p-3">
            <PreviewPlayer
              timeline={timeline}
              layout={layout}
              assets={assetMap}
              media={media}
              clock={clock}
            />
          </div>
          <Transport
            clock={clock}
            total={layout.total}
            fps={timeline.fps}
            canSplit={timeline.clips.length > 0}
            onSplit={() => change(splitClipAt(timeline, clock.getTime()))}
            canDelete={Boolean(selection && selection.kind !== "caption")}
            onDelete={() => {
              if (!selection) return;
              if (selection.kind === "clip") change(removeClip(timeline, selection.id));
              else if (selection.kind === "audio")
                change({
                  ...timeline,
                  audio: timeline.audio.filter((item) => item.id !== selection.id),
                });
              else if (selection.kind === "overlay")
                change({
                  ...timeline,
                  overlays: timeline.overlays.filter((item) => item.id !== selection.id),
                });
              setSelection(null);
            }}
            pps={pps}
            onZoom={setPps}
          />
        </section>

        <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border md:flex">
          <div className="min-h-0 flex-1 overflow-hidden">
            <Inspector
              timeline={timeline}
              layout={layout}
              assets={assetMap}
              selection={selection}
              clock={clock}
              onSelect={setSelection}
              onChange={change}
            />
          </div>
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-border">
            <RenderPanel
              sequenceId={sequence.id}
              title={title}
              timeline={timeline}
              saveNow={save.saveNow}
              disabled={save.status === "conflict"}
            />
          </div>
        </aside>
      </div>

      <div ref={timelineBox} className="shrink-0 border-t border-border bg-background">
        <TimelineView
          timeline={timeline}
          layout={layout}
          assets={assetMap}
          media={media}
          clock={clock}
          selection={selection}
          pixelsPerSecond={pps}
          onSelect={setSelection}
          onChange={change}
        />
      </div>

      {/* Small screens: inspector and render in a sheet. */}
      <div className="border-t border-border p-2 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              {selection ? "Edit selection" : "Format, captions & render"}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[75vh] p-0">
            <SheetHeader className="border-b border-border p-3">
              <SheetTitle>{selection ? "Selection" : "Edit settings"}</SheetTitle>
            </SheetHeader>
            <div className="h-[calc(100%-3.5rem)] overflow-y-auto">
              <Inspector
                timeline={timeline}
                layout={layout}
                assets={assetMap}
                selection={selection}
                clock={clock}
                onSelect={setSelection}
                onChange={change}
              />
              <RenderPanel
                sequenceId={sequence.id}
                title={title}
                timeline={timeline}
                saveNow={save.saveNow}
                disabled={save.status === "conflict"}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Transport({
  clock,
  total,
  fps,
  canSplit,
  onSplit,
  canDelete,
  onDelete,
  pps,
  onZoom,
}: {
  clock: PlaybackClock;
  total: number;
  fps: number;
  canSplit: boolean;
  onSplit: () => void;
  canDelete: boolean;
  onDelete: () => void;
  pps: number;
  onZoom: (pps: number) => void;
}) {
  const time = useClockTime(clock);
  const playing = useClockPlaying(clock);
  return (
    <div className="flex items-center gap-1.5 border-t border-border px-3 py-1.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => clock.seek(0)}
        aria-label="Back to start (Home)"
      >
        <SkipBack className="size-4" />
      </Button>
      <Button
        size="sm"
        className="h-8 w-9 px-0"
        onClick={() => clock.toggle()}
        aria-label={playing ? "Pause (Space)" : "Play (Space)"}
        data-testid="play-toggle"
        disabled={total <= 0}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <span className="ml-1 font-mono text-xs tabular-nums" data-testid="time-readout">
        {formatTime(time)} <span className="text-muted-foreground">/ {formatTime(total)}</span>
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          disabled={!canSplit}
          onClick={onSplit}
          aria-label="Split at playhead (S)"
        >
          <Scissors className="mr-1 size-3.5" /> Split
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 px-2 text-xs", canDelete && "text-destructive")}
          disabled={!canDelete}
          onClick={onDelete}
          aria-label="Delete selection"
        >
          <Trash2 className="size-3.5" />
        </Button>
        <div className="ml-2 hidden items-center gap-1.5 sm:flex" title={`1 frame = 1/${fps}s`}>
          <Minus className="size-3 text-muted-foreground" />
          <Slider
            className="w-24"
            min={10}
            max={200}
            step={2}
            value={[pps]}
            onValueChange={([value]) => onZoom(value ?? 40)}
            aria-label="Timeline zoom"
          />
          <Plus className="size-3 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
