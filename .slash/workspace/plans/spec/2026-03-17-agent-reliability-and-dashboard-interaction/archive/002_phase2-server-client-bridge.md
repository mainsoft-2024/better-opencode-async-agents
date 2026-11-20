---
created: 2026-03-17T23:30:00+09:00
last_updated: 2026-03-17T23:45:00+09:00
type: spec
change_id: 2026-03-17-agent-reliability-and-dashboard-interaction
plan_number: 2
status: done
trigger: "Phase 2: Server-Client Bridge — POST endpoints for restart/resume/cancel, SSE events wired, dashboard store + types + hooks extended"
depends_on: "001_phase1-server-core.md"
next: "003_phase3-dashboard-ui.md"
---

# Plan: Phase 2 — Server-Client Bridge (API Routes + SSE Events + Dashboard State)

## Background & Research

### 1. Current Route Handler Pattern (`src/server/routes.ts` lines 20-25)
All current routes are GET-only. Route handlers receive `(req, manager)` and return `Response`:
```ts
export interface RouteManager {
  getAllTasks(): BackgroundTask[];
  getTask(id: string): BackgroundTask | undefined;
  getTaskMessages(sessionID: string): Promise<Array<unknown>>;
  getFilteredMessages(sessionID: string, filter: MessageFilter): Promise<FilteredMessage[]>;
}
```
New POST routes need an extended interface with `launch`, `cancelTask`, `sendResumePromptAsync`, `emitTaskEvent`, `getFilteredMessages`.

### 2. Route Registration (`src/server/index.ts` lines 92-137)
Routes are dispatched inside `Bun.serve({ fetch(req) { ... } })`. Pattern-based matching with regex:
```ts
const url = new URL(req.url);
const path = url.pathname;
// Exact matches first
if (path === "/v1/health") return handleHealth(req, manager);
// Regex matches for parameterized routes
const logsMatch = path.match(/^\/v1\/tasks\/([^/]+)\/logs$/);
if (logsId) return handleTaskLogs(req, manager, logsId);
// ... 404 fallback at the end
return errorResponse("Not Found", 404);
```
POST routes need to be added BEFORE the 404 fallback. Method checking via `req.method === "POST"`.

### 3. CORS Configuration (`src/server/cors.ts`)
Currently only allows GET and OPTIONS:
```ts
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
```
Must be updated to include POST: `"GET, POST, OPTIONS"`.

### 4. Response Helpers (`src/server/cors.ts`)
```ts
export function jsonResponse(data: unknown, status = 200): Response { ... }
export function errorResponse(error: string, status: number): Response { ... }
```

### 5. SSE Event Types — Already Phase 1 Extended (`src/server/types.ts` lines 84-93)
```ts
export type SSEEventType =
  | "snapshot" | "task.created" | "task.updated" | "task.completed"
  | "task.error" | "task.cancelled" | "task.stuck" | "task.restarted"
  | "heartbeat";
```
SSE types `task.stuck` and `task.restarted` already exist. Events are already emitted from manager (lines 688, 725). No SSE server changes needed — the broadcaster already forwards all emitted events.

### 6. SSEBroadcaster (`src/server/sse.ts` lines 11-73)
```ts
export class SSEBroadcaster {
  broadcast(eventType: SSEEventType, data: unknown): void { /* sends to all subscribers */ }
}
```

### 7. Manager Methods for POST Routes (`src/manager/index.ts`)
Already implemented — these are what POST routes will call:
```ts
// Force restart (lines 124-143)
async launch(input: LaunchInput): Promise<BackgroundTask>

// Cancel (lines 183-190)
async cancelTask(taskId: string): Promise<void>

// Resume async (lines 542-639)
async sendResumePromptAsync(
  task: BackgroundTask,
  message: string,
  toolContext: { sessionID: string; messageID: string; agent: string }
): Promise<void>

// Task access
getTask(id: string): BackgroundTask | undefined
getAllTasks(): BackgroundTask[]
getFilteredMessages(sessionID: string, filter: MessageFilter): Promise<FilteredMessage[]>
emitTaskEvent(eventType: TaskEventType, task: BackgroundTask): void
```

### 8. Force Restart Tool Pattern (`src/tools/force-restart.ts`)
Shows exact restart flow:
```ts
// 1. Validate task exists
const oldTask = manager.getTask(args.task_id);
// 2. Check max restart attempts
if (currentRestartCount >= maxAttempts) return error;
// 3. Fetch last 10 messages for context
const messages = await manager.getFilteredMessages(oldTask.sessionID, { fullSession: true, includeThinking: false, messageLimit: 10 });
// 4. Build restart prompt
const restartPrompt = `[FORCE RESTART - Attempt ${newRestartCount}/${maxAttempts}]...`;
// 5. Launch new task
const newTask = await manager.launch({ ... });
// 6. Copy restart metadata to new task
newTask.restartCount = newRestartCount;
newTask.originalTaskId = oldTask.originalTaskId ?? oldTask.sessionID;
// 7. Mark old task
oldTask.status = "force-restarted";
// 8. Emit event
manager.emitTaskEvent("task.restarted", newTask);
```

