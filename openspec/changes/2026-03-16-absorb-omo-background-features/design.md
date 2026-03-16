# Design: Absorb OMO Background Agent Features

## Context

The plugin currently returns only a final result string from `bgagent_output`, making it impossible to inspect intermediate agent messages, thinking processes, or individual tool call results. Resume is locked to `completed` tasks only — agents can't recover from errors or queue follow-ups on running tasks. The HTTP API provides SSE events and basic REST endpoints but lacks message-level queries and has no UI. The oh-my-openagent (OMO) project solves these with `full_session`, `include_thinking`, `since_message_id` parameters, all-status resume with queueing, and a TUI-based session viewer. We absorb these capabilities while keeping our architectural advantages (smart fork truncation, HTTP API, batch grouping).

**Constraints:**
- Must not break existing `bgagent_output` behavior — new parameters are all optional, defaults preserve current behavior
- Resume queue for running tasks must be non-blocking — the main agent loop must not wait
- HTTP API remains read-only — no POST/PUT/DELETE endpoints
- Dashboard must be a pre-built SPA served as static files — no SSR, no runtime React dependency in the plugin
- Multi-instance discovery must work without manual configuration
- All changes must work with Bun runtime

**Stakeholders:** Plugin users, agent system prompt authors, dashboard consumers, multi-instance operators

## Goals / Non-Goals

**Goals:**
- Expose full session message history with granular filtering through bgagent_output tool
- Enable resume from any task status (completed, error, cancelled, running)
- Implement queueing mechanism for resume on running tasks
- Add REST endpoint for session messages with same filtering as bgagent_output
- Add multi-instance discovery via mDNS/UDP broadcast
- Build React dashboard for real-time agent monitoring with task tree, conversation view, and batch grouping
- Serve dashboard from plugin's HTTP server at `/dashboard`

**Non-Goals:**
- No skill injection system (load_skills) — not needed per user requirements
- No category-to-model routing — not needed
- No synchronous execution mode — keep async-only approach
- No write/control endpoints in HTTP API
- No authentication (localhost-only is sufficient)
- No mobile-responsive dashboard (desktop monitoring tool)

## Decisions

### Decision 1: Extend bgagent_output with optional filtering parameters

**What:** Add 6 new optional parameters to bgagent_output that control what session data is returned.

**Why:**
- OMO's `background_output` supports `full_session`, `include_thinking`, `since_message_id`, `include_tool_results`, `message_limit`, `thinking_max_chars`
- These enable incremental polling (only fetch new messages), debugging (see thinking), and bandwidth control (limit message count)
- Making all parameters optional preserves backward compatibility — existing callers get the same final-result-only behavior

**Alternatives considered:**
- Separate tool (`bgagent_messages`): Would duplicate task resolution logic and increase tool count. Single tool with optional params is cleaner.
- Always return full session: Would overwhelm context window for long-running agents with many tool calls.

**Implementation:**
```typescript
// Updated bgagent_output schema
args: {
  task_id: z.string(),
  block: z.boolean().optional(),
  timeout: z.number().optional(),
  // New session filtering params
  full_session: z.boolean().optional(),
  include_thinking: z.boolean().optional(),
  include_tool_results: z.boolean().optional(),
  since_message_id: z.string().optional(),
  message_limit: z.number().max(100).optional(),
  thinking_max_chars: z.number().optional(),
}
```

When `full_session=true`, call `manager.getFilteredMessages(sessionID, filter)` which:
1. Retrieves full message array from OpenCode API via `getTaskMessages()`
2. Applies `since_message_id` filter (find index, slice after it)
3. Filters by role/type based on `include_thinking` and `include_tool_results`
4. Truncates thinking blocks to `thinking_max_chars` if set
5. Applies `message_limit` (take last N messages)
6. Returns formatted message array with message IDs for incremental polling

### Decision 2: All-status resume with queueing for running tasks

**What:** Allow resume from any task status. For running tasks, queue the prompt and auto-execute when current work completes.

