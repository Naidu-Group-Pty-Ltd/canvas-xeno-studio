import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetRow } from "@/hooks/useStudioData";
import { useProjects } from "@/hooks/useStudioData";
import { planCharacter, useCharacters } from "@/hooks/useCharacters";
import { getKatanaPreset, startKatana } from "@/lib/katana.functions";
import { KATANA_MODE_LABELS } from "@/lib/katana/model";
import { KATANA_FIELDS } from "@/lib/katana/messages";
import { KATANA_IMAGES_MAX, VIEW_SHORT, katanaSheet } from "@/lib/katana/cast";
import {
  KATANA_DRAFT_EVENT,
  readKatanaDraft,
  writeKatanaDraft,
  type KatanaDraft,
} from "@/lib/katana/handoff";
import { KatanaCast } from "./KatanaCast";
import { MediaSlot, type FixedMedia } from "./MediaSlot";
import { PresetPicker, type PickedPreset } from "./PresetPicker";

type Mode = "remix" | "preset" | "edit";

interface Defaults {
  defaultCreditLimit: number;
  maxCreditLimit: number;
  defaultClaudeBudgetUsd: number;
}

const NO_PROJECT = "none";

/** Ways to say how to edit footage, Katana's own examples first. */
const EDIT_IDEAS = [
  "Make a sigma edit out of it",
  "A 15 s teaser with bold captions on the beat",
  "Recut it to the soundtrack, fastest cuts on the drop",
  "A vertical ad: a hook in the first second, captions, ending on the product",
];

const ids = (assets: AssetRow[]) => assets.map((asset) => asset.id);

function namesOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * Starts a Katana run: what to make, from which media and characters, within
 * which limits. The form is this tab's Katana draft: what other pages send to
 * Katana lands in it, and it is kept as it changes until the run starts.
 */
