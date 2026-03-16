---
created: 2026-03-16T22:30:00.000Z
last_updated: 2026-03-16T22:30:00.000Z
type: spec
change_id: 2026-03-16-dashboard-ux-overhaul
plan_number: 2
status: pending
trigger: "Phase 2 — Layout System + Conversation Viewer Rewrite (merged phases 2+3)"
depends_on: 001_phase1-foundation.md
next: 003_phase3-tree-panels-polish.md
---

# Plan: Layout System + Conversation Viewer Rewrite

## Background & Research

### Current App.tsx layout (lines 72-121)
The current layout is a simple CSS grid with 3 fixed columns:
```tsx
// dashboard/src/App.tsx lines 72-121
<div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
  <StatusBar stats={stats} isConnected={isConnected} instanceCount={instances.length} />
  <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[260px,minmax(0,1fr),minmax(0,1fr)]">
    <div className="min-h-0">
      <InstanceSelector ... />
    </div>
    <div className="min-h-0">
      <TaskTree tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={setSelectedTask} />
    </div>
    <div className="min-h-0">
      <ConversationViewer messages={messages} isLoading={messagesLoading} taskId={selectedTaskId} />
    </div>
  </main>
</div>
```

### Current ConversationViewer (lines 1-125)
Simple list rendering with `<pre>` for content, `<details>` for thinking/tool calls, and `scrollIntoView` for auto-scroll:
```tsx
// dashboard/src/components/ConversationViewer.tsx
export function ConversationViewer({ messages, isLoading, taskId }: ConversationViewerProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [normalizedMessages.length, taskId]);
  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-800 bg-gray-950">
      <div className="border-b border-gray-800 px-4 py-3 text-sm text-gray-300">Conversation</div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {normalizedMessages.map((message) => (
          <article key={message.id} className="space-y-2 rounded-md border border-gray-800 bg-gray-900/70 p-3">
            <div className="flex items-center gap-2">
              <span className={`... ${roleBadgeClass[message.role]}`}>{message.role}</span>
              <span className="text-xs text-gray-500">{message.type}</span>
              {message.timestamp && <span>...</span>}
            </div>
            <pre className="whitespace-pre-wrap break-words text-sm text-gray-100">{message.content}</pre>
            {message.thinking && <details>...</details>}
            {message.toolCalls?.length > 0 && <details>...</details>}
          </article>
        ))}
      </div>
    </div>
  );
}
```

### uiStore state (ready for layout)
```ts
// dashboard/src/stores/uiStore.ts
export interface UIStore {
  layoutMode: 'wide' | 'narrow';
  panelSizes: number[];  // default [25, 50, 25]
  graphMode: boolean;
  timelineDrawerOpen: boolean;
  floatingPanels: FloatingPanelState[];
  setLayoutMode: (mode: LayoutMode) => void;
  setPanelSizes: (sizes: number[]) => void;
  toggleGraphMode: () => void;
  setTimelineDrawerOpen: (open: boolean) => void;
  openFloatingPanel: (taskId: string, position?: { x: number; y: number }) => void;
  updateFloatingPanel: (id: string, update: Partial<FloatingPanelState>) => void;
  closeFloatingPanel: (id: string) => void;
}
```

### messageStore selectors (ready for conversation)
```ts
// dashboard/src/stores/messageStore.ts
export const useTaskMessages = (taskId: string) =>
  useMessageStore((state) => state.messagesByTaskId[taskId] ?? []);
export const useTaskFetchStatus = (taskId: string) =>
  useMessageStore((state) => state.fetchStatus[taskId] ?? 'idle');
export const useGroupedMessages = (taskId: string) =>
  useMessageStore((state) => state.messagesByTaskId[taskId] ?? []);  // TODO: grouping logic
```

### FilteredMessage type (what messages look like)
```ts
export type FilteredMessage = {
  id: string;
  role: string;    // 'user' | 'assistant' | 'system'
  type: string;
  content: string;
  thinking?: string;
  toolCalls?: any[];
  timestamp?: string;
};
```

