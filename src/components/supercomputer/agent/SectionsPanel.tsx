import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Film,
  Hand,
  Layers,
  Loader2,
  Play,
  ScanEye,
  Square,
  XCircle,
} from "lucide-react";
import { Markdown } from "@/components/studio/Markdown";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SectionRunner } from "@/hooks/useSections";
import type { AssetRow } from "@/hooks/useStudioData";
import { useThreadMessages, type MessageRow } from "@/hooks/useSupercomputerData";
import { storedDisplay, type AgentDisplay } from "@/lib/supercomputer/agent-events";
import {
  budgetState,
  canStart,
  extensionSteps,
  JOIN_KIND_LABELS,
  JOIN_STATUS_LABELS,
  REEL_KIND_LABELS,
  SECTION_STATUS_LABELS,
  unsavedShots,
  type JoinFix,
  type JoinFrame,
  type JoinView,
  type PlanView,
  type SectionStatus,
  type SectionView,
} from "@/lib/supercomputer/sections";
import { cn } from "@/lib/utils";
import { AgentTranscript } from "./AgentTranscript";

interface PanelActions {
  onOpenAsset: (asset: AssetRow) => void;
  onOpenDocument: (document: { title: string; markdown: string }) => void;
}

/** The steps a turn has shown so far: its blocks are keyed by the step they came in. */
function stepsShown(display: AgentDisplay): number {
  return new Set(display.blocks.map((entry) => entry.key.split(":")[0])).size;
}

function StatusBadge({ status }: { status: SectionStatus }) {
  const tone =
    status === "done"
      ? "bg-success/15 text-success"
      : status === "working"
        ? "bg-primary/15 text-primary"
        : status === "awaiting_approval"
          ? "bg-warning/15 text-warning"
          : status === "failed"
            ? "bg-destructive/15 text-destructive"
            : "bg-muted text-muted-foreground";
  const Icon =
    status === "done"
      ? Check
      : status === "working"
        ? Loader2
        : status === "awaiting_approval"
          ? Hand
          : status === "failed"
            ? AlertTriangle
            : status === "queued"
              ? Clock
              : status === "stopped"
                ? XCircle
                : null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        tone,
      )}
    >
      {Icon && <Icon className={cn("size-3", status === "working" && "animate-spin")} />}
      {SECTION_STATUS_LABELS[status]}
    </span>
  );
}

