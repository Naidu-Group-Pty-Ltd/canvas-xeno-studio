import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, LayoutGrid, List, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { useProjects } from "@/hooks/useStudioData";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Projects · Xeno Studio" },
      { name: "description", content: "Campaign workspaces that group generations, references and finished assets." },
      { property: "og:title", content: "Projects · Xeno Studio" },
      { property: "og:description", content: "Shared campaign workspaces for the internal creative team." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: projects, isLoading } = useProjects(showArchived);

  const { data: summaries } = useQuery({
    queryKey: ["project-summaries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("assets")
        .select("id,project_id,storage_bucket,storage_path,asset_type,created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(400);
      const map = new Map<string, { count: number; latest: (typeof data)[number] | null }>();
      for (const asset of data ?? []) {
        if (!asset.project_id) continue;
        const entry = map.get(asset.project_id) ?? { count: 0, latest: null };
        entry.count += 1;
        entry.latest ??= asset;
        map.set(asset.project_id, entry);
      }
      return map;
    },
  });

  async function createProject() {
    if (!name.trim() || !user) return;
    const { error } = await supabase
      .from("projects")
      .insert({ name: name.trim(), description: description.trim() || null, created_by: user.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Project created");
    setName("");
    setDescription("");
    setCreating(false);
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  async function archiveProject(id: string, archived: boolean) {
    const { error } = await supabase.from("projects").update({ is_archived: archived }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    toast.success(archived ? "Project archived" : "Project restored");
  }

  return (
    <AppShell title="Projects">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 size-4" /> New project
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowArchived((value) => !value)}>
            <Archive className="mr-1.5 size-4" />
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="ml-auto size-8"
            onClick={() => setView(view === "grid" ? "list" : "grid")}
            aria-label="Toggle view"
          >
            {view === "grid" ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
          </Button>
        </div>

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && !projects?.length && (
          <EmptyState
            icon={LayoutGrid}
            title="No projects yet"
            description="Create a project to keep campaign generations together."
            actionLabel="New project"
            onAction={() => setCreating(true)}
          />
        )}

        {!isLoading && !!projects?.length && (
          <div className={cn(view === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2")}>
            {projects.map((project) => {
              const summary = summaries?.get(project.id);
              return (
                <div key={project.id} className="panel overflow-hidden">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="block transition-colors hover:bg-surface-raised/40"
                  >
                    {view === "grid" && (
                      <div className="h-32 border-b border-border bg-background">
                        {summary?.latest ? (
                          <MediaPreview
                            bucket={summary.latest.storage_bucket}
                            path={summary.latest.storage_path}
                            type={summary.latest.asset_type as "image" | "video"}
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                            No assets yet
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate font-medium">{project.name}</h3>
                        {project.is_archived && <span className="text-[11px] text-muted-foreground">Archived</span>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {project.description ?? "No description"}
                      </p>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        {summary?.count ?? 0} assets · updated {new Date(project.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                  <div className="flex justify-end border-t border-border px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void archiveProject(project.id, !project.is_archived)}
                    >
                      {project.is_archived ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <Button onClick={() => void createProject()} disabled={!name.trim()}>
              Create project
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
