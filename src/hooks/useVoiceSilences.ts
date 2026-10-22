import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getLipSyncVoiceover, prepareLipSyncVoiceover } from "@/lib/lip-sync.functions";
import { voiceNeedsNoConfirmation } from "@/lib/lip-sync/view";
import { measuredVoice, type MeasuredVoice } from "@/lib/edit/voice-pauses";
import { useVoiceovers } from "./useVoiceData";

export interface VoiceSilencesState {
  /** Whether its silences are known yet, being measured, or can't be measured. */
  status: "loading" | "unmeasured" | "preparing" | "ready" | "failed";
  voice: MeasuredVoice | null;
  /** A recording someone made: they confirm the voice in it may be used before it is measured. */
  needsConfirmation: boolean;
  errorMessage: string | null;
  /** Has its silences measured (again, after a failure); `confirmed` is the person's say-so. */
  measure: (confirmed: boolean) => Promise<void>;
  busy: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * A voiceover's measured silences, where it may be held open: from its
 * preparation (the media service's measurement of where it speaks, made once
 * and kept), with the words of the take it is, else those its transcription
 * found. Nothing is measured until asked: `measure` prepares it.
 */
export function useVoiceSilences(input: {
  assetId: string;
  projectId: string | null;
  sequenceId: string | null;
  /** False to look nothing up (there's no voiceover yet). */
  enabled?: boolean;
}): VoiceSilencesState {
  const { assetId, projectId } = input;
  const enabled = input.enabled !== false;
  const queryClient = useQueryClient();
  const file = useQuery({
    queryKey: ["voice-silences-file", assetId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("assets")
        .select("id,metadata")
        .eq("id", assetId)
        .maybeSingle();
      return data ?? null;
    },
  });
  // A file a preparation made is read through its own preparation.
  const madeBy = asRecord(asRecord(file.data?.metadata)["lip_sync_voiceover"])["preparation_id"];
  const preparationId = typeof madeBy === "string" ? madeBy : null;
  const preparation = useQuery({
    queryKey: ["voice-silences", assetId, preparationId],
    enabled: enabled && file.isSuccess,
    queryFn: () => getLipSyncVoiceover({ data: preparationId ? { preparationId } : { assetId } }),
    refetchInterval: (query) => (query.state.data?.status === "preparing" ? 2500 : false),
  });
  const { data: takes = [] } = useVoiceovers(input.sequenceId);
  const takeWords = takes.find((take) => take.asset_id === assetId)?.alignment?.words;

  const [busy, setBusy] = useState(false);
  const measure = useCallback(
    async (confirmed: boolean) => {
      setBusy(true);
      try {
        const result = await prepareLipSyncVoiceover({ data: { assetId, projectId, confirmed } });
        queryClient.setQueryData(["voice-silences", assetId, preparationId], result);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The voiceover's silences couldn't be measured",
        );
      } finally {
        setBusy(false);
      }
    },
    [assetId, projectId, preparationId, queryClient],
  );

  const data = preparation.data ?? null;
  const analysis = data?.status === "ready" ? data.analysis : null;
  const voice = useMemo(
    () =>
      analysis
        ? measuredVoice({
            duration: analysis.samples / analysis.sample_rate,
            speech: analysis.speech,
            clear: analysis.clear_pauses,
            words: takeWords?.length ? takeWords : (data?.words ?? []),
          })
        : null,
    [analysis, takeWords, data?.words],
  );
  const status: VoiceSilencesState["status"] =
    file.isLoading || preparation.isLoading
      ? "loading"
      : !data
        ? "unmeasured"
        : data.status === "preparing"
          ? "preparing"
          : voice
            ? "ready"
            : "failed";
  return {
    status,
    voice,
    needsConfirmation: file.data ? !voiceNeedsNoConfirmation(file.data.metadata) : true,
    errorMessage: data?.status === "failed" ? data.errorMessage : null,
    measure,
    busy,
  };
}
