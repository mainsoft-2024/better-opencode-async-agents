# Tasks: Add background_resume Tool

## 1. Type System Updates
- [x] 1.1 Add "resumed" to BackgroundTaskStatus type union
- [x] 1.2 Add `resumeCount: number` field to BackgroundTask interface
- [x] 1.3 Initialize `resumeCount: 0` in task creation (launch method)

## 2. Remove Session Expiration
- [x] 2.1 Remove `RESULT_RETENTION_DURATION` constant (30 min timer)
- [x] 2.2 Remove expiration logic from `pollRunningTasks` method
- [x] 2.3 Update cleanup to only remove tasks on explicit clear or session end

## 3. Implement background_resume Tool
- [x] 3.1 Create `createBackgroundResume(manager)` factory function
- [x] 3.2 Define tool schema: task_id (required), message (required), block (optional), timeout (optional)
- [x] 3.3 Implement validation: task exists, status is "completed"
- [x] 3.4 Implement concurrent resume check (reject if status is "resumed")
- [x] 3.5 Implement session validation (check session still exists)
- [x] 3.6 Update task status to "resumed" before sending prompt
- [x] 3.7 Increment `resumeCount` on resume
- [x] 3.8 Send follow-up prompt via `client.session.prompt` or `promptAsync`
- [x] 3.9 Implement blocking mode with configurable timeout
- [x] 3.10 Implement async mode (return immediately, notify on completion)
- [x] 3.11 Format and return only the new response (not full history)
- [x] 3.12 Restore status to "completed" after response received

## 4. Notification Behavior Fix
- [x] 4.1 Add `blockMode` tracking to identify blocking vs async calls
- [x] 4.2 Modify `notifyParentSession` to skip notification when blocking
- [x] 4.3 Apply fix to background_resume notifications
- [x] 4.4 Apply same fix to background_output (if applicable)

## 5. Register New Tool
- [x] 5.1 Add `background_resume: createBackgroundResume(manager)` to plugin exports
- [x] 5.2 Update README.md with new tool documentation

## 6. Testing
- [x] 6.1 Add unit test: background_resume tool exists in plugin exports
- [x] 6.2 Add test: resume completed task succeeds
- [x] 6.3 Add test: resume non-completed task returns error
- [x] 6.4 Add test: concurrent resume returns error
- [x] 6.5 Add test: resume with expired session returns error with hint
- [x] 6.6 Add test: resumeCount increments correctly

## 7. Validation
- [x] 7.1 Run `bun run typecheck` - no new type errors
- [x] 7.2 Run `bun run lint` - no new lint errors (pre-existing only)
- [x] 7.3 Run `bun test` - all tests pass (9/9)
- [x] 7.4 Run `bun run build` - build succeeds

## Dependencies

- Task 1 must complete before Task 3
- Task 2 can run in parallel with Task 1
- Task 3 must complete before Task 4
- Task 5 depends on Task 3
- Task 6 depends on Tasks 3-5
- Task 7 runs after all other tasks
