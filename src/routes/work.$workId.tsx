import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { WorkDetail } from "@/components/work/WorkDetail";

export const Route = createFileRoute("/work/$workId")({
  head: () => ({
    meta: [
      { title: "Work · Xeno Studio" },
      {
        name: "description",
        content:
          "A piece of work kept as it goes: its plan, journal, files and who is working on it now.",
      },
      { property: "og:title", content: "Work · Xeno Studio" },
      { property: "og:description", content: "Work that outlives a session, kept in the studio." },
    ],
  }),
  component: WorkDetailPage,
});

function WorkDetailPage() {
  const { workId } = Route.useParams();
  return (
    <AppShell title="Work">
      <WorkDetail workId={workId} />
    </AppShell>
  );
}
