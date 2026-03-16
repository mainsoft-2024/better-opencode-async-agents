---
created: 2026-03-17T12:00:00Z
last_updated: 2026-03-17T12:00:00Z
type: spec
change_id: 2026-03-17-multi-instance-dashboard
plan_number: 1
status: pending
trigger: "Server-side instance identity + bgagent_output description fix"
depends_on: none
next: 002_phase2-multi-instance-dashboard.md
---

# Plan: Phase 1 — Server-Side Instance Identity + bgagent_output Fix

## Background & Research

### Plugin Entry — `src/index.ts` lines 23-49
```typescript
export default async function plugin(ctx: PluginInput): Promise<Hooks> {
  const manager = new BackgroundManager(ctx);

  // Start HTTP Status API server
  const server = await StatusApiServer.start(manager);
  if (server) {
    const cleanup = () => { server.stop(); };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);
  }
  return { tool: { ... }, event: async () => {} };
}
```
**Key**: `ctx` is `PluginInput` — has `ctx.directory` (cwd string). instanceId must be generated here and passed to both `BackgroundManager(ctx)` and `StatusApiServer.start(manager)`.

### Storage — `src/storage.ts` lines 162-191
```typescript
export async function writeServerInfo(info: {
  port: number;
  pid: number;
  startedAt: string;
  url: string;
  version: string;
}): Promise<void> {
  // ... writes JSON to SERVER_INFO_FILE via Bun.write or fs.writeFile
}
```
**Change needed**: Add `instanceId: string`, `directory: string`, `instanceName: string` to the parameter type. Also update `readServerInfo()` return type (lines 197-243) — same fields.

### Server Init — `src/server/index.ts` lines 27-170
```typescript
private constructor(
  private manager: RouteManager & {
    onTaskEvent?: (cb: (type: string, task: BackgroundTask) => void) => () => void;
    getAllTasks: () => BackgroundTask[];
  }
) { /* ... */ }

static async start(manager: any): Promise<StatusApiServer | null> { /* ... */ }
```
**writeServerInfo call** (lines 150-156):
```typescript
await writeServerInfo({
  port, pid: process.pid, startedAt: this.startedAt, url, version: "1.0.0",
});
```
**advertise call** (lines 162-167):
```typescript
await this.discovery.advertise(port, {
  pid: String(process.pid), startedAt: this.startedAt, url, version: "1.0.0",
});
```
**Change needed**: Pass instanceId/instanceName/directory to both calls. Receive them via `start()` parameter or store as class fields.

### Route Registration — `src/server/index.ts` lines 87-92
```typescript
if (path === "/v1/health") return handleHealth(req, manager);
if (path === "/v1/stats") return handleStats(req, manager);
if (path === "/v1/tasks") return handleTaskList(req, manager);
if (path === "/v1/events") return handleSSERequest(req, broadcaster, dataProvider);
if (path === "/v1/instances") return handleInstances(req, discovery);
```
**Pattern for new route**: Add `if (path === "/v1/info") return handleInfo(req, instanceMeta);` in same block.

### SSE Broadcaster — `src/server/sse.ts` lines 36-48, 109-113
```typescript
broadcast(eventType: SSEEventType, data: unknown): void {
  const message = this.formatSSE(eventType, data);
  // ... enqueue to all subscribers
}
```
**Snapshot payload** (lines 109-113):
```typescript
const snapshot = {
  tasks: dataProvider.getAllTasks(),
  stats: dataProvider.buildStats(),
};
broadcaster.sendTo(controller, "snapshot", snapshot);
```
**Task event broadcast** (line 142):
```typescript
this.broadcaster.broadcast(eventType as any, { task });
```
**Heartbeat** (line 118):
```typescript
broadcaster.sendTo(controller, "heartbeat", { ts: new Date().toISOString() });
```
**Change needed**: Inject instanceId+instanceName into all three data payloads. Options:
1. Extend SSEDataProvider to include instanceId/instanceName, inject in handleSSERequest
2. Or wrap broadcast() to always inject fields — cleaner approach

### mDNS Discovery — `src/server/discovery.ts` lines 23-85
```typescript
async advertise(port: number, metadata: Record<string, string>): Promise<void> {
  this.published = bonjour.publish({
    name: `bgagent-${process.pid}`,
    type: DISCOVERY_SERVICE_TYPE,
    port,
    txt: metadata,  // <-- add instanceId, directory, instanceName here
  });
}

async discover(timeoutMs?: number): Promise<DiscoveredInstance[]> {
  // ... parses service.txt into metadata: Record<string, string>
  // Already passes through all txt fields — so if advertise includes instanceId,
  // discover() will return it in metadata automatically!
}
```
**Key insight**: `discover()` already copies ALL txt fields into `metadata`. So we only need to add fields to `advertise()` call. DiscoveredInstance type should add optional typed fields for convenience.

