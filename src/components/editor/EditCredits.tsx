import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { getEditCredits } from "@/lib/rights.functions";
import { audibleAudio, type Timeline } from "@/lib/edit/timeline";
import { STATUS_LABELS, timelineUses, USE_LABELS, type EditCredits } from "@/lib/rights/rights";
import { RightsStatusPill } from "@/components/studio/RightsPanel";
import { Checkbox } from "@/components/ui/checkbox";

/** What a render is for, and what the person rendering confirms: sent with the render. */
export interface RenderRightsChoice {
  publicUse: boolean;
  /** The files not cleared that are confirmed as exceptions, by id. */
  confirmExceptions: string[];
}

/** A library file's id (anything else in a timeline isn't a file with rights). */
const LIBRARY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The edit's credits as it is being edited: the files it uses, each with its rights. */
function useEditCredits(timeline: Timeline) {
  const uses = useMemo(
    () =>
      timelineUses({
        clips: timeline.clips,
        images: timeline.images,
        audio: audibleAudio(timeline),
      }).filter((use) => LIBRARY_ID.test(use.assetId)),
    [timeline],
  );
  return useQuery({
    queryKey: ["edit-credits", JSON.stringify(uses)],
    enabled: uses.length > 0,
    staleTime: 30_000,
    queryFn: () => getEditCredits({ data: { uses } }),
  });
}

/** Why a render for public use can't start yet: files not cleared and not confirmed as exceptions. */
function heldReason(credits: EditCredits | undefined, choice: RenderRightsChoice): string | null {
  if (!choice.publicUse || !credits) return null;
  const open = credits.notCleared.filter(
    (file) => !choice.confirmExceptions.includes(file.assetId),
  );
  if (!open.length) return null;
  return open.length === 1
    ? "1 file isn't cleared for public use: clear it in the library, or confirm it as an exception."
    : `${open.length} files aren't cleared for public use: clear them in the library, or confirm them as exceptions.`;
}

/**
 * Above the Render button: whether this render is for public use. One that is
 * is held until every file the edit uses is cleared, or the person rendering
 * confirms the ones that aren't as exceptions (recorded with their name and
 * when). Tells the panel when the render can't start yet (`onHeld`).
 */
export function PublicUseChoice({
  timeline,
  choice,
  onChoice,
  onHeld,
}: {
  timeline: Timeline;
  choice: RenderRightsChoice;
  onChoice: (next: RenderRightsChoice) => void;
  onHeld: (reason: string | null) => void;
}) {
  const { data: credits } = useEditCredits(timeline);
  const held = heldReason(credits, choice);
  useEffect(() => onHeld(held), [held, onHeld]);
  const open = credits?.notCleared ?? [];
  const confirmedAll =
    open.length > 0 && open.every((file) => choice.confirmExceptions.includes(file.assetId));
  return (
    <div className="space-y-1.5 text-xs" data-testid="public-use">
      <label className="flex items-center gap-2">
        <Checkbox
          checked={choice.publicUse}
          onCheckedChange={(value) =>
            onChoice({ publicUse: value === true, confirmExceptions: [] })
          }
        />
        For public use (publishing, ads, the client&apos;s channels)
      </label>
      {choice.publicUse && open.length > 0 && (
        <div
          className="space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-2"
          data-testid="public-use-exceptions"
        >
          <p>
            {open.length === 1 ? "1 file isn't" : `${open.length} files aren't`} cleared for public
            use. Clear {open.length === 1 ? "it" : "them"} in the library (the file&apos;s details),
            or confirm {open.length === 1 ? "it" : "them"} here to render anyway.
          </p>
          <ul className="space-y-0.5">
            {open.map((file) => (
              <li key={file.assetId}>
                <span className="font-medium">{file.title ?? "Untitled"}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {STATUS_LABELS[file.status].toLowerCase()} · {file.licence}
                </span>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={confirmedAll}
              onCheckedChange={(value) =>
                onChoice({
                  ...choice,
                  confirmExceptions: value === true ? open.map((file) => file.assetId) : [],
                })
              }
            />
            I confirm {open.length === 1 ? "this file" : "these files"} may be published as they
            are. This is recorded with my name, and kept with the render.
          </label>
        </div>
      )}
    </div>
  );
}

/**
 * What a finished render kept of its rights (on the rendered file): whether it
 * was for public use, the exceptions confirmed for it and by whom, and every
 * credit it owes, copied in one.
 */
export function KeptRights({ metadata }: { metadata: unknown }) {
  const record = (metadata ?? {}) as { rights_check?: unknown; credit_lines?: unknown };
  const check = (record.rights_check ?? null) as {
    public_use?: unknown;
    exceptions?: unknown;
    not_cleared?: unknown;
  } | null;
  const lines = Array.isArray(record.credit_lines)
    ? record.credit_lines.filter((line): line is string => typeof line === "string")
    : [];
  if (!check && !lines.length) return null;
  const exceptions = Array.isArray(check?.exceptions) ? check.exceptions.length : 0;
  const open = typeof check?.not_cleared === "number" ? check.not_cleared : 0;
  const summary = check?.public_use
    ? `For public use${exceptions ? ` · ${exceptions} exception${exceptions === 1 ? "" : "s"} confirmed` : " · every file cleared"}`
    : open
      ? `Not for public use · ${open} file${open === 1 ? " wasn't" : "s weren't"} cleared`
      : "Not for public use";
  return (
    <p
      className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground"
      data-testid="render-rights"
    >
      <span>{summary}</span>
      {lines.length > 0 && (
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => {
            void navigator.clipboard?.writeText(lines.join("\n")).then(
              () => toast.success("Credits copied"),
              () => toast.error("Couldn't copy"),
            );
          }}
        >
          <Copy className="size-3" /> Copy its {lines.length === 1 ? "credit" : "credits"}
        </button>
      )}
    </p>
  );
}

/**
 * The edit's credits in the Render panel: every file it uses, how it uses
 * each, its licence and its status, and the credit lines owed, copied in one.
 * The music's own credit is shown above as it always was; the lines here are
 * every credit the edit owes, music's included, ready to publish together.
 */
export function EditCreditsList({ timeline }: { timeline: Timeline }) {
  const { data: credits, isLoading, isError } = useEditCredits(timeline);
  if (isLoading) return null;
  if (isError || !credits)
    return (
      <p className="text-xs text-muted-foreground">
        The edit&apos;s credits couldn&apos;t be read just now.
      </p>
    );
  if (!credits.files.length) return null;
  return (
    <div
      className="space-y-2 rounded-md border border-border p-2.5 text-xs"
      data-testid="edit-credits"
    >
      <p className="font-medium">Credits and licences</p>
      <ul className="space-y-1">
        {credits.files.map((file) => (
          <li key={file.assetId} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="font-medium">{file.title ?? "Untitled"}</span>
              <span className="text-muted-foreground">
                {" "}
                · {file.uses.map((use) => USE_LABELS[use]).join(", ")} · {file.licence}
              </span>
            </span>
            <RightsStatusPill status={file.status} />
          </li>
        ))}
      </ul>
      {credits.creditLines.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">Every credit to publish</p>
            <button
              type="button"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(credits.creditLines.join("\n")).then(
                  () => toast.success("Credits copied"),
                  () => toast.error("Couldn't copy"),
                );
              }}
            >
              <Copy className="size-3" /> Copy
            </button>
          </div>
          <ul className="space-y-1">
            {credits.creditLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Set or confirm a file&apos;s rights in its details in the library. The credits are kept with
        every render.
      </p>
    </div>
  );
}
