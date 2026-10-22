import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, Columns2, Lock, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReviewAction } from "@/hooks/useReviews";
import {
  canAddVersion,
  canDecide,
  decisionsFor,
  versionName,
  type GateState,
  type ReviewDecision,
} from "@/lib/reviews/gates";
import {
  decide,
  deleteVersion,
  type ProjectReviews,
  type ReviewVersion,
} from "@/lib/reviews/store";
import { AddVersionDialog } from "./AddVersionDialog";
import { CompareVersions } from "./CompareVersions";
import { GateStatusBadge } from "./GateStatusBadge";
import { VersionViewer } from "./VersionViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ago = (at: string) => formatDistanceToNow(new Date(at), { addSuffix: true });

/** A gate: its versions, the one in view with its comments, and the decision on it. */
export function GateDetail({
  projectId,
  state,
  reviews,
  userId,
  isAdmin,
  notes,
}: {
  projectId: string;
  state: GateState;
  reviews: ProjectReviews;
  userId: string | null;
  isAdmin: boolean;
  /** The gate's notes (F2), shown under the version in view. */
  notes?: React.ReactNode;
}) {
  const act = useReviewAction(projectId);
  const [versionId, setVersionId] = useState<string | null>(state.latest?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [comparing, setComparing] = useState(false);

  // A new version, or another gate: the latest is in view.
  useEffect(() => setVersionId(state.latest?.id ?? null), [state.gate.id, state.latest?.id]);

  const version = state.versions.find((entry) => entry.id === versionId) ?? state.latest ?? null;
  const reviewVersion = version
    ? (reviews.versions.find((entry) => entry.id === version.id) ?? null)
    : null;
  const addable = canAddVersion(state);
  const name = (id: string | null) => (id ? (reviews.people[id] ?? "A teammate") : "A teammate");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold">{state.gate.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <GateStatusBadge status={state.status} />
            {state.decision && (
              <span>
                {state.decision.decision === "approved" ? "Approved" : "Changes asked for"} by{" "}
                {name(state.decision.decided_by)}
                {state.decision.on_behalf_of ? ` for ${state.decision.on_behalf_of}` : ""}{" "}
                {ago(state.decision.created_at)}
              </span>
            )}
            {state.status === "in_review" && state.lastApproved && (
              <span>
                {versionName(state.lastApproved.version)} was approved{" "}
                {ago(state.lastApproved.decision.created_at)}
              </span>
            )}
            {state.heldBy && (
              <span className="flex items-center gap-1 text-warning">
                <Lock className="size-3" /> Held until {state.heldBy.name} is approved
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {state.versions.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setComparing(true)}>
              <Columns2 className="mr-1.5 size-3.5" /> Compare
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            disabled={!addable.ok || !userId}
            title={addable.ok ? undefined : addable.reason}
            data-testid="add-review-version"
          >
            <Plus className="mr-1.5 size-3.5" /> Add a version
          </Button>
        </div>
      </header>
      {!addable.ok && <p className="text-xs text-muted-foreground">{addable.reason}</p>}

      {state.versions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Versions">
          {state.versions.map((entry) => {
            const last = decisionsFor(reviews.decisions, entry.id).at(-1);
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === version?.id}
                onClick={() => setVersionId(entry.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  entry.id === version?.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {versionName(entry)}
                {last ? (last.decision === "approved" ? " · approved" : " · changes") : ""}
              </button>
            );
          })}
        </div>
      )}

      {!version && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing is up for review here yet.{" "}
          {addable.ok ? "Add the first version: stills, a render or a storyboard." : addable.reason}
        </p>
      )}

      {version && reviewVersion && (
        <>
          <div className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="font-medium">
              {versionName(version)} · {version.label}
            </span>
            <span className="text-xs text-muted-foreground">
              added by {name(version.created_by)} {ago(version.created_at)}
            </span>
            {version.created_by === userId &&
              !decisionsFor(reviews.decisions, version.id).length && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs text-muted-foreground"
                  onClick={() =>
                    void act(() => deleteVersion(supabase, version.id), "Version taken out.")
                  }
                >
                  <Trash2 className="mr-1 size-3" /> Take it out
                </Button>
              )}
          </div>
          {version.note && <p className="text-sm text-muted-foreground">{version.note}</p>}
          <VersionViewer
            projectId={projectId}
            version={reviewVersion}
            files={reviews.files.filter((file) => file.version_id === version.id)}
            comments={reviews.comments.filter((comment) => comment.version_id === version.id)}
            people={reviews.people}
            userId={userId}
            isAdmin={isAdmin}
          />
          <DecisionPanel
            projectId={projectId}
            state={state}
            version={reviewVersion}
            reviews={reviews}
            userId={userId}
          />
        </>
      )}

      {notes}

      <AddVersionDialog
        open={adding}
        onOpenChange={setAdding}
        projectId={projectId}
        gateId={state.gate.id}
        gateName={state.gate.name}
        nextNumber={(state.latest?.number ?? 0) + 1}
      />
      <CompareVersions
        open={comparing}
        onOpenChange={setComparing}
        versions={reviews.versions
          .filter((entry) => entry.gate_id === state.gate.id)
          .sort((a, b) => b.number - a.number)}
        files={reviews.files}
      />
    </div>
  );
}

