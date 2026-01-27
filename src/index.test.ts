import { describe, expect, test } from "bun:test";
import plugin from "./index";

const createMockContext = (overrides = {}) => ({
  client: {
    event: { subscribe: async () => ({ stream: [] }) },
    session: {
      create: async () => ({ data: { id: "ses_test123" } }),
      status: async () => ({ data: {} }),
      messages: async () => ({ data: [] }),
      get: async () => ({ data: { id: "ses_test123" } }),
      abort: async () => ({}),
      prompt: async () => ({}),
      promptAsync: async () => ({}),
    },
    ...overrides,
  },
  directory: "/test",
  project: "test-project",
  worktree: "/test",
  serverUrl: "http://localhost",
  $: {},
});

describe("Background Agent Plugin", () => {
  test("should export a default function", () => {
    expect(plugin).toBeInstanceOf(Function);
  });

  test("should return an object with tool property when called", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);

    expect(result).toBeObject();
    expect(result).toHaveProperty("tool");
    expect(result.tool).toBeObject();
  });

  test("should export all expected tools", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);

    // Core tools that exist in current implementation
    expect(result.tool).toHaveProperty("asyncagents_task");
    expect(result.tool).toHaveProperty("asyncagents_output");
    expect(result.tool).toHaveProperty("asyncagents_cancel");
    expect(result.tool).toHaveProperty("asyncagents_list");
    expect(result.tool).toHaveProperty("asyncagents_clear");
  });

  test("should return an object with event property", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);

    expect(result).toHaveProperty("event");
    expect(result.event).toBeInstanceOf(Function);
  });
});

describe("asyncagents_task tool", () => {
  test("should return error when agent is missing", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);
    const taskTool = result.tool!.asyncagents_task;

    const output = await taskTool.execute({ description: "test", prompt: "test", agent: "" }, {
      sessionID: "parent",
      messageID: "msg",
      agent: "test",
    } as any);

    expect(output).toContain("Agent parameter is required");
  });

  test("should launch task with valid parameters", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);
    const taskTool = result.tool!.asyncagents_task;

    const output = await taskTool.execute(
      { description: "test task", prompt: "do something", agent: "explore" },
      { sessionID: "parent", messageID: "msg", agent: "test" } as any
    );

    expect(output).toContain("Background task launched");
    // Task ID is now session ID format (ses_*)
    expect(output).toContain("Task ID:");
  });

  test("should support resume mode via resume parameter", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);
    const taskTool = result.tool!.asyncagents_task;

    // Try to resume a non-existent task
    const output = await taskTool.execute(
      { resume: "ses_nonexistent", description: "", prompt: "follow up", agent: "" },
      { sessionID: "parent", messageID: "msg", agent: "test" } as any
    );

    expect(output).toContain("Task not found");
  });
});

describe("asyncagents_output tool", () => {
  test("should return error when task not found", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);
    const outputTool = result.tool!.asyncagents_output;

    const output = await outputTool.execute({ task_id: "ses_nonexistent" }, {} as any);

    expect(output).toContain("Task not found");
  });
});

describe("asyncagents_list tool", () => {
  test("should return empty message when no tasks", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);
    const listTool = result.tool!.asyncagents_list;

    const output = await listTool.execute({}, {} as any);

    expect(output).toContain("No background tasks found");
  });
});

describe("asyncagents_clear tool", () => {
  test("should return message when no tasks to clear", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext as any);
    const clearTool = result.tool!.asyncagents_clear;

    const output = await clearTool.execute({}, {} as any);

    expect(output).toContain("No background tasks to clear");
  });
});
