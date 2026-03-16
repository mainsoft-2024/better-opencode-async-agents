import { describe, it, expect } from 'vitest';
import { buildAgentTree } from '../buildAgentTree';
import type { BackgroundTask } from '../../types';

function makeTask(overrides: Partial<BackgroundTask> & { sessionID: string }): BackgroundTask {
  return {
    parentSessionID: overrides.parentSessionID ?? '',
    parentMessageID: '',
    parentAgent: '',
    description: overrides.description ?? 'task',
    prompt: '',
    agent: overrides.agent ?? 'coder',
    status: overrides.status ?? 'completed',
    startedAt: overrides.startedAt ?? '2026-01-01T00:00:00Z',
    batchId: '',
    resumeCount: 0,
    isForked: false,
    ...overrides,
  };
}

describe('buildAgentTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildAgentTree([])).toEqual([]);
  });

  it('flat tasks (no parent) are all root nodes', () => {
    const tasks = [
      makeTask({ sessionID: 'a', startedAt: '2026-01-01T01:00:00Z' }),
      makeTask({ sessionID: 'b', startedAt: '2026-01-01T02:00:00Z' }),
      makeTask({ sessionID: 'c', startedAt: '2026-01-01T03:00:00Z' }),
    ];
    const tree = buildAgentTree(tasks);
    expect(tree).toHaveLength(3);
    tree.forEach(node => {
      expect(node.children).toHaveLength(0);
      expect(node.depth).toBe(0);
    });
  });

  it('sets isExpanded=true by default', () => {
    const tasks = [makeTask({ sessionID: 'x' })];
    const tree = buildAgentTree(tasks);
    expect(tree[0].isExpanded).toBe(true);
  });

  it('correctly builds parent-child-grandchild nesting', () => {
    const tasks = [
      makeTask({ sessionID: 'root', startedAt: '2026-01-01T00:00:00Z' }),
      makeTask({ sessionID: 'child', parentSessionID: 'root', startedAt: '2026-01-01T01:00:00Z' }),
      makeTask({ sessionID: 'grandchild', parentSessionID: 'child', startedAt: '2026-01-01T02:00:00Z' }),
    ];
    const tree = buildAgentTree(tasks);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.task.sessionID).toBe('root');
    expect(root.depth).toBe(0);
    expect(root.children).toHaveLength(1);
    const child = root.children[0];
    expect(child.task.sessionID).toBe('child');
    expect(child.depth).toBe(1);
    expect(child.children).toHaveLength(1);
    const grandchild = child.children[0];
    expect(grandchild.task.sessionID).toBe('grandchild');
    expect(grandchild.depth).toBe(2);
    expect(grandchild.children).toHaveLength(0);
  });

  it('promotes orphans (missing parent) to root', () => {
    const tasks = [
      makeTask({ sessionID: 'a', parentSessionID: 'missing-parent', startedAt: '2026-01-01T00:00:00Z' }),
      makeTask({ sessionID: 'b', startedAt: '2026-01-01T01:00:00Z' }),
    ];
    const tree = buildAgentTree(tasks);
    expect(tree).toHaveLength(2);
    const ids = tree.map(n => n.task.sessionID);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    tree.forEach(n => expect(n.depth).toBe(0));
  });

  it('sorts children by startedAt descending (most recent first)', () => {
    const tasks = [
      makeTask({ sessionID: 'parent', startedAt: '2026-01-01T00:00:00Z' }),
      makeTask({ sessionID: 'c1', parentSessionID: 'parent', startedAt: '2026-01-01T01:00:00Z' }),
      makeTask({ sessionID: 'c2', parentSessionID: 'parent', startedAt: '2026-01-01T03:00:00Z' }),
      makeTask({ sessionID: 'c3', parentSessionID: 'parent', startedAt: '2026-01-01T02:00:00Z' }),
    ];
    const tree = buildAgentTree(tasks);
    const parent = tree.find(n => n.task.sessionID === 'parent')!;
    const childIds = parent.children.map(n => n.task.sessionID);
    expect(childIds).toEqual(['c2', 'c3', 'c1']); // most recent first
  });

  it('sorts root nodes by startedAt descending', () => {
    const tasks = [
      makeTask({ sessionID: 'r1', startedAt: '2026-01-01T01:00:00Z' }),
      makeTask({ sessionID: 'r2', startedAt: '2026-01-01T03:00:00Z' }),
      makeTask({ sessionID: 'r3', startedAt: '2026-01-01T02:00:00Z' }),
    ];
    const tree = buildAgentTree(tasks);
    const ids = tree.map(n => n.task.sessionID);
    expect(ids).toEqual(['r2', 'r3', 'r1']);
  });

  it('depth values are correct at each level', () => {
    const tasks = [
      makeTask({ sessionID: 'l0', startedAt: '2026-01-01T00:00:00Z' }),
      makeTask({ sessionID: 'l1', parentSessionID: 'l0', startedAt: '2026-01-01T01:00:00Z' }),
      makeTask({ sessionID: 'l2', parentSessionID: 'l1', startedAt: '2026-01-01T02:00:00Z' }),
      makeTask({ sessionID: 'l3', parentSessionID: 'l2', startedAt: '2026-01-01T03:00:00Z' }),
    ];
    const tree = buildAgentTree(tasks);
    const l0node = tree[0];
    const l1node = l0node.children[0];
    const l2node = l1node.children[0];
    const l3node = l2node.children[0];
    expect(l0node.depth).toBe(0);
    expect(l1node.depth).toBe(1);
    expect(l2node.depth).toBe(2);
    expect(l3node.depth).toBe(3);
  });
});