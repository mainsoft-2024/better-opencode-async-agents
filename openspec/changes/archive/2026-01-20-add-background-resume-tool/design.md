# Design: background_resume Tool

## Context

Background tasks currently support one-shot execution: launch → complete → retrieve results. Users need the ability to continue conversations with subagents for iterative refinement, follow-up questions, and extended workflows.

**Stakeholders**: Plugin users who orchestrate complex multi-turn agent workflows

**Constraints**:
- Must integrate with existing BackgroundManager architecture
- Must not break existing tool behavior
- Sessions are managed by OpenCode client, not directly by this plugin

## Goals / Non-Goals

**Goals**:
- Enable multi-turn conversations with completed background tasks
- Provide configurable blocking/async behavior matching existing patterns
- Track conversation continuity via resume count
- Remove session expiration to support long-running conversational workflows

**Non-Goals**:
- Resuming running, error, or cancelled tasks (only completed tasks)
- Providing conversation history in response (only new response returned)
- Auto-recreation of expired sessions (return error with hint instead)
- Rate limiting or quota management

## Decisions

### Decision 1: Only completed tasks can be resumed

**Rationale**: Running tasks are still processing and can't accept new prompts safely. Error/cancelled tasks have terminated abnormally and resuming them could lead to undefined behavior.

**Alternatives considered**:
- Allow resuming any status: Rejected due to complexity and unclear semantics
- Allow resuming error tasks: Rejected because error state indicates fundamental failure

### Decision 2: New "resumed" status during processing

**Rationale**: Distinguishes between a task waiting for initial completion vs. processing a follow-up prompt. Prevents concurrent resume calls.

**State transitions**:
```
completed → resumed (on resume call)
resumed → completed (when follow-up response received)
```

### Decision 3: Remove session expiration entirely

**Rationale**: The 30-minute expiration timer conflicts with long-running conversational workflows. Tasks should persist until explicitly cleared via `background_clear` or parent session ends.

**Migration**: No migration needed - simply remove the expiration logic. Existing tasks will no longer auto-expire.

### Decision 4: Notifications only when block=false

**Rationale**: When blocking, the caller receives the result directly and doesn't need a notification. When async, the notification is essential for the caller to know the resume completed.

**Applies to**: Both `background_resume` (new) and `background_output` (fix)

### Decision 5: Full conversation history preserved for subagent

**Rationale**: The subagent needs context from previous interactions to provide coherent responses. OpenCode sessions already maintain message history.

**Implementation**: Simply send new prompt to existing session - history is automatically available.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Memory growth without expiration | Tasks still cleared on parent session end or via `background_clear` |
| Concurrent resume race conditions | "resumed" status blocks concurrent calls with clear error |
| Session garbage collection by OpenCode | Return error with hint to start new task |
| Long-lived sessions consuming resources | Document best practices for clearing completed tasks |

## Open Questions

None - all questions resolved through user clarification.

## Implementation Notes

### BackgroundTask Interface Changes

```typescript
interface BackgroundTask {
  // ... existing fields ...
  status: "running" | "completed" | "error" | "cancelled" | "resumed";
  resumeCount: number;  // NEW: tracks number of times task was resumed
}
```

### Tool Parameters

```typescript
// background_resume parameters
{
  task_id: string;      // Required: task to resume
  message: string;      // Required: follow-up prompt (same format as background_task prompt)
  block: boolean;       // Optional: wait for response (default: false)
  timeout: number;      // Optional: max wait ms when blocking (default: 60000, max: 600000)
}
```

### Error Cases

| Condition | Error Message |
|-----------|---------------|
| Task not found | "Task not found: {task_id}" |
| Task not completed | "Cannot resume task: status is '{status}'. Only completed tasks can be resumed." |
| Task already resuming | "Task is currently being resumed. Wait for completion before sending another message." |
| Session expired | "Session expired or was deleted. Start a new background_task to continue." |
