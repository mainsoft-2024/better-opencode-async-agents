import { describe, expect, test, beforeEach } from "bun:test";

import { useAgentStore, selectStuckTasks } from "../stores/agentStore";
import type { BackgroundTask, StatsResponse } from "../types";

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

describe("selectStuckTasks", () => {
  test("returns only tasks with status 'stuck'", () => {
    const stuckTask = makeTask({ sessionID: "sess-stuck", status: "stuck" });
    const runningTask = makeTask({ sessionID: "sess-running", status: "running" });
    const completedTask = makeTask({ sessionID: "sess-done", status: "completed" });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", stuckTask);
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", runningTask);
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", completedTask);
    const stuck = selectStuckTasks(useAgentStore.getState());
    expect(stuck).toHaveLength(1);
    expect(stuck[0].sessionID).toBe("sess-stuck");
  });
});

describe("StatsResponse byStatus.stuck", () => {
  test("stats byStatus.stuck is reflected in store when set", () => {
    const stats: StatsResponse = { byStatus: { running: 2, stuck: 3 }, byAgent: { coder: 2 }, toolCallsByName: {}, toolCallsByAgent: {}, duration: { avg: 0, max: 0, min: 0 }, totalTasks: 3, activeTasks: 2 };
    const tasks = [makeTask({ sessionID: "sess-1" })];
    useAgentStore.getState().upsertTasksFromInstance("local", tasks, stats);
    const state = useAgentStore.getState();
    expect(state.stats?.byStatus.stuck).toBe(3);
  });
});

describe("applyTaskEventFromInstance — Phase 3 fields", () => {
  test("preserves stuckAt field when task transitions to stuck", () => {
    const stuckAt = Date.now();
    const task = makeTask({ sessionID: "sess-a", status: "stuck", stuckAt });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", task);
    const key = "inst-1:sess-a";
    expect(useAgentStore.getState().tasksById[key].stuckAt).toBe(stuckAt);
  });

  test("preserves restartCount field when task is restarted", () => {
    const task = makeTask({ sessionID: "sess-b", status: "auto-restarted", restartCount: 2 });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", task);
    const key = "inst-1:sess-b";
    expect(useAgentStore.getState().tasksById[key].restartCount).toBe(2);
  });

  test("stuck task has stuckAt field accessible from store", () => {
    const stuckAt = 1700000000000;
    const task = makeTask({ sessionID: "sess-c", status: "stuck", stuckAt });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", task);
    const stored = useAgentStore.getState().tasksById["inst-1:sess-c"];
    expect(stored).toBeDefined();
    expect(stored.stuckAt).toBe(stuckAt);
    expect(stored.status).toBe("stuck");
  });

  test("stuck→running transition clears stuckAt in store", () => {
    const stuckAt = Date.now() - 60000;
    const stuckTask = makeTask({ sessionID: "sess-d", status: "stuck", stuckAt });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", stuckTask);
    // Simulate recovery: same session transitions to running, stuckAt cleared
    const recoveredTask = makeTask({ sessionID: "sess-d", status: "running", stuckAt: undefined });
    useAgentStore.getState().applyTaskEventFromInstance("inst-1", recoveredTask);
    const stored = useAgentStore.getState().tasksById["inst-1:sess-d"];
    expect(stored.status).toBe("running");
    expect(stored.stuckAt).toBeUndefined();
  });
});
