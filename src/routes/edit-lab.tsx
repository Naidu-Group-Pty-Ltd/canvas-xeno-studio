import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Scissors } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useModels } from "@/hooks/useStudioData";
import { setCreatePrefill } from "@/lib/create-draft";

/** Transformation operations — everything that edits existing media rather than creating from text. */
const EDIT_OPERATIONS = [
  "video-edit",
  "video-extend",
  "motion-transfer",
  "object-swap",
  "motion-control",
  "image-edit",
  "image-to-image",
  "image-to-video",
];

export const Route = createFileRoute("/edit-lab")({
  head: () => ({
    meta: [
      { title: "Edit Lab · Xeno Studio" },
      { name: "description", content: "Video edit, extend, motion transfer, object swap and motion control tools." },
      { property: "og:title", content: "Edit Lab · Xeno Studio" },
      { property: "og:description", content: "Transform existing footage instead of regenerating it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditLabPage,
});

function EditLabPage() {
  const navigate = useNavigate();
  const { data: models, isLoading } = useModels();
  const tools = (models ?? []).filter((m) => EDIT_OPERATIONS.includes(m.operation));

  return (
    <AppShell title="Edit Lab">
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Pick a transformation. The Create workspace opens with that model selected and the reference slots it needs.
        </p>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {!isLoading && !tools.length && (
          <EmptyState icon={Scissors} title="No transformation models active" description="An admin can activate them in Model Lab." />
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((model) => (
            <div key={model.id} className="panel flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-sm font-semibold">{model.display_name}</h3>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {model.operation}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{model.description}</p>
              <p className="text-xs text-muted-foreground">{model.recommended_for}</p>
              <Button
                size="sm"
                className="mt-auto"
                onClick={() => {
                  setCreatePrefill({
                    modelId: model.id,
                    mediaType: model.output_type === "video" ? "video" : "image",
                  });
                  navigate({ to: "/" });
                }}
              >
                Open tool
              </Button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
