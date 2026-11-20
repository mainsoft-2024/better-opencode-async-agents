import type { BackgroundTask } from "../types";
import { STUCK_TIMEOUT_SECONDS, STUCK_MIN_RUNTIME_MS } from "../constants";

/**
 * Check if a task is stuck (inactive beyond its stuckTimeoutSeconds threshold).
 *
 * Returns true only when ALL conditions are met:
 * - status is "running" or "resumed"
 * - runtime >= STUCK_MIN_RUNTIME_MS (30s grace period)
 * - lastActivityAt exists
 * - time since lastActivityAt >= stuckTimeoutSeconds * 1000
 */
export function checkIfStuck(task: BackgroundTask): boolean {
  if (task.status !== "running" && task.status !== "resumed") return false;

  const runtimeMs = Date.now() - new Date(task.startedAt).getTime();
  if (runtimeMs < STUCK_MIN_RUNTIME_MS) return false;

  if (task.lastActivityAt === undefined || task.lastActivityAt === null) return false;

  const stuckTimeoutMs = (task.stuckTimeoutSeconds ?? STUCK_TIMEOUT_SECONDS) * 1000;
  const inactivityMs = Date.now() - task.lastActivityAt;
  return inactivityMs >= stuckTimeoutMs;
}

/**
 * Mark a task as stuck.
 * Sets stuckAt timestamp and transitions status to "stuck".
 */
export function markStuck(task: BackgroundTask): void {
  task.stuckAt = Date.now();
  task.status = "stuck";
}

/**
 * Update activity tracking based on incoming message type.
 *
 * Only updates lastActivityAt for "text" and "thinking" message types.
 * Tool calls (tool_use, tool_result) are intentionally excluded.
 * If the task was previously stuck, clears the stuckAt marker.
 */
export function updateActivityTracking(task: BackgroundTask, messageType: string): void {
  if (messageType !== "text" && messageType !== "thinking") return;

  task.lastActivityAt = Date.now();

  if (task.stuckAt !== undefined) {
    task.stuckAt = undefined;
  }
}