### MessageGroup type (defined in types.ts, not yet implemented)
```ts
export interface MessageGroup {
  speakerId: string;
  speakerRole: string;
  speakerName: string;
  messages: FilteredMessage[];
  startTime?: string;
  endTime?: string;
}
```

### Key dependencies already installed
- `react-resizable-panels` ^4.7.3 — for wide 3-column layout
- `react-virtuoso` ^4.18.3 — for virtualized message list
- `framer-motion` ^12.36.0 — for animations
- `react-markdown` ^10.1.0 + `remark-gfm` ^4.0.1 — for markdown rendering
- `shiki` ^4.0.2 — for code highlighting
- `react-use-measure` ^2.1.7 — for measuring accordion heights
- `zustand` ^5.0.12 — state management

### Test pattern from Phase 1 (agentStore.test.ts)
```ts
import { beforeEach, describe, expect, it } from 'vitest';
// Use makeXxx factory helpers with Partial<T> overrides
// Reset store with useXxxStore.setState({...defaults}) in beforeEach
// Test actions and selectors independently
```

### Design spec patterns
- **react-virtuoso**: `followOutput="smooth"`, `initialTopMostItemIndex={messages.length - 1}`, `atBottomStateChange` callback, `overscan={200}`, `computeItemKey` with message IDs
- **Animations**: `AnimatePresence mode="popLayout" initial={false}` — but AVOID `layout` prop inside react-virtuoso items; use opacity/transform only
- **Accordion**: `animate={{ height: isExpanded ? 'auto' : 0 }}` with `react-use-measure`
- **Layout**: `PanelGroup direction="horizontal"` with `Panel` + `PanelResizeHandle`

---

## Testing Plan (TDD — tests first)

### Batch T1: Utility + Hook tests (parallel)
- [ ] T1a: Create `dashboard/src/utils/__tests__/groupMessages.test.ts` — test `groupMessages()` utility: groups consecutive same-role messages within 60s window, splits on role change, splits on time gap, handles empty array, handles single message, preserves order
- [ ] T1b: Create `dashboard/src/hooks/__tests__/useBreakpoint.test.ts` — test `useBreakpoint()` hook: returns 'wide' when innerWidth >= 1024, returns 'narrow' when < 1024, calls setLayoutMode on uiStore, responds to resize events
- [ ] T1c: Create `dashboard/src/components/conversation/__tests__/MessageBubble.test.tsx` — test MessageBubble: renders role badge, renders agent name, renders timestamp, renders grouped messages, applies user/assistant/system role styles
- [ ] T1d: Create `dashboard/src/components/conversation/__tests__/ToolCallAccordion.test.tsx` — test ToolCallAccordion: renders collapsed by default, expands on click, shows tool name/metadata, renders args/results

### Batch T2: Component integration tests (parallel, after T1)
- [ ] T2a: Create `dashboard/src/components/conversation/__tests__/MarkdownRenderer.test.tsx` — test MarkdownRenderer: renders plain text, renders markdown headings/lists/links, renders inline code, renders fenced code blocks (fallback pre/code without shiki in test env)
- [ ] T2b: Create `dashboard/src/components/conversation/__tests__/TypingIndicator.test.tsx` — test TypingIndicator: renders 3 animated dots, accepts className prop
- [ ] T2c: Create `dashboard/src/components/conversation/__tests__/ConversationViewer.test.tsx` — test rewritten ConversationViewer: renders virtuoso container, shows empty state, shows loading state, renders messages via MessageBubble, shows scroll-to-bottom button when not at bottom

---

## Implementation Plan

### Batch 1: Independent building blocks (parallel — 5 coders)