### 9. Dashboard BackgroundTask Type (`dashboard/src/types.ts` lines 1, 18-39)
Missing Phase 1 fields — needs extending:
```ts
export type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled" | "resumed";
// Missing: "stuck" | "force-restarted" | "auto-restarted"

export interface BackgroundTask {
  sessionID: string; parentSessionID: string; parentMessageID: string; parentAgent: string;
  description: string; prompt: string; agent: string; status: BackgroundTaskStatus;
  startedAt: string; completedAt?: string; resultRetrievedAt?: string; result?: string;
  error?: string; progress?: TaskProgress; batchId: string; resumeCount: number;
  isForked: boolean; pendingResume?: { prompt: string; queuedAt: string };
  instanceId?: string; instanceName?: string;
  // Missing: lastActivityAt, stuckAt, restartCount, originalTaskId, restartHistory, autoRestart, stuckTimeoutSeconds, maxRestartAttempts
}
```

### 10. Dashboard SSEEventType (`dashboard/src/types.ts` lines 110-112)
Missing new event types:
```ts
export type SSEEventType =
  | "snapshot" | "task.created" | "task.updated"
  | "task.completed" | "task.error" | "task.cancelled" | "heartbeat";
// Missing: "task.stuck" | "task.restarted"
```

### 11. Dashboard agentStore (`dashboard/src/stores/agentStore.ts`)
Store uses compound keys `${instanceId}:${sessionID}`. Key actions:
```ts
applyTaskEventFromInstance: (instanceId, task) => {
  const key = `${instanceId}:${task.sessionID}`;
  const tasksById = { ...state.tasksById, [key]: { ...task, instanceId, _compoundKey: key } };
  return { tasksById, taskOrder: getTaskOrderFromRecord(tasksById) };
};
```
Existing selectors: `selectRootTasks`, `selectRunningTasks`, `selectFilteredRootTasks`.
Missing: `selectStuckTasks`.

### 12. Dashboard useMultiSSE (`dashboard/src/hooks/useMultiSSE.ts` lines 100-119)
Handles task delta events via `handleTaskDelta` closure:
```ts
const handleTaskDelta = (forcedStatus?: BackgroundTask["status"]) => (event: MessageEvent<string>) => {
  const payload = JSON.parse(event.data) as TaskDeltaEvent;
  const nextTask = forcedStatus ? { ...payload.task, status: forcedStatus } : payload.task;
  useAgentStore.getState().applyTaskEventFromInstance(instanceId, nextTask);
};
source.addEventListener("task.created", handleTaskDelta());
source.addEventListener("task.updated", handleTaskDelta());
source.addEventListener("task.completed", handleTaskDelta("completed"));
source.addEventListener("task.error", handleTaskDelta("error"));
source.addEventListener("task.cancelled", handleTaskDelta("cancelled"));
// Missing: task.stuck, task.restarted
```

### 13. Dashboard TaskCard (`dashboard/src/components/TaskCard.tsx` lines 10-16)
Status badge styles — needs new entries:
```ts
const STATUS_BADGE_STYLES: Record<BackgroundTaskStatus, string> = {
  running: "bg-blue-500/20 text-blue-300 border-blue-400/40",
  completed: "bg-green-500/20 text-green-300 border-green-400/40",
  error: "bg-red-500/20 text-red-300 border-red-400/40",
  cancelled: "bg-gray-500/20 text-gray-300 border-gray-400/40",
  resumed: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40",
  // Missing: stuck, "force-restarted", "auto-restarted"
};
```

### 14. Manager RouteManager Extension Approach
The POST routes need access to more manager methods than the current `RouteManager` interface provides. Two approaches:
- **Approach A**: Extend `RouteManager` interface with new methods (clean but requires updating the interface)
- **Approach B**: Pass full manager reference alongside the restricted interface
- **Decision**: Extend `RouteManager` to include `forceRestart`, `cancelTask`, `sendResumePromptAsync`, `emitTaskEvent`, `launch`, `persistTask` — keep it typed and explicit.

### Key Design Decisions
- **POST /v1/tasks/:id/restart**: Reuses the exact same logic as `force-restart.ts` tool — extracts it into a shared function called from both the tool and the route handler.
- **POST /v1/tasks/:id/resume**: Calls `sendResumePromptAsync()` (fire-and-forget) since it can take minutes. Returns `{ status: "resumed" }` immediately.
- **POST /v1/tasks/:id/cancel**: Calls `cancelTask()` synchronously.
- **Dashboard hooks**: `useTaskActions` hook with `restart(taskId)`, `resume(taskId, message)`, `cancel(taskId)` — derives API URL from instanceId.

