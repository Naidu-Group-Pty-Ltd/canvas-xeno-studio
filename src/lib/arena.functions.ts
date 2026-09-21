import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";

const voteInput = z.object({
  sessionId: z.string().uuid(),
  winnerEntryId: z.string().uuid(),
  scores: z.record(z.record(z.number().min(1).max(5))).default({}),
  notes: z.string().max(2000).optional(),
});

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertActiveMember(userId: string) {
  const db = await admin();
  const { data } = await db.from("profiles").select("id,is_active").eq("id", userId).maybeSingle();
  if (!data?.is_active) throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
}

/**
 * Records a human arena review and folds it into measured model performance.
 * Ratings are evidence for the router — no model is ever rated by an LLM.
 */
export const submitArenaVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => voteInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const db = await admin();

    const { data: entries, error } = await db
      .from("arena_entries")
      .select("id,model_registry_id,session_id")
      .eq("session_id", data.sessionId);
    if (error) throw new AppError("INVALID_PARAMETERS", error.message);
    if (!entries?.length) throw new AppError("INVALID_PARAMETERS", "That comparison no longer exists");
    if (!entries.some((entry) => entry.id === data.winnerEntryId))
      throw new AppError("INVALID_PARAMETERS", "The winning entry is not part of this comparison");

    // One vote per reviewer per session.
    await db.from("arena_votes").delete().eq("session_id", data.sessionId).eq("voter_id", context.userId);

    const rows = entries.map((entry) => ({
      session_id: data.sessionId,
      entry_id: entry.id,
      voter_id: context.userId,
      is_winner: entry.id === data.winnerEntryId,
      scores: (data.scores[entry.id] ?? {}) as Record<string, number>,
      notes: entry.id === data.winnerEntryId ? (data.notes ?? null) : null,
    }));
    const { error: voteError } = await db.from("arena_votes").insert(rows);
    if (voteError) throw new AppError("INVALID_PARAMETERS", voteError.message);

    await db.from("arena_sessions").update({ status: "reviewed" }).eq("id", data.sessionId);

    // Recompute the human-rating signal per model from all recorded votes.
    for (const entry of entries) {
      await recomputeRating(db, entry.model_registry_id);
    }

    return { ok: true as const };
  });

type Db = Awaited<ReturnType<typeof admin>>;

async function recomputeRating(db: Db, modelId: string | null) {
  if (!modelId) return;
  const { data: entries } = await db.from("arena_entries").select("id").eq("model_registry_id", modelId);
  const entryIds = (entries ?? []).map((row) => row.id);
  if (!entryIds.length) return;

  const { data: votes } = await db.from("arena_votes").select("is_winner,scores").in("entry_id", entryIds);
  if (!votes?.length) return;

  const numbers: number[] = [];
  for (const vote of votes) {
    const scores = (vote.scores ?? {}) as Record<string, number>;
    const values = Object.values(scores).filter((value) => typeof value === "number");
    if (values.length) numbers.push(values.reduce((a, b) => a + b, 0) / values.length);
  }
  const rating = numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
  const wins = votes.filter((vote) => vote.is_winner).length;
  const selectionRate = votes.length ? wins / votes.length : null;

  const { data: existing } = await db
    .from("model_performance_metrics")
    .select("id")
    .eq("model_registry_id", modelId)
    .is("aspect_ratio", null)
    .is("resolution", null)
    .maybeSingle();

  const patch = {
    average_user_rating: rating,
    selection_rate: selectionRate,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) await db.from("model_performance_metrics").update(patch).eq("id", existing.id);
  else
    await db.from("model_performance_metrics").insert({
      model_registry_id: modelId,
      operation: "arena",
      sample_count: votes.length,
      ...patch,
    });
}
