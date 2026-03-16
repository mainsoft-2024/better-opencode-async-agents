---
created: 2026-03-16T00:00:00Z
last_updated: 2026-03-16T00:00:00Z
type: spec
change_id: 2026-03-16-absorb-omo-background-features
plan_number: 4
status: pending
trigger: "Dashboard React SPA — Vite+React+Tailwind scaffolding, hooks, components, build scripts"
depends_on: 003_resume-http-discovery.md
next: 005_integration-build-verification.md
---

# Plan: Dashboard App (Phase 4)

## Background & Research

### API Endpoints Available (from src/server/routes.ts + index.ts)
The HTTP server (Phase 3) is fully implemented. Dashboard consumes these endpoints:

```
GET /v1/tasks           - PaginatedTasksResponse { tasks, total, limit, offset }
                          Query: ?status=running&agent=coder&search=foo&sort=startedAt:desc&limit=50&offset=0
GET /v1/tasks/:id       - BackgroundTask (single task detail)
GET /v1/tasks/:id/messages - MessagesResponse { messages: FilteredMessage[], taskId, filter }
                          Query: ?full_session=true&include_thinking=true&include_tool_results=true
                                  &since_message_id=X&message_limit=20&thinking_max_chars=500
GET /v1/task-groups/:id - TaskGroupResponse { groupId, tasks, stats }
GET /v1/instances       - InstancesResponse { instances: DiscoveredInstance[], discoveredAt }
GET /v1/events          - SSE stream (event types: snapshot, task.created, task.updated,
                          task.completed, task.error, task.cancelled, heartbeat)
GET /v1/health          - HealthResponse { status, uptime, version, taskCount }
GET /v1/stats           - StatsResponse { byStatus, byAgent, toolCallsByName, duration, totalTasks, activeTasks }
```

### Core Types (from src/types.ts lines 7-99)
```typescript
export type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled" | "resumed";
export type TaskPhase = "waiting" | "streaming" | "tool";

export interface TaskProgress {
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  lastTools: string[];
  lastUpdate: string;
  phase: TaskPhase;
  textCharCount: number;
  streamFrame: number;
  brailleFrame: number;
  progressBarFrame: number;
  waitingFrame: number;
  toolFrame: number;
}

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
  pendingResume?: { prompt: string; queuedAt: string };
}

export interface MessageFilter {
  fullSession?: boolean;
  includeThinking?: boolean;
  includeToolResults?: boolean;
  sinceMessageId?: string;
  messageLimit?: number;
  thinkingMaxChars?: number;
}

export type FilteredMessage = {
  id: string;
  role: string;
  type: string;
  content: string;
  thinking?: string;
  toolCalls?: any[];
  timestamp?: string;
};

export type DiscoveredInstance = {
  name: string;
  host: string;
  port: number;
  metadata: Record<string, string>;
};
```

### Server Response Types (from src/server/types.ts)
```typescript
export interface PaginatedTasksResponse {
  tasks: BackgroundTask[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatsResponse {
  byStatus: Record<string, number>;
  byAgent: Record<string, number>;
  toolCallsByName: Record<string, number>;
  toolCallsByAgent: Record<string, number>;
  duration: { avg: number; max: number; min: number; };
  totalTasks: number;
  activeTasks: number;
}

export interface TaskGroupResponse {
  groupId: string;
  tasks: BackgroundTask[];
  stats: {
    completed: number; running: number; error: number; cancelled: number;
    total: number; completionRate: number; totalToolCalls: number;
    toolCallsByName: Record<string, number>;
    toolCallsByAgent: Record<string, number>;
    duration: number;
  };
}

export type SSEEventType =
  | "snapshot" | "task.created" | "task.updated"
  | "task.completed" | "task.error" | "task.cancelled" | "heartbeat";

export interface SnapshotEvent { tasks: BackgroundTask[]; stats: StatsResponse; }
export interface TaskDeltaEvent { task: BackgroundTask; }
export interface HeartbeatEvent { ts: string; }
```

