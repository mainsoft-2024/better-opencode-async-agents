---
created: 2026-03-17T22:30:00+09:00
last_updated: 2026-03-17T23:15:00+09:00
type: spec
change_id: 2026-03-17-agent-reliability-and-dashboard-interaction
plan_number: 1
status: done
trigger: "Phase 1: Server Core — lastActivityAt tracking, stuck detection, auto-restart, bgagent_force_restart tool"
depends_on: "none"
next: "002_phase2-server-client-bridge.md"
---

# Plan: Phase 1 — Server Core (Stuck Detection + Force Restart + Activity Tracking)

## Background & Research

### 1. BackgroundTask Interface (src/types.ts lines 54-73)
Current interface — needs new fields for activity/stuck/restart tracking:
```ts
export interface BackgroundTask {
  sessionID: string;
  parentSessionID: string;
  parentMessageID: string;
  parentAgent: string;
  description: string;
  prompt: string;
  agent: string;
  status: BackgroundTaskStatus;
  startedAt: string;
  completedAt?: string;
  resultRetrievedAt?: string;
  result?: string;
  error?: string;
  progress?: TaskProgress;
  batchId: string;
  resumeCount: number;
  isForked: boolean;
  pendingResume?: { prompt: string; queuedAt: string };
}
```

Current status type (line 7):
```ts
export type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled" | "resumed";
```

### 2. Task Creation (src/manager/task-lifecycle.ts lines 118-144)
Where task objects are created — needs new field initialization:
```ts
const task: BackgroundTask = {
  sessionID,
  parentSessionID: input.parentSessionID,
  parentMessageID: input.parentMessageID,
  parentAgent: input.parentAgent,
  description: input.description,
  prompt: input.prompt,
  agent: input.agent,
  status: "running",
  startedAt: new Date().toISOString(),
  batchId,
  resumeCount: 0,
  isForked: input.fork ?? false,
  progress: { /* ... animation fields ... */ },
};
```

### 3. Polling Loop (src/manager/polling.ts lines 53-191)
The `pollRunningTasks()` function iterates all tasks every 100ms. It checks session status, updates progress, detects completion. Stuck detection should be added here. Key signature:
```ts
export async function pollRunningTasks(
  client: OpencodeClient,
  tasks: Map<string, BackgroundTask>,
  originalParentSessionID: string | null,
  updateTaskProgress: (task: BackgroundTask) => Promise<void>,
  notifyParentSession: (task: BackgroundTask) => void,
  clearAllTasks: () => void,
  stopPolling: () => void,
  showProgressToast: (allTasks: BackgroundTask[]) => void,
  getTasksArray: () => BackgroundTask[],
  getTaskMessages?: (...) => Promise<...>,
  persistTask?: (task: BackgroundTask) => void,
  emitTaskEvent?: (eventType: ..., task: BackgroundTask) => void
): Promise<void>
```

### 4. BackgroundManager (src/manager/index.ts)
- Tasks stored in `private tasks: Map<string, BackgroundTask>` (line 56)
- Event system: `TaskEventType = "task.created" | "task.updated" | "task.completed" | "task.error" | "task.cancelled"` (lines 37-42)
- `emitTaskEvent()` broadcasts to all listeners (lines 85-93)
- `pollRunningTasks()` wrapper at lines 646-661 passes all dependencies
- `launch()` method at lines 117-136 calls `launchTask()` then emits `task.created`

### 5. Constants (src/constants.ts)
Currently no stuck detection constants. Has:
```ts
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MAX_SSE_SUBSCRIBERS = 50;
```

### 6. SSE Event Types (src/server/types.ts lines 84-91)
```ts
export type SSEEventType =
  | "snapshot" | "task.created" | "task.updated" | "task.completed"
  | "task.error" | "task.cancelled" | "heartbeat";
```

### 7. Tools Index (src/tools/index.ts)
```ts
export { createBackgroundTask } from "./task";
export { createBackgroundOutput } from "./output";
export { createBackgroundCancel } from "./cancel";
export { createBackgroundList } from "./list";
export { createBackgroundClear } from "./clear";
```

