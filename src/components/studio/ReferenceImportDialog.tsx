import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  applyReferenceRedaction,
  cancelReferenceRedaction,
  getReferencePrivacyStatus,
  getReferenceRedaction,
  readReferenceScreenshot,
  stageReferenceScreenshot,
} from "@/lib/privacy.functions";
import { SCREENSHOT_MAX_BYTES, SCREENSHOT_TYPES, type RedactionView } from "@/lib/media/redaction";
import { PRIVATE_KIND_LABELS, PRIVATE_KINDS, type RedactionBox } from "@/lib/media/text-boxes";
import { BoxEditor, type EditableBox } from "@/components/studio/BoxEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/** How often, and how many times, the copy is asked after while the media service blurs it. */
const POLL_MS = 3_000;
const POLLS = 100;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A box as the editor holds it, with what the reading took it for. */
type CheckedBox = EditableBox & Partial<Pick<RedactionBox, "kind" | "source">>;

/**
 * A screenshot supplied as a reference (a client's portal, say), imported
 * kept private: its names, emails, phone numbers and addresses are found and
 * blurred in a copy once a person has checked every box, and the copy is
 * marked layout only, so no generation or edit can place it in a frame. The
 * original never joins the library.
 */
export function ReferenceImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [blur, setBlur] = useState(true);
  const [layoutOnly, setLayoutOnly] = useState(true);
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [view, setView] = useState<RedactionView | null>(null);
  const [boxes, setBoxes] = useState<CheckedBox[]>([]);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const { data: status } = useQuery({
    queryKey: ["reference-privacy-status"],
    queryFn: () => getReferencePrivacyStatus(),
    enabled: open,
    staleTime: 60_000,
  });

  function reset() {
    setFile(null);
    setView(null);
    setBoxes([]);
    setWorking(null);
    setBlur(true);
    setLayoutOnly(true);
    setKeepOriginal(false);
  }

  /** Closing before the copy is made drops the screenshot: its original is deleted. */
  async function close() {
    if (view && ["uploading", "reading", "review", "failed"].includes(view.status))
      await cancelReferenceRedaction({ data: { redactionId: view.redactionId } }).catch(
        () => undefined,
      );
    reset();
    onOpenChange(false);
  }

  function pick(next: File | null) {
    if (next && !SCREENSHOT_TYPES[next.type]) {
      toast.error("A screenshot must be a PNG, JPEG or WebP picture.");
      return;
    }
    if (next && next.size > SCREENSHOT_MAX_BYTES) {
      toast.error("The screenshot is larger than 15 MB.");
      return;
    }
    setFile(next);
  }

  async function begin() {
    if (!file || !user) return;
    try {
      setWorking("Storing the screenshot privately…");
      const staged = await stageReferenceScreenshot({
        data: {
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          projectId: null,
          layoutOnly,
          keepOriginal: blur && keepOriginal,
        },
      });
      const upload = await supabase.storage
        .from(staged.bucket)
        .upload(staged.path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw new Error("The screenshot couldn't be stored. Try again.");
      setWorking(
        blur ? "Reading it for names, emails, phone numbers and addresses…" : "Measuring it…",
      );
      const read = await readReferenceScreenshot({
        data: { redactionId: staged.redactionId, read: blur },
      });
      setView(read);
      setBoxes(read.boxes);
      // Not to be blurred: it joins the library as it is, marked as chosen.
      if (!blur) await apply(read, []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The screenshot couldn't be imported.");
    } finally {
      setWorking(null);
    }
  }

  async function apply(current: RedactionView, list: CheckedBox[]) {
    setWorking(list.length ? "Blurring the boxes in a copy…" : "Adding it to the library…");
    try {
      let next = await applyReferenceRedaction({
        data: {
          redactionId: current.redactionId,
          boxes: list.map((box) => ({
            id: box.id,
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
            ...(box.kind ? { kind: box.kind } : {}),
            ...(box.source ? { source: box.source } : {}),
            ...(box.label ? { label: box.label } : {}),
          })),
          layoutOnly,
          keepOriginal: blur && keepOriginal,
        },
      });
      for (let poll = 0; next.status === "applying" && poll < POLLS; poll += 1) {
        await wait(POLL_MS);
        next = await getReferenceRedaction({ data: { redactionId: current.redactionId } });
      }
      setView(next);
      if (next.status === "completed") {
        await queryClient.invalidateQueries({ queryKey: ["assets"] });
        toast.success(next.message);
      } else if (next.status === "applying") {
        toast.message("Still blurring. The copy appears in the library when it is done.");
      } else if (next.status === "failed") {
        toast.error(next.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The copy couldn't be made.");
    } finally {
      setWorking(null);
    }
  }

  const aspect = view?.width && view.height ? view.width / view.height : 16 / 9;
  const unavailable = status && !status.ready ? status.message : null;
  const reviewing = view && (view.status === "review" || view.status === "failed");
  const counts = PRIVATE_KINDS.map(
    (kind) => [kind, boxes.filter((box) => box.kind === kind).length] as const,
  ).filter(([, count]) => count > 0);
  const drawn = boxes.filter((box) => !box.kind || box.kind === "drawn");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else if (!working) void close();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import a screenshot as a reference</DialogTitle>
          <DialogDescription>
            For a screen that shows how something is laid out (a client&apos;s portal, say). Real
            people&apos;s details are blurred in a copy before it joins the library, and a
            layout-only copy can never be placed in a frame.
          </DialogDescription>
        </DialogHeader>

        {unavailable && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">{unavailable}</p>
        )}

        {!view && !unavailable && (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground hover:border-input">
              <Upload className="size-5" />
              {file ? file.name : "Choose a PNG, JPEG or WebP screenshot (up to 15 MB)"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => pick(event.target.files?.[0] ?? null)}
              />
            </label>
            {preview && (
              <img
                src={preview}
                alt=""
                className="max-h-64 w-full rounded-md border border-border object-contain"
              />
            )}
            <div className="space-y-3 text-sm">
              <Choice
                id="reference-blur"
                checked={blur}
                onChange={setBlur}
                label="Find and blur names, emails, phone numbers and addresses"
                note="Emails and phone numbers are found by their pattern, names and addresses by the studio's AI. You check every box before anything is blurred."
              />
              <Choice
                id="reference-layout-only"
                checked={layoutOnly}
                onChange={setLayoutOnly}
                label="Layout only"
                note="A reference for how the screen is laid out: no generation, edit or copy can place it in a frame."
              />
              {blur && (
                <Choice
                  id="reference-keep-original"
                  checked={keepOriginal}
                  onChange={setKeepOriginal}
                  label="Keep the original where only admins can open it"
                  note={
                    isAdmin
                      ? "Otherwise it is deleted once the copy is made. You can open it from the copy's details."
                      : "Otherwise it is deleted once the copy is made. Only an admin can open it."
                  }
                />
              )}
            </div>
          </div>
        )}

        {view && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{view.message}</p>
            {(reviewing || view.status === "applying") && (
              <BoxEditor
                url={preview}
                aspect={aspect}
                boxes={boxes}
                onChange={setBoxes}
                disabled={!reviewing || !!working}
                tone="private"
              />
            )}
            {reviewing && (
              <p className="text-xs text-muted-foreground">
                {counts.length || drawn.length
                  ? [
                      ...counts.map(([kind, count]) => `${PRIVATE_KIND_LABELS[kind]}: ${count}`),
                      ...(drawn.length ? [`${PRIVATE_KIND_LABELS.drawn}: ${drawn.length}`] : []),
                    ].join(" · ")
                  : "No boxes. Drag across anything that must not be shown."}
              </p>
            )}
            {view.status === "completed" && view.redactedAssetId && (
              <p className="flex items-center gap-2 text-sm">
                {layoutOnly ? (
                  <EyeOff className="size-4 text-muted-foreground" />
                ) : (
                  <ShieldCheck className="size-4 text-muted-foreground" />
                )}
                {layoutOnly
                  ? "Marked layout only: it can be looked at and built from, never placed in a frame."
                  : "Not marked layout only: it may be used like any picture."}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {!view && (
            <Button
              disabled={!file || !!working || !!unavailable || !status}
              onClick={() => void begin()}
            >
              {working ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              {working ?? (blur ? "Upload and read it" : "Add it")}
            </Button>
          )}
          {reviewing && (
            <>
              <Button variant="outline" disabled={!!working} onClick={() => void close()}>
                Drop it
              </Button>
              <Button disabled={!!working} onClick={() => void apply(view, boxes)}>
                {working ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                {working ??
                  (boxes.length
                    ? `Blur ${boxes.length} ${boxes.length === 1 ? "area" : "areas"}`
                    : "Add it as it is")}
              </Button>
            </>
          )}
          {view?.status === "completed" && view.redactedAssetId && (
            <Button
              onClick={() => {
                const assetId = view.redactedAssetId!;
                reset();
                onOpenChange(false);
                void navigate({ to: "/assets", search: { asset: assetId } });
              }}
            >
              Open it
            </Button>
          )}
          {view && (view.status === "applying" || view.status === "cancelled") && (
            <Button variant="outline" onClick={() => void close()}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  id,
  checked,
  onChange,
  label,
  note,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5"
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}
