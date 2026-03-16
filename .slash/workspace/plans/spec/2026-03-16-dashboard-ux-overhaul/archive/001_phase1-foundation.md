---
created: 2026-03-16T14:30:00Z
last_updated: 2026-03-16T14:30:00Z
type: spec
change_id: 2026-03-16-dashboard-ux-overhaul
plan_number: 1
status: pending
trigger: "Phase 1: Foundation — Install dependencies, create Zustand stores, migrate hooks, add types"
depends_on: "none"
next: "002_phase2-layout-components.md"
---

# Plan: Phase 1 — Foundation (Dependencies, Types, Zustand Stores, Hook Migration)

## Background & Research

### Current dashboard/package.json
```json
{
  "name": "bgagent-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "vite": "^5",
    "tailwindcss": "^4",
    "@tailwindcss/vite": "^4"
  }
}
```

### Existing types.ts (dashboard/src/types.ts — 100 lines)
Already defines: `BackgroundTaskStatus`, `TaskPhase`, `TaskProgress`, `BackgroundTask`, `MessageFilter`, `FilteredMessage`, `DiscoveredInstance`, `PaginatedTasksResponse`, `StatsResponse`, `TaskGroupResponse`, `SSEEventType`, `SnapshotEvent`, `TaskDeltaEvent`, `HeartbeatEvent`.

### Existing useSSE.ts (dashboard/src/hooks/useSSE.ts — 151 lines)
- Returns `{ tasks: BackgroundTask[], stats: StatsResponse | null, isConnected: boolean, error: string | null }`
- Uses local `useState<Map<string, BackgroundTask>>` for tasksMap
- SSE listeners: `snapshot` → replaces entire map, `task.created/updated/completed/error/cancelled` → upsert single task
- Reconnect logic: exponential backoff (1s → 30s max), `stoppedRef` for cleanup
- Key functions: `handleSnapshot()`, `handleTaskDelta()`, `scheduleReconnect()`, `connect()`

### Existing useInstances.ts (dashboard/src/hooks/useInstances.ts — 77 lines)
- Returns `{ instances: DiscoveredInstance[], isLoading: boolean, error: string | null, refresh }`
- Fetches `GET /v1/instances`, merges with `getCurrentInstance()`
- Polls every 10s via `setInterval`
- Local state only

### Existing useTaskMessages.ts (dashboard/src/hooks/useTaskMessages.ts — 79 lines)
- Returns `{ messages: FilteredMessage[], isLoading: boolean, error: string | null, refetch }`
- Fetches `GET /v1/tasks/:id/messages?full_session=true&include_thinking=true&include_tool_results=true`
- Uses `useRef<Map<string, FilteredMessage[]>>` as cache
- Race condition guard via `latestTaskIdRef`

### Existing App.tsx (dashboard/src/App.tsx — 129 lines)
- Uses `useState` for `selectedTaskId`, `selectedHosts`
- Reads `window.__BGAGENT_API_URL__` for base URL
- Calls all 3 hooks directly, passes data as props to children
- 3-column grid layout: InstanceSelector | TaskTree | ConversationViewer

### Design spec: agentStore shape
```ts
interface AgentStore {
  // State
  tasksById: Record<string, BackgroundTask>;
  taskOrder: string[]; // sessionIDs sorted by startedAt desc
  selectedTaskId: string | null;
  instances: DiscoveredInstance[];
  // Actions
  upsertTasksFromSnapshot: (tasks: BackgroundTask[], stats: StatsResponse) => void;
  applyTaskEvent: (task: BackgroundTask) => void;
  setSelectedTask: (taskId: string | null) => void;
  setInstances: (instances: DiscoveredInstance[]) => void;
  // Derived selectors (exported separately)
}
// Selectors: selectedTask, rootTasks, childrenByTaskId, runningTasks
```

### Design spec: uiStore shape
```ts
interface UIStore {
  layoutMode: 'wide' | 'narrow';
  panelSizes: number[];     // [left, center, right] percentages
  graphMode: boolean;       // false = tree, true = graph
  timelineDrawerOpen: boolean;
  floatingPanels: FloatingPanelState[];
  // Actions
  setLayoutMode: (mode: 'wide' | 'narrow') => void;
  setPanelSizes: (sizes: number[]) => void;
  toggleGraphMode: () => void;
  setTimelineDrawerOpen: (open: boolean) => void;
  openFloatingPanel: (taskId: string, position?: { x: number; y: number }) => void;
  updateFloatingPanel: (id: string, update: Partial<FloatingPanelState>) => void;
  closeFloatingPanel: (id: string) => void;
}
```

