import { describe, it, expect } from 'vitest';
import { parseTimelineEvents } from '../parseTimelineEvents';
import type { FilteredMessage } from '../../types';

const baseMessage = (overrides?: Partial<FilteredMessage>): FilteredMessage => ({
  id: 'msg1',
  role: 'assistant',
  type: 'text',
  content: 'hello',
  timestamp: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('parseTimelineEvents', () => {
  it('returns empty array for empty messages', () => {
    expect(parseTimelineEvents([], 'task1')).toEqual([]);
  });

  it('skips messages without toolCalls', () => {
    const msg = baseMessage({ toolCalls: [] });
    expect(parseTimelineEvents([msg], 'task1')).toEqual([]);
  });

  it('skips messages with undefined toolCalls', () => {
    const msg = baseMessage({ toolCalls: undefined });
    expect(parseTimelineEvents([msg], 'task1')).toEqual([]);
  });

  it('generates TimelineEvent for a running tool (no result)', () => {
    const msg = baseMessage({
      toolCalls: [{ name: 'bash', input: { command: 'ls' } }],
    });
    const events = parseTimelineEvents([msg], 'task1');
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('running');
    expect(events[0].toolName).toBe('bash');
    expect(events[0].endTime).toBeUndefined();
    expect(events[0].duration).toBeUndefined();
    expect(events[0].args).toBe(JSON.stringify({ command: 'ls' }));
  });

  it('marks tool as completed when result is present, computes duration', () => {
    const msg = baseMessage({
      toolCalls: [{ name: 'bash', input: { command: 'ls' }, result: 'file.txt', duration: 120 }],
    });
    const events = parseTimelineEvents([msg], 'task1');
    expect(events[0].status).toBe('completed');
    expect(events[0].duration).toBe(120);
    expect(events[0].endTime).toBe(events[0].startTime + 120);
    expect(events[0].result).toBe('"file.txt"');
  });

  it('marks tool as error when error field is present', () => {
    const msg = baseMessage({
      toolCalls: [{ name: 'bash', error: 'command failed' }],
    });
    const events = parseTimelineEvents([msg], 'task1');
    expect(events[0].status).toBe('error');
  });

  it('merges multiple messages and sorts by startTime ascending', () => {
    const msg1 = baseMessage({ id: 'msg1', timestamp: '2024-01-01T00:00:02.000Z', toolCalls: [{ name: 'tool_b' }] });
    const msg2 = baseMessage({ id: 'msg2', timestamp: '2024-01-01T00:00:01.000Z', toolCalls: [{ name: 'tool_a' }] });
    const events = parseTimelineEvents([msg1, msg2], 'task1');
    expect(events).toHaveLength(2);
    expect(events[0].toolName).toBe('tool_a');
    expect(events[1].toolName).toBe('tool_b');
  });

  it('generates unique ids including taskId, messageId, toolName, index', () => {
    const msg = baseMessage({
      toolCalls: [{ name: 'bash' }, { name: 'read' }],
    });
    const events = parseTimelineEvents([msg], 'task1');
    expect(events[0].id).toBe('task1-msg1-bash-0');
    expect(events[1].id).toBe('task1-msg1-read-1');
  });

  it('falls back to toolCall.type when name missing', () => {
    const msg = baseMessage({ toolCalls: [{ type: 'file_read' }] });
    const events = parseTimelineEvents([msg], 'task1');
    expect(events[0].toolName).toBe('file_read');
  });

  it('falls back to unknown when no name or type', () => {
    const msg = baseMessage({ toolCalls: [{}] });
    const events = parseTimelineEvents([msg], 'task1');
    expect(events[0].toolName).toBe('unknown');
  });

  it('truncates args and result to 500 chars', () => {
    const longString = 'x'.repeat(600);
    const msg = baseMessage({
      toolCalls: [{ name: 'bash', input: longString, result: longString }],
    });
    const events = parseTimelineEvents([msg], 'task1');
    expect(events[0].args!.length).toBeLessThanOrEqual(501); // 500 + ellipsis
    expect(events[0].result!.length).toBeLessThanOrEqual(501);
  });
});