---

## Testing Plan (TDD - tests first)

### Test File: `src/server/__tests__/routes.test.ts` (add POST route tests)
- [ ] Test: POST /v1/tasks/:id/restart returns new task info on success
- [ ] Test: POST /v1/tasks/:id/restart returns 404 for missing task
- [ ] Test: POST /v1/tasks/:id/restart returns 400 when max attempts exceeded
- [ ] Test: POST /v1/tasks/:id/resume returns `{ status: "resumed" }` with valid message
- [ ] Test: POST /v1/tasks/:id/resume returns 400 when message is missing
- [ ] Test: POST /v1/tasks/:id/resume returns 404 for missing task
- [ ] Test: POST /v1/tasks/:id/cancel returns `{ status: "cancelled" }`
- [ ] Test: POST /v1/tasks/:id/cancel returns 404 for missing task
- [ ] Test: POST /v1/tasks/:id/cancel returns 400 for non-cancellable status (completed)

### Test File: `dashboard/src/__tests__/types-and-store.test.ts` (new)
- [ ] Test: agentStore handles `task.stuck` event via `applyTaskEventFromInstance`
- [ ] Test: agentStore handles `task.restarted` event via `applyTaskEventFromInstance`
- [ ] Test: `selectStuckTasks` returns tasks with status "stuck"
- [ ] Test: `selectStuckTasks` returns empty when no stuck tasks
- [ ] Test: BackgroundTaskStatus type includes "stuck", "force-restarted", "auto-restarted"

---

## Implementation Plan

### A. CORS Update (`src/server/cors.ts`)
- [ ] Update `Access-Control-Allow-Methods` from `"GET, OPTIONS"` to `"GET, POST, OPTIONS"`

### B. Extend RouteManager Interface (`src/server/routes.ts`)
- [ ] Add to `RouteManager` interface: `cancelTask(taskId: string): Promise<void>`
- [ ] Add to `RouteManager` interface: `launch(input: any): Promise<BackgroundTask>`
- [ ] Add to `RouteManager` interface: `sendResumePromptAsync(task: BackgroundTask, message: string, toolContext: any): Promise<void>`
- [ ] Add to `RouteManager` interface: `emitTaskEvent(eventType: string, task: BackgroundTask): void`
- [ ] Add to `RouteManager` interface: `persistTask(task: BackgroundTask): Promise<void>`

### C. POST Route Handlers (`src/server/routes.ts`)
- [ ] Implement `handleTaskRestart(req, manager, id)`: parse JSON body, validate task exists (404), check max attempts (400), fetch context messages, build restart prompt, launch new task, copy metadata, mark old task, emit event, return result
- [ ] Implement `handleTaskResume(req, manager, id)`: parse JSON body `{ message }`, validate message present (400), validate task exists (404), validate task is resumable (running/resumed/stuck → 400 otherwise), call `sendResumePromptAsync()` fire-and-forget, return `{ status: "resumed" }`
- [ ] Implement `handleTaskCancel(req, manager, id)`: validate task exists (404), validate task is cancellable (running/resumed → 400 otherwise), call `cancelTask()`, return `{ status: "cancelled" }`

### D. Register POST Routes (`src/server/index.ts`)
- [ ] Add regex match for `/v1/tasks/:id/restart` with method POST check BEFORE existing `/v1/tasks/:id` match
- [ ] Add regex match for `/v1/tasks/:id/resume` with method POST check
- [ ] Add regex match for `/v1/tasks/:id/cancel` with method POST check
- [ ] Pass full manager (not just RouteManager subset) to POST handlers since they need extended methods

### E. Dashboard Type Updates (`dashboard/src/types.ts`)
- [ ] Add `"stuck" | "force-restarted" | "auto-restarted"` to `BackgroundTaskStatus`
- [ ] Add to `BackgroundTask`: `lastActivityAt?: number`, `stuckAt?: number`, `restartCount?: number`, `originalTaskId?: string`, `restartHistory?: Array<{ timestamp: number; reason: string; previousTaskId: string; errorMessage?: string }>`, `autoRestart?: boolean`, `stuckTimeoutSeconds?: number`, `maxRestartAttempts?: number`
- [ ] Add `"task.stuck" | "task.restarted"` to `SSEEventType`

### F. Dashboard Store Extensions (`dashboard/src/stores/agentStore.ts`)
- [ ] Add `selectStuckTasks` selector: filters tasks where `status === "stuck"`
- [ ] Export `useStuckTasks` hook

