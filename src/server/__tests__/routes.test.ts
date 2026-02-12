import { describe, expect, mock, test } from "bun:test";
import { DEFAULT_TASK_LIMIT, MAX_TASK_LIMIT } from "../../constants";
import type { BackgroundTask } from "../../types";
import {
  type RouteManager,
  handleHealth,
  handleStats,
  handleTaskDetail,
  handleTaskGroup,
  handleTaskList,
  handleTaskLogs,
} from "../routes";

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: `ses_${Math.random().toString(36).substring(2, 10)}`,
  parentSessionID: "ses_parent123",
  parentMessageID: "msg_parent123",
  parentAgent: "parent-agent",
  description: "Test task description",
  prompt: "Test prompt content",
  agent: "explore",
  status: "running",
  startedAt: new Date("2024-01-01T10:00:00Z").toISOString(),
  batchId: "batch_test123",
  resumeCount: 0,
  isForked: false,
  ...overrides,
});

const createMockManager = (tasks: BackgroundTask[] = []): RouteManager => ({
  getAllTasks: () => tasks,
  getTask: (id: string) => tasks.find((t) => t.sessionID === id),
  getTaskMessages: mock(() => Promise.resolve([{ role: "assistant", content: "result" }])),
});

// =============================================================================
// Health Endpoint Tests
// =============================================================================

