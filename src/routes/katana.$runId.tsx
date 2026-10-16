import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { KatanaRunView } from "@/components/katana/KatanaRunView";
import { EmptyState } from "@/components/studio/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useKatanaRun } from "@/hooks/useKatana";

export const Route = createFileRoute("/katana/$runId")({
  head: () => ({
    meta: [
      { title: "Katana run · Xeno Studio" },
      { name: "description", content: "A Katana run's progress, spend and finished video." },
    ],
  }),
  component: KatanaRunPage,
});

function KatanaRunPage() {
  const { runId } = Route.useParams();
  const { data, isLoading, error } = useKatanaRun(runId);
  return (
    <AppShell title={data?.run.title || "Katana run"}>
      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      ) : data ? (
        <KatanaRunView detail={data} />
      ) : (
        <div className="p-4">
          <EmptyState
            icon={Clapperboard}
            title="Run not found"
            description={
              error instanceof Error
                ? error.message
                : "This Katana run doesn't exist or was removed."
            }
          />
        </div>
      )}
    </AppShell>
  );
}
