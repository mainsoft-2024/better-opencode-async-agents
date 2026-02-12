# asyncagents-task Specification

## Purpose
TBD - created by archiving change define-project-specs. Update Purpose after archive.
## Requirements
### Requirement: Background Task Creation

The system SHALL support launching background tasks that execute asynchronously without blocking the main conversation flow. Tasks can be launched fresh, forked with context, or resumed from a completed task.

#### Scenario: Launch background task

- **WHEN** user requests a background task with description, prompt, and agent
- **THEN** system creates a new task with unique ID and sets status to "running"
- **AND** task includes parent session and message context for traceability

#### Scenario: Launch forked background task

- **WHEN** user requests a background task with `fork: true`
- **THEN** system forks parent session using session.fork API
- **AND** processes context (truncation, token limits)
- **AND** creates task with `isForked: true`

#### Scenario: Validate mutually exclusive modes

- **WHEN** user provides both `fork: true` and `resume: taskId`
- **THEN** system returns error explaining these modes are mutually exclusive
- **AND** no task is created

### Requirement: Task Status Management
The system SHALL maintain task status throughout the task lifecycle with five possible states: running, completed, error, cancelled, resumed.

#### Scenario: Track task completion
- **WHEN** background task finishes successfully
- **THEN** status changes to "completed" and completion timestamp is recorded
- **AND** task result is stored for later retrieval

#### Scenario: Handle task errors
- **WHEN** background task encounters an error during execution
- **THEN** status changes to "error" and error details are captured
- **AND** error information is preserved for debugging

#### Scenario: Cancel running tasks
- **WHEN** user requests to cancel a running task
- **THEN** task status changes to "cancelled"
- **AND** any ongoing execution is terminated gracefully

#### Scenario: Track resumed status
- **WHEN** user resumes a completed task
- **THEN** status changes to "resumed" while processing the follow-up prompt
- **AND** status returns to "completed" when subagent response is received

### Requirement: Task Result Retrieval
The system SHALL allow retrieval of task results after completion, with tasks persisting until explicitly cleared or parent session ends. The `asyncagents_output` tool provides non-blocking status and result retrieval only.

#### Scenario: Retrieve completed task results
- **WHEN** user requests results from a completed task via `asyncagents_output`
- **THEN** system returns the stored result data immediately (non-blocking)
- **AND** marks result as retrieved with timestamp

#### Scenario: Check running task status
- **WHEN** user calls `asyncagents_output` for a running task
- **THEN** system returns current status including progress information (non-blocking)

#### Scenario: Task persistence
- **WHEN** a task completes
- **THEN** task persists in memory until explicitly cleared via asyncagents_clear
- **OR** until the parent session ends or is deleted

### Requirement: Task Progress Tracking
The system SHALL provide progress information for running tasks including tool call counts and recent activity.

#### Scenario: Monitor task progress
- **WHEN** user checks status of running task
- **THEN** system returns current progress including tool call count and recent tools used
- **AND** last update timestamp indicates task is still active

### Requirement: Batch Task Management
The system SHALL support grouping related tasks with batch identifiers for organizational purposes.

#### Scenario: Group related tasks
- **WHEN** multiple tasks are created as part of the same logical operation
- **THEN** they share the same batchId for correlation
- **AND** batch operations can be performed on all tasks in a batch

### Requirement: Task Conversation Resumption
The system SHALL support resuming conversations with completed background tasks via the `asyncagents_task(resume: taskId, prompt: message)` interface. Resumes are notification-based (non-blocking) consistent with task creation.

#### Scenario: Resume completed task with follow-up prompt
- **WHEN** user calls asyncagents_task with resume param for a completed task
- **THEN** system validates session exists
- **AND** sends the prompt to the task's existing session
- **AND** returns immediately with confirmation (non-blocking)
- **AND** subagent receives the message with full conversation history

#### Scenario: Wait for resume response
- **WHEN** user needs to wait for resume response
- **THEN** user calls `asyncagents_output` with task_id and block=true
- **AND** system waits until response is received

#### Scenario: Handle expired session on resume
- **WHEN** user attempts to resume a task whose session no longer exists
- **THEN** system returns error with suggestion to start a new asyncagents_task

### Requirement: Resume Count Tracking
The system SHALL track the number of times each task has been resumed for visibility and debugging purposes.

#### Scenario: Increment resume count
- **WHEN** a task is successfully resumed
- **THEN** the task's resumeCount field is incremented by one

#### Scenario: Initial resume count
- **WHEN** a new task is created
- **THEN** the task's resumeCount is initialized to zero

### Requirement: Event-Based Completion Detection
The system SHALL use `session.idle` events as the primary mechanism for detecting task completion, with polling as a fallback.

#### Scenario: Detect completion via event
- **WHEN** background session emits `session.idle` event
- **THEN** system immediately marks corresponding task as completed
- **AND** sends notification to parent session with full result

#### Scenario: Fallback to polling
- **WHEN** `session.idle` event is missed (e.g., during reconnection)
- **THEN** polling mechanism detects completion within fallback interval
- **AND** sends notification to parent session with full result

### Requirement: Task List Resume Indicator

The system SHALL indicate in task listings when a task has been resumed or forked, providing visual distinction for tasks with special context handling.

#### Scenario: Show resumed indicator
- **WHEN** user calls asyncagents_list
- **AND** a task has resumeCount greater than 0
- **THEN** system appends "(resumed)" after the task ID in the listing

