## Context

The fork context pipeline in `src/fork/index.ts` currently uses `processMessagesForFork()` which applies uniform truncation: every tool result is capped to 1500 characters regardless of recency, and messages are removed from the oldest end when the total exceeds 100k tokens (via `@anthropic-ai/tokenizer`). This means the 5th-most-recent tool result receives the same budget as the 50th, and OpenCode's own compaction summaries—which already compress older conversation history—are completely ignored.

### Current implementation

- **File**: `src/fork/index.ts` — `processMessagesForFork()`, `formatMessagesAsContext()`, `truncateToolResult()`
- **Constants** (`src/constants.ts`): `FORK_MAX_TOKENS` (100,000), `FORK_TOOL_RESULT_LIMIT` (1,500 chars), `FORK_TOOL_PARAMS_LIMIT` (200 chars)
- **Preamble** (`src/prompts.ts`): Static text, no metadata about what was truncated
- **Orchestration** (`src/manager/task-lifecycle.ts`): Calls `processMessagesForFork()` → `formatMessagesAsContext()` → injects combined preamble + context into new session

### OpenCode compaction format

OpenCode performs automatic compaction when conversations grow long. The compaction produces:
1. A **user message** containing a part with `type: "compaction"` (the compaction marker)
2. An **assistant message** with `summary: true` (the compressed summary of earlier conversation)

`session.messages()` returns **all** messages, including those that predate the compaction. Tool outputs that were pruned by compaction carry `state.time.compacted` timestamps. Already-compacted tool results contain the literal text `[Old tool result content cleared]`.

### Stakeholders

- **Sub-agents (child tasks)**: Primary consumer — receive the truncated context as their conversation history
- **Parent agent**: Launches fork tasks, expects child to have enough context to complete work
- **Plugin maintainer**: Needs a predictable, testable pipeline without external dependencies

## Goals / Non-Goals

### Goals

1. **Implement a 3-stage pipeline** that processes fork context through: compaction boundary detection → graduated tool truncation → character budget enforcement
2. **Remove token counting entirely** — replace `@anthropic-ai/tokenizer` dependency with character-based budget (200k chars ≈ 50k tokens)
3. **Preserve more context from recent tool calls** via a 3-tier graduated truncation system where the most recent results keep full content
4. **Detect and leverage OpenCode compaction boundaries** to avoid including redundant pre-compaction messages
5. **Provide truncation metadata in the preamble** so the child agent knows what processing was applied

### Non-Goals

- **No summarization**: The pipeline MUST NOT make LLM calls during fork. All processing is mechanical string manipulation.
- **No per-fork-call configuration**: The smart pipeline always applies. There is no `truncation: "legacy"` escape hatch.
- **No modification of OpenCode's compaction behavior**: We detect and leverage it, but never trigger or alter it.

## Decisions

### Decision 1: 3-Stage Pipeline Architecture

The pipeline processes messages sequentially through three stages. Each stage is a pure function that receives messages and returns a (potentially smaller/modified) set of messages.

```
Input: SessionMessage[] from session.messages()
  │
  ├─ Stage 1: Compaction Boundary Detection
  │   Find latest message where part.type === "compaction"
  │   Find corresponding assistant message with summary === true
  │   Slice: keep [compaction_summary_assistant, ...everything_after]
  │   If no compaction found: pass all messages through
  │
  ├─ Stage 2: Graduated Tool Truncation (3-tier)
  │   Count tool results from END (newest = index 0)
  │   Tier 1 (index 0–4):  No truncation (unlimited)
  │   Tier 2 (index 5–14): 3000 chars max
  │   Tier 3 (index 15+):  500 chars max
  │
  │   Tool params per tier: 500 / 200 / 100 chars
  │
  │   Truncation method per tool result:
  │   - Keyword match (tool name contains 'bash', 'pty', 'exec'):
  │       → head+tail (80/20 split)
  │   - Error detected in result text (patterns: error, Error, ERROR,
  │       failed, FAILED, exception, traceback):
  │       → head+tail (80/20 split)
  │   - All others:
  │       → head-only
  │
  │   Already-compacted results ('[Old tool result content cleared]'):
  │       → pass through unchanged
  │
  ├─ Stage 3: Character Budget Enforcement
  │   Format messages via formatMessagesAsContext()
  │   If total chars ≤ 120k: no message removal (pass through)
  │   If total chars > 200k: remove oldest messages until ≤ 200k
  │   If between 120k–200k: keep as-is (graduated truncation already applied)
  │
  Output: formatted context string + ProcessingStats
```

