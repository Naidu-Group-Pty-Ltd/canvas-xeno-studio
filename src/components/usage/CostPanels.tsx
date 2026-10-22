import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useModels, useProjects, useTeam } from "@/hooks/useStudioData";
import { useCampaigns } from "@/hooks/useV2Data";
import { setModelListPrice } from "@/lib/costs.functions";
import { isMissingTableError } from "@/lib/edit/errors";
import { formatUsd } from "@/lib/usage-balance";
import {
  readScopeSpend,
  readUnpricedModels,
  spendBy,
  spendSummary,
  totalSpend,
  type SpendTotals,
} from "@/lib/usage-spend";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/** Said where spend by project is asked for before the database has it. */
export const SPEND_NEEDS_UPDATE =
  "Spend by project needs a database update (migration 0028_generation_costs). Ask an admin to apply it.";

/** Spend by project and campaign (all of it, or since `since`), as the database counts it. */
function useScopeSpend(filter: { since?: string | null; projectId?: string | null }) {
  return useQuery({
    queryKey: ["generation-spend", filter.since ?? null, filter.projectId ?? null],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("generation_spend_by_scope", {
        ...(filter.since ? { p_since: filter.since } : {}),
        ...(filter.projectId ? { p_project_id: filter.projectId } : {}),
      });
      if (error) throw error;
      return readScopeSpend(data);
    },
  });
}

/**
 * What generations cost by project and by campaign since `since`: confirmed
 * (Higgsfield reported the charge) and estimated (the run's estimate stands
 * as its cost), with what is held for work still running and how many runs
 * have no price at all.
 */
export function SpendByScope({ since }: { since: string }) {
  const { data: projects = [] } = useProjects(true);
  const { data: campaigns = [] } = useCampaigns(true);
  const { data: rows, error, isLoading } = useScopeSpend({ since });
  if (isLoading) return <Skeleton className="h-24 rounded-lg" />;
  if (error)
    return (
      <p className="text-sm text-muted-foreground">
        {isMissingTableError(error)
          ? SPEND_NEEDS_UPDATE
          : "Spend by project couldn't be read just now. Try again in a moment."}
      </p>
    );
  const byProject = spendBy(rows ?? [], "project").map((entry) => ({
    key: entry.id ?? "none",
    name: entry.id
      ? (projects.find((project) => project.id === entry.id)?.name ?? "A deleted project")
      : "No project",
    totals: entry.totals,
  }));
  const byCampaign = spendBy(rows ?? [], "campaign")
    .filter((entry) => entry.id !== null)
    .map((entry) => ({
      key: entry.id ?? "none",
      name: campaigns.find((campaign) => campaign.id === entry.id)?.name ?? "A deleted campaign",
      totals: entry.totals,
    }));
  return (
    <div className="space-y-4">
      <SpendTable head="Project" rows={byProject} />
      {byCampaign.length > 0 && <SpendTable head="Campaign" rows={byCampaign} />}
      <p className="text-xs text-muted-foreground">
        Confirmed is what Higgsfield reported charging. Estimated is what runs cost whose result
        carried no charge: their estimate stands as their cost (Higgsfield&apos;s quote, its metered
        rate, a price per image its pricing states, or the model&apos;s list price). Running is held
        for work Higgsfield is still making; refunded work isn&apos;t counted.
      </p>
    </div>
  );
}