### 8. Tool Descriptions (src/prompts.ts lines 12-74)
`TOOL_DESCRIPTIONS` object with `backgroundTask`, `backgroundList`, `backgroundCancel`, `backgroundOutput`, `backgroundClear`. No `backgroundForceRestart` yet.

### 9. Route Manager Interface (src/server/routes.ts lines 20-25)
```ts
export interface RouteManager {
  getAllTasks(): BackgroundTask[];
  getTask(id: string): BackgroundTask | undefined;
  getTaskMessages(sessionID: string): Promise<Array<unknown>>;
  getFilteredMessages(sessionID: string, filter: MessageFilter): Promise<FilteredMessage[]>;
}
```

### 10. Server Route Mounting (src/server/index.ts lines 98-137)
Routes are matched with `if/else` and `path.match()` inside `Bun.serve({ fetch() {} })`. POST routes don't exist yet — all current routes are GET.

### 11. Test Patterns (src/server/__tests__/routes.test.ts)
```ts
import { describe, expect, mock, test } from "bun:test";
const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: `ses_${Math.random().toString(36).substring(2, 10)}`,
  parentSessionID: "ses_parent123", parentMessageID: "msg_parent123",
  parentAgent: "parent-agent", description: "Test task description",
  prompt: "Test prompt content", agent: "explore", status: "running",
  startedAt: new Date("2024-01-01T10:00:00Z").toISOString(),
  batchId: "batch_test123", resumeCount: 0, isForked: false,
  ...overrides,
});
const createMockManager = (tasks: BackgroundTask[] = []) => ({
  getAllTasks: () => tasks,
  getTask: (id: string) => tasks.find((t) => t.sessionID === id),
  getTaskMessages: mock(() => Promise.resolve([...])),
  getFilteredMessages: mock(() => Promise.resolve([...])),
});
```

### Key Design Decisions
- **Activity tracking**: Update `lastActivityAt` only on thinking/text messages, NOT tool calls
- **Stuck timeout**: 120s default, 30s MIN_RUNTIME guard
- **Auto-restart**: Default ON, max 3 attempts, immediate (no backoff)
- **New statuses**: `"stuck"`, `"force-restarted"`, `"auto-restarted"`
- **Force restart**: Collect last 10 messages from old task, create new task with same prompt + context
- **Process liveness**: `process.kill(pid, 0)` — not directly applicable since we don't store PIDs of sessions (OpenCode manages processes); skip PID check for now

---

## Testing Plan (TDD - tests first)

### Test File: src/manager/__tests__/stuck-detection.test.ts
- [ ] Test: `checkIfStuck` returns false when task has no lastActivityAt
- [ ] Test: `checkIfStuck` returns false when runtime < 30s (MIN_RUNTIME guard)
- [ ] Test: `checkIfStuck` returns false when inactivity < stuckTimeoutSeconds
- [ ] Test: `checkIfStuck` returns true when inactivity >= 120s and runtime >= 30s
- [ ] Test: `checkIfStuck` returns false when status is not "running"/"resumed"
- [ ] Test: `markStuck` sets task.stuckAt and task.status to "stuck"
- [ ] Test: Activity tracking — lastActivityAt updated on "text" message type
- [ ] Test: Activity tracking — lastActivityAt updated on "thinking" message type
- [ ] Test: Activity tracking — lastActivityAt NOT updated on "tool_use" message type
- [ ] Test: Activity tracking — stuckAt cleared when stuck task receives text message

### Test File: src/tools/__tests__/force-restart.test.ts
- [ ] Test: forceRestart creates new task with same prompt and agent
- [ ] Test: forceRestart increments restartCount on new task
- [ ] Test: forceRestart sets originalTaskId on new task
- [ ] Test: forceRestart marks old task as "force-restarted"
- [ ] Test: forceRestart returns max_attempts_exceeded when restartCount >= maxRestartAttempts
- [ ] Test: forceRestart returns error when task not found
- [ ] Test: forceRestart adds entry to restartHistory

