# Change: Add Silent System Hints to Completion Notifications

## Why

Task completion notifications currently include both user-facing status information AND AI guidance instructions in a single visible message. This pollutes the chat history with instructional text that's meant for the AI, not the user.

**Current problem:**
```
✓ **Background task completed**
Task "Find auth files" finished in 34s.
Batch progress: 3/5 tasks complete, 2 still running.
If you need results immediately, use superagents_output(task_id="ses_abc123").
Otherwise, continue working or just say 'waiting' and halt.
WATCH OUT for leftover tasks, you will likely WANT to wait for all tasks to complete.
```

The last 3 lines are AI instructions that clutter the user's chat history.

## What Changes

Split completion notifications into two parts:
1. **Visible part** - Clean, user-friendly status message
2. **Hidden part** - Detailed AI guidance (using `synthetic: true` flag)

**New visible format:**
```
✓ **Agent "Find auth files" finished in 34s.**
Task Progress: 3/5
```

**Hidden hint (not shown to user, but sent to LLM):**
```
If you need results immediately, use superagents_output(task_id="ses_abc123").
You can continue working or just say 'waiting' and halt.
WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.
```

### Affected Notifications

| Notification Type | Status | Visible Format |
|-------------------|--------|----------------|
| Task completed | ✓ | `✓ **Agent "X" finished in Ys.**` |
| Task failed | ✗ | `✗ **Agent "X" failed in Ys.**` |
| Task cancelled | ⊘ | `⊘ **Agent "X" cancelled after Ys.**` |
| Resume completed | ✓ | `✓ **Resume #N completed in Ys.**` |
| Resume failed | ✗ | `✗ **Resume #N failed in Ys.**` |

### Hidden Hints

**When tasks still running:**
```
If you need results immediately, use superagents_output(task_id="ses_abc123").
You can continue working or just say 'waiting' and halt.
WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.
```

**When all tasks finished:**
```
All 5 tasks finished.
Use superagents_output tools to see agent responses.
```

### Development Mode Indicator

When `NODE_ENV === 'development'`, append `[hint attached]` to visible message for debugging.

## Impact

- **Affected specs:** superagents-task
- **Affected code:**
  - `src/manager/notifications.ts` - notifyParentSession, notifyResumeComplete, notifyResumeError
  - `src/prompts.ts` - Message templates (NOTIFICATION_MESSAGES)
- **Breaking changes:** None - message content changes but API unchanged
- **User impact:** Cleaner chat history, same AI behavior
