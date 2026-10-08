import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** One preview at a time across the page. */
let shared: HTMLAudioElement | null = null;

export function usePreview() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const mine = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      if (mine.current && shared === mine.current) shared.pause();
    },
    [],
  );

  const toggle = useCallback(
    async (id: string, source: string | (() => Promise<string | null>)) => {
      if (playing === id) {
        mine.current?.pause();
        setPlaying(null);
        return;
      }
      setLoading(id);
      try {
        const url = typeof source === "string" ? source : await source();
        if (!url) throw new Error("This track can't be played");
        shared?.pause();
        const element = new Audio(url);
        shared = element;
        mine.current = element;
        element.onended = () => setPlaying((current) => (current === id ? null : current));
        element.onpause = () => setPlaying((current) => (current === id ? null : current));
        await element.play();
        setPlaying(id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "This track can't be played");
      } finally {
        setLoading(null);
      }
    },
    [playing],
  );

  return { playing, loading, toggle };
}
