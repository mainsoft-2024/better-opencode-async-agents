# superagents-task Spec Delta

## RENAMED Requirements
- FROM: `# background-task Specification`
- TO: `# superagents-task Specification`

## MODIFIED Requirements
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
