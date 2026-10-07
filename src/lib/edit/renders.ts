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

/**
 * The stage of a render the media service turned away because its queue was
 * full. It took nothing, so the render is sent again shortly: the Render
 * panel does so by itself, every RENDER_BUSY_RETRY_MS, while it is open.
 */
export const RENDER_BUSY_STAGE = "Waiting for room in the media service's queue";
export const RENDER_BUSY_RETRY_MS = 20_000;

/**
 * A render that stopped reporting is checked for the files it uploaded (and
 * finished from them) every RENDER_RECOVERY_RETRY_MS while the Render panel is
 * open, for as long as it went quiet within RENDER_RECOVERY_WINDOW_MS (its
 * worker may still be rendering or uploading); an older one is checked once.
 */
export const RENDER_RECOVERY_RETRY_MS = 30_000;
export const RENDER_RECOVERY_WINDOW_MS = 2 * 60 * 60_000;

export function renderInProgress(
  render: { status: string; updated_at?: string | null; created_at: string },
  now = Date.now(),
): boolean {
  if (render.status !== "queued" && render.status !== "rendering") return false;
  const last = Date.parse(render.updated_at ?? render.created_at);
  return !Number.isFinite(last) || now - last < RENDER_STALL_MS;
}
