import type { PluginInput } from "@opencode-ai/plugin";

// =============================================================================
// Types
// =============================================================================

export type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled" | "resumed";

export interface TaskProgress {
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  lastTools: string[];
  lastUpdate: string;
}

/**
 * Minimal metadata persisted to disk.
 * OpenCode stores chat history, we only store what's not available there.
 */
export interface PersistedTask {
  description: string;
  agent: string;
  parentSessionID: string;
  createdAt: string;
  status: BackgroundTaskStatus;
  resumeCount?: number;
  isForked?: boolean;
  // Extended fields for HTTP Status API
  completedAt?: string;
  error?: string;
  result?: string;
  progress?: TaskProgress;
  startedAt?: string;
  batchId?: string;
}

/**
 * Full task object used in memory.
 * sessionID is the task identifier (no separate id field).
 */
export interface BackgroundTask {
  sessionID: string;
  parentSessionID: string;
  parentMessageID: string;
  parentAgent: string;
  description: string;
  prompt: string;
  agent: string;
  status: BackgroundTaskStatus;
  startedAt: string;
  completedAt?: string;
  resultRetrievedAt?: string;
  result?: string;
  error?: string;
  progress?: TaskProgress;
  batchId: string;
  resumeCount: number;
  isForked: boolean;
}

export interface LaunchInput {
  /** Task ID to resume (if provided, enters resume mode) */
  resume?: string;
  /** Fork parent context to child session (creates session with inherited history) */
  fork?: boolean;
  description: string;
  prompt: string;
  agent: string;
  parentSessionID: string;
  parentMessageID: string;
  parentAgent: string;
}

export type OpencodeClient = PluginInput["client"];