### SSE Wire Format (from src/server/sse.ts)
```
event: snapshot\ndata: {"tasks":[...],"stats":{...}}\n\n
event: task.created\ndata: {"task":{...}}\n\n
event: heartbeat\ndata: {"ts":"..."}\n\n
```
On connect, server sends a `snapshot` event with all tasks + stats.
Then delta events (`task.created`, `task.updated`, etc.) and periodic `heartbeat`.

### CORS (from src/server/cors.ts)
```typescript
// Access-Control-Allow-Origin: * (safe because server binds to 127.0.0.1 only)
```
No CORS issues — the dashboard can be served from any origin against localhost.

### Design Spec Dashboard Requirements (from design.md lines 209-254)
- React SPA served at `/dashboard` from plugin HTTP server
- Build output: `dashboard/dist/` — pre-built static files (HTML/JS/CSS)
- Features: Task tree visualization, real-time SSE status, conversation viewer,
  batch grouping by batchId, multi-instance discovery, status bar
- Tech: React 19 + TypeScript + Vite + Tailwind CSS + EventSource API
- No heavy UI framework, keep bundle small
- Static serving with SPA fallback to index.html

### Vite + React + Tailwind v4 Setup Pattern
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
})
```
```css
/* src/index.css — Tailwind v4 uses @import, no config file needed */
@import "tailwindcss";
```

### Root package.json scripts (lines 49-63)
Current build: `bun build src/index.ts --outdir dist --format esm --sourcemap=linked`
Need to add: `build:dashboard` and update `build:all` to include dashboard.

## Testing Plan (TDD — tests first)

No separate test files for dashboard React components — this is a UI mini-app.
Verification will be: TypeScript compiles, Vite builds successfully, bundle outputs to dist/.

- [ ] Create `dashboard/tsconfig.json` with strict mode, react-jsx, no emit
- [ ] Verify `tsc --noEmit` passes in dashboard/ after all files are created
- [ ] Verify `vite build` produces `dashboard/dist/index.html` + JS/CSS assets

## Implementation Plan

### Batch 1: Scaffolding (single coder, foundational)
- [ ] Create `dashboard/package.json` with React 18, Vite, @vitejs/plugin-react, tailwindcss v4, @tailwindcss/vite, TypeScript deps
- [ ] Create `dashboard/vite.config.ts` with react() + tailwindcss() plugins, outDir: 'dist'
- [ ] Create `dashboard/tsconfig.json` — target ES2020, module ESNext, jsx react-jsx, strict, moduleResolution bundler, allowImportingTsExtensions, noEmit
- [ ] Create `dashboard/index.html` — minimal HTML with `<div id="root">` and `<script type="module" src="/src/main.tsx">`
- [ ] Create `dashboard/src/index.css` — `@import "tailwindcss";` only
- [ ] Create `dashboard/src/main.tsx` — React entry: `createRoot(document.getElementById('root')!).render(<App />)`
- [ ] Create `dashboard/src/types.ts` — Copy/re-export the types the dashboard needs: BackgroundTask, BackgroundTaskStatus, TaskProgress, TaskPhase, FilteredMessage, MessageFilter, DiscoveredInstance, PaginatedTasksResponse, StatsResponse, SSEEventType, SnapshotEvent, TaskDeltaEvent, HeartbeatEvent, TaskGroupResponse
- [ ] Create `dashboard/src/App.tsx` — Shell layout with placeholder components, state for selectedTaskId and selectedInstances

### Batch 2: Hooks (3 parallel coders — no file overlap)
- [ ] Create `dashboard/src/hooks/useSSE.ts` — Connect to `${baseUrl}/v1/events` via EventSource. Parse named events (snapshot, task.*, heartbeat). Maintain tasks Map<sessionID, BackgroundTask> and stats. Auto-reconnect on error with exponential backoff (1s, 2s, 4s, max 30s). Return { tasks, stats, isConnected, error }. On 'snapshot': replace all tasks + stats. On 'task.created'/'task.updated': upsert task by sessionID. On 'task.completed'/'task.error'/'task.cancelled': update status. IMPORTANT: Use `eventSource.addEventListener(eventType, handler)` not `eventSource.onmessage` — the server sends named events.
- [ ] Create `dashboard/src/hooks/useInstances.ts` — Poll `${baseUrl}/v1/instances` every 10s. Return { instances: DiscoveredInstance[], isLoading, error, refresh() }. Add current instance (window.location.origin) as default. Allow selecting/deselecting instances.
- [ ] Create `dashboard/src/hooks/useTaskMessages.ts` — Fetch `${baseUrl}/v1/tasks/${taskId}/messages?full_session=true&include_thinking=true&include_tool_results=true`. Return { messages: FilteredMessage[], isLoading, error, refetch() }. Only fetch when taskId changes. Cache last result per taskId.

### Batch 3: Simple UI Components (3 parallel coders — no file overlap)
- [ ] Create `dashboard/src/components/StatusBar.tsx` — Top bar: connection indicator (green/red dot), total tasks count, active count, error count, completed count. Accept props: { stats: StatsResponse | null, isConnected: boolean, instanceCount: number }. Dark theme: bg-gray-900 text-gray-100.
- [ ] Create `dashboard/src/components/InstanceSelector.tsx` — Left sidebar panel: list discovered instances with checkboxes. Accept props: { instances: DiscoveredInstance[], selectedHosts: Set<string>, onToggle: (host: string) => void, onRefresh: () => void }. Show name, host:port. Compact.
- [ ] Create `dashboard/src/components/TaskCard.tsx` — Card for single task. Accept props: { task: BackgroundTask, isSelected: boolean, onClick: () => void }. Status badge (color-coded: running=blue, completed=green, error=red, cancelled=gray, resumed=yellow), agent type pill, description text, duration (startedAt→completedAt or startedAt→now for running), tool call count. Show pendingResume indicator if present.

### Batch 4: Complex Components (2 parallel coders — no file overlap)
- [ ] Create `dashboard/src/components/TaskTree.tsx` — Main content area. Accept props: { tasks: BackgroundTask[], selectedTaskId: string | null, onSelectTask: (id: string) => void }. Group tasks by batchId using BatchGroup. Within each group, show TaskCards. Sort groups by most recent task startedAt desc. Scrollable list.
- [ ] Create `dashboard/src/components/BatchGroup.tsx` — Collapsible section. Accept props: { batchId: string, tasks: BackgroundTask[], selectedTaskId: string | null, onSelectTask: (id: string) => void }. Header: batchId (truncated), task count badge, completion bar. Default: expanded for groups with running tasks, collapsed for all-completed.
- [ ] Create `dashboard/src/components/ConversationViewer.tsx` — Right panel. Accept props: { messages: FilteredMessage[], isLoading: boolean, taskId: string | null }. Render each FilteredMessage: role badge (user/assistant/system), content as pre-wrap text, thinking blocks as collapsible `<details>` with gray bg, tool calls as collapsible `<details>` showing tool name + truncated params. Auto-scroll to bottom. Show loading spinner while fetching.

### Batch 5: Wiring & Build Integration (single coder)
- [ ] Update `dashboard/src/App.tsx` — Replace placeholders with real hooks (useSSE, useInstances, useTaskMessages) and real components. Wire selectedTaskId state through TaskTree→ConversationViewer. Wire useInstances into InstanceSelector. Wire useSSE stats into StatusBar.
- [ ] Ensure `dashboard/package.json` scripts: `{ "dev": "vite", "build": "vite build", "preview": "vite preview" }`
- [ ] Update root `package.json` — add `"build:dashboard": "cd dashboard && bun install && bunx vite build"` script, update `"build:all"` to include `bun run build:dashboard`

## Parallelization Plan

### Batch 1 (sequential — foundation)
- [ ] Coder A: All scaffolding files -> files: `dashboard/package.json`, `dashboard/vite.config.ts`, `dashboard/tsconfig.json`, `dashboard/index.html`, `dashboard/src/index.css`, `dashboard/src/main.tsx`, `dashboard/src/types.ts`, `dashboard/src/App.tsx`

### Batch 2+3 (parallel — 6 coders, after Batch 1)
- [ ] Coder B: useSSE hook -> files: `dashboard/src/hooks/useSSE.ts`
- [ ] Coder C: useInstances hook -> files: `dashboard/src/hooks/useInstances.ts`
- [ ] Coder D: useTaskMessages hook -> files: `dashboard/src/hooks/useTaskMessages.ts`
- [ ] Coder E: StatusBar + InstanceSelector -> files: `dashboard/src/components/StatusBar.tsx`, `dashboard/src/components/InstanceSelector.tsx`
- [ ] Coder F: TaskCard -> files: `dashboard/src/components/TaskCard.tsx`
- [ ] Coder G: BatchGroup -> files: `dashboard/src/components/BatchGroup.tsx`

### Batch 4 (parallel — 2 coders, after Batch 2+3)
- [ ] Coder H: TaskTree -> files: `dashboard/src/components/TaskTree.tsx`
- [ ] Coder I: ConversationViewer -> files: `dashboard/src/components/ConversationViewer.tsx`

### Batch 5 (sequential — after Batch 4)
- [ ] Coder J: Wire App.tsx with real hooks + components, add build scripts -> files: `dashboard/src/App.tsx`, `dashboard/package.json`, root `package.json`

### Batch 6 (verification)
- [ ] Tester: Run `cd dashboard && bun install` then `bunx --bun tsc --noEmit` then `bunx vite build`, verify `dashboard/dist/index.html` exists

### Dependencies
- Batch 1 must complete first — scaffolding provides types.ts, tsconfig, and package.json that all other batches depend on.
- Batches 2+3 can run in parallel (hooks and simple components don't depend on each other).
- Batch 4 depends on Batches 2+3 — TaskTree imports BatchGroup/TaskCard, ConversationViewer uses FilteredMessage type.
- Batch 5 depends on Batch 4 — wiring App.tsx needs all components and hooks.
- Batch 6 depends on Batch 5 — final build verification.

### Risk Areas
- **Type alignment**: Dashboard types.ts must exactly match the server types. Coder A should copy types verbatim from the Background & Research section.
- **SSE event parsing**: The useSSE hook must handle the SSE wire format with named `event:` fields. Use `EventSource.addEventListener(eventType, ...)` not `onmessage`.
- **Tailwind v4**: Uses `@import "tailwindcss"` not `@tailwind base/components/utilities`. Uses `@tailwindcss/vite` plugin not PostCSS. NO tailwind.config.js needed.
- **Vite build in Bun**: Use `bunx vite build` — Vite works with Bun but needs `bunx` to invoke.
- **App.tsx wiring**: Batch 5 Coder J will need to update the stub App.tsx from Batch 1 to use real hooks/components.
- **No D3/React Flow**: Keep it simple — use plain HTML/CSS tree layout, not a visualization library. The spec mentions D3/React Flow as options but we should keep the bundle small.

## Done Criteria
- [ ] `tsc --noEmit` passes in dashboard/ (via `cd dashboard && bunx --bun tsc --noEmit`)
- [ ] `bunx vite build` succeeds and produces `dashboard/dist/index.html` + JS/CSS assets
- [ ] Root package.json has `build:dashboard` script
- [ ] All 13 task items from tasks.md Section 7 (7.1-7.13) addressed
- [ ] Dashboard types match server types exactly
