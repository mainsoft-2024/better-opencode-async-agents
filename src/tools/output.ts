import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { formatTaskResult, formatTaskStatus } from "../helpers";
import type { BackgroundTask } from "../types";

/**
 * Creates the background_output tool for retrieving task results
 * @param manager - BackgroundManager instance with getTask(), checkAndUpdateTaskStatus() methods
 * @returns Tool definition for background_output
 */
export function createBackgroundOutput(manager: {
  getTask(taskId: string): BackgroundTask | undefined;
  checkAndUpdateTaskStatus(
    task: BackgroundTask,
    skipNotification?: boolean
  ): Promise<BackgroundTask>;
  getTaskMessages(sessionID: string): Promise<any[]>;
}): ToolDefinition {
  return tool({
    description: `Get output from a background task.

Arguments:
- task_id: Required task ID to get output from
- block: If true, wait for task completion. If false (default), return current status immediately.
- timeout: Max wait time in ms when blocking (default: 60000, max: 600000)

Returns:
- When not blocking: Returns current status
- When blocking: Waits for completion, then returns full result`,
    args: {
      task_id: tool.schema.string(),
      block: tool.schema.boolean().nonoptional(),
      timeout: tool.schema.number().optional(),
    },
    async execute(args: { task_id: string; block?: boolean; timeout?: number }) {
      try {
        let task = manager.getTask(args.task_id);
        if (!task) {
          return `Task not found: ${args.task_id}`;
        }

        // Don't skip notification on initial check (parent isn't blocking yet)
        task = await manager.checkAndUpdateTaskStatus(task, false);

        const shouldBlock = args.block === true;
        const timeoutMs = Math.min(args.timeout ?? 60000, 600000);

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

        if (!shouldBlock) {
          return formatTaskStatus(task);
        }

        const startTime = Date.now();
        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        while (Date.now() - startTime < timeoutMs) {
          await delay(1000);

          let currentTask = manager.getTask(args.task_id);
          if (!currentTask) {
            return `Task was deleted: ${args.task_id}`;
          }

          // Skip notification when blocking - parent session can't receive prompts while waiting for tool result
          currentTask = await manager.checkAndUpdateTaskStatus(currentTask, true);

          if (currentTask.status === "completed") {
            if (!currentTask.resultRetrievedAt) {
              currentTask.resultRetrievedAt = new Date().toISOString();
            }
            return await formatTaskResult(currentTask, (sessionID: string) =>
              manager.getTaskMessages(sessionID)
            );
          }

          if (currentTask.status === "error" || currentTask.status === "cancelled") {
            if (!currentTask.resultRetrievedAt) {
              currentTask.resultRetrievedAt = new Date().toISOString();
            }
            return formatTaskStatus(currentTask);
          }
        }

        const finalTask = manager.getTask(args.task_id);
        if (!finalTask) {
          return `Task was deleted: ${args.task_id}`;
        }
        return `Timeout exceeded (${timeoutMs}ms). Task still ${finalTask.status}.\n\n${formatTaskStatus(finalTask)}`;
      } catch (error) {
        return `Error getting output: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
