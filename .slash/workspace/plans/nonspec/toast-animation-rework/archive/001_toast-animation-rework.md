---
created: 2026-03-16T00:00:00Z
last_updated: 2026-03-16T00:00:00Z
type: nonspec
plan_number: 1
status: pending
trigger: "Rework toast loading animation: braille auto-spin + event-driven progress bar"
depends_on: none
next: TBD
---

# Plan: Toast Loading Animation Rework

## Background & Research

### Current Animation System
Three separate phase icons shown one at a time based on task phase:
- **waiting**: `○` / `◉` pulsing (2 frames, 500ms interval)
- **streaming**: braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` (advances every 20 chars of output)
- **tool**: progress bar `▰▱▱ → ▰▰▱ → ▰▰▰ → ▱▰▰ → ▱▱▰ → ▱▱▱` (advances every 100ms poll)

### Target Animation System
Dual-icon display for all active tasks:
- **Braille spinner**: auto-rotates at 80ms regardless of phase
- **Progress bar**: advances 1 frame on each streaming/tool state change event
- **Waiting state**: keeps existing `○`/`◉` pulsing (user preference)
- **Completed**: `✓ ▰▰▰` (success) / `✗ ▱▱▱` (error)
- Format: `⠹ ▰▱▱ [explorer#a3f2] Find toast loading animation code`

### Key File: `src/constants.ts` (lines 5-15)
```typescript
export const COMPLETION_DISPLAY_DURATION = 10000;
// Phase-specific animation frames
export const WAITING_FRAMES = ["○", "◉"];
export const WAITING_FRAME_INTERVAL = 5; // 5 polls × 100ms = 500ms per frame
export const STREAMING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const TOOL_FRAMES = ["▰▱▱", "▰▰▱", "▰▰▰", "▱▰▰", "▱▱▰", "▱▱▱"];
/** @deprecated Use STREAMING_FRAMES instead */
export const SPINNER_FRAMES = STREAMING_FRAMES;

/** Characters of assistant text output per streaming animation frame advance (~5 tokens) */
export const STREAM_CHARS_PER_FRAME = 20;
```

### Key File: `src/types.ts` (lines 9-23) — TaskProgress interface
```typescript
export type TaskPhase = "waiting" | "streaming" | "tool";

export interface TaskProgress {
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  lastTools: string[];
  lastUpdate: string;
  // Phase-aware animation state
  phase: TaskPhase;
  textCharCount: number;
  streamFrame: number;
  waitingFrame: number;
  toolFrame: number;
  _waitPollCount?: number;
}
```

### Key File: `src/manager/notifications.ts` (lines 40-50) — getPhaseIcon
```typescript
function getPhaseIcon(task: BackgroundTask): string {
  const phase = task.progress?.phase ?? "waiting";
  switch (phase) {
    case "waiting":
      return WAITING_FRAMES[task.progress?.waitingFrame ?? 0] ?? "◌";
    case "streaming":
      return STREAMING_FRAMES[task.progress?.streamFrame ?? 0] ?? "⠋";
    case "tool":
      return TOOL_FRAMES[task.progress?.toolFrame ?? 0] ?? "▱";
  }
}
```

### Key File: `src/manager/notifications.ts` (lines 99-117) — running task line formatting
```typescript
const taskLines: string[] = [];
// ...
for (const task of batchRunning) {
  const duration = formatDuration(new Date(task.startedAt));
  const tools = task.progress?.lastTools?.slice(-3) ?? [];
  let toolsStr = "";
  if (tools.length > 0) {
    const lastTool = tools[tools.length - 1];
    const prevTools = tools.slice(0, -1);
    toolsStr = prevTools.length > 0
      ? ` - ${prevTools.join(" > ")} > ｢${lastTool}｣`
      : ` - ｢${lastTool}｣`;
  }
  const callCount = task.progress?.toolCalls ?? 0;
  const callsStr = callCount > 0 ? ` 🔧${callCount}` : "";
  const icon = getPhaseIcon(task);
  taskLines.push(
    `${icon} [${task.agent}#${shortId(task.sessionID)}] ${task.description} (${duration})${toolsStr}${callsStr}`
  );
}
```

### Key File: `src/manager/notifications.ts` (lines 131-142) — completed task line formatting
```typescript
for (const task of visibleCompleted) {
  const duration = formatDuration(
    new Date(task.startedAt),
    task.completedAt ? new Date(task.completedAt) : undefined
  );
  const statusIcon = task.status === "completed" ? "✓" : task.status === "error" ? "✗" : "⊘";
  const callCount = task.progress?.toolCalls ?? 0;
  const callsStr = callCount > 0 ? ` 🔧${callCount}` : "";
  taskLines.push(
    `${statusIcon} [${task.agent}#${shortId(task.sessionID)}] ${task.description} (${duration})${callsStr}`
  );
}
```

### Key File: `src/manager/polling.ts` (lines 273-301) — frame advancement logic
```typescript
// Advance streaming frame deterministically from total text output.
if (phase === "streaming") {
  task.progress.streamFrame = Math.floor(totalTextCharCount / STREAM_CHARS_PER_FRAME) % STREAMING_FRAMES.length;
}

