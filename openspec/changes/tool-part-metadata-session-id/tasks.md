# Tasks: tool-part-metadata-session-id

## 1.1 Write Failing Unit Tests

- [ ] Create `src/tools/__tests__/task.metadata.test.ts`
- [ ] TU-1.1: Mock `TaskManager.launch` to return `{ sessionID: 'sess_child_1', ... }`; call `bgagent_task` tool's `execute` in launch mode; assert return is an object with `metadata.sessionId === 'sess_child_1'`, `metadata.agent === '<input agent>'`, `output` containing the display id string, `title` containing agent and description.
- [ ] TU-1.2: Two sequential calls with distinct mocked `sessionID`s produce two distinct `metadata.sessionId` values.
- [ ] TU-1.3: Verify `bun test src/tools/__tests__/task.metadata.test.ts` **fails** against current code (plain-string return regression).

## 1.2 Implement handleLaunchMode Return Shape

- [ ] Modify `src/tools/task.ts` `handleLaunchMode` (lines ~138-142)
- [ ] Change success return from `return SUCCESS_MESSAGES.taskLaunched(displayId)` to:
  ```typescript
  return {
    title: `${args.agent.trim()}: ${args.description}`,
    metadata: { sessionId: task.sessionID, agent: args.agent.trim(), parentAgent: toolContext.agent },
    output: SUCCESS_MESSAGES.taskLaunched(displayId),
  };
  ```
- [ ] Error path unchanged (plain string).
- [ ] Run `tsc --noEmit` to verify no type errors; if errors, fall back to `context.metadata()` side-effect approach documented in design.md.

## 1.3 Verify Tests Pass

- [ ] Run `bun test src/tools/__tests__/task.metadata.test.ts` — must **pass**.
- [ ] Run full test suite: `bun test` — no regressions.

## 1.4 Build and Commit

- [ ] Run `bun run build` at repo root.
- [ ] `grep -c 'sessionId' dist/index.js` to verify new emission path is present.
- [ ] `git add src/tools/task.ts src/tools/__tests__/task.metadata.test.ts src/types.ts openspec/changes/tool-part-metadata-session-id dist/index.js`
- [ ] `git commit -m "feat: emit sessionId in bgagent_task tool part metadata"`
- [ ] Capture commit SHA for downstream vendor-sync task.