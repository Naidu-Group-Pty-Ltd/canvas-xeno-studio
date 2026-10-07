import { AsyncLocalStorage } from "node:async_hooks";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { TaskError } from "./net.js";

/**
 * The disk one task may use: its sources, intermediates and outputs together.
 * A task's processes run inside its workspace; once the files in its directory
 * pass the budget, its running processes are stopped and no new one starts, so
 * the tasks running at once can't fill the disk they share.
 */
const current = new AsyncLocalStorage();

const MB = 1024 * 1024;
const WATCH_MS = 250;

export function workspaceTooLarge() {
  return new TaskError(
    "WORKSPACE_TOO_LARGE",
    `This task needs more than ${Math.round(config.maxTaskWorkspaceBytes / MB)} MB of working space. Use fewer or shorter clips, or a lower resolution.`,
  );
}

/** Bytes the files under a directory take. */
export async function sizeOf(dir) {
  let total = 0;
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await sizeOf(path);
    else total += await stat(path).then((info) => info.size, () => 0);
  }
  return total;
}

/** Runs `work` with `dir` as its workspace, watched against the budget. */
export async function withWorkspace(dir, work) {
  const space = { dir, processes: new Set(), over: false };
  const check = async () => {
    if (space.over) return;
    if ((await sizeOf(dir)) > config.maxTaskWorkspaceBytes) {
      space.over = true;
      for (const child of space.processes) child.kill("SIGKILL");
    }
  };
  let checking = Promise.resolve();
  const timer = setInterval(() => {
    checking = checking.then(check, check);
  }, WATCH_MS);
  try {
    return await current.run(space, work);
  } catch (error) {
    // A process stopped for the budget fails as that, not as a broken render.
    if (space.over) throw workspaceTooLarge();
    throw error;
  } finally {
    clearInterval(timer);
    await checking.catch(() => {});
  }
}

/**
 * Called before a process starts in the current workspace (if any): refused
 * once the budget is used up. Returns a function to call with the process.
 */
export async function enterWorkspace() {
  const space = current.getStore();
  if (!space) return () => {};
  if (space.over || (await sizeOf(space.dir)) > config.maxTaskWorkspaceBytes) {
    space.over = true;
    throw workspaceTooLarge();
  }
  return (child) => {
    space.processes.add(child);
    child.on("close", () => space.processes.delete(child));
  };
}