- [ ] **Coder A**: `useBreakpoint` hook + `groupMessages` utility
  - Create `dashboard/src/hooks/useBreakpoint.ts`:
    - Use `window.matchMedia('(min-width: 1024px)')` for wide/narrow detection
    - Call `useUIStore.getState().setLayoutMode()` on change
    - Return current `layoutMode` from store
    - Attach `change` event listener with cleanup
  - Create `dashboard/src/utils/groupMessages.ts`:
    - `groupMessages(messages: FilteredMessage[], windowMs = 60_000): MessageGroup[]`
    - Group consecutive messages with same `role` within `windowMs`
    - Set `speakerId` to role, `speakerRole` to role, `speakerName` to role label
    - Set `startTime`/`endTime` from first/last message timestamps
  - Files: `dashboard/src/hooks/useBreakpoint.ts`, `dashboard/src/utils/groupMessages.ts`

- [ ] **Coder B**: `MessageBubble` component
  - Create `dashboard/src/components/conversation/MessageBubble.tsx`:
    - Props: `{ group: MessageGroup; isLatest?: boolean }`
    - Render: avatar circle (first letter of role, color by role), agent/role name, timestamp of first message
    - Render each message in group: content via `MarkdownRenderer` (imported, can be placeholder initially)
    - Role-based border/bg colors: user=blue-tint, assistant=green-tint, system=gray-tint
    - Stable anchor ID: `id={`msg-${group.messages[0].id}`}`
    - Wrap in `motion.div` with `initial={{ opacity: 0, y: 12 }}` `animate={{ opacity: 1, y: 0 }}`
  - Files: `dashboard/src/components/conversation/MessageBubble.tsx`

- [ ] **Coder C**: `MarkdownRenderer` + shiki integration
  - Create `dashboard/src/components/conversation/MarkdownRenderer.tsx`:
    - Props: `{ content: string; className?: string }`
    - Use `react-markdown` with `remarkPlugins={[remarkGfm]}`
    - Custom `code` component: if fenced (`node.tagName === 'code'` with language class), use shiki; else inline `<code>`
    - Shiki: lazy singleton via `dashboard/src/utils/shikiHighlighter.ts`:
      - `let highlighterPromise: Promise<HighlighterCore> | null = null`
      - `export function getHighlighter()` — creates once with `createHighlighterCore()`, loads `github-dark` theme + common langs (ts, js, json, bash, python)
      - Use `React.use()` or `useSyncExternalStore` with suspense, OR simpler: `useState` + `useEffect` to load
    - Fallback: plain `<pre><code>` while shiki loads
    - Style overrides for markdown elements: headings, lists, links, blockquotes, tables
  - Files: `dashboard/src/components/conversation/MarkdownRenderer.tsx`, `dashboard/src/utils/shikiHighlighter.ts`

- [ ] **Coder D**: `ToolCallAccordion` + `TypingIndicator`
  - Create `dashboard/src/components/conversation/ToolCallAccordion.tsx`:
    - Props: `{ toolCalls: any[]; messageId: string }`
    - Each tool call: collapsible card with tool name, expand/collapse toggle
    - Use `useMeasure` from `react-use-measure` for smooth height animation
    - `motion.div animate={{ height: isExpanded ? measuredHeight : 0 }}` with `overflow: hidden`
    - Expanded: show JSON-formatted args and results with `MarkdownRenderer` (code block)
    - Stable anchor: `id={`tool-${messageId}-${index}`}`
  - Create `dashboard/src/components/conversation/TypingIndicator.tsx`:
    - 3 dots with staggered `motion.span` animations (bounce/pulse)
    - Props: `{ className?: string }`
  - Files: `dashboard/src/components/conversation/ToolCallAccordion.tsx`, `dashboard/src/components/conversation/TypingIndicator.tsx`

- [ ] **Coder E**: `DashboardLayout` with react-resizable-panels
  - Create `dashboard/src/components/layout/DashboardLayout.tsx`:
    - Props: `{ sidebar: ReactNode; main: ReactNode; detail: ReactNode; header: ReactNode; bottomDrawer?: ReactNode }`
    - Read `layoutMode` from `useUIStore`
    - Wide mode: `PanelGroup direction="horizontal"` with 3 `Panel` components + 2 `PanelResizeHandle`
      - Panel sizes from `uiStore.panelSizes`, persist on `onLayout` via `setPanelSizes`
      - Min sizes: sidebar=15, main=30, detail=15
    - Narrow mode: vertical stack — header (collapsible), main (full width), bottomDrawer (slide-up)
      - Use `motion.div` for bottom drawer with `animate={{ y: isOpen ? 0 : '100%' }}`
    - Animate transitions with `AnimatePresence` when layout mode changes
  - Create `dashboard/src/hooks/useBreakpoint.ts` if not already created by Coder A (coordinate: Coder A creates utility+hook, Coder E only creates layout component)
  - Files: `dashboard/src/components/layout/DashboardLayout.tsx`