### G. Dashboard SSE Event Handlers (`dashboard/src/hooks/useMultiSSE.ts`)
- [ ] Add `source.addEventListener("task.stuck", handleTaskDelta("stuck"))` — uses existing handleTaskDelta with forced status "stuck"
- [ ] Add `source.addEventListener("task.restarted", handleTaskDelta())` — no forced status, task data includes new status

### H. Dashboard TaskCard Status Styles (`dashboard/src/components/TaskCard.tsx`)
- [ ] Add `stuck: "bg-red-500/20 text-red-300 border-red-400/40 animate-pulse"` to `STATUS_BADGE_STYLES`
- [ ] Add `"force-restarted": "bg-orange-500/20 text-orange-300 border-orange-400/40"` to `STATUS_BADGE_STYLES`
- [ ] Add `"auto-restarted": "bg-orange-500/20 text-orange-300 border-orange-400/40"` to `STATUS_BADGE_STYLES`

### I. Dashboard useTaskActions Hook (`dashboard/src/hooks/useTaskActions.ts` — NEW)
- [ ] Create hook returning `{ restart(taskId, instanceUrl), resume(taskId, message, instanceUrl), cancel(taskId, instanceUrl) }`
- [ ] Each function does `fetch(\`${instanceUrl}/v1/tasks/${taskId}/action\`, { method: "POST", body: JSON.stringify(...) })`
- [ ] Return `{ loading, error, result }` state per action
- [ ] Derive instanceUrl from `instancesById` store using compound key

---

## Parallelization Plan

### Batch 1 (parallel) — Tests + Server Routes + CORS
- [ ] Coder A: Tests + CORS + RouteManager extension + POST route handlers
  - Files: `src/server/__tests__/routes.test.ts`, `src/server/cors.ts`, `src/server/routes.ts`
  - Tasks: Testing Plan (POST route tests), A (CORS), B (RouteManager), C (POST handlers)

- [ ] Coder B: Dashboard types + store + SSE handlers + TaskCard styles + useTaskActions hook
  - Files: `dashboard/src/types.ts`, `dashboard/src/stores/agentStore.ts`, `dashboard/src/hooks/useMultiSSE.ts`, `dashboard/src/components/TaskCard.tsx`, `dashboard/src/hooks/useTaskActions.ts` (NEW), `dashboard/src/__tests__/types-and-store.test.ts` (NEW)
  - Tasks: Testing Plan (dashboard tests), E (types), F (store), G (SSE handlers), H (TaskCard styles), I (useTaskActions)

### Batch 2 (after Batch 1) — Route Registration + Integration
- [ ] Coder C: Register POST routes in server index + verify end-to-end
  - Files: `src/server/index.ts`
  - Tasks: D (register routes)

### Dependencies
- Batch 1: Coder A and B write to completely different file sets — safe to parallelize
- Batch 2: Coder C needs route handlers from Coder A to exist in `routes.ts` before importing them in `index.ts`
- Dashboard types (Coder B) are independent of server routes (Coder A)

### Risk Areas
- **CORS update**: Must happen for POST requests from dashboard to work. Coder A handles this alongside routes.
- **RouteManager interface extension**: Server index.ts (Coder C) must pass the right manager shape. Coder C handles the interface alignment.
- **handleTaskRestart logic duplication**: Route handler replicates force-restart.ts logic rather than importing it (different input interface — tool vs HTTP request). Accept duplication for clean separation.
- **sendResumePromptAsync toolContext**: Dashboard POST /resume doesn't have a real parent tool context. Use a synthetic context: `{ sessionID: "dashboard", messageID: "dashboard-resume", agent: "dashboard" }`.

---

## Done Criteria
- [ ] `npm run build` passes with no TypeScript errors
- [ ] All new route tests pass (`bun test src/server/__tests__/routes.test.ts`)
- [ ] All new dashboard tests pass
- [ ] POST /v1/tasks/:id/restart creates new task and marks old as force-restarted
- [ ] POST /v1/tasks/:id/resume sends message to running task
- [ ] POST /v1/tasks/:id/cancel cancels a running task
- [ ] CORS allows POST requests from dashboard origin
- [ ] Dashboard `BackgroundTaskStatus` includes "stuck", "force-restarted", "auto-restarted"
- [ ] Dashboard `BackgroundTask` interface has all 8 reliability fields
- [ ] Dashboard `SSEEventType` includes "task.stuck" and "task.restarted"
- [ ] `useMultiSSE` handles `task.stuck` and `task.restarted` events
- [ ] `selectStuckTasks` selector works correctly
- [ ] `useTaskActions` hook provides restart/resume/cancel functions
- [ ] TaskCard `STATUS_BADGE_STYLES` includes stuck/force-restarted/auto-restarted entries
- [ ] Dashboard build passes (`npm run build:dashboard`)
