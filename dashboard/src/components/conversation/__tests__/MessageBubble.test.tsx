import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';
import type { MessageGroup, FilteredMessage } from '../../../types';

function makeMessage(overrides?: Partial<FilteredMessage>): FilteredMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    type: 'text',
    content: 'Hello, world!',
    ...overrides,
  };
}

function makeGroup(overrides?: Partial<MessageGroup>): MessageGroup {
  return {
    speakerId: 'agent-1',
    speakerRole: 'assistant',
    speakerName: 'TestAgent',
    messages: [makeMessage()],
    startTime: '2026-03-16T12:00:00.000Z',
    ...overrides,
  };
}

describe('MessageBubble', () => {
  it('renders role badge', () => {
    render(<MessageBubble group={makeGroup()} />);
    const badge = screen.getByTestId('role-badge');
    expect(badge.textContent).toContain('assistant');
  });

  it('renders agent name when different from role', () => {
    render(<MessageBubble group={makeGroup({ speakerName: 'MyAgent' })} />);
    const el = screen.getByTestId('agent-name');
    expect(el.textContent).toContain('MyAgent');
  });

  it('does not render agent name when it equals role', () => {
    render(<MessageBubble group={makeGroup({ speakerRole: 'user', speakerName: 'user' })} />);
    expect(screen.queryByTestId('agent-name')).toBeNull();
  });

  it('renders timestamp from startTime', () => {
    render(<MessageBubble group={makeGroup({ startTime: '2026-03-16T12:00:00.000Z' })} />);
    expect(screen.getByTestId('timestamp')).not.toBeNull();
  });

  it('renders grouped messages content', () => {
    const group = makeGroup({
      messages: [
        makeMessage({ id: 'msg-1', content: 'First message' }),
        makeMessage({ id: 'msg-2', content: 'Second message' }),
      ],
    });
    render(<MessageBubble group={group} />);
    expect(screen.getByText('First message')).not.toBeNull();
    expect(screen.getByText('Second message')).not.toBeNull();
  });

  it('applies user role styles', () => {
    const { container } = render(
      <MessageBubble group={makeGroup({ speakerRole: 'user', speakerName: 'user' })} />
    );
    expect((container.firstChild as HTMLElement).className).toContain('border-blue-800/40');
    expect(screen.getByTestId('role-badge').className).toContain('bg-blue-900/50');
  });

  it('applies assistant role styles', () => {
    const { container } = render(
      <MessageBubble group={makeGroup({ speakerRole: 'assistant', speakerName: 'assistant' })} />
    );
    expect((container.firstChild as HTMLElement).className).toContain('border-green-800/40');
    expect(screen.getByTestId('role-badge').className).toContain('bg-green-900/50');
  });

  it('applies system role styles', () => {
    const { container } = render(
      <MessageBubble group={makeGroup({ speakerRole: 'system', speakerName: 'system' })} />
    );
    expect((container.firstChild as HTMLElement).className).toContain('border-gray-700/40');
    expect(screen.getByTestId('role-badge').className).toContain('bg-gray-800/50');
  });

  it('renders avatar with first letter of role', () => {
    render(<MessageBubble group={makeGroup({ speakerRole: 'assistant' })} />);
    const avatar = screen.getByLabelText('assistant avatar');
    expect(avatar.textContent).toBe('A');
  });

  it('sets anchor id from first message id', () => {
    render(<MessageBubble group={makeGroup({ messages: [makeMessage({ id: 'test-123' })] })} />);
    expect(document.getElementById('msg-test-123')).not.toBeNull();
  });
});