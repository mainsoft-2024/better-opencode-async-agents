# Design: Add HTTP Status API Server

## Context

The plugin currently exposes agent task status only through OpenCode's internal toast notifications — a 150ms progress spinner and a 5-second completion toast. There is no mechanism for external consumers (CLI scripts, browser dashboards, monitoring tools) to observe running agents. OpenCode's built-in HTTP server (port 4096) provides raw session data (`/event` SSE, `/session/status`), but lacks the **aggregated task view** the plugin maintains: batch grouping, per-agent statistics, parent-child relationships, progress tracking, and completion rates.

**Constraints:**
- OpenCode's plugin SDK has no official `dispose` hook — cleanup relies on process signal handlers
- Plugin runs in Bun runtime — `Bun.serve()` is available with zero additional dependencies
- Must not break existing behavior — server is additive, disabled via env var if unwanted
- Must be read-only — no control plane (POST/PUT/DELETE) to avoid security concerns
- Bind localhost only — no network exposure, no authentication needed

**Stakeholders:** Plugin users building external monitoring dashboards, CLI tooling authors, plugin maintainers

## Goals / Non-Goals

**Goals:**
- Expose all task metadata over a local HTTP API consumable by any HTTP client
- Provide real-time streaming via SSE (snapshot on connect, delta events for changes)
- Enable task filtering, pagination, search, and group aggregation
- Support port discovery via a well-known file (`server.json`)
- Handle port collisions gracefully with auto-increment fallback
- Keep the server lightweight — zero additional dependencies beyond Bun built-ins
- Full history retention with disk persistence (tasks survive restarts)

**Non-Goals:**
- No built-in web dashboard UI (API only — consumers build their own)
- No authentication or authorization (localhost binding is sufficient)
- No WebSocket support (SSE is sufficient for one-way server→client streaming)
- No write/control endpoints (no POST/PUT/DELETE — read-only API)
- No API rate limiting (localhost, single-user scenario)
- No OpenAPI/Swagger auto-generation (can add later)

## Decisions

### Decision 1: Use Bun.serve() with route table

**What:** Embed an HTTP server using `Bun.serve()` with a route-table approach rather than a single fetch handler.

