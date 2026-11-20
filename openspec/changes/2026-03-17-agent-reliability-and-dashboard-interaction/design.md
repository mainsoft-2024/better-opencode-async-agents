# Design: Agent Reliability and Dashboard Interaction

## Architecture Overview

Five coordinated features working together:

1. **Streaming fix** — Enable partial results from running tasks
2. **Activity tracking** — BackgroundTask tracks last user message time, distinguishes tools
3. **Stuck detection** — Auto-detect inactive agents (120s default, tool-aware)
4. **Force restart** — New tool + API to restart with context preservation
5. **Dashboard interaction** — Action buttons, chat input, stuck indicators, real-time updates

---

## 1. BackgroundTask Type Extensions

### Current Structure
```typescript
// src/types.ts
interface BackgroundTask {
  prompt: string;
  sessionID: string;
  status: 'running' | 'waiting' | 'completed' | 'error';
  completionTimeMs?: number;
  parentSessionId?: string;
  agentType: 'claude' | 'reasoning';
  // ... other fields
}
```

### New Fields
```typescript
interface BackgroundTask {
  // ... existing fields ...
  
  // Activity tracking (milliseconds since epoch)
  lastActivityAt?: number;      // Last thinking/text message received
  stuckAt?: number;             // Time marked as stuck (if applicable)
  
  // Restart tracking
  restartCount: number;          // 0 for new tasks, incremented on force-restart
  originalTaskId?: string;       // For lineage tracking
  restartHistory: Array<{        // Limited history for debugging
    timestamp: number;
    reason: 'auto-restart' | 'force-restart' | 'manual';
    previousTaskId: string;
    errorMessage?: string;
  }>;
  
  // Configuration
  autoRestart: boolean;          // Default true
  stuckTimeoutSeconds: number;   // Default 120, configurable
  maxRestartAttempts: number;    // Default 3
}
```

---

## 2. Activity Tracking Logic

### When to Update `lastActivityAt`
Update on receipt of:
- **Text messages** from assistant (thinking or text content blocks)
- **First bytes of streaming** thinking/text (avoid waiting for full block)

Do NOT update on:
- Tool calls or tool results (agent working, not stuck)
- SSE heartbeats
- Status polling
- Resume requests

### Implementation in `src/manager/index.ts`
```typescript
// In handleBackgroundTask or message handler:
onMessage(msg) {
  const task = tasks.get(taskId);
  if (!task) return;
  
  // Update activity time ONLY for thinking/text, not tools
  if (msg.type === 'thinking' || msg.type === 'text') {
    task.lastActivityAt = Date.now();
  }
  
  // Clear stuck status if transitioning from stuck→active
  if (task.stuckAt && msg.type === 'text') {
    task.stuckAt = undefined;
  }
}
```

---

## 3. Stuck Detection Algorithm

### Trigger Points
Run stuck detection check in polling loop (`src/manager/polling.ts`):
- Every 100ms polling interval
- On completion check
- On parent session termination

### Detection Logic
```typescript
function checkIfStuck(task: BackgroundTask): boolean {
  // Constraint 1: Must have been running at least 30s (prevent false positives)
  if (!task.lastActivityAt) return false;
  const runtimeMs = Date.now() - (task.createdAt || Date.now());
  if (runtimeMs < 30_000) return false;
  
  // Constraint 2: Check inactivity timeout (default 120s, tool-aware)
  const inactiveMs = Date.now() - task.lastActivityAt;
  if (inactiveMs < task.stuckTimeoutSeconds * 1000) return false;
  
  // Constraint 3: Verify agent is still executing (not completed)
  if (task.status !== 'running' && task.status !== 'waiting') return false;
  
  // Constraint 4: Process liveness check (if PID available)
  if (task.pid && !isProcessAlive(task.pid)) {
    task.status = 'error';
    return false;
  }
  
  return true;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);  // Signal 0: check without killing
    return true;
  } catch {
    return false;
  }
}
```

### Stuck Marking
```typescript
function markStuck(task: BackgroundTask, broadcast: EventEmitter) {
  task.stuckAt = Date.now();
  task.status = 'stuck';  // New status value
  broadcast('task.stuck', { task, taskId: task.sessionID });
  
  if (task.autoRestart && task.restartCount < task.maxRestartAttempts) {
    // Auto-restart immediately
    triggerAutoRestart(task);
  }
}
```