### DiscoveredInstance Type — `src/types.ts` lines 94-99
```typescript
export type DiscoveredInstance = {
  name: string;
  host: string;
  port: number;
  metadata: Record<string, string>;
};
```
**Change**: Add optional `instanceId?: string`, `instanceName?: string`, `directory?: string` for typed access (still in metadata too).

### bgagent_output Description — `src/prompts.ts` lines 48-65
```typescript
backgroundOutput: `Get output from a background task.

Arguments:
- task_id: Required task ID to get output from
- block: ...
- full_session: ...
...

Returns:
- Current status and result (if completed)
- When full_session=true, returns filtered session messages
- When block=true, waits until task completes or timeout is reached
- When block=false (default), returns immediately with current status`,
```
**Missing**: No mention that full_session works on running tasks to get partial results. Need to add:
- `When full_session=true on a running task, returns partial results (messages available so far)`
- Note about combining with since_message_id for incremental polling

### Test Pattern — `src/server/__tests__/routes.test.ts`
```typescript
import { describe, expect, mock, test } from "bun:test";
// Mock RouteManager with createMockManager(tasks)
// Mock task with createMockTask(overrides)
// Test handler functions directly: const res = await handleXxx(req, manager);
// Assert response: expect(res.status).toBe(200); const body = await res.json();
```

### Server Response Types — `src/server/types.ts`
Key existing types: HealthResponse, StatsResponse, PaginatedTasksResponse, InstancesResponse, ErrorResponse, SSEEventType, SnapshotEvent, TaskDeltaEvent, HeartbeatEvent, ServerInfo.

---

## Testing Plan (TDD — tests first)

### Test Batch T1 (parallel with Coder A and Coder B)

#### Coder A Tests: storage + /v1/info route
- [ ] Test `writeServerInfo()` writes JSON with new fields (instanceId, directory, instanceName) — in `src/storage.test.ts` or `src/server/__tests__/routes.test.ts`
- [ ] Test `handleInfo()` returns correct shape `{ instanceId, instanceName, directory, port, pid, startedAt, version }` — in `src/server/__tests__/routes.test.ts`

#### Coder B Tests: SSE instance fields + mDNS + prompts
- [ ] Test SSE snapshot event includes instanceId + instanceName fields
- [ ] Test SSE task delta event includes instanceId + instanceName fields
- [ ] Test SSE heartbeat includes instanceId + instanceName fields
- [ ] Test DiscoveredInstance type has optional instanceId/instanceName fields

## Implementation Plan

### Batch 1 (parallel — 3 coders)

#### Coder A: Instance ID generation + storage + /v1/info
Files: `src/index.ts`, `src/storage.ts`, `src/server/routes.ts`, `src/server/types.ts`
- [ ] In `src/index.ts`: generate `const instanceId = crypto.randomUUID()` before BackgroundManager creation
- [ ] In `src/index.ts`: compute `const instanceName = path.basename(ctx.directory)` (import `path` from `node:path`)
- [ ] In `src/index.ts`: pass `{ instanceId, instanceName, directory: ctx.directory }` to `StatusApiServer.start()` as second arg
- [ ] In `src/storage.ts`: extend `writeServerInfo()` param type to include `instanceId: string`, `directory: string`, `instanceName: string`
- [ ] In `src/storage.ts`: extend `readServerInfo()` return type to include same 3 fields
- [ ] In `src/server/types.ts`: add `InfoResponse` type: `{ instanceId, instanceName, directory, port, pid, startedAt, version }`
- [ ] In `src/server/types.ts`: extend `ServerInfo` type with `instanceId`, `directory`, `instanceName`
- [ ] In `src/server/routes.ts`: add `handleInfo(req, instanceMeta)` function returning `InfoResponse`
- [ ] Write test for `handleInfo()` in `src/server/__tests__/routes.test.ts`