### Batch 2: ConversationViewer rewrite + App.tsx integration (after Batch 1)

- [ ] **Coder F**: Rewrite `ConversationViewer.tsx` with react-virtuoso
  - Rewrite `dashboard/src/components/ConversationViewer.tsx` entirely:
    - Import `Virtuoso` from `react-virtuoso`
    - Import `MessageBubble`, `ToolCallAccordion`, `TypingIndicator`, `groupMessages`
    - Read messages from props, call `groupMessages()` to get `MessageGroup[]`
    - Use `<Virtuoso` with:
      - `data={groups}`
      - `computeItemKey={(_, group) => group.messages[0].id}`
      - `followOutput="smooth"` for stick-to-bottom
      - `initialTopMostItemIndex={groups.length - 1}`
      - `atBottomStateChange={(atBottom) => setIsAtBottom(atBottom)}`
      - `overscan={200}`
      - `itemContent={(index, group) => <MessageBubble group={group} isLatest={index === groups.length - 1} />}`
    - For each message in group that has `toolCalls`, render `<ToolCallAccordion>` inline
    - Show `<TypingIndicator />` after last message if selected task status is 'running'
    - Floating "scroll to latest" button: `motion.button` with `AnimatePresence`, visible when `!isAtBottom`
      - On click: `virtuosoRef.current.scrollToIndex({ index: 'LAST', behavior: 'smooth' })`
    - Header bar: task description + status badge + message count
    - Empty state and loading state unchanged from current
  - Files: `dashboard/src/components/ConversationViewer.tsx`

- [ ] **Coder G**: Wire `DashboardLayout` into `App.tsx`
  - Update `dashboard/src/App.tsx`:
    - Import `DashboardLayout` and `useBreakpoint`
    - Call `useBreakpoint()` at top of App to activate layout detection
    - Replace the existing `<main className="grid ...">` with `<DashboardLayout>`:
      - `header={<StatusBar ... />}`
      - `sidebar={<><InstanceSelector .../><TaskTree .../></>}`
      - `main={<ConversationViewer ... />}`
      - `detail={null}` (placeholder for Phase 3 timeline)
      - `bottomDrawer={null}` (placeholder for Phase 3 narrow timeline)
    - Move error displays into appropriate slots
    - Remove the CSS grid classes
  - Files: `dashboard/src/App.tsx`

### Batch 3: Build verification + test run
- [ ] **Coder H**: Run `npm run build` in dashboard/ and fix any TypeScript/build errors. Run `npx vitest run` to verify all tests pass. Fix any import issues or type errors across the new components.
  - Files: any files that need import/type fixes (read-only diagnosis first, then targeted fixes)

---

## Parallelization Plan

### Batch T1 (parallel — 4 test coders)
- [ ] Coder T1a: groupMessages tests → files: `dashboard/src/utils/__tests__/groupMessages.test.ts`
- [ ] Coder T1b: useBreakpoint tests → files: `dashboard/src/hooks/__tests__/useBreakpoint.test.ts`
- [ ] Coder T1c: MessageBubble tests → files: `dashboard/src/components/conversation/__tests__/MessageBubble.test.tsx`
- [ ] Coder T1d: ToolCallAccordion tests → files: `dashboard/src/components/conversation/__tests__/ToolCallAccordion.test.tsx`

