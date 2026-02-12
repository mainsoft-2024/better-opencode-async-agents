import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { BackgroundTask } from "../../types";
import { StatusApiServer } from "../index";

// =============================================================================
// Test Fixtures
// =============================================================================

const mockTasks: BackgroundTask[] = [
  {
    sessionID: "ses_test1",
    parentSessionID: "ses_parent",
    parentMessageID: "msg_001",
    parentAgent: "root",
    description: "Explore codebase",
    prompt: "Search for files",
    agent: "explore",
    status: "completed",
    startedAt: "2026-02-10T10:00:00.000Z",
    completedAt: "2026-02-10T10:01:00.000Z",
    batchId: "batch_1",
    progress: {
      toolCalls: 5,
      lastTools: ["read", "grep"],
      lastUpdate: "2026-02-10T10:01:00.000Z",
      toolCallsByName: { read: 3, grep: 2 },
    },
    isForked: false,
    resumeCount: 0,
    result: "Found 42 files",
  },
  {
    sessionID: "ses_test2",
    parentSessionID: "ses_parent",
    parentMessageID: "msg_002",
    parentAgent: "root",
    description: "Plan implementation",
    prompt: "Create a plan",
    agent: "plan",
    status: "running",
    startedAt: "2026-02-10T10:02:00.000Z",
    batchId: "batch_1",
    progress: {
      toolCalls: 3,
      lastTools: ["read"],
      lastUpdate: "2026-02-10T10:02:30.000Z",
      toolCallsByName: { read: 3 },
    },
    isForked: true,
    resumeCount: 0,
  },
  {
    sessionID: "ses_test3",
    parentSessionID: "ses_parent",
    parentMessageID: "msg_003",
    parentAgent: "root",
    description: "Fix error handling",
    prompt: "Debug the error",
    agent: "programmer",
    status: "error",
    startedAt: "2026-02-10T10:03:00.000Z",
    completedAt: "2026-02-10T10:04:00.000Z",
    batchId: "batch_2",
    progress: {
      toolCalls: 2,
      lastTools: ["edit"],
      lastUpdate: "2026-02-10T10:04:00.000Z",
      toolCallsByName: { edit: 2 },
    },
    error: "Session expired",
    isForked: false,
    resumeCount: 1,
  },
];

// =============================================================================
// Event Callback Registry for Mock Manager
// =============================================================================

const eventCallbacks: Array<(type: string, task: BackgroundTask) => void> = [];

function emitTaskEvent(type: string, task: BackgroundTask): void {
  for (const cb of eventCallbacks) {
    cb(type, task);
  }
}

// =============================================================================
// Mock Manager
// =============================================================================

const mockManager = {
  getAllTasks: () => mockTasks,
  getTask: (id: string) => mockTasks.find((t) => t.sessionID === id),
  getTaskMessages: async (_id: string) => [
    { role: "assistant", content: "test result" },
    { role: "user", content: "follow up" },
  ],
  onTaskEvent: (cb: (type: string, task: BackgroundTask) => void) => {
    eventCallbacks.push(cb);
    return () => {
      const idx = eventCallbacks.indexOf(cb);
      if (idx !== -1) eventCallbacks.splice(idx, 1);
    };
  },
};

// =============================================================================
// SSE Parsing Helper
// =============================================================================

function parseSSEFrame(text: string): { event: string; data: unknown } | null {
  const eventMatch = text.match(/event: (.+)/);
  const dataMatch = text.match(/data: (.+)/);
  if (!eventMatch || !dataMatch) return null;
  try {
    return { event: eventMatch[1], data: JSON.parse(dataMatch[1]) };
  } catch {
    return { event: eventMatch[1], data: dataMatch[1] };
  }
}

