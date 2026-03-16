---
created: 2026-03-16T08:15:00Z
last_updated: 2026-03-16T08:15:00Z
type: spec
change_id: 2026-03-16-absorb-omo-background-features
plan_number: 3
status: pending
trigger: "Consolidate phases 3-8 into 3 phases. Phase 3 = all remaining backend: resume extension, HTTP API, discovery"
depends_on: "002 (completed)"
next: "004_dashboard.md"
---

# Plan: Resume Extension + HTTP API + Discovery

## Background & Research

### Resume — Current validation logic (`src/tools/resume.ts` lines 34-72):
```ts
export async function validateResumeTask(
  manager: ResumeManager,
  taskId: string
): Promise<ResumeValidationResult> {
  const resolvedId = await manager.resolveTaskIdWithFallback(taskId);
  if (!resolvedId) {
    return { valid: false, error: ERROR_MESSAGES.taskNotFoundWithHint(taskId) };
  }
  const task = await manager.getTaskWithFallback(resolvedId);
  if (!task) {
    return { valid: false, error: ERROR_MESSAGES.taskNotFoundWithHint(taskId) };
  }
  if (task.status === "resumed") {
    return { valid: false, error: ERROR_MESSAGES.taskCurrentlyResuming };
  }
  // THIS IS THE RESTRICTION TO REMOVE:
  if (task.status !== "completed") {
    return { valid: false, error: ERROR_MESSAGES.onlyCompletedCanResume(task.status) };
  }
  return { valid: true, task };
}
```

### Resume — Current executeResume (`src/tools/resume.ts` lines 82-124):
```ts
export async function executeResume(
  manager: ResumeManager,
  task: BackgroundTask,
  prompt: string,
  toolContext: any
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  setTaskStatus(task, "resumed");
  task.resumeCount++;
  await manager.persistTask(task);
  try {
    const sessionExists = await manager.checkSessionExists(task.sessionID);
    if (!sessionExists) {
      setTaskStatus(task, "completed");
      await manager.persistTask(task);
      return { success: false, error: ERROR_MESSAGES.sessionExpired };
    }
    manager.sendResumePromptAsync(task, prompt, toolContext);
    return { success: true, message: SUCCESS_MESSAGES.resumeInitiated(shortId(task.sessionID), task.resumeCount) };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    setTaskStatus(task, "error", { error: errorMsg });
    await manager.persistTask(task);
    return { success: false, error: ERROR_MESSAGES.resumeFailed(errorMsg) };
  }
}
```

### BackgroundTask type (`src/types.ts` lines 54-73) — already has pendingResume:
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

### ResumeManager interface (`src/tools/resume.ts` lines 9-18):
```ts
export interface ResumeManager {
  getTask(taskId: string): BackgroundTask | undefined;
  resolveTaskId(idOrPrefix: string): string | null;
  resolveTaskIdWithFallback(idOrPrefix: string): Promise<string | null>;
  getTaskWithFallback(id: string): Promise<BackgroundTask | undefined>;
  persistTask(task: BackgroundTask): Promise<void>;
  checkSessionExists(sessionID: string): Promise<boolean>;
  sendResumePromptAsync(task: BackgroundTask, message: string, toolContext: any): Promise<void>;
}
```

### HTTP Server route registration (`src/server/index.ts` lines 80-107):
```ts
// Route matching
if (path === "/v1/health") return handleHealth(req, manager);
if (path === "/v1/stats") return handleStats(req, manager);
if (path === "/v1/tasks") return handleTaskList(req, manager);
if (path === "/v1/events") return handleSSERequest(req, broadcaster, dataProvider);

const logsMatch = path.match(/^\/v1\/tasks\/([^/]+)\/logs$/);
if (logsMatch?.[1]) return handleTaskLogs(req, manager, logsMatch[1]);

const taskMatch = path.match(/^\/v1\/tasks\/([^/]+)$/);
if (taskMatch?.[1]) return handleTaskDetail(req, manager, taskMatch[1]);

const groupMatch = path.match(/^\/v1\/task-groups\/([^/]+)$/);
if (groupMatch?.[1]) return handleTaskGroup(req, manager, groupMatch[1]);

return errorResponse("Not Found", 404);
```

### RouteManager interface (`src/server/routes.ts` lines 17-21):
```ts
export interface RouteManager {
  getAllTasks(): BackgroundTask[];
  getTask(id: string): BackgroundTask | undefined;
  getTaskMessages(sessionID: string): Promise<Array<unknown>>;
}
```

