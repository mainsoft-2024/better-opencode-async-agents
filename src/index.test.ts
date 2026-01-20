import { describe, expect, test } from "bun:test";
import plugin from "./index";

const createMockContext = (overrides = {}) => ({
  client: {
    event: { subscribe: async () => ({ stream: [] }) },
    session: {
      create: async () => ({ data: { id: "test-session" } }),
      status: async () => ({ data: {} }),
      messages: async () => ({ data: [] }),
      get: async () => ({ data: { id: "test-session" } }),
      abort: async () => ({}),
      prompt: async () => ({}),
      promptAsync: async () => ({}),
    },
    ...overrides,
  },
  directory: "/test",
});

describe("Background Agent Plugin", () => {
  test("should export a default function", () => {
    expect(plugin).toBeInstanceOf(Function);
  });

  test("should return an object with tool property when called", async () => {
    const mockContext = {
      client: {
        event: { subscribe: async () => ({ stream: [] }) },
        session: {
          create: async () => ({ data: { id: "test" } }),
          status: async () => ({ data: {} }),
          messages: async () => ({ data: [] }),
          get: async () => ({ data: {} }),
          abort: async () => ({}),
          prompt: async () => ({}),
          promptAsync: async () => ({}),
        },
      },
      directory: "/test",
    };

    const result = await plugin(mockContext);

    expect(result).toBeObject();
    expect(result).toHaveProperty("tool");
    expect(result.tool).toBeObject();
  });

  test("should export all expected tools", async () => {
    const mockContext = {
      client: {
        event: { subscribe: async () => ({ stream: [] }) },
        session: {
          create: async () => ({ data: { id: "test" } }),
          status: async () => ({ data: {} }),
          messages: async () => ({ data: [] }),
          get: async () => ({ data: {} }),
          abort: async () => ({}),
          prompt: async () => ({}),
          promptAsync: async () => ({}),
        },
      },
      directory: "/test",
    };

    const result = await plugin(mockContext);

    expect(result.tool).toHaveProperty("background_task");
    expect(result.tool).toHaveProperty("background_output");
    expect(result.tool).toHaveProperty("background_cancel");
    expect(result.tool).toHaveProperty("background_resume");
    expect(result.tool).toHaveProperty("background_list");
    expect(result.tool).toHaveProperty("background_clear");
  });

  test("should return an object with event property", async () => {
    const mockContext = {
      client: {
        event: { subscribe: async () => ({ stream: [] }) },
        session: {
          create: async () => ({ data: { id: "test" } }),
          status: async () => ({ data: {} }),
          messages: async () => ({ data: [] }),
          get: async () => ({ data: {} }),
          abort: async () => ({}),
          prompt: async () => ({}),
          promptAsync: async () => ({}),
        },
      },
      directory: "/test",
    };

    const result = await plugin(mockContext);

    expect(result).toHaveProperty("event");
    expect(result.event).toBeInstanceOf(Function);
  });
});

describe("background_resume tool", () => {
  test("should return error when task not found", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext);
    const resumeTool = result.tool.background_resume;

    const output = await resumeTool.execute(
      { task_id: "nonexistent", message: "follow up" },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );

    expect(output).toContain("Task not found");
  });

  test("should return error when resuming non-completed task", async () => {
    const mockContext = createMockContext();
    const result = await plugin(mockContext);
    const taskTool = result.tool.background_task;
    const resumeTool = result.tool.background_resume;

    const launchOutput = await taskTool.execute(
      { description: "test task", prompt: "do something", agent: "explore" },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );

    const taskIdMatch = launchOutput.match(/Task ID: `(bg_[a-f0-9]+)`/);
    expect(taskIdMatch).toBeTruthy();
    const taskId = taskIdMatch![1];

    const resumeOutput = await resumeTool.execute(
      { task_id: taskId, message: "follow up" },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );

    expect(resumeOutput).toContain("Cannot resume task");
    expect(resumeOutput).toContain("running");
  });

  test("should return error for concurrent resume attempts", async () => {
    let statusCallCount = 0;
    const mockContext = createMockContext();
    mockContext.client.session.status = async () => {
      statusCallCount++;
      if (statusCallCount === 1) {
        return { data: { "test-session": { type: "idle" } } };
      }
      return { data: { "test-session": { type: "busy" } } };
    };
    mockContext.client.session.messages = async () => ({
      data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "done" }] }],
    });

    const result = await plugin(mockContext);
    const taskTool = result.tool.background_task;
    const resumeTool = result.tool.background_resume;

    const launchOutput = await taskTool.execute(
      { description: "test task", prompt: "do something", agent: "explore" },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );

    const taskIdMatch = launchOutput.match(/Task ID: `(bg_[a-f0-9]+)`/);
    const taskId = taskIdMatch![1];

    await new Promise((r) => setTimeout(r, 150));

    const resumeOutput1 = await resumeTool.execute(
      { task_id: taskId, message: "follow up 1", block: false },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );
    expect(resumeOutput1).toContain("Resume initiated");

    const resumeOutput2 = await resumeTool.execute(
      { task_id: taskId, message: "follow up 2" },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );
    expect(resumeOutput2).toContain("currently being resumed");
  });

  test("should return error when session expired", async () => {
    const mockContext = createMockContext();
    mockContext.client.session.status = async () => ({
      data: { "test-session": { type: "idle" } },
    });
    mockContext.client.session.get = async () => ({ error: "not found", data: null });
    mockContext.client.session.messages = async () => ({
      data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "done" }] }],
    });

    const result = await plugin(mockContext);
    const taskTool = result.tool.background_task;
    const resumeTool = result.tool.background_resume;

    const launchOutput = await taskTool.execute(
      { description: "test task", prompt: "do something", agent: "explore" },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );

    const taskIdMatch = launchOutput.match(/Task ID: `(bg_[a-f0-9]+)`/);
    const taskId = taskIdMatch![1];

    await new Promise((r) => setTimeout(r, 150));

    const resumeOutput = await resumeTool.execute(
      { task_id: taskId, message: "follow up" },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );

    expect(resumeOutput).toContain("Session expired");
  });

  test("should increment resumeCount on successful resume", async () => {
    let promptAsyncCalls = 0;
    const mockContext = createMockContext();
    mockContext.client.session.status = async () => ({
      data: { "test-session": { type: "idle" } },
    });
    mockContext.client.session.promptAsync = async () => {
      promptAsyncCalls++;
      return {};
    };
    mockContext.client.session.messages = async () => ({
      data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "response" }] }],
    });

    const result = await plugin(mockContext);
    const taskTool = result.tool.background_task;
    const resumeTool = result.tool.background_resume;

    const launchOutput = await taskTool.execute(
      { description: "test task", prompt: "do something", agent: "explore" },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );

    const taskIdMatch = launchOutput.match(/Task ID: `(bg_[a-f0-9]+)`/);
    const taskId = taskIdMatch![1];

    await new Promise((r) => setTimeout(r, 150));

    const resumeOutput1 = await resumeTool.execute(
      { task_id: taskId, message: "first follow up", block: true, timeout: 1000 },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );
    expect(resumeOutput1).toContain("count: 1");

    const resumeOutput2 = await resumeTool.execute(
      { task_id: taskId, message: "second follow up", block: true, timeout: 1000 },
      { sessionID: "parent", messageID: "msg", agent: "test" }
    );
    expect(resumeOutput2).toContain("count: 2");
  });
});
