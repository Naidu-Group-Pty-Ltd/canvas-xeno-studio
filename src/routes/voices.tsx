import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  Megaphone,
  Mic,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Star,
  StarOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { VoiceEditor } from "@/components/voices/VoiceEditor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useStudioData";
import { useCampaigns } from "@/hooks/useV2Data";
import { playBase64, useBrandVoices, useVoiceStatus } from "@/hooks/useVoiceData";
import { previewVoice, updateVoiceStatus } from "@/lib/voice.functions";
import { ELEVENLABS_MODELS, OPENAI_VOICES, type BrandVoiceRow } from "@/lib/voice/catalog";
import { isMissingTableError } from "@/lib/edit/errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/voices")({
  head: () => ({
    meta: [
      { title: "Brand voices · Xeno Studio" },
      {
        name: "description",
        content: "Consistent voiceover personas for every campaign and brand.",
      },
      { property: "og:title", content: "Brand voices · Xeno Studio" },
      { property: "og:description", content: "One voice for a whole campaign or brand." },
    ],
  }),
  component: VoicesPage,
});

// Each listen is a billable call, so a line heard once is kept for the session.
const heard = new Map<string, { audioBase64: string; mime: string }>();

function voiceLabel(voice: BrandVoiceRow): string {
  if (voice.provider === "openai") {
    const known = OPENAI_VOICES.find((option) => option.id === voice.provider_voice_id);
    return `OpenAI · ${known ? known.id[0]!.toUpperCase() + known.id.slice(1) : voice.provider_voice_id}`;
  }
  const name =
    typeof voice.source?.["voice_name"] === "string"
      ? (voice.source["voice_name"] as string)
      : "Custom voice";
  const model = ELEVENLABS_MODELS.find((option) => option.id === voice.model)?.short ?? voice.model;
  return `ElevenLabs · ${name} · ${model}`;
}

function originLabel(voice: BrandVoiceRow): string | null {
  switch (voice.source?.["kind"]) {
    case "cloned":
      return "Cloned with consent";
    case "designed":
      return "Designed from a description";
    case "library":
      return "From the voice library";
    default:
      return null;
  }
}

