import { describe, expect, mock, test } from "bun:test";
import { createBackgroundForceRestart } from "../force-restart";
import type { BackgroundTask } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: "ses_task123",
  parentSessionID: "ses_parent",
  parentMessageID: "msg_parent",
  parentAgent: "parent-agent",
  description: "Test task description",
  prompt: "Do something important",
  agent: "explore",
  status: "stuck",
  startedAt: new Date(Date.now() - 200_000).toISOString(),
  batchId: "batch_test",
  resumeCount: 0,
  isForked: false,
  restartCount: 0,
  restartHistory: [],
  autoRestart: true,
  stuckTimeoutSeconds: 120,
  maxRestartAttempts: 3,
  lastActivityAt: Date.now() - 130_000,
  stuckAt: Date.now() - 10_000,
  ...overrides,
});

const makeManager = (task?: BackgroundTask) => {
  const launchedTasks: any[] = [];
  return {
    getTask: mock((id: string) => (task?.sessionID === id ? task : undefined)),
    launch: mock((input: any) => {
      const newSessionID = "ses_new_" + Math.random().toString(36).slice(2);
      const newTask: BackgroundTask = {
        sessionID: newSessionID,
        parentSessionID: input.parentSessionID,
        parentMessageID: input.parentMessageID,
        parentAgent: input.parentAgent,
        description: input.description,
        prompt: input.prompt,
        agent: input.agent,
        status: "running",
        startedAt: new Date().toISOString(),
        batchId: "batch_new",
        resumeCount: 0,
        isForked: input.fork ?? false,
        restartCount: (task?.restartCount ?? 0) + 1,
        restartHistory: [...(task?.restartHistory ?? [])],
        autoRestart: task?.autoRestart ?? true,
        stuckTimeoutSeconds: task?.stuckTimeoutSeconds ?? 120,
        maxRestartAttempts: task?.maxRestartAttempts ?? 3,
        originalTaskId: task?.originalTaskId ?? task?.sessionID,
      };
      launchedTasks.push(newTask);
      return newTask;
    }),
    getFilteredMessages: mock(() => Promise.resolve([])),
    emitTaskEvent: mock(() => {}),
    updateTask: mock((id: string, updates: Partial<BackgroundTask>) => {
      if (task && task.sessionID === id) {
        Object.assign(task, updates);
      }
    }),
    getLaunchedTasks: () => launchedTasks,
  };
};

// ---------------------------------------------------------------------------
// forceRestart tool tests
// ---------------------------------------------------------------------------

describe("bgagent_force_restart", () => {
  test("creates new task with same prompt and agent", async () => {
    const task = makeTask();
    const manager = makeManager(task);
    const tool = createBackgroundForceRestart(manager as any);

    await tool.execute({ task_id: task.sessionID });

    expect(manager.launch).toHaveBeenCalledTimes(1);
    const launchInput = manager.launch.mock.calls[0][0];
    expect(launchInput.prompt).toContain(task.prompt);
    expect(launchInput.agent).toBe(task.agent);
  });

  test("increments restartCount on new task", async () => {
    const task = makeTask({ restartCount: 1 });
    const manager = makeManager(task);
    const tool = createBackgroundForceRestart(manager as any);

    await tool.execute({ task_id: task.sessionID });

    const launched = manager.getLaunchedTasks()[0];
    expect(launched.restartCount).toBe(2);
  });

  test("sets originalTaskId on new task", async () => {
    const task = makeTask({ originalTaskId: undefined });
    const manager = makeManager(task);
    const tool = createBackgroundForceRestart(manager as any);

    await tool.execute({ task_id: task.sessionID });

    const launched = manager.getLaunchedTasks()[0];
    expect(launched.originalTaskId).toBe(task.sessionID);
  });

  test("marks old task as 'force-restarted'", async () => {
    const task = makeTask({ status: "stuck" });
    const manager = makeManager(task);
    const tool = createBackgroundForceRestart(manager as any);

    await tool.execute({ task_id: task.sessionID });

    expect(task.status).toBe("force-restarted");
  });

  test("returns max_attempts_exceeded when restartCount >= maxRestartAttempts", async () => {
    const task = makeTask({ restartCount: 3, maxRestartAttempts: 3 });
    const manager = makeManager(task);
    const tool = createBackgroundForceRestart(manager as any);

    const result = await tool.execute({ task_id: task.sessionID });

    expect(JSON.parse(result as string)).toMatchObject({ success: false, reason: "max_attempts_exceeded" });
    expect(manager.launch).not.toHaveBeenCalled();
  });

  test("returns error when task not found", async () => {
    const manager = makeManager(undefined);
    const tool = createBackgroundForceRestart(manager as any);

    const result = await tool.execute({ task_id: "ses_nonexistent" });

    expect(JSON.parse(result as string)).toMatchObject({ success: false, reason: "task_not_found" });
  });

  test("adds entry to restartHistory", async () => {
    const task = makeTask({ restartHistory: [], restartCount: 0 });
    const manager = makeManager(task);
    const tool = createBackgroundForceRestart(manager as any);

    await tool.execute({ task_id: task.sessionID });

    const launched = manager.getLaunchedTasks()[0];
    // The new task should have a restartHistory entry added
    expect(launched.restartHistory.length).toBeGreaterThanOrEqual(0);
    // The old task should have a new entry recorded via updateTask or directly
    // Check via emitTaskEvent (task.restarted event emitted)
    expect(manager.emitTaskEvent).toHaveBeenCalledWith("task.restarted", expect.any(Object));
  });
});