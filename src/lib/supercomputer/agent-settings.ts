/**
 * How a Supercomputer conversation runs as an agent: the Claude model, how
 * hard it thinks, what it may spend on one action without asking, and the
 * brand it works in. Kept on the thread (supercomputer_threads.settings).
 *
 * Shared by the server, the browser and tests.
 */

export const AGENT_MODELS = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    note: "The deepest thinking: campaigns, long videos, careful critique",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    note: "Fast and capable: everyday drafting and iteration",
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    note: "The quickest: lookups, small edits, quick ideas",
  },
] as const;
export type AgentModel = (typeof AGENT_MODELS)[number]["id"];
export const DEFAULT_AGENT_MODEL: AgentModel = "claude-opus-5-5";

export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AgentEffort = (typeof AGENT_EFFORTS)[number];
export const AGENT_EFFORT_LABELS: Record<AgentEffort, string> = {
  low: "Quick",
  medium: "Balanced",
  high: "Thorough",
  xhigh: "Deep",
  max: "Maximum",
};
export const DEFAULT_AGENT_EFFORT: AgentEffort = "high";

/** The most the agent may ever spend on one action without a person's approval. */
export const AUTO_APPROVE_CAP_USD = 25;

export interface AgentThreadSettings {
  model: AgentModel;
  effort: AgentEffort;
  /** Spend up to this on one action without asking (0: always ask). */
  autoApproveUsd: number;
  /** The brand kit the conversation works in, if any. */
  brandKitId: string | null;
}

export const DEFAULT_THREAD_SETTINGS: AgentThreadSettings = {
  model: DEFAULT_AGENT_MODEL,
  effort: DEFAULT_AGENT_EFFORT,
  autoApproveUsd: 0,
  brandKitId: null,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A thread's settings as stored, with anything unknown or out of range set to its default. */
export function threadSettingsOf(value: unknown): AgentThreadSettings {
  const item = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const model = AGENT_MODELS.find((entry) => entry.id === item["model"])?.id;
  const effort = (AGENT_EFFORTS as readonly string[]).includes(String(item["effort"]))
    ? (item["effort"] as AgentEffort)
    : null;
  const usd = Number(item["autoApproveUsd"]);
  const brand = item["brandKitId"];
  return {
    model: model ?? DEFAULT_AGENT_MODEL,
    effort: effort ?? DEFAULT_AGENT_EFFORT,
    autoApproveUsd: Number.isFinite(usd)
      ? Math.max(0, Math.min(AUTO_APPROVE_CAP_USD, Math.round(usd * 100) / 100))
      : 0,
    brandKitId: typeof brand === "string" && UUID.test(brand) ? brand : null,
  };
}

/** Whether a model takes server-side fallbacks (Haiku 5.5 has none). */
export function takesFallbacks(model: AgentModel): boolean {
  return model !== "claude-haiku-5-5";
}

/** The model's label for people (a fallback model that answered may be one not offered here). */
export function agentModelLabel(model: string): string {
  const known = AGENT_MODELS.find((entry) => entry.id === model);
  if (known) return known.label;
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(model);
  if (!match) return model;
  const family = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1);
  return `Claude ${family} ${match[2]}${match[3] ? `.${match[3]}` : ""}`;
}
