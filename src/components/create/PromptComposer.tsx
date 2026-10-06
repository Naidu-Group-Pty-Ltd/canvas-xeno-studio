import { useEffect } from "react";
import { Eraser } from "lucide-react";
import { savePromptDraft } from "@/lib/create-draft";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PromptAssist, type PromptAssistContext } from "@/components/create/PromptAssist";

interface Props {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  required?: boolean;
  onSubmitShortcut?: () => void;
  /** Pasted files (e.g. screenshots) are handed to the reference tray. */
  onPasteFiles?: (files: File[]) => void;
  assist?: PromptAssistContext;
}

export function PromptComposer({
  value,
  onChange,
  maxLength,
  required,
  onSubmitShortcut,
  onPasteFiles,
  assist,
}: Props) {
  useEffect(() => {
    const timer = setTimeout(() => savePromptDraft(value), 500);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="label-eyebrow">
          Prompt{required && <span className="ml-1 text-primary">*</span>}
        </h3>
        <div className="flex items-center gap-1">
          <span className="mr-1 font-mono text-[11px] text-muted-foreground">
            {value.length}
            {maxLength ? `/${maxLength}` : ""}
          </span>
          {assist && <PromptAssist prompt={value} context={assist} onApply={onChange} />}
          <Button variant="ghost" size="sm" onClick={() => onChange("")} disabled={!value}>
            <Eraser className="mr-1 size-3.5" /> Clear
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmitShortcut?.();
          }
        }}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files ?? []);
          if (files.length && onPasteFiles) {
            event.preventDefault();
            onPasteFiles(files);
          }
        }}
        placeholder="Describe the shot: subject, styling, lighting, camera, mood…"
        rows={7}
        className="resize-none bg-background text-base leading-relaxed"
        {...(maxLength ? { maxLength } : {})}
      />
      <p className="text-[11px] text-muted-foreground">
        Drafts save automatically. Press ⌘/Ctrl + Enter to generate. Paste an image to add it as a
        reference.
      </p>
    </div>
  );
}
