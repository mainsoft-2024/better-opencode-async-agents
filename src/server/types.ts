import type { BackgroundTask, BackgroundTaskStatus } from "../types";

// =============================================================================
// REST Response Types
// =============================================================================

export interface HealthResponse {
  status: "ok";
  uptime: number; // seconds
  version: string;
  taskCount: number;
}

export interface StatsResponse {
  byStatus: Record<string, number>;
  byAgent: Record<string, number>;
  duration: {
    avg: number; // ms
    max: number;
    min: number;
  };
  totalTasks: number;
  activeTasks: number;
}

export interface PaginatedTasksResponse {
  tasks: BackgroundTask[];
  total: number;
  limit: number;
  offset: number;
}

export interface TaskLogsResponse {
  messages: unknown[]; // Message array from getTaskMessages
  taskId: string;
  retrievedAt: string; // ISO 8601
}

export interface TaskGroupResponse {
  groupId: string;
  tasks: BackgroundTask[];
  stats: {
    completed: number;
    running: number;
    error: number;
    cancelled: number;
    total: number;
    completionRate: number; // 0-1
    totalToolCalls: number;
    duration: number; // ms
  };
}

export interface ErrorResponse {
  error: string;
  status: number;
}

// =============================================================================
// SSE Event Types
// =============================================================================

export type SSEEventType =
  | "snapshot"
  | "task.created"
  | "task.updated"
  | "task.completed"
  | "task.error"
  | "task.cancelled"
  | "heartbeat";

export interface SnapshotEvent {
  tasks: BackgroundTask[];
  stats: StatsResponse;
}

export interface TaskDeltaEvent {
  task: BackgroundTask;
}

export interface HeartbeatEvent {
  ts: string; // ISO 8601
}

export type SSEEventData = SnapshotEvent | TaskDeltaEvent | HeartbeatEvent;

// =============================================================================
// Server Discovery
// =============================================================================

export interface ServerInfo {
  port: number;
  pid: number;
  startedAt: string; // ISO 8601
  url: string;
  version: string;
}
