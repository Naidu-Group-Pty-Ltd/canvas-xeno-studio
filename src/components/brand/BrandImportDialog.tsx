import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  FileText,
  Globe,
  ImagePlus,
  Loader2,
  ScanSearch,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProjects, type AssetRow } from "@/hooks/useStudioData";
import { useBrandFontFaces, useBrandKits } from "@/hooks/useBrandKits";
import { useBrandImport, type BrandImport } from "@/hooks/useBrandImports";
import {
  applyBrandImport,
  discardBrandImport,
  startBrandDocumentImport,
} from "@/lib/brand-import.functions";
import { streamBrandImport } from "@/lib/brand/import-client";
import { MAX_IMPORT_REPOS } from "@/lib/brand/import-request";
import { parseRepoRef } from "@/lib/brand/scan-code";
import {
  picturesToSend,
  readGuidelines,
  uploadGuidelinePictures,
} from "@/lib/brand/document-import";
import { kitColoursOf, type BrandDesign, type PaletteColour } from "@/lib/brand/design";
import { designFromCode, type BrandProposal, type StagedImage } from "@/lib/brand/proposal";
import { rasterizeSvg } from "@/lib/brand/rasterize";
import { BRIEF_ACCEPT } from "@/lib/briefs/parse-document";
import { DEFAULT_FONT, fontChoices, type BrandFont, type BrandKit } from "@/lib/edit/brand";
import { OVERLAY_BACKING_LABELS, OVERLAY_BACKINGS, type OverlayBacking } from "@/lib/edit/timeline";
import { signedUrl, storageScope, uploadAssetBlob } from "@/lib/storage";
import { CodeSystemPanel } from "@/components/brand/CodeSystemPanel";
import { ProductionPanel } from "@/components/brand/ProductionPanel";
import {
  EMPTY_PRODUCTION,
  isEmptyProduction,
  proposeProduction,
  reproposeProduction,
  type BrandProduction,
} from "@/lib/brand/production";
import { DesignSystemEditor } from "@/components/brand/DesignSystemEditor";
import { DnaEditor } from "@/components/brand/DnaEditor";
import { FormulaBrowser } from "@/components/brand/FormulaBrowser";
import { mergeSuggestion, type BrandDna } from "@/lib/brand/dna";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const WEBSITE_STAGES = [
  "Reading the page",
  "Reading its styles",
  "Collecting the logo and pictures",
  "Reading the brand",
  "Installing its fonts",
];
const DOCUMENT_STAGES = [
  "Uploading the pages",
  "Finding its colour codes",
  "Reading the brand",
  "Installing its fonts",
];
/** The first is followed by which repository and file it is on ("Reading the repositories: …"). */
const CODE_STAGES = [
  "Reading the repositories",
  "Collecting the logos",
  "Reading the brand",
  "Installing its fonts",
];

