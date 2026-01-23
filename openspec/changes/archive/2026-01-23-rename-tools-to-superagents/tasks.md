# Tasks: Rename background_* Tools to superagents_*

## 1. Update Tool Export Keys (src/index.ts)
- [x] 1.1 Change `background_task:` key to `superagents_task:`
- [x] 1.2 Change `background_output:` key to `superagents_output:`
- [x] 1.3 Change `background_cancel:` key to `superagents_cancel:`
- [x] 1.4 Change `background_list:` key to `superagents_list:`
- [x] 1.5 Change `background_clear:` key to `superagents_clear:`

## 2. Update Tool Blacklist (src/manager/task-lifecycle.ts)
- [x] 2.1 Change `background_task` to `superagents_task` in tools object
- [x] 2.2 Change `background_output` to `superagents_output` in tools object
- [x] 2.3 Change `background_cancel` to `superagents_cancel` in tools object
- [x] 2.4 Change `background_list` to `superagents_list` in tools object
- [x] 2.5 Change `background_clear` to `superagents_clear` in tools object

## 3. Update User-Facing Text (src/prompts.ts)
- [x] 3.1 Update `background_output` references in TOOL_DESCRIPTIONS to `superagents_output`
- [x] 3.2 Update `background_list` reference in ERROR_MESSAGES to `superagents_list`
- [x] 3.3 Update `background_task` reference in ERROR_MESSAGES to `superagents_task`
- [x] 3.4 Update `background_output` references in NOTIFICATION_MESSAGES to `superagents_output`
- [x] 3.5 Update "Background Agents" text in TOAST_TITLES to "Superagents"

## 4. Update Tests (src/index.test.ts)
- [x] 4.1 Update tool property checks from `background_*` to `superagents_*`
- [x] 4.2 Update describe block names

## 5. Update Documentation
- [x] 5.1 Update README.md tool names
- [x] 5.2 Add breaking change to CHANGELOG.md

## 6. Rename OpenSpec Capability
- [x] 6.1 Rename `openspec/specs/background-task/` directory to `openspec/specs/superagents-task/`
- [x] 6.2 Update spec.md title and tool references

## 7. Verification
- [x] 7.1 Run `npm run build` - ensure no errors
- [x] 7.2 Run `npm test` - ensure all tests pass
- [x] 7.3 Run `openspec validate --strict`