### Test Updates: src/server/__tests__/routes.test.ts
- [ ] Update `createMockTask` fixture to include new fields (lastActivityAt, stuckAt, restartCount, etc.)

---

## Implementation Plan

### A. Type Extensions (src/types.ts)
- [ ] Add `"stuck" | "force-restarted" | "auto-restarted"` to `BackgroundTaskStatus` union
- [ ] Add `RestartHistoryEntry` interface: `{ timestamp: number; reason: 'auto-restart' | 'force-restart' | 'manual'; previousTaskId: string; errorMessage?: string }`
- [ ] Add new fields to `BackgroundTask`: `lastActivityAt?: number`, `stuckAt?: number`, `restartCount: number`, `originalTaskId?: string`, `restartHistory: RestartHistoryEntry[]`, `autoRestart: boolean`, `stuckTimeoutSeconds: number`, `maxRestartAttempts: number`
- [ ] Add new fields to `PersistedTask`: `lastActivityAt`, `stuckAt`, `restartCount`, `originalTaskId`, `restartHistory`, `autoRestart`, `stuckTimeoutSeconds`, `maxRestartAttempts`

### B. Constants (src/constants.ts)
- [ ] Add stuck detection constants: `STUCK_TIMEOUT_SECONDS = 120`, `STUCK_MIN_RUNTIME_MS = 30_000`, `STUCK_MAX_RESTART_ATTEMPTS = 3`, `STUCK_AUTO_RESTART_ENABLED = true`

### C. Task Event Types (src/manager/index.ts)
- [ ] Add `"task.stuck" | "task.restarted"` to `TaskEventType` union

### D. SSE Event Types (src/server/types.ts)
- [ ] Add `"task.stuck" | "task.restarted"` to `SSEEventType` union

### E. Task Creation (src/manager/task-lifecycle.ts)
- [ ] Initialize new fields in `launchTask()` task object: `lastActivityAt: Date.now()`, `stuckAt: undefined`, `restartCount: 0`, `originalTaskId: undefined`, `restartHistory: []`, `autoRestart: true`, `stuckTimeoutSeconds: 120`, `maxRestartAttempts: 3`
- [ ] Accept optional restart fields in LaunchInput for when creating restart tasks

### F. Stuck Detection (src/manager/stuck-detection.ts — NEW FILE)
- [ ] Create `checkIfStuck(task: BackgroundTask): boolean` — checks runtime >= 30s, inactivity >= timeout, status running/resumed
- [ ] Create `markStuck(task: BackgroundTask): void` — sets stuckAt, status='stuck'
- [ ] Create `updateActivityTracking(task: BackgroundTask, messageType: string): void` — updates lastActivityAt for text/thinking only, clears stuckAt if was stuck

### G. Polling Integration (src/manager/polling.ts)
- [ ] Import and call `checkIfStuck()` for each running task in `pollRunningTasks()`
- [ ] When stuck detected: call `markStuck()`, call emitTaskEvent with "task.stuck"
- [ ] Add `emitStuckEvent` callback parameter to `pollRunningTasks` signature

### H. Activity Tracking in Progress Updates (src/manager/polling.ts)
- [ ] In `updateTaskProgress()`, after processing messages: detect text/thinking parts and update `task.lastActivityAt` accordingly
- [ ] Do NOT update lastActivityAt for tool_use/tool_result parts

### I. Force Restart Tool (src/tools/force-restart.ts — NEW FILE)
- [ ] Create `createBackgroundForceRestart(manager)` function returning ToolDefinition
- [ ] Implement: validate task exists, check max attempts, fetch last N messages, create new task via manager.launch(), mark old task as force-restarted, emit task.restarted event
- [ ] Manager interface needs: `getTask`, `launch`, `getFilteredMessages`, `emitTaskEvent`

