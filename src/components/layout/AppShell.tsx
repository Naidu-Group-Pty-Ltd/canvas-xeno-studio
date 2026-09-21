import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Boxes,
  ChevronLeft,
  CircleDot,
  Clapperboard,
  Images,
  LayoutGrid,
  LogOut,
  Megaphone,
  Network,
  PanelLeft,
  Scissors,
  Settings,
  Sparkles,
  Swords,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { APP_NAME } from "@/lib/app-config";
import { useAuth } from "@/hooks/useAuth";
import { useGenerations, useStudioRealtime } from "@/hooks/useStudioData";
import { useFeatureFlags } from "@/hooks/useV2Data";
import { getProviderHealth } from "@/lib/generation.functions";
import { ACTIVE_STATUSES } from "@/lib/model-schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/director", label: "Director", icon: Wand2, flag: "v2_director" },
  { to: "/", label: "Create", icon: Sparkles, flag: null },
  { to: "/storyboards", label: "Storyboards", icon: Clapperboard, flag: "v2_storyboards" },
  { to: "/edit-lab", label: "Edit Lab", icon: Scissors, flag: "v2_edit_lab" },
  { to: "/canvas", label: "Canvas", icon: Network, flag: "v2_canvas" },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, flag: "v2_campaigns" },
  { to: "/projects", label: "Projects", icon: LayoutGrid, flag: null },
  { to: "/assets", label: "Library", icon: Images, flag: null },
  { to: "/model-lab", label: "Model Lab", icon: Swords, flag: "v2_model_arena" },
  { to: "/models", label: "Models", icon: Boxes, flag: null },
  { to: "/activity", label: "Activity", icon: Activity, flag: null },
  { to: "/usage", label: "Usage", icon: TrendingUp, flag: null },
  { to: "/settings", label: "Settings", icon: Settings, flag: null },
] as const;

/** V2 sections only appear when their feature flag is enabled. */
function useNavItems() {
  const { data: flags } = useFeatureFlags();
  return NAV.filter((item) => !item.flag || (flags?.find((f) => f.key === item.flag)?.enabled ?? false));
}


export function useProviderHealth() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["provider-health"],
    enabled: !!profile?.is_active,
    queryFn: () => getProviderHealth(),
    refetchInterval: 60_000,
  });
}

function HealthPill() {
  const { data } = useProviderHealth();
  const state = data?.state ?? "loading";
  const tone =
    state === "connected"
      ? "text-success"
      : state === "degraded"
        ? "text-warning"
        : state === "loading"
          ? "text-muted-foreground"
          : "text-primary";
  const label =
    state === "connected"
      ? "Higgsfield connected"
      : state === "degraded"
        ? "Higgsfield degraded"
        : state === "disabled"
          ? "Higgsfield disabled"
          : state === "loading"
            ? "Checking provider"
            : "Higgsfield not configured";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs", tone)}>
          <CircleDot className="size-3" />
          <span className="hidden sm:inline">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {data?.lastSuccessAt
          ? `Last successful provider call ${new Date(data.lastSuccessAt).toLocaleString()}`
          : "No successful provider call recorded yet"}
      </TooltipContent>
    </Tooltip>
  );
}

function ActiveCounter() {
  const { data } = useGenerations({ limit: 100, status: [...ACTIVE_STATUSES] });
  const count = data?.length ?? 0;
  return (
    <Link
      to="/activity"
      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className={cn("size-1.5 rounded-full", count ? "animate-pulse bg-primary" : "bg-muted-foreground")} />
      {count} active
    </Link>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useStudioRealtime();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  if (!profile || !profile.is_active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Access not enabled</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account exists but is not an active team member. Ask a studio admin to activate it.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const initials = (profile.full_name ?? profile.email).slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          {!collapsed && <span className="font-display text-sm font-semibold tracking-tight">{APP_NAME}</span>}
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-0",
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-muted-foreground"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <MobileNav pathname={pathname} />
          </div>
          <h1 className="truncate font-display text-sm font-semibold">{title ?? APP_NAME}</h1>
          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <ActiveCounter />
            <HealthPill />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-surface-raised text-xs font-medium"
                  aria-label="Account menu"
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {profile.full_name ?? profile.email}
                  <span className="block text-xs font-normal text-muted-foreground">{profile.role}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut().then(() => navigate({ to: "/auth" }))}>
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <PanelLeft className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {NAV.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <Link to={item.to} className={cn(pathname === item.to && "text-primary")}>
              <item.icon className="mr-2 size-4" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
