import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  ClipboardCopy,
  Cpu,
  Download,
  FileText,
  History,
  Plus,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { changeId, useWorkAction, useWorkPage, useWorkRealtime } from "@/hooks/useWork";
import {
  continueWorkInSupercomputer,
  getWorkFileLinks,
  getWorkFileVersions,
  getWorkPage,
  releaseWorkHold,
  saveWorkByPerson,
} from "@/lib/work.functions";
import {
  actorLine,
  agoLabel,
  claudeCodePrompt,
  codeLine,
  codeOf,
  decisionsOf,
  ENTRY_KIND_LABELS,
  holdLine,
  holdOf,
  LINK_KIND_LABELS,
  rootsOf,
  sizeLabel,
  STEP_STATUSES,
  stepsOf,
  textList,
  WORK_STATUS_LABELS,
  WORK_STATUSES,
  type JournalRowOut,
  type LinkView,
  type StepStatus,
  type WorkPageData,
  type WorkStatus,
} from "@/lib/work/model";
import { setSupercomputerHandoff } from "@/lib/supercomputer/handoff";
import { Markdown } from "@/components/studio/Markdown";
import { GenerationDetail } from "@/components/studio/GenerationDetail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { HoldBadge, WorkStatusBadge } from "./WorkBadges";

const STEP_LABELS: Record<StepStatus, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
  blocked: "Blocked",
  skipped: "Skipped",
};

const STEP_TONES: Record<StepStatus, string> = {
  todo: "text-muted-foreground",
  doing: "text-info",
  done: "text-success",
  blocked: "text-warning",
  skipped: "text-muted-foreground line-through",
};

const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/**
 * A work whole: who is working on it, where it stands (its last account,
 * what comes next, what waits on a person, its plan, what was decided), its
 * journal, its files, what it made in the studio, its record and its brief;
 * and carrying it on, in the Supercomputer or in Claude Code.
 */
