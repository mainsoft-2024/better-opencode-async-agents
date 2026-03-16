---
created: 2026-03-17T00:00:00Z
last_updated: 2026-03-17T00:00:00Z
type: spec
change_id: 2026-03-17-multi-instance-dashboard
status: active
trigger: "Multi-instance dashboard support + bgagent_output description fix"
estimated_phases: 2
---

# Phases Overview: Multi-Instance Dashboard

## Background & Research
- Plugin receives `ctx.directory` (cwd) from PluginInput but NO session/instance ID
- server.json has { port, pid, startedAt, url, version } — no instance identity
- mDNS advertises as `bgagent-${process.pid}` with txt metadata
- SSE events have no instance identifier — just task data
- Dashboard useSSE connects to ONE server only
- agentStore uses `task.sessionID` as key — collisions possible across instances
- bgagent_output full_session works for running tasks but description doesn't say so
- User runs 5+ OpenCode instances simultaneously
- Browser EventSource limit is 6 per domain, but each instance is different host:port (OK)
- Instance colors: 8-color palette auto-assigned by discovery order

## Phase 1: Server-Side Instance Identity + bgagent_output Fix (~12min)
- Target tasks: tasks.md sections 1.1–1.6
- Dependencies: none
- Scope: Generate instanceId at startup, expose via server.json/API/SSE/mDNS. Fix bgagent_output description.
- Parallelization: 3 coders (instance ID + server.json | API + SSE | mDNS + prompts)

## Phase 2: Dashboard Multi-Instance Support (~15min)
- Target tasks: tasks.md sections 2.1–2.5
- Dependencies: Phase 1 (SSE events must include instanceId)
- Scope: Multi-SSE hook, instance-aware store, compound keys, filtered selectors, UI enhancements
- Parallelization: 3 coders (store + types | useMultiSSE hook | UI components), then 1 integration coder
