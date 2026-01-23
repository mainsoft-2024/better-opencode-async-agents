# OpenCode Background Agent 🚀

[![npm version](https://img.shields.io/npm/v/@paulp-o/opencode-background-agent)](https://www.npmjs.com/package/@paulp-o/opencode-background-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Background tasks for OpenCode—with a memory.**

Claude Code brought subagents to the terminal, but they have one major flaw: **they start with a blank slate.** Every time you delegate a task, you're forced to re-explain the context, the bugs, and the plan.

This plugin fixes that. It brings **Fork Context Inheritance** to OpenCode. Your child agents inherit your full conversation history. No more amnesiac subagents.

[Why this exists](#-the-problem-amnesiac-subagents) • [Quick Start](#-quick-start) • [vs Claude Code](#-how-we-beat-claude-code) • [Tools](#-tools)

---

## 🧠 The Problem: Amnesiac Subagents

In standard subagent implementations (like Claude Code), spawning a task looks like this:

```typescript
// Child agent starts with zero context
background_task({
  prompt: "Fix that bug in the parser", // parser? what bug? 🤷
  agent: "coder"
})
```

With **OpenCode Background Agent**, your subagents are born with your context:

```typescript
// Child agent inherits everything you've discussed
background_task({
  prompt: "Fix that bug in the parser", // I know exactly what bug you mean! ✓
  agent: "coder",
  fork: true
})
```

### Why it's a game-changer:
- **Zero Re-explanation**: Your agents already know the codebase state and your intent.
- **Deep Delegation**: "Investigate why this test is failing" works because the agent knows the test's history.
- **True Parallelism**: Spin up 5 agents to look at 5 different parts of a complex discussion simultaneously.

---

## 🚀 Quick Start

1. **Install**
   Add it to your OpenCode configuration:
   ```json
   {
     "plugins": ["@paulp-o/opencode-background-agent"]
   }
   ```

2. **Delegate**
   Tell your agent to work in the background:
   ```
   "Analyze the performance bottlenecks in the background while I refactor the UI"
   ```

3. **Check In**
   ```bash
background_list()  # See what's running (automatically filtered to current session)
background_output({ task_id: "ses_a1b2" }) # Grab results when ready (short IDs work!)
```

Or use the tools directly:

```typescript
background_task({ description: "Research payments", prompt: "...", agent: "researcher" })
background_task({ description: "Review auth", prompt: "...", agent: "reviewer", fork: true })
```

---

## ⚔️ How We Beat Claude Code

| Feature | Claude Code Subagents | **OpenCode Background Agent** |
|---------|:-----------:|:----------------------------:|
| Background Execution | ✅ | ✅ |
| Custom Agent Selection | ✅ | ✅ |
| **Fork Context Inheritance** | ❌ (Fresh start) | **✅ Inherit everything** |
| **Persistence** | ❌ (Session only) | **✅ Survives restarts** |
| **UX** | Standard | **✅ Short IDs + Toast notifications** |
| **Session Isolation** | ✅ | **✅ No token pollution** |

---

## 🛠 Tools

### `background_task`
The heavy lifter. Use it to spawn, fork, or resume.

```typescript
background_task({
  description: "Fixing memory leak",
  prompt: "Analyze the leak we found in the profiler",
  agent: "coder",
  fork: true // The magic switch
})
```

### `background_output`
Fetch results. Supports prefix matching (e.g., `ses_a1` instead of `ses_a1b2c3d4`).

```typescript
background_output({
  task_id: "ses_a1b2",
  block: true // Wait for it to finish
})
```

### `background_list`
See what your agents are doing. Automatically filtered to your current session to keep your workspace clean.

---

## 💾 Persistence & Performance

- **Zero Data Loss**: Tasks are saved to disk (`~/.opencode/plugins/background-agent/tasks.json`). If OpenCode crashes, your work is still there.
- **Smart Truncation**: We handle context windows intelligently, truncating large tool results to keep your child agents fast and focused.
- **Isolated Sessions**: Background agents run in their own sessions. They won't pollute your main conversation with their tool logs.

---

## 📄 License

MIT
