# Change: Add Silent System Hints for Background Task Notifications

## Why

Currently, background task completion notifications are sent only as visible messages via `session.prompt()`. This causes assistant-facing guidance (e.g., `superagents_output` usage instructions, waiting recommendations) to be exposed to users, disrupting the conversation flow.

This change splits notifications into two parts:
1. **Visible message**: Concise completion information only
2. **System prompt injection**: Detailed assistant guidance delivered silently via `experimental.chat.system.transform` hook

## What Changes

- **Visible message format change**: Remove guidance text, use concise format
  - Before: `✓ **Background task completed**\n...guidance...`
  - After: `**SuperAgents**\nAgent "{description}" (ID {id}) finished in {duration}.\nBatch: {completed}/{total} complete, {running} running.`

- **System prompt injection**: Add `experimental.chat.system.transform` hook for assistant hints
  - Activates only when unretrieved completed tasks exist
  - Status-grouped display (✓ Completed, ✗ Error, ⊘ Cancelled)
  - Leftover warning only when running tasks remain

- **Toast notification**: Unchanged, keep existing behavior

- **Resume operations**: Apply same system prompt injection to resume completions

## Impact

- Affected specs: `superagents-task`
- Affected code:
  - `src/index.ts` - Register experimental.chat.system.transform hook
  - `src/manager/notifications.ts` - Update visible message format
  - `src/prompts.ts` - Update message templates
  - New file: `src/hooks/system-transform.ts` - System prompt injection logic