/**
 * The decision on a version: approve it, or ask for changes, as yourself
 * (or for a client who decided outside the studio), and every decision made
 * on it so far, oldest first.
 */
function DecisionPanel({
  projectId,
  state,
  version,
  reviews,
  userId,
}: {
  projectId: string;
  state: GateState;
  version: ReviewVersion;
  reviews: ProjectReviews;
  userId: string | null;
}) {
  const act = useReviewAction(projectId);
  const [choice, setChoice] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState("");
  const [behalf, setBehalf] = useState("");
  const [saving, setSaving] = useState(false);
  const history = decisionsFor(reviews.decisions, version.id);
  const approve = canDecide(state, version.id, "approved");
  const change = canDecide(state, version.id, "changes_requested");

  useEffect(() => {
    setChoice(null);
    setNote("");
    setBehalf("");
  }, [version.id]);

  async function record() {
    if (!userId || !choice) return;
    setSaving(true);
    const ok = await act(
      () =>
        decide(supabase, {
          versionId: version.id,
          userId,
          via: "app",
          decision: choice,
          note,
          onBehalfOf: behalf,
          clientRequestId: crypto.randomUUID(),
        }),
      choice === "approved"
        ? `${versionName(version)} of ${state.gate.name} is approved.`
        : `Changes asked for on ${versionName(version)} of ${state.gate.name}.`,
    );
    setSaving(false);
    if (ok) setChoice(null);
  }

  const reason = !change.ok ? change.reason : !approve.ok ? approve.reason : null;
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Decision on {versionName(version)}</span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant={choice === "changes_requested" ? "secondary" : "outline"}
            disabled={!change.ok || !userId}
            onClick={() => setChoice("changes_requested")}
          >
            <RotateCcw className="mr-1.5 size-3.5" /> Ask for changes
          </Button>
          <Button
            size="sm"
            variant={choice === "approved" ? "default" : "outline"}
            disabled={!approve.ok || !userId}
            onClick={() => setChoice("approved")}
            data-testid="approve-review-version"
          >
            <Check className="mr-1.5 size-3.5" /> Approve
          </Button>
        </div>
      </div>
      {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
      {choice && (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={note}
            placeholder={
              choice === "approved"
                ? "Anything that goes with it (optional): “We can proceed using this method.”"
                : "What should change (optional; numbered notes go in the notes below)"
            }
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1">
              <Label htmlFor="decision-behalf" className="text-xs text-muted-foreground">
                For someone outside the team (optional): who decided
              </Label>
              <Input
                id="decision-behalf"
                value={behalf}
                placeholder="The client, by email"
                onChange={(event) => setBehalf(event.target.value)}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => setChoice(null)} disabled={saving}>
              <Undo2 className="mr-1.5 size-3.5" /> Not yet
            </Button>
            <Button size="sm" onClick={() => void record()} disabled={saving}>
              {choice === "approved" ? "Record the approval" : "Ask for the changes"}
            </Button>
          </div>
        </div>
      )}
      {history.length > 0 && (
        <ol className="space-y-1 text-xs text-muted-foreground">
          {history.map((entry) => (
            <li key={entry.id}>
              <span className={entry.decision === "approved" ? "text-success" : "text-warning"}>
                {entry.decision === "approved" ? "Approved" : "Changes asked for"}
              </span>{" "}
              by {reviews.people[entry.decided_by ?? ""] ?? "a teammate"}
              {entry.on_behalf_of ? ` for ${entry.on_behalf_of}` : ""} {ago(entry.created_at)}
              {entry.via === "api" ? " through the API" : ""}
              {entry.note ? `: ${entry.note}` : ""}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
