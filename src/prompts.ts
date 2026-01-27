// =============================================================================
// Centralized Prompts & Text Strings
// =============================================================================
// All user-facing text, tool descriptions, and notification messages.
// Edit prompts here to update them across the entire codebase.
// =============================================================================

// =============================================================================
// Tool Descriptions (for AI/LLM consumption)
// =============================================================================

export const TOOL_DESCRIPTIONS = {
  backgroundTask: `Launch a background agent task that runs asynchronously with clear context.

The task runs in a separate session while you continue with other work.

Use this for:
- Long-running research tasks
- Complex analysis that doesn't need immediate results
- Parallel workloads to maximize throughput

Arguments:
- resume: (Optional) Task ID to resume - if provided, enters resume mode. You can send follow-up prompts for continuous feedback.
- fork: (Optional) If true, fork parent context to child session (child inherits conversation history of caller agent). MUST provide the expected response to it.
- description: Short task description (shown in status)
- prompt: Full detailed prompt for the agent (or follow-up message in resume mode)
- agent: Agent type to use (any registered agent)

IMPORTANT: You'll be informed when each task is complete. DO NOT assume all tasks were done, check again if all agents you need are complete.

  Returns immediately with task ID. The task will run in background and notify you when complete.
Optionally use \`asyncagents_output\` later if you need to check results manually with or without blocking.`,

  backgroundList: `List all background tasks.

Shows all running, completed, error, and cancelled background tasks with their status.

Arguments:
- status: Optional filter by status ("running", "completed", "error", "cancelled").`,

  backgroundCancel: `Cancel a running background task.

Only works for tasks with status "running". Aborts the background session and marks the task as cancelled.

Arguments:
- task_id: Required task ID to cancel.`,

  backgroundOutput: `Get output from a background task.

Arguments:
- task_id: Required task ID to get output from
- block: Optional boolean to wait for task completion (default: false)
- timeout: Optional timeout in seconds when blocking (default: 120, max: 600)

Returns:
- Current status and result (if completed)
- When block=true, waits until task completes or timeout is reached
- When block=false (default), returns immediately with current status`,

  backgroundClear: `Clear and abort all background tasks immediately.

Use this to stop all running background agents and clear the task list.
This is useful when you want to start fresh or cancel all pending work.`,
};

// =============================================================================
// Success Messages
// =============================================================================

export const SUCCESS_MESSAGES = {
  taskLaunched: (shortTaskId: string) => `⏳ **Background task launched**
Task ID: \`${shortTaskId}\`

You can continue working or say 'waiting' and halt.`,

  taskCancelled: (shortTaskId: string, description: string) => `⊘ **Task cancelled**

Task ID: \`${shortTaskId}\`
Description: ${description}
Status: ⊘ cancelled`,

  resumeInitiated: (shortTaskId: string, resumeCount: number) => {
    const resumeCountInfo = resumeCount > 1 ? `\nResume count: ${resumeCount}` : "";
    return `⏳ **Resume initiated**
Task ID: \`${shortTaskId}\`${resumeCountInfo}

Follow-up prompt sent. You can continue working or say 'waiting' and halt.`;
  },

  clearedAllTasks: (runningCount: number, totalCount: number) => `✓ **Cleared all background tasks**

Running tasks aborted: ${runningCount}
Total tasks cleared: ${totalCount}`,

  resumeResponse: (resumeCount: number, textContent: string) =>
    `✓ **Resume Response** (count: ${resumeCount})\n\n${textContent || "(No text response)"}`,

  resumeResponseNoContent: (resumeCount: number) =>
    `✓ **Resume Response** (count: ${resumeCount})\n\n(No response found)`,
};

// =============================================================================
// Error Messages
// =============================================================================

export const ERROR_MESSAGES = {
  // Task validation errors
  taskNotFound: (taskId: string) => `Task not found: ${taskId}`,
  taskNotFoundWithHint: (taskId: string) =>
    `Task not found: ${taskId}. Use asyncagents_list to see available tasks.`,

  // Resume validation errors
  taskCurrentlyResuming: "Task is currently being resumed. Wait for completion.",
  onlyCompletedCanResume: (currentStatus: string) =>
    `Only completed tasks can be resumed. Current status: ${currentStatus}`,
  sessionExpired: "Session expired or was deleted. Start a new asyncagents_task to continue.",

  // Launch validation errors
  agentRequired: "Agent parameter is required. Specify which agent to use.",
  promptRequired: "Prompt is required when resuming a task",

  // Generic errors
  launchFailed: (message: string) => `Failed to launch background task: ${message}`,
  cancelFailed: (message: string) => `Error cancelling task: ${message}`,
  listFailed: (message: string) => `Error listing tasks: ${message}`,
  outputFailed: (message: string) => `Error getting output: ${message}`,
  clearFailed: (message: string) => `Error clearing tasks: ${message}`,
  resumeFailed: (errorMsg: string) => `Error resuming task: ${errorMsg}`,
  fetchMessagesFailed: (errMsg: string) => `Error fetching messages: ${errMsg}`,

  // List empty states
  noTasksFound: "No background tasks found.",
  noTasksWithStatus: (status: string) => `No background tasks found with status "${status}".`,
  noTasksToClear: "No background tasks to clear.",
};

// =============================================================================
// Warnings
// =============================================================================