describe("handleHealth", () => {
  test("returns ok status", async () => {
    const manager = createMockManager();
    const request = new Request("http://localhost:5165/health");

    const response = handleHealth(request, manager);
    const body = await response.json();

    expect(body.status).toBe("ok");
  });

  test("returns version", async () => {
    const manager = createMockManager();
    const request = new Request("http://localhost:5165/health");

    const response = handleHealth(request, manager);
    const body = await response.json();

    expect(body.version).toBe("1.0.0");
  });

  test("returns task count", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1" }),
      createMockTask({ sessionID: "ses_2" }),
      createMockTask({ sessionID: "ses_3" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/health");

    const response = handleHealth(request, manager);
    const body = await response.json();

    expect(body.taskCount).toBe(3);
  });

  test("returns zero for empty task list", async () => {
    const manager = createMockManager();
    const request = new Request("http://localhost:5165/health");

    const response = handleHealth(request, manager);
    const body = await response.json();

    expect(body.taskCount).toBe(0);
  });

  test("returns uptime in seconds", async () => {
    const manager = createMockManager();
    const request = new Request("http://localhost:5165/health");

    const response = handleHealth(request, manager);
    const body = await response.json();

    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Stats Endpoint Tests
// =============================================================================

describe("handleStats", () => {
  test("computes byStatus correctly", async () => {
    const tasks = [
      createMockTask({ status: "running" }),
      createMockTask({ status: "running" }),
      createMockTask({ status: "completed" }),
      createMockTask({ status: "error" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.byStatus).toEqual({
      running: 2,
      completed: 1,
      error: 1,
    });
  });

  test("computes byAgent correctly", async () => {
    const tasks = [
      createMockTask({ agent: "explore" }),
      createMockTask({ agent: "explore" }),
      createMockTask({ agent: "programmer" }),
      createMockTask({ agent: "tester" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.byAgent).toEqual({
      explore: 2,
      programmer: 1,
      tester: 1,
    });
  });

  test("counts active tasks (running or resumed)", async () => {
    const tasks = [
      createMockTask({ status: "running" }),
      createMockTask({ status: "running" }),
      createMockTask({ status: "resumed" }),
      createMockTask({ status: "completed" }),
      createMockTask({ status: "error" }),
      createMockTask({ status: "cancelled" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.activeTasks).toBe(3);
  });

  test("returns totalTasks count", async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => createMockTask({ sessionID: `ses_${i}` }));
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.totalTasks).toBe(10);
  });

  test("computes duration stats for completed tasks", async () => {
    const tasks = [
      createMockTask({
        status: "completed",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:00:30Z", // 30 seconds
      }),
      createMockTask({
        status: "completed",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:01:00Z", // 60 seconds
      }),
      createMockTask({
        status: "completed",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:01:30Z", // 90 seconds
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.duration.min).toBe(30000); // 30 seconds in ms
    expect(body.duration.max).toBe(90000); // 90 seconds in ms
    expect(body.duration.avg).toBe(60000); // 60 seconds average
  });

  test("returns zero duration stats when no completed tasks", async () => {
    const tasks = [createMockTask({ status: "running" }), createMockTask({ status: "running" })];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.duration).toEqual({ avg: 0, max: 0, min: 0 });
  });

  test("ignores tasks without completedAt", async () => {
    const tasks = [
      createMockTask({
        status: "completed",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:00:30Z",
      }),
      createMockTask({
        status: "running",
        startedAt: "2024-01-01T10:00:00Z",
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.duration.avg).toBe(30000);
    expect(body.duration.min).toBe(30000);
    expect(body.duration.max).toBe(30000);
  });

  test("computes toolCallsByName aggregated across all tasks", async () => {
    const tasks = [
      createMockTask({
        status: "completed",
        progress: {
          toolCalls: 5,
          lastTools: ["read", "grep"],
          lastUpdate: new Date().toISOString(),
          toolCallsByName: { read: 3, grep: 2 },
        },
      }),
      createMockTask({
        status: "running",
        progress: {
          toolCalls: 3,
          lastTools: ["read", "edit"],
          lastUpdate: new Date().toISOString(),
          toolCallsByName: { read: 2, edit: 1 },
        },
      }),
      createMockTask({
        status: "completed",
        progress: {
          toolCalls: 4,
          lastTools: ["write", "grep"],
          lastUpdate: new Date().toISOString(),
          toolCallsByName: { write: 3, grep: 1 },
        },
      }),
      createMockTask({
        status: "running",
        // No progress
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.toolCallsByName).toEqual({
      read: 5, // 3 + 2
      grep: 3, // 2 + 1
      edit: 1, // 1
      write: 3, // 3
    });
  });

  test("returns empty toolCallsByName when no tasks have progress", async () => {
    const tasks = [createMockTask({ status: "running" }), createMockTask({ status: "completed" })];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/stats");

    const response = handleStats(request, manager);
    const body = await response.json();

    expect(body.toolCallsByName).toEqual({});
  });
});

// =============================================================================
// Task List Endpoint Tests
// =============================================================================

describe("handleTaskList", () => {
  const createTasks = (count: number): BackgroundTask[] =>
    Array.from({ length: count }, (_, i) =>
      createMockTask({
        sessionID: `ses_${String(i).padStart(3, "0")}`,
        description: `Task ${i} description`,
        prompt: `Task ${i} prompt`,
        startedAt: new Date(2024, 0, 1, 10, i).toISOString(),
      })
    );

  test("uses default pagination (limit=50, offset=0)", async () => {
    const tasks = createTasks(100);
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.limit).toBe(DEFAULT_TASK_LIMIT);
    expect(body.offset).toBe(0);
    expect(body.tasks).toHaveLength(DEFAULT_TASK_LIMIT);
  });

  test("respects custom limit and offset", async () => {
    const tasks = createTasks(20);
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?limit=5&offset=10");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.limit).toBe(5);
    expect(body.offset).toBe(10);
    expect(body.tasks).toHaveLength(5);
    // Default sort is startedAt:desc, so ses_019 is first, ses_000 is last
    // With offset=10, we get items at indices 10-14: ses_009, ses_008, ses_007, ses_006, ses_005
    expect(body.tasks[0].sessionID).toBe("ses_009");
  });

  test("clamps limit to MAX_TASK_LIMIT when exceeded", async () => {
    const tasks = createTasks(250);
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?limit=500");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.limit).toBe(MAX_TASK_LIMIT);
    expect(body.tasks).toHaveLength(MAX_TASK_LIMIT);
  });

  test("uses default limit when invalid limit provided", async () => {
    const tasks = createTasks(10);
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?limit=invalid");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.limit).toBe(DEFAULT_TASK_LIMIT);
  });

  test("filters by status", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1", status: "running" }),
      createMockTask({ sessionID: "ses_2", status: "running" }),
      createMockTask({ sessionID: "ses_3", status: "completed" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?status=running");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.tasks).toHaveLength(2);
    expect(body.tasks.every((t: BackgroundTask) => t.status === "running")).toBe(true);
    expect(body.total).toBe(2);
  });

  test("filters by agent", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1", agent: "explore" }),
      createMockTask({ sessionID: "ses_2", agent: "programmer" }),
      createMockTask({ sessionID: "ses_3", agent: "explore" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?agent=explore");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.tasks).toHaveLength(2);
    expect(body.tasks.every((t: BackgroundTask) => t.agent === "explore")).toBe(true);
  });

  test("searches by description (case-insensitive)", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1", description: "Explore the codebase" }),
      createMockTask({ sessionID: "ses_2", description: "Write some tests" }),
      createMockTask({ sessionID: "ses_3", description: "Explore API docs" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?search=EXPLORE");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.tasks).toHaveLength(2);
    expect(body.tasks[0].sessionID).toBe("ses_1");
    expect(body.tasks[1].sessionID).toBe("ses_3");
  });

  test("searches by prompt (case-insensitive)", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1", description: "Task 1", prompt: "Find all bugs" }),
      createMockTask({ sessionID: "ses_2", description: "Task 2", prompt: "Write tests" }),
      createMockTask({ sessionID: "ses_3", description: "Task 3", prompt: "Find patterns" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?search=find");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.tasks).toHaveLength(2);
  });

  test("sorts by startedAt descending by default", async () => {
    const tasks = [
      createMockTask({
        sessionID: "ses_1",
        startedAt: "2024-01-01T10:00:00Z",
      }),
      createMockTask({
        sessionID: "ses_2",
        startedAt: "2024-01-01T10:02:00Z",
      }),
      createMockTask({
        sessionID: "ses_3",
        startedAt: "2024-01-01T10:01:00Z",
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.tasks[0].sessionID).toBe("ses_2");
    expect(body.tasks[1].sessionID).toBe("ses_3");
    expect(body.tasks[2].sessionID).toBe("ses_1");
  });

  test("sorts by startedAt ascending when specified", async () => {
    const tasks = [
      createMockTask({
        sessionID: "ses_1",
        startedAt: "2024-01-01T10:00:00Z",
      }),
      createMockTask({
        sessionID: "ses_2",
        startedAt: "2024-01-01T10:02:00Z",
      }),
      createMockTask({
        sessionID: "ses_3",
        startedAt: "2024-01-01T10:01:00Z",
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?sort=startedAt:asc");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.tasks[0].sessionID).toBe("ses_1");
    expect(body.tasks[1].sessionID).toBe("ses_3");
    expect(body.tasks[2].sessionID).toBe("ses_2");
  });

  test("total reflects filtered count before pagination", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1", status: "running" }),
      createMockTask({ sessionID: "ses_2", status: "running" }),
      createMockTask({ sessionID: "ses_3", status: "running" }),
      createMockTask({ sessionID: "ses_4", status: "completed" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/tasks?status=running&limit=1");

    const response = handleTaskList(request, manager);
    const body = await response.json();

    expect(body.tasks).toHaveLength(1);
    expect(body.total).toBe(3);
  });
});

// =============================================================================
// Task Detail Endpoint Tests
// =============================================================================

describe("handleTaskDetail", () => {
  test("returns task for valid ID", async () => {
    const task = createMockTask({ sessionID: "ses_abc123" });
    const manager = createMockManager([task]);
    const request = new Request("http://localhost:5165/tasks/ses_abc123");

    const response = handleTaskDetail(request, manager, "ses_abc123");
    const body = await response.json();

    expect(body.sessionID).toBe("ses_abc123");
    expect(body.description).toBe(task.description);
  });

  test("returns 404 for unknown task ID", async () => {
    const manager = createMockManager([]);
    const request = new Request("http://localhost:5165/tasks/ses_unknown");

    const response = handleTaskDetail(request, manager, "ses_unknown");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Task not found");
  });
});

// =============================================================================
// Task Logs Endpoint Tests
// =============================================================================

describe("handleTaskLogs", () => {
  test("returns messages for valid task ID", async () => {
    const task = createMockTask({ sessionID: "ses_abc123" });
    const manager = createMockManager([task]);
    const request = new Request("http://localhost:5165/tasks/ses_abc123/logs");

    const response = await handleTaskLogs(request, manager, "ses_abc123");
    const body = await response.json();

    expect(body.taskId).toBe("ses_abc123");
    expect(body.messages).toEqual([{ role: "assistant", content: "result" }]);
    expect(body.retrievedAt).toBeDefined();
  });

  test("returns 404 for unknown task ID", async () => {
    const manager = createMockManager([]);
    const request = new Request("http://localhost:5165/tasks/ses_unknown/logs");

    const response = await handleTaskLogs(request, manager, "ses_unknown");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Task not found");
  });
});

// =============================================================================
// Task Group Endpoint Tests
// =============================================================================

describe("handleTaskGroup", () => {
  test("returns group with all tasks", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1", batchId: "batch_group1" }),
      createMockTask({ sessionID: "ses_2", batchId: "batch_group1" }),
      createMockTask({ sessionID: "ses_3", batchId: "batch_group1" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/groups/batch_group1");

    const response = handleTaskGroup(request, manager, "batch_group1");
    const body = await response.json();

    expect(body.groupId).toBe("batch_group1");
    expect(body.tasks).toHaveLength(3);
  });

  test("returns 404 for unknown group ID", async () => {
    const manager = createMockManager([]);
    const request = new Request("http://localhost:5165/groups/batch_unknown");

    const response = handleTaskGroup(request, manager, "batch_unknown");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Task group not found");
  });

  test("computes completionRate correctly", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1", batchId: "batch_g1", status: "completed" }),
      createMockTask({ sessionID: "ses_2", batchId: "batch_g1", status: "completed" }),
      createMockTask({ sessionID: "ses_3", batchId: "batch_g1", status: "running" }),
      createMockTask({ sessionID: "ses_4", batchId: "batch_g1", status: "error" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/groups/batch_g1");

    const response = handleTaskGroup(request, manager, "batch_g1");
    const body = await response.json();

    expect(body.stats.completed).toBe(2);
    expect(body.stats.total).toBe(4);
    expect(body.stats.completionRate).toBe(0.5);
  });

  test("computes status counts correctly", async () => {
    const tasks = [
      createMockTask({ sessionID: "ses_1", batchId: "batch_g1", status: "completed" }),
      createMockTask({ sessionID: "ses_2", batchId: "batch_g1", status: "running" }),
      createMockTask({ sessionID: "ses_3", batchId: "batch_g1", status: "running" }),
      createMockTask({ sessionID: "ses_4", batchId: "batch_g1", status: "error" }),
      createMockTask({ sessionID: "ses_5", batchId: "batch_g1", status: "cancelled" }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/groups/batch_g1");

    const response = handleTaskGroup(request, manager, "batch_g1");
    const body = await response.json();

    expect(body.stats.completed).toBe(1);
    expect(body.stats.running).toBe(2);
    expect(body.stats.error).toBe(1);
    expect(body.stats.cancelled).toBe(1);
    expect(body.stats.total).toBe(5);
  });

  test("counts resumed as running", async () => {
    const tasks = [createMockTask({ sessionID: "ses_1", batchId: "batch_g1", status: "resumed" })];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/groups/batch_g1");

    const response = handleTaskGroup(request, manager, "batch_g1");
    const body = await response.json();

    expect(body.stats.running).toBe(1);
    expect(body.stats.completed).toBe(0);
  });

  test("computes totalToolCalls from progress", async () => {
    const tasks = [
      createMockTask({
        sessionID: "ses_1",
        batchId: "batch_g1",
        progress: {
          toolCalls: 10,
          lastTools: ["read"],
          lastUpdate: new Date().toISOString(),
          toolCallsByName: { read: 8, grep: 2 },
        },
      }),
      createMockTask({
        sessionID: "ses_2",
        batchId: "batch_g1",
        progress: {
          toolCalls: 5,
          lastTools: ["write"],
          lastUpdate: new Date().toISOString(),
          toolCallsByName: { write: 5 },
        },
      }),
      createMockTask({
        sessionID: "ses_3",
        batchId: "batch_g1",
        // No progress
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/groups/batch_g1");

    const response = handleTaskGroup(request, manager, "batch_g1");
    const body = await response.json();

    expect(body.stats.totalToolCalls).toBe(15);
  });

  test("computes toolCallsByName aggregated across group tasks", async () => {
    const tasks = [
      createMockTask({
        sessionID: "ses_1",
        batchId: "batch_g1",
        progress: {
          toolCalls: 10,
          lastTools: ["read"],
          lastUpdate: new Date().toISOString(),
          toolCallsByName: { read: 8, grep: 2 },
        },
      }),
      createMockTask({
        sessionID: "ses_2",
        batchId: "batch_g1",
        progress: {
          toolCalls: 5,
          lastTools: ["write"],
          lastUpdate: new Date().toISOString(),
          toolCallsByName: { write: 5 },
        },
      }),
      createMockTask({
        sessionID: "ses_3",
        batchId: "batch_g1",
        progress: {
          toolCalls: 3,
          lastTools: ["edit"],
          lastUpdate: new Date().toISOString(),
          toolCallsByName: { read: 1, edit: 2 },
        },
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/groups/batch_g1");

    const response = handleTaskGroup(request, manager, "batch_g1");
    const body = await response.json();

    expect(body.stats.toolCallsByName).toEqual({
      read: 9, // 8 + 1
      grep: 2, // 2
      write: 5, // 5
      edit: 2, // 2
    });
  });

  test("computes duration from min start to max end", async () => {
    const tasks = [
      createMockTask({
        sessionID: "ses_1",
        batchId: "batch_g1",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:01:00Z",
      }),
      createMockTask({
        sessionID: "ses_2",
        batchId: "batch_g1",
        startedAt: "2024-01-01T10:00:30Z",
        completedAt: "2024-01-01T10:01:30Z",
      }),
      createMockTask({
        sessionID: "ses_3",
        batchId: "batch_g1",
        startedAt: "2024-01-01T10:00:15Z",
        completedAt: "2024-01-01T10:01:15Z",
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/groups/batch_g1");

    const response = handleTaskGroup(request, manager, "batch_g1");
    const body = await response.json();

    // min start: 10:00:00, max end: 10:01:30 = 90 seconds = 90000 ms
    expect(body.stats.duration).toBe(90000);
  });

  test("returns zero duration when no completed tasks", async () => {
    const tasks = [
      createMockTask({
        sessionID: "ses_1",
        batchId: "batch_g1",
        status: "running",
        startedAt: "2024-01-01T10:00:00Z",
      }),
    ];
    const manager = createMockManager(tasks);
    const request = new Request("http://localhost:5165/groups/batch_g1");

    const response = handleTaskGroup(request, manager, "batch_g1");
    const body = await response.json();

    expect(body.stats.duration).toBe(0);
  });
});
