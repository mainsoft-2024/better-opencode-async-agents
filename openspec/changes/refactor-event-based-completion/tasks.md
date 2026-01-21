# Tasks: Event-Based Completion Detection Refactor

## 1. Event-Based Completion Detection

- [ ] 1.1 Update `src/manager/events.ts` to call `notifyParentSession` when `session.idle` event is received
- [ ] 1.2 Add callback parameter to `handleEvent` for `notifyParentSession`
- [ ] 1.3 Update `src/manager/index.ts` to pass `notifyParentSession` callback to event handler
- [ ] 1.4 Test: Verify task completion is detected via events and notification is sent

## 2. Implement background_block Tool

- [ ] 2.1 Create `src/tools/block.ts` with new `background_block` tool definition
- [ ] 2.2 Implement blocking logic: wait until all specified task_ids complete or timeout
- [ ] 2.3 Filter out already-completed tasks before blocking
- [ ] 2.4 Return status summary of all specified tasks
- [ ] 2.5 Register tool in `src/index.ts`
- [ ] 2.6 Export tool creator from `src/tools/index.ts`
- [ ] 2.7 Add manager method for blocking wait: `waitForTasks(taskIds, timeout)`
- [ ] 2.8 Test: Verify blocking behavior with multiple tasks

## 3. Modify background_output (Remove Blocking)

- [ ] 3.1 Remove `block` parameter from `src/tools/output.ts`
- [ ] 3.2 Remove blocking loop logic from output tool
- [ ] 3.3 Simplify to status-only tool (returns current status/result)
- [ ] 3.4 Update tool description to reflect non-blocking behavior
- [ ] 3.5 Test: Verify status-only behavior

## 4. Modify background_resume (Notification-Based)

- [ ] 4.1 Remove `block` parameter from `src/tools/resume.ts`
- [ ] 4.2 Remove blocking logic, make all resumes async (notification-based)
- [ ] 4.3 Set task status to "resumed" during processing
- [ ] 4.4 Send notification via existing mechanism when resume completes
- [ ] 4.5 Ensure compatibility with `background_block` (task can be waited on after resume)
- [ ] 4.6 Update tool description
- [ ] 4.7 Test: Verify notification-based resume flow

## 5. Reduce Polling to Fallback

- [ ] 5.1 Increase polling interval in `src/manager/polling.ts` (e.g., 2000ms → 5000ms)
- [ ] 5.2 Add comment documenting polling as fallback mechanism
- [ ] 5.3 Ensure polling still triggers `notifyParentSession` if event was missed
- [ ] 5.4 Test: Verify fallback works when events are disabled/missed

## 6. Update Tests

- [ ] 6.1 Add tests for `background_block` tool
- [ ] 6.2 Update tests for `background_output` (remove blocking tests)
- [ ] 6.3 Update tests for `background_resume` (notification-based)
- [ ] 6.4 Add integration test for event-based completion flow
- [ ] 6.5 Run full test suite and fix any failures

## 7. Documentation & Cleanup

- [ ] 7.1 Update tool descriptions in all affected tools
- [ ] 7.2 Update AGENTS.md if needed
- [ ] 7.3 Build and verify no TypeScript errors
- [ ] 7.4 Manual testing of full workflow
