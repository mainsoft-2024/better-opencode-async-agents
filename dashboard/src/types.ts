export type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled" | "resumed";
export type TaskPhase = "waiting" | "streaming" | "tool";

export interface TaskProgress {
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  lastTools: string[];
  lastUpdate: string;
  phase: TaskPhase;
  textCharCount: number;
  streamFrame: number;
  brailleFrame: number;
  progressBarFrame: number;
  waitingFrame: number;
  toolFrame: number;
}

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
  pendingResume?: { prompt: string; queuedAt: string };
}

export interface MessageFilter {
  fullSession?: boolean;
  includeThinking?: boolean;
  includeToolResults?: boolean;
  sinceMessageId?: string;
  messageLimit?: number;
  thinkingMaxChars?: number;
}

export type FilteredMessage = {
  id: string;
  role: string;
  type: string;
  content: string;
  thinking?: string;
  toolCalls?: any[];
  timestamp?: string;
};

export type DiscoveredInstance = {
  name: string;
  host: string;
  port: number;
  metadata: Record<string, string>;
};

export interface PaginatedTasksResponse {
  tasks: BackgroundTask[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatsResponse {
  byStatus: Record<string, number>;
  byAgent: Record<string, number>;
  toolCallsByName: Record<string, number>;
  toolCallsByAgent: Record<string, number>;
  duration: { avg: number; max: number; min: number; };
  totalTasks: number;
  activeTasks: number;
}

export interface TaskGroupResponse {
  groupId: string;
  tasks: BackgroundTask[];
  stats: {
    completed: number; running: number; error: number; cancelled: number;
    total: number; completionRate: number; totalToolCalls: number;
    toolCallsByName: Record<string, number>;
    toolCallsByAgent: Record<string, number>;
    duration: number;
  };
}

export type SSEEventType =
  | "snapshot" | "task.created" | "task.updated"
  | "task.completed" | "task.error" | "task.cancelled" | "heartbeat";

export interface SnapshotEvent { tasks: BackgroundTask[]; stats: StatsResponse; }
export interface TaskDeltaEvent { task: BackgroundTask; }
export interface HeartbeatEvent { ts: string; }