**Why:**
- Already running in Bun runtime — zero dependency cost
- Route table (Bun's `routes` option) gives cleaner per-endpoint handlers vs. manual URL parsing
- Native SSE support via `ReadableStream` — no library needed
- Simpler than Express/Hono which would add unnecessary dependencies for a handful of GET endpoints

**Alternatives considered:**
- Express: Unnecessary dependency, designed for Node.js, overkill for 6 read-only endpoints
- Hono: Lightweight but still an additional dependency with no clear benefit over native Bun routing
- Node.js `http.createServer()`: Bun is the primary runtime; using Node polyfills adds indirection
- Exposing data through OpenCode's existing `/event` SSE: Would require modifying OpenCode core; plugin-only data (batch grouping, agent stats) is not available there

**Implementation:**
```typescript
const server = Bun.serve({
  port: resolvedPort,
  hostname: "127.0.0.1",
  routes: {
    "/v1/health": () => json({ status: "ok", uptime, version, taskCount }),
    "/v1/stats": () => json(buildStats(manager.getAllTasks())),
    "/v1/tasks": (req) => handleTaskList(req, manager),
    "/v1/tasks/:id": (req) => handleTaskDetail(req, manager),
    "/v1/tasks/:id/logs": (req) => handleTaskLogs(req, manager),
    "/v1/task-groups/:id": (req) => handleTaskGroup(req, manager),
    "/v1/events": (req) => handleSSE(req, broadcaster),
  },
  fetch(req) {
    // CORS preflight + 404 fallback
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    return new Response("Not Found", { status: 404 });
  },
});
```

### Decision 2: Fixed port 5165 with auto-increment on collision

**What:** Default to port 5165, try up to 10 consecutive ports on bind failure, then fall back to OS-assigned port (`:0`).

**Why:**
- Fixed port makes discovery predictable for CLI scripts (`curl localhost:5165/v1/health`)
- Auto-increment handles the common case of multiple plugin instances
- `:0` fallback ensures the server always starts — consumers use `server.json` for discovery

**Configuration:**
- `ASYNCAGENTS_API_PORT` env var overrides default (5165)
- `ASYNCAGENTS_API_HOST` env var overrides bind address (default `127.0.0.1`)
- `ASYNCAGENTS_API_ENABLED` env var disables server entirely (`"false"`)

**Alternatives considered:**
- Random port only (`:0`): Unpredictable; every consumer must read `server.json`
- Fixed port, fail on collision: Fragile; multiple plugin instances would fight
- Unix domain socket: Not universally accessible from browsers or `curl` without extra flags

**Discovery file:** `~/.opencode/plugins/better-opencode-async-agents/server.json`
```json
{
  "port": 5165,
  "pid": 12345,
  "startedAt": "2026-02-11T10:00:00.000Z",
  "url": "http://127.0.0.1:5165"
}
```

### Decision 3: Server lifecycle tied to plugin init + process signals

**What:** Start the server synchronously during plugin factory execution. Shut down on `SIGINT`/`SIGTERM` and `process.on("exit")`.

**Why:**
- OpenCode has no plugin `dispose` hook — process signals are the only reliable cleanup mechanism
- Starting in the factory function ensures the server is ready before any tool calls arrive
- `server.stop(true)` in signal handler gives in-flight responses time to complete
- `server.json` is deleted on graceful shutdown (best-effort)

**Implementation:**
```typescript
export default async function plugin(ctx: PluginInput): Promise<Hooks> {
  const manager = new BackgroundManager(ctx);

  // Start HTTP API server
  const apiServer = await StatusApiServer.start(manager);

  // Cleanup on exit
  const cleanup = () => {
    apiServer.stop();
    deleteServerJson();
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);

  return { tool: { ... }, event: async () => {} };
}
```

**Alternatives considered:**
- `server.unref()`: Would allow the process to exit before cleanup completes; not used
- Event-based shutdown from OpenCode: No such hook exists in the plugin API
- Relying solely on `process.on("exit")`: Exit handler can't do async work; signal handlers are more reliable

### Decision 4: SSE with snapshot + delta events

**What:** On SSE client connect, send a full `snapshot` event with all tasks and stats. Thereafter, broadcast delta events (`task.created`, `task.updated`, `task.completed`, `task.error`, `task.cancelled`) when task state changes. Send a `heartbeat` every 30 seconds.

**Why:**
- Snapshot ensures a new client immediately has full state (no need to poll first)
- Delta events minimize bandwidth — only changes are sent
- Heartbeat keeps the connection alive and lets clients detect stale connections
- SSE is simpler than WebSocket for one-way server→client streaming

**Event format:**
```
event: snapshot
data: {"tasks":[...BackgroundTask[]],"stats":{...}}

event: task.created
data: {...BackgroundTask}

event: heartbeat
data: {"ts":"2026-02-11T10:00:30.000Z"}
```

**Subscriber management:**
- `Set<ReadableStreamController>` tracks connected clients
- On stream cancel/close: remove from Set
- Connection limit: 50 concurrent SSE clients (prevent resource exhaustion)
- BackgroundManager emits events via callback; SSE broadcaster forwards to all subscribers

**Alternatives considered:**
- WebSocket: Bidirectional not needed; SSE is simpler and natively supported by browsers
- Polling-only: Higher latency, more requests, wastes bandwidth when idle
- Delta-only (no snapshot): Client would need a separate REST call to bootstrap state

### Decision 5: REST API contract with filtering and pagination

**What:** Six REST endpoints under `/v1/` prefix, all GET-only, returning JSON.

**Endpoints:**

| Endpoint | Purpose | Key Parameters |
|----------|---------|----------------|
| `GET /v1/health` | Liveness check | — |
| `GET /v1/stats` | Aggregate statistics | — |
| `GET /v1/tasks` | Task list with filters | `status`, `agent`, `search`, `limit`, `offset`, `sort` |
| `GET /v1/tasks/:id` | Single task detail | — |
| `GET /v1/tasks/:id/logs` | Message history | — |
| `GET /v1/task-groups/:id` | Batch group aggregate | — |

**Query parameters for `/v1/tasks`:**
- `status=running|completed|error|cancelled|resumed` — filter by status
- `agent=explore|plan|researcher|...` — filter by agent type
- `search=keyword` — fuzzy match on description/prompt
- `limit=50` (default 50, max 200) — page size
- `offset=0` — pagination offset
- `sort=startedAt:desc` (default) — sort field and direction

**Response shapes:**
```typescript
// GET /v1/health
{ status: "ok", uptime: number, version: string, taskCount: number }

// GET /v1/stats
{ byStatus: Record<string, number>, byAgent: Record<string, number>,
  duration: { avg: number, max: number, min: number },
  totalTasks: number, activeTasks: number }

// GET /v1/tasks
{ tasks: BackgroundTask[], total: number, limit: number, offset: number }

// GET /v1/tasks/:id
BackgroundTask  // (404 if not found)

// GET /v1/tasks/:id/logs
{ messages: Message[], taskId: string, retrievedAt: string }

// GET /v1/task-groups/:id
{ groupId: string, tasks: BackgroundTask[],
  stats: { completed: number, running: number, error: number,
           cancelled: number, total: number, completionRate: number,
           totalToolCalls: number, duration: number } }
```

**Why `/v1/` prefix:** Allows future breaking changes under `/v2/` without disrupting existing consumers.

### Decision 6: CORS policy — permissive for localhost

**What:** Set `Access-Control-Allow-Origin: *` on all responses. Handle `OPTIONS` preflight with `204 No Content`.

**Why:**
- Server binds to `127.0.0.1` only — network access is physically impossible
- Browser dashboards served from `localhost:3000` (or similar) need CORS to call `localhost:5165`
- Wildcard origin is safe because the server is never network-exposed
- `GET` and `OPTIONS` only — no mutation risk from CSRF

**Headers applied to all responses:**
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### Decision 7: Enhanced persistence for full task history

**What:** Expand `PersistedTask` to store `completedAt`, `error`, `result` summary, and `progress` alongside existing fields. Retain all tasks indefinitely on disk.

**Why:**
- The API's `/v1/tasks` endpoint needs to serve historical tasks, not just in-memory running ones
- On plugin restart, persisted tasks are loaded into the manager's `Map` so the API can serve them immediately
- Infinite retention was explicitly chosen by the user — no TTL or purge logic

**Implementation:**
- `saveTask()` already uses read-modify-write on `tasks.json`; expand the serialized shape
- `loadPersistedTasks()` in BackgroundManager constructor populates the in-memory Map from disk
- No schema migration needed — new fields are optional, old task files remain valid

**Alternatives considered:**
- SQLite: Overkill for dozens-to-hundreds of tasks; JSON file is simpler and sufficient
- Separate history file: Adds complexity; single `tasks.json` with expanded schema is enough
- Time-based retention: User explicitly chose infinite retention

### Decision 8: Module structure under src/server/

**What:** Create a new `src/server/` directory with focused modules.

**Structure:**
```
src/server/
├── index.ts          # StatusApiServer class (start/stop/getPort)
├── routes.ts         # Route handlers (tasks, stats, health, groups, logs)
├── sse.ts            # SSE broadcaster (subscriber management, events)
├── cors.ts           # CORS middleware helper
└── types.ts          # API response types
```

**Why:**
- Matches existing project conventions (`src/manager/`, `src/tools/`)
- Single-file would exceed 500 lines; modules keep each file focused
- `cors.ts` is separate because it's applied to every response (cross-cutting concern)
- `types.ts` defines API-specific response shapes distinct from `src/types.ts` (domain types)

## Data Flow

```
External Consumer (curl, browser dashboard)
    │
    │ HTTP GET (127.0.0.1:5165)
    ▼
┌──────────────────────────────────────────────┐
│ StatusApiServer (NEW: src/server/)            │
│ ├── Bun.serve() with route table             │
│ ├── CORS headers on all responses            │
│ ├── REST routes → read from BackgroundManager │
│ └── SSE route → SSE Broadcaster              │
└──────────────┬───────────────────────────────┘
               │ calls getAllTasks(), getTask(),
               │ getTaskMessages(), etc.
               ▼
┌──────────────────────────────────────────────┐
│ BackgroundManager (EXISTING: src/manager/)    │
│ ├── In-memory Map<sessionID, BackgroundTask>  │
│ ├── Task lifecycle events → SSE broadcaster   │
│ └── Disk persistence (tasks.json)            │
└──────────────────────────────────────────────┘
```

**SSE event flow:**
1. BackgroundManager detects task state change (via event handler or polling)
2. Manager calls an `onTaskEvent` callback registered by StatusApiServer
3. SSE broadcaster iterates `Set<ReadableStreamController>`, writes event to each
4. If a controller is closed/errored, it's removed from the Set

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Port collision with other services | Server fails to bind | Auto-increment retry (10 attempts) + OS-assigned port fallback |
| No plugin dispose hook in OpenCode | `server.json` left stale on abnormal exit | Health endpoint for liveness verification; consumers check `/v1/health` before trusting `server.json` |
| Memory growth from infinite task history | Unbounded memory with large task counts | Pagination in API limits response size; lazy disk loading; future: add optional TTL |
| SSE connection leaks | Orphaned streams consume memory | 30s heartbeat timeout, stream cancel cleanup, 50-connection cap |
| `server.json` stale after crash | Consumer connects to wrong/dead port | Health check endpoint; consumer retries discovery on connection failure |
| Bun.serve() API changes | Breaking changes in Bun updates | Pin Bun version in CI; Bun.serve() is stable API since Bun 1.0 |

## Migration Plan

This is a **non-breaking addition** — no existing API or behavior changes.

1. **Phase 1: Core server** — Create `src/server/` module with `StatusApiServer`, route handlers, CORS middleware
2. **Phase 2: SSE broadcaster** — Implement subscriber management, heartbeat, snapshot + delta events
3. **Phase 3: BackgroundManager integration** — Wire `onTaskEvent` callback from manager to SSE broadcaster; expose read accessors
4. **Phase 4: Enhanced persistence** — Expand `PersistedTask` schema for history; load all tasks on startup
5. **Phase 5: Plugin entry point** — Start server in `src/index.ts` plugin factory; register signal-based cleanup
6. **Phase 6: Discovery** — Write/delete `server.json` on start/stop
7. **Phase 7: Configuration** — Read `ASYNCAGENTS_API_PORT`, `ASYNCAGENTS_API_ENABLED`, `ASYNCAGENTS_API_HOST` env vars

**Rollback:** Remove server start call from `src/index.ts`. Existing plugin behavior is completely unaffected — the server is a pure addition with no modifications to existing control flow.

## Open Questions

- Should SSE events include the raw `prompt` field, or exclude it to reduce payload size? (Leaning toward: include — localhost only, no privacy concern)
- Should `server.json` include a `version` field for future schema evolution? (Leaning toward: yes, add `"version": 1`)
