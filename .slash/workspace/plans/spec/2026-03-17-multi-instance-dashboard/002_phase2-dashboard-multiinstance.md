---
created: 2026-03-17T18:30:00Z
last_updated: 2026-03-17T18:30:00Z
type: spec
change_id: 2026-03-17-multi-instance-dashboard
plan_number: 2
status: pending
trigger: "Dashboard multi-instance support — concurrent SSE, compound keys, instance-aware UI"
depends_on: 001_phase1-instance-identity.md
next: TBD
---

# Plan: Dashboard Multi-Instance Support

## Background & Research

### Current agentStore (dashboard/src/stores/agentStore.ts)
```typescript
export interface AgentStore {
  tasksById: TaskRecord;           // Record<string, BackgroundTask> keyed by sessionID
  taskOrder: string[];              // sorted sessionIDs
  selectedTaskId: string | null;
  instances: DiscoveredInstance[];  // flat array from mDNS polling
  stats: StatsResponse | null;

  upsertTasksFromSnapshot: (tasks: BackgroundTask[], stats: StatsResponse) => void;
  applyTaskEvent: (task: BackgroundTask) => void;
  setSelectedTask: (taskId: string | null) => void;
  setInstances: (instances: DiscoveredInstance[]) => void;
}

// Keys are currently plain sessionID:
// upsertTasksFromSnapshot: acc[task.sessionID] = task
// applyTaskEvent: [task.sessionID]: task
// getTaskOrder: sortByStartedAtDesc → map to sessionID

// Selectors:
// selectRootTasks: filter !task.parentSessionID
// selectChildrenByTaskId: group by parentSessionID
// selectRunningTasks: filter status === 'running'
```

### Current useSSE hook (dashboard/src/hooks/useSSE.ts)
```typescript
export function useSSE(baseUrl: string): { isConnected: boolean; error: string | null } {
  // Single EventSource to `${baseUrl}/v1/events`
  // On 'snapshot': upsertTasksFromSnapshot(payload.tasks, payload.stats)
  // On 'task.*': applyTaskEvent(task) with optional status override
  // Exponential backoff reconnection (1s → 30s max)
  // Event types: snapshot, task.created, task.updated, task.completed, task.error, task.cancelled, heartbeat
}
```

### Current useInstances hook (dashboard/src/hooks/useInstances.ts)
```typescript
export function useInstances(baseUrl: string): UseInstancesResult {
  // Polls `${baseUrl}/v1/instances` every 10s
  // Merges mDNS results with getCurrentInstance()
  // Dispatches to agentStore.setInstances(merged)
  // Returns { isLoading, error, refresh }
}
```

### Current DiscoveredInstance type (dashboard/src/types.ts lines 58-63)
```typescript
export type DiscoveredInstance = {
  name: string;
  host: string;
  port: number;
  metadata: Record<string, string>;
  // NOTE: instanceId/instanceName NOT here yet — only in plugin src/types.ts
};
```

### SSE events from server (after Phase 1)
Server now includes instanceId + instanceName in:
- snapshot: `{ tasks, stats, instanceId, instanceName }`
- heartbeat: `{ ts, instanceId, instanceName }`
- task delta events also carry instance context

### Current InstanceSelector component
- Renders checkbox list of instances with host:port key
- Accepts `selectedHosts: Set<string>`, `onToggle(host)`
- No connection status dots, no color badges, no task counts

### Current TaskCard component
- Shows status badge, agent badge, description, duration, tool count
- No instance color or instance name badge

### Current StatusBar component
- Shows single connection dot, Connected/Disconnected text, instance count
- Stats: Total, Active, Error, Completed

### Current App.tsx wiring
```typescript
// Single SSE connection:
const { isConnected, error: sseError } = useSSE(apiBaseUrl);
// Instance polling:
const { isLoading, error, refresh } = useInstancesHook(apiBaseUrl);
// selectedHosts: Set<string> — local state synced from instances
```

### Design: Compound Key Strategy
All task keys become `${instanceId}:${sessionID}` to prevent collisions across instances.
BackgroundTask gets optional `instanceId` and `instanceName` fields.
Selectors must account for `selectedInstanceFilter`.

### Design: Instance Color Palette
```typescript
const INSTANCE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];
// Auto-assigned by order of discovery
```

### Design: New Types
```typescript
type InstanceInfo = {
  instanceId: string;
  instanceName: string;
  directory: string;
  url: string;
  color: string;  // auto-assigned from palette
};

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
```

---

## Testing Plan (TDD — tests first)

