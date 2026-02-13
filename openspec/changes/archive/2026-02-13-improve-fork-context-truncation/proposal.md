# Change: Improve Fork Context Smart Truncation Pipeline

## Why

The current fork mode uses uniform truncation (1500 chars per tool result) and removes oldest messages when exceeding 100k tokens. This loses important context from recent tool calls while preserving irrelevant old content. It also ignores OpenCode's compaction summaries, missing an opportunity to use pre-existing conversation compression.

## What Changes

- **BREAKING**: Remove token-based budget system, replace with character-based budget (200k chars default)
- **BREAKING**: Remove `FORK_MAX_TOKENS`, `FORK_TOOL_RESULT_LIMIT`, `FORK_TOOL_PARAMS_LIMIT` constants, replace with new constants
- **BREAKING**: Remove `@anthropic-ai/tokenizer` dependency
- Add 3-stage smart truncation pipeline:
  1. **Compaction-aware slicing**: Detect OpenCode compaction boundaries (`type: "compaction"` part + `summary: true` assistant message), slice from latest compaction summary forward. If multiple compactions exist, use the most recent one only.
  2. **Graduated 3-tier tool truncation**: Recent 5 tool results = unlimited, next 10 = 3000 chars, rest = 500 chars. Tool params follow tiers too (500/200/100 chars). Uses keyword-based smart truncation (bash/pty/exec tools use head+tail 80/20 split, others use head-only). Error pattern detection (`error`, `Error`, `ERROR`, `exception`, `fail`, `FAIL`, `stack`, `traceback`) also triggers head+tail mode.
  3. **Character budget enforcement**: Final formatted output capped at 200k chars. If total is under 120k chars, skip message removal entirely. If over budget, remove oldest messages first until within budget.
- **UPDATE**: Preamble now includes truncation metadata (compaction detected yes/no, tier distribution, total chars)
- **UPDATE**: Extend `ProcessingStats` with compaction info, tier distribution, and char counts
- **NEW**: Constants: `FORK_CHAR_BUDGET`, `FORK_NO_TRIM_THRESHOLD`, `FORK_TIER_RECENT_COUNT`, `FORK_TIER_MIDDLE_COUNT`, `FORK_TIER_RECENT_LIMIT`, `FORK_TIER_MIDDLE_LIMIT`, `FORK_TIER_OLD_LIMIT`, `FORK_PARAMS_TIER_LIMITS`, `FORK_ERROR_PATTERNS`

## Impact

- Affected specs: `asyncagents-task` (Fork Context Inheritance, Fork Preamble Injection requirements)
- Affected code:
  - `src/fork/index.ts` - Rewrite truncation pipeline (compaction detection, graduated tiers, char budget)
  - `src/constants.ts` - Remove old `FORK_MAX_TOKENS`, `FORK_TOOL_RESULT_LIMIT`, `FORK_TOOL_PARAMS_LIMIT`; add new char-based constants
  - `src/manager/task-lifecycle.ts` - Update fork flow to use new pipeline
  - `src/prompts.ts` - Update preamble template with truncation metadata
- Breaking: Existing `FORK_MAX_TOKENS`, `FORK_TOOL_RESULT_LIMIT`, `FORK_TOOL_PARAMS_LIMIT` constants removed; `@anthropic-ai/tokenizer` dependency removed; token counting removed entirely
