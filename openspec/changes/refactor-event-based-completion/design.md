# Design: Event-Based Completion Detection

## Context

The background agent plugin needs reliable task completion detection. Currently it uses polling (`client.session.status()`) which fails when completed sessions disappear from the status response. Research shows that event-based detection via `session.idle` events is the recommended approach, with polling as a fallback for reliability.

## Goals / Non-Goals

**Goals:**
- Reliable task completion detection using events as primary mechanism
- Clear, unified API for waiting on task completion (`background_block`)
- Consistent behavior across `background_task` and `background_resume`
- Backward-compatible result delivery via notifications

**Non-Goals:**
- Database persistence for tasks (remains in-memory)
- Multi-agent orchestration primitives (chains, chords)
- Real-time streaming progress updates

## Decisions

### Decision 1: Event-Based Completion + Polling Fallback

**What**: Use `session.idle` events as primary completion detection, keep polling as fallback.

**Why**: 
- Events provide immediate notification (no latency)
- Polling provides reliability (events can be missed during reconnection)
- Research recommends "poll for truth, listen for speed"

**Implementation**:
```typescript
// Primary: Event handler marks task complete + sends notification
if (event.type === "session.idle") {
  const task = findTaskBySessionID(sessionID);
  if (task?.status === "running") {
    task.status = "completed";
    notifyParentSession(task); // Send full result
  }
}

// Fallback: Polling checks status + messages (reduced frequency)
// Only triggers if event was somehow missed
```

### Decision 2: Remove Blocking from background_output

**What**: Remove `block` parameter from `background_output`. It becomes status-only.

**Why**:
- Blocking creates UX issues (parent can't receive notifications while blocked)
- Results are already delivered via notification when task completes
- Status-checking should be non-blocking (quick check)

**Migration**: Users who need to wait should use new `background_block` tool.

### Decision 3: New background_block Tool

**What**: Explicit blocking tool for waiting on specific tasks.

**Why**:
- Clear separation of concerns (status vs waiting)
- Supports selective waiting (specific task_ids only)
- Compatible with both `background_task` and `background_resume`

**API**:
```typescript
background_block({
  task_ids: string[],  // Required: specific tasks to wait for
  timeout?: number     // Optional: max wait time (default: 60000ms)
})
```

**Behavior**:
1. Filter out already-completed tasks from `task_ids`
2. Block until all remaining tasks complete OR timeout reached
3. Return status summary of all specified tasks

### Decision 4: Notification-Based background_resume

**What**: Remove blocking from `background_resume`. Make it consistent with `background_task`.

**Why**:
- Consistency: both task creation and resumption use same pattern
- UX: Users expect same flow (fire-and-forget, get notification when done)
- Composability: Can use `background_block` after resume if blocking needed

**Flow**:
```
background_resume(task_id, message)
  → Returns immediately with confirmation
  → Sends "[BACKGROUND RESUME COMPLETED]" notification when done
  → User can call background_block([task_id]) if they want to wait
```

## Alternatives Considered

### Alternative A: Remove background_output entirely
**Rejected**: Status-checking is still useful for debugging and manual inspection.

### Alternative B: background_wait with optional task_ids
**Rejected**: User preference was specific tasks only (clearer intent).

### Alternative C: Events only (no polling fallback)
**Rejected**: Research recommends hybrid approach for reliability.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Event subscription disconnects | Auto-reconnection with retry logic (already implemented) |
| Events missed during reconnection | Polling fallback checks every 5 seconds |
| Memory growth from tasks | Existing cleanup: tasks deleted after result retrieved + display duration |
| Breaking change to background_output | Clear migration path to background_block |

## Migration Plan

1. **Phase 1**: Add `background_block` tool (non-breaking)
2. **Phase 2**: Deprecate `block` parameter in `background_output` (emit warning if used)
3. **Phase 3**: Remove `block` parameter from `background_output`
4. **Phase 4**: Update `background_resume` to notification-based

All phases can be deployed together since this is a plugin (users get new version atomically).

## Open Questions

None - all questions resolved via user clarification.
