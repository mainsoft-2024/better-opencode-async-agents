# opencode-background-agent

[![npm version](https://img.shields.io/npm/v/@paulp-o/opencode-background-agent)](https://www.npmjs.com/package/@paulp-o/opencode-background-agent)
[![license](https://img.shields.io/npm/l/@paulp-o/opencode-background-agent)](https://github.com/paulp-o/opencode-background-task/blob/main/LICENSE)

Background task management plugin for OpenCode AI. Launch async agent tasks that run in parallel while you continue with other work.

## Installation

```bash
npm install @paulp-o/opencode-background-agent
# or
bun add @paulp-o/opencode-background-agent
```

## Configuration

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["@paulp-o/opencode-background-agent"]
}
```

## Tools Provided

### `background_task`

Launch a background agent task that runs asynchronously.

**Use cases:**
- Long-running research tasks
- Complex analysis that doesn't need immediate results
- Parallel workloads to maximize throughput

**Parameters:**
- `description` (string, required): Short task description (shown in status)
- `prompt` (string, required): Full detailed prompt for the agent
- `agent` (string, required): Agent type to use (any registered agent)

**Returns:** Task ID immediately. The task runs in background and notifies you when complete.

### `background_output`

Get output from a background task.

**Parameters:**
- `task_id` (string, required): Task ID to get output from
- `block` (boolean, required): If true, wait for task completion. If false (default), return current status immediately
- `timeout` (number, optional): Max wait time in ms when blocking (default: 60000, max: 600000)

**Returns:**
- When not blocking: Returns current status
- When blocking: Waits for completion, then returns full result

### `background_cancel`

Cancel a running background task.

**Parameters:**
- `task_id` (string, required): Task ID to cancel

**Note:** Only works for tasks with status "running". Aborts the background session and marks the task as cancelled.

### `background_list`

List all background tasks.

**Parameters:**
- `status` (string, optional): Filter by status ("running", "completed", "error", "cancelled")

**Returns:** Table of all background tasks with their status, duration, and agent type.

### `background_clear`

Clear and abort all background tasks immediately.

Use this to stop all running background agents and clear the task list. Useful when you want to start fresh or cancel all pending work.

## Usage Examples

### Launch a background task

```typescript
background_task(
  description="Research API patterns",
  prompt="Analyze the codebase for REST API patterns...",
  agent="explore"
)
```

### Get task results (blocking)

```typescript
background_output(
  task_id="bg_abc12345",
  block=true,
  timeout=120000
)
```

### Check task status (non-blocking)

```typescript
background_output(
  task_id="bg_abc12345",
  block=false
)
```

### Cancel a task

```typescript
background_cancel(task_id="bg_abc12345")
```

### List all tasks

```typescript
background_list()
```

### Filter by status

```typescript
background_list(status="running")
```

### Clear all tasks

```typescript
background_clear()
```

## Features

- **Async Task Execution**: Run long-running agent tasks in parallel without blocking
- **Real-time Progress Tracking**: Live updates with spinner animations and tool call counts
- **Toast Notifications**: Visual status updates directly in your OpenCode UI
- **Automatic Completion Notifications**: Get notified when tasks finish (success/error/cancelled)
- **Batch Task Management**: Track multiple tasks as a batch with progress indicators
- **Result Retrieval**: Block or non-blocking result fetching with configurable timeouts
- **Session Integration**: Tasks automatically clean up when parent sessions change or are deleted

## Development

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run tests
bun test

# Run linter
bun run lint

# Type check
bun run typecheck

# Format code
bun run format
```

## License

MIT

---

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/paulp-o/opencode-background-task).
