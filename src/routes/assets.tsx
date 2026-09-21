import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Images, LayoutGrid, List } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { AssetCard } from "@/components/studio/AssetCard";
import { AssetDetailDialog } from "@/components/studio/AssetDetailDialog";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { EmptyState } from "@/components/studio/EmptyState";
import { useAssets, useProjects, useTeam, type AssetRow } from "@/hooks/useStudioData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ asset: z.string().optional() });

export const Route = createFileRoute("/assets")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Assets · Xeno Studio" },
      { name: "description", content: "Browse every generated and uploaded image and video in the studio library." },
      { property: "og:title", content: "Assets · Xeno Studio" },
      { property: "og:description", content: "The shared media library for the internal creative studio." },
    ],
  }),
  component: AssetsPage,
});

type Filter = "all" | "image" | "video" | "uploaded" | "generated" | "favorites";

function AssetsPage() {
  const search = Route.useSearch();
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [projectId, setProjectId] = useState<string>("all");
  const [creator, setCreator] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<AssetRow | null>(null);

  const { data: projects = [] } = useProjects();
  const { data: team = [] } = useTeam();
  const { data: assets, isLoading } = useAssets({
    limit: 120,
    projectId: projectId === "all" ? null : projectId,
    assetType: filter === "image" ? "image" : filter === "video" ? "video" : null,
    sourceType: filter === "uploaded" ? "uploaded" : filter === "generated" ? "generated" : null,
    favoritesOnly: filter === "favorites",
    creator: creator === "all" ? null : creator,
    search: term,
    sort,
  });

  useEffect(() => {
    if (!search.asset) return;
    supabase
      .from("assets")
      .select("*")
      .eq("id", search.asset)
      .maybeSingle()
      .then(({ data }) => data && setSelected(data as unknown as AssetRow));
  }, [search.asset]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "image", label: "Images" },
    { id: "video", label: "Videos" },
    { id: "generated", label: "Generated" },
    { id: "uploaded", label: "Uploaded" },
    { id: "favorites", label: "Favorites" },
  ];

  return (
    <AppShell title="Assets">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === item.id
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search titles"
              className="h-8 w-44"
            />
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={creator} onValueChange={setCreator}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder="Creator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {team.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name ?? member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => setSort(value as "newest" | "oldest")}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="size-8" onClick={() => setView(view === "grid" ? "list" : "grid")} aria-label="Toggle view">
              {view === "grid" ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && !assets?.length && (
          <EmptyState
            icon={Images}
            title="No assets yet"
            description="Your generated images and videos will appear here."
            actionLabel="Open Create"
            actionTo="/"
          />
        )}

        {!isLoading && !!assets?.length && view === "grid" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onOpen={setSelected} />
            ))}
          </div>
        )}

        {!isLoading && !!assets?.length && view === "list" && (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {assets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => setSelected(asset)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-raised/50"
              >
                <span className="size-10 shrink-0 overflow-hidden rounded border border-border">
                  <MediaPreview bucket={asset.storage_bucket} path={asset.storage_path} type={asset.asset_type} />
                </span>
                <span className="min-w-0 flex-1 truncate">{asset.title ?? "Untitled"}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">{asset.asset_type}</span>
                <span className="hidden text-xs text-muted-foreground md:block">
                  {new Date(asset.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <AssetDetailDialog asset={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </AppShell>
  );
}
