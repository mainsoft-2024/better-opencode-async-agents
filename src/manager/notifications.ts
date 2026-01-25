import { COMPLETION_DISPLAY_DURATION, SPINNER_FRAMES } from "../constants";
import { shortId } from "../helpers";
import {
  NOTIFICATION_MESSAGES,
  PLACEHOLDER_TEXT,
  SYSTEM_HINT_MESSAGES,
  TOAST_TITLES,
} from "../prompts";
import type { BackgroundTask, OpencodeClient } from "../types";

// =============================================================================
// Notification Functions
// =============================================================================

/**
 * Shows a toast notification with progress information about running and completed background tasks.
 */
export function showProgressToast(
  allTasks: BackgroundTask[],
  animationFrame: number,
  client: OpencodeClient,
  getTasksArray: () => BackgroundTask[]
): void {
  if (allTasks.length === 0) return;

  const now = Date.now();
  const runningTasks = allTasks.filter((t) => t.status === "running" || t.status === "resumed");
  const completedTasks = allTasks.filter(
    (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
  );

  const recentlyCompletedTasks =
    runningTasks.length > 0
      ? completedTasks
      : completedTasks.filter((t) => {
          if (!t.completedAt) return false;
          const completedTime = new Date(t.completedAt).getTime();
          return now - completedTime <= COMPLETION_DISPLAY_DURATION;
        });

  const activeTasks = [...runningTasks, ...recentlyCompletedTasks];
  if (activeTasks.length === 0) return;

  const firstActive = activeTasks[0];
  if (!firstActive) return;
  const activeBatchId = firstActive.batchId;
  const batchTasks = allTasks.filter((t) => t.batchId === (activeBatchId ?? ""));
  const totalTasks = batchTasks.length;
  const finishedCount = batchTasks.filter(
    (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
  ).length;

  const nextAnimationFrame = (animationFrame + 1) % SPINNER_FRAMES.length;
  const spinner = SPINNER_FRAMES[nextAnimationFrame];

  const totalToolCalls = batchTasks.reduce((sum, t) => sum + (t.progress?.toolCalls ?? 0), 0);

  const taskLines: string[] = [];

  const batchRunning = runningTasks.filter((t) => t.batchId === activeBatchId);
  for (const task of batchRunning) {
    const duration = formatDuration(new Date(task.startedAt));
    const tools = task.progress?.lastTools?.slice(-3) ?? [];
    let toolsStr = "";
    if (tools.length > 0) {
      const lastTool = tools[tools.length - 1];
      const prevTools = tools.slice(0, -1);
      toolsStr =
        prevTools.length > 0 ? ` - ${prevTools.join(" > ")} > ｢${lastTool}｣` : ` - ｢${lastTool}｣`;
    }
    taskLines.push(
      `${spinner} [${shortId(task.sessionID)}] ${task.agent}: ${task.description} (${duration})${toolsStr}`
    );
  }

  const batchCompleted = batchTasks
    .filter((t) => t.status === "completed" || t.status === "error" || t.status === "cancelled")
    .sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

  const maxCompleted = batchRunning.length > 0 ? 10 : 10 - batchRunning.length;
  const visibleCompleted = batchCompleted.slice(0, maxCompleted);

  for (const task of visibleCompleted) {
    const duration = formatDuration(
      new Date(task.startedAt),
      task.completedAt ? new Date(task.completedAt) : undefined
    );
    const icon = task.status === "completed" ? "✓" : task.status === "error" ? "✗" : "⊘";
    taskLines.push(
      `${icon} [${shortId(task.sessionID)}] ${task.agent}: ${task.description} (${duration})`
    );
  }

  const hiddenCount = batchCompleted.length - visibleCompleted.length;
  if (hiddenCount > 0) {
    taskLines.push(PLACEHOLDER_TEXT.andMoreFinished(hiddenCount));
  }

  const progressPercent = totalTasks > 0 ? Math.round((finishedCount / totalTasks) * 100) : 0;
  const barLength = 10;
  const filledLength = Math.round((finishedCount / Math.max(totalTasks, 1)) * barLength);
  const progressBar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

  const summary = `[${progressBar}] ${finishedCount}/${totalTasks} agents (${progressPercent}%) | ${totalToolCalls} tool calls`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tuiClient = client as any;

  if (!tuiClient.tui?.showToast) return;

  const hasRunning = runningTasks.filter((t) => t.batchId === activeBatchId).length > 0;
  const title = hasRunning
    ? TOAST_TITLES.backgroundTasksRunning(spinner ?? "⏳")
    : TOAST_TITLES.tasksComplete;
  const variant = hasRunning ? "info" : "success";

  tuiClient.tui
    .showToast({
      body: {
        title,
        message: `${taskLines.join("\n")}\n\n${summary}`,
        variant,
        duration: 150,
      },
    })
    .catch(() => {});
}

/**
 * Notifies the parent session when a background task completes, fails, or is cancelled.
 */
export function notifyParentSession(
  task: BackgroundTask,
  client: OpencodeClient,
  directory: string,
  getTasksArray: () => BackgroundTask[]
): void {
  const duration = formatDuration(
    new Date(task.startedAt),
    task.completedAt ? new Date(task.completedAt) : undefined
  );
  const statusText =
    task.status === "completed" ? "COMPLETED" : task.status === "error" ? "FAILED" : "CANCELLED";

  // Calculate batch progress
  const batchTasks = getTasksArray().filter((t) => t.batchId === task.batchId);
  const totalTasks = batchTasks.length;
  const completedTasks = batchTasks.filter(
    (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
  ).length;
  const runningTasks = batchTasks.filter((t) => t.status === "running").length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tuiClient = client as any;
  if (tuiClient.tui?.showToast) {
    const toastTitle =
      task.status === "completed"
        ? TOAST_TITLES.taskCompleted
        : task.status === "error"
          ? TOAST_TITLES.taskFailed
          : TOAST_TITLES.taskCancelled;
    tuiClient.tui
      .showToast({
        body: {
          title: toastTitle,
          message: `Task "${task.description}" finished in ${duration}. Batch: ${completedTasks}/${totalTasks} complete, ${runningTasks} still running.`,
          variant: task.status === "completed" ? "success" : "error",
          duration: 5000,
        },
      })
      .catch(() => {});
  }

  // Build visible message
  const visibleStatus =
    task.status === "completed"
      ? NOTIFICATION_MESSAGES.visibleTaskCompleted(task.description, duration)
      : task.status === "error"
        ? NOTIFICATION_MESSAGES.visibleTaskFailed(task.description, duration)
        : NOTIFICATION_MESSAGES.visibleTaskCancelled(task.description, duration);
  const progressLine = NOTIFICATION_MESSAGES.taskProgressLine(completedTasks, totalTasks);
  const devIndicator =
    process.env.SUPERAGENTS_DEBUG === "1" ? ` ${NOTIFICATION_MESSAGES.devHintIndicator}` : "";
  const visibleMessage = `${visibleStatus}\n${progressLine}${devIndicator}`;

  // Build hidden hint based on batch status
  const taskShortId = shortId(task.sessionID);
  let hiddenHint: string;
  if (task.status === "error") {
    hiddenHint = SYSTEM_HINT_MESSAGES.errorHint(taskShortId, task.error || "Unknown error");
  } else if (runningTasks > 0) {
    hiddenHint = SYSTEM_HINT_MESSAGES.runningTasksHint(taskShortId);
  } else {
    hiddenHint = SYSTEM_HINT_MESSAGES.allTasksDoneHint(totalTasks);
  }

  setTimeout(async () => {
    try {
      const sessionInfo = await client.session.get({
        path: { id: task.parentSessionID },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agent = (sessionInfo.data as any)?.agent || task.agent;

      await client.session.prompt({
        path: { id: task.parentSessionID },
        body: {
          agent: task.parentAgent,
          parts: [
            { type: "text", text: visibleMessage },
            { type: "text", text: hiddenHint, synthetic: true },
          ],
        },
        query: { directory },
      });
    } catch {
      // Ignore notification errors
    }
  }, 200);
}

/**
 * Notifies the parent session when a resume operation completes successfully.
 */
export async function notifyResumeComplete(
  task: BackgroundTask,
  client: OpencodeClient,
  directory: string,
  toolContext: { sessionID: string; agent: string },
  getTaskMessages: (
    sessionID: string
  ) => Promise<
    Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
  >,
  getTasksArray?: () => BackgroundTask[]
): Promise<void> {
  try {
    // Calculate duration
    const duration = formatDuration(
      new Date(task.startedAt),
      task.completedAt ? new Date(task.completedAt) : undefined
    );

    // Calculate batch progress if available
    let completedTasks = 1;
    let totalTasks = 1;
    let runningTasks = 0;
    if (getTasksArray) {
      const batchTasks = getTasksArray().filter((t) => t.batchId === task.batchId);
      totalTasks = batchTasks.length;
      completedTasks = batchTasks.filter(
        (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
      ).length;
      runningTasks = batchTasks.filter((t) => t.status === "running").length;
    }

    // Build visible message
    const visibleStatus = NOTIFICATION_MESSAGES.visibleResumeCompleted(task.resumeCount, duration);
    const progressLine = NOTIFICATION_MESSAGES.taskProgressLine(completedTasks, totalTasks);
    const devIndicator =
      process.env.SUPERAGENTS_DEBUG === "1" ? ` ${NOTIFICATION_MESSAGES.devHintIndicator}` : "";
    const visibleMessage = `${visibleStatus}\n${progressLine}${devIndicator}`;

    // Build hidden hint
    const taskShortId = shortId(task.sessionID);
    const hiddenHint =
      runningTasks > 0
        ? SYSTEM_HINT_MESSAGES.runningTasksHint(taskShortId)
        : SYSTEM_HINT_MESSAGES.resumeHint(taskShortId);

    await client.session.prompt({
      path: { id: toolContext.sessionID },
      body: {
        agent: toolContext.agent,
        parts: [
          { type: "text", text: visibleMessage },
          { type: "text", text: hiddenHint, synthetic: true },
        ],
      },
      query: { directory },
    });
  } catch {
    // Ignore notification errors
  }
}

/**
 * Notifies the parent session when a resume operation fails.
 */
export async function notifyResumeError(
  task: BackgroundTask,
  errorMessage: string,
  client: OpencodeClient,
  directory: string,
  toolContext: { sessionID: string; agent: string },
  getTasksArray?: () => BackgroundTask[]
): Promise<void> {
  try {
    // Calculate duration
    const duration = formatDuration(
      new Date(task.startedAt),
      task.completedAt ? new Date(task.completedAt) : undefined
    );

    // Calculate batch progress if available
    let completedTasks = 1;
    let totalTasks = 1;
    let runningTasks = 0;
    if (getTasksArray) {
      const batchTasks = getTasksArray().filter((t) => t.batchId === task.batchId);
      totalTasks = batchTasks.length;
      completedTasks = batchTasks.filter(
        (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
      ).length;
      runningTasks = batchTasks.filter((t) => t.status === "running").length;
    }

    // Build visible message
    const visibleStatus = NOTIFICATION_MESSAGES.visibleResumeFailed(task.resumeCount, duration);
    const progressLine = NOTIFICATION_MESSAGES.taskProgressLine(completedTasks, totalTasks);
    const devIndicator =
      process.env.SUPERAGENTS_DEBUG === "1" ? ` ${NOTIFICATION_MESSAGES.devHintIndicator}` : "";
    const visibleMessage = `${visibleStatus}\n${progressLine}${devIndicator}`;

    // Build hidden hint with error message
    const taskShortId = shortId(task.sessionID);
    const hiddenHint = SYSTEM_HINT_MESSAGES.errorHint(taskShortId, errorMessage);

    await client.session.prompt({
      path: { id: toolContext.sessionID },
      body: {
        agent: toolContext.agent,
        parts: [
          { type: "text", text: visibleMessage },
          { type: "text", text: hiddenHint, synthetic: true },
        ],
      },
      query: { directory },
    });
  } catch {
    // Ignore notification errors
  }
}

/**
 * Formats a duration between two dates as a human-readable string.
 */
function formatDuration(start: Date, end?: Date): string {
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
