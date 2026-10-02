import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useFeatureFlags } from "@/hooks/useV2Data";
import { useAvatarRealtime } from "@/features/avatar-studio/hooks/useAvatarData";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/avatar")({
  head: () => ({
    meta: [
      { title: "Avatar Studio · Xeno Studio" },
      { name: "description", content: "Identity-first avatar video, voice and realtime studio." },
      { property: "og:title", content: "Avatar Studio · Xeno Studio" },
      { property: "og:description", content: "Digital twins, voices, avatar video and localization for the internal team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AvatarLayout,
});

function Inner() {
  useAvatarRealtime();
  return <Outlet />;
}

function AvatarLayout() {
  const { data: flags, isLoading } = useFeatureFlags();
  const enabled = flags?.find((f) => f.key === "avatar_studio_enabled")?.enabled ?? false;
  return (
    <AppShell title="Avatar Studio">
      {isLoading ? (
        <Skeleton className="m-4 h-32" />
      ) : enabled ? (
        <Inner />
      ) : (
        <div className="p-8 text-sm text-muted-foreground">Avatar Studio is switched off. An admin can enable it in Settings.</div>
      )}
    </AppShell>
  );
}