function VoicesPage() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const {
    data: voices = [],
    isLoading,
    error,
  } = useBrandVoices({
    includeArchived: showArchived,
  });
  const { data: status } = useVoiceStatus();
  const { data: campaigns = [] } = useCampaigns();
  const { data: projects = [] } = useProjects();
  const [editing, setEditing] = useState<BrandVoiceRow | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [listening, setListening] = useState<string | null>(null);
  const missingTables = isMissingTableError(error);

  const usage = useMemo(() => {
    const byVoice = new Map<string, { campaigns: string[]; projects: string[] }>();
    const entry = (id: string) =>
      byVoice.get(id) ?? byVoice.set(id, { campaigns: [], projects: [] }).get(id)!;
    for (const campaign of campaigns as { name: string; brand_voice_id?: string | null }[]) {
      if (campaign.brand_voice_id) entry(campaign.brand_voice_id).campaigns.push(campaign.name);
    }
    for (const project of projects as { name: string; brand_voice_id?: string | null }[]) {
      if (project.brand_voice_id) entry(project.brand_voice_id).projects.push(project.name);
    }
    return byVoice;
  }, [campaigns, projects]);

  function openEditor(voice: BrandVoiceRow | null) {
    setEditing(voice);
    setEditorOpen(true);
  }

  async function listen(voice: BrandVoiceRow) {
    const key = `${voice.id}:${voice.updated_at}`;
    const cached = heard.get(key);
    if (cached) {
      playBase64(cached.audioBase64, cached.mime);
      return;
    }
    setListening(voice.id);
    try {
      const text = `Hi, I'm ${voice.name}. This is how every video in this campaign will sound.`;
      const result = await previewVoice({ data: { text, voiceId: voice.id } });
      heard.set(key, { audioBase64: result.audioBase64, mime: result.mime });
      playBase64(result.audioBase64, result.mime);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The voice could not speak");
    } finally {
      setListening(null);
    }
  }

  async function act(
    voice: BrandVoiceRow,
    action: "archive" | "restore" | "make_default" | "clear_default",
  ) {
    try {
      await updateVoiceStatus({ data: { id: voice.id, action } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["brand_voices"] }),
        queryClient.invalidateQueries({ queryKey: ["brand-voice-for"] }),
      ]);
      toast.success(
        {
          archive: "Voice archived",
          restore: "Voice restored",
          make_default: `${voice.name} is now the studio default`,
          clear_default: "No studio default voice",
        }[action],
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The voice could not be changed");
    }
  }

  return (
    <AppShell title="Brand voices">
      <div className="space-y-5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-display text-lg font-semibold">Brand voices</h2>
            <p className="text-sm text-muted-foreground">
              A brand voice is one speaker with fixed delivery, pronunciations and script rules.
              Give a campaign or a project its voice and every voiceover made for it sounds like the
              same person, from the first teaser to the last cut-down.
            </p>
          </div>
          <Button
            onClick={() => openEditor(null)}
            disabled={missingTables || !user}
            data-testid="new-voice"
          >
            <Plus className="mr-1.5 size-4" /> New voice
          </Button>
        </div>

        {missingTables && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">Brand voices need a database update.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Apply migration <code>0005_brand_voices</code> (drizzle/migrations), then reload.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.3fr]">
          <ProviderStatus
            label="OpenAI voices"
            ready={status?.openai}
            detail="13 built-in voices with directed delivery"
          />
          <ProviderStatus
            label="ElevenLabs"
            ready={status?.elevenlabs}
            detail={
              status?.elevenlabs === false
                ? "Add ELEVENLABS_API_KEY to unlock the voice library, voice design and cloning"
                : "Voice library, voice design and consented cloning"
            }
          />
          <div className="panel p-3 text-xs">
            <p className="font-medium">Which voice speaks</p>
            <p className="mt-1 text-muted-foreground">
              The voice picked for a voiceover, else the campaign's voice, else the project's voice,
              else the studio default. Set campaign voices on{" "}
              <Link to="/campaigns" className="underline underline-offset-2">
                Campaigns
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Label htmlFor="show-archived" className="text-xs text-muted-foreground">
            Show archived
          </Label>
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
        </div>

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-44" />
            ))}
          </div>
        )}

        {!isLoading && !missingTables && voices.length === 0 && (
          <EmptyState
            icon={Mic}
            title="No brand voices yet"
            description="Create the voice of your brand once. Every campaign and video can then speak with it."
            actionLabel="Create a brand voice"
            onAction={() => openEditor(null)}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {voices.map((voice) => {
            const used = usage.get(voice.id);
            const canEdit = isAdmin || voice.created_by === user?.id;
            // Archiving the studio default clears it, which only an admin may do.
            const canArchive = canEdit && (isAdmin || !voice.is_default);
            const origin = originLabel(voice);
            return (
              <div
                key={voice.id}
                className={cn("panel flex flex-col gap-2 p-4", voice.is_archived && "opacity-60")}
                data-testid="voice-card"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold">
                      <span className="truncate">{voice.name}</span>
                      {voice.is_default && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <Star className="size-2.5" /> Default
                        </span>
                      )}
                      {voice.is_archived && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                          Archived
                        </span>
                      )}
                    </h3>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {voiceLabel(voice)}
                    </p>
                  </div>
                  {(isAdmin || (canEdit && (voice.is_archived || canArchive))) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label={`More for ${voice.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isAdmin &&
                          !voice.is_default &&
                          !voice.is_archived &&
                          !voice.project_id && (
                            <DropdownMenuItem onClick={() => void act(voice, "make_default")}>
                              <Star className="mr-2 size-4" /> Make studio default
                            </DropdownMenuItem>
                          )}
                        {isAdmin && voice.is_default && (
                          <DropdownMenuItem onClick={() => void act(voice, "clear_default")}>
                            <StarOff className="mr-2 size-4" /> Stop being the default
                          </DropdownMenuItem>
                        )}
                        {canEdit &&
                          (voice.is_archived ? (
                            <DropdownMenuItem onClick={() => void act(voice, "restore")}>
                              <ArchiveRestore className="mr-2 size-4" /> Restore
                            </DropdownMenuItem>
                          ) : canArchive ? (
                            <DropdownMenuItem onClick={() => void act(voice, "archive")}>
                              <Archive className="mr-2 size-4" /> Archive
                            </DropdownMenuItem>
                          ) : null)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                <p className="line-clamp-3 text-xs text-muted-foreground">
                  {voice.description || "No persona written yet."}
                </p>

                <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                  {voice.language && (
                    <span className="rounded bg-surface-raised px-1.5 py-0.5">
                      {voice.language}
                    </span>
                  )}
                  <span className="rounded bg-surface-raised px-1.5 py-0.5">
                    {projects.find((project) => project.id === voice.project_id)?.name ??
                      "All projects"}
                  </span>
                  {voice.pronunciations?.length > 0 && (
                    <span className="rounded bg-surface-raised px-1.5 py-0.5">
                      {voice.pronunciations.length} pronunciation
                      {voice.pronunciations.length === 1 ? "" : "s"}
                    </span>
                  )}
                  {voice.script_guidelines && (
                    <span className="rounded bg-surface-raised px-1.5 py-0.5">Script rules</span>
                  )}
                  {origin && (
                    <span className="rounded bg-surface-raised px-1.5 py-0.5">{origin}</span>
                  )}
                </div>

                {used && (used.campaigns.length > 0 || used.projects.length > 0) && (
                  <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
                    <Megaphone className="mt-0.5 size-3 shrink-0" />
                    <span className="line-clamp-2">
                      Voice of {[...used.campaigns, ...used.projects].join(", ")}
                    </span>
                  </p>
                )}

                <div className="mt-auto flex gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => void listen(voice)}
                    disabled={listening === voice.id}
                    data-testid="voice-listen"
                  >
                    {listening === voice.id ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 size-3.5" />
                    )}
                    Listen
                  </Button>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditor(voice)}
                      aria-label={`Edit ${voice.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <VoiceEditor open={editorOpen} onOpenChange={setEditorOpen} voice={editing} />
    </AppShell>
  );
}

function ProviderStatus({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean | undefined;
  detail: string;
}) {
  return (
    <div
      className="panel flex items-start gap-2 p-3 text-xs"
      data-testid="provider-status"
      data-ready={ready === undefined ? "unknown" : String(ready)}
    >
      {ready === undefined ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : ready ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div>
        <p className="font-medium">
          {label}{" "}
          {ready === false && (
            <span className="font-normal text-muted-foreground">· not connected</span>
          )}
        </p>
        <p className="mt-0.5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
