# Change: Rename superagents_* Tools to asyncagents_*

## Why
도구 이름을 `superagents_*`에서 `asyncagents_*`로 변경하여 패키지 이름(`better-opencode-async-agents`)과 일관성을 유지하고, 도구의 비동기(async) 특성을 더 명확하게 표현합니다.

## What Changes
- **BREAKING** Rename `superagents_task` tool to `asyncagents_task`
- **BREAKING** Rename `superagents_output` tool to `asyncagents_output`
- **BREAKING** Rename `superagents_cancel` tool to `asyncagents_cancel`
- **BREAKING** Rename `superagents_list` tool to `asyncagents_list`
- **BREAKING** Rename `superagents_clear` tool to `asyncagents_clear`
- Update user-facing text: "Superagents" → "AsyncAgents" in toast titles
- Update all spec references from `superagents_*` to `asyncagents_*`
- Fix README.md documentation error (remove non-existent `superagents_resume` tool)
- Rename OpenSpec capability directory: `superagents-task` → `asyncagents-task`

**Note**: Internal function names (e.g., `createBackgroundTask`, `BackgroundManager`) remain unchanged, consistent with the previous rename approach.

## Impact
- Affected specs: `superagents-task` (renamed to `asyncagents-task`)
- Affected code:
  - `src/index.ts` (tool export keys)
  - `src/prompts.ts` (user-facing text: "Superagents" → "AsyncAgents", tool references)
  - `src/manager/task-lifecycle.ts` (tool blacklist)
- Affected docs:
  - `README.md` (tool names table, remove `superagents_resume`)
  - `CHANGELOG.md` (add breaking change entry)
- Affected tests:
  - `src/index.test.ts` (tool property checks, describe block names)

## Migration Path
Users must update all tool invocations from `superagents_*` to `asyncagents_*`:

| Old Tool Name | New Tool Name |
|---------------|---------------|
| `superagents_task` | `asyncagents_task` |
| `superagents_output` | `asyncagents_output` |
| `superagents_cancel` | `asyncagents_cancel` |
| `superagents_list` | `asyncagents_list` |
| `superagents_clear` | `asyncagents_clear` |

## Rationale
1. **Consistency**: Package name already uses "async-agents"
2. **Clarity**: "async" clearly describes the non-blocking nature of tasks
3. **Simplicity**: Single naming convention throughout the project
