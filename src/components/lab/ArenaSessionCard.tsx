import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitArenaVote } from "@/lib/arena.functions";
import type { AssetRow, GenerationRow } from "@/hooks/useStudioData";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { cn } from "@/lib/utils";

const IMAGE_CRITERIA = ["Prompt adherence", "Visual quality", "Reference fidelity", "Realism", "Composition", "Text accuracy"];
const VIDEO_CRITERIA = [...IMAGE_CRITERIA, "Motion", "Temporal stability"];

export interface ArenaEntry {
  id: string;
  model_registry_id: string | null;
  generation_id: string | null;
}

interface Props {
  session: { id: string; prompt: string; media_type: string | null; status: string | null; blind_review?: boolean | null };
  entries: ArenaEntry[];
  models: ModelRegistryEntry[];
  generations: GenerationRow[];
  assets: AssetRow[];
}

export function ArenaSessionCard({ session, entries, models, generations, assets }: Props) {
  const queryClient = useQueryClient();
  const criteria = session.media_type === "video" ? VIDEO_CRITERIA : IMAGE_CRITERIA;
  const [blind, setBlind] = useState(session.blind_review ?? false);
  const [winner, setWinner] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    entries.forEach((entry, index) => {
      const model = models.find((m) => m.id === entry.model_registry_id);
      map[entry.id] = blind ? `Model ${String.fromCharCode(65 + index)}` : (model?.display_name ?? "Model");
    });
    return map;
  }, [entries, models, blind]);

  const reviewed = session.status === "reviewed";

  async function save() {
    if (!winner) return;
    setSaving(true);
    try {
      await submitArenaVote({ data: { sessionId: session.id, winnerEntryId: winner, scores, notes: notes || undefined } });
      await queryClient.invalidateQueries({ queryKey: ["arena_sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["model_performance_metrics"] });
      toast.success("Review saved. It now feeds model intelligence.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The review could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm">{session.prompt}</p>
        <div className="flex items-center gap-2">
          {reviewed && <span className="text-[11px] text-success">Reviewed</span>}
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setBlind((v) => !v)}>
            {blind ? <EyeOff className="mr-1 size-3" /> : <Eye className="mr-1 size-3" />}
            {blind ? "Blind review on" : "Blind review off"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => {
          const generation = generations.find((g) => g.id === entry.generation_id);
          const output = assets.find((a) => a.generation_id === entry.generation_id);
          const isWinner = winner === entry.id;
          return (
            <div
              key={entry.id}
              className={cn(
                "space-y-2 rounded-md border bg-surface-raised p-3",
                isWinner ? "border-primary/60" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm">{labels[entry.id]}</span>
                {generation ? <StatusBadge status={generation.status} /> : null}
              </div>

              <div className="aspect-video overflow-hidden rounded bg-background">
                {output ? (
                  <MediaPreview
                    bucket={output.storage_bucket}
                    path={output.storage_path}
                    type={output.asset_type}
                    controls={output.asset_type === "video"}
                    contain
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
                    {generation?.status === "failed" ? "Failed" : "Waiting for the result"}
                  </div>
                )}
              </div>

              {!reviewed && (
                <>
                  <Button
                    size="sm"
                    variant={isWinner ? "default" : "outline"}
                    className="w-full"
                    disabled={!output}
                    onClick={() => setWinner(entry.id)}
                  >
                    <Trophy className="mr-1 size-3" /> {isWinner ? "Winner" : "Pick as winner"}
                  </Button>

                  <div className="space-y-1.5">
                    {criteria.map((criterion) => (
                      <div key={criterion} className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-muted-foreground">{criterion}</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-label={`${criterion} ${value} of 5`}
                              onClick={() =>
                                setScores((current) => ({
                                  ...current,
                                  [entry.id]: { ...(current[entry.id] ?? {}), [criterion]: value },
                                }))
                              }
                              className={cn(
                                "size-5 rounded border text-[10px]",
                                (scores[entry.id]?.[criterion] ?? 0) >= value
                                  ? "border-primary/60 bg-primary/20"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {!reviewed && (
        <div className="space-y-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why did the winner win? (optional)" />
          <Button size="sm" disabled={!winner || saving} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Save review
          </Button>
        </div>
      )}
    </div>
  );
}