### Constants
```typescript
// src/constants.ts or top of manager file
const STUCK_DETECTION = {
  TIMEOUT_SECONDS: 120,           // Configurable per task
  MIN_RUNTIME_MS: 30_000,         // Must run 30s before checking stuck
  POLLING_INTERVAL_MS: 100,       // Existing
  AUTO_RESTART_DELAY_MS: 0,       // Immediate (no backoff for first attempt)
  MAX_RESTART_ATTEMPTS: 3,
};
```

---

## 4. bgagent_force_restart Tool

### Tool Schema
```typescript
// src/tools/force-restart.ts
interface ForceRestartInput {
  task_id: string;                // Session ID of stuck task
  options?: {
    include_last_n_messages?: number;  // Default 10
    auto_restart?: boolean;            // Override task setting
    timeout_seconds?: number;          // Override timeout
  };
}

interface ForceRestartOutput {
  new_task_id: string;            // New sessionID
  original_task_id: string;        // For lineage
  restart_count: number;
  status: 'restarted' | 'already_restarting' | 'max_attempts_exceeded';
  error?: string;
}
```

### Tool Implementation Steps
1. Validate task exists and is stuck or error
2. Fetch original prompt + agent type from task
3. Collect last N messages from completed task (default 10-20)
4. Mark old task with status='force-restarted' + error reason
5. Create new BackgroundTask with:
   - Same prompt
   - Same agentType
   - resumeMessages: last N messages as context
   - restartCount: old.restartCount + 1
   - originalTaskId: old.sessionID
   - Same autoRestart/stuckTimeout config
6. Queue new task for execution
7. Return new task_id

### Handler Implementation
```typescript
// src/tools/force-restart.ts
export async function forceRestart(
  input: ForceRestartInput,
  context: ToolContext
): Promise<ForceRestartOutput> {
  const { task_id, options = {} } = input;
  const manager = context.manager;
  
  const oldTask = manager.getTask(task_id);
  if (!oldTask) {
    throw new Error(`Task ${task_id} not found`);
  }
  
  if (oldTask.restartCount >= (oldTask.maxRestartAttempts || 3)) {
    return {
      status: 'max_attempts_exceeded',
      error: `Task reached max ${oldTask.maxRestartAttempts} restart attempts`,
      new_task_id: '',
      original_task_id: task_id,
      restart_count: oldTask.restartCount,
    };
  }
  
  // Fetch last N messages for context
  const lastMessages = manager.getTaskMessages(task_id, {
    limit: options.include_last_n_messages ?? 10,
  });
  
  // Create new task with restart tracking
  const newTaskId = await manager.createBackgroundTask({
    prompt: oldTask.prompt,
    agentType: oldTask.agentType,
    resumeMessages: lastMessages,
    restartCount: oldTask.restartCount + 1,
    originalTaskId: task_id,
    autoRestart: options.auto_restart ?? oldTask.autoRestart,
    stuckTimeoutSeconds: options.timeout_seconds ?? oldTask.stuckTimeoutSeconds,
    maxRestartAttempts: oldTask.maxRestartAttempts,
  });
  
  // Mark old task as restarted
  oldTask.status = 'force-restarted';
  oldTask.restartHistory.push({
    timestamp: Date.now(),
    reason: 'force-restart',
    previousTaskId: '',
    errorMessage: 'Force-restarted by user',
  });
  
  manager.broadcast('task.restarted', { oldTaskId: task_id, newTaskId });
  
  return {
    status: 'restarted',
    new_task_id: newTaskId,
    original_task_id: task_id,
    restart_count: oldTask.restartCount + 1,
  };
}
```

---

## 5. Streaming Fix: bgagent_output

### Issue
Current implementation:
```typescript
// src/tools/output.ts (CURRENT - BROKEN)
const messages = manager.getTaskMessages(taskId);
// Returns only first message for running tasks
```

### Root Cause
The `client.session.messages()` call doesn't return partial/streaming messages. Need to:
1. Check if session is still running
2. If running, return all accumulated messages (partial)
3. Document this behavior clearly

### Fix Implementation
```typescript
// src/tools/output.ts (FIXED)
export async function backgroundOutput(
  input: BackgroundOutputInput,
  context: ToolContext
): Promise<BackgroundOutputOutput> {
  const { task_id, full_session = false, since_message_id } = input;
  const manager = context.manager;
  
  const task = manager.getTask(task_id);
  if (!task) {
    throw new Error(`Task ${task_id} not found`);
  }
  
  let messages: Message[];
  
  if (full_session) {
    // Return ALL messages (partial for running, complete for finished)
    // This works for running tasks and returns results accumulated so far
    messages = manager.getTaskMessages(task_id, {
      since: since_message_id,
    });
  } else {
    // Return only final block (if completed)
    if (task.status === 'completed') {
      const finalMessages = manager.getTaskMessages(task_id);
      messages = finalMessages.filter(m => m.type !== 'thinking');
    } else {
      messages = [];  // No final block for running tasks
    }
  }
  
  return {
    messages,
    task_status: task.status,
    // Hint for incremental polling
    has_more: task.status === 'running' || task.status === 'waiting',
  };
}
```

