import { SERVER_INFO_FILENAME, STORAGE_DIR, TASKS_FILE } from "./constants";
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

/**
 * Loads all persisted tasks from disk with their session IDs.
 * Returns an array of tasks with sessionID included for API consumption.
 */
export async function loadAllTasks(): Promise<Array<{ sessionID: string } & PersistedTask>> {
  const tasks = await loadTasks();
  return Object.entries(tasks).map(([sessionID, task]) => ({ sessionID, ...task }));
}

// =============================================================================
// Server Info (server.json) - For HTTP Status API discovery
// =============================================================================

const SERVER_INFO_FILE = `${STORAGE_DIR}/${SERVER_INFO_FILENAME}`;

/**
 * Writes server discovery info to disk.
 * Used by the HTTP Status API server to advertise its endpoint.
 */
export async function writeServerInfo(info: {
  port: number;
  pid: number;
  startedAt: string;
  url: string;
  version: string;
}): Promise<void> {
  try {
    await ensureStorageDir();
    const content = JSON.stringify(info, null, 2);

    // Try Bun first (faster, atomic)
    if (hasBun()) {
      await Bun.write(SERVER_INFO_FILE, content);
      return;
    }

    // Fall back to Node.js fs
    const fs = await getFs();
    if (fs) {
      await fs.writeFile(SERVER_INFO_FILE, content, "utf-8");
      return;
    }

    console.warn("[storage] No file system API available for writing server info");
  } catch (error) {
    console.warn(`[storage] Failed to write server info: ${error}`);
    throw error;
  }
}

/**
 * Reads server discovery info from disk.
 * Returns null if the file doesn't exist.
 */
export async function readServerInfo(): Promise<{
  port: number;
  pid: number;
  startedAt: string;
  url: string;
  version: string;
} | null> {
  try {
    // Try Bun first
    if (hasBun()) {
      const file = Bun.file(SERVER_INFO_FILE);
      const exists = await file.exists();
      if (!exists) {
        return null;
      }
      const content = await file.text();
      return JSON.parse(content) as {
        port: number;
        pid: number;
        startedAt: string;
        url: string;
        version: string;
      };
    }

    // Fall back to Node.js fs
    const fs = await getFs();
    if (fs) {
      const content = await fs.readFile(SERVER_INFO_FILE, "utf-8");
      return JSON.parse(content) as {
        port: number;
        pid: number;
        startedAt: string;
        url: string;
        version: string;
      };
    }

    return null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(`[storage] Failed to read server info: ${error}`);
    }
    return null;
  }
}

/**
 * Deletes the server discovery info file.
 * Called when the HTTP Status API server shuts down.
 */
export async function deleteServerInfo(): Promise<void> {
  try {
    // Try Bun first
    if (hasBun()) {
      const file = Bun.file(SERVER_INFO_FILE);
      const exists = await file.exists();
      if (exists) {
        await file.delete();
      }
      return;
    }

    // Fall back to Node.js fs
    const fs = await getFs();
    if (fs) {
      await fs.unlink(SERVER_INFO_FILE).catch(() => {
        // Ignore if file doesn't exist
      });
      return;
    }
  } catch {
    // Ignore deletion errors
  }
}
