# background-task Spec Delta

## ADDED Requirements

### Requirement: Fork Context Inheritance

The system SHALL support forking parent agent context to child background tasks via an optional `fork` parameter, enabling context-aware delegation without losing conversation history.

#### Scenario: Launch forked background task

- **WHEN** user calls background_task with `fork: true` and valid prompt/agent
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

- **WHEN** user calls background_task with both `fork: true` AND `resume: taskId`
- **THEN** system returns error immediately
- **AND** error message explains fork and resume are mutually exclusive

#### Scenario: Fork indicator in task list

- **WHEN** user calls background_list
- **AND** a task has `isForked: true`
- **THEN** system shows `(forked)` indicator after the task ID

### Requirement: Fork Preamble Injection

The system SHALL inject a system message into forked sessions to inform the child agent about context limitations.

#### Scenario: Preamble content

- **WHEN** fork mode creates a new session
- **THEN** system injects system message via `session.prompt` with `noReply: true`
- **AND** preamble explains context may be truncated
- **AND** preamble advises re-reading files if complete content is needed

## MODIFIED Requirements

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

### Requirement: Task List Resume and Fork Indicators

The system SHALL indicate in task listings when a task has been resumed or forked, providing visual distinction for tasks with special context handling.

#### Scenario: Show resumed indicator

- **WHEN** user calls background_list
- **AND** a task has resumeCount greater than 0
- **THEN** system appends "(resumed)" after the task ID in the listing

#### Scenario: Show forked indicator

- **WHEN** user calls background_list
- **AND** a task has isForked equal to true
- **THEN** system appends "(forked)" after the task ID in the listing

#### Scenario: No indicator for new tasks

- **WHEN** user calls background_list
- **AND** a task has resumeCount equal to 0 and isForked equal to false
- **THEN** system shows task ID without any indicator
