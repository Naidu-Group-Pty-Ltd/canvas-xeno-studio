/**
 * The Claude agent that runs Katana: its instructions, its model, the
 * Higgsfield MCP server it reaches and which of that server's tools it may use.
 * Paid tools stop for the studio's credit guard; everything else Katana needs
 * runs without asking. Pure, so the configuration can be tested and hashed.
 */
import type { AgentCreateParams } from "@anthropic-ai/sdk/resources/beta/agents/agents";
import { HIGGSFIELD_MCP_URL } from "./mcp";

export const KATANA_MCP_SERVER = "higgsfield";

/** Higgsfield tools Katana uses that cost nothing: they run without asking. */
export const KATANA_FREE_TOOLS = [
  "get_workflow_instructions",
  "get_workflow_bundle_file",
  "get_preset_instructions",
  "get_presets",
  "sandbox_exec",
  "media_upload",
  "media_confirm",
  "media_import_url",
  "jobs_wait",
  "show_generations",
  "show_generation_by_ids",
  "show_medias",
  "balance",
  "transactions",
  "get_preferences",
  "list_workspaces",
  "create_project",
  "models_explore",
  "show_result",
  "show_katana_result",
  "register_katana_result",
] as const;

/** Higgsfield tools that can spend credits or start a billed run: each call waits for the guard. */
export const KATANA_GUARDED_TOOLS = [
  "generate_image",
  "generate_video",
  "generate_audio",
  "generate_image_batch",
  "generate_video_batch",
  "generate_audio_batch",
  "remove_background",
  "get_katana_config",
] as const;

export type KatanaGuardedTool = (typeof KATANA_GUARDED_TOOLS)[number];

export function isGuardedTool(name: string): name is KatanaGuardedTool {
  return (KATANA_GUARDED_TOOLS as readonly string[]).includes(name);
}

export const KATANA_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type KatanaEffort = (typeof KATANA_EFFORTS)[number];

export const DEFAULT_KATANA_MODEL = "claude-opus-5-5";
export const DEFAULT_KATANA_EFFORT: KatanaEffort = "high";

export const KATANA_SYSTEM_PROMPT = `You run Higgsfield's Katana video workflow for Xeno Studio, a company's internal creative studio. Each session is one Katana run that a member of the team started from the studio's Katana page. Its first message is their request, written the way Higgsfield's own Katana form writes one: a /katana or /katana/<slug> command, an optional brief, a MEDIA: block and an INPUTS: block.

Follow Higgsfield's instructions:
- For /katana/<slug>, first call get_preset_instructions with {"preset": "/katana/<slug>"} and follow what it returns. For /katana, call get_workflow_instructions with {"workflow": "katana"} and follow it. Read the bundled references it names with get_workflow_bundle_file when it says to. Higgsfield's instructions decide how the work is done; this prompt only describes the studio around them.
- The media in the MEDIA: block is already uploaded and confirmed in the team's Higgsfield account. Use those media_ids.
- Do every decode, edit, render and check in Higgsfield's sandbox with sandbox_exec. Your own container has no network access: use its read, grep and glob tools only to read a large tool result that was saved there.
- Don't open Higgsfield's forms, galleries or upload widgets: the person can't see them. If a required input is missing, say in one short line which one and end your turn; they can add it in a follow-up message.

The studio's credit guard:
- The first message states the run's credit limit, a numeric budget for the whole run. Every paid call (generate_image, generate_video, generate_audio, their batch forms and remove_background) waits while the studio prices that exact call with Higgsfield's own quote, and goes ahead only while the run's limit has room. A quote (params.get_cost: true) always goes ahead. get_katana_config goes ahead for a paid run (free_generation: false).
- A denied call created no job and no charge, and its message says why. Never resend a denied call unchanged and never split it up to get past the limit: rework the plan within the credits left, or finish with what is done and say plainly what couldn't be made.
- Don't use unlimited or free generations (use_unlim, use_free_gens, free_generation: true) unless the first message asks for them.

Talking to the studio:
- The person who started the run reads your messages on its page. Keep progress notes short and plain. As Katana's instructions say, don't ask questions or wait for answers. The person may send a follow-up message with changes; treat it as their latest instruction for this same run.
- Post Katana's RESUME lines when its instructions say to.
- When you deliver the finished video (after show_result with action "katana_video"), end that message with exactly one line:
  XENO_RESULT media_id=<the final video's confirmed media_id> url=<its https URL, if you have one>
- If you stop without a finished video, end with exactly one line:
  XENO_RESULT none reason=<a short reason>`;

export interface KatanaAgentOptions {
  model: string;
  effort: KatanaEffort;
}

/** The agent's whole configuration (also what its saved version is compared against). */
export function katanaAgentConfig(options: KatanaAgentOptions): AgentCreateParams {
  return {
    name: "Xeno Studio · Katana",
    description:
      "Runs Higgsfield's Katana video workflow for Xeno Studio, behind the studio's credit guard.",
    model: { id: options.model, effort: options.effort },
    system: KATANA_SYSTEM_PROMPT,
    mcp_servers: [{ type: "url", name: KATANA_MCP_SERVER, url: HIGGSFIELD_MCP_URL }],
    tools: [
      {
        type: "agent_toolset_20260401",
        default_config: { enabled: false, permission_policy: { type: "always_allow" } },
        configs: [
          { name: "read", enabled: true },
          { name: "grep", enabled: true },
          { name: "glob", enabled: true },
        ],
      },
      {
        type: "mcp_toolset",
        mcp_server_name: KATANA_MCP_SERVER,
        default_config: { enabled: false, permission_policy: { type: "always_ask" } },
        configs: [
          ...KATANA_FREE_TOOLS.map((name) => ({
            name,
            enabled: true,
            permission_policy: { type: "always_allow" as const },
          })),
          ...KATANA_GUARDED_TOOLS.map((name) => ({
            name,
            enabled: true,
            permission_policy: { type: "always_ask" as const },
          })),
        ],
      },
    ],
    metadata: { app: "xeno-studio", feature: "katana" },
  };
}
