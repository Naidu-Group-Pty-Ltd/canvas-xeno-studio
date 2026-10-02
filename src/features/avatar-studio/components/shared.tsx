import { useRef, useState } from "react";
import { Loader2, Upload, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { registerAvatarAsset } from "../lib/avatar.functions";

export const ATTESTATION =
  "I confirm that we have the necessary permission and rights to use this person's image/voice for AI cloning and generation.";

export function newRequestId() {
  return crypto.randomUUID();
}

const TRAINING_ROLES = ["training_video", "training_audio", "identity_reference"];

async function probeDuration(file: File): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  const kind = file.type.split("/")[0];
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const img = new Image();
      await new Promise((r, j) => ((img.onload = r), (img.onerror = j), (img.src = url)));
      return { duration: null, width: img.naturalWidth, height: img.naturalHeight };
    }
    if (kind === "video" || kind === "audio") {
      const el = document.createElement(kind);
      el.preload = "metadata";
      await new Promise((r, j) => ((el.onloadedmetadata = r), (el.onerror = j), (el.src = url)));
      const v = el as HTMLVideoElement;
      return { duration: Number.isFinite(el.duration) ? el.duration : null, width: v.videoWidth || null, height: v.videoHeight || null };
    }
  } catch {
    /* metadata optional */
  } finally {
    URL.revokeObjectURL(url);
  }
  return { duration: null, width: null, height: null };
}

/** Uploads straight to private storage under the user's folder, then registers server-side. */
export function AvatarUpload({
  role,
  accept,
  label,
  multiple,
  onUploaded,
}: {
  role: string;
  accept: string;
  label: string;
  multiple?: boolean;
  onUploaded: (assets: { id: string; name: string; duration: number | null }[]) => void;
}) {
  const { user } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const bucket = TRAINING_ROLES.includes(role) ? "avatar-training-media" : "avatar-media";

  const handle = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setBusy(true);
    const out: { id: string; name: string; duration: number | null }[] = [];
    try {
      for (const file of Array.from(files)) {
        const meta = await probeDuration(file);
        const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
        const path = `${user.id}/${role}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
        if (up.error) throw new Error(up.error.message);
        const res = await registerAvatarAsset({
          data: {
            role,
            storagePath: path,
            title: file.name.slice(0, 200),
            mimeType: file.type,
            fileSize: file.size,
            durationSeconds: meta.duration,
            width: meta.width,
            height: meta.height,
          },
        });
        out.push({ id: res!.assetId, name: file.name, duration: meta.duration });
      }
      onUploaded(out);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div
      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/60"
      onClick={() => input.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handle(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
    >
      {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
      <span>{busy ? "Uploading privately…" : label}</span>
      <input ref={input} type="file" className="hidden" accept={accept} multiple={multiple} onChange={(e) => void handle(e.target.files)} />
    </div>
  );
}

export function Attestation({ checked, onChange, note, onNote }: { checked: boolean; onChange: (v: boolean) => void; note?: string; onNote?: (v: string) => void }) {
  return (
    <div className={cn("space-y-2 rounded-lg border p-3", checked ? "border-primary/50" : "border-border")}>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
        <span>
          <ShieldCheck className="mr-1 inline size-4 text-primary" />
          {ATTESTATION}
        </span>
      </label>
      {onNote && (
        <Textarea value={note ?? ""} onChange={(e) => onNote(e.target.value)} placeholder="Optional: who gave permission and how (kept in the audit record)" className="min-h-14 text-xs" />
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  completed: "border-success/40 text-success",
  ready: "border-success/40 text-success",
  failed: "border-primary/50 text-primary",
  blocked: "border-primary/50 text-primary",
  submission_uncertain: "border-warning/50 text-warning",
  ingest_failed: "border-warning/50 text-warning",
  awaiting_consent: "border-warning/50 text-warning",
};
const LABEL: Record<string, string> = {
  local_pending: "Preparing",
  submitting: "Submitting",
  provider_pending: "Queued at HeyGen",
  provider_processing: "Rendering",
  awaiting_consent: "Needs consent",
  ingesting: "Saving to library…",
  ingest_failed: "Save failed",
  submission_uncertain: "Submission uncertain",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
  blocked: "Blocked",
  training: "Training",
  ready: "Ready",
};
export function StatusChip({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]", TONE[status] ?? "text-muted-foreground")}>
      {["submitting", "provider_pending", "provider_processing", "ingesting", "training"].includes(status) && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
      {LABEL[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function NotConfigured({ what }: { what: string }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
      {what} isn't connected yet. Generating is disabled until an admin adds the key in Avatar Settings.
    </div>
  );
}

export function SubmitButton({ busy, disabled, children, onClick }: { busy: boolean; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <Button disabled={busy || disabled} onClick={onClick} className="w-full">
      {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
      {children}
    </Button>
  );
}
