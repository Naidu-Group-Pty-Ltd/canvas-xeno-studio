import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileJson, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useStudioData";
import {
  planFromBrief,
  readBriefText,
  saveStoryboardPlan,
  type BriefReading,
} from "@/lib/storyboard/brief";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (storyboardId: string) => void;
}

/**
 * A storyboard from a brief written as data (brief.json's shape): its
 * blocks become scenes and its shots shots, each keeping all it says. It is
 * read and checked in the browser before anything is saved.
 */
export function ImportStoryboardBrief({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState<BriefReading | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSource("");
    setFileName(null);
    setReading(null);
    setProject(null);
  }, [open]);

  function check(text: string) {
    setSource(text);
    setReading(text.trim() ? readBriefText(text) : null);
  }

  async function readFile(file: File) {
    setFileName(file.name);
    check(await file.text());
  }

  const plan = reading?.ok ? planFromBrief(reading.brief) : null;

  async function save() {
    if (!user || !plan) return;
    setSaving(true);
    try {
      const id = await saveStoryboardPlan(supabase, plan, { userId: user.id, projectId: project });
      await queryClient.invalidateQueries({ queryKey: ["storyboards"] });
      toast.success(
        `Storyboard made: ${plan.scenes.length} scene${plan.scenes.length === 1 ? "" : "s"}, ${plan.shotCount} shot${plan.shotCount === 1 ? "" : "s"}.`,
      );
      onImported(id);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `The storyboard couldn't be saved: ${error.message}`
          : "The storyboard couldn't be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Import a brief as a storyboard</DialogTitle>
          <DialogDescription>
            A brief written as data, like Reel 1&apos;s brief.json: shots with their beats, sources,
            on-screen text and voiceover lines. Each block becomes a scene and each shot a shot,
            keeping everything the brief says about it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 scroll-slim">
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
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
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) void readFile(dropped);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-left transition-colors",
              dragging ? "border-primary bg-primary/10" : "border-border hover:border-input",
            )}
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised">
              {fileName ? (
                <FileJson className="size-4 text-primary" />
              ) : (
                <Upload className="size-4 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block truncate font-medium">
                {fileName ?? "Drop brief.json here, or browse"}
              </span>
              <span className="text-xs text-muted-foreground">Or paste its JSON below.</span>
            </span>
          </button>

          <Textarea
            aria-label="The brief's JSON"
            rows={6}
            value={source}
            placeholder='{"title": "…", "shots": [{"id": "01.1", "block": "01", "beats": […], …}]}'
            className="font-mono text-xs"
            onChange={(event) => {
              setFileName(null);
              check(event.target.value);
            }}
          />

          {reading && !reading.ok && (
            <ul
              className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
              data-testid="brief-problems"
            >
              {reading.problems.map((problem) => (
                <li key={problem} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {problem}
                </li>
              ))}
            </ul>
          )}

          {reading?.ok && plan && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-surface-raised/40 p-3 text-xs text-muted-foreground">
                <p className="text-sm font-medium text-foreground">{plan.storyboard.title}</p>
                <p>
                  {plan.scenes.length} scene{plan.scenes.length === 1 ? "" : "s"} · {plan.shotCount}{" "}
                  shot{plan.shotCount === 1 ? "" : "s"} · {plan.seconds.toFixed(2)} s
                  {plan.storyboard.primary_aspect_ratio
                    ? ` · ${plan.storyboard.primary_aspect_ratio}`
                    : ""}
                </p>
              </div>
              {!!reading.warnings.length && (
                <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  {reading.warnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {warning}
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={project ?? "none"}
                  onValueChange={(value) => setProject(value === "none" ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!plan || saving}>
            {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Make the storyboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
