import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ImagePlus,
  Loader2,
  Palette,
  Plus,
  ScanSearch,
  Star,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AssetRow } from "@/hooks/useStudioData";
import { useProjects } from "@/hooks/useStudioData";
import { useAssetsById } from "@/hooks/useLongVideos";
import { uploadBrandFont, useBrandFontFaces, useBrandKits } from "@/hooks/useBrandKits";
import { archiveBrandKit, saveBrandKit } from "@/lib/brand.functions";
import { KIT_FONT_FILES } from "@/lib/brand/kit-input";
import {
  DEFAULT_FONT,
  FONT_STYLE_LABELS,
  fontChoices,
  type BrandFont,
  type BrandKit,
} from "@/lib/edit/brand";
import { draftOf, EMPTY, type Draft } from "@/components/brand/kit-draft";
import { BrandImportDialog } from "@/components/brand/BrandImportDialog";
import { DesignSystemEditor } from "@/components/brand/DesignSystemEditor";
import { DnaEditor } from "@/components/brand/DnaEditor";
import { OwnFormulas } from "@/components/brand/OwnFormulas";
import { isEmptyDna, mergeSuggestion, typeWords } from "@/lib/brand/dna";
import { suggestDna } from "@/lib/brand/dna-client";
import { OVERLAY_BACKING_LABELS, OVERLAY_BACKINGS, type OverlayBacking } from "@/lib/edit/timeline";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * The team's brand kits: each a brand's logo, end-card background, fonts,
 * colours and title style, its tagline and call to action, and the names
 * its captions spell right. The Editor applies one to an edit's titles and
 * captions and composes its end card from it.
 */
export function BrandKitsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useBrandKits();
  const { data: projects = [] } = useProjects();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const kits = data?.kits ?? [];
  const assetIds = kits.flatMap((kit) => (kit.logoAssetId ? [kit.logoAssetId] : []));
  const { data: assets } = useAssetsById(assetIds);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading brand kits…</p>;
  if (data && !data.supported)
    return (
      <p className="text-sm text-muted-foreground">
        Brand kits need a database update (migration 0018_brand_kits). Until an admin applies it,
        titles use the studio's own style.
      </p>
    );

  const archive = async (kit: BrandKit) => {
    try {
      await archiveBrandKit({ data: { id: kit.id } });
      await queryClient.invalidateQueries({ queryKey: ["brand_kits"] });
      toast.success(`“${kit.name}” archived.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The kit couldn't be archived");
    }
  };

  return (
    <div className="space-y-3" data-testid="brand-kits">
      {kits.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No brand kits yet. A kit puts a brand's fonts, colours, logo and end card one click away
          in the Editor.
        </p>
      )}
      <ul className="space-y-2">
        {kits.map((kit) => {
          const logo = kit.logoAssetId ? assets?.get(kit.logoAssetId) : undefined;
          const project = projects.find((entry) => entry.id === kit.projectId);
          return (
            <li
              key={kit.id}
              className="flex items-center gap-3 rounded-md border border-border p-2"
              data-testid="brand-kit"
            >
              <div
                className="relative size-12 shrink-0 overflow-hidden rounded"
                style={{ background: kit.backgroundColor }}
              >
                {logo && (
                  <MediaPreview
                    bucket={logo.storage_bucket}
                    path={logo.storage_path}
                    type="image"
                    contain
                    alt={`${kit.name} logo`}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {kit.name}
                  {kit.isDefault && <Star className="size-3.5 fill-current text-warning" />}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {kit.isDefault
                    ? "The studio's default"
                    : project
                      ? `For ${project.name}`
                      : "For any project"}{" "}
                  · {kit.headingFont ?? DEFAULT_FONT}
                  {kit.bodyFont && kit.bodyFont !== kit.headingFont ? ` / ${kit.bodyFont}` : ""}
                </p>
                <div className="mt-1 flex gap-1">
                  {[kit.textColor, kit.accentColor, kit.backgroundColor].map((value, index) => (
                    <span
                      key={index}
                      className="size-3.5 rounded-sm border border-border"
                      style={{ background: value }}
                      title={value}
                    />
                  ))}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDraft(draftOf(kit))}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Archive ${kit.name}`}
                onClick={() => void archive(kit)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setImporting(true)}>
          <ScanSearch className="mr-1.5 size-3.5" /> Import from a website or guidelines
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="mr-1.5 size-3.5" /> New brand kit
        </Button>
      </div>
      {draft && <BrandKitDialog draft={draft} onClose={() => setDraft(null)} />}
      <BrandImportDialog open={importing} onOpenChange={setImporting} />
    </div>
  );
}