#### Coder B: SSE instance fields + heartbeat
Files: `src/server/sse.ts`, `src/server/index.ts` (SSE data provider + event subscription only)
- [ ] In `src/server/sse.ts`: extend `SSEDataProvider` interface to include `instanceId: string` and `instanceName: string`
- [ ] In `src/server/sse.ts`: modify `handleSSERequest()` snapshot payload to spread `{ ...snapshot, instanceId: dataProvider.instanceId, instanceName: dataProvider.instanceName }`
- [ ] In `src/server/sse.ts`: modify heartbeat payload to include `instanceId` and `instanceName`
- [ ] In `src/server/index.ts`: update `dataProvider` construction (lines 60-63) to include `instanceId` and `instanceName` from stored instance metadata
- [ ] In `src/server/index.ts`: modify task event broadcast (line 142) to inject `instanceId` and `instanceName` into `{ task, instanceId, instanceName }`

#### Coder C: mDNS metadata + types + bgagent_output description
Files: `src/types.ts`, `src/server/discovery.ts` (no code change needed — just advertise caller), `src/prompts.ts`, `src/constants.ts`
- [ ] In `src/types.ts`: add optional `instanceId?: string`, `instanceName?: string`, `directory?: string` to `DiscoveredInstance` type
- [ ] In `src/prompts.ts` line 61-65: add after `- When full_session=true, returns filtered session messages`:
  - `- When full_session=true on a running task, returns partial results (messages available so far)`
  - `- Combine with since_message_id for incremental polling of new messages from running tasks`
- [ ] In `src/prompts.ts`: add note block after Returns section:
  - `Note: full_session works for both running and completed tasks. For running tasks, it returns all messages available so far, allowing real-time progress monitoring.`

### Batch 2 (after Batch 1 — 1 coder)

#### Coder D: Integration — wire instanceId through server startup + route registration + build verify
Files: `src/server/index.ts` (startup flow + route registration)
- [ ] In `src/server/index.ts`: add `private instanceId: string`, `private instanceName: string`, `private directory: string` class fields
- [ ] Modify `static start()` to accept second arg: `instanceMeta: { instanceId: string, instanceName: string, directory: string }`
- [ ] Store instanceMeta fields in constructor or via setter before `bind()`
- [ ] Update `writeServerInfo()` call (line 150) to include `instanceId`, `directory`, `instanceName`
- [ ] Update `this.discovery.advertise()` call (line 162) to include `instanceId`, `directory`, `instanceName` in metadata
- [ ] Add route: `if (path === "/v1/info") return handleInfo(req, { instanceId, instanceName, directory, port, pid, startedAt, version });`
- [ ] Import `handleInfo` from routes.ts
- [ ] Run `bun test` — all tests pass
- [ ] Run `bun run build` — clean build

## Parallelization Plan

### Batch 1 (parallel — 3 coders)
- [ ] Coder A: Instance ID gen + storage + /v1/info route + test → files: `src/index.ts`, `src/storage.ts`, `src/server/routes.ts`, `src/server/types.ts`, `src/server/__tests__/routes.test.ts`
- [ ] Coder B: SSE instance injection + heartbeat → files: `src/server/sse.ts`
- [ ] Coder C: DiscoveredInstance type + bgagent_output description → files: `src/types.ts`, `src/prompts.ts`

### Batch 2 (after Batch 1 — 1 coder)
- [ ] Coder D: Wire everything in server/index.ts + build verify → files: `src/server/index.ts`

### Dependencies
- Batch 1 coders are independent: A touches storage+routes+types, B touches sse.ts only, C touches types.ts+prompts.ts only
- Coder A writes to `src/server/types.ts` (InfoResponse + ServerInfo extension) — no overlap with B or C
- Coder C writes to `src/types.ts` (DiscoveredInstance) — different file from Coder A's `src/server/types.ts`
- Coder D depends on all 3: reads the new handleInfo, uses new SSEDataProvider fields, passes instanceId to advertise/writeServerInfo

### Risk Areas
- `src/server/index.ts` is touched by both B (SSE dataProvider extension) and D (startup wiring). B should ONLY edit `sse.ts`; D handles ALL `index.ts` changes including wiring the dataProvider fields
- B's changes to SSEDataProvider interface in `sse.ts` will require D to update the dataProvider construction in `index.ts`

## Done Criteria
- [ ] `crypto.randomUUID()` generated at plugin startup
- [ ] `server.json` includes instanceId, directory, instanceName
- [ ] `GET /v1/info` returns full instance metadata
- [ ] SSE snapshot, task delta, and heartbeat events include instanceId + instanceName
- [ ] mDNS txt record includes instanceId, directory, instanceName
- [ ] bgagent_output description mentions full_session works on running tasks
- [ ] All tests pass (`bun test`)
- [ ] Clean build (`bun run build`)