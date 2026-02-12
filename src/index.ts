import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { BackgroundManager } from "./manager";
import { StatusApiServer } from "./server";
import {
  createBackgroundCancel,
  createBackgroundClear,
  createBackgroundList,
  createBackgroundOutput,
  createBackgroundTask,
} from "./tools";

// Re-export types for consumers
export type { BackgroundTask, BackgroundTaskStatus, TaskProgress, LaunchInput } from "./types";
// Note: BackgroundManager is not exported to avoid OpenCode plugin loader issues
// (it tries to call all exports as functions, which fails for classes)

/**
 * OpenCode Background Agent Plugin
 *
 * Provides tools for launching and managing asynchronous background tasks
 * that run in separate sessions while the main conversation continues.
 */
export default async function plugin(ctx: PluginInput): Promise<Hooks> {
  const manager = new BackgroundManager(ctx);

  // Start HTTP Status API server
  const server = await StatusApiServer.start(manager);
  if (server) {
    const cleanup = () => {
      server.stop();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);
  }

  return {
    tool: {
      asyncagents_task: createBackgroundTask(manager),
      asyncagents_output: createBackgroundOutput(manager),
      asyncagents_cancel: createBackgroundCancel(manager),
      asyncagents_list: createBackgroundList(manager),
      asyncagents_clear: createBackgroundClear(manager),
    },
    event: async () => {
      // Event handling is started in the manager constructor
    },
  };
}
