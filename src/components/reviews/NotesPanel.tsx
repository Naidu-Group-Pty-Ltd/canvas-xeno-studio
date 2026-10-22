import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReviewAction } from "@/hooks/useReviews";
import { formatTime } from "@/lib/edit/timeline";
import { versionName, type GateState } from "@/lib/reviews/gates";
import { chosenShot, mapNotes, type NoteContext } from "@/lib/reviews/notes";
import {
  storyboardSnapshot,
  type RenderSnapshot,
  type StoryboardInput,
  type StoryboardSnapshot,
} from "@/lib/reviews/snapshot";
import {
  addNotes,
  deleteNote,
  updateNote,
  type NoteTarget,
  type ProjectReviews,
  type ReviewNote,
} from "@/lib/reviews/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** The project's storyboard as it stands, for notes when no storyboard version has been reviewed. */
function useProjectStoryboard(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["review-notes-storyboard", projectId],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<StoryboardSnapshot | null> => {
      const { data, error } = await supabase
        .from("storyboards")
        .select("id,title,scenes(scene_number,shots(id,shot_number,name,duration_seconds,spec))")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? storyboardSnapshot(data as unknown as StoryboardInput) : null;
    },
  });
}

/** "04.2 · 0:35.7": a target as a chip reads. */
function targetText(target: NoteTarget): string {
  const time =
    target.start === null
      ? ""
      : target.end !== null && target.end > target.start
        ? ` · ${formatTime(target.start)}–${formatTime(target.end)}`
        : ` · ${formatTime(target.start)}`;
  return `${target.label}${time}`;
}

