import { useMemo, useState } from "react";
import { Check, Paperclip, Search } from "lucide-react";
import type { InputMediaType, ModelRegistryEntry } from "@/lib/model-schema";
import { inputCapabilityLabels, modelFitsReferences, slotsFor } from "@/lib/references";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const OPERATION_LABELS: Record<string, string> = {
  "text-to-image": "Text to image",
  "image-to-image": "Image to image",
  "text-to-video": "Text to video",
  "image-to-video": "Image to video",
  "reference-to-video": "Reference to video",
  "video-to-video": "Video to video",
  "video-extend": "Video extend",
  "video-edit": "Video edit",
  "image-edit": "Image edit",
  "motion-transfer": "Motion transfer",
  "object-swap": "Object swap",
  "motion-control": "Motion control",
  "cinematic-video": "Cinematic video",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: ModelRegistryEntry[];
  mediaType: "image" | "video";
  selectedId?: string;
  onSelect: (model: ModelRegistryEntry) => void;
  /** Media types currently attached in Create, to highlight models that can use them. */
  referenceTypes?: InputMediaType[];
}

export function ModelBrowser({ open, onOpenChange, models, mediaType, selectedId, onSelect, referenceTypes = [] }: Props) {
  const [term, setTerm] = useState("");
  const [operation, setOperation] = useState<string | null>(null);
  const [withReferences, setWithReferences] = useState(false);
  const typesKey = referenceTypes.join(",");

  const operations = useMemo(
    () => Array.from(new Set(models.filter((m) => m.output_type === mediaType).map((m) => m.operation))),
    [models, mediaType],
  );

  const families = useMemo(() => {
    const filtered = models.filter((model) => {
      if (model.output_type !== mediaType) return false;
      if (operation && model.operation !== operation) return false;
      if (withReferences) {
        if (referenceTypes.length ? !modelFitsReferences(model, referenceTypes) : !slotsFor(model).length) return false;
      }
      if (!term.trim()) return true;
      const haystack = `${model.display_name} ${model.family} ${model.recommended_for ?? ""} ${model.model_path}`;
      return haystack.toLowerCase().includes(term.trim().toLowerCase());
    });
    const grouped = new Map<string, ModelRegistryEntry[]>();
    for (const model of filtered) {
      grouped.set(model.family, [...(grouped.get(model.family) ?? []), model]);
    }
    return [...grouped.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, mediaType, operation, term, withReferences, typesKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Choose a model</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search models"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={operation === null} onClick={() => setOperation(null)}>
              All operations
            </FilterChip>
            {operations.map((op) => (
              <FilterChip key={op} active={operation === op} onClick={() => setOperation(op)}>
                {OPERATION_LABELS[op] ?? op}
              </FilterChip>
            ))}
            <FilterChip active={withReferences} onClick={() => setWithReferences((value) => !value)}>
              <Paperclip className="mr-1 inline size-3" />
              {referenceTypes.length ? "Fits my references" : "Takes references"}
            </FilterChip>
          </div>
        </div>
        <div className="max-h-[52vh] space-y-6 overflow-y-auto px-6 pb-6 scroll-slim">
          {families.length === 0 && <p className="text-sm text-muted-foreground">No models match those filters.</p>}
          {families.map(([family, entries]) => (
            <section key={family} className="space-y-2">
              <h3 className="label-eyebrow">{family}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {entries.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onSelect(model);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "group rounded-lg border p-3 text-left transition-colors",
                      selectedId === model.id
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:border-input hover:bg-surface-raised/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{model.display_name}</span>
                      {selectedId === model.id && <Check className="size-4 text-primary" />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {model.recommended_for ?? model.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {referenceTypes.length > 0 && modelFitsReferences(model, referenceTypes) && (
                        <Badge className="text-[10px]">Uses your references</Badge>
                      )}
                      {inputCapabilityLabels(model).map((label) => (
                        <Badge key={label} variant="secondary" className="text-[10px]">
                          {label}
                        </Badge>
                      ))}
                      <Badge variant="outline" className="text-[10px]">
                        {model.provider}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {model.output_type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {OPERATION_LABELS[model.operation] ?? model.operation}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