### Batch T1: Store + Types tests
- [ ] T1a: Add `InstanceInfo`, `ConnectionStatus` types to `dashboard/src/types.ts`; add `instanceId?`, `instanceName?` to dashboard `BackgroundTask` type; add `instanceId`/`instanceName` to `SnapshotEvent`/`HeartbeatEvent`
- [ ] T1b: Write `dashboard/src/__tests__/agentStore.multi.test.ts` testing:
  - [ ] `upsertTasksFromInstance(instanceId, tasks, stats)` stores tasks with compound key `${instanceId}:${sessionID}`
  - [ ] `applyTaskEventFromInstance(instanceId, task)` updates compound-keyed task
  - [ ] `setInstanceInfo(instanceId, info)` populates `instancesById`
  - [ ] `setConnectionStatus(instanceId, status)` updates `connectionStatus` map
  - [ ] `setInstanceFilter(instanceId|null)` sets filter; null means all
  - [ ] `removeInstance(instanceId)` cleans up tasks + instance info
  - [ ] `selectFilteredRootTasks` returns only tasks matching filter (or all if null)
  - [ ] `selectFilteredTaskOrder` returns compound keys matching filter
  - [ ] Instance color assignment: first instance gets color[0], second gets color[1], etc.
- [ ] T1c: Write `dashboard/src/__tests__/useMultiSSE.test.ts` testing:
  - [ ] Creates N EventSource connections for N instances
  - [ ] On snapshot: calls `upsertTasksFromInstance(instanceId, tasks, stats)`
  - [ ] On task delta: calls `applyTaskEventFromInstance(instanceId, task)`
  - [ ] Tracks connection status per instance
  - [ ] Handles instance removal (closes EventSource, calls removeInstance)
  - [ ] Independent reconnection per instance

---

## Implementation Plan

### Batch I1: Types + agentStore extension + instance utilities
- [ ] I1a: Update `dashboard/src/types.ts`:
  - Add `InstanceInfo` type with `instanceId, instanceName, directory, url, color`
  - Add `ConnectionStatus` type
  - Add optional `instanceId?: string` and `instanceName?: string` to `BackgroundTask`
  - Add `instanceId?: string`, `instanceName?: string` to `SnapshotEvent` and `HeartbeatEvent`
  - Update `DiscoveredInstance` to include optional `instanceId?, instanceName?, directory?`
- [ ] I1b: Create `dashboard/src/utils/instanceColors.ts`:
  - Export `INSTANCE_COLORS` array (8 colors)
  - Export `assignInstanceColor(index: number): string` — wraps around palette
  - Export `getInstanceColorByMap(instanceId: string, instancesById: Record<string, InstanceInfo>): string`
- [ ] I1c: Extend `dashboard/src/stores/agentStore.ts`:
  - Add to interface: `instancesById: Record<string, InstanceInfo>`, `connectionStatus: Record<string, ConnectionStatus>`, `selectedInstanceFilter: string | null`
  - Add actions: `upsertTasksFromInstance(instanceId, tasks, stats)`, `applyTaskEventFromInstance(instanceId, task)`, `setInstanceInfo(instanceId, info)`, `setConnectionStatus(instanceId, status)`, `setInstanceFilter(instanceId | null)`, `removeInstance(instanceId)`
  - Change `tasksById` keys to compound `${instanceId}:${sessionID}`
  - Update `taskOrder` to use compound keys
  - Update existing `upsertTasksFromSnapshot` and `applyTaskEvent` for backward compat (use 'local' as default instanceId)
  - Add selectors: `selectFilteredRootTasks`, `selectFilteredTaskOrder`, `selectInstancesById`, `selectConnectionStatus`
  - Export convenience hooks: `useInstancesById`, `useConnectionStatus`, `useInstanceFilter`, `useFilteredRootTasks`

### Batch I2: useMultiSSE + useInstances refactor
- [ ] I2a: Create `dashboard/src/hooks/useMultiSSE.ts`:
  - Accept `instances: DiscoveredInstance[]` (with url/instanceId)
  - For each instance, maintain independent EventSource to `${instance.url}/v1/events`
  - On snapshot: extract instanceId/instanceName from event payload, call `setInstanceInfo()` + `upsertTasksFromInstance()`
  - On task delta: call `applyTaskEventFromInstance()`
  - On connect: `setConnectionStatus(instanceId, 'connected')`
  - On error/close: `setConnectionStatus(instanceId, 'disconnected')`, schedule reconnect with per-instance exponential backoff
  - On instance removed from props: close EventSource, call `removeInstance(instanceId)`
  - Return `{ connectionStatuses: Record<string, ConnectionStatus> }`
- [ ] I2b: Update `dashboard/src/hooks/useInstances.ts`:
  - Enrich each `DiscoveredInstance` with `instanceId` from `metadata.instanceId`, `instanceName` from `metadata.instanceName`, `directory` from `metadata.directory`
  - Add `url` field: `http://${instance.host}:${instance.port}`
  - Current instance: derive instanceId from current page URL or use 'local'
  - Still poll `/v1/instances` from the current baseUrl; discovered instances get their own URLs