function SpendTable({
  head,
  rows,
}: {
  head: string;
  rows: { key: string; name: string; totals: SpendTotals }[];
}) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">No spend in this period.</p>;
  return (
    <table className="w-full text-sm" data-testid={`spend-by-${head.toLowerCase()}`}>
      <thead>
        <tr className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          {[head, "Confirmed", "Estimated", "Running", "Runs", "Unpriced"].map((cell) => (
            <th key={cell} className="pb-2 font-medium">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="py-2">{row.name}</td>
            <td className="py-2 tabular-nums">{formatUsd(row.totals.confirmedUsd)}</td>
            <td className="py-2 tabular-nums">{formatUsd(row.totals.estimatedUsd)}</td>
            <td className="py-2 tabular-nums">{formatUsd(row.totals.inFlightUsd)}</td>
            <td className="py-2 tabular-nums">{row.totals.runs}</td>
            <td className={row.totals.unpriced ? "py-2 text-warning" : "py-2"}>
              {row.totals.unpriced}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A project's spend for its page: confirmed and estimated, all of it. Before
 * the database can count it, the estimate the page worked out is shown.
 */
export function ProjectSpend({
  projectId,
  budgetUsd,
  fallbackEstimatedUsd,
}: {
  projectId: string;
  budgetUsd: number | null;
  fallbackEstimatedUsd: number;
}) {
  const { data: rows, error, isLoading } = useScopeSpend({ projectId });
  const of = budgetUsd !== null ? ` of ${formatUsd(budgetUsd)}` : "";
  if (isLoading) return <Skeleton className="h-4 w-56" />;
  if (error || !rows)
    return (
      <p className="text-xs text-muted-foreground" data-testid="project-spend">
        Spent so far: {formatUsd(fallbackEstimatedUsd)} estimated{of}
        {error && isMissingTableError(error) ? ` · ${SPEND_NEEDS_UPDATE}` : ""}
      </p>
    );
  const totals = totalSpend(rows);
  return (
    <p className="text-xs text-muted-foreground" data-testid="project-spend">
      Spent so far: {formatUsd(totals.spentUsd)}
      {of} ({spendSummary(totals)})
    </p>
  );
}

const UNITS = { image: "per image", request: "per request", second: "per second" } as const;
type Unit = keyof typeof UNITS;

interface ListPriceRow {
  model_registry_id: string;
  unit: string;
  usd: number;
  note: string | null;
  set_by: string | null;
  set_at: string;
}

/**
 * For admins: the models whose runs have no price (Higgsfield's pricing for
 * them isn't one the studio follows, and no list price is set), and every list
 * price set, each with a list price to set: per image, request or second. A
 * new price can also price the runs already made without one, as estimates.
 */
export function UnpricedModels() {
  const { isAdmin } = useAuth();
  const { data: models = [] } = useModels(true);
  const { data: team = [] } = useTeam();
  const unpriced = useQuery({
    queryKey: ["unpriced-models"],
    enabled: isAdmin,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("unpriced_generation_models", {});
      if (error) throw error;
      return readUnpricedModels(data);
    },
  });
  const prices = useQuery({
    queryKey: ["model-list-prices"],
    enabled: isAdmin,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("model_list_prices").select("*");
      if (error) throw error;
      return (data ?? []) as ListPriceRow[];
    },
  });
  if (!isAdmin) return null;
  const missing = [unpriced.error, prices.error].some(
    (error) => error && isMissingTableError(error),
  );
  const ids = [
    ...new Set([
      ...(unpriced.data ?? []).map((entry) => entry.modelId),
      ...(prices.data ?? []).map((row) => row.model_registry_id),
    ]),
  ];
  return (
    <section className="panel p-4" data-testid="unpriced-models">
      <h2 className="label-eyebrow mb-3">Runs without a price</h2>
      {missing ? (
        <p className="text-sm text-muted-foreground">
          List prices need a database update (migration 0028_generation_costs). Ask an admin to
          apply it.
        </p>
      ) : unpriced.isLoading || prices.isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : !ids.length ? (
        <p className="text-sm text-muted-foreground">
          Every run has a price: a charge Higgsfield reported, or an estimate.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {ids.map((modelId) => (
            <ListPriceEditor
              key={modelId}
              modelId={modelId}
              name={models.find((model) => model.id === modelId)?.display_name ?? "A model"}
              unpricedRuns={unpriced.data?.find((entry) => entry.modelId === modelId)?.runs ?? 0}
              price={prices.data?.find((row) => row.model_registry_id === modelId) ?? null}
              setBy={(id) => {
                const person = team.find((member) => member.id === id);
                return person?.full_name ?? person?.email ?? null;
              }}
            />
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        A run is priced from Higgsfield&apos;s charge when it reports one, else from its estimate.
        Where Higgsfield&apos;s pricing isn&apos;t a figure the studio can follow (GPT Image&apos;s
        token rates, say), the list price set here is used instead, and marked as an estimate. A
        price is never guessed.
      </p>
    </section>
  );
}

function ListPriceEditor({
  modelId,
  name,
  unpricedRuns,
  price,
  setBy,
}: {
  modelId: string;
  name: string;
  unpricedRuns: number;
  price: ListPriceRow | null;
  setBy: (id: string | null) => string | null;
}) {
  const queryClient = useQueryClient();
  const [unit, setUnit] = useState<Unit>(
    price && price.unit in UNITS ? (price.unit as Unit) : "image",
  );
  const [usd, setUsd] = useState(price ? String(price.usd) : "");
  const [note, setNote] = useState(price?.note ?? "");
  const [earlier, setEarlier] = useState(unpricedRuns > 0);
  const [saving, setSaving] = useState(false);

  async function save(remove = false) {
    const amount = Number(usd);
    if (!remove && !(amount > 0 && amount <= 1000)) {
      toast.error("Give a price in dollars, more than $0 and at most $1,000.");
      return;
    }
    setSaving(true);
    try {
      const { priced } = await setModelListPrice({
        data: {
          modelId,
          price: remove ? null : { unit, usd: amount, note: note.trim() || null },
          priceEarlierRuns: !remove && earlier,
        },
      });
      toast.success(
        remove
          ? `${name} has no list price now.`
          : `${name}'s list price is saved${priced ? `, and ${priced} earlier run${priced === 1 ? " is" : "s are"} priced from it` : ""}.`,
      );
      await Promise.all(
        ["unpriced-models", "model-list-prices", "generation-spend", "usage"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The list price couldn't be saved");
    } finally {
      setSaving(false);
    }
  }

  const who = price ? setBy(price.set_by) : null;
  return (
    <li className="space-y-2 py-3 text-sm" data-testid="list-price">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">
          {unpricedRuns
            ? `${unpricedRuns} run${unpricedRuns === 1 ? "" : "s"} without a price`
            : "Every run priced"}
          {price
            ? ` · ${formatUsd(Number(price.usd))} ${UNITS[price.unit as Unit] ?? ""}, set${who ? ` by ${who}` : ""} ${new Date(price.set_at).toLocaleDateString()}`
            : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          className="h-8 w-28"
          placeholder="USD"
          value={usd}
          onChange={(event) => setUsd(event.target.value)}
          aria-label={`${name}'s list price in dollars`}
        />
        <select
          className="h-8 rounded-md border border-border bg-surface-raised px-2 text-sm"
          value={unit}
          onChange={(event) => setUnit(event.target.value as Unit)}
          aria-label="What the price is for"
        >
          {(Object.keys(UNITS) as Unit[]).map((key) => (
            <option key={key} value={key}>
              {UNITS[key]}
            </option>
          ))}
        </select>
        <Input
          className="h-8 min-w-40 flex-1"
          placeholder="Where the price comes from (optional)"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Save
        </Button>
        {price && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => void save(true)}>
            Remove
          </Button>
        )}
      </div>
      {unpricedRuns > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={earlier} onCheckedChange={(value) => setEarlier(value === true)} />
          Also price the {unpricedRuns} run{unpricedRuns === 1 ? "" : "s"} already made without one
          (kept as estimates, never as charges)
        </label>
      )}
    </li>
  );
}
