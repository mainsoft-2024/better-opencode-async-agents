---
created: 2026-03-16T06:55:00Z
last_updated: 2026-03-16T06:55:00Z
type: spec
change_id: 2026-03-16-absorb-omo-background-features
plan_number: 1
status: pending
trigger: "Phase 1: Define all new types/interfaces and build the message filtering engine as a standalone module"
depends_on: none
next: 002_bgagent-output-extension.md
---

# Plan: Types & Core Message Filtering Engine

## Background & Research

### Existing `src/types.ts` (full file, 87 lines)
The file defines core types. Key interfaces we'll be extending:
```typescript
// Lines 7-9: Status and phase types
export type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled" | "resumed";
export type TaskPhase = "waiting" | "streaming" | "tool";

// Lines 53-71: BackgroundTask interface (we add pendingResume field here)
export interface BackgroundTask {
  sessionID: string;
  parentSessionID: string;
  parentMessageID: string;
  parentAgent: string;
  description: string;
  prompt: string;
  agent: string;
  status: BackgroundTaskStatus;
  startedAt: string;
  completedAt?: string;
  resultRetrievedAt?: string;
  result?: string;
  error?: string;
  progress?: TaskProgress;
  batchId: string;
  resumeCount: number;
  isForked: boolean;
}

// Lines 32-47: PersistedTask (we add pendingResume here too)
export interface PersistedTask {
  description: string;
  agent: string;
  parentSessionID: string;
  createdAt: string;
  status: BackgroundTaskStatus;
  resumeCount?: number;
  isForked?: boolean;
  completedAt?: string;
  error?: string;
  result?: string;
  progress?: TaskProgress;
  startedAt?: string;
  batchId?: string;
}
```

### Existing `src/server/types.ts` (full file, 102 lines)
Server-side types that need new additions:
```typescript
// Lines 1: imports from ../types
import type { BackgroundTask, BackgroundTaskStatus } from "../types";

// Lines 35-39: TaskLogsResponse (reference pattern for new MessagesResponse)
export interface TaskLogsResponse {
  messages: unknown[];
  taskId: string;
  retrievedAt: string;
}

// Lines 95-101: ServerInfo (reference pattern for new DiscoveredInstance)
export interface ServerInfo {
  port: number;
  pid: number;
  startedAt: string;
  url: string;
  version: string;
}
```

### Existing `src/manager/index.ts` — getTaskMessages method (lines 359-366)
```typescript
async getTaskMessages(sessionID: string): Promise<
  Array<{
    info?: { role?: string };
    parts?: Array<{ type?: string; text?: string }>;
  }>
> {
  return getTaskMessages(sessionID, this.client);
}
```

### Existing `src/manager/task-lifecycle.ts` — getTaskMessages (lines 231-253)
```typescript
export async function getTaskMessages(
  sessionID: string,
  client: OpencodeClient
): Promise<
  Array<{
    info?: { role?: string };
    parts?: Array<{ type?: string; text?: string }>;
  }>
> {
  const messagesResult = await client.session.messages({
    path: { id: sessionID },
  });
  if (messagesResult.error) {
    throw new Error(`Error fetching messages: ${messagesResult.error}`);
  }
  return ((messagesResult as any).data ?? messagesResult) as Array<{
    info?: { role?: string };
    parts?: Array<{ type?: string; text?: string }>;
  }>;
}
```

### `src/manager/messages.ts` — DOES NOT EXIST YET
This is a new file we create in this phase.

### Test Patterns (from existing tests)
```typescript
// Import pattern (from src/manager/__tests__/task-lifecycle.test.ts)
import { describe, expect, mock, test } from "bun:test";
import type { BackgroundTask } from "../../types";

// Mock task factory pattern (reused across test files)
const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: "ses_test123",
  parentSessionID: "ses_parent",
  parentMessageID: "msg_parent",
  parentAgent: "test-agent",
  description: "Test task",
  prompt: "Test prompt",
  agent: "explore",
  status: "running",
  startedAt: new Date().toISOString(),
  batchId: "batch_123",
  resumeCount: 0,
  isForked: false,
  ...overrides,
});
```

