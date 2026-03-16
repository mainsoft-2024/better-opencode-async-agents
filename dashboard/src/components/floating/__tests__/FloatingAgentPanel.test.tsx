import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FloatingAgentPanel } from '../FloatingAgentPanel';
import type { FloatingPanelState, BackgroundTask } from '../../../types';

// Mock framer-motion drag
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, style, className, onClick }: React.HTMLAttributes<HTMLDivElement> & { drag?: boolean; dragConstraints?: unknown; dragMomentum?: boolean; onDragEnd?: unknown }) =>
        <div style={style} className={className} onClick={onClick}>{children}</div>,
    },
  };
});

// Mock stores
const mockUpdateFloatingPanel = vi.fn();
const mockCloseFloatingPanel = vi.fn();
const mockSetSelectedTask = vi.fn();

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector: (s: { floatingPanels: FloatingPanelState[]; updateFloatingPanel: typeof mockUpdateFloatingPanel; closeFloatingPanel: typeof mockCloseFloatingPanel }) => unknown) =>
    selector({
      floatingPanels: [],
      updateFloatingPanel: mockUpdateFloatingPanel,
      closeFloatingPanel: mockCloseFloatingPanel,
    }),
}));

const mockTask: BackgroundTask = {
  sessionID: 'task-1',
  parentSessionID: '',
  parentMessageID: '',
  parentAgent: '',
  description: 'Test task description',
  prompt: 'Do something',
  agent: 'coder',
  status: 'running',
  startedAt: new Date().toISOString(),
  batchId: 'batch-1',
  resumeCount: 0,
  isForked: false,
};

let mockTasksById: Record<string, BackgroundTask> = { 'task-1': mockTask };
let mockMessages: import('../../../types').FilteredMessage[] = [];

vi.mock('../../../stores/agentStore', () => ({
  useAgentStore: (selector: (s: { tasksById: Record<string, BackgroundTask>; setSelectedTask: typeof mockSetSelectedTask }) => unknown) =>
    selector({
      tasksById: mockTasksById,
      setSelectedTask: mockSetSelectedTask,
    }),
}));

vi.mock('../../../stores/messageStore', () => ({
  useMessageStore: (selector: (s: { messagesByTaskId: Record<string, import('../../../types').FilteredMessage[]> }) => unknown) =>
    selector({ messagesByTaskId: { 'task-1': mockMessages } }),
}));

const defaultPanel: FloatingPanelState = {
  id: 'panel-1',
  taskId: 'task-1',
  position: { x: 50, y: 50 },
  size: { width: 320, height: 240 },
  minimized: false,
  zIndex: 10,
};

const constraintsRef = { current: null } as React.RefObject<HTMLElement>;

describe('FloatingAgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTasksById = { 'task-1': mockTask };
    mockMessages = [];
  });

  it('renders task description and status', () => {
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    expect(screen.getByText('Test task description')).toBeTruthy();
    expect(screen.getByText('running')).toBeTruthy();
    expect(screen.getByTestId('status-badge')).toBeTruthy();
  });

  it('renders agent initial in icon circle', () => {
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    expect(screen.getByText('C')).toBeTruthy(); // 'coder' → 'C'
  });

  it('shows body by default when not minimized', () => {
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    expect(screen.getByTestId('focus-button')).toBeTruthy();
  });

  it('minimize button calls updateFloatingPanel with minimized: true', () => {
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    fireEvent.click(screen.getByTestId('minimize-button'));
    expect(mockUpdateFloatingPanel).toHaveBeenCalledWith('panel-1', { minimized: true });
  });

  it('minimize button toggles minimized: false when already minimized', () => {
    const minimizedPanel = { ...defaultPanel, minimized: true };
    render(<FloatingAgentPanel panel={minimizedPanel} constraintsRef={constraintsRef} />);
    fireEvent.click(screen.getByTestId('minimize-button'));
    expect(mockUpdateFloatingPanel).toHaveBeenCalledWith('panel-1', { minimized: false });
  });

  it('close button calls closeFloatingPanel with panel id', () => {
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    fireEvent.click(screen.getByTestId('close-button'));
    expect(mockCloseFloatingPanel).toHaveBeenCalledWith('panel-1');
  });

  it('focus button calls setSelectedTask with taskId', () => {
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    fireEvent.click(screen.getByTestId('focus-button'));
    expect(mockSetSelectedTask).toHaveBeenCalledWith('task-1');
  });

  it('renders latest message preview when messages exist', () => {
    mockMessages = [
      { id: 'msg-1', role: 'assistant', type: 'text', content: 'Hello from the agent!', timestamp: new Date().toISOString() },
    ];
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    expect(screen.getByTestId('latest-message')).toBeTruthy();
    expect(screen.getByText(/Hello from the agent!/)).toBeTruthy();
  });

  it('does not render latest-message element when no messages', () => {
    mockMessages = [];
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    expect(screen.queryByTestId('latest-message')).toBeNull();
  });

  it('truncates message content longer than 120 chars', () => {
    const longContent = 'A'.repeat(150);
    mockMessages = [{ id: 'm1', role: 'assistant', type: 'text', content: longContent }];
    render(<FloatingAgentPanel panel={defaultPanel} constraintsRef={constraintsRef} />);
    const el = screen.getByTestId('latest-message');
    expect(el.textContent).toContain('...');
  });
});