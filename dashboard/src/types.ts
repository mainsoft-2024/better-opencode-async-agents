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
  instanceId?: string;
  instanceName?: string;
}

export type InstanceInfo = {
  instanceId: string;
  instanceName: string;
  directory: string;
  url: string;
  color: string;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

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
  instanceId?: string;
  instanceName?: string;
  directory?: string;
  url?: string;
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

export interface SnapshotEvent { tasks: BackgroundTask[]; stats: StatsResponse; instanceId?: string; instanceName?: string; }
export interface TaskDeltaEvent { task: BackgroundTask; }
export interface HeartbeatEvent { ts: string; instanceId?: string; instanceName?: string; }

export interface MessageGroup {
  speakerId: string;
  speakerRole: string;
  speakerName: string;
  messages: FilteredMessage[];
  startTime?: string;
  endTime?: string;
}

export interface TimelineEvent {
  id: string;
  taskId: string;
  messageId: string;
  toolName: string;
  status: "running" | "completed" | "error";
  startTime: number;
  endTime?: number;
  duration?: number;
  args?: string;
  result?: string;
}

export interface FloatingPanelState {
  id: string;
  taskId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  minimized: boolean;
  zIndex: number;
}

export interface AgentTreeNode {
  task: BackgroundTask;
  children: AgentTreeNode[];
  depth: number;
  isExpanded: boolean;
}

export interface AgentGraphNode {
  id: string;
  taskId: string;
  label: string;
  status: BackgroundTaskStatus;
  agent: string;
}

export interface AgentGraphEdge {
  id: string;
  source: string;
  target: string;
}