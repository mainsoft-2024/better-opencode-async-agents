# superagents-task Specification Delta

## ADDED Requirements

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


