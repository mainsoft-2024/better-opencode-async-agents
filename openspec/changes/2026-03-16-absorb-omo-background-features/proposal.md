# Change: Absorb OMO Background Agent Features

## Why

The oh-my-openagent (OMO) project's background task subsystem offers several capabilities that our plugin lacks: granular session message filtering in output retrieval, flexible resume across all task states, and rich UI for monitoring sub-agent activity. Currently, `bgagent_output` returns only the final result text with no way to inspect intermediate messages, thinking process, or tool results. Resume is restricted to `completed` tasks only, blocking recovery from errors or continuation of running work. The HTTP API lacks REST endpoints for message-level queries, and there is no visual dashboard for monitoring agent activity. Absorbing these features closes the gap and makes the plugin a complete sub-agent orchestration platform.

## What Changes

### 1. bgagent_output Session Message Filtering
- **MODIFIED**: `src/tools/output.ts` — Add 6 new optional parameters to the bgagent_output tool:
  - `full_session: boolean` — return all session messages instead of just final result
  - `include_thinking: boolean` — include agent reasoning/thinking blocks
  - `include_tool_results: boolean` — include tool call results in messages
  - `since_message_id: string` — return messages after this ID (incremental polling)
  - `message_limit: number` — max messages to return (cap at 100)
  - `thinking_max_chars: number` — truncate thinking content to this length
- **MODIFIED**: `src/manager/index.ts` — Add `getFilteredMessages()` method to BackgroundManager
- **MODIFIED**: `src/types.ts` — Add `MessageFilter` interface and message-related types

### 2. Resume Extension
- **MODIFIED**: `src/tools/resume.ts` — Remove `completed`-only restriction in `validateResumeTask()`
- **MODIFIED**: `src/manager/index.ts` — Add `queueResumePrompt()` for running tasks, enhance `sendResumePromptAsync()` to handle error/cancelled states
- **MODIFIED**: `src/types.ts` — Add `pendingResume` field to BackgroundTask, add `queued` to possible internal states
- **NEW**: Queue system for running task resume — stores pending prompt, auto-executes when current work completes

### 3. HTTP API Extension
- **MODIFIED**: `src/server/routes.ts` — Add `GET /v1/tasks/:id/messages` endpoint with full filtering support (mirrors bgagent_output filtering params as query parameters)
- **MODIFIED**: `src/server/routes.ts` — Add `GET /v1/instances` endpoint for multi-instance discovery
- **MODIFIED**: `src/server/types.ts` — Add `MessagesResponse`, `InstancesResponse` types
- **MODIFIED**: `src/server/index.ts` — Register new routes, add static file serving for dashboard
- **NEW**: `src/server/discovery.ts` — mDNS/UDP broadcast service discovery for multi-instance support

### 4. React Dashboard Mini App
- **NEW**: `dashboard/` directory — React SPA for real-time agent monitoring
- **NEW**: `dashboard/src/` — React components for task tree, conversation viewer, batch grouping
- **NEW**: `dashboard/package.json` — Separate build for the dashboard app
- **MODIFIED**: `src/server/index.ts` — Serve built dashboard assets at `/dashboard`
- **MODIFIED**: `src/constants.ts` — Add dashboard-related constants
- **NEW**: Multi-instance discovery UI — auto-detect and aggregate tasks from multiple OpenCode instances on the local network

### Security Model
- Dashboard served on localhost only (same as existing API)
- No authentication (localhost-only access)
- mDNS/broadcast discovery limited to local network

## Impact

- Affected specs: `asyncagents-task` (extended capabilities within existing spec)
- Affected code:
  - **MODIFIED**: `src/tools/output.ts` (session message filtering)
  - **MODIFIED**: `src/tools/resume.ts` (all-status resume)
  - **MODIFIED**: `src/manager/index.ts` (filtered messages, resume queue)
  - **MODIFIED**: `src/types.ts` (new types and interfaces)
  - **MODIFIED**: `src/server/routes.ts` (new endpoints)
  - **MODIFIED**: `src/server/types.ts` (new response types)
  - **MODIFIED**: `src/server/index.ts` (new routes, static serving)
  - **MODIFIED**: `src/constants.ts` (new constants)
  - **NEW**: `src/server/discovery.ts` (service discovery)
  - **NEW**: `dashboard/` (React dashboard app)