### J. Tool Registration (src/tools/index.ts)
- [ ] Export `createBackgroundForceRestart` from barrel

### K. Tool Description (src/prompts.ts)
- [ ] Add `backgroundForceRestart` to `TOOL_DESCRIPTIONS` object with clear description of restart behavior, context preservation, max attempts

### L. Manager Integration (src/manager/index.ts)
- [ ] Add auto-restart logic: when task marked stuck and autoRestart=true and restartCount < max, trigger force restart
- [ ] Import stuck detection functions
- [ ] Update `persistTask()` to include new fields in PersistedTask
- [ ] Wire stuck detection callbacks in `pollRunningTasks()` call

### M. Update Test Fixtures
- [ ] Update `createMockTask` in routes.test.ts to include new required fields with defaults

---

## Parallelization Plan

### Batch 1 (parallel) — Tests + Types + Constants
- [ ] Coder A: Write tests + type extensions + constants
  - Files: `src/types.ts`, `src/constants.ts`, `src/manager/__tests__/stuck-detection.test.ts`, `src/tools/__tests__/force-restart.test.ts`
  - Tasks: Type Extensions (A), Constants (B), Testing Plan (all test files)

- [ ] Coder B: Stuck detection module + activity tracking in polling
  - Files: `src/manager/stuck-detection.ts` (NEW), `src/manager/polling.ts`
  - Tasks: Stuck Detection (F), Activity Tracking in Progress (H)

### Batch 2 (after Batch 1) — Integration + Force Restart + Events
- [ ] Coder C: Force restart tool + tool registration + descriptions
  - Files: `src/tools/force-restart.ts` (NEW), `src/tools/index.ts`, `src/prompts.ts`
  - Tasks: Force Restart Tool (I), Tool Registration (J), Tool Description (K)

- [ ] Coder D: Manager integration + event types + task creation + test fixture updates
  - Files: `src/manager/index.ts`, `src/manager/task-lifecycle.ts`, `src/server/types.ts`, `src/server/__tests__/routes.test.ts`
  - Tasks: Task Event Types (C), SSE Event Types (D), Task Creation (E), Polling Integration (G), Manager Integration (L), Update Test Fixtures (M)

### Dependencies
- Batch 1 must complete first: Coder B needs types from Coder A's `src/types.ts`, and Batch 2 coders need the stuck detection module from Coder B
- Within Batch 1: Coder A (types) and Coder B (stuck-detection.ts + polling.ts) write to different files — safe to parallelize. Coder B can import types by defining them first.
- Within Batch 2: Coder C and D write to non-overlapping files — safe to parallelize.

### Risk Areas
- **polling.ts** is touched by Coder B (Batch 1) for activity tracking and needs integration by Coder D (Batch 2) for stuck check calls — sequential batches handle this
- **src/manager/index.ts** is only touched by Coder D — no conflict
- **src/types.ts** is only touched by Coder A — no conflict
- The `pollRunningTasks` function signature will change (new callback params) — Coder D handles both the function signature change and the caller update in index.ts

---

## Done Criteria
- [ ] All new tests pass (`bun test`)
- [ ] `BackgroundTask` interface has all 8 new fields
- [ ] `BackgroundTaskStatus` includes "stuck", "force-restarted", "auto-restarted"
- [ ] `checkIfStuck()` correctly implements 120s timeout with 30s guard
- [ ] `updateTaskProgress()` updates `lastActivityAt` for text/thinking only
- [ ] `bgagent_force_restart` tool creates new task with context preservation
- [ ] Stuck tasks auto-restart when `autoRestart=true` and `restartCount < maxRestartAttempts`
- [ ] `TOOL_DESCRIPTIONS.backgroundForceRestart` is clear and complete
- [ ] SSEEventType includes "task.stuck" and "task.restarted"
- [ ] TaskEventType includes "task.stuck" and "task.restarted"
- [ ] Build passes without TypeScript errors (`npm run build`)
- [ ] Existing test fixtures updated to include new required fields
