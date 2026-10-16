/**
 * The Anthropic side of Katana: the Managed Agent that runs it, the cloud
 * environment its sessions use and the vault that hands those sessions the
 * team's Higgsfield sign-in. Created once, then kept in step: a changed model
 * or prompt saves a new agent version, and every renewed Higgsfield token is
 * written to the vault.
 */
import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { getSettings } from "../generation-pipeline.server";
import {
  DEFAULT_KATANA_EFFORT,
  DEFAULT_KATANA_MODEL,
  KATANA_EFFORTS,
  katanaAgentConfig,
  type KatanaEffort,
} from "./agent";
import { HIGGSFIELD_MCP_URL } from "./mcp";
import { KATANA_TABLES_MISSING, higgsfieldToken, isMissingTable } from "./connection.server";

type SetupRow = Database["public"]["Tables"]["katana_setup"]["Row"];

const db = supabaseAdmin;
const SETUP = "default";

export function anthropicConfigured(): boolean {
  return !!process.env["ANTHROPIC_API_KEY"];
}

export function webhooksConfigured(): boolean {
  return !!process.env["ANTHROPIC_WEBHOOK_SIGNING_KEY"];
}

let client: Anthropic | null = null;

export function anthropicClient(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Katana runs on Claude: add an ANTHROPIC_API_KEY backend secret first.",
    );
  }
  if (!client) client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return client;
}

