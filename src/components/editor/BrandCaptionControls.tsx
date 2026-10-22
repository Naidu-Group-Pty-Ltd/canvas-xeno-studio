import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emphasisRange } from "@/lib/edit/brand-captions";
import {
  CAPTION_PANEL_LABELS,
  CAPTION_PANELS,
  LIMITS,
  type CaptionPanel,
  type CaptionSegment,
  type Captions,
} from "@/lib/edit/timeline";

/**
 * The phrase a brand caption line leans on: words of its text, set in the
 * brand's italic and accent with a hairline under them. Made from the
 * voiceover, a line has one already; cleared, the line has none.
 */
export function CaptionEmphasisField({
  segment,
  index,
  onChange,
}: {
  segment: CaptionSegment;
  index: number;
  onChange: (emphasis: string | null) => void;
}) {
  const emphasis = segment.emphasis ?? "";
  const found = !emphasis.trim() || !!emphasisRange(segment.text.split(/\s+/), emphasis);
  return (
    <div className="mt-1">
      <Input
        value={emphasis}
        maxLength={LIMITS.captionChars}
        className="h-7 text-xs italic"
        placeholder="Phrase to lean on (words of the caption)"
        aria-label={`Caption ${index + 1} emphasis`}
        onChange={(event) => onChange(event.target.value || null)}
      />
      {!found && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          These words aren&apos;t in the caption, so nothing is emphasised. Use words exactly as the
          caption has them.
        </p>
      )}
    </div>
  );
}

const OWN = "own";

/**
 * What is behind the captions: the style's own, or a panel that follows the
 * picture (measured behind each caption as the video renders), a light
 * card, the glass, a solid panel in the brand's colour, or none.
 */
export function CaptionPanelField({
  captions,
  onChange,
}: {
  captions: Captions;
  onChange: (patch: Partial<Captions>, key?: string) => void;
}) {
  const brand = captions.style === "brand";
  const panel = captions.panel;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Behind the words</Label>
      <Select
        value={panel ?? OWN}
        onValueChange={(value) =>
          onChange({ panel: value === OWN ? null : (value as CaptionPanel) })
        }
      >
        <SelectTrigger className="h-8" aria-label="Behind the captions">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={OWN}>
            {brand ? "The style's own (follows the picture)" : "The style's own"}
          </SelectItem>
          {CAPTION_PANELS.map((option) => (
            <SelectItem key={option} value={option}>
              {CAPTION_PANEL_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(panel === "auto" || (brand && !panel)) && (
        <p className="text-[11px] text-muted-foreground">
          The render measures the picture behind each caption: a light card over light shots, the
          glass over dark ones, nearer opaque the lighter they are. The preview shows the glass.
        </p>
      )}
      {panel === "dark" && (
        <p className="text-[11px] text-muted-foreground">
          The render makes the glass nearer opaque over lighter shots, so it never reads as a grey
          slab.
        </p>
      )}
      {panel === "solid" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={captions.panelColor ?? captions.accent ?? "#0b1020"}
            onChange={(event) =>
              onChange({ panelColor: event.target.value.toLowerCase() }, "caption-panel-colour")
            }
            aria-label="The panel's colour"
            className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
          />
          <span className="text-[11px] text-muted-foreground">
            {captions.panelColor ? "The panel's colour" : "The brand's accent until one is chosen"}
          </span>
        </div>
      )}
    </div>
  );
}
