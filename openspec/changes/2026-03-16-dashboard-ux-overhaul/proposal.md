# Dashboard UX Overhaul Proposal

## Change ID
`2026-03-16-dashboard-ux-overhaul`

## Problem Statement
The current dashboard is functional but visually and operationally basic for high-volume background-agent monitoring. Conversation rendering is a simple linear view without virtual scrolling, markdown rendering, syntax highlighting, robust scroll control, or polished grouping, which makes long sessions difficult to inspect. The UI does not provide a clear visualization of nested parent-child-grandchild agent relationships, has limited real-time motion cues for state changes, and lacks a dedicated tool execution timeline view.

As background workflows become larger and more concurrent, operators need a professional-grade interface that preserves context, scales to long transcripts, and supports rapid cross-agent debugging in real time.

## Goals
- Deliver a professional-grade real-time monitoring dashboard while keeping the existing Vite + React SPA architecture and CLI-serving model.
- Redesign conversation viewing with virtualized rendering, Slack/Discord-style grouped messages, markdown support, syntax-highlighted code blocks, and explicit scroll affordances.
- Introduce dual nested-agent visualization: a default file-explorer-style tree and an optional graph view for complex hierarchies.
- Add live, discoverable tool execution visualization both inline (message-level) and as a dedicated waterfall timeline.
- Add draggable Picture-in-Picture floating panels so users can monitor multiple agents concurrently.
- Add meaningful real-time animations for new messages, tool state transitions, active agents, and typing/in-progress signals.
- Ensure responsive behavior across wide and narrow screen layouts with panelized desktop and stacked/drawer narrow layouts.

## Non-Goals
- Server-side rendering (SSR), Next.js migration, or any non-SPA rendering model.
- Mobile-first optimization or native mobile app support beyond usable narrow-screen responsive behavior.
- Authentication, authorization, or multi-tenant access controls.
- Long-term server-side persistence, historical archival systems, or offline replay storage changes.
- Agent control plane actions (editing prompts, mutating task execution, pausing/stopping tasks) from the dashboard UI.
- Plugin server API contract changes that would break existing clients.

## Success Criteria
- Conversation view remains smooth and interactive with 10,000+ messages per task, including virtual scrolling and controlled autoscroll behavior.
- Message rendering supports markdown (including GFM), syntax-highlighted code blocks, tool call accordion details, and grouped conversational presentation with metadata (avatar/name/timestamp).
- Agent hierarchy view accurately represents parent-child-grandchild relationships from existing task/session fields, and selecting any node updates the active conversation.
- Tool timeline displays execution as a real-time waterfall view with clearly visible running/completed states and direct navigation into relevant conversation context.
- New incoming messages and tool events animate in consistently (slide-in/highlight), and running entities show live-state animations without degrading performance.
- Layout adapts correctly: wide screens provide resizable multi-panel workflow; narrow screens provide stacked flow with collapsible tree header and bottom timeline drawer.
- Dashboard remains a lightweight CLI-served SPA, and plugin server endpoints/SSE contracts remain backward compatible.