export function NewKatanaRun({ defaults, disabled }: { defaults: Defaults; disabled: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const { data: team = [], isLoading: loadingTeam, isError: teamFailed } = useCharacters();
  const [mode, setMode] = useState<Mode>("remix");
  const [reference, setReference] = useState<AssetRow[]>([]);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [images, setImages] = useState<AssetRow[]>([]);
  const [footage, setFootage] = useState<AssetRow[]>([]);
  const [soundtrack, setSoundtrack] = useState<AssetRow[]>([]);
  const [preset, setPreset] = useState<PickedPreset | null>(null);
  const [presetMedia, setPresetMedia] = useState<Record<string, AssetRow[]>>({});
  const [brief, setBrief] = useState("");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [creditLimit, setCreditLimit] = useState(String(defaults.defaultCreditLimit));
  const [claudeBudget, setClaudeBudget] = useState(String(defaults.defaultClaudeBudgetUsd));
  const [starting, setStarting] = useState(false);
  const lock = useRef(false);
  // The draft is put back first; until it is, nothing is written over it.
  const [restored, setRestored] = useState(false);
  const restoring = useRef(0);
  const started = useRef(false);

  /** Puts the tab's draft into the form (on opening, and when something is sent meanwhile). */
  const restore = useCallback(async () => {
    const turn = ++restoring.current;
    const draft = readKatanaDraft();
    if (!draft) {
      setRestored(true);
      return;
    }
    // What was sent since the page last showed it is said once.
    if (draft.arrivals.length) {
      writeKatanaDraft({ ...draft, arrivals: [] });
      toast.success("Added to Katana", { description: draft.arrivals.join(" ") });
    }
    const wanted = [
      ...new Set([...Object.values(draft.files), ...Object.values(draft.presetFiles)].flat()),
    ];
    const found = new Map<string, AssetRow>();
    if (wanted.length) {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .in("id", wanted)
        .is("deleted_at", null);
      if (turn !== restoring.current) return;
      if (error) {
        // Kept as it is for the next visit rather than written over without its files.
        toast.error("The Katana draft's files couldn't be loaded. Reload the page to try again.");
        return;
      }
      for (const asset of (data ?? []) as unknown as AssetRow[]) found.set(asset.id, asset);
    }
    const rows = (list: string[]) => list.flatMap((id) => found.get(id) ?? []);
    setMode(draft.mode);
    setReference(rows(draft.files.reference));
    setFootage(rows(draft.files.footage));
    setImages(rows(draft.files.images));
    setSoundtrack(rows(draft.files.soundtrack));
    setCharacterIds(draft.characterIds);
    setReferenceUrl(draft.referenceUrl);
    setBrief(draft.brief);
    setTitle(draft.title);
    setProjectId(draft.projectId ?? NO_PROJECT);
    setPreset(draft.preset);
    setPresetMedia(
      Object.fromEntries(
        Object.entries(draft.presetFiles).map(([field, list]) => [field, rows(list)]),
      ),
    );
    if (found.size < wanted.length) {
      toast.message("Files no longer in the library were left out of the Katana draft.");
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    void restore();
    const onSend = () => void restore();
    window.addEventListener(KATANA_DRAFT_EVENT, onSend);
    return () => window.removeEventListener(KATANA_DRAFT_EVENT, onSend);
  }, [restore]);

  // The form, kept as the tab's draft as it changes.
  useEffect(() => {
    if (!restored || started.current) return;
    const draft: KatanaDraft = {
      mode,
      files: {
        reference: ids(reference),
        footage: ids(footage),
        images: ids(images),
        soundtrack: ids(soundtrack),
      },
      characterIds,
      referenceUrl,
      brief,
      title,
      projectId: projectId === NO_PROJECT ? null : projectId,
      preset,
      presetFiles: Object.fromEntries(
        Object.entries(presetMedia).map(([field, list]) => [field, ids(list)]),
      ),
      arrivals: [],
    };
    writeKatanaDraft(draft);
  }, [
    restored,
    mode,
    reference,
    footage,
    images,
    soundtrack,
    characterIds,
    referenceUrl,
    brief,
    title,
    projectId,
    preset,
    presetMedia,
  ]);

  const hasContent =
    reference.length + footage.length + images.length + soundtrack.length > 0 ||
    characterIds.length > 0 ||
    !!referenceUrl.trim() ||
    !!brief.trim() ||
    !!title.trim() ||
    !!preset ||
    projectId !== NO_PROJECT;

  function clearForm() {
    writeKatanaDraft(null);
    setMode("remix");
    setReference([]);
    setReferenceUrl("");
    setImages([]);
    setFootage([]);
    setSoundtrack([]);
    setPreset(null);
    setPresetMedia({});
    setCharacterIds([]);
    setBrief("");
    setTitle("");
    setProjectId(NO_PROJECT);
  }

  useEffect(
    () => setCreditLimit(String(defaults.defaultCreditLimit)),
    [defaults.defaultCreditLimit],
  );
  useEffect(
    () => setClaudeBudget(String(defaults.defaultClaudeBudgetUsd)),
    [defaults.defaultClaudeBudgetUsd],
  );

  const details = useQuery({
    queryKey: ["katana-preset", preset?.slug],
    queryFn: () => getKatanaPreset({ data: { slug: preset!.slug } }),
    enabled: mode === "preset" && !!preset,
    staleTime: 10 * 60_000,
  });
  const presetFields = useMemo(
    () =>
      (details.data?.inputs ?? []).filter(
        (input) => input.field.startsWith("media.") && input.kind !== "text",
      ),
    [details.data],
  );
  const wishes = details.data?.inputs.find((input) => input.field === "slot_values.prompt");

  // A character taken off the Characters page since it was chosen leaves the draft.
  useEffect(() => {
    if (loadingTeam || teamFailed) return;
    setCharacterIds((current) => {
      const kept = current.filter((id) => team.some((character) => character.id === id));
      return kept.length === current.length ? current : kept;
    });
  }, [team, loadingTeam, teamFailed, characterIds]);

  // The characters chosen (those still on the Characters page), and the
  // images of theirs that go: to the images in a remix or an edit, to a
  // preset's first field that takes images.
  const cast = useMemo(
    () =>
      characterIds.flatMap((id) => {
        const entry = team.find((character) => character.id === id);
        return entry ? [entry] : [];
      }),
    [characterIds, team],
  );
  const castField =
    mode === "preset"
      ? (presetFields.find((field) => field.kind === "image") ??
        presetFields.find((field) => field.kind === "other") ??
        null)
      : null;
  const sheetRoom =
    mode === "preset" ? (castField ? Math.max(1, castField.max) : 0) : KATANA_IMAGES_MAX;
  const sheet = useMemo(() => katanaSheet(cast.map(planCharacter), sheetRoom), [cast, sheetRoom]);
  const sheetFiles: FixedMedia[] = useMemo(
    () =>
      sheet.flatMap((image) => {
        const character = cast.find((entry) => entry.id === image.characterId);
        const asset = character?.images.find((entry) => entry.assetId === image.assetId)?.asset;
        return character && asset
          ? [{ asset, label: `${character.name} · ${VIEW_SHORT[image.view]}` }]
          : [];
      }),
    [sheet, cast],
  );
  const sheetIds = useMemo(() => new Set(sheetFiles.map((entry) => entry.asset.id)), [sheetFiles]);
  const otherImages = images.filter((asset) => !sheetIds.has(asset.id));
  const castInRun = cast.filter((character) =>
    sheet.some((image) => image.characterId === character.id),
  );
  const castProblem = (() => {
    if (!cast.length) return null;
    const names = namesOf(cast.map((character) => character.name));
    if (mode === "preset") {
      if (!preset || details.isLoading) return null;
      if (!castField)
        return `This preset takes no images, so it can't keep ${names} the same. Take ${cast.length === 1 ? "them" : "them all"} out, or choose another preset.`;
    }
    const left = cast.filter((character) => !castInRun.includes(character));
    if (left.length) {
      return `${castField?.label ?? "The images"} take${castField ? "s" : ""} ${sheetRoom} at most, so ${namesOf(left.map((character) => character.name))} ${left.length === 1 ? "doesn't" : "don't"} fit. Take someone out.`;
    }
    return null;
  })();

  const credits = Number(creditLimit);
  const budget = Number(claudeBudget);
  const limitsOk =
    Number.isFinite(credits) &&
    credits > 0 &&
    credits <= defaults.maxCreditLimit &&
    Number.isFinite(budget) &&
    budget >= 1 &&
    budget <= 1000;

  const imagesOver = sheetFiles.length + otherImages.length - KATANA_IMAGES_MAX;
  const missing = (() => {
    if (characterIds.length && loadingTeam) return "Loading the characters";
    if (characterIds.length && teamFailed)
      return "The characters couldn't be loaded. Reload the page, or take them out.";
    if (castProblem) return castProblem;
    if (mode !== "preset" && imagesOver > 0) {
      return `Katana takes ${KATANA_IMAGES_MAX} images in all, and the characters' sheets use ${sheetFiles.length}: take out ${imagesOver} of the other images.`;
    }
    if (mode === "remix") {
      if (reference.length && referenceUrl.trim()) return "Use a library video or a link, not both";
      if (!reference.length && !referenceUrl.trim() && brief.trim().length < 12)
        return "Add a reference, or a brief Katana can find one from";
      return null;
    }
    if (mode === "edit") {
      if (!footage.length) return "Choose the footage to edit";
      if (brief.trim().length < 4) return "Say how Katana should edit it";
      return null;
    }
    if (!preset) return "Choose a preset";
    if (details.isLoading) return "Loading the preset";
    for (const field of presetFields) {
      const fixed = field.field === castField?.field ? sheetFiles.length : 0;
      const chosen =
        fixed + (presetMedia[field.field] ?? []).filter((asset) => !sheetIds.has(asset.id)).length;
      if (chosen < field.min) return `${field.label}: add at least ${field.min}`;
      if (chosen > Math.max(1, field.max))
        return `${field.label} takes ${Math.max(1, field.max)} at most: take out ${chosen - Math.max(1, field.max)}`;
    }
    return null;
  })();

  function inputsForRun(): Array<{ assetId: string; field: string }> {
    const take = (assets: AssetRow[], field: string) =>
      assets.map((asset) => ({ assetId: asset.id, field }));
    // The characters' sheets go first, best views first.
    const withCast = (assets: AssetRow[]) => [
      ...sheetFiles.map((entry) => entry.asset),
      ...assets.filter((asset) => !sheetIds.has(asset.id)),
    ];
    if (mode === "remix") {
      return [
        ...take(reference, KATANA_FIELDS.referenceVideo),
        ...take(withCast(images), KATANA_FIELDS.images),
        ...take(soundtrack, KATANA_FIELDS.audio),
      ];
    }
    if (mode === "edit") {
      return [
        ...take(footage, KATANA_FIELDS.videos),
        ...take(withCast(images), KATANA_FIELDS.images),
        ...take(soundtrack, KATANA_FIELDS.audio),
      ];
    }
    return presetFields.flatMap((field) =>
      take(
        field.field === castField?.field
          ? withCast(presetMedia[field.field] ?? [])
          : (presetMedia[field.field] ?? []),
        field.field,
      ),
    );
  }

  async function start() {
    if (lock.current || missing || !limitsOk) return;
    lock.current = true;
    setStarting(true);
    try {
      const { runId } = await startKatana({
        data: {
          mode,
          presetSlug: mode === "preset" ? (preset?.slug ?? null) : null,
          presetName: mode === "preset" ? (details.data?.title ?? preset?.name ?? null) : null,
          title: title.trim(),
          brief: brief.trim(),
          referenceUrl: mode === "remix" && referenceUrl.trim() ? referenceUrl.trim() : null,
          inputs: inputsForRun(),
          characterIds: castInRun.map((character) => character.id),
          creditLimit: credits,
          claudeBudgetUsd: budget,
          projectId: projectId === NO_PROJECT ? null : projectId,
        },
      });
      // The draft became this run.
      started.current = true;
      writeKatanaDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["katana-runs"] });
      void navigate({ to: "/katana/$runId", params: { runId } });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Katana couldn't start");
    } finally {
      lock.current = false;
      setStarting(false);
    }
  }

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">New Katana run</h2>
          <p className="text-xs text-muted-foreground">
            Katana studies a reference edit frame by frame and remakes it for your subject, runs one
            of Higgsfield's presets, or edits your own footage. It runs on its own until the video
            is delivered. Videos, images, tracks and characters sent from elsewhere in the studio
            land here.
          </p>
        </div>
        {hasContent && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs text-muted-foreground"
            onClick={clearForm}
            data-testid="katana-clear"
          >
            <Eraser className="mr-1.5 size-3.5" /> Clear
          </Button>
        )}
      </div>

      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList>
          {(Object.keys(KATANA_MODE_LABELS) as Mode[]).map((value) => (
            <TabsTrigger key={value} value={value}>
              {KATANA_MODE_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="pt-3">
          <KatanaCast
            characters={team}
            selected={characterIds}
            onChange={setCharacterIds}
            sheet={sheet}
            problem={castProblem}
          />
        </div>

        <TabsContent value="remix" className="space-y-4 pt-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <MediaSlot
                label="Reference video"
                hint="The edit whose look, rhythm and effects Katana remakes. Or paste a link below."
                accept={["video"]}
                max={1}
                value={reference}
                onChange={setReference}
              />
              <div className="space-y-1.5">
                <Label htmlFor="katana-reference-url" className="text-xs">
                  Or a link to one{" "}
                  <span className="font-normal text-muted-foreground">(TikTok, Reels, Shorts)</span>
                </Label>
                <Input
                  id="katana-reference-url"
                  value={referenceUrl}
                  placeholder="https://www.tiktok.com/@…/video/…"
                  onChange={(event) => setReferenceUrl(event.target.value)}
                />
              </div>
            </div>
            <MediaSlot
              label="Your subject"
              hint={
                sheetFiles.length
                  ? "The characters' sheets go first; add other photos (a product, a place) up to 10 in all."
                  : "Photos of the person, character or product the new video is about (up to 10)."
              }
              accept={["image"]}
              max={KATANA_IMAGES_MAX}
              fixed={sheetFiles}
              value={otherImages}
              onChange={setImages}
            />
          </div>
          <MediaSlot
            label="Soundtrack"
            hint="A track to cut to instead of the reference's."
            accept={["audio"]}
            max={1}
            value={soundtrack}
            onChange={setSoundtrack}
          />
          <BriefField
            value={brief}
            onChange={setBrief}
            placeholder="What the remix should be about. Leave it empty to let Katana decide from the reference and your subject; with no reference, describe the edit and Katana finds one."
          />
        </TabsContent>

        <TabsContent value="preset" className="space-y-4 pt-3">
          <PresetPicker
            value={preset?.slug ?? null}
            onChange={(picked) => {
              setPreset(picked);
              setPresetMedia({});
            }}
          />
          {preset && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium">{details.data?.title ?? preset.name}</p>
                {details.isError && (
                  <p className="text-xs text-primary">
                    {details.error instanceof Error
                      ? details.error.message
                      : "The preset couldn't be opened."}
                  </p>
                )}
              </div>
              {details.isLoading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Reading the preset's inputs…
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {presetFields.map((field) => (
                    <MediaSlot
                      key={field.field}
                      label={field.label}
                      {...(field.description ? { hint: field.description } : {})}
                      accept={
                        field.kind === "other"
                          ? ["image", "video"]
                          : [field.kind as "image" | "video" | "audio"]
                      }
                      max={Math.max(1, field.max)}
                      required={field.required}
                      {...(field.field === castField?.field ? { fixed: sheetFiles } : {})}
                      value={(presetMedia[field.field] ?? []).filter(
                        (asset) => field.field !== castField?.field || !sheetIds.has(asset.id),
                      )}
                      onChange={(assets) =>
                        setPresetMedia((current) => ({ ...current, [field.field]: assets }))
                      }
                    />
                  ))}
                </div>
              )}
              <BriefField
                value={brief}
                onChange={setBrief}
                label={wishes?.label ?? "Wishes"}
                placeholder={
                  wishes?.description ||
                  "Optional changes to the preset's result. Leave empty to keep its defaults."
                }
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="edit" className="space-y-4 pt-3">
          <div className="grid gap-4 md:grid-cols-2">
            <MediaSlot
              label="Footage"
              hint="The clips Katana edits (up to 3)."
              accept={["video"]}
              max={3}
              required
              value={footage}
              onChange={setFootage}
            />
            <MediaSlot
              label="Images"
              hint={
                sheetFiles.length
                  ? "The characters' sheets go first, as who to keep; add stills to use in the edit."
                  : "Stills to use in the edit."
              }
              accept={["image"]}
              max={KATANA_IMAGES_MAX}
              fixed={sheetFiles}
              value={otherImages}
              onChange={setImages}
            />
          </div>
          <MediaSlot
            label="Soundtrack"
            accept={["audio"]}
            max={1}
            value={soundtrack}
            onChange={setSoundtrack}
          />
          <BriefField
            value={brief}
            onChange={setBrief}
            label="How to edit it"
            required
            placeholder='For example: "make a sigma edit out of it", or "a 15 s teaser with bold captions on the beat".'
          />
          <div className="flex flex-wrap gap-1.5" data-testid="katana-edit-ideas">
            {EDIT_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() =>
                  setBrief((current) => (current.trim() ? `${current.trim()}\n${idea}` : idea))
                }
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {idea}
              </button>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="katana-credit-limit" className="text-xs">
            Credit limit
          </Label>
          <Input
            id="katana-credit-limit"
            type="number"
            min={1}
            max={defaults.maxCreditLimit}
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Higgsfield credits for the whole run. The studio prices each paid step and stops at
            this.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="katana-claude-budget" className="text-xs">
            Claude budget (USD)
          </Label>
          <Input
            id="katana-claude-budget"
            type="number"
            min={1}
            max={1000}
            step={1}
            value={claudeBudget}
            onChange={(event) => setClaudeBudget(event.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            The Claude session running Katana pauses at this.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="katana-title" className="text-xs">
            Title <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="katana-title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {missing ??
            (!limitsOk
              ? `Set a credit limit up to ${defaults.maxCreditLimit} and a Claude budget between $1 and $1000.`
              : "Your files go to the team's Higgsfield account, and Katana starts right away.")}
        </p>
        <Button
          disabled={disabled || starting || !!missing || !limitsOk}
          onClick={() => void start()}
        >
          {starting ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 size-4" />
          )}
          {starting ? "Starting…" : "Start Katana"}
        </Button>
      </div>
    </div>
  );
}

function BriefField({
  value,
  onChange,
  placeholder,
  label = "Brief",
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="katana-brief" className="text-xs">
        {label}
        {!required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </Label>
      <Textarea
        id="katana-brief"
        value={value}
        maxLength={4000}
        rows={3}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
