import type { BackgroundTask, LaunchInput, OpencodeClient } from "../types";

/**
 * Launch a new background task.
 *
 * Creates a new session for the task and starts it asynchronously.
 * The task is added to the tasks Map and polling is started.
 */
export async function launchTask(
  input: LaunchInput,
  tasks: Map<string, BackgroundTask>,
  client: OpencodeClient,
  getOrCreateBatchId: () => string,
  setOriginalParentSessionID: (sessionID: string | null) => void,
  startPolling: () => void,
  notifyParentSession: (task: BackgroundTask) => void
): Promise<BackgroundTask> {
  if (!input.agent || input.agent.trim() === "") {
    throw new Error("Agent parameter is required");
  }

  const createResult = await client.session.create({
    body: {
      parentID: input.parentSessionID,
      title: `Background: ${input.description}`,
    },
  });

  if (createResult.error) {
    throw new Error(`Failed to create background session: ${createResult.error}`);
  }

  const sessionID = createResult.data.id;
  const batchId = getOrCreateBatchId();

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
  setOriginalParentSessionID(input.parentSessionID);

  tasks.set(task.id, task);
  startPolling();

  client.session
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
      const existingTask = tasks.get(task.id);
      if (existingTask) {
        existingTask.status = "error";
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("agent.name") || errorMessage.includes("undefined")) {
          existingTask.error = `Agent "${input.agent}" not found. Make sure the agent is registered.`;
        } else {
          existingTask.error = errorMessage;
        }
        existingTask.completedAt = new Date().toISOString();
        notifyParentSession(existingTask);
      }
    });

  return task;
}

/**
 * Cancel a running task.
 *
 * Aborts the background session and marks the task as cancelled.
 */
export async function cancelTask(
  taskId: string,
  tasks: Map<string, BackgroundTask>,
  client: OpencodeClient
): Promise<void> {
  const task = tasks.get(taskId);

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  if (task.status !== "running") {
    throw new Error(
      `Cannot cancel task: current status is "${task.status}". Only running tasks can be cancelled.`
    );
  }

  client.session.abort({ path: { id: task.sessionID } }).catch(() => {});

  task.status = "cancelled";
  task.completedAt = new Date().toISOString();
}

/**
 * Get messages from a task's session.
 */
export async function getTaskMessages(
  sessionID: string,
  client: OpencodeClient
): Promise<
  Array<{
    info?: { role?: string };
    parts?: Array<{ type?: string; text?: string }>;
  }>
> {
  const messagesResult = await client.session.messages({
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

/**
 * Check and update task status.
 *
 * If the task's session is idle, marks the task as completed and notifies the parent session.
 * Uses a fallback mechanism: if session status isn't in the response, checks for assistant
 * messages to detect completion (session might have finished and no longer appear in status).
 *
 * @param skipNotification - If true, skip sending notification to parent session.
 *   Use this when the parent is blocked waiting for a tool result (e.g., background_output with block=true).
 * @param getTaskMessages - Function to get messages from a session (for fallback detection).
 */
export async function checkAndUpdateTaskStatus(
  task: BackgroundTask,
  client: OpencodeClient,
  notifyParentSession: (task: BackgroundTask) => void,
  skipNotification = false,
  getTaskMessages?: (
    sessionID: string
  ) => Promise<Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>>
): Promise<BackgroundTask> {
  if (task.status !== "running") {
    return task;
  }

  try {
    const statusResult = await client.session.status();
    const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;
    const sessionStatus = allStatuses[task.sessionID];

    if (sessionStatus?.type === "idle") {
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      if (!skipNotification) {
        notifyParentSession(task);
      }
      return task;
    }

    // Fallback: if session isn't in the status response, it may have completed.
    // Check if there are assistant messages (indicating the agent responded and finished).
    if (!sessionStatus && getTaskMessages) {
      try {
        const messages = await getTaskMessages(task.sessionID);
        const hasAssistantResponse = messages.some(
          (m) =>
            m.info?.role === "assistant" &&
            m.parts?.some((p) => p.type === "text" && p.text && p.text.length > 0)
        );

        if (hasAssistantResponse) {
          task.status = "completed";
          task.completedAt = new Date().toISOString();
          if (!skipNotification) {
            notifyParentSession(task);
          }
        }
      } catch {
        // Ignore fallback check errors
      }
    }
  } catch {
    // Ignore status check errors
  }

  return task;
}

/**
 * Clear all tasks.
 *
 * Stops polling, aborts all running sessions, and clears the tasks Map.
 */
export function clearAllTasks(
  tasks: Map<string, BackgroundTask>,
  client: OpencodeClient,
  stopPolling: () => void
): void {
  stopPolling();

  for (const task of tasks.values()) {
    if (task.status === "running") {
      client.session.abort({ path: { id: task.sessionID } }).catch(() => {});
    }
  }

  tasks.clear();
}

/**
 * Check if a session exists.
 */
export async function checkSessionExists(
  sessionID: string,
  client: OpencodeClient
): Promise<boolean> {
  try {
    const result = await client.session.get({ path: { id: sessionID } });
    return !result.error && !!result.data;
  } catch {
    return false;
  }
}
