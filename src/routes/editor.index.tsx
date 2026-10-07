import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Clapperboard, Cpu, Film, Images, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useStudioData";
import { createSequence, useSequences, type SequenceRow } from "@/hooks/useEditorData";
import {
  ASPECT_LABELS,
  ASPECT_RATIOS,
  emptyTimeline,
  formatTime,
  layoutTimeline,
  parseTimeline,
  type AspectRatio,
} from "@/lib/edit/timeline";
import { isMissingTableError } from "@/lib/edit/errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/editor/")({
  head: () => ({
    meta: [
      { title: "Editor · Xeno Studio" },
      {
        name: "description",
        content:
          "Compile generated shots into finished videos with transitions, voiceover, music and captions.",
      },
      { property: "og:title", content: "Editor · Xeno Studio" },
      { property: "og:description", content: "Compile shots into a finished video." },
    ],
  }),
  component: EditsPage,
});

const STATUS: Record<SequenceRow["status"], { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "text-muted-foreground" },
  rendering: { label: "Rendering", tone: "text-info" },
  rendered: { label: "Rendered", tone: "text-success" },
  failed: { label: "Render failed", tone: "text-destructive" },
};

function EditsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: sequences = [], isLoading, error } = useSequences();
  const { data: projects = [] } = useProjects();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [projectId, setProjectId] = useState<string>("none");
  const [creating, setCreating] = useState(false);
  const missingTables = isMissingTableError(error);

  async function create() {
    if (!user) return;
    setCreating(true);
    try {
      const id = await createSequence({
        userId: user.id,
        title: title.trim() || "Untitled edit",
        timeline: emptyTimeline(aspect),
        projectId: projectId === "none" ? null : projectId,
        source: { kind: "manual" },
      });
      setOpen(false);
      navigate({ to: "/editor/$sequenceId", params: { sequenceId: id } });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The edit could not be created");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell title="Editor">
      <div className="space-y-5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Edits</h2>
            <p className="text-sm text-muted-foreground">
              Cut generated shots, stills and uploads into finished videos with transitions,
              voiceover, music and captions.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} disabled={missingTables}>
            <Plus className="mr-1.5 size-4" /> New edit
          </Button>
        </div>

        {missingTables && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">The Editor needs a database update.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Apply migration <code>0004_edit_suite</code> (drizzle/migrations), then reload. The
                rest of the studio keeps working meanwhile.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <StartCard
            icon={Cpu}
            title="From Supercomputer"
            text="Open a conversation with generated drafts and choose Compile into a video."
            to="/supercomputer"
          />
          <StartCard
            icon={Clapperboard}
            title="From a storyboard"
            text="Pick the best take for each shot, then compile the selected takes."
            to="/storyboards"
          />
          <StartCard
            icon={Images}
            title="From scratch"
            text="Start an empty edit and add footage, stills and sound from the library."
            onClick={() => setOpen(true)}
          />
        </div>

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        )}

        {!isLoading && !missingTables && !sequences.length && (
          <EmptyState
            icon={Film}
            title="No edits yet"
            description="Compile your first video from Supercomputer drafts or a storyboard, or start from scratch."
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sequences.map((sequence) => {
            const timeline = parseTimeline(sequence.timeline);
            const total = timeline ? layoutTimeline(timeline).total : 0;
            const status = STATUS[sequence.status] ?? STATUS.draft;
            return (
              <Link
                key={sequence.id}
                to="/editor/$sequenceId"
                params={{ sequenceId: sequence.id }}
                className="panel group block p-4 transition-colors hover:border-primary/60"
                data-testid="edit-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-display text-sm font-semibold group-hover:text-primary">
                    {sequence.title}
                  </h3>
                  <span className={cn("shrink-0 text-xs", status.tone)}>{status.label}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {timeline
                    ? `${timeline.aspectRatio} · ${timeline.clips.length} clip${timeline.clips.length === 1 ? "" : "s"} · ${formatTime(total, false)}`
                    : "Unreadable timeline"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Updated{" "}
                  {new Date(sequence.updated_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New edit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Summer launch reel"
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={aspect} onValueChange={(value) => setAspect(value as AspectRatio)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>
                      {ASPECT_LABELS[ratio]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={creating}>
              {creating && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Create edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StartCard({
  icon: Icon,
  title,
  text,
  to,
  onClick,
}: {
  icon: typeof Film;
  title: string;
  text: string;
  to?: "/supercomputer" | "/storyboards";
  onClick?: () => void;
}) {
  const body = (
    <>
      <Icon className="size-5 text-primary" />
      <h3 className="mt-2 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="panel block p-4 transition-colors hover:border-primary/60">
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel block p-4 text-left transition-colors hover:border-primary/60"
    >
      {body}
    </button>
  );
}
