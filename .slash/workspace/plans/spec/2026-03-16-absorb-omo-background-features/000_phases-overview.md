---
created: 2026-03-16T06:47:30Z
last_updated: 2026-03-16T08:15:00Z
type: spec
change_id: 2026-03-16-absorb-omo-background-features
status: active
trigger: "Absorb OMO background agent features: session message filtering for bgagent_output, all-status resume with queueing, HTTP API extension with messages endpoint, and React dashboard mini app with multi-instance discovery"
estimated_phases: 5
---

# Phases Overview: Absorb OMO Background Agent Features

## Background & Research

- **Current state**: bgagent_output returns final result text only. Resume limited to `completed` status. HTTP API has 7 endpoints (health, stats, tasks, task detail, task logs, task groups, events SSE). No dashboard UI.
- **Target state**: Full session message filtering with 6 new params. Resume from any status with queue for running tasks. 2 new HTTP endpoints (messages, instances). React dashboard with task tree, conversation viewer, batch grouping, multi-instance support.
- **Key files**: `src/tools/output.ts`, `src/tools/resume.ts`, `src/manager/index.ts`, `src/types.ts`, `src/server/routes.ts`, `src/server/index.ts`, `src/server/types.ts`, `src/constants.ts`
- **New files**: `src/manager/messages.ts`, `src/server/discovery.ts`, `dashboard/` (entire React app)
- **Dependencies to add**: `bonjour-service` (mDNS), React + Vite + Tailwind (dashboard devDeps)
- **Test framework**: Bun test (`bun:test`), co-located `__tests__/` directories

## Phase 1: Types & Core Message Filtering (~12min) ✅ COMPLETED
- Target tasks: tasks.md Section 1 (1.1–1.6), Section 2 (2.1–2.3)
- Dependencies: none
- Scope: Define all new types/interfaces. Build the message filtering engine as a standalone module.

## Phase 2: bgagent_output Extension + Tests (~12min) ✅ COMPLETED
- Target tasks: tasks.md Section 3 (3.1–3.4), Section 8 (8.1–8.3)
- Dependencies: Phase 1
- Scope: Extend the bgagent_output tool with 6 new parameters. Write unit tests for message filtering and bgagent_output backward compatibility.

## Phase 3: Resume + HTTP API + Discovery (~15min)
- Target tasks: tasks.md Section 4 (4.1–4.5), Section 5 (5.1–5.4), Section 6 (6.1–6.4), Section 8 (8.4–8.8)
- Dependencies: Phase 2
- Scope: All remaining backend work — resume extension (all-status + queue), HTTP messages endpoint, discovery class, new route registration, static file serving, constants, bonjour dep. Tests for all of the above.

## Phase 4: Dashboard App (~15min)
- Target tasks: tasks.md Section 7 (7.1–7.13)
- Dependencies: Phase 3 (API endpoints must exist)
- Scope: Full React dashboard — Vite+React+Tailwind scaffolding, SSE/instances/messages hooks, all UI components (TaskTree, TaskCard, ConversationViewer, BatchGroup, InstanceSelector, StatusBar), build scripts.

## Phase 5: Integration, Build & Verification (~8min)
- Target tasks: tasks.md Section 8 (8.9), Section 9 (9.1–9.5)
- Dependencies: all previous phases
- Scope: Dashboard static serving integration test. Full typecheck, test suite, plugin build, dashboard build. Smoke test verification.