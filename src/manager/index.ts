import type { PluginInput } from "@opencode-ai/plugin";
import type { BackgroundTask, LaunchInput, OpencodeClient } from "../types";
import { handleEvent, startEventSubscription } from "./events";
import {
  notifyParentSession,
  notifyResumeComplete,
  notifyResumeError,
  showProgressToast,
} from "./notifications";
import { pollRunningTasks, startPolling, stopPolling, updateTaskProgress } from "./polling";
import {
  cancelTask,
  checkAndUpdateTaskStatus,
  checkSessionExists,
  clearAllTasks,
  getTaskMessages,
  launchTask,
} from "./task-lifecycle";

/**
 * BackgroundManager class for managing background agent tasks.
 *
 * This class uses composition pattern - methods are extracted into separate files
 * that are imported and used by the main class. Private state remains in class instance.
 */
export class BackgroundManager {
  private client: OpencodeClient;
  private directory: string;
  private pollingInterval?: Timer;
  private animationFrame = 0;
  private currentBatchId: string | null = null;
  private tasks: Map<string, BackgroundTask> = new Map();
  private originalParentSessionID: string | null = null;

  constructor(ctx: PluginInput) {
    this.client = ctx.client;
    this.directory = ctx.directory;
    this.startEventSubscription();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    return launchTask(
      input,
      this.tasks,
      this.client,
      () => this.getOrCreateBatchId(),
      (sessionID) => {
        this.originalParentSessionID = sessionID;
      },
      () => this.startPolling(),
      (task) => this.notifyParentSession(task)
    );
  }

  async cancelTask(taskId: string): Promise<void> {
    return cancelTask(taskId, this.tasks, this.client);
  }

