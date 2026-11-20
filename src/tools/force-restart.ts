import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { shortId } from "../helpers";
import { TOOL_DESCRIPTIONS } from "../prompts";
import type { BackgroundTask, FilteredMessage, MessageFilter, RestartHistoryEntry } from "../types";
import { STUCK_MAX_RESTART_ATTEMPTS } from "../constants";

/**
 * Creates the bgagent_force_restart tool for manually restarting a stuck or failed task.
 * @param manager - Manager instance with task access and launch capability
 * @returns Tool definition for bgagent_force_restart
 */
export function createBackgroundForceRestart(manager: {
  getTask(taskId: string): BackgroundTask | undefined;
  getAllTasks(): BackgroundTask[];
  launch(input: {
    description: string;
    prompt: string;
    agent: string;
    parentSessionID: string;
    parentMessageID: string;
    parentAgent: string;
    fork?: boolean;
  }): Promise<BackgroundTask>;
  getFilteredMessages(sessionID: string, filter: MessageFilter): Promise<FilteredMessage[]>;
  emitTaskEvent(eventType: string, task: BackgroundTask): void;
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundForceRestart,
    args: {
      task_id: tool.schema.string().nonoptional(),
    },
    async execute(args: { task_id: string }) {
      try {
        const oldTask = manager.getTask(args.task_id);
        if (!oldTask) {
          return JSON.stringify({ success: false, reason: "task_not_found", taskId: args.task_id });
        }

        // Check max restart attempts
        const currentRestartCount = oldTask.restartCount ?? 0;
        const maxAttempts = oldTask.maxRestartAttempts ?? STUCK_MAX_RESTART_ATTEMPTS;
        if (currentRestartCount >= maxAttempts) {
          return JSON.stringify({
            success: false,
            reason: "max_attempts_exceeded",
            taskId: shortId(oldTask.sessionID),
            restartCount: currentRestartCount,
            maxAttempts,
          });
        }

        // Fetch last 10 messages from old task for context
        let contextSummary = "";
        try {
          const messages = await manager.getFilteredMessages(oldTask.sessionID, {
            fullSession: true,
            includeThinking: false,
            messageLimit: 10,
          });
          if (messages.length > 0) {
            const msgLines = messages
              .map((m: FilteredMessage) => {
                const roleLabel = m.role === "assistant" ? "Agent" : "User";
                const text =
                  typeof m.content === "string"
                    ? m.content
                    : Array.isArray(m.content)
                      ? (m.content as Array<{ type: string; text?: string }>)
                          .filter((p) => p.type === "text")
                          .map((p) => p.text ?? "")
                          .join("")
                      : "";
                return text ? `[${roleLabel}]: ${text.slice(0, 500)}` : null;
              })
              .filter(Boolean)
              .join("\n");
            if (msgLines) {
              contextSummary = `\n\n--- Recent context from previous run ---\n${msgLines}\n--- End context ---`;
            }
          }
        } catch {
          // Context fetch failed — proceed without it
        }

        // Build restart prompt with original prompt + context
        const newRestartCount = currentRestartCount + 1;
        const restartPrompt = [
          `[FORCE RESTART - Attempt ${newRestartCount}/${maxAttempts}]`,
          `Original task: ${oldTask.description}`,
          contextSummary,
          `Original task prompt:\n${oldTask.prompt}`,
        ]
          .filter(Boolean)
          .join("\n");

        // Launch new task
        const newTask = await manager.launch({
          description: oldTask.description,
          prompt: restartPrompt,
          agent: oldTask.agent,
          parentSessionID: oldTask.parentSessionID,
          parentMessageID: oldTask.parentMessageID,
          parentAgent: oldTask.parentAgent,
          fork: oldTask.isForked,
        });

        // Build restart history entry
        const historyEntry: RestartHistoryEntry = {
          timestamp: Date.now(),
          reason: "force-restart",
          previousTaskId: oldTask.sessionID,
        };

        // Update new task metadata (mutate in-place — task is a reference in the Map)
        newTask.restartCount = newRestartCount;
        newTask.originalTaskId = oldTask.originalTaskId ?? oldTask.sessionID;
        newTask.restartHistory = [...(oldTask.restartHistory ?? []), historyEntry];
        newTask.autoRestart = oldTask.autoRestart ?? true;
        newTask.stuckTimeoutSeconds = oldTask.stuckTimeoutSeconds ?? 120;
        newTask.maxRestartAttempts = maxAttempts;

        // Mark old task as force-restarted
        oldTask.status = "force-restarted";
        oldTask.completedAt = new Date().toISOString();

        // Emit task.restarted event
        manager.emitTaskEvent("task.restarted", newTask);

        return JSON.stringify({
          status: "restarted",
          oldTaskId: shortId(oldTask.sessionID),
          newTaskId: shortId(newTask.sessionID),
          restartCount: newRestartCount,
        });
      } catch (error) {
        return `Error restarting task: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}