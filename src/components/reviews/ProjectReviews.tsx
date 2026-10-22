import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardCheck, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectReviews, useReviewAction } from "@/hooks/useReviews";
import {
  gateStates,
  moveGate,
  STANDARD_GATES,
  versionName,
  type GateState,
} from "@/lib/reviews/gates";
import {
  addGate,
  addStandardGates,
  deleteGate,
  REVIEWS_NEED_UPDATE,
  updateGate,
  type ProjectReviews as Reviews,
} from "@/lib/reviews/store";
import { GateDetail } from "./GateDetail";
import { GateStatusBadge } from "./GateStatusBadge";
import { NotesPanel } from "./NotesPanel";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * A project's reviews: its gates in order (style frames, an animatic, a
 * proof, the film, or whatever the team names), each held until the one
 * before is approved where the team says so, and the gate in view with its
 * versions, comments, decisions and notes.
 */
export function ProjectReviews({ projectId }: { projectId: string }) {
  const { user, isAdmin } = useAuth();
  const { data, isLoading, error } = useProjectReviews(projectId);
  const act = useReviewAction(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const states = useMemo(
    () => (data ? gateStates(data.gates, data.versions, data.decisions) : []),
    [data],
  );
  const selected = states.find((state) => state.gate.id === selectedId) ?? states[0] ?? null;

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (error || !data)
    return (
      <p className="text-sm text-muted-foreground">
        The reviews couldn&apos;t be read: {error instanceof Error ? error.message : "try again"}.
      </p>
    );
  if (!data.supported)
    return (
      <div className="panel p-6 text-sm text-muted-foreground" data-testid="reviews-need-update">
        {REVIEWS_NEED_UPDATE}
      </div>
    );

  async function add() {
    if (!user || !name.trim()) return;
    const ok = await act(
      () =>
        addGate(supabase, {
          projectId,
          name,
          // A new gate waits for the one before it, as a production's stages do.
          heldUntilPrevious: states.length > 0,
          userId: user.id,
        }),
      `${name.trim()} added.`,
    );
    if (ok) setName("");
  }

  const addForm = (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <Input
        value={name}
        maxLength={80}
        placeholder="A gate, such as Rough cut"
        aria-label="New gate's name"
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" variant="outline" size="sm" disabled={!name.trim() || !user}>
        <Plus className="mr-1 size-3.5" /> Add
      </Button>
    </form>
  );

  if (!states.length)
    return (
      <div className="panel space-y-4 p-6">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Review this project in gates</p>
            <p className="text-muted-foreground">
              Each gate holds versions of what is being reviewed, comments pinned to a frame or a
              time, and who approved it and when. A gate can wait until the one before it is
              approved, so nothing costlier starts before it should.
            </p>
          </div>
        </div>
        <Button
          onClick={() =>
            user && void act(() => addStandardGates(supabase, { projectId, userId: user.id }))
          }
          disabled={!user}
          data-testid="add-standard-gates"
        >
          Start with {STANDARD_GATES.join(", ")}
        </Button>
        <div className="max-w-md space-y-1">
          <p className="text-xs text-muted-foreground">Or name your own first gate:</p>
          {addForm}
        </div>
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <aside className="panel space-y-2 p-3">
        <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Gates</h3>
        <ol className="space-y-1.5">
          {states.map((state, index) => (
            <GateItem
              key={state.gate.id}
              projectId={projectId}
              state={state}
              index={index}
              count={states.length}
              active={state.gate.id === selected?.gate.id}
              canDelete={isAdmin || state.gate.created_by === user?.id}
              reviews={data}
              onSelect={() => setSelectedId(state.gate.id)}
            />
          ))}
        </ol>
        {addForm}
      </aside>
      <section className="panel min-w-0 p-4">
        {selected && (
          <GateDetail
            projectId={projectId}
            state={selected}
            reviews={data}
            userId={user?.id ?? null}
            isAdmin={isAdmin}
            notes={
              <NotesPanel
                projectId={projectId}
                state={selected}
                reviews={data}
                userId={user?.id ?? null}
              />
            }
          />
        )}
      </section>
    </div>
  );
}

function GateItem({
  projectId,
  state,
  index,
  count,
  active,
  canDelete,
  reviews,
  onSelect,
}: {
  projectId: string;
  state: GateState;
  index: number;
  count: number;
  active: boolean;
  canDelete: boolean;
  reviews: Reviews;
  onSelect: () => void;
}) {
  const act = useReviewAction(projectId);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(state.gate.name);
  const [deleting, setDeleting] = useState(false);
  const notes = reviews.notes.filter((note) => note.gate_id === state.gate.id);
  const open = notes.filter((note) => note.status === "open").length;

  async function move(direction: -1 | 1) {
    const changes = moveGate(reviews.gates, state.gate.id, direction);
    await act(async () => {
      for (const change of changes)
        await updateGate(supabase, change.id, { position: change.position });
    });
  }

  return (
    <li
      className={cn(
        "group rounded-md border px-2.5 py-2",
        active ? "border-primary/60 bg-primary/5" : "border-border",
      )}
    >
      {renaming ? (
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void act(() => updateGate(supabase, state.gate.id, { name })).then(
              (ok) => ok && setRenaming(false),
            );
          }}
        >
          <Input
            autoFocus
            className="h-7 text-sm"
            value={name}
            maxLength={80}
            aria-label="The gate's name"
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" size="sm" className="h-7">
            Save
          </Button>
        </form>
      ) : (
        <button type="button" onClick={onSelect} className="w-full text-left">
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{state.gate.name}</span>
            {state.heldBy && <Lock className="size-3 text-warning" aria-label="Held" />}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <GateStatusBadge status={state.status} />
            {state.latest && <span>{versionName(state.latest)}</span>}
            {notes.length > 0 && (
              <span>
                {open ? `${open} of ${notes.length} notes open` : `${notes.length} notes done`}
              </span>
            )}
          </span>
        </button>
      )}
      <div className="mt-1.5 flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <label className="mr-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Switch
            checked={state.gate.held_until_previous}
            disabled={index === 0}
            onCheckedChange={(value) =>
              void act(() => updateGate(supabase, state.gate.id, { held_until_previous: value }))
            }
            aria-label="Wait for the gate before to be approved"
          />
          {index === 0 ? "First gate" : "Waits for the one before"}
        </label>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={index === 0}
          aria-label="Move earlier"
          onClick={() => void move(-1)}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={index === count - 1}
          aria-label="Move later"
          onClick={() => void move(1)}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="Rename"
          onClick={() => {
            setName(state.gate.name);
            setRenaming((current) => !current);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Delete the gate"
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {state.gate.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {state.versions.length} version{state.versions.length === 1 ? "" : "s"}, their
              comments and decisions, and its notes go with it. The library files stay in the
              library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void act(() => deleteGate(supabase, state.gate.id), `${state.gate.name} deleted.`)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
