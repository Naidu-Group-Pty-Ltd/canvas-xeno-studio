import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { KatanaReadiness } from "@/components/katana/KatanaReadiness";
import { useKatanaReadiness } from "@/hooks/useKatana";
import { KatanaRunList } from "@/components/katana/KatanaRunList";
import { NewKatanaRun } from "@/components/katana/NewKatanaRun";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/katana/")({
  head: () => ({
    meta: [
      { title: "Katana · Xeno Studio" },
      {
        name: "description",
        content:
          "Higgsfield's Katana: remix a reference edit for your subject, run a preset, or edit your footage.",
      },
      { property: "og:title", content: "Katana · Xeno Studio" },
      {
        property: "og:description",
        content: "Reference remixes, presets and footage edits, with a credit limit.",
      },
    ],
  }),
  component: KatanaPage,
});

function KatanaPage() {
  const { overview, loading, problems, ready } = useKatanaReadiness();
  return (
    <AppShell title="Katana">
      <div className="space-y-6 p-4">
        <div className="max-w-3xl">
          <h1 className="font-display text-xl font-semibold">Katana</h1>
          <p className="text-sm text-muted-foreground">
            Higgsfield's Katana workflow, run on the team's Higgsfield account. Every paid step is
            priced by Higgsfield and checked against the run's credit limit before it starts.
          </p>
        </div>
        <KatanaReadiness problems={problems} />
        {loading || !overview ? (
          <Skeleton className="h-96 rounded-lg" />
        ) : (
          <NewKatanaRun defaults={overview.settings} disabled={!ready} />
        )}
        <section className="space-y-3">
          <h2 className="font-display text-base font-semibold">Runs</h2>
          <KatanaRunList />
        </section>
      </div>
    </AppShell>
  );
}
