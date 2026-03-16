import { describe, expect, mock, test } from "bun:test";
import { ERROR_MESSAGES } from "../../prompts";
import type { BackgroundTask } from "../../types";
import { executeResume, type ResumeManager, validateResumeTask } from "../resume";

const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: "ses_test123",
  parentSessionID: "ses_parent",
  parentMessageID: "msg_parent",
  parentAgent: "test-agent",
  description: "Test task",
  prompt: "Test prompt",
  agent: "explore",
  status: "running",
  startedAt: new Date().toISOString(),
  batchId: "batch_123",
  resumeCount: 0,
  isForked: false,
  ...overrides,
});

const createMockResumeManager = (task: BackgroundTask | undefined) => {
  const persistTask = mock(async () => {});
  const checkSessionExists = mock(async () => true);
  const sendResumePromptAsync = mock(async () => {});

  const manager: ResumeManager = {
    getTask: mock(() => task),
    resolveTaskId: mock(() => (task ? task.sessionID : null)),
    resolveTaskIdWithFallback: mock(async () => (task ? task.sessionID : null)),
    getTaskWithFallback: mock(async () => task),
    persistTask,
    checkSessionExists,
    sendResumePromptAsync,
  };

  return {
    manager,
    persistTask,
    checkSessionExists,
    sendResumePromptAsync,
  };
};

describe("resume helpers", () => {
  test("resume from error status validates and resumes", async () => {
    const task = createMockTask({ status: "error", error: "previous failure" });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);

    const validation = await validateResumeTask(manager, task.sessionID);
    expect(validation.valid).toBe(true);

    const result = await executeResume(manager, task, "continue after fix", {});
    expect(result.success).toBe(true);
    expect(task.status).toBe("resumed");
    expect(task.resumeCount).toBe(1);
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(1);
  });

  test("resume from cancelled status validates and resumes", async () => {
    const task = createMockTask({ status: "cancelled" });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);

    const validation = await validateResumeTask(manager, task.sessionID);
    expect(validation.valid).toBe(true);

    const result = await executeResume(manager, task, "retry cancelled work", {});
    expect(result.success).toBe(true);
    expect(task.status).toBe("resumed");
    expect(task.resumeCount).toBe(1);
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(1);
  });

  test("resume from running status queues pending resume", async () => {
    const task = createMockTask({ status: "running" });
    const { manager, sendResumePromptAsync, persistTask } = createMockResumeManager(task);

    const validation = await validateResumeTask(manager, task.sessionID);
    expect(validation.valid).toBe(true);

    const result = await executeResume(manager, task, "queue follow-up", {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.toLowerCase()).toContain("queue");
    }
    expect(task.status).toBe("running");
    expect(task.pendingResume).toEqual(expect.objectContaining({ prompt: "queue follow-up" }));
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(0);
    expect(persistTask).toHaveBeenCalledTimes(1);
  });

  test("queue-full rejection for running task with existing pending resume", async () => {
    const task = createMockTask({
      status: "running",
      pendingResume: {
        prompt: "already queued",
        queuedAt: new Date().toISOString(),
      },
    });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);

    const validation = await validateResumeTask(manager, task.sessionID);
    expect(validation.valid).toBe(true);

    const result = await executeResume(manager, task, "second queued prompt", {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toLowerCase()).toContain("queue");
    }
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(0);
  });

  test("resumed status is still rejected during validation", async () => {
    const task = createMockTask({ status: "resumed", resumeCount: 1 });
    const { manager } = createMockResumeManager(task);

    const validation = await validateResumeTask(manager, task.sessionID);
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.error).toBe(ERROR_MESSAGES.taskCurrentlyResuming);
    }
  });

  test("completed status remains resumable for backward compatibility", async () => {
    const task = createMockTask({ status: "completed" });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);

    const validation = await validateResumeTask(manager, task.sessionID);
    expect(validation.valid).toBe(true);

    const result = await executeResume(manager, task, "continue completed task", {});
    expect(result.success).toBe(true);
    expect(task.status).toBe("resumed");
    expect(task.resumeCount).toBe(1);
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(1);
  });
});