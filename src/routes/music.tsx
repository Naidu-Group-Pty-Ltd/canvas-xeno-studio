import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AddLicensedTrack } from "@/components/music/AddLicensedTrack";
import { FindMusic } from "@/components/music/FindMusic";
import { GenerateMusic } from "@/components/music/GenerateMusic";
import { MusicLibrary } from "@/components/music/MusicLibrary";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMusicStatus, useMusicTracks } from "@/hooks/useMusicData";
import { isMissingTableError } from "@/lib/edit/errors";
import { SONG_GUIDANCE } from "@/lib/music/catalog";

export const Route = createFileRoute("/music")({
  head: () => ({
    meta: [
      { title: "Music · Xeno Studio" },
      {
        name: "description",
        content:
          "Music you can use: free Creative Commons tracks, AI music and your licensed tracks.",
      },
      { property: "og:title", content: "Music · Xeno Studio" },
      {
        property: "og:description",
        content: "A music library where every track's licence is clear.",
      },
    ],
  }),
  component: MusicPage,
});

function MusicPage() {
  const { data: status } = useMusicStatus();
  const [showArchived, setShowArchived] = useState(false);
  const { error } = useMusicTracks({ includeArchived: showArchived });
  const missingTables = isMissingTableError(error);
  const [tab, setTab] = useState("library");

  return (
    <AppShell title="Music">
      <div className="space-y-5 p-4">
        <div className="max-w-3xl">
          <h2 className="font-display text-lg font-semibold">Music library</h2>
          <p className="text-sm text-muted-foreground">
            Every track here carries its licence, so the team knows it can be used and what credit
            it needs. Find free Creative Commons music, make original music for a brief, or add
            tracks the brand has licensed.
          </p>
        </div>

        {missingTables && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">The music library needs a database update.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Apply migration <code>0006_music_library</code> (drizzle/migrations), then reload.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Source
            label="Openverse"
            ready={status ? true : undefined}
            detail={
              status?.openverseAuthenticated
                ? "Free Creative Commons music and sound effects · registered app"
                : "Free Creative Commons music and sound effects · shared rate limits"
            }
          />
          <Source
            label="Eleven Music"
            ready={status?.elevenlabs}
            detail={
              status?.elevenlabs === false
                ? "Add ELEVENLABS_API_KEY to make AI music and instrumentals"
                : "Original music to a brief, and instrumentals"
            }
          />
          <Source
            label="Your licences"
            ready={status ? true : undefined}
            detail="Tracks the brand owns or licensed, with the terms recorded"
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="find">Find free music</TabsTrigger>
            <TabsTrigger value="generate">Make music</TabsTrigger>
            <TabsTrigger value="licensed">Add a licensed track</TabsTrigger>
            <TabsTrigger value="songs">Real songs</TabsTrigger>
          </TabsList>
          <div className="mt-4 max-w-4xl">
            <TabsContent value="library" className="space-y-3">
              <div className="flex items-center justify-end gap-2">
                <Label htmlFor="music-archived" className="text-xs text-muted-foreground">
                  Show archived
                </Label>
                <Switch
                  id="music-archived"
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                />
              </div>
              <MusicLibrary showArchived={showArchived} />
            </TabsContent>
            <TabsContent value="find">
              <FindMusic onAdded={() => setTab("library")} />
            </TabsContent>
            <TabsContent value="generate">
              <GenerateMusic onGenerated={() => setTab("library")} />
            </TabsContent>
            <TabsContent value="licensed">
              <AddLicensedTrack />
            </TabsContent>
            <TabsContent value="songs" className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" />
                <p>
                  Guidance only, not legal advice. When in doubt, check with whoever manages the
                  brand's music rights.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SONG_GUIDANCE.map((item) => (
                  <div key={item.title} className="panel p-3 text-sm">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Source({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean | undefined;
  detail: string;
}) {
  return (
    <div
      className="panel flex items-start gap-2 p-3 text-xs"
      data-testid="music-source"
      data-ready={ready === undefined ? "unknown" : String(ready)}
    >
      {ready === undefined ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : ready ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div>
        <p className="font-medium">
          {label}{" "}
          {ready === false && (
            <span className="font-normal text-muted-foreground">· not connected</span>
          )}
        </p>
        <p className="mt-0.5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
