import { describe, expect, mock, test } from "bun:test";
import type { BackgroundTask, TaskProgress } from "../../types";
import { showProgressToast } from "../notifications";
import { updateTaskProgress } from "../polling";

const createProgress = (overrides: Partial<TaskProgress> = {}): TaskProgress => ({
  toolCalls: 0,
  toolCallsByName: {},
  lastTools: [],
  lastUpdate: new Date().toISOString(),
  phase: "waiting",
  textCharCount: 0,
  streamFrame: 0,
  brailleFrame: 0,
  progressBarFrame: 0,
  waitingFrame: 0,
  toolFrame: 0,
  ...overrides,
});

const createTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: "ses_test12345678",
  parentSessionID: "ses_parent",
  parentMessageID: "msg_parent",
  parentAgent: "planner",
  description: "Find toast loading animation code",
  prompt: "test prompt",
  agent: "explorer",
  status: "running",
  startedAt: new Date(Date.now() - 3000).toISOString(),
  batchId: "batch_1",
  resumeCount: 0,
  isForked: false,
  ...overrides,
});

const getToastMessage = (showToast: { mock: { calls: unknown } }): string => {
  const calls = showToast.mock.calls as unknown as Array<unknown[]>;
  const payload = (calls[0]?.[0] ?? {}) as { body?: { message?: string } };
  return payload.body?.message ?? "";
};

describe("toast animation", () => {
  test("T1: getPhaseIcon returns braille+bar for streaming", () => {
    const task = createTask({
      progress: createProgress({ phase: "streaming", brailleFrame: 0, progressBarFrame: 0 }),
    });
    const showToast = mock(() => Promise.resolve());
    const client = { tui: { showToast } };

    showProgressToast([task], client as any, () => [task]);

    expect(showToast).toHaveBeenCalled();
    const message = getToastMessage(showToast);
    expect(message).toContain("⠋ ▰▱▱ [explorer#");
  });

  test("T2: getPhaseIcon returns braille+bar for tool", () => {
    const task = createTask({
      progress: createProgress({ phase: "tool", brailleFrame: 0, progressBarFrame: 1 }),
    });
    const showToast = mock(() => Promise.resolve());
    const client = { tui: { showToast } };

    showProgressToast([task], client as any, () => [task]);

    expect(showToast).toHaveBeenCalled();
    const message = getToastMessage(showToast);
    expect(message).toContain("⠋ ▰▰▱ [explorer#");
  });

  test("T3: getPhaseIcon returns waiting frame unchanged", () => {
    const task = createTask({
      progress: createProgress({ phase: "waiting", waitingFrame: 1 }),
    });
    const showToast = mock(() => Promise.resolve());
    const client = { tui: { showToast } };

    showProgressToast([task], client as any, () => [task]);

    expect(showToast).toHaveBeenCalled();
    const message = getToastMessage(showToast);
    expect(message).toContain("◉ [explorer#");
  });

  test("T4: completed icons include success/error bar variants", () => {
    const startedAt = new Date(Date.now() - 5000).toISOString();
    const completedAt = new Date().toISOString();
    const successTask = createTask({
      sessionID: "ses_success1234",
      status: "completed",
      startedAt,
      completedAt,
      progress: createProgress(),
    });
    const errorTask = createTask({
      sessionID: "ses_error123456",
      status: "error",
      startedAt,
      completedAt,
      progress: createProgress(),
    });
    const showToast = mock(() => Promise.resolve());
    const client = { tui: { showToast } };

    showProgressToast([successTask, errorTask], client as any, () => [successTask, errorTask]);

    expect(showToast).toHaveBeenCalled();
    const message = getToastMessage(showToast);
    expect(message).toContain("✓ ▰▰▰ [explorer#");
    expect(message).toContain("✗ ▱▱▱ [explorer#");
  });

  test("T5: progressBarFrame advances on phase change", async () => {
    const snapshots = [
      [{ info: { role: "user" }, parts: [{ type: "text", text: "hello" }] }],
      [{ info: { role: "assistant" }, parts: [{ type: "text", text: "stream" }] }],
    ];
    let index = 0;
    const client = {
      session: {
        messages: mock(() => Promise.resolve({ data: snapshots[Math.min(index++, snapshots.length - 1)] })),
      },
    };
    const task = createTask({
      progress: createProgress({
        phase: "waiting",
        progressBarFrame: 0,
        _prevPhase: "waiting",
        toolCalls: 0,
        textCharCount: 0,
      }),
    });

    await updateTaskProgress(task, client as any);
    await updateTaskProgress(task, client as any);

    expect(task.progress?.progressBarFrame).toBe(1);
  });

  test("T6: brailleFrame increments every poll", async () => {
    const snapshots = [
      [{ info: { role: "assistant" }, parts: [{ type: "text", text: "stream" }] }],
      [{ info: { role: "assistant" }, parts: [{ type: "text", text: "stream" }] }],
    ];
    let index = 0;
    const client = {
      session: {
        messages: mock(() => Promise.resolve({ data: snapshots[Math.min(index++, snapshots.length - 1)] })),
      },
    };
    const task = createTask({
      progress: createProgress({
        phase: "streaming",
        brailleFrame: 0,
      }),
    });

    await updateTaskProgress(task, client as any);
    await updateTaskProgress(task, client as any);

    expect(task.progress?.brailleFrame).toBe(2);
  });
});