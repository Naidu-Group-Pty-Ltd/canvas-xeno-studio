import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { WorkList } from "@/components/work/WorkList";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/work/")({
  head: () => ({
    meta: [
      { title: "Work in progress · Xeno Studio" },
      {
        name: "description",
        content:
          "Jobs that run over many sessions, in Claude Code or the Supercomputer, kept as they go: their plan, journal, files and who is working on them now.",
      },
      { property: "og:title", content: "Work in progress · Xeno Studio" },
      { property: "og:description", content: "Work that outlives a session, kept in the studio." },
    ],
  }),
  component: WorkPage,
});

function WorkPage() {
  const [finished, setFinished] = useState(false);
  return (
    <AppShell title="Work in progress">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">Work in progress</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              A job that runs over many sessions is kept here as it goes, so whoever picks it up
              next, in Claude Code, the Supercomputer or by hand, carries on from where the last
              session stopped: its plan, its journal of what was done and decided, its files, what
              it made in the studio, and who is working on it now.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="work-finished" checked={finished} onCheckedChange={setFinished} />
            <Label htmlFor="work-finished" className="text-sm">
              Show finished
            </Label>
          </div>
        </div>
        <WorkList includeFinished={finished} />
      </div>
    </AppShell>
  );
}
