import { beforeEach, describe, expect, it } from 'vitest';

import type { BackgroundTask, DiscoveredInstance, StatsResponse } from '../../types';
import {
  selectChildrenByTaskId,
  selectRootTasks,
  selectRunningTasks,
  selectSelectedTask,
  useAgentStore,
} from '../agentStore';

const makeTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: overrides.sessionID ?? 'task-1',
  parentSessionID: overrides.parentSessionID ?? '',
  parentMessageID: overrides.parentMessageID ?? '',
  parentAgent: overrides.parentAgent ?? '',
  description: overrides.description ?? 'Task description',
  prompt: overrides.prompt ?? 'Task prompt',
  agent: overrides.agent ?? 'coder',
  status: overrides.status ?? 'running',
  startedAt: overrides.startedAt ?? '2026-03-16T10:00:00.000Z',
  completedAt: overrides.completedAt,
  resultRetrievedAt: overrides.resultRetrievedAt,
  result: overrides.result,
  error: overrides.error,
  progress: overrides.progress,
  batchId: overrides.batchId ?? 'batch-1',
  resumeCount: overrides.resumeCount ?? 0,
  isForked: overrides.isForked ?? false,
  pendingResume: overrides.pendingResume,
});

const makeStats = (overrides: Partial<StatsResponse> = {}): StatsResponse => ({
  byStatus: overrides.byStatus ?? { running: 1 },
  byAgent: overrides.byAgent ?? { coder: 1 },
  toolCallsByName: overrides.toolCallsByName ?? {},
  toolCallsByAgent: overrides.toolCallsByAgent ?? {},
  duration: overrides.duration ?? { avg: 0, max: 0, min: 0 },
  totalTasks: overrides.totalTasks ?? 1,
  activeTasks: overrides.activeTasks ?? 1,
});

