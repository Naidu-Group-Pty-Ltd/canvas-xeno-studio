/**
 * Suggests a brand's DNA for a kit: the studio's AI reads it from what the
 * kit already knows (what the brand is, its audience, personality, voice,
 * look and rules) and, when the kit has a website, the site's own words and
 * profiles. A person looks it over before it is kept.
 */
import { AppError } from "../higgsfield/errors";
import { brandBrief, designOf } from "./design";
import { dnaOf, type BrandDna } from "./dna";
import { DNA_FIELDS, DNA_SCHEMA } from "./dna-read";
import type { DnaSuggestRequest } from "./dna-request";

const SYSTEM = `You read a brand's DNA, for a video studio that plans, scripts and makes its images and videos. The evidence is what the studio knows about the brand (what it is, its audience, personality, voice, look and rules) and, when given, its website's headings, buttons, profiles and text.

Answer with:
${DNA_FIELDS}

Never invent facts, claims or proof the evidence doesn't state; leave a field empty instead.`;

/** The website's words and profiles, briefly (null when it can't be read in time). */
async function siteText(website: string): Promise<{ url: string; text: string } | null> {
  const { siteUrlOf } = await import("./imports.server");
  const { decodeText, fetchCapped } = await import("./fetch.server");
  const { isSocialProfile, scanHtml } = await import("./scan-html");
  const url = siteUrlOf(website);
  if (!url) return null;
  const page = await fetchCapped(url, {
    maxBytes: 4 * 1024 * 1024,
    timeoutMs: 15_000,
    accept: ["text/html", "application/xhtml"],
    headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
  });
  if (!page.ok) return null;
  const html = scanHtml(decodeText(page.bytes, page.type), page.url);
  const profiles = [
    ...new Set([...html.socials, ...html.jsonLd.sameAs.filter(isSocialProfile)]),
  ].slice(0, 12);
  const lines = [
    `Website: ${page.url}`,
    html.title ? `Page title: ${html.title}` : null,
    html.description ? `Description: ${html.description}` : null,
    html.jsonLd.slogan ? `Slogan: ${html.jsonLd.slogan}` : null,
    html.headings.length ? `Headings: ${html.headings.join(" | ")}` : null,
    html.ctas.length ? `Buttons: ${html.ctas.join(" | ")}` : null,
    profiles.length ? `Profiles elsewhere: ${profiles.join(" | ")}` : null,
    html.text ? `Page text:\n${html.text.slice(0, 6000)}` : null,
  ].filter((line): line is string => !!line);
  return { url: page.url, text: lines.join("\n") };
}

export async function suggestBrandDna(
  input: DnaSuggestRequest,
): Promise<{ dna: BrandDna; model: string | null; read: string[] }> {
  const design = designOf(input.design);
  const read = ["what the kit knows"];
  const known = brandBrief({
    name: input.name,
    tagline: input.tagline,
    callToAction: input.callToAction,
    website: input.website,
    palette: [],
    design,
    terms: input.terms,
  });
  const site = input.website ? await siteText(input.website).catch(() => null) : null;
  if (site) read.push(site.url.replace(/^https:\/\//, "").replace(/\/$/, ""));

  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("director");
  if (!route)
    throw new AppError("PROVIDER_NOT_CONFIGURED", "No AI model is set up to read the brand");
  const result = await route.provider.generateStructured({
    system: SYSTEM,
    input: [`WHAT THE STUDIO KNOWS:\n${known}`, site ? `THE WEBSITE:\n${site.text}` : null]
      .filter(Boolean)
      .join("\n\n"),
    schemaName: "brand_dna",
    schema: DNA_SCHEMA,
    model: route.model,
    timeoutMs: 120_000,
  });
  if (!result.ok || !result.data)
    throw new AppError(
      "PROVIDER_REJECTED",
      result.errorMessage ?? "The AI couldn't read the brand",
    );
  // The formulas it works with are picked by a person, not read.
  return {
    dna: { ...dnaOf(result.data), formulas: [] },
    model: result.model ?? route.model,
    read,
  };
}
