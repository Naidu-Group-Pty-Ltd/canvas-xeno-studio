import { useSyncExternalStore } from "react";
import type { MusicFit } from "@/lib/music/fit";

/**
 * A music fit proposed in the Music panel and not yet applied, by the item
 * it is for, so the timeline can show it on that item's track meanwhile.
 * Kept in the page only: closing the panel or applying it clears it.
 */
const proposals = new Map<string, MusicFit>();
const listeners = new Set<() => void>();

export function proposeFit(itemId: string, fit: MusicFit | null): void {
  if (fit) proposals.set(itemId, fit);
  else proposals.delete(itemId);
  for (const listener of listeners) listener();
}

export function useFitProposal(itemId: string): MusicFit | null {
  const snapshot = () => proposals.get(itemId) ?? null;
  // The same on a server, where nothing is ever proposed.
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot,
    snapshot,
  );
}
