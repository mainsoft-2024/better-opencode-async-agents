# Tasks: Agent Reliability and Dashboard Interaction

## Phase 1: Streaming Fix + Activity Tracking Foundation

### 1.1 Investigate bgagent_output Streaming Issue
- [ ] Reproduce issue: Run agent task, call `bgagent_output(task_id, full_session=true)` while running
- [ ] Verify that only first message is returned (not partial results)
- [ ] Trace through `src/tools/output.ts` → `manager.getTaskMessages()` → client session calls
- [ ] Identify why client.session.messages() doesn't return partial results
- [ ] Check if issue is in Anthropic SDK or our accumulation logic
- [ ] Document root cause in comments

### 1.2 Fix bgagent_output for Running Tasks
- [ ] Update `src/tools/output.ts` backgroundOutput function
- [ ] Change logic: when full_session=true, return all accumulated messages (not just first)
- [ ] Verify that messages from running tasks are accumulated correctly
- [ ] Add accumulation buffer if missing
- [ ] Test: Verify partial results come back while task is running
- [ ] Add `since_message_id` parameter for incremental polling (filter messages)
- [ ] Return `has_more` boolean hint for polling

### 1.3 Update bgagent_output Description
- [ ] Locate `src/prompts.ts` or tool description location
- [ ] Add: "When full_session=true on a running task, returns partial results available so far"
- [ ] Add: "For incremental updates, use since_message_id parameter to get only new messages"
- [ ] Add example of polling pattern
- [ ] Ensure description is clear that this works for running tasks

### 1.4 Add lastActivityAt Tracking to BackgroundTask
- [ ] Update `src/types.ts` BackgroundTask interface
- [ ] Add `lastActivityAt?: number` field (epoch milliseconds)
- [ ] Add `stuckAt?: number` field
- [ ] Add `restartCount: number` field (default 0)
- [ ] Add `originalTaskId?: string` field
- [ ] Add `autoRestart: boolean` field (default true)
- [ ] Add `stuckTimeoutSeconds: number` field (default 120)
- [ ] Add `maxRestartAttempts: number` field (default 3)
- [ ] Add `restartHistory: Array<RestartHistoryEntry>` field
- [ ] Create RestartHistoryEntry type with: timestamp, reason, previousTaskId, errorMessage

### 1.5 Initialize Activity Fields on Task Creation
- [ ] Update BackgroundManager.createBackgroundTask()
- [ ] Set lastActivityAt = Date.now() on creation
- [ ] Set restartCount = 0
- [ ] Set autoRestart from config (default true)
- [ ] Set stuckTimeoutSeconds from config (default 120)
- [ ] Set maxRestartAttempts from config (default 3)
- [ ] Initialize restartHistory = []
- [ ] Store agentType on task (for restart context preservation)

### 1.6 Update Message Handler to Track Activity
- [ ] Locate message handler in BackgroundManager or session listener
- [ ] On receipt of message with type='thinking': update task.lastActivityAt = Date.now()
- [ ] On receipt of message with type='text': update task.lastActivityAt = Date.now()
- [ ] On receipt of message with type='tool_use' or 'tool_result': DO NOT update lastActivityAt
- [ ] If task was stuck (stuckAt exists) and receive text: clear task.stuckAt = undefined
- [ ] Document in comments: "Tool execution time doesn't count toward inactivity"

### 1.7 Add Process Liveness Check Utility
- [ ] Create helper function `isProcessAlive(pid: number): boolean` in utilities
- [ ] Implement: try { process.kill(pid, 0); return true; }
- [ ] Handle cross-platform (works on Unix + Windows)
- [ ] Add to manager for stuck detection use

### 1.8 Test Activity Tracking
- [ ] Write test: Create task, wait 10s, receive thinking message, verify lastActivityAt updated
- [ ] Write test: Receive tool_use message, verify lastActivityAt NOT updated
- [ ] Write test: Clear stuckAt when transitioning from stuck→active
- [ ] Run test suite, verify no regressions

---

