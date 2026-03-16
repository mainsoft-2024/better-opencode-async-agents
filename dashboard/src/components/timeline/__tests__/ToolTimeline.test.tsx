import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolTimeline } from '../ToolTimeline';
import { useMessageStore } from '../../../stores/messageStore';
import type { FilteredMessage } from '../../../types';

// Mock framer-motion to avoid animation in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

function makeMsgWithTools(id: string, toolCalls: any[], timestamp = '2026-01-01T00:00:00Z'): FilteredMessage {
  return {
    id,
    role: 'assistant',
    type: 'text',
    content: '',
    toolCalls,
    timestamp,
  };
}

const TASK_ID = 'task-test-1';

function seedMessages(messages: FilteredMessage[]) {
  useMessageStore.getState().hydrateMessages(TASK_ID, messages);
}

beforeEach(() => {
  useMessageStore.getState().hydrateMessages(TASK_ID, []);
});

describe('ToolTimeline', () => {
  it('renders empty state when no tool calls', () => {
    render(<ToolTimeline taskId={TASK_ID} />);
    expect(screen.getByText('No tool calls yet')).toBeTruthy();
  });

  it('renders a bar row for each TimelineEvent', () => {
    seedMessages([
      makeMsgWithTools('m1', [
        { name: 'bash', result: 'ok', duration: 200 },
        { name: 'read_file', result: 'ok', duration: 100 },
      ]),
    ]);

    render(<ToolTimeline taskId={TASK_ID} />);

    expect(screen.getByText('bash')).toBeTruthy();
    expect(screen.getByText('read_file')).toBeTruthy();
  });

  it('running bars have animate-pulse class', () => {
    seedMessages([
      makeMsgWithTools('m2', [
        { name: 'running_tool' }, // no result/error → running
      ]),
    ]);

    render(<ToolTimeline taskId={TASK_ID} />);

    // The bar div should have the pulse class
    const bar = document.querySelector('[data-status="running"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain('animate-pulse');
  });

  it('click on bar calls onJumpToMessage with messageId', () => {
    const onJump = vi.fn();
    seedMessages([
      makeMsgWithTools('msg-click', [
        { name: 'click_tool', result: 'done', duration: 50 },
      ]),
    ]);

    render(<ToolTimeline taskId={TASK_ID} onJumpToMessage={onJump} />);

    // Find bar wrapper div
    const bar = document.querySelector('[data-status="completed"]');
    expect(bar).not.toBeNull();
    fireEvent.click(bar!);

    expect(onJump).toHaveBeenCalledWith('msg-click');
  });

  it('renders event count badge in header', () => {
    seedMessages([
      makeMsgWithTools('m3', [{ name: 'tool_a', result: 'ok', duration: 10 }]),
    ]);

    render(<ToolTimeline taskId={TASK_ID} />);

    expect(screen.getByText('1')).toBeTruthy();
  });
});