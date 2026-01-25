# superagents-task Specification

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
The system SHALL allow retrieval of task results after completion, with tasks persisting until explicitly cleared or parent session ends. The `superagents_output` tool provides non-blocking status and result retrieval only.

#### Scenario: Retrieve completed task results
- **WHEN** user requests results from a completed task via `superagents_output`
- **THEN** system returns the stored result data immediately (non-blocking)
- **AND** marks result as retrieved with timestamp

#### Scenario: Check running task status
- **WHEN** user calls `superagents_output` for a running task
- **THEN** system returns current status including progress information (non-blocking)

#### Scenario: Task persistence
- **WHEN** a task completes
- **THEN** task persists in memory until explicitly cleared via superagents_clear
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
The system SHALL support resuming conversations with completed background tasks via the `superagents_task(resume: taskId, prompt: message)` interface. Resumes are notification-based (non-blocking) consistent with task creation.

#### Scenario: Resume completed task with follow-up prompt
- **WHEN** user calls superagents_task with resume param for a completed task
- **THEN** system validates session exists
- **AND** sends the prompt to the task's existing session
- **AND** returns immediately with confirmation (non-blocking)
- **AND** subagent receives the message with full conversation history

#### Scenario: Resume completion notification
- **WHEN** subagent finishes processing resume request
- **THEN** system sends notification to parent session with full response
- **AND** task status returns to "completed"

#### Scenario: Wait for resume response
- **WHEN** user needs to wait for resume response
- **THEN** user calls `superagents_output` with task_id and block=true
- **AND** system waits until response is received

#### Scenario: Reject resume of non-completed task
- **WHEN** user attempts to resume a task with status other than "completed"
- **THEN** system returns error indicating only completed tasks can be resumed

#### Scenario: Reject concurrent resume
- **WHEN** user attempts to resume a task that is currently being resumed (status="resumed")
- **THEN** system returns error indicating task is currently being resumed

#### Scenario: Handle expired session on resume
- **WHEN** user attempts to resume a task whose session no longer exists
- **THEN** system returns error with suggestion to start a new superagents_task

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

- **WHEN** user calls superagents_list
- **AND** a task has resumeCount greater than 0
- **THEN** system appends "(resumed)" after the task ID in the listing

#### Scenario: Show forked indicator

- **WHEN** user calls superagents_list
- **AND** a task has isForked equal to true
- **THEN** system appends "(forked)" after the task ID in the listing

#### Scenario: No indicator for new tasks

- **WHEN** user calls superagents_list
- **AND** a task has resumeCount equal to 0 and isForked equal to false
- **THEN** system shows task ID without any indicator

### Requirement: Fork Context Inheritance

The system SHALL support forking parent agent context to child background tasks via an optional `fork` parameter, enabling context-aware delegation without losing conversation history.

#### Scenario: Launch forked background task

- **WHEN** user calls superagents_task with `fork: true` and valid prompt/agent
- **THEN** system calls OpenCode's session.fork API to create new session with inherited history
- **AND** system processes forked context (truncates tool results, enforces token limit)
- **AND** system injects preamble informing child about potential truncation
- **AND** task is created with `isForked: true` flag
- **AND** system returns task ID immediately (non-blocking)

#### Scenario: Fork with context truncation

- **WHEN** forked context contains tool results exceeding 1500 characters
- **THEN** system truncates those results while preserving tool call structure (name, args, id)
- **AND** truncated results include original length indicator

#### Scenario: Fork with token limit enforcement

- **WHEN** forked context total exceeds 100,000 tokens
- **THEN** system removes oldest messages until context is under limit
- **AND** most recent messages are preserved

#### Scenario: Reject fork with resume

- **WHEN** user calls superagents_task with both `fork: true` AND `resume: taskId`
- **THEN** system returns error immediately
- **AND** error message explains fork and resume are mutually exclusive

#### Scenario: Fork indicator in task list

- **WHEN** user calls superagents_list
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

- **WHEN** user calls superagents_list
- **THEN** system only returns tasks where parentSessionID matches current session ID
- **AND** tasks from other sessions are not displayed

#### Scenario: Empty list for no children

- **WHEN** user calls superagents_list
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
  - `If you need results immediately, use superagents_output(task_id="${taskId}").`
  - `You can continue working or just say 'waiting' and halt.`
  - `WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.`

#### Scenario: Hidden hint when all tasks complete

- **WHEN** a task completes and no other tasks are running (runningTasks === 0)
- **THEN** the hidden hint contains:
  - `All ${totalCount} tasks finished.`
  - `Use superagents_output tools to see agent responses.`

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

