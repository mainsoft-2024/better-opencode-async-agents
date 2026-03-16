import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentTreeView } from '../AgentTreeView';
import { useAgentStore } from '../../../stores/agentStore';
import { useUIStore } from '../../../stores/uiStore';
import type { BackgroundTask } from '../../../types';

// — Helpers ——————————————————————————————————————————————————————————————————————————————

function makeTask(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    sessionID: 'sess-1',
    parentSessionID: '',
    parentMessageID: '',
    parentAgent: '',
    description: 'Test task',
    prompt: 'do something',
    agent: 'coder',
    status: 'running',
    startedAt: new Date().toISOString(),
    batchId: 'b1',
    resumeCount: 0,
    isForked: false,
    ...overrides,
  };
}

function setStoreState(tasks: BackgroundTask[], selectedId: string | null = null) {
  const tasksById = Object.fromEntries(tasks.map((t) => [t.sessionID, t]));
  const taskOrder = tasks.map((t) => t.sessionID);
  useAgentStore.setState({ tasksById, taskOrder, selectedTaskId: selectedId });
}

// — Mock framer-motion to avoid layout engine issues in jsdom ——————————————
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: {
      div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement('div', rest, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// — Tests ——————————————————————————————————————————————————————————————————————————————

describe('AgentTreeView', () => {
  beforeEach(() => {
    useAgentStore.setState({ tasksById: {}, taskOrder: [], selectedTaskId: null });
    useUIStore.setState({ floatingPanels: [] } as any);
  });

  it('renders empty state when no tasks', () => {
    setStoreState([]);
    render(<AgentTreeView />);
    expect(screen.getByText('No agents running')).toBeDefined();
  });

  it('renders root tasks', () => {
    const t1 = makeTask({ sessionID: 'a', description: 'Root task A', agent: 'planner' });
    const t2 = makeTask({ sessionID: 'b', description: 'Root task B', agent: 'coder', status: 'completed' });
    setStoreState([t1, t2]);
    render(<AgentTreeView />);
    expect(screen.getAllByTestId('tree-node').length).toBe(2);
    expect(screen.getByText('planner')).toBeDefined();
    expect(screen.getByText('coder')).toBeDefined();
  });

  it('expands and collapses children', () => {
    const parent = makeTask({ sessionID: 'parent', agent: 'planner', description: 'parent' });
    const child = makeTask({ sessionID: 'child', agent: 'coder', description: 'child', parentSessionID: 'parent' });
    setStoreState([parent, child]);
    render(<AgentTreeView />);

    // Both visible initially (isExpanded defaults true in buildAgentTree)
    expect(screen.getAllByTestId('tree-node').length).toBe(2);

    // Collapse
    const collapseBtn = screen.getByLabelText('Collapse');
    fireEvent.click(collapseBtn);
    expect(screen.getAllByTestId('tree-node').length).toBe(1);

    // Expand again
    const expandBtn = screen.getByLabelText('Expand');
    fireEvent.click(expandBtn);
    expect(screen.getAllByTestId('tree-node').length).toBe(2);
  });

  it('calls setSelectedTask on node click', () => {
    const t = makeTask({ sessionID: 'sel-me', agent: 'researcher', description: 'click me' });
    setStoreState([t]);
    render(<AgentTreeView />);

    fireEvent.click(screen.getByTestId('tree-node'));
    expect(useAgentStore.getState().selectedTaskId).toBe('sel-me');
  });

  it('renders status badges with correct colors', () => {
    const tasks: BackgroundTask[] = [
      makeTask({ sessionID: 's1', status: 'running' }),
      makeTask({ sessionID: 's2', status: 'completed' }),
      makeTask({ sessionID: 's3', status: 'error' }),
      makeTask({ sessionID: 's4', status: 'cancelled' }),
    ];
    setStoreState(tasks);
    render(<AgentTreeView />);

    expect(screen.getByTestId('status-dot-running')).toBeDefined();
    expect(screen.getByTestId('status-dot-completed')).toBeDefined();
    expect(screen.getByTestId('status-dot-error')).toBeDefined();
    expect(screen.getByTestId('status-dot-cancelled')).toBeDefined();
  });

  it('running task status dot has animate-pulse class', () => {
    const t = makeTask({ sessionID: 'run', status: 'running' });
    setStoreState([t]);
    render(<AgentTreeView />);
    const dot = screen.getByTestId('status-dot-running');
    expect(dot.className).toContain('animate-pulse');
  });

  it('non-running task status dot does not have animate-pulse class', () => {
    const t = makeTask({ sessionID: 'done', status: 'completed' });
    setStoreState([t]);
    render(<AgentTreeView />);
    const dot = screen.getByTestId('status-dot-completed');
    expect(dot.className).not.toContain('animate-pulse');
  });

  it('pop-out button calls openFloatingPanel', () => {
    const mockOpen = vi.fn();
    useUIStore.setState({ openFloatingPanel: mockOpen } as any);

    const t = makeTask({ sessionID: 'pop-me' });
    setStoreState([t]);
    render(<AgentTreeView />);

    const btn = screen.getByTestId('popout-btn');
    fireEvent.click(btn);
    expect(mockOpen).toHaveBeenCalledWith('pop-me');
  });
});