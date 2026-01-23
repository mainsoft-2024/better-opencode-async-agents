# Tasks: Add Silent System Hints

## 1. System Transform Hook Implementation

- [ ] 1.1 Create `src/hooks/system-transform.ts` with core logic
  - Filter unretrieved completed/error/cancelled tasks by parentSessionID
  - Format system hint message with status-grouped task IDs
  - Include leftover warning only when running tasks exist
- [ ] 1.2 Register `experimental.chat.system.transform` hook in `src/index.ts`
  - Pass BackgroundManager instance to hook handler
  - Ensure hook returns modified system array
- [ ] 1.3 Add helper function to get unretrieved tasks for a session
  - Filter by parentSessionID
  - Filter by status (completed, error, cancelled)
  - Filter by !resultRetrievedAt

## 2. Visible Message Format Update

- [ ] 2.1 Update `NOTIFICATION_MESSAGES.taskCompletionBody()` in `src/prompts.ts`
  - Remove guidance text (superagents_output instructions)
  - Remove leftover warning
  - Keep: header, description, duration, batch progress
  - Format: `**SuperAgents**\nAgent "{description}" (ID {id}) finished in {duration}.\nBatch: {completed}/{total} complete, {running} running.`
- [ ] 2.2 Update header format in `src/prompts.ts`
  - Remove checkmark icon from completed header
  - Keep emojis for error (✗) and cancelled (⊘) headers
- [ ] 2.3 Update `notifyParentSession()` in `src/manager/notifications.ts`
  - Use new message format
  - Ensure Toast notification format unchanged

## 3. System Hint Message Format

- [ ] 3.1 Create `SYSTEM_HINT_MESSAGES` in `src/prompts.ts`
  - Progress header: `Agent Progress: {completed}/{total}`
  - Completed tasks section: `✓ Completed: superagents_output(task_id={ids})`
  - Error tasks section: `✗ Error: superagents_output(task_id={ids})`
  - Cancelled tasks section: `⊘ Cancelled: superagents_output(task_id={ids})`
  - Guidance: `You can continue working or just say 'waiting' and halt.`
  - Leftover warning: `WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.`
- [ ] 3.2 Build system hint message in hook handler
  - Only include sections with tasks
  - Only include leftover warning if running tasks exist
  - Return empty (no modification) if no unretrieved tasks

## 4. Resume Integration

- [ ] 4.1 Ensure resume completions trigger same system hint logic
  - resumed status should be included in unretrieved filter when completed
- [ ] 4.2 Update resume notification visible message format
  - Apply same format changes as regular task completions

## 5. Testing & Validation

- [ ] 5.1 Test system transform hook registration
  - Verify hook is called during LLM streaming
- [ ] 5.2 Test unretrieved task filtering
  - Test by parentSessionID
  - Test status filtering
  - Test resultRetrievedAt exclusion
- [ ] 5.3 Test visible message format
  - Verify no guidance text
  - Verify batch progress format
- [ ] 5.4 Test system hint format
  - Verify status-grouped IDs
  - Verify leftover warning condition
- [ ] 5.5 Build and type check
  - `npm run build`
  - Ensure no TypeScript errors

## 6. Documentation

- [ ] 6.1 Update code comments for new hook
- [ ] 6.2 Update prompts.ts with clear documentation of message formats
