# Change: Add Fork Context Inheritance for Background Tasks

## Why

Currently, background tasks start with a fresh context - only the user's prompt is passed to the child agent. This means subagents have no knowledge of what the parent agent has discovered, what files have been read, or what decisions have been made. This forces repetitive tool calls and loses valuable context that could make subagents more effective.

By adding a `fork` parameter to `background_task`, parent agents can spawn children that inherit the conversation history, enabling smarter delegation where the child already understands the context and can focus on its specific task rather than re-discovering information.

## What Changes

- **NEW**: Add optional `fork: boolean` parameter to `background_task` tool
- **NEW**: When `fork=true`, use OpenCode's native `session.fork` API to create child session with inherited context
- **NEW**: Smart context truncation:
  - Omit thinking tokens (not part of message structure)
  - Truncate tool results exceeding 1500 characters (preserve tool call structure)
  - Cut oldest messages if total context exceeds 100k tokens
- **NEW**: Inject system message preamble informing child agent about truncated context
- **NEW**: Show `(forked)` indicator in `background_list` output for forked tasks
- **VALIDATION**: Error immediately if both `fork` and `resume` parameters are provided (mutually exclusive)
- **NON-BREAKING**: All existing functionality preserved; `fork` defaults to `false`

## Impact

- Affected specs: `background-task`
- Affected code:
  - `src/tools/task.ts` - Add `fork` parameter, implement fork mode handler
  - `src/types.ts` - Extend `LaunchInput` with `fork` field, add `isForked` to `BackgroundTask`
  - `src/manager/task-lifecycle.ts` - Implement fork logic using `session.fork` API
  - `src/manager/index.ts` - Add context processing methods (truncation, token counting)
  - `src/tools/list.ts` - Show `(forked)` indicator
  - `src/prompts.ts` - Add fork-related messages and preamble
  - `src/constants.ts` - Add `FORK_MAX_TOKENS`, `FORK_TOOL_RESULT_LIMIT` constants
  - New dependency: `@anthropic-ai/tokenizer` for accurate token counting
