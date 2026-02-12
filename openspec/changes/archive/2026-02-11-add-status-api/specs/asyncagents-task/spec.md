## ADDED Requirements

### Requirement: HTTP Status API Server

The plugin SHALL provide an embedded HTTP API server using `Bun.serve()` that exposes task and agent status to external consumers. The server SHALL bind to `127.0.0.1` on a configurable port (default 5165, overridable via `ASYNCAGENTS_API_PORT`). The server SHALL start automatically when the plugin initializes. The server SHALL be disabled entirely by setting `ASYNCAGENTS_API_ENABLED=false`.

#### Scenario: Server starts on plugin init

- **WHEN** the plugin initializes and `ASYNCAGENTS_API_ENABLED` is not set to `"false"`
- **THEN** the server starts listening on `127.0.0.1` at the configured port
- **AND** the server is ready to accept HTTP requests before any tool calls are processed

#### Scenario: Server retries next port on collision

- **WHEN** the configured port is already in use
- **THEN** the server SHALL try up to 10 consecutive ports (e.g., 5165 → 5166 → ... → 5174)
- **AND** if all 10 attempts fail, the server SHALL fall back to OS-assigned port (`:0`)

#### Scenario: Server writes discovery file on start

- **WHEN** the server successfully binds to a port
- **THEN** the server writes `server.json` to the plugin storage directory
- **AND** the file contains `port`, `pid`, `startedAt`, and `url` fields

#### Scenario: Server stops gracefully on process exit

- **WHEN** the process receives `SIGINT` or `SIGTERM`
- **THEN** the server stops accepting new connections
- **AND** in-flight responses are allowed to complete
- **AND** `server.json` is deleted

#### Scenario: Server is disabled via environment variable

- **WHEN** `ASYNCAGENTS_API_ENABLED` is set to `"false"`
- **THEN** no HTTP server is started
- **AND** no `server.json` is written
- **AND** all other plugin functionality remains unaffected

### Requirement: Task List API

The server SHALL expose `GET /v1/tasks` that returns a paginated list of all tasks. The endpoint SHALL support filtering by status, agent type, and description keyword search. The endpoint SHALL support `limit` and `offset` pagination with a default limit of 50 and a maximum limit of 200.

#### Scenario: Returns all tasks when no filters applied

- **WHEN** a client sends `GET /v1/tasks` with no query parameters
- **THEN** the server returns a JSON response containing all tasks (up to the default limit of 50)
- **AND** the response includes `tasks` array, `total` count, `limit`, and `offset` fields

#### Scenario: Filters by status parameter

- **WHEN** a client sends `GET /v1/tasks?status=running`
- **THEN** the server returns only tasks with status `"running"`
- **AND** the `total` field reflects the filtered count

#### Scenario: Filters by agent parameter

- **WHEN** a client sends `GET /v1/tasks?agent=explore`
- **THEN** the server returns only tasks assigned to the `"explore"` agent
- **AND** the `total` field reflects the filtered count

#### Scenario: Searches description by keyword

- **WHEN** a client sends `GET /v1/tasks?search=keyword`
- **THEN** the server returns tasks whose description contains the keyword (case-insensitive)
- **AND** the `total` field reflects the filtered count

#### Scenario: Paginates with limit and offset

- **WHEN** a client sends `GET /v1/tasks?limit=10&offset=20`
- **THEN** the server returns at most 10 tasks starting from the 21st result
- **AND** the `total` field reflects the untruncated count of matching tasks

#### Scenario: Returns total count alongside results

- **WHEN** a client sends any `GET /v1/tasks` request
- **THEN** the response MUST include a `total` field with the count of all matching tasks (before pagination)

### Requirement: Task Detail API

The server SHALL expose `GET /v1/tasks/:id` that returns a single task by session ID. The server SHALL return HTTP 404 when the task is not found.

#### Scenario: Returns full task object for valid ID

- **WHEN** a client sends `GET /v1/tasks/:id` with a valid session ID
- **THEN** the server returns the full `BackgroundTask` object as JSON

