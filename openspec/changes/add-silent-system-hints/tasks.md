# Tasks: Add Silent System Hints

## 1. System Transform Hook Implementation

- [x] 1.1 Create `src/hooks/system-transform.ts` with core logic
  - Filter unretrieved completed/error/cancelled tasks by parentSessionID
  - Format system hint message with status-grouped task IDs
  - Include leftover warning only when running tasks exist
- [x] 1.2 Register `experimental.chat.system.transform` hook in `src/index.ts`
  - Pass BackgroundManager instance to hook handler
  - Ensure hook modifies output.system array (mutating signature)
- [x] 1.3 Add helper function to get unretrieved tasks for a session
  - Filter by parentSessionID
  - Filter by status (completed, error, cancelled)
  - Filter by !resultRetrievedAt

## 2. Visible Message Format Update

- [x] 2.1 Update `NOTIFICATION_MESSAGES.taskCompletionBody()` in `src/prompts.ts`
  - Remove guidance text (superagents_output instructions)
  - Remove leftover warning
  - Keep: header, description, duration, batch progress
  - Format: `**SuperAgents**\nAgent "{description}" (ID {id}) finished in {duration}.\nBatch: {completed}/{total} complete, {running} running.`
- [x] 2.2 Update header format in `src/prompts.ts`
  - Remove checkmark icon from completed header (`**SuperAgents**`)
  - Keep emojis for error (✗) and cancelled (⊘) headers
- [x] 2.3 Update `notifyParentSession()` in `src/manager/notifications.ts`
  - Use new message format (removed leftoverWarning parameter)
  - Ensure Toast notification format unchanged

## 3. System Hint Message Format

- [x] 3.1 Create `SYSTEM_HINT_MESSAGES` in `src/prompts.ts`
  - Progress header: `Agent Progress: {completed}/{total}`
  - Completed tasks section: `✓ Completed: superagents_output(task_id={ids})`
  - Error tasks section: `✗ Error: superagents_output(task_id={ids})`
  - Cancelled tasks section: `⊘ Cancelled: superagents_output(task_id={ids})`
  - Guidance: `You can continue working or just say 'waiting' and halt.`
  - Leftover warning: `WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.`
- [x] 3.2 Build system hint message in hook handler
  - Only include sections with tasks
  - Only include leftover warning if running tasks exist
  - Return without modification if no unretrieved tasks

## 4. Resume Integration

- [x] 4.1 Ensure resume completions trigger same system hint logic
  - Resumed tasks return to "completed" status and are included in system hints
- [x] 4.2 Update resume notification visible message format
  - Apply same format changes as regular task completions (removed guidance text)

## 5. Testing & Validation

- [x] 5.1 Test system transform hook registration
  - Verify hook is registered in plugin return object
- [x] 5.2 Test unretrieved task filtering
  - Test by parentSessionID
  - Test status filtering
  - Test resultRetrievedAt exclusion
- [x] 5.3 Test visible message format
  - Verify no guidance text
  - Verify batch progress format
- [x] 5.4 Test system hint format
  - Verify status-grouped IDs
  - Verify leftover warning condition
- [x] 5.5 Build and type check
  - `npm run build` ✓
  - `npm run typecheck` ✓
  - `npm test` - 61 tests pass ✓

## 6. Documentation

- [x] 6.1 Update code comments for new hook
  - Added JSDoc to createSystemTransformHook with hook signature documentation
- [x] 6.2 Update prompts.ts with clear documentation of message formats
  - Added section header for SYSTEM_HINT_MESSAGES
