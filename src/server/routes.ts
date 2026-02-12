import { DEFAULT_TASK_LIMIT, MAX_TASK_LIMIT } from "../constants";
import type { BackgroundTask } from "../types";
import { errorResponse, jsonResponse } from "./cors";
import type {
  HealthResponse,
  PaginatedTasksResponse,
  StatsResponse,
  TaskGroupResponse,
  TaskLogsResponse,
} from "./types";

// =============================================================================
// Route Manager Interface
// =============================================================================

/** Interface for the subset of BackgroundManager methods routes need */
export interface RouteManager {
  getAllTasks(): BackgroundTask[];
  getTask(id: string): BackgroundTask | undefined;
  getTaskMessages(sessionID: string): Promise<Array<unknown>>;
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
