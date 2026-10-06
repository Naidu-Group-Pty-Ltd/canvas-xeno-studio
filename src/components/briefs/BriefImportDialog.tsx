import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckSquare, FileText, Loader2, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useStudioData";
import { useCampaigns } from "@/hooks/useV2Data";
import { BRIEF_ACCEPT, parseBriefDocument, type ParsedBrief } from "@/lib/briefs/parse-document";
import { importBrief } from "@/lib/briefs/import-brief";
import { analyseBrief } from "@/lib/supercomputer.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFile?: File | null;
  projectId?: string | null;
  campaignId?: string | null;
  /** Whether an AI backend is available to analyse the brief after import. */
  aiReady: boolean;
  onImported?: (briefId: string) => void;
}

type Phase = "pick" | "parsing" | "review" | "saving";

export function BriefImportDialog({
  open,
  onOpenChange,
  initialFile = null,
  projectId = null,
  campaignId = null,
  aiReady,
  onImported,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const { data: campaigns = [] } = useCampaigns();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedBrief | null>(null);
  const [progress, setProgress] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [project, setProject] = useState<string | null>(projectId);
  const [campaign, setCampaign] = useState<string | null>(campaignId);
  const [dragging, setDragging] = useState(false);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setFile(null);
    setParsed(null);
    setProject(projectId);
    setCampaign(campaignId);
    setShowText(false);
    if (initialFile) void read(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const previews = useMemo(
    () =>
      new Map((parsed?.images ?? []).map((image) => [image.key, URL.createObjectURL(image.blob)])),
    [parsed],
  );
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  async function read(next: File) {
    setFile(next);
    setPhase("parsing");
    setProgress("Reading the document…");
    try {
      const result = await parseBriefDocument(next, setProgress);
      setParsed(result);
      setTitle(result.title ?? next.name.replace(/\.[^.]+$/, ""));
      setPicked(
        new Set(result.images.filter((image) => image.recommended).map((image) => image.key)),
      );
      setPhase("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The document could not be read.");
      setPhase("pick");
    }
  }

  async function save() {
    if (!user || !file || !parsed) return;
    setPhase("saving");
    try {
      const briefId = await importBrief(file, parsed, {
        userId: user.id,
        title,
        projectId: project,
        campaignId: campaign,
        images: parsed.images.filter((image) => picked.has(image.key)),
        onProgress: setProgress,
      });
      await queryClient.invalidateQueries({ queryKey: ["creative_briefs"] });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      onImported?.(briefId);
      onOpenChange(false);

      if (aiReady) {
        toast.info("Brief imported. Supercomputer is analysing it now.");
        // Runs in the background; the brief panel follows its status live.
        void analyseBrief({ data: { briefId } })
          .then(() => toast.success(`"${title}" is analysed and ready.`))
          .catch((error: unknown) =>
            toast.error(
              error instanceof Error ? error.message : "The brief could not be analysed.",
            ),
          )
          .finally(() => queryClient.invalidateQueries({ queryKey: ["creative_briefs"] }));
      } else {
        toast.success("Brief imported. Add an AI key to have it analysed automatically.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The brief could not be imported.");
      setPhase("review");
    }
  }

  const images = parsed?.images ?? [];
  const words = parsed ? parsed.text.split(/\s+/).filter(Boolean).length : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => phase !== "saving" && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Import a brief</DialogTitle>
          <DialogDescription>
            PDF, Word (.docx), PowerPoint (.pptx) or text. Text and images are extracted in your
            browser; images become reusable references.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scroll-slim">
          {phase === "pick" && (
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
                if (dropped) void read(dropped);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center transition-colors",
                dragging ? "border-primary bg-primary/10" : "border-border hover:border-input",
              )}
            >
              <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-raised">
                <Upload className="size-5 text-muted-foreground" />
              </span>
              <span className="font-medium">Drop your brief here, or browse</span>
              <span className="text-xs text-muted-foreground">
                PDF · DOCX · PPTX · TXT · MD — up to 80 MB
              </span>
            </button>
          )}

          {(phase === "parsing" || phase === "saving") && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <span>{progress}</span>
            </div>
          )}

          {phase === "review" && parsed && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised/40 p-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0 text-xs text-muted-foreground">
                  <p className="truncate text-sm font-medium text-foreground">{file?.name}</p>
                  <p>
                    {parsed.kind.toUpperCase()}
                    {parsed.pageCount
                      ? ` · ${parsed.pageCount} ${parsed.kind === "pptx" ? "slides" : "pages"}`
                      : ""}{" "}
                    · {words.toLocaleString()} words · {images.length} image
                    {images.length === 1 ? "" : "s"} found
                  </p>
                </div>
              </div>

              {!!parsed.warnings.length && (
                <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  {parsed.warnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {warning}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2">
                <Label htmlFor="brief-title">Title</Label>
                <Input
                  id="brief-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="space-y-2">
                  <Label>Campaign</Label>
                  <Select
                    value={campaign ?? "none"}
                    onValueChange={(value) => setCampaign(value === "none" ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No campaign</SelectItem>
                      {campaigns.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="label-eyebrow">Images to keep as references</span>
                  {!!images.length && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setPicked(new Set(images.map((image) => image.key)))}
                      >
                        All
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setPicked(new Set())}
                      >
                        None
                      </Button>
                    </div>
                  )}
                </div>
                {images.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {images.map((image) => {
                      const on = picked.has(image.key);
                      return (
                        <button
                          key={image.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setPicked((current) => {
                              const next = new Set(current);
                              if (next.has(image.key)) next.delete(image.key);
                              else next.add(image.key);
                              return next;
                            })
                          }
                          className={cn(
                            "group relative aspect-square overflow-hidden rounded-lg border bg-surface text-left",
                            on
                              ? "border-primary ring-2 ring-primary/40"
                              : "border-border opacity-70 hover:opacity-100",
                          )}
                        >
                          <img
                            src={previews.get(image.key)}
                            alt={image.caption ?? "Brief image"}
                            className="size-full object-contain"
                          />
                          <span className="absolute top-1.5 left-1.5 text-primary">
                            {on ? (
                              <CheckSquare className="size-4" />
                            ) : (
                              <Square className="size-4 text-muted-foreground" />
                            )}
                          </span>
                          <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {image.source === "page"
                              ? `Page ${image.page} snapshot`
                              : (image.caption ??
                                (image.page ? `Image · page ${image.page}` : "Image"))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No images were found in this document.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  className="label-eyebrow underline-offset-2 hover:underline"
                  onClick={() => setShowText((value) => !value)}
                >
                  {showText ? "Hide extracted text" : "Show extracted text"}
                </button>
                {showText && (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-sans text-xs text-muted-foreground scroll-slim">
                    {parsed.text || "(no text found)"}
                  </pre>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {aiReady
                  ? "After import, Supercomputer reads the brief and pulls out the objective, audience, messaging, brand rules and every deliverable. Nothing is generated or charged."
                  : "AI analysis isn't configured, so the brief is imported as text and images only."}
              </p>
            </div>
          )}
        </div>

        {phase === "review" && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
            <Button variant="ghost" onClick={() => setPhase("pick")}>
              Choose another file
            </Button>
            <Button onClick={() => void save()} disabled={!title.trim()}>
              Import brief
              {picked.size ? ` + ${picked.size} image${picked.size === 1 ? "" : "s"}` : ""}
            </Button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          hidden
          accept={BRIEF_ACCEPT}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) void read(chosen);
            event.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
