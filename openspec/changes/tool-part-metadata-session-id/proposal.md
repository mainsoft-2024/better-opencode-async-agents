# Proposal: tool-part-metadata-session-id

## Change ID
`tool-part-metadata-session-id`

## Problem Statement

When the `bgagent_task` tool launches a background sub-agent, the tool result is currently returned as a plain string (e.g. `"Background task launched: abc123"`). OpenCode emits a `ToolPart` with `type: "tool"`, `state: { output: "...", metadata: {} }`. The client-side `TaskRenderer` (in the workspace app) has no reliable way to map a tool part to its spawned child session ID — it cannot disambiguate parallel task calls from the same parent.

The root cause: the launch handler in `src/tools/task.ts` returns only a string, and the OpenCode plugin framework has no mechanism to attach `sessionId` to the tool part's `metadata` field at emission time via the `execute()` return value.

## Goals

1. Emit `metadata.sessionId` (plus `agent` and `parentAgent`) from the `bgagent_task` tool so OpenCode attaches it to the emitted `ToolPart.state.metadata`.
2. Enable client-side disambiguation of parallel task calls in `TaskRenderer`.
3. Enable nested sub-agent tree display in the workspace viewer modal.

## Non-Goals

- Changing the error return path (errors remain plain strings).
- Changing any other tool's return shape.
- Modifying the client-side store or renderer (those are downstream).

## User Stories

### Story: Disambiguate Parallel Task Calls

As the workspace viewer rendering parallel `bgagent_task` calls,
I want each tool part's `state.metadata.sessionId` to contain the spawned session ID,
So that I can render a correct sub-session view for each call without guessing.

**Acceptance Criteria:**
- `bgagent_task(execute)` returns `{ title, metadata: { sessionId, agent, parentAgent }, output }` on success.
- `metadata.sessionId` equals the `sessionID` field of the `BackgroundTask` returned by `TaskManager.launch()`.
- The error path returns a plain string (unchanged).
- OpenCode's `tool.execute.after` hook receives `metadata` containing the sessionId.

## Success Metrics

1. Unit tests pass asserting the new return shape.
2. `grep -c 'sessionId' dist/index.js` shows > 0 after build.
3. Downstream client `TaskRenderer` can read `state.metadata.sessionId` directly.

## Constraints

- The `@opencode-ai/plugin` `tool()` function signature requires `execute()` to return `Promise<string>`. However, the plugin framework also exposes a `context.metadata({ title, metadata })` API that can be called during execution to attach arbitrary key-value pairs to the tool part. Our implementation decision: use the `context.metadata()` API to set `sessionId` rather than changing the `execute()` return type, since that keeps the return type as `string` and is the idiomatic OpenCode pattern.

  **Revised decision:** The `execute()` return type is declared as `Promise<string>`, but looking at the actual OpenCode plugin hook `tool.execute.after` at `index.d.ts:158-166`, it receives `{ title, output, metadata }` where `metadata` is any. This suggests OpenCode itself may be enriching tool part metadata post-execution, or plugins may use `context.metadata()`. The simplest correct approach that is backwards-compatible: have `handleLaunchMode` return an object `{ title, metadata, output }` and use the `toolContext.metadata()` API to set metadata, while the execute function itself continues to return `string` for the output field. However, since `execute()` must return `string`, we use the `context.metadata()` side-effect API to attach the sessionId before returning.

  Actually, re-reading the code: `tool.execute.after` shows metadata is passed through. The `context.metadata()` API is available. So our implementation: call `toolContext.metadata({ title: ..., metadata: { sessionId, agent, parentAgent } })` inside `handleLaunchMode`, then return the plain string `SUCCESS_MESSAGES.taskLaunched(displayId)` — this is the cleanest path that uses the official API and avoids any type changes to `execute()`.

  Wait, looking again at the design note in the plan: "OpenCode plugin tool framework accepts either `string` or `{ title?, metadata?, output }` from `execute()`". But the type says `Promise<string>`. Let me just implement with `context.metadata()` side-effect + string return to be safe and idiomatic.

  Final decision (per plan spec): change `handleLaunchMode` to return `{ title, metadata, output }` as an object. If TypeScript or runtime rejects this shape, fall back to calling `toolContext.metadata()` side-effect and returning a string. Document the chosen path in design.md.

## Scope Boundaries

**Included:**
- `src/tools/task.ts`: `handleLaunchMode` success return shape
- `src/types.ts`: any type updates needed
- `src/tools/__tests__/task.metadata.test.ts`: unit tests

**Not included:**
- No changes to `bgagent_output`, `bgagent_cancel`, `bgagent_list`, or any other tool.
- No changes to the server, SSE, or manager.