import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Rows3, Scissors, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { proposeFit, useFitProposal } from "@/hooks/useFitProposal";
import { findStructure, useMusicStructure, type KnownStructure } from "@/hooks/useMusicStructure";
import { fitOutOfDate, musicPieces, piecesLength } from "@/lib/edit/pieces";
import {
  formatTime,
  type Timeline,
  type TimelineAudio,
  type TimelineLayout,
} from "@/lib/edit/timeline";
import type { MusicTrackRow } from "@/lib/music/catalog";
import { fitMusicToLength, type MusicFit } from "@/lib/music/fit";
import { musicGridOnTimeline } from "@/lib/music/on-timeline";
import { barAt, SECTION_LABELS, sectionAt, type SectionKind } from "@/lib/music/structure";
import { cn } from "@/lib/utils";

/**
 * The music bed's bars and sections in the Music panel: its tempo and bars,
 * each section and where it plays in the edit, a way to find them, and
 * fitting the music to the edit on its bars. They show on the timeline as
 * soon as they're known.
 */
export function MusicStructureSection({
  bed,
  track,
  layout,
  playhead,
  onUpdate,
}: {
  bed: TimelineAudio;
  track: MusicTrackRow | undefined;
  layout: TimelineLayout;
  playhead: () => number;
  /** Applies a change to the timeline as it is when the change lands. */
  onUpdate: (apply: (timeline: Timeline) => Timeline) => void;
}) {
  const queryClient = useQueryClient();
  const { data: known, isPending } = useMusicStructure(bed.assetId);
  const [finding, setFinding] = useState(false);
  const grid = useMemo(
    () => (known ? musicGridOnTimeline(bed, known.structure, layout.total) : null),
    [bed, known, layout.total],
  );

  async function find() {
    setFinding(true);
    try {
      const found = await findStructure({ queryClient, assetId: bed.assetId, track });
      if (!found.known) {
        toast.error(
          "This music has no steady beat to find bars in, so it can't be cut or fitted on them.",
        );
        return;
      }
      if (found.note) toast.message(found.note);
      const { bars, sections } = found.known.structure;
      toast.success(
        `Found ${bars.length} bars in ${sections.length} section${sections.length === 1 ? "" : "s"}`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Its bars couldn't be found");
    } finally {
      setFinding(false);
    }
  }

  const structure = known?.structure;
  return (
    <div
      className="space-y-1.5 rounded-md border border-border p-2 text-xs"
      data-testid="music-structure"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 font-medium">
          <Rows3 className="size-3.5 text-muted-foreground" />
          Bars and sections
        </span>
        {structure && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {structure.bpm} BPM · {structure.beatsPerBar}/4 · {structure.bars.length} bars
          </span>
        )}
      </div>
      {!structure && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Find which beat is one and where the music changes (the drop, a breakdown, the
            re-entry), to cut on its bar lines and fit it to the edit.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full"
            disabled={finding || isPending}
            onClick={() => void find()}
            data-testid="find-bars"
          >
            {finding && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Find bars and sections
          </Button>
        </>
      )}
      {structure && (
        <ol className="flex flex-wrap gap-1" aria-label="Sections">
          {structure.sections.map((section, index) => {
            const heard = grid?.sections.find((placed) => placed.index === index);
            return (
              <li
                key={`${index}-${section.start}`}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                title={`${formatTime(section.start)} to ${formatTime(section.end)} in the track`}
              >
                {SECTION_LABELS[section.kind]}{" "}
                <span className="tabular-nums text-muted-foreground">
                  {heard ? formatTime(heard.start) : "not heard"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {structure && structure.confidence < 0.5 && (
        <p className="text-[11px] text-muted-foreground">
          Its beat isn't clear, so its bar lines are a best guess.
        </p>
      )}
      {known && (
        <FitToLength
          bed={bed}
          known={known}
          layout={layout}
          playhead={playhead}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

/**
 * In a music item's settings, while it plays in pieces: that it does, that
 * its start point in the track and its loop don't apply meanwhile, and a way
 * back to the whole track. Nothing for any other item.
 */
export function MusicPiecesNote({
  item,
  onPlayWhole,
}: {
  item: TimelineAudio;
  onPlayWhole: () => void;
}) {
  const pieces = musicPieces(item);
  if (!pieces) return null;
  return (
    <div className="rounded-md bg-muted p-2 text-xs" data-testid="music-pieces-note">
      <p>
        Edited on its bars: plays {pieces.length} piece{pieces.length === 1 ? "" : "s"} of its
        track, {formatTime(piecesLength(pieces))} in all (fitted in the Music panel). Its start
        point in the track and its loop don't apply while it does.
      </p>
      <button
        type="button"
        className="mt-1 text-[11px] text-primary hover:underline"
        onClick={onPlayWhole}
      >
        Play the whole track
      </button>
    </div>
  );
}

interface Landmark {
  section: number;
  /** When it should start, on the edit's timeline. */
  at: number;
}

/**
 * Fitting the bed to the edit (or to a length) on its bars: a plan of which
 * bars play again and which go, shown here and on the timeline before it is
 * applied; once applied, the bed can go back to playing the whole track.
 */
function FitToLength({
  bed,
  known,
  layout,
  playhead,
  onUpdate,
}: {
  bed: TimelineAudio;
  known: KnownStructure;
  layout: TimelineLayout;
  playhead: () => number;
  onUpdate: (apply: (timeline: Timeline) => Timeline) => void;
}) {
  const { structure, features } = known;
  const proposal = useFitProposal(bed.id);
  const [toEdit, setToEdit] = useState(true);
  const [seconds, setSeconds] = useState(30);
  const [keepEnding, setKeepEnding] = useState(true);
  const [marks, setMarks] = useState<Landmark[]>([]);
  // A proposal belongs to the panel that made it: it goes when the panel does.
  useEffect(() => () => proposeFit(bed.id, null), [bed.id]);
  const target = Math.max(1, toEdit ? layout.total - bed.start : seconds);
  // Music that starts as the edit ends (or after) has nothing to fit to.
  const nothingToFit = toEdit && layout.total - bed.start < 2;
  const applied = musicPieces(bed);
  // Fitted to the edit, which has changed length since: the fit no longer reaches its end.
  const changedTo = fitOutOfDate(bed, layout.total);
  const choosable = structure.sections.map((section, index) => ({ section, index })).slice(1);

  function propose(length = target) {
    const fit = fitMusicToLength(structure, features, length, {
      ending: keepEnding ? "track" : "bar",
      landmarks: marks.map((mark) => ({ section: mark.section, at: mark.at - bed.start })),
    });
    if (!fit) {
      toast.error(
        "This music can't be fitted to that length on its bars: it would take more joins than a track may have. Choose a length nearer its own, or loop it.",
      );
      return;
    }
    proposeFit(bed.id, fit);
  }

  function apply(fit: MusicFit) {
    onUpdate((latest) => ({
      ...latest,
      audio: latest.audio.map((item) =>
        item.id === bed.id && item.assetId === bed.assetId
          ? // Fitted to the edit, it says to how long, so a later change in the edit shows.
            { ...item, pieces: fit.pieces, duration: null, fittedTo: toEdit ? target : undefined }
          : item,
      ),
    }));
    proposeFit(bed.id, null);
    toast.success(
      fit.edits.length
        ? `The music now runs ${formatTime(fit.length)}, edited on its bars`
        : `The music runs ${formatTime(fit.length)} as it is`,
    );
  }

  function playWhole() {
    onUpdate((latest) => ({
      ...latest,
      audio: latest.audio.map((item) => {
        if (item.id !== bed.id) return item;
        const { pieces: _pieces, fittedTo: _fittedTo, ...whole } = item;
        return whole;
      }),
    }));
    toast.success("The music plays the whole track again");
  }

  return (
    <div className="space-y-1.5 border-t border-border pt-1.5" data-testid="fit-music">
      <p className="flex items-center gap-1 font-medium">
        <Scissors className="size-3.5 text-muted-foreground" />
        Fit to the edit
      </p>
      {applied && !proposal && (
        <div className="flex items-center justify-between gap-2 rounded bg-muted px-1.5 py-1">
          <span>
            Edited on its bars: {applied.length} piece{applied.length === 1 ? "" : "s"},{" "}
            {formatTime(piecesLength(applied))}
          </span>
          <button
            type="button"
            className="shrink-0 text-[11px] text-primary hover:underline"
            onClick={playWhole}
            data-testid="play-whole-track"
          >
            Play the whole track
          </button>
        </div>
      )}
      {applied && !proposal && changedTo !== null && bed.fittedTo !== undefined && (
        <div
          className="flex items-center justify-between gap-2 rounded border border-warning/40 bg-warning/10 px-1.5 py-1"
          data-testid="fit-out-of-date"
        >
          <span>
            Fitted to {formatTime(bed.fittedTo)} of the edit, which now runs {formatTime(changedTo)}{" "}
            from here
          </span>
          <button
            type="button"
            className="shrink-0 text-[11px] text-primary hover:underline"
            onClick={() => {
              setToEdit(true);
              propose(Math.max(1, changedTo));
            }}
          >
            Fit again
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-0.5 text-[11px]">
        {(
          [
            [true, `The edit (${formatTime(Math.max(0, layout.total - bed.start))})`],
            [false, "A length"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={toEdit === value}
            onClick={() => setToEdit(value)}
            className={cn(
              "rounded px-1.5 py-1",
              toEdit === value ? "bg-surface-raised text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {!toEdit && (
        <label className="flex items-center justify-between gap-2">
          Seconds
          <Input
            type="number"
            inputMode="decimal"
            aria-label="Length to fit the music to, in seconds"
            className="h-7 w-24 tabular-nums"
            min={2}
            max={600}
            step={0.1}
            value={seconds}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) setSeconds(Math.max(2, Math.min(600, value)));
            }}
          />
        </label>
      )}
      <label className="flex items-center justify-between gap-2">
        Keep its own ending
        <Switch
          checked={keepEnding}
          onCheckedChange={setKeepEnding}
          aria-label="Keep the track's own ending (else stop on a bar line)"
        />
      </label>
      {marks.map((mark, index) => (
        <div key={index} className="flex items-center gap-1">
          <Select
            value={String(mark.section)}
            onValueChange={(value) =>
              setMarks(
                marks.map((entry, at) =>
                  at === index ? { ...entry, section: Number(value) } : entry,
                ),
              )
            }
          >
            <SelectTrigger className="h-7 min-w-0 flex-1 text-[11px]" aria-label="Section to land">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choosable.map(({ section, index: sectionIndex }) => (
                <SelectItem key={sectionIndex} value={String(sectionIndex)}>
                  {SECTION_LABELS[section.kind]} · {formatTime(section.start)} in the track
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">at</span>
          <Input
            type="number"
            inputMode="decimal"
            aria-label="When it should start in the edit, in seconds"
            className="h-7 w-20 tabular-nums"
            min={0}
            max={600}
            step={0.1}
            value={Number(mark.at.toFixed(2))}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value))
                setMarks(
                  marks.map((entry, at) => (at === index ? { ...entry, at: value } : entry)),
                );
            }}
          />
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Stop landing this section on a time"
            onClick={() => setMarks(marks.filter((_, at) => at !== index))}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {choosable.length > 0 && marks.length < 4 && (
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          onClick={() => {
            const unused = choosable.find(
              ({ index }) => !marks.some((mark) => mark.section === index),
            );
            const drop = choosable.find(
              ({ section, index }) =>
                section.kind === "drop" && !marks.some((mark) => mark.section === index),
            );
            const pick = drop ?? unused;
            if (pick) setMarks([...marks, { section: pick.index, at: playhead() }]);
          }}
          data-testid="add-landmark"
        >
          <Plus className="size-3" /> Land a section at the playhead
        </button>
      )}
      {nothingToFit && (
        <p className="text-[11px] text-muted-foreground">
          The music starts as the edit ends: move it earlier, or fit it to a length.
        </p>
      )}
      <Button
        variant="secondary"
        size="sm"
        className="h-7 w-full"
        disabled={nothingToFit}
        onClick={() => propose()}
        data-testid="propose-fit"
      >
        Propose a fit
      </Button>
      {proposal && (
        <FitProposal
          fit={proposal}
          known={known}
          start={bed.start}
          onApply={() => apply(proposal)}
          onCancel={() => proposeFit(bed.id, null)}
        />
      )}
    </div>
  );
}

const PIECE_TONES: Record<SectionKind, string> = {
  intro: "bg-chart-2/50",
  build: "bg-warning/50",
  drop: "bg-primary/50",
  breakdown: "bg-info/50",
  reentry: "bg-primary/50",
  outro: "bg-chart-2/50",
  section: "bg-muted-foreground/30",
};

/** What a proposed fit does, in words and as the track's bars laid end to end, with Apply. */
function FitProposal({
  fit,
  known,
  start,
  onApply,
  onCancel,
}: {
  fit: MusicFit;
  known: KnownStructure;
  /** Where the music starts in the edit. */
  start: number;
  onApply: () => void;
  onCancel: () => void;
}) {
  const { structure } = known;
  const sectionName = (bar: number) => {
    const section = sectionAt(structure, structure.bars[bar] ?? 0);
    return section ? SECTION_LABELS[section.kind].toLowerCase() : "track";
  };
  const bars = (from: number, count: number) =>
    count === 1 ? `Bar ${from + 1}` : `Bars ${from + 1} to ${from + count}`;
  return (
    <div className="space-y-1 rounded-md bg-warning/10 p-1.5" data-testid="fit-proposal">
      <p className="font-medium">
        {fit.edits.length
          ? `Plays ${formatTime(fit.length)} in ${fit.pieces.length} pieces`
          : `Plays ${formatTime(fit.length)} as it is: no bars need to change`}
      </p>
      <ul className="space-y-0.5 text-[11px]">
        {fit.edits.map((edit) => (
          <li key={`${edit.kind}-${edit.bar}`}>
            {bars(edit.bar, edit.count)} of the {sectionName(edit.bar)}{" "}
            {edit.kind === "remove"
              ? "left out"
              : edit.times === 1
                ? "played again"
                : `played ${edit.times + 1} times`}{" "}
            <span className="text-muted-foreground">
              ({Math.round(edit.similarity * 100)}% like what they meet)
            </span>
          </li>
        ))}
        {fit.landmarks.map((mark) => {
          const kind = structure.sections[mark.section]?.kind ?? "section";
          const off = Math.abs(mark.at - mark.asked) > 0.05;
          return (
            <li key={`mark-${mark.section}`}>
              The {SECTION_LABELS[kind].toLowerCase()} starts at {formatTime(start + mark.at)}
              {off && (
                <span className="text-muted-foreground">
                  {" "}
                  (asked for {formatTime(start + mark.asked)}: the nearest whole phrase)
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <PlanStrip fit={fit} known={known} />
      <div className="grid grid-cols-2 gap-1">
        <Button size="sm" className="h-7" onClick={onApply} data-testid="apply-fit">
          Apply
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The plan as its pieces end to end: each the track's bars it plays, coloured by its section. */
function PlanStrip({ fit, known }: { fit: MusicFit; known: KnownStructure }) {
  const { structure } = known;
  return (
    <div
      className="flex h-5 w-full overflow-hidden rounded-sm"
      aria-label="The fit's pieces in order"
    >
      {fit.pieces.map((piece, index) => {
        const section = sectionAt(structure, piece.from + 0.05);
        // A piece from the very start (before the first bar line) counts from bar 1.
        const first = Math.max(0, barAt(structure, piece.from + 0.05));
        const last = barAt(structure, piece.to - 0.05);
        const label = first === last ? `${first + 1}` : `${first + 1}–${last + 1}`;
        return (
          <div
            key={`${index}-${piece.from}`}
            className={cn(
              "flex min-w-[3px] items-center justify-center truncate border-r border-background text-[9px] tabular-nums last:border-r-0",
              PIECE_TONES[section?.kind ?? "section"],
            )}
            style={{ flexGrow: piece.to - piece.from, flexBasis: 0 }}
            title={`Bars ${label}: ${formatTime(piece.from)} to ${formatTime(piece.to)} in the track`}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}
