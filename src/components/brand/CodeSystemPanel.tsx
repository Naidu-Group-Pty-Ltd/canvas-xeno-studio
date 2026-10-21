import { useState } from "react";
import { Download, ExternalLink, GitBranch } from "lucide-react";
import { codeTokensCss, type CodeDesignSystem, type ScaleToken } from "@/lib/brand/scan-code";
import type { TokenScheme } from "@/lib/brand/scan-css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Saves text the page made as a file. */
function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const shortName = (repo: string) => repo.split("/")[1] ?? repo;
const where = (item: { path: string; line: number | null }) =>
  `${item.path}${item.line ? `:${item.line}` : ""}`;
const schemeNote = (scheme: TokenScheme) =>
  scheme === "dark" ? "dark" : scheme === "light" ? "light" : scheme === "scoped" ? "scoped" : null;

/** A repository's file at the commit read, on GitHub. */
function fileUrl(system: CodeDesignSystem, repo: string, path: string, line: number | null) {
  const summary = system.repos.find((entry) => entry.label === repo);
  const at = summary?.sha ?? summary?.ref ?? "HEAD";
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;
  const file = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${encodeURIComponent(at)}/${file}${line ? `#L${line}` : ""}`;
}

function Source({
  system,
  repo,
  path,
  line,
}: {
  system: CodeDesignSystem;
  repo: string;
  path: string;
  line: number | null;
}) {
  const href = fileUrl(system, repo, path, line);
  const label = `${shortName(repo)} ${where({ path, line })}`;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      {label}
    </a>
  ) : (
    <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
  );
}

function Scale({
  title,
  tokens,
  system,
}: {
  title: string;
  tokens: ScaleToken[];
  system: CodeDesignSystem;
}) {
  if (!tokens.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{title}</p>
      <ul className="space-y-1">
        {tokens.slice(0, 8).map((token) => (
          <li
            key={`${token.repo} ${token.name} ${token.scheme}`}
            className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 text-[11px]"
          >
            <span className="truncate font-mono" title={token.name}>
              {token.name}
              {schemeNote(token.scheme) && (
                <span className="text-muted-foreground"> ({schemeNote(token.scheme)})</span>
              )}
            </span>
            <span className="min-w-0">
              <span
                className="block truncate font-mono text-muted-foreground"
                title={token.resolved}
              >
                {token.resolved}
              </span>
              <Source system={system} repo={token.repo} path={token.path} line={token.line} />
              {token.alsoIn?.length ? (
                <span className="block text-[10px] text-muted-foreground">
                  The same in {token.alsoIn.map(shortName).join(", ")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What a code import read from the brand's repositories, with where each
 * value is declared: the repositories and the commits read, every colour and
 * the tokens that name it, the typefaces and how each is loaded, the scales,
 * and where the repositories disagree. Its tokens download as one stylesheet.
 */
export function CodeSystemPanel({
  system,
  name,
}: {
  system: CodeDesignSystem;
  /** The brand's name, for the files' names. */
  name: string;
}) {
  const [allColours, setAllColours] = useState(false);
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "brand";
  const colours = allColours ? system.colours : system.colours.slice(0, 16);
  return (
    <div className="space-y-5" data-testid="brand-import-code">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Read from the code of {system.repos.length} repositor
          {system.repos.length === 1 ? "y" : "ies"}, never run. Each value says where it is
          declared.
        </p>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              save(
                `${slug}-tokens.css`,
                codeTokensCss(system, { generatedAt: new Date().toISOString().slice(0, 10) }),
                "text/css",
              )
            }
          >
            <Download className="mr-1.5 size-3.5" /> tokens.css
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() =>
              save(
                `${slug}-design-system.json`,
                `${JSON.stringify(system, null, 2)}\n`,
                "application/json",
              )
            }
          >
            <Download className="mr-1.5 size-3.5" /> JSON
          </Button>
        </div>
      </div>

      <ul className="space-y-1.5">
        {system.repos.map((repo) => (
          <li
            key={repo.label}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-xs"
          >
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <a
              href={
                repo.sha
                  ? `https://github.com/${repo.label}/tree/${repo.sha}${repo.path ? `/${repo.path}` : ""}`
                  : repo.url
              }
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium hover:underline"
            >
              {repo.label}
              <ExternalLink className="size-3 text-muted-foreground" />
            </a>
            {repo.label === system.primary && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                The brand's own
              </Badge>
            )}
            {repo.sha && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {repo.sha.slice(0, 7)}
              </span>
            )}
            <span className="text-muted-foreground">
              {repo.files} files, {repo.tokens} tokens
              {repo.stack.length ? ` · ${repo.stack.join(", ")}` : ""}
              {repo.defaultScheme ? ` · ${repo.defaultScheme} by default` : ""}
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <p className="text-xs font-medium">Colours, heaviest first</p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {colours.map((colour) => (
            <li key={colour.hex} className="flex gap-3 px-3 py-2">
              <span
                className="mt-0.5 size-8 shrink-0 rounded border border-border"
                style={{ background: colour.hex }}
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs">
                  <span className="font-mono">{colour.hex}</span> {colour.name}
                  {colour.neutral && <span className="text-muted-foreground"> · neutral</span>}
                  <span className="text-muted-foreground">
                    {" "}
                    · {colour.repos.length} repo{colour.repos.length === 1 ? "" : "s"}
                    {colour.uses ? ` · written ${colour.uses}×` : ""}
                  </span>
                </p>
                {colour.tokens.length ? (
                  <ul className="space-y-0.5">
                    {colour.tokens.slice(0, 3).map((token) => (
                      <li
                        key={`${token.repo} ${token.name} ${token.scheme}`}
                        className="flex flex-wrap items-baseline gap-x-2"
                      >
                        <span className="font-mono text-[11px]">
                          {token.name}
                          {schemeNote(token.scheme) && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({schemeNote(token.scheme)})
                            </span>
                          )}
                        </span>
                        <Source
                          system={system}
                          repo={token.repo}
                          path={token.path}
                          line={token.line}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Written out, never a token</p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {system.colours.length > 16 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setAllColours((value) => !value)}
          >
            {allColours ? "Fewer" : `All ${system.colours.length} colours`}
          </Button>
        )}
      </div>

      {system.fonts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Typefaces</p>
          <ul className="space-y-1.5">
            {system.fonts.slice(0, 10).map((font) => (
              <li
                key={font.family}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm font-medium">{font.family}</span>
                <span className="text-[11px] text-muted-foreground">
                  {font.roles.filter((role) => role !== "other").join(", ") || "set in places"}
                  {" · "}
                  {font.loaded.length
                    ? `loaded from ${font.loaded.map((how) => (how === "google" ? "Google Fonts" : how === "fontsource" ? "@fontsource" : how === "font-face" ? "its own files" : how === "adobe" ? "Adobe Fonts" : "a package")).join(", ")}`
                    : "not loaded by the code read"}
                  {font.weights.length ? ` · ${font.weights.join(" ")}` : ""}
                </span>
                {font.sources[0] && (
                  <Source
                    system={system}
                    repo={font.sources[0].repo}
                    path={font.sources[0].path}
                    line={font.sources[0].line}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Scale title="Corner radius" tokens={system.scales.radius} system={system} />
        <Scale title="Shadows and elevation" tokens={system.scales.shadow} system={system} />
        <Scale title="Motion" tokens={system.scales.motion} system={system} />
        <Scale title="Blur" tokens={system.scales.blur} system={system} />
        <Scale title="Gradients" tokens={system.scales.gradient} system={system} />
      </div>

      {system.conflicts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Where the repositories disagree</p>
          <ul className="space-y-1">
            {system.conflicts.slice(0, 12).map((conflict) => (
              <li
                key={`${conflict.scheme} ${conflict.name}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
              >
                <span className="font-mono">
                  {conflict.name}
                  {schemeNote(conflict.scheme) && (
                    <span className="text-muted-foreground"> ({schemeNote(conflict.scheme)})</span>
                  )}
                </span>
                {conflict.values.map((value) => (
                  <span
                    key={value.value}
                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5"
                  >
                    {value.hex && (
                      <span
                        className="size-2.5 rounded-sm border border-border"
                        style={{ background: value.hex }}
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn("max-w-48 truncate font-mono", !value.hex && "text-[10px]")}
                    >
                      {value.hex ?? value.value}
                    </span>
                    <span className="text-muted-foreground">
                      {value.repos.map(shortName).join(", ")}
                    </span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {system.keyframes.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Animations it defines:{" "}
          <span className="font-mono">
            {system.keyframes
              .slice(0, 16)
              .map((frame) => frame.name)
              .join(", ")}
          </span>
        </p>
      )}
    </div>
  );
}
