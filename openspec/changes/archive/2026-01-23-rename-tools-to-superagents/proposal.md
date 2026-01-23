# Change: Rename background_* Tools to superagents_*

## Why
The project is being rebranded from "opencode-background-agent" to "opencode-superagents". Tool names exposed to plugin SDK users should align with the new branding.

## What Changes
- **BREAKING** Rename `background_task` tool to `superagents_task`
- **BREAKING** Rename `background_output` tool to `superagents_output`
- **BREAKING** Rename `background_cancel` tool to `superagents_cancel`
- **BREAKING** Rename `background_list` tool to `superagents_list`
- **BREAKING** Rename `background_clear` tool to `superagents_clear`
- Update user-facing text references (prompts, messages, docs)
- Update specs to reference new tool names

**Note**: Internal function names (e.g., `createBackgroundTask`) remain unchanged.

## Impact
- Affected specs: `background-task` (renamed to `superagents-task`)
- Affected code: `src/index.ts` (tool export keys), `src/prompts.ts` (user-facing text), `src/manager/task-lifecycle.ts` (tool blacklist)
- Affected docs: `README.md`, `CHANGELOG.md`
- Affected tests: `src/index.test.ts`

## Migration Path
Users must update all tool invocations from `background_*` to `superagents_*`:

| Old Tool Name | New Tool Name |
|---------------|---------------|
| `background_task` | `superagents_task` |
| `background_output` | `superagents_output` |
| `background_cancel` | `superagents_cancel` |
| `background_list` | `superagents_list` |
| `background_clear` | `superagents_clear` |
