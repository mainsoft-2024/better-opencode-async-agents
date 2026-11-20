---
created: 2026-03-17T21:50:00+09:00
last_updated: 2026-03-18T00:00:00+09:00
type: spec
change_id: 2026-03-17-agent-reliability-and-dashboard-interaction
status: done
trigger: "Force resume/restart for dead agents, auto stuck detection, bgagent_output streaming fix, dashboard interactive chat + action buttons"
estimated_phases: 3
---

# Phases Overview: Agent Reliability and Dashboard Interaction

## Background & Research

### Key Findings
- **bgagent_output streaming bug**: `full_session=true` on running tasks may return only first message — needs investigation in `src/tools/output.ts` → `getFilteredMessages()` → `client.session.messages()` chain
- **Activity tracking must exclude tools**: User explicitly wants 120s timeout only for thinking/text messages — tool execution can take hours
- **oh-my-openagents patterns to adopt**: MIN_RUNTIME_MS=30s guard, stale detection with idle+timeout combo, error classifier, fallback retry
- **opencode-swarm patterns**: circuit breakers (tool calls, duration, consecutive errors) — not in scope but good for future
- **Process liveness**: `process.kill(pid, 0)` cross-platform, Bun `proc.exited` Promise
- **Dashboard chat**: User wants interactive resume (send messages), action buttons (force restart, cancel), real-time streaming
- **Auto-restart default ON**: With max 3 attempts, configurable timeout

### Tech Stack Additions
- No new dependencies needed — all features use existing infrastructure (Zustand, framer-motion, SSE)
- New tool: `bgagent_force_restart` (separate from resume)
- New API routes: POST /v1/tasks/:id/restart, /resume, /cancel
- New SSE events: task.stuck, task.restarted

### Codebase Entry Points
- `src/types.ts` — BackgroundTask type extensions
- `src/manager/index.ts` — Manager methods for stuck detection + force restart
- `src/manager/polling.ts` — Polling loop extension for stuck checking
- `src/tools/output.ts` — Streaming fix
- `src/tools/force-restart.ts` — New tool (to create)
- `src/server/routes.ts` — New API routes
- `src/server/sse.ts` — New event broadcasts
- `dashboard/src/stores/agentStore.ts` — Stuck state + restart lineage
- `dashboard/src/components/TaskCard.tsx` — Stuck indicator + action buttons
- `dashboard/src/components/ConversationViewer.tsx` — Chat input + real-time streaming

## Phase 1: Server Core — Streaming Fix + Activity Tracking + Stuck Detection + Force Restart (~15min)
- Target tasks: tasks.md Phase 1 (1.1–1.8), Phase 2 (2.1–2.7), Phase 3 (3.1–3.6)
- Dependencies: none
- Scope: Fix bgagent_output streaming for running tasks. Add lastActivityAt/stuckAt/restartCount fields to BackgroundTask. Implement activity tracking (thinking/text only, exclude tools). Stuck detection algorithm in polling loop with 120s timeout + 30s MIN_RUNTIME guard. Auto-restart trigger with max 3 attempts. New bgagent_force_restart tool with context preservation (original prompt + last 10-20 messages). Update tool descriptions in prompts.ts. All with tests.

## Phase 2: Server-Client Bridge — API Routes + SSE Events + Dashboard State (~12min)
- Target tasks: tasks.md Phase 4 (4.1–4.5), Phase 5 (5.1–5.5), Phase 6 (6.1–6.6)
- Dependencies: Phase 1
- Scope: POST /v1/tasks/:id/restart, /resume, /cancel API routes. SSE event broadcasting for task.stuck, task.restarted, task.cancelled. Dashboard type updates, agentStore extensions (selectStuckTasks, markTaskStuck, markTaskRestarted). useSSE handlers for new events. useForceRestart + useResumeTask hooks. All with tests.

## Phase 3: Dashboard UI — Action Buttons + Chat + Stuck Indicators + Polish (~15min)
- Target tasks: tasks.md Phase 7 (7.1–7.7), Phase 8 (8.1–8.6), Phase 9 (9.1–9.4), Phase 10 (10.1–10.7), Phase 11 (11.1–11.5), Phase 12 (12.1–12.6)
- Dependencies: Phase 2
- Scope: TaskCard stuck indicator (pulsing red border + badge), action buttons (Force Restart, Resume, Cancel). ConversationViewer chat input with message sending. Real-time streaming updates with auto-scroll. StatusBar stuck count. Build verification and cross-feature integration testing.
