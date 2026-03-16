---
created: 2026-03-16T12:00:00Z
last_updated: 2026-03-17T00:00:00Z
type: spec
change_id: 2026-03-16-dashboard-ux-overhaul
status: done
trigger: "Dashboard UI/UX overhaul — virtual scrolling, markdown/code rendering, agent tree/graph visualization, floating panels, real-time animations, responsive layout, Zustand state management"
estimated_phases: 3
---

# Phases Overview: Dashboard UX Overhaul

## Background & Research

### Current Dashboard Architecture
- Vite + React 18 + Tailwind CSS v4 SPA in `dashboard/` directory
- 7 components: App.tsx (3-column grid), StatusBar, InstanceSelector, TaskCard, BatchGroup, TaskTree, ConversationViewer
- 3 hooks: useSSE.ts (SSE → local state), useInstances.ts (polling), useTaskMessages.ts (on-demand fetch)
- State: useState/useEffect only, no global state management
- API: Plugin server on port 5165 — REST + SSE at /v1/events
- Data: BackgroundTask (sessionID, parentSessionID, status, batchId, progress), FilteredMessage (id, role, type, content, thinking, toolCalls)

### Technology Stack Decisions
- **framer-motion**: AnimatePresence for message entry, layout for resize, drag for floating panels
- **react-virtuoso**: Virtual scrolling with stick-to-bottom (free MIT version, NOT commercial VirtuosoMessageList)
- **react-markdown + remark-gfm**: Markdown rendering
- **shiki**: Code highlighting (WASM, dynamic import, cached singleton)
- **zustand**: State management (~1.2KB)
- **react-resizable-panels**: Wide-screen panel layout (~5KB)
- **@xyflow/react + @dagrejs/dagre**: Graph view only (lazy-loaded, ~63KB combined)
- **react-use-measure**: Dynamic height for accordion animations
- **framer-motion drag**: Floating panels (no extra library needed)

### Key Constraints
- Must remain lightweight CLI-served SPA (no SSR)
- Heavy libs (React Flow, shiki) must be lazy-loaded
- No plugin server API changes
- Dark mode only
- Responsive: wide (resizable panels) + narrow (stacked + drawers)

### User Design Preferences
- Slack/Discord-style conversation (avatars, names, timestamps, grouped messages)
- Waterfall + inline tool visualization (both views)
- CSS tree by default, React Flow graph toggle
- Full animations (slide-in, pulse, typing indicator, state transitions)
- Narrow-screen optimized: collapsible tree header, full conversation, bottom drawer timeline
- Zustand for state, shiki for code highlighting

### Research Highlights — framer-motion
- Use `AnimatePresence mode="popLayout" initial={false}` for message lists
- Avoid `layout` prop inside react-virtuoso (causes measurement bugs)
- Use only opacity/transform animations on virtualized items
- For accordion: `animate={{ height: isExpanded ? 'auto' : 0 }}` with `react-use-measure`
- Drag: `<motion.div drag dragConstraints={constraintsRef}>` for floating panels

### Research Highlights — react-virtuoso
- `followOutput="smooth"` for stick-to-bottom
- `initialTopMostItemIndex={messages.length - 1}` to start at bottom
- `atBottomStateChange` callback to track scroll position
- `overscan={200}` to prevent blank areas during fast scroll
- Use `computeItemKey` with message IDs (never array index)

### Research Highlights — Agent Tree/Graph
- Build hierarchy from parentSessionID: `tasks → Map<parentId, children[]> → recursive tree`
- CSS tree: indent + expand/collapse, status badges, running pulse via CSS animation
- React Flow: dagre layout for auto-positioning, animated edges for running tasks, custom AgentNode component
- Lazy load with `React.lazy(() => import('./AgentGraphView'))`

## Phase 1: Foundation — Dependencies, Types, Zustand Stores ✅ DONE
- Target tasks: tasks.md lines 7-17 (Section 1: Foundation & State Management)
- Dependencies: none
- Scope: Install all new dependencies, create Zustand stores (agentStore, uiStore, messageStore), migrate existing hooks to use stores, add type definitions. Dashboard remains functional with old UI but powered by new state layer.
- Status: COMPLETED — 23 tests pass, build clean

## Phase 2: Layout + Conversation Viewer (merged from original phases 2+3)
- Target tasks: tasks.md lines 20-41 (Section 2: Layout System + Section 3: Conversation Viewer Rewrite)
- Dependencies: Phase 1 (Zustand stores must exist)
- Scope: Create DashboardLayout with react-resizable-panels (wide) and stacked layout (narrow), useBreakpoint hook, MessageBubble, MarkdownRenderer (react-markdown + shiki), ToolCallAccordion, TypingIndicator. Rewrite ConversationViewer with react-virtuoso, stick-to-bottom, scroll-to-latest button, AnimatePresence message entry animations, stable anchor IDs.
- Status: COMPLETED — 65 tests pass, build clean

## Phase 3: Agent Tree/Graph + Tool Timeline + Floating Panels + Integration + Polish (merged from original phases 4+5+6)
- Target tasks: tasks.md lines 43-82 (Sections 4-7: Agent Tree & Graph, Tool Timeline, Floating Panels, Integration & Polish)
- Dependencies: Phase 2 (layout + conversation components must exist)
- Scope: AgentTreeView (CSS tree), AgentGraphView (React Flow, lazy), tree/graph toggle, hierarchy builder, ToolTimeline (CSS waterfall), timeline event parser, FloatingAgentPanel (framer-motion drag), panel registry, full App.tsx integration, Vite code splitting, React.memo optimization, large-data validation, responsive testing, dark mode check, documentation update.
- Status: COMPLETED — 107 tests pass, 389KB main + 226KB lazy graph chunk, build clean