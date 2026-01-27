# Better OpenCode Async Agents

[![npm version](https://img.shields.io/npm/v/better-opencode-async-agents)](https://www.npmjs.com/package/better-opencode-async-agents)
[![license](https://img.shields.io/npm/l/better-opencode-async-agents)](https://github.com/mainsoft-2024/better-opencode-async-agents/blob/main/LICENSE)

An unopinionated, 

**Async**, 

Forkable, 

Resumable, 

Parallelizable

multi-agent plugin for OpenCode.

## Configuration

Add the plugin to your `opencode.json(c)`:

```json
{
  "plugin": ["better-opencode-async-agents"]
}
```

## Overview

This is the subagent/subtask plugin we all know and love, with some key features that support advanced agent control:

- **Async & Batch Task Execution**: Run multiple agent tasks in parallel without blocking the main conversation. Launch tasks individually or in batches and continue working while they execute.

- **Real-time Progress Tracking**: Live updates with spinner animations and tool call counts. See exactly what each agent is doing as it works.

- **Resumable & Cancellable**: Resume completed tasks with follow-up messages for multi-turn conversations. Cancel running tasks at any time.

- **Context Forking Support**: Fork the current conversation context to spawn new agent sessions that inherit the parent's context.

- **Automatic Context Truncation**: When forking, context is intelligently truncated to fit within token limits while preserving the most relevant information.

- **Dynamic Agent Response Collection**: Collect responses from agents in blocking or non-blocking modes. Wait for all tasks to complete or check progress incrementally.

- **Variable Timeouts**: Configure custom timeouts per task. Some tasks need seconds, others need minutes - you decide.

## Tools Provided

| Tool | Description |
|------|-------------|
| `superagents_task` | Launch async background agent tasks with description, prompt, and agent type |
| `superagents_output` | Get task results (blocking or non-blocking) with configurable timeout |
| `superagents_cancel` | Cancel a running task |
| `superagents_resume` | Resume a completed task with a follow-up message |
| `superagents_list` | List all tasks with optional status filter |
| `superagents_clear` | Abort and clear all tasks |

## Philosophy

This is an unopinionated tool. It provides the primitives for async multi-agent orchestration without imposing a specific workflow. You decide:

- When to block vs. fire-and-forget
- How to structure your agent hierarchy
- What context to fork and when
- How long to wait for results

Build your own patterns on top of these building blocks.

## Development

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT

---

For issues, questions, or contributions, visit the [GitHub repository](https://github.com/mainsoft-2024/better-opencode-async-agents).
