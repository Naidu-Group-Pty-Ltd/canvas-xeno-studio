import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { untouchedClip } from "@/lib/edit/master";
import {
  masteringNote,
  qualityLines,
  qualitySummary,
  referenceNote,
  renderQualityOf,
} from "@/lib/edit/quality";
import { cn } from "@/lib/utils";
import {
  EXPORT_QUALITIES,
  EXPORT_QUALITY_LABELS,
  type ExportQuality,
  type Timeline,
} from "@/lib/edit/timeline";

/** What each quality does, and what it costs, in plain words. */
const QUALITY_NOTES: Record<ExportQuality, string> = {
  standard:
    "Quick to render. Each clip is encoded once before the final encode, which softens fine detail a little.",
  master:
    "Lossless clips and one fine encode (x264 slow at CRF 12, BT.709, AAC 256 kb/s): about five times as long to render, and about four times the file size. Clips of a long edit that don't fit on the media service's disk are encoded the standard way first, and the render says which.",
};

/** The edit's export quality (see EXPORT_QUALITIES), and whether its one video can go out as it is. */
export function QualitySetting({
  timeline,
  onChange,
  disabled,
}: {
  timeline: Timeline;
  onChange?: ((timeline: Timeline) => void) | undefined;
  disabled: boolean;
}) {
  const single = untouchedClip(timeline);
  return (
    <div className="space-y-1.5" data-testid="render-quality">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs" htmlFor="render-quality">
          Quality
        </Label>
        <Select
          value={timeline.quality}
          disabled={disabled || !onChange}
          onValueChange={(value) => onChange?.({ ...timeline, quality: value as ExportQuality })}
        >
          <SelectTrigger id="render-quality" className="h-8 w-36" aria-label="Render quality">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPORT_QUALITIES.map((quality) => (
              <SelectItem key={quality} value={quality}>
                {EXPORT_QUALITY_LABELS[quality]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-[11px] text-muted-foreground">{QUALITY_NOTES[timeline.quality]}</p>
      {single && (
        <p className="text-[11px] text-muted-foreground" data-testid="render-pass-through">
          This edit is one video with nothing over it: if the file is already at the edit&apos;s
          size, rate and loudness, the render passes it through untouched instead of encoding it
          again.
        </p>
      )}
    </div>
  );
}

/**
 * How a render measured against its own reference, at a glance and then
 * measure by measure in plain words (flags first), with what a master did
 * with its clips. `stored` is the report kept on the render; `metadata` the
 * rendered video's library record, which holds it too.
 */
export function RenderReport({ stored, metadata }: { stored: unknown; metadata: unknown }) {
  const report = renderQualityOf(stored, metadata);
  const mastering = masteringNote(metadata);
  if (!report && !mastering) return null;
  const lines = report ? qualityLines(report) : [];
  const note = report ? referenceNote(report) : null;
  const flagged = (report?.flags ?? 0) > 0;
  return (
    <div className="mt-1.5 space-y-1 text-[11px]" data-testid="render-quality-report">
      {mastering && <p className="text-muted-foreground">{mastering}</p>}
      {report && (
        <details className="group">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center gap-1",
              flagged ? "text-warning" : "text-muted-foreground",
            )}
          >
            {flagged ? (
              <AlertTriangle className="size-3 shrink-0" />
            ) : (
              <CheckCircle2 className="size-3 shrink-0 text-success" />
            )}
            <span>{qualitySummary(report)}</span>
            {lines.length > 0 && (
              <span className="ml-auto text-muted-foreground group-open:hidden">Details</span>
            )}
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {lines.map((entry) => (
              <li key={entry.text} className="flex gap-1">
                {entry.result === "flag" ? (
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                ) : entry.result === "pass" ? (
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" />
                ) : (
                  <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                )}
                <span className={entry.result === "flag" ? "" : "text-muted-foreground"}>
                  {entry.text}
                </span>
              </li>
            ))}
          </ul>
          {note && <p className="mt-1 text-muted-foreground">{note}</p>}
        </details>
      )}
    </div>
  );
}