### Route test patterns (`src/server/__tests__/routes.test.ts` lines 18-38):
```ts
const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: `ses_${Math.random().toString(36).substring(2, 10)}`,
  parentSessionID: "ses_parent123",
  parentMessageID: "msg_parent123",
  parentAgent: "parent-agent",
  description: "Test task description",
  prompt: "Test prompt content",
  agent: "explore",
  status: "running",
  startedAt: new Date("2024-01-01T10:00:00Z").toISOString(),
  batchId: "batch_test123",
  resumeCount: 0,
  isForked: false,
  ...overrides,
});

const createMockManager = (tasks: BackgroundTask[] = []): RouteManager => ({
  getAllTasks: () => tasks,
  getTask: (id: string) => tasks.find((t) => t.sessionID === id),
  getTaskMessages: mock(() => Promise.resolve([{ role: "assistant", content: "result" }])),
});
```

### Task completion handler (`src/manager/task-lifecycle.ts` lines 281-328):
```ts
// checkAndUpdateTaskStatus — when status === 'running' and idle detected:
if (sessionStatus?.type === "idle") {
  task.status = "completed";
  task.completedAt = new Date().toISOString();
  emitTaskEvent?.("task.completed", task);
  if (!skipNotification) { notifyParentSession(task); }
  return task;
}
```
**Key:** This is where `pendingResume` auto-execution must be added — after `task.status = "completed"` but before return.

### Server types (`src/server/types.ts`) — needs MessagesResponse, InstancesResponse
### Constants (`src/constants.ts`) — needs DISCOVERY_SERVICE_TYPE, DISCOVERY_TIMEOUT_MS
### Package.json — needs `bonjour-service` dependency

### Design spec for messages endpoint:
```ts
// GET /v1/tasks/:id/messages?full_session=true&include_thinking=true&since_message_id=xxx&message_limit=50
async function handleTaskMessages(req: Request, manager: MessageRouteManager, id: string): Promise<Response> {
  const url = new URL(req.url);
  const filter: MessageFilter = {
    fullSession: url.searchParams.get("full_session") === "true",
    includeThinking: url.searchParams.get("include_thinking") === "true",
    includeToolResults: url.searchParams.get("include_tool_results") === "true",
    sinceMessageId: url.searchParams.get("since_message_id") ?? undefined,
    messageLimit: parseInt(url.searchParams.get("message_limit") ?? "50") || undefined,
    thinkingMaxChars: parseInt(url.searchParams.get("thinking_max_chars") ?? "0") || undefined,
  };
  const messages = await manager.getFilteredMessages(id, filter);
  return jsonResponse({ messages, taskId: id, filter });
}
```

### Design spec for InstanceDiscovery:
```ts
import { Bonjour } from 'bonjour-service';
export class InstanceDiscovery {
  private bonjour: Bonjour;
  private published?: Service;
  async advertise(port: number, metadata: Record<string, string>) { ... }
  async discover(): Promise<DiscoveredInstance[]> { ... }
  stop() { ... }
}
```

## Testing Plan (TDD - tests first)

- [ ] Create `src/tools/__tests__/resume.test.ts` — test resume from error status (reset + sendResumePromptAsync)
- [ ] In `resume.test.ts` — test resume from cancelled status (reset + sendResumePromptAsync)
- [ ] In `resume.test.ts` — test resume from running status (stores pendingResume, returns queue confirmation)
- [ ] In `resume.test.ts` — test queue-full rejection (running task + existing pendingResume → error)
- [ ] In `resume.test.ts` — test resumed status still rejected (no change)
- [ ] In `resume.test.ts` — test completed status still works (backward compat)
- [ ] Add to `src/server/__tests__/routes.test.ts` — test `handleTaskMessages()` returns filtered messages
- [ ] Add to `routes.test.ts` — test `handleTaskMessages()` with query params mapping
- [ ] Add to `routes.test.ts` — test `handleTaskMessages()` task not found → 404
- [ ] Add to `routes.test.ts` — test `handleInstances()` returns discovered instances
- [ ] Create `src/server/__tests__/discovery.test.ts` — test InstanceDiscovery advertise/discover/stop lifecycle

## Implementation Plan

