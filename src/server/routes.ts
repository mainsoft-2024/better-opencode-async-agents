import { DEFAULT_TASK_LIMIT, MAX_TASK_LIMIT } from "../constants";
import type { BackgroundTask, MessageFilter, FilteredMessage } from "../types";
import { errorResponse, jsonResponse } from "./cors";
import type {
  HealthResponse,
  InfoResponse,
  PaginatedTasksResponse,
  StatsResponse,
  TaskGroupResponse,
  TaskLogsResponse,
  MessagesResponse,
  InstancesResponse,
}from "./types";

// =============================================================================
// Route Manager Interface
// =============================================================================

/** Interface for the subset of BackgroundManager methods routes need */
export interface RouteManager {
  getAllTasks(): BackgroundTask[];
  getTask(id: string): BackgroundTask | undefined;
  getTaskMessages(sessionID: string): Promise<Array<unknown>>;
  getFilteredMessages(sessionID: string, filter: MessageFilter): Promise<FilteredMessage[]>;
  cancelTask(taskId: string): Promise<void>;
  launch(input: any): Promise<BackgroundTask>;
  sendResumePromptAsync(task: BackgroundTask, message: string, toolContext: any): Promise<void>;
  emitTaskEvent(eventType: string, task: BackgroundTask): void;
  persistTask?(task: BackgroundTask): Promise<void>;
}

// =============================================================================
// Health & Stats
// =============================================================================

const startTime = Date.now();

export function handleHealth(_req: Request, manager: RouteManager): Response {
  const tasks = manager.getAllTasks();
  const body: HealthResponse = {
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: "1.0.0", // can be read from package.json later
    taskCount: tasks.length,
  };
  return jsonResponse(body);
}

export function handleStats(_req: Request, manager: RouteManager): Response {
  const tasks = manager.getAllTasks();

  const byStatus: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  const toolCallsByName: Record<string, number> = {};
  const toolCallsByAgent: Record<string, number> = {};
  const durations: number[] = [];
  let activeTasks = 0;

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    byAgent[task.agent] = (byAgent[task.agent] ?? 0) + 1;

    // Aggregate tool calls by name
    if (task.progress?.toolCallsByName) {
      for (const [toolName, count] of Object.entries(task.progress.toolCallsByName)) {
        toolCallsByName[toolName] = (toolCallsByName[toolName] ?? 0) + count;
      }
    }

    // Aggregate tool calls by agent
    const agentToolCalls = task.progress?.toolCalls ?? 0;
    if (agentToolCalls > 0) {
      toolCallsByAgent[task.agent] = (toolCallsByAgent[task.agent] ?? 0) + agentToolCalls;
    }

    if (task.status === "running" || task.status === "resumed") {
      activeTasks++;
    }

    // Calculate duration for completed tasks
    if (task.startedAt && task.completedAt) {
      const duration = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
      if (duration > 0) durations.push(duration);
    }
  }

  const body: StatsResponse = {
    byStatus,
    byAgent,
    toolCallsByName,
    toolCallsByAgent,
    duration: {
      avg: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      max: durations.length > 0 ? Math.max(...durations) : 0,
      min: durations.length > 0 ? Math.min(...durations) : 0,
    },
    totalTasks: tasks.length,
    activeTasks,
  };
  return jsonResponse(body);
}

// =============================================================================
// Task List
// =============================================================================

export function handleTaskList(req: Request, manager: RouteManager): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const agent = url.searchParams.get("agent");
  const search = url.searchParams.get("search");
  const sortParam = url.searchParams.get("sort") ?? "startedAt:desc";
  let limit = Number.parseInt(url.searchParams.get("limit") ?? String(DEFAULT_TASK_LIMIT), 10);
  let offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);

  // Clamp values
  if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_TASK_LIMIT;
  if (limit > MAX_TASK_LIMIT) limit = MAX_TASK_LIMIT;
  if (Number.isNaN(offset) || offset < 0) offset = 0;

  let tasks = manager.getAllTasks();

  // Filter by status
  if (status) {
    tasks = tasks.filter((t) => t.status === status);
  }

  // Filter by agent
  if (agent) {
    tasks = tasks.filter((t) => t.agent === agent);
  }

  // Search in description and prompt (case-insensitive)
  if (search) {
    const searchLower = search.toLowerCase();
    tasks = tasks.filter(
      (t) =>
        t.description.toLowerCase().includes(searchLower) ||
        t.prompt?.toLowerCase().includes(searchLower)
    );
  }

  // Sort
  const [sortField, sortDir] = sortParam.split(":");
  const direction = sortDir === "asc" ? 1 : -1;

  // Type-safe field access
  type SortableFields = keyof BackgroundTask;
  const safeSortField = (sortField as SortableFields) ?? "startedAt";

  tasks.sort((a, b) => {
    const aVal = a[safeSortField] ?? "";
    const bVal = b[safeSortField] ?? "";
    if (aVal < bVal) return -1 * direction;
    if (aVal > bVal) return 1 * direction;
    return 0;
  });

  const total = tasks.length;
  tasks = tasks.slice(offset, offset + limit);

  const body: PaginatedTasksResponse = { tasks, total, limit, offset };
  return jsonResponse(body);
}

