# Change: Add background_resume tool for multi-turn subagent conversations

## Why

Currently, background tasks are one-shot operations: a single prompt is sent to a subagent, and once completed, the conversation ends. Users cannot continue interacting with a subagent after it completes its initial task. This limits the usefulness of background agents for iterative workflows where follow-up questions or refinements are needed.

## What Changes

- **NEW**: Add `background_resume` tool that sends follow-up prompts to completed tasks and retrieves responses
- **NEW**: Add "resumed" status to indicate a task is processing a follow-up prompt
- **NEW**: Track resume count per task via `resumeCount` field
- **MODIFIED**: Remove automatic session expiration (30-minute timer) - tasks persist until explicitly cleared
- **MODIFIED**: Notification behavior - only send parent session notifications when `block=false`
- **MODIFIED**: Task Status Management requirement to include "resumed" state

## Impact

- Affected specs: `background-task`
- Affected code: `src/index.ts` (BackgroundManager, tool definitions, types)
- No breaking changes to existing tools
- New tool `background_resume` added to plugin exports
