import { describe, expect, test } from "bun:test";
import {
  checkIfStuck,
  markStuck,
  updateActivityTracking,
} from "../stuck-detection";
import type { BackgroundTask } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: "ses_test123",
  parentSessionID: "ses_parent",
  parentMessageID: "msg_parent",
  parentAgent: "parent-agent",
  description: "Test task",
  prompt: "Test prompt",
  agent: "explore",
  status: "running",
  startedAt: new Date(Date.now() - 60_000).toISOString(), // 60s ago by default
  batchId: "batch_test",
  resumeCount: 0,
  isForked: false,
  restartCount: 0,
  restartHistory: [],
  autoRestart: true,
  stuckTimeoutSeconds: 120,
  maxRestartAttempts: 3,
  lastActivityAt: Date.now() - 60_000, // active 60s ago by default
  ...overrides,
});

// ---------------------------------------------------------------------------
// checkIfStuck
// ---------------------------------------------------------------------------

describe("checkIfStuck", () => {
  test("returns false when task has no lastActivityAt", () => {
    const task = makeTask({ lastActivityAt: undefined });
    expect(checkIfStuck(task)).toBe(false);
  });

  test("returns false when runtime < 30s (MIN_RUNTIME guard)", () => {
    const now = Date.now();
    const task = makeTask({
      startedAt: new Date(now - 10_000).toISOString(), // only 10s runtime
      lastActivityAt: now - 35_000, // > 30s inactivity, but task is new
    });
    expect(checkIfStuck(task)).toBe(false);
  });

  test("returns false when inactivity < stuckTimeoutSeconds", () => {
    const task = makeTask({
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      lastActivityAt: Date.now() - 30_000, // only 30s of inactivity
      stuckTimeoutSeconds: 120,
    });
    expect(checkIfStuck(task)).toBe(false);
  });

  test("returns true when inactivity >= 120s and runtime >= 30s", () => {
    const now = Date.now();
    const task = makeTask({
      startedAt: new Date(now - 200_000).toISOString(), // 200s runtime
      lastActivityAt: now - 130_000, // 130s of inactivity (> 120s)
      stuckTimeoutSeconds: 120,
    });
    expect(checkIfStuck(task)).toBe(true);
  });

  test("returns false when status is not 'running' or 'resumed'", () => {
    const now = Date.now();
    const stuckConditions = {
      startedAt: new Date(now - 200_000).toISOString(),
      lastActivityAt: now - 130_000,
      stuckTimeoutSeconds: 120,
    };
    expect(checkIfStuck(makeTask({ ...stuckConditions, status: "completed" }))).toBe(false);
    expect(checkIfStuck(makeTask({ ...stuckConditions, status: "error" }))).toBe(false);
    expect(checkIfStuck(makeTask({ ...stuckConditions, status: "stuck" }))).toBe(false);
    expect(checkIfStuck(makeTask({ ...stuckConditions, status: "running" }))).toBe(true);
    expect(checkIfStuck(makeTask({ ...stuckConditions, status: "resumed" }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// markStuck
// ---------------------------------------------------------------------------

describe("markStuck", () => {
  test("sets stuckAt and status to 'stuck'", () => {
    const task = makeTask({ status: "running" });
    const before = Date.now();
    markStuck(task);
    const after = Date.now();

    expect(task.status).toBe("stuck");
    expect(task.stuckAt).toBeDefined();
    expect(task.stuckAt!).toBeGreaterThanOrEqual(before);
    expect(task.stuckAt!).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// updateActivityTracking
// ---------------------------------------------------------------------------

describe("updateActivityTracking", () => {
  test("lastActivityAt updated on 'text' message type", () => {
    const task = makeTask({ lastActivityAt: Date.now() - 10_000 });
    const prevActivity = task.lastActivityAt!;
    updateActivityTracking(task, "text");
    expect(task.lastActivityAt!).toBeGreaterThan(prevActivity);
  });

  test("lastActivityAt updated on 'thinking' message type", () => {
    const task = makeTask({ lastActivityAt: Date.now() - 10_000 });
    const prevActivity = task.lastActivityAt!;
    updateActivityTracking(task, "thinking");
    expect(task.lastActivityAt!).toBeGreaterThan(prevActivity);
  });

  test("lastActivityAt NOT updated on 'tool_use' message type", () => {
    const originalActivity = Date.now() - 10_000;
    const task = makeTask({ lastActivityAt: originalActivity });
    updateActivityTracking(task, "tool_use");
    expect(task.lastActivityAt).toBe(originalActivity);
  });

  test("stuckAt cleared when stuck task receives text message", () => {
    const task = makeTask({
      status: "stuck",
      stuckAt: Date.now() - 5_000,
    });
    updateActivityTracking(task, "text");
    expect(task.stuckAt).toBeUndefined();
  });
});