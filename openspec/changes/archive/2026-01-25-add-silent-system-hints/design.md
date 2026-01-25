# Design: Silent System Hints

## Context

The OpenCode plugin API supports message parts with a `synthetic: true` flag that hides content from the UI while still sending it to the LLM. This allows us to split notifications into user-visible and AI-only portions.

**Constraints:**
- Must use existing `session.prompt()` API
- Must work with current notification flow (200ms delay after completion)
- Must aggregate hints when multiple tasks complete before LLM runs
- Must handle all notification types (complete, error, cancel, resume)

## Goals / Non-Goals

**Goals:**
- Clean, minimal visible messages in chat history
- Detailed AI guidance delivered via synthetic parts
- Development mode visibility for debugging
- Consistent format across all notification types

**Non-Goals:**
- Changing toast notifications (keep separate format)
- Modifying tool return values (launch message stays as-is)
- Using hook infrastructure (direct session.prompt is simpler)

## Decisions

### Decision 1: Use synthetic message parts directly

**What:** Include both visible and synthetic parts in the `session.prompt()` call.

**Why:** 
- Simpler than hook-based approach
- No need for message identification logic
- Parts are delivered together, guaranteed ordering
- Already supported by the API

**Implementation:**
```typescript
await client.session.prompt({
  path: { id: task.parentSessionID },
  body: {
    agent: task.parentAgent,
    parts: [
      { type: "text", text: visibleMessage },
      { type: "text", text: hiddenHint, synthetic: true }
    ]
  }
});
```

### Decision 2: Aggregate hints for batch completions

**What:** When multiple tasks complete before the LLM processes them, aggregate all task IDs into the hint.

**Why:**
- Each completion notification is sent individually
- The hint should reference the specific completed task's ID
- No need for cross-task aggregation since each message has its own hint

**Note:** "Aggregate" means including all task IDs when listing completed tasks in the "all done" hint, not combining multiple notification messages.

### Decision 3: Conditional hint content based on batch status

**What:** Different hint content when tasks are still running vs all complete.

**Conditions:**
- `runningTasks > 0`: Show guidance to wait or continue, include warning about leftovers
- `runningTasks === 0`: Show "all done" message with guidance to use superagents_output

### Decision 4: Development mode indicator

**What:** Append `[hint attached]` to visible message when `NODE_ENV === 'development'`.

**Why:** Helps developers verify that hints are being attached correctly without needing to inspect raw API calls.

### Decision 5: Short task IDs in hints

**What:** Use short task ID format (`ses_abc12345`) in hints, not full session UUIDs.

**Why:** 
- Consistent with existing display format
- More readable for AI
- Already implemented via `shortId()` helper

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| `synthetic: true` flag behavior changes | Hints might become visible | Test thoroughly, monitor OpenCode updates |
| Multiple parts in single prompt | Unknown edge cases | Test with various batch sizes |
| NODE_ENV detection fails | Missing dev indicator | Fall back to no indicator (safe default) |

## Migration Plan

1. **Phase 1:** Update message templates in prompts.ts
2. **Phase 2:** Modify notification functions to use two-part messages
3. **Phase 3:** Add development mode indicator
4. **Rollback:** Revert to single-part messages (no API changes needed)

## Open Questions

None - all questions resolved via user consultation.
