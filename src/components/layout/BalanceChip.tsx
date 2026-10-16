import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { USAGE_BALANCE_KEY, useUsageBalance, type UsageBalance } from "@/hooks/useUsageBalance";
import { recordHiggsfieldBalance, refreshKatanaBalance } from "@/lib/usage-balance.functions";
import {
  balanceChipLabel,
  formatUsd,
  type BalanceState,
  type HiggsfieldBalanceView,
} from "@/lib/usage-balance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const TONES: Record<BalanceState, string> = {
  ok: "border-border text-foreground",
  low: "border-warning/60 text-warning",
  out: "border-destructive/60 bg-destructive/10 text-destructive",
  unknown: "border-border text-muted-foreground",
};

const ago = (at: string) => formatDistanceToNow(new Date(at), { addSuffix: true });
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The Higgsfield API balance on the top bar: estimated from the figure an
 * admin recorded from the Higgsfield Console, less what the studio has spent
 * since, and red the moment Higgsfield refuses a request for want of credits.
 * Opens to the details, Katana's credits, and (for admins) a new figure.
 */
export function BalanceChip() {
  const { data, isError } = useUsageBalance();
  if (isError || !data) return null;
  const view = data.higgsfield;
  const label = balanceChipLabel(view);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs tabular-nums transition-colors hover:bg-surface-raised",
            TONES[view.state],
          )}
          aria-label={`Higgsfield API balance: ${label}`}
          title={
            view.estimatedUsd !== null
              ? "Higgsfield API balance, estimated from the Console's last figure"
              : "Higgsfield API spend and balance"
          }
          data-testid="balance-chip"
        >
          {view.state === "out" ? (
            <AlertTriangle className="size-3" />
          ) : (
            <Wallet className="size-3" />
          )}
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <BalanceDetails balance={data} />
      </PopoverContent>
    </Popover>
  );
}

/** Everything behind the chip: on its popover and on the Usage page. */
export function BalanceDetails({ balance }: { balance: UsageBalance }) {
  return (
    <div className="divide-y divide-border text-xs" data-testid="balance-details">
      <HiggsfieldSection view={balance.higgsfield} consoleUrl={balance.consoleUrl} />
      <KatanaSection katana={balance.katana} />
    </div>
  );
}

function HiggsfieldSection({
  view,
  consoleUrl,
}: {
  view: HiggsfieldBalanceView;
  consoleUrl: string;
}) {
  const { isAdmin } = useAuth();
  const { recorded, spend, today, refusal } = view;
  return (
    <section className="space-y-2.5 p-3">
      <div>
        <h3 className="label-eyebrow">Higgsfield API</h3>
        <p className="text-[11px] text-muted-foreground">Generations and Soul ID trainings</p>
      </div>

      {refusal && (
        <div
          className={cn(
            "flex gap-2 rounded-md border p-2",
            view.state === "out"
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-warning/50 bg-warning/10 text-warning",
          )}
          data-testid="balance-refusal"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Higgsfield refused{" "}
            {refusal.kind === "soul_id_training" ? "a Soul ID training" : "a generation"} for want
            of credits {ago(refusal.at)}
            {view.state === "out"
              ? ", and nothing has gone through since. Top up in the Higgsfield Console."
              : ". Smaller requests have gone through since, so the balance is low."}
          </p>
        </div>
      )}

      {recorded && view.state === "out" ? (
        <p className="text-muted-foreground">
          The estimate said ≈ {formatUsd(Math.max(0, view.estimatedUsd ?? 0))} was left of the{" "}
          {formatUsd(recorded.usd)} recorded {ago(recorded.at)}: Higgsfield's refusal says
          otherwise.
          {isAdmin ? " Record the Console's figure once the account is topped up." : ""}
        </p>
      ) : recorded ? (
        <div>
          <p className="font-display text-2xl font-semibold tabular-nums">
            ≈ {formatUsd(Math.max(0, view.estimatedUsd ?? 0))}
          </p>
          <p className="text-muted-foreground">
            estimated left: {formatUsd(recorded.usd)}
            {recorded.credits !== null
              ? ` (${recorded.credits.toLocaleString("en-US")} credits)`
              : ""}{" "}
            recorded from the Console {ago(recorded.at)}
            {recorded.byName ? ` by ${recorded.byName}` : ""}, less what the studio has spent since.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">
          Higgsfield doesn't report its API balance outside its Console.{" "}
          {isAdmin
            ? "Record the figure it shows below and the studio counts it down as it spends."
            : "Once an admin records the figure it shows, the studio counts it down as it spends."}
        </p>
      )}

      {spend && (
        <ul className="space-y-0.5 text-muted-foreground" data-testid="balance-spend">
          <li>
            Spent since: {formatUsd(spend.spentUsd)} on {plural(spend.completed, "generation")}
          </li>
          {spend.inFlight > 0 && (
            <li>
              Held for {plural(spend.inFlight, "generation")} running:{" "}
              {formatUsd(spend.inFlightUsd)}
            </li>
          )}
          {spend.uncertain > 0 && (
            <li>
              {plural(spend.uncertain, "submission")} with an unknown outcome
              {spend.uncertainUsd > 0 ? ` (up to ${formatUsd(spend.uncertainUsd)})` : ""}: may also
              have been charged
            </li>
          )}
          {spend.trainings > 0 && (
            <li>
              {plural(spend.trainings, "Soul ID training")} sent: Higgsfield doesn't quote their
              price, so they aren't counted
            </li>
          )}
          {spend.unpriced > 0 && <li>{plural(spend.unpriced, "generation")} without a price</li>}
        </ul>
      )}

      {today && (
        <p className="text-muted-foreground">
          Today: {formatUsd(today.spentUsd + today.inFlightUsd)} on{" "}
          {plural(today.completed + today.inFlight, "generation")}
        </p>
      )}

      {isAdmin && <RecordBalanceForm />}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Higgsfield Console <ExternalLink className="size-3" />
        </a>
        <Link to="/usage" className="text-muted-foreground hover:text-foreground hover:underline">
          Usage details
        </Link>
      </div>
    </section>
  );
}