export function BrandKitDialog({ draft: initial, onClose }: { draft: Draft; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState<"logo" | "endCard" | "references" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: assets } = useAssetsById(
    [draft.logoAssetId, draft.endCardAssetId, ...draft.referenceAssetIds].filter(
      (id): id is string => !!id,
    ),
  );
  useBrandFontFaces(draft.fonts);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const families = fontChoices(draft.fonts);

  const addFont = async (file: File) => {
    setUploading(true);
    try {
      const font = await uploadBrandFont(file);
      const styleOf = (entry: BrandFont) => entry.style ?? "regular";
      setDraft((current) => ({
        ...current,
        // A family keeps a file for each style: a new one replaces only its own style.
        fonts: [
          ...current.fonts.filter(
            (entry) => entry.family !== font.family || styleOf(entry) !== styleOf(font),
          ),
          font,
        ].slice(0, KIT_FONT_FILES),
        // A kit's first font is used for its titles straight away.
        headingFont: current.fonts.length ? current.headingFont : font.family,
      }));
      toast.success(
        `“${font.family}”${font.style && font.style !== "regular" ? ` (${FONT_STYLE_LABELS[font.style].toLowerCase()})` : ""} added.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The font couldn't be added");
    } finally {
      setUploading(false);
    }
  };

  const [suggesting, setSuggesting] = useState(false);
  const suggest = async () => {
    setSuggesting(true);
    try {
      const read = await suggestDna({
        name: draft.name,
        website: draft.website.trim() || null,
        tagline: draft.tagline.trim() || null,
        callToAction: draft.callToAction.trim() || null,
        terms: draft.terms
          .split(/\n|,/)
          .map((term) => term.trim())
          .filter(Boolean)
          .slice(0, 50),
        design: draft.design as unknown as Record<string, unknown>,
      });
      const kept = !isEmptyDna(draft.dna);
      setDraft((current) => ({ ...current, dna: mergeSuggestion(current.dna, read.dna) }));
      toast.success(
        `Read from ${read.read.join(" and ")}${read.model ? ` by ${read.model}` : ""}.${kept ? " What you'd written is kept." : ""} Look it over, then save.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The brand's DNA couldn't be read");
    } finally {
      setSuggesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveBrandKit({
        data: {
          id: draft.id,
          name: draft.name,
          projectId: draft.projectId,
          isDefault: draft.isDefault && !draft.projectId,
          logoAssetId: draft.logoAssetId,
          endCardAssetId: draft.endCardAssetId,
          headingFont: draft.headingFont,
          bodyFont: draft.bodyFont,
          fonts: draft.fonts,
          textColor: draft.textColor,
          accentColor: draft.accentColor,
          backgroundColor: draft.backgroundColor,
          titleBacking: draft.titleBacking,
          uppercaseTitles: draft.uppercaseTitles,
          tagline: draft.tagline || null,
          callToAction: draft.callToAction || null,
          website: draft.website || null,
          terms: draft.terms
            .split(/\n|,/)
            .map((term) => term.trim())
            .filter(Boolean),
          palette: draft.palette,
          design: draft.design as unknown as Record<string, unknown>,
          referenceAssetIds: draft.referenceAssetIds,
          dna: draft.dna as unknown as Record<string, unknown>,
          formulas: draft.ownFormulas as unknown as Record<string, unknown>[],
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["brand_kits"] });
      toast.success(`“${draft.name}” saved.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The kit couldn't be saved");
    } finally {
      setSaving(false);
    }
  };

  const picture = (id: string | null): AssetRow | undefined => (id ? assets?.get(id) : undefined);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? `Edit “${initial.name}”` : "New brand kit"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="kit-name">Name</Label>
              <Input
                id="kit-name"
                value={draft.name}
                maxLength={120}
                onChange={(event) => set({ name: event.target.value })}
                placeholder="e.g. Aurixa Systems"
              />
            </div>
            <div className="space-y-1">
              <Label>Used for</Label>
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
          </div>
          {!draft.projectId && (
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={draft.isDefault}
                onCheckedChange={(checked) => set({ isDefault: checked })}
              />
              The studio's default kit (used where a project has none of its own)
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["logo", "Logo", draft.logoAssetId, "A PNG with a clear background works best."],
                [
                  "endCard",
                  "End card background",
                  draft.endCardAssetId,
                  "A still or a short video the logo and words are set on. Without one, the end card is the brand's background colour.",
                ],
              ] as const
            ).map(([key, label, id, hint]) => {
              const asset = picture(id);
              return (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <div className="flex items-center gap-2">
                    <div
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-border"
                      style={{ background: draft.backgroundColor }}
                    >
                      {asset && (
                        <MediaPreview
                          bucket={asset.storage_bucket}
                          path={asset.storage_path}
                          type={asset.asset_type === "video" ? "video" : "image"}
                          contain
                          alt={label}
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="outline" onClick={() => setPicking(key)}>
                        <ImagePlus className="mr-1.5 size-3.5" /> {id ? "Change" : "Choose"}
                      </Button>
                      {id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() =>
                            set(key === "logo" ? { logoAssetId: null } : { endCardAssetId: null })
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{hint}</p>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Type className="size-3.5" /> Fonts
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {draft.fonts.map((font) => {
                const style = font.style ?? "regular";
                const name = `${font.family}${style === "regular" ? "" : ` ${FONT_STYLE_LABELS[style]}`}`;
                return (
                  <span
                    key={font.path}
                    className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs"
                    style={{
                      fontFamily: `"${font.family}", Inter, sans-serif`,
                      fontStyle: style.endsWith("italic") ? "italic" : "normal",
                      fontWeight: style.startsWith("bold") ? 700 : 400,
                    }}
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const fonts = draft.fonts.filter((entry) => entry.path !== font.path);
                        // Titles and captions keep the family while it has a file left.
                        const kept = (family: string) =>
                          family !== font.family || fonts.some((entry) => entry.family === family)
                            ? family
                            : DEFAULT_FONT;
                        set({
                          fonts,
                          headingFont: kept(draft.headingFont),
                          bodyFont: kept(draft.bodyFont),
                        });
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={uploading || draft.fonts.length >= KIT_FONT_FILES}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 size-3.5" />
                )}
                Upload a font
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".ttf,.otf,font/ttf,font/otf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void addFont(file);
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              TrueType or OpenType files the brand is licensed to use in video. Upload the weight
              you want (e.g. its Bold for titles): it is used as drawn.
            </p>
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
            <Label className="flex items-center gap-1.5">
              <Palette className="size-3.5" /> Colours and titles
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["textColor", "Text"],
                  ["accentColor", "Accent (boxes, call to action)"],
                  ["backgroundColor", "Background (end card)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs">
                  <span className="block text-muted-foreground">{label}</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={draft[key]}
                      onChange={(event) => set({ [key]: event.target.value })}
                      className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                      aria-label={label}
                    />
                    <span className="font-mono text-[11px]">{draft[key]}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">What keeps titles readable</Label>
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
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-xs">
                <Switch
                  checked={draft.uppercaseTitles}
                  onCheckedChange={(checked) => set({ uppercaseTitles: checked })}
                />
                Titles in capitals
              </label>
            </div>
            <div
              className="flex h-20 flex-col items-center justify-center gap-1 rounded-md"
              style={{ background: draft.backgroundColor }}
              data-testid="brand-kit-sample"
            >
              <span
                style={{
                  fontFamily: `"${draft.headingFont}", Inter, sans-serif`,
                  color: draft.textColor,
                  fontSize: 20,
                  fontWeight: draft.headingFont === DEFAULT_FONT ? 800 : undefined,
                }}
              >
                {(draft.uppercaseTitles
                  ? (draft.name || "Your brand").toUpperCase()
                  : draft.name) || "Your brand"}
              </span>
              {draft.callToAction && (
                <span
                  className="rounded px-2 py-0.5 text-xs"
                  style={{
                    background: draft.accentColor,
                    color: "#fff",
                    fontFamily: `"${draft.headingFont}", Inter, sans-serif`,
                  }}
                >
                  {draft.callToAction}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor="kit-tagline">Tagline</Label>
              <Input
                id="kit-tagline"
                value={draft.tagline}
                maxLength={160}
                onChange={(event) => set({ tagline: event.target.value })}
                placeholder="e.g. Your business. Your experience. Your decision."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="kit-cta">Call to action</Label>
              <Input
                id="kit-cta"
                value={draft.callToAction}
                maxLength={60}
                onChange={(event) => set({ callToAction: event.target.value })}
                placeholder="e.g. Start your 14-day trial"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="kit-website">Website</Label>
              <Input
                id="kit-website"
                value={draft.website}
                maxLength={120}
                onChange={(event) => set({ website: event.target.value })}
                placeholder="e.g. aurixasystems.com.au"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="kit-terms">Names to spell right in captions</Label>
            <Textarea
              id="kit-terms"
              value={draft.terms}
              onChange={(event) => set({ terms: event.target.value })}
              placeholder={"One per line, e.g.\nAurixa Systems"}
              className="min-h-[64px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Captions made from a voiceover's words take these spellings where the transcript heard
              something close ("Arixa" becomes "Aurixa").
            </p>
          </div>

          <Accordion type="multiple" className="rounded-md border border-border px-3">
            <AccordionItem value="system" className="border-b-0">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  Design system
                  <span className="flex h-3 w-16 overflow-hidden rounded-sm border border-border">
                    {draft.palette.slice(0, 8).map((colour) => (
                      <span
                        key={colour.hex}
                        className="flex-1"
                        style={{ background: colour.hex }}
                      />
                    ))}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <DesignSystemEditor
                  name={draft.name}
                  palette={draft.palette}
                  onPalette={(palette) => set({ palette })}
                  design={draft.design}
                  onDesign={(design) => set({ design })}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="dna" className="border-b-0">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  Brand DNA
                  <span className="text-xs font-normal text-muted-foreground">
                    {typeWords(draft.dna) ?? "not set"}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <DnaEditor
                  dna={draft.dna}
                  onDna={(dna) => set({ dna })}
                  name={draft.name}
                  audience={draft.design.audience}
                  onSuggest={draft.name.trim() ? () => void suggest() : undefined}
                  suggesting={suggesting}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="formulas" className="border-b-0">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  Content formulas
                  <span className="text-xs font-normal text-muted-foreground">
                    {[
                      draft.ownFormulas.length
                        ? `${draft.ownFormulas.length} written for it`
                        : null,
                      draft.dna.formulas.length ? `${draft.dna.formulas.length} pinned` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "ranked for its DNA"}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Proven structures for its content, each with timed beats, rules and the research
                  it rests on. Pinned ones, then those written for it, come first wherever this
                  brand's content is planned.
                </p>
                <OwnFormulas
                  brand={{
                    name: draft.name,
                    website: draft.website.trim() || null,
                    tagline: draft.tagline.trim() || null,
                    callToAction: draft.callToAction.trim() || null,
                    terms: draft.terms
                      .split(/\n|,/)
                      .map((term) => term.trim())
                      .filter(Boolean),
                    design: draft.design as unknown as Record<string, unknown>,
                    dna: draft.dna,
                  }}
                  own={draft.ownFormulas}
                  onOwn={(ownFormulas) => set({ ownFormulas })}
                  onPins={(formulas) => set({ dna: { ...draft.dna, formulas } })}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="references" className="border-b-0">
              <AccordionTrigger className="text-sm">
                Style references ({draft.referenceAssetIds.length})
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Pictures that show the brand's look, offered as reference images wherever a model
                  takes them.
                </p>
                <div className="flex flex-wrap gap-2">
                  {draft.referenceAssetIds.map((id) => {
                    const asset = picture(id);
                    return (
                      <div
                        key={id}
                        className="relative h-16 w-24 overflow-hidden rounded border border-border bg-muted"
                      >
                        {asset && (
                          <MediaPreview
                            bucket={asset.storage_bucket}
                            path={asset.storage_path}
                            type="image"
                            alt="Style reference"
                          />
                        )}
                        <button
                          type="button"
                          aria-label="Remove this reference"
                          className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"
                          onClick={() =>
                            set({
                              referenceAssetIds: draft.referenceAssetIds.filter(
                                (entry) => entry !== id,
                              ),
                            })
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                  <Button
                    variant="outline"
                    className="h-16"
                    disabled={draft.referenceAssetIds.length >= 12}
                    onClick={() => setPicking("references")}
                  >
                    <ImagePlus className="mr-1.5 size-4" /> Add
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || !draft.name.trim()}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Save kit
            </Button>
          </div>
        </div>
        <LibraryPicker
          open={picking !== null}
          onOpenChange={(open) => !open && setPicking(null)}
          accept={picking === "endCard" ? ["image", "video"] : ["image"]}
          max={picking === "references" ? Math.max(1, 12 - draft.referenceAssetIds.length) : 1}
          title={
            picking === "logo"
              ? "The brand's logo"
              : picking === "references"
                ? "Pictures in the brand's look"
                : "The end card's background"
          }
          onConfirm={(chosen: AssetRow[]) => {
            if (picking === "references")
              set({
                referenceAssetIds: [
                  ...new Set([...draft.referenceAssetIds, ...chosen.map((asset) => asset.id)]),
                ].slice(0, 12),
              });
            else {
              const asset = chosen[0];
              if (asset)
                set(picking === "logo" ? { logoAssetId: asset.id } : { endCardAssetId: asset.id });
            }
            setPicking(null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
