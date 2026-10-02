import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAvatarStatus, usePersonas } from "@/features/avatar-studio/hooks/useAvatarData";
import { NotConfigured } from "@/features/avatar-studio/components/shared";
import { realtimeHeartbeat, startRealtimeSession, stopRealtime } from "@/features/avatar-studio/lib/avatar.functions";

export const Route = createFileRoute("/avatar/live")({
  head: () => ({
    meta: [
      { title: "Live Avatar · Xeno Studio" },
      { name: "description", content: "Talk to a realtime interactive avatar." },
      { property: "og:title", content: "Live Avatar · Xeno Studio" },
      { property: "og:description", content: "Realtime conversational avatar sessions." },
    ],
  }),
  component: LivePage,
});

type Room = import("livekit-client").Room;

function LivePage() {
  const status = useAvatarStatus();
  const personas = usePersonas();
  const [persona, setPersona] = useState<string>("sandbox");
  const [session, setSession] = useState<{ id: string; ends: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const room = useRef<Room | null>(null);

  const stop = async () => {
    const id = session?.id;
    room.current?.disconnect();
    room.current = null;
    setSession(null);
    if (id) await stopRealtime({ data: { sessionId: id } }).catch(() => undefined);
  };

  useEffect(() => {
    if (!session) return;
    const hb = setInterval(() => void realtimeHeartbeat({ data: { sessionId: session.id } }).then((r) => !r.active && void stop()), 30_000);
    const tick = setInterval(() => {
      const s = Math.max(0, Math.round((session.ends - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) void stop();
    }, 1000);
    return () => {
      clearInterval(hb);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => () => { room.current?.disconnect(); }, []);

  const start = async () => {
    setBusy(true);
    try {
      const r = await startRealtimeSession({ data: { personaId: persona === "sandbox" ? null : persona, sandbox: persona === "sandbox" } });
      if (!r) return;
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const rm = new Room({ adaptiveStream: true });
      rm.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && videoRef.current) track.attach(videoRef.current);
        if (track.kind === Track.Kind.Audio && audioRef.current) track.attach(audioRef.current);
      });
      rm.on(RoomEvent.Disconnected, () => void stop());
      await rm.connect(r.livekitUrl, r.livekitToken);
      await rm.localParticipant.setMicrophoneEnabled(true);
      room.current = rm;
      setSession({ id: r.sessionId, ends: Date.now() + r.maxSeconds * 1000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the session");
    } finally {
      setBusy(false);
    }
  };

  const configured = !!status.data?.liveavatar.configured;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      {status.data && !configured && <NotConfigured what="LiveAvatar" />}
      <div className="aspect-video overflow-hidden rounded-xl border border-border bg-surface-raised">
        <video ref={videoRef} autoPlay playsInline className="size-full object-cover" />
        <audio ref={audioRef} autoPlay />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={persona} onValueChange={setPersona} disabled={!!session}>
          <SelectTrigger className="w-64" aria-label="Persona"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sandbox">Free sandbox test (~1 min)</SelectItem>
            {(personas.data ?? []).filter((p) => p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {session ? (
          <>
            <Button variant="outline" onClick={() => void stop()}>End session</Button>
            <span className="text-sm text-muted-foreground">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left</span>
          </>
        ) : (
          <Button disabled={!configured || busy} onClick={start}>{busy ? "Connecting…" : "Start session"}</Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Uses your microphone. Sessions end automatically at their time limit or if this tab goes quiet, so nothing keeps billing.</p>
    </div>
  );
}
