import { beforeEach, describe, expect, it } from 'vitest';

import type { BackgroundTask, ConnectionStatus, InstanceInfo, StatsResponse } from '../../types';
import {
  selectFilteredRootTasks,
  selectFilteredTaskOrder,
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
  startedAt: overrides.startedAt ?? '2026-03-17T10:00:00.000Z',
  completedAt: overrides.completedAt,
  resultRetrievedAt: overrides.resultRetrievedAt,
  result: overrides.result,
  error: overrides.error,
  progress: overrides.progress,
  batchId: overrides.batchId ?? 'batch-1',
  resumeCount: overrides.resumeCount ?? 0,
  isForked: overrides.isForked ?? false,
  pendingResume: overrides.pendingResume,
  instanceId: overrides.instanceId,
  instanceName: overrides.instanceName,
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

const makeInstanceInfo = (overrides: Partial<InstanceInfo> = {}): InstanceInfo => ({
  instanceId: overrides.instanceId ?? 'inst-1',
  instanceName: overrides.instanceName ?? 'Instance 1',
  directory: overrides.directory ?? '/home/user/project',
  url: overrides.url ?? 'http://127.0.0.1:5165',
  color: overrides.color ?? '#3B82F6',
});

describe('agentStore — multi-instance', () => {
  beforeEach(() => {
    useAgentStore.setState({
      tasksById: {},
      taskOrder: [],
      selectedTaskId: null,
      instances: [],
      stats: null,
      instancesById: {},
      connectionStatus: {},
      selectedInstanceFilter: null,
    });
  });

  it('upsertTasksFromInstance stores tasks with compound key instanceId:sessionID', () => {
    const task = makeTask({ sessionID: 'sess-1' });
    const stats = makeStats();
    useAgentStore.getState().upsertTasksFromInstance('inst-1', [task], stats);

    const state = useAgentStore.getState();
    const compoundKey = 'inst-1:sess-1';
    expect(state.tasksById[compoundKey]).toBeDefined();
    expect(state.tasksById[compoundKey].sessionID).toBe('sess-1');
    expect(state.taskOrder).toContain(compoundKey);
  });

  it('applyTaskEventFromInstance updates compound-keyed task', () => {
    const task = makeTask({ sessionID: 'sess-2', description: 'original' });
    useAgentStore.getState().upsertTasksFromInstance('inst-1', [task], makeStats());

    const updated = makeTask({ sessionID: 'sess-2', description: 'updated' });
    useAgentStore.getState().applyTaskEventFromInstance('inst-1', updated);

    const state = useAgentStore.getState();
    expect(state.tasksById['inst-1:sess-2'].description).toBe('updated');
  });

  it('setInstanceInfo populates instancesById', () => {
    const info = makeInstanceInfo({ instanceId: 'inst-1', instanceName: 'My Instance' });
    useAgentStore.getState().setInstanceInfo('inst-1', info);

    const state = useAgentStore.getState();
    expect(state.instancesById['inst-1']).toBeDefined();
    expect(state.instancesById['inst-1'].instanceName).toBe('My Instance');
  });

  it('setConnectionStatus updates connectionStatus map', () => {
    useAgentStore.getState().setConnectionStatus('inst-1', 'connecting');
    expect(useAgentStore.getState().connectionStatus['inst-1']).toBe('connecting');

    useAgentStore.getState().setConnectionStatus('inst-1', 'connected');
    expect(useAgentStore.getState().connectionStatus['inst-1']).toBe('connected');

    const statuses: ConnectionStatus[] = ['connecting', 'connected', 'disconnected', 'error'];
    for (const status of statuses) {
      useAgentStore.getState().setConnectionStatus('inst-2', status);
      expect(useAgentStore.getState().connectionStatus['inst-2']).toBe(status);
    }
  });

  it('setInstanceFilter sets filter; null means all', () => {
    useAgentStore.getState().setInstanceFilter('inst-1');
    expect(useAgentStore.getState().selectedInstanceFilter).toBe('inst-1');

    useAgentStore.getState().setInstanceFilter(null);
    expect(useAgentStore.getState().selectedInstanceFilter).toBeNull();
  });

  it('removeInstance cleans up tasks and instance info', () => {
    const taskA = makeTask({ sessionID: 'sess-a' });
    const taskB = makeTask({ sessionID: 'sess-b' });
    useAgentStore.getState().upsertTasksFromInstance('inst-1', [taskA], makeStats());
    useAgentStore.getState().upsertTasksFromInstance('inst-2', [taskB], makeStats());
    useAgentStore.getState().setInstanceInfo('inst-1', makeInstanceInfo({ instanceId: 'inst-1' }));
    useAgentStore.getState().setConnectionStatus('inst-1', 'connected');

    useAgentStore.getState().removeInstance('inst-1');

    const state = useAgentStore.getState();
    expect(state.tasksById['inst-1:sess-a']).toBeUndefined();
    expect(state.taskOrder).not.toContain('inst-1:sess-a');
    expect(state.instancesById['inst-1']).toBeUndefined();
    expect(state.connectionStatus['inst-1']).toBeUndefined();
    // inst-2 tasks should be unaffected
    expect(state.tasksById['inst-2:sess-b']).toBeDefined();
  });

  it('selectFilteredRootTasks returns only tasks matching filter, or all if null', () => {
    const rootA = makeTask({ sessionID: 'root-a', parentSessionID: '' });
    const rootB = makeTask({ sessionID: 'root-b', parentSessionID: '' });
    useAgentStore.getState().upsertTasksFromInstance('inst-1', [rootA], makeStats());
    useAgentStore.getState().upsertTasksFromInstance('inst-2', [rootB], makeStats());

    // No filter — returns all
    useAgentStore.getState().setInstanceFilter(null);
    const all = selectFilteredRootTasks(useAgentStore.getState());
    expect(all.length).toBe(2);

    // Filter by inst-1
    useAgentStore.getState().setInstanceFilter('inst-1');
    const filtered = selectFilteredRootTasks(useAgentStore.getState());
    expect(filtered.length).toBe(1);
    expect(filtered[0].sessionID).toBe('root-a');
  });

  it('selectFilteredTaskOrder returns compound keys matching filter', () => {
    const taskA = makeTask({ sessionID: 'sess-a' });
    const taskB = makeTask({ sessionID: 'sess-b' });
    useAgentStore.getState().upsertTasksFromInstance('inst-1', [taskA], makeStats());
    useAgentStore.getState().upsertTasksFromInstance('inst-2', [taskB], makeStats());

    useAgentStore.getState().setInstanceFilter('inst-2');
    const order = selectFilteredTaskOrder(useAgentStore.getState());
    expect(order).toContain('inst-2:sess-b');
    expect(order).not.toContain('inst-1:sess-a');
  });

  it('Instance color auto-assignment: first instance gets color[0], second gets color[1]', () => {
    const INSTANCE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
    const info1 = makeInstanceInfo({ instanceId: 'inst-1', color: INSTANCE_COLORS[0] });
    const info2 = makeInstanceInfo({ instanceId: 'inst-2', color: INSTANCE_COLORS[1] });

    useAgentStore.getState().setInstanceInfo('inst-1', info1);
    useAgentStore.getState().setInstanceInfo('inst-2', info2);

    const state = useAgentStore.getState();
    const color1 = state.instancesById['inst-1']?.color;
    const color2 = state.instancesById['inst-2']?.color;

    // Colors should be from the palette
    expect(INSTANCE_COLORS).toContain(color1);
    expect(INSTANCE_COLORS).toContain(color2);
    // Colors should be distinct
    expect(color1).not.toBe(color2);
  });
});