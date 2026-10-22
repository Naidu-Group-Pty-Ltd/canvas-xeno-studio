/**
 * Whether the media worker can do something newer than its basic tasks, by
 * the features it advertises (see media-worker/src/tasks.js). Asked before a
 * task that needs one is sent, so an older worker refuses nothing it would
 * otherwise do, and a newer ability is never assumed.
 */
import { AppError } from "../higgsfield/errors";
import { mediaWorkerConfigured, rememberedWorker, workerHealth } from "./worker.server";

/** What the worker said it can do stays true for this long (it renews it with every task). */
const REMEMBERED_FOR_MS = 12 * 60 * 60 * 1000;

/** The features the worker advertises: what it last said, else asked now (which wakes it). */
export async function workerFeatures(): Promise<string[] | null> {
  if (!mediaWorkerConfigured()) return null;
  const remembered = await rememberedWorker(REMEMBERED_FOR_MS).catch(() => null);
  if (remembered) return remembered.features;
  const health = await workerHealth();
  return health.ok ? (health.data?.features ?? []) : null;
}

/**
 * Refuses, plainly, unless the worker is set up and advertises `feature`.
 * `what` names the work, as in "Aligning a take".
 */
export async function requireWorkerFeature(feature: string, what: string): Promise<void> {
  if (!mediaWorkerConfigured())
    throw new AppError(
      "UNKNOWN",
      `${what} needs the media service. An admin needs to deploy it and set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.`,
    );
  const features = await workerFeatures();
  if (features === null)
    throw new AppError(
      "PROVIDER_TIMEOUT",
      "The media service isn't answering. Try again in a moment.",
    );
  if (!features.includes(feature)) {
    // What it said may be from before it was updated: ask it once more.
    const health = await workerHealth();
    if (health.ok && health.data?.features?.includes(feature)) return;
    throw new AppError(
      "INVALID_PARAMETERS",
      `${what} needs a newer media service than the one deployed. Ask an admin to deploy the latest media worker, then try again.`,
    );
  }
}