#### Scenario: Show forked indicator
- **WHEN** user calls asyncagents_list
- **AND** a task has isForked equal to true
- **THEN** system appends "(forked)" after the task ID in the listing

#### Scenario: No indicator for new tasks
- **WHEN** user calls asyncagents_list
- **AND** a task has resumeCount equal to 0 and isForked equal to false
- **THEN** system shows task ID without any indicator

### Requirement: Fork Context Inheritance

The system SHALL support forking parent agent context to child background tasks via an optional `fork` parameter, enabling context-aware delegation without losing conversation history.

#### Scenario: Launch forked background task
- **WHEN** user calls asyncagents_task with `fork: true` and valid prompt/agent
- **THEN** system calls OpenCode's session.fork API to create new session with inherited history
- **AND** system processes forked context (truncates tool results, enforces token limit)
- **AND** system injects preamble informing child about potential truncation
- **AND** task is created with `isForked: true` flag
- **AND** system returns task ID immediately (non-blocking)

#### Scenario: Reject fork with resume
- **WHEN** user calls asyncagents_task with both `fork: true` AND `resume: taskId`
- **THEN** system returns error immediately
- **AND** error message explains fork and resume are mutually exclusive

#### Scenario: Fork indicator in task list
- **WHEN** user calls asyncagents_list
- **AND** a task has `isForked: true`
- **THEN** system shows `(forked)` indicator after the task ID

### Requirement: Fork Preamble Injection

The system SHALL inject a system message into forked sessions to inform the child agent about context limitations.

#### Scenario: Preamble content

- **WHEN** fork mode creates a new session
- **THEN** system injects system message via `session.prompt` with `noReply: true`
- **AND** preamble explains context may be truncated
- **AND** preamble advises re-reading files if complete content is needed

### Requirement: Task List Parent Session Filtering

The system SHALL filter task listings to only show tasks that are direct children of the current session, preventing clutter from unrelated tasks.

#### Scenario: Filter by parent session
- **WHEN** user calls asyncagents_list
- **THEN** system only returns tasks where parentSessionID matches current session ID
- **AND** tasks from other sessions are not displayed

#### Scenario: Empty list for no children
- **WHEN** user calls asyncagents_list
- **AND** no tasks have current session as parent
- **THEN** system returns "No background tasks found" message

### Requirement: Silent System Hints in Notifications

The system SHALL split task completion notifications into visible and hidden parts, where the visible part provides user-friendly status information and the hidden part provides AI-specific guidance via synthetic message parts.

#### Scenario: Task completion notification format

- **WHEN** a background task completes successfully
- **THEN** system sends a message with two parts to the parent session
- **AND** the visible part contains: `✓ **Agent "${description}" finished in ${duration}.**\nTask Progress: ${completed}/${total}`
- **AND** the hidden part (synthetic: true) contains guidance for the AI

#### Scenario: Task failure notification format

- **WHEN** a background task fails with an error
- **THEN** system sends a message with two parts to the parent session
- **AND** the visible part contains: `✗ **Agent "${description}" failed in ${duration}.**\nTask Progress: ${completed}/${total}`
- **AND** the hidden part includes the error message and guidance

#### Scenario: Task cancellation notification format

- **WHEN** a background task is cancelled
- **THEN** system sends a message with two parts to the parent session
- **AND** the visible part contains: `⊘ **Agent "${description}" cancelled after ${duration}.**\nTask Progress: ${completed}/${total}`
- **AND** the hidden part contains guidance for the AI

#### Scenario: Resume completion notification format

- **WHEN** a resume operation completes successfully
- **THEN** system sends a message with two parts to the parent session
- **AND** the visible part contains: `✓ **Resume #${resumeCount} completed in ${duration}.**\nTask Progress: ${completed}/${total}`
- **AND** the hidden part contains guidance for the AI

#### Scenario: Resume failure notification format

- **WHEN** a resume operation fails
- **THEN** system sends a message with two parts to the parent session
- **AND** the visible part contains: `✗ **Resume #${resumeCount} failed in ${duration}.**\nTask Progress: ${completed}/${total}`
- **AND** the hidden part includes the error message

### Requirement: Conditional Hidden Hint Content

The system SHALL generate different hidden hint content based on whether tasks are still running or all tasks have completed.

#### Scenario: Hidden hint when tasks still running
- **WHEN** a task completes and other tasks are still running (runningTasks > 0)
- **THEN** the hidden hint contains:
  - `If you need results immediately, use asyncagents_output(task_id="${taskId}").`
  - `You can continue working or just say 'waiting' and halt.`
  - `WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.`

#### Scenario: Hidden hint when all tasks complete
- **WHEN** a task completes and no other tasks are running (runningTasks === 0)
- **THEN** the hidden hint contains:
  - `All ${totalCount} tasks finished.`
  - `Use asyncagents_output tools to see agent responses.`

### Requirement: Development Mode Hint Indicator

The system SHALL display a visible indicator when hidden hints are attached in development mode.

#### Scenario: Show indicator in development mode

- **WHEN** a notification is sent
- **AND** `process.env.NODE_ENV === 'development'`
- **THEN** the visible message ends with `[hint attached]`

#### Scenario: Hide indicator in production mode

- **WHEN** a notification is sent
- **AND** `process.env.NODE_ENV !== 'development'`
- **THEN** no indicator is added to the visible message

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

