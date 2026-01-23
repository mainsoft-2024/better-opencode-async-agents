# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-01-23

### Breaking Changes
- **Changed Task ID format**: Task IDs have changed from `bg_*` format to session ID format (`ses_*`).
- **Removed `id` from `BackgroundTask`**: The `id` field has been removed. Use `sessionID` instead to identify tasks.
- **Invalidated old task IDs**: Task IDs from previous versions are no longer valid and cannot be used with `background_output` or `background_task`.
- **Changed notification message format**: Notifications now use emoji + bold pattern (e.g., `✓ **Background task completed**`) instead of bracket format (e.g., `[BACKGROUND TASK COMPLETED]`).
- **Removed preview section from resume notifications**: Resume completion notifications no longer include a response preview.

### Added
- **Persistent Task Metadata**: Task metadata is now persisted to disk at `~/.opencode/plugins/background-agent/tasks.json`.
- **Durable Tasks**: Tasks now survive plugin restarts and can be resumed indefinitely as long as the session exists in OpenCode.
- **GitHub-style short IDs**: Task IDs now display in short format (e.g., `ses_41e08091` instead of full `ses_41e080918ffeyhQtX6E4vERe4O`). All tools accept both short and full IDs.
- **Prefix matching for task IDs**: You can now use any unique prefix to reference a task (e.g., `ses_41e0` if it uniquely identifies a task).
- **`fork` parameter for `background_task` tool to inherit parent conversation context**
- **Context processing utilities for token counting and tool result truncation**
- **`(forked)` indicator in task listings**
- **Fork preamble injection for context-aware child agents**

### Changed
- **`background_clear` behavior**: The `background_clear` tool now only clears the in-memory task cache. It no longer deletes task metadata from disk storage.
- **Simplified launch message**: Removed redundant "Use `background_output` with task_id=..." instruction from launch messages.
- **Cleaner toast notifications**: Toast titles now use emoji format (e.g., `✓ Task completed` instead of `Background Task COMPLETED`).
- **Resume count display**: Resume notifications only show count for 2nd+ resumes (e.g., `✓ **Resume #2 completed**`).

### Migration
Users must update any code or external systems referencing `task.id` to use `task.sessionID`.
Existing tasks created in previous versions cannot be resumed or retrieved.

Short IDs are now accepted but full IDs still work, so no migration is required for task references.

```typescript
// Before
const taskId = task.id;

// After
const sessionID = task.sessionID;
```

## [2.0.0] - 2026-01-22

### Breaking Changes
- **Removed** `background_resume` tool - use `background_task(resume: id, prompt: msg)` instead
- **Removed** `background_block` tool - use `background_output(task_id: id, block: true)` instead

### Changed
- `background_task` now supports resume mode with optional `resume` parameter for continuing existing tasks
- `background_output` now supports optional `block` and `timeout` parameters for blocking mode
- `background_list` shows `(resumed)` indicator for tasks that have been resumed

### Migration
```typescript
// Resume: Before
background_resume(task_id: 'abc123', message: 'continue working on this')
// Resume: After
background_task(resume: 'abc123', prompt: 'continue working on this')

// Block: Before
background_block(task_ids: ['abc123'], timeout: 60000)  // timeout in ms
// Block: After
background_output(task_id: 'abc123', block: true, timeout: 60)  // timeout in seconds
```

## [0.1.1] - 2026-01-20

### Fixed
- Corrected npm package name in README badges and installation instructions
- Fixed GitHub repository links throughout documentation
- Added bugs and homepage URLs to package.json

## [0.1.0] - 2026-01-19

### Added
- Initial release of @paulp-o/opencode-background-agent
- `background_task` tool for launching async agent tasks
- `background_output` tool for retrieving task results
- `background_cancel` tool for cancelling running tasks
- `background_list` tool for listing all tasks
- `background_clear` tool for clearing all tasks
- Real-time progress tracking with toast notifications
- Automatic task completion notifications
- npm release system with conventional commits