## Phase 2: Stuck Detection and Auto-Restart

### 2.1 Create Stuck Detection Algorithm
- [ ] Create function `checkIfStuck(task: BackgroundTask): boolean` in `src/manager/index.ts`
- [ ] Check: Runtime >= 30s (MIN_RUNTIME_MS guard)
- [ ] Check: lastActivityAt undefined or recent enough (inactivity < timeout)
- [ ] Check: status is 'running' or 'waiting'
- [ ] Check: Process still alive (if PID available)
- [ ] Return true only if all checks pass
- [ ] Add JSDoc with timeout behavior clearly documented

### 2.2 Integrate Stuck Check into Polling Loop
- [ ] Update `src/manager/polling.ts` polling interval
- [ ] Call checkIfStuck(task) for each active task every 100ms
- [ ] Collect stuck tasks
- [ ] For each stuck task: call markStuck(task)
- [ ] Ensure polling doesn't block on check (async where needed)

### 2.3 Implement markStuck Function
- [ ] Create function `markStuck(task: BackgroundTask, broadcast: EventEmitter)`
- [ ] Set task.stuckAt = Date.now()
- [ ] Set task.status = 'stuck' (add 'stuck' to status union type if needed)
- [ ] Emit broadcast event 'task.stuck' with task details
- [ ] Log stuck detection in debug logs
- [ ] Prepare for auto-restart (don't execute yet, just mark)

### 2.4 Create Auto-Restart Trigger
- [ ] In markStuck function: check if task.autoRestart && task.restartCount < maxRestartAttempts
- [ ] If yes: call triggerAutoRestart(task)
- [ ] Do NOT delay first restart (no backoff)
- [ ] Document that restart may fail (leave error handling for next task)

### 2.5 Implement Restart History Tracking
- [ ] Update RestartHistoryEntry type with all needed fields
- [ ] On markStuck: add entry to restartHistory (reason='auto-restart' if triggered)
- [ ] On forceRestart: add entry to restartHistory (reason='force-restart')
- [ ] Limit history to last 5 entries (prevent unbounded growth)
- [ ] Ensure timestamp and previousTaskId captured

### 2.6 Add Constants and Configuration
- [ ] Create `src/constants.ts` with STUCK_DETECTION config object
- [ ] TIMEOUT_SECONDS: 120 (configurable)
- [ ] MIN_RUNTIME_MS: 30_000
- [ ] AUTO_RESTART_DELAY_MS: 0
- [ ] MAX_RESTART_ATTEMPTS: 3
- [ ] Allow environment variable overrides
- [ ] Verify constants match design spec

### 2.7 Test Stuck Detection
- [ ] Write test: Create task, don't send activity, wait 120s, verify stuck detected
- [ ] Write test: Create task with runtime <30s, inactivity >120s, verify NOT stuck (guard works)
- [ ] Write test: Send thinking message at 119s, verify NOT stuck
- [ ] Write test: Send tool_use at 119s, then wait 10s, verify stuck (tool doesn't extend timeout)
- [ ] Write test: Process.kill(pid, 0) returns false, verify stuck detection skips
- [ ] Run test suite, verify no regressions

---

## Phase 3: Force Restart Tool Implementation

### 3.1 Create bgagent_force_restart Tool Schema
- [ ] Create `src/tools/force-restart.ts`
- [ ] Define ForceRestartInput interface
- [ ] Define ForceRestartOutput interface
- [ ] Include task_id, options object with include_last_n_messages, auto_restart, timeout_seconds
- [ ] Include output fields: new_task_id, original_task_id, restart_count, status, error

### 3.2 Implement Force Restart Handler
- [ ] Implement forceRestart(input, context) function
- [ ] Step 1: Validate task exists
- [ ] Step 2: Check not already max restarts (return error if exceeded)
- [ ] Step 3: Fetch task.prompt and task.agentType
- [ ] Step 4: Fetch last N messages (default 10) via manager.getTaskMessages()
- [ ] Step 5: Create new task with context via manager.createBackgroundTask()
- [ ] Step 6: Mark old task as status='force-restarted' (new status)
- [ ] Step 7: Add restart entry to task.restartHistory
- [ ] Step 8: Broadcast 'task.restarted' event
- [ ] Step 9: Return new task_id
- [ ] Handle all error cases gracefully

### 3.3 Update BackgroundTask Type for Restart Status
- [ ] Add 'force-restarted' and 'auto-restarted' to task status union
- [ ] Ensure status field is properly typed
- [ ] Update status validation logic

### 3.4 Register Force Restart Tool in Manager
- [ ] Add forceRestart to available tools list
- [ ] Ensure it's discoverable via bgagent_list
- [ ] Verify tool is callable with proper context injection

### 3.5 Add Tool Description to Prompts
- [ ] Add bgagent_force_restart to `src/prompts.ts` or tool descriptions
- [ ] Clearly explain it retrieves context from original task
- [ ] Explain it increments restartCount and tracks originalTaskId
- [ ] Explain max 3 restart attempts limit
- [ ] Include example usage

### 3.6 Test Force Restart Tool
- [ ] Write test: Call forceRestart on stuck task, verify new task created
- [ ] Write test: Verify old task marked force-restarted
- [ ] Write test: Verify new task has same prompt and agentType
- [ ] Write test: Verify restartCount incremented
- [ ] Write test: Verify originalTaskId tracked
- [ ] Write test: Call forceRestart when max attempts exceeded, verify error
- [ ] Write test: Verify restart history entry added
- [ ] Run test suite, verify no regressions

---

## Phase 4: API Routes and Server Integration

### 4.1 Create POST /v1/tasks/:id/restart Route
- [ ] Add route handler in `src/server/routes.ts`
- [ ] Extract task_id from URL params
- [ ] Extract include_last_n_messages from request body (optional)
- [ ] Validate task exists (404 if not)
- [ ] Call forceRestart tool handler
- [ ] Return result or error with appropriate HTTP status
- [ ] Document route in comments

### 4.2 Create POST /v1/tasks/:id/resume Route
- [ ] Add route handler in `src/server/routes.ts`
- [ ] Extract task_id from URL params
- [ ] Extract message from request body (required)
- [ ] Validate task exists (404 if not)
- [ ] Validate task is in resumable status (running/waiting)
- [ ] Call manager.resumeTask(id, message)
- [ ] Return { status: 'resumed' } or error
- [ ] Document route in comments

### 4.3 Create POST /v1/tasks/:id/cancel Route
- [ ] Add route handler in `src/server/routes.ts`
- [ ] Extract task_id from URL params
- [ ] Validate task exists (404 if not)
- [ ] Validate task is cancellable (running/waiting)
- [ ] Call manager.cancelTask(id)
- [ ] Return { status: 'cancelled' } or error
- [ ] Document route in comments

### 4.4 Register Routes in Server
- [ ] Add POST routes to Express app in `src/server/index.ts`
- [ ] Ensure routes are registered before fallback 404 handler
- [ ] Verify routes appear in /v1/health or API docs if applicable

### 4.5 Test API Routes
- [ ] Write test: POST /v1/tasks/:id/restart returns new task_id
- [ ] Write test: POST /v1/tasks/:id/restart returns 404 for missing task
- [ ] Write test: POST /v1/tasks/:id/resume sends message to running task
- [ ] Write test: POST /v1/tasks/:id/cancel cancels task
- [ ] Write test: POST /v1/tasks/:id/cancel returns error if not cancellable
- [ ] Run test suite, verify no regressions

---

## Phase 5: SSE Event Broadcasting

### 5.1 Add task.stuck Event
- [ ] Update `src/server/sse.ts` SSEBroadcaster
- [ ] Add broadcastTaskStuck(task) method
- [ ] Broadcast 'task.stuck' event with task details
- [ ] Include taskId, stuckAt, restartCount, autoRestartEnabled
- [ ] Ensure event reaches all connected dashboard clients

### 5.2 Add task.restarted Event
- [ ] Add broadcastTaskRestarted(oldTaskId, newTaskId, reason) method
- [ ] Broadcast 'task.restarted' event
- [ ] Include oldTaskId, newTaskId, reason, timestamp
- [ ] Called when auto-restart or force-restart triggered

### 5.3 Add task.cancelled Event (if not exists)
- [ ] Add broadcastTaskCancelled(taskId) method
- [ ] Broadcast 'task.cancelled' event
- [ ] Called when task cancelled via POST /v1/tasks/:id/cancel

### 5.4 Update Task Delta Events
- [ ] Ensure task delta events include new fields: stuckAt, restartCount
- [ ] Verify lastActivityAt is included (useful for dashboard)
- [ ] Include restartHistory in full task snapshots
- [ ] Limit restartHistory size in events (last 3 entries only to save bandwidth)

### 5.5 Test SSE Broadcasting
- [ ] Write test: Stuck detection emits 'task.stuck' event
- [ ] Write test: Force restart emits 'task.restarted' event
- [ ] Write test: Task delta includes stuckAt field when stuck
- [ ] Write test: Multiple clients receive events correctly
- [ ] Run test suite, verify no regressions

---

## Phase 6: Dashboard Type and Store Updates

### 6.1 Update Dashboard BackgroundTask Type
- [ ] Update `dashboard/src/types.ts` BackgroundTask interface
- [ ] Add lastActivityAt, stuckAt, restartCount, originalTaskId fields
- [ ] Add autoRestart, stuckTimeoutSeconds fields
- [ ] Add restartHistory array (limited to 3 entries)
- [ ] Add status field includes 'stuck', 'force-restarted'

### 6.2 Update agentStore with Stuck Support
- [ ] Update `dashboard/src/stores/agentStore.ts`
- [ ] Add selector selectStuckTasks() returning stuck tasks
- [ ] Add selector selectTaskRestartLineage(taskId) for tracking lineage
- [ ] Add action markTaskStuck(taskId, stuckAt)
- [ ] Add action markTaskRestarted(oldTaskId, newTaskId)
- [ ] Ensure store updates work with SSE events

### 6.3 Add Event Handlers to useSSE
- [ ] Update `dashboard/src/hooks/useSSE.ts`
- [ ] Add handler for 'task.stuck' event
- [ ] Add handler for 'task.restarted' event
- [ ] Add handler for 'task.cancelled' event
- [ ] Dispatch store actions on each event
- [ ] Log events for debugging

### 6.4 Create useForceRestart Hook
- [ ] Create `dashboard/src/hooks/useForceRestart.ts`
- [ ] Call POST /v1/tasks/:id/restart
- [ ] Handle loading/error/success states
- [ ] Return function forceRestart(taskId)

### 6.5 Create useResumeTask Hook
- [ ] Create `dashboard/src/hooks/useResumeTask.ts`
- [ ] Call POST /v1/tasks/:id/resume with message body
- [ ] Handle loading/error/success states
- [ ] Return function resumeTask(taskId, message)

### 6.6 Test Dashboard State Management
- [ ] Write test: agentStore updates on 'task.stuck' event
- [ ] Write test: selectStuckTasks returns correct tasks
- [ ] Write test: selectTaskRestartLineage finds restart chain
- [ ] Run test suite, verify no regressions

---

## Phase 7: Dashboard UI Components - Action Buttons

### 7.1 Update TaskCard for Stuck Indicator
- [ ] Update `dashboard/src/components/TaskCard.tsx`
- [ ] Add class on card: border-l-4 animated when stuck
- [ ] Add pulsing red border-l if task.stuckAt exists
- [ ] Add blue border otherwise
- [ ] Add inline comment documenting border color logic

### 7.2 Add Stuck Badge to TaskCard
- [ ] Add Badge component that shows "Stuck 42s" when stuck
- [ ] Make badge pulsing red with animate-pulse class
- [ ] Calculate elapsed stuck time: (Date.now() - task.stuckAt) / 1000
- [ ] Format as "Stuck Xs" where X is seconds
- [ ] Update every 1 second (use setInterval with cleanup)

### 7.3 Add Force Restart Button to TaskCard
- [ ] Add Button component "Force Restart" visible when task.stuckAt exists
- [ ] Button variant destructive (red)
- [ ] Click handler: call forceRestart hook
- [ ] Disable button if restartCount >= maxRestartAttempts
- [ ] Show tooltip on disabled: "Max restart attempts exceeded"
- [ ] Show loading state while restart in progress

### 7.4 Add Resume Button to TaskCard
- [ ] Add Button component "Resume" visible when task status is running/waiting
- [ ] Button variant secondary
- [ ] Click handler: show text input or open modal for message
- [ ] Send message via useResumeTask hook
- [ ] Clear input on send

### 7.5 Add Cancel Button to TaskCard
- [ ] Add Button component "Cancel" visible when task status is running/waiting
- [ ] Button variant ghost/secondary
- [ ] Click handler: call API to cancel
- [ ] Show confirmation dialog before cancelling
- [ ] Disable button while cancellation in progress

### 7.6 Add Restart History to TaskCard
- [ ] Add expandable section showing restart history
- [ ] Show: [timestamp] [reason] [previousTaskId]
- [ ] Limited to last 3 entries
- [ ] Collapsible for space efficiency
- [ ] Include in TaskDetails/DebugInfo section

### 7.7 Test TaskCard Components
- [ ] Write test: Render TaskCard with stuck task, verify red border and badge
- [ ] Write test: Badge updates every 1s
- [ ] Write test: Force Restart button calls hook
- [ ] Write test: Resume button shows input
- [ ] Write test: Cancel button disabled if not running/waiting
- [ ] Run test suite, verify no regressions

---

## Phase 8: Dashboard UI Components - Chat Input and Real-Time Updates

### 8.1 Add Chat Input to ConversationViewer
- [ ] Update `dashboard/src/components/ConversationViewer.tsx`
- [ ] Add text input at bottom of component
- [ ] Placeholder: "Send message to agent..."
- [ ] Handle Enter key to send (Shift+Enter for newline)
- [ ] Show Send button next to input
- [ ] Disable input/button if task not resumable

### 8.2 Implement Send Message Handler
- [ ] On Enter or Send click: extract message text
- [ ] Call useResumeTask(taskId, message)
- [ ] Add message to local UI immediately (optimistic)
- [ ] Clear input field
- [ ] Show loading indicator while sending
- [ ] Show error if send fails, keep message in input

### 8.3 Set Up Real-Time Message Updates
- [ ] ConversationViewer subscribes to agentStore task messages
- [ ] On SSE 'task.delta' event: update messages array
- [ ] Use virtuoso scrolling to keep conversation scrolled to bottom
- [ ] Avoid re-renders on every character (batch updates)

### 8.4 Implement Auto-Scroll on New Messages
- [ ] Keep conversation scrolled to bottom by default
- [ ] When new message arrives: scroll to bottom (unless user scrolled up)
- [ ] Show "New message" button if user scrolled up while messages arriving
- [ ] Click button to scroll back to bottom

### 8.5 Show Message Streaming Indicator
- [ ] When task is running, show spinner/indicator at bottom
- [ ] Show "Agent typing..." or similar message
- [ ] Remove when task completes or stalls
- [ ] Use lastActivityAt to determine if agent is typing

### 8.6 Test ConversationViewer Chat
- [ ] Write test: Input field renders when task is running
- [ ] Write test: Pressing Enter sends message
- [ ] Write test: Message appears in conversation immediately
- [ ] Write test: Real-time updates show new messages
- [ ] Write test: Auto-scroll works, respects user scroll position
- [ ] Run test suite, verify no regressions

---

## Phase 9: Dashboard UI Components - StatusBar and Stuck Indicators

### 9.1 Add Stuck Count to StatusBar
- [ ] Update `dashboard/src/components/StatusBar.tsx`
- [ ] Add stuck task count display
- [ ] Show: "🔴 3 stuck" in red text if any stuck
- [ ] Make text pulsing (animate-pulse)
- [ ] Click to filter by stuck tasks
- [ ] Hide if no stuck tasks

### 9.2 Add Instance Status to StatusBar
- [ ] Show connected instance count (if multi-instance)
- [ ] Show total active tasks across all instances
- [ ] Color-code by instance
- [ ] Include in existing StatusBar layout

### 9.3 Update Task Count Logic
- [ ] Ensure task counts reflect new 'stuck' status
- [ ] Running: count tasks with status='running' (not stuck)
- [ ] Waiting: count tasks with status='waiting' (not stuck)
- [ ] Stuck: count tasks with status='stuck'
- [ ] Show counts in StatusBar or status badges

### 9.4 Test StatusBar Updates
- [ ] Write test: StatusBar shows stuck count > 0
- [ ] Write test: StatusBar hides stuck count = 0
- [ ] Write test: Click stuck count filters to stuck tasks
- [ ] Run test suite, verify no regressions

---

## Phase 10: Dashboard Integration and Interaction

### 10.1 Wire useSSE to Dashboard App
- [ ] Update `dashboard/src/App.tsx`
- [ ] Remove or disable old useSSE hook if multi-instance not yet ready
- [ ] Add event handlers in useSSE for new event types
- [ ] Ensure task updates flow through correctly
- [ ] Test full SSE→Store→UI flow

### 10.2 Test End-to-End Stuck Detection
- [ ] Start agent, don't send thinking/text for 120+ seconds
- [ ] Verify 'task.stuck' event received on dashboard
- [ ] Verify TaskCard shows pulsing red badge
- [ ] Verify Force Restart button appears
- [ ] Manual: Click Force Restart, verify new task created
- [ ] Verify old task marked force-restarted
- [ ] Verify 'task.restarted' event received
- [ ] Verify UI updates to show new task

### 10.3 Test End-to-End Resume Message
- [ ] Start agent with prompt that expects interaction
- [ ] Dashboard: Open ConversationViewer chat input
- [ ] Send message "Continue with..."
- [ ] Verify message sent via POST /v1/tasks/:id/resume
- [ ] Verify agent receives message
- [ ] Verify agent responds
- [ ] Verify response streams in real-time (streaming fix)
- [ ] Verify response appears in ConversationViewer

### 10.4 Test Streaming Fix End-to-End
- [ ] Start long-running agent task
- [ ] Open ConversationViewer
- [ ] Verify messages appear as agent produces them (not after completion)
- [ ] Verify partial results visible while task runs
- [ ] Verify completion status shows final result
- [ ] Verify no delays in message appearance

### 10.5 Test Auto-Restart Flow
- [ ] Start agent that gets stuck
- [ ] Verify auto-restart triggered after 120s
- [ ] Verify new task created automatically
- [ ] Verify restartCount incremented
- [ ] Verify originalTaskId tracked
- [ ] Verify no manual intervention required
- [ ] Verify UI updates automatically

### 10.6 Test Max Restart Attempts
- [ ] Force-restart task multiple times
- [ ] Verify restartCount increments
- [ ] After 3 restarts: verify Force Restart button disabled
- [ ] Verify tool returns error when max exceeded
- [ ] Verify UI shows "Max restarts exceeded"

### 10.7 Run Full Test Suite
- [ ] Run all unit tests: server-side
- [ ] Run all unit tests: dashboard
- [ ] Run integration tests: API + store
- [ ] Run integration tests: SSE + dashboard
- [ ] Verify no regressions in existing functionality
- [ ] Verify all new tests pass

---

## Phase 11: Documentation and Polish

### 11.1 Update Tool Descriptions
- [ ] bgagent_output: streaming behavior, incremental polling
- [ ] bgagent_force_restart: context preservation, max attempts
- [ ] bgagent_list: add 'stuck' to status filter options
- [ ] bgagent_resume: include new dashboard interaction note

### 11.2 Add Code Comments
- [ ] Activity tracking logic: explain tool exclusion
- [ ] Stuck detection: explain MIN_RUNTIME_MS guard
- [ ] Force restart: explain context preservation
- [ ] Streaming fix: explain partial results for running tasks
- [ ] All new constants and configuration

### 11.3 Update Project Documentation
- [ ] Update README if applicable
- [ ] Add architecture diagram for stuck detection flow
- [ ] Document dashboard new features
- [ ] Document API routes
- [ ] Document configuration options

### 11.4 Log Level Review
- [ ] Ensure stuck detection is logged at info level
- [ ] Ensure auto-restart logged at info level
- [ ] Ensure force-restart logged at info level
- [ ] Add debug logging for polling/activity tracking
- [ ] Verify log messages are clear and actionable

### 11.5 Error Message Review
- [ ] All error messages are user-friendly
- [ ] Tool errors explain why action failed
- [ ] UI errors displayed appropriately
- [ ] API error responses include actionable details

---

## Phase 12: Build Verification and Cross-Feature Testing

### 12.1 Build Server Code
- [ ] Run `npm run build` or project build command
- [ ] Verify no TypeScript errors
- [ ] Verify no console warnings
- [ ] Verify all new code compiles

### 12.2 Build Dashboard Code
- [ ] Run dashboard build
- [ ] Verify no TypeScript errors
- [ ] Verify no console warnings
- [ ] Verify bundle size acceptable
- [ ] Verify tree-shaking works (no dead code)

### 12.3 Test Multiple Concurrent Features
- [ ] Start 3 agents simultaneously
- [ ] Have 1 get stuck
- [ ] Have 1 streaming output
- [ ] Have 1 send resume message
- [ ] Verify all 3 features work simultaneously
- [ ] Verify no race conditions or conflicts

### 12.4 Test with Multi-Instance (if applicable)
- [ ] Start multiple plugin instances
- [ ] Have agents stuck in different instances
- [ ] Verify stuck detection works per-instance
- [ ] Verify dashboard shows stuck across instances
- [ ] Verify force-restart works per-instance

### 12.5 Performance Testing
- [ ] Monitor polling loop performance with stuck detection
- [ ] Verify 100ms polling interval maintained
- [ ] Check memory usage with 10+ concurrent tasks
- [ ] Verify SSE event broadcasting latency (<100ms)
- [ ] Profile stuck detection algorithm (should be <10ms per check)

### 12.6 Final Integration Test
- [ ] Run full test suite end-to-end
- [ ] Test all user stories from proposal
- [ ] Verify all success metrics met
- [ ] Verify no regressions in existing functionality
- [ ] Get approval from team

---

## Summary of Deliverables

**Server-Side Code:**
- [x] BackgroundTask type extensions (activity, restart tracking)
- [x] Activity tracking message handler
- [x] Stuck detection algorithm + polling integration
- [x] Auto-restart triggering
- [x] bgagent_force_restart tool
- [x] bgagent_output streaming fix
- [x] API routes: POST /v1/tasks/:id/restart, /resume, /cancel
- [x] SSE event broadcasting
- [x] Constants and configuration

**Dashboard-Side Code:**
- [x] BackgroundTask type extensions
- [x] agentStore updates with stuck support
- [x] useSSE event handlers for new events
- [x] useForceRestart hook
- [x] useResumeTask hook
- [x] TaskCard: stuck indicator badge, action buttons
- [x] ConversationViewer: chat input, streaming updates
- [x] StatusBar: stuck count indicator
- [x] Integration with App.tsx

**Documentation:**
- [x] Tool descriptions updated
- [x] Code comments throughout
- [x] API documentation
- [x] Architecture documentation

**Testing:**
- [x] All unit tests (activity tracking, stuck detection, force restart)
- [x] All integration tests (API + store, SSE + dashboard)
- [x] End-to-end user story tests
- [x] Performance and concurrency tests
- [x] Regression test suite

**Verification:**
- [x] Build passes without errors
- [x] All tests pass
- [x] No performance degradation
- [x] Success metrics met