/** The repositories someone listed, one a line (or split by commas), as the server takes them. */
function reposOf(text: string): { repos: string[]; unreadable: string[] } {
  const listed = [
    ...new Set(
      text
        .split(/[\n,]+/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
  return {
    repos: listed.filter((line) => parseRepoRef(line)),
    unreadable: listed.filter((line) => !parseRepoRef(line)),
  };
}

/** Where a scan is, step by step. */
function Progress({
  stages,
  current,
  local,
}: {
  stages: string[];
  current: string | null;
  local?: string;
}) {
  // A step can say more after it ("Reading the repositories: acme/site's styling code").
  const at = current
    ? stages.findIndex((stage) => current === stage || current.startsWith(`${stage}: `))
    : -1;
  const detail = at >= 0 && current ? current.slice(stages[at]!.length + 2) : "";
  return (
    <div className="space-y-4 py-6" data-testid="brand-import-progress">
      <ol className="mx-auto max-w-sm space-y-2.5">
        {stages.map((stage, index) => {
          const done = at > index;
          const active = at === index || (at === -1 && index === 0);
          return (
            <li key={stage} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  done && "border-success bg-success text-background",
                  active && "border-primary",
                )}
              >
                {done ? (
                  <Check className="size-3" />
                ) : active ? (
                  <Loader2 className="size-3 animate-spin text-primary" />
                ) : null}
              </span>
              <span className={cn(!done && !active && "text-muted-foreground")}>{stage}</span>
            </li>
          );
        })}
      </ol>
      {(local || detail) && (
        <p className="text-center text-xs text-muted-foreground">{local || detail}</p>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        Reading a brand takes a minute or so. Keep this window open.
      </p>
    </div>
  );
}

interface ReviewDraft {
  name: string;
  website: string;
  tagline: string;
  callToAction: string;
  terms: string;
  palette: PaletteColour[];
  design: BrandDesign;
  colours: { text: string; accent: string; background: string };
  fonts: BrandFont[];
  headingFont: string;
  bodyFont: string;
  logo: string | null;
  libraryLogo: AssetRow | null;
  references: string[];
  titleBacking: OverlayBacking;
  uppercaseTitles: boolean;
  target: string;
  projectId: string | null;
  isDefault: boolean;
  dna: BrandDna;
  /** The roles its graphics are drawn in, proposed from its code (see ./ProductionPanel). */
  production: BrandProduction;
}

function draftOf(
  proposal: BrandProposal,
  kit: BrandKit | null,
  kind: BrandImport["kind"] = "url",
): ReviewDraft {
  // Code updates a kit's colours and type; its look, voice and rules stay as the kit has them.
  const fromCode = kind === "repos" && !!kit;
  const fonts: BrandFont[] = [];
  for (const font of proposal.fonts)
    if (font.installed && !fonts.some((entry) => entry.path === font.installed!.path))
      fonts.push(font.installed);
  const familyFor = (role: "heading" | "body") =>
    proposal.fonts.find((font) => font.role === role)?.installed?.family ?? DEFAULT_FONT;
  return {
    name: proposal.name,
    website: proposal.website ?? kit?.website ?? "",
    tagline: proposal.tagline ?? kit?.tagline ?? "",
    callToAction: proposal.callToAction ?? kit?.callToAction ?? "",
    terms: [...new Set([...proposal.terms, ...(kit?.terms ?? [])])].join("\n"),
    palette: proposal.palette,
    design: fromCode ? designFromCode(kit.design, proposal.design) : proposal.design,
    colours: proposal.colours,
    fonts,
    headingFont: familyFor("heading"),
    bodyFont: familyFor("body"),
    // The kit's own logo stays unless one found in the code is picked.
    logo: fromCode && kit.logoAssetId ? null : proposal.logo,
    libraryLogo: null,
    references: proposal.references,
    titleBacking: proposal.titleBacking,
    uppercaseTitles: proposal.uppercaseTitles,
    target: kit?.id ?? "new",
    projectId: kit?.projectId ?? null,
    isDefault: kit?.isDefault ?? false,
    // Updating a kit keeps the DNA a person gave it; the reading fills what it left empty.
    dna: kit ? mergeSuggestion(kit.dna, proposal.dna) : proposal.dna,
    production: kit?.production ?? EMPTY_PRODUCTION,
  };
}

/** A staged picture, shown from storage (an SVG as an image: it never runs there). */
function Staged({ image, className }: { image: StagedImage; className?: string | undefined }) {
  return (
    <MediaPreview
      bucket={image.bucket}
      path={image.path}
      type="image"
      contain
      alt={image.origin ?? image.key}
      {...(className ? { className } : {})}
    />
  );
}

/** The brand as a card: its colours, logo, type and call to action, as they read together. */
function BrandHero({ draft, logo }: { draft: ReviewDraft; logo: StagedImage | AssetRow | null }) {
  const heading = `"${draft.headingFont}", Inter, sans-serif`;
  const body = `"${draft.bodyFont}", Inter, sans-serif`;
  return (
    <div className="overflow-hidden rounded-lg border border-border" data-testid="brand-hero">
      <div
        className="flex min-h-36 flex-col items-center justify-center gap-2 px-6 py-6 text-center"
        style={{ background: draft.colours.background, color: draft.colours.text }}
      >
        {logo && (
          <div className="h-12 w-40">
            {"storage_bucket" in logo ? (
              <MediaPreview
                bucket={logo.storage_bucket}
                path={logo.storage_path}
                type="image"
                contain
                alt="Logo"
              />
            ) : (
              <Staged image={logo} />
            )}
          </div>
        )}
        <p
          className="text-2xl leading-tight"
          style={{
            fontFamily: heading,
            fontWeight: draft.headingFont === DEFAULT_FONT ? 800 : undefined,
          }}
        >
          {draft.uppercaseTitles
            ? (draft.name || "Your brand").toUpperCase()
            : draft.name || "Your brand"}
        </p>
        {draft.tagline && (
          <p className="max-w-md text-sm opacity-85" style={{ fontFamily: body }}>
            {draft.tagline}
          </p>
        )}
        {draft.callToAction && (
          <span
            className="mt-1 rounded-md px-3 py-1 text-xs font-medium"
            style={{
              background: draft.colours.accent,
              color: kitColoursOf([
                { hex: draft.colours.accent, name: "", role: "background", usage: null },
              ]).text,
              fontFamily: heading,
            }}
          >
            {draft.callToAction}
          </span>
        )}
      </div>
      <div className="flex h-3">
        {draft.palette.map((colour) => (
          <div key={colour.hex} className="flex-1" style={{ background: colour.hex }} />
        ))}
      </div>
    </div>
  );
}

function Review({
  record,
  kit,
  kits,
  onDone,
}: {
  record: BrandImport;
  kit: BrandKit | null;
  kits: BrandKit[];
  onDone: (kitId: string | null) => void;
}) {
  const proposal = record.proposal!;
  const { user } = useAuth();
  const { data: projects = [] } = useProjects();
  // From code, the production roles are proposed from what was read; re-reading a kit keeps the
  // roles a person set on it and the notes they wrote.
  const proposed = useMemo(
    () => (record.code ? proposeProduction(record.code, { importId: record.id }) : null),
    [record.code, record.id],
  );
  const [draft, setDraft] = useState<ReviewDraft>(() => {
    const initial = draftOf(proposal, kit, record.kind);
    if (!proposed) return initial;
    return {
      ...initial,
      production:
        kit && !isEmptyProduction(kit.production)
          ? reproposeProduction(kit.production, proposed.production)
          : proposed.production,
    };
  });
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  useBrandFontFaces(draft.fonts);
  const set = (patch: Partial<ReviewDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const target = kits.find((entry) => entry.id === draft.target) ?? null;
  const families = fontChoices(draft.fonts);
  const stagedLogo = proposal.logos.find((logo) => logo.key === draft.logo) ?? null;
  const pictures = proposal.imagery;

  async function save() {
    if (!user || saving) return;
    setSaving(true);
    try {
      let logo: { key: string } | { assetId: string } | null = null;
      if (draft.libraryLogo) logo = { assetId: draft.libraryLogo.id };
      else if (stagedLogo?.mime === "image/svg+xml") {
        // The render lays PNGs over video: an SVG logo is drawn as one first.
        const url = await signedUrl(stagedLogo.bucket, stagedLogo.path);
        if (!url) throw new Error("The logo couldn't be read");
        const drawn = await rasterizeSvg(url);
        const asset = await uploadAssetBlob(drawn.blob, {
          userId: user.id,
          projectId: draft.projectId,
          path: `${storageScope({ userId: user.id, projectId: draft.projectId })}/brand/${crypto.randomUUID()}.png`,
          mimeType: "image/png",
          kind: "image",
          title: `${draft.name} logo`,
          width: drawn.width,
          height: drawn.height,
          metadata: { source: "brand_import", brand_import_id: record.id },
        });
        logo = { assetId: asset.id };
      } else if (stagedLogo) logo = { key: stagedLogo.key };
      else if (target?.logoAssetId) logo = { assetId: target.logoAssetId };

      // An update keeps the kit's own fonts the import didn't replace.
      const fonts = [...draft.fonts];
      for (const font of target?.fonts ?? [])
        if (!fonts.some((entry) => entry.family === font.family)) fonts.push(font);
      const result = await applyBrandImport({
        data: {
          importId: record.id,
          kit: {
            id: target?.id ?? null,
            name: draft.name.trim() || proposal.name,
            projectId: draft.projectId,
            isDefault: draft.isDefault && !draft.projectId,
            endCardAssetId: target?.endCardAssetId ?? null,
            headingFont: draft.headingFont,
            bodyFont: draft.bodyFont,
            fonts: fonts.slice(0, 6),
            textColor: draft.colours.text,
            accentColor: draft.colours.accent,
            backgroundColor: draft.colours.background,
            titleBacking: draft.titleBacking,
            uppercaseTitles: draft.uppercaseTitles,
            tagline: draft.tagline.trim() || null,
            callToAction: draft.callToAction.trim().slice(0, 60) || null,
            website: draft.website.trim() || null,
            terms: draft.terms
              .split(/\n|,/)
              .map((term) => term.trim())
              .filter(Boolean)
              .slice(0, 50),
            palette: draft.palette,
            design: draft.design as unknown as Record<string, unknown>,
            dna: draft.dna as unknown as Record<string, unknown>,
            // Read from code, its production roles go with it (otherwise the kit keeps its own).
            ...(record.code
              ? { production: draft.production as unknown as Record<string, unknown> }
              : {}),
          },
          logo,
          references: draft.references,
          keepReferences: target?.referenceAssetIds ?? [],
        },
      });
      toast.success(`“${draft.name}” ${target ? "updated" : "saved"} from its design system.`);
      onDone(result.kitId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The kit couldn't be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="brand-import-review">
      <BrandHero draft={draft} logo={draft.libraryLogo ?? stagedLogo} />
      {proposal.notes.length > 0 && (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
          {proposal.notes.map((note) => (
            <p key={note} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> {note}
            </p>
          ))}
        </div>
      )}
      <Tabs defaultValue="identity">
        <TabsList className={cn("grid w-full", record.code ? "grid-cols-6" : "grid-cols-4")}>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="system">Design system</TabsTrigger>
          {record.code && <TabsTrigger value="code">Code</TabsTrigger>}
          {record.code && <TabsTrigger value="production">Production</TabsTrigger>}
          <TabsTrigger value="dna">DNA</TabsTrigger>
          <TabsTrigger value="imagery">Imagery ({draft.references.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-5 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="import-name">Name</Label>
              <Input
                id="import-name"
                value={draft.name}
                maxLength={120}
                onChange={(event) => set({ name: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-website">Website</Label>
              <Input
                id="import-website"
                value={draft.website}
                maxLength={120}
                onChange={(event) => set({ website: event.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="import-tagline">Tagline</Label>
              <Input
                id="import-tagline"
                value={draft.tagline}
                maxLength={160}
                onChange={(event) => set({ tagline: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-cta">Call to action</Label>
              <Input
                id="import-cta"
                value={draft.callToAction}
                maxLength={60}
                onChange={(event) => set({ callToAction: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-terms">Names to spell right</Label>
              <Textarea
                id="import-terms"
                value={draft.terms}
                rows={2}
                className="min-h-0"
                onChange={(event) => set({ terms: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex flex-wrap gap-2">
              {proposal.logos.map((logo) => (
                <button
                  key={logo.key}
                  type="button"
                  onClick={() => set({ logo: logo.key, libraryLogo: null })}
                  className={cn(
                    "relative h-16 w-28 overflow-hidden rounded-md border p-1.5",
                    draft.logo === logo.key && !draft.libraryLogo
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border",
                  )}
                  style={{ background: draft.colours.background }}
                  aria-pressed={draft.logo === logo.key && !draft.libraryLogo}
                  title={logo.origin ?? undefined}
                >
                  <Staged image={logo} />
                  {logo.mime === "image/svg+xml" && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-background/80 px-1 text-[9px]">
                      SVG
                    </span>
                  )}
                </button>
              ))}
              {draft.libraryLogo && (
                <div
                  className="h-16 w-28 overflow-hidden rounded-md border border-primary p-1.5 ring-2 ring-primary/40"
                  style={{ background: draft.colours.background }}
                >
                  <MediaPreview
                    bucket={draft.libraryLogo.storage_bucket}
                    path={draft.libraryLogo.storage_path}
                    type="image"
                    contain
                    alt="Logo from the library"
                  />
                </div>
              )}
              <Button variant="outline" className="h-16" onClick={() => setPicking(true)}>
                <ImagePlus className="mr-1.5 size-4" /> From the library
              </Button>
              {(draft.logo || draft.libraryLogo) && (
                <Button
                  variant="ghost"
                  className="h-16"
                  onClick={() => set({ logo: null, libraryLogo: null })}
                >
                  No logo
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            {proposal.fonts.length ? (
              <div className="space-y-2">
                {proposal.fonts.map((font) => (
                  <div
                    key={font.role}
                    className="flex items-center gap-3 rounded-md border border-border p-2.5"
                  >
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">
                      {font.role === "heading" ? "Titles" : "Captions"}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-lg"
                      style={{
                        fontFamily: `"${font.installed?.family ?? DEFAULT_FONT}", Inter, sans-serif`,
                      }}
                    >
                      {font.family}
                    </span>
                    <span className="text-right text-[11px] text-muted-foreground">
                      {font.installed
                        ? font.installed.family === font.family
                          ? "Installed from Google Fonts"
                          : `Set in ${font.installed.family} (closest Google font)`
                        : "Not installed: Inter until its file is uploaded"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No typefaces were found: titles use Inter.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["headingFont", "Titles and calls to action"],
                  ["bodyFont", "Subtitles and captions"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Select value={draft[key]} onValueChange={(value) => set({ [key]: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {families.map((family) => (
                        <SelectItem key={family} value={family}>
                          <span style={{ fontFamily: `"${family}", Inter, sans-serif` }}>
                            {family}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Title and end-card colours</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => set({ colours: kitColoursOf(draft.palette, draft.colours) })}
              >
                <Sparkles className="mr-1 size-3.5" /> From the palette
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["text", "Text"],
                  ["accent", "Accent"],
                  ["background", "End card"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs">
                  <span className="block text-muted-foreground">{label}</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={draft.colours[key]}
                      onChange={(event) =>
                        set({ colours: { ...draft.colours, [key]: event.target.value } })
                      }
                      className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                      aria-label={label}
                    />
                    <span className="font-mono text-[11px]">{draft.colours[key]}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={draft.titleBacking}
                onValueChange={(value) => set({ titleBacking: value as OverlayBacking })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERLAY_BACKINGS.map((backing) => (
                    <SelectItem key={backing} value={backing}>
                      {OVERLAY_BACKING_LABELS[backing]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={draft.uppercaseTitles}
                  onCheckedChange={(checked) => set({ uppercaseTitles: checked })}
                />
                Titles in capitals
              </label>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="system" className="pt-3">
          <DesignSystemEditor
            name={draft.name}
            palette={draft.palette}
            onPalette={(palette) => set({ palette })}
            design={draft.design}
            onDesign={(design) => set({ design })}
            found={record.signals.colours}
          />
        </TabsContent>

        {record.code && (
          <TabsContent value="code" className="pt-3">
            <CodeSystemPanel system={record.code} name={draft.name || proposal.name} />
          </TabsContent>
        )}

        {record.code && (
          <TabsContent value="production" className="pt-3">
            <ProductionPanel
              name={draft.name || proposal.name}
              production={draft.production}
              onProduction={(production) => set({ production })}
              candidates={proposed?.candidates}
              fonts={draft.fonts}
            />
          </TabsContent>
        )}

        <TabsContent value="dna" className="space-y-4 pt-3">
          <DnaEditor
            dna={draft.dna}
            onDna={(dna) => set({ dna })}
            name={draft.name}
            audience={draft.design.audience}
          />
          {draft.dna.type && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium">Formulas that fit it best</p>
              <FormulaBrowser
                dna={draft.dna}
                own={target?.ownFormulas ?? []}
                onFormulas={(formulas) => set({ dna: { ...draft.dna, formulas } })}
                limit={3 + (target?.ownFormulas.length ?? 0)}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="imagery" className="space-y-3 pt-3">
          <p className="text-xs text-muted-foreground">
            Pictures that show the brand's look. Those picked are kept in the library as the kit's
            style references, offered wherever a model takes reference images.
          </p>
          {pictures.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pictures.map((image) => {
                const picked = draft.references.includes(image.key);
                return (
                  <button
                    key={image.key}
                    type="button"
                    onClick={() =>
                      set({
                        references: picked
                          ? draft.references.filter((key) => key !== image.key)
                          : [...draft.references, image.key].slice(0, 8),
                      })
                    }
                    className={cn(
                      "relative aspect-[4/3] overflow-hidden rounded-md border bg-muted",
                      picked ? "border-primary ring-2 ring-primary/40" : "border-border opacity-70",
                    )}
                    aria-pressed={picked}
                  >
                    <MediaPreview
                      bucket={image.bucket}
                      path={image.path}
                      type="image"
                      alt={image.origin ?? image.key}
                    />
                    {picked && (
                      <CheckCircle2 className="absolute right-1 top-1 size-4 rounded-full bg-background text-primary" />
                    )}
                    {image.kind === "page" && (
                      <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px]">
                        {image.origin}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {record.kind === "repos"
                ? target
                  ? `Code holds no pictures of the brand's look: “${target.name}” keeps its own style references.`
                  : "Code holds no pictures of the brand's look: add style references in the kit, or import its website."
                : "No pictures were found."}
            </p>
          )}
        </TabsContent>
      </Tabs>

      <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Keep as</Label>
          <Select value={draft.target} onValueChange={(value) => set({ target: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">A new brand kit</SelectItem>
              {kits.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  Update “{entry.name}”
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Used for</Label>
          <Select
            value={draft.projectId ?? "any"}
            onValueChange={(value) => set({ projectId: value === "any" ? null : value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!draft.projectId && (
          <label className="flex items-center gap-2 self-end pb-2 text-xs">
            <Switch
              checked={draft.isDefault}
              onCheckedChange={(checked) => set({ isDefault: checked })}
            />
            The studio's default
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {proposal.model ? `Read by ${proposal.model}.` : "Read from the scan alone."}{" "}
          {record.signals.colours.length} colours and {record.signals.fonts.length} typefaces found
          {record.code ? ` in ${record.code.repos.length} repositories` : ""}.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onDone(null)} disabled={saving}>
            Later
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || !draft.name.trim()}
            data-testid="brand-import-save"
          >
            {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {target ? `Update “${target.name}”` : "Save brand kit"}
          </Button>
        </div>
      </div>
      <LibraryPicker
        open={picking}
        onOpenChange={(open) => !open && setPicking(false)}
        accept={["image"]}
        max={1}
        title="The brand's logo"
        onConfirm={(chosen: AssetRow[]) => {
          const asset = chosen[0];
          if (asset) set({ libraryLogo: asset, logo: null });
          setPicking(false);
        }}
      />
    </div>
  );
}

/**
 * Imports a brand's design system from its website or its guidelines: the
 * scan, followed step by step, then a review of what was read (the brand as
 * a card, its palette, type, look, voice and pictures) before it is kept as
 * a brand kit, new or updating one.
 */
export function BrandImportDialog({
  open,
  onOpenChange,
  kit = null,
  initialUrl = null,
  importId: existing = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The kit an import updates (re-reading its website, say). */
  kit?: BrandKit | null;
  initialUrl?: string | null;
  /** An import to open for review. */
  importId?: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: kitData } = useBrandKits();
  const [tab, setTab] = useState<BrandImport["kind"]>("url");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [repos, setRepos] = useState("");
  const [token, setToken] = useState("");
  const [importId, setImportId] = useState<string | null>(existing);
  const [working, setWorking] = useState(false);
  const [local, setLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: record } = useBrandImport(importId);

  useEffect(() => {
    if (!open) return;
    setImportId(existing);
    // Re-reading a kit read from code reads the same repositories again.
    const fromCode = kit?.source?.kind === "repos";
    setTab(fromCode ? "repos" : "url");
    setRepos(fromCode ? (kit?.source?.title ?? "").split(/,\s*/).join("\n") : "");
    setToken("");
    setUrl(
      initialUrl ??
        (fromCode ? null : kit?.source?.url) ??
        (kit?.website ? `https://${kit.website}` : ""),
    );
    setError(null);
    setLocal("");
    setWorking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);

  const kind = record?.kind ?? tab;
  const stages =
    kind === "document" ? DOCUMENT_STAGES : kind === "repos" ? CODE_STAGES : WEBSITE_STAGES;
  const listed = reposOf(repos);
  const failed = error ?? (record?.status === "failed" ? record.error : null);
  const ready = record && record.status === "ready" && record.proposal;
  const kept = record?.status === "applied";
  const scanning = working || record?.status === "scanning";
  const kits = kitData?.kits ?? [];
  const reviewKit =
    kit ??
    (record?.brandKitId ? (kits.find((entry) => entry.id === record.brandKitId) ?? null) : null);

  async function scanSite() {
    if (!url.trim() || working) return;
    setWorking(true);
    setError(null);
    try {
      // The import shows (and is followed) from the moment the server makes it.
      const result = await streamBrandImport({ action: "website", url: url.trim() }, setImportId);
      if (!result.ok) setError(result.error);
      await queryClient.invalidateQueries({ queryKey: ["brand_import", result.importId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The website couldn't be scanned");
    } finally {
      setWorking(false);
    }
  }

  async function scanCode() {
    if (!listed.repos.length || working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await streamBrandImport(
        {
          action: "repos",
          repos: listed.repos.slice(0, MAX_IMPORT_REPOS),
          token: token.trim() || null,
        },
        setImportId,
      );
      if (!result.ok) setError(result.error);
      await queryClient.invalidateQueries({ queryKey: ["brand_import", result.importId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The repositories couldn't be read");
    } finally {
      // The token was for this one scan.
      setToken("");
      setWorking(false);
    }
  }

  async function readFile(file: File) {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      setLocal("Opening the document…");
      const parsed = await readGuidelines(file, setLocal);
      if (!parsed.text.trim() && !parsed.images.length)
        throw new Error("Nothing could be read from that document");
      const title = parsed.title ?? file.name.replace(/\.[^.]+$/, "");
      const started = await startBrandDocumentImport({ data: { title } });
      setImportId(started.importId);
      const pictures = await uploadGuidelinePictures(
        picturesToSend(parsed),
        started.folder,
        setLocal,
      );
      setLocal("Reading the brand…");
      const result = await streamBrandImport(
        {
          action: "document",
          importId: started.importId,
          text: parsed.text.slice(0, 200_000),
          pageCount: parsed.pageCount,
          pictures,
        },
        () => undefined,
      );
      if (!result.ok) setError(result.error);
      await queryClient.invalidateQueries({ queryKey: ["brand_import", started.importId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document couldn't be read");
    } finally {
      setWorking(false);
      setLocal("");
    }
  }

  async function discard() {
    if (importId) await discardBrandImport({ data: { importId } }).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: ["brand_imports"] });
    setImportId(null);
    setError(null);
  }

  const close = async (kitId: string | null) => {
    await queryClient.invalidateQueries({ queryKey: ["brand_kits"] });
    await queryClient.invalidateQueries({ queryKey: ["brand_imports"] });
    onOpenChange(false);
    if (kitId) setImportId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="size-5 text-primary" />
            {ready
              ? "Review the design system"
              : kit
                ? `Re-read “${kit.name}”`
                : "Import a design system"}
          </DialogTitle>
          <DialogDescription>
            {ready
              ? "What the studio read from the brand. Change anything, then keep it as a brand kit: its look then goes into every image and video made in it."
              : "From the brand's website, its guidelines (PDF, Word or PowerPoint) or its code on GitHub: its colours, typefaces, logo, the look of its imagery and its voice."}
          </DialogDescription>
        </DialogHeader>

        {kept ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm">
            <CheckCircle2 className="size-8 text-success" />
            <p>This import was kept as a brand kit.</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : ready && record ? (
          <Review
            key={record.id}
            record={record}
            kit={reviewKit}
            kits={kits}
            onDone={(kitId) => void close(kitId)}
          />
        ) : scanning ? (
          <Progress stages={stages} current={record?.stage ?? null} local={local} />
        ) : (
          <div className="space-y-4">
            {failed && (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="space-y-2">
                  <p>{failed}</p>
                  {importId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => void discard()}
                    >
                      Clear it
                    </Button>
                  )}
                </div>
              </div>
            )}
            <Tabs value={tab} onValueChange={(value) => setTab(value as BrandImport["kind"])}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="url">
                  <Globe className="mr-1.5 size-4" /> Website
                </TabsTrigger>
                <TabsTrigger value="document">
                  <FileText className="mr-1.5 size-4" /> Guidelines
                </TabsTrigger>
                <TabsTrigger value="repos">
                  <Code2 className="mr-1.5 size-4" /> Code
                </TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-3 pt-3">
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void scanSite();
                  }}
                >
                  <Input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="aurixasystems.com.au"
                    inputMode="url"
                    autoFocus
                    data-testid="brand-import-url"
                  />
                  <Button type="submit" disabled={!url.trim() || working}>
                    <ScanSearch className="mr-1.5 size-4" /> Scan
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  The studio reads the page and its stylesheets for the colours it uses (and how
                  much), its typefaces, its logo and pictures, and its words; then its AI reads the
                  brand's look and voice. Google fonts are installed for titles; other fonts get the
                  closest Google font until you upload the licensed file.
                </p>
              </TabsContent>
              <TabsContent value="document" className="space-y-3 pt-3">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const file = event.dataTransfer.files[0];
                    if (file) void readFile(file);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-sm transition",
                    dragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/60",
                  )}
                >
                  <Upload className="size-6 text-muted-foreground" />
                  <span className="font-medium">
                    Drop the brand guidelines here, or choose a file
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PDF, Word (.docx) or PowerPoint (.pptx)
                  </span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={BRIEF_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void readFile(file);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  It's read in your browser: its text for colour codes (HEX, RGB, CMYK, Pantone),
                  typefaces, voice and rules, and pictures of its colour, type and logo pages for
                  the AI to look at.
                </p>
              </TabsContent>
              <TabsContent value="repos" className="space-y-3 pt-3">
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void scanCode();
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor="brand-import-repos">GitHub repositories</Label>
                    <Textarea
                      id="brand-import-repos"
                      value={repos}
                      onChange={(event) => setRepos(event.target.value)}
                      placeholder={
                        "acme/website\nacme/app\ngithub.com/acme/monorepo/tree/main/apps/web"
                      }
                      rows={4}
                      spellCheck={false}
                      className="font-mono text-xs"
                      data-testid="brand-import-repos"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      One a line, up to {MAX_IMPORT_REPOS}. The first is the brand's own: where they
                      disagree, its names and values lead. A branch or folder can be named in the
                      address.
                    </p>
                    {listed.unreadable.length > 0 && (
                      <p className="text-[11px] text-destructive">
                        Not a repository: {listed.unreadable.slice(0, 3).join(", ")}
                      </p>
                    )}
                    {listed.repos.length > MAX_IMPORT_REPOS && (
                      <p className="text-[11px] text-warning">
                        Only the first {MAX_IMPORT_REPOS} are read.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="brand-import-token">
                      GitHub token (for private repositories)
                    </Label>
                    <Input
                      id="brand-import-token"
                      type="password"
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      placeholder="github_pat_…"
                      autoComplete="off"
                      spellCheck={false}
                      data-testid="brand-import-token"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      A fine-grained token that can read their contents. It is used for this scan
                      and never kept; without one, the studio's own token is used if it has one.
                    </p>
                  </div>
                  <Button type="submit" disabled={!listed.repos.length || working}>
                    <ScanSearch className="mr-1.5 size-4" /> Read the code
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  The studio reads each repository's styling code at its latest commit, as text and
                  never run: its stylesheets and the files they import, its Tailwind and shadcn
                  configs, design tokens, theme modules and the fonts its app loads. It keeps every
                  colour with the token that names it and the file and line it is on, the type and
                  its scales (radius, shadow, motion), and offers them as a tokens.css.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
