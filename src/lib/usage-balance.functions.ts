import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import {
  balanceInUsd,
  DEFAULT_CREDITS_PER_USD,
  HIGGSFIELD_CONSOLE_URL,
  higgsfieldBalanceView,
  quotedRate,
  readRecordedBalance,
  readSpend,
  startOfToday,
} from "./usage-balance";

/**
 * The balances the top bar shows (see ./usage-balance): the Higgsfield API
 * balance, estimated from the figure an admin recorded from the Higgsfield
 * Console, and Katana's credits on the connected Higgsfield account. Every
 * member sees them; only an admin records the Console's figure.
 */

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

async function member(userId: string) {
  const supabaseAdmin = await db();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active,role,full_name,email")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return data;
}

const BALANCE_KEY = "higgsfield_api_balance";
const KATANA_KEY = "katana_balance";
/** Katana's credits are asked for again only once the last answer is this old. */
const KATANA_FRESH_MS = 60_000;

interface KatanaBalance {
  credits: number;
  plan: string | null;
  at: string;
}

function readKatanaBalance(value: unknown): KatanaBalance | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const credits = typeof record["credits"] === "number" ? record["credits"] : null;
  const at = typeof record["at"] === "string" ? record["at"] : null;
  if (credits === null || !Number.isFinite(credits) || !at) return null;
  return { credits, plan: typeof record["plan"] === "string" ? record["plan"] : null, at };
}

async function spendSince(since: string) {
  const supabaseAdmin = await db();
  const { data, error } = await supabaseAdmin.rpc("higgsfield_api_spend_since", {
    p_since: since,
  });
  // Without migration 0016 there is nothing to count from: shown as unknown.
  if (error) {
    console.error("higgsfield spend not read", { message: error.message });
    return null;
  }
  return readSpend(data);
}

/** Katana's last known credits: the newer of the last check and the last run's own reading. */
async function katanaBalance(cached: KatanaBalance | null): Promise<KatanaBalance | null> {
  const supabaseAdmin = await db();
  const { data } = await supabaseAdmin
    .from("katana_runs")
    .select("balance_start,balance_end,created_at,updated_at")
    .or("balance_start.not.is.null,balance_end.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fromRun: KatanaBalance | null = data
    ? data.balance_end !== null
      ? { credits: Number(data.balance_end), plan: null, at: data.updated_at }
      : { credits: Number(data.balance_start), plan: null, at: data.created_at }
    : null;
  if (!fromRun) return cached;
  if (!cached || Date.parse(fromRun.at) > Date.parse(cached.at)) {
    return { ...fromRun, plan: cached?.plan ?? null };
  }
  return cached;
}

export const getUsageBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    // Midnight where the viewer is, for "today".
    z.object({ today: z.string().max(40).nullable().default(null) }).parse(data ?? {}),
  )
  .handler(async ({ data: input, context }) => {
    await member(context.userId);
    const supabaseAdmin = await db();
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("key,value")
      .in("key", [BALANCE_KEY, KATANA_KEY]);
    const value = (key: string) => settings?.find((row) => row.key === key)?.value ?? null;
    const recorded = readRecordedBalance(value(BALANCE_KEY));
    const now = new Date();
    const [spend, today] = await Promise.all([
      recorded ? spendSince(recorded.at) : Promise.resolve(null),
      spendSince(startOfToday(input.today, now)),
    ]);
    const { higgsfieldConnectionStatus } = await import("./katana/connection.server");
    const connection = await higgsfieldConnectionStatus().catch(() => null);
    const katanaConnected = connection?.status === "connected";
    return {
      higgsfield: higgsfieldBalanceView({ recorded, spend, today, now }),
      katana: {
        connected: katanaConnected,
        account: katanaConnected
          ? (connection?.accountEmail ?? connection?.accountName ?? null)
          : null,
        balance: katanaConnected ? await katanaBalance(readKatanaBalance(value(KATANA_KEY))) : null,
      },
      consoleUrl: HIGGSFIELD_CONSOLE_URL,
    };
  });

/** The credits-to-dollars rate Higgsfield's latest estimate quoted. */
async function creditsPerUsd(): Promise<number> {
  const supabaseAdmin = await db();
  const { data } = await supabaseAdmin
    .from("generation_events")
    .select("payload")
    .eq("event_type", "estimate_received")
    .order("created_at", { ascending: false })
    .limit(20);
  for (const row of data ?? []) {
    const payload = row.payload as Record<string, unknown> | null;
    const rate = quotedRate(payload?.["provider_estimate"]);
    if (rate) return rate;
  }
  return DEFAULT_CREDITS_PER_USD;
}

/** An admin records the balance the Higgsfield Console shows, in dollars or credits. */
export const recordHiggsfieldBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        amount: z.number().finite().min(0).max(10_000_000),
        unit: z.enum(["usd", "credits"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const profile = await member(context.userId);
    if (profile.role !== "admin")
      throw new AppError("NOT_AUTHORIZED", "Only an admin can record the Higgsfield balance");
    const rate = await creditsPerUsd();
    const usd = balanceInUsd(data.amount, data.unit, rate);
    const supabaseAdmin = await db();
    const at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("app_settings").upsert({
      key: BALANCE_KEY,
      value: {
        usd,
        credits: data.unit === "credits" ? data.amount : null,
        credits_per_usd: rate,
        at,
        by: context.userId,
        by_name: profile.full_name ?? profile.email,
      },
      updated_by: context.userId,
      updated_at: at,
    });
    if (error) throw new AppError("STORAGE_FAILED", "The balance couldn't be saved");
    return { usd, at };
  });

/** Asks Higgsfield for Katana's credits again (at most once a minute). */
export const refreshKatanaBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await member(context.userId);
    const supabaseAdmin = await db();
    const { data: row } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", KATANA_KEY)
      .maybeSingle();
    const cached = readKatanaBalance(row?.value);
    if (cached && Date.now() - Date.parse(cached.at) < KATANA_FRESH_MS) return cached;
    const { testHiggsfieldConnection } = await import("./katana/service.server");
    const { credits, plan } = await testHiggsfieldConnection();
    if (credits === null)
      throw new AppError("PROVIDER_REJECTED", "Higgsfield didn't report the account's credits");
    const fresh: KatanaBalance = { credits, plan, at: new Date().toISOString() };
    await supabaseAdmin.from("app_settings").upsert({
      key: KATANA_KEY,
      value: fresh as never,
      updated_at: fresh.at,
    });
    return fresh;
  });
