import { describe, expect, it } from 'vitest';
import { groupMessages } from '../groupMessages';
import type { FilteredMessage } from '../../types';

function makeMsg(overrides: Partial<FilteredMessage> & { id: string; role: string }): FilteredMessage {
  return {
    id: overrides.id,
    role: overrides.role,
    type: overrides.type ?? 'text',
    content: overrides.content ?? 'hello',
    timestamp: overrides.timestamp,
    thinking: overrides.thinking,
    toolCalls: overrides.toolCalls,
  };
}

const T0 = '2026-03-16T10:00:00.000Z';
const T1 = '2026-03-16T10:00:30.000Z'; // +30s
const T2 = '2026-03-16T10:01:00.000Z'; // +60s from T0, +30s from T1
const T_GAP = '2026-03-16T10:02:00.000Z'; // +2min from T0 — beyond 60s window

describe('groupMessages', () => {
  it('returns empty array for empty input', () => {
    expect(groupMessages([])).toEqual([]);
  });

  it('returns single group for single message', () => {
    const msg = makeMsg({ id: 'm1', role: 'assistant', content: 'Hi', timestamp: T0 });
    const groups = groupMessages([msg]);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(1);
    expect(groups[0].speakerRole).toBe('assistant');
    expect(groups[0].speakerName).toBe('Assistant');
    expect(groups[0].speakerId).toBe('assistant');
    expect(groups[0].startTime).toBe(T0);
    expect(groups[0].endTime).toBe(T0);
  });

  it('groups consecutive messages with same role within window', () => {
    const msgs = [
      makeMsg({ id: 'm1', role: 'assistant', timestamp: T0 }),
      makeMsg({ id: 'm2', role: 'assistant', timestamp: T1 }),
      makeMsg({ id: 'm3', role: 'assistant', timestamp: T2 }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(3);
    expect(groups[0].startTime).toBe(T0);
    expect(groups[0].endTime).toBe(T2);
  });

  it('splits on role change', () => {
    const msgs = [
      makeMsg({ id: 'm1', role: 'user', timestamp: T0 }),
      makeMsg({ id: 'm2', role: 'assistant', timestamp: T1 }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(2);
    expect(groups[0].speakerRole).toBe('user');
    expect(groups[1].speakerRole).toBe('assistant');
  });

  it('splits on time gap exceeding windowMs', () => {
    const msgs = [
      makeMsg({ id: 'm1', role: 'assistant', timestamp: T0 }),
      makeMsg({ id: 'm2', role: 'assistant', timestamp: T_GAP }),
    ];
    const groups = groupMessages(msgs, 60_000);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages[0].id).toBe('m1');
    expect(groups[1].messages[0].id).toBe('m2');
  });

  it('keeps messages in same group when gap exactly equals windowMs', () => {
    // T0 to T2 is exactly 60s
    const msgs = [
      makeMsg({ id: 'm1', role: 'assistant', timestamp: T0 }),
      makeMsg({ id: 'm2', role: 'assistant', timestamp: T2 }),
    ];
    const groups = groupMessages(msgs, 60_000);
    expect(groups).toHaveLength(1);
  });

  it('preserves message order within groups', () => {
    const msgs = [
      makeMsg({ id: 'm1', role: 'assistant', content: 'first', timestamp: T0 }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'second', timestamp: T1 }),
      makeMsg({ id: 'm3', role: 'assistant', content: 'third', timestamp: T2 }),
    ];
    const groups = groupMessages(msgs);
    const contents = groups[0].messages.map((m) => m.content);
    expect(contents).toEqual(['first', 'second', 'third']);
  });

  it('capitalizes speakerName from role', () => {
    const msgs = [makeMsg({ id: 'm1', role: 'system' })];
    const groups = groupMessages(msgs);
    expect(groups[0].speakerName).toBe('System');
  });

  it('handles messages without timestamps (groups all same-role together)', () => {
    const msgs = [
      makeMsg({ id: 'm1', role: 'assistant' }),
      makeMsg({ id: 'm2', role: 'assistant' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(2);
  });

  it('handles mixed roles correctly across multiple groups', () => {
    const msgs = [
      makeMsg({ id: 'm1', role: 'user', timestamp: T0 }),
      makeMsg({ id: 'm2', role: 'assistant', timestamp: T1 }),
      makeMsg({ id: 'm3', role: 'assistant', timestamp: T2 }),
      makeMsg({ id: 'm4', role: 'user', timestamp: T_GAP }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(3);
    expect(groups[0].speakerRole).toBe('user');
    expect(groups[0].messages).toHaveLength(1);
    expect(groups[1].speakerRole).toBe('assistant');
    expect(groups[1].messages).toHaveLength(2);
    expect(groups[2].speakerRole).toBe('user');
    expect(groups[2].messages).toHaveLength(1);
  });
});