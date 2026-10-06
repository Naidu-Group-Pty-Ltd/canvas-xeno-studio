import { useEffect, useRef } from "react";
import { ArrowUp, FileText, Images, Loader2, Paperclip, Upload, X } from "lucide-react";
import type { MessageAttachment, SupercomputerIntent } from "@/lib/supercomputer/types";
import { ACCEPT_ATTRIBUTE } from "@/lib/storage";
import { BRIEF_ACCEPT } from "@/lib/briefs/parse-document";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const INTENTS: { id: SupercomputerIntent; label: string; hint: string }[] = [
  { id: "chat", label: "Chat", hint: "Talk it through; ideas or drafts when useful" },
  { id: "brainstorm", label: "Brainstorm", hint: "Distinct concepts to choose from" },
  { id: "drafts", label: "Drafts", hint: "Ready-to-run prompts and settings" },
  {
    id: "deliverables",
    label: "Brief deliverables",
    hint: "One draft per deliverable in the brief",
  },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  attachments: MessageAttachment[];
  onRemoveAttachment: (assetId: string) => void;
  uploading: number;
  intent: SupercomputerIntent;
  onIntentChange: (intent: SupercomputerIntent) => void;
  hasBrief: boolean;
  busy: boolean;
  disabledReason: string | null;
  onSend: () => void;
  onFiles: (files: File[]) => void;
  onOpenLibrary: () => void;
  onImportBrief: () => void;
}

export function Composer({
  value,
  onChange,
  attachments,
  onRemoveAttachment,
  uploading,
  intent,
  onIntentChange,
  hasBrief,
  busy,
  disabledReason,
  onSend,
  onFiles,
  onOpenLibrary,
  onImportBrief,
}: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = !busy && !disabledReason && uploading === 0 && value.trim().length > 0;

  // Grow with the text, up to a comfortable height.
  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 260)}px`;
  }, [value]);

  useEffect(() => {
    if (!hasBrief && intent === "deliverables") onIntentChange("chat");
  }, [hasBrief, intent, onIntentChange]);

  return (
    <div className="rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:border-input">
      {(attachments.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2 px-2 pt-2 pb-1">
          {attachments.map((item) => (
            <div
              key={item.assetId}
              className="group relative size-16 overflow-hidden rounded-lg border border-border bg-background"
              title={item.title ?? undefined}
            >
              <MediaPreview bucket={item.bucket} path={item.path} type={item.type} contain />
              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => onRemoveAttachment(item.assetId)}
                className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X className="size-3" />
              </button>
              {item.type !== "image" && (
                <span className="absolute bottom-1 left-1 rounded-full bg-background/85 px-1.5 text-[9px] capitalize">
                  {item.type}
                </span>
              )}
            </div>
          ))}
          {uploading > 0 && (
            <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      <Textarea
        ref={textRef}
        value={value}
        rows={2}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files ?? []);
          if (files.length) {
            event.preventDefault();
            onFiles(files);
          }
        }}
        placeholder={
          hasBrief
            ? "Ask about the brief, brainstorm concepts, or say what to make…"
            : "Describe what you want to make — a campaign, a product shot, a short film… Attach references or a brief."
        }
        className="min-h-[52px] resize-none border-0 bg-transparent px-2 text-sm leading-relaxed shadow-none focus-visible:ring-0"
      />

      <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground"
              aria-label="Attach"
            >
              <Paperclip className="size-4" />
              <span className="ml-1 hidden sm:inline">Attach</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 size-4" /> Upload images, video or audio
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenLibrary}>
              <Images className="mr-2 size-4" /> From the library or a brief
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportBrief}>
              <FileText className="mr-2 size-4" /> Import a brief (PDF, Word, PowerPoint)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className="flex flex-wrap gap-1"
          role="radiogroup"
          aria-label="What should Supercomputer do?"
        >
          {INTENTS.filter((entry) => entry.id !== "deliverables" || hasBrief).map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={intent === entry.id}
              title={entry.hint}
              onClick={() => onIntentChange(entry.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                intent === entry.id
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {disabledReason && (
            <span className="hidden text-[11px] text-muted-foreground md:inline">
              {disabledReason}
            </span>
          )}
          <Button
            type="button"
            size="icon"
            className="size-8 rounded-full"
            disabled={!canSend}
            onClick={onSend}
            aria-label="Send"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept={[
          ACCEPT_ATTRIBUTE.image,
          ACCEPT_ATTRIBUTE.video,
          ACCEPT_ATTRIBUTE.audio,
          BRIEF_ACCEPT,
        ].join(",")}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </div>
  );
}
