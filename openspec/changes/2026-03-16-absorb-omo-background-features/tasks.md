# Tasks: Absorb OMO Background Agent Features

## 1. Types & Interfaces
- [ ] 1.1 Update `src/types.ts` — Add `MessageFilter` interface: `{ fullSession?: boolean, includeThinking?: boolean, includeToolResults?: boolean, sinceMessageId?: string, messageLimit?: number, thinkingMaxChars?: number }`
- [ ] 1.2 Update `src/types.ts` — Add `FilteredMessage` type: `{ id: string, role: string, type: string, content: string, thinking?: string, toolCalls?: any[], timestamp?: string }`
- [ ] 1.3 Update `src/types.ts` — Add `pendingResume` optional field to `BackgroundTask` interface: `{ prompt: string, queuedAt: string } | undefined`
- [ ] 1.4 Update `src/types.ts` — Add `DiscoveredInstance` type: `{ name: string, host: string, port: number, metadata: Record<string, string> }`
- [ ] 1.5 Update `src/server/types.ts` — Add `MessagesResponse` type: `{ messages: FilteredMessage[], taskId: string, filter: MessageFilter }`
- [ ] 1.6 Update `src/server/types.ts` — Add `InstancesResponse` type: `{ instances: DiscoveredInstance[], discoveredAt: string }`

## 2. Message Filtering Engine
- [ ] 2.1 Create `src/manager/messages.ts` — Implement `filterMessages(messages: any[], filter: MessageFilter): FilteredMessage[]` function that applies the full filtering pipeline: sinceMessageId slice → role/type filter → thinking truncation → message limit
- [ ] 2.2 Update `src/manager/index.ts` — Add `getFilteredMessages(sessionID: string, filter: MessageFilter): Promise<FilteredMessage[]>` method to BackgroundManager that calls `getTaskMessages()` then `filterMessages()`
- [ ] 2.3 Update `src/manager/messages.ts` — Implement `assignMessageIds(messages: any[]): any[]` helper that ensures each message has a stable ID for `since_message_id` incremental polling

## 3. bgagent_output Extension
- [ ] 3.1 Update `src/tools/output.ts` — Add 6 new optional parameters to Zod schema: `full_session`, `include_thinking`, `include_tool_results`, `since_message_id`, `message_limit` (max 100), `thinking_max_chars`
- [ ] 3.2 Update `src/tools/output.ts` — When `full_session=true`, construct `MessageFilter` from args and call `manager.getFilteredMessages()` instead of `formatTaskResult()`
- [ ] 3.3 Update `src/tools/output.ts` — Format filtered messages for tool response: include message ID, role, content, optional thinking, optional tool results
- [ ] 3.4 Update `src/tools/output.ts` — Update tool description to document all new parameters and their behavior

## 4. Resume Extension
- [ ] 4.1 Update `src/tools/resume.ts` — Remove `completed`-only status check in `validateResumeTask()`. Allow all statuses: completed, error, cancelled, running
- [ ] 4.2 Update `src/tools/resume.ts` — Add running-task queue branch in `executeResume()`: if `task.status === "running"`, set `task.pendingResume = { prompt, queuedAt }`, persist task, return queue confirmation message
- [ ] 4.3 Update `src/tools/resume.ts` — Add queue-full rejection: if `task.pendingResume` already exists on a running task, return error "a resume prompt is already queued"
- [ ] 4.4 Update `src/manager/index.ts` — In task completion handler (where status changes to "completed"), check for `task.pendingResume`. If present, extract prompt, clear `pendingResume`, set status to "resumed", increment `resumeCount`, call `sendResumePromptAsync()`
- [ ] 4.5 Update `src/tools/resume.ts` — For error/cancelled tasks: reset status to "resumed", increment `resumeCount`, call `sendResumePromptAsync()` (similar to current completed flow)

## 5. HTTP API Extension
- [ ] 5.1 Update `src/server/routes.ts` — Add `handleTaskMessages()` handler for `GET /v1/tasks/:id/messages` with query params: `full_session`, `include_thinking`, `include_tool_results`, `since_message_id`, `message_limit`, `thinking_max_chars`. Calls `manager.getFilteredMessages()`
- [ ] 5.2 Update `src/server/routes.ts` — Add `handleInstances()` handler for `GET /v1/instances` that calls `discovery.discover()` and returns discovered instances
- [ ] 5.3 Update `src/server/index.ts` — Register new routes: `/v1/tasks/:id/messages` and `/v1/instances`
- [ ] 5.4 Update `src/server/index.ts` — Add static file serving for dashboard: requests to `/dashboard/**` serve from `dashboard/dist/` with SPA fallback to `index.html`

