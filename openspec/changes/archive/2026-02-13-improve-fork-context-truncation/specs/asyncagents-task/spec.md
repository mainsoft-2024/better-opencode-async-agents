## MODIFIED Requirements

### Requirement: Fork Context Inheritance

The system SHALL support forking parent agent context to child background tasks via an optional `fork` parameter, enabling context-aware delegation with smart context truncation pipeline. The pipeline applies 3 stages: compaction boundary detection, graduated tool truncation, and character budget enforcement.

#### Scenario: Launch forked background task
- **WHEN** user calls asyncagents_task with `fork: true` and valid prompt/agent
- **THEN** system creates new session with inherited history
- **AND** system applies 3-stage smart truncation pipeline to parent messages
- **AND** system injects dynamic preamble with truncation metadata
- **AND** task is created with `isForked: true` flag
- **AND** system returns task ID immediately (non-blocking)

#### Scenario: Compaction boundary detection
- **WHEN** parent session messages contain a compaction boundary (user message part with `type: "compaction"` and corresponding assistant message with `summary: true`)
- **THEN** system detects the latest compaction boundary
- **AND** system slices messages to include only the compaction summary assistant message and all subsequent messages
- **AND** all messages before the compaction boundary are discarded

#### Scenario: Multiple compaction boundaries
- **WHEN** parent session messages contain multiple compaction boundaries
- **THEN** system uses only the latest (most recent) compaction boundary
- **AND** earlier compaction summaries and their preceding messages are discarded

#### Scenario: No compaction boundary
- **WHEN** parent session messages contain no compaction boundaries
- **THEN** system passes all messages to the next pipeline stage without slicing

#### Scenario: Graduated 3-tier tool truncation
- **WHEN** processing tool results after compaction slicing
- **THEN** system counts tool results from newest to oldest
- **AND** the 5 most recent tool results are preserved without truncation (Tier 1)
- **AND** the next 10 tool results are truncated to 3000 characters (Tier 2)
- **AND** all remaining tool results are truncated to 500 characters (Tier 3)

#### Scenario: Smart truncation method selection
- **WHEN** a tool result requires truncation
- **AND** the tool name contains 'bash', 'pty', or 'exec'
- **THEN** system applies head+tail truncation (80% head, 20% tail) with separator
- **WHEN** a tool result requires truncation
- **AND** the result text contains error patterns ('error', 'Error', 'ERROR', 'failed', 'FAILED', 'exception', 'traceback')
- **THEN** system applies head+tail truncation (80% head, 20% tail) with separator
- **WHEN** a tool result requires truncation
- **AND** neither condition above is met
- **THEN** system applies head-only truncation

#### Scenario: Tool parameter truncation per tier
- **WHEN** formatting tool parameters in context
- **THEN** Tier 1 tool parameters are truncated to 500 characters
- **AND** Tier 2 tool parameters are truncated to 200 characters
- **AND** Tier 3 tool parameters are truncated to 100 characters

#### Scenario: Already-compacted tool results
- **WHEN** a tool result contains '[Old tool result content cleared]' (compacted by OpenCode)
- **THEN** system passes the result through unchanged without additional truncation

#### Scenario: Character budget enforcement
- **WHEN** the formatted context string exceeds 200,000 characters
- **THEN** system removes oldest messages first until the context fits within the budget
- **WHEN** the formatted context string is 120,000 characters or less
- **THEN** system does not remove any messages regardless of count

#### Scenario: Reject fork with resume
- **WHEN** user calls asyncagents_task with both `fork: true` AND `resume: taskId`
- **THEN** system returns error immediately
- **AND** error message explains fork and resume are mutually exclusive

#### Scenario: Fork indicator in task list
- **WHEN** user calls asyncagents_list
- **AND** a task has `isForked: true`
- **THEN** system shows `(forked)` indicator after the task ID

### Requirement: Fork Preamble Injection

The system SHALL inject a dynamic system message into forked sessions that includes truncation metadata from the processing pipeline.

#### Scenario: Dynamic preamble content
- **WHEN** fork mode creates a new session
- **THEN** system injects system message via `session.prompt` with `noReply: true`
- **AND** preamble includes compaction detection status
- **AND** preamble includes tier distribution summary (how many tool results per tier)
- **AND** preamble includes message removal count (if any were removed)
- **AND** preamble advises re-reading files if complete content is needed
