import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Clapperboard, Film, Loader2, Mic, Music, Type } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { createSequence } from "@/hooks/useEditorData";
import type { AssetRow, GenerationRow } from "@/hooks/useStudioData";
import { bestOutput, compileFromDrafts, type CompileRun } from "@/lib/edit/compile";
import { katanaFromPlan } from "@/lib/supercomputer/katana";
import type { SupercomputerDraft, SupercomputerEditPlan } from "@/lib/supercomputer/types";
import { SendBundleToKatana } from "@/components/katana/SendToKatana";
import { Button } from "@/components/ui/button";

interface CompileVideoProps {
  messageId: string;
  drafts: SupercomputerDraft[];
  byDraft: Map<number, { generation: GenerationRow; assets: AssetRow[] }[]>;
  plan: SupercomputerEditPlan | undefined;
  context: {
    projectId: string | null;
    campaignId: string | null;
    briefId?: string | null | undefined;
    threadId?: string | null | undefined;
  };
}

function runsFor(byDraft: CompileVideoProps["byDraft"]): Map<number, CompileRun[]> {
  const result = new Map<number, CompileRun[]>();
  for (const [index, runs] of byDraft) {
    result.set(
      index,
      runs.map((run) => ({
        generation: { status: run.generation.status, created_at: run.generation.created_at },
        assets: run.assets.map((asset) => ({
          id: asset.id,
          asset_type: asset.asset_type,
          title: asset.title,
          duration_seconds: asset.duration_seconds,
          created_at: asset.created_at,
        })),
      })),
    );
  }
  return result;
}

/**
 * Turns this conversation's generated shots into an edit (following the
 * agent's edit plan when there is one) and opens it in the Editor.
 */
export function CompileVideo({ messageId, drafts, byDraft, plan, context }: CompileVideoProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const runs = runsFor(byDraft);
  // A long video opens in the Editor from its own card, as the clips it was made of.
  const visualDrafts = drafts
    .map((draft, index) => ({ draft, index }))
    .filter(({ draft }) => draft.outputType !== "audio" && !draft.longVideo);
  const order = plan?.shots.length
    ? plan.shots.map((shot) => shot.draftIndex).filter((index) => !drafts[index]?.longVideo)
    : visualDrafts.map((entry) => entry.index);
  const ready = order.filter((index) => bestOutput(runs.get(index))).length;
  if (visualDrafts.length < 1) return null;

  async function compile() {
    if (!user) return;
    setBusy(true);
    try {
      const result = compileFromDrafts(drafts, runs, {
        plan: plan ?? null,
        fallbackTitle: plan?.title ?? drafts[0]?.purpose ?? "Reel",
      });
      if (!result.timeline.clips.length) {
        toast.error("Generate at least one shot first.");
        return;
      }
      const id = await createSequence({
        userId: user.id,
        title: result.title,
        timeline: result.timeline,
        projectId: context.projectId,
        campaignId: context.campaignId,
        briefId: context.briefId ?? null,
        source: {
          kind: "supercomputer",
          message_id: messageId,
          ...(context.threadId ? { thread_id: context.threadId } : {}),
          ...(plan?.voiceoverScript ? { voiceover_script: plan.voiceoverScript } : {}),
          ...(plan?.musicDirection ? { music_direction: plan.musicDirection } : {}),
        },
      });
      if (result.missing.length) {
        toast.message(
          `Compiled ${result.timeline.clips.length} shot${result.timeline.clips.length === 1 ? "" : "s"}`,
          {
            description: `Not generated yet: ${result.missing.join(", ")}. Add them in the Editor once they're ready.`,
          },
        );
      }
      navigate({ to: "/editor/$sequenceId", params: { sequenceId: id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The edit could not be created");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={plan ? "default" : "outline"}
      disabled={busy || ready === 0}
      onClick={() => void compile()}
      title={ready === 0 ? "Generate at least one shot first" : undefined}
      data-testid="compile-video"
    >
      {busy ? (
        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
      ) : (
        <Film className="mr-1.5 size-3.5" />
      )}
      Compile into a video{order.length > 1 ? ` (${ready}/${order.length} ready)` : ""}
    </Button>
  );
}

/**
 * Hands the agent's edit plan to Katana to cut: its clips as the footage (up
 * to three), its stills, the plan as the brief and the drafts' characters.
 */
export function SendPlanToKatana({
  drafts,
  byDraft,
  plan,
  context,
}: Pick<CompileVideoProps, "drafts" | "byDraft" | "context"> & { plan: SupercomputerEditPlan }) {
  const { send, reason } = katanaFromPlan(drafts, runsFor(byDraft), plan, context);
  return (
    <SendBundleToKatana
      send={send}
      disabledReason={reason}
      label="Cut it with Katana"
      className="h-8"
    />
  );
}

/** The agent's proposed cut, shown above the drafts it orders. */
export function EditPlanCard({
  plan,
  drafts,
  children,
}: {
  plan: SupercomputerEditPlan;
  drafts: SupercomputerDraft[];
  children?: ReactNode;
}) {
  const total = plan.shots.reduce((sum, shot) => sum + (shot.seconds ?? 0), 0);
  return (
    <div
      className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      data-testid="edit-plan"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-eyebrow flex items-center gap-1.5">
          <Clapperboard className="size-3.5" /> Edit plan{plan.title ? ` · ${plan.title}` : ""}
          {total > 0 ? ` · about ${Math.round(total)}s` : ""}
          {plan.aspectRatio ? ` · ${plan.aspectRatio}` : ""}
        </span>
        {children}
      </div>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {plan.shots.map((shot, position) => (
          <li key={shot.draftIndex} className="flex items-center gap-1.5">
            {position > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {shot.transition && !/^cut$/i.test(shot.transition) ? `${shot.transition} →` : "→"}
              </span>
            )}
            <span
              className="rounded-md border border-border bg-background px-2 py-1"
              title={shot.note}
            >
              {position + 1}. {drafts[shot.draftIndex]?.title ?? `Draft ${shot.draftIndex + 1}`}
              {shot.seconds ? (
                <span className="ml-1 text-muted-foreground">{shot.seconds}s</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {plan.voiceoverScript && (
        <p className="flex gap-1.5 text-xs leading-relaxed">
          <Mic className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">Voiceover: </span>“{plan.voiceoverScript}”
          </span>
        </p>
      )}
      {plan.musicDirection && (
        <p className="flex gap-1.5 text-xs">
          <Music className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">Music: </span>
            {plan.musicDirection}
          </span>
        </p>
      )}
      {(plan.openingTitle || plan.closingCta) && (
        <p className="flex gap-1.5 text-xs">
          <Type className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>
            {plan.openingTitle && (
              <>
                <span className="text-muted-foreground">Opening title: </span>“{plan.openingTitle}”
              </>
            )}
            {plan.openingTitle && plan.closingCta && " · "}
            {plan.closingCta && (
              <>
                <span className="text-muted-foreground">End card: </span>“{plan.closingCta}”
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
