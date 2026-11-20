import { describe, expect, test, beforeEach } from "bun:test";

import { useAgentStore, selectStuckTasks } from "../stores/agentStore";
import type { BackgroundTask, BackgroundTaskStatus } from "../types";

const makeTask = (overrides: Partial<BackgroundTask> & { sessionID: string }): BackgroundTask => ({
  parentSessionID: "",
  parentMessageID: "",
  parentAgent: "",
  description: "test task",
  prompt: "do something",
  agent: "coder",
  status: "running",
  startedAt: new Date().toISOString(),
  batchId: "batch-1",
  resumeCount: 0,
  isForked: false,
  ...overrides,
});

beforeEach(() => {
  useAgentStore.setState({
    tasksById: {},
    taskOrder: [],
    selectedTaskId: null,
    instances: [],
    stats: null,
    instancesById: {},
    connectionStatus: {},
    selectedInstanceFilter: null,
  });
});

describe("agentStore — applyTaskEventFromInstance", () => {
  test("handles task with status 'stuck'", () => {
    const task = makeTask({ sessionID: "sess-1", status: "stuck" });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", task);
    const state = useAgentStore.getState();
    const key = "inst-1:sess-1";
    expect(state.tasksById[key]).toBeDefined();
    expect(state.tasksById[key].status).toBe("stuck");
  });

  test("handles task with status 'auto-restarted' (task.restarted event)", () => {
    const task = makeTask({ sessionID: "sess-2", status: "auto-restarted" });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", task);
    const state = useAgentStore.getState();
    const key = "inst-1:sess-2";
    expect(state.tasksById[key]).toBeDefined();
    expect(state.tasksById[key].status).toBe("auto-restarted");
  });
});

describe("selectStuckTasks", () => {
  test("returns tasks with status 'stuck'", () => {
    const stuckTask = makeTask({ sessionID: "sess-stuck", status: "stuck" });
    const runningTask = makeTask({ sessionID: "sess-running", status: "running" });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", stuckTask);
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", runningTask);
    const stuck = selectStuckTasks(useAgentStore.getState());
    expect(stuck).toHaveLength(1);
    expect(stuck[0].sessionID).toBe("sess-stuck");
  });

  test("returns empty array when no stuck tasks", () => {
    const runningTask = makeTask({ sessionID: "sess-ok", status: "running" });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", runningTask);
    const stuck = selectStuckTasks(useAgentStore.getState());
    expect(stuck).toHaveLength(0);
  });
});

describe("BackgroundTaskStatus type validation", () => {
  test("accepts stuck, force-restarted, auto-restarted as valid statuses", () => {
    const statuses: BackgroundTaskStatus[] = ["stuck", "force-restarted", "auto-restarted"];
    // compile-time check: if this compiles, the types are valid
    expect(statuses).toContain("stuck");
    expect(statuses).toContain("force-restarted");
    expect(statuses).toContain("auto-restarted");
  });
});