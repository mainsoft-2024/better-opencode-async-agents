import { DEFAULT_API_HOST, DEFAULT_API_PORT, MAX_PORT_RETRY } from "../constants";
import { deleteServerInfo, writeServerInfo } from "../storage";
import type { BackgroundTask } from "../types";
import { CORS_HEADERS, errorResponse, jsonResponse, preflightResponse } from "./cors";
import {
  type RouteManager,
  handleHealth,
  handleStats,
  handleTaskDetail,
  handleTaskGroup,
  handleTaskList,
  handleTaskLogs,
} from "./routes";
import { SSEBroadcaster, type SSEDataProvider, handleSSERequest } from "./sse";
import type { StatsResponse } from "./types";

export class StatusApiServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private broadcaster: SSEBroadcaster;
  private unsubscribe: (() => void) | null = null;
  private startedAt: string;

  private constructor(
    private manager: RouteManager & {
      onTaskEvent?: (cb: (type: string, task: BackgroundTask) => void) => () => void;
      getAllTasks: () => BackgroundTask[];
    }
  ) {
    this.broadcaster = new SSEBroadcaster();
    this.startedAt = new Date().toISOString();
  }

  /**
   * Start the API server. Returns null if disabled via env var.
   */
  static async start(manager: any): Promise<StatusApiServer | null> {
    // Check if disabled
    if (process.env.ASYNCAGENTS_API_ENABLED === "false") {
      return null;
    }

    const instance = new StatusApiServer(manager);
    await instance.bind();
    return instance;
  }

  private async bind(): Promise<void> {
    const desiredPort = Number.parseInt(
      process.env.ASYNCAGENTS_API_PORT ?? String(DEFAULT_API_PORT),
      10
    );
    const host = process.env.ASYNCAGENTS_API_HOST ?? DEFAULT_API_HOST;

    // Build the data provider for SSE
    const dataProvider: SSEDataProvider = {
      getAllTasks: () => this.manager.getAllTasks(),
      buildStats: () => this.buildStatsData(),
    };

    const broadcaster = this.broadcaster;
    const manager = this.manager;

    // Try ports with retry
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_PORT_RETRY; attempt++) {
      const port = attempt < MAX_PORT_RETRY ? desiredPort + attempt : 0; // Last attempt: OS-assigned
      try {
        this.server = Bun.serve({
          port,
          hostname: host,
          fetch(req) {
            // Handle CORS preflight
            if (req.method === "OPTIONS") {
              return preflightResponse();
            }

            const url = new URL(req.url);
            const path = url.pathname;

            // Route matching
            if (path === "/v1/health") return handleHealth(req, manager);
            if (path === "/v1/stats") return handleStats(req, manager);
            if (path === "/v1/tasks") return handleTaskList(req, manager);
            if (path === "/v1/events") return handleSSERequest(req, broadcaster, dataProvider);

            // Match /v1/tasks/:id/logs
            const logsMatch = path.match(/^\/v1\/tasks\/([^/]+)\/logs$/);
            const logsId = logsMatch?.[1];
            if (logsId) {
              return handleTaskLogs(req, manager, logsId);
            }

            // Match /v1/tasks/:id
            const taskMatch = path.match(/^\/v1\/tasks\/([^/]+)$/);
            const taskId = taskMatch?.[1];
            if (taskId) {
              return handleTaskDetail(req, manager, taskId);
            }

            // Match /v1/task-groups/:id
            const groupMatch = path.match(/^\/v1\/task-groups\/([^/]+)$/);
            const groupId = groupMatch?.[1];
            if (groupId) {
              return handleTaskGroup(req, manager, groupId);
            }

            return errorResponse("Not Found", 404);
          },
        });

        lastError = null;
        break;
      } catch (err) {
        lastError = err as Error;
        // Continue to next port
      }
    }

    if (lastError || !this.server) {
      throw new Error(
        `Failed to bind API server after ${MAX_PORT_RETRY + 1} attempts: ${lastError?.message}`
      );
    }

    // Subscribe to manager task events for SSE broadcasting
    if (this.manager.onTaskEvent) {
      this.unsubscribe = this.manager.onTaskEvent((eventType, task) => {
        this.broadcaster.broadcast(eventType as any, { task });
      });
    }

    // Write discovery file
    const port = this.server!.port!;
    const url = `http://${host}:${port}`;
    try {
      await writeServerInfo({
        port,
        pid: process.pid,
        startedAt: this.startedAt,
        url,
        version: "1.0.0",
      });
    } catch {
      // Non-fatal — discovery file is best-effort
    }
  }

  private buildStatsData(): StatsResponse {
    const tasks = this.manager.getAllTasks();
    const byStatus: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const toolCallsByName: Record<string, number> = {};
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

      if (task.status === "running" || task.status === "resumed") activeTasks++;
      if (task.startedAt && task.completedAt) {
        const d = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
        if (d > 0) durations.push(d);
      }
    }

    return {
      byStatus,
      byAgent,
      toolCallsByName,
      duration: {
        avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        max: durations.length ? Math.max(...durations) : 0,
        min: durations.length ? Math.min(...durations) : 0,
      },
      totalTasks: tasks.length,
      activeTasks,
    };
  }

  getPort(): number {
    return this.server?.port ?? 0;
  }

  getUrl(): string {
    const host = process.env.ASYNCAGENTS_API_HOST ?? DEFAULT_API_HOST;
    return `http://${host}:${this.getPort()}`;
  }

  getBroadcaster(): SSEBroadcaster {
    return this.broadcaster;
  }

  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.server) {
      this.server.stop(true); // graceful — wait for in-flight
      this.server = null;
    }
    try {
      await deleteServerInfo();
    } catch {
      // Best-effort cleanup
    }
  }
}
