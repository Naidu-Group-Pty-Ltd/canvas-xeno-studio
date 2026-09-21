import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoryboards } from "@/hooks/useV2Data";
import { setCreatePrefill } from "@/lib/create-draft";

export const Route = createFileRoute("/storyboards")({
  head: () => ({
    meta: [
      { title: "Storyboards · Xeno Studio" },
      { name: "description", content: "Scenes, shots and takes for every planned production." },
      { property: "og:title", content: "Storyboards · Xeno Studio" },
      { property: "og:description", content: "Plan, shoot and track takes scene by scene." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoryboardsPage,
});

function StoryboardsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useStoryboards();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data?.find((s) => s.id === openId) ?? data?.[0] ?? null;

  return (
    <AppShell title="Storyboards">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <aside className="panel space-y-1 p-3">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Storyboards</h2>
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && !data?.length && <p className="text-sm text-muted-foreground">None yet.</p>}
          {(data ?? []).map((board) => (
            <button
              key={board.id}
              onClick={() => setOpenId(board.id)}
              className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${open?.id === board.id ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {board.title}
            </button>
          ))}
        </aside>

        <section className="panel min-w-0 p-4">
          {!open && (
            <EmptyState
              icon={Clapperboard}
              title="No storyboards yet"
              description="Build a production plan in Director, then create a storyboard from it."
              actionLabel="Open Director"
              onAction={() => navigate({ to: "/director" })}
            />
          )}
          {open && (
            <>
              <header className="mb-4">
                <h2 className="font-display text-lg font-semibold">{open.title}</h2>
                <p className="text-sm text-muted-foreground">{open.objective}</p>
              </header>
              <div className="space-y-4">
                {[...(open.scenes ?? [])]
                  .sort((a, b) => a.scene_number - b.scene_number)
                  .map((scene) => (
                    <div key={scene.id} className="rounded-lg border border-border p-3">
                      <h3 className="text-sm font-semibold">
                        Scene {scene.scene_number} · {scene.name}
                      </h3>
                      {scene.environment && <p className="text-xs text-muted-foreground">{scene.environment}</p>}
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {[...(scene.shots ?? [])]
                          .sort((a, b) => a.shot_number - b.shot_number)
                          .map((shot) => (
                            <div key={shot.id} className="rounded-md bg-surface-raised p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                  {shot.shot_number}. {shot.name}
                                </span>
                                <span className="text-xs text-muted-foreground">{shot.status}</span>
                              </div>
                              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{shot.prompt}</p>
                              <ShotTakes shotId={shot.id} />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 px-0 text-primary"
                                onClick={() => {
                                  setCreatePrefill({
                                    prompt: shot.prompt ?? "",
                                    ...(shot.recommended_model_id ? { modelId: shot.recommended_model_id } : {}),
                                    projectId: open.project_id,
                                    shotId: shot.id,
                                  });
                                  navigate({ to: "/" });
                                }}
                              >
                                Shoot this shot
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
