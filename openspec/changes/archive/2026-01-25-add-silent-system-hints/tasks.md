# Tasks: Add Silent System Hints

## 1. Update Message Templates

- [ ] 1.1 Add new visible message templates to prompts.ts
  - `NOTIFICATION_MESSAGES.visibleTaskCompleted(description, duration)` → `✓ **Agent "${description}" finished in ${duration}.**`
  - `NOTIFICATION_MESSAGES.visibleTaskFailed(description, duration)` → `✗ **Agent "${description}" failed in ${duration}.**`
  - `NOTIFICATION_MESSAGES.visibleTaskCancelled(description, duration)` → `⊘ **Agent "${description}" cancelled after ${duration}.**`
  - `NOTIFICATION_MESSAGES.visibleResumeCompleted(resumeCount, duration)` → `✓ **Resume #${resumeCount} completed in ${duration}.**`
  - `NOTIFICATION_MESSAGES.visibleResumeFailed(resumeCount, duration)` → `✗ **Resume #${resumeCount} failed in ${duration}.**`

- [ ] 1.2 Add progress line template
  - `NOTIFICATION_MESSAGES.taskProgressLine(completed, total)` → `Task Progress: ${completed}/${total}`

- [ ] 1.3 Add hidden hint templates to prompts.ts
  - `SYSTEM_HINT_MESSAGES.runningTasksHint(taskId, leftoverWarning)` for when tasks still running
  - `SYSTEM_HINT_MESSAGES.allTasksDoneHint(totalCount)` for when all tasks complete
  - `SYSTEM_HINT_MESSAGES.errorHint(taskId, errorMessage)` for failed tasks
  - `SYSTEM_HINT_MESSAGES.resumeHint(taskId)` for resume completions

- [ ] 1.4 Add development indicator constant
  - `NOTIFICATION_MESSAGES.devHintIndicator` → `[hint attached]`

## 2. Modify Notification Functions

- [ ] 2.1 Update `notifyParentSession()` in notifications.ts
  - Build visible message using new templates
  - Build hidden hint based on batch status (running vs all done)
  - Add development mode indicator when `NODE_ENV === 'development'`
  - Send both parts via `session.prompt()` with `synthetic: true` on hint part

- [ ] 2.2 Update `notifyResumeComplete()` in notifications.ts
  - Build visible message: `✓ **Resume #N completed in Xs.**` + `Task Progress: X/Y`
  - Build hidden hint using same pattern as task completion
  - Send both parts via `session.prompt()` with `synthetic: true`

- [ ] 2.3 Update `notifyResumeError()` in notifications.ts
  - Build visible message: `✗ **Resume #N failed in Xs.**` + `Task Progress: X/Y`
  - Build hidden hint including error message
  - Send both parts via `session.prompt()` with `synthetic: true`

## 3. Helper Functions

- [ ] 3.1 Create `buildVisibleMessage()` helper
  - Takes: task, status, duration, batchProgress
  - Returns: formatted visible message string

- [ ] 3.2 Create `buildHiddenHint()` helper
  - Takes: task, batchStatus (running count, total count), errorMessage (optional)
  - Returns: formatted hint string based on conditions

- [ ] 3.3 Create `isDevelopmentMode()` helper
  - Returns: `process.env.NODE_ENV === 'development'`

## 4. Testing

- [ ] 4.1 Test task completion notification format
  - Verify visible message matches spec
  - Verify hidden hint is generated correctly
  - Verify development indicator appears when NODE_ENV=development

- [ ] 4.2 Test error notification format
  - Verify visible message shows error icon
  - Verify hidden hint includes error message

- [ ] 4.3 Test cancelled notification format
  - Verify visible message shows cancelled icon
  - Verify hidden hint is generated

- [ ] 4.4 Test resume notification format
  - Verify visible message shows resume count
  - Verify hidden hint follows same pattern

- [ ] 4.5 Test batch progress scenarios
  - Test with 1/5 complete (running tasks left)
  - Test with 5/5 complete (all done)
  - Verify correct hint variation is selected

## 5. Cleanup

- [ ] 5.1 Remove old message templates from prompts.ts
  - Remove `NOTIFICATION_MESSAGES.taskCompletionBody` (replaced by split templates)
  - Remove `NOTIFICATION_MESSAGES.resumeCompletionBody` (replaced)
  - Remove `NOTIFICATION_MESSAGES.resumeErrorBody` (replaced)

- [ ] 5.2 Update any documentation referencing old format
