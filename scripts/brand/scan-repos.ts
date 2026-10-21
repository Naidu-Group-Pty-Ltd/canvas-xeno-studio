/**
 * Reads repositories' design systems the way Xeno Studio's code import does, from the command line:
 *
 *   bun scripts/brand/scan-repos.ts owner/repo=/path/to/checkout ... [--out <dir>]
 *   bun scripts/brand/scan-repos.ts owner/repo ...   # from GitHub (GITHUB_TOKEN for private ones)
 *
 * The first repository is the primary. Writes <out>/design-system.json (everything found, with where)
 * and <out>/tokens.css (the tokens as one stylesheet), and prints a summary.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codeEvidenceText, codeTokensCss, repoLabel } from "../../src/lib/brand/scan-code";
import { scanRepos } from "../../src/lib/brand/scan-repos";
import { checkoutSource, reposFrom } from "./checkout-source";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1]! : null;
const specs = args.filter(
  (arg, index) => !arg.startsWith("--") && (outAt < 0 || index !== outAt + 1),
);
if (!specs.length) {
  console.error("Usage: bun scripts/brand/scan-repos.ts owner/repo[=checkout] ... [--out dir]");
  process.exit(1);
}

const { refs, checkouts } = reposFrom(specs);
const checkout = checkoutSource(checkouts);

const { system, scans, failed } = await scanRepos(refs, checkout, {
  onStage: (stage) => console.error(`· ${stage}`),
});
for (const scan of scans)
  console.log(
    `${repoLabel(scan.ref)} @ ${scan.sha?.slice(0, 7)}: ${scan.readings.length} files read (${scan.plan.files
      .map((file) => file.path)
      .slice(0, 12)
      .join(
        ", ",
      )}${scan.plan.files.length > 12 ? ", …" : ""}); ${scan.plan.skipped.length} skipped; ${scan.failed.length} failed; logos: ${scan.logos.join(", ") || "none"}`,
  );
for (const failure of failed) console.log(`FAILED ${failure.repo}: ${failure.why}`);
console.log("\n" + codeEvidenceText(system));
if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "design-system.json"), JSON.stringify(system, null, 1) + "\n");
  writeFileSync(
    join(out, "tokens.css"),
    codeTokensCss(system, { generatedAt: new Date().toISOString().slice(0, 10) }),
  );
  console.error(`Wrote ${join(out, "design-system.json")} and ${join(out, "tokens.css")}`);
}