### Design spec: messageStore shape
```ts
interface MessageStore {
  messagesByTaskId: Record<string, FilteredMessage[]>;
  fetchStatus: Record<string, 'idle' | 'loading' | 'loaded' | 'error'>;
  fetchErrors: Record<string, string | null>;
  // Actions
  hydrateMessages: (taskId: string, messages: FilteredMessage[]) => void;
  appendMessage: (taskId: string, message: FilteredMessage) => void;
  setFetchStatus: (taskId: string, status: 'idle' | 'loading' | 'loaded' | 'error', error?: string) => void;
  markTaskSynced: (taskId: string) => void;
  // Derived
}
```

### Zustand patterns to follow
```ts
import { create } from 'zustand';

// Store creation
export const useAgentStore = create<AgentStore>()((set, get) => ({
  tasksById: {},
  taskOrder: [],
  // ... actions using set()
}));

// Selectors (outside store for memoization)
export const useSelectedTask = () => useAgentStore((s) => s.tasksById[s.selectedTaskId ?? ''] ?? null);
export const useRootTasks = () => useAgentStore((s) => s.taskOrder.map(id => s.tasksById[id]).filter(t => !t.parentSessionID));
```

### New types needed in types.ts
```ts
// Message grouping
export interface MessageGroup {
  speakerId: string;
  speakerRole: string;
  speakerName: string;
  messages: FilteredMessage[];
  startTime?: string;
  endTime?: string;
}

// Timeline events
export interface TimelineEvent {
  id: string;
  taskId: string;
  messageId: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  startTime: number; // ms timestamp
  endTime?: number;
  duration?: number;
  args?: string;
  result?: string;
}

// Floating panel
export interface FloatingPanelState {
  id: string;
  taskId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  minimized: boolean;
  zIndex: number;
}

// Agent tree node
export interface AgentTreeNode {
  task: BackgroundTask;
  children: AgentTreeNode[];
  depth: number;
  isExpanded: boolean;
}

// Agent graph node/edge (for React Flow)
export interface AgentGraphNode {
  id: string;
  taskId: string;
  label: string;
  status: BackgroundTaskStatus;
  agent: string;
}

export interface AgentGraphEdge {
  id: string;
  source: string;
  target: string;
}
```

## Testing Plan (TDD — tests first)

### Test file: dashboard/src/stores/__tests__/agentStore.test.ts
- [ ] Test `upsertTasksFromSnapshot` replaces all tasks and updates taskOrder sorted by startedAt desc
- [ ] Test `applyTaskEvent` upserts a single task and preserves existing tasks
- [ ] Test `applyTaskEvent` adds new task to taskOrder if not present
- [ ] Test `setSelectedTask` updates selectedTaskId
- [ ] Test `setInstances` replaces instances array
- [ ] Test selector `selectedTask` returns correct task or null
- [ ] Test selector `rootTasks` returns only tasks where parentSessionID is empty/absent
- [ ] Test selector `childrenByTaskId` returns map of parentId → child tasks
- [ ] Test selector `runningTasks` returns only tasks with status 'running'

### Test file: dashboard/src/stores/__tests__/uiStore.test.ts
- [ ] Test `setLayoutMode` updates layoutMode
- [ ] Test `setPanelSizes` updates panelSizes array
- [ ] Test `toggleGraphMode` flips graphMode boolean
- [ ] Test `openFloatingPanel` adds panel to registry with correct defaults
- [ ] Test `closeFloatingPanel` removes panel from registry
- [ ] Test `updateFloatingPanel` merges partial update into existing panel

### Test file: dashboard/src/stores/__tests__/messageStore.test.ts
- [ ] Test `hydrateMessages` sets messages for a task and updates fetchStatus to 'loaded'
- [ ] Test `appendMessage` appends to existing messages for a task
- [ ] Test `setFetchStatus` sets status and optional error
- [ ] Test `markTaskSynced` clears error and sets status to 'loaded'
- [ ] Test hydrating messages for task A does not affect task B