#### Scenario: Returns 404 for unknown ID

- **WHEN** a client sends `GET /v1/tasks/:id` with an ID that does not match any task
- **THEN** the server returns HTTP 404 with a JSON error body

### Requirement: Task Logs API

The server SHALL expose `GET /v1/tasks/:id/logs` that returns the full message history for a task session. The endpoint SHALL call `getTaskMessages()` and return unmasked messages. The server SHALL return HTTP 404 when the task is not found.

#### Scenario: Returns message history for a running task

- **WHEN** a client sends `GET /v1/tasks/:id/logs` for a task with status `"running"`
- **THEN** the server returns the current message history as a JSON array
- **AND** messages are returned unmasked (no sensitive data filtering)

#### Scenario: Returns message history for a completed task

- **WHEN** a client sends `GET /v1/tasks/:id/logs` for a task with status `"completed"`
- **THEN** the server returns the full message history accumulated during execution

#### Scenario: Returns 404 for unknown task ID

- **WHEN** a client sends `GET /v1/tasks/:id/logs` with an ID that does not match any task
- **THEN** the server returns HTTP 404 with a JSON error body

### Requirement: Task Groups API

The server SHALL expose `GET /v1/task-groups/:id` that returns aggregate data for a batch of tasks grouped by `batchId`. The response SHALL include group-level statistics: completion rate, error count, total duration, and total tool calls.

#### Scenario: Returns group with all member tasks and aggregate stats

- **WHEN** a client sends `GET /v1/task-groups/:id` with a valid batch ID
- **THEN** the server returns all tasks sharing that `batchId`
- **AND** the response includes aggregate statistics: `completed`, `running`, `error`, `cancelled`, `total`, `completionRate`, `totalToolCalls`, and `duration`

#### Scenario: Returns 404 for unknown group ID

- **WHEN** a client sends `GET /v1/task-groups/:id` with a batch ID that matches no tasks
- **THEN** the server returns HTTP 404 with a JSON error body

### Requirement: Server-Sent Events Stream

The server SHALL expose `GET /v1/events` as a Server-Sent Events (SSE) stream. On connection, the server SHALL send a `snapshot` event containing all current tasks and aggregate stats. After the snapshot, the server SHALL send delta events as task state changes. The server SHALL send a `heartbeat` event every 30 seconds. On client reconnection, the server SHALL send a fresh snapshot.

#### Scenario: Sends snapshot on initial connection

- **WHEN** a client connects to `GET /v1/events`
- **THEN** the server sends an SSE event with type `snapshot`
- **AND** the event data contains all current tasks and aggregate statistics

#### Scenario: Sends task.created when new task launches

- **WHEN** a new background task is created
- **THEN** the server broadcasts an SSE event with type `task.created`
- **AND** the event data contains the full `BackgroundTask` object

#### Scenario: Sends task.updated when task progress changes

- **WHEN** a running task's progress information changes (e.g., tool call count increments)
- **THEN** the server broadcasts an SSE event with type `task.updated`
- **AND** the event data contains the updated `BackgroundTask` object

#### Scenario: Sends task.completed when task finishes successfully

- **WHEN** a background task completes with status `"completed"`
- **THEN** the server broadcasts an SSE event with type `task.completed`
- **AND** the event data contains the completed `BackgroundTask` object

#### Scenario: Sends task.error when task fails

- **WHEN** a background task fails with status `"error"`
- **THEN** the server broadcasts an SSE event with type `task.error`
- **AND** the event data contains the failed `BackgroundTask` object with error details

#### Scenario: Sends task.cancelled when task is cancelled

- **WHEN** a background task is cancelled with status `"cancelled"`
- **THEN** the server broadcasts an SSE event with type `task.cancelled`
- **AND** the event data contains the cancelled `BackgroundTask` object

#### Scenario: Sends heartbeat every 30 seconds

- **WHEN** 30 seconds have elapsed since the last event on the SSE stream
- **THEN** the server sends an SSE event with type `heartbeat`
- **AND** the event data contains a `ts` field with the current ISO 8601 timestamp

