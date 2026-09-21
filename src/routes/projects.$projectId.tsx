import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Images, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { AssetCard } from "@/components/studio/AssetCard";
import { AssetDetailDialog } from "@/components/studio/AssetDetailDialog";
import { GenerationDetail } from "@/components/studio/GenerationDetail";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { EmptyState } from "@/components/studio/EmptyState";
import { useAssets, useGenerations, type AssetRow } from "@/hooks/useStudioData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project · Xeno Studio" },
      { name: "description", content: "Assets, generation history and folders for a single studio project." },
      { property: "og:title", content: "Project · Xeno Studio" },
      { property: "og:description", content: "A campaign workspace inside the internal creative studio." },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AssetRow | null>(null);
  const [openGeneration, setOpenGeneration] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["folders", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("asset_folders").select("*").eq("project_id", projectId).order("name");
      return data ?? [];
    },
  });

  const { data: assets = [] } = useAssets({ projectId, limit: 100 });
  const { data: generations = [] } = useGenerations({ projectId, limit: 50 });

  async function saveDetails() {
    const { error } = await supabase
      .from("projects")
      .update({ name: name.trim(), description: description.trim() || null })
      .eq("id", projectId);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    setRenaming(false);
    toast.success("Project updated");
  }

  return (
    <AppShell title={project?.name ?? "Project"}>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/projects">
              <ArrowLeft className="mr-1.5 size-4" /> Projects
            </Link>
          </Button>
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold">{project?.name ?? "Loading…"}</h2>
            <p className="truncate text-xs text-muted-foreground">{project?.description ?? "No description"}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setName(project?.name ?? "");
              setDescription(project?.description ?? "");
              setRenaming(true);
            }}
          >
            <Pencil className="mr-1.5 size-4" /> Rename
          </Button>
        </div>

        <Tabs defaultValue="assets">
          <TabsList>
            <TabsTrigger value="assets">Assets ({assets.length})</TabsTrigger>
            <TabsTrigger value="history">Generation history</TabsTrigger>
            <TabsTrigger value="folders">Folders</TabsTrigger>
          </TabsList>

          <TabsContent value="assets" className="mt-4">
            {assets.length === 0 ? (
              <EmptyState
                icon={Images}
                title="No assets in this project"
                description="Generate with this project selected and finished media lands here automatically."
                actionLabel="Open Create"
                actionTo="/"
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {assets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset} onOpen={setSelected} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {generations.map((generation) => (
                <button
                  key={generation.id}
                  onClick={() => setOpenGeneration(generation.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-raised/40"
                >
                  <span className="min-w-0 flex-1 truncate">{generation.prompt ?? "No prompt"}</span>
                  <StatusBadge status={generation.status} />
                </button>
              ))}
              {!generations.length && <p className="px-4 py-6 text-sm text-muted-foreground">No generations yet.</p>}
            </div>
          </TabsContent>

          <TabsContent value="folders" className="mt-4">
            <FolderManager projectId={projectId} folders={folders} />
          </TabsContent>
        </Tabs>
      </div>

      <AssetDetailDialog asset={selected} onOpenChange={(open) => !open && setSelected(null)} />
      <GenerationDetail generationId={openGeneration} onOpenChange={(open) => !open && setOpenGeneration(null)} />

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename">Name</Label>
              <Input id="rename" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="redescribe">Description</Label>
              <Textarea id="redescribe" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <Button onClick={() => void saveDetails()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function FolderManager({
  projectId,
  folders,
}: {
  projectId: string;
  folders: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  async function addFolder() {
    if (!name.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { error } = await supabase
      .from("asset_folders")
      .insert({ project_id: projectId, name: name.trim(), created_by: userData.user.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    queryClient.invalidateQueries({ queryKey: ["folders", projectId] });
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New folder name" />
        <Button onClick={() => void addFolder()}>Add</Button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {folders.map((folder) => (
          <li key={folder.id} className="px-3 py-2 text-sm">
            {folder.name}
          </li>
        ))}
        {!folders.length && <li className="px-3 py-6 text-sm text-muted-foreground">No folders yet.</li>}
      </ul>
    </div>
  );
}
