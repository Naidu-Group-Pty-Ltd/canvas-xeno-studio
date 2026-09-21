import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";

/**
 * Asset intelligence: structured AI description and quality review.
 *
 * Runs entirely server-side. A failed analysis never changes the asset itself —
 * the media stays fully usable and the analysis can simply be run again.
 */

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "subjects", "style", "strengths", "issues", "quality_score", "usable"],
  properties: {
    summary: { type: "string" },
    subjects: { type: "array", items: { type: "string" } },
    style: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    quality_score: { type: "integer", minimum: 1, maximum: 5 },
    prompt_adherence: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    usable: { type: "boolean" },
  },
} as const;

export interface AssetAnalysis {
  summary: string;
  subjects: string[];
  style: string;
  strengths: string[];
  issues: string[];
  quality_score: number;
  prompt_adherence?: number | null;
  usable: boolean;
  analysed_at: string;
  model: string;
  source: "ai_evaluation";
}

export const analyseAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ assetId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,is_active")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.is_active) throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");

    const { openAIReasoningProvider, reasoningConfigured } = await import("./reasoning/provider.server");
    if (!reasoningConfigured())
      throw new AppError("UNKNOWN", "Reasoning provider not configured — add the reasoning key to enable analysis.");

    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("id,asset_type,storage_bucket,storage_path,metadata,generation_id")
      .eq("id", data.assetId)
      .maybeSingle();
    if (!asset) throw new AppError("UNKNOWN", "Asset not found");
    if (asset.asset_type !== "image")
      throw new AppError("UNKNOWN", "Only images can be analysed automatically in this version.");

    const { data: signed } = await supabaseAdmin.storage
      .from(asset.storage_bucket)
      .createSignedUrl(asset.storage_path, 600);
    if (!signed?.signedUrl) throw new AppError("STORAGE_FAILED", "The asset could not be read for analysis.");

    let prompt: string | null = null;
    if (asset.generation_id) {
      const { data: generation } = await supabaseAdmin
        .from("generations")
        .select("prompt")
        .eq("id", asset.generation_id)
        .maybeSingle();
      prompt = generation?.prompt ?? null;
    }

    const { data: settingRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "qc_model")
      .maybeSingle();
    const model = typeof settingRow?.value === "string" ? settingRow.value : "gpt-5.6-sol";

    const result = await openAIReasoningProvider.generateStructured<Omit<AssetAnalysis, "analysed_at" | "model" | "source">>({
      system:
        "You are a senior creative director reviewing a generated image for an internal studio. Be concise, concrete and honest. Never invent technical metadata.",
      input: prompt
        ? `Review this image against the prompt it was generated from.\nPrompt: ${prompt}`
        : "Describe and review this image for library cataloguing and quality control.",
      schemaName: "asset_analysis",
      schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      model,
      images: [signed.signedUrl],
    });

    if (!result.ok || !result.data)
      throw new AppError("UNKNOWN", result.errorMessage ?? "The analysis could not be completed. Try again.");

    const analysis: AssetAnalysis = {
      ...result.data,
      analysed_at: new Date().toISOString(),
      model: result.model ?? model,
      source: "ai_evaluation",
    };

    const metadata = { ...((asset.metadata as Record<string, unknown>) ?? {}), analysis };
    await supabaseAdmin.from("assets").update({ metadata: metadata as never }).eq("id", asset.id);

    return analysis;
  });