**Rationale**: Staging gives each concern a clean boundary. Compaction detection runs first because it can eliminate the most content with zero information loss (it's already summarized). Graduated truncation runs second to compress tool outputs proportionally. Budget enforcement runs last as a hard safety cap.

**Alternatives considered**:
- *Single-pass processing*: Simpler code but mixes concerns, harder to test individual behaviors
- *Reverse-budget approach (newest→oldest)*: More optimal but significantly more complex, harder to debug

### Decision 2: Character-Only Budget (No Tokenizer)

Replace all token-based calculations with character counting. Remove the `@anthropic-ai/tokenizer` dependency entirely.

| Metric | Old (tokens) | New (chars) |
|--------|-------------|-------------|
| Budget cap | 100,000 tokens | 200,000 chars |
| No-removal threshold | — | 120,000 chars |
| Estimation | `countTokens()` | `string.length` |

**Rationale**:
- `@anthropic-ai/tokenizer` adds latency on every fork operation and is an external dependency that can break on updates
- Character-based is deterministic and instant (`O(1)` via `.length`)
- The heuristic `chars / 4 ≈ tokens` is well-established; 200k chars ≈ 50k tokens, which leaves ample room for agent response within Claude's context window
- The 120k char no-removal threshold means short conversations (≈30k tokens) pass through with zero message removal — only graduated tool truncation applies

**Alternatives considered**:
- *Keep tokenizer for hard boundaries only*: Still requires the dependency; not worth the complexity for marginal precision gain
- *`chars / 4` estimation*: Considered but rejected — using raw character count with conservative thresholds is simpler and equally effective

### Decision 3: Smart Truncation via Keyword Matching

When a tool result exceeds its tier's character limit, the truncation method depends on the tool type:

**Head+Tail (80/20 split)** applied when:
- Tool name contains any of: `bash`, `pty`, `exec` — terminal output typically has important content at both the start (command echo, initial output) and end (exit codes, final errors)
- Result text contains any of: `error`, `Error`, `ERROR`, `failed`, `FAILED`, `exception`, `traceback` — error information often appears at the tail of output

**Head-only** applied for all other tools:
- File reads, search results, API responses — structured output where the beginning is most relevant

**Truncation format**:
```
[head content, 80% of budget]
\n...[truncated {N} chars]...\n
[tail content, 20% of budget]
```

For head-only:
```
[head content, 100% of budget]
\n...[truncated {N} chars]...
```

**Already-compacted results** (containing the literal text `[Old tool result content cleared]`) are passed through unchanged — they're already minimal.

**Rationale**: This is a simple, zero-dependency heuristic that captures the most common patterns. Terminal commands frequently produce errors at the end of long output. Structured tool results (file contents, search results) are front-loaded.

**Alternatives considered**:
- *Always head+tail for everything*: Wastes tail budget on structured output where the end is irrelevant
- *Regex-based tool classification*: Over-engineered; simple `includes()` on tool name is sufficient
- *Configurable per-tool strategies*: Violates the non-goal of no per-fork configuration

### Decision 4: Extended ProcessingStats

The stats interface expands to track the full pipeline:

```typescript
interface ProcessingStats {
  originalCount: number;        // Messages before any processing
  finalCount: number;           // Messages after pipeline
  totalChars: number;           // Final character count
  removedMessages: number;      // Messages removed by char budget (Stage 3)
  compactionDetected: boolean;  // Whether compaction boundary was found (Stage 1)
  compactionSliceIndex: number; // Index where compaction slice occurred (-1 if none)
  truncatedResults: number;     // Total tool results that were truncated (Stage 2)
  tierDistribution: {           // Tool results per tier
    tier1: number;              // unlimited (index 0–4)
    tier2: number;              // 3000 chars (index 5–14)
    tier3: number;              // 500 chars (index 15+)
  };
  headTailApplied: number;      // Count of head+tail truncations (vs head-only)
}
```

**Rationale**: The old `ProcessingStats` only tracked `totalTokens`, `truncatedResults`, and `removedMessages`. The new fields are needed for:
- Preamble metadata injection (child agent knows what happened)
- Debugging context issues (which tier caused information loss?)
- Future optimization (are we hitting the char budget? how often?)

**Breaking change**: The `totalTokens` field is removed. Replaced by `totalChars`.

### Decision 5: New Constants (Replacing Old)

All old fork constants are removed and replaced:

```typescript
// ─── REMOVED ───
// FORK_MAX_TOKENS = 100_000
// FORK_TOOL_RESULT_LIMIT = 1_500
// FORK_TOOL_PARAMS_LIMIT = 200

// ─── NEW: Character Budget ───
export const FORK_CHAR_BUDGET = 200_000;        // Max chars in formatted context
export const FORK_CHAR_NO_REMOVAL = 120_000;    // Below this, skip message removal

// ─── NEW: Tier Configuration ───
export const FORK_TIER1_COUNT = 5;              // Recent tool results: unlimited
export const FORK_TIER2_COUNT = 10;             // Next N tool results: medium limit
export const FORK_TIER2_LIMIT = 3_000;          // Tier 2 char limit per result
export const FORK_TIER3_LIMIT = 500;            // Tier 3 (rest) char limit per result

// ─── NEW: Tool Params Per Tier ───
export const FORK_PARAMS_TIER1 = 500;           // Recent tool params budget
export const FORK_PARAMS_TIER2 = 200;           // Medium tool params budget
export const FORK_PARAMS_TIER3 = 100;           // Old tool params budget

// ─── NEW: Head+Tail Configuration ───
export const FORK_HEAD_RATIO = 0.8;             // 80% head
export const FORK_TAIL_RATIO = 0.2;             // 20% tail

// ─── NEW: Detection Patterns ───
export const FORK_ERROR_PATTERNS = [
  'error', 'Error', 'ERROR',
  'failed', 'FAILED',
  'exception', 'traceback'
];

export const FORK_HEAD_TAIL_KEYWORDS = ['bash', 'pty', 'exec'];
```

**Rationale**: Named constants make the tier boundaries readable and tunable without touching pipeline logic. All values are derived from the user's confirmed design choices.

### Decision 6: Dynamic Preamble with Metadata

The static preamble is replaced with a template function that includes truncation metadata:

```
You are working with forked context from a parent agent session.
Context processing applied:
- ${compactionDetected
    ? 'Compaction summary included (messages before compaction removed)'
    : 'No compaction detected'}
- Tool results: ${tier1} full, ${tier2} truncated to ${TIER2_LIMIT} chars, ${tier3} truncated to ${TIER3_LIMIT} chars
- ${removedMessages > 0
    ? `${removedMessages} oldest messages removed to fit ${CHAR_BUDGET} char budget`
    : 'All messages preserved'}
If you need complete file contents or detailed results, re-read the files directly.
```

**Rationale**: The child agent can use this metadata to decide whether to re-read files or trust the inherited context. For example, if it sees "0 full, 3 truncated to 500 chars", it knows recent results were heavily compressed and should re-read.

**Implementation**: `FORK_MESSAGES.preamble` changes from a string constant to a function `buildForkPreamble(stats: ProcessingStats): string` in `src/prompts.ts`.

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|------|----------|------------|
| Character-based budget is less precise than token-based for actual model context limits | Medium | Conservative 200k char limit (≈50k tokens) leaves significant headroom. Claude's context window is 200k tokens; 50k token fork context is well within bounds. |
| Keyword-based tool classification may miss some tool types that produce tail-important output | Low | Error pattern detection acts as a catch-all fallback. Any result containing error strings gets head+tail regardless of tool name. |
| Removing `@anthropic-ai/tokenizer` means we can't provide exact token counts | Low | Token counts were only used internally for budget enforcement; character counts serve the same purpose. No external consumer depended on token stats. |
| Multiple compactions in a single conversation could lose context between compaction boundaries | Low | Using only the most recent compaction boundary is the confirmed design choice. Earlier compactions are already summarized within the latest compaction summary. |
| Head+tail 80/20 split may not be optimal for all terminal output patterns | Low | The ratio is configurable via constants (`FORK_HEAD_RATIO`, `FORK_TAIL_RATIO`). Can be tuned based on real-world observation without pipeline changes. |

## Migration Plan

### Step-by-step implementation order

1. **Replace constants** (`src/constants.ts`)
   - Remove `FORK_MAX_TOKENS`, `FORK_TOOL_RESULT_LIMIT`, `FORK_TOOL_PARAMS_LIMIT`
   - Add all new `FORK_*` constants as defined in Decision 5

2. **Rewrite `processMessagesForFork()`** (`src/fork/index.ts`)
   - Implement Stage 1: `sliceFromCompactionBoundary(messages)`
   - Implement Stage 2: `applyGraduatedTruncation(messages)` with tier assignment, keyword detection, error detection, head+tail / head-only truncation
   - Implement Stage 3: Character budget enforcement in the main function
   - Update `ProcessingStats` interface per Decision 4
   - Remove `countMessageTokens()` and `countTokens` import

3. **Update `formatMessagesAsContext()`** (`src/fork/index.ts`)
   - Handle head+tail truncation indicator format
   - Accept tier-aware params limits for tool parameter previews

4. **Update preamble** (`src/prompts.ts`)
   - Change `FORK_MESSAGES.preamble` from string to `buildForkPreamble(stats: ProcessingStats)` function
   - Template includes compaction status, tier distribution, and message removal count

5. **Update orchestration** (`src/manager/task-lifecycle.ts`)
   - Minimal change: call updated `processMessagesForFork()` which now returns the new `ProcessingStats`
   - Pass stats to `buildForkPreamble()` instead of using static string

6. **Remove `@anthropic-ai/tokenizer`** from `package.json`
   - Run `npm uninstall @anthropic-ai/tokenizer`
   - Verify no other code imports it

7. **Add unit tests** for each pipeline stage
   - Stage 1: Compaction boundary detection (with/without compaction, multiple compactions)
   - Stage 2: Graduated truncation (tier assignment, head+tail vs head-only, error detection, already-compacted passthrough)
   - Stage 3: Character budget (under 120k, between 120k–200k, over 200k)
   - Integration: Full pipeline with realistic message sequences

### Rollback

If issues are discovered post-deployment:
- Revert the commit containing the pipeline rewrite
- Re-add `@anthropic-ai/tokenizer` dependency
- Old constants and uniform truncation logic are restored

No data migration is needed — the fork pipeline is stateless and processes messages on each fork call.

## Open Questions

None — all design decisions have been confirmed with the user.
