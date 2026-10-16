import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import { getKatanaPreset, startKatana } from "@/lib/katana.functions";
import { KATANA_MODE_LABELS } from "@/lib/katana/model";
import { KATANA_FIELDS } from "@/lib/katana/messages";
import { MediaSlot } from "./MediaSlot";
import { PresetPicker, type PickedPreset } from "./PresetPicker";

type Mode = "remix" | "preset" | "edit";

interface Defaults {
  defaultCreditLimit: number;
  maxCreditLimit: number;
  defaultClaudeBudgetUsd: number;
}

const NO_PROJECT = "none";

/** Starts a Katana run: what to make, from which media, within which limits. */
export function NewKatanaRun({ defaults, disabled }: { defaults: Defaults; disabled: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
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
  const [creditLimit, setCreditLimit] = useState(String(defaults.defaultCreditLimit));
  const [claudeBudget, setClaudeBudget] = useState(String(defaults.defaultClaudeBudgetUsd));
  const [starting, setStarting] = useState(false);
  const lock = useRef(false);

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

  const credits = Number(creditLimit);
  const budget = Number(claudeBudget);
  const limitsOk =
    Number.isFinite(credits) &&
    credits > 0 &&
    credits <= defaults.maxCreditLimit &&
    Number.isFinite(budget) &&
    budget >= 1 &&
    budget <= 1000;

  const missing = (() => {
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
      const chosen = presetMedia[field.field]?.length ?? 0;
      if (chosen < field.min) return `${field.label}: add at least ${field.min}`;
    }
    return null;
  })();

  function inputsForRun(): Array<{ assetId: string; field: string }> {
    const take = (assets: AssetRow[], field: string) =>
      assets.map((asset) => ({ assetId: asset.id, field }));
    if (mode === "remix") {
      return [
        ...take(reference, KATANA_FIELDS.referenceVideo),
        ...take(images, KATANA_FIELDS.images),
        ...take(soundtrack, KATANA_FIELDS.audio),
      ];
    }
    if (mode === "edit") {
      return [
        ...take(footage, KATANA_FIELDS.videos),
        ...take(images, KATANA_FIELDS.images),
        ...take(soundtrack, KATANA_FIELDS.audio),
      ];
    }
    return presetFields.flatMap((field) => take(presetMedia[field.field] ?? [], field.field));
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
          creditLimit: credits,
          claudeBudgetUsd: budget,
          projectId: projectId === NO_PROJECT ? null : projectId,
        },
      });
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
      <div>
        <h2 className="font-display text-base font-semibold">New Katana run</h2>
        <p className="text-xs text-muted-foreground">
          Katana studies a reference edit frame by frame and remakes it for your subject, runs one
          of Higgsfield's presets, or edits your own footage. It runs on its own until the video is
          delivered.
        </p>
      </div>

      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList>
          {(Object.keys(KATANA_MODE_LABELS) as Mode[]).map((value) => (
            <TabsTrigger key={value} value={value}>
              {KATANA_MODE_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>

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
              hint="Photos of the person, character or product the new video is about (up to 10)."
              accept={["image"]}
              max={10}
              value={images}
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
                      value={presetMedia[field.field] ?? []}
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
              hint="Stills to use in the edit."
              accept={["image"]}
              max={10}
              value={images}
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
