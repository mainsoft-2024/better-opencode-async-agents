import { create } from 'zustand';

import type { BackgroundTask, ConnectionStatus, DiscoveredInstance, InstanceInfo, StatsResponse } from '../types';

type TaskRecord = Record<string, BackgroundTask & { _compoundKey?: string }>;

export interface AgentStore {
  tasksById: TaskRecord;
  taskOrder: string[];
  selectedTaskId: string | null;
  instances: DiscoveredInstance[];
  stats: StatsResponse | null;
  instancesById: Record<string, InstanceInfo>;
  connectionStatus: Record<string, ConnectionStatus>;
  selectedInstanceFilter: string | null;

  upsertTasksFromSnapshot: (tasks: BackgroundTask[], stats: StatsResponse) => void;
  applyTaskEvent: (task: BackgroundTask) => void;
  setSelectedTask: (taskId: string | null) => void;
  setInstances: (instances: DiscoveredInstance[]) => void;
  upsertTasksFromInstance: (instanceId: string, tasks: BackgroundTask[], stats: StatsResponse) => void;
  applyTaskEventFromInstance: (instanceId: string, task: BackgroundTask) => void;
  setInstanceInfo: (instanceId: string, info: InstanceInfo) => void;
  setConnectionStatus: (instanceId: string, status: ConnectionStatus) => void;
  setInstanceFilter: (instanceId: string | null) => void;
  removeInstance: (instanceId: string) => void;
}

const toEpoch = (iso: string): number => {
  const epoch = Date.parse(iso);
  return Number.isNaN(epoch) ? 0 : epoch;
};

const sortByStartedAtDesc = (tasks: (BackgroundTask & { _compoundKey?: string })[]): (BackgroundTask & { _compoundKey?: string })[] => {
  return [...tasks].sort((a, b) => toEpoch(b.startedAt) - toEpoch(a.startedAt));
};

const getTaskOrderFromRecord = (tasksById: TaskRecord): string[] => {
  return sortByStartedAtDesc(Object.values(tasksById)).map((task) => {
    return task._compoundKey ?? task.sessionID;
  });
};

export const useAgentStore = create<AgentStore>()((set) => ({
  tasksById: {},
  taskOrder: [],
  selectedTaskId: null,
  instances: [],
  stats: null,
  instancesById: {},
  connectionStatus: {},
  selectedInstanceFilter: null,

  upsertTasksFromSnapshot: (tasks, stats) => {
    const tasksById = tasks.reduce<TaskRecord>((acc, task) => {
      const key = `local:${task.sessionID}`;
      acc[key] = { ...task, instanceId: task.instanceId ?? 'local', _compoundKey: key };
      return acc;
    }, {});

    set({
      tasksById,
      taskOrder: getTaskOrderFromRecord(tasksById),
      stats,
    });
  },

  applyTaskEvent: (task) => {
    set((state) => {
      const key = `local:${task.sessionID}`;
      const tasksById: TaskRecord = {
        ...state.tasksById,
        [key]: { ...task, instanceId: task.instanceId ?? 'local', _compoundKey: key },
      };

      return {
        tasksById,
        taskOrder: getTaskOrderFromRecord(tasksById),
      };
    });
  },

  setSelectedTask: (taskId) => {
    set({ selectedTaskId: taskId });
  },

  setInstances: (instances) => {
    set({ instances });
  },

  upsertTasksFromInstance: (instanceId, tasks, stats) => {
    set((state) => {
      const filtered = Object.fromEntries(
        Object.entries(state.tasksById).filter(([key]) => !key.startsWith(`${instanceId}:`))
      );
      const incoming = tasks.reduce<TaskRecord>((acc, task) => {
        const key = `${instanceId}:${task.sessionID}`;
        acc[key] = { ...task, instanceId, _compoundKey: key };
        return acc;
      }, {});
      const tasksById = { ...filtered, ...incoming };
      return {
        tasksById,
        taskOrder: getTaskOrderFromRecord(tasksById),
        stats: instanceId === 'local' ? stats : state.stats,
      };
    });
  },

  applyTaskEventFromInstance: (instanceId, task) => {
    set((state) => {
      const key = `${instanceId}:${task.sessionID}`;
      const tasksById: TaskRecord = {
        ...state.tasksById,
        [key]: { ...task, instanceId, _compoundKey: key },
      };
      return {
        tasksById,
        taskOrder: getTaskOrderFromRecord(tasksById),
      };
    });
  },

  setInstanceInfo: (instanceId, info) => {
    set((state) => ({
      instancesById: { ...state.instancesById, [instanceId]: info },
    }));
  },

  setConnectionStatus: (instanceId, status) => {
    set((state) => ({
      connectionStatus: { ...state.connectionStatus, [instanceId]: status },
    }));
  },

  setInstanceFilter: (instanceId) => {
    set({ selectedInstanceFilter: instanceId });
  },

  removeInstance: (instanceId) => {
    set((state) => {
      const tasksById = Object.fromEntries(
        Object.entries(state.tasksById).filter(([key]) => !key.startsWith(`${instanceId}:`))
      );
      const instancesById = { ...state.instancesById };
      delete instancesById[instanceId];
      const connectionStatus = { ...state.connectionStatus };
      delete connectionStatus[instanceId];
      return {
        tasksById,
        taskOrder: getTaskOrderFromRecord(tasksById),
        instancesById,
        connectionStatus,
      };
    });
  },
}));

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSelectedTask = (state: AgentStore): BackgroundTask | null => {
  if (!state.selectedTaskId) {
    return null;
  }
  return state.tasksById[state.selectedTaskId] ?? null;
};