export function WorkDetail({ workId }: { workId: string }) {
  const { data, isLoading, error } = useWorkPage(workId);
  useWorkRealtime(workId);
  const act = useWorkAction(workId);
  const navigate = useNavigate();
  const [releasing, setReleasing] = useState(false);
  const [starting, setStarting] = useState(false);

  if (isLoading) return <Skeleton className="m-6 h-64" />;
  if (error || !data)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        The work couldn&apos;t be read: {error instanceof Error ? error.message : "try again"}.
      </div>
    );
  const { work } = data;
  const hold = holdOf(work);

  async function carryOnInSupercomputer() {
    setStarting(true);
    try {
      const { threadId, text } = await continueWorkInSupercomputer({ data: { workId } });
      setSupercomputerHandoff({ text, threadId, projectId: work.project_id });
      await navigate({ to: "/supercomputer", search: { thread: threadId } });
    } catch (problem) {
      toast.error(
        problem instanceof Error ? problem.message : "The conversation couldn't be started",
      );
    } finally {
      setStarting(false);
    }
  }

  async function copyForClaudeCode() {
    try {
      await navigator.clipboard.writeText(claudeCodePrompt(work));
      toast.success("Copied: paste it into Claude Code");
    } catch {
      toast.error("It couldn't be copied: select it on the Brief tab instead");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/work">
            <ArrowLeft className="mr-1.5 size-4" /> Work
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-semibold">{work.title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {data.project ? (
              <Link
                to="/projects/$projectId"
                params={{ projectId: data.project.id }}
                className="hover:underline"
              >
                {data.project.name}
              </Link>
            ) : (
              "No project"
            )}
            {" · "}
            {work.entries} journal entr{work.entries === 1 ? "y" : "ies"}
            {work.created_by && data.people[work.created_by]
              ? ` · started by ${data.people[work.created_by]}`
              : ""}
          </p>
        </div>
        <select
          aria-label="Status"
          className="h-9 rounded-md border border-border bg-surface-raised px-2 text-sm"
          value={work.status}
          onChange={(event) =>
            void act(
              () =>
                saveWorkByPerson({
                  data: {
                    workId,
                    status: event.target.value as WorkStatus,
                    clientRequestId: changeId(),
                  },
                }),
              "Status saved",
            )
          }
        >
          {WORK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {WORK_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <Button onClick={() => void carryOnInSupercomputer()} disabled={starting}>
          <Cpu className="mr-1.5 size-4" /> Continue in Supercomputer
        </Button>
        <Button variant="outline" onClick={() => void copyForClaudeCode()}>
          <Bot className="mr-1.5 size-4" /> Copy for Claude Code
        </Button>
      </div>

      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <WorkStatusBadge status={work.status} />
        <HoldBadge hold={hold} />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{holdLine(hold)}</p>
        {hold.state !== "free" && (
          <Button variant="outline" size="sm" onClick={() => setReleasing(true)}>
            <Unlock className="mr-1.5 size-4" /> Let go of its hold
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Where it stands</TabsTrigger>
          <TabsTrigger value="journal">Journal ({work.entries})</TabsTrigger>
          <TabsTrigger value="files">Files ({data.files.length})</TabsTrigger>
          <TabsTrigger value="studio">In the studio ({data.links.length})</TabsTrigger>
          <TabsTrigger value="record">Record</TabsTrigger>
          <TabsTrigger value="brief">Brief</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <Overview data={data} act={act} />
        </TabsContent>
        <TabsContent value="journal" className="mt-4">
          <Journal data={data} />
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <Files data={data} />
        </TabsContent>
        <TabsContent value="studio" className="mt-4">
          <StudioLinks links={data.links} />
        </TabsContent>
        <TabsContent value="record" className="mt-4">
          <RecordView data={data} />
        </TabsContent>
        <TabsContent value="brief" className="mt-4">
          <div className="panel p-5">
            <p className="mb-4 text-xs text-muted-foreground">
              What anyone picking this up is told: the Supercomputer reads it when a conversation
              works on it, and Claude Code prints it on resuming.
            </p>
            <Markdown text={data.brief} compact />
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={releasing} onOpenChange={setReleasing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Let go of its hold?</AlertDialogTitle>
            <AlertDialogDescription>
              {hold.state === "held"
                ? `${hold.label ?? "A session"} was heard from ${agoLabel(hold.heardMinutesAgo)} and may still be working on it. Let go only if it has stopped: the next session can then take it up at once.`
                : `${hold.label ?? "A session"} stopped renewing its hold. Letting go now lets the next session take it up without waiting.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void act(() => releaseWorkHold({ data: { workId } }), "Its hold is let go")
              }
            >
              Let go
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type Act = (work: () => Promise<unknown>, done?: string) => Promise<boolean>;

/** A person's change to a work, as saveWorkByPerson takes it. */
interface PersonChange {
  summary?: string;
  nextSteps?: string[];
  questions?: string[];
  steps?: { key: string; title?: string; status?: StepStatus; note?: string; remove?: boolean }[];
  status?: WorkStatus;
}

function Overview({ data, act }: { data: WorkPageData; act: Act }) {
  const { work, journal } = data;
  const steps = stepsOf(work.steps);
  const next = textList(work.next_steps);
  const questions = textList(work.questions);
  const latest = journal.find(
    (entry) =>
      ["save", "turn", "start", "note", "status"].includes(entry.kind) && entry.summary.trim(),
  );
  const interrupted = journal.find((entry) => entry.kind === "interrupted");
  const decisions = journal.flatMap((entry) =>
    decisionsOf(entry.decisions).map((decision) => ({ ...decision, at: entry.created_at })),
  );
  const [note, setNote] = useState("");
  const [newStep, setNewStep] = useState("");
  const [editing, setEditing] = useState<"next" | "questions" | null>(null);
  const [draft, setDraft] = useState("");

  const save = (payload: PersonChange, done: string) =>
    act(
      () =>
        saveWorkByPerson({ data: { workId: work.id, clientRequestId: changeId(), ...payload } }),
      done,
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        {work.goal.trim() && (
          <section className="panel p-5">
            <h3 className="mb-2 text-sm font-semibold">Goal</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{work.goal}</p>
          </section>
        )}
        <section className="panel p-5">
          <h3 className="mb-2 text-sm font-semibold">Last account</h3>
          {interrupted && (!latest || interrupted.n > latest.n) && (
            <p className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Its last turn was cut short ({utc(interrupted.created_at)}):{" "}
              {interrupted.summary.split("\n")[0]}
            </p>
          )}
          {latest ? (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                {ENTRY_KIND_LABELS[latest.kind]} · {utc(latest.created_at)} ·{" "}
                {actorLine(latest, data.people)}
              </p>
              <Markdown text={latest.summary} compact />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing has been written yet.</p>
          )}
        </section>
        <section className="panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Plan{" "}
              {steps.length
                ? `(${steps.filter((step) => step.status === "done").length} of ${steps.length} done)`
                : ""}
            </h3>
          </div>
          {steps.length === 0 && (
            <p className="mb-3 text-sm text-muted-foreground">No steps yet.</p>
          )}
          <ul className="space-y-2">
            {steps.map((step) => (
              <li key={step.key} className="flex items-start gap-3 text-sm">
                <select
                  aria-label={`${step.title}: status`}
                  className={cn(
                    "h-8 rounded-md border border-border bg-surface-raised px-1.5 text-xs",
                    STEP_TONES[step.status],
                  )}
                  value={step.status}
                  onChange={(event) =>
                    void save(
                      { steps: [{ key: step.key, status: event.target.value as StepStatus }] },
                      "Plan saved",
                    )
                  }
                >
                  {STEP_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STEP_LABELS[status]}
                    </option>
                  ))}
                </select>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      step.status === "skipped" && "line-through text-muted-foreground",
                    )}
                  >
                    {step.title} <span className="text-xs text-muted-foreground">({step.key})</span>
                  </p>
                  {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                </div>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const title = newStep.trim();
              if (!title) return;
              const key =
                title
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
                  .slice(0, 60) || `step-${steps.length + 1}`;
              void save({ steps: [{ key, title }] }, "Step added").then(
                (ok) => ok && setNewStep(""),
              );
            }}
          >
            <Input
              value={newStep}
              onChange={(event) => setNewStep(event.target.value)}
              placeholder="Add a step"
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Add the step">
              <Plus className="size-4" />
            </Button>
          </form>
        </section>
        <section className="panel p-5">
          <h3 className="mb-2 text-sm font-semibold">Write in its journal</h3>
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="A note for whoever picks it up next: a decision, a change of plan, what the client said"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={!note.trim()}
              onClick={() =>
                void save({ summary: note.trim() }, "Written in the journal").then(
                  (ok) => ok && setNote(""),
                )
              }
            >
              Add to the journal
            </Button>
          </div>
        </section>
      </div>
      <div className="space-y-6">
        {(["next", "questions"] as const).map((which) => {
          const items = which === "next" ? next : questions;
          return (
            <section key={which} className="panel p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {which === "next" ? "Next steps" : "Waiting on a person"}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(items.join("\n"));
                    setEditing(which);
                  }}
                >
                  Edit
                </Button>
              </div>
              {items.length ? (
                <ol
                  className={cn(
                    "space-y-1 text-sm",
                    which === "next" ? "list-decimal pl-5" : "list-disc pl-5",
                  )}
                >
                  {items.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {which === "next" ? "None given." : "Nothing."}
                </p>
              )}
            </section>
          );
        })}
        <section className="panel p-5">
          <h3 className="mb-2 text-sm font-semibold">Decided</h3>
          {decisions.length ? (
            <ul className="space-y-2 text-sm">
              {decisions.slice(0, 30).map((decision, index) => (
                <li key={index}>
                  <p>{decision.what}</p>
                  {decision.why && (
                    <p className="text-xs text-muted-foreground">Because {decision.why}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No decisions recorded in its latest entries.
            </p>
          )}
        </section>
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "next" ? "Next steps" : "Waiting on a person"}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            One a line. Whoever picks the work up next is told these.
          </p>
          <Textarea rows={8} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <Button
            onClick={() => {
              const lines = draft
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
              void save(
                editing === "next"
                  ? { nextSteps: lines, summary: "Next steps changed." }
                  : { questions: lines, summary: "Open questions changed." },
                "Saved",
              ).then((ok) => ok && setEditing(null));
            }}
          >
            Save
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Journal({ data }: { data: WorkPageData }) {
  const [earlier, setEarlier] = useState<JournalRowOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const entries = useMemo(() => [...data.journal, ...earlier], [data.journal, earlier]);
  const shown = showLinks ? entries : entries.filter((entry) => entry.kind !== "link");
  const oldest = entries.at(-1)?.n ?? null;
  const more = oldest !== null && oldest > 1 && entries.length < data.work.entries;

  async function loadEarlier() {
    if (!oldest) return;
    setLoading(true);
    try {
      const page = await getWorkPage({
        data: { workId: data.work.id, entries: 50, before: oldest },
      });
      setEarlier((current) => [...current, ...page.journal]);
    } catch (problem) {
      toast.error(problem instanceof Error ? problem.message : "The journal couldn't be read");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showLinks}
          onChange={(event) => setShowLinks(event.target.checked)}
        />
        Show what operations attached (one entry each)
      </label>
      <ol className="space-y-3">
        {shown.map((entry) => (
          <JournalEntry key={entry.id} entry={entry} people={data.people} />
        ))}
      </ol>
      {more && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadEarlier()}>
          <History className="mr-1.5 size-4" /> Earlier entries
        </Button>
      )}
    </div>
  );
}

function JournalEntry({ entry, people }: { entry: JournalRowOut; people: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const files = Array.isArray(entry.files) ? entry.files.length : 0;
  const links = Array.isArray(entry.links) ? entry.links.length : 0;
  const next = textList(entry.next_steps);
  const decisions = decisionsOf(entry.decisions);
  const long = entry.summary.length > 400 || entry.summary.split("\n").length > 6;
  const tone =
    entry.kind === "interrupted"
      ? "border-warning/40"
      : entry.kind === "save" || entry.kind === "turn"
        ? "border-info/30"
        : "border-border";
  return (
    <li className={cn("panel border-l-2 p-4", tone)}>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{ENTRY_KIND_LABELS[entry.kind]}</span> ·{" "}
        {utc(entry.created_at)} · {actorLine(entry, people)}
        {entry.state_version ? ` · record v${entry.state_version}` : ""}
        {files ? ` · ${files} file${files === 1 ? "" : "s"}` : ""}
        {links ? ` · ${links} attached` : ""}
      </p>
      {entry.summary && (
        <div className={cn("mt-2 text-sm", long && !open && "line-clamp-6")}>
          <Markdown text={entry.summary} compact />
        </div>
      )}
      {long && (
        <button
          className="mt-1 text-xs text-muted-foreground hover:underline"
          onClick={() => setOpen(!open)}
        >
          {open ? "Less" : "More"}
        </button>
      )}
      {next.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Next: {next.join(" · ")}</p>
      )}
      {decisions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {decisions.map((decision, index) => (
            <li key={index}>
              Decided: {decision.what}
              {decision.why ? ` (because ${decision.why})` : ""}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Files({ data }: { data: WorkPageData }) {
  const [versionsOf, setVersionsOf] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const roots = rootsOf(data.work.roots);
  const total = data.files.reduce((sum, file) => sum + Number(file.size ?? 0), 0);

  async function download(path: string, version?: number) {
    setBusy(path);
    try {
      const file = await getWorkFileLinks({
        data: { workId: data.work.id, path, ...(version ? { version } : {}) },
      });
      const parts = file.parts ?? [];
      if (parts.length === 1 && parts[0]?.url) window.open(parts[0].url, "_blank", "noopener");
      else if (parts.length === 0) toast.info("It is an empty file");
      else
        toast.info(
          `${path} is kept in ${parts.length} parts: python3 scripts/studio-work/work.py pull puts it back together on a machine`,
        );
    } catch (problem) {
      toast.error(problem instanceof Error ? problem.message : "The file couldn't be fetched");
    } finally {
      setBusy(null);
    }
  }

  if (!data.files.length)
    return (
      <p className="text-sm text-muted-foreground">
        No files yet. A session saves its files here as it goes (scripts/studio-work/work.py does it
        for Claude Code).
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {data.files.length} files, {sizeLabel(total)}. Every version is kept.
        {Object.keys(roots).length
          ? ` Roots: ${Object.entries(roots)
              .map(([name, path]) => `${name} → ${path}`)
              .join(", ")}.`
          : ""}
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {data.files.map((file) => (
          <div key={file.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs">{file.path}</p>
              <p className="text-xs text-muted-foreground">
                {sizeLabel(Number(file.size))} · v{file.version} · {utc(file.created_at)}
                {file.note ? ` · ${file.note}` : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVersionsOf(file.path)}
              aria-label={`Versions of ${file.path}`}
            >
              <History className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === file.path}
              onClick={() => void download(file.path)}
              aria-label={`Download ${file.path}`}
            >
              <Download className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <FileVersions
        workId={data.work.id}
        path={versionsOf}
        onClose={() => setVersionsOf(null)}
        onDownload={download}
      />
    </div>
  );
}

function FileVersions({
  workId,
  path,
  onClose,
  onDownload,
}: {
  workId: string;
  path: string | null;
  onClose: () => void;
  onDownload: (path: string, version?: number) => Promise<void>;
}) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ["work-file-versions", workId, path],
    enabled: !!path,
    queryFn: () => getWorkFileVersions({ data: { workId, path: path! } }),
  });
  return (
    <Dialog open={!!path} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate font-mono text-sm">{path}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {versions.map((version) => (
              <li key={version.version} className="flex items-center gap-3 py-2">
                <span className="w-10 text-xs text-muted-foreground">v{version.version}</span>
                <span className="flex-1 text-xs">
                  {version.deleted ? "Deleted" : sizeLabel(Number(version.size))} ·{" "}
                  {utc(version.created_at)}
                  {version.note ? ` · ${version.note}` : ""}
                </span>
                {!version.deleted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void onDownload(path!, version.version)}
                  >
                    <Download className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StudioLinks({ links }: { links: LinkView[] }) {
  const [generation, setGeneration] = useState<string | null>(null);
  if (!links.length)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing yet. What an operation makes when it is given the work&apos;s id is attached here as
        it is made.
      </p>
    );
  const groups = new Map<string, LinkView[]>();
  for (const link of links) groups.set(link.kind, [...(groups.get(link.kind) ?? []), link]);
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([kind, items]) => (
        <section key={kind}>
          <h3 className="mb-2 text-sm font-semibold">
            {LINK_KIND_LABELS[kind as keyof typeof LINK_KIND_LABELS] ?? kind} ({items.length})
          </h3>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((link) => (
              <div key={link.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <LinkTitle link={link} onGeneration={setGeneration} />
                  <p className="text-xs text-muted-foreground">
                    {[
                      link.status,
                      link.role,
                      link.note && link.note !== link.role ? link.note : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || link.object_id}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <GenerationDetail
        generationId={generation}
        onOpenChange={(open) => !open && setGeneration(null)}
      />
    </div>
  );
}

function LinkTitle({ link, onGeneration }: { link: LinkView; onGeneration: (id: string) => void }) {
  const title = link.title ?? link.object_id;
  if (link.kind === "edit")
    return (
      <Link
        to="/editor/$sequenceId"
        params={{ sequenceId: link.object_id }}
        className="truncate hover:underline"
      >
        {title}
      </Link>
    );
  if (link.kind === "thread")
    return (
      <Link
        to="/supercomputer"
        search={{ thread: link.object_id }}
        className="truncate hover:underline"
      >
        {title}
      </Link>
    );
  if (link.kind === "work")
    return (
      <Link
        to="/work/$workId"
        params={{ workId: link.object_id }}
        className="truncate hover:underline"
      >
        {title}
      </Link>
    );
  if (link.kind === "character")
    return (
      <Link
        to="/characters/$characterId"
        params={{ characterId: link.object_id }}
        className="truncate hover:underline"
      >
        {title}
      </Link>
    );
  if (link.kind === "generation")
    return (
      <button
        className="truncate text-left hover:underline"
        onClick={() => onGeneration(link.object_id)}
      >
        {title}
      </button>
    );
  return <p className="truncate">{title}</p>;
}

function RecordView({ data }: { data: WorkPageData }) {
  const code = codeOf(data.work.code);
  const text = JSON.stringify(data.work.state ?? {}, null, 2);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Version {data.work.state_version}</span>
        {code && (
          <span>
            Code:{" "}
            {codeLine(
              code,
              data.files.map((file) => file.path),
            )}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => toast.success("Copied"))
          }
        >
          <ClipboardCopy className="mr-1.5 size-4" /> Copy
        </Button>
      </div>
      <pre className="panel max-h-[60vh] overflow-auto p-4 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  );
}
