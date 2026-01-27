import { STORAGE_DIR, TASKS_FILE } from "./constants";
import type { PersistedTask } from "./types";

// =============================================================================
// Storage Module (runtime-agnostic with fallbacks)
// =============================================================================

// Cached fs module (loaded dynamically)
let fsPromises: typeof import("node:fs/promises") | null = null;

/**
 * Gets the fs/promises module, loading it dynamically if needed.
 * Returns null if not available in the runtime.
 */
async function getFs(): Promise<typeof import("node:fs/promises") | null> {
  if (fsPromises) return fsPromises;
  try {
    fsPromises = await import("node:fs/promises");
    return fsPromises;
  } catch {
    return null;
  }
}

/**
 * Checks if Bun runtime is available.
 */
function hasBun(): boolean {
  return typeof globalThis.Bun !== "undefined";
}

/**
 * Ensures the storage directory exists.
 * Creates ~/.opencode/plugins/better-opencode-async-agents/ if it doesn't exist.
 */
export async function ensureStorageDir(): Promise<void> {
  try {
    const fs = await getFs();
    if (fs) {
      await fs.mkdir(STORAGE_DIR, { recursive: true });
    }
  } catch (error) {
    // Ignore EEXIST errors (directory already exists)
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      console.warn(`[storage] Failed to create storage directory: ${error}`);
    }
  }
}

/**
 * Loads all persisted tasks from disk.
 * Returns empty object if file doesn't exist or is corrupted.
 */
export async function loadTasks(): Promise<Record<string, PersistedTask>> {
  try {
    // Try Bun first (faster)
    if (hasBun()) {
      const file = Bun.file(TASKS_FILE);
      const exists = await file.exists();
      if (!exists) {
        return {};
      }
      const content = await file.text();
      return JSON.parse(content) as Record<string, PersistedTask>;
    }

    // Fall back to Node.js fs
    const fs = await getFs();
    if (fs) {
      const content = await fs.readFile(TASKS_FILE, "utf-8");
      return JSON.parse(content) as Record<string, PersistedTask>;
    }

    // No file system available - return empty
    console.warn("[storage] No file system API available");
    return {};
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(`[storage] Failed to load tasks: ${error}`);
    }
    return {};
  }
}

/**
 * Saves all tasks to disk.
 */
export async function saveTasks(tasks: Record<string, PersistedTask>): Promise<void> {
  try {
    await ensureStorageDir();
    const content = JSON.stringify(tasks, null, 2);

    // Try Bun first (faster, atomic)
    if (hasBun()) {
      await Bun.write(TASKS_FILE, content);
      return;
    }

    // Fall back to Node.js fs
    const fs = await getFs();
    if (fs) {
      await fs.writeFile(TASKS_FILE, content, "utf-8");
      return;
    }

    console.warn("[storage] No file system API available for saving");
  } catch (error) {
    console.warn(`[storage] Failed to save tasks: ${error}`);
    throw error;
  }
}

/**
 * Saves a single task to disk (read-modify-write).
 */
export async function saveTask(sessionID: string, task: PersistedTask): Promise<void> {
  const tasks = await loadTasks();
  tasks[sessionID] = task;
  await saveTasks(tasks);
}

/**
 * Gets a single persisted task from disk.
 * Returns undefined if not found.
 */
export async function getPersistedTask(sessionID: string): Promise<PersistedTask | undefined> {
  const tasks = await loadTasks();
  return tasks[sessionID];
}

/**
 * Deletes a single task from disk.
 */
export async function deletePersistedTask(sessionID: string): Promise<void> {
  const tasks = await loadTasks();
  if (sessionID in tasks) {
    delete tasks[sessionID];
    await saveTasks(tasks);
  }
}
