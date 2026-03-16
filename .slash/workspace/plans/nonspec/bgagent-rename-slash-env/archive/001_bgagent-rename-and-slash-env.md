---
created: 2026-03-16T11:00:00Z
last_updated: 2026-03-16T11:00:00Z
type: nonspec
plan_number: 1
status: pending
trigger: "Rename asyncagents_* tools to bgagent_* and add ASYNCAGENTS_CLIENT=SLASH env var for SlashAgents title"
depends_on: none
next: TBD
---

# Plan: Rename asyncagents_* → bgagent_* + ASYNCAGENTS_CLIENT env var

## Background & Research

### Change 1: ASYNCAGENTS_CLIENT env var for toast title
File: `src/prompts.ts` lines 247-257 — TOAST_TITLES:
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
**Goal**: When `ASYNCAGENTS_CLIENT=SLASH`, show `⛭ SlashAgents` instead of `⛭ AsyncAgents`.
**Env var pattern** used in codebase: `process.env.VAR_NAME` with direct string comparison.

### Change 2: Tool name rename asyncagents_* → bgagent_*

**Registry (src/index.ts lines 38-44)**:
```typescript
  return {
    tool: {
      asyncagents_task: createBackgroundTask(manager),
      asyncagents_output: createBackgroundOutput(manager),
      asyncagents_cancel: createBackgroundCancel(manager),
      asyncagents_list: createBackgroundList(manager),
      asyncagents_clear: createBackgroundClear(manager),
    },
```

**Tool blocklist (src/manager/task-lifecycle.ts lines 157-168)**:
```typescript
  // Fetch agent config to check for explicit asyncagents tool overrides.
  // Default: all asyncagents tools are blocked for spawned agents.
  // Override: if the agent's config explicitly sets an asyncagents tool to true, honor it.
  const configResult = await client.config.get();
  const agentToolConfig = configResult.data?.agent?.[input.agent]?.tools ?? {};
  const asyncagentsToolOverrides = {
    asyncagents_task: agentToolConfig["asyncagents_task"] === true,
    asyncagents_output: agentToolConfig["asyncagents_output"] === true,
    asyncagents_cancel: agentToolConfig["asyncagents_cancel"] === true,
    asyncagents_list: agentToolConfig["asyncagents_list"] === true,
    asyncagents_clear: agentToolConfig["asyncagents_clear"] === true,
  };
```

**Prompt references in src/prompts.ts**:
```typescript
// Line 32 (TOOL_DESCRIPTIONS.backgroundTask):
Optionally use `asyncagents_output` later if you need to check results manually with or without blocking.`,

// Line 117 (ERROR_MESSAGES):
  `Task not found: ${taskId}. Use asyncagents_list to see available tasks.`,

// Line 125 (ERROR_MESSAGES):
    "Session expired or was deleted. Start a new asyncagents_task to continue.",

// Lines 227-240 (SYSTEM_HINT_MESSAGES):
  `If you need results immediately, use asyncagents_output(task_id="${taskId}").`, 
  `Use asyncagents_output tools to see agent responses.`,
  `Use asyncagents_output(task_id="${taskId}") for details.`,
  `Use asyncagents_output(task_id="${taskId}") for full response.`,
