import { type Plugin, type PluginInput, tool } from "@opencode-ai/plugin";

// =============================================================================
// Types
// =============================================================================

type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled" | "resumed";

interface TaskProgress {
  toolCalls: number;
  lastTools: string[];
  lastUpdate: string;
}

interface BackgroundTask {
  id: string;
  sessionID: string;
  parentSessionID: string;
  parentMessageID: string;
  parentAgent: string;
  description: string;
  prompt: string;
  agent: string;
  status: BackgroundTaskStatus;
  startedAt: string;
  completedAt?: string;
  resultRetrievedAt?: string;
  result?: string;
  error?: string;
  progress?: TaskProgress;
  batchId: string;
  resumeCount: number;
}

interface LaunchInput {
  description: string;
  prompt: string;
  agent: string;
  parentSessionID: string;
  parentMessageID: string;
  parentAgent: string;
}

type OpencodeClient = PluginInput["client"];

// =============================================================================
// Constants
// =============================================================================

const COMPLETION_DISPLAY_DURATION = 10000;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// =============================================================================
// Background Manager
// =============================================================================

class BackgroundManager {
  private client: OpencodeClient;
  private directory: string;
  private pollingInterval?: Timer;
  private animationFrame = 0;
  private currentBatchId: string | null = null;

  // In-memory task storage
  private tasks: Map<string, BackgroundTask> = new Map();

  // Track the original parent session ID to detect session changes
  private originalParentSessionID: string | null = null;

  constructor(ctx: PluginInput) {
    this.client = ctx.client;
    this.directory = ctx.directory;
    this.startEventSubscription();
  }

  private async startEventSubscription(): Promise<void> {
    try {
      const subscription = await this.client.event.subscribe();
      // Process events in background
      (async () => {
        for await (const event of subscription.stream) {
          this.handleEvent(event);
        }
      })().catch(() => {
        // Stream ended, try to reconnect
        setTimeout(() => this.startEventSubscription(), 1000);
      });
    } catch {
      // Failed to subscribe, retry
      setTimeout(() => this.startEventSubscription(), 1000);
    }
  }

  private getTasksArray(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): BackgroundTask[] {
    return this.getTasksArray();
  }

  private getOrCreateBatchId(): string {
    const runningTasks = this.getTasksArray().filter((t) => t.status === "running");

    const firstRunning = runningTasks[0];
    if (firstRunning?.batchId) {
      this.currentBatchId = firstRunning.batchId;
      return this.currentBatchId;
    }

    this.currentBatchId = `batch_${Date.now()}`;
    return this.currentBatchId;
  }

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    if (!input.agent || input.agent.trim() === "") {
      throw new Error("Agent parameter is required");
    }

    const createResult = await this.client.session.create({
      body: {
        parentID: input.parentSessionID,
        title: `Background: ${input.description}`,
      },
    });

    if (createResult.error) {
      throw new Error(`Failed to create background session: ${createResult.error}`);
    }

    const sessionID = createResult.data.id;
    const batchId = this.getOrCreateBatchId();

    const task: BackgroundTask = {
      id: `bg_${crypto.randomUUID().slice(0, 8)}`,
      sessionID,
      parentSessionID: input.parentSessionID,
      parentMessageID: input.parentMessageID,
      parentAgent: input.parentAgent,
      description: input.description,
      prompt: input.prompt,
      agent: input.agent,
      status: "running",
      startedAt: new Date().toISOString(),
      batchId,
      resumeCount: 0,
      progress: {
        toolCalls: 0,
        lastTools: [],
        lastUpdate: new Date().toISOString(),
      },
    };

    // Track original parent session to detect session changes
    if (!this.originalParentSessionID) {
      this.originalParentSessionID = input.parentSessionID;
    }

    this.tasks.set(task.id, task);
    this.startPolling();