### Batch I3: UI components + App.tsx integration
- [ ] I3a: Rewrite `dashboard/src/components/InstanceSelector.tsx`:
  - Read `instancesById`, `connectionStatus` from agentStore
  - Show colored dot per instance (green=connected, yellow=connecting, red=disconnected/error)
  - Show instance name with color badge (from `InstanceInfo.color`)
  - Show task count per instance (count tasks where `instanceId === id`)
  - Click to filter (`setInstanceFilter(id)`), click selected to clear filter (null)
  - Show directory path in tooltip on hover
  - Replace props-based API with store-based (no more selectedHosts/onToggle)
- [ ] I3b: Update `dashboard/src/components/TaskCard.tsx`:
  - Add left border bar with instance color (from `instancesById[task.instanceId]?.color`)
  - Add small instance name badge next to agent badge
  - Graceful fallback if no instanceId (local/single-instance)
- [ ] I3c: Update `dashboard/src/components/StatusBar.tsx`:
  - Show connected count: `N/M instances connected`
  - Remove single isConnected dot; replace with multi-instance summary
  - Keep stat items (Total, Active, Error, Completed)
- [ ] I3d: Update `dashboard/src/App.tsx`:
  - Replace `useSSE(apiBaseUrl)` with `useMultiSSE(instances)`
  - Remove `selectedHosts` local state — replaced by `selectedInstanceFilter` in agentStore
  - Update `InstanceSelector` usage (no more props, reads from store)
  - Update `StatusBar` to use connectionStatus from store
  - Use `useFilteredRootTasks` selector for task list rendering in AgentPane
  - Ensure `selectedTaskId` uses compound key format
- [ ] I3e: Build verification: `npm run build` in dashboard/ must succeed + all tests pass

---

## Parallelization Plan

### Batch T1 (parallel — 2 coders, tests + types)
- [ ] **Coder A**: T1a (types) + T1b (agentStore.multi.test.ts) → files: `dashboard/src/types.ts`, `dashboard/src/__tests__/agentStore.multi.test.ts`
- [ ] **Coder B**: T1c (useMultiSSE.test.ts) → files: `dashboard/src/__tests__/useMultiSSE.test.ts`

### Batch I1 (parallel — 2 coders, implementation)
- [ ] **Coder C**: I1b (instanceColors.ts) + I1c (agentStore extension) → files: `dashboard/src/utils/instanceColors.ts`, `dashboard/src/stores/agentStore.ts`
- [ ] **Coder D**: I2a (useMultiSSE.ts) + I2b (useInstances.ts update) → files: `dashboard/src/hooks/useMultiSSE.ts`, `dashboard/src/hooks/useInstances.ts`

### Batch I2 (parallel — 3 coders, UI components)
- [ ] **Coder E**: I3a (InstanceSelector rewrite) → files: `dashboard/src/components/InstanceSelector.tsx`
- [ ] **Coder F**: I3b (TaskCard) + I3c (StatusBar) → files: `dashboard/src/components/TaskCard.tsx`, `dashboard/src/components/StatusBar.tsx`
- [ ] **Coder G**: I3d (App.tsx integration) + I3e (build verify) → files: `dashboard/src/App.tsx`

### Dependencies
- Batch T1 and Batch I1 run in parallel (tests don't import impl files directly in most Vitest patterns)
- Batch I2 must wait for Batch I1 (UI components import from updated stores/hooks)
- Coder G (App.tsx) must run last — depends on all hooks and components being ready

### Risk Areas
- **Compound key migration**: existing selectors (selectRootTasks, selectChildrenByTaskId) use `task.sessionID` — must update to compound key logic. selectSelectedTask also needs compound key.
- **useMultiSSE lifecycle**: adding/removing EventSource connections when instances array changes — must diff properly to avoid leaking connections.
- **Backward compat**: Single-instance mode (no mDNS) must still work — use 'local' as default instanceId.
- **AgentPane/TreeView**: These read from `selectRootTasks` / `selectChildrenByTaskId` — must use filtered versions. Coder G handles this in App.tsx integration.

---

## Done Criteria
- [ ] All new tests pass (agentStore.multi.test.ts, useMultiSSE.test.ts)
- [ ] All existing 107+ dashboard tests still pass
- [ ] Dashboard builds clean (no TS errors)
- [ ] Plugin builds clean
- [ ] Single-instance mode still works (backward compat — no mDNS = local instance only)
- [ ] Multi-instance: tasks from different instances have distinct compound keys
- [ ] InstanceSelector shows connection status dots and instance colors
- [ ] TaskCard shows instance color bar
- [ ] StatusBar shows connected instance count