**Why:**
- Error recovery: agents should be able to retry after failures without creating a new task
- Running queue: parent agent may want to send follow-up instructions while a sub-agent is still working
- Cancelled resume: reactivate cancelled tasks with new instructions

**Alternatives considered:**
- Interrupt running tasks: Dangerous — could corrupt in-progress work. Queue is safer.
- Reject running resume entirely: Loses valuable orchestration capability.
- Create new linked task: Loses session context and conversation history.

**Implementation:**

For error/cancelled tasks:
```typescript
// Reset status, send prompt via existing sendResumePromptAsync()
task.status = "resumed";
task.resumeCount++;
await manager.sendResumePromptAsync(task, prompt, toolContext);
```

For running tasks (queueing):
```typescript
// Store pending prompt on the task object
interface BackgroundTask {
  // ... existing fields
  pendingResume?: {
    prompt: string;
    queuedAt: string;
  };
}

// In task completion handler (when status changes from "running" to "completed"):
if (task.pendingResume) {
  const { prompt } = task.pendingResume;
  task.pendingResume = undefined;
  task.status = "resumed";
  task.resumeCount++;
  await manager.sendResumePromptAsync(task, prompt, toolContext);
}
```

The queue is single-depth (one pending prompt). If a second resume is attempted on a running task with a pending prompt, reject with an error message explaining the queue is full.

### Decision 3: HTTP messages endpoint mirrors bgagent_output filtering

**What:** Add `GET /v1/tasks/:id/messages` that accepts the same filtering parameters as bgagent_output but as query strings.

**Why:**
- Consistency: same filtering logic for both MCP tool and HTTP API
- Dashboard needs message-level access for conversation viewer
- Reuse: single `getFilteredMessages()` method serves both callers

**Implementation:**
```typescript
// GET /v1/tasks/:id/messages?full_session=true&include_thinking=true&since_message_id=xxx&message_limit=50
async function handleTaskMessages(req: Request, manager: BackgroundManager): Promise<Response> {
  const url = new URL(req.url);
  const taskId = extractPathParam(url.pathname, "/v1/tasks/", "/messages");
  const filter: MessageFilter = {
    fullSession: url.searchParams.get("full_session") === "true",
    includeThinking: url.searchParams.get("include_thinking") === "true",
    includeToolResults: url.searchParams.get("include_tool_results") === "true",
    sinceMessageId: url.searchParams.get("since_message_id") ?? undefined,
    messageLimit: parseInt(url.searchParams.get("message_limit") ?? "50"),
    thinkingMaxChars: parseInt(url.searchParams.get("thinking_max_chars") ?? "0") || undefined,
  };
  const messages = await manager.getFilteredMessages(taskId, filter);
  return json({ messages, taskId, filter });
}
```

### Decision 4: mDNS + UDP broadcast fallback for multi-instance discovery

**What:** Use `bonjour-service` for mDNS-based service advertising. Fall back to UDP broadcast if mDNS fails.

**Why:**
- mDNS is the standard for local service discovery (used by AirPlay, Chromecast, etc.)
- `bonjour-service` v1.3.0 is pure JavaScript, works with Bun's `node:dgram` support
- UDP broadcast fallback handles edge cases where multicast isn't available (some corporate networks block it)

**Alternatives considered:**
- Manual configuration (config file with instance URLs): Defeats the "auto-discovery" requirement
- Only UDP broadcast: Less standard, doesn't integrate with OS-level service discovery tools
- WebSocket-based discovery: Over-engineered for local network