```

**Server env vars (src/server/index.ts)**:
```typescript
// Lines 38, 49, 52, 201:
process.env.ASYNCAGENTS_API_ENABLED
process.env.ASYNCAGENTS_API_PORT
process.env.ASYNCAGENTS_API_HOST
```
**Note**: Server env vars (`ASYNCAGENTS_API_*`) should also be renamed to `BGAGENT_API_*` for consistency.

**Server tests (src/server/__tests__/server.test.ts, integration.test.ts)**:
Multiple references to `ASYNCAGENTS_API_ENABLED`, `ASYNCAGENTS_API_PORT`, `ASYNCAGENTS_API_HOST`.

---

## Testing Plan (TDD - tests first)

- [ ] **T1**: In `src/manager/__tests__/` or existing test, add test: `TOAST_TITLES.backgroundTasksRunning` returns `⛭ SlashAgents` when `process.env.ASYNCAGENTS_CLIENT === "SLASH"`
- [ ] **T2**: Add test: `TOAST_TITLES.backgroundTasksRunning` returns `⛭ AsyncAgents` when `ASYNCAGENTS_CLIENT` is unset
- [ ] **T3**: Add test: `TOAST_TITLES.backgroundTasksRunning` returns `⛭ [prefix] SlashAgents` when both `ASYNCAGENTS_CLIENT=SLASH` and `OPENCODE_BGAGENT_PREFIX` are set
- [ ] **T4**: Verify server env var tests pass after rename to `BGAGENT_API_*` (update existing tests in `src/server/__tests__/server.test.ts` and `integration.test.ts`)

## Implementation Plan

### Step 1: Update TOAST_TITLES for ASYNCAGENTS_CLIENT env var (`src/prompts.ts`)
- [ ] **I1**: Modify `backgroundTasksRunning` function to check `process.env.ASYNCAGENTS_CLIENT`:
  ```typescript
  backgroundTasksRunning: (spinner: string) => {
    const prefix = process.env.OPENCODE_BGAGENT_PREFIX;
    const client = process.env.ASYNCAGENTS_CLIENT;
    const baseText = client === "SLASH" ? "SlashAgents" : "AsyncAgents";
    return prefix ? `⛭ ${prefix} ${baseText}` : `⛭ ${baseText}`;
  },
  ```

### Step 2: Rename tool keys in registry (`src/index.ts`)
- [ ] **I2**: Rename all 5 tool keys from `asyncagents_*` to `bgagent_*`:
  ```typescript
    tool: {
      bgagent_task: createBackgroundTask(manager),
      bgagent_output: createBackgroundOutput(manager),
      bgagent_cancel: createBackgroundCancel(manager),
      bgagent_list: createBackgroundList(manager),
      bgagent_clear: createBackgroundClear(manager),
    },
  ```

### Step 3: Rename tool blocklist (`src/manager/task-lifecycle.ts`)
- [ ] **I3**: Update variable name and all 5 key references from `asyncagents_*` to `bgagent_*`:
  ```typescript
  // Fetch agent config to check for explicit bgagent tool overrides.
  // Default: all bgagent tools are blocked for spawned agents.
  // Override: if the agent's config explicitly sets a bgagent tool to true, honor it.
  const configResult = await client.config.get();
  const agentToolConfig = configResult.data?.agent?.[input.agent]?.tools ?? {};
  const bgagentToolOverrides = {
    bgagent_task: agentToolConfig["bgagent_task"] === true,
    bgagent_output: agentToolConfig["bgagent_output"] === true,
    bgagent_cancel: agentToolConfig["bgagent_cancel"] === true,
    bgagent_list: agentToolConfig["bgagent_list"] === true,
    bgagent_clear: agentToolConfig["bgagent_clear"] === true,
  };
  ```
- [ ] **I3b**: Also update any other references to `asyncagentsToolOverrides` variable name further in the file (grep for usage after line 168)

### Step 4: Rename all prompt text references (`src/prompts.ts`)
- [ ] **I4**: Replace all `asyncagents_output` → `bgagent_output` in text strings (lines 32, 227, 233, 237, 240)
- [ ] **I5**: Replace `asyncagents_list` → `bgagent_list` (line 117)
- [ ] **I6**: Replace `asyncagents_task` → `bgagent_task` (line 125)

### Step 5: Rename server env vars (`src/server/index.ts`)
- [ ] **I7**: Replace `ASYNCAGENTS_API_ENABLED` → `BGAGENT_API_ENABLED` (line 38)
- [ ] **I8**: Replace `ASYNCAGENTS_API_PORT` → `BGAGENT_API_PORT` (line 49)
- [ ] **I9**: Replace `ASYNCAGENTS_API_HOST` → `BGAGENT_API_HOST` (lines 52, 201)

### Step 6: Update server tests
- [ ] **I10**: In `src/server/__tests__/server.test.ts`: replace all `ASYNCAGENTS_API_*` → `BGAGENT_API_*` (lines 26-28, 39-55, 114, 134-135, 143, 160)
- [ ] **I11**: In `src/server/__tests__/integration.test.ts`: replace all `ASYNCAGENTS_API_*` → `BGAGENT_API_*` (lines 165-166, 177-178)

## Parallelization Plan

### Batch 1 (parallel — all files are distinct)
- [ ] **Coder A**: Tasks T1-T3, I1, I4-I6 → files: `src/prompts.ts`
- [ ] **Coder B**: Tasks I2 → files: `src/index.ts`
- [ ] **Coder C**: Tasks I3, I3b → files: `src/manager/task-lifecycle.ts`
- [ ] **Coder D**: Tasks T4, I7-I11 → files: `src/server/index.ts`, `src/server/__tests__/server.test.ts`, `src/server/__tests__/integration.test.ts`

### Dependencies
- All 4 coders touch completely separate files — no ordering needed.
- This batch can run in parallel with the toast-animation-rework Batch 2 (polling.ts) since files don't overlap.

### Risk Areas
- **Config file references**: Users' `opencode.json` or agent configs may reference `asyncagents_*` tool names. This is a breaking change — document in CHANGELOG.
- **Prompt downstream consumers**: External prompt files (`.Claude/` etc.) referencing `asyncagents_*` tool names will need updates. Coder A should grep for these after main changes.
- **Variable name `asyncagentsToolOverrides`**: Renamed to `bgagentToolOverrides` — ensure all downstream usage in task-lifecycle.ts is also updated.

## Done Criteria
- [ ] `ASYNCAGENTS_CLIENT=SLASH` shows `⛭ SlashAgents` in toast title
- [ ] Unset `ASYNCAGENTS_CLIENT` shows `⛭ AsyncAgents` (backward compat)
- [ ] All 5 tools registered as `bgagent_*` in index.ts
- [ ] All prompt text references updated to `bgagent_*`
- [ ] Server env vars renamed to `BGAGENT_API_*`
- [ ] All server tests pass with new env var names
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] No remaining references to `asyncagents_task`, `asyncagents_output`, `asyncagents_list`, `asyncagents_cancel`, `asyncagents_clear` in src/ (except CHANGELOG)