### Test file: dashboard/src/hooks/__tests__/useSSE.test.ts (regression)
- [ ] Test SSE snapshot event dispatches to agentStore.upsertTasksFromSnapshot
- [ ] Test SSE task.updated event dispatches to agentStore.applyTaskEvent
- [ ] Test SSE reconnect after disconnect still merges with cached store data

## Implementation Plan

### Step 1: Install dependencies
- [ ] Run `npm install framer-motion react-virtuoso react-markdown remark-gfm shiki zustand react-resizable-panels react-use-measure @xyflow/react @dagrejs/dagre` in `dashboard/`
- [ ] Run `npm install -D @types/react-resizable-panels` in `dashboard/` (if types package exists; skip if bundled)
- [ ] Verify `dashboard/package.json` has all new deps listed

### Step 2: Add new types to dashboard/src/types.ts
- [ ] Add `MessageGroup` interface (speakerId, speakerRole, speakerName, messages[], startTime, endTime)
- [ ] Add `TimelineEvent` interface (id, taskId, messageId, toolName, status, startTime, endTime, duration, args, result)
- [ ] Add `FloatingPanelState` interface (id, taskId, position, size, minimized, zIndex)
- [ ] Add `AgentTreeNode` interface (task, children, depth, isExpanded)
- [ ] Add `AgentGraphNode` interface (id, taskId, label, status, agent)
- [ ] Add `AgentGraphEdge` interface (id, source, target)

### Step 3: Create stores directory and agentStore
- [ ] Create `dashboard/src/stores/agentStore.ts`
- [ ] Implement `tasksById`, `taskOrder`, `selectedTaskId`, `instances` state
- [ ] Implement `upsertTasksFromSnapshot(tasks, stats)` — normalizes tasks into tasksById, computes sorted taskOrder
- [ ] Implement `applyTaskEvent(task)` — upserts single task, inserts into taskOrder if new
- [ ] Implement `setSelectedTask(taskId)` and `setInstances(instances)`
- [ ] Export selector hooks: `useSelectedTask`, `useRootTasks`, `useChildrenByTaskId`, `useRunningTasks`
- [ ] Export `useStats` selector for stats data

### Step 4: Create uiStore
- [ ] Create `dashboard/src/stores/uiStore.ts`
- [ ] Implement layoutMode, panelSizes, graphMode, timelineDrawerOpen, floatingPanels state
- [ ] Implement all actions: setLayoutMode, setPanelSizes, toggleGraphMode, setTimelineDrawerOpen, openFloatingPanel, updateFloatingPanel, closeFloatingPanel
- [ ] Export granular selector hooks

### Step 5: Create messageStore
- [ ] Create `dashboard/src/stores/messageStore.ts`
- [ ] Implement messagesByTaskId, fetchStatus, fetchErrors state
- [ ] Implement hydrateMessages, appendMessage, setFetchStatus, markTaskSynced actions
- [ ] Export selector hooks: `useTaskMessages(taskId)`, `useTaskFetchStatus(taskId)`

### Step 6: Refactor useSSE.ts to dispatch into stores
- [ ] Import `useAgentStore` in useSSE.ts
- [ ] In `handleSnapshot`: call `useAgentStore.getState().upsertTasksFromSnapshot(payload.tasks, payload.stats)` instead of local setTasksMap/setStats
- [ ] In `handleTaskDelta`: call `useAgentStore.getState().applyTaskEvent(nextTask)` instead of local upsertTask
- [ ] Keep `isConnected` and `error` as local state (connection-specific, not global)
- [ ] Return `{ isConnected, error }` only — remove tasks/stats from return (consumers read from store)

### Step 7: Refactor useInstances.ts to write into agentStore
- [ ] Import `useAgentStore` in useInstances.ts
- [ ] In refresh callback: call `useAgentStore.getState().setInstances(mergedInstances)` after merge
- [ ] Keep isLoading and error as local state
- [ ] Return `{ isLoading, error, refresh }` — instances now read from agentStore

### Step 8: Refactor useTaskMessages.ts to hydrate messageStore
- [ ] Import `useMessageStore` in useTaskMessages.ts
- [ ] In `fetchTaskMessages`: call `useMessageStore.getState().setFetchStatus(taskId, 'loading')` before fetch
- [ ] On success: call `useMessageStore.getState().hydrateMessages(taskId, nextMessages)`
- [ ] On error: call `useMessageStore.getState().setFetchStatus(taskId, 'error', errorMsg)`
- [ ] Check messageStore cache before fetching: if `fetchStatus[taskId] === 'loaded'`, skip network call
- [ ] Return `{ isLoading, error, refetch }` — messages now read from messageStore