  clearAllTasks(): void {
    clearAllTasks(this.tasks, this.client, () => this.stopPolling());
    this.originalParentSessionID = null;
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  async getTaskMessages(sessionID: string): Promise<
    Array<{
      info?: { role?: string };
      parts?: Array<{ type?: string; text?: string }>;
    }>
  > {
    return getTaskMessages(sessionID, this.client);
  }

  async checkAndUpdateTaskStatus(
    task: BackgroundTask,
    skipNotification = false
  ): Promise<BackgroundTask> {
    return checkAndUpdateTaskStatus(
      task,
      this.client,
      (t) => this.notifyParentSession(t),
      skipNotification,
      (sessionID) => this.getTaskMessages(sessionID)
    );
  }

  async checkSessionExists(sessionID: string): Promise<boolean> {
    return checkSessionExists(sessionID, this.client);
  }

  async sendResumePrompt(
    task: BackgroundTask,
    message: string,
    timeoutMs: number
  ): Promise<string> {
    // Get initial message count to detect new responses
    const initialMessages = await this.getTaskMessages(task.sessionID);
    const initialAssistantCount = initialMessages.filter(
      (m) => m.info?.role === "assistant"
    ).length;

    await this.client.session.promptAsync({
      path: { id: task.sessionID },
      body: {
        agent: task.agent,
        parts: [{ type: "text", text: message }],
      },
    });

    const startTime = Date.now();
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (Date.now() - startTime < timeoutMs) {
      await delay(500);

      const statusResult = await this.client.session.status();
      const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;
      const sessionStatus = allStatuses[task.sessionID];

      // Check if session is idle OR if session isn't in status (fallback)
      const shouldCheckMessages = sessionStatus?.type === "idle" || !sessionStatus;

      if (shouldCheckMessages) {
        const messages = await this.getTaskMessages(task.sessionID);
        const assistantMessages = messages.filter((m) => m.info?.role === "assistant");

        // Check if we have a new assistant response
        if (assistantMessages.length > initialAssistantCount) {
          const lastMessage = assistantMessages[assistantMessages.length - 1];
          const textParts = lastMessage?.parts?.filter((p) => p.type === "text") ?? [];
          const textContent = textParts
            .map((p) => p.text ?? "")
            .filter((text) => text.length > 0)
            .join("\n");
          return `✓ **Resume Response** (count: ${task.resumeCount})\n\n${textContent || "(No text response)"}`;
        }

        // If session is explicitly idle but no new messages, return
        if (sessionStatus?.type === "idle") {
          return `✓ **Resume Response** (count: ${task.resumeCount})\n\n(No response found)`;
        }
      }
    }

    throw new Error(`Timeout waiting for resume response (${timeoutMs}ms)`);
  }

  async sendResumePromptAsync(
    task: BackgroundTask,
    message: string,
    toolContext: { sessionID: string; messageID: string; agent: string }
  ): Promise<void> {
    // Get initial message count to detect new responses
    const initialMessages = await this.getTaskMessages(task.sessionID);
    const initialAssistantCount = initialMessages.filter(
      (m) => m.info?.role === "assistant"
    ).length;

    this.client.session
      .promptAsync({
        path: { id: task.sessionID },
        body: {
          agent: task.agent,
          parts: [{ type: "text", text: message }],
        },
      })
      .then(async () => {
        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        let attempts = 0;
        const maxAttempts = 600;

        while (attempts < maxAttempts) {
          await delay(1000);
          attempts++;

          try {
            const statusResult = await this.client.session.status();
            const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;
            const sessionStatus = allStatuses[task.sessionID];

            // Check if session is idle OR if session isn't in status (fallback)
            const shouldCheckMessages = sessionStatus?.type === "idle" || !sessionStatus;

            if (shouldCheckMessages) {
              const messages = await this.getTaskMessages(task.sessionID);
              const assistantMessages = messages.filter((m) => m.info?.role === "assistant");

              // Check if we have a new assistant response
              if (assistantMessages.length > initialAssistantCount) {
                task.status = "completed";
                await notifyResumeComplete(
                  task,
                  this.client,
                  this.directory,
                  toolContext,
                  (sessionID) => this.getTaskMessages(sessionID)
                );
                return;
              }

              // If session is explicitly idle but no new messages, keep waiting (might still be processing)
              if (sessionStatus?.type === "idle" && attempts > 5) {
                // After 5 attempts with idle status and no new messages, consider it done
                task.status = "completed";
                await notifyResumeComplete(
                  task,
                  this.client,
                  this.directory,
                  toolContext,
                  (sessionID) => this.getTaskMessages(sessionID)
                );
                return;
              }
            }
          } catch {
            // Ignore status check errors
          }
        }

        task.status = "completed";
        await notifyResumeError(
          task,
          "Timeout waiting for response",
          this.client,
          this.directory,
          toolContext
        );
      })
      .catch(async (error) => {
        task.status = "completed";
        const errorMsg = error instanceof Error ? error.message : String(error);
        await notifyResumeError(task, errorMsg, this.client, this.directory, toolContext);
      });
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getOrCreateBatchId(): string {
    const runningTasks = this.getAllTasks().filter((t) => t.status === "running");
    const firstRunning = runningTasks[0];
    if (firstRunning?.batchId) {
      this.currentBatchId = firstRunning.batchId;
      return this.currentBatchId;
    }
    this.currentBatchId = `batch_${Date.now()}`;
    return this.currentBatchId;
  }

  private startPolling(): void {
    if (this.pollingInterval) return;
    this.pollingInterval = startPolling(this.pollingInterval, () => this.pollRunningTasks());
  }

  private stopPolling(): void {
    stopPolling(this.pollingInterval);
    this.pollingInterval = undefined;
  }

  private async pollRunningTasks(): Promise<void> {
    await pollRunningTasks(
      this.client,
      this.tasks,
      this.originalParentSessionID,
      (task) => updateTaskProgress(task, this.client),
      (task) => this.notifyParentSession(task),
      () => this.clearAllTasks(),
      () => this.stopPolling(),
      (tasks) => this.showProgressToast(tasks),
      () => this.getAllTasks(),
      (sessionID) => this.getTaskMessages(sessionID)
    );
  }

  private showProgressToast(tasks: BackgroundTask[]): void {
    showProgressToast(tasks, this.animationFrame, this.client, () => this.getAllTasks());
    this.animationFrame = (this.animationFrame + 1) % 10;
  }

  private notifyParentSession(task: BackgroundTask): void {
    notifyParentSession(task, this.client, this.directory, () => this.getAllTasks());
  }

  private startEventSubscription(): void {
    startEventSubscription(this.client, (event) =>
      handleEvent(event, {
        clearAllTasks: () => this.clearAllTasks(),
        getTasksArray: () => this.getAllTasks(),
      })
    );
  }
}
