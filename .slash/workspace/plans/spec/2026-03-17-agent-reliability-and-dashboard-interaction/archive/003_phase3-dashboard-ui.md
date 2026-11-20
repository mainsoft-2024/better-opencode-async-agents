---
created: 2026-03-17T23:45:00+09:00
last_updated: 2026-03-18T00:00:00+09:00
type: spec
change_id: 2026-03-17-agent-reliability-and-dashboard-interaction
plan_number: 3
status: done
trigger: "Phase 3: Dashboard UI — TaskCard stuck badge + action buttons, ConversationViewer chat input, StatusBar stuck count"
depends_on: "archive/002_phase2-server-client-bridge.md"
next: "TBD"
---

# Plan: Phase 3 — Dashboard UI (Stuck Indicators + Action Buttons + Chat Input)

## Background & Research

### TaskCard.tsx (current, lines 1-97)
```tsx
// dashboard/src/components/TaskCard.tsx
import { useInstancesById } from "../stores/agentStore";
import type { BackgroundTask, BackgroundTaskStatus } from "../types";

type TaskCardProps = {
  task: BackgroundTask;
  isSelected: boolean;
  onClick: () => void;
};

const STATUS_BADGE_STYLES: Record<BackgroundTaskStatus, string> = {
  running: "bg-blue-500/20 text-blue-300 border-blue-400/40",
  completed: "bg-green-500/20 text-green-300 border-green-400/40",
  error: "bg-red-500/20 text-red-300 border-red-400/40",
  cancelled: "bg-gray-500/20 text-gray-300 border-gray-400/40",
  resumed: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40",
  stuck: "bg-red-500/20 text-red-300 border-red-400/40 animate-pulse",
  "force-restarted": "bg-orange-500/20 text-orange-300 border-orange-400/40",
  "auto-restarted": "bg-orange-500/20 text-orange-300 border-orange-400/40",
};

// ... formatDuration helper (lines 21-37) ...

export function TaskCard({ task, isSelected, onClick }: TaskCardProps) {
  const instancesById = useInstancesById();
  const instanceInfo = task.instanceId ? instancesById[task.instanceId] : undefined;
  const instanceColor = instanceInfo?.color;
  const instanceName = instanceInfo?.instanceName ?? task.instanceId;
  const toolCalls = task.progress?.toolCalls ?? 0;
  const isRunning = task.status === "running";
  const duration = formatDuration(task.startedAt, task.completedAt, isRunning);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? "border-blue-400/70 bg-blue-500/10"
          : "border-gray-700 bg-gray-900 hover:border-gray-600 hover:bg-gray-800/80"
      }`}
      style={instanceColor ? { borderLeftColor: instanceColor, borderLeftWidth: '3px', borderLeftStyle: 'solid' } : undefined}
    >
      {/* badges row: status, agent, instance, pendingResume */}
      {/* description */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
        <span>duration: {duration}</span>
        <span>tools: {toolCalls}</span>
        <span className="truncate">id: {task.sessionID}</span>
      </div>
    </button>
  );
}
```

**Changes needed**: Add stuck elapsed-time badge (with setInterval), action buttons row (Force Restart, Cancel) using `useTaskActions` hook, pass `instanceUrl` via `instancesById`.

### ConversationViewer.tsx (current, lines 1-125)
```tsx
// dashboard/src/components/ConversationViewer.tsx
import { useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { AnimatePresence, motion } from "framer-motion";
import type { FilteredMessage } from "../types";
import { MessageBubble } from "./conversation/MessageBubble";
import { TypingIndicator } from "./conversation/TypingIndicator";
import { groupMessages } from "../utils/groupMessages";

type ConversationViewerProps = {
  messages: FilteredMessage[];
  isLoading: boolean;
  taskId: string | null;
  taskStatus?: string;
};

export function ConversationViewer({ messages, isLoading, taskId, taskStatus }: ConversationViewerProps) {
  // ... virtuosoRef, isAtBottom state, groups computation ...

  return (
    <div className="relative flex h-full flex-col rounded-lg border border-gray-800 bg-gray-950">
      {/* Header bar */}
      {/* Virtuoso list with MessageBubble + TypingIndicator footer */}
      {/* Scroll-to-latest floating button (AnimatePresence) */}
    </div>
  );
}
```

**Changes needed**: Add chat input bar at the bottom (below the Virtuoso area). Need `onSendMessage` callback prop. Input + Send button + disabled state when task not resumable.

### StatusBar.tsx (current, lines 1-76)
```tsx
// dashboard/src/components/StatusBar.tsx
import { useConnectionStatusMap, useInstancesById } from "../stores/agentStore";
import type { StatsResponse } from "../types";

type StatusBarProps = {
  stats: StatsResponse | null;
  isConnected: boolean;
  instanceCount: number;
};

function StatItem({ label, value, tone = "default" }: StatItemProps) {
  // renders a bordered stat box with label and value, tone sets text color
}

export function StatusBar({ stats, isConnected, instanceCount }: StatusBarProps) {
  // ... connection status dot, instance count text ...
  return (
    <header className="border-b border-gray-800 bg-gray-900 px-4 py-3 text-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: connection dot + label */}
        <div className="flex flex-wrap items-center gap-2">
          <StatItem label="Total" value={totalTasks} />
          <StatItem label="Active" value={activeTasks} />
          <StatItem label="Error" value={errorTasks} tone="error" />
          <StatItem label="Completed" value={completedTasks} tone="success" />
        </div>
      </div>
    </header>
  );
}
```

**Changes needed**: Add "Stuck" StatItem with `tone="error"` + animate-pulse when > 0. Use `useStuckTasks()` from agentStore.

### useTaskActions.ts (current, lines 1-30)
```ts
// dashboard/src/hooks/useTaskActions.ts
export function useTaskActions() {
  const restart = async (taskId: string, instanceUrl: string): Promise<unknown> => {
    const res = await fetch(`${instanceUrl}/v1/tasks/${taskId}/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return res.json();
  };

  const resume = async (taskId: string, message: string, instanceUrl: string): Promise<unknown> => {
    const res = await fetch(`${instanceUrl}/v1/tasks/${taskId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    return res.json();
  };

  const cancel = async (taskId: string, instanceUrl: string): Promise<unknown> => {
    const res = await fetch(`${instanceUrl}/v1/tasks/${taskId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return res.json();
  };

  return { restart, resume, cancel };
}
```

**Already implemented in Phase 2**. Used as-is by TaskCard action buttons.

### agentStore.ts selectors (relevant)
```ts
// Already has:
export const useStuckTasks = () => useAgentStore(selectStuckTasks);
export const selectStuckTasks = (state: AgentStore): BackgroundTask[] => {
  return state.taskOrder
    .map((taskId) => state.tasksById[taskId])
    .filter((task): task is BackgroundTask => Boolean(task) && task.status === "stuck");
};
export const useInstancesById = () => useAgentStore(selectInstancesById);
```

### useMultiSSE.ts SSE event handlers (relevant)
```ts
// Already handles task.stuck and task.restarted events from Phase 2:
source.addEventListener("task.stuck", handleTaskDelta("stuck"));
source.addEventListener("task.restarted", handleTaskDelta());
```

### App.tsx (relevant section)
```tsx
// ConversationViewer is rendered in main area:
<ConversationViewer
  messages={messages}
  isLoading={messagesLoading}
  taskId={selectedTaskId}
/>
```
**Need to add**: `taskStatus` prop (already in ConversationViewerProps but not passed), `onSendMessage` callback using `useTaskActions().resume`.

### Dashboard test pattern (from types-and-store.test.ts)
```ts
import { describe, expect, test, beforeEach } from "bun:test";
import { useAgentStore, selectStuckTasks } from "../stores/agentStore";
import type { BackgroundTask, BackgroundTaskStatus } from "../types";

const makeTask = (overrides: Partial<BackgroundTask> & { sessionID: string }): BackgroundTask => ({
  parentSessionID: "", parentMessageID: "", parentAgent: "",
  description: "test task", prompt: "do something", agent: "coder",
  status: "running", startedAt: new Date().toISOString(),
  batchId: "batch-1", resumeCount: 0, isForked: false,
  ...overrides,
});

beforeEach(() => {
  useAgentStore.setState({
    tasksById: {}, taskOrder: [], selectedTaskId: null,
    instances: [], stats: null, instancesById: {}, connectionStatus: {},
    selectedInstanceFilter: null,
  });
});
```

### Key constraints
- Dashboard uses **Bun test runner** (`bun:test`) — NOT vitest/jest
- No jsdom/happy-dom: tests are **store-level unit tests** (no DOM rendering)
- Use `useAgentStore.setState()` + `useAgentStore.getState()` for store testing
- Components use **Tailwind CSS** classes, no CSS modules
- `useTaskActions` needs `instanceUrl` — get from `instancesById[task.instanceId]?.url`
- TaskCard is a `<button>` element — action buttons must `stopPropagation` to prevent card selection

## Testing Plan (TDD - tests first)

### Test file: `dashboard/src/__tests__/phase3-dashboard-ui.test.ts`
- [ ] Test: `selectStuckTasks` returns only stuck tasks (already exists — verify it still passes)
- [ ] Test: `StatsResponse.byStatus.stuck` value is reflected correctly when present
- [ ] Test: Store `applyTaskEventFromInstance` updates task with stuckAt field preserved
- [ ] Test: Store `applyTaskEventFromInstance` updates task with restartCount field preserved
- [ ] Test: Task with status "stuck" has stuckAt field accessible from store
- [ ] Test: Task transitioning from "stuck" to "running" clears stuckAt in store

## Implementation Plan

### TaskCard.tsx — Stuck badge + action buttons
- [ ] Import `{ useState, useEffect }` from react for stuck timer
- [ ] Import `{ useTaskActions }` from `../hooks/useTaskActions`
- [ ] Add `useTaskActions()` call inside `TaskCard` component
- [ ] Add stuck elapsed time state: `const [stuckElapsed, setStuckElapsed] = useState(0)`
- [ ] Add `useEffect` with 1s `setInterval` that computes `Math.round((Date.now() - task.stuckAt!) / 1000)` when `task.stuckAt` is truthy; cleanup on unmount or when stuckAt changes
- [ ] Add stuck badge after the existing badges row: `{task.stuckAt && <span className="rounded-full border border-red-400/40 bg-red-500/20 px-2 py-0.5 text-xs text-red-300 animate-pulse">Stuck {stuckElapsed}s</span>}`
- [ ] Compute `instanceUrl` from `instanceInfo?.url ?? ''`
- [ ] Add action buttons div after the metadata row (duration/tools/id), inside the `<button>` element but with `onClick={(e) => e.stopPropagation()}`
- [ ] Force Restart button: visible when `task.status === "stuck"`, red variant, calls `restart(task.sessionID, instanceUrl)`, disabled when `(task.restartCount ?? 0) >= (task.maxRestartAttempts ?? 3)` with title="Max restarts exceeded"
- [ ] Cancel button: visible when `task.status === "running" || task.status === "stuck" || task.status === "waiting"`, gray variant, calls `cancel(task.sessionID, instanceUrl)`

### ConversationViewer.tsx — Chat input
- [ ] Add `onSendMessage?: (message: string) => void` and `canSendMessage?: boolean` to `ConversationViewerProps`
- [ ] Add `const [inputValue, setInputValue] = useState("")` state
- [ ] Add chat input bar div after the Virtuoso/empty-state area, before the scroll-to-latest button area: `<div className="flex shrink-0 items-center gap-2 border-t border-gray-800 px-4 py-3">`
- [ ] Add `<input type="text" placeholder="Send message to agent..." value={inputValue} onChange={...} onKeyDown={Enter → send, Shift+Enter → newline} disabled={!canSendMessage} className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50" />`
- [ ] Add `<button onClick={send} disabled={!canSendMessage || !inputValue.trim()} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">Send</button>`
- [ ] Only render chat input div when `onSendMessage` prop is provided (backward compatible)

### StatusBar.tsx — Stuck count
- [ ] Import `{ useStuckTasks }` from `../stores/agentStore`
- [ ] Add `const stuckTasks = useStuckTasks()` inside `StatusBar`
- [ ] Add `const stuckCount = stuckTasks.length` 
- [ ] Add `<StatItem>` for stuck count between Active and Error: `{stuckCount > 0 && <StatItem label="Stuck" value={stuckCount} tone="error" />}`
- [ ] Add `animate-pulse` wrapper div around Stuck StatItem when stuckCount > 0

### App.tsx — Wire up chat input
- [ ] Import `{ useTaskActions }` from `./hooks/useTaskActions`
- [ ] Add `const { resume } = useTaskActions()` in App
- [ ] Derive `selectedTask` from `tasksById[selectedTaskId]`
- [ ] Derive `taskStatus` from `selectedTask?.status`
- [ ] Derive `instanceUrl` from instancesById for selected task
- [ ] Compute `canSendMessage`: `taskStatus === "running" || taskStatus === "stuck" || taskStatus === "waiting"`
- [ ] Create `handleSendMessage` callback: calls `resume(sessionID, message, instanceUrl)`
- [ ] Pass `taskStatus`, `onSendMessage={handleSendMessage}`, `canSendMessage` to `<ConversationViewer>`

### Build verification
- [ ] Run `bun test dashboard/src/__tests__/phase3-dashboard-ui.test.ts` — all new tests pass
- [ ] Run `bun test dashboard/src/` — all 116+ existing dashboard tests pass (no regressions)
- [ ] Run `npm run build` — server builds clean
- [ ] Run `npm run build:dashboard` — dashboard builds clean, no TS errors

## Parallelization Plan

### Batch 1 (parallel)
- [ ] **Coder A**: Tests + TaskCard changes → files: `dashboard/src/__tests__/phase3-dashboard-ui.test.ts` (create), `dashboard/src/components/TaskCard.tsx`
- [ ] **Coder B**: StatusBar stuck count + ConversationViewer chat input → files: `dashboard/src/components/StatusBar.tsx`, `dashboard/src/components/ConversationViewer.tsx`

### Batch 2 (after Batch 1)
- [ ] **Coder C**: App.tsx wiring (pass taskStatus, onSendMessage, canSendMessage to ConversationViewer) → files: `dashboard/src/App.tsx`

### Batch 3 (after Batch 2)
- [ ] **Verification**: Run full test suite + build

### Dependencies
- Batch 1 is independent: TaskCard and StatusBar/ConversationViewer don't share files
- Batch 2 depends on Batch 1: App.tsx needs to know the final ConversationViewer prop interface
- Batch 3 depends on all: integration verification

### Risk Areas
- TaskCard action button `stopPropagation` — buttons are nested inside a `<button>` element, so clicks must not bubble up to the card's onClick handler
- `instanceUrl` availability — if instanceInfo is undefined (single-instance mode), need fallback to `window.location.origin`
- ConversationViewer chat input — must not interfere with Virtuoso scroll behavior
- Stuck elapsed timer — must clean up interval on unmount to avoid memory leaks

## Done Criteria
- [ ] TaskCard shows pulsing "Stuck Xs" badge when task.stuckAt is set
- [ ] TaskCard shows "Force Restart" button for stuck tasks (disabled when max restarts exceeded)
- [ ] TaskCard shows "Cancel" button for running/stuck/waiting tasks
- [ ] ConversationViewer has chat input that sends messages via POST /v1/tasks/:id/resume
- [ ] StatusBar shows "Stuck" count with red tone when stuck tasks > 0
- [ ] All new tests pass
- [ ] All 116+ existing dashboard tests pass (no regressions)
- [ ] Server build clean
- [ ] Dashboard build clean
