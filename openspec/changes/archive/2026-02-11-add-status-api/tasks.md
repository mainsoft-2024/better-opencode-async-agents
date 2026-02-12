# Tasks: Add HTTP Status API Server

## 1. Core Server Infrastructure
- [x] 1.1 Create `src/server/types.ts` — Define API response types: `TaskResponse`, `StatsResponse`, `HealthResponse`, `TaskGroupResponse`, `LogsResponse`, `PaginatedResponse`, and SSE event types (`SnapshotEvent`, `TaskDeltaEvent`, `HeartbeatEvent`)
- [x] 1.2 Create `src/server/cors.ts` — CORS helper `withCors(response)` that adds `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`, `Access-Control-Allow-Headers: Content-Type` to any Response
- [x] 1.3 Create `src/server/index.ts` — `StatusApiServer` class with `start(manager, port?)`, `stop()`, `getPort()`, `getUrl()` methods. Uses `Bun.serve()` with route table. Port collision retry: default 5165, increment up to 10 attempts, then `port: 0` fallback. Write `server.json` on start, delete on stop.

## 2. REST Route Handlers
- [x] 2.1 Create `src/server/routes.ts` — Implement `GET /v1/health` handler: returns `{status: "ok", uptime, version, taskCount}`
- [x] 2.2 Implement `GET /v1/stats` handler: returns `{byStatus, byAgent, duration: {avg, max, min}, totalTasks, activeTasks}`
- [x] 2.3 Implement `GET /v1/tasks` handler: list tasks with query params (`status`, `agent`, `search`, `limit` default 50, `offset` default 0, `sort` default `startedAt:desc`). Returns `{tasks, total, limit, offset}`
- [x] 2.4 Implement `GET /v1/tasks/:id` handler: return single task by sessionID. 404 if not found.
- [x] 2.5 Implement `GET /v1/tasks/:id/logs` handler: calls `manager.getTaskMessages(sessionID)`, returns `{messages, taskId, retrievedAt}`. 404 if task not found.
- [x] 2.6 Implement `GET /v1/task-groups/:id` handler: find all tasks with matching `batchId`, return `{groupId, tasks, stats: {completed, running, error, cancelled, total, completionRate, totalToolCalls, duration}}`

## 3. SSE Event Stream
- [x] 3.1 Create `src/server/sse.ts` — `SSEBroadcaster` class with: `subscribers` Set, `addSubscriber(controller)`, `removeSubscriber(controller)`, `broadcast(event, data)`, `getSubscriberCount()`. Max 50 concurrent subscribers.
- [x] 3.2 Implement `GET /v1/events` handler: creates `ReadableStream`, sends initial `snapshot` event (all tasks + stats), then keeps connection open for delta events. 30s heartbeat interval.
- [x] 3.3 Integrate SSEBroadcaster with BackgroundManager lifecycle: emit `task.created` on launch, `task.updated` on progress update, `task.completed`/`task.error`/`task.cancelled` on status change

## 4. Configuration & Constants
- [x] 4.1 Update `src/constants.ts` — Add API server constants: `DEFAULT_API_PORT` (5165), `DEFAULT_API_HOST` ("127.0.0.1"), `SERVER_INFO_FILENAME` ("server.json"), `MAX_PORT_RETRY` (10), `HEARTBEAT_INTERVAL_MS` (30000), `MAX_SSE_SUBSCRIBERS` (50)
- [x] 4.2 Create config reader in `src/server/index.ts`: read `ASYNCAGENTS_API_PORT`, `ASYNCAGENTS_API_ENABLED`, `ASYNCAGENTS_API_HOST` from `process.env` with defaults

## 5. Plugin Integration
- [x] 5.1 Update `src/index.ts` — Import `StatusApiServer`, instantiate and start on plugin init (after BackgroundManager creation). Store server reference for cleanup.
- [x] 5.2 Add process signal handlers in `src/index.ts`: `process.on("SIGINT"/"SIGTERM"/"exit")` calls `server.stop()` + deletes `server.json`
- [x] 5.3 Update `src/manager/index.ts` — Add event emission hooks: `onTaskCreated`, `onTaskUpdated`, `onTaskCompleted`, `onTaskError`, `onTaskCancelled` callbacks that SSEBroadcaster subscribes to

## 6. Enhanced Persistence
- [x] 6.1 Update `src/storage.ts` — Enhance `saveTask()` to persist full BackgroundTask (add `completedAt`, `error`, `result`, `progress` fields) for history support
- [x] 6.2 Update `src/storage.ts` — Add `loadAllTasks()` that loads full task history from disk on startup
- [x] 6.3 Add `server.json` read/write/delete functions to `src/storage.ts`

## 7. Testing
- [x] 7.1 Add unit tests for `StatusApiServer`: start/stop lifecycle, port collision retry, `server.json` creation/deletion
- [x] 7.2 Add unit tests for route handlers: `/health`, `/stats`, `/tasks` (with filters/pagination), `/tasks/:id`, `/tasks/:id/logs`, `/task-groups/:id`
- [x] 7.3 Add unit tests for `SSEBroadcaster`: subscriber management, broadcast, heartbeat, cleanup
- [x] 7.4 Add integration test: full flow — start server, create tasks via manager, verify API responses, verify SSE events

## 8. Build & Verification
- [x] 8.1 Run `bun run typecheck` — ensure no type errors
- [x] 8.2 Run `bun test` — ensure all tests pass
- [x] 8.3 Run `bun run build` — ensure build succeeds
- [ ] 8.4 Manual smoke test: start plugin, curl endpoints, verify SSE stream

## Dependencies

- Section 1 must complete before Sections 2, 3
- Sections 2, 3 can run in parallel after Section 1
- Section 4 can run in parallel with Section 1
- Section 5 depends on Sections 1, 2, 3
- Section 6 can run in parallel with Sections 2, 3
- Section 7 depends on Sections 1–6
- Section 8 depends on all previous sections
