import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  FolderInput,
  Images,
  Loader2,
  MoreHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useFileDrop } from "@/hooks/useFileDrop";
import type { CharacterEntry, CharacterImageEntry } from "@/hooks/useCharacters";
import type { AssetRow } from "@/hooks/useStudioData";
import {
  addCharacterImages,
  removeCharacterImage,
  reorderCharacterImages,
  updateCharacterImage,
} from "@/lib/characters.functions";
import {
  CHARACTER_LIMITS,
  CHARACTER_VIEWS,
  VIEW_LABELS,
  type CharacterImageRole,
  type CharacterView,
} from "@/lib/characters/model";
import { libraryAccepts, providerAccepts, uploadReference, withKnownType } from "@/lib/storage";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ROLE_COPY: Record<
  CharacterImageRole,
  { title: string; hint: string; empty: string; limit: number }
> = {
  sheet: {
    title: "Reference sheet",
    hint: "Sent with every clip and keyframe, best view first. A sharp face close-up and a full-body shot in their outfit matter most; side and back views help when they turn.",
    empty: "Add a face close-up and a full-body shot, or make them from one photo below.",
    limit: CHARACTER_LIMITS.sheetImages,
  },
  photo: {
    title: "Training photos",
    hint: "Extra photos used only to train a Soul ID (the sheet is used too): varied angles, expressions and light, one person per photo.",
    empty: "Optional. Add 5–20 varied photos of the face to train a better Soul ID.",
    limit: CHARACTER_LIMITS.photoImages,
  },
};

/** One part of a character's images (its reference sheet, or its training photos), with what can be done to them. */
export function CharacterImages({
  character,
  role,
  canEdit,
}: {
  character: CharacterEntry;
  role: CharacterImageRole;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const copy = ROLE_COPY[role];
  const images = character.images.filter((image) => image.role === role);
  const room = copy.limit - images.length;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["characters"] });

  async function run(name: string, work: () => Promise<unknown>) {
    setBusy(name);
    try {
      await work();
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function addAssets(assets: { id: string }[]) {
    if (!assets.length) return;
    await addCharacterImages({
      data: {
        characterId: character.id,
        images: assets.map((asset) => ({ assetId: asset.id, role, view: "other" as const })),
      },
    });
  }

  async function upload(files: File[]) {
    if (!user) return;
    const typed = files.map(withKnownType);
    const usable = typed.filter(
      (file) => libraryAccepts(file) && providerAccepts("image", file.type),
    );
    if (usable.length < typed.length)
      toast.warning("Only JPEG, PNG, WebP and GIF images can be added to a character.");
    const take = usable.slice(0, Math.max(0, room));
    if (take.length < usable.length)
      toast.warning(`${copy.title} holds at most ${copy.limit} images.`);
    if (!take.length) return;
    await run("upload", async () => {
      const uploaded = [];
      for (const file of take) uploaded.push(await uploadReference(file, { userId: user.id }));
      await addAssets(uploaded);
      toast.success(`Added ${uploaded.length} image${uploaded.length === 1 ? "" : "s"}.`);
    });
  }

  const { dragging, dropProps } = useFileDrop({
    onFiles: (files) => void upload(files),
    disabled: !canEdit || busy !== null || room <= 0,
  });

  function move(image: CharacterImageEntry, step: -1 | 1) {
    const order = images.map((entry) => entry.assetId);
    const at = order.indexOf(image.assetId);
    const to = at + step;
    if (to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to]!, order[at]!];
    // The other part's images keep their places after these.
    const others = character.images
      .filter((entry) => entry.role !== role)
      .map((entry) => entry.assetId);
    void run("order", () =>
      reorderCharacterImages({
        data: { characterId: character.id, assetIds: [...order, ...others] },
      }),
    );
  }

  return (
    <section
      className={cn("panel space-y-3 p-4", dragging && "ring-2 ring-primary/50")}
      {...dropProps}
      data-testid={`character-${role}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-xl">
          <h3 className="label-eyebrow">
            {copy.title} · {images.length}/{copy.limit}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{copy.hint}</p>
        </div>
        {canEdit && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy !== null || room <= 0}
              onClick={() => fileInput.current?.click()}
            >
              {busy === "upload" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-3.5" />
              )}
              Upload
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy !== null || room <= 0}
              onClick={() => setPicking(true)}
            >
              <Images className="mr-1.5 size-3.5" /> From library
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void upload(files);
              }}
            />
          </div>
        )}
      </div>

      {images.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {canEdit ? `${copy.empty} You can also drop images here.` : copy.empty}
        </p>
      ) : (
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.assetId} className="space-y-1.5" data-testid="character-image">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-surface">
                {image.asset && (
                  <MediaPreview
                    bucket={image.asset.storage_bucket}
                    path={image.asset.storage_path}
                    type="image"
                    alt={VIEW_LABELS[image.view]}
                  />
                )}
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-1 right-1 h-7 w-7 p-0 opacity-90"
                        aria-label="Image options"
                        disabled={busy !== null}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {index > 0 && (
                        <DropdownMenuItem onClick={() => move(image, -1)}>
                          <ArrowLeft className="mr-2 size-4" /> Move earlier
                        </DropdownMenuItem>
                      )}
                      {index < images.length - 1 && (
                        <DropdownMenuItem onClick={() => move(image, 1)}>
                          <ArrowRight className="mr-2 size-4" /> Move later
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() =>
                          void run("role", () =>
                            updateCharacterImage({
                              data: {
                                characterId: character.id,
                                assetId: image.assetId,
                                role: role === "sheet" ? "photo" : "sheet",
                              },
                            }),
                          )
                        }
                      >
                        <FolderInput className="mr-2 size-4" />
                        {role === "sheet" ? "Move to training photos" : "Move to reference sheet"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() =>
                          void run("remove", () =>
                            removeCharacterImage({
                              data: { characterId: character.id, assetId: image.assetId },
                            }),
                          )
                        }
                      >
                        <Trash2 className="mr-2 size-4" /> Remove from character
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {role === "sheet" &&
                (canEdit ? (
                  <Select
                    value={image.view}
                    onValueChange={(value) =>
                      void run("view", () =>
                        updateCharacterImage({
                          data: {
                            characterId: character.id,
                            assetId: image.assetId,
                            view: value as CharacterView,
                          },
                        }),
                      )
                    }
                    disabled={busy !== null}
                  >
                    <SelectTrigger className="h-7 text-[11px]" aria-label="What this image shows">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHARACTER_VIEWS.map((view) => (
                        <SelectItem key={view} value={view} className="text-xs">
                          {VIEW_LABELS[view]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{VIEW_LABELS[image.view]}</p>
                ))}
            </li>
          ))}
        </ol>
      )}

      <LibraryPicker
        open={picking}
        onOpenChange={setPicking}
        accept={["image"]}
        max={Math.max(1, room)}
        title={`Add to ${copy.title.toLowerCase()}`}
        onConfirm={(assets: AssetRow[]) => {
          setPicking(false);
          const usable = assets.filter((asset) => providerAccepts("image", asset.mime_type));
          if (usable.length < assets.length)
            toast.warning("Only JPEG, PNG, WebP and GIF images can be added to a character.");
          void run("library", () => addAssets(usable.slice(0, Math.max(0, room))));
        }}
      />
    </section>
  );
}
