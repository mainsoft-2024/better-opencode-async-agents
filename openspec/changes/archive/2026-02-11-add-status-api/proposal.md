# Change: Add HTTP Status API Server

## Why

Agent status is currently visible only through OpenCode's toast notifications (150ms progress + 5s completion), making it impossible for external tools, CLI scripts, or browser dashboards to monitor running agents. An embedded HTTP API exposes task state over a local port so any consumer can observe agent activity in real time.

## What Changes

- **NEW**: Embedded HTTP API server using `Bun.serve()`, started automatically on plugin init
- **NEW**: `GET /v1/tasks` — list tasks with filters (status, agent, search) and pagination (limit + offset)
- **NEW**: `GET /v1/tasks/:id` — single task detail
- **NEW**: `GET /v1/tasks/:id/logs` — full message history via `getTaskMessages()`
- **NEW**: `GET /v1/task-groups/:id` — batch/group aggregate data
- **NEW**: `GET /v1/events` — SSE stream (full snapshot on connect, delta events thereafter, 30s heartbeat)
- **NEW**: `GET /v1/health` — server health check
- **NEW**: `GET /v1/stats` — status counts, agent counts, avg/max duration
- **NEW**: SSE event types: `task.created`, `task.updated`, `task.completed`, `task.error`, `task.cancelled`
- **NEW**: File-based discovery (`server.json` with `{port, pid, startedAt}`) for consumers to find the server
- **NEW**: Environment variable configuration: `ASYNCAGENTS_API_PORT` (default 5165), `ASYNCAGENTS_API_ENABLED`
- **NEW**: Port collision handling — auto-increment (5165 → 5166 → 5167...) on bind failure
- **NEW**: `src/server/` directory for HTTP server module
- **MODIFIED**: `src/index.ts` — start server on plugin init, shut down on exit
- **MODIFIED**: `src/manager/index.ts` — expose data accessors for API consumption
- **MODIFIED**: `src/storage.ts` — enhanced persistence supporting full history retention
- **MODIFIED**: `src/constants.ts` — new config constants for port, discovery path, env vars

### Security Model

- Bind `127.0.0.1` only (localhost, no network exposure)
- No authentication (localhost-only access makes auth unnecessary)
- No sensitive data masking (may be added later)
- CORS enabled for `localhost` origins (browser dashboard support)

### Versioning

- All endpoints prefixed with `/v1`
- `/v2` prefix reserved for future breaking changes

### Data Retention

- Infinite disk-based persistence (`tasks.json`, survives restart)
- Full task history with filter/search capability

## Impact

- Affected specs: `asyncagents-task` (new capability within existing spec)
- Affected code:
  - **NEW**: `src/server/` directory (HTTP server, SSE manager, route handlers, discovery file)
  - **MODIFIED**: `src/index.ts` (server lifecycle: start on init, stop on exit)
  - **MODIFIED**: `src/manager/index.ts` (expose data accessors for API layer)
  - **MODIFIED**: `src/storage.ts` (enhanced persistence for history queries)
  - **MODIFIED**: `src/constants.ts` (new config constants: port, paths, env vars)