## 6. Multi-Instance Discovery
- [ ] 6.1 Create `src/server/discovery.ts` — `InstanceDiscovery` class with `advertise(port, metadata)`, `discover()`, `stop()` methods using `bonjour-service`
- [ ] 6.2 Update `src/server/index.ts` — Instantiate `InstanceDiscovery`, call `advertise()` on server start, `stop()` on server stop
- [ ] 6.3 Update `src/constants.ts` — Add discovery constants: `DISCOVERY_SERVICE_TYPE` ("bgagent-api"), `DISCOVERY_TIMEOUT_MS` (3000)
- [ ] 6.4 Update `package.json` — Add `bonjour-service` as production dependency

## 7. React Dashboard App
- [ ] 7.1 Create `dashboard/` directory with `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `tailwind.config.ts`
- [ ] 7.2 Create `dashboard/src/main.tsx` — React entry point with app shell, SSE connection provider
- [ ] 7.3 Create `dashboard/src/hooks/useSSE.ts` — Custom hook for SSE connection with auto-reconnection and event type handling
- [ ] 7.4 Create `dashboard/src/hooks/useInstances.ts` — Custom hook for multi-instance discovery, polls `/v1/instances` periodically
- [ ] 7.5 Create `dashboard/src/hooks/useTaskMessages.ts` — Custom hook for fetching task messages via `/v1/tasks/:id/messages` with filtering params
- [ ] 7.6 Create `dashboard/src/components/TaskTree.tsx` — Tree visualization of parent→child task hierarchy with expand/collapse
- [ ] 7.7 Create `dashboard/src/components/TaskCard.tsx` — Individual task card showing status badge, agent type, description, duration, progress
- [ ] 7.8 Create `dashboard/src/components/ConversationViewer.tsx` — Full conversation display when a task is selected: messages, thinking blocks (collapsible), tool calls
- [ ] 7.9 Create `dashboard/src/components/BatchGroup.tsx` — Collapsible group view for tasks sharing the same batchId
- [ ] 7.10 Create `dashboard/src/components/InstanceSelector.tsx` — Sidebar/header showing discovered instances, allows selecting which instances to monitor
- [ ] 7.11 Create `dashboard/src/components/StatusBar.tsx` — Top bar showing connection status, total tasks, active count, error count
- [ ] 7.12 Update `dashboard/package.json` — Add build script that outputs to `dashboard/dist/`
- [ ] 7.13 Update root `package.json` — Add `build:dashboard` script that builds the dashboard, and update `build:all` to include dashboard build

## 8. Testing
- [ ] 8.1 Add unit tests for `filterMessages()` in `src/manager/__tests__/messages.test.ts`: test each filter individually and in combination
- [ ] 8.2 Add unit tests for `getFilteredMessages()` integration with BackgroundManager
- [ ] 8.3 Add unit tests for extended bgagent_output: verify backward compatibility (no new params = same behavior), verify each new param works correctly
- [ ] 8.4 Add unit tests for resume extension: test resume from error, cancelled, running states; test queue behavior; test queue-full rejection
- [ ] 8.5 Add unit tests for running-task resume queue: verify prompt is stored, verify auto-execution on completion, verify single-depth queue
- [ ] 8.6 Add unit tests for `handleTaskMessages()` route handler: verify query param parsing, filtering, error cases
- [ ] 8.7 Add unit tests for `handleInstances()` route handler
- [ ] 8.8 Add unit tests for `InstanceDiscovery` class: advertise, discover, stop lifecycle
- [ ] 8.9 Add integration test for dashboard static serving: verify `/dashboard` serves index.html, verify SPA fallback

## 9. Build & Verification
- [ ] 9.1 Run `bun run typecheck` — ensure no type errors across plugin and dashboard
- [ ] 9.2 Run `bun test` — ensure all existing + new tests pass
- [ ] 9.3 Run `bun run build` — ensure plugin build succeeds
- [ ] 9.4 Run dashboard build — ensure `dashboard/dist/` is generated with index.html and assets
- [ ] 9.5 Manual smoke test: start plugin, test bgagent_output with full_session=true, test resume on error task, verify `/v1/tasks/:id/messages`, verify `/dashboard` serves React app

## Dependencies

- Section 1 (Types) must complete before Sections 2, 3, 4, 5, 6
- Section 2 (Message Filtering) must complete before Section 3 (bgagent_output) and Section 5 (HTTP API)
- Sections 3, 4 can run in parallel after Section 2
- Section 5 depends on Sections 2, 6
- Section 6 can run in parallel with Sections 2, 3, 4
- Section 7 (Dashboard) depends on Sections 5, 6 (needs API endpoints and discovery to exist)
- Section 8 (Testing) depends on Sections 1–7
- Section 9 (Build) depends on all previous sections