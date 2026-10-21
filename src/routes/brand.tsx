import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BookOpen,
  Code2,
  Dna,
  FileText,
  Globe,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { BrandImportDialog } from "@/components/brand/BrandImportDialog";
import { BrandKitDialog } from "@/components/brand/BrandKitsPanel";
import { FormulaBrowser } from "@/components/brand/FormulaBrowser";
import { draftOf, EMPTY, type Draft } from "@/components/brand/kit-draft";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrandFontFaces, useBrandKits } from "@/hooks/useBrandKits";
import { useBrandImports, type BrandImport } from "@/hooks/useBrandImports";
import { useAssetsById } from "@/hooks/useLongVideos";
import { useProjects } from "@/hooks/useStudioData";
import { archiveBrandKit } from "@/lib/brand.functions";
import { discardBrandImport } from "@/lib/brand-import.functions";
import { brandStyleLine, PALETTE_ROLE_LABELS } from "@/lib/brand/design";
import { ARCHETYPE_INFO, EMPTY_DNA, MARKET_LABELS, typeWords } from "@/lib/brand/dna";
import { formulasForBrand } from "@/lib/brand/formulas";
import { DEFAULT_FONT, type BrandKit } from "@/lib/edit/brand";

export const Route = createFileRoute("/brand")({
  head: () => ({
    meta: [
      { title: "Brand · Xeno Studio" },
      {
        name: "description",
        content:
          "Brand design systems read from a website or guidelines, carried into every image and video.",
      },
      { property: "og:title", content: "Brand · Xeno Studio" },
      {
        property: "og:description",
        content: "Import a brand's colours, type, look and voice, and make everything in it.",
      },
    ],
  }),
  component: BrandPage,
});

