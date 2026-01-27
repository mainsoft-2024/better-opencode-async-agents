# Better OpenCode Async Agents

[![npm version](https://img.shields.io/npm/v/better-opencode-async-agents)](https://www.npmjs.com/package/better-opencode-async-agents)
[![license](https://img.shields.io/npm/l/better-opencode-async-agents)](https://github.com/mainsoft-2024/better-opencode-async-agents/blob/main/LICENSE)

An unopinionated, **Non-Blocking(optional), Async** Background agent plugin for OpenCode, **same as (or better than) that of Claude Code!**

## Configuration

Add the plugin to your `opencode.json(c)`:

```json
{
  "plugin": ["better-opencode-async-agents"]
}
```

## Features

- **Async Task Execution**: Run long-running agent tasks in parallel without blocking
- **Real-time Progress Tracking**: Live updates with spinner animations and tool call counts
- **Toast Notifications**: Visual status updates directly in your OpenCode UI
- **Automatic Completion Notifications**: Get notified when tasks finish (success/error/cancelled)
- **Batch Task Management**: Track multiple tasks as a batch with progress indicators
- **Result Retrieval**: Block or non-blocking result fetching with configurable timeouts
- **Session Integration**: Tasks automatically clean up when parent sessions change or are deleted

## Tools Provided

- **`superagents_task(description: string, prompt: string, agent: string)`**: Launch async background agent tasks
- **`superagents_output(task_id: string, block: boolean, timeout?: number)`**: Get task results (blocking/non-blocking)
- **`superagents_cancel(task_id: string)`**: Cancel running tasks
- **`superagents_resume(task_id: string, message: string, block?: boolean, timeout?: number)`**: Resume a completed task with a follow-up message for multi-turn conversations
- **`superagents_list(status?: "running" | "completed" | "error" | "cancelled")`**: List all tasks with status filter
- **`superagents_clear()`**: Abort and clear all tasks

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

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/mainsoft-2024/better-opencode-async-agents).