describe('agentStore', () => {
  beforeEach(() => {
    useAgentStore.setState({
      tasksById: {},
      taskOrder: [],
      selectedTaskId: null,
      instances: [],
      stats: null,
    });
  });

  it('upsertTasksFromSnapshot replaces all tasks and sorts taskOrder by startedAt desc', () => {
    const staleTask = makeTask({ sessionID: 'stale-task', startedAt: '2026-03-16T08:00:00.000Z' });
    useAgentStore.setState({ tasksById: { [staleTask.sessionID]: staleTask }, taskOrder: [staleTask.sessionID] });

    const newerTask = makeTask({ sessionID: 'task-new', startedAt: '2026-03-16T12:00:00.000Z' });
    const olderTask = makeTask({ sessionID: 'task-old', startedAt: '2026-03-16T09:00:00.000Z' });
    const stats = makeStats({ totalTasks: 2, activeTasks: 2 });

    useAgentStore.getState().upsertTasksFromSnapshot([olderTask, newerTask], stats);

    const state = useAgentStore.getState();
    expect(Object.keys(state.tasksById)).toEqual(expect.arrayContaining(['local:task-old', 'local:task-new']));
    expect(state.tasksById['local:stale-task']).toBeUndefined();
    expect(state.taskOrder).toEqual(['local:task-new', 'local:task-old']);
    expect(state.stats).toEqual(stats);
  });

  it('applyTaskEvent upserts single task and preserves existing tasks', () => {
    const firstTask = makeTask({ sessionID: 'task-1', description: 'first' });
    const secondTask = makeTask({ sessionID: 'task-2', description: 'second' });

    useAgentStore.getState().upsertTasksFromSnapshot([firstTask, secondTask], makeStats({ totalTasks: 2, activeTasks: 2 }));

    const updatedFirstTask = makeTask({ sessionID: 'task-1', description: 'first-updated' });
    useAgentStore.getState().applyTaskEvent(updatedFirstTask);

    const state = useAgentStore.getState();
    expect(state.tasksById['local:task-1'].description).toBe('first-updated');
    expect(state.tasksById['local:task-2'].description).toBe('second');
    expect(state.taskOrder).toContain('local:task-1');
    expect(state.taskOrder).toContain('local:task-2');
  });

  it('applyTaskEvent adds new task to taskOrder if not present', () => {
    const existingTask = makeTask({ sessionID: 'task-1', startedAt: '2026-03-16T09:00:00.000Z' });
    useAgentStore.getState().upsertTasksFromSnapshot([existingTask], makeStats());

    const newTask = makeTask({ sessionID: 'task-2', startedAt: '2026-03-16T11:00:00.000Z' });
    useAgentStore.getState().applyTaskEvent(newTask);

    const state = useAgentStore.getState();
    expect(state.taskOrder).toEqual(['local:task-2', 'local:task-1']);
  });

  it('setSelectedTask updates selectedTaskId', () => {
    useAgentStore.getState().setSelectedTask('task-123');
    expect(useAgentStore.getState().selectedTaskId).toBe('task-123');

    useAgentStore.getState().setSelectedTask(null);
    expect(useAgentStore.getState().selectedTaskId).toBeNull();
  });

  it('setInstances replaces instances array', () => {
    const firstInstances: DiscoveredInstance[] = [
      { name: 'local', host: '127.0.0.1', port: 5165, metadata: { env: 'dev' } },
    ];
    const nextInstances: DiscoveredInstance[] = [
      { name: 'remote', host: '192.168.0.10', port: 5165, metadata: { env: 'prod' } },
    ];

    useAgentStore.getState().setInstances(firstInstances);
    expect(useAgentStore.getState().instances).toEqual(firstInstances);

    useAgentStore.getState().setInstances(nextInstances);
    expect(useAgentStore.getState().instances).toEqual(nextInstances);
  });

  it('selector: selectedTask returns correct task or null', () => {
    const task = makeTask({ sessionID: 'task-1' });
    useAgentStore.getState().upsertTasksFromSnapshot([task], makeStats());

    useAgentStore.getState().setSelectedTask('local:task-1');
    expect(selectSelectedTask(useAgentStore.getState())).toMatchObject(task);

    useAgentStore.getState().setSelectedTask('missing-task');
    expect(selectSelectedTask(useAgentStore.getState())).toBeNull();
  });

  it('selector: rootTasks returns only tasks without parentSessionID', () => {
    const rootA = makeTask({ sessionID: 'root-a', parentSessionID: '' });
    const rootB = makeTask({ sessionID: 'root-b', parentSessionID: '' });
    const child = makeTask({ sessionID: 'child', parentSessionID: 'root-a' });

    useAgentStore.getState().upsertTasksFromSnapshot([rootA, rootB, child], makeStats({ totalTasks: 3, activeTasks: 3 }));

    const roots = selectRootTasks(useAgentStore.getState());
    expect(roots.map((task) => task.sessionID)).toEqual(expect.arrayContaining(['root-a', 'root-b']));
    expect(roots.some((task) => task.sessionID === 'child')).toBe(false);
  });

  it('selector: childrenByTaskId returns correct map', () => {
    const parentA = makeTask({ sessionID: 'parent-a', parentSessionID: '' });
    const parentB = makeTask({ sessionID: 'parent-b', parentSessionID: '' });
    const childA1 = makeTask({ sessionID: 'child-a1', parentSessionID: 'parent-a', startedAt: '2026-03-16T10:00:00.000Z' });
    const childA2 = makeTask({ sessionID: 'child-a2', parentSessionID: 'parent-a', startedAt: '2026-03-16T11:00:00.000Z' });
    const childB1 = makeTask({ sessionID: 'child-b1', parentSessionID: 'parent-b' });

    useAgentStore.getState().upsertTasksFromSnapshot(
      [parentA, parentB, childA1, childA2, childB1],
      makeStats({ totalTasks: 5, activeTasks: 5 }),
    );

    const childrenByTaskId = selectChildrenByTaskId(useAgentStore.getState());

    expect(childrenByTaskId.get('local:parent-a')?.map((task) => task.sessionID)).toEqual(['child-a2', 'child-a1']);
    expect(childrenByTaskId.get('local:parent-b')?.map((task) => task.sessionID)).toEqual(['child-b1']);
    expect(childrenByTaskId.get('missing')).toBeUndefined();
  });

  it('selector: runningTasks returns only running tasks', () => {
    const runningA = makeTask({ sessionID: 'running-a', status: 'running', startedAt: '2026-03-16T10:00:00.000Z' });
    const runningB = makeTask({ sessionID: 'running-b', status: 'running', startedAt: '2026-03-16T11:00:00.000Z' });
    const completed = makeTask({ sessionID: 'completed', status: 'completed', startedAt: '2026-03-16T12:00:00.000Z' });

    useAgentStore.getState().upsertTasksFromSnapshot(
      [runningA, runningB, completed],
      makeStats({ totalTasks: 3, activeTasks: 2, byStatus: { running: 2, completed: 1 } }),
    );

    const runningTasks = selectRunningTasks(useAgentStore.getState());
    expect(runningTasks.map((task) => task.sessionID)).toEqual(['running-b', 'running-a']);
    expect(runningTasks.every((task) => task.status === 'running')).toBe(true);
  });
});