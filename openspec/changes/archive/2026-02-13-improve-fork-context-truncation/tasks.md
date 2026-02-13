# Tasks: Improve Fork Context Smart Truncation Pipeline

## 1. Constants Update

- [x] 1.1 Remove old constants from `src/constants.ts`:
  - `FORK_MAX_TOKENS`
  - `FORK_TOOL_RESULT_LIMIT`
  - `FORK_TOOL_PARAMS_LIMIT`
- [x] 1.2 Add new constants in `src/constants.ts`:
  - `FORK_CHAR_BUDGET = 200_000`
  - `FORK_CHAR_NO_REMOVAL = 120_000`
  - `FORK_TIER1_COUNT = 5`
  - `FORK_TIER2_COUNT = 10`
  - `FORK_TIER2_LIMIT = 3000`
  - `FORK_TIER3_LIMIT = 500`
  - `FORK_PARAMS_TIER1 = 500`
  - `FORK_PARAMS_TIER2 = 200`
  - `FORK_PARAMS_TIER3 = 100`
  - `FORK_HEAD_RATIO = 0.8`
  - `FORK_TAIL_RATIO = 0.2`
  - `FORK_ERROR_PATTERNS = ['error', 'Error', 'ERROR', 'failed', 'FAILED', 'exception', 'traceback']`
  - `FORK_HEAD_TAIL_KEYWORDS = ['bash', 'pty', 'exec']`

## 2. Fork Processing Pipeline Rewrite

- [x] 2.1 Update `SessionMessage` interface in `src/fork/index.ts` to include compaction-related fields:
  - `parts[].type` can be `"compaction"`
  - `parts[].auto` boolean for compaction parts
  - `info.summary` boolean for compaction summary assistant messages
- [x] 2.2 Update `ProcessingStats` interface with new fields:
  - `totalChars` (replaces `totalTokens`)
  - `compactionDetected: boolean`
  - `compactionSliceIndex: number`
  - `tierDistribution: { tier1: number; tier2: number; tier3: number }`
  - `headTailApplied: number`
- [x] 2.3 Implement `findCompactionBoundary(messages)` function:
  - Scan messages in reverse for latest `type: "compaction"` part
  - Find corresponding assistant message with `summary: true`
  - Return slice index (or -1 if no compaction)
- [x] 2.4 Implement `getToolResultTier(toolIndex, totalToolResults)` function:
  - Index from end (newest = 0)
  - Return tier 1/2/3 based on `FORK_TIER1_COUNT` and `FORK_TIER2_COUNT` constants
- [x] 2.5 Implement `shouldUseHeadTail(toolName, resultText)` function:
  - Check tool name against `FORK_HEAD_TAIL_KEYWORDS`
  - Check result text against `FORK_ERROR_PATTERNS`
  - Return boolean
- [x] 2.6 Implement `truncateWithStrategy(text, limit, useHeadTail)` function:
  - Head-only: `slice(0, limit)` + indicator
  - Head+tail: head(80%) + separator + tail(20%) using `FORK_HEAD_RATIO`/`FORK_TAIL_RATIO`
  - Separator format: `\n...[truncated {N} chars]...\n`
- [x] 2.7 Rewrite `processMessage()` to use graduated truncation:
  - Accept tier info and apply per-tier limits
  - Apply smart truncation (head vs head+tail) based on tool name/error detection
  - Pass through already-compacted results unchanged
- [x] 2.8 Rewrite `processMessagesForFork()` with 3-stage pipeline:
  - Stage 1: Call `findCompactionBoundary()`, slice if found
  - Stage 2: Apply graduated tool truncation to all messages
  - Stage 3: Will be handled in `formatMessagesAsContext`
- [x] 2.9 Update `formatMessagesAsContext()`:
  - Apply per-tier tool params limits (500/200/100 chars)
  - After formatting, check total char count
  - If > `FORK_CHAR_BUDGET`: remove oldest messages and re-format
  - If ≤ `FORK_CHAR_NO_REMOVAL`: skip message removal entirely
  - Return final string + stats

## 3. Preamble Update

- [x] 3.1 Update `FORK_MESSAGES.preamble` in `src/prompts.ts` to include dynamic metadata:
  - Compaction status
  - Tier distribution summary
  - Message removal count
- [x] 3.2 Create `buildForkPreamble(stats: ProcessingStats)` function that generates dynamic preamble text

## 4. Integration Update

- [x] 4.1 Update `src/manager/task-lifecycle.ts` to use new pipeline:
  - `processMessagesForFork()` returns both messages and stats
  - Pass stats to `buildForkPreamble()` for dynamic preamble
  - Inject preamble + context as before

## 5. Dependency Cleanup

- [x] 5.1 Remove `@anthropic-ai/tokenizer` import from `src/fork/index.ts`
- [x] 5.2 Remove `countTokens` and `countMessageTokens` functions
- [x] 5.3 Remove `@anthropic-ai/tokenizer` from `package.json` dependencies
- [x] 5.4 Run `npm install` to update lockfile

## 6. Unit Tests

- [x] 6.1 Test `findCompactionBoundary()`: with compaction, without compaction, multiple compactions (use latest)
- [x] 6.2 Test `getToolResultTier()`: verify tier assignment for various indices
- [x] 6.3 Test `shouldUseHeadTail()`: keyword match, error pattern match, no match
- [x] 6.4 Test `truncateWithStrategy()`: head-only, head+tail, short text (no truncation needed)
- [x] 6.5 Test `processMessagesForFork()` full pipeline: normal conversation, conversation with compaction, short conversation (no removal), long conversation (with removal)
- [x] 6.6 Test `formatMessagesAsContext()` char budget enforcement

## 7. Build & Verify

- [x] 7.1 Run `npm run build` and fix any type errors
- [x] 7.2 Run tests and verify all pass
- [x] 7.3 Verify no references to removed constants/functions remain

## Dependencies

- Tasks 1.x must complete before 2.x (new constants needed for pipeline)
- Tasks 2.x must complete before 3.x (stats interface needed for preamble)
- Tasks 3.x must complete before 4.x (preamble builder needed for integration)
- Tasks 5.x can proceed in parallel with 3.x and 4.x (independent cleanup)
- Tasks 6.x can start as soon as relevant implementation tasks (2.x) complete
- Tasks 7.x must be last (final verification)

## Implementation Notes

- All token-based logic is replaced with character-based (`chars` not `tokens`)
- The 3-stage pipeline is: compaction boundary → graduated tool truncation → char budget enforcement
- `@anthropic-ai/tokenizer` dependency is fully removed; no token counting anywhere
- Existing `formatMessagesAsContext()` signature changes: now returns `{ text: string; stats: ProcessingStats }`
- Error detection uses simple string pattern matching (case-sensitive per pattern in `FORK_ERROR_PATTERNS`)
- Head+tail split only applies to tools in `FORK_HEAD_TAIL_KEYWORDS` or results matching `FORK_ERROR_PATTERNS`
