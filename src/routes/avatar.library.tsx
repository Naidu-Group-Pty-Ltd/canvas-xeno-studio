import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FolderOpen, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/studio/EmptyState";
import { signedAvatarUrl, useAvatarAssets, useSignedUrl, type AvatarAsset } from "@/features/avatar-studio/hooks/useAvatarData";
import { sendToCreativeStudio } from "@/features/avatar-studio/lib/avatar.functions";

export const Route = createFileRoute("/avatar/library")({
  head: () => ({
    meta: [
      { title: "Avatar Library · Xeno Studio" },
      { name: "description", content: "Finished avatar videos, audio and localized versions." },
      { property: "og:title", content: "Avatar Library · Xeno Studio" },
      { property: "og:description", content: "Private library of Avatar Studio outputs." },
    ],
  }),
  component: LibraryPage,
});

const OUTPUT_ROLES = ["generated_video", "translated_video", "lipsynced_video", "generated_audio", "thumbnail", "subtitle"];

function LibraryPage() {
  const [view, setView] = useState<"outputs" | "uploads">("outputs");
  const { data, isLoading } = useAvatarAssets(view === "outputs" ? { roles: OUTPUT_ROLES } : {});
  const list = (data ?? []).filter((a) => (view === "outputs" ? OUTPUT_ROLES.includes(a.asset_role) : !OUTPUT_ROLES.includes(a.asset_role)));
  return (
    <div className="space-y-4 p-4">
      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList><TabsTrigger value="outputs">Outputs</TabsTrigger><TabsTrigger value="uploads">Uploads</TabsTrigger></TabsList>
      </Tabs>
      {isLoading && <Skeleton className="h-40" />}
      {!isLoading && !list.length && <EmptyState icon={FolderOpen} title="Nothing here yet" description="Finished videos are saved here automatically once HeyGen completes them." />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((a) => <AssetTile key={a.id} a={a} />)}</div>
    </div>
  );
}

function AssetTile({ a }: { a: AvatarAsset }) {
  const url = useSignedUrl(a.storage_bucket, a.storage_path);
  const [busy, setBusy] = useState(false);
  const final = OUTPUT_ROLES.includes(a.asset_role) && a.sensitivity === "normal" && a.asset_role !== "subtitle";
  return (
    <div className="panel overflow-hidden">
      <div className="aspect-video bg-surface-raised">
        {url.data && a.asset_type === "video" && <video src={url.data} controls preload="metadata" className="size-full object-contain" />}
        {url.data && a.asset_type === "image" && <img src={url.data} alt={a.title ?? ""} loading="lazy" className="size-full object-contain" />}
        {url.data && a.asset_type === "audio" && <div className="flex size-full items-center p-4"><audio src={url.data} controls className="w-full" /></div>}
      </div>
      <div className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{a.title ?? a.asset_role.replace(/_/g, " ")}</div>
          <div className="text-xs text-muted-foreground">{a.asset_role.replace(/_/g, " ")} · {new Date(a.created_at).toLocaleDateString()}</div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Download" onClick={async () => {
          const u = await signedAvatarUrl(a.storage_bucket, a.storage_path, a.title ?? `avatar-${a.id}`);
          if (u) window.location.href = u;
        }}><Download className="size-4" /></Button>
        {final && (
          <Button size="icon" variant="ghost" aria-label="Send to Creative Studio" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const r = await sendToCreativeStudio({ data: { assetId: a.id } });
              toast.success(r?.existing ? "Already in the Creative library" : "Copied to the Creative library");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}><Send className="size-4" /></Button>
        )}
      </div>
    </div>
  );
}
