/**
 * A render that hasn't reported for this long has stopped (the media worker
 * gives up on a task after 15 minutes, and a running render reports progress
 * every few seconds).
 */
export const RENDER_STALL_MS = 20 * 60_000;

export function renderInProgress(
  render: { status: string; updated_at?: string | null; created_at: string },
  now = Date.now(),
): boolean {
  if (render.status !== "queued" && render.status !== "rendering") return false;
  const last = Date.parse(render.updated_at ?? render.created_at);
  return !Number.isFinite(last) || now - last < RENDER_STALL_MS;
}
