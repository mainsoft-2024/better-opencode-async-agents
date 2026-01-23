import type { PluginInput } from "@opencode-ai/plugin";
import { setTaskStatus } from "../helpers";
import { SUCCESS_MESSAGES } from "../prompts";
import { getPersistedTask, loadTasks, saveTask } from "../storage";
import type { BackgroundTask, LaunchInput, OpencodeClient, PersistedTask } from "../types";
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
    // Load persisted tasks asynchronously (fire and forget on startup)
    this.loadPersistedTasks();
  }

  /**
   * Loads persisted tasks from disk on startup.
   * Only loads metadata - full task state is reconstructed lazily.
   */
  private async loadPersistedTasks(): Promise<void> {
    try {
      const persisted = await loadTasks();
      // Note: We don't load into memory on startup to keep memory lean.
      // Tasks are loaded lazily via getTask() when needed.
      // This just validates the file is readable.
      console.log(`[opencode-background-task MANAGER] Loaded ${Object.keys(persisted).length} persisted tasks from disk`);
    } catch {
      // Ignore load errors - file may not exist yet
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    const task = await launchTask(
      input,
      this.tasks,
      this.client,
      () => this.getOrCreateBatchId(),
      (sessionID) => {
        this.originalParentSessionID = sessionID;
      },
      () => this.startPolling(),
      (t) => this.notifyParentSession(t)
    );

    // Persist task to disk
    await this.persistTask(task);

    return task;
  }

  /**
   * Persists a task to disk storage.
   * Public for use by resume operations.
   */
  async persistTask(task: BackgroundTask): Promise<void> {
    const persisted: PersistedTask = {
      description: task.description,
      agent: task.agent,
      parentSessionID: task.parentSessionID,
      createdAt: task.startedAt,
      status: task.status,
      resumeCount: task.resumeCount,
    };
    try {
      await saveTask(task.sessionID, persisted);
    } catch {
      // Log but don't fail - persistence is best-effort
      console.warn(`[opencode-background-task MANAGER] Failed to persist task ${task.sessionID}`);
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    return cancelTask(taskId, this.tasks, this.client);
  }

  /**
   * Clears all tasks from memory (for UI cleanup).
   * Does NOT delete from disk - tasks remain resumable.
   */
  clearAllTasks(): void {
    clearAllTasks(this.tasks, this.client, () => this.stopPolling());
    this.originalParentSessionID = null;
    // Note: Does NOT delete from disk per design doc
  }

  /**
   * Permanently deletes a task from both memory and disk.
   * Use for explicit cleanup when task is no longer needed.
   */
  async deleteTask(sessionID: string): Promise<void> {
    // Remove from memory
    this.tasks.delete(sessionID);

    // Remove from disk
    try {
      const { deletePersistedTask } = await import("../storage");
      await deletePersistedTask(sessionID);
    } catch {
      // Ignore deletion errors
    }
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Finds all tasks matching a given prefix.
   * Returns tasks sorted by creation time (most recent first).
   */
  findTasksByPrefix(prefix: string): BackgroundTask[] {
    const matching: BackgroundTask[] = [];
    for (const [id] of this.tasks) {
      if (id.startsWith(prefix)) {
        const task = this.tasks.get(id);
        if (task) {
          matching.push(task);
        }
      }
    }
    // Sort by most recent first
    return matching.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  /**
   * Resolves a task ID or prefix to a full session ID (memory only).
   * Accepts full ID, short ID, or any unique prefix.
   * On ambiguous prefix, returns most recently created task.
   * @returns Full session ID or null if not found
   */
  resolveTaskId(idOrPrefix: string): string | null {
    // Direct lookup first (exact match)
    if (this.tasks.has(idOrPrefix)) {
      return idOrPrefix;
    }

    // Prefix matching
    const matching = this.findTasksByPrefix(idOrPrefix);
    if (matching.length === 0) {
      return null;
    }

    // Return most recent if multiple matches (design decision 3)
    const firstMatch = matching[0];
    return firstMatch ? firstMatch.sessionID : null;
  }

  /**
   * Resolves a task ID or prefix to a full session ID, checking disk if not in memory.
   * Use this for resume operations where task may have been cleaned from memory.
   * @returns Full session ID or null if not found
   */
  async resolveTaskIdWithFallback(idOrPrefix: string): Promise<string | null> {
    // First try memory
    const memoryResult = this.resolveTaskId(idOrPrefix);
    if (memoryResult) {
      return memoryResult;
    }

    // Check disk for persisted tasks
    try {
      const persisted = await loadTasks();
      const persistedIds = Object.keys(persisted);

      // Direct match on disk
      if (persistedIds.includes(idOrPrefix)) {
        return idOrPrefix;
      }

      // Prefix matching on disk
      const matching = persistedIds
        .filter((id) => id.startsWith(idOrPrefix))
        .map((id) => ({ id, task: persisted[id] }))
        .filter(
          (item): item is { id: string; task: NonNullable<typeof item.task> } =>
            item.task !== undefined
        )
        .sort(
          (a, b) => new Date(b.task.createdAt).getTime() - new Date(a.task.createdAt).getTime()
        );

      if (matching.length > 0 && matching[0]) {
        return matching[0].id;
      }
    } catch {
      // Ignore disk read errors
    }

    return null;
  }

  /**
   * Gets a task, checking disk if not in memory.
   * Use this for operations that need to work with persisted tasks.
   */
  async getTaskWithFallback(id: string): Promise<BackgroundTask | undefined> {
    // First check memory
    const memoryTask = this.tasks.get(id);
    if (memoryTask) {
      return memoryTask;
    }

    // Check disk
    try {
      const persisted = await getPersistedTask(id);
      if (persisted) {
        // Reconstruct a minimal BackgroundTask from persisted data
        // Note: Some fields won't be available (prompt, parentMessageID, etc.)
        const task: BackgroundTask = {
          sessionID: id,
          parentSessionID: persisted.parentSessionID,
          parentMessageID: "", // Not persisted
          parentAgent: "", // Not persisted
          description: persisted.description,
          prompt: "", // Not persisted
          agent: persisted.agent,
          status: persisted.status,
          startedAt: persisted.createdAt,
          batchId: "", // Not persisted
          resumeCount: persisted.resumeCount ?? 0,
        };
        // Add to memory cache
        this.tasks.set(id, task);
        return task;
      }
    } catch {
      // Ignore disk read errors
    }

    return undefined;
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
    const previousStatus = task.status;
    const updatedTask = await checkAndUpdateTaskStatus(
      task,
      this.client,
      (t) => this.notifyParentSession(t),
      skipNotification,
      (sessionID) => this.getTaskMessages(sessionID)
    );

    // Persist status change to disk
    if (updatedTask.status !== previousStatus) {
      await this.persistTask(updatedTask);
    }

    return updatedTask;
  }

  async checkSessionExists(sessionID: string): Promise<boolean> {
    return checkSessionExists(sessionID, this.client);
  }

  /**
   * Wait for a single task to complete (used by background_output with block=true).
   * Returns the task or null if not found.
   */
  async waitForTask(taskId: string, timeoutMs: number): Promise<BackgroundTask | null> {
    const results = await this.waitForTasks([taskId], timeoutMs);
    return results.get(taskId) ?? null;
  }

  /**
   * Wait for multiple tasks to complete (used by background_block tool).
   * Returns a Map of task_id -> task (or null if not found).
   */
  async waitForTasks(
    taskIds: string[],
    timeoutMs: number
  ): Promise<Map<string, BackgroundTask | null>> {
    const results = new Map<string, BackgroundTask | null>();
    const startTime = Date.now();
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (Date.now() - startTime < timeoutMs) {
      let allDone = true;

      for (const taskId of taskIds) {
        const task = this.tasks.get(taskId);
        if (!task) {
          results.set(taskId, null);
          continue;
        }

        // Check if task is done (completed, error, or cancelled)
        if (task.status === "completed" || task.status === "error" || task.status === "cancelled") {
          results.set(taskId, task);
        } else {
          allDone = false;
        }
      }

      if (allDone) {
        break;
      }

      await delay(500);
    }

    // Fill in any remaining tasks
    for (const taskId of taskIds) {
      if (!results.has(taskId)) {
        results.set(taskId, this.tasks.get(taskId) ?? null);
      }
    }

    return results;
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
          return SUCCESS_MESSAGES.resumeResponse(task.resumeCount, textContent);
        }

        // If session is explicitly idle but no new messages, return
        if (sessionStatus?.type === "idle") {
          return SUCCESS_MESSAGES.resumeResponseNoContent(task.resumeCount);
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
                setTaskStatus(task, "completed");
                await this.persistTask(task);
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
                setTaskStatus(task, "completed");
                await this.persistTask(task);
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

        setTaskStatus(task, "completed");
        await this.persistTask(task);
        await notifyResumeError(
          task,
          "Timeout waiting for response",
          this.client,
          this.directory,
          toolContext
        );
      })
      .catch(async (error) => {
        setTaskStatus(task, "completed");
        await this.persistTask(task);
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
      (sessionID) => this.getTaskMessages(sessionID),
      (task) => void this.persistTask(task)
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
        notifyParentSession: (task) => this.notifyParentSession(task),
        persistTask: (task) => void this.persistTask(task),
      })
    );
  }
}
