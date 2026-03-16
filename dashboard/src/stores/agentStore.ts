import { create } from 'zustand';

import type { BackgroundTask, DiscoveredInstance, StatsResponse } from '../types';

type TaskRecord = Record<string, BackgroundTask>;

export interface AgentStore {
  tasksById: TaskRecord;
  taskOrder: string[];
  selectedTaskId: string | null;
  instances: DiscoveredInstance[];
  stats: StatsResponse | null;

  upsertTasksFromSnapshot: (tasks: BackgroundTask[], stats: StatsResponse) => void;
  applyTaskEvent: (task: BackgroundTask) => void;
  setSelectedTask: (taskId: string | null) => void;
  setInstances: (instances: DiscoveredInstance[]) => void;
}

const toEpoch = (iso: string): number => {
  const epoch = Date.parse(iso);
  return Number.isNaN(epoch) ? 0 : epoch;
};

const sortByStartedAtDesc = (tasks: BackgroundTask[]): BackgroundTask[] => {
  return [...tasks].sort((a, b) => toEpoch(b.startedAt) - toEpoch(a.startedAt));
};

const getTaskOrder = (tasksById: TaskRecord): string[] => {
  return sortByStartedAtDesc(Object.values(tasksById)).map((task) => task.sessionID);
};

export const useAgentStore = create<AgentStore>()((set) => ({
  tasksById: {},
  taskOrder: [],
  selectedTaskId: null,
  instances: [],
  stats: null,

  upsertTasksFromSnapshot: (tasks, stats) => {
    const tasksById = tasks.reduce<TaskRecord>((acc, task) => {
      acc[task.sessionID] = task;
      return acc;
    }, {});

    set({
      tasksById,
      taskOrder: getTaskOrder(tasksById),
      stats,
    });
  },

  applyTaskEvent: (task) => {
    set((state) => {
      const tasksById: TaskRecord = {
        ...state.tasksById,
        [task.sessionID]: task,
      };

      return {
        tasksById,
        taskOrder: getTaskOrder(tasksById),
      };
    });
  },

  setSelectedTask: (taskId) => {
    set({ selectedTaskId: taskId });
  },

  setInstances: (instances) => {
    set({ instances });
  },
}));

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

    const children = childrenByTaskId.get(task.parentSessionID) ?? [];
    children.push(task);
    childrenByTaskId.set(task.parentSessionID, children);
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

export const useSelectedTask = () => useAgentStore(selectSelectedTask);
export const useRootTasks = () => useAgentStore(selectRootTasks);
export const useChildrenByTaskId = () => useAgentStore(selectChildrenByTaskId);
export const useRunningTasks = () => useAgentStore(selectRunningTasks);
export const useTaskById = (taskId: string | null) =>
  useAgentStore((state) => (taskId ? state.tasksById[taskId] ?? null : null));
export const useTaskOrder = () => useAgentStore((state) => state.taskOrder);
export const useInstances = () => useAgentStore((state) => state.instances);
export const useStats = () => useAgentStore((state) => state.stats);