import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coins,
  Info,
  Loader2,
  RotateCcw,
  Send,
  Square,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Markdown } from "@/components/studio/Markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import type { AssetRow } from "@/hooks/useStudioData";
import type {
  KatanaEventRow,
  KatanaResultRow,
  KatanaRunDetail,
  KatanaSpendRow,
} from "@/hooks/useKatana";
import {
  cancelKatana,
  followUpKatana,
  retryKatanaResult,
  reviseKatana,
  setKatanaLimits,
} from "@/lib/katana.functions";
import { KATANA_MODE_LABELS, formatUsd, katanaActions } from "@/lib/katana/model";
import { KATANA_FIELDS } from "@/lib/katana/messages";
import { formatCredits } from "@/lib/katana/guard";
import { cn } from "@/lib/utils";
import { KatanaStatusBadge } from "./KatanaStatusBadge";
import { MediaSlot } from "./MediaSlot";

interface RunInput {
  asset_id: string;
  field: string;
  kind: "image" | "video" | "audio";
  title: string;
  media_id: string | null;
}

export function KatanaRunView({ detail }: { detail: KatanaRunDetail }) {
  const { run, events, spend, results } = detail;
  const { user, isAdmin } = useAuth();
  const canSteer = !!user && (run.created_by === user.id || isAdmin);
  const actions = katanaActions(run.status, {
    hasSession: !!run.session_id,
    hasResume: !!run.resume_line,
  });

  return (
    <div className="space-y-4 p-4">
      <Link
        to="/katana"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Katana
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold">{run.title || "Katana run"}</h2>
            <KatanaStatusBadge status={run.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {run.mode === "preset"
              ? `Preset · ${run.preset_name ?? run.preset_slug}`
              : KATANA_MODE_LABELS[run.mode as "remix" | "edit"]}
            {" · started "}
            {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
            {run.parent_run_id && (
              <>
                {" · "}
                <Link
                  to="/katana/$runId"
                  params={{ runId: run.parent_run_id }}
                  className="underline"
                >
                  revision of an earlier run
                </Link>
              </>
            )}
          </p>
          {(run.status_detail || run.error) && (
            <p className={cn("text-xs", run.error ? "text-primary" : "text-warning")}>
              {run.error ?? run.status_detail}
            </p>
          )}
        </div>
        {canSteer && (
          <div className="flex flex-wrap gap-2">
            {(actions.raiseCreditLimit || actions.raiseClaudeBudget) && (
              <LimitsButton detail={detail} claude={actions.raiseClaudeBudget} />
            )}
            {actions.cancel && <CancelButton runId={run.id} />}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <Feed events={events} />
          {canSteer && actions.followUp && <FollowUp runId={run.id} />}
          {canSteer && !actions.followUp && actions.revise && <Revise detail={detail} />}
        </div>
        <div className="min-w-0 space-y-3">
          <Results results={results} runStatus={run.status} />
          <Spend detail={detail} spend={spend} />
          <Inputs inputs={(Array.isArray(run.inputs) ? run.inputs : []) as unknown as RunInput[]} />
          {run.session_id && (
            <div className="panel space-y-1 p-4 text-xs text-muted-foreground">
              <span className="label-eyebrow block">Session</span>
              <code className="block break-all">{run.session_id}</code>
              {run.agent_version && <span>Agent version {run.agent_version}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Progress ----------

type FeedBlock =
  { type: "event"; event: KatanaEventRow } | { type: "steps"; steps: KatanaEventRow[] };

function groupSteps(events: KatanaEventRow[]): FeedBlock[] {
  const blocks: FeedBlock[] = [];
  for (const event of events) {
    const last = blocks.at(-1);
    if (event.kind === "step") {
      if (last?.type === "steps") last.steps.push(event);
      else blocks.push({ type: "steps", steps: [event] });
    } else {
      blocks.push({ type: "event", event });
    }
  }
  return blocks;
}

function Feed({ events }: { events: KatanaEventRow[] }) {
  const blocks = useMemo(() => groupSteps(events), [events]);
  if (!events.length) {
    return (
      <div className="panel flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Waiting for Katana's first steps…
      </div>
    );
  }
  return (
    <div className="panel divide-y divide-border">
      {blocks.map((block, index) =>
        block.type === "steps" ? (
          <StepGroup
            key={block.steps[0]!.id}
            steps={block.steps}
            open={index === blocks.length - 1}
          />
        ) : (
          <FeedEvent key={block.event.id} event={block.event} />
        ),
      )}
    </div>
  );
}

function StepGroup({ steps, open: startOpen }: { steps: KatanaEventRow[]; open: boolean }) {
  const [open, setOpen] = useState(false);
  const expanded = open || (startOpen && steps.length <= 3);
  const shown = expanded ? steps : steps.slice(-1);
  return (
    <div className="px-4 py-2.5">
      {steps.length > 1 && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {steps.length} steps
        </button>
      )}
      <div className="space-y-1">
        {shown.map((step) => (
          <div key={step.id} className="flex min-w-0 items-start gap-2 text-xs">
            <Wrench className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span className="shrink-0">{step.title}</span>
            {step.body && (
              <code className="min-w-0 truncate text-muted-foreground">{step.body}</code>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedEvent({ event }: { event: KatanaEventRow }) {
  const time = new Date(event.occurred_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (event.kind === "message") {
    return (
      <div className="flex gap-3 px-4 py-3">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-[11px] text-muted-foreground">Katana · {time}</span>
          <Markdown text={event.body} className="mt-1 break-words" />
        </div>
      </div>
    );
  }
  if (event.kind === "user") {
    return (
      <div className="flex justify-end px-4 py-3">
        <div className="max-w-[85%] rounded-lg bg-surface-raised px-3 py-2 text-sm">
          <span className="block text-[11px] text-muted-foreground">
            {event.title} · {time}
          </span>
          {event.body && <p className="mt-1 whitespace-pre-wrap">{event.body}</p>}
        </div>
      </div>
    );
  }
  const data = (event.data ?? {}) as Record<string, unknown>;
  const tone =
    event.kind === "error"
      ? "text-primary"
      : event.kind === "result"
        ? "text-success"
        : event.kind === "credit"
          ? data["allowed"] === false
            ? "text-warning"
            : "text-foreground"
          : "text-muted-foreground";
  const Icon =
    event.kind === "error"
      ? AlertTriangle
      : event.kind === "result"
        ? CheckCircle2
        : event.kind === "credit"
          ? Coins
          : Info;
  return (
    <div className={cn("flex items-start gap-2 px-4 py-2.5 text-xs", tone)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="font-medium">{event.title}</span>
        <span className="ml-2 text-[11px] text-muted-foreground">{time}</span>
        {event.body && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
            {event.body}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Acting on the run ----------

function FollowUp({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [images, setImages] = useState<AssetRow[]>([]);
  const [sending, setSending] = useState(false);
  const lock = useRef(false);

  async function send() {
    if (!text.trim() || lock.current) return;
    lock.current = true;
    setSending(true);
    try {
      await followUpKatana({
        data: {
          runId,
          text: text.trim(),
          assets: images.map((asset) => ({ assetId: asset.id, field: KATANA_FIELDS.images })),
        },
      });
      setText("");
      setImages([]);
      await queryClient.invalidateQueries({ queryKey: ["katana-run", runId] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The message wasn't sent");
    } finally {
      lock.current = false;
      setSending(false);
    }
  }

  return (
    <div className="panel space-y-3 p-4">
      <Label htmlFor="katana-follow-up" className="text-xs">
        Ask for changes
      </Label>
      <Textarea
        id="katana-follow-up"
        rows={3}
        maxLength={4000}
        value={text}
        placeholder="What should Katana change? It keeps working from where it stopped."
        onChange={(event) => setText(event.target.value)}
      />
      <MediaSlot
        label="Extra images"
        accept={["image"]}
        max={5}
        value={images}
        onChange={setImages}
      />
      <div className="flex justify-end">
        <Button disabled={!text.trim() || sending} onClick={() => void send()}>
          {sending ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 size-4" />
          )}
          Send
        </Button>
      </div>
    </div>
  );
}

function Revise({ detail }: { detail: KatanaRunDetail }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [credits, setCredits] = useState(
    String(Math.max(50, Math.round(Number(detail.run.credit_limit) / 2))),
  );
  const [budget, setBudget] = useState(
    String(Math.max(5, Math.round(detail.run.claude_budget_cents / 200))),
  );
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const { runId } = await reviseKatana({
        data: {
          runId: detail.run.id,
          text: text.trim(),
          assets: [],
          creditLimit: Number(credits),
          claudeBudgetUsd: Number(budget),
        },
      });
      setOpen(false);
      void navigate({ to: "/katana/$runId", params: { runId } });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The revision couldn't start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="text-xs text-muted-foreground">
        This run's session has finished. A revision continues from the state Katana saved, in a new
        session.
      </p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw className="mr-1.5 size-4" /> Start a revision
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a revision</DialogTitle>
            <DialogDescription>
              Katana restores this run's saved work and makes your change, without paying again for
              jobs it already made.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={4}
              maxLength={4000}
              value={text}
              placeholder="What to change"
              onChange={(event) => setText(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Credit limit</Label>
                <Input
                  type="number"
                  min={1}
                  value={credits}
                  onChange={(event) => setCredits(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Claude budget (USD)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || text.trim().length < 4} onClick={() => void start()}>
              {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Start revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CancelButton({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Square className="mr-1.5 size-3.5" /> Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
          <AlertDialogDescription>
            Katana stops and no more paid steps are allowed. Jobs Higgsfield has already started
            still finish (and are charged) there.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await cancelKatana({ data: { runId } });
                await queryClient.invalidateQueries({ queryKey: ["katana-run", runId] });
              } catch (cause) {
                toast.error(
                  cause instanceof Error ? cause.message : "The run couldn't be cancelled",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Cancel run
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LimitsButton({ detail, claude }: { detail: KatanaRunDetail; claude: boolean }) {
  const queryClient = useQueryClient();
  const { run } = detail;
  const [open, setOpen] = useState(false);
  const [credits, setCredits] = useState(String(Number(run.credit_limit)));
  const [budget, setBudget] = useState(String(run.claude_budget_cents / 100));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const nextCredits = Number(credits);
      const nextBudget = Number(budget);
      await setKatanaLimits({
        data: {
          runId: run.id,
          creditLimit: nextCredits !== Number(run.credit_limit) ? nextCredits : null,
          claudeBudgetUsd:
            claude && Math.round(nextBudget * 100) !== run.claude_budget_cents ? nextBudget : null,
        },
      });
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["katana-run", run.id] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The limits couldn't be changed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Coins className="mr-1.5 size-3.5" /> Limits
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run limits</DialogTitle>
            <DialogDescription>
              The credit limit caps what the credit guard lets Katana commit. A paused run carries
              on once its Claude budget is raised.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Credit limit</Label>
              <Input
                type="number"
                min={1}
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {formatCredits(Number(run.credits_reserved))} committed so far
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Claude budget (USD)</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                disabled={!claude}
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {formatUsd(run.claude_cost_cents)} used so far
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Side panels ----------

function Results({ results, runStatus }: { results: KatanaResultRow[]; runStatus: string }) {
  const queryClient = useQueryClient();
  const assetIds = results.map((result) => result.asset_id).filter((id): id is string => !!id);
  const { data: assets = [] } = useQuery({
    queryKey: ["katana-result-assets", assetIds],
    enabled: assetIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("assets").select("*").in("id", assetIds);
      return (data ?? []) as unknown as AssetRow[];
    },
  });
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  if (!results.length) {
    return (
      <div className="panel space-y-1 p-4">
        <span className="label-eyebrow block">Result</span>
        <p className="text-xs text-muted-foreground">
          {runStatus === "delivered" ||
          runStatus === "idle" ||
          runStatus === "failed" ||
          runStatus === "cancelled"
            ? "No finished video was delivered."
            : "The finished video appears here, and in the library."}
        </p>
      </div>
    );
  }
  return (
    <div className="panel space-y-3 p-4">
      <span className="label-eyebrow block">{results.length > 1 ? "Results" : "Result"}</span>
      {[...results].reverse().map((result) => {
        const asset = result.asset_id ? byId.get(result.asset_id) : undefined;
        return (
          <div key={result.id} className="space-y-2">
            {asset ? (
              <div className="overflow-hidden rounded-md border border-border bg-black">
                <MediaPreview
                  bucket={asset.storage_bucket}
                  path={asset.storage_path}
                  type="video"
                  controls
                  contain
                />
              </div>
            ) : result.status === "failed" ? (
              <div className="space-y-2 text-xs">
                <p className="text-primary">{result.error ?? "The video couldn't be saved."}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await retryKatanaResult({ data: { resultId: result.id } });
                      await queryClient.invalidateQueries({ queryKey: ["katana-run", result.run_id] });
                      await queryClient.invalidateQueries({ queryKey: ["katana-result-assets"] });
                    } catch (cause) {
                      toast.error(cause instanceof Error ? cause.message : "It couldn't be saved");
                    }
                  }}
                >
                  Try saving again
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Saving the video to the library…
              </p>
            )}
            {asset && (
              <Button asChild size="sm" variant="outline">
                <Link to="/assets">Open the library</Link>
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Spend({ detail, spend }: { detail: KatanaRunDetail; spend: KatanaSpendRow[] }) {
  const { run } = detail;
  const [open, setOpen] = useState(false);
  const reserved = Number(run.credits_reserved);
  const limit = Number(run.credit_limit);
  const paid = spend.filter((row) => Number(row.credits) > 0 || row.decision === "denied");
  return (
    <div className="panel space-y-3 p-4">
      <span className="label-eyebrow block">Spend</span>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Higgsfield credits</span>
          <span className="text-muted-foreground">
            {formatCredits(reserved)} / {formatCredits(limit)}
          </span>
        </div>
        <Progress value={limit > 0 ? Math.min(100, (reserved / limit) * 100) : 0} />
        <p className="text-[11px] text-muted-foreground">
          Committed at Higgsfield's own quotes. Jobs Higgsfield fails or refunds may cost less.
        </p>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Claude</span>
          <span className="text-muted-foreground">
            {formatUsd(run.claude_cost_cents)} / {formatUsd(run.claude_budget_cents)}
          </span>
        </div>
        <Progress
          value={
            run.claude_budget_cents > 0
              ? Math.min(100, (run.claude_cost_cents / run.claude_budget_cents) * 100)
              : 0
          }
        />
      </div>
      {run.balance_start !== null && (
        <p className="text-[11px] text-muted-foreground">
          Account balance: {formatCredits(Number(run.balance_start))}
          {run.balance_end !== null
            ? ` → ${formatCredits(Number(run.balance_end))}`
            : " at the start"}{" "}
          (other use of the account counts too)
        </p>
      )}
      {paid.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {paid.length} paid step{paid.length === 1 ? "" : "s"}
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {paid.map((row) => (
                <li key={row.id} className="text-[11px]">
                  <span className={row.decision === "allowed" ? "text-foreground" : "text-warning"}>
                    {row.decision === "allowed"
                      ? `${formatCredits(Number(row.credits))} cr`
                      : "Turned down"}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {row.tool_name.replace(/_/g, " ")}
                  </span>
                  {row.job_ids.length > 0 && (
                    <span className="text-muted-foreground"> · {row.job_ids.length} job(s)</span>
                  )}
                  {!row.priced && <span className="text-muted-foreground"> · estimated</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Inputs({ inputs }: { inputs: RunInput[] }) {
  if (!inputs.length) return null;
  const roles: Record<string, string> = {
    [KATANA_FIELDS.referenceVideo]: "Reference",
    [KATANA_FIELDS.images]: "Subject",
    [KATANA_FIELDS.videos]: "Footage",
    [KATANA_FIELDS.audio]: "Soundtrack",
  };
  return (
    <div className="panel space-y-2 p-4">
      <span className="label-eyebrow block">Inputs</span>
      <ul className="space-y-1 text-xs">
        {inputs.map((input) => (
          <li key={`${input.asset_id}-${input.field}`} className="flex justify-between gap-2">
            <span className="truncate">{input.title}</span>
            <span className="shrink-0 text-muted-foreground">
              {roles[input.field] ?? input.field.replace(/^media\./, "")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
