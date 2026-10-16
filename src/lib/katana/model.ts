/**
 * Katana runs as the studio shows them: their states, what each means, and
 * what can be done with a run in each. Shared by the pages; pure.
 */

export type KatanaRunStatus =
  | "preparing"
  | "starting"
  | "running"
  | "waiting"
  | "idle"
  | "delivered"
  | "paused"
  | "uncertain"
  | "failed"
  | "cancelled";

export const KATANA_STATUS_LABELS: Record<KatanaRunStatus, string> = {
  preparing: "Handing over files",
  starting: "Starting",
  running: "Working",
  waiting: "Checking a paid step",
  idle: "Stopped, no video",
  delivered: "Delivered",
  paused: "Paused: Claude budget",
  uncertain: "Checking its start",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const KATANA_STATUS_TONES: Record<KatanaRunStatus, string> = {
  preparing: "bg-info/10 text-info border-info/25",
  starting: "bg-info/10 text-info border-info/25",
  running: "bg-info/15 text-info border-info/30",
  waiting: "bg-info/15 text-info border-info/30",
  idle: "bg-warning/15 text-warning border-warning/30",
  delivered: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  uncertain: "bg-warning/15 text-warning border-warning/30",
  failed: "bg-primary/15 text-primary border-primary/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

/** States in which the run's session (or its start) is still moving. */
export const KATANA_ACTIVE_STATUSES = new Set<string>([
  "preparing",
  "starting",
  "running",
  "waiting",
  "uncertain",
]);

export function katanaStatus(value: string): KatanaRunStatus {
  return value in KATANA_STATUS_LABELS ? (value as KatanaRunStatus) : "failed";
}

export const KATANA_MODE_LABELS = {
  remix: "Remix a reference",
  preset: "Use a preset",
  edit: "Edit my footage",
} as const;

/** What a person can do with a run in its current state. */
export function katanaActions(
  status: string,
  options: { hasSession: boolean; hasResume: boolean },
) {
  const active = KATANA_ACTIVE_STATUSES.has(status);
  return {
    cancel: active || status === "paused",
    followUp: options.hasSession && (status === "delivered" || status === "idle"),
    raiseClaudeBudget: options.hasSession && (status === "paused" || active),
    raiseCreditLimit: status !== "failed" && status !== "cancelled",
    revise: options.hasResume && !active,
  };
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