- [ ] Update `src/tools/resume.ts` `validateResumeTask()` — remove `completed`-only check (lines 64-69), allow running/error/cancelled statuses through
- [ ] Update `src/tools/resume.ts` `executeResume()` — add running-task queue branch: if `task.status === "running"`, check if `task.pendingResume` exists (reject if so), else set `task.pendingResume = { prompt, queuedAt }`, persist, return queue confirmation
- [ ] For error/cancelled in `executeResume()`: reset status to "resumed", increment resumeCount, call sendResumePromptAsync (same as completed flow)
- [ ] Update error/success messages — add `ERROR_MESSAGES.queueFull` and `SUCCESS_MESSAGES.resumeQueued` to `src/prompts.ts`
- [ ] Update `src/manager/task-lifecycle.ts` `checkAndUpdateTaskStatus()` — after setting `task.status = "completed"`, check `task.pendingResume`: if present, extract prompt, clear pendingResume, set "resumed", increment resumeCount, call sendResumePromptAsync
- [ ] Create `src/server/discovery.ts` — InstanceDiscovery class with advertise/discover/stop using bonjour-service
- [ ] Update `src/constants.ts` — add `DISCOVERY_SERVICE_TYPE = "bgagent-api"` and `DISCOVERY_TIMEOUT_MS = 3000`
- [ ] Update `src/server/types.ts` — add `MessagesResponse` and `InstancesResponse` types
- [ ] Extend `RouteManager` in `src/server/routes.ts` — add `getFilteredMessages(sessionID, filter)` method to interface
- [ ] Add `handleTaskMessages()` handler in `src/server/routes.ts`
- [ ] Add `handleInstances()` handler in `src/server/routes.ts`
- [ ] Update `src/server/index.ts` — register `/v1/tasks/:id/messages` route (regex match before task detail), `/v1/instances` route, and `/dashboard/**` static serving
- [ ] Update `src/server/index.ts` — instantiate InstanceDiscovery, call advertise() on start, stop() on shutdown
- [ ] Update `package.json` — add `bonjour-service` dependency

## Parallelization Plan

### Batch 1 (parallel — tests + independent files)
- [ ] Coder A: Resume tests → file: `src/tools/__tests__/resume.test.ts` (new file)
- [ ] Coder B: Route tests (messages + instances) + discovery tests → files: `src/server/__tests__/routes.test.ts` (append), `src/server/__tests__/discovery.test.ts` (new file)
- [ ] Coder C: Discovery class + constants + server types + bonjour dep → files: `src/server/discovery.ts` (new), `src/constants.ts`, `src/server/types.ts`, `package.json`

### Batch 2 (after Batch 1 — implementation using tests as guide)
- [ ] Coder D: Resume extension → files: `src/tools/resume.ts`, `src/prompts.ts`
- [ ] Coder E: Task lifecycle pendingResume handler → file: `src/manager/task-lifecycle.ts`
- [ ] Coder F: HTTP routes + server registration → files: `src/server/routes.ts`, `src/server/index.ts`

### Dependencies
- Batch 1 can fully parallelize because tests are in separate files and Coder C creates new files + appends to constants/types.
- Batch 2 depends on Batch 1: Coder D needs resume.test.ts patterns, Coder F needs discovery.ts and server types to exist.
- Coder D (resume.ts) and Coder E (task-lifecycle.ts) touch different files — safe to parallelize.
- Coder F (routes.ts + index.ts) must not conflict with Coder D/E since they touch different directories.

### Risk Areas
- `src/server/routes.ts` RouteManager interface change (Coder F) affects route tests (Coder B wrote them). Coder B should use the extended interface in tests.
- `checkAndUpdateTaskStatus` in task-lifecycle.ts needs access to `sendResumePromptAsync` — may need to pass it as a parameter or import from manager.
- `bonjour-service` may not be fully Bun-compatible — InstanceDiscovery should gracefully handle import failures.

## Done Criteria
- [ ] All resume tests pass (error, cancelled, running, queue-full, backward-compat)
- [ ] All route tests pass (messages endpoint, instances endpoint)
- [ ] Discovery test passes (lifecycle)
- [ ] `bun run typecheck` passes
- [ ] Resume from error/cancelled/running works correctly
- [ ] `/v1/tasks/:id/messages` returns filtered messages
- [ ] `/v1/instances` returns discovered instances
- [ ] InstanceDiscovery advertises on server start