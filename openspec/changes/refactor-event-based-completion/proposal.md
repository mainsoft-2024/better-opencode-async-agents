# Change: Refactor to Event-Based Completion Detection with background_block Tool

## Why

The current polling-based completion detection (`client.session.status()`) is unreliable because completed sessions often disappear from the status response rather than showing as "idle". This causes tasks to remain stuck in "running" state even after completion. Additionally, the `background_output` tool with `block=true` creates UX issues when the parent session is blocked waiting for a tool result.

## What Changes

- **BREAKING** Remove blocking capability (`block` parameter) from `background_output` tool
- Add new `background_block` tool for explicitly waiting on specific task completion
- Switch primary completion detection from polling to event-based (`session.idle` events)
- Keep polling as fallback mechanism for reliability
- Make `background_resume` consistent with `background_task` (notification-based, non-blocking)
- Ensure `background_block` works with resumed tasks

## Impact

- Affected specs: `background-task`
- Affected code:
  - `src/tools/output.ts` - Remove blocking capability
  - `src/tools/block.ts` - New tool (create)
  - `src/tools/resume.ts` - Remove blocking, make notification-based
  - `src/manager/events.ts` - Add notification trigger on session.idle
  - `src/manager/polling.ts` - Demote to fallback mechanism
  - `src/index.ts` - Register new background_block tool