#### Scenario: Sends fresh snapshot on reconnection

- **WHEN** a client reconnects to `GET /v1/events` after a disconnection
- **THEN** the server sends a new `snapshot` event with the current full state
- **AND** subsequent delta events resume from that point

### Requirement: Health and Stats Endpoints

The server SHALL expose `GET /v1/health` returning server health status including uptime, version, and task count. The server SHALL expose `GET /v1/stats` returning aggregate statistics including counts by status, counts by agent, and duration metrics (average, maximum, minimum).

#### Scenario: Health endpoint returns ok status with uptime

- **WHEN** a client sends `GET /v1/health`
- **THEN** the server returns JSON with `status: "ok"`, `uptime` (seconds), `version`, and `taskCount`

#### Scenario: Stats endpoint returns counts by status and agent

- **WHEN** a client sends `GET /v1/stats`
- **THEN** the server returns JSON with `byStatus` (mapping status → count) and `byAgent` (mapping agent → count)

#### Scenario: Stats endpoint returns duration statistics

- **WHEN** a client sends `GET /v1/stats`
- **THEN** the response includes a `duration` object with `avg`, `max`, and `min` fields (in milliseconds)
- **AND** the response includes `totalTasks` and `activeTasks` counts

### Requirement: CORS Support

The server SHALL include CORS headers on all responses to support browser-based consumers. `Access-Control-Allow-Origin` SHALL be set to `*` (safe because the server binds to localhost only). All `OPTIONS` requests SHALL return `204 No Content` with CORS headers.

#### Scenario: Responses include CORS headers

- **WHEN** a client sends any request to the server
- **THEN** the response includes `Access-Control-Allow-Origin: *`
- **AND** the response includes `Access-Control-Allow-Methods: GET, OPTIONS`
- **AND** the response includes `Access-Control-Allow-Headers: Content-Type`

#### Scenario: OPTIONS preflight returns 204 with CORS headers

- **WHEN** a client sends an `OPTIONS` request to any endpoint
- **THEN** the server returns HTTP 204 No Content
- **AND** the response includes all CORS headers

### Requirement: Port Discovery

The server SHALL write a `server.json` file to the plugin storage directory containing the active port, process ID, start time, and URL. The server SHALL delete `server.json` on graceful shutdown. External tools SHALL be able to discover the server by reading this file.

#### Scenario: server.json created on server start

- **WHEN** the HTTP server successfully starts
- **THEN** a `server.json` file is written to the plugin storage directory
- **AND** the file contains `port` (number), `pid` (number), `startedAt` (ISO 8601 string), and `url` (string) fields

#### Scenario: server.json deleted on graceful shutdown

- **WHEN** the server shuts down gracefully (via `SIGINT`, `SIGTERM`, or process exit)
- **THEN** the `server.json` file is deleted from disk

#### Scenario: server.json enables external tool discovery

- **WHEN** an external tool reads `server.json`
- **THEN** it can connect to the server using the `url` field
- **AND** it can verify liveness by calling `GET /v1/health`

### Requirement: Task History Persistence

The plugin SHALL persist full task data to disk for history support. All tasks SHALL survive plugin restarts. The `/v1/tasks` endpoint SHALL return both current and historical tasks.

#### Scenario: Tasks persist across plugin restarts

- **WHEN** the plugin restarts after a shutdown
- **THEN** all previously persisted tasks are loaded from disk into memory
- **AND** the tasks are available through the API immediately

#### Scenario: Historical tasks appear in task list responses

- **WHEN** a client sends `GET /v1/tasks` after a plugin restart
- **THEN** the response includes tasks from before the restart alongside any new tasks

#### Scenario: Task detail accessible for completed tasks after restart

- **WHEN** a client sends `GET /v1/tasks/:id` for a task that completed before the last restart
- **THEN** the server returns the full task object
- **AND** all fields (status, error, progress, timestamps) are preserved