/** An admin enters the balance the Higgsfield Console shows, in dollars or credits. */
function RecordBalanceForm() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"usd" | "credits">("usd");
  const record = useMutation({
    mutationFn: (value: number) => recordHiggsfieldBalance({ data: { amount: value, unit } }),
    onSuccess: async (result) => {
      setAmount("");
      toast.success(`Recorded ${formatUsd(result.usd)} from the Higgsfield Console`);
      await queryClient.invalidateQueries({ queryKey: USAGE_BALANCE_KEY });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The balance couldn't be saved"),
  });
  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0;
  return (
    <form
      className="space-y-1.5 rounded-md border border-border p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) record.mutate(value);
      }}
    >
      <label className="block font-medium" htmlFor="console-balance">
        Record the balance the Console shows
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id="console-balance"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder={unit === "usd" ? "150.00" : "2400"}
          className="h-8 tabular-nums"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <div
          className="flex shrink-0 rounded-md border border-border p-0.5"
          role="radiogroup"
          aria-label="Unit"
        >
          {(["usd", "credits"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={unit === option}
              onClick={() => setUnit(option)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px]",
                unit === option ? "bg-primary/15 text-foreground" : "text-muted-foreground",
              )}
            >
              {option === "usd" ? "USD" : "Credits"}
            </button>
          ))}
        </div>
        <Button type="submit" size="sm" className="h-8" disabled={!valid || record.isPending}>
          {record.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
    </form>
  );
}

function KatanaSection({ katana }: { katana: UsageBalance["katana"] }) {
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => refreshKatanaBalance(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USAGE_BALANCE_KEY }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Higgsfield didn't answer"),
  });
  return (
    <section className="space-y-1.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="label-eyebrow">Katana</h3>
          <p className="text-[11px] text-muted-foreground">
            {katana.connected
              ? `The connected Higgsfield account's credits${katana.account ? ` (${katana.account})` : ""}`
              : "No Higgsfield account connected"}
          </p>
        </div>
        {katana.connected && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Check Katana's credits now"
            title="Check now"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className={cn("size-3.5", refresh.isPending && "animate-spin")} />
          </Button>
        )}
      </div>
      {katana.connected &&
        (katana.balance ? (
          <p>
            <span className="font-medium tabular-nums">
              {katana.balance.credits.toLocaleString("en-US")} credits
            </span>
            <span className="text-muted-foreground">
              {katana.balance.plan ? ` · ${katana.balance.plan} plan` : ""} ·{" "}
              {ago(katana.balance.at)}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">Not checked yet.</p>
        ))}
    </section>
  );
}
