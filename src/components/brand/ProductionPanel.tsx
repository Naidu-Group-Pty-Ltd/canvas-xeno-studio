import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, ImageDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cubicBezierPath, formatCubicBezier, parseCubicBezier } from "@/lib/brand/motion";
import {
  colourByHand,
  PRODUCTION_KIND_LABELS,
  PRODUCTION_ROLE_KINDS,
  PRODUCTION_ROLES,
  productionChecks,
  productionStylesheet,
  productionTokens,
  scaleByHand,
  sourceNote,
  typeByHand,
  withRole,
  type BrandProduction,
  type MotionRole,
  type ProductionDecision,
  type ProductionProposal,
  type ProductionRoleSpec,
  type RoleCandidate,
  type RoleSource,
  type RoleValue,
  type TypeRole,
} from "@/lib/brand/production";
import { drawTokenSheet } from "@/components/brand/token-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Saves something the page made as a file. */
function save(name: string, content: string | Blob, type: string) {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const shortName = (repo: string) => repo.split("/")[1] ?? repo;

/** A source's line on GitHub, at the commit read. */
function sourceUrl(production: BrandProduction, source: RoleSource): string | null {
  if (!source.path) return null;
  const read = production.read.find((entry) => entry.repo === source.repo);
  const [owner, name] = source.repo.split("/");
  if (!owner || !name) return null;
  const file = source.path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${encodeURIComponent(read?.sha ?? "HEAD")}/${file}${source.line ? `#L${source.line}` : ""}`;
}

function Source({
  production,
  source,
  label,
}: {
  production: BrandProduction;
  source: RoleSource | null;
  label?: string;
}) {
  const note = sourceNote(source);
  const href = source ? sourceUrl(production, source) : null;
  return (
    <p className="text-[10px] text-muted-foreground">
      {label ? `${label}: ` : ""}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-mono underline-offset-2 hover:text-foreground hover:underline"
        >
          {note}
        </a>
      ) : (
        <span className={cn(source && "font-mono")}>{note}</span>
      )}
    </p>
  );
}

/** A role's value in a few words, as a candidate is offered. */
function valueWords(role: RoleValue): string {
  switch (role.kind) {
    case "colour":
      return role.value;
    case "type":
      return `${role.family}${role.italic ? " italic" : ""}`;
    case "motion":
      return [
        role.ease ? formatCubicBezier(role.ease) : null,
        role.durationMs !== null ? `${role.durationMs}ms` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    default:
      return role.value;
  }
}

function Preview({ spec, role }: { spec: ProductionRoleSpec; role: RoleValue | undefined }) {
  const box = "size-9 shrink-0 rounded border border-border";
  if (!role) return <span className={cn(box, "border-dashed")} aria-hidden />;
  switch (role.kind) {
    case "colour":
      return (
        <span
          className={box}
          style={{
            background: `linear-gradient(${role.value}, ${role.value}), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 8px 8px`,
          }}
          aria-hidden
        />
      );
    case "type":
      return (
        <span
          className={cn(box, "flex items-center justify-center text-base")}
          style={{
            fontFamily: role.stack,
            fontStyle: role.italic ? "italic" : undefined,
            fontWeight: role.weight ?? undefined,
            letterSpacing: role.letterSpacing ?? undefined,
            textTransform: role.uppercase ? "uppercase" : undefined,
          }}
          aria-hidden
        >
          Aa
        </span>
      );
    case "radius":
      return (
        <span
          className="h-7 w-10 shrink-0 border-2 border-foreground/60"
          style={{ borderRadius: role.value }}
          aria-hidden
        />
      );
    case "shadow":
      return (
        <span
          className="m-1 size-7 shrink-0 rounded bg-background"
          style={{ boxShadow: role.value }}
          aria-hidden
        />
      );
    case "blur":
      return (
        <span className={cn(box, "relative overflow-hidden")} aria-hidden>
          <span
            className="absolute inset-2 rounded-full bg-primary"
            style={{ filter: `blur(${Math.min(12, parseFloat(role.value) / 2 || 0)}px)` }}
          />
        </span>
      );
    case "motion":
      return (
        <svg viewBox="-4 -4 44 44" className={cn(box, "p-0.5")} aria-label={`${spec.label} curve`}>
          {role.ease ? (
            <path
              d={cubicBezierPath(role.ease, 36)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
          ) : (
            <line x1={0} y1={36} x2={36} y2={0} stroke="currentColor" strokeDasharray="3 3" />
          )}
        </svg>
      );
  }
}

/** Typed values commit as soon as they read; until then the field says so. */
function useTyped(initial: string) {
  const [text, setText] = useState(initial);
  return [text, setText] as const;
}

function ColourEditor({
  role,
  onRole,
}: {
  role: Extract<RoleValue, { kind: "colour" }> | undefined;
  onRole: (role: RoleValue | null) => void;
}) {
  const [text, setText] = useTyped(role?.value ?? "");
  const invalid = !!text.trim() && !colourByHand(text);
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        value={role?.hex ?? "#000000"}
        onChange={(event) => {
          setText(event.target.value);
          onRole(colourByHand(event.target.value));
        }}
        className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
        aria-label="Pick a colour"
      />
      <Input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const next = colourByHand(event.target.value);
          if (next) onRole(next);
        }}
        className={cn(
          "h-7 w-56 font-mono text-[11px] md:text-[11px]",
          invalid && "border-destructive",
        )}
        placeholder="#040B16, hsl(…) or rgb(…)"
        aria-invalid={invalid}
      />
    </span>
  );
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function TypeEditor({
  spec,
  role,
  onRole,
}: {
  spec: ProductionRoleSpec;
  role: TypeRole | undefined;
  onRole: (role: RoleValue | null) => void;
}) {
  const [family, setFamily] = useTyped(role?.family ?? "");
  const change = (patch: Partial<TypeRole>) => role && onRole({ ...role, ...patch });
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Input
        value={family}
        onChange={(event) => {
          setFamily(event.target.value);
          // Another face is the person's: it keeps the style set here, not how the old one loaded.
          const next = typeByHand(
            event.target.value,
            role
              ? {
                  weight: role.weight,
                  italic: role.italic,
                  letterSpacing: role.letterSpacing,
                  uppercase: role.uppercase,
                }
              : {},
          );
          if (next) onRole(next);
        }}
        className="h-7 w-44 text-xs md:text-xs"
        placeholder="Typeface"
        aria-label={`${spec.label} typeface`}
      />
      {role && (
        <>
          <Select
            value={role.weight ? String(role.weight) : "none"}
            onValueChange={(value) => change({ weight: value === "none" ? null : Number(value) })}
          >
            <SelectTrigger className="h-7 w-32 text-xs" aria-label={`${spec.label} weight`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Own weight</SelectItem>
              {WEIGHTS.map((weight) => (
                <SelectItem key={weight} value={String(weight)}>
                  {weight}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1 text-[11px]">
            <Switch
              checked={role.italic}
              onCheckedChange={(checked) => change({ italic: checked })}
            />
            Italic
          </label>
          {spec.key === "eyebrow" && (
            <>
              <label className="flex items-center gap-1 text-[11px]">
                <Switch
                  checked={role.uppercase}
                  onCheckedChange={(checked) => change({ uppercase: checked })}
                />
                Capitals
              </label>
              <Input
                defaultValue={role.letterSpacing ?? ""}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  if (!value) change({ letterSpacing: null });
                  else if (/^(?:normal|-?(?:\d+\.?\d*|\.\d+)(?:em|rem|px))$/.test(value))
                    change({ letterSpacing: value });
                }}
                className="h-7 w-24 font-mono text-[11px] md:text-[11px]"
                placeholder="0.28em"
                aria-label="Tracking"
              />
            </>
          )}
        </>
      )}
    </span>
  );
}

function ScaleEditor({
  role,
  kind,
  onRole,
}: {
  role: Extract<RoleValue, { kind: "radius" | "shadow" | "blur" }> | undefined;
  kind: "radius" | "shadow" | "blur";
  onRole: (role: RoleValue | null) => void;
}) {
  const [text, setText] = useTyped(role?.value ?? "");
  const invalid = !!text.trim() && !scaleByHand(kind, text);
  return (
    <Input
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const next = scaleByHand(kind, event.target.value);
        if (next) onRole(next);
      }}
      className={cn(
        "h-7 font-mono text-[11px] md:text-[11px]",
        kind === "shadow" ? "min-w-64 flex-1" : "w-32",
        invalid && "border-destructive",
      )}
      placeholder={kind === "shadow" ? "0 24px 48px -12px rgb(0 0 0 / 0.6)" : "16px"}
      aria-invalid={invalid}
    />
  );
}

function MotionEditor({
  role,
  onRole,
}: {
  role: MotionRole | undefined;
  onRole: (role: RoleValue | null) => void;
}) {
  const [curve, setCurve] = useTyped(role?.ease ? formatCubicBezier(role.ease) : "");
  const [duration, setDuration] = useTyped(
    role?.durationMs !== null && role ? String(role.durationMs) : "",
  );
  const base: MotionRole = role ?? {
    kind: "motion",
    ease: null,
    durationMs: null,
    from: null,
    durationFrom: null,
    why: null,
  };
  const curveInvalid = !!curve.trim() && !parseCubicBezier(curve);
  // A curve a person sets is theirs; the duration keeps its own source, and the other way round.
  const withCurve = (text: string): MotionRole => ({
    ...base,
    ease: parseCubicBezier(text),
    from: null,
    durationFrom: base.ease ? base.durationFrom : base.from,
    why: null,
  });
  const withDuration = (ms: number | null): MotionRole => ({
    ...base,
    durationMs: ms,
    from: base.ease ? base.from : null,
    durationFrom: null,
    why: base.ease ? base.why : null,
  });
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Input
        value={curve}
        onChange={(event) => {
          setCurve(event.target.value);
          if (!event.target.value.trim()) {
            const next = withDuration(base.durationMs);
            onRole(next.durationMs === null ? null : { ...next, ease: null });
          } else if (parseCubicBezier(event.target.value)) onRole(withCurve(event.target.value));
        }}
        className={cn(
          "h-7 w-64 font-mono text-[11px] md:text-[11px]",
          curveInvalid && "border-destructive",
        )}
        placeholder="cubic-bezier(0.2, 0, 0, 1)"
        aria-invalid={curveInvalid}
        aria-label="Curve"
      />
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Input
          value={duration}
          inputMode="numeric"
          onChange={(event) => {
            setDuration(event.target.value);
            const text = event.target.value.trim();
            const ms = Number(text);
            if (!text) {
              if (base.ease) onRole(withDuration(null));
              else onRole(null);
            } else if (Number.isFinite(ms) && ms >= 0 && ms <= 10_000)
              onRole(withDuration(Math.round(ms)));
          }}
          className="h-7 w-20 font-mono text-[11px] md:text-[11px]"
          placeholder="none"
          aria-label="Duration in milliseconds"
        />
        ms
      </span>
    </span>
  );
}

function RoleRow({
  spec,
  role,
  candidates,
  production,
  onRole,
}: {
  spec: ProductionRoleSpec;
  role: RoleValue | undefined;
  candidates: RoleCandidate[];
  production: BrandProduction;
  onRole: (role: RoleValue | null) => void;
}) {
  // Picking a candidate or clearing the role replaces what was typed: the editors start again
  // from the role. Typing never does, so a field keeps its place while a value is written.
  const [revision, setRevision] = useState(0);
  const replace = (next: RoleValue | null) => {
    setRevision((value) => value + 1);
    onRole(next);
  };
  const others = candidates.filter(
    (candidate) => valueWords(candidate.value) !== (role ? valueWords(role) : ""),
  );
  return (
    <li className="grid gap-2 px-3 py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      <div>
        <p className="text-xs font-medium">
          {spec.label}
          {!spec.required && <span className="font-normal text-muted-foreground"> · if used</span>}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">{spec.about}</p>
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2" key={revision}>
          <Preview spec={spec} role={role} />
          {spec.kind === "colour" ? (
            <ColourEditor role={role?.kind === "colour" ? role : undefined} onRole={onRole} />
          ) : spec.kind === "type" ? (
            <TypeEditor
              spec={spec}
              role={role?.kind === "type" ? role : undefined}
              onRole={onRole}
            />
          ) : spec.kind === "motion" ? (
            <MotionEditor role={role?.kind === "motion" ? role : undefined} onRole={onRole} />
          ) : (
            <ScaleEditor
              kind={spec.kind}
              role={
                role && (role.kind === "radius" || role.kind === "shadow" || role.kind === "blur")
                  ? role
                  : undefined
              }
              onRole={onRole}
            />
          )}
          {role && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={`Clear ${spec.label}`}
              onClick={() => replace(null)}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
        {role ? (
          role.kind === "motion" && role.ease && role.durationMs !== null ? (
            <>
              <Source production={production} source={role.from} label="Curve" />
              <Source
                production={production}
                source={role.durationFrom ?? role.from}
                label="Duration"
              />
            </>
          ) : (
            <Source production={production} source={role.from} />
          )
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {spec.required
              ? "Not found in the code read: set it by hand."
              : "Not found in the code read: set it by hand if the brand has one."}
          </p>
        )}
        {role?.why && <p className="text-[11px] text-muted-foreground">{role.why}</p>}
        {others.length > 0 && (
          <Select
            value=""
            onValueChange={(value) => {
              const picked = others[Number(value)];
              if (picked) replace({ ...picked.value, why: picked.why || null });
            }}
          >
            <SelectTrigger
              className="h-7 w-full max-w-md text-[11px]"
              aria-label={`Other candidates for ${spec.label}`}
            >
              <SelectValue
                placeholder={`${others.length} other candidate${others.length === 1 ? "" : "s"} in the code`}
              />
            </SelectTrigger>
            <SelectContent>
              {others.map((candidate, index) => (
                <SelectItem key={index} value={String(index)} className="text-xs">
                  <span className="font-mono">{valueWords(candidate.value)}</span>
                  {candidate.value.from?.token
                    ? ` · ${candidate.value.from.token} in ${shortName(candidate.value.from.repo)}`
                    : ""}
                  {candidate.why ? ` · ${candidate.why}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </li>
  );
}

