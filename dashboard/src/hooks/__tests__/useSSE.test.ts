import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentStore } from '../../stores/agentStore';
import { useSSE } from '../useSSE';

// --- Mock EventSource ---
type EventHandler = (event: MessageEvent<string>) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  private handlers: Map<string, EventHandler[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: EventHandler) {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler]);
  }

  emit(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const handler of this.handlers.get(type) ?? []) {
      handler(event);
    }
  }

  close() {}
}

vi.stubGlobal('EventSource', MockEventSource);

// Reset store and mock instances before each test
beforeEach(() => {
  MockEventSource.instances = [];
  useAgentStore.setState({
    tasksById: {},
    taskOrder: [],
    selectedTaskId: null,
    instances: [],
    stats: null,
  });
});

const makeTask = (id: string, startedAt = '2026-01-01T00:00:00Z') => ({
  sessionID: id,
  description: 'task-' + id,
  status: 'running' as const,
  startedAt,
  agent: 'coder',
  parentSessionID: '',
  parentMessageID: '',
  parentAgent: '',
  prompt: '',
  batchId: '',
  resumeCount: 0,
  isForked: false,
});

const makeStats = () => ({ running: 1, completed: 0, failed: 0, total: 1 });

describe('useSSE', () => {
  it('snapshot event dispatches to agentStore.upsertTasksFromSnapshot', () => {
    const { result } = renderHook(() => useSSE('http://localhost:5165'));
    const sse = MockEventSource.instances[0];

    const tasks = [makeTask('abc'), makeTask('def')];
    const stats = makeStats();

    act(() => {
      sse.emit('snapshot', { tasks, stats });
    });

    const state = useAgentStore.getState();
    expect(Object.keys(state.tasksById)).toHaveLength(2);
    expect(state.tasksById['local:abc'].sessionID).toBe('abc');
    expect(state.tasksById['local:def'].sessionID).toBe('def');
    expect(state.stats).toEqual(stats);
    expect(result.current.error).toBeNull();
  });

  it('task.updated event dispatches to agentStore.applyTaskEvent', () => {
    // Seed store with one task
    const existingTask = makeTask('xyz');
    useAgentStore.setState({
      tasksById: { xyz: existingTask },
      taskOrder: ['xyz'],
      selectedTaskId: null,
      instances: [],
      stats: null,
    });

    const { result } = renderHook(() => useSSE('http://localhost:5165'));
    const sse = MockEventSource.instances[0];

    const updatedTask = { ...existingTask, status: 'completed' as const };
    act(() => {
      sse.emit('task.updated', { task: updatedTask });
    });

    const state = useAgentStore.getState();
    expect(state.tasksById['local:xyz'].status).toBe('completed');
    expect(result.current.error).toBeNull();
  });

  it('reconnect after disconnect still merges with cached store data', () => {
    // Pre-populate store with cached task
    const cachedTask = makeTask('cached');
    useAgentStore.setState({
      tasksById: { cached: cachedTask },
      taskOrder: ['cached'],
      selectedTaskId: null,
      instances: [],
      stats: null,
    });

    renderHook(() => useSSE('http://localhost:5165'));
    const sse = MockEventSource.instances[0];

    // Simulate a new task arriving after reconnect (task.created uses applyTaskEvent)
    const newTask = makeTask('newone');
    act(() => {
      sse.emit('task.created', { task: newTask });
    });

    const state = useAgentStore.getState();
    // Both cached task and new task should be in the store
    expect(state.tasksById['cached']).toBeDefined();
    expect(state.tasksById['local:newone']).toBeDefined();
    expect(Object.keys(state.tasksById)).toHaveLength(2);
  });
});
