import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { SupercomputerDraft } from "@/lib/supercomputer/types";
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
import { estimateAllows, formatEstimate, useDraftRunner, type DraftEstimate } from "./draft-runner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  drafts: { draft: SupercomputerDraft; index: number; runNumber: number }[];
  context: { projectId: string | null; campaignId: string | null };
}

/** Estimates every runnable draft of an answer, shows the total, then submits them one by one. */
export function GenerateAllDialog({ open, onOpenChange, messageId, drafts, context }: Props) {
  const runner = useDraftRunner({ messageId, ...context });
  const [quotes, setQuotes] = useState<Map<number, DraftEstimate>>(new Map());
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setDone(0);
    setQuotes(new Map(drafts.map((entry) => [entry.index, { kind: "loading" } as DraftEstimate])));
    void (async () => {
      for (const entry of drafts) {
        const quote = await runner.estimate(
          entry.draft,
          entry.draft.parameters,
          entry.draft.references,
        );
        if (!active) return;
        setQuotes((current) => new Map(current).set(entry.index, quote));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const values = [...quotes.values()];
  const loading = values.some((quote) => quote.kind === "loading");
  const total = values.reduce(
    (sum, quote) => sum + (quote.kind === "ready" ? quote.costUsd : 0),
    0,
  );
  const allowed = drafts.filter((entry) =>
    estimateAllows(quotes.get(entry.index) ?? null, runner.requireEstimate),
  );
  // A long video's clips as planned now (its quote plans it against the current catalogue).
  const longClips = (index: number) => {
    const quote = quotes.get(index);
    return quote?.kind === "ready" && quote.longVideo ? `, ${quote.longVideo.clips} clips` : "";
  };

  async function runAll() {
    setRunning(true);
    for (const entry of allowed) {
      await runner.run({
        draft: entry.draft,
        index: entry.index,
        runNumber: entry.runNumber,
        values: entry.draft.parameters,
        references: entry.draft.references,
        estimate: quotes.get(entry.index) ?? null,
      });
      setDone((count) => count + 1);
    }
    setRunning(false);
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Generate {drafts.length} drafts?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <ul className="max-h-64 space-y-1.5 overflow-y-auto scroll-slim">
                {drafts.map((entry) => (
                  <li key={entry.index} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-foreground">
                      {entry.draft.title}{" "}
                      <span className="text-muted-foreground">
                        · {entry.draft.modelName}
                        {entry.draft.longVideo ? ` · long video${longClips(entry.index)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono">
                      {formatEstimate(quotes.get(entry.index) ?? null)}
                    </span>
                  </li>
                ))}
              </ul>
              <p>
                Estimated total{" "}
                <span className="font-mono text-foreground">
                  {loading ? "Calculating…" : `$${total.toFixed(2)}`}
                </span>
                {!loading && values.some((quote) => quote.kind === "ready" && quote.unpriced)
                  ? " plus keyframes Higgsfield didn't price"
                  : ""}
                {allowed.length < drafts.length && !loading
                  ? ` · ${drafts.length - allowed.length} without a valid estimate will be skipped`
                  : ""}
              </p>
              <p className="text-xs">
                Each draft is a separate generation with its own provider estimate. Nothing is
                retried automatically.
                {drafts.some((entry) => entry.draft.longVideo)
                  ? " A long video's figure is approximate: it is worked out from its first clip, and each clip is quoted again before it is sent."
                  : ""}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={running || loading || !allowed.length}
            onClick={(event) => {
              event.preventDefault();
              void runAll();
            }}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Submitting {done + 1}/
                {allowed.length}
              </>
            ) : (
              `Generate ${allowed.length} · ~$${total.toFixed(2)}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
