/**
 * What a stage is checked against (see ./stage-check), from the database:
 * the Higgsfield API balance as the studio counts it (the figure an admin
 * recorded from the Console, less what was spent and is held since), and
 * what the spending limit that applies says about an amount: the project's
 * or campaign's, or the member's monthly cap for work outside both.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { stageVerdict, type SpendLimit, type StageTotals, type StageVerdict } from "./stage-check";
import {
  higgsfieldBalanceView,
  readRecordedBalance,
  readSpend,
  type HiggsfieldBalanceView,
} from "./usage-balance";

/**
 * The Higgsfield API balance now. With no figure recorded it has no estimate,
 * but still says whether Higgsfield has turned work away for want of
 * credits. Null when the database can't say (before migration 0016).
 */
export async function higgsfieldBalance(now = new Date()): Promise<HiggsfieldBalanceView | null> {
  const { data: setting } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "higgsfield_api_balance")
    .maybeSingle();
  const recorded = readRecordedBalance(setting?.value ?? null);
  const since = recorded?.at ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin.rpc("higgsfield_api_spend_since", { p_since: since });
  if (error)
    return recorded ? higgsfieldBalanceView({ recorded, spend: null, today: null, now }) : null;
  const spend = readSpend(data);
  return recorded
    ? higgsfieldBalanceView({ recorded, spend, today: null, now })
    : higgsfieldBalanceView({ recorded: null, spend: null, today: spend, now });
}

/**
 * What the spending limit that applies says about spending `amount` more:
 * the project's and campaign's (check_spend_allowance), else the member's own
 * monthly cap. A limit the database can't check yet allows it, as a single
 * generation's check does.
 */
export async function spendLimit(input: {
  userId: string;
  projectId: string | null;
  campaignId: string | null;
  amount: number;
}): Promise<SpendLimit> {
  const amount = Math.max(0, input.amount);
  if (!input.projectId && !input.campaignId) {
    const { memberAllowance } = await import("./generation-create.server");
    const verdict = await memberAllowance(input.userId, amount);
    return {
      allowed: verdict.allowed,
      message: verdict.message ?? null,
      warning: verdict.warning ?? null,
    };
  }
  const { data } = await supabaseAdmin.rpc("check_spend_allowance", {
    _project_id: (input.projectId ?? null) as string,
    _campaign_id: (input.campaignId ?? null) as string,
    _amount: amount,
  });
  const verdict = (data ?? {}) as { allowed?: boolean; message?: string; warning?: string | null };
  return verdict.allowed === false
    ? {
        allowed: false,
        message: verdict.message ?? "the spending limit set for this work.",
        warning: null,
      }
    : { allowed: true, message: null, warning: verdict.warning ?? null };
}

/** Whether a priced stage fits: its total with the allowance against the balance and the limit. */
export async function checkStage(input: {
  userId: string;
  projectId: string | null;
  campaignId: string | null;
  totals: StageTotals;
  allowUnpriced?: boolean;
}): Promise<StageVerdict> {
  const [balance, limit] = await Promise.all([
    higgsfieldBalance(),
    spendLimit({
      userId: input.userId,
      projectId: input.projectId,
      campaignId: input.campaignId,
      amount: input.totals.withAllowanceUsd,
    }),
  ]);
  return stageVerdict({
    totals: input.totals,
    balance,
    limit,
    allowUnpriced: input.allowUnpriced ?? false,
  });
}
