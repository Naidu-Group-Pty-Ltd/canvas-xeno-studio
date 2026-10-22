import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useTeam, type AssetRow } from "@/hooks/useStudioData";
import { forgetAssetRights, getAssetRights, recordAssetRights } from "@/lib/rights.functions";
import {
  RIGHTS_STATUSES,
  STATUS_LABELS,
  type AssetRights,
  type RightsBasis,
  type RightsStatus,
} from "@/lib/rights/rights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TONES: Record<RightsStatus, string> = {
  cleared: "border-success/50 text-success",
  to_confirm: "border-warning/60 text-warning",
  not_cleared: "border-destructive/60 text-destructive",
};

/** Why a file's rights are what they are, when nobody has recorded them. */
const BASIS: Record<RightsBasis, string> = {
  music_library: "From the music library's record of the track.",
  provider_terms: "Worked out: made by the studio, under its provider's terms.",
  studio_render: "Worked out: rendered by the studio, from the files its edit used.",
  derived: "Worked out: made by the studio from another file, whose rights it follows.",
  upload: "Worked out: an upload is to confirm until someone records its rights.",
  api_import: "Worked out: an import is to confirm until someone records its rights.",
  unknown: "Worked out: nothing is on record about where it came from.",
};

export function RightsStatusPill({ status }: { status: RightsStatus }) {
  return (
    <span
      className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", TONES[status])}
      data-testid="rights-status"
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

interface Form {
  status: RightsStatus;
  source: string;
  licence: string;
  licenceUrl: string;
  creditLine: string;
  notes: string;
}

const formOf = (rights: AssetRights): Form => ({
  status: rights.status,
  source: rights.recorded ? rights.source : "",
  licence: rights.recorded ? rights.licence : "",
  licenceUrl: rights.recorded ? (rights.licenceUrl ?? "") : "",
  creditLine: rights.recorded ? (rights.creditLine ?? "") : "",
  notes: rights.recorded ? (rights.notes ?? "") : "",
});

/**
 * A library file's rights, in its details: where it came from, its licence,
 * its status for public use and the credit it owes, worked out until someone
 * records them; and recording them (the server stamps who and when). A music
 * library track's licence and credit are the library's: only its status and
 * notes are set here.
 */
export function RightsPanel({ asset }: { asset: AssetRow }) {
  const queryClient = useQueryClient();
  const { data: team = [] } = useTeam();
  const {
    data: rights,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["asset-rights", asset.id],
    queryFn: async () => (await getAssetRights({ data: { assetIds: [asset.id] } }))[0] ?? null,
  });
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const name = (id: string | null) => {
    const person = team.find((member) => member.id === id);
    return person?.full_name ?? person?.email ?? "someone";
  };
  const when = (at: string | null) => (at ? new Date(at).toLocaleDateString() : "");

  async function save(forget = false) {
    if (!rights) return;
    setSaving(true);
    try {
      const music = rights.basis === "music_library";
      const value = (field: string) => field.trim() || null;
      if (forget) await forgetAssetRights({ data: { assetId: asset.id } });
      else if (form)
        await recordAssetRights({
          data: {
            assetId: asset.id,
            status: form.status,
            notes: value(form.notes),
            ...(music
              ? {}
              : {
                  source: value(form.source),
                  licence: value(form.licence),
                  licenceUrl: value(form.licenceUrl),
                  creditLine: value(form.creditLine),
                }),
          },
        });
      setForm(null);
      toast.success(forget ? "Its rights are worked out again." : "Rights recorded.");
      await queryClient.invalidateQueries({ queryKey: ["asset-rights", asset.id] });
      await queryClient.invalidateQueries({ queryKey: ["edit-credits"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The rights couldn't be saved");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading)
    return (
      <div className="h-16 animate-pulse rounded-md border border-border bg-surface-raised/40" />
    );
  if (isError || !rights)
    return (
      <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
        This file&apos;s rights couldn&apos;t be read just now.
      </p>
    );
  const music = rights.basis === "music_library";
  const field = (key: keyof Form) => (value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  return (
    <div
      className="space-y-2 rounded-md border border-border p-3 text-xs"
      data-testid="asset-rights"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 label-eyebrow">
          <ShieldCheck className="size-3.5" /> Rights
        </span>
        <RightsStatusPill status={rights.status} />
      </div>
      <dl className="space-y-1">
        <div>
          <dt className="inline text-muted-foreground">Source: </dt>
          <dd className="inline">{rights.source}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Licence: </dt>
          <dd className="inline">
            {rights.licence}
            {rights.licenceUrl && (
              <a
                href={rights.licenceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-1 inline-flex items-center text-primary"
              >
                <ExternalLink className="size-3" />
              </a>
            )}
          </dd>
        </div>
        {rights.creditLine && (
          <div>
            <dt className="inline text-muted-foreground">Credit owed: </dt>
            <dd className="inline">{rights.creditLine}</dd>
          </div>
        )}
        {rights.notes && <p className="text-muted-foreground">{rights.notes}</p>}
      </dl>
      <p className="text-[11px] text-muted-foreground">
        {rights.recorded
          ? `Recorded by ${name(rights.updatedBy)} on ${when(rights.updatedAt)}`
          : BASIS[rights.basis]}
        {rights.confirmedBy
          ? ` · ${rights.status === "not_cleared" ? "Decided" : "Confirmed"} by ${name(rights.confirmedBy)}${rights.confirmedAt ? ` on ${when(rights.confirmedAt)}` : ""}`
          : ""}
      </p>

      {form ? (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
            {RIGHTS_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                role="radio"
                aria-checked={form.status === status}
                onClick={() => setForm({ ...form, status })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  form.status === status ? TONES[status] : "border-border text-muted-foreground",
                )}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          {music ? (
            <p className="text-[11px] text-muted-foreground">
              Its licence and credit are kept in the music library (renew or record its licence
              there). Its status and notes are recorded here.
            </p>
          ) : (
            <>
              <Input
                className="h-8 text-xs"
                placeholder={`Source (worked out: ${rights.recorded ? "as recorded" : rights.source})`}
                value={form.source}
                maxLength={300}
                onChange={(event) => field("source")(event.target.value)}
              />
              <Input
                className="h-8 text-xs"
                placeholder='Licence, e.g. "CC BY 4.0" or "Licensed from the client"'
                value={form.licence}
                maxLength={300}
                onChange={(event) => field("licence")(event.target.value)}
              />
              <Input
                className="h-8 text-xs"
                placeholder="Licence's address (optional)"
                value={form.licenceUrl}
                maxLength={500}
                onChange={(event) => field("licenceUrl")(event.target.value)}
              />
              <Input
                className="h-8 text-xs"
                placeholder="Credit owed wherever it is published (if any)"
                value={form.creditLine}
                maxLength={1000}
                onChange={(event) => field("creditLine")(event.target.value)}
              />
            </>
          )}
          <Textarea
            className="min-h-14 text-xs"
            placeholder="Notes: who confirmed it, its conditions, where it may be used"
            value={form.notes}
            maxLength={2000}
            onChange={(event) => field("notes")(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Record
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setForm(null)}>
              Cancel
            </Button>
            {rights.recorded && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={saving}
                onClick={() => void save(true)}
              >
                Work it out again
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setForm(formOf(rights))}
          data-testid="asset-rights-edit"
        >
          {rights.status === "cleared" ? "Change rights" : "Confirm or set rights"}
        </Button>
      )}
    </div>
  );
}
