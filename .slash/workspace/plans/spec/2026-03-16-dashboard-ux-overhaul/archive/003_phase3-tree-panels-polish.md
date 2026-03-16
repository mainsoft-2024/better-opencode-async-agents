---
created: 2026-03-16T18:00:00Z
last_updated: 2026-03-16T18:00:00Z
type: spec
change_id: 2026-03-16-dashboard-ux-overhaul
plan_number: 3
status: pending
trigger: "Phase 3 — Agent Tree/Graph + Tool Timeline + Floating Panels + Integration + Polish"
depends_on: 002_phase2-layout-conversation.md
next: none (final phase)
---

# Plan: Agent Tree/Graph + Tool Timeline + Floating Panels + Integration + Polish

## Background & Research

### Current Dashboard State (after Phase 2)
- **65 tests passing**, build 379KB clean
- **DashboardLayout** has 5 slots: `header`, `sidebar`, `main`, `detail`, `bottomDrawer`
  - `detail={null}` and `bottomDrawer={null}` are placeholder — Phase 3 fills these
- **App.tsx** (131 lines): wires stores, passes `<TaskTree>` to sidebar, `<ConversationViewer>` to main
- **Zustand stores** fully operational: agentStore (tasks, selectors), uiStore (floatingPanels, graphMode, timelineDrawerOpen), messageStore
- **Types already defined** in `types.ts`: `AgentTreeNode`, `AgentGraphNode`, `AgentGraphEdge`, `TimelineEvent`, `FloatingPanelState`
- **Dependencies installed**: `@xyflow/react`, `@dagrejs/dagre`, `framer-motion`, `react-use-measure`, `react-virtuoso`, `shiki`

### Key Store APIs (agentStore.ts)
```ts
// Selectors already available for tree/graph building:
export const selectRootTasks = (state: AgentStore): BackgroundTask[] =>
  state.taskOrder.map(id => state.tasksById[id]).filter(t => Boolean(t) && !t.parentSessionID);

export const selectChildrenByTaskId = (state: AgentStore): Map<string, BackgroundTask[]> => {
  // Builds Map<parentSessionID, BackgroundTask[]> from all tasks with parentSessionID
  // Already sorts children by startedAt desc
};

export const selectRunningTasks = (state: AgentStore): BackgroundTask[] =>
  state.taskOrder.map(id => state.tasksById[id]).filter(t => Boolean(t) && t.status === 'running');

// Task selection:
setSelectedTask: (taskId: string | null) => void
selectedTaskId: string | null
```

### Key Store APIs (uiStore.ts)
```ts
export interface UIStore {
  graphMode: boolean;                    // tree/graph toggle
  timelineDrawerOpen: boolean;           // narrow-mode bottom drawer
  floatingPanels: FloatingPanelState[];  // panel registry
  toggleGraphMode: () => void;
  setTimelineDrawerOpen: (open: boolean) => void;
  openFloatingPanel: (taskId: string, position?: {x: number; y: number}) => void;
  updateFloatingPanel: (id: string, update: Partial<FloatingPanelState>) => void;
  closeFloatingPanel: (id: string) => void;
}
```

### Key Types (types.ts)
```ts
export interface TimelineEvent {
  id: string; taskId: string; messageId: string; toolName: string;
  status: 'running' | 'completed' | 'error';
  startTime: number; endTime?: number; duration?: number;
  args?: string; result?: string;
}

export interface AgentTreeNode {
  task: BackgroundTask; children: AgentTreeNode[];
  depth: number; isExpanded: boolean;
}

export interface AgentGraphNode {
  id: string; taskId: string; label: string;
  status: BackgroundTaskStatus; agent: string;
}

export interface AgentGraphEdge {
  id: string; source: string; target: string;
}
```

### DashboardLayout Props
```tsx
interface DashboardLayoutProps {
  sidebar: ReactNode;    // <-- currently TaskTree + InstanceSelector
  main: ReactNode;       // <-- ConversationViewer
  detail: ReactNode;     // <-- Phase 3: ToolTimeline (wide) — currently null
  header: ReactNode;     // <-- StatusBar
  bottomDrawer?: ReactNode; // <-- Phase 3: ToolTimeline (narrow) — currently null
}
```

### Old TaskTree (to replace)
```tsx
// dashboard/src/components/TaskTree.tsx (67 lines)
// Groups tasks by batchId into BatchGroup components
// Flat list, no parent-child hierarchy, no expand/collapse
// Uses BatchGroup.tsx (78 lines) — renders TaskCard per task
// Phase 3 replaces this with AgentTreeView (recursive hierarchy)
```

### Old Components to Archive/Remove
- `dashboard/src/components/TaskTree.tsx` — replaced by AgentTreeView
- `dashboard/src/components/BatchGroup.tsx` — absorbed into AgentTreeView
- `dashboard/src/components/TaskCard.tsx` — keep (may be reused in floating panels), or merge into tree nodes

