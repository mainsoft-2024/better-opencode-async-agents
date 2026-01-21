# Tasks: Modularize Codebase

## 1. Setup New File Structure
- [x] 1.1 Create `src/types.ts` with all type definitions
- [x] 1.2 Create `src/constants.ts` with constants
- [x] 1.3 Create `src/helpers.ts` with formatting utilities
- [x] 1.4 Create `src/manager/` directory
- [x] 1.5 Create `src/tools/` directory

## 2. Split BackgroundManager Class
- [x] 2.1 Create `src/manager/index.ts` with class shell and constructor
- [x] 2.2 Extract task lifecycle methods to `src/manager/task-lifecycle.ts`
- [x] 2.3 Extract polling logic to `src/manager/polling.ts`
- [x] 2.4 Extract notification methods to `src/manager/notifications.ts`
- [x] 2.5 Extract event handling to `src/manager/events.ts`
- [x] 2.6 Wire up imports in manager/index.ts

## 3. Split Tool Factories
- [x] 3.1 Create `src/tools/task.ts` with createBackgroundTask
- [x] 3.2 Create `src/tools/output.ts` with createBackgroundOutput
- [x] 3.3 Create `src/tools/cancel.ts` with createBackgroundCancel
- [x] 3.4 Create `src/tools/resume.ts` with createBackgroundResume
- [x] 3.5 Create `src/tools/list.ts` with createBackgroundList
- [x] 3.6 Create `src/tools/clear.ts` with createBackgroundClear
- [x] 3.7 Create `src/tools/index.ts` barrel export

## 4. Update Plugin Entry Point
- [x] 4.1 Refactor `src/index.ts` to import from new modules
- [x] 4.2 Re-export types for consumers
- [x] 4.3 Verify plugin function signature unchanged

## 5. Update Build Configuration
- [x] 5.1 Update build script to add `--minify` flag
- [x] 5.2 Update build script to add `--sourcemap linked` flag
- [x] 5.3 Update `tsconfig.json` for multi-file declaration output (already configured)
- [x] 5.4 Verify single-file bundle output still works

## 6. Migrate Tests
- [x] 6.1 Create `src/manager/__tests__/` directory
- [x] 6.2 Create `src/tools/__tests__/` directory
- [x] 6.3 Split existing tests by module (kept integration tests, added unit tests)
- [x] 6.4 Add unit tests for individual modules (helpers.test.ts, task-lifecycle.test.ts, factories.test.ts)
- [x] 6.5 Keep integration test in `src/index.test.ts` (existing tests pass)

## 7. Validation
- [x] 7.1 Run `bun run typecheck` - no errors
- [x] 7.2 Run `bun run lint` - minor pre-existing style issues only
- [x] 7.3 Run `bun test` - all 45 tests pass (4 test files)
- [x] 7.4 Run `bun run build` - single file output (261KB minified)
- [x] 7.5 Verify bundle size reduced with minification (42% reduction: 446KB → 261KB)
- [x] 7.6 Test plugin works in OpenCode (tested - fixed export bug in v0.1.3)

## 8. Cleanup
- [x] 8.1 Remove any dead code from original index.ts (replaced entirely)
- [x] 8.2 Update imports in any remaining files
- [x] 8.3 Final review of file sizes (largest: 277 lines - acceptable for manager modules)

## Dependencies

- Task 1 must complete before Tasks 2-4
- Tasks 2, 3 can run in parallel after Task 1
- Task 4 depends on Tasks 2, 3
- Task 5 can run in parallel with Tasks 2-4
- Task 6 depends on Tasks 2-4
- Task 7 depends on all previous tasks
- Task 8 runs after Task 7 passes

## Notes

- Task 6 (test migration) COMPLETE - added unit tests for helpers, manager task-lifecycle, and tool factories
- Task 7.6 (OpenCode integration test) deferred to manual testing in production environment
- File sizes: 4 files exceed 200 lines (215-277) but this is acceptable for manager core modules
- Test coverage: 45 tests across 4 test files (9 integration + 36 unit tests)
