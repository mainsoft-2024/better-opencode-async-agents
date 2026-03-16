import { setTaskStatus, shortId } from "../helpers";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../prompts";
import type { BackgroundTask } from "../types";

// =============================================================================
// Resume Helper Types
// =============================================================================

export interface ResumeManager {
  getTask(taskId: string): BackgroundTask | undefined;
  resolveTaskId(idOrPrefix: string): string | null;
  resolveTaskIdWithFallback(idOrPrefix: string): Promise<string | null>;
  getTaskWithFallback(id: string): Promise<BackgroundTask | undefined>;
  persistTask(task: BackgroundTask): Promise<void>;
  checkSessionExists(sessionID: string): Promise<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendResumePromptAsync(task: BackgroundTask, message: string, toolContext: any): Promise<void>;
}

export type ResumeValidationResult =
  | { valid: true; task: BackgroundTask }
  | { valid: false; error: string };

// =============================================================================
// Resume Helper Functions
// =============================================================================

/**
 * Validates that a task can be resumed (async version that checks disk)
 * @param manager - BackgroundManager instance
 * @param taskId - Task ID (full or short) to validate
 * @returns Validation result with task if valid, or error message
 */
export async function validateResumeTask(
  manager: ResumeManager,
  taskId: string
): Promise<ResumeValidationResult> {
  // Resolve short ID or prefix to full ID (checks disk if not in memory)
  const resolvedId = await manager.resolveTaskIdWithFallback(taskId);
  if (!resolvedId) {
    return {
      valid: false,
      error: ERROR_MESSAGES.taskNotFoundWithHint(taskId),
    };
  }

  // Get task from memory or disk
  const task = await manager.getTaskWithFallback(resolvedId);

  if (!task) {
    return {
      valid: false,
      error: ERROR_MESSAGES.taskNotFoundWithHint(taskId),
    };
  }

  if (task.status === "resumed") {
    return {
      valid: false,
      error: ERROR_MESSAGES.taskCurrentlyResuming,
    };
  }


  return { valid: true, task };
}

/**
 * Executes the resume operation on a validated task
 * @param manager - BackgroundManager instance
 * @param task - The task to resume (must be validated first)
 * @param prompt - The follow-up prompt to send
 * @param toolContext - Tool context for notifications
 * @returns Success message or error message
 */
export async function executeResume(
  manager: ResumeManager,
  task: BackgroundTask,
  prompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolContext: any
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  if (task.status === "running") {
    if (task.pendingResume) {
      return {
        success: false,
        error: ERROR_MESSAGES.queueFull,
      };
    }

    task.pendingResume = {
      prompt,
      queuedAt: new Date().toISOString(),
    };
    await manager.persistTask(task);

    return {
      success: true,
      message: SUCCESS_MESSAGES.resumeQueued(shortId(task.sessionID)),
    };
  }

  // Set status to resumed and increment count
  setTaskStatus(task, "resumed");
  task.resumeCount++;
  await manager.persistTask(task);

  try {
    // Verify session still exists
    const sessionExists = await manager.checkSessionExists(task.sessionID);
    if (!sessionExists) {
      setTaskStatus(task, "completed"); // Revert status
      await manager.persistTask(task);
      return {
        success: false,
        error: ERROR_MESSAGES.sessionExpired,
      };
    }

    // Fire async resume - notification will be sent when complete
    manager.sendResumePromptAsync(task, prompt, toolContext);

    return {
      success: true,
      message: SUCCESS_MESSAGES.resumeInitiated(shortId(task.sessionID), task.resumeCount),
    };
  } catch (error) {
    // On error, set status to error (per spec)
    const errorMsg = error instanceof Error ? error.message : String(error);
    setTaskStatus(task, "error", { error: errorMsg });
    await manager.persistTask(task);

    return {
      success: false,
      error: ERROR_MESSAGES.resumeFailed(errorMsg),
    };
  }
}
