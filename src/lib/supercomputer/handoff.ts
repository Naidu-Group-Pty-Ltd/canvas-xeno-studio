import type { MessageAttachment, SupercomputerIntent } from "./types";

/**
 * Hand-off into Supercomputer from other pages (Create, Library, briefs). The
 * composer is prefilled; nothing is sent until the user presses Send.
 */
export interface SupercomputerHandoff {
  text?: string;
  intent?: SupercomputerIntent;
  attachments?: MessageAttachment[];
  briefId?: string | null;
  projectId?: string | null;
  campaignId?: string | null;
  /** A conversation already made for it (a work carried on): kept open, the composer filled. */
  threadId?: string | null;
}

const KEY = "xeno.supercomputer.handoff";

export function setSupercomputerHandoff(handoff: SupercomputerHandoff) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(handoff));
}

export function takeSupercomputerHandoff(): SupercomputerHandoff | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as SupercomputerHandoff;
  } catch {
    return null;
  }
}
