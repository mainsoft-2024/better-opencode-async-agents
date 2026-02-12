import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { formatTaskResult, formatTaskStatus } from "../helpers";
import { ERROR_MESSAGES, TOOL_DESCRIPTIONS } from "../prompts";
import type { BackgroundTask } from "../types";

/** Default timeout in seconds for blocking mode */
const DEFAULT_TIMEOUT_SECONDS = 30;
/** Maximum timeout in seconds for blocking mode */
const MAX_TIMEOUT_SECONDS = 600;

/**
 * Creates the background_output tool for retrieving task status and results
 * @param manager - BackgroundManager instance with getTask(), checkAndUpdateTaskStatus(), waitForTask(), resolveTaskIdWithFallback() methods
 * @returns Tool definition for background_output
 */
export function createBackgroundOutput(manager: {
  getTask(taskId: string): BackgroundTask | undefined;
  resolveTaskIdWithFallback(idOrPrefix: string): Promise<string | null>;
  getTaskWithFallback(id: string): Promise<BackgroundTask | undefined>;
  checkAndUpdateTaskStatus(
    task: BackgroundTask,
    skipNotification?: boolean
  ): Promise<BackgroundTask>;
  waitForTask(taskId: string, timeoutMs: number): Promise<BackgroundTask | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTaskMessages(sessionID: string): Promise<any[]>;
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundOutput,
    args: {
      task_id: tool.schema.string().nonoptional(),
      block: tool.schema.boolean().optional(),
      timeout: tool.schema.number().optional(),
    },
    async execute(args: { task_id: string; block?: boolean; timeout?: number }) {
      try {
        // Resolve short ID or prefix to full ID (checks disk if not in memory)
        const resolvedId = await manager.resolveTaskIdWithFallback(args.task_id);
        if (!resolvedId) {
          return ERROR_MESSAGES.taskNotFound(args.task_id);
        }

        // Get task from memory or disk
        let task = manager.getTask(resolvedId) ?? (await manager.getTaskWithFallback(resolvedId));
        if (!task) {
          return ERROR_MESSAGES.taskNotFound(args.task_id);
        }

        const shouldBlock = args.block === true;

        // If blocking mode, wait for task completion
        if (shouldBlock) {
          const timeoutSeconds = Math.min(
            args.timeout ?? DEFAULT_TIMEOUT_SECONDS,
            MAX_TIMEOUT_SECONDS
          );
          const timeoutMs = timeoutSeconds * 1000;

          // Check if task is already done
          if (
            task.status !== "completed" &&
            task.status !== "error" &&
            task.status !== "cancelled"
          ) {
            // Wait for task with skipNotification=true
            const result = await manager.waitForTask(resolvedId, timeoutMs);
            if (result) {
              task = result;
            }
          }
        }

        // Update task status (may detect completion via fallback mechanisms)
        // Use skipNotification=true when blocking to avoid duplicate notifications
        task = await manager.checkAndUpdateTaskStatus(task, shouldBlock);

        if (task.status === "completed") {
          if (!task.resultRetrievedAt) {
            task.resultRetrievedAt = new Date().toISOString();
          }
          return await formatTaskResult(task, (sessionID: string) =>
            manager.getTaskMessages(sessionID)
          );
        }

        if (task.status === "error" || task.status === "cancelled") {
          if (!task.resultRetrievedAt) {
            task.resultRetrievedAt = new Date().toISOString();
          }
          return formatTaskStatus(task);
        }

        // Task is still running or resumed - return current status
        // (may happen if blocking timed out)
        return formatTaskStatus(task);
      } catch (error) {
        return ERROR_MESSAGES.outputFailed(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