async function* sseIterator(
  response: Response,
  signal: AbortSignal
): AsyncGenerator<{ event: string; data: unknown }> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by double newlines
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? ""; // Keep incomplete frame in buffer

      for (const frame of frames) {
        if (!frame.trim()) continue;
        const parsed = parseSSEFrame(frame);
        if (parsed) yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe("StatusApiServer Integration", () => {
  let server: StatusApiServer;
  let baseUrl: string;

  beforeAll(async () => {
    // Use OS-assigned port to avoid conflicts
    process.env.ASYNCAGENTS_API_PORT = "0";
    process.env.ASYNCAGENTS_API_HOST = "127.0.0.1";

    const srv = await StatusApiServer.start(mockManager);
    if (!srv) throw new Error("Failed to start server");
    server = srv;
    baseUrl = server.getUrl();
  });

  afterAll(async () => {
    await server.stop();
    // Clean up env
    Reflect.deleteProperty(process.env, "ASYNCAGENTS_API_PORT");
    Reflect.deleteProperty(process.env, "ASYNCAGENTS_API_HOST");
  });

  // =============================================================================
  // Health Endpoint
  // =============================================================================

  describe("GET /v1/health", () => {
    test("returns 200 with health status", async () => {
      const response = await fetch(`${baseUrl}/v1/health`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe("ok");
      expect(body.taskCount).toBe(3);
      expect(body.version).toBe("1.0.0");
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    test("includes CORS headers", async () => {
      const response = await fetch(`${baseUrl}/v1/health`);

      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain("GET");
      expect(response.headers.get("content-type")).toBe("application/json");
    });
  });

  // =============================================================================
  // Stats Endpoint
  // =============================================================================

  describe("GET /v1/stats", () => {
    test("returns aggregated statistics", async () => {
      const response = await fetch(`${baseUrl}/v1/stats`);

      expect(response.status).toBe(200);

      const body = await response.json();

      // Check byStatus breakdown
      expect(body.byStatus).toEqual({
        completed: 1,
        running: 1,
        error: 1,
      });

      // Check byAgent breakdown
      expect(body.byAgent).toEqual({
        explore: 1,
        plan: 1,
        programmer: 1,
      });

      // Check active tasks count
      expect(body.activeTasks).toBe(1); // only "running" counts as active

      // Check totals
      expect(body.totalTasks).toBe(3);

      // Check duration stats (only completed task ses_test1 has both startedAt and completedAt)
      expect(body.duration.avg).toBeGreaterThan(0); // 60 seconds in ms
      expect(body.duration.max).toBe(body.duration.avg); // only one completed task
      expect(body.duration.min).toBe(body.duration.avg);

      // Check toolCallsByName aggregation
      expect(body.toolCallsByName).toEqual({
        read: 6, // 3 from ses_test1 + 3 from ses_test2
        grep: 2, // 2 from ses_test1
        edit: 2, // 2 from ses_test3
      });
    });
  });

  // =============================================================================
  // Task List Endpoint
  // =============================================================================

  describe("GET /v1/tasks", () => {
    test("returns paginated task list", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.tasks).toHaveLength(3);
      expect(body.total).toBe(3);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
    });

    test("filters by status", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks?status=running`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.total).toBe(1);
      expect(body.tasks[0].agent).toBe("plan");
    });

    test("filters by agent", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks?agent=explore`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.total).toBe(1);
      expect(body.tasks[0].agent).toBe("explore");
    });

    test("searches in description and prompt", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks?search=error`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.total).toBe(1);
      expect(body.tasks[0].description).toBe("Fix error handling");
    });

    test("supports pagination with limit and offset", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks?limit=1&offset=1`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.tasks).toHaveLength(1);
      expect(body.total).toBe(3); // total unchanged
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(1);
    });
  });

  // =============================================================================
  // Task Detail Endpoint
  // =============================================================================

  describe("GET /v1/tasks/:id", () => {
    test("returns task details for valid ID", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks/ses_test1`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.sessionID).toBe("ses_test1");
      expect(body.agent).toBe("explore");
      expect(body.status).toBe("completed");
    });

    test("returns 404 for unknown task ID", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks/ses_unknown`);

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Task not found");
    });
  });

  // =============================================================================
  // Task Logs Endpoint
  // =============================================================================

  describe("GET /v1/tasks/:id/logs", () => {
    test("returns task messages for valid ID", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks/ses_test1/logs`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.taskId).toBe("ses_test1");
      expect(body.messages).toBeArray();
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("assistant");
      expect(body.retrievedAt).toBeString();
    });

    test("returns 404 for unknown task ID", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks/ses_unknown/logs`);

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Task not found");
    });
  });

  // =============================================================================
  // Task Group Endpoint
  // =============================================================================

  describe("GET /v1/task-groups/:id", () => {
    test("returns task group for valid batch ID", async () => {
      const response = await fetch(`${baseUrl}/v1/task-groups/batch_1`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.groupId).toBe("batch_1");
      expect(body.tasks).toHaveLength(2);
      expect(body.stats.total).toBe(2);
      expect(body.stats.completed).toBe(1);
      expect(body.stats.running).toBe(1);
      expect(body.stats.completionRate).toBe(0.5);
    });

    test("returns 404 for unknown batch ID", async () => {
      const response = await fetch(`${baseUrl}/v1/task-groups/unknown`);

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Task group not found");
    });
  });

  // =============================================================================
  // CORS Preflight
  // =============================================================================

  describe("OPTIONS /v1/tasks", () => {
    test("returns 204 with CORS headers", async () => {
      const response = await fetch(`${baseUrl}/v1/tasks`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    });
  });

  // =============================================================================
  // SSE Stream
  // =============================================================================

  describe("GET /v1/events (SSE)", () => {
    test("sends initial snapshot on connect", async () => {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/v1/events`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");

      // Read first event (snapshot)
      const events: Array<{ event: string; data: unknown }> = [];
      for await (const event of sseIterator(response, controller.signal)) {
        events.push(event);
        if (events.length >= 1) break;
      }

      controller.abort();

      expect(events[0].event).toBe("snapshot");
      const snapshot = events[0].data as { tasks: unknown[]; stats: unknown };
      expect(snapshot.tasks).toHaveLength(3);
      expect(snapshot.stats).toBeDefined();
    });

    test("broadcasts task events to connected clients", async () => {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/v1/events`, {
        signal: controller.signal,
      });

      // Read first event (snapshot)
      const events: Array<{ event: string; data: unknown }> = [];
      const readPromise = (async () => {
        for await (const event of sseIterator(response, controller.signal)) {
          events.push(event);
          if (events.length >= 2) break;
        }
      })();

      // Small delay to ensure connection is established
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Emit a task event through the mock manager
      const updatedTask: BackgroundTask = {
        ...mockTasks[1],
        status: "completed",
        completedAt: new Date().toISOString(),
      };
      emitTaskEvent("task.updated", updatedTask);

      // Wait for the event to be received
      await Promise.race([
        readPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout waiting for SSE events")), 2000)
        ),
      ]);

      controller.abort();

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].event).toBe("snapshot");
      expect(events[1].event).toBe("task.updated");
      const delta = events[1].data as { task: BackgroundTask };
      expect(delta.task.sessionID).toBe("ses_test2");
      expect(delta.task.status).toBe("completed");
    });

    test("handles abort and cleans up subscribers", async () => {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/v1/events`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(response.body).toBeDefined();

      const reader = response.body!.getReader();

      // Read one event to verify stream is working
      const decoder = new TextDecoder();
      let buffer = "";
      let eventReceived = false;

      // Read until we get a complete SSE event
      while (!eventReceived) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Check if we have a complete event (ends with \n\n)
        if (buffer.includes("\n\n")) {
          eventReceived = true;
          const parsed = parseSSEFrame(buffer.split("\n\n")[0]);
          expect(parsed).not.toBeNull();
          expect(parsed!.event).toBe("snapshot");
        }
      }

      expect(eventReceived).toBe(true);

      // Abort the connection - should not throw
      controller.abort();
      reader.releaseLock();

      // Wait a moment for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });
});
