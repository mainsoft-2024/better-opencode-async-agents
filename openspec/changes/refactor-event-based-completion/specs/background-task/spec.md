## ADDED Requirements

### Requirement: Explicit Task Blocking
The system SHALL provide an explicit blocking mechanism via `background_block` tool that waits for specified tasks to complete.

#### Scenario: Block until tasks complete
- **WHEN** user calls `background_block` with array of task_ids
- **THEN** system filters out already-completed tasks
- **AND** blocks until all remaining tasks complete or timeout is reached
- **AND** returns status summary of all specified tasks

#### Scenario: All tasks already completed
- **WHEN** user calls `background_block` with task_ids where all tasks are already completed
- **THEN** system returns immediately with status summary (no blocking)

#### Scenario: Block timeout reached
- **WHEN** blocking timeout is reached before all tasks complete
- **THEN** system returns status summary showing which tasks completed vs still running

#### Scenario: Block after resume
- **WHEN** user calls `background_resume` then `background_block` with same task_id
- **THEN** system blocks until resume response is received
- **AND** returns status summary including the resumed task

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

## MODIFIED Requirements

### Requirement: Task Result Retrieval
The system SHALL allow retrieval of task results after completion, with tasks persisting until explicitly cleared or parent session ends. The `background_output` tool provides non-blocking status and result retrieval only.

#### Scenario: Retrieve completed task results
- **WHEN** user requests results from a completed task via `background_output`
- **THEN** system returns the stored result data immediately (non-blocking)
- **AND** marks result as retrieved with timestamp

#### Scenario: Check running task status
- **WHEN** user calls `background_output` for a running task
- **THEN** system returns current status including progress information (non-blocking)

#### Scenario: Task persistence
- **WHEN** a task completes
- **THEN** task persists in memory until explicitly cleared via background_clear
- **OR** until the parent session ends or is deleted

### Requirement: Task Conversation Resumption
The system SHALL support resuming conversations with completed background tasks by sending follow-up prompts. Resumes are notification-based (non-blocking) consistent with task creation.

#### Scenario: Resume completed task with follow-up prompt
- **WHEN** user calls background_resume with a valid task_id and message for a completed task
- **THEN** system sends the message to the task's existing session
- **AND** returns immediately with confirmation (non-blocking)
- **AND** subagent receives the message with full conversation history

#### Scenario: Resume completion notification
- **WHEN** subagent finishes processing resume request
- **THEN** system sends notification to parent session with full response
- **AND** task status returns to "completed"

#### Scenario: Block after resume
- **WHEN** user needs to wait for resume response
- **THEN** user calls `background_block` with the task_id after resume
- **AND** system blocks until response is received

#### Scenario: Reject resume of non-completed task
- **WHEN** user attempts to resume a task with status other than "completed"
- **THEN** system returns error indicating only completed tasks can be resumed

#### Scenario: Reject concurrent resume
- **WHEN** user attempts to resume a task that is currently being resumed (status="resumed")
- **THEN** system returns error indicating task is currently being resumed

#### Scenario: Handle expired session on resume
- **WHEN** user attempts to resume a task whose session no longer exists
- **THEN** system returns error with suggestion to start a new background_task

## REMOVED Requirements

### Requirement: Conditional notification on retrieval
**Reason**: The `block` parameter is being removed from `background_output`. Notifications are always sent when tasks complete (via event-based detection). The new `background_block` tool provides explicit blocking when needed.
**Migration**: Use `background_block` tool to wait for task completion instead of `background_output` with `block=true`.
