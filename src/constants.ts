// =============================================================================
// Constants
// =============================================================================

export const COMPLETION_DISPLAY_DURATION = 10000;
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// =============================================================================
// Storage Constants
// =============================================================================

/**
 * Gets the user's home directory with multiple fallbacks.
 * Works across different runtimes (Node.js, Bun, browser-like).
 */
function getHomeDir(): string {
  // Try environment variables first (most reliable across runtimes)
  const envHome = process.env.HOME || process.env.USERPROFILE;
  if (envHome && envHome !== "/") {
    return envHome;
  }

  // Try Node.js os.homedir() as fallback
  try {
    // Dynamic import to avoid bundling issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("node:os");
    const home = os.homedir?.();
    if (home && home !== "/") {
      return home;
    }
  } catch {
    // os module not available
  }

  // Last resort: use /tmp for persistence
  console.warn("[constants] Could not determine home directory, using /tmp");
  return "/tmp";
}

const HOME_DIR = getHomeDir();
export const STORAGE_DIR = `${HOME_DIR}/.opencode/plugins/better-opencode-async-agents`;
export const TASKS_FILE = `${STORAGE_DIR}/tasks.json`;

// =============================================================================
// Fork Constants
// =============================================================================

/** Maximum tokens to include in forked context (leaves room for response) */
export const FORK_MAX_TOKENS = 100000;

/** Maximum characters per tool result before truncation */
export const FORK_TOOL_RESULT_LIMIT = 1500;

/** Maximum characters for tool parameters preview in forked context */
export const FORK_TOOL_PARAMS_LIMIT = 200;

// =============================================================================
// HTTP Status API Server
// =============================================================================

export const DEFAULT_API_PORT = 5165;
export const DEFAULT_API_HOST = "127.0.0.1";
export const SERVER_INFO_FILENAME = "server.json";
export const MAX_PORT_RETRY = 10;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MAX_SSE_SUBSCRIBERS = 50;
export const DEFAULT_TASK_LIMIT = 50;
export const MAX_TASK_LIMIT = 200;
