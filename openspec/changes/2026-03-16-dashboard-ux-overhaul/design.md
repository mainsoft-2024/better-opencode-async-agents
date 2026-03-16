# Dashboard UX Overhaul Design

## Change ID
`2026-03-16-dashboard-ux-overhaul`

## Overview
This design upgrades the existing dashboard UI into a scalable, real-time operations console while preserving the current architecture boundaries: Vite + React 18 + Tailwind v4 SPA, served by `bin/dashboard.mjs`, backed by existing plugin server REST/SSE endpoints.

Core upgrades include responsive panelized layout, virtualized conversation rendering, rich markdown/code presentation, nested agent tree+graph visualization, real-time tool waterfall timeline, draggable floating monitor panels, and centralized client state via Zustand.

## Architecture

### High-Level Component Hierarchy
- `App`
  - `DashboardLayout` (responsive shell)
    - `StatusBar` (existing, connected to store selectors)
    - `AgentPane`
      - `AgentTreeView` (default)
      - `AgentGraphView` (lazy, optional)
      - `InstanceSelector`
    - `ConversationPane`
      - `ConversationViewer` (virtualized list)
        - `MessageBubble` (grouped message row)
          - `MarkdownRenderer`
          - `ToolCallAccordion`
          - `TypingIndicator` (conditional for in-progress state)
    - `DetailPane`
      - `ToolTimeline`
      - task metadata/progress panels
    - `FloatingPanelLayer`
      - multiple `FloatingAgentPanel` instances (draggable, minimizable)

### Data Flow
1. SSE stream (`/v1/events`) updates normalized task/session/message state in Zustand stores.
2. Polling (`/v1/instances`) updates instance health and discoverability in `agentStore`.
3. On task selection, message cache is hydrated from `/v1/tasks/:id/messages` if missing/stale.
4. Derived selectors compute hierarchy, active thread, grouped messages, and timeline event projections.
5. UI components subscribe to minimal slices to reduce unnecessary renders.

## State Management (Zustand)

### `agentStore`
Responsibility: global task and instance state.
- `tasksById`, `taskOrder`, `selectedTaskId`
- `instances` and instance status metadata
- actions: `upsertTasksFromSnapshot`, `applyTaskEvent`, `setSelectedTask`, `setInstances`
- selectors: `selectedTask`, `rootTasks`, `childrenByTaskId`, `runningTasks`

### `uiStore`
Responsibility: presentation mode and interaction state.
- `layoutMode` (`wide` | `narrow`)
- panel sizes and collapsed flags
- tree/graph mode toggle
- timeline drawer open/closed state (narrow mode)
- floating panel registry (position, size, minimized, taskId)
- actions: `setLayoutMode`, `setPanelSizes`, `toggleGraphMode`, `openFloatingPanel`, `updateFloatingPanel`, `closeFloatingPanel`

### `messageStore`
Responsibility: message caching and derived rendering datasets.
- `messagesByTaskId` (raw filtered messages)
- fetch status and pagination metadata (if extended later)
- grouped message blocks for viewer consumption
- timeline event projections parsed from tool calls
- actions: `hydrateMessages`, `appendMessage`, `appendToolEvent`, `markTaskSynced`

## Layout System

### Wide Screen Strategy
- Use `react-resizable-panels` for a 3-column layout:
  - Left: agent hierarchy + instance controls
  - Middle: conversation focus
  - Right: tool timeline and details
- Persist panel size preferences in `uiStore` (session-local persistence acceptable).
- Animate panel resize and content transitions with `framer-motion` layout primitives where useful.

### Narrow/Portrait Strategy
- Stacked layout with priority on conversation readability.
- Top collapsible header hosts compact tree selector and current task context.
- Tool timeline moves into a bottom drawer with swipe/click toggle semantics.
- Floating panels remain available but constrained to viewport bounds.

### Breakpoint Strategy
- Add `useBreakpoint` hook to derive `wide` vs `narrow` mode from viewport width and orientation.
- `DashboardLayout` switches mode declaratively and preserves per-mode UI preferences.

## Component Design

