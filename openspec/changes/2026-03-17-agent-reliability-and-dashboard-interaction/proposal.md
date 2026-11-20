# Proposal: Agent Reliability and Dashboard Interaction

## Change ID
`2026-03-17-agent-reliability-and-dashboard-interaction`

## Problem Statement

Background agents frequently become unresponsive without clear indication to the user. The dashboard provides no way to monitor agent activity, detect stuck agents, or interact with them directly. Streaming output from running tasks returns only the first message, breaking the user's ability to see partial results in real-time. Users cannot recover stuck agents without manually stopping and restarting, causing loss of task context. Additionally, dashboard has no visual feedback for stuck or unhealthy agents.

### Current Pain Points
1. **No activity visibility** — Users can't tell if an agent is working or stuck
2. **No recovery options** — No way to force-restart a stuck agent while preserving context
3. **Broken streaming** — `bgagent_output` with `full_session=true` returns only the first message from running tasks, not partial results
4. **Silent failures** — Agents may crash or timeout without user notification
5. **No direct interaction** — Dashboard cannot send messages directly to agents or trigger actions
6. **No stuck detection** — Manual monitoring required to catch unresponsive agents

## Goals

1. **Detect stuck agents** — Automatically identify agents inactive for 120+ seconds (excluding tool execution time)
2. **Force restart capability** — New tool `bgagent_force_restart` to restart stuck agents with context preservation
3. **Fix streaming output** — Enable real-time partial results from running tasks in `bgagent_output`
4. **Interactive dashboard** — Send messages and actions directly to agents (resume, force-restart, cancel)
5. **Visual stuck indicators** — Pulsing red badge + action button on TaskCard for stuck agents
6. **Auto-restart** — Default-enabled auto-restart for stuck agents (configurable, max 3 attempts)
7. **Activity tracking** — Track last user message time to distinguish tool execution from true inactivity

## Non-Goals

- Changing agent algorithm or behavior logic
- Implementing complex recovery strategies beyond force-restart
- Cross-agent coordination or dependency management
- Persistent restart history (metadata only tracked per instance)
- Modifying Claude API behavior or request/response formats
- Dashboard UI redesign (only add small stuck indicators and action buttons)
- Long-lived WebSocket connections (SSE remains transport)

## User Stories

### Story 1: Detect and Auto-Recover Stuck Agent
As a user running a long-running agent,
I want stuck agents to be automatically detected after 120 seconds of inactivity,
So that they can be automatically restarted and I maintain forward progress without manual intervention.

**Acceptance Criteria:**
- Agent marked "stuck" after 120s without thinking/text messages (tools excluded)
- Auto-restart triggered immediately (if enabled)
- Original prompt + context preserved in restart
- New task ID assigned, but originalTaskId tracked for lineage
- Max 3 auto-restart attempts

### Story 2: Manually Force-Restart an Agent
As a user debugging a stuck agent,
I want to click "Force Restart" on the dashboard,
So I can recover the agent with its original context without losing my work.

**Acceptance Criteria:**
- Red pulsing badge appears on TaskCard when stuck
- "Force Restart" button visible on stuck TaskCard
- Clicking button restarts agent with original prompt + last 10-20 messages
- New task ID returned, originalTaskId visible in metadata
- Gracefully handle max restart attempts exceeded

### Story 3: Send Message to Agent
As a user trying to unblock a stuck agent,
I want to send a message directly from the dashboard conversation view,
So I can provide guidance or corrections without restarting.

**Acceptance Criteria:**
- Chat input visible on ConversationViewer
- Typing + sending message calls `bgagent_resume` tool programmatically
- Message appears in conversation immediately
- Real-time updates as agent responds (relies on streaming fix)
- Matches user's original agent type and session context

### Story 4: View Real-Time Agent Output
As a user running an agent task,
I want to see partial results streaming in real-time,
So I can monitor progress without waiting for completion.

**Acceptance Criteria:**
- `bgagent_output` with `full_session=true` returns all messages available so far (not just completed)
- Stream updates every 100-500ms as agent produces thinking/text
- ConversationViewer auto-refreshes as new messages arrive
- `since_message_id` parameter enables incremental polling
- Works for running, waiting, and completed tasks

## Success Metrics

1. **Stuck detection accuracy** — 95%+ true positive rate for agents stuck >120s, <5% false positives
2. **Auto-restart success** — 90%+ of auto-restarted agents recover (not stuck again within 2 minutes)
3. **Streaming latency** — Partial results appear <500ms after agent message sent
4. **User engagement** — Force Restart button used in <5% of cases (indicates auto-restart working)
5. **Error reduction** — 50% reduction in manual "please restart my agent" support requests
6. **Availability** — No performance degradation with 10+ concurrent stuck agents

## Constraints

- Polling interval remains 100ms (vs 120s timeout) — must not detect false positives
- Tool execution time must not count toward 120s inactivity (distinction critical)
- Process liveness check via `process.kill(pid, 0)` for cross-platform support
- Max 3 restart attempts per task (prevent infinite loops)
- Restart context limited to original prompt + last 10-20 messages (prevent token bloat)
- Dashboard action buttons must not slow SSE event processing
- Auto-restart configurable per task (on/off, timeout, max attempts)

## Scope Boundaries

**Included in this change:**
- Streaming fix (Phase 1 priority)
- Force restart tool + API
- Auto-detection + auto-restart logic
- Activity tracking in BackgroundTask type
- Dashboard UI buttons and stuck indicators
- API action routes and event broadcasting
- Constants and configuration

**Not included (future work):**
- Manual agent pause/sleep mode
- Agent dependency graphs
- Complex recovery workflows
- Persistent analytics dashboard
- Agent performance profiling
