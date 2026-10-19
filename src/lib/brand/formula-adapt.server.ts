/**
 * Writes a proven formula from the library for one brand with the studio's
 * AI: the same beats in the same order, doing the same jobs at about the
 * same timing, but showing and saying what this brand would, for its
 * audiences, offers, proof and distinctive assets, in its voice. A person
 * looks it over before it is kept (see ./own-formulas).
 */
import { AppError } from "../higgsfield/errors";
import { brandBrief, designOf } from "./design";
import { dnaOf } from "./dna";
import { formulaBlock, formulaById, GUARDRAILS, type BrandFormula } from "./formulas";
import { freeId, ownFormulaOf, slugOf } from "./own-formulas";
import type { FormulaAdaptRequest } from "./formula-adapt-request";

const SYSTEM = `You write content formulas for a video studio. A formula is a proven structure for a video or post: a run of beats, each with a job (what it must achieve), what is shown and what is said. You are given one proven formula from the studio's library and one brand. Write that formula for the brand.

Keep the structure, because it is what the evidence supports: the same beats, in the same order, each doing the same job, with about the same share of the running time (shares are seconds at the formula's ideal length; keep each within a third of the original). Keep which beats are a hook or call to action (edge) and which only longer pieces have (from).

Make everything else this brand's:
- label: a short name for the beat in the brand's terms.
- job: the beat's job, made specific to this brand and its audience.
- show: what is on screen, concretely, in the brand's world (its product and offers as it names them, its settings, its distinctive assets). Product beats show the real product interface or footage, never generated imitations of it.
- say: what is said or written (voice-over, captions, on-screen text) in the brand's voice and spelling. Write the actual words where you can; hooks start from its buying moments.
- rules: up to 5 rules for this brand that make the formula work and keep it honest (for example, how its claims must be worded).
- name: at most 5 words, in the brand's own language. summary: one sentence. why: the original formula's evidence in a sentence, then one sentence on why it suits this brand, from what the brand states.

Never invent facts, numbers, results, customers, testimonials, awards or certifications. Claim only what the brand's proof states, worded as carefully as it is stated there. Keep every guardrail. If the brand states no proof that fits a proof beat, the beat shows the product doing the thing rather than claiming a result.`;

const TEXT = { type: "string" };
const TEXTS = { type: "array", items: { type: "string" } };

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    name: TEXT,
    summary: TEXT,
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: TEXT,
          label: TEXT,
          share: { type: "number" },
          edge: { type: "boolean" },
          from: { type: ["number", "null"] },
          job: TEXT,
          show: TEXT,
          say: TEXT,
        },
        required: ["key", "label", "share", "edge", "from", "job", "show", "say"],
      },
    },
    rules: TEXTS,
    avoid: TEXTS,
    why: TEXT,
    cadence: { type: ["string", "null"] },
  },
  required: ["name", "summary", "beats", "rules", "avoid", "why", "cadence"],
};

/** The library formula as the AI reads it: written out, and its beats as data. */
function formulaEvidence(formula: BrandFormula, request: FormulaAdaptRequest): string {
  return [
    formulaBlock(formula, { seconds: request.seconds ?? null, channel: request.channel ?? null }),
    `ITS BEATS (JSON): ${JSON.stringify(
      formula.beats.map(({ key, label, share, edge, from, job, show, say }) => ({
        key,
        label,
        share,
        edge: !!edge,
        from: from ?? null,
        job,
        show,
        say,
      })),
    )}`,
    `ITS GUARDRAILS (keep every one): ${formula.guardrails
      .flatMap((key) => (GUARDRAILS[key] ? [GUARDRAILS[key]!.rule] : []))
      .join("; ")}`,
  ].join("\n\n");
}

export async function adaptFormulaForBrand(
  request: FormulaAdaptRequest,
): Promise<{ formula: BrandFormula; model: string | null }> {
  const base = formulaById(request.formulaId);
  if (!base || base.own)
    throw new AppError("INVALID_PARAMETERS", "That formula isn't in the library");
  const dna = dnaOf(request.brand.dna);
  const brief = brandBrief({
    name: request.brand.name,
    tagline: request.brand.tagline,
    callToAction: request.brand.callToAction,
    website: request.brand.website,
    palette: [],
    design: designOf(request.brand.design),
    terms: request.brand.terms,
    dna,
  });
  const audience = request.audience
    ? (dna.audiences.find((entry) => entry.name === request.audience) ?? null)
    : null;

  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("director");
  if (!route)
    throw new AppError("PROVIDER_NOT_CONFIGURED", "No AI model is set up to write formulas");
  const result = await route.provider.generateStructured<Record<string, unknown>>({
    system: SYSTEM,
    input: [
      `THE FORMULA:\n${formulaEvidence(base, request)}`,
      `THE BRAND:\n${brief}`,
      audience
        ? `WRITE IT FOR THIS AUDIENCE: ${audience.name}${audience.job ? `; they hire the brand to ${audience.job}` : ""}${audience.pain ? `; held back by ${audience.pain}` : ""}`
        : null,
      request.channel || request.seconds
        ? `IT WILL RUN${request.channel ? ` on ${request.channel}` : ""}${request.seconds ? ` at about ${request.seconds} seconds` : ""}.`
        : null,
      request.note ? `THE PERSON ALSO ASKS: ${request.note}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schemaName: "brand_formula",
    schema: SCHEMA,
    model: route.model,
    timeoutMs: 150_000,
  });
  if (!result.ok || !result.data)
    throw new AppError(
      "PROVIDER_REJECTED",
      result.errorMessage ?? "The AI couldn't write the formula",
    );

  const answer = result.data;
  const name = typeof answer["name"] === "string" ? answer["name"] : base.name;
  const stem =
    slugOf(`${request.brand.name} ${name}`) || slugOf(`${request.brand.name} ${base.id}`);
  const id = freeId(stem || base.id, (id) => request.taken.includes(id) || !!formulaById(id));
  // What the AI can't change comes from the library formula.
  const formula = ownFormulaOf({
    ...answer,
    id,
    origin: `Written for ${request.brand.name}, after ${base.name}`,
    purpose: base.purpose,
    goals: base.goals,
    fit: base.fit,
    markets: base.markets,
    channels: request.channel
      ? [request.channel, ...base.channels.filter((channel) => channel !== request.channel)]
      : base.channels,
    faces: base.faces,
    seconds: base.seconds,
    shapes: base.shapes,
    guardrails: base.guardrails,
    grade: base.grade,
    sources: base.sources,
    own: {
      basedOn: [base.id],
      audience: audience?.name ?? null,
      cadence: typeof answer["cadence"] === "string" ? answer["cadence"] : null,
    },
  });
  if (!formula || formula.beats.length < Math.min(2, base.beats.length))
    throw new AppError("PROVIDER_REJECTED", "The AI's formula didn't hold together. Try again.");
  return { formula, model: result.model ?? route.model };
}
