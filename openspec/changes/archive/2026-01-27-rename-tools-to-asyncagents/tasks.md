# Tasks: Rename superagents_* Tools to asyncagents_*

## 1. Update Tool Export Keys (src/index.ts)
- [x] 1.1 Change `superagents_task:` key to `asyncagents_task:`
- [x] 1.2 Change `superagents_output:` key to `asyncagents_output:`
- [x] 1.3 Change `superagents_cancel:` key to `asyncagents_cancel:`
- [x] 1.4 Change `superagents_list:` key to `asyncagents_list:`
- [x] 1.5 Change `superagents_clear:` key to `asyncagents_clear:`

## 2. Update Tool Blacklist (src/manager/task-lifecycle.ts)
- [x] 2.1 Change `superagents_task` to `asyncagents_task` in tools object
- [x] 2.2 Change `superagents_output` to `asyncagents_output` in tools object
- [x] 2.3 Change `superagents_cancel` to `asyncagents_cancel` in tools object
- [x] 2.4 Change `superagents_list` to `asyncagents_list` in tools object
- [x] 2.5 Change `superagents_clear` to `asyncagents_clear` in tools object

## 3. Update User-Facing Text (src/prompts.ts)
- [x] 3.1 Update `superagents_output` references in TOOL_DESCRIPTIONS to `asyncagents_output`
- [x] 3.2 Update `superagents_list` reference in ERROR_MESSAGES to `asyncagents_list`
- [x] 3.3 Update `superagents_task` reference in ERROR_MESSAGES to `asyncagents_task`
- [x] 3.4 Update `superagents_output` references in SYSTEM_HINT_MESSAGES to `asyncagents_output`
- [x] 3.5 Update "Superagents" text in TOAST_TITLES to "AsyncAgents"

## 4. Update Tests (src/index.test.ts)
- [x] 4.1 Update tool property checks from `superagents_*` to `asyncagents_*`
- [x] 4.2 Update describe block names from `superagents_*` to `asyncagents_*`

## 5. Update Documentation
- [x] 5.1 Update README.md tool names in table
- [x] 5.2 Remove non-existent `superagents_resume` from README.md tool table
- [x] 5.3 Add breaking change entry to CHANGELOG.md under [Unreleased]

## 6. Rename OpenSpec Capability
- [x] 6.1 Rename `openspec/specs/superagents-task/` directory to `openspec/specs/asyncagents-task/`
- [x] 6.2 Update spec.md title from "superagents-task" to "asyncagents-task"
- [x] 6.3 Update all `superagents_*` tool references in spec.md to `asyncagents_*`

## 7. Verification
- [x] 7.1 Run `npm run build` - ensure no TypeScript errors
- [x] 7.2 Run `npm test` - ensure all tests pass
- [x] 7.3 Run `openspec validate rename-tools-to-asyncagents --strict` - ensure spec is valid
- [x] 7.4 Verify no remaining `superagents_` references in source files (except archives/changelog history)
