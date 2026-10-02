import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, UserRound, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvatarJobs, useAvatarStatus, useCharacters, useVoices } from "@/features/avatar-studio/hooks/useAvatarData";
import { NotConfigured, StatusChip } from "@/features/avatar-studio/components/shared";

export const Route = createFileRoute("/avatar/")({
  head: () => ({
    meta: [
      { title: "Avatar Overview · Xeno Studio" },
      { name: "description", content: "Avatar Studio overview: characters, voices and recent jobs." },
      { property: "og:title", content: "Avatar Overview · Xeno Studio" },
      { property: "og:description", content: "Your avatars, voices and recent renders at a glance." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const status = useAvatarStatus();
  const chars = useCharacters();
  const voices = useVoices();
  const jobs = useAvatarJobs(10);
  const owned = (chars.data ?? []).filter((c) => c.ownership_type === "owned");
  const ownedVoices = (voices.data ?? []).filter((v) => v.is_owned);

  return (
    <div className="space-y-6 p-4">
      {status.data && !status.data.heygen.configured && <NotConfigured what="HeyGen" />}
      {status.data?.heygen.state === "degraded" && (
        <div className="rounded-lg border border-warning/40 px-4 py-3 text-sm">HeyGen is not responding normally: {status.data.heygen.message}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { to: "/avatar/characters" as const, icon: UserRound, label: "Your avatars", value: owned.length, sub: `${(chars.data?.length ?? 0) - owned.length} stock` },
          { to: "/avatar/voices" as const, icon: Mic, label: "Your voices", value: ownedVoices.length, sub: `${(voices.data?.length ?? 0) - ownedVoices.length} catalogue` },
          { to: "/avatar/generate" as const, icon: Video, label: "HeyGen balance", value: status.data?.heygen.account?.balanceLabel ?? "—", sub: status.data?.heygen.account?.plan ?? status.data?.heygen.account?.billing ?? "" },
        ].map((c) => (
          <Link key={c.label} to={c.to} className="panel flex items-center gap-3 p-4 transition-colors hover:border-primary/40">
            <c.icon className="size-5 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="font-display text-xl font-semibold">{chars.isLoading ? <Skeleton className="h-6 w-10" /> : c.value}</div>
              <div className="text-xs text-muted-foreground">{c.sub}</div>
            </div>
          </Link>
        ))}
      </div>
      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">Recent jobs</h2>
          <Link to="/avatar/jobs" className="text-xs text-muted-foreground hover:text-foreground">All jobs</Link>
        </div>
        {jobs.isLoading && <Skeleton className="h-20" />}
        {!jobs.isLoading && !jobs.data?.length && <p className="text-sm text-muted-foreground">Nothing yet. Create an avatar or pick a stock one to render your first video.</p>}
        <ul className="divide-y divide-border">
          {(jobs.data ?? []).map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="truncate">{j.job_type.replace(/_/g, " ")}</span>
              <span className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">{new Date(j.created_at).toLocaleString()}</span>
                <StatusChip status={j.status} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
