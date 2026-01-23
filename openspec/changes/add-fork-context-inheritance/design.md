# Design: Add Fork Context Inheritance for Background Tasks

## Context

Background tasks currently run with no knowledge of the parent agent's conversation history. This is inefficient for delegation scenarios where the child would benefit from knowing what has been discovered, discussed, or decided. OpenCode provides a native `session.fork` API that can create a new session inheriting history up to a specific message point.

**Stakeholders**: Plugin users (AI agents using background_task), plugin maintainers

## Goals / Non-Goals

**Goals**:
- Enable context inheritance from parent to child agent via new `fork` parameter
- Use OpenCode's native `session.fork` API for simplicity and reliability
- Implement smart truncation to keep forked context within token limits
- Maintain backward compatibility - existing behavior unchanged when `fork` is not set
- Provide clear indication when tasks are forked (for debugging and visibility)

**Non-Goals**:
- Custom context injection (using native fork instead)
- Configurable truncation thresholds (hardcoded defaults for MVP)
- Forking from arbitrary sessions (only from calling agent's session)
- Summarization-based context compression (raw history with truncation)

## Decisions

### Decision 1: Use Native session.fork API

**What**: Leverage OpenCode's built-in `POST /session/:id/fork` endpoint rather than custom context injection.

**Why**:
- Server handles history copying automatically
- Maintains proper message ordering and structure
- Minimal code to maintain
- Already tested and reliable in OpenCode

**Alternatives considered**:
- Custom context injection: More control but more code, must handle message ordering
- Hybrid (fork + post-process): More complex, two-step process

### Decision 2: Smart Tool Result Truncation

**What**: Truncate tool results exceeding 1500 characters while preserving tool call structure (name, args, id).

**Format after truncation**:
```
[Tool result truncated - original {N} chars]
{first ~1500 chars of content}...
```

**Why**:
- Tool calls like `read_file` can return thousands of lines
- Preserving tool call structure helps child understand what was attempted
- Short results remain intact (no unnecessary truncation)
- 1500 chars is roughly 375 tokens - reasonable per-result budget

**Alternatives considered**:
- Full results: Too large, context bloat
- Shape only (no results): Loses too much information
- Configurable threshold: Added complexity for MVP

### Decision 3: Token-Based Context Limit at 100k

**What**: If total forked context exceeds 100,000 tokens, remove oldest messages until under limit.

**Why**:
- Claude's context window is typically 200k tokens
- 100k leaves ample room for child's response and new content
- Conservative default prevents context overflow errors
- Token counting via `@anthropic-ai/tokenizer` for accuracy

**Implementation**:
1. Fork session (gets full history)
2. Fetch messages from forked session
3. Calculate total tokens
4. If >100k, remove oldest messages iteratively
5. Send modified messages to child

**Note**: The session.fork creates a full copy - we process/trim after forking.

### Decision 4: System Message Preamble

**What**: Inject a system message informing the child agent about truncation:

```
You are working with forked context from a parent agent session.
Note: Some older tool results may have been truncated to save tokens.
If you need complete file contents or detailed results, re-read the files directly.
```

**Why**:
- Child agent needs to understand context may be incomplete
- Encourages re-reading files rather than relying on potentially truncated results
- Clear instruction improves child agent behavior

**Implementation**: Use `session.prompt` with `noReply: true` to inject system context before the task prompt.

### Decision 5: fork + resume Mutual Exclusion

**What**: Return error immediately if both `fork: true` and `resume: 'task_id'` are provided.

**Why**:
- `fork` creates a NEW session with copied context
- `resume` continues an EXISTING session
- These are fundamentally different operations
- Fail-fast prevents confusion

**Error message**: "Cannot use fork and resume together. Use fork for new tasks with context, resume for continuing existing tasks."

### Decision 6: Fork Indicator in Listings

**What**: Show `(forked)` after task ID in `background_list` when `isForked: true`.

**Example**: `ses_abc123 (forked)    completed    Analyze codebase`

**Why**:
- Visual indicator helps debugging
- Clear lineage tracking
- Consistent with existing `(resumed)` indicator pattern

## Data Flow

```
background_task(fork: true, prompt: "Analyze X", agent: "explore")
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Validate: fork && resume → Error │
│ 2. Get parent sessionID from context│
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 3. Call session.fork API            │
│    POST /session/{parentID}/fork    │
│    → Returns new forked session     │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 4. Fetch messages from forked       │
│ 5. Count tokens (anthropic tokenizer)
│ 6. If >100k: remove oldest messages │
│ 7. Truncate tool results >1500 chars│
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 8. Inject system preamble (noReply) │
│ 9. Send task prompt (promptAsync)   │
│ 10. Track task with isForked=true   │
└─────────────────────────────────────┘
```

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token counting accuracy | Wrong cutoff point | Use official `@anthropic-ai/tokenizer` library |
| Truncation loses critical info | Child misses important context | Preamble instructs to re-read files; preserve tool structure |
| session.fork API changes | Breaking changes from OpenCode | Pin to tested OpenCode version; add error handling |
| Large conversations slow to process | Latency on fork | 100k limit caps processing; async operation |
| New dependency (@anthropic-ai/tokenizer) | Bundle size increase | Small package (~50KB), essential for accuracy |

## Open Questions

None remaining - all decisions finalized through user consultation.