function BrandCard({
  kit,
  logo,
  project,
  onEdit,
  onReread,
  onArchive,
}: {
  kit: BrandKit;
  logo: { storage_bucket: string; storage_path: string } | undefined;
  project: string | null;
  onEdit: () => void;
  onReread: (() => void) | null;
  onArchive: () => void;
}) {
  const heading = `"${kit.headingFont ?? DEFAULT_FONT}", Inter, sans-serif`;
  const body = `"${kit.bodyFont ?? DEFAULT_FONT}", Inter, sans-serif`;
  const swatches = kit.palette.length
    ? kit.palette
    : [kit.backgroundColor, kit.accentColor, kit.textColor].map((hex) => ({
        hex,
        name: hex,
        role: "other" as const,
        usage: null,
      }));
  const line = brandStyleLine(kit);
  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:shadow-md"
      data-testid="brand-card"
    >
      <button
        type="button"
        onClick={onEdit}
        className="relative flex h-40 flex-col items-center justify-center gap-2 px-5 text-center"
        style={{ background: kit.backgroundColor, color: kit.textColor }}
        aria-label={`Edit ${kit.name}`}
      >
        {logo ? (
          <div className="h-12 w-36">
            <MediaPreview
              bucket={logo.storage_bucket}
              path={logo.storage_path}
              type="image"
              contain
              alt={`${kit.name} logo`}
            />
          </div>
        ) : null}
        <span
          className="line-clamp-1 text-xl leading-tight"
          style={{
            fontFamily: heading,
            fontWeight: kit.headingFont ? undefined : 800,
          }}
        >
          {kit.uppercaseTitles ? kit.name.toUpperCase() : kit.name}
        </span>
        {kit.tagline && (
          <span className="line-clamp-1 text-xs opacity-80" style={{ fontFamily: body }}>
            {kit.tagline}
          </span>
        )}
        {kit.isDefault && (
          <Star className="absolute right-3 top-3 size-4 fill-current text-warning" />
        )}
      </button>
      <div className="flex h-4">
        {swatches.slice(0, 10).map((colour) => (
          <div
            key={colour.hex}
            className="flex-1"
            style={{ background: colour.hex }}
            title={`${colour.name}${colour.role !== "other" ? ` · ${PALETTE_ROLE_LABELS[colour.role]}` : ""} · ${colour.hex}`}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            <span className="text-base text-foreground" style={{ fontFamily: heading }}>
              Aa
            </span>{" "}
            {kit.headingFont ?? DEFAULT_FONT}
            {kit.bodyFont && kit.bodyFont !== kit.headingFont ? ` / ${kit.bodyFont}` : ""}
          </span>
          <span className="shrink-0">
            {kit.isDefault ? "Studio default" : project ? project : "Any project"}
          </span>
        </div>
        {kit.dna.type ? (
          <div className="space-y-1 text-[11px]" data-testid="brand-dna">
            <p className="flex items-start gap-1">
              <Dna className="mt-0.5 size-3 shrink-0 text-primary" />
              <span>
                {typeWords(kit.dna)}
                {kit.dna.market ? ` · ${MARKET_LABELS[kit.dna.market]}` : ""}
                {kit.dna.archetype ? ` · ${ARCHETYPE_INFO[kit.dna.archetype].label}` : ""}
              </span>
            </p>
            {formulasForBrand(kit.dna, 3, kit.ownFormulas).length > 0 && (
              <p className="flex items-start gap-1 text-muted-foreground">
                <BookOpen className="mt-0.5 size-3 shrink-0" />
                <span className="line-clamp-2">
                  {formulasForBrand(kit.dna, 3, kit.ownFormulas)
                    .map((formula) => formula.name)
                    .join(" · ")}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Dna className="size-3 shrink-0" /> No DNA yet: say what kind of brand it is to rank its
            content formulas.
          </p>
        )}
        {kit.design.visual.mood.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {kit.design.visual.mood.slice(0, 5).map((word) => (
              <Badge key={word} variant="secondary" className="text-[10px] font-normal">
                {word}
              </Badge>
            ))}
          </div>
        )}
        {line ? (
          <p className="line-clamp-3 text-xs text-muted-foreground">
            <Sparkles className="mr-1 inline size-3 text-primary" />
            {line}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No design system yet: re-read it from the brand's website, guidelines or code, or
            describe its look in the kit.
          </p>
        )}
        {kit.source && (
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            {kit.source.kind === "url" ? (
              <Globe className="size-3 shrink-0" />
            ) : kit.source.kind === "repos" ? (
              <Code2 className="size-3 shrink-0" />
            ) : (
              <FileText className="size-3 shrink-0" />
            )}
            Read from{" "}
            {kit.source.kind === "url"
              ? (kit.source.url ?? "its website")
              : kit.source.kind === "repos"
                ? `the code of ${kit.source.title ?? "its repositories"}`
                : (kit.source.title ?? "its guidelines")}
          </p>
        )}
        <div className="mt-auto flex gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="h-8 flex-1" onClick={onEdit}>
            <Palette className="mr-1.5 size-3.5" /> Edit
          </Button>
          {onReread && (
            <Button size="sm" variant="ghost" className="h-8" onClick={onReread}>
              <RefreshCw className="mr-1.5 size-3.5" /> Re-read
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            aria-label={`Archive ${kit.name}`}
            onClick={onArchive}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function ImportRow({
  record,
  onReview,
  onDiscard,
}: {
  record: BrandImport;
  onReview: () => void;
  onDiscard: () => void;
}) {
  const label =
    record.kind === "url"
      ? (record.sourceUrl?.replace(/^https:\/\//, "").replace(/\/$/, "") ?? "A website")
      : record.kind === "repos"
        ? `the code of ${record.sourceTitle ?? "its repositories"}`
        : (record.sourceTitle ?? "Brand guidelines");
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      {record.status === "scanning" ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      ) : record.status === "failed" ? (
        <AlertTriangle className="size-4 shrink-0 text-destructive" />
      ) : (
        <Sparkles className="size-4 shrink-0 text-primary" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{record.proposal?.name ?? label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {record.status === "scanning"
            ? `${record.stage ?? "Scanning"}…`
            : record.status === "failed"
              ? record.error
              : `Read from ${label} ${formatDistanceToNow(new Date(record.updatedAt), { addSuffix: true })}`}
        </p>
      </div>
      {record.proposal && (
        <div className="hidden h-5 w-24 overflow-hidden rounded-sm border border-border sm:flex">
          {record.proposal.palette.slice(0, 8).map((colour) => (
            <span key={colour.hex} className="flex-1" style={{ background: colour.hex }} />
          ))}
        </div>
      )}
      {record.status !== "failed" && (
        <Button size="sm" className="h-8" onClick={onReview}>
          {record.status === "scanning" ? "Follow" : "Review"}
        </Button>
      )}
      {record.status !== "scanning" && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          aria-label="Throw this import away"
          onClick={onDiscard}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  );
}

/** Every formula, ranked for a brand's DNA (the default kit's, to begin with). */
function FormulaLibrary({ kits }: { kits: BrandKit[] }) {
  const [kitId, setKitId] = useState<string | null>(null);
  const kit = kits.find((entry) => entry.id === kitId) ?? kits[0] ?? null;
  return (
    <section className="space-y-3" data-testid="formula-library">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-sm font-medium">Formula library</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Proven structures for content, each with timed beats, the rules it keeps and the
            research it rests on: platform guidance (Google, TikTok, Meta, LinkedIn), effectiveness
            research (the IPA, Ehrenberg-Bass, the LinkedIn B2B Institute) and the regulators' rules
            on reviews and endorsements. Each says how strong its evidence is. The Director, long
            videos and the Supercomputer write to them.
          </p>
        </div>
        {kits.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Ranked for
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={kit?.id ?? ""}
              onChange={(event) => setKitId(event.target.value)}
            >
              {kits.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <FormulaBrowser
        dna={kit?.dna ?? EMPTY_DNA}
        own={kit?.ownFormulas ?? []}
        limit={Math.max(8, (kit?.ownFormulas.length ?? 0) + 4)}
        houseRules
      />
    </section>
  );
}

function BrandPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useBrandKits();
  const { data: importData } = useBrandImports();
  const { data: projects = [] } = useProjects();
  const kits = data?.kits ?? [];
  const { data: assets } = useAssetsById(
    kits.flatMap((kit) => (kit.logoAssetId ? [kit.logoAssetId] : [])),
  );
  useBrandFontFaces(kits.flatMap((kit) => kit.fonts));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState<{
    kit: BrandKit | null;
    importId: string | null;
  } | null>(null);
  const pending = (importData?.imports ?? []).filter((record) => record.status !== "applied");

  const archive = async (kit: BrandKit) => {
    try {
      await archiveBrandKit({ data: { id: kit.id } });
      await queryClient.invalidateQueries({ queryKey: ["brand_kits"] });
      toast.success(`“${kit.name}” archived.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The kit couldn't be archived");
    }
  };
  const discard = async (record: BrandImport) => {
    try {
      await discardBrandImport({ data: { importId: record.id } });
      await queryClient.invalidateQueries({ queryKey: ["brand_imports"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The import couldn't be thrown away");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold">Brand</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Each brand's design system: its palette, typefaces, logo, the look of its imagery and
              its voice, read from its website or guidelines. Pick a brand in Create, a long video
              or the Supercomputer and everything is made in its look.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft({ ...EMPTY })}>
              <Plus className="mr-1.5 size-4" /> By hand
            </Button>
            <Button
              onClick={() => setImporting({ kit: null, importId: null })}
              data-testid="brand-import"
            >
              <ScanSearch className="mr-1.5 size-4" /> Import a design system
            </Button>
          </div>
        </header>

        {data && !data.supported ? (
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Brand kits need a database update (migrations 0018_brand_kits and
            0021_brand_design_systems). Until an admin applies them, nothing here can be kept.
          </p>
        ) : null}

        {pending.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Imports</h2>
            <ul className="space-y-2">
              {pending.slice(0, 6).map((record) => (
                <ImportRow
                  key={record.id}
                  record={record}
                  onReview={() => setImporting({ kit: null, importId: record.id })}
                  onDiscard={() => void discard(record)}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Brand kits</h2>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-80 rounded-xl" />
              ))}
            </div>
          ) : kits.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kits.map((kit) => {
                const logo = kit.logoAssetId ? assets?.get(kit.logoAssetId) : undefined;
                const reread =
                  kit.source?.kind === "url" || kit.source?.kind === "repos"
                    ? kit.source.url
                    : kit.website;
                return (
                  <BrandCard
                    key={kit.id}
                    kit={kit}
                    logo={logo}
                    project={projects.find((entry) => entry.id === kit.projectId)?.name ?? null}
                    onEdit={() => setDraft(draftOf(kit))}
                    onReread={reread ? () => setImporting({ kit, importId: null }) : null}
                    onArchive={() => void archive(kit)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
              <ScanSearch className="size-8 text-primary" />
              <p className="text-base font-medium">Bring in your first brand</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Paste the brand's website, drop its guidelines PDF, or name its GitHub repositories.
                The studio reads its colours, typefaces, logo, imagery and voice (from code, every
                token with where it is declared), and you review it before it's kept.
              </p>
              <Button onClick={() => setImporting({ kit: null, importId: null })}>
                <ScanSearch className="mr-1.5 size-4" /> Import a design system
              </Button>
            </div>
          )}
        </section>

        <FormulaLibrary kits={kits} />
      </div>
      {draft && <BrandKitDialog draft={draft} onClose={() => setDraft(null)} />}
      <BrandImportDialog
        open={importing !== null}
        onOpenChange={(open) => !open && setImporting(null)}
        kit={importing?.kit ?? null}
        importId={importing?.importId ?? null}
      />
    </AppShell>
  );
}
