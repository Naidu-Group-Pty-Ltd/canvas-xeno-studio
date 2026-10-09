#!/usr/bin/env node
/**
 * Snapshots the Higgsfield model catalogue from the public API docs into
 * catalog.json: every generation workflow with its endpoint, family and the
 * complete JSON schema the API validates requests against.
 *
 *   node scripts/higgsfield/fetch-docs.mjs
 *
 * The docs are crawled from the image and video category pages, through each
 * model family's page, to each workflow page. No credentials are used.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = "https://docs.higgsfield.ai";
const CATEGORIES = [
  { category: "image", path: "/docs/models/image-generation" },
  { category: "video", path: "/docs/models/video-generation" },
];
const OUT = join(dirname(fileURLToPath(import.meta.url)), "catalog.json");

async function page(path) {
  const url = `${DOCS}${path}.md`;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

const unescape = (text) => text.replace(/\\([_*[\]{}<>\\])/g, "$1");

/** Model family cards on a category page. */
function familyCards(markdown) {
  const cards = [];
  const pattern =
    /<a className="featured-model-card" href="(\/docs\/models\/[^"]+)">([\s\S]*?)<\/a>/g;
  for (const match of markdown.matchAll(pattern)) {
    const body = match[2];
    const title = /featured-model-title">([^<]+)</.exec(body)?.[1]?.trim();
    const description = /featured-model-description">([^<]+)</.exec(body)?.[1]?.trim();
    const maker = /featured-model-meta"><span>([^<]+)</.exec(body)?.[1]?.trim();
    cards.push({ path: match[1], title, description, maker });
  }
  return cards;
}

/** Workflow links from a family page's workflow table. */
function workflowLinks(markdown) {
  const section = markdown.split("## Workflows")[1]?.split("\n## ")[0] ?? "";
  return [...section.matchAll(/\|\s*\[([^\]]+)\]\((\/docs\/models\/[^)]+)\)/g)].map((match) => ({
    name: match[1].trim(),
    path: match[2],
  }));
}

/** Constraint lines the docs generate from the schema; the schema itself is kept. */
const GENERATED_LINE =
  /^(Allowed values|Minimum|Maximum|Pattern|Each item|Format|Default|Multiple of)\b/i;

/** The prose the docs give each request field, when there is any. */
function paramDescriptions(markdown) {
  const descriptions = {};
  for (const match of markdown.matchAll(
    /<ParamField body="([^"]+)"[^>]*>([\s\S]*?)<\/ParamField>/g,
  )) {
    const prose = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !GENERATED_LINE.test(line))
      .join(" ")
      // Nested field lists and components are not part of the field's own description.
      .split("<")[0]
      .trim();
    if (prose) descriptions[match[1]] = unescape(prose);
  }
  return descriptions;
}

function parseWorkflow(markdown) {
  const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim() ?? null;
  const endpoint = /\*\*Endpoint ID:\*\* `([^`]+)`/.exec(markdown)?.[1] ?? null;
  const schemaText = /<Accordion title="Complete JSON schema">\s*```json[^\n]*\n([\s\S]*?)```/.exec(
    markdown,
  )?.[1];
  const notes = /## Usage notes\n([\s\S]*?)\n## /.exec(markdown)?.[1] ?? "";
  return {
    title,
    endpoint,
    schema: schemaText ? JSON.parse(schemaText) : null,
    params: paramDescriptions(markdown),
    notes: notes
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("* "))
      .map((line) => unescape(line.slice(2)))
      // Integration boilerplate, not facts about the model.
      .filter((line) => !/HF_API_KEY|IDEMPOTENCY_KEY|example\.com media URLs/.test(line)),
  };
}

const workflows = [];
for (const { category, path } of CATEGORIES) {
  for (const card of familyCards(await page(path))) {
    const family = card.path.split("/").pop();
    for (const link of workflowLinks(await page(card.path))) {
      const parsed = parseWorkflow(await page(link.path));
      workflows.push({
        family,
        family_title: card.title,
        family_description: card.description,
        maker: card.maker,
        category,
        workflow: link.name,
        docs_url: `${DOCS}${link.path}`,
        ...parsed,
      });
    }
  }
}

workflows.sort((a, b) => `${a.family}/${a.docs_url}`.localeCompare(`${b.family}/${b.docs_url}`));
await writeFile(OUT, `${JSON.stringify({ source: DOCS, workflows }, null, 1)}\n`);
console.log(
  `${workflows.length} workflows (${workflows.filter((w) => w.endpoint).length} with endpoints) → ${OUT}`,
);