/** A section's steps used against its limit: tinted as it nears it, and when it is reached. */
function StepsBar({ used, budget, live }: { used: number; budget: number; live: number | null }) {
  const state = budgetState(used, budget);
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            state === "reached" ? "bg-destructive" : state === "near" ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${Math.min(100, (used / Math.max(1, budget)) * 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        {used} of {budget} steps used
        {live !== null ? ` · step ${live} of this turn` : ""}
        {state === "near" ? " · near its limit" : state === "reached" ? " · at its limit" : ""}
      </p>
    </div>
  );
}

/** The studio's brief to a worker, folded. */
function BriefNote({ message }: { message: MessageRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        The studio's brief
      </button>
      {open && (
        <div className="mt-1.5 rounded-md border border-border bg-background p-2.5">
          <Markdown text={message.content} compact className="text-xs" />
        </div>
      )}
    </div>
  );
}

/** A section's worker: its conversation's turns, the one streaming from this page live. */
function WorkerView({
  section,
  runner,
  canAct,
  actions,
}: {
  section: SectionView;
  runner: SectionRunner;
  canAct: boolean;
  actions: PanelActions;
}) {
  const { data: messages = [] } = useThreadMessages(section.workerThreadId, true);
  const live = runner.liveSectionId === section.id ? runner.live : null;
  const shown = messages.filter((message) => !message.superseded_at);
  const liveShown = !!live && shown.some((message) => message.id === live.assistantMessageId);
  const quiet = { ...actions, onDecide: null };
  return (
    <div className="space-y-3 border-l-2 border-border pl-3">
      {!shown.length && !live && (
        <p className="text-[11px] text-muted-foreground">Its worker hasn't started yet.</p>
      )}
      {shown.map((message) => {
        if (message.role === "user") return <BriefNote key={message.id} message={message} />;
        const display =
          live && message.id === live.assistantMessageId ? live.display : storedDisplay(message);
        if (!display) return null;
        return (
          <AgentTranscript
            key={message.id}
            display={display}
            actions={{
              ...actions,
              onDecide:
                canAct && !runner.busy && message.status === "awaiting_approval"
                  ? (decisions) => runner.decide(section, message, decisions)
                  : null,
            }}
          />
        );
      })}
      {live && !liveShown && <AgentTranscript display={live.display} actions={quiet} />}
    </div>
  );
}

function SectionRow({
  plan,
  section,
  runner,
  canAct,
  actions,
}: {
  plan: PlanView;
  section: SectionView;
  runner: SectionRunner;
  canAct: boolean;
  actions: PanelActions;
}) {
  const live = runner.liveSectionId === section.id;
  const status: SectionStatus = live ? "working" : section.status;
  const [open, setOpen] = useState(status === "awaiting_approval");
  const count = section.last - section.first + 1;
  const saved = section.work.shots.length;
  const reached = section.used >= section.budget - 1;
  const more = extensionSteps(plan.shots, unsavedShots(section, section.work));
  const startLabel =
    status === "waiting"
      ? "Start"
      : status === "queued"
        ? "Start now"
        : status === "done"
          ? "Run again"
          : reached
            ? `Carry on (+${more} steps)`
            : "Carry on";
  return (
    <div
      className={cn(
        "space-y-2.5 rounded-xl border p-3",
        status === "awaiting_approval" ? "border-warning/50 bg-warning/5" : "border-border",
      )}
      data-testid="agent-section"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
          {section.position + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{section.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {saved} of {count} {count === 1 ? "shot" : "shots"} saved
            {section.work.loose.length ? ` · ${section.work.loose.length} made, not placed` : ""}
            {section.work.generations.length
              ? ` · ${section.work.generations.length} still being made`
              : ""}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      <StepsBar
        used={section.used}
        budget={section.budget}
        live={live && runner.live ? stepsShown(runner.live.display) : null}
      />
      {section.work.summary && <p className="text-xs">{section.work.summary}</p>}
      {section.work.left && (
        <p className="text-[11px] text-muted-foreground">Left: {section.work.left}</p>
      )}
      {section.work.note && status !== "done" && (
        <p className="text-[11px] text-muted-foreground">To put right: {section.work.note}</p>
      )}
      {status === "failed" && section.error && (
        <p className="text-[11px] text-destructive">{section.error}</p>
      )}
      {status === "awaiting_approval" && (
        <p className="text-[11px] text-warning">
          Its worker waits for you: answer it in its turn below.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {canAct && !live && canStart(status) && status !== "awaiting_approval" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={runner.busy}
            onClick={() => runner.start(section, reached ? { extend: true } : {})}
          >
            <Play className="mr-1 size-3" /> {startLabel}
          </Button>
        )}
        {(section.workerThreadId || live) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronRight className={cn("mr-1 size-3 transition-transform", open && "rotate-90")} />
            {open ? "Hide its worker" : "Watch its worker"}
          </Button>
        )}
      </div>
      {open && <WorkerView section={section} runner={runner} canAct={canAct} actions={actions} />}
    </div>
  );
}

function FrameThumb({ side, label }: { side: JoinFrame | null; label: string }) {
  const frame = side?.frame ?? null;
  return (
    <figure className="w-36 space-y-1">
      <div className="flex h-20 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
        {frame?.status === "ready" && frame.bucket && frame.path ? (
          <MediaPreview bucket={frame.bucket} path={frame.path} type="image" alt={label} />
        ) : frame?.status === "taking" ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <span className="px-2 text-center text-[10px] text-muted-foreground">
            {frame?.note ?? "Not taken yet"}
          </span>
        )}
      </div>
      <figcaption className="text-[10px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

const FIX_LABELS: Record<JoinFix["kind"], (join: JoinView) => string> = {
  smart_blend: () => "Smart-blend it",
  colour_match: () => "Colour-match it",
  redo_after: (join) => `Make section ${join.position + 2}'s first shot again`,
  redo_before: (join) => `Make section ${join.position + 1}'s last shot again`,
};

function JoinRow({
  plan,
  join,
  runner,
  canAct,
}: {
  plan: PlanView;
  join: JoinView;
  runner: SectionRunner;
  canAct: boolean;
}) {
  const verdict = join.verdict;
  const Icon =
    join.status === "matches"
      ? Check
      : join.status === "differs"
        ? AlertTriangle
        : join.status === "framing" || join.status === "checking"
          ? Loader2
          : ScanEye;
  return (
    <div
      className={cn(
        "ml-3 space-y-2 rounded-lg border border-dashed px-3 py-2 text-xs",
        join.status === "differs" ? "border-warning/60 bg-warning/5" : "border-border",
      )}
      data-testid="agent-join"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Icon
          className={cn(
            "size-3.5",
            join.status === "matches"
              ? "text-success"
              : join.status === "differs"
                ? "text-warning"
                : "text-muted-foreground",
            (join.status === "framing" || join.status === "checking") && "animate-spin",
          )}
        />
        <span className="font-medium">Join {join.position + 1}</span>
        <span className="text-muted-foreground">
          · {JOIN_KIND_LABELS[join.kind]} · {JOIN_STATUS_LABELS[join.status]}
        </span>
      </div>
      {(join.before || join.after) && (
        <div className="flex flex-wrap gap-2">
          <FrameThumb side={join.before} label={`Section ${join.position + 1}'s last frame`} />
          <FrameThumb side={join.after} label={`Section ${join.position + 2}'s first frame`} />
        </div>
      )}
      {verdict && (
        <ul className="space-y-0.5">
          {verdict.findings
            .filter((finding) => finding.status !== "expected")
            .map((finding) => (
              <li
                key={finding.aspect}
                className={cn(
                  finding.status === "differs" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="capitalize">{finding.aspect}</span>: {finding.detail}
              </li>
            ))}
        </ul>
      )}
      {canAct && verdict?.fixes.length ? (
        <div className="flex flex-wrap gap-1.5">
          {verdict.fixes.map((fix) => (
            <Button
              key={fix.kind}
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              title={
                fix.kind === "redo_after" || fix.kind === "redo_before"
                  ? `${fix.label}. Its worker asks before it spends.`
                  : fix.label
              }
              onClick={() => runner.fix(plan.id, join.position, fix.kind)}
            >
              {FIX_LABELS[fix.kind](join)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlanPanel({
  plan,
  runner,
  canAct,
  actions,
}: {
  plan: PlanView;
  runner: SectionRunner;
  canAct: boolean;
  actions: PanelActions;
}) {
  const queued = plan.sections.filter((section) => section.status === "queued").length;
  const done = plan.sections.filter((section) => section.status === "done").length;
  const running = plan.sections.some((section) => section.id === runner.liveSectionId);
  return (
    <section className="space-y-3">
      <header className="space-y-2 rounded-xl border border-border bg-surface p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-display text-base font-semibold">
            {plan.title}
          </h3>
          {plan.sequenceId && (
            <Link
              to="/editor/$sequenceId"
              params={{ sequenceId: plan.sequenceId }}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Film className="size-3.5" /> Open the integration edit
            </Link>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {plan.shots.length} shots of the {REEL_KIND_LABELS[plan.kind]} “{plan.sourceTitle}” in{" "}
          {plan.sections.length} sections · {done} done{queued ? ` · ${queued} queued` : ""}
        </p>
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {done < plan.sections.length && (
              <Button
                size="sm"
                className="h-8"
                disabled={queued > 0 && !runner.paused}
                onClick={() => runner.runAll(plan.id)}
              >
                <Play className="mr-1.5 size-3.5" /> {done ? "Run the rest" : "Run all"}
              </Button>
            )}
            {(running || queued > 0) && (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => runner.stop(plan.id)}
              >
                <Square className="mr-1.5 size-3.5" /> Stop
              </Button>
            )}
            {running && queued > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => runner.hold(plan.id)}
              >
                Stop after this one
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={runner.busy}
              onClick={() => runner.checkJoins(plan.id)}
            >
              {runner.checking === plan.id ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <ScanEye className="mr-1.5 size-3.5" />
              )}
              Check the joins
            </Button>
          </div>
        )}
        {runner.paused && queued > 0 && (
          <p className="text-[11px] text-warning">
            A section didn't finish well, so the rest wait. Look at it, then Run the rest to carry
            on.
          </p>
        )}
      </header>
      <ol className="space-y-2">
        {plan.sections.map((section) => {
          const join = plan.joins.find((entry) => entry.position === section.position);
          return (
            <li key={section.id} className="space-y-2">
              <SectionRow
                plan={plan}
                section={section}
                runner={runner}
                canAct={canAct}
                actions={actions}
              />
              {join && <JoinRow plan={plan} join={join} runner={runner} canAct={canAct} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * A conversation's reels in sections, beside it: every section with its
 * state, its steps against its limit and its worker (live while it works),
 * and every join between two sections with its two frames and its check.
 */
export function SectionsPanel({
  open,
  onOpenChange,
  plans,
  focus,
  onFocus,
  runner,
  canAct,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: PlanView[];
  /** The plan to show (the newest when it isn't one of these). */
  focus: string | null;
  onFocus: (planId: string) => void;
  runner: SectionRunner;
  canAct: boolean;
  actions: PanelActions;
}) {
  const plan = plans.find((entry) => entry.id === focus) ?? plans[0] ?? null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-3xl"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Layers className="size-4 text-primary" /> Sections
          </SheetTitle>
          <SheetDescription>
            Each section is a run of shots built by its own worker, one after another, and merged
            into one edit as its worker saves. The joins between them are checked on both sides.
            Workers ask before they spend, as this conversation does.
          </SheetDescription>
        </SheetHeader>
        {plans.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {plans.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onFocus(entry.id)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  entry.id === plan?.id
                    ? "border-primary/60 bg-primary/10"
                    : "border-border hover:border-primary/40",
                )}
              >
                {entry.title}
              </button>
            ))}
          </div>
        )}
        {plan ? (
          <PlanPanel plan={plan} runner={runner} canAct={canAct} actions={actions} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No reel is planned in sections here yet. Ask the Supercomputer to build an edit, a long
            video or a storyboard in sections.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
