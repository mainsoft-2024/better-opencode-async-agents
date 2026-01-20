## ADDED Requirements

### Requirement: Task Conversation Resumption
The system SHALL support resuming conversations with completed background tasks by sending follow-up prompts and receiving responses.

#### Scenario: Resume completed task with follow-up prompt
- **WHEN** user calls background_resume with a valid task_id and message for a completed task
- **THEN** system sends the message to the task's existing session
- **AND** subagent receives the message with full conversation history
- **AND** system returns only the new response from the subagent

#### Scenario: Resume with blocking mode
- **WHEN** user calls background_resume with block=true
- **THEN** system waits for subagent response up to timeout duration
- **AND** returns the response directly without parent session notification

#### Scenario: Resume with async mode
- **WHEN** user calls background_resume with block=false (default)
- **THEN** system returns immediately with confirmation
- **AND** notifies parent session when subagent response is received

#### Scenario: Reject resume of non-completed task
- **WHEN** user attempts to resume a task with status other than "completed"
- **THEN** system returns error indicating only completed tasks can be resumed

#### Scenario: Reject concurrent resume
- **WHEN** user attempts to resume a task that is currently being resumed (status="resumed")
- **THEN** system returns error indicating task is currently being resumed

#### Scenario: Handle expired session on resume
- **WHEN** user attempts to resume a task whose session no longer exists
- **THEN** system returns error with suggestion to start a new background_task

### Requirement: Resume Count Tracking
The system SHALL track the number of times each task has been resumed for visibility and debugging purposes.

#### Scenario: Increment resume count
- **WHEN** a task is successfully resumed
- **THEN** the task's resumeCount field is incremented by one

#### Scenario: Initial resume count
- **WHEN** a new task is created
- **THEN** the task's resumeCount is initialized to zero

## MODIFIED Requirements

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
The system SHALL allow retrieval of task results after completion, with tasks persisting until explicitly cleared or parent session ends.

#### Scenario: Retrieve completed task results
- **WHEN** user requests results from a completed task
- **THEN** system returns the stored result data
- **AND** marks result as retrieved with timestamp

#### Scenario: Task persistence
- **WHEN** a task completes
- **THEN** task persists in memory until explicitly cleared via background_clear
- **OR** until the parent session ends or is deleted

#### Scenario: Conditional notification on retrieval
- **WHEN** user retrieves results with block=true
- **THEN** no notification is sent to parent session (result returned directly)
- **WHEN** user retrieves results with block=false and task completes
- **THEN** notification is sent to parent session


