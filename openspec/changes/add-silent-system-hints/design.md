# Design: Silent System Hints

## Context

The superagents plugin currently sends task completion notifications as visible chat messages. While necessary for user awareness, the embedded guidance text (instructions to use `superagents_output`, waiting recommendations) clutters the conversation and is primarily intended for the assistant, not the user.

OpenCode's plugin API provides `experimental.chat.system.transform` hook that allows plugins to modify the system prompt before LLM calls. This enables silent injection of assistant-facing guidance without creating visible messages.

**Stakeholders**: 
- Users: Want clean, concise notifications
- Assistant: Needs guidance on how to handle completed tasks
- Plugin developers: Need clear hook integration pattern

## Goals / Non-Goals

**Goals**:
- Separate user-facing and assistant-facing notification content
- Keep visible messages concise and informative
- Inject assistant guidance silently via system prompt
- Maintain all existing notification mechanisms (Toast, visible message)

**Non-Goals**:
- Changing Toast notification behavior
- Modifying task lifecycle or state management
- Adding configuration options (always enabled)

## Decisions

### Decision 1: Use `experimental.chat.system.transform` Hook

**What**: Register the experimental hook to inject system prompt content based on pending task state.

**Why**: 
- Official API for system prompt modification
- Called before every LLM call, ensuring up-to-date state
- Non-visible to users
- Already available in @opencode-ai/plugin

**Alternatives considered**:
- `experimental.chat.messages.transform` with `synthetic: true` - Less robust, UI behavior unclear
- Modify visible message only - Doesn't solve the core problem of guidance exposure

### Decision 2: Plain Text Format for System Hints

**What**: Use simple plain text format instead of XML/structured markup.

**Format**:
```
Agent Progress: 2/5
✓ Completed: superagents_output(task_id=abc123, def456)
✗ Error: superagents_output(task_id=ghi789)
You can continue working or just say 'waiting' and halt.
WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.
```

**Why**:
- Simpler to parse for LLMs
- Consistent with existing prompt styles
- Lower token overhead than XML

### Decision 3: Status-Grouped Task IDs

**What**: Group task IDs by status (completed/error/cancelled) in system hints.

**Why**:
- Clear visual distinction for different outcomes
- Allows assistant to prioritize error handling
- Uses existing emoji conventions (✓, ✗, ⊘)

### Decision 4: Conditional Leftover Warning

**What**: Only show "WATCH OUT for leftovers" when running tasks exist.

**Why**:
- Avoids unnecessary warnings when all tasks are finished
- Reduces prompt noise
- More precise guidance

### Decision 5: Immediate Removal After Retrieval

**What**: Remove tasks from system hints immediately after `resultRetrievedAt` is set.

**Why**:
- Matches current behavior
- Minimizes system prompt length
- Clear state transitions

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `experimental` hook may change | Hook is already in production use; monitor OpenCode releases |
| System hints only apply on next LLM call | Toast provides immediate visibility; visible message provides record |
| Increased system prompt length | Only inject when unretrieved tasks exist; remove after retrieval |

## Migration Plan

1. Add system transform hook (additive change)
2. Update visible message format (visual change only)
3. No breaking changes to existing behavior
4. No rollback needed - if hook fails, falls back to no injection

## Open Questions

None - all requirements clarified during spec creation.
