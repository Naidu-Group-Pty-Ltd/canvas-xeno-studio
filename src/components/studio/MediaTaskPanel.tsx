import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Scissors, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { AssetRow } from "@/hooks/useStudioData";
import { getMediaWorkerStatus, listMediaTasks, submitMediaTask } from "@/lib/media.functions";
import { mediaTasksFor, type MediaKind } from "@/lib/media/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REFRAME_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  "9:16": { width: 1080, height: 1920, label: "9:16 vertical" },
  "1:1": { width: 1080, height: 1080, label: "1:1 square" },
  "16:9": { width: 1920, height: 1080, label: "16:9 landscape" },
  "4:5": { width: 1080, height: 1350, label: "4:5 portrait" },
};

/**
 * Rendering tasks for a single asset. When the media service is not deployed
 * this states so plainly rather than offering controls that cannot work.
 */
export function MediaTaskPanel({ asset }: { asset: AssetRow }) {
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const [taskType, setTaskType] = useState<string>("");
  const [params, setParams] = useState<Record<string, string>>({});

  const { data: status, isLoading } = useQuery({
    queryKey: ["media-worker-status"],
    queryFn: () => getMediaWorkerStatus(),
    staleTime: 60_000,
  });

  const available = useMemo(() => mediaTasksFor(asset.asset_type as MediaKind), [asset.asset_type]);
  const selected = available.find((task) => task.type === taskType) ?? available[0];

  const { data: tasks = [] } = useQuery({
    queryKey: ["media-tasks", asset.id],
    queryFn: () => listMediaTasks({ data: { sourceAssetId: asset.id } }),
    enabled: Boolean(status?.configured),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((task) => task.status === "processing" || task.status === "submitting") ? 4000 : false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a task first");
      return submitMediaTask({
        data: {
          taskType: selected.type,
          sourceAssetIds: [asset.id],
          params: buildParams(selected.type, params),
          projectId: asset.project_id,
          clientRequestId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: async () => {
      toast.success("Rendering started — the result appears in your library when it finishes.");
      await queryClient.invalidateQueries({ queryKey: ["media-tasks", asset.id] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "The media task could not be started");
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  if (isLoading) {
    return <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">Checking the media service…</div>;
  }

  if (!status?.configured) {
    return (
      <div className="rounded-md border border-border p-3">
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Rendering tasks</h4>
        <p className="mt-2 text-xs text-muted-foreground">
          Not configured. Thumbnails, frame extraction, trimming, reframing and assembly become available once the media
          service is deployed and its address and shared secret are set.
        </p>
      </div>
    );
  }

  if (!available.length) return null;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Rendering tasks</h4>
        {!status.reachable && <span className="text-[11px] text-destructive">Service unreachable</span>}
      </div>

      <Select value={selected?.type ?? ""} onValueChange={setTaskType}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Choose a task" />
        </SelectTrigger>
        <SelectContent>
          {available.map((task) => (
            <SelectItem key={task.type} value={task.type}>
              {task.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && <p className="text-[11px] text-muted-foreground">{selected.description}</p>}

      <TaskFields type={selected?.type} params={params} onChange={setParams} />

      <Button
        size="sm"
        disabled={!status.reachable || mutation.isPending}
        onClick={() => {
          if (submitting.current) return;
          submitting.current = true;
          mutation.mutate();
        }}
      >
        {mutation.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Wand2 className="mr-1.5 size-3.5" />}
        Render
      </Button>

      {tasks.length > 0 && (
        <ul className="space-y-1 text-[11px] text-muted-foreground">
          {tasks.slice(0, 5).map((task) => (
            <li key={task.id} className="flex items-center gap-2">
              <Scissors className="size-3" />
              <span className="text-foreground">{task.task_type.replace(/_/g, " ")}</span>
              <span>· {task.status}</span>
              {task.error_message && <span className="text-destructive">· {task.error_message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskFields({
  type,
  params,
  onChange,
}: {
  type: string | undefined;
  params: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const set = (key: string, value: string) => onChange({ ...params, [key]: value });

  if (type === "create_thumbnail") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width (px)" value={params["width"] ?? "640"} onChange={(value) => set("width", value)} />
        <Field label="At second" value={params["time_seconds"] ?? "0"} onChange={(value) => set("time_seconds", value)} />
      </div>
    );
  }
  if (type === "extract_frames") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Frames" value={params["count"] ?? "4"} onChange={(value) => set("count", value)} />
        <Field
          label="Clip length (s)"
          value={params["duration_seconds"] ?? "4"}
          onChange={(value) => set("duration_seconds", value)}
        />
      </div>
    );
  }
  if (type === "trim_video") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="From (s)" value={params["start_seconds"] ?? "0"} onChange={(value) => set("start_seconds", value)} />
        <Field label="To (s)" value={params["end_seconds"] ?? "3"} onChange={(value) => set("end_seconds", value)} />
      </div>
    );
  }
  if (type === "reframe_video") {
    return (
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">Aspect ratio</Label>
        <Select value={params["preset"] ?? "9:16"} onValueChange={(value) => set("preset", value)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(REFRAME_PRESETS).map(([key, preset]) => (
              <SelectItem key={key} value={key}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="text-[11px] text-muted-foreground">Fit</Label>
        <Select value={params["mode"] ?? "cover"} onValueChange={(value) => set("mode", value)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Fill the frame (crops edges)</SelectItem>
            <SelectItem value="contain">Fit whole frame (black bars)</SelectItem>
            <SelectItem value="blur_pad">Fit whole frame (blurred backdrop)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (type === "resize_image") {
    return <Field label="Width (px)" value={params["width"] ?? "1024"} onChange={(value) => set("width", value)} />;
  }
  return null;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input className="h-9" value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function buildParams(type: string, raw: Record<string, string>): Record<string, unknown> {
  const numeric = (key: string, fallback?: number) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : fallback;
  };

  if (type === "create_thumbnail") return { width: numeric("width", 640), time_seconds: numeric("time_seconds", 0) };
  if (type === "extract_frames") return { count: numeric("count", 4), duration_seconds: numeric("duration_seconds", 4) };
  if (type === "trim_video") return { start_seconds: numeric("start_seconds", 0), end_seconds: numeric("end_seconds", 3) };
  if (type === "reframe_video") {
    const preset = REFRAME_PRESETS[raw["preset"] ?? "9:16"] ?? REFRAME_PRESETS["9:16"]!;
    return { width: preset.width, height: preset.height, mode: raw["mode"] ?? "cover" };
  }
  if (type === "resize_image") return { width: numeric("width", 1024) };
  return {};
}
