## RENAMED Requirements

- FROM: `openspec/specs/superagents-task/`
- TO: `openspec/specs/asyncagents-task/`

**Reason**: Tool names are changing from `superagents_*` to `asyncagents_*` to align with package naming and better express the async nature of the tools.

## MODIFIED Requirements

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