## Testing Plan (TDD — tests first)

### Batch T1: Utility + Store Tests (parallel)
- [ ] Create `dashboard/src/utils/__tests__/buildAgentTree.test.ts` — test hierarchy builder:
  - flat tasks (no parent) → all at root
  - parent-child-grandchild nesting
  - tasks with missing parent gracefully handled
  - empty array → empty tree
  - sorts children by startedAt
- [ ] Create `dashboard/src/utils/__tests__/parseTimelineEvents.test.ts` — test timeline parser:
  - message with toolCalls → TimelineEvent[]
  - running tool (no endTime) → status 'running'
  - completed tool → duration computed
  - messages with no toolCalls → empty array
  - multiple messages merged chronologically
- [ ] Create `dashboard/src/stores/__tests__/messageStore-timeline.test.ts` — test timeline selectors:
  - selectTimelineEvents(taskId) returns parsed events from messages
  - events update when messages are hydrated

### Batch T2: Component Tests (parallel, after T1 utilities exist)
- [ ] Create `dashboard/src/components/agents/__tests__/AgentTreeView.test.tsx` — test tree rendering:
  - renders root tasks
  - expand/collapse toggles children visibility
  - clicking node calls setSelectedTask
  - status badges render correctly
  - running task shows pulse animation class
- [ ] Create `dashboard/src/components/timeline/__tests__/ToolTimeline.test.tsx` — test timeline:
  - renders bars for each TimelineEvent
  - running bars have pulse class
  - empty state renders placeholder
  - click on bar triggers onJumpToMessage callback
- [ ] Create `dashboard/src/components/floating/__tests__/FloatingAgentPanel.test.tsx` — test floating panel:
  - renders task summary (description, status, agent)
  - minimize/restore toggles content visibility
  - close button calls closeFloatingPanel
  - latest message preview rendered

## Implementation Plan

### Batch 1: Utilities (parallel, no file conflicts)
- [ ] Create `dashboard/src/utils/buildAgentTree.ts` — hierarchy builder:
  - Input: `BackgroundTask[]` from store
  - Output: `AgentTreeNode[]` (recursive tree)
  - Use `selectRootTasks` + `selectChildrenByTaskId` patterns from agentStore
  - Handle orphans (parentSessionID exists but parent not in list) → promote to root
- [ ] Create `dashboard/src/utils/parseTimelineEvents.ts` — timeline event parser:
  - Input: `FilteredMessage[]`
  - Output: `TimelineEvent[]` sorted by startTime
  - Extract from `message.toolCalls` array
  - Generate stable IDs from taskId + messageId + toolName + index
  - Compute duration = endTime - startTime when both present
- [ ] Add timeline selectors to `dashboard/src/stores/messageStore.ts`:
  - `selectTimelineEvents(taskId)` — memoized selector using parseTimelineEvents

### Batch 2: Independent Components (parallel, each in own directory)
- [ ] Create `dashboard/src/components/agents/AgentTreeView.tsx`:
  - Recursive CSS file-explorer tree
  - Each node: indent (depth * 16px), expand/collapse chevron, status badge, agent label, description truncated
  - Status badges: running=cyan pulse, completed=green, error=red, cancelled=gray
  - Click node → `setSelectedTask(task.sessionID)`
  - Selected node highlighted with border-blue-500
  - Use `buildAgentTree()` + store selectors
  - Tree/graph toggle button at top
- [ ] Create `dashboard/src/components/agents/AgentGraphView.tsx`:
  - Lazy-loaded with `React.lazy`
  - `@xyflow/react` ReactFlow + `@dagrejs/dagre` layout
  - Custom AgentNode: status color, agent name, description
  - Edges from parent→child with animated running edges
  - Click node → `setSelectedTask`
  - fitView on mount and when tasks change
- [ ] Create `dashboard/src/components/timeline/ToolTimeline.tsx`:
  - DevTools waterfall style, horizontal bars
  - CSS grid: left label column (tool name), right bar area
  - Bar width = duration / maxDuration * 100%
  - Running bars: pulse animation + indeterminate width
  - Completed bars: solid with tooltip on hover (name, duration, status)
  - Click bar → emit `onJumpToMessage(messageId)`
  - Auto-scroll to latest event
  - Empty/loading/error states
- [ ] Create `dashboard/src/components/floating/FloatingAgentPanel.tsx`:
  - `framer-motion` drag with `dragConstraints` bound to viewport ref
  - Title bar: agent icon, description truncated, status badge
  - Body: latest message preview (1-2 lines), progress info
  - Controls: minimize (toggle body), close (removeFloatingPanel)
  - Quick action button: "Focus" → `setSelectedTask(panel.taskId)`
  - Z-index from `floatingPanels[].zIndex` in uiStore
  - Click title bar → bring to front (update zIndex)

