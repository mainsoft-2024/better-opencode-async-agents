import { COMPLETION_DISPLAY_DURATION } from "../constants";
import { setTaskStatus } from "../helpers";
import type { BackgroundTask, OpencodeClient } from "../types";

/**
 * FALLBACK & PROGRESS MECHANISM: Polling for task status updates.
 *
 * Primary completion detection is event-based (session.idle events).
 * Polling serves two purposes:
 * 1. Fallback for when events are missed (e.g., during reconnection)
 * 2. Progress updates for the toast display (tool calls, etc.)
 *
 * Polls every 100ms for responsive progress updates.
 * Events provide immediate completion notification when available.
 */
const POLLING_INTERVAL_MS = 100;

export function startPolling(
  pollingInterval: Timer | undefined,
  pollFn: () => void
): Timer | undefined {
  if (pollingInterval) return pollingInterval;

  return setInterval(() => {
    pollFn();
  }, POLLING_INTERVAL_MS);
}

/**
 * Stop polling for task status updates.
 *
 * Clears the polling interval.
 */
export function stopPolling(pollingInterval: Timer | undefined): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
}

/**
 * FALLBACK: Poll running/resumed tasks to check their status and progress.
 *
 * Primary completion detection is via session.idle events. This polling
 * function serves as a fallback mechanism when events are missed.
 *
 * This function:
 * - Checks if parent session still exists
 * - Updates task status when sessions become idle (fallback detection)
 * - Updates task progress (tool calls, etc.)
 * - Cleans up old completed tasks
 * - Stops polling when no active tasks remain
 */
export async function pollRunningTasks(
  client: OpencodeClient,
  tasks: Map<string, BackgroundTask>,
  originalParentSessionID: string | null,
  updateTaskProgress: (task: BackgroundTask) => Promise<void>,
  notifyParentSession: (task: BackgroundTask) => void,
  clearAllTasks: () => void,
  stopPolling: () => void,
  showProgressToast: (allTasks: BackgroundTask[]) => void,
  getTasksArray: () => BackgroundTask[],
  getTaskMessages?: (
    sessionID: string
  ) => Promise<
    Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
  >,
  persistTask?: (task: BackgroundTask) => void,
  emitTaskEvent?: (
    eventType: "task.completed" | "task.error" | "task.cancelled",
    task: BackgroundTask
  ) => void
): Promise<void> {
  try {
    const statusResult = await client.session.status();
    const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;

    const now = Date.now();

    // Check if any parent session no longer exists - if so, clear all tasks
    // Only check after tasks have been running for at least 3 seconds (grace period)
    const runningTasks = getTasksArray().filter((t) => t.status === "running");
    const oldestRunningTask = runningTasks.reduce((oldest, t) => {
      const startTime = new Date(t.startedAt).getTime();
      return startTime < oldest ? startTime : oldest;
    }, Date.now());
    const taskAge = now - oldestRunningTask;

    if (taskAge > 3000 && originalParentSessionID) {
      try {
        // Check if parent session still exists
        const parentSession = await client.session.get({
          path: { id: originalParentSessionID },
        });
        if (parentSession.error || !parentSession.data) {
          clearAllTasks();
          return;
        }
      } catch {
        // Error checking sessions - parent might be deleted
        clearAllTasks();
        return;
      }
    }

    for (const task of tasks.values()) {
      // Handle both running and resumed tasks
      if (task.status !== "running" && task.status !== "resumed") continue;

      // For resumed tasks, skip polling-based completion detection entirely.
      // The sendResumePromptAsync handler manages completion and notification for resumes.
      if (task.status === "resumed") {
        await updateTaskProgress(task);
        continue;
      }

      const sessionStatus = allStatuses[task.sessionID];

      if (!sessionStatus) {
        // Fallback: if session isn't in the status response, it may have completed.
        // Check if there are assistant messages (indicating the agent responded and finished).
        if (getTaskMessages) {
          try {
            const messages = await getTaskMessages(task.sessionID);
            const hasAssistantResponse = messages.some(
              (m) =>
                m.info?.role === "assistant" &&
                m.parts?.some((p) => p.type === "text" && p.text && p.text.length > 0)
            );

            if (hasAssistantResponse) {
              setTaskStatus(task, "completed", { persistFn: persistTask, emitFn: emitTaskEvent });
              notifyParentSession(task);
              continue;
            }
          } catch {
            // Ignore fallback check errors
          }
        }
        await updateTaskProgress(task);
        continue;
      }

      if (sessionStatus.type === "idle") {
        setTaskStatus(task, "completed", { persistFn: persistTask, emitFn: emitTaskEvent });
        notifyParentSession(task);
        continue;
      }

      await updateTaskProgress(task);
    }

    // Check if any running or resumed tasks remain
    const hasRunningTasks = getTasksArray().some(
      (t) => t.status === "running" || t.status === "resumed"
    );

    // Clean up old completed tasks when no running tasks (only after result retrieved)
    if (!hasRunningTasks) {
      for (const [taskId, task] of tasks) {
        if (task.status !== "running" && task.completedAt) {
          if (
            task.resultRetrievedAt &&
            now - new Date(task.resultRetrievedAt).getTime() > COMPLETION_DISPLAY_DURATION
          ) {
            tasks.delete(taskId);
          }
        }
      }
    }

    // Check if we should continue polling
    const hasActiveOrRecentTasks = getTasksArray().some((t) => {
      if (t.status === "running" || t.status === "resumed") return true;
      if (t.completedAt) {
        const completedTime = new Date(t.completedAt).getTime();
        return now - completedTime <= COMPLETION_DISPLAY_DURATION;
      }
      return false;
    });

    if (!hasActiveOrRecentTasks) {
      stopPolling();
      return;
    }

    showProgressToast(getTasksArray());
  } catch {
    // Ignore polling errors
  }
}

/**
 * Update task progress information.
 *
 * Fetches messages from the task's session and updates:
 * - Tool call count
 * - Last 3 tools used
 * - Last update timestamp
 */
export async function updateTaskProgress(
  task: BackgroundTask,
  client: OpencodeClient
): Promise<void> {
  try {
    const messagesResult = await client.session.messages({
      path: { id: task.sessionID },
    });

    if (messagesResult.error || !messagesResult.data) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = messagesResult.data as any[];

    let toolCalls = 0;
    const allTools: string[] = [];

    for (const msg of messages) {
      const parts = msg.parts ?? msg.content ?? [];
      const role = msg.info?.role ?? msg.role;

      if (role !== "assistant") continue;

      for (const part of parts) {
        if (part.type === "tool" && part.tool) {
          toolCalls++;
          allTools.push(part.tool);
        }
      }
    }

    if (!task.progress) {
      task.progress = {
        toolCalls: 0,
        lastTools: [],
        lastUpdate: new Date().toISOString(),
      };
    }
    task.progress.toolCalls = toolCalls;
    task.progress.lastTools = allTools.slice(-3);
    task.progress.lastUpdate = new Date().toISOString();
  } catch {
    // Ignore progress update errors
  }
}

/**
 * Format a duration between two dates as a human-readable string.
 *
 * Examples:
 * - "5s" (5 seconds)
 * - "2m 30s" (2 minutes 30 seconds)
 * - "1h 15m 20s" (1 hour 15 minutes 20 seconds)
 */
export function formatDuration(start: Date, end?: Date): string {
  const duration = (end ?? new Date()).getTime() - start.getTime();
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