export function isApiStatus(error: unknown, ...statuses: number[]): boolean {
  return (
    error instanceof APIError && typeof error.status === "number" && statuses.includes(error.status)
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function katanaAgentOptions(): Promise<{ model: string; effort: KatanaEffort }> {
  const settings = await getSettings();
  const model =
    typeof settings["katana_model"] === "string" && settings["katana_model"].trim()
      ? settings["katana_model"].trim()
      : DEFAULT_KATANA_MODEL;
  const effort = (KATANA_EFFORTS as readonly string[]).includes(String(settings["katana_effort"]))
    ? (settings["katana_effort"] as KatanaEffort)
    : DEFAULT_KATANA_EFFORT;
  return { model, effort };
}

async function readSetup(): Promise<SetupRow | null> {
  const { data, error } = await db.from("katana_setup").select("*").eq("id", SETUP).maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new AppError("PROVIDER_NOT_CONFIGURED", KATANA_TABLES_MISSING);
    throw new AppError("STORAGE_FAILED", error.message);
  }
  return data;
}

async function saveSetup(values: Partial<SetupRow>): Promise<void> {
  const { error } = await db
    .from("katana_setup")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", SETUP);
  if (error) throw new AppError("STORAGE_FAILED", error.message);
}

export interface KatanaSetup {
  agentId: string;
  agentVersion: number;
  environmentId: string;
  vaultId: string;
}

function readyFor(row: SetupRow | null, hash: string): KatanaSetup | null {
  if (
    !row?.agent_id ||
    !row.agent_version ||
    row.config_hash !== hash ||
    !row.environment_id ||
    !row.vault_id
  ) {
    return null;
  }
  return {
    agentId: row.agent_id,
    agentVersion: row.agent_version,
    environmentId: row.environment_id,
    vaultId: row.vault_id,
  };
}

/**
 * The agent, environment and vault, created or brought up to date. One request
 * does the work at a time; another that arrives meanwhile waits for it.
 */
export async function ensureKatanaSetup(): Promise<KatanaSetup> {
  const anthropic = anthropicClient();
  const config = katanaAgentConfig(await katanaAgentOptions());
  const hash = await sha256Hex(JSON.stringify(config));

  const current = await readSetup();
  const ready = readyFor(current, hash);
  if (ready) return ready;

  if (!current) {
    await db
      .from("katana_setup")
      .upsert({ id: SETUP }, { onConflict: "id", ignoreDuplicates: true });
  }
  const now = new Date();
  const { data: claimed } = await db
    .from("katana_setup")
    .update({ claimed_until: new Date(now.getTime() + 90_000).toISOString() })
    .eq("id", SETUP)
    .or(`claimed_until.is.null,claimed_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle();
  if (!claimed) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const done = readyFor(await readSetup(), hash);
      if (done) return done;
    }
    throw new AppError(
      "PROVIDER_TIMEOUT",
      "Katana is being set up by another request. Try again in a minute.",
    );
  }

  try {
    let agentId = claimed.agent_id;
    let agentVersion = claimed.agent_version;
    if (agentId && claimed.config_hash !== hash) {
      try {
        const updated = await anthropic.beta.agents.update(agentId, {
          ...config,
          ...(agentVersion ? { version: agentVersion } : {}),
        });
        agentVersion = updated.version;
      } catch (error) {
        if (isApiStatus(error, 409)) {
          // Saved meanwhile from elsewhere (the Console): update on top of the latest version.
          const latest = await anthropic.beta.agents.retrieve(agentId);
          const updated = await anthropic.beta.agents.update(agentId, {
            ...config,
            version: latest.version,
          });
          agentVersion = updated.version;
        } else if (isApiStatus(error, 404, 400)) {
          // Archived or gone: start a new one.
          agentId = null;
        } else {
          throw error;
        }
      }
    }
    if (!agentId) {
      const created = await anthropic.beta.agents.create(config);
      agentId = created.id;
      agentVersion = created.version;
    }
    await saveSetup({ agent_id: agentId, agent_version: agentVersion, config_hash: hash });

    let environmentId = claimed.environment_id;
    if (!environmentId) {
      const environment = await anthropic.beta.environments.create({
        name: "xeno-studio-katana",
        description: "Katana runs for Xeno Studio. All media work happens in Higgsfield's sandbox.",
        config: {
          type: "cloud",
          networking: { type: "limited", allow_mcp_servers: true, allow_package_managers: false },
        },
        metadata: { app: "xeno-studio", feature: "katana" },
      });
      environmentId = environment.id;
      await saveSetup({ environment_id: environmentId });
    }

    let vaultId = claimed.vault_id;
    if (!vaultId) {
      const vault = await anthropic.beta.vaults.create({
        display_name: "Xeno Studio · Katana",
        metadata: { app: "xeno-studio", feature: "katana" },
      });
      vaultId = vault.id;
      await saveSetup({ vault_id: vaultId, credential_id: null, credential_expires_at: null });
    }
    if (!agentId || !agentVersion)
      throw new AppError("UNKNOWN", "The Katana agent couldn't be saved");
    return { agentId, agentVersion, environmentId, vaultId };
  } finally {
    await db.from("katana_setup").update({ claimed_until: null }).eq("id", SETUP);
  }
}

/** The vault's Higgsfield credential is given this token (created the first time). */
export async function syncVaultCredential(token: {
  accessToken: string;
  expiresAt: string | null;
}): Promise<void> {
  if (!anthropicConfigured()) return;
  const setup = await readSetup().catch(() => null);
  if (!setup?.vault_id) return;
  const anthropic = anthropicClient();
  const synced = {
    credential_expires_at: token.expiresAt,
    credential_synced_at: new Date().toISOString(),
  };

  if (setup.credential_id) {
    try {
      await anthropic.beta.vaults.credentials.update(setup.credential_id, {
        vault_id: setup.vault_id,
        auth: { type: "mcp_oauth", access_token: token.accessToken, expires_at: token.expiresAt },
      });
      await saveSetup(synced);
      return;
    } catch (error) {
      if (!isApiStatus(error, 404, 409, 400)) throw error;
      // Gone or archived: make a new one below.
    }
  }

  try {
    const credential = await anthropic.beta.vaults.credentials.create(setup.vault_id, {
      display_name: "Higgsfield · team account",
      auth: {
        type: "mcp_oauth",
        mcp_server_url: HIGGSFIELD_MCP_URL,
        access_token: token.accessToken,
        expires_at: token.expiresAt,
      },
      metadata: { app: "xeno-studio", feature: "katana" },
    });
    await saveSetup({ credential_id: credential.id, ...synced });
  } catch (error) {
    if (!isApiStatus(error, 409)) throw error;
    // One already holds this server's address (its ID was lost): take it over.
    for await (const credential of anthropic.beta.vaults.credentials.list(setup.vault_id)) {
      if (credential.archived_at || credential.auth.type !== "mcp_oauth") continue;
      if (credential.auth.mcp_server_url.replace(/\/$/, "") !== HIGGSFIELD_MCP_URL) continue;
      await anthropic.beta.vaults.credentials.update(credential.id, {
        vault_id: setup.vault_id,
        auth: { type: "mcp_oauth", access_token: token.accessToken, expires_at: token.expiresAt },
      });
      await saveSetup({ credential_id: credential.id, ...synced });
      return;
    }
    throw error;
  }
}

/** The vault forgets the Higgsfield sign-in (when the account is disconnected). */
export async function forgetVaultCredential(): Promise<void> {
  if (!anthropicConfigured()) return;
  const setup = await readSetup().catch(() => null);
  if (!setup?.vault_id || !setup.credential_id) return;
  try {
    await anthropicClient().beta.vaults.credentials.archive(setup.credential_id, {
      vault_id: setup.vault_id,
    });
  } catch (error) {
    if (!isApiStatus(error, 404, 409, 400)) throw error;
  }
  await saveSetup({ credential_id: null, credential_expires_at: null, credential_synced_at: null });
}

/**
 * Makes sure the vault holds a Higgsfield token with at least `minValidityMs`
 * left (renewing it first when needed), so a session never starts or carries
 * on with one about to lapse.
 */
export async function ensureVaultToken(minValidityMs: number): Promise<void> {
  const token = await higgsfieldToken({ minValidityMs });
  const setup = await readSetup();
  if (!setup?.vault_id) return;
  const vaultExpiry = setup.credential_expires_at ? Date.parse(setup.credential_expires_at) : null;
  const tokenExpiry = token.expiresAt ? Date.parse(token.expiresAt) : null;
  if (setup.credential_id && vaultExpiry === tokenExpiry) return;
  await syncVaultCredential(token);
}
