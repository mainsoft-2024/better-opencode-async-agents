# Dashboard UX Overhaul Tasks

## Change ID
`2026-03-16-dashboard-ux-overhaul`

## Section 1: Foundation & State Management
- [ ] Add dashboard dependencies: `framer-motion`, `react-virtuoso`, `react-markdown`, `remark-gfm`, `shiki`, `zustand`, `react-resizable-panels`, `react-use-measure`, `@xyflow/react`, and `@dagrejs/dagre`.
- [ ] Update dashboard package lockfile and verify install reproducibility on clean install.
- [ ] Add shared dashboard typing updates in `dashboard/src/types.ts` for message groups, timeline events, floating panel models, tree nodes, and graph nodes/edges.
- [ ] Create `dashboard/src/stores/agentStore.ts` with normalized task/instance state and task-selection actions.
- [ ] Create `dashboard/src/stores/uiStore.ts` with layout mode, panel sizes, graph toggle, timeline drawer state, and floating panel registry/actions.
- [ ] Create `dashboard/src/stores/messageStore.ts` with per-task message caches, load status, grouping helpers, and tool timeline projections.
- [ ] Refactor `dashboard/src/hooks/useSSE.ts` to dispatch snapshot/task events into Zustand stores rather than local component state.
- [ ] Refactor `dashboard/src/hooks/useInstances.ts` to write instance updates into `agentStore` and expose loading/error selectors.
- [ ] Refactor `dashboard/src/hooks/useTaskMessages.ts` to hydrate `messageStore` and avoid duplicate fetches using cache-aware guards.
- [ ] Add store selector helpers to prevent broad re-renders (task slice selectors, message selectors, UI selectors).
- [ ] Add regression checks ensuring SSE reconnect logic still merges updates correctly with cached state.

## Section 2: Layout System
- [ ] Create `dashboard/src/components/layout/DashboardLayout.tsx` as the responsive shell component.
- [ ] Implement wide-screen 3-column layout using `react-resizable-panels` (agent pane, conversation pane, detail pane).
- [ ] Persist and restore wide-layout panel sizes via `uiStore`.
- [ ] Create `dashboard/src/hooks/useBreakpoint.ts` to derive `wide`/`narrow` mode from viewport width and orientation.
- [ ] Implement narrow-mode stacked layout with collapsible agent-tree header and conversation-first content flow.
- [ ] Build bottom timeline drawer for narrow mode with open/close state in `uiStore`.
- [ ] Add animated layout transitions between wide and narrow modes using framer-motion layout primitives.
- [ ] Add viewport constraint handling so floating elements and drawers do not overflow on resize/orientation change.

## Section 3: Conversation Viewer Rewrite
- [ ] Create `dashboard/src/components/conversation/MessageBubble.tsx` with avatar, agent name, timestamp, grouped-body rendering, and role-based styles.
- [ ] Implement message grouping utility to combine consecutive messages from the same speaker within a configurable time window.
- [ ] Create `dashboard/src/components/conversation/MarkdownRenderer.tsx` using `react-markdown` + `remark-gfm`.
- [ ] Integrate shiki-based fenced code highlighting in `MarkdownRenderer` via dynamic import and cached highlighter singleton.
- [ ] Create `dashboard/src/components/conversation/ToolCallAccordion.tsx` with expand/collapse animation, tool metadata, and highlighted args/results.
- [ ] Create `dashboard/src/components/conversation/TypingIndicator.tsx` with animated dots for in-progress agent output.
- [ ] Rewrite `dashboard/src/components/ConversationViewer.tsx` to use `react-virtuoso` for virtualized rendering.
- [ ] Implement stick-to-bottom behavior when user is near latest message and disable forced autoscroll while user reads history.
- [ ] Add “scroll to latest” floating button that appears when user is scrolled away from the bottom.
- [ ] Add framer-motion `AnimatePresence` message entry animations (slide-in + highlight) for newly streamed items.
- [ ] Add stable DOM anchor IDs for each message/tool block to support external navigation from timeline and graph/tree interactions.

## Section 4: Agent Tree & Graph
- [ ] Create hierarchy builder utility that transforms task list into parent-child-grandchild tree based on `parentSessionID` and related task metadata.
- [ ] Create `dashboard/src/components/agents/AgentTreeView.tsx` as recursive CSS file-explorer style tree with expand/collapse controls.
- [ ] Add status badges (queued/running/completed/failed/etc.) and running pulse animation to tree nodes.
- [ ] Wire tree node click to select active task and synchronize conversation + timeline panes.
- [ ] Create `dashboard/src/components/agents/AgentGraphView.tsx` with React Flow node/edge rendering.
- [ ] Integrate dagre layout computation for graph node positioning and deterministic rerender behavior.
- [ ] Lazy-load `AgentGraphView` with `React.lazy` and suspense fallback so graph code is not in initial bundle path.
- [ ] Add tree/graph mode toggle UI and persist preference in `uiStore`.
- [ ] Ensure parity interactions between tree and graph views (node click selects task; selected node highlighted).

## Section 5: Tool Timeline
- [ ] Create `dashboard/src/components/timeline/ToolTimeline.tsx` with DevTools-style waterfall lanes and time-axis scaling.
- [ ] Implement parser from message tool-call payloads into normalized timeline event models (start, end, duration, status, task/message linkage).
- [ ] Stream timeline updates in real time as new tool-call messages arrive through SSE.
- [ ] Implement running tool bar animation (pulse/progress) and completion transition styling.
- [ ] Add tooltip/hover details (tool name, task, timing, status, truncated args summary).
- [ ] Add click-on-bar behavior that jumps to corresponding conversation message/tool accordion anchor.
- [ ] Add empty/loading/error states for tasks with no tool events or delayed message hydration.

## Section 6: Floating Panels
- [ ] Create `dashboard/src/components/floating/FloatingAgentPanel.tsx` with draggable framer-motion shell and compact task summary.
- [ ] Add floating panel creation action (“pop out”) on task cards/tree nodes/graph nodes.
- [ ] Implement floating panel registry and z-index ordering in `uiStore`.
- [ ] Add minimize/restore/close controls and keyboard-friendly focus behavior.
- [ ] Constrain drag bounds to viewport and re-clamp panel positions on resize.
- [ ] Render live status, progress, and latest message preview inside each floating panel using store selectors.
- [ ] Add quick action in panel to focus/open selected panel task in main conversation pane.

## Section 7: Integration & Polish
- [ ] Integrate `DashboardLayout`, conversation rewrite, tree/graph, timeline, and floating panels in `dashboard/src/App.tsx`.
- [ ] Remove or archive superseded legacy components once replacements are feature-complete and wired.
- [ ] Update Vite configuration for optimal code splitting (graph/shiki chunks) and verify build output remains CLI-friendly.
- [ ] Add memoization (`React.memo`, `useMemo`, selector memoization) to heavy render paths.
- [ ] Run manual large-data validation with 1,000+ and 10,000+ message scenarios to confirm smooth interaction.
- [ ] Validate SSE reconnect/replay behavior with Zustand stores under network interruption and recovery.
- [ ] Validate narrow-mode interactions (collapsible tree, bottom drawer timeline, floating panels) on portrait viewport sizes.
- [ ] Validate wide-mode interactions (resizable panels, graph toggle, timeline navigation, floating panels).
- [ ] Verify dark-mode-only visual consistency and contrast across all new components.
- [ ] Update dashboard documentation/readme sections to describe new views, controls, and keyboard/mouse interaction model.
- [ ] Run final regression pass to ensure no plugin server API contract changes were introduced.