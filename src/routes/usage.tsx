import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { useModels, useTeam } from "@/hooks/useStudioData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/usage")({
  head: () => ({
    meta: [
      { title: "Usage · Xeno Studio" },
      { name: "description", content: "Internal spend and generation volume analytics for the creative studio." },
      { property: "og:title", content: "Usage · Xeno Studio" },
      { property: "og:description", content: "Estimated provider spend, volume by model and team member activity." },
    ],
  }),
  component: UsagePage,
});

interface LedgerRow {
  created_at: string;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  user_id: string;
  model_registry_id: string;
  generation_id: string;
}

function UsagePage() {
  const [days, setDays] = useState(30);
  const [modelFilter, setModelFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const { data: models = [] } = useModels(true);
  const { data: team = [] } = useTeam();

  const since = useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString(), [days]);

  const { data, isLoading } = useQuery({
    queryKey: ["usage", days],
    queryFn: async () => {
      const [ledger, generations] = await Promise.all([
        supabase
          .from("usage_ledger")
          .select("created_at,estimated_cost_usd,actual_cost_usd,user_id,model_registry_id,generation_id")
          .gte("created_at", since)
          .order("created_at"),
        supabase.from("generations").select("id,status,created_at,model_registry_id,user_id").gte("created_at", since),
      ]);
      return {
        ledger: (ledger.data ?? []) as LedgerRow[],
        generations: generations.data ?? [],
      };
    },
  });

  const ledger = (data?.ledger ?? []).filter(
    (row) =>
      (modelFilter === "all" || row.model_registry_id === modelFilter) &&
      (memberFilter === "all" || row.user_id === memberFilter),
  );
  const generations = (data?.generations ?? []).filter(
    (row) =>
      (modelFilter === "all" || row.model_registry_id === modelFilter) &&
      (memberFilter === "all" || row.user_id === memberFilter),
  );

  const spendSince = (windowDays: number) => {
    const cutoff = Date.now() - windowDays * 86_400_000;
    return ledger
      .filter((row) => new Date(row.created_at).getTime() >= cutoff)
      .reduce((total, row) => total + Number(row.estimated_cost_usd ?? 0), 0);
  };

  // Confirmed charges only: rows where the provider actually reported a cost.
  const confirmedActual = ledger.reduce((total, row) => total + Number(row.actual_cost_usd ?? 0), 0);
  const confirmedRows = ledger.filter((row) => row.actual_cost_usd != null).length;

  const byDay = useMemo(() => {
    const map = new Map<string, { date: string; spend: number; generations: number }>();
    for (const row of ledger) {
      const date = row.created_at.slice(0, 10);
      const entry = map.get(date) ?? { date, spend: 0, generations: 0 };
      entry.spend += Number(row.estimated_cost_usd ?? 0);
      map.set(date, entry);
    }
    for (const row of generations) {
      const date = row.created_at.slice(0, 10);
      const entry = map.get(date) ?? { date, spend: 0, generations: 0 };
      entry.generations += 1;
      map.set(date, entry);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [ledger, generations]);

  const byModel = useMemo(() => {
    const map = new Map<string, { model: string; spend: number; count: number }>();
    for (const row of ledger) {
      const model = models.find((entry) => entry.id === row.model_registry_id);
      const name = model?.display_name ?? "Unknown";
      const entry = map.get(name) ?? { model: name, spend: 0, count: 0 };
      entry.spend += Number(row.estimated_cost_usd ?? 0);
      entry.count += 1;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.spend - a.spend);
  }, [ledger, models]);

  const byMember = useMemo(() => {
    const map = new Map<string, { member: string; spend: number; count: number }>();
    for (const row of ledger) {
      const person = team.find((member) => member.id === row.user_id);
      const name = person?.full_name ?? person?.email ?? "Unknown";
      const entry = map.get(name) ?? { member: name, spend: 0, count: 0 };
      entry.spend += Number(row.estimated_cost_usd ?? 0);
      entry.count += 1;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.spend - a.spend);
  }, [ledger, team]);

  const counts = {
    completed: generations.filter((row) => row.status === "completed").length,
    failed: generations.filter((row) => ["failed", "nsfw"].includes(row.status)).length,
    active: generations.filter((row) => ["queued", "in_progress", "submitting", "local_queued"].includes(row.status))
      .length,
  };

  const imageCount = generations.filter(
    (row) => models.find((model) => model.id === row.model_registry_id)?.output_type === "image",
  ).length;

  return (
    <AppShell title="Usage">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Team member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {team.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.full_name ?? member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          All spend figures are provider cost estimates captured at submission time. Actual provider charges are only
          shown when Higgsfield reports them.
        </p>

        {isLoading ? (
          <Skeleton className="h-28 rounded-lg" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Stat label="Est. spend today" value={`$${spendSince(1).toFixed(2)}`} />
            <Stat label="Est. spend 7 days" value={`$${spendSince(7).toFixed(2)}`} />
            <Stat label="Est. spend 30 days" value={`$${spendSince(30).toFixed(2)}`} />
            <Stat label="Successful" value={String(counts.completed)} />
            <Stat label="Failed / blocked" value={String(counts.failed)} />
            <Stat label="Active now" value={String(counts.active)} />
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Estimated spend over time">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                <XAxis dataKey="date" stroke="currentColor" fontSize={11} />
                <YAxis stroke="currentColor" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
                <Line type="monotone" dataKey="spend" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Generations over time">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 8%)" />
                <XAxis dataKey="date" stroke="currentColor" fontSize={11} />
                <YAxis stroke="currentColor" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
                <Bar dataKey="generations" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Spend by model">
            <Table rows={byModel.map((row) => [row.model, `$${row.spend.toFixed(2)}`, String(row.count)])} head={["Model", "Est. spend", "Runs"]} />
          </Panel>
          <Panel title="Usage by team member">
            <Table rows={byMember.map((row) => [row.member, `$${row.spend.toFixed(2)}`, String(row.count)])} head={["Member", "Est. spend", "Runs"]} />
          </Panel>
          <Panel title="Image vs video volume">
            <Table
              rows={[
                ["Image", String(imageCount)],
                ["Video", String(generations.length - imageCount)],
              ]}
              head={["Media type", "Generations"]}
            />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <span className="label-eyebrow block">{label}</span>
      <span className="mt-1 block font-display text-2xl font-semibold">{value}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="label-eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data in this period.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          {head.map((cell) => (
            <th key={cell} className="pb-2 font-medium">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.join("-")}>
            {row.map((cell, index) => (
              <td key={index} className="py-2">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