    this.client.session
      .promptAsync({
        path: { id: sessionID },
        body: {
          agent: input.agent,
          tools: {
            background_task: false,
            background_output: false,
            background_cancel: false,
            background_list: false,
            background_clear: false,
          },
          parts: [{ type: "text", text: input.prompt }],
        },
      })
      .catch((error) => {
        const existingTask = this.tasks.get(task.id);
        if (existingTask) {
          existingTask.status = "error";
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("agent.name") || errorMessage.includes("undefined")) {
            existingTask.error = `Agent "${input.agent}" not found. Make sure the agent is registered.`;
          } else {
            existingTask.error = errorMessage;
          }
          existingTask.completedAt = new Date().toISOString();
          this.notifyParentSession(existingTask);
        }
      });

    return task;
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== "running") {
      throw new Error(
        `Cannot cancel task: current status is "${task.status}". Only running tasks can be cancelled.`
      );
    }

    this.client.session.abort({ path: { id: task.sessionID } }).catch(() => {});

    task.status = "cancelled";
    task.completedAt = new Date().toISOString();
  }

  async getTaskMessages(sessionID: string): Promise<
    Array<{
      info?: { role?: string };
      parts?: Array<{ type?: string; text?: string }>;
    }>
  > {
    const messagesResult = await this.client.session.messages({
      path: { id: sessionID },
    });

    if (messagesResult.error) {
      throw new Error(`Error fetching messages: ${messagesResult.error}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((messagesResult as any).data ?? messagesResult) as Array<{
      info?: { role?: string };
      parts?: Array<{ type?: string; text?: string }>;
    }>;
  }

  async checkAndUpdateTaskStatus(task: BackgroundTask): Promise<BackgroundTask> {
    if (task.status !== "running") {
      return task;
    }

    try {
      const statusResult = await this.client.session.status();
      const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;
      const sessionStatus = allStatuses[task.sessionID];

      if (sessionStatus?.type === "idle") {
        task.status = "completed";
        task.completedAt = new Date().toISOString();
        this.notifyParentSession(task);
      }
    } catch {
      // Ignore status check errors
    }

    return task;
  }

  clearAllTasks(): void {
    this.stopPolling();

    for (const task of this.tasks.values()) {
      if (task.status === "running") {
        this.client.session.abort({ path: { id: task.sessionID } }).catch(() => {});
      }
    }

    this.tasks.clear();
    this.originalParentSessionID = null;
  }

  async checkSessionExists(sessionID: string): Promise<boolean> {
    try {
      const result = await this.client.session.get({ path: { id: sessionID } });
      return !result.error && !!result.data;
    } catch {
      return false;
    }
  }

  async sendResumePrompt(
    task: BackgroundTask,
    message: string,
    timeoutMs: number
  ): Promise<string> {
    const startTime = Date.now();

    await this.client.session.promptAsync({
      path: { id: task.sessionID },
      body: {
        agent: task.agent,
        tools: {
          background_task: false,
          background_output: false,
          background_cancel: false,
          background_list: false,
          background_clear: false,
          background_resume: false,
        },
        parts: [{ type: "text", text: message }],
      },
    });

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (Date.now() - startTime < timeoutMs) {
      await delay(500);

      const statusResult = await this.client.session.status();
      const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;
      const sessionStatus = allStatuses[task.sessionID];

      if (sessionStatus?.type === "idle") {
        const messages = await this.getTaskMessages(task.sessionID);
        const assistantMessages = messages.filter((m) => m.info?.role === "assistant");
        if (assistantMessages.length > 0) {
          const lastMessage = assistantMessages[assistantMessages.length - 1];
          const textParts = lastMessage?.parts?.filter((p) => p.type === "text") ?? [];
          const textContent = textParts
            .map((p) => p.text ?? "")
            .filter((text) => text.length > 0)
            .join("\n");

          return `✓ **Resume Response** (count: ${task.resumeCount})

Task ID: \`${task.id}\`

---

${textContent || "(No text output)"}`;
        }
        return `✓ **Resume completed** (count: ${task.resumeCount}) - No response text found.`;
      }
    }

    throw new Error(`Timeout exceeded (${timeoutMs}ms) waiting for resume response`);
  }

  sendResumePromptAsync(
    task: BackgroundTask,
    message: string,
    toolContext: { sessionID: string; agent: string }
  ): void {
    this.client.session
      .promptAsync({
        path: { id: task.sessionID },
        body: {
          agent: task.agent,
          tools: {
            background_task: false,
            background_output: false,
            background_cancel: false,
            background_list: false,
            background_clear: false,
            background_resume: false,
          },
          parts: [{ type: "text", text: message }],
        },
      })
      .then(() => {
        this.waitForResumeCompletion(task, toolContext);
      })
      .catch((error) => {
        task.status = "completed";
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.notifyResumeError(task, errorMessage, toolContext);
      });
  }

  private waitForResumeCompletion(
    task: BackgroundTask,
    toolContext: { sessionID: string; agent: string }
  ): void {
    const checkStatus = async () => {
      try {
        const statusResult = await this.client.session.status();
        const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;
        const sessionStatus = allStatuses[task.sessionID];

        if (sessionStatus?.type === "idle") {
          task.status = "completed";
          this.notifyResumeComplete(task, toolContext);
        } else {
          setTimeout(checkStatus, 500);
        }
      } catch {
        task.status = "completed";
        this.notifyResumeError(task, "Error checking session status", toolContext);
      }
    };

    setTimeout(checkStatus, 500);
  }

  private async notifyResumeComplete(
    task: BackgroundTask,
    toolContext: { sessionID: string; agent: string }
  ): Promise<void> {
    try {
      const messages = await this.getTaskMessages(task.sessionID);
      const assistantMessages = messages.filter((m) => m.info?.role === "assistant");
      let responsePreview = "(No response)";

      if (assistantMessages.length > 0) {
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        const textParts = lastMessage?.parts?.filter((p) => p.type === "text") ?? [];
        const textContent = textParts
          .map((p) => p.text ?? "")
          .filter((text) => text.length > 0)
          .join("\n");
        responsePreview = textContent.slice(0, 500) + (textContent.length > 500 ? "..." : "");
      }

      const notification = `[BACKGROUND RESUME COMPLETED] Task "${task.description}" resume #${task.resumeCount} finished. Use background_output(task_id="${task.id}") for full response.\n\nPreview:\n${responsePreview}`;

      await this.client.session.prompt({
        path: { id: toolContext.sessionID },
        body: {
          agent: toolContext.agent,
          parts: [{ type: "text", text: notification }],
        },
        query: { directory: this.directory },
      });
    } catch {
      // Ignore notification errors
    }
  }

  private async notifyResumeError(
    task: BackgroundTask,
    errorMessage: string,
    toolContext: { sessionID: string; agent: string }
  ): Promise<void> {
    try {
      const notification = `[BACKGROUND RESUME FAILED] Task "${task.description}" resume #${task.resumeCount} failed: ${errorMessage}`;

      await this.client.session.prompt({
        path: { id: toolContext.sessionID },
        body: {
          agent: toolContext.agent,
          parts: [{ type: "text", text: notification }],
        },
        query: { directory: this.directory },
      });
    } catch {
      // Ignore notification errors
    }
  }

  handleEvent(event: {
    type: string;
    properties?: Record<string, unknown>;
  }): void {
    const props = event.properties;

    // Debug: log all events to understand what's being received
    // console.log("[background-agent] Event received:", event.type, JSON.stringify(props));

    // Clear on session.new, prompt.clear, or session.interrupt (ESC key)
    if (event.type === "tui.command.execute") {
      const command = props?.command as string | undefined;
      if (
        command === "session.new" ||
        command === "prompt.clear" ||
        command === "session.interrupt"
      ) {
        this.clearAllTasks();
        return;
      }
    }

    // Clear if parent session is deleted
    if (event.type === "session.deleted") {
      const info = props?.info as { id?: string } | undefined;
      if (!info?.id) return;

      // Check if this is a parent session being deleted
      const affectedTasks = this.getTasksArray().filter((t) => t.parentSessionID === info.id);
      if (affectedTasks.length > 0) {
        this.clearAllTasks();
        return;
      }

      // Also handle if it's a background task's session
      const task = this.getTasksArray().find((t) => t.sessionID === info.id);
      if (!task) return;

      if (task.status === "running") {
        task.status = "cancelled";
        task.completedAt = new Date().toISOString();
        task.error = "Session deleted";
      }
      return;
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined;
      if (!sessionID) return;

      const task = this.getTasksArray().find((t) => t.sessionID === sessionID);
      if (!task || task.status !== "running") return;

      task.status = "completed";
      task.completedAt = new Date().toISOString();
      this.notifyParentSession(task);
    }

    if (event.type === "session.deleted") {
      const info = props?.info as { id?: string } | undefined;
      if (!info?.id) return;

      const task = this.getTasksArray().find((t) => t.sessionID === info.id);
      if (!task) return;

      if (task.status === "running") {
        task.status = "cancelled";
        task.completedAt = new Date().toISOString();
        task.error = "Session deleted";
      }
    }
  }

  private startPolling(): void {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(() => {
      this.pollRunningTasks();
    }, 100);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  private async pollRunningTasks(): Promise<void> {
    try {
      const statusResult = await this.client.session.status();
      const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;

      const now = Date.now();

      // Check if any parent session no longer exists - if so, clear all tasks
      // Only check after tasks have been running for at least 3 seconds (grace period)
      const runningTasks = this.getTasksArray().filter((t) => t.status === "running");
      const oldestRunningTask = runningTasks.reduce((oldest, t) => {
        const startTime = new Date(t.startedAt).getTime();
        return startTime < oldest ? startTime : oldest;
      }, Date.now());
      const taskAge = now - oldestRunningTask;

      if (taskAge > 3000 && this.originalParentSessionID) {
        try {
          // Check if parent session still exists
          const parentSession = await this.client.session.get({
            path: { id: this.originalParentSessionID },
          });
          if (parentSession.error || !parentSession.data) {
            this.clearAllTasks();
            return;
          }
        } catch {
          // Error checking sessions - parent might be deleted
          this.clearAllTasks();
          return;
        }
      }

      for (const task of this.tasks.values()) {
        if (task.status !== "running") continue;

        const sessionStatus = allStatuses[task.sessionID];

        if (!sessionStatus) {
          await this.updateTaskProgress(task);
          continue;
        }

        if (sessionStatus.type === "idle") {
          task.status = "completed";
          task.completedAt = new Date().toISOString();
          this.notifyParentSession(task);
          continue;
        }

        await this.updateTaskProgress(task);
      }

      // Check if any running tasks remain
      const hasRunningTasks = this.getTasksArray().some((t) => t.status === "running");

      // Clean up old completed tasks when no running tasks (only after result retrieved)
      if (!hasRunningTasks) {
        for (const [taskId, task] of this.tasks) {
          if (task.status !== "running" && task.completedAt) {
            if (
              task.resultRetrievedAt &&
              now - new Date(task.resultRetrievedAt).getTime() > COMPLETION_DISPLAY_DURATION
            ) {
              this.tasks.delete(taskId);
            }
          }
        }
      }

      // Check if we should continue polling
      const hasActiveOrRecentTasks = this.getTasksArray().some((t) => {
        if (t.status === "running") return true;
        if (t.completedAt) {
          const completedTime = new Date(t.completedAt).getTime();
          return now - completedTime <= COMPLETION_DISPLAY_DURATION;
        }
        return false;
      });

      if (!hasActiveOrRecentTasks) {
        this.stopPolling();
        return;
      }

      this.showProgressToast(this.getTasksArray());
    } catch {
      // Ignore polling errors
    }
  }

  private async updateTaskProgress(task: BackgroundTask): Promise<void> {
    try {
      const messagesResult = await this.client.session.messages({
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

  private showProgressToast(allTasks: BackgroundTask[]): void {
    if (allTasks.length === 0) return;

    const now = Date.now();
    const runningTasks = allTasks.filter((t) => t.status === "running");
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
    const batchTasks = allTasks.filter((t) => t.batchId === activeBatchId);
    const totalTasks = batchTasks.length;
    const finishedCount = batchTasks.filter(
      (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
    ).length;

    this.animationFrame = (this.animationFrame + 1) % SPINNER_FRAMES.length;
    const spinner = SPINNER_FRAMES[this.animationFrame];

    const totalToolCalls = batchTasks.reduce((sum, t) => sum + (t.progress?.toolCalls ?? 0), 0);

    const taskLines: string[] = [];
    const shortId = (id: string) => id.slice(-8);

    const batchRunning = runningTasks.filter((t) => t.batchId === activeBatchId);
    for (const task of batchRunning) {
      const duration = this.formatDuration(new Date(task.startedAt));
      const tools = task.progress?.lastTools?.slice(-3) ?? [];
      let toolsStr = "";
      if (tools.length > 0) {
        const lastTool = tools[tools.length - 1];
        const prevTools = tools.slice(0, -1);
        toolsStr =
          prevTools.length > 0 ? ` - ${prevTools.join(" > ")} > ｢${lastTool}｣` : ` - ｢${lastTool}｣`;
      }
      taskLines.push(
        `${spinner} [${shortId(task.id)}] ${task.agent}: ${task.description} (${duration})${toolsStr}`
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
      const duration = this.formatDuration(
        new Date(task.startedAt),
        task.completedAt ? new Date(task.completedAt) : undefined
      );
      const icon = task.status === "completed" ? "✓" : task.status === "error" ? "✗" : "⊘";
      taskLines.push(
        `${icon} [${shortId(task.id)}] ${task.agent}: ${task.description} (${duration})`
      );
    }

    const hiddenCount = batchCompleted.length - visibleCompleted.length;
    if (hiddenCount > 0) {
      taskLines.push(`   ... and ${hiddenCount} more finished`);
    }

    const progressPercent = totalTasks > 0 ? Math.round((finishedCount / totalTasks) * 100) : 0;
    const barLength = 10;
    const filledLength = Math.round((finishedCount / Math.max(totalTasks, 1)) * barLength);
    const progressBar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

    const summary = `[${progressBar}] ${finishedCount}/${totalTasks} agents (${progressPercent}%) | ${totalToolCalls} tool calls`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tuiClient = this.client as any;

    if (!tuiClient.tui?.showToast) return;

    const hasRunning = runningTasks.filter((t) => t.batchId === activeBatchId).length > 0;
    const title = hasRunning ? `${spinner} Background Tasks` : `✓ Background Tasks Complete`;
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

  private notifyParentSession(task: BackgroundTask): void {
    const duration = this.formatDuration(
      new Date(task.startedAt),
      task.completedAt ? new Date(task.completedAt) : undefined
    );
    const statusText =
      task.status === "completed" ? "COMPLETED" : task.status === "error" ? "FAILED" : "CANCELLED";

    // Calculate batch progress
    const batchTasks = this.getTasksArray().filter((t) => t.batchId === task.batchId);
    const totalTasks = batchTasks.length;
    const completedTasks = batchTasks.filter(
      (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
    ).length;
    const runningTasks = batchTasks.filter((t) => t.status === "running").length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tuiClient = this.client as any;
    if (tuiClient.tui?.showToast) {
      tuiClient.tui
        .showToast({
          body: {
            title: `Background Task ${statusText}`,
            message: `Task "${task.description}" finished in ${duration}. Batch: ${completedTasks}/${totalTasks} complete, ${runningTasks} still running.`,
            variant: task.status === "completed" ? "success" : "error",
            duration: 5000,
          },
        })
        .catch(() => {});
    }

    const leftoverWarning =
      runningTasks > 0
        ? "WATCH OUT for leftover tasks, you will likely WANT to wait for all tasks to complete."
        : "";
    const message = `[BACKGROUND TASK ${statusText}] Task "${task.description}" finished in ${duration}. Batch progress: ${completedTasks}/${totalTasks} tasks complete, ${runningTasks} still running. If you need results immediately, use background_output(task_id="${task.id}"). Otherwise, continue working or just say 'waiting' and halt.${leftoverWarning ? " " + leftoverWarning : ""}`;

    setTimeout(async () => {
      try {
        const sessionInfo = await this.client.session.get({
          path: { id: task.parentSessionID },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agent = (sessionInfo.data as any)?.agent || task.agent;

        await this.client.session.prompt({
          path: { id: task.parentSessionID },
          body: {
            agent: task.parentAgent,
            parts: [{ type: "text", text: message }],
          },
          query: { directory: this.directory },
        });
      } catch {
        // Ignore notification errors
      }
    }, 200);
  }

  private formatDuration(start: Date, end?: Date): string {
    const duration = (end ?? new Date()).getTime() - start.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

// =============================================================================
// Tool Helpers
// =============================================================================

function formatDuration(startStr: string, endStr?: string): string {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  const duration = end.getTime() - start.getTime();
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function getStatusIcon(status: BackgroundTaskStatus): string {
  switch (status) {
    case "running":
      return "⏳";
    case "completed":
      return "✓";
    case "error":
      return "✗";
    case "cancelled":
      return "⊘";
    case "resumed":
      return "↻";
  }
}

function formatTaskStatus(task: BackgroundTask): string {
  const duration = formatDuration(task.startedAt, task.completedAt);
  const promptPreview = truncateText(task.prompt, 500);
  const icon = getStatusIcon(task.status);

  let progressSection = "";
  if (task.progress?.lastTools && task.progress.lastTools.length > 0) {
    progressSection = `\n| Last tools | ${task.progress.lastTools.join(" → ")} |`;
  }

  let statusNote = "";
  if (task.status === "running") {
    statusNote = `\n\n> ⏳ **Running**: Task is still in progress. Check back later for results.`;
  } else if (task.status === "error") {
    statusNote = `\n\n> ✗ **Failed**: ${task.error || "Unknown error"}`;
  } else if (task.status === "cancelled") {
    statusNote = `\n\n> ⊘ **Cancelled**: Task was cancelled before completion.`;
  }

  return `# ${icon} Task Status

| Field | Value |
|-------|-------|
| Task ID | \`${task.id}\` |
| Description | ${task.description} |
| Agent | ${task.agent} |
| Status | ${icon} **${task.status}** |
| Duration | ${duration} |
| Session ID | \`${task.sessionID}\` |${progressSection}
${statusNote}
## Original Prompt

\`\`\`
${promptPreview}
\`\`\``;
}

async function formatTaskResult(task: BackgroundTask, manager: BackgroundManager): Promise<string> {
  try {
    const messages = await manager.getTaskMessages(task.sessionID);

    if (!Array.isArray(messages) || messages.length === 0) {
      return `✓ **Task Completed**

| Field | Value |
|-------|-------|
| Task ID | \`${task.id}\` |
| Description | ${task.description} |
| Duration | ${formatDuration(task.startedAt, task.completedAt)} |
| Session ID | \`${task.sessionID}\` |

---

(No messages found)`;
    }

    const assistantMessages = messages.filter((m) => m.info?.role === "assistant");

    if (assistantMessages.length === 0) {
      return `✓ **Task Completed**

| Field | Value |
|-------|-------|
| Task ID | \`${task.id}\` |
| Description | ${task.description} |
| Duration | ${formatDuration(task.startedAt, task.completedAt)} |
| Session ID | \`${task.sessionID}\` |

---

(No assistant response found)`;
    }

    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const textParts = lastMessage?.parts?.filter((p) => p.type === "text") ?? [];
    const textContent = textParts
      .map((p) => p.text ?? "")
      .filter((text) => text.length > 0)
      .join("\n");

    return `✓ **Task Completed**

| Field | Value |
|-------|-------|
| Task ID | \`${task.id}\` |
| Description | ${task.description} |
| Duration | ${formatDuration(task.startedAt, task.completedAt)} |
| Session ID | \`${task.sessionID}\` |

---

${textContent || "(No text output)"}`;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return `Task Result

Task ID: ${task.id}
Description: ${task.description}
Duration: ${formatDuration(task.startedAt, task.completedAt)}
Session ID: ${task.sessionID}

---

Error fetching messages: ${errMsg}`;
  }
}

// =============================================================================
// Tool Factories
// =============================================================================

function createBackgroundTask(manager: BackgroundManager) {
  return tool({
    description: `Launch a background agent task that runs asynchronously.

The task runs in a separate session while you continue with other work.

Use this for:
- Long-running research tasks
- Complex analysis that doesn't need immediate results
- Parallel workloads to maximize throughput

Arguments:
- description: Short task description (shown in status)
- prompt: Full detailed prompt for the agent
- agent: Agent type to use (any registered agent)

IMPORTANT: You'll be informed when each task is complete.DO NOT assume all tasks were done, check again if all agents you need are complete.

Returns immediately with task ID. The task will run in background and notify you when complete.
Optionally use \`background_output\` later if you need to check results manually with or without blocking.`,
    args: {
      description: tool.schema
        .string()
        // .describe("Short task description (shown in status)")
        .nonoptional(),
      prompt: tool.schema
        .string()
        // .describe("Full detailed prompt for the agent")
        .nonoptional(),
      agent: tool.schema
        .string()
        // .describe("Agent type to use (any registered agent)")
        .nonoptional(),
    },
    async execute(args: { description: string; prompt: string; agent: string }, toolContext) {
      if (!args.agent || args.agent.trim() === "") {
        return `Agent parameter is required. Specify which agent to use.`;
      }

      try {
        const task = await manager.launch({
          description: args.description,
          prompt: args.prompt,
          agent: args.agent.trim(),
          parentSessionID: toolContext.sessionID,
          parentMessageID: toolContext.messageID,
          parentAgent: toolContext.agent,
        });

        return `⏳ **Background task launched**
Task ID: \`${task.id}\`
Session ID: \`${task.sessionID}\`

Task will run in background. You'll be notified when complete. Use \`background_output\` with task_id=\`${task.id}\` to get results.`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Failed to launch background task: ${message}`;
      }
    },
  });
}

function createBackgroundOutput(manager: BackgroundManager) {
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
      task_id: tool.schema
        // .describe("Task ID to get output from"),
        .string(),
      block: tool.schema
        .boolean()
        // .describe("Wait for completion (default: false)")
        .nonoptional(),
      timeout: tool.schema
        .number()
        // .describe("Max wait time in ms (default: 60000, max: 600000)")
        .optional(),
    },
    async execute(args: {
      task_id: string;
      block?: boolean;
      timeout?: number;
    }) {
      try {
        let task = manager.getTask(args.task_id);
        if (!task) {
          return `Task not found: ${args.task_id}`;
        }

        task = await manager.checkAndUpdateTaskStatus(task);

        const shouldBlock = args.block === true;
        const timeoutMs = Math.min(args.timeout ?? 60000, 600000);

        if (task.status === "completed") {
          if (!task.resultRetrievedAt) {
            task.resultRetrievedAt = new Date().toISOString();
          }
          return await formatTaskResult(task, manager);
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

          currentTask = await manager.checkAndUpdateTaskStatus(currentTask);

          if (currentTask.status === "completed") {
            if (!currentTask.resultRetrievedAt) {
              currentTask.resultRetrievedAt = new Date().toISOString();
            }
            return await formatTaskResult(currentTask, manager);
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

function createBackgroundCancel(manager: BackgroundManager) {
  return tool({
    description: `Cancel a running background task.

Only works for tasks with status "running". Aborts the background session and marks the task as cancelled.

Arguments:
- task_id: Required task ID to cancel.`,
    args: {
      task_id: tool.schema.string(),
      // .describe("Task ID to cancel"),
    },
    async execute(args: { task_id: string }) {
      try {
        const task = manager.getTask(args.task_id);
        if (!task) {
          return `Task not found: ${args.task_id}`;
        }

        await manager.cancelTask(args.task_id);

        return `⊘ **Task cancelled**

Task ID: \`${task.id}\`
Description: ${task.description}
Session ID: \`${task.sessionID}\`
Status: ⊘ cancelled`;
      } catch (error) {
        return `Error cancelling task: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

function createBackgroundResume(manager: BackgroundManager) {
  return tool({
    description: `Resume a completed background task with a follow-up message.

Sends a new prompt to the subagent session and retrieves the response.
Only completed tasks can be resumed. The task's conversation history is preserved.

Arguments:
- task_id: Required task ID to resume
- message: Follow-up prompt to send (same format as background_task prompt)
- block: If true, wait for response. If false (default), return immediately and notify on completion.
- timeout: Max wait time in ms when blocking (default: 60000, max: 600000)

Returns:
- When blocking: Waits for response, then returns only the new response
- When not blocking: Returns immediately, notifies parent session when response is ready`,
    args: {
      task_id: tool.schema.string().nonoptional(),
      message: tool.schema.string().nonoptional(),
      block: tool.schema.boolean().optional(),
      timeout: tool.schema.number().optional(),
    },
    async execute(
      args: { task_id: string; message: string; block?: boolean; timeout?: number },
      toolContext
    ) {
      const task = manager.getTask(args.task_id);
      if (!task) {
        return `Task not found: ${args.task_id}`;
      }

      if (task.status === "resumed") {
        return `Task is currently being resumed. Wait for completion before sending another message.`;
      }

      if (task.status !== "completed") {
        return `Cannot resume task: status is "${task.status}". Only completed tasks can be resumed.`;
      }

      const shouldBlock = args.block === true;
      const timeoutMs = Math.min(args.timeout ?? 60000, 600000);

      task.status = "resumed";
      task.resumeCount++;

      try {
        const sessionCheck = await manager.checkSessionExists(task.sessionID);
        if (!sessionCheck) {
          task.status = "completed";
          return `Session expired or was deleted. Start a new background_task to continue.`;
        }

        if (shouldBlock) {
          const response = await manager.sendResumePrompt(task, args.message, timeoutMs);
          task.status = "completed";
          return response;
        }

        manager.sendResumePromptAsync(task, args.message, toolContext);
        return `⏳ **Resume initiated**
Task ID: \`${task.id}\`
Resume count: ${task.resumeCount}

Follow-up prompt sent. You'll be notified when the response is ready.`;
      } catch (error) {
        task.status = "completed";
        const message = error instanceof Error ? error.message : String(error);
        return `Error resuming task: ${message}`;
      }
    },
  });
}

function createBackgroundClear(manager: BackgroundManager) {
  return tool({
    description: `Clear and abort all background tasks immediately.

Use this to stop all running background agents and clear the task list.
This is useful when you want to start fresh or cancel all pending work.`,
    args: {},
    async execute() {
      try {
        const tasks = manager.getAllTasks();
        const runningCount = tasks.filter((t) => t.status === "running").length;
        const totalCount = tasks.length;

        manager.clearAllTasks();

        if (totalCount === 0) {
          return `No background tasks to clear.`;
        }

        return `✓ **Cleared all background tasks**

Running tasks aborted: ${runningCount}
Total tasks cleared: ${totalCount}`;
      } catch (error) {
        return `Error clearing tasks: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

function createBackgroundList(manager: BackgroundManager) {
  return tool({
    description: `List all background tasks.

Shows all running, completed, error, and cancelled background tasks with their status.

Arguments:
- status: Optional filter by status ("running", "completed", "error", "cancelled").`,
    args: {
      status: tool.schema.string().optional().describe("Filter by status"),
    },
    async execute(args: { status?: string }) {
      try {
        let tasks = manager.getAllTasks();

        if (args.status) {
          tasks = tasks.filter((t) => t.status === args.status?.toLowerCase());
        }

        if (tasks.length === 0) {
          return args.status
            ? `No background tasks found with status "${args.status}".`
            : `No background tasks found.`;
        }

        tasks.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

        const header = `# Background Tasks

| Task ID | Description | Agent | Status | Duration |
|---------|-------------|-------|--------|----------|`;

        const rows = tasks
          .map((task) => {
            const duration = formatDuration(task.startedAt, task.completedAt);
            const desc =
              task.description.length > 30
                ? task.description.slice(0, 27) + "..."
                : task.description;
            const icon = getStatusIcon(task.status);
            return `| \`${task.id}\` | ${desc} | ${task.agent} | ${icon} ${task.status} | ${duration} |`;
          })
          .join("\n");

        const running = tasks.filter((t) => t.status === "running").length;
        const completed = tasks.filter((t) => t.status === "completed").length;
        const errored = tasks.filter((t) => t.status === "error").length;
        const cancelled = tasks.filter((t) => t.status === "cancelled").length;

        return `${header}
${rows}

---
**Total: ${tasks.length}** | ⏳ ${running} running | ✓ ${completed} completed | ✗ ${errored} error | ⊘ ${cancelled} cancelled`;
      } catch (error) {
        return `Error listing tasks: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

// =============================================================================
// Plugin Export
// =============================================================================

const BackgroundAgentPlugin: Plugin = async (ctx) => {
  const manager = new BackgroundManager(ctx);

  return {
    tool: {
      background_task: createBackgroundTask(manager),
      background_output: createBackgroundOutput(manager),
      background_cancel: createBackgroundCancel(manager),
      background_resume: createBackgroundResume(manager),
      background_list: createBackgroundList(manager),
      background_clear: createBackgroundClear(manager),
    },

    event: async (input) => {
      manager.handleEvent(input.event);
    },
  };
};

export default BackgroundAgentPlugin;
