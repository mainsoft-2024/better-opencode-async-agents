# Tasks: Multi-Instance Dashboard + bgagent_output Description

## Phase 1: Server-Side Instance Identity + bgagent_output Fix

### 1.1 Instance ID Generation
- [ ] Generate `crypto.randomUUID()` in `src/index.ts` at plugin startup
- [ ] Pass instanceId + directory to BackgroundManager constructor
- [ ] Pass instanceId + directory to StatusApiServer.start()
- [ ] Store instanceId and instanceName (basename of directory) as module-level state

### 1.2 server.json Extension
- [ ] Add `instanceId`, `directory`, `instanceName` fields to `writeServerInfo()` in `src/storage.ts`
- [ ] Update type signature of writeServerInfo parameter
- [ ] Write test: server.json includes new fields

### 1.3 API: GET /v1/info Endpoint
- [ ] Create `handleInfo()` in `src/server/routes.ts` returning instance metadata
- [ ] Register route in `src/server/index.ts`
- [ ] Write test: GET /v1/info returns correct shape

### 1.4 SSE Event Extension
- [ ] Modify SSE broadcaster in `src/server/sse.ts` to accept instanceId + instanceName
- [ ] Include instanceId + instanceName in snapshot, task delta, and heartbeat events
- [ ] Write test: SSE events include instance fields

### 1.5 mDNS Metadata Extension
- [ ] Add instanceId, directory, instanceName to mDNS txt record in advertise()
- [ ] Update DiscoveredInstance type to include instanceId + instanceName from txt
- [ ] Parse instanceId/instanceName from txt in discover() response

### 1.6 bgagent_output Description Fix
- [ ] Update `backgroundOutput` description in `src/prompts.ts`
- [ ] Add line: "When full_session=true on a running task, returns partial results (messages available so far)"
- [ ] Add note about combining with since_message_id for incremental polling

## Phase 2: Dashboard Multi-Instance Support

### 2.1 Types + Store Extension
- [ ] Add `InstanceInfo`, `ConnectionStatus` types to `dashboard/src/types.ts`
- [ ] Add `instanceId`, `instanceName` optional fields to dashboard BackgroundTask type
- [ ] Extend agentStore: `instancesById`, `connectionStatus`, `selectedInstanceFilter`
- [ ] Add actions: `upsertTasksFromInstance`, `applyTaskEventFromInstance`, `setInstanceInfo`, `setConnectionStatus`, `setInstanceFilter`, `removeInstance`
- [ ] Update compound key strategy: `${instanceId}:${sessionID}`
- [ ] Add filtered selectors: `selectFilteredRootTasks`, `selectFilteredTaskOrder`
- [ ] Add instance color assignment utility
- [ ] Write tests: store actions with multi-instance data, compound keys, filtering

### 2.2 useMultiSSE Hook
- [ ] Create `dashboard/src/hooks/useMultiSSE.ts`
- [ ] Manage N concurrent EventSource connections (one per discovered instance URL)
- [ ] Each connection: independent reconnection with exponential backoff
- [ ] On snapshot: call `upsertTasksFromInstance(instanceId, tasks, stats)`
- [ ] On task delta: call `applyTaskEventFromInstance(instanceId, task)`
- [ ] On connect/disconnect: call `setConnectionStatus(instanceId, status)`
- [ ] On first snapshot: extract instanceId/instanceName, call `setInstanceInfo()`
- [ ] Handle instance removal when mDNS stops advertising
- [ ] Write tests: multi-connection lifecycle, reconnection per-instance

### 2.3 useInstances Hook Update
- [ ] Refactor `useInstances` to extract instanceId/instanceName from mDNS metadata
- [ ] Return enriched instance list with instanceId, instanceName, url
- [ ] Feed discovered instances to useMultiSSE

### 2.4 UI: InstanceSelector Enhancement
- [ ] Show connection status dot (green/yellow/red) per instance
- [ ] Show instance name + color badge
- [ ] Click to filter by instance, click again for all
- [ ] Show task count per instance
- [ ] Show instance directory on hover/tooltip

### 2.5 UI: TaskCard + StatusBar + Integration
- [ ] Add instance color bar to TaskCard left border
- [ ] Show instance name badge in TaskCard header
- [ ] Update StatusBar: connected instance count + total tasks
- [ ] Wire App.tsx: replace useSSE with useMultiSSE
- [ ] Remove old single-instance useSSE hook
- [ ] Build verification + full test pass
