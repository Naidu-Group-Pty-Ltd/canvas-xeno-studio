/**
 * A render that hasn't been heard from for this long has stopped. The media
 * worker reports progress while it works and sends a heartbeat every minute
 * while a render waits in its queue or runs, so silence means it was lost.
 */
export const RENDER_STALL_MS = 5 * 60_000;

/**
 * The stage of a render the media service hasn't confirmed taking: it can be
 * sent again (the worker runs a task id once).
 */
export const RENDER_UNCONFIRMED_STAGE = "Waiting for the media service to confirm";

export function renderInProgress(
  render: { status: string; updated_at?: string | null; created_at: string },
  now = Date.now(),
): boolean {
  if (render.status !== "queued" && render.status !== "rendering") return false;
  const last = Date.parse(render.updated_at ?? render.created_at);
  return !Number.isFinite(last) || now - last < RENDER_STALL_MS;
}
