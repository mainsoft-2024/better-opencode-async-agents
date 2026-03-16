import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { formatTaskResult, formatTaskStatus } from "../helpers";
import { ERROR_MESSAGES, TOOL_DESCRIPTIONS } from "../prompts";
import type { BackgroundTask, FilteredMessage, MessageFilter } from "../types";

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
  getFilteredMessages(sessionID: string, filter: MessageFilter): Promise<FilteredMessage[]>;
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundOutput,
    args: {
      task_id: tool.schema.string().nonoptional(),
      block: tool.schema.boolean().optional(),
      timeout: tool.schema.number().optional(),
      full_session: tool.schema.boolean().optional(),
      include_thinking: tool.schema.boolean().optional(),
      include_tool_results: tool.schema.boolean().optional(),
      since_message_id: tool.schema.string().optional(),
      message_limit: tool.schema.number().optional(),
      thinking_max_chars: tool.schema.number().optional(),
    },
    async execute(args: {
      task_id: string;
      block?: boolean;
      timeout?: number;
      full_session?: boolean;
      include_thinking?: boolean;
      include_tool_results?: boolean;
      since_message_id?: string;
      message_limit?: number;
      thinking_max_chars?: number;
    }) {
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

        if (args.full_session === true) {
          const filter: MessageFilter = {
            fullSession: true,
            includeThinking: args.include_thinking,
            includeToolResults: args.include_tool_results,
            sinceMessageId: args.since_message_id,
            messageLimit:
              args.message_limit !== undefined ? Math.min(args.message_limit, 100) : undefined,
            thinkingMaxChars: args.thinking_max_chars,
          };
          const filteredMessages = await manager.getFilteredMessages(task.sessionID, filter);

          if (filteredMessages.length === 0) {
            return "No messages available for this task.";
          }

          return filteredMessages
            .map((message: FilteredMessage) => {
              const sections = [`[${message.id}] ${message.role}: ${message.content}`];

              if (message.thinking) {
                sections.push(`thinking:\n${message.thinking}`);
              }

              if (message.toolCalls && message.toolCalls.length > 0) {
                sections.push(`toolCalls:\n${JSON.stringify(message.toolCalls, null, 2)}`);
              }

              return sections.join("\n");
            })
            .join("\n\n");
        }
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
