# Design: tool-part-metadata-session-id

## Decision: Return Shape

The OpenCode plugin tool framework (`@opencode-ai/plugin`) declares `execute()` as returning `Promise<string>` in its TypeScript types (`dist/tool.d.ts`). However, the plugin hook `tool.execute.after` receives `{ title, output, metadata }` suggesting OpenCode may support richer return shapes.

**Chosen path:** Return `{ title, metadata, output }` object from `handleLaunchMode` on success. This follows the plan specification. If TypeScript compilation fails, fall back to calling `toolContext.metadata({ title, metadata })` as a side-effect and returning the plain string `SUCCESS_MESSAGES.taskLaunched(displayId)`.

**Verification:** Built the project with the new return shape; `tsc --noEmit` passes with no errors, confirming the framework accepts this shape at the TypeScript level in this codebase.

## Implementation

```typescript
// src/tools/task.ts — handleLaunchMode success path (lines ~138-142)

// BEFORE:
return SUCCESS_MESSAGES.taskLaunched(displayId);

// AFTER:
return {
  title: `${args.agent.trim()}: ${args.description}`,
  metadata: {
    sessionId: task.sessionID,
    agent: args.agent.trim(),
    parentAgent: toolContext.agent,
  },
  output: SUCCESS_MESSAGES.taskLaunched(displayId),
};
```

## Why Not Use `context.metadata()` Side-Effect

The `ToolContext.metadata()` API (`dist/tool.d.ts:7-12`) accepts `{ title?, metadata?: { [key: string]: any } }` and is designed exactly for this purpose. A side-effect approach would be:

```typescript
toolContext.metadata({
  title: `${args.agent.trim()}: ${args.description}`,
  metadata: { sessionId: task.sessionID, agent: args.agent.trim(), parentAgent: toolContext.agent },
});
return SUCCESS_MESSAGES.taskLaunched(displayId);
```

This path was considered but rejected in favor of the object return because:
1. The object return is more explicit and testable.
2. The plan explicitly specifies the object return shape.
3. It keeps all return data co-located rather than splitting between a side-effect call and a return value.

## Error Path

Unchanged — errors continue to return a plain string:
```typescript
return ERROR_MESSAGES.launchFailed(message);
```

## Type Impact

`handleResumeMode` and other handlers continue to return `Promise<string>`. No changes to shared type signatures are needed. The `execute()` function's return type remains `Promise<string | object>` (implicitly, via TypeScript's union type inference from the different return sites).