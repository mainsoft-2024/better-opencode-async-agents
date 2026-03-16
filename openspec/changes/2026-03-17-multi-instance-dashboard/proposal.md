# Proposal: Multi-Instance Dashboard + bgagent_output Description

## Change ID
`2026-03-17-multi-instance-dashboard`

## Problem Statement
The dashboard currently connects to a single plugin server via one SSE stream. Users running 5+ OpenCode instances simultaneously cannot see all sub-agents across instances in one unified view. Additionally, the `bgagent_output` tool description doesn't clearly state that `full_session=true` works for running tasks (not just completed ones).

## Goals
1. **Multi-instance SSE** — Dashboard connects to ALL discovered instances simultaneously, aggregating tasks into one unified view
2. **Instance identification** — Each plugin server generates a unique instance ID at startup, exposes it via server.json, API, SSE, and mDNS
3. **Instance-aware UI** — Tasks tagged by instance with color-coded badges, filterable by instance. Instance names derived from working directory (cwd)
4. **bgagent_output description fix** — Clarify that `full_session=true` returns partial results from running tasks, not just completed ones

## Non-Goals
- Cross-instance task coordination or remote task launching
- Authentication between instances
- Persistent instance registry (instances are ephemeral, discovered via mDNS)
- Changing the mDNS discovery protocol itself
- Modifying OpenCode core to expose instance IDs (we generate our own)

## User Impact
- Users with multiple OpenCode instances can monitor all sub-agents from a single dashboard
- Instance identification via cwd name (e.g., 'my-project', 'opencode-superagents') makes it intuitive
- Color-coded instance badges provide instant visual grouping
- Unified + filtered views let users focus on one instance or see everything

## Constraints
- Must handle 5+ concurrent SSE connections without performance degradation
- Task ID collisions between instances must be prevented (compound keys: instanceId:taskId)
- Instance disconnect/reconnect must be graceful per-instance (not tear down all connections)
- Dashboard bundle size should not increase significantly
