# asyncagents-task Specification (Delta)

## Addition

### Requirement: Session ID in Tool Part Metadata

The `bgagent_task` tool SHALL emit the spawned child session ID and agent metadata in the tool part's `state.metadata` field so that downstream consumers (e.g., `TaskRenderer` in the workspace viewer) can disambiguate parallel task calls and render a nested sub-agent tree.

#### Scenario: Launch background task emits session metadata

- **WHEN** user calls `bgagent_task` with valid `description`, `prompt`, and `agent`
- **AND** the task is successfully launched via `TaskManager.launch()`
- **THEN** the tool part's `state.metadata` SHALL contain:
  - `sessionId`: the `sessionID` of the spawned `BackgroundTask`
  - `agent`: the trimmed agent name from the input
  - `parentAgent`: the `agent` field from `toolContext`
- **AND** the tool's `title` SHALL be `"<agent>: <description>"`
- **AND** the tool's `output` SHALL contain the success message with display ID string

#### Scenario: Error path unchanged

- **WHEN** `bgagent_task` encounters an error during launch
- **THEN** the tool returns a plain string error message (no metadata object)