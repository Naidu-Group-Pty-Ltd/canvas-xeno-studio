import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ListChecks, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/studio/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarJobs, useJobEvents, type AvatarJob } from "@/features/avatar-studio/hooks/useAvatarData";
import { StatusChip, newRequestId } from "@/features/avatar-studio/components/shared";
import { refreshAvatarJob, resubmitUncertainJob, retryIngest } from "@/features/avatar-studio/lib/avatar.functions";

export const Route = createFileRoute("/avatar/jobs")({
  head: () => ({
    meta: [
      { title: "Avatar Jobs · Xeno Studio" },
      { name: "description", content: "Track avatar renders, voice training and localization jobs." },
      { property: "og:title", content: "Avatar Jobs · Xeno Studio" },
      { property: "og:description", content: "Live status of every Avatar Studio job." },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { data, isLoading } = useAvatarJobs(200);
  const [open, setOpen] = useState<AvatarJob | null>(null);
  return (
    <div className="space-y-3 p-4">
      {isLoading && <Skeleton className="h-40" />}
      {!isLoading && !data?.length && <EmptyState icon={ListChecks} title="No jobs yet" description="Avatar creation, voice cloning, renders and translations all show up here." />}
      <div className="panel divide-y divide-border">
        {(data ?? []).map((j) => (
          <button key={j.id} onClick={() => setOpen(j)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-raised">
            <span className="min-w-0 flex-1 truncate">{j.job_type.replace(/_/g, " ")}{(j.input_payload as { title?: string })?.title ? ` — ${(j.input_payload as { title?: string }).title}` : ""}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">{new Date(j.created_at).toLocaleString()}</span>
            <StatusChip status={j.status} />
          </button>
        ))}
      </div>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{open && <JobDetail job={(data ?? []).find((j) => j.id === open.id) ?? open} />}</SheetContent>
      </Sheet>
    </div>
  );
}

function JobDetail({ job }: { job: AvatarJob }) {
  const { isAdmin } = useAuth();
  const events = useJobEvents(job.id);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <SheetHeader><SheetTitle>{job.job_type.replace(/_/g, " ")}</SheetTitle></SheetHeader>
      <StatusChip status={job.status} />
      {job.error_message && <p className="rounded border border-primary/40 p-3 text-sm">{job.error_message}</p>}
      {job.status === "submission_uncertain" && (
        <p className="rounded border border-warning/40 p-3 text-sm">We couldn't confirm whether HeyGen received this. It is never resubmitted automatically — check HeyGen first, or resubmit only if you're sure it didn't start (it may be billed twice).</p>
      )}
      <div className="flex flex-wrap gap-2">
        {job.provider_request_id && !["completed", "failed", "canceled"].includes(job.status) && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => refreshAvatarJob({ data: { jobId: job.id } }), "Status refreshed")}><RefreshCw className="mr-1 size-3" /> Check status</Button>
        )}
        {job.status === "ingest_failed" && <Button size="sm" disabled={busy} onClick={() => run(() => retryIngest({ data: { jobId: job.id } }), "Saving again")}>Retry saving</Button>}
        {["submission_uncertain", "failed"].includes(job.status) && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button size="sm" variant="outline" disabled={busy}>Resubmit as new job</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resubmit this job?</AlertDialogTitle>
                <AlertDialogDescription>This sends a new, separately billed request to HeyGen and links it to this one.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(() => resubmitUncertainJob({ data: { jobId: job.id, confirm: true, clientRequestId: newRequestId() } }), "Resubmitted")}>Resubmit</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-1 text-xs">
        <dt className="text-muted-foreground">Created</dt><dd className="col-span-2">{new Date(job.created_at).toLocaleString()}</dd>
        {job.provider_request_id && <><dt className="text-muted-foreground">HeyGen ID</dt><dd className="col-span-2 break-all font-mono">{job.provider_request_id}</dd></>}
        {job.completed_at && <><dt className="text-muted-foreground">Completed</dt><dd className="col-span-2">{new Date(job.completed_at).toLocaleString()}</dd></>}
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
        <ol className="space-y-2 border-l border-border pl-3 text-xs">
          {(events.data ?? []).map((e) => (
            <li key={e.id}>
              <span className="font-medium">{e.event_type.replace(/_/g, " ")}</span> <span className="text-muted-foreground">{new Date(e.created_at).toLocaleTimeString()}</span>
              {isAdmin && Object.keys((e.payload as object) ?? {}).length > 0 && <pre className="mt-1 overflow-x-auto rounded bg-surface-raised p-2 text-[10px]">{JSON.stringify(e.payload, null, 2)}</pre>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
