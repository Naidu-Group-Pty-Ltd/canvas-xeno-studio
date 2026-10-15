import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getLipSyncVoiceover,
  prepareLipSyncVoiceover,
  transcribeLipSyncVoiceover,
} from "@/lib/lip-sync.functions";
import { voiceNeedsNoConfirmation, type LipSyncVoiceover } from "@/lib/lip-sync/view";

export interface LipSyncVoiceoverState {
  /** The voiceover's file in the library (the reference attached as driving audio). */
  assetId: string | null;
  /** Its preparation, once asked for: preparing, ready or failed. */
  voiceover: LipSyncVoiceover | null;
  /** Still finding out whether it has been prepared. */
  loading: boolean;
  /** A recording someone must confirm may be used before it is prepared. */
  needsConfirmation: boolean;
  /** Asks for it to be prepared (again, after a failure); `confirmed` is the person's say-so. */
  prepare: (confirmed: boolean) => Promise<void>;
  /** A prepare request is on its way. */
  busy: boolean;
}

/**
 * A voiceover attached as a model's driving audio, made ready to drive lip
 * sync: prepared by the media service once (straight away for a take made in
 * the studio or a recording already confirmed; on the person's confirmation
 * otherwise), followed until it is ready, then transcribed where a
 * transcription service is set up, so clips can be cut at sentence ends.
 */
export function useLipSyncVoiceover(input: {
  assetId: string | null;
  projectId: string | null;
  enabled: boolean;
}): LipSyncVoiceoverState {
  const { assetId, projectId } = input;
  const enabled = input.enabled && !!assetId;
  const queryClient = useQueryClient();

  const file = useQuery({
    queryKey: ["lip-sync-voiceover-file", assetId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("assets")
        .select("id,metadata")
        .eq("id", assetId!)
        .maybeSingle();
      return data ?? null;
    },
  });
  const needsConfirmation = file.data ? !voiceNeedsNoConfirmation(file.data.metadata) : true;

  const preparation = useQuery({
    queryKey: ["lip-sync-voiceover", assetId],
    enabled,
    queryFn: () => getLipSyncVoiceover({ data: { assetId: assetId! } }),
    // Followed while the media service (or the transcription) is at work.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "preparing" || data?.transcriptStatus === "pending" ? 2500 : false;
    },
  });

  const [busy, setBusy] = useState(false);
  const prepare = useCallback(
    async (confirmed: boolean) => {
      if (!assetId) return;
      setBusy(true);
      try {
        const result = await prepareLipSyncVoiceover({
          data: { assetId, projectId, confirmed },
        });
        queryClient.setQueryData(["lip-sync-voiceover", assetId], result);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "The voiceover couldn't be prepared for lip sync",
        );
      } finally {
        setBusy(false);
      }
    },
    [assetId, projectId, queryClient],
  );

  // Nobody needs to confirm anything: prepared as soon as it is attached.
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || !assetId || !file.isSuccess || needsConfirmation) return;
    if (!preparation.isSuccess || preparation.data !== null || started.current.has(assetId)) return;
    started.current.add(assetId);
    void prepare(false);
  }, [
    enabled,
    assetId,
    file.isSuccess,
    needsConfirmation,
    preparation.isSuccess,
    preparation.data,
    prepare,
  ]);

  // Ready: its words are found (best effort; without them clips are cut at pauses alone).
  const transcribing = useRef(new Set<string>());
  const ready = preparation.data?.status === "ready" ? preparation.data : null;
  useEffect(() => {
    if (!ready || ready.transcriptStatus !== "none" || transcribing.current.has(ready.id)) return;
    transcribing.current.add(ready.id);
    void transcribeLipSyncVoiceover({ data: { preparationId: ready.id } })
      .then((result) => queryClient.setQueryData(["lip-sync-voiceover", assetId], result))
      .catch(() => undefined);
  }, [ready, assetId, queryClient]);

  return {
    assetId,
    voiceover: enabled ? (preparation.data ?? null) : null,
    loading: enabled && (preparation.isLoading || file.isLoading),
    needsConfirmation,
    prepare,
    busy,
  };
}