// =============================================================================
// Task Detail
// =============================================================================

export function handleTaskDetail(req: Request, manager: RouteManager, id: string): Response {
  const task = manager.getTask(id);
  if (!task) {
    return errorResponse("Task not found", 404);
  }
  return jsonResponse(task);
}

// =============================================================================
// Task Logs
// =============================================================================

export async function handleTaskLogs(
  req: Request,
  manager: RouteManager,
  id: string
): Promise<Response> {
  const task = manager.getTask(id);
  if (!task) {
    return errorResponse("Task not found", 404);
  }

  const messages = await manager.getTaskMessages(id);
  const body: TaskLogsResponse = {
    messages,
    taskId: id,
    retrievedAt: new Date().toISOString(),
  };
  return jsonResponse(body);
}

// =============================================================================
// Task Messages / Instances
// =============================================================================

export async function handleTaskMessages(
  req: Request,
  manager: RouteManager,
  taskId: string
): Promise<Response> {
  const task = manager.getTask(taskId);
  if (!task) {
    return errorResponse("Task not found", 404);
  }

  const url = new URL(req.url);
  const parseOptionalInt = (value: string | null): number | undefined => {
    if (value === null) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const filter: MessageFilter = {
    fullSession: url.searchParams.get("full_session") === "true",
    includeThinking: url.searchParams.get("include_thinking") === "true",
    includeToolResults: url.searchParams.get("include_tool_results") === "true",
    sinceMessageId: url.searchParams.get("since_message_id") ?? undefined,
    messageLimit: parseOptionalInt(url.searchParams.get("message_limit")),
    thinkingMaxChars: parseOptionalInt(url.searchParams.get("thinking_max_chars")),
  };

  const messages = await manager.getFilteredMessages(task.sessionID, filter);
  const body: MessagesResponse = {
    messages,
    taskId: task.sessionID,
    filter,
  };
  return jsonResponse(body);
}

export async function handleInstances(_req: Request, discovery: any): Promise<Response> {
  const instances = await discovery.discover();
  const body: InstancesResponse = {
    instances,
    discoveredAt: new Date().toISOString(),
  };
  return jsonResponse(body);
}

// =============================================================================
// Task Group
// =============================================================================

export function handleTaskGroup(req: Request, manager: RouteManager, groupId: string): Response {
  const allTasks = manager.getAllTasks();
  const groupTasks = allTasks.filter((t) => t.batchId === groupId);

  if (groupTasks.length === 0) {
    return errorResponse("Task group not found", 404);
  }

  let completed = 0;
  let running = 0;
  let error = 0;
  let cancelled = 0;
  let totalToolCalls = 0;
  const toolCallsByName: Record<string, number> = {};
  const toolCallsByAgent: Record<string, number> = {};
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = 0;

  for (const t of groupTasks) {
    if (t.status === "completed") completed++;
    else if (t.status === "running" || t.status === "resumed") running++;
    else if (t.status === "error") error++;
    else if (t.status === "cancelled") cancelled++;

    totalToolCalls += t.progress?.toolCalls || 0;

    // Aggregate tool calls by name
    if (t.progress?.toolCallsByName) {
      for (const [toolName, count] of Object.entries(t.progress.toolCallsByName)) {
        toolCallsByName[toolName] = (toolCallsByName[toolName] ?? 0) + count;
      }
    }

    // Aggregate tool calls by agent
    const agentToolCalls = t.progress?.toolCalls ?? 0;
    if (agentToolCalls > 0) {
      toolCallsByAgent[t.agent] = (toolCallsByAgent[t.agent] ?? 0) + agentToolCalls;
    }

    if (t.startedAt) {
      const s = new Date(t.startedAt).getTime();
      if (s < minStart) minStart = s;
    }
    if (t.completedAt) {
      const e = new Date(t.completedAt).getTime();
      if (e > maxEnd) maxEnd = e;
    }
  }

  const total = groupTasks.length;
  const duration = minStart < Number.POSITIVE_INFINITY && maxEnd > 0 ? maxEnd - minStart : 0;

  const body: TaskGroupResponse = {
    groupId,
    tasks: groupTasks,
    stats: {
      completed,
      running,
      error,
      cancelled,
      total,
      completionRate: total > 0 ? completed / total : 0,
      totalToolCalls,
      toolCallsByName,
      toolCallsByAgent,
      duration,
    },
  };
  return jsonResponse(body);
}


// =============================================================================
// Info
// =============================================================================

export function handleInfo(_req: Request, instanceMeta: InfoResponse): Response {
  return jsonResponse(instanceMeta);
}

// =============================================================================
// POST Route Handlers
// =============================================================================

export async function handleTaskRestart(
  req: Request,
  manager: RouteManager,
  id: string
): Promise<Response> {
  const task = manager.getTask(id);
  if (!task) {
    return errorResponse("Task not found", 404);
  }

  const { STUCK_MAX_RESTART_ATTEMPTS } = await import("../constants");
  const currentRestartCount = task.restartCount ?? 0;
  const maxAttempts = task.maxRestartAttempts ?? STUCK_MAX_RESTART_ATTEMPTS;
  if (currentRestartCount >= maxAttempts) {
    return errorResponse(
      `Max restart attempts (${maxAttempts}) exceeded for task ${id}`,
      400
    );
  }

  const messages = await manager.getFilteredMessages(task.sessionID, {
    fullSession: true,
    includeThinking: false,
    messageLimit: 10,
  });

  const newRestartCount = currentRestartCount + 1;
  const contextSummary = messages
    .map((m: any) => `[${m.role ?? m.type}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`.slice(0, 500))
    .join("\n");

  const restartPrompt = `[FORCE RESTART - Attempt ${newRestartCount}/${maxAttempts}]\n\nOriginal task: ${task.description}\n\nLast context:\n${contextSummary}\n\nPlease continue or restart the work from the beginning if needed.`;

  const newTask = await manager.launch({
    description: task.description,
    prompt: restartPrompt,
    agent: task.agent,
    parentSessionID: task.parentSessionID,
    parentMessageID: task.parentMessageID,
    parentAgent: task.parentAgent,
    batchId: task.batchId,
    isForked: task.isForked,
  });

  newTask.restartCount = newRestartCount;
  newTask.originalTaskId = task.originalTaskId ?? task.sessionID;
  newTask.restartHistory = [
    ...(task.restartHistory ?? []),
    {
      timestamp: Date.now(),
      reason: "force-restart" as const,
      previousTaskId: task.sessionID,
    },
  ];
  newTask.autoRestart = task.autoRestart;
  newTask.stuckTimeoutSeconds = task.stuckTimeoutSeconds;
  newTask.maxRestartAttempts = task.maxRestartAttempts;

  task.status = "force-restarted";
  manager.emitTaskEvent("task.restarted", newTask);

  if (manager.persistTask) {
    await manager.persistTask(task);
    await manager.persistTask(newTask);
  }

  return jsonResponse({
    status: "restarted",
    oldTaskId: id,
    newTaskId: newTask.sessionID,
    restartCount: newRestartCount,
  });
}

export async function handleTaskResume(
  req: Request,
  manager: RouteManager,
  id: string
): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const message = body?.message;
  if (!message || typeof message !== "string" || message.trim() === "") {
    return errorResponse("Missing required field: message", 400);
  }

  const task = manager.getTask(id);
  if (!task) {
    return errorResponse("Task not found", 404);
  }

  const resumableStatuses = ["running", "resumed", "stuck"];
  if (!resumableStatuses.includes(task.status)) {
    return errorResponse(
      `Task cannot be resumed in status: ${task.status}`,
      400
    );
  }

  // Fire-and-forget
  manager.sendResumePromptAsync(task, message.trim(), {
    sessionID: "dashboard",
    messageID: "dashboard-resume",
    agent: "dashboard",
  }).catch(() => {});

  return jsonResponse({ status: "resumed" });
}

export async function handleTaskCancel(
  req: Request,
  manager: RouteManager,
  id: string
): Promise<Response> {
  const task = manager.getTask(id);
  if (!task) {
    return errorResponse("Task not found", 404);
  }

  const cancellableStatuses = ["running", "resumed", "stuck"];
  if (!cancellableStatuses.includes(task.status)) {
    return errorResponse(
      `Task cannot be cancelled in status: ${task.status}`,
      400
    );
  }

  await manager.cancelTask(id);

  return jsonResponse({ status: "cancelled" });
}