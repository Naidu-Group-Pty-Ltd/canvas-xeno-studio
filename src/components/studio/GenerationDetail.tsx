import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, RefreshCw, Repeat, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cancelGeneration, refreshGenerationStatus, resubmitGeneration } from "@/lib/generation.functions";
import { prefillFromGeneration } from "@/lib/asset-actions";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
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
import { TERMINAL_STATUSES } from "@/lib/model-schema";

export function GenerationDetail({
  generationId,
  onOpenChange,
}: {
  generationId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"cancel" | "resubmit" | null>(null);

  const { data } = useQuery({
    queryKey: ["generation-detail", generationId],
    enabled: !!generationId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [generation, events, inputs, assets] = await Promise.all([
        supabase.from("generations").select("*").eq("id", generationId!).maybeSingle(),
        supabase
          .from("generation_events")
          .select("id,event_type,payload,created_at")
          .eq("generation_id", generationId!)
          .order("created_at"),
        supabase.from("generation_inputs").select("*").eq("generation_id", generationId!).order("position"),
        supabase.from("assets").select("*").eq("generation_id", generationId!).is("deleted_at", null),
      ]);
      return {
        generation: generation.data,
        events: events.data ?? [],
        inputs: inputs.data ?? [],
        assets: assets.data ?? [],
      };
    },
  });

  const generation = data?.generation;
  const terminal = generation ? (TERMINAL_STATUSES as readonly string[]).includes(generation.status) : false;

  const run = (fn: () => Promise<unknown>, message: string) => async () => {
    try {
      await fn();
      queryClient.invalidateQueries({ queryKey: ["generation-detail", generationId] });
      queryClient.invalidateQueries({ queryKey: ["generations"] });
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That action failed");
    }
  };

  return (
    <>
      <Sheet open={!!generationId} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto scroll-slim sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Generation detail</SheetTitle>
          </SheetHeader>

          {!generation && <p className="px-4 text-sm text-muted-foreground">Loading…</p>}

          {generation && (
            <div className="space-y-6 px-4 pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={generation.status} />
                <span className="text-xs text-muted-foreground">{generation.model_path}</span>
              </div>

              {generation.status === "submission_uncertain" && (
                <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                  <AlertTriangle className="size-4 shrink-0 text-warning" />
                  <p>
                    Submission status is uncertain. Automatic retry is disabled to prevent accidental duplicate
                    generation charges. Check the provider before resubmitting.
                  </p>
                </div>
              )}

              {generation.status === "nsfw" && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                  Generation blocked by provider moderation.
                </p>
              )}

              {generation.error_message && generation.status === "failed" && (
                <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">
                  {generation.error_message}
                </p>
              )}

              {!!data?.assets.length && (
                <div className="grid grid-cols-3 gap-2">
                  {data.assets.map((asset) => (
                    <div key={asset.id} className="aspect-square overflow-hidden rounded-md border border-border">
                      <MediaPreview
                        bucket={asset.storage_bucket}
                        path={asset.storage_path}
                        type={asset.asset_type as "image" | "video"}
                        contain
                      />
                    </div>
                  ))}
                </div>
              )}

              {generation.prompt && (
                <section className="space-y-1">
                  <h3 className="label-eyebrow">Prompt</h3>
                  <p className="text-sm whitespace-pre-wrap">{generation.prompt}</p>
                </section>
              )}

              <section className="grid grid-cols-2 gap-3 text-xs">
                <Row label="Generation ID" value={generation.id} mono />
                <Row label="Provider request" value={generation.hf_request_id ?? "—"} mono />
                <Row label="Operation" value={generation.operation} />
                <Row label="Output ingestion" value={generation.ingest_status} />
                <Row
                  label="Estimated cost"
                  value={
                    generation.estimated_cost_usd !== null
                      ? `$${Number(generation.estimated_cost_usd).toFixed(2)} (estimated)`
                      : "—"
                  }
                />
                <Row
                  label="Actual cost"
                  value={
                    generation.actual_cost_usd !== null ? `$${Number(generation.actual_cost_usd).toFixed(2)}` : "Not reported"
                  }
                />
                <Row label="Created" value={new Date(generation.created_at).toLocaleString()} />
                <Row
                  label="Completed"
                  value={generation.completed_at ? new Date(generation.completed_at).toLocaleString() : "—"}
                />
              </section>

              <section className="space-y-2">
                <h3 className="label-eyebrow">Parameters</h3>
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] scroll-slim">
                  {JSON.stringify(generation.parameters, null, 2)}
                </pre>
              </section>

              {!!data?.inputs.length && (
                <section className="space-y-2">
                  <h3 className="label-eyebrow">Inputs</h3>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {data.inputs.map((input) => (
                      <li key={input.id}>
                        {input.input_type} · {(input.storage_path ?? "").split("/").pop() ?? "media"}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="label-eyebrow">Timeline</h3>
                <ol className="space-y-2">
                  {data?.events.map((event) => (
                    <li key={event.id} className="flex gap-3 text-xs">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary/70" />
                      <div>
                        <span className="font-medium">{event.event_type.replace(/_/g, " ")}</span>
                        <span className="ml-2 text-muted-foreground">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </li>
                  ))}
                  {!data?.events.length && <p className="text-xs text-muted-foreground">No events recorded.</p>}
                </ol>
              </section>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={run(
                    () => refreshGenerationStatus({ data: { generationId: generation.id } }),
                    "Status refreshed",
                  )}
                >
                  <RefreshCw className="mr-1.5 size-4" /> Refresh status
                </Button>
                {!terminal && (
                  <Button size="sm" variant="outline" onClick={() => setConfirm("cancel")}>
                    <Ban className="mr-1.5 size-4" /> Cancel
                  </Button>
                )}
                {(generation.status === "failed" || generation.status === "submission_uncertain") && (
                  <Button size="sm" variant="outline" onClick={() => setConfirm("resubmit")}>
                    <RotateCcw className="mr-1.5 size-4" /> Retry as new generation
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await prefillFromGeneration(generation.id);
                    onOpenChange(false);
                    navigate({ to: "/" });
                  }}
                >
                  <Repeat className="mr-1.5 size-4" /> Recreate
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "cancel" ? "Cancel this generation?" : "Submit a brand new generation?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "cancel"
                ? "The provider is asked to stop the job. Any work already billed cannot be refunded."
                : "This creates a new generation linked to the original and may incur a new provider charge."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const id = generation?.id;
                setConfirm(null);
                if (!id) return;
                if (confirm === "cancel") {
                  await run(() => cancelGeneration({ data: { generationId: id } }), "Cancellation requested")();
                } else {
                  await run(() => resubmitGeneration({ data: { generationId: id } }), "New generation submitted")();
                }
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="label-eyebrow block">{label}</span>
      <span className={mono ? "block truncate font-mono text-[11px]" : "block truncate"}>{value}</span>
    </div>
  );
}
