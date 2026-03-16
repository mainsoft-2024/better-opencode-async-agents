# Design: Multi-Instance Dashboard + bgagent_output Description

## Architecture Overview

Two main areas of change:
1. **Server-side**: Instance ID generation + exposure via all channels
2. **Dashboard-side**: Multi-SSE connection manager + instance-aware store + UI

---

## 1. Server-Side: Instance Identity

### Instance ID Generation
- Generate UUID v4 at plugin startup in `src/index.ts`
- Pass to BackgroundManager and StatusApiServer
- Store in server.json alongside existing fields

### server.json Extension
```typescript
// Current:
{ port, pid, startedAt, url, version }

// New:
{ port, pid, startedAt, url, version, instanceId, directory, instanceName }
// instanceId: crypto.randomUUID()
// directory: ctx.directory (full path from PluginInput)
// instanceName: path.basename(ctx.directory) (e.g., 'opencode-superagents')
```

### API Extension: GET /v1/info
New endpoint returning instance metadata:
```typescript
{
  instanceId: string;
  instanceName: string;
  directory: string;
  port: number;
  pid: number;
  startedAt: string;
  version: string;
}
```

### SSE Event Extension
Every SSE event now includes `instanceId` and `instanceName`:
```typescript
// snapshot event
{ tasks, stats, instanceId, instanceName }

// task delta events
{ task, instanceId, instanceName }

// heartbeat
{ ts, instanceId, instanceName }
```

### mDNS Metadata Extension
Add `instanceId`, `directory`, `instanceName` to mDNS txt record:
```typescript
this.published = bonjour.publish({
  name: `bgagent-${process.pid}`,
  type: DISCOVERY_SERVICE_TYPE,
  port,
  txt: { ...metadata, instanceId, directory, instanceName },
});
```

### GET /v1/instances Extension
Include instanceId and instanceName from mDNS txt records in response.

---

## 2. Dashboard-Side: Multi-Instance

### Connection Manager: useMultiSSE hook
Replaces `useSSE`. Manages N concurrent EventSource connections.

```typescript
interface InstanceConnection {
  instanceId: string;
  instanceName: string;
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  eventSource: EventSource | null;
  reconnectDelay: number;
}

function useMultiSSE(instances: DiscoveredInstance[]): MultiSSEResult {
  // For each instance URL, maintain independent EventSource
  // Each connection has its own reconnection logic
  // Events dispatched to agentStore with instanceId prefix
}
```

### agentStore Extension
```typescript
interface AgentStore {
  // Existing (unchanged)
  taskOrder: string[];  // compound keys: `${instanceId}:${sessionID}`
  selectedTaskId: string | null;
  stats: StatsResponse | null;

  // Modified
  tasksById: Record<string, BackgroundTask>;  // key = `${instanceId}:${sessionID}`

  // New
  instancesById: Record<string, InstanceInfo>;
  connectionStatus: Record<string, ConnectionStatus>;
  selectedInstanceFilter: string | null;  // null = all instances

  // New actions
  upsertTasksFromInstance: (instanceId: string, tasks: BackgroundTask[], stats: StatsResponse) => void;
  applyTaskEventFromInstance: (instanceId: string, task: BackgroundTask) => void;
  setInstanceInfo: (instanceId: string, info: InstanceInfo) => void;
  setConnectionStatus: (instanceId: string, status: ConnectionStatus) => void;
  setInstanceFilter: (instanceId: string | null) => void;
  removeInstance: (instanceId: string) => void;
}

type InstanceInfo = {
  instanceId: string;
  instanceName: string;
  directory: string;
  url: string;
  color: string;  // auto-assigned from palette
};

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
```

### Instance Color Assignment
Palette of 8+ distinguishable colors. Auto-assigned by order of discovery.
```typescript
const INSTANCE_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];
```

### Task Key Strategy
Compound key: `${instanceId}:${task.sessionID}`
- Prevents ID collisions between instances
- BackgroundTask type extended with optional `instanceId` and `instanceName` fields
- Selectors filter by `selectedInstanceFilter`

### Filtered Selectors
```typescript
export const selectFilteredRootTasks = (state: AgentStore): BackgroundTask[] => {
  const filter = state.selectedInstanceFilter;
  return selectRootTasks(state).filter(
    task => !filter || task.instanceId === filter
  );
};
```

### UI Changes

#### InstanceSelector Enhancement
- Show connection status per instance (green/yellow/red dot)
- Show instance name + color badge
- Click to filter, click again to show all
- Show task count per instance

#### TaskCard Enhancement
- Add instance color bar/badge to left side
- Show instance name in task header

#### StatusBar Enhancement
- Show connected instance count
- Show total tasks across all instances

---

## 3. bgagent_output Description Fix

In `src/prompts.ts`, update the Returns section:
```
Returns:
- Current status and result (if completed)
- When full_session=true, returns filtered session messages
- When full_session=true on a running task, returns partial results (messages available so far)
- When block=true, waits until task completes or timeout is reached
- When block=false (default), returns immediately with current status
```

Add explicit note:
```
Note: full_session works for both running and completed tasks. For running tasks,
it returns all messages available so far, allowing you to monitor progress in real-time.
Combine with since_message_id for incremental polling of new messages.
```

---

## Risk Areas
- SSE connection count: 5+ EventSource connections may hit browser limits (6 per domain for HTTP/1.1, but each instance is a different host:port so OK)
- Memory: 5+ instances × N tasks could grow. Consider max task retention per instance.
- mDNS reliability: bonjour-service may miss instances on some networks. Fallback: manual URL entry.