### Design Reference — MessageFilter and FilteredMessage (from design.md)
```typescript
// MessageFilter interface (Decision 1)
interface MessageFilter {
  fullSession?: boolean;
  includeThinking?: boolean;
  includeToolResults?: boolean;
  sinceMessageId?: string;
  messageLimit?: number;
  thinkingMaxChars?: number;
}

// Filtering pipeline (from design.md data flow):
// 1. sinceMessageId slice → find index, slice after it
// 2. role/type filter → based on includeThinking and includeToolResults
// 3. thinking truncation → truncate thinking content to thinkingMaxChars
// 4. message limit → take last N messages
// 5. Return formatted FilteredMessage[] with IDs for incremental polling
```

### Design Reference — FilteredMessage type (from tasks.md 1.2)
```typescript
interface FilteredMessage {
  id: string;
  role: string;
  type: string;
  content: string;
  thinking?: string;
  toolCalls?: any[];
  timestamp?: string;
}
```

## Testing Plan (TDD - tests first)

### Test File: `src/manager/__tests__/messages.test.ts`
- [ ] Create test file with imports: `import { describe, expect, test } from "bun:test"` and import `filterMessages`, `assignMessageIds` from `../messages`
- [ ] Test `assignMessageIds()`: given messages without IDs, returns messages with stable string IDs (e.g., `msg_0`, `msg_1`)
- [ ] Test `assignMessageIds()`: given messages that already have an `.id` field, preserves existing IDs
- [ ] Test `filterMessages()` with empty filter (all defaults): returns all messages as FilteredMessage[]
- [ ] Test `filterMessages()` with `sinceMessageId`: returns only messages after the specified ID
- [ ] Test `filterMessages()` with `sinceMessageId` that doesn't exist: returns all messages (graceful fallback)
- [ ] Test `filterMessages()` with `includeThinking: false` (default): filters out thinking-type parts
- [ ] Test `filterMessages()` with `includeThinking: true`: preserves thinking-type parts in output
- [ ] Test `filterMessages()` with `includeToolResults: false` (default): filters out tool_result-type parts
- [ ] Test `filterMessages()` with `includeToolResults: true`: preserves tool_result-type parts
- [ ] Test `filterMessages()` with `thinkingMaxChars`: truncates thinking content to specified length
- [ ] Test `filterMessages()` with `messageLimit`: returns only the last N messages
- [ ] Test `filterMessages()` with combined filters: `sinceMessageId` + `includeThinking` + `messageLimit` applied in correct pipeline order

### Type Compilation Tests (verified via build)
- [ ] Verify `MessageFilter` interface is correctly exported from `src/types.ts`
- [ ] Verify `FilteredMessage` type is correctly exported from `src/types.ts`
- [ ] Verify `pendingResume` field on `BackgroundTask` compiles
- [ ] Verify `DiscoveredInstance` type is correctly exported from `src/types.ts`
- [ ] Verify `MessagesResponse` and `InstancesResponse` are correctly exported from `src/server/types.ts`

## Implementation Plan

### Step 1: Add new types to `src/types.ts`
- [ ] Add `MessageFilter` interface after `BackgroundTask` (after line 71): `{ fullSession?: boolean, includeThinking?: boolean, includeToolResults?: boolean, sinceMessageId?: string, messageLimit?: number, thinkingMaxChars?: number }`
- [ ] Add `FilteredMessage` type after `MessageFilter`: `{ id: string, role: string, type: string, content: string, thinking?: string, toolCalls?: any[], timestamp?: string }`
- [ ] Add `pendingResume` optional field to `BackgroundTask` interface (after line 70, before closing brace): `pendingResume?: { prompt: string; queuedAt: string }`
- [ ] Add `pendingResume` optional field to `PersistedTask` interface (after line 46): `pendingResume?: { prompt: string; queuedAt: string }`
- [ ] Add `DiscoveredInstance` type: `{ name: string, host: string, port: number, metadata: Record<string, string> }`

### Step 2: Add new types to `src/server/types.ts`
- [ ] Add import for `MessageFilter`, `FilteredMessage`, `DiscoveredInstance` from `../types`
- [ ] Add `MessagesResponse` interface: `{ messages: FilteredMessage[], taskId: string, filter: MessageFilter }`
- [ ] Add `InstancesResponse` interface: `{ instances: DiscoveredInstance[], discoveredAt: string }`