**Implementation:**
```typescript
// src/server/discovery.ts
import { Bonjour } from 'bonjour-service';

const SERVICE_TYPE = 'bgagent-api';

export class InstanceDiscovery {
  private bonjour: Bonjour;
  private published?: Service;
  
  async advertise(port: number, metadata: Record<string, string>) {
    this.bonjour = new Bonjour();
    this.published = this.bonjour.publish({
      name: `bgagent-${process.pid}`,
      type: SERVICE_TYPE,
      port,
      txt: metadata  // version, instanceId, startedAt
    });
  }
  
  async discover(): Promise<DiscoveredInstance[]> {
    return new Promise((resolve) => {
      const instances: DiscoveredInstance[] = [];
      const browser = this.bonjour.find({ type: SERVICE_TYPE });
      browser.on('up', (service) => {
        instances.push({
          name: service.name,
          host: service.host,
          port: service.port,
          metadata: service.txt
        });
      });
      setTimeout(() => { browser.stop(); resolve(instances); }, 3000);
    });
  }
  
  stop() {
    this.published?.stop();
    this.bonjour?.destroy();
  }
}
```

### Decision 5: React dashboard as pre-built SPA served by plugin

**What:** Build a React SPA in a `dashboard/` directory. Build output goes to `dashboard/dist/`. Plugin serves these static files at `/dashboard`.

**Why:**
- Separation of concerns: dashboard has its own package.json, dependencies, build pipeline
- No runtime React dependency in the plugin — only pre-built HTML/JS/CSS
- SPA architecture allows rich interaction without server-side rendering
- Bun's native `Bun.file()` serves static files efficiently

**Alternatives considered:**
- Embed dashboard in plugin bundle: Would bloat the plugin and complicate the build
- External standalone app: Requires separate process, harder to auto-start
- Terminal UI (TUI): Limited interactivity, can't show complex tree views or rich conversation history

**Implementation — Static file serving:**
```typescript
// In server/index.ts route handling
if (pathname.startsWith("/dashboard")) {
  const filePath = pathname === "/dashboard" || pathname === "/dashboard/"
    ? "index.html"
    : pathname.replace("/dashboard/", "");
  const file = Bun.file(`${DASHBOARD_DIST_PATH}/${filePath}`);
  if (await file.exists()) {
    return new Response(file, { headers: { "Content-Type": getMimeType(filePath) } });
  }
  // SPA fallback
  return new Response(Bun.file(`${DASHBOARD_DIST_PATH}/index.html`), {
    headers: { "Content-Type": "text/html" }
  });
}
```

**Dashboard features:**
1. **Task tree** — D3.js or React Flow for parent→child hierarchy visualization
2. **Real-time status** — SSE connection to `/v1/events`, live badge updates
3. **Conversation viewer** — Click task → fetch `/v1/tasks/:id/messages?full_session=true&include_thinking=true`
4. **Batch grouping** — Group tasks by `batchId`, collapsible sections
5. **Multi-instance** — Discover instances via `/v1/instances`, aggregate task views

**Dashboard tech stack:**
- React 19 + TypeScript
- Vite for build
- Tailwind CSS for styling
- EventSource API for SSE
- No heavy UI framework (keep bundle small)

## Data Flow

### Message Filtering Flow
```
bgagent_output(full_session=true, include_thinking=true, since_message_id="msg_123")
  → BackgroundManager.getFilteredMessages(sessionID, filter)
    → getTaskMessages(sessionID)  // raw messages from OpenCode API
    → applyMessageIdFilter(messages, sinceId)
    → filterByType(messages, includeThinking, includeToolResults)
    → truncateThinking(messages, maxChars)
    → applyLimit(messages, messageLimit)
  → format and return to caller
```

### Resume Queue Flow
```
bgagent_task(resume="task_123", prompt="continue with X")
  → validateResumeTask(task)  // allows all statuses now
  → if task.status === "running":
      → task.pendingResume = { prompt, queuedAt }
      → return "prompt queued, will execute after current work completes"
  → else (completed/error/cancelled):
      → task.status = "resumed"
      → sendResumePromptAsync(task, prompt)
```

### Multi-Instance Discovery Flow
```
Dashboard loads → GET /v1/instances
  → InstanceDiscovery.discover()
    → mDNS query for '_bgagent-api._tcp.local'
    → collect responses for 3 seconds
    → return discovered instances with host:port and metadata
  → Dashboard connects to each instance's SSE endpoint
  → Aggregates task views from all instances
```