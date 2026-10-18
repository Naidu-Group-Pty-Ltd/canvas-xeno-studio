/**
 * How alike AI images of a character come out: the studio's AI scores each
 * image against the person's own images (those a Soul ID was trained on, or
 * their reference sheet) for identity alone, 0–10. Used to prove a Soul ID
 * before it is relied on, and to pick the images of a training pack worth
 * training on. Clothes, pose, light and style never count against an image.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SYSTEM = `You judge whether AI-generated images show the same person as a set of reference images. Score identity only: the face (shape, eyes, nose, mouth, jaw, brows), apparent age, skin tone, and hair (colour, length, texture) as far as a hairstyle change wouldn't explain it.

For each candidate image give a score from 0 to 10:
- 10: unmistakably the same person.
- 8–9: the same person; small drift only a close look finds.
- 6–7: resembles them; a viewer who knows them might doubt it.
- 4–5: shares traits (age, hair, skin tone) but looks like someone else.
- 0–3: a different person, or no clear face.

Ignore clothing, pose, expression, camera angle, lens, lighting, colour grading, background and image style. Notes: a few words on what differs (or "matches" when nothing does). Then a one-sentence summary of how consistent the candidates are.`;

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          image: { type: "number" },
          score: { type: "number" },
          notes: { type: "string" },
        },
        required: ["image", "score", "notes"],
      },
    },
    summary: { type: "string" },
  },
  required: ["images", "summary"],
};

/** The most reference images, and candidates, one scoring looks at. */
export const LIKENESS_LIMITS = { references: 6, candidates: 12 } as const;

async function signed(bucket: string, path: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 900);
  return data?.signedUrl ?? null;
}

export type LikenessScoring =
  | {
      ok: true;
      perImage: { assetId: string; score: number; notes: string }[];
      summary: string;
      model: string | null;
    }
  | { ok: false; message: string };

/** Scores `candidates` against `references` (the person's own images), each 0–10. */
export async function scoreLikeness(input: {
  name: string;
  references: { bucket: string; path: string }[];
  candidates: { assetId: string; bucket: string; path: string }[];
  timeoutMs?: number;
}): Promise<LikenessScoring> {
  const references = input.references.slice(0, LIKENESS_LIMITS.references);
  const candidates = input.candidates.slice(0, LIKENESS_LIMITS.candidates);
  if (!references.length) return { ok: false, message: "No images of the person to compare with" };
  if (!candidates.length) return { ok: false, message: "No images to score" };
  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("qc");
  if (!route) return { ok: false, message: "No AI model is set up to compare faces" };

  const referenceUrls: string[] = [];
  for (const image of references) {
    const url = await signed(image.bucket, image.path);
    if (url) referenceUrls.push(url);
  }
  const shown: { assetId: string; url: string }[] = [];
  for (const image of candidates) {
    const url = await signed(image.bucket, image.path);
    if (url) shown.push({ assetId: image.assetId, url });
  }
  if (!referenceUrls.length || !shown.length)
    return { ok: false, message: "The images couldn't be read" };

  const result = await route.provider.generateStructured<{
    images?: { image?: number; score?: number; notes?: string }[];
    summary?: string;
  }>({
    system: SYSTEM,
    input: [
      `PERSON: ${input.name}`,
      `Images 1 to ${referenceUrls.length} are the reference images of them.`,
      `Images ${referenceUrls.length + 1} to ${referenceUrls.length + shown.length} are the candidates, numbered 1 to ${shown.length} in your answer.`,
    ].join("\n"),
    schemaName: "likeness",
    schema: SCHEMA,
    model: route.model,
    images: [...referenceUrls, ...shown.map((entry) => entry.url)],
    timeoutMs: Math.min(90_000, Math.max(10_000, input.timeoutMs ?? 75_000)),
  });
  if (!result.ok || !result.data)
    return {
      ok: false,
      message: result.errorMessage ?? "The likeness couldn't be scored. Try again.",
    };
  const perImage = shown.flatMap((entry, index) => {
    const answer = (result.data?.images ?? []).find((item) => Number(item.image) === index + 1);
    const score = Number(answer?.score);
    return Number.isFinite(score)
      ? [
          {
            assetId: entry.assetId,
            score: Math.max(0, Math.min(10, score)),
            notes: String(answer?.notes ?? "").slice(0, 200),
          },
        ]
      : [];
  });
  if (!perImage.length) return { ok: false, message: "No scores came back. Try again." };
  return {
    ok: true,
    perImage,
    summary: String(result.data.summary ?? "").slice(0, 400),
    model: result.model ?? route.model,
  };
}
