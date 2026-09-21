import { useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { InputSlot, ModelRegistryEntry } from "@/lib/model-schema";
import { ACCEPTED_MIME, uploadReference } from "@/lib/storage";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export interface ReferenceItem {
  assetId: string;
  role: string;
  assetType: "image" | "video" | "audio";
  bucket: string;
  path: string;
  title: string | null;
}

interface Props {
  model: ModelRegistryEntry | null;
  projectId: string | null;
  items: ReferenceItem[];
  onChange: (items: ReferenceItem[]) => void;
}

const ROLE_LABELS: Record<string, string> = {
  image: "Source image",
  video: "Source video",
  reference: "Reference",
  first_frame: "First frame",
  last_frame: "Last frame",
  audio: "Audio",
};

export function ReferenceRail({ model, projectId, items, onChange }: Props) {
  const slots = model?.capabilities?.inputs ?? [];
  if (!slots.length) return null;

  return (
    <div className="space-y-4">
      <h3 className="label-eyebrow">Reference media</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <SlotDropzone
            key={slot.role}
            slot={slot}
            projectId={projectId}
            items={items.filter((item) => item.role === slot.role)}
            onAdd={(item) => onChange([...items, item])}
            onRemove={(assetId) => onChange(items.filter((item) => item.assetId !== assetId))}
          />
        ))}
      </div>
    </div>
  );
}

function SlotDropzone({
  slot,
  projectId,
  items,
  onAdd,
  onRemove,
}: {
  slot: InputSlot;
  projectId: string | null;
  items: ReferenceItem[];
  onAdd: (item: ReferenceItem) => void;
  onRemove: (assetId: string) => void;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const full = !!slot.max && items.length >= slot.max;

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !user) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, (slot.max ?? 1) - items.length)) {
        if (!ACCEPTED_MIME[slot.type]?.includes(file.type)) {
          toast.error(`${file.name} is not a supported ${slot.type} file`);
          continue;
        }
        const asset = await uploadReference(file, { userId: user.id, projectId });
        onAdd({
          assetId: asset.id,
          role: slot.role,
          assetType: asset.asset_type,
          bucket: asset.storage_bucket,
          path: asset.storage_path,
          title: asset.title,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {ROLE_LABELS[slot.role] ?? slot.role}
          {slot.required && <span className="ml-1 text-primary">*</span>}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {slot.type} · {items.length}/{slot.max ?? 1}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div key={item.assetId} className="group relative size-20 overflow-hidden rounded-md border border-border">
            <MediaPreview bucket={item.bucket} path={item.path} type={item.assetType} contain />
            <button
              type="button"
              aria-label="Remove reference"
              onClick={() => onRemove(item.assetId)}
              className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFiles(event.dataTransfer.files);
            }}
            className={cn(
              "flex size-20 items-center justify-center rounded-md border border-dashed transition-colors",
              dragging ? "border-primary bg-primary/10" : "border-border hover:border-input",
            )}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4 text-muted-foreground" />}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={!!slot.array}
        accept={ACCEPTED_MIME[slot.type]?.join(",")}
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
