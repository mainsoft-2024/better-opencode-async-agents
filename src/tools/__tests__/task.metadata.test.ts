import { describe, expect, mock, test } from "bun:test";
import { shortId } from "../../helpers";
import type { BackgroundTask } from "../../types";
import { createBackgroundTask } from "../task";

const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: "ses_test123",
  parentSessionID: "ses_parent",
  parentMessageID: "msg_parent",
  parentAgent: "parent-test-agent",
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

const createMockTaskManager = (
  launchMock = mock(() => Promise.resolve(createMockTask()))
) => ({
  launch: launchMock,
  getTask: mock(() => undefined as BackgroundTask | undefined),
  getTaskSessionIds: mock(() => [] as string[]),
  resolveTaskId: mock(() => null as string | null),
  resolveTaskIdWithFallback: mock(() => Promise.resolve(null as string | null)),
  getTaskWithFallback: mock(() => Promise.resolve(undefined as BackgroundTask | undefined)),
  persistTask: mock(() => Promise.resolve()),
  checkSessionExists: mock(() => Promise.resolve(true)),
  sendResumePromptAsync: mock(() => Promise.resolve()),
});

describe("bgagent_task metadata emission", () => {
  describe("TU-1.1 — launch mode returns object with sessionId metadata", () => {
    test("execute returns object with metadata.sessionId from TaskManager.launch", async () => {
      const mockTask = createMockTask({ sessionID: "sess_child_1", agent: "researcher" });
      const launchMock = mock(() => Promise.resolve(mockTask));
      const mockManager = createMockTaskManager(launchMock);
      const tool = createBackgroundTask(mockManager);

      const result = await tool.execute(
        { description: "deep research", prompt: "research X", agent: "researcher" },
        { sessionID: "ses_parent", messageID: "msg_parent", agent: "parent-agent" } as any
      );

      expect(typeof result).toBe("object");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("sessionId", "sess_child_1");
      expect(result.metadata).toHaveProperty("agent", "researcher");
      expect(result.metadata).toHaveProperty("parentAgent", "parent-agent");
      expect(result).toHaveProperty("title", "researcher: deep research");
      expect(result).toHaveProperty("output");
      expect(typeof result.output).toBe("string");
      expect(result.output).toContain(shortId(mockTask.sessionID));
    });

    test("agent is trimmed in metadata and title", async () => {
      const mockTask = createMockTask({ sessionID: "sess_trim_test", agent: "  planner  " });
      const launchMock = mock(() => Promise.resolve(mockTask));
      const mockManager = createMockTaskManager(launchMock);
      const tool = createBackgroundTask(mockManager);

      const result = await tool.execute(
        { description: "plan stuff", prompt: "plan", agent: "  planner  " },
        { sessionID: "ses", messageID: "msg", agent: "planner-parent" } as any
      );

      expect(result.metadata.agent).toBe("planner");
      expect(result.title).toBe("planner: plan stuff");
    });
  });

  describe("TU-1.2 — two sequential calls produce distinct sessionId values", () => {
    test("first call returns sess_child_1, second call returns sess_child_2", async () => {
      const mockTask1 = createMockTask({ sessionID: "sess_child_1" });
      const mockTask2 = createMockTask({ sessionID: "sess_child_2" });

      let callCount = 0;
      const launchMock = mock(() => {
        const task = callCount === 0 ? mockTask1 : mockTask2;
        callCount++;
        return Promise.resolve(task);
      });
      const mockManager = createMockTaskManager(launchMock);
      const tool = createBackgroundTask(mockManager);

      const ctx = { sessionID: "ses_parent", messageID: "msg_parent", agent: "parent" } as any;
      const args = { description: "task", prompt: "do work", agent: "worker" };

      const result1 = await tool.execute(args, ctx);
      const result2 = await tool.execute(args, ctx);

      expect(result1.metadata.sessionId).toBe("sess_child_1");
      expect(result2.metadata.sessionId).toBe("sess_child_2");
    });
  });

  describe("TU-1.3 — error path returns plain string (not object)", () => {
    test("empty agent returns plain error string", async () => {
      const mockManager = createMockTaskManager();
      const tool = createBackgroundTask(mockManager);

      const result = await tool.execute(
        { description: "test", prompt: "test", agent: "" },
        { sessionID: "ses", messageID: "msg", agent: "test" } as any
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("Agent parameter is required");
    });

    test("launch failure returns plain error string", async () => {
      const launchMock = mock(() => Promise.reject(new Error("spawn failed")));
      const mockManager = createMockTaskManager(launchMock);
      const tool = createBackgroundTask(mockManager);

      const result = await tool.execute(
        { description: "test", prompt: "test", agent: "worker" },
        { sessionID: "ses", messageID: "msg", agent: "parent" } as any
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("spawn failed");
    });
  });
});