// Advance waiting/tool frames by 1 per poll when in those phases
if (phase === "waiting") {
  const waitPollCount = (task.progress._waitPollCount ?? 0) + 1;
  task.progress._waitPollCount = waitPollCount;
  if (waitPollCount >= WAITING_FRAME_INTERVAL) {
    task.progress.waitingFrame = ((task.progress.waitingFrame ?? 0) + 1) % WAITING_FRAMES.length;
    task.progress._waitPollCount = 0;
  }
} else {
  task.progress._waitPollCount = 0;
}
if (phase === "tool") {
  task.progress.toolFrame = ((task.progress.toolFrame ?? 0) + 1) % TOOL_FRAMES.length;
}

// Update all progress fields
task.progress.toolCalls = toolCalls;
task.progress.toolCallsByName = toolCallsByName;
task.progress.lastTools = allTools.slice(-3);
task.progress.lastUpdate = new Date().toISOString();
task.progress.phase = phase;
task.progress.textCharCount = totalTextCharCount;
```

### Key File: `src/manager/polling.ts` (line 16) — polling interval
```typescript
const POLLING_INTERVAL_MS = 100; // 100ms poll cycle drives all animation
```

### Key File: `src/prompts.ts` (lines 247-257) — toast titles
```typescript
export const TOAST_TITLES = {
  taskCompleted: "✓ Task completed",
  taskFailed: "✗ Task failed",
  taskCancelled: "⊘ Task cancelled",
  backgroundTasksRunning: (spinner: string) => {
    const prefix = process.env.OPENCODE_BGAGENT_PREFIX;
    const baseText = "AsyncAgents";
    return prefix ? `⛭ ${prefix} ${baseText}` : `⛭ ${baseText}`;
  },
  tasksComplete: "✓ Tasks complete",
};
```

### Key File: `src/manager/notifications.ts` (line 174) — toast title uses getPhaseIcon
```typescript
const titleIcon = firstRunningTask ? getPhaseIcon(firstRunningTask) : "⏳";
```

---

## Testing Plan (TDD - tests first)

- [ ] **T1**: In existing test file for notifications/polling (or create one), add test: `getPhaseIcon` returns braille spinner + progress bar for streaming phase — verify format `"⠋ ▰▱▱"`
- [ ] **T2**: Add test: `getPhaseIcon` returns braille spinner + progress bar for tool phase — verify format `"⠋ ▰▰▱"` (where progress bar frame matches toolFrame)
- [ ] **T3**: Add test: `getPhaseIcon` returns waiting frames (○/◉) for waiting phase — unchanged behavior
- [ ] **T4**: Add test: completed task icon shows `"✓ ▰▰▰"` for success and `"✗ ▱▱▱"` for error
- [ ] **T5**: Add test: `progressBarFrame` advances by 1 each time phase changes from previous poll (event-driven advancement)
- [ ] **T6**: Add test: `brailleFrame` increments every poll cycle regardless of phase (auto-rotation at poll rate)

## Implementation Plan

### Step 1: Add new constants (`src/constants.ts`)
- [ ] **I1**: Add `BRAILLE_FRAME_INTERVAL = 1` constant (advance every poll = ~100ms, closest to 80ms at poll rate). Note: true 80ms would require a separate timer; using poll-rate (100ms) is acceptable approximation.
- [ ] **I2**: Keep existing `STREAMING_FRAMES`, `TOOL_FRAMES`, `WAITING_FRAMES` arrays unchanged

### Step 2: Update TaskProgress type (`src/types.ts`)
- [ ] **I3**: Add `brailleFrame: number` field to `TaskProgress` interface (auto-rotating spinner index)
- [ ] **I4**: Add `progressBarFrame: number` field to `TaskProgress` interface (event-driven progress bar index)
- [ ] **I5**: Add `_prevPhase?: TaskPhase` field to `TaskProgress` for tracking phase transitions

### Step 3: Update `getPhaseIcon` function (`src/manager/notifications.ts`)
- [ ] **I6**: Rewrite `getPhaseIcon` to return dual-icon string for streaming/tool phases:
  ```typescript
  function getPhaseIcon(task: BackgroundTask): string {
    const phase = task.progress?.phase ?? "waiting";
    if (phase === "waiting") {
      return WAITING_FRAMES[task.progress?.waitingFrame ?? 0] ?? "◌";
    }
    const braille = STREAMING_FRAMES[task.progress?.brailleFrame ?? 0] ?? "⠋";
    const bar = TOOL_FRAMES[task.progress?.progressBarFrame ?? 0] ?? "▰▱▱";
    return `${braille} ${bar}`;
  }
  ```

### Step 4: Update completed task line formatting (`src/manager/notifications.ts`)
- [ ] **I7**: Change completed task `statusIcon` to include progress bar state:
  ```typescript
  const statusIcon = task.status === "completed"
    ? "✓ ▰▰▰"
    : task.status === "error"
      ? "✗ ▱▱▱"
      : "⊘";
  ```

### Step 5: Update frame advancement logic (`src/manager/polling.ts`)
- [ ] **I8**: Add braille frame auto-advance (every poll, all non-waiting phases):
  ```typescript
  if (phase !== "waiting") {
    task.progress.brailleFrame = ((task.progress.brailleFrame ?? 0) + 1) % STREAMING_FRAMES.length;
  }
  ```
- [ ] **I9**: Add progress bar event-driven advance — increment `progressBarFrame` by 1 only when phase changes or a new event occurs (tool count change or text char count change):
  ```typescript
  const prevPhase = task.progress._prevPhase;
  const prevToolCalls = task.progress.toolCalls;
  const prevTextChars = task.progress.textCharCount;
  const hasEvent = phase !== prevPhase || toolCalls !== prevToolCalls || totalTextCharCount !== prevTextChars;
  if (hasEvent && phase !== "waiting") {
    task.progress.progressBarFrame = ((task.progress.progressBarFrame ?? 0) + 1) % TOOL_FRAMES.length;
  }
  task.progress._prevPhase = phase;
  ```
- [ ] **I10**: Keep existing `waitingFrame` advancement logic unchanged (waiting phase still uses ○/◉)
- [ ] **I11**: Remove/skip old `streamFrame` and `toolFrame` advancement blocks (they are replaced by brailleFrame + progressBarFrame)

### Step 6: Update progress initialization (`src/manager/polling.ts`)
- [ ] **I12**: Add `brailleFrame: 0` and `progressBarFrame: 0` to the progress initialization block (lines 259-271)

## Parallelization Plan

### Batch 1 (parallel)
- [ ] **Programmer A** (types + constants): Tasks T1-T6, I1-I2, I3-I5 → files: `src/constants.ts`, `src/types.ts`, test file
- [ ] **Programmer B** (notifications rendering): Tasks I6-I7 → files: `src/manager/notifications.ts`

### Batch 2 (after Batch 1 — depends on new types)
- [ ] **Programmer C** (polling logic): Tasks I8-I12 → files: `src/manager/polling.ts`

### Dependencies
- Batch 2 depends on Batch 1 because `brailleFrame`/`progressBarFrame`/`_prevPhase` fields must exist in `TaskProgress` before polling.ts can reference them.
- Programmer A and B can run in parallel because they touch separate files.
- notifications.ts (B) reads from `task.progress.brailleFrame` etc, but TypeScript won't error until polling.ts actually sets them — the fields are optional reads with `?? 0` fallbacks.

### Risk Areas
- **Import alignment**: `notifications.ts` already imports `STREAMING_FRAMES`, `TOOL_FRAMES` — no new imports needed there.
- **Frame counter naming**: `brailleFrame` and `progressBarFrame` are new fields; old `streamFrame`/`toolFrame` can be kept for backward compat but should not be advanced anymore.
- **Toast title icon**: Line 174 uses `getPhaseIcon(firstRunningTask)` for toast title — the dual-icon string (e.g., `⠹ ▰▱▱`) may be too wide for the title. Consider keeping title icon as just the braille spinner. Programmer B should handle this.

## Done Criteria
- [ ] All tests pass (`npm run build` or test runner)
- [ ] Running tasks show `⠹ ▰▱▱ [agent#id] description` format
- [ ] Waiting tasks show `○ [agent#id] description` (unchanged)
- [ ] Completed tasks show `✓ ▰▰▰ [agent#id] description` or `✗ ▱▱▱ [agent#id] description`
- [ ] Braille spinner auto-rotates every ~100ms poll cycle
- [ ] Progress bar advances only on streaming/tool state change events
- [ ] No TypeScript compilation errors