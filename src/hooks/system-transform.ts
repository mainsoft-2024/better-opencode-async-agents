import { shortId } from "../helpers";
import type { BackgroundTask, BackgroundTaskStatus } from "../types";

// =============================================================================
// Types
// =============================================================================

/**
 * Interface for BackgroundManager to avoid importing the class directly.
 * Only defines the methods needed by this hook.
 */
export interface BackgroundManager {
  getAllTasks(): BackgroundTask[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets tasks that have completed but whose results haven't been retrieved yet.
 */
function getUnretrievedTasks(
  manager: BackgroundManager,
  parentSessionID: string
): BackgroundTask[] {
  const tasks = manager.getAllTasks();
  const terminalStatuses: BackgroundTaskStatus[] = ["completed", "error", "cancelled"];

  return tasks.filter(
    (task) =>
      task.parentSessionID === parentSessionID &&
      terminalStatuses.includes(task.status) &&
      !task.resultRetrievedAt
  );
}

/**
 * Gets the count of currently running tasks for a given parent session.
 */
function getRunningTasksCount(manager: BackgroundManager, parentSessionID: string): number {
  const tasks = manager.getAllTasks();

  return tasks.filter(
    (task) => task.parentSessionID === parentSessionID && task.status === "running"
  ).length;
}

/**
 * Builds a system hint message showing the progress of background tasks.
 */
function buildSystemHint(unretrievedTasks: BackgroundTask[], runningCount: number): string {
  if (unretrievedTasks.length === 0) {
    return "";
  }

  // Group tasks by status
  const byStatus = unretrievedTasks.reduce<Record<BackgroundTaskStatus, BackgroundTask[]>>(
    (acc, task) => {
      if (!acc[task.status]) {
        acc[task.status] = [];
      }
      acc[task.status]!.push(task);
      return acc;
    },
    { running: [], completed: [], error: [], cancelled: [], resumed: [] }
  );

  const completed = byStatus.completed;
  const errors = byStatus.error;
  const cancelled = byStatus.cancelled;

  // Calculate progress
  const total = completed.length + errors.length + cancelled.length;

  // Build hint message
  const lines: string[] = [];
  lines.push(`Agent Progress: ${completed.length}/${total}`);

  // Add completed section if any
  if (completed.length > 0) {
    const ids = completed.map((task) => shortId(task.sessionID)).join(", ");
    lines.push(`✓ Completed: superagents_output(task_id=${ids})`);
  }

  // Add error section if any
  if (errors.length > 0) {
    const ids = errors.map((task) => shortId(task.sessionID)).join(", ");
    lines.push(`✗ Error: superagents_output(task_id=${ids})`);
  }

  // Add cancelled section if any
  if (cancelled.length > 0) {
    const ids = cancelled.map((task) => shortId(task.sessionID)).join(", ");
    lines.push(`⊘ Cancelled: superagents_output(task_id=${ids})`);
  }

  // Add continuation and leftover warning
  lines.push("You can continue working or just say 'waiting' and halt.");

  // Only add leftover warning if there are running tasks
  if (runningCount > 0) {
    lines.push("WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.");
  }

  return lines.join("\n");
}

// =============================================================================
// Hook Creation
// =============================================================================

/**
 * Creates the system transform hook handler (experimental, may not be active).
 *
 * This hook is called before sending the system prompt to the model.
 * It injects a silent system hint showing the status of background tasks
 * that have completed but whose results haven't been retrieved yet.
 *
 * Hook signature from @opencode-ai/plugin:
 * (input: { sessionID: string }, output: { system: string[] }) => Promise<void>
 */
export function createSystemTransformHook(manager: BackgroundManager) {
  return async (input: { sessionID: string }, output: { system: string[] }): Promise<void> => {
    const unretrievedTasks = getUnretrievedTasks(manager, input.sessionID);

    // If no unretrieved tasks, don't modify system
    if (unretrievedTasks.length === 0) {
      return;
    }

    const runningCount = getRunningTasksCount(manager, input.sessionID);
    const hint = buildSystemHint(unretrievedTasks, runningCount);

    // Append hint to system array (mutating)
    output.system.push(hint);
  };
}

/**
 * Creates the chat.message hook handler.
 *
 * This hook is called when a new message is received. It injects a hint
 * by prepending to the first text part's content.
 *
 * Hook signature from @opencode-ai/plugin:
 * (input: { sessionID: string, ... }, output: { message: UserMessage, parts: Part[] }) => Promise<void>
 */
export function createChatMessageHook(manager: BackgroundManager) {
  return async (
    input: {
      sessionID: string;
      agent?: string;
      model?: { providerID: string; modelID: string };
      messageID?: string;
      variant?: string;
    },
    output: {
      message: unknown;
      parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
    }
  ): Promise<void> => {
    // Defensive check - if no parts array, skip
    if (!output.parts || !Array.isArray(output.parts)) {
      return;
    }

    const unretrievedTasks = getUnretrievedTasks(manager, input.sessionID);

    // If no unretrieved tasks, don't modify message
    if (unretrievedTasks.length === 0) {
      return;
    }

    const runningCount = getRunningTasksCount(manager, input.sessionID);
    const hint = buildSystemHint(unretrievedTasks, runningCount);
    const hintText = `[SuperAgents Status]\n${hint}\n\n---\n\n`;

    // Find the first text part and prepend to it (safer than creating new parts)
    const firstTextPart = output.parts.find((p) => p.type === "text" && typeof p.text === "string");
    if (firstTextPart && typeof firstTextPart.text === "string") {
      firstTextPart.text = hintText + firstTextPart.text;
    }
    // If no text part found, we can't inject (don't create new parts to avoid validation issues)
  };
}
