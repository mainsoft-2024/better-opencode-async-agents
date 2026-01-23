# Tasks: Add Fork Context Inheritance

## 1. Setup and Dependencies

- [ ] 1.1 Add `@anthropic-ai/tokenizer` dependency to package.json
- [ ] 1.2 Add fork-related constants to `src/constants.ts`:
  - `FORK_MAX_TOKENS = 100000`
  - `FORK_TOOL_RESULT_LIMIT = 1500`
- [ ] 1.3 Add fork-related prompts/messages to `src/prompts.ts`:
  - Fork preamble system message
  - Fork+resume conflict error message
  - Fork success message variant

## 2. Type Definitions

- [ ] 2.1 Extend `LaunchInput` interface in `src/types.ts` with `fork?: boolean`
- [ ] 2.2 Add `isForked: boolean` field to `BackgroundTask` interface
- [ ] 2.3 Add `isForked?: boolean` to `PersistedTask` for disk persistence

## 3. Context Processing Utilities

- [ ] 3.1 Create `src/fork/index.ts` module for fork-related utilities
- [ ] 3.2 Implement `countMessageTokens()` using @anthropic-ai/tokenizer
- [ ] 3.3 Implement `truncateToolResult()` for results >1500 chars
- [ ] 3.4 Implement `processMessagesForFork()`:
  - Count total tokens
  - Remove oldest messages if >100k tokens
  - Truncate verbose tool results
  - Return processed messages
- [ ] 3.5 Write unit tests for context processing utilities

## 4. Fork Mode Implementation

- [ ] 4.1 Update `createBackgroundTask()` in `src/tools/task.ts`:
  - Add `fork` parameter to schema
  - Add validation: error if `fork && resume` both truthy
  - Route to `handleForkMode()` when fork=true
- [ ] 4.2 Create `handleForkMode()` handler in `src/tools/task.ts`:
  - Call session.fork API to create forked session
  - Invoke context processing
  - Inject system preamble via `session.prompt` with `noReply: true`
  - Send task prompt via `session.promptAsync`
- [ ] 4.3 Update `launchTask()` in `src/manager/task-lifecycle.ts`:
  - Accept optional `forkedSessionID` parameter
  - Set `isForked: true` when fork mode
  - Skip session.create when forked (session already exists)

## 5. Manager Integration

- [ ] 5.1 Add `forkSession()` method to BackgroundManager:
  - Call `client.session.fork({ path: { id: parentSessionID } })`
  - Return new session ID
- [ ] 5.2 Add `processForkedContext()` method to BackgroundManager:
  - Fetch messages from forked session
  - Apply context processing (truncation, token limit)
  - Inject system preamble
- [ ] 5.3 Update `persistTask()` to include `isForked` field

## 6. List Display Updates

- [ ] 6.1 Update `src/tools/list.ts` to show `(forked)` indicator:
  - Check `task.isForked` 
  - Append `(forked)` after task ID in table row
  - Similar pattern to existing `(resumed)` indicator

## 7. Error Handling

- [ ] 7.1 Add error handling for session.fork API failures
- [ ] 7.2 Add error handling for token counting failures (fallback to char estimate)
- [ ] 7.3 Add error handling for context processing edge cases:
  - Empty message history
  - Messages with missing parts
  - Very large single messages

## 8. Testing

- [ ] 8.1 Unit tests for fork parameter validation (fork+resume conflict)
- [ ] 8.2 Unit tests for `truncateToolResult()` function
- [ ] 8.3 Unit tests for `processMessagesForFork()` function
- [ ] 8.4 Unit tests for token counting accuracy
- [ ] 8.5 Integration test: fork mode creates new session with context
- [ ] 8.6 Integration test: isForked flag persists correctly

## 9. Documentation

- [ ] 9.1 Update tool description in `src/prompts.ts` for background_task:
  - Document `fork` parameter
  - Explain fork vs resume difference
- [ ] 9.2 Update README.md with fork feature documentation
- [ ] 9.3 Update CHANGELOG.md with new feature entry

## Dependencies

- Tasks 1.x must complete before 3.x (tokenizer needed for counting)
- Tasks 2.x must complete before 4.x and 5.x (types needed)
- Tasks 3.x must complete before 4.2 and 5.2 (utilities needed)
- Tasks 4.x and 5.x can proceed in parallel after dependencies met
- Tasks 8.x can start as soon as relevant implementation tasks complete
