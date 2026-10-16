/**
 * The worker's two lanes. Heavy tasks (renders and the other tasks that
 * encode video) and quick ones (probes, thumbnails, frames, image resizes and
 * audio) each have their own queue and room, so a quick task, like the frame
 * a long video's next clip starts from, never waits behind a render.
 */

/** Tasks that only read media, or make a still or a sound: seconds, not minutes. */
export const QUICK_TASKS = new Set([
  "probe",
  "create_thumbnail",
  "extract_frames",
  "resize_image",
  "extract_audio",
  "prepare_audio",
  "measure_sync",
]);

export function laneOf(taskType) {
  return QUICK_TASKS.has(taskType) ? "quick" : "heavy";
}

export class Lanes {
  /**
   * @param {{ heavy: number, quick: number }} room how many of each may run at once
   * @param {(task: { taskType: string }) => Promise<unknown>} execute runs a task; never throws
   * @param {(task: object) => void} [settled] told when a task has finished
   */
  constructor(room, execute, settled = () => {}) {
    this.room = { heavy: Math.max(1, room.heavy), quick: Math.max(1, room.quick) };
    this.execute = execute;
    this.settled = settled;
    this.queues = { heavy: [], quick: [] };
    this.running = { heavy: 0, quick: 0 };
  }

  /** Tasks waiting, in both lanes. */
  get queued() {
    return this.queues.heavy.length + this.queues.quick.length;
  }

  /** Tasks running, in both lanes. */
  get busy() {
    return this.running.heavy + this.running.quick;
  }

  /** How many wait ahead of a queued task in its lane (-1 once it runs). */
  position(task) {
    return this.queues[laneOf(task.taskType)].indexOf(task);
  }

  add(task) {
    this.queues[laneOf(task.taskType)].push(task);
    this.pump();
  }

  pump() {
    for (const lane of ["quick", "heavy"]) {
      while (this.running[lane] < this.room[lane] && this.queues[lane].length > 0) {
        const task = this.queues[lane].shift();
        this.running[lane] += 1;
        Promise.resolve()
          .then(() => this.execute(task))
          .catch(() => {})
          .finally(() => {
            this.running[lane] -= 1;
            this.settled(task);
            this.pump();
          });
      }
    }
  }

  /** Each lane's state, as /health reports it. */
  describe() {
    return Object.fromEntries(
      ["heavy", "quick"].map((lane) => [
        lane,
        {
          running: this.running[lane],
          queued: this.queues[lane].length,
          concurrency: this.room[lane],
        },
      ]),
    );
  }
}

/**
 * Whether the worker has been idle long enough to stop: nothing running,
 * queued or still being reported, since `idleSince`, for `stopAfterMs`.
 */
export function idleLongEnough({ busy, queued, reporting, idleSince, now, stopAfterMs }) {
  if (!(stopAfterMs > 0)) return false;
  if (busy > 0 || queued > 0 || reporting > 0) return false;
  return now - idleSince >= stopAfterMs;
}
