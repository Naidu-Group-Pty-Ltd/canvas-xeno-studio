import { createFileRoute, Link } from "@tanstack/react-router";
import { Film } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EditorWorkspace } from "@/components/editor/EditorWorkspace";
import { EmptyState } from "@/components/studio/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSequence } from "@/hooks/useEditorData";

export const Route = createFileRoute("/editor/$sequenceId")({
  head: () => ({
    meta: [
      { title: "Editor · Xeno Studio" },
      {
        name: "description",
        content: "Cut generated shots into a finished video with transitions, sound and captions.",
      },
      { property: "og:title", content: "Editor · Xeno Studio" },
      { property: "og:description", content: "Compile shots into a finished video." },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const { sequenceId } = Route.useParams();
  const { data: sequence, isLoading, error } = useSequence(sequenceId);

  return (
    <AppShell title={sequence?.title ?? "Editor"}>
      {isLoading && (
        <div className="space-y-3 p-4">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-[50vh] w-full" />
        </div>
      )}
      {!isLoading && (error || !sequence) && (
        <div className="p-6">
          <EmptyState
            icon={Film}
            title={error ? "This edit could not be loaded" : "Edit not found"}
            description={
              error ? "Check your connection and try again." : "It may have been deleted."
            }
          />
          <div className="mt-4 flex justify-center">
            <Button asChild variant="outline">
              <Link to="/editor">All edits</Link>
            </Button>
          </div>
        </div>
      )}
      {sequence && <EditorWorkspace key={sequence.id} sequence={sequence} />}
    </AppShell>
  );
}