### `ConversationViewer` (rewrite)
- Replace linear rendering with `react-virtuoso`.
- Enable stick-to-bottom behavior for live updates when user is near latest message.
- Preserve reader position when user is reviewing history.
- Render grouped blocks via `MessageBubble` with memoized row renderers.
- Integrate framer-motion entry transitions for newly appended messages.

### `MessageBubble` (new)
- Slack/Discord-inspired grouped presentation: avatar, display name, timestamp, contiguous messages by same speaker.
- Supports roles and system/tool styling variants.
- Emits stable anchors for cross-navigation from timeline click events.

### `MarkdownRenderer` (new)
- Use `react-markdown` + `remark-gfm` for rich content rendering.
- Use dynamic shiki highlighter initialization for fenced code blocks.
- Provide fallback plain `<pre><code>` rendering until highlighter is ready.

### `ToolCallAccordion` (new)
- Inline collapsible card for each tool call within relevant message.
- Shows tool name, status, duration, start/end markers.
- Expandable details render input/output with code highlighting.
- Animate expand/collapse via framer-motion + `react-use-measure` for smooth height transitions.

### `ToolTimeline` (new)
- DevTools-style waterfall lane showing tool calls over time.
- CSS-driven chart with horizontal bars mapped to timestamps/duration.
- Supports live updates: running bars animate pulse/progress; completed bars settle with final duration.
- Clicking a bar jumps to corresponding message anchor in `ConversationViewer`.

### `AgentTreeView` (new)
- Recursive file-explorer style tree derived from `parentSessionID`/task relationships.
- Expand/collapse nodes, status chips, and running pulse indicator.
- Node click sets active task and updates conversation/timeline panes.

### `AgentGraphView` (new, lazy)
- Optional graph mode for complex nested relationships.
- Built with `@xyflow/react`, laid out with `@dagrejs/dagre`.
- Loaded with `React.lazy` only when graph mode is enabled.
- Maintains node click parity with tree behavior.

### `FloatingAgentPanel` (new)
- Picture-in-Picture draggable panel for secondary task monitoring.
- Framer-motion drag with viewport constraints.
- Displays compact status, recent messages, and quick jump action.
- Supports minimize/restore/close and survives selection changes.

### `TypingIndicator` (new)
- Animated dot indicator for in-progress agents/messages.
- Used inline in conversation and optionally in tree/floating panels.

### `DashboardLayout` (new)
- Central responsive wrapper coordinating wide/narrow layouts.
- Owns panel scaffolding and hands subpanes to feature components.

## Lazy Loading and Bundle Strategy
- Graph stack (`@xyflow/react`, `@dagrejs/dagre`) is code-split with `React.lazy` and loaded only in graph mode.
- shiki is initialized through dynamic import and cached singleton highlighter instance.
- Keep default render path lightweight: tree mode + plain markdown path should load quickly.
- Reassess chunk boundaries in Vite config to avoid one large vendor bundle.

## Animation System
- `AnimatePresence` for message/tool row enter/exit transitions.
- `motion.div layout` for panel and accordion size transitions.
- Drag interactions for floating panels via framer-motion drag API.
- Running-state pulse for agent nodes/tool bars implemented with CSS + framer-motion where appropriate.
- Ensure reduced-motion fallback behavior for accessibility and performance safety.

## Performance Considerations
- `react-virtuoso` to avoid DOM blow-up on large transcripts.
- Memoize `MessageBubble` and heavy subcomponents to minimize rerenders.
- Use selector-based Zustand subscriptions to avoid whole-app invalidation.
- Cache parsed markdown/code and timeline projections per task where possible.
- Avoid recomputing dagre layouts unless task graph topology changes.

## Compatibility and Constraints
- No plugin server API changes; consumes existing REST/SSE contracts.
- No SSR/Next.js migration; remains CLI-served static SPA artifact.
- Dark mode only; align with existing Tailwind v4 dark palette.
- Preserve behavior of `bin/dashboard.mjs` serving `dist/dashboard/` outputs.

## Rollout Notes
- Implement behind incremental component replacement to keep dashboard functional at each phase.
- Retain old components until replacements are wired and verified, then remove dead code.
- Validate with large synthetic message streams and concurrent agent trees before final cleanup.