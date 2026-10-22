import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Clapperboard, Film, Images, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRenders, useReviewAction, useReviewStoryboards } from "@/hooks/useReviews";
import type { AssetRow } from "@/hooks/useStudioData";
import { formatTime } from "@/lib/edit/timeline";
import { VERSION_FILE_LIMIT, type VersionKind } from "@/lib/reviews/gates";
import { addVersion } from "@/lib/reviews/store";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

/** Puts something up for review in a gate: library stills or videos, a finished render, or a storyboard. */
export function AddVersionDialog({
  open,
  onOpenChange,
  projectId,
  gateId,
  gateName,
  nextNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  gateId: string;
  gateName: string;
  nextNumber: number;
}) {
  const { user } = useAuth();
  const act = useReviewAction(projectId);
  const [kind, setKind] = useState<VersionKind>("files");
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [picking, setPicking] = useState(false);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [storyboardId, setStoryboardId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const renders = useProjectRenders(projectId, open);
  const storyboards = useReviewStoryboards(projectId, open);

  useEffect(() => {
    if (!open) return;
    setAssets([]);
    setRenderId(null);
    setStoryboardId(null);
    setNote("");
  }, [open]);

  const ready =
    kind === "files" ? assets.length > 0 : kind === "render" ? !!renderId : !!storyboardId;

  async function save() {
    if (!user || !ready) return;
    setSaving(true);
    const ok = await act(
      () =>
        addVersion(supabase, {
          gateId,
          userId: user.id,
          via: "app",
          ...(kind === "files" ? { assetIds: assets.map((asset) => asset.id) } : {}),
          ...(kind === "render" ? { renderId } : {}),
          ...(kind === "storyboard" ? { storyboardId } : {}),
          note,
          clientRequestId: crypto.randomUUID(),
        }),
      `Version ${nextNumber} is up for review in ${gateName}.`,
    );
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Version {nextNumber} for {gateName}
            </DialogTitle>
            <DialogDescription>
              What is up for review: the stills or videos themselves, a finished render of an edit,
              or a storyboard as it stands now.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={kind} onValueChange={(value) => setKind(value as VersionKind)}>
            <TabsList>
              <TabsTrigger value="files">
                <Images className="mr-1.5 size-3.5" /> Library files
              </TabsTrigger>
              <TabsTrigger value="render">
                <Film className="mr-1.5 size-3.5" /> A render
              </TabsTrigger>
              <TabsTrigger value="storyboard">
                <Clapperboard className="mr-1.5 size-3.5" /> A storyboard
              </TabsTrigger>
            </TabsList>
            <TabsContent value="files" className="mt-3 space-y-2">
              <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
                Choose stills or videos
              </Button>
              {assets.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {assets.length} chosen:{" "}
                  {assets.map((asset) => asset.title ?? "Untitled").join(", ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Up to {VERSION_FILE_LIMIT}, in the order chosen: one still a block for style
                  frames, say.
                </p>
              )}
            </TabsContent>
            <TabsContent value="render" className="mt-3 space-y-2">
              <Select value={renderId ?? ""} onValueChange={setRenderId}>
                <SelectTrigger>
                  <SelectValue placeholder="A finished render of this project's edits" />
                </SelectTrigger>
                <SelectContent>
                  {(renders.data ?? []).map((render) => (
                    <SelectItem key={render.id} value={render.id}>
                      {render.title} · version {render.version}
                      {render.seconds ? ` · ${formatTime(render.seconds)}` : ""}
                      {render.completedAt
                        ? ` · ${formatDistanceToNow(new Date(render.completedAt), { addSuffix: true })}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renders.isSuccess && !renders.data.length && (
                <p className="text-xs text-muted-foreground">
                  No edit in this project has finished rendering yet. Render one in the Editor
                  first.
                </p>
              )}
            </TabsContent>
            <TabsContent value="storyboard" className="mt-3 space-y-2">
              <Select value={storyboardId ?? ""} onValueChange={setStoryboardId}>
                <SelectTrigger>
                  <SelectValue placeholder="A storyboard" />
                </SelectTrigger>
                <SelectContent>
                  {(storyboards.data ?? []).map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.title}
                      {board.project_id === projectId ? " · this project" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Its shots and their times are kept as they stand now, so this version stays what was
                reviewed.
              </p>
            </TabsContent>
          </Tabs>
          <div className="space-y-1">
            <Label htmlFor="version-note" className="text-xs text-muted-foreground">
              What changed since the version before (optional)
            </Label>
            <Textarea
              id="version-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={!ready || saving}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Put it up for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LibraryPicker
        open={picking}
        onOpenChange={setPicking}
        accept={["image", "video"]}
        max={VERSION_FILE_LIMIT}
        title="Files for this version"
        onConfirm={(chosen) => {
          setAssets(chosen);
          setPicking(false);
        }}
      />
    </>
  );
}