function Decision({
  decision,
  primary,
  onDecision,
}: {
  decision: ProductionDecision;
  primary: string | null;
  onDecision: (decision: ProductionDecision) => void;
}) {
  const own = decision.values.find((value) => primary && value.repos.includes(primary));
  const decided = decision.chosen !== null && decision.note.trim().length >= 3;
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        {decided ? (
          <CheckCircle2 className="size-3.5 text-success" />
        ) : (
          <AlertTriangle className="size-3.5 text-warning" />
        )}
        <span className="font-mono">
          {decision.token}
          {decision.scheme !== "default" && (
            <span className="text-muted-foreground"> ({decision.scheme})</span>
          )}
        </span>
        {decision.values.map((value) => (
          <button
            key={value.value}
            type="button"
            onClick={() => onDecision({ ...decision, chosen: value.value })}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5",
              decision.chosen === value.value
                ? "border-primary ring-1 ring-primary/40"
                : "border-border",
            )}
            aria-pressed={decision.chosen === value.value}
          >
            {value.hex && (
              <span
                className="size-2.5 rounded-sm border border-border"
                style={{ background: value.hex }}
                aria-hidden
              />
            )}
            <span className="max-w-48 truncate font-mono">{value.value}</span>
            <span className="text-muted-foreground">{value.repos.map(shortName).join(", ")}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Textarea
          value={decision.note}
          onChange={(event) => onDecision({ ...decision, note: event.target.value.slice(0, 600) })}
          rows={1}
          className="min-h-0 flex-1 text-xs"
          placeholder="What production uses, and why"
          aria-label={`Why ${decision.token} is decided so`}
        />
        {own && primary && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[11px]"
            onClick={() =>
              onDecision({
                ...decision,
                chosen: own.value,
                note: `${shortName(primary)} is the brand's own source, so its value leads.`,
              })
            }
          >
            The brand's own leads
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * A brand's production roles: what its graphics are drawn in, proposed from
 * its code with the evidence for each and the other candidates, changed here
 * by a person, checked (every role filled, the ink's contrast, each face
 * loaded, every disagreement decided in writing), and downloaded as a
 * stylesheet, as JSON and as a token sheet.
 */
export function ProductionPanel({
  name,
  production,
  onProduction,
  candidates,
  fonts,
}: {
  /** The brand's name, for the files and the sheet. */
  name: string;
  production: BrandProduction;
  onProduction: (production: BrandProduction) => void;
  /** From a code import: each role's candidates, best first. */
  candidates?: ProductionProposal["candidates"] | undefined;
  /** The kit's own font files (a face with its file counts as loaded). */
  fonts: readonly { family: string }[];
}) {
  const checks = useMemo(() => productionChecks(production, { fonts }), [production, fonts]);
  const [drawing, setDrawing] = useState(false);
  const brand = name.trim() || "Brand";
  const slug =
    brand
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "brand";
  const kit = { name: brand, production, fonts };
  const primary = production.read[0]?.repo ?? null;

  const sheet = async () => {
    setDrawing(true);
    try {
      save(`${slug}-tokens.png`, await drawTokenSheet(kit), "image/png");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The token sheet couldn't be drawn");
    } finally {
      setDrawing(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="brand-production">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-xl text-xs text-muted-foreground">
          The roles the brand's graphics are drawn in, each read from its code with the repository,
          file and line it is declared on. Change any of them; a value set by hand says so in the
          stylesheet.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              save(
                `${slug}-production.css`,
                productionStylesheet(kit, { generatedAt: new Date().toISOString().slice(0, 10) }),
                "text/css",
              )
            }
          >
            <Download className="mr-1.5 size-3.5" /> Stylesheet
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => void sheet()}
            disabled={drawing}
          >
            {drawing ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <ImageDown className="mr-1.5 size-3.5" />
            )}
            Token sheet
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() =>
              save(
                `${slug}-production.json`,
                `${JSON.stringify(productionTokens(kit), null, 2)}\n`,
                "application/json",
              )
            }
          >
            <Download className="mr-1.5 size-3.5" /> JSON
          </Button>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2" data-testid="brand-production-checks">
        {checks.list.map((check) => (
          <li
            key={check.key}
            className={cn(
              "flex gap-2 rounded-md border px-3 py-2 text-xs",
              check.ok ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/10",
            )}
          >
            {check.ok ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            )}
            <span>
              <span className="font-medium">{check.label}</span>
              <span className="block text-[11px] text-muted-foreground">{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {checks.contrast.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {checks.contrast.map((pair) => (
            <Badge
              key={`${pair.text} ${pair.on}`}
              variant={pair.level === "fails" ? "destructive" : "secondary"}
              className="text-[10px] font-normal"
            >
              {pair.text} on {pair.on} {pair.ratio.toFixed(2)}:1 · {pair.level}
            </Badge>
          ))}
        </div>
      )}

      {PRODUCTION_ROLE_KINDS.map((kind) => (
        <section key={kind} className="space-y-1.5">
          <p className="text-xs font-medium">{PRODUCTION_KIND_LABELS[kind]}</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {PRODUCTION_ROLES.filter((spec) => spec.kind === kind).map((spec) => (
              <RoleRow
                key={spec.key}
                spec={spec}
                role={production.roles[spec.key]}
                candidates={candidates?.[spec.key] ?? []}
                production={production}
                onRole={(role) => onProduction(withRole(production, spec.key, role))}
              />
            ))}
          </ul>
        </section>
      ))}

      {production.decisions.length > 0 && (
        <section className="space-y-1.5">
          <p className="text-xs font-medium">Where the repositories disagree</p>
          <p className="text-[11px] text-muted-foreground">
            Choose the value production uses for each, and say why: the stylesheet carries every
            decision in writing.
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {production.decisions.map((decision, index) => (
              <Decision
                key={`${decision.scheme} ${decision.token}`}
                decision={decision}
                primary={primary}
                onDecision={(next) =>
                  onProduction({
                    ...production,
                    decisions: production.decisions.map((entry, at) =>
                      at === index ? next : entry,
                    ),
                  })
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
