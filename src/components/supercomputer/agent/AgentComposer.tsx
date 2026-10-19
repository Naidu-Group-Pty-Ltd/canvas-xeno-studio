import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Coins,
  Cpu,
  FileText,
  Images,
  Loader2,
  Palette,
  Paperclip,
  Pencil,
  Square,
  Upload,
  X,
} from "lucide-react";
import { useBrandKits } from "@/hooks/useBrandKits";
import {
  AGENT_EFFORT_LABELS,
  AGENT_EFFORTS,
  AGENT_MODELS,
  agentModelLabel,
  type AgentThreadSettings,
} from "@/lib/supercomputer/agent-settings";
import type { MessageAttachment } from "@/lib/supercomputer/types";
import { ACCEPT_ATTRIBUTE } from "@/lib/storage";
import { BRIEF_ACCEPT } from "@/lib/briefs/parse-document";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Slash commands: a head start for the things people ask for most. */
export const AGENT_COMMANDS = [
  {
    name: "make",
    hint: "Make it now: generate, check the result, refine",
    text: "Make this, look at the result and refine it until it's right: ",
  },
  {
    name: "brainstorm",
    hint: "Genuinely different concepts to choose from",
    text: "Brainstorm five genuinely different concepts for ",
  },
  {
    name: "drafts",
    hint: "Ready-to-run drafts to look over",
    text: "Propose ready-to-run drafts for ",
  },
  {
    name: "film",
    hint: "A short film, shot by shot",
    text: "Plan a 30-second film shot by shot, with a ready-to-run draft for each shot, for ",
  },
  {
    name: "research",
    hint: "Search the web first",
    text: "Research this on the web, then tell me what matters for our work: ",
  },
  {
    name: "critique",
    hint: "Look at work and say what to fix",
    text: "Look at the attached work and critique it against the brief and the brand: ",
  },
  {
    name: "script",
    hint: "A voiceover script as a document",
    text: "Write a voiceover script as a document for ",
  },
  {
    name: "brand",
    hint: "Read a brand's design system from its site",
    text: "Read the brand's design system from this website: ",
  },
  {
    name: "remember",
    hint: "Keep something for later conversations",
    text: "Remember this for later: ",
  },
] as const;

const SPEND_STEPS = [0, 0.5, 1, 2, 5, 10];

interface Props {
  value: string;
  onChange: (value: string) => void;
  attachments: MessageAttachment[];
  onRemoveAttachment: (assetId: string) => void;
  uploading: number;
  settings: AgentThreadSettings;
  onSettings: (patch: Partial<AgentThreadSettings>) => void;
  /** A turn is streaming: the button stops it. */
  busy: boolean;
  disabledReason: string | null;
  /** Editing an earlier message (null: a new one). */
  editing: boolean;
  onCancelEdit: () => void;
  onSend: () => void;
  onStop: () => void;
  onFiles: (files: File[]) => void;
  onOpenLibrary: () => void;
  onImportBrief: () => void;
}