### Step 3: Create `src/manager/messages.ts` — Message Filtering Engine
- [ ] Create new file `src/manager/messages.ts`
- [ ] Import `MessageFilter`, `FilteredMessage` from `../types`
- [ ] Implement `assignMessageIds(messages: any[]): any[]` — assigns stable `msg_N` IDs to messages that don't have one
- [ ] Implement `filterMessages(messages: any[], filter: MessageFilter): FilteredMessage[]` with the 5-step pipeline:
  - Step 1: Call `assignMessageIds()` to ensure all messages have IDs
  - Step 2: Apply `sinceMessageId` filter — find index of message with matching ID, slice everything after it; if not found, keep all
  - Step 3: Filter by role/type — exclude thinking parts unless `includeThinking`, exclude tool_result parts unless `includeToolResults`
  - Step 4: Truncate thinking content if `thinkingMaxChars` is set
  - Step 5: Apply `messageLimit` — take last N messages
  - Step 6: Map to `FilteredMessage[]` format

### Step 4: Add `getFilteredMessages()` to `BackgroundManager`
- [ ] In `src/manager/index.ts`, import `filterMessages` from `./messages`
- [ ] Import `MessageFilter`, `FilteredMessage` from `../types`
- [ ] Add method `getFilteredMessages(sessionID: string, filter: MessageFilter): Promise<FilteredMessage[]>` that calls `this.getTaskMessages(sessionID)` then `filterMessages(rawMessages, filter)`

## Parallelization Plan

### Batch 1 (parallel) — Tests + Types
- [ ] Coder A: Write all tests in `src/manager/__tests__/messages.test.ts` (test file with stubbed imports, tests will initially fail) -> files: `src/manager/__tests__/messages.test.ts`
- [ ] Coder B: Add all new types to `src/types.ts` (MessageFilter, FilteredMessage, pendingResume on BackgroundTask, pendingResume on PersistedTask, DiscoveredInstance) -> files: `src/types.ts`
- [ ] Coder C: Add new server types to `src/server/types.ts` (MessagesResponse, InstancesResponse, updated imports) -> files: `src/server/types.ts`

### Batch 2 (after Batch 1) — Implementation
- [ ] Coder D: Create `src/manager/messages.ts` with `assignMessageIds()` and `filterMessages()` functions -> files: `src/manager/messages.ts`
- [ ] Coder E: Add `getFilteredMessages()` method to `BackgroundManager` in `src/manager/index.ts` -> files: `src/manager/index.ts`

### Dependencies
- Batch 2 depends on Batch 1 because:
  - `messages.ts` imports `MessageFilter` and `FilteredMessage` from `../types` (written by Coder B)
  - `index.ts` changes import `filterMessages` from `./messages` (written by Coder D) and types from `../types` (written by Coder B)
  - Tests import from `../messages` (created by Coder D)
- Within Batch 1, all three coders work on different files with no overlap
- Within Batch 2, Coder D and Coder E work on different files with no overlap

### Risk Areas
- The raw message format from `getTaskMessages()` uses `info.role` and `parts[].type` — the `filterMessages()` function must handle this shape correctly
- `assignMessageIds()` must produce stable IDs — using array index (`msg_0`, `msg_1`) is simplest but IDs change if messages are added; design.md says to use message IDs for `since_message_id` polling, so stability matters across calls
- `pendingResume` field addition to `BackgroundTask` and `PersistedTask` must not break existing serialization/deserialization (field is optional, so safe)

## Done Criteria
- [ ] All 13 unit tests in `src/manager/__tests__/messages.test.ts` pass
- [ ] `bun run typecheck` passes with no errors (verifies all new types compile)
- [ ] `bun test` passes (all existing + new tests)
- [ ] New types exported: `MessageFilter`, `FilteredMessage`, `DiscoveredInstance` from `src/types.ts`
- [ ] New types exported: `MessagesResponse`, `InstancesResponse` from `src/server/types.ts`
- [ ] `filterMessages()` and `assignMessageIds()` exported from `src/manager/messages.ts`
- [ ] `getFilteredMessages()` method available on `BackgroundManager` class