function TargetChip({ target, onRemove }: { target: NoteTarget; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        target.by === "person"
          ? "border-primary/40 bg-primary/10"
          : "border-border bg-surface-raised",
      )}
      title={[target.name, ...target.evidence.map((item) => `${item.kind}: ${item.text}`)]
        .filter(Boolean)
        .join("\n")}
    >
      <span className="font-mono">{targetText(target)}</span>
      <span className="text-muted-foreground">
        {target.evidence.map((item) => item.text).join("; ")}
      </span>
      {onRemove && (
        <button type="button" aria-label={`Not ${target.label}`} onClick={onRemove}>
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/**
 * A gate's notes: a list pasted in (numbered or bulleted) becomes one note a
 * line, each matched to the shots and times it concerns with the evidence
 * shown, corrected by a person, and ticked off with the version that
 * answers it.
 */
export function NotesPanel({
  projectId,
  state,
  reviews,
  userId,
}: {
  projectId: string;
  state: GateState;
  reviews: ProjectReviews;
  userId: string | null;
}) {
  const act = useReviewAction(projectId);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [givenBy, setGivenBy] = useState("");
  const [onVersion, setOnVersion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dropped, setDropped] = useState<Map<number, Set<string>>>(new Map());

  const versions = state.versions;
  // The plan the notes are matched against: the storyboard last put up for review in this
  // project, else the project's storyboard as it stands.
  const reviewedBoard = useMemo(() => {
    const boards = reviews.versions
      .filter((version) => version.snapshot?.kind === "storyboard")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const latest = boards[0]?.snapshot;
    return latest?.kind === "storyboard" ? latest : null;
  }, [reviews.versions]);
  const live = useProjectStoryboard(projectId, !reviewedBoard);
  const board = reviewedBoard ?? live.data ?? null;
  // The edit the notes are about: the version they are given on, else the gate's latest render.
  const render = useMemo((): RenderSnapshot | null => {
    const chosen = reviews.versions.find(
      (version) => version.id === (onVersion ?? state.latest?.id),
    );
    if (chosen?.snapshot?.kind === "render") return chosen.snapshot;
    const latest = reviews.versions
      .filter((version) => version.gate_id === state.gate.id && version.snapshot?.kind === "render")
      .sort((a, b) => b.number - a.number)[0];
    return latest?.snapshot?.kind === "render" ? latest.snapshot : null;
  }, [reviews.versions, onVersion, state.latest?.id, state.gate.id]);
  const context: NoteContext = useMemo(
    () => ({ shots: board?.shots ?? [], render }),
    [board, render],
  );

  const preview = useMemo(() => (text.trim() ? mapNotes(text, context) : []), [text, context]);
  const notes = reviews.notes
    .filter((note) => note.gate_id === state.gate.id)
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.number - b.number,
    );
  const done = notes.filter((note) => note.status === "done").length;

  async function save() {
    if (!userId || !preview.length) return;
    setSaving(true);
    const ok = await act(
      () =>
        addNotes(supabase, {
          gateId: state.gate.id,
          userId,
          versionId: onVersion ?? state.latest?.id ?? null,
          givenBy,
          notes: preview.map((note, index) => ({
            number: note.number,
            body: note.body,
            targets: note.targets.filter(
              (target) => !dropped.get(index)?.has(target.shotId ?? target.label),
            ),
          })),
        }),
      `${preview.length} note${preview.length === 1 ? "" : "s"} added to ${state.gate.name}.`,
    );
    setSaving(false);
    if (ok) {
      setText("");
      setGivenBy("");
      setDropped(new Map());
      setPasting(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-3" aria-label="Notes">
      <header className="flex flex-wrap items-center gap-2">
        <ClipboardList className="size-4 text-primary" />
        <h4 className="text-sm font-medium">Notes</h4>
        {notes.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {done} of {notes.length} done
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setPasting((current) => !current)}
          disabled={!userId}
        >
          <Plus className="mr-1.5 size-3.5" /> Paste notes
        </Button>
      </header>
      {!board && !render && (
        <p className="text-xs text-muted-foreground">
          Notes are matched to shots from the project&apos;s storyboard, and to times from a render
          up for review. This project has neither yet, so notes are matched by their times only.
        </p>
      )}

      {pasting && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <Textarea
            rows={6}
            value={text}
            aria-label="The notes, as given"
            placeholder={
              "1. A captivating opening.\n2. A satellite map and pins.\n3. At 0:42 the portals move too fast."
            }
            onChange={(event) => {
              setText(event.target.value);
              setDropped(new Map());
            }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="notes-given-by" className="text-xs text-muted-foreground">
                Given by (optional)
              </Label>
              <Input
                id="notes-given-by"
                value={givenBy}
                placeholder="The client, by email"
                onChange={(event) => setGivenBy(event.target.value)}
              />
            </div>
            {versions.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">On version</Label>
                <Select value={onVersion ?? state.latest?.id ?? ""} onValueChange={setOnVersion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        {versionName(version)} · {version.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {preview.length > 0 && (
            <ol className="space-y-1.5 text-sm">
              {preview.map((note, index) => (
                <li key={`${note.number}-${index}`} className="space-y-1">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    {note.number}.
                  </span>
                  {note.body}
                  <div className="flex flex-wrap gap-1 pl-5">
                    {note.targets
                      .filter((target) => !dropped.get(index)?.has(target.shotId ?? target.label))
                      .map((target) => (
                        <TargetChip
                          key={target.shotId ?? target.label}
                          target={target}
                          onRemove={() =>
                            setDropped((current) => {
                              const next = new Map(current);
                              next.set(
                                index,
                                new Set([
                                  ...(next.get(index) ?? []),
                                  target.shotId ?? target.label,
                                ]),
                              );
                              return next;
                            })
                          }
                        />
                      ))}
                    {!note.targets.length && (
                      <span className="text-[11px] text-muted-foreground">
                        No shot named: about the whole film, or add one after.
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPasting(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!preview.length || saving}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Add {preview.length || ""} note{preview.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <ol className="divide-y divide-border">
          {notes.map((note) => (
            <NoteRow
              key={note.id}
              projectId={projectId}
              note={note}
              state={state}
              shots={board?.shots ?? []}
              reviews={reviews}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function NoteRow({
  projectId,
  note,
  state,
  shots,
  reviews,
}: {
  projectId: string;
  note: ReviewNote;
  state: GateState;
  shots: StoryboardSnapshot["shots"];
  reviews: ProjectReviews;
}) {
  const act = useReviewAction(projectId);
  const answered = reviews.versions.find((version) => version.id === note.answered_in_version_id);
  const given = reviews.versions.find((version) => version.id === note.version_id);
  const setTargets = (targets: NoteTarget[]) =>
    void act(() => updateNote(supabase, note.id, { targets }));

  return (
    <li className="group flex gap-3 py-2 text-sm">
      <Checkbox
        className="mt-0.5"
        checked={note.status === "done"}
        aria-label={note.status === "done" ? "Open it again" : "Done"}
        onCheckedChange={(value) =>
          void act(() =>
            updateNote(
              supabase,
              note.id,
              value === true
                ? {
                    status: "done",
                    answered_in_version_id: note.answered_in_version_id ?? state.latest?.id ?? null,
                  }
                : { status: "open" },
            ),
          )
        }
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "whitespace-pre-wrap",
            note.status === "done" && "text-muted-foreground line-through",
          )}
        >
          <span className="mr-2 font-mono text-xs text-muted-foreground">{note.number}.</span>
          {note.body}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {note.targets.map((target) => (
            <TargetChip
              key={target.shotId ?? target.label}
              target={target}
              onRemove={() => setTargets(note.targets.filter((entry) => entry !== target))}
            />
          ))}
          {shots.length > 0 && (
            <Select
              value=""
              onValueChange={(shotId) => {
                const shot = shots.find((entry) => entry.id === shotId);
                if (shot && !note.targets.some((target) => target.shotId === shot.id))
                  setTargets([...note.targets, chosenShot(shot)]);
              }}
            >
              <SelectTrigger className="h-6 w-28 text-[11px]" aria-label="Add a shot it concerns">
                <SelectValue placeholder="+ a shot" />
              </SelectTrigger>
              <SelectContent>
                {shots.map((shot) => (
                  <SelectItem key={shot.id} value={shot.id}>
                    {shot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {[
            note.given_by ? `From ${note.given_by}` : null,
            given ? `on ${versionName(given)}` : null,
            note.status === "done"
              ? `done${note.done_by ? ` by ${reviews.people[note.done_by] ?? "a teammate"}` : ""}${answered ? `, answered in ${versionName(answered)}` : ""}`
              : "open",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {note.status === "done" && state.versions.length > 1 && (
          <Select
            value={note.answered_in_version_id ?? ""}
            onValueChange={(value) =>
              void act(() => updateNote(supabase, note.id, { answered_in_version_id: value }))
            }
          >
            <SelectTrigger
              className="h-6 w-48 text-[11px]"
              aria-label="The version that answers it"
            >
              <SelectValue placeholder="Answered in…" />
            </SelectTrigger>
            <SelectContent>
              {state.versions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  Answered in {versionName(version)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <button
        type="button"
        aria-label="Delete the note"
        className="self-start text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        onClick={() => void act(() => deleteNote(supabase, note.id))}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}