### Batch T2 (parallel — 3 test coders, after T1)
- [ ] Coder T2a: MarkdownRenderer tests → files: `dashboard/src/components/conversation/__tests__/MarkdownRenderer.test.tsx`
- [ ] Coder T2b: TypingIndicator tests → files: `dashboard/src/components/conversation/__tests__/TypingIndicator.test.tsx`
- [ ] Coder T2c: ConversationViewer tests → files: `dashboard/src/components/conversation/__tests__/ConversationViewer.test.tsx`

### Batch 1 (parallel — 5 impl coders, after T1+T2)
- [ ] Coder A: useBreakpoint + groupMessages → files: `dashboard/src/hooks/useBreakpoint.ts`, `dashboard/src/utils/groupMessages.ts`
- [ ] Coder B: MessageBubble → files: `dashboard/src/components/conversation/MessageBubble.tsx`
- [ ] Coder C: MarkdownRenderer + shiki → files: `dashboard/src/components/conversation/MarkdownRenderer.tsx`, `dashboard/src/utils/shikiHighlighter.ts`
- [ ] Coder D: ToolCallAccordion + TypingIndicator → files: `dashboard/src/components/conversation/ToolCallAccordion.tsx`, `dashboard/src/components/conversation/TypingIndicator.tsx`
- [ ] Coder E: DashboardLayout → files: `dashboard/src/components/layout/DashboardLayout.tsx`

### Batch 2 (parallel — 2 impl coders, after Batch 1)
- [ ] Coder F: ConversationViewer rewrite → files: `dashboard/src/components/ConversationViewer.tsx`
- [ ] Coder G: App.tsx wiring → files: `dashboard/src/App.tsx`

### Batch 3 (sequential — 1 coder, after Batch 2)
- [ ] Coder H: Build + test verification → files: any (read + fix)

### Dependencies
- T1 and T2 can merge into a single parallel batch since tests don't depend on implementation files existing
- Batch 1 coders are fully independent — no shared files
- Coder F (ConversationViewer) depends on Batch 1 outputs: MessageBubble, ToolCallAccordion, TypingIndicator, groupMessages, MarkdownRenderer
- Coder G (App.tsx) depends on DashboardLayout from Coder E and useBreakpoint from Coder A
- Batch 3 depends on everything being in place

### Risk Areas
- **Shiki in test env**: shiki may not load in jsdom — MarkdownRenderer tests should mock it or test fallback rendering only
- **react-virtuoso in tests**: May need to mock or use a simplified render — ConversationViewer tests should verify rendered items exist, not scroll behavior
- **framer-motion in tests**: motion components render as regular DOM elements in test — no special handling needed
- **Import chains**: Coder F imports from Coder B/C/D outputs — if any has wrong export name, Batch 3 catches it
- **react-resizable-panels in narrow mode**: DashboardLayout must NOT render PanelGroup in narrow mode (it errors without min-width)

---

## Done Criteria
- [ ] `dashboard/src/hooks/useBreakpoint.ts` exists and toggles uiStore layoutMode on viewport change
- [ ] `dashboard/src/utils/groupMessages.ts` correctly groups consecutive same-role messages
- [ ] `dashboard/src/components/conversation/MessageBubble.tsx` renders grouped messages with role styling and avatars
- [ ] `dashboard/src/components/conversation/MarkdownRenderer.tsx` renders markdown with GFM + shiki code highlighting
- [ ] `dashboard/src/components/conversation/ToolCallAccordion.tsx` expands/collapses with animation showing tool args/results
- [ ] `dashboard/src/components/conversation/TypingIndicator.tsx` shows animated dots
- [ ] `dashboard/src/components/layout/DashboardLayout.tsx` renders 3-column resizable layout (wide) or stacked layout (narrow)
- [ ] `dashboard/src/components/ConversationViewer.tsx` uses react-virtuoso with stick-to-bottom and scroll-to-latest button
- [ ] `dashboard/src/App.tsx` uses DashboardLayout instead of CSS grid
- [ ] All new tests pass (`npx vitest run` in dashboard/)
- [ ] Dashboard builds cleanly (`npm run build` in dashboard/)
- [ ] No TypeScript errors in new or modified files