### Batch 3: Integration + Polish (sequential after Batch 2)
- [ ] Create `dashboard/src/components/floating/FloatingPanelLayer.tsx`:
  - Renders all `floatingPanels` from uiStore as `<FloatingAgentPanel>` instances
  - Positioned absolutely over dashboard
  - viewport drag constraint ref
- [ ] Create `dashboard/src/components/agents/AgentPane.tsx`:
  - Wrapper that reads `graphMode` from uiStore
  - Renders `<AgentTreeView>` or `<Suspense><AgentGraphView/></Suspense>` based on toggle
  - Includes tree/graph toggle button
  - Pop-out button on each node → `openFloatingPanel(taskId)`
- [ ] Update `dashboard/src/App.tsx`:
  - Replace `<TaskTree>` in sidebar with `<AgentPane>`
  - Pass `<ToolTimeline>` to `detail` slot (wide mode) and `bottomDrawer` slot
  - Add `<FloatingPanelLayer>` as overlay
  - Wire `onJumpToMessage` from timeline to conversation scroll
  - Remove old TaskTree/BatchGroup imports
- [ ] Remove old components:
  - Delete `dashboard/src/components/TaskTree.tsx`
  - Delete `dashboard/src/components/BatchGroup.tsx`
- [ ] Vite code splitting verification:
  - Confirm `AgentGraphView` is in a separate chunk (React.lazy)
  - Confirm shiki is already lazy (from Phase 2)
  - Run `vite build` and verify chunk sizes
- [ ] Add `React.memo` to heavy components:
  - Memoize `AgentTreeView` node renderer
  - Memoize `ToolTimeline` bar renderer
  - Memoize `FloatingAgentPanel`
- [ ] Final build + full test suite run

## Parallelization Plan

### Batch T1 (parallel — test utilities)
- [ ] Coder A: `buildAgentTree.test.ts` + `buildAgentTree.ts` → files: `dashboard/src/utils/buildAgentTree.ts`, `dashboard/src/utils/__tests__/buildAgentTree.test.ts`
- [ ] Coder B: `parseTimelineEvents.test.ts` + `parseTimelineEvents.ts` + messageStore timeline selector → files: `dashboard/src/utils/parseTimelineEvents.ts`, `dashboard/src/utils/__tests__/parseTimelineEvents.test.ts`, `dashboard/src/stores/messageStore.ts`

### Batch 2 (parallel — independent components, after T1)
- [ ] Coder C: `AgentTreeView.tsx` + test → files: `dashboard/src/components/agents/AgentTreeView.tsx`, `dashboard/src/components/agents/__tests__/AgentTreeView.test.tsx`
- [ ] Coder D: `AgentGraphView.tsx` (no test — lazy, hard to unit test) → files: `dashboard/src/components/agents/AgentGraphView.tsx`
- [ ] Coder E: `ToolTimeline.tsx` + test → files: `dashboard/src/components/timeline/ToolTimeline.tsx`, `dashboard/src/components/timeline/__tests__/ToolTimeline.test.tsx`
- [ ] Coder F: `FloatingAgentPanel.tsx` + test → files: `dashboard/src/components/floating/FloatingAgentPanel.tsx`, `dashboard/src/components/floating/__tests__/FloatingAgentPanel.test.tsx`

### Batch 3 (sequential — integration, after Batch 2)
- [ ] Coder G: `FloatingPanelLayer.tsx` + `AgentPane.tsx` + `App.tsx` rewrite + delete old components + React.memo + build verification → files: `dashboard/src/components/floating/FloatingPanelLayer.tsx`, `dashboard/src/components/agents/AgentPane.tsx`, `dashboard/src/App.tsx`, `dashboard/src/components/TaskTree.tsx` (DELETE), `dashboard/src/components/BatchGroup.tsx` (DELETE)

### Dependencies
- Batch T1 runs first because utilities are needed by component tests
- Batch 2 components are fully independent (each in own directory, no shared files)
- Batch 3 touches App.tsx which imports from Batch 2 outputs — must run last
- messageStore.ts is modified only in Batch T1 (Coder B) — no conflict

### Risk Areas
- **AgentGraphView** uses @xyflow/react which needs DOM — test in build only, not unit tests
- **FloatingAgentPanel** drag constraints depend on viewport — mock window dimensions in tests
- **App.tsx integration** is the critical merge point — Coder G needs all Batch 2 outputs
- **shiki chunk** already lazy from Phase 2 — verify it stays separate after adding graph chunk

## Done Criteria
- [ ] All tests pass (existing 65 + new ~30 = ~95 total)
- [ ] Build succeeds with clean output
- [ ] AgentGraphView in separate lazy chunk (verify in build output)
- [ ] `detail` and `bottomDrawer` slots filled in DashboardLayout
- [ ] Old TaskTree.tsx and BatchGroup.tsx deleted
- [ ] Floating panels draggable, minimizable, closeable
- [ ] Tree/graph toggle works in sidebar
- [ ] Timeline shows tool call waterfall bars
- [ ] Click timeline bar scrolls to conversation message (wired via callback)