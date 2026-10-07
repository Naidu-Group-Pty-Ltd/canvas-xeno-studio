import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { timelineSchema, type Timeline } from "@/lib/edit/timeline";

/* ------------------------------------------------------------------ */
/* Playback clock                                                      */
/* ------------------------------------------------------------------ */

/**
 * The editor's transport. Time lives outside React state so only the parts
 * that show it (the preview, the playhead, the time readout) re-render while
 * playing, not the whole editor.
 */
export class PlaybackClock {
  private time = 0;
  private playing = false;
  private total = 0;
  private anchorTime = 0;
  private anchorAt = 0;
  private frame = 0;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getTime = () => this.time;
  isPlaying = () => this.playing;
  getTotal = () => this.total;

  private emit() {
    for (const listener of this.listeners) listener();
  }

  setTotal(total: number) {
    this.total = Math.max(0, total);
    if (this.time > this.total) this.seek(this.total);
  }

  seek(time: number) {
    this.time = Math.max(0, Math.min(time, this.total));
    this.anchorTime = this.time;
    this.anchorAt = performance.now();
    this.emit();
  }

  play() {
    if (this.playing || this.total <= 0) return;
    if (this.time >= this.total - 0.02) this.time = 0;
    this.playing = true;
    this.anchorTime = this.time;
    this.anchorAt = performance.now();
    this.frame = requestAnimationFrame(this.tick);
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.frame);
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  private tick = () => {
    if (!this.playing) return;
    const next = this.anchorTime + (performance.now() - this.anchorAt) / 1000;
    if (next >= this.total) {
      this.time = this.total;
      this.playing = false;
      this.emit();
      return;
    }
    this.time = next;
    this.emit();
    this.frame = requestAnimationFrame(this.tick);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.listeners.clear();
  }
}

export function useClockTime(clock: PlaybackClock): number {
  return useSyncExternalStore(clock.subscribe, clock.getTime, clock.getTime);
}

export function useClockPlaying(clock: PlaybackClock): boolean {
  return useSyncExternalStore(clock.subscribe, clock.isPlaying, clock.isPlaying);
}

/* ------------------------------------------------------------------ */
/* Timeline history                                                    */
/* ------------------------------------------------------------------ */

export type Selection =
  | { kind: "clip"; id: string }
  | { kind: "audio"; id: string }
  | { kind: "overlay"; id: string }
  | { kind: "caption"; index: number }
  | null;

interface HistoryState {
  present: Timeline;
  past: Timeline[];
  future: Timeline[];
  lastKey: string | null;
  lastAt: number;
}

type HistoryAction =
  | { type: "change"; timeline: Timeline; key?: string | undefined }
  | { type: "update"; apply: (present: Timeline) => Timeline }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; timeline: Timeline };

const HISTORY_LIMIT = 100;
/** Changes with the same key within this window (a drag, a slider) are one undo step. */
const COALESCE_MS = 900;

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "update":
      return historyReducer(state, { type: "change", timeline: action.apply(state.present) });
    case "change": {
      if (action.timeline === state.present) return state;
      const now = Date.now();
      if (action.key && action.key === state.lastKey && now - state.lastAt < COALESCE_MS) {
        return { ...state, present: action.timeline, future: [], lastAt: now };
      }
      return {
        present: action.timeline,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: action.key ?? null,
        lastAt: now,
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
        lastKey: null,
        lastAt: 0,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        present: next,
        past: [...state.past, state.present],
        future: state.future.slice(1),
        lastKey: null,
        lastAt: 0,
      };
    }
    case "reset":
      return { present: action.timeline, past: [], future: [], lastKey: null, lastAt: 0 };
  }
}