### Step 9: Add store selector helpers (standalone exports)
- [ ] In agentStore: export `useTaskById(taskId)`, `useTaskOrder()`, `useInstances()`
- [ ] In messageStore: export `useGroupedMessages(taskId)` (stub — returns raw messages for now, grouping logic in Phase 3)
- [ ] In uiStore: export `useLayoutMode()`, `useGraphMode()`, `useFloatingPanels()`

### Step 10: Verify dashboard still builds and runs
- [ ] Run `npm run build` in `dashboard/` — must succeed with no type errors
- [ ] Verify existing components still work (they'll need minor prop updates in App.tsx to read from stores instead of hook returns)

## Parallelization Plan

### Batch 1 (parallel — 3 coders)
- [ ] **Coder A**: Install deps + add types → files: `dashboard/package.json`, `dashboard/src/types.ts`
- [ ] **Coder B**: Create agentStore + its tests → files: `dashboard/src/stores/agentStore.ts`, `dashboard/src/stores/__tests__/agentStore.test.ts`
- [ ] **Coder C**: Create uiStore + messageStore + their tests → files: `dashboard/src/stores/uiStore.ts`, `dashboard/src/stores/messageStore.ts`, `dashboard/src/stores/__tests__/uiStore.test.ts`, `dashboard/src/stores/__tests__/messageStore.test.ts`

### Batch 2 (after Batch 1 — 2 coders)
- [ ] **Coder D**: Refactor useSSE.ts + useInstances.ts + regression tests → files: `dashboard/src/hooks/useSSE.ts`, `dashboard/src/hooks/useInstances.ts`, `dashboard/src/hooks/__tests__/useSSE.test.ts`
- [ ] **Coder E**: Refactor useTaskMessages.ts + add selector helpers → files: `dashboard/src/hooks/useTaskMessages.ts`

### Batch 3 (after Batch 2 — 1 coder)
- [ ] **Coder F**: Update App.tsx to read from stores + build verification → files: `dashboard/src/App.tsx`

### Dependencies
- Batch 1 is independent — types, stores, and deps can all be created in parallel.
- Batch 2 depends on Batch 1 because hooks import from stores (agentStore, messageStore).
- Batch 3 depends on Batch 2 because App.tsx must reflect the new hook return signatures.

### Risk Areas
- **Coder B and C both create files under `stores/`**: No conflict since they write different files. But both need `types.ts` as read-only input — Coder A must finish types before B/C reference new types. However, stores only need existing types (BackgroundTask, etc.) which are already in types.ts. New types (MessageGroup, FloatingPanelState, etc.) are additive and won't block store creation.
- **Hook refactoring changes return types**: App.tsx and any component reading from hooks will need updating. Coder F handles this in Batch 3.
- **Test runner**: Tests use vitest (or jest) — confirm dashboard has test setup. If not, a test config may need adding. Check if `vitest` is in devDependencies; if not, Coder A should add it.

## Done Criteria
- [ ] All new dependencies installed and listed in `dashboard/package.json`
- [ ] `dashboard/src/types.ts` has MessageGroup, TimelineEvent, FloatingPanelState, AgentTreeNode, AgentGraphNode, AgentGraphEdge
- [ ] `dashboard/src/stores/agentStore.ts` exists with full state, actions, and selector exports
- [ ] `dashboard/src/stores/uiStore.ts` exists with full state, actions, and selector exports
- [ ] `dashboard/src/stores/messageStore.ts` exists with full state, actions, and selector exports
- [ ] `useSSE.ts` dispatches into agentStore (no local task/stats state)
- [ ] `useInstances.ts` writes into agentStore (no local instances state)
- [ ] `useTaskMessages.ts` hydrates messageStore with cache-aware guard
- [ ] All store unit tests pass (9 agentStore + 6 uiStore + 5 messageStore = 20 tests)
- [ ] SSE regression tests pass (3 tests)
- [ ] `npm run build` in `dashboard/` succeeds with no type errors
- [ ] Dashboard still renders and connects to SSE (manual smoke test)
