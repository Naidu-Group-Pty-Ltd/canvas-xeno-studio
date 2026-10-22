import { Input } from "@/components/ui/input";
import { emphasisRange } from "@/lib/edit/brand-captions";
import { LIMITS, type CaptionSegment } from "@/lib/edit/timeline";

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