export function useTimelineHistory(initial: Timeline) {
  const [state, dispatch] = useReducer(historyReducer, {
    present: initial,
    past: [],
    future: [],
    lastKey: null,
    lastAt: 0,
  });
  const change = useCallback(
    (timeline: Timeline, key?: string) => dispatch({ type: "change", timeline, key }),
    [],
  );
  /**
   * A change worked out from the timeline as it is when the change lands, for
   * changes that wait on something first (so changes made meanwhile are kept).
   */
  const update = useCallback(
    (apply: (present: Timeline) => Timeline) => dispatch({ type: "update", apply }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((timeline: Timeline) => dispatch({ type: "reset", timeline }), []);
  return {
    timeline: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    change,
    update,
    undo,
    redo,
    reset,
  };
}

/* ------------------------------------------------------------------ */
/* Autosave                                                            */
/* ------------------------------------------------------------------ */

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

const SAVE_DELAY_MS = 1200;

/**
 * Saves the edit shortly after each change. Every save names the version it
 * was based on, so a teammate's newer save is never silently overwritten: the
 * editor is told about the conflict instead.
 */
export function useAutosave(options: {
  sequenceId: string;
  initialVersion: number;
  timeline: Timeline;
  title: string;
  enabled: boolean;
}) {
  const { sequenceId, timeline, title, enabled } = options;
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(options.initialVersion);
  const versionRef = useRef(options.initialVersion);
  const lastSaved = useRef({ timeline: JSON.stringify(timeline), title });
  const latest = useRef({ timeline, title });
  const inFlight = useRef<Promise<number> | null>(null);
  /** The version the in-flight save writes, so its own realtime echo is recognised. */
  const savingVersion = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = useRef(false);

  latest.current = { timeline, title };

  const isDirty = useCallback(
    () =>
      JSON.stringify(latest.current.timeline) !== lastSaved.current.timeline ||
      latest.current.title !== lastSaved.current.title,
    [],
  );

  const save = useCallback(async (): Promise<number> => {
    // One save at a time: callers that arrive while one is on its way wait
    // their turn, and each looks again once it ends (another caller may have
    // started the next save meanwhile), so two never write from one version.
    while (inFlight.current) {
      await inFlight.current.catch(() => undefined);
    }
    if (blocked.current)
      throw new Error("This edit changed elsewhere. Reload it or keep your version first.");
    if (!isDirty()) return versionRef.current;
    // Never store an edit that can't be opened again.
    if (!timelineSchema.safeParse(latest.current.timeline).success) {
      const message =
        "This change can't be saved because part of the edit is out of range. Undo it to keep saving.";
      setStatus("error");
      setError(message);
      throw new Error(message);
    }

    const snapshot = {
      timeline: JSON.stringify(latest.current.timeline),
      title: latest.current.title,
    };
    const base = versionRef.current;
    savingVersion.current = base + 1;
    setStatus("saving");
    const run = (async () => {
      const { data, error } = await supabase
        .from("sequences")
        .update({
          timeline: JSON.parse(snapshot.timeline) as never,
          title: snapshot.title.trim().slice(0, 200) || "Untitled edit",
          version: base + 1,
        })
        .eq("id", sequenceId)
        .eq("version", base)
        .select("version");
      if (error) {
        setStatus("error");
        setError(error.message);
        throw new Error(error.message);
      }
      if (!data?.length) {
        blocked.current = true;
        setStatus("conflict");
        throw new Error("This edit changed elsewhere. Reload it or keep your version first.");
      }
      versionRef.current = base + 1;
      setVersion(base + 1);
      setError(null);
      lastSaved.current = snapshot;
      setStatus(isDirty() ? "pending" : "saved");
      return base + 1;
    })();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
      savingVersion.current = null;
    }
  }, [sequenceId, isDirty]);

  useEffect(() => {
    if (!enabled || blocked.current) return;
    if (!isDirty()) return;
    setStatus((current) => (current === "saving" ? current : "pending"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void save().catch(() => undefined);
    }, SAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [timeline, title, enabled, save, isDirty]);

  // Unsaved work is flushed when leaving the page.
  useEffect(() => {
    const flush = (event: BeforeUnloadEvent) => {
      if (isDirty() && !blocked.current) {
        void save().catch(() => undefined);
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (isDirty() && !blocked.current) void save().catch(() => undefined);
    };
  }, [save, isDirty]);

  /** Saves immediately and returns the version that is now stored. */
  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    return save();
  }, [save]);

  /** After a conflict: replace the stored edit with this one. */
  const keepMine = useCallback(async () => {
    const { data, error } = await supabase
      .from("sequences")
      .select("version")
      .eq("id", sequenceId)
      .maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "The edit could not be reloaded");
    versionRef.current = data.version;
    blocked.current = false;
    lastSaved.current = { timeline: "", title: "" };
    return save();
  }, [sequenceId, save]);

  /** After loading a teammate's newer save into the editor. */
  const adopt = useCallback((stored: { version: number; timeline: Timeline; title: string }) => {
    blocked.current = false;
    versionRef.current = stored.version;
    setVersion(stored.version);
    lastSaved.current = { timeline: JSON.stringify(stored.timeline), title: stored.title };
    setStatus("saved");
  }, []);

  const currentVersion = useCallback(() => versionRef.current, []);

  /**
   * Whether a stored version is this editor's own save. A realtime echo can
   * arrive before the save call returns; a teammate's save of that same
   * version would make ours fail, which shows the conflict banner anyway.
   */
  const isOwnSave = useCallback(
    (stored: number) => stored <= versionRef.current || stored === savingVersion.current,
    [],
  );

  return useMemo(
    () => ({ status, error, version, saveNow, keepMine, adopt, currentVersion, isOwnSave }),
    [status, error, version, saveNow, keepMine, adopt, currentVersion, isOwnSave],
  );
}