export const selectRootTasks = (state: AgentStore): BackgroundTask[] => {
  return state.taskOrder
    .map((taskId) => state.tasksById[taskId])
    .filter((task): task is BackgroundTask => Boolean(task) && !task.parentSessionID);
};

export const selectChildrenByTaskId = (state: AgentStore): Map<string, BackgroundTask[]> => {
  const childrenByTaskId = new Map<string, BackgroundTask[]>();

  for (const task of Object.values(state.tasksById)) {
    if (!task.parentSessionID) {
      continue;
    }
    // Children are keyed by the parent's compound key (if available) or plain sessionID
    const parentKey =
      state.taskOrder.find((k) => k.endsWith(`:${task.parentSessionID}`)) ?? task.parentSessionID;
    const children = childrenByTaskId.get(parentKey) ?? [];
    children.push(task);
    childrenByTaskId.set(parentKey, children);
  }

  for (const [parentId, children] of childrenByTaskId.entries()) {
    childrenByTaskId.set(parentId, sortByStartedAtDesc(children));
  }

  return childrenByTaskId;
};

export const selectRunningTasks = (state: AgentStore): BackgroundTask[] => {
  return state.taskOrder
    .map((taskId) => state.tasksById[taskId])
    .filter((task): task is BackgroundTask => Boolean(task) && task.status === 'running');
};

export const selectFilteredRootTasks = (state: AgentStore): BackgroundTask[] => {
  const filter = state.selectedInstanceFilter;
  return state.taskOrder
    .filter((key) => !filter || key.startsWith(`${filter}:`))
    .map((key) => state.tasksById[key])
    .filter((task): task is BackgroundTask => Boolean(task) && !task.parentSessionID);
};

export const selectFilteredTaskOrder = (state: AgentStore): string[] => {
  const filter = state.selectedInstanceFilter;
  if (!filter) return state.taskOrder;
  return state.taskOrder.filter((key) => key.startsWith(`${filter}:`));
};

export const selectInstancesById = (state: AgentStore) => state.instancesById;
export const selectConnectionStatus = (state: AgentStore) => state.connectionStatus;

// ── Hooks ────────────────────────────────────────────────────────────────────

export const useSelectedTask = () => useAgentStore(selectSelectedTask);
export const useRootTasks = () => useAgentStore(selectRootTasks);
export const useChildrenByTaskId = () => useAgentStore(selectChildrenByTaskId);
export const useRunningTasks = () => useAgentStore(selectRunningTasks);
export const useFilteredRootTasks = () => useAgentStore(selectFilteredRootTasks);
export const useFilteredTaskOrder = () => useAgentStore(selectFilteredTaskOrder);
export const useInstancesById = () => useAgentStore(selectInstancesById);
export const useConnectionStatusMap = () => useAgentStore(selectConnectionStatus);
export const useInstanceFilter = () => useAgentStore((state) => state.selectedInstanceFilter);
export const useTaskById = (taskId: string | null) =>
  useAgentStore((state) => (taskId ? state.tasksById[taskId] ?? null : null));
export const useTaskOrder = () => useAgentStore((state) => state.taskOrder);
export const useInstances = () => useAgentStore((state) => state.instances);
export const useStats = () => useAgentStore((state) => state.stats);