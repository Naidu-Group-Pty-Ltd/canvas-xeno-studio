import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Images,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import {
  assignRoles,
  referenceCompatibleModels,
  rolesForType,
  slotLabel,
  slotsFor,
  UNUSED_ROLE,
} from "@/lib/references";
import { ACCEPT_ATTRIBUTE, conversionHint } from "@/lib/storage";
import { getMediaWorkerStatus, listMediaTasks, submitMediaTask } from "@/lib/media.functions";
import { supabase } from "@/integrations/supabase/client";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReferenceItem } from "./reference-files";

interface Props {
  model: ModelRegistryEntry | null;
  models: ModelRegistryEntry[];
  projectId: string | null;
  items: ReferenceItem[];
  onChange: (items: ReferenceItem[]) => void;
  onSwitchModel: (model: ModelRegistryEntry) => void;
  onOpenLibrary: () => void;
  onImportBrief: () => void;
  addFiles: (files: File[]) => Promise<void>;
  uploading: number;
}

/**
 * Always-visible reference media for Create. References survive model changes;
 * each is mapped to a role the selected model accepts, and anything the model
 * cannot use is flagged with one-click switches to models that can.
 */
export function ReferenceTray({
  model,
  models,
  projectId,
  items,
  onChange,
  onSwitchModel,
  onOpenLibrary,
  onImportBrief,
  addFiles,
  uploading,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const slots = slotsFor(model);
  const unused = items.filter((item) => item.role === UNUSED_ROLE);
  const suggestions =
    model && items.length && (unused.length || !slots.length)
      ? referenceCompatibleModels(items, models, {
          family: model.family,
          outputType: model.output_type,
          excludeId: model.id,
        }).slice(0, 4)
      : [];

  function update(next: ReferenceItem[]) {
    onChange(assignRoles(next, model));
  }

  function move(assetId: string, delta: number) {
    const index = items.findIndex((item) => item.assetId === assetId);
    const role = items[index]?.role;
    if (index < 0 || !role) return;
    const sameRole = items
      .map((item, position) => ({ item, position }))
      .filter((entry) => entry.item.role === role);
    const at = sameRole.findIndex((entry) => entry.position === index);
    const target = sameRole[at + delta];
    if (!target) return;
    const next = [...items];
    [next[index], next[target.position]] = [next[target.position]!, next[index]!];
    onChange(next);
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border border-dashed p-3 transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border",
      )}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        void addFiles(Array.from(event.dataTransfer.files ?? []));
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="label-eyebrow">References{items.length ? ` (${items.length})` : ""}</h3>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 size-3.5" />
            )}{" "}
            Upload
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onOpenLibrary}
          >
            <Images className="mr-1 size-3.5" /> Library
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onImportBrief}
          >
            <FileText className="mr-1 size-3.5" /> Brief
          </Button>
        </div>
      </div>

      {!items.length ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md py-4 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />
          Drop, paste or upload images, video or audio
          {slots.length ? ` — ${model?.display_name} uses ${describeSlots(model)}` : ""}
        </button>
      ) : (
        <div className="space-y-3">
          {slots.map((slot) => {
            const inSlot = items.filter((item) => item.role === slot.role);
            return (
              <div key={slot.role} className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium">
                    {slotLabel(slot)}
                    {slot.required && <span className="ml-1 text-primary">*</span>}
                  </span>
                  <span className="text-muted-foreground">
                    {slot.type} · {inSlot.length}/{slot.max ?? 1}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inSlot.map((item, position) => (
                    <ReferenceTile
                      key={item.assetId}
                      item={item}
                      model={model}
                      projectId={projectId}
                      canMoveUp={position > 0}
                      canMoveDown={position < inSlot.length - 1}
                      onMove={(delta) => move(item.assetId, delta)}
                      onRole={(role) =>
                        update(
                          items.map((entry) =>
                            entry.assetId === item.assetId ? { ...entry, role } : entry,
                          ),
                        )
                      }
                      onReplace={(replacement) =>
                        onChange(
                          items.map((entry) =>
                            entry.assetId === item.assetId
                              ? { ...replacement, role: entry.role }
                              : entry,
                          ),
                        )
                      }
                      onRemove={() =>
                        onChange(items.filter((entry) => entry.assetId !== item.assetId))
                      }
                    />
                  ))}
                  {inSlot.length === 0 && (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="flex size-20 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-input"
                      aria-label={`Add ${slotLabel(slot)}`}
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {unused.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                {slots.length
                  ? `Not used by ${model?.display_name}`
                  : `${model?.display_name ?? "This model"} works from text only`}
              </span>
              <div className="flex flex-wrap gap-2 opacity-70">
                {unused.map((item) => (
                  <ReferenceTile
                    key={item.assetId}
                    item={item}
                    model={model}
                    projectId={projectId}
                    canMoveUp={false}
                    canMoveDown={false}
                    onMove={() => undefined}
                    onRole={(role) =>
                      update(
                        items.map((entry) =>
                          entry.assetId === item.assetId ? { ...entry, role } : entry,
                        ),
                      )
                    }
                    onReplace={(replacement) =>
                      onChange(
                        items.map((entry) =>
                          entry.assetId === item.assetId
                            ? { ...replacement, role: entry.role }
                            : entry,
                        ),
                      )
                    }
                    onRemove={() =>
                      onChange(items.filter((entry) => entry.assetId !== item.assetId))
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-raised/50 px-2 py-1.5">
          <Wand2 className="size-3.5 text-primary" />
          <span className="text-[11px] text-muted-foreground">Use your references with</span>
          {suggestions.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onSwitchModel(candidate)}
              className="rounded-full border border-border px-2.5 py-0.5 text-[11px] transition-colors hover:border-primary/60 hover:text-foreground"
            >
              {candidate.display_name}
              {candidate.output_type !== model?.output_type ? ` (${candidate.output_type})` : ""}
            </button>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={[ACCEPT_ATTRIBUTE.image, ACCEPT_ATTRIBUTE.video, ACCEPT_ATTRIBUTE.audio].join(",")}
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </div>
  );
}

function describeSlots(model: ModelRegistryEntry | null): string {
  const slots = slotsFor(model);
  return slots
    .map((slot) => `${slotLabel(slot).toLowerCase()}${slot.required ? " (required)" : ""}`)
    .join(", ");
}

function ReferenceTile({
  item,
  model,
  projectId,
  canMoveUp,
  canMoveDown,
  onMove,
  onRole,
  onReplace,
  onRemove,
}: {
  item: ReferenceItem;
  model: ModelRegistryEntry | null;
  projectId: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: number) => void;
  onRole: (role: string) => void;
  onReplace: (item: ReferenceItem) => void;
  onRemove: () => void;
}) {
  const roles = rolesForType(model, item.assetType);
  const hint = conversionHint(item.assetType, item.mimeType);
  return (
    <div className="w-20 space-y-1">
      <div className="group relative size-20 overflow-hidden rounded-md border border-border bg-background">
        <MediaPreview
          bucket={item.bucket}
          path={item.path}
          type={item.assetType}
          contain
          alt={item.title ?? "Reference"}
        />
        <button
          type="button"
          aria-label="Remove reference"
          onClick={onRemove}
          className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        >
          <X className="size-3" />
        </button>
        {(canMoveUp || canMoveDown) && (
          <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {canMoveUp && (
              <button
                type="button"
                aria-label="Move earlier"
                onClick={() => onMove(-1)}
                className="rounded bg-background/90 p-0.5"
              >
                <ArrowUp className="size-3" />
              </button>
            )}
            {canMoveDown && (
              <button
                type="button"
                aria-label="Move later"
                onClick={() => onMove(1)}
                className="rounded bg-background/90 p-0.5"
              >
                <ArrowDown className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
      {roles.length > 1 && (
        <Select
          value={roles.some((slot) => slot.role === item.role) ? item.role : ""}
          onValueChange={onRole}
        >
          <SelectTrigger className="h-6 px-1.5 text-[10px]" aria-label="Reference role">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((slot) => (
              <SelectItem key={slot.role} value={slot.role} className="text-xs">
                {slotLabel(slot)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {hint && (
        <ConvertButton item={item} hint={hint} projectId={projectId} onReplace={onReplace} />
      )}
    </div>
  );
}

/** MOV/WebM clips can be converted to MP4 by the media service before generating. */
function ConvertButton({
  item,
  hint,
  projectId,
  onReplace,
}: {
  item: ReferenceItem;
  hint: string;
  projectId: string | null;
  onReplace: (item: ReferenceItem) => void;
}) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const { data: worker } = useQuery({
    queryKey: ["media-worker-status"],
    queryFn: () => getMediaWorkerStatus(),
    staleTime: 60_000,
    enabled: item.assetType === "video",
  });

  useQuery({
    queryKey: ["media-tasks", item.assetId, taskId],
    enabled: !!taskId,
    refetchInterval: 4000,
    queryFn: async () => {
      const tasks = await listMediaTasks({ data: { sourceAssetId: item.assetId } });
      const task = tasks.find((entry) => entry.id === taskId);
      if (task?.status === "failed") {
        toast.error(task.error_message ?? "The conversion failed.");
        setTaskId(null);
      }
      if (task?.status === "completed" && task.result_asset_id) {
        const { data: asset } = await supabase
          .from("assets")
          .select("id,asset_type,storage_bucket,storage_path,title,mime_type")
          .eq("id", task.result_asset_id)
          .maybeSingle();
        if (asset) {
          onReplace({
            assetId: asset.id,
            role: item.role,
            assetType: asset.asset_type as ReferenceItem["assetType"],
            bucket: asset.storage_bucket,
            path: asset.storage_path,
            title: item.title ? `${item.title} (MP4)` : asset.title,
            mimeType: asset.mime_type,
          });
          toast.success("Converted to MP4.");
        }
        setTaskId(null);
      }
      return task ?? null;
    },
  });

  const convertible = item.assetType === "video" && worker?.configured && worker.reachable;
  async function convert() {
    try {
      const result = await submitMediaTask({
        data: {
          taskType: "transcode_video",
          sourceAssetIds: [item.assetId],
          params: { format: "mp4" },
          projectId,
          clientRequestId: crypto.randomUUID(),
        },
      });
      setTaskId(result.taskId);
      toast.info("Converting to MP4…");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The conversion could not start.");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {convertible ? (
          <button
            type="button"
            disabled={!!taskId}
            onClick={() => void convert()}
            className="flex w-full items-center justify-center gap-1 rounded border border-warning/50 px-1 py-0.5 text-[10px] text-warning"
          >
            {taskId ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}{" "}
            {taskId ? "Converting" : "To MP4"}
          </button>
        ) : (
          <span className="block truncate rounded border border-warning/50 px-1 py-0.5 text-center text-[10px] text-warning">
            {item.assetType === "audio"
              ? "Needs WAV"
              : item.assetType === "video"
                ? "Needs MP4"
                : "Unsupported"}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-56">{hint}</TooltipContent>
    </Tooltip>
  );
}