export const WARNING_MESSAGES = {
  resumeModeIgnoresParams: "Note: agent and description are ignored in resume mode.",
};

// =============================================================================
// Fork Messages
// =============================================================================

export const FORK_MESSAGES = {
  forkResumeConflict:
    "Cannot use fork and resume together. Use fork for new tasks with context, resume for continuing existing tasks.",

  preamble: `You are working with forked context from a parent agent session.
Note: Some older tool results may have been truncated to save tokens.
If you need complete file contents or detailed results, re-read the files directly.`,
};

// =============================================================================
// Notification Messages (sent to parent session)
// =============================================================================

export const NOTIFICATION_MESSAGES = {
  // Visible notification messages
  visibleTaskCompleted: (description: string, duration: string) =>
    `✓ **Agent "${description}" finished in ${duration}.**`,

  visibleTaskFailed: (description: string, duration: string) =>
    `✗ **Agent "${description}" failed in ${duration}.**`,

  visibleTaskCancelled: (description: string, duration: string) =>
    `⊘ **Agent "${description}" cancelled after ${duration}.**`,

  visibleResumeCompleted: (resumeCount: number, duration: string) =>
    `✓ **Resume #${resumeCount} completed in ${duration}.**`,

  visibleResumeFailed: (resumeCount: number, duration: string) =>
    `✗ **Resume #${resumeCount} failed in ${duration}.**`,

  taskProgressLine: (completed: number, total: number) => `Task Progress: ${completed}/${total}`,

  devHintIndicator: "[hint attached]",
};

// =============================================================================
// System Hint Messages (hidden from user, sent via session.prompt() with synthetic: true)
// =============================================================================

export const SYSTEM_HINT_MESSAGES = {
  runningTasksHint: (taskId: string) =>
    `If you need results immediately, use asyncagents_output(task_id="${taskId}").
You can continue working or just say 'waiting' and halt.
WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.`,

  allTasksDoneHint: (totalCount: number) =>
    `All ${totalCount} tasks finished.
Use asyncagents_output tools to see agent responses.`,

  errorHint: (taskId: string, errorMessage: string) =>
    `Task failed: ${errorMessage}
Use asyncagents_output(task_id="${taskId}") for details.`,

  resumeHint: (taskId: string) => `Use asyncagents_output(task_id="${taskId}") for full response.`,
};

// =============================================================================
// Toast Titles
// =============================================================================

export const TOAST_TITLES = {
  taskCompleted: "✓ Task completed",
  taskFailed: "✗ Task failed",
  taskCancelled: "⊘ Task cancelled",
  backgroundTasksRunning: (spinner: string) => {
    const prefix = process.env.OPENCODE_BGAGENT_PREFIX;
    const baseText = "AsyncAgents";
    return prefix ? `⛭ ${prefix} ${baseText}` : `⛭ ${baseText}`;
  },
  tasksComplete: "✓ Tasks complete",
};

// =============================================================================
// Status Notes (for formatTaskStatus)
// =============================================================================

export const STATUS_NOTES = {
  running: "\n\n> ⏳ **Running**: Task is still in progress. Check back later for results.",
  failed: (error: string) => `\n\n> ✗ **Failed**: ${error || "Unknown error"}`,
  cancelled: "\n\n> ⊘ **Cancelled**: Task was cancelled before completion.",
};

// =============================================================================
// Format Templates
// =============================================================================

export const FORMAT_TEMPLATES = {
  taskStatus: (
    icon: string,
    shortTaskId: string,
    description: string,
    agent: string,
    status: string,
    duration: string,
    progressSection: string,
    statusNote: string,
    promptPreview: string
  ) => `# ${icon} Task Status

| Field | Value |
|-------|-------|
| Task ID | \`${shortTaskId}\` |
| Description | ${description} |
| Agent | ${agent} |
| Status | ${icon} **${status}** |
| Duration | ${duration} |${progressSection}
${statusNote}
## Original Prompt

\`\`\`
${promptPreview}
\`\`\``,

  taskResult: (shortTaskId: string, description: string, duration: string, content: string) =>
    `✓ **Task Completed**

| Field | Value |
|-------|-------|
| Task ID | \`${shortTaskId}\` |
| Description | ${description} |
| Duration | ${duration} |

---

${content}`,

  taskResultError: (shortTaskId: string, description: string, duration: string, errMsg: string) =>
    `Task Result

Task ID: ${shortTaskId}
Description: ${description}
Duration: ${duration}

---

Error fetching messages: ${errMsg}`,

  listHeader: `# Background Tasks

| Task ID | Description | Agent | Status | Duration |
|---------|-------------|-------|--------|----------|`,

  listSummary: (
    total: number,
    running: number,
    completed: number,
    errored: number,
    cancelled: number
  ) =>
    `**Total: ${total}** | ⏳ ${running} running | ✓ ${completed} completed | ✗ ${errored} error | ⊘ ${cancelled} cancelled`,

  progressSection: (tools: string[]) => `\n| Last tools | ${tools.join(" → ")} |`,
};

// =============================================================================
// Placeholder Text
// =============================================================================

export const PLACEHOLDER_TEXT = {
  noMessagesFound: "(No messages found)",
  noAssistantResponse: "(No assistant response found)",
  noTextOutput: "(No text output)",
  noTextResponse: "(No text response)",
  noResponseFound: "(No response found)",
  andMoreFinished: (count: number) => `   ... and ${count} more finished`,
};