/** Where the agent's messages are written: words, attachments, and how it should work. */
export function AgentComposer({
  value,
  onChange,
  attachments,
  onRemoveAttachment,
  uploading,
  settings,
  onSettings,
  busy,
  disabledReason,
  editing,
  onCancelEdit,
  onSend,
  onStop,
  onFiles,
  onOpenLibrary,
  onImportBrief,
}: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);
  const { data: brandData } = useBrandKits();
  const kits = brandData?.kits ?? [];
  const brand = kits.find((kit) => kit.id === settings.brandKitId) ?? null;
  const canSend =
    !busy &&
    !disabledReason &&
    uploading === 0 &&
    (value.trim().length > 0 || attachments.length > 0);

  // A slash command being typed: the matching commands.
  const commands = useMemo(() => {
    const match = /^\/(\w*)$/.exec(value);
    if (!match) return [];
    return AGENT_COMMANDS.filter((command) => command.name.startsWith(match[1]!.toLowerCase()));
  }, [value]);
  useEffect(() => setSelected(0), [commands.length]);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 280)}px`;
  }, [value]);

  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  const pick = (index: number) => {
    const command = commands[index];
    if (!command) return;
    onChange(command.text);
    requestAnimationFrame(() => {
      const element = textRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(command.text.length, command.text.length);
    });
  };

  return (
    <div className="relative rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:border-input">
      {commands.length > 0 && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
          {commands.map((command, index) => (
            <button
              key={command.name}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                pick(index);
              }}
              className={cn(
                "flex w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left text-xs",
                index === selected ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <span className="font-mono font-medium">/{command.name}</span>
              <span className="truncate text-muted-foreground">{command.hint}</span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <div className="mb-1 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs">
          <Pencil className="size-3.5 text-primary" />
          <span className="flex-1">Editing your message: the conversation picks up from here.</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={onCancelEdit}
          >
            Cancel
          </button>
        </div>
      )}

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
          if (commands.length) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setSelected(
                (current) =>
                  (current + (event.key === "ArrowDown" ? 1 : -1) + commands.length) %
                  commands.length,
              );
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              pick(selected);
              return;
            }
          }
          if (event.key === "Escape" && busy) {
            onStop();
            return;
          }
          if (event.key === "Escape" && editing) {
            onCancelEdit();
            return;
          }
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
        placeholder="Ask anything, or say what to make. It can research, look at your library, generate, check and refine. Type / for shortcuts."
        className="min-h-[52px] resize-none border-0 bg-transparent px-2 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        data-testid="agent-composer"
      />

      <div className="flex flex-wrap items-center gap-1 px-1 pt-1">
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

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2 text-xs text-muted-foreground"
              data-testid="agent-model"
            >
              <Cpu className="size-3.5" />
              {agentModelLabel(settings.model).replace("Claude ", "")}
              <span className="hidden sm:inline">· {AGENT_EFFORT_LABELS[settings.effort]}</span>
              <ChevronDown className="size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3 p-2">
            <div className="space-y-0.5">
              {AGENT_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onSettings({ model: model.id })}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted",
                    settings.model === model.id && "bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{model.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{model.note}</span>
                  </span>
                  {settings.model === model.id && (
                    <Check className="mt-0.5 size-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
            <div className="space-y-1.5 px-1">
              <p className="text-[11px] text-muted-foreground">How hard it thinks</p>
              <div className="grid grid-cols-5 gap-1">
                {AGENT_EFFORTS.map((effort) => (
                  <button
                    key={effort}
                    type="button"
                    onClick={() => onSettings({ effort })}
                    className={cn(
                      "rounded-md border px-1 py-1 text-[10.5px]",
                      settings.effort === effort
                        ? "border-primary/60 bg-primary/10"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {AGENT_EFFORT_LABELS[effort]}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {brandData?.supported !== false && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2 text-xs text-muted-foreground"
              >
                {brand ? (
                  <span className="flex h-3 w-7 overflow-hidden rounded-sm border border-border">
                    {(brand.palette.length
                      ? brand.palette.map((colour) => colour.hex)
                      : [brand.backgroundColor, brand.accentColor]
                    )
                      .slice(0, 5)
                      .map((hex) => (
                        <span key={hex} className="flex-1" style={{ background: hex }} />
                      ))}
                  </span>
                ) : (
                  <Palette className="size-3.5" />
                )}
                <span className="max-w-28 truncate">{brand ? brand.name : "Brand"}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 space-y-0.5 p-1.5">
              <p className="px-2 py-1 text-[11px] text-muted-foreground">
                The brand this conversation works in: its look goes into everything it makes.
              </p>
              <button
                type="button"
                onClick={() => onSettings({ brandKitId: null })}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                  !brand && "bg-muted",
                )}
              >
                No brand
              </button>
              {kits.map((kit) => (
                <button
                  key={kit.id}
                  type="button"
                  onClick={() => onSettings({ brandKitId: kit.id })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                    kit.id === settings.brandKitId && "bg-muted",
                  )}
                >
                  <span className="flex h-3 w-8 overflow-hidden rounded-sm border border-border">
                    {(kit.palette.length
                      ? kit.palette.map((colour) => colour.hex)
                      : [kit.backgroundColor, kit.accentColor]
                    )
                      .slice(0, 5)
                      .map((hex) => (
                        <span key={hex} className="flex-1" style={{ background: hex }} />
                      ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{kit.name}</span>
                  {kit.id === settings.brandKitId && <Check className="size-3.5 text-primary" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2 text-xs text-muted-foreground"
            >
              <Coins className="size-3.5" />
              {settings.autoApproveUsd > 0 ? `Up to $${settings.autoApproveUsd}` : "Asks first"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-1 p-2">
            <p className="px-1 pb-1 text-[11px] text-muted-foreground">
              Before it spends Higgsfield credits it shows you what and how much. Let it go ahead on
              its own for small actions:
            </p>
            {SPEND_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => onSettings({ autoApproveUsd: step })}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                  settings.autoApproveUsd === step && "bg-muted",
                )}
              >
                {step === 0 ? "Always ask" : `Without asking, up to $${step} an action`}
                {settings.autoApproveUsd === step && <Check className="size-3.5 text-primary" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          {disabledReason && (
            <span className="hidden text-[11px] text-muted-foreground md:inline">
              {disabledReason}
            </span>
          )}
          {busy ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-8 rounded-full"
              onClick={onStop}
              aria-label="Stop"
              data-testid="agent-stop"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="size-8 rounded-full"
              disabled={!canSend}
              onClick={onSend}
              aria-label="Send"
              data-testid="agent-send"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
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