### Tool Description Update
```typescript
// In prompts.ts, update backgroundOutput description:
`
Fetch output messages from a background task.

Parameters:
- task_id: The background task ID to fetch output from
- full_session: If true, return all messages accumulated so far. This works for 
  BOTH running AND completed tasks. For running tasks, returns partial results 
  available so far. Combine with since_message_id for incremental polling.
- since_message_id: Only return messages after this ID (for incremental polling)

Returns:
- messages: Array of messages (thinking, text, tool_use, tool_result)
- task_status: Current task status (running, waiting, completed, error, stuck)
- has_more: Hint whether task is still active (useful for polling loops)

Example for real-time monitoring:
  1. Call bgagent_output(task_id, full_session=true) initially
  2. Store last message ID from response
  3. Call again with since_message_id=<last_id> every 500ms for incremental updates
  4. Stop polling when task_status is completed or error
`
```

---

## 6. API Routes for Dashboard

### POST /v1/tasks/:id/restart
Trigger force-restart via dashboard.
```typescript
// src/server/routes.ts
app.post('/v1/tasks/:id/restart', (req, res) => {
  const { id } = req.params;
  const { include_last_n_messages = 10 } = req.body;
  
  const task = manager.getTask(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  try {
    const result = forceRestart(
      { task_id: id, options: { include_last_n_messages } },
      { manager }
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

### POST /v1/tasks/:id/resume
Send message to task (for chat input in dashboard).
```typescript
// src/server/routes.ts
app.post('/v1/tasks/:id/resume', (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'message required' });
  }
  
  const task = manager.getTask(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  try {
    manager.resumeTask(id, message);
    res.json({ status: 'resumed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

### POST /v1/tasks/:id/cancel
Cancel a running task.
```typescript
// src/server/routes.ts
app.post('/v1/tasks/:id/cancel', (req, res) => {
  const { id } = req.params;
  
  const task = manager.getTask(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  if (task.status !== 'running' && task.status !== 'waiting') {
    return res.status(400).json({ 
      error: `Cannot cancel task in ${task.status} status`
    });
  }
  
  try {
    manager.cancelTask(id);
    res.json({ status: 'cancelled' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

---

## 7. SSE Event Extensions

### New Event Types
```typescript
// Broadcast when task is detected stuck
event: 'task.stuck'
data: { task, taskId, stuckAt }

// Broadcast when auto-restart triggered
event: 'task.auto-restart'
data: { oldTaskId, newTaskId, reason: 'stuck' }

// Broadcast when force-restart triggered
event: 'task.restarted'
data: { oldTaskId, newTaskId, reason: 'force-restart' }

// Include in task delta events:
// task.stuckAt field (if applicable)
// task.restartCount field
// task.restartHistory array
```

### Event Broadcaster Update
```typescript
// src/server/sse.ts
class SSEBroadcaster {
  broadcastTaskStuck(task: BackgroundTask) {
    this.broadcast('task.stuck', {
      taskId: task.sessionID,
      stuckAt: task.stuckAt,
      restartCount: task.restartCount,
      autoRestartEnabled: task.autoRestart,
    });
  }
  
  broadcastTaskRestarted(oldTaskId: string, newTaskId: string, reason: string) {
    this.broadcast('task.restarted', {
      oldTaskId,
      newTaskId,
      reason,
      timestamp: Date.now(),
    });
  }
}
```

---

## 8. Dashboard Type Extensions

### agentStore Updates
```typescript
// dashboard/src/stores/agentStore.ts
interface BackgroundTask {
  // ... existing fields ...
  lastActivityAt?: number;
  stuckAt?: number;
  restartCount: number;
  originalTaskId?: string;
  autoRestart: boolean;
  stuckTimeoutSeconds: number;
}

// New selectors
function selectStuckTasks(): BackgroundTask[] {
  return selectRootTasks().filter(t => t.stuckAt);
}

function selectTaskRestartLineage(taskId: string): BackgroundTask[] {
  // Fetch original and all descendants by originalTaskId
}
```

### Event Handlers
```typescript
// dashboard/src/hooks/useSSE.ts
case 'task.stuck':
  dispatch({ type: 'MARK_STUCK', payload: event.data });
  break;
case 'task.restarted':
  dispatch({ type: 'TASK_RESTARTED', payload: event.data });
  break;
```

---

## 9. Dashboard UI Components

### TaskCard Changes
```typescript
// dashboard/src/components/TaskCard.tsx
<div className={cn(
  'border-l-4 rounded',
  task.stuckAt ? 'border-l-red-500 animate-pulse' : 'border-l-blue-500'
)}>
  {task.stuckAt && (
    <Badge variant="destructive" className="animate-pulse">
      Stuck {Math.round((Date.now() - task.stuckAt) / 1000)}s
    </Badge>
  )}
  
  <div className="flex gap-2 mt-2">
    {task.status === 'stuck' && (
      <Button 
        size="sm" 
        variant="destructive"
        onClick={() => forceRestart(task.sessionID)}
      >
        Force Restart
      </Button>
    )}
    {['running', 'waiting'].includes(task.status) && (
      <Button 
        size="sm" 
        variant="secondary"
        onClick={() => resumeTask(task.sessionID)}
      >
        Resume
      </Button>
    )}
  </div>
</div>
```

### ConversationViewer Chat Input
```typescript
// dashboard/src/components/ConversationViewer.tsx
<div className="flex gap-2 p-4 border-t">
  <input
    type="text"
    placeholder="Send message to agent..."
    value={inputValue}
    onChange={(e) => setInputValue(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputValue);
        setInputValue('');
      }
    }}
  />
  <Button onClick={() => sendMessage(inputValue)}>Send</Button>
</div>
```

### StatusBar Updates
```typescript
// dashboard/src/components/StatusBar.tsx
const stuckCount = selectStuckTasks().length;
<div className="text-sm">
  {stuckCount > 0 && (
    <span className="text-red-500 animate-pulse">
      🔴 {stuckCount} stuck
    </span>
  )}
</div>
```

---

## 10. Data Flow Diagram

```
Agent produces thinking/text
  ↓
BackgroundManager.onMessage()
  → Update task.lastActivityAt
  → Clear task.stuckAt if was stuck
  → Emit message to task session
  → SSE: Broadcast task delta
  ↓
Dashboard receives SSE event
  → agentStore updates task
  → ConversationViewer auto-refreshes
  → If task.stuckAt exists, show indicator

Every 100ms polling:
  → checkIfStuck(task)
  → If stuck: markStuck() → broadcast 'task.stuck'
  → If auto-restart enabled: forceRestart() → create new task
  ↓
Dashboard receives 'task.stuck' event
  → Mark task with pulsing red badge
  → Enable "Force Restart" button
  → Show restart count in UI

User clicks "Force Restart" or "Resume"
  → Dashboard calls /v1/tasks/:id/restart or /v1/tasks/:id/resume
  → BackgroundManager creates new task
  → Old task marked as restarted/resumed
  → New task queued for execution
  → New task_id returned to dashboard
  → SSE: Broadcast task.restarted event
  → Dashboard updates to show new task
```

---

## 11. Configuration and Constants

### Per-Task Defaults
```typescript
// src/types.ts
const DEFAULT_STUCK_CONFIG = {
  autoRestart: true,
  stuckTimeoutSeconds: 120,
  maxRestartAttempts: 3,
};
```

### Environment/Config Overrides
```typescript
// Allow override via env or config
const STUCK_TIMEOUT_SECONDS = parseInt(process.env.STUCK_TIMEOUT_SECONDS || '120');
const AUTO_RESTART_ENABLED = process.env.AUTO_RESTART === 'false' ? false : true;
const MAX_RESTART_ATTEMPTS = parseInt(process.env.MAX_RESTART_ATTEMPTS || '3');
```

### Resume Message Context Limit
```typescript
const RESUME_CONTEXT_MESSAGE_LIMIT = 20;  // Max messages to include on restart
const RESUME_CONTEXT_TOKEN_LIMIT = 10_000;  // Max tokens (if token counting available)
```

---

## 12. Error Handling

### Stuck Detection Edge Cases
1. **Task just started** — Use MIN_RUNTIME_MS guard (30s)
2. **Tool actively executing** — Monitor tool call events, don't count toward inactivity
3. **Process dead** — `isProcessAlive()` check prevents false negatives
4. **Max restarts exceeded** — Return error, don't auto-restart

### Force Restart Edge Cases
1. **Task already restarting** — Return status='already_restarting'
2. **Max attempts exceeded** — Return error, show in UI
3. **Original task vanished** — Handle gracefully in tool

### Streaming Fix Edge Cases
1. **Session has no messages yet** — Return empty array
2. **since_message_id invalid** — Return all (ignore since)
3. **Task completed before returning** — Return all messages
