## ADDED Requirements

### Requirement: Silent System Hints

The system SHALL inject assistant-facing guidance into the system prompt via `experimental.chat.system.transform` hook when unretrieved completed tasks exist, without creating visible user messages.

#### Scenario: Inject system hint for unretrieved completed tasks

- **WHEN** there are completed/error/cancelled tasks with no `resultRetrievedAt`
- **AND** those tasks belong to the current session (parentSessionID matches)
- **AND** an LLM call is made
- **THEN** system appends guidance text to the system prompt array
- **AND** guidance includes task IDs grouped by status
- **AND** guidance includes instructions to use `superagents_output`

#### Scenario: No injection when no unretrieved tasks

- **WHEN** all completed tasks have `resultRetrievedAt` set
- **OR** no completed/error/cancelled tasks exist for current session
- **THEN** system does not modify the system prompt array

#### Scenario: Status-grouped task display

- **WHEN** system hint is injected
- **AND** multiple tasks with different statuses exist
- **THEN** tasks are grouped by status with distinct markers
- **AND** completed tasks show `✓ Completed: superagents_output(task_id=...)`
- **AND** error tasks show `✗ Error: superagents_output(task_id=...)`
- **AND** cancelled tasks show `⊘ Cancelled: superagents_output(task_id=...)`

#### Scenario: Conditional leftover warning

- **WHEN** system hint is injected
- **AND** running tasks exist for the current session
- **THEN** system includes "WATCH OUT for leftovers" warning

#### Scenario: No leftover warning when all complete

- **WHEN** system hint is injected
- **AND** no running tasks exist for the current session
- **THEN** system does not include leftover warning

#### Scenario: Remove from hints after retrieval

- **WHEN** user retrieves task result via `superagents_output`
- **AND** `resultRetrievedAt` is set
- **THEN** task is excluded from subsequent system hints

### Requirement: Concise Visible Notification Format

The system SHALL send concise task completion notifications as visible messages, excluding assistant-facing guidance which is delivered via system hints.

#### Scenario: Visible message format for completed task

- **WHEN** a background task completes successfully
- **THEN** system sends visible message in format: `**SuperAgents**\nAgent "{description}" (ID {shortTaskId}) finished in {duration}.\nBatch: {completed}/{total} complete, {running} running.`
- **AND** message does not include `superagents_output` instructions
- **AND** message does not include leftover warnings

#### Scenario: Visible message format for failed task

- **WHEN** a background task fails with error
- **THEN** system sends visible message with `✗` prefix
- **AND** format follows same pattern as completed task

#### Scenario: Visible message format for cancelled task

- **WHEN** a background task is cancelled
- **THEN** system sends visible message with `⊘` prefix
- **AND** format follows same pattern as completed task

#### Scenario: Batch progress always shown

- **WHEN** any task completion notification is sent
- **THEN** batch progress line is included even for single-task batches
- **AND** format is `Batch: {completed}/{total} complete, {running} running.`

### Requirement: Resume Completion System Hints

The system SHALL apply the same system hint injection for resume operation completions as for regular task completions.

#### Scenario: Resume completion triggers system hint

- **WHEN** a resumed task completes (status returns to "completed")
- **AND** `resultRetrievedAt` is not set
- **THEN** task is included in system hints on next LLM call

#### Scenario: Resume visible message format

- **WHEN** a resumed task completes
- **THEN** visible message follows same concise format as regular completions
- **AND** assistant-facing guidance is delivered via system hints only

## MODIFIED Requirements

### Requirement: Event-Based Completion Detection

The system SHALL use `session.idle` events as the primary mechanism for detecting task completion, with polling as a fallback. Completion triggers both visible notification and system hint injection.

#### Scenario: Detect completion via event

- **WHEN** background session emits `session.idle` event
- **THEN** system immediately marks corresponding task as completed
- **AND** sends concise visible notification to parent session
- **AND** task becomes eligible for system hint injection on next LLM call

#### Scenario: Fallback to polling

- **WHEN** `session.idle` event is missed (e.g., during reconnection)
- **THEN** polling mechanism detects completion within fallback interval
- **AND** sends concise visible notification to parent session
- **AND** task becomes eligible for system hint injection on next LLM call
