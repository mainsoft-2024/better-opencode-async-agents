import { beforeEach, describe, expect, it } from 'vitest';
import type { FilteredMessage } from '../../types';
import { useMessageStore } from '../messageStore';

const makeMessage = (id: string, content: string): FilteredMessage => ({
  id,
  role: 'assistant',
  type: 'message',
  content,
});

describe('messageStore', () => {
  beforeEach(() => {
    useMessageStore.setState(useMessageStore.getInitialState(), true);
  });

  it('hydrateMessages sets messages and status to loaded', () => {
    const messages = [makeMessage('m1', 'hello')];

    useMessageStore.getState().hydrateMessages('task-1', messages);

    expect(useMessageStore.getState().messagesByTaskId['task-1']).toEqual(messages);
    expect(useMessageStore.getState().fetchStatus['task-1']).toBe('loaded');
  });

  it('appendMessage appends to existing', () => {
    useMessageStore
      .getState()
      .hydrateMessages('task-1', [makeMessage('m1', 'first')]);

    useMessageStore.getState().appendMessage('task-1', makeMessage('m2', 'second'));

    expect(useMessageStore.getState().messagesByTaskId['task-1']).toHaveLength(2);
    expect(useMessageStore.getState().messagesByTaskId['task-1'][1]?.id).toBe('m2');
  });

  it('setFetchStatus sets status and error', () => {
    useMessageStore.getState().setFetchStatus('task-1', 'error', 'network failed');

    expect(useMessageStore.getState().fetchStatus['task-1']).toBe('error');
    expect(useMessageStore.getState().fetchErrors['task-1']).toBe('network failed');
  });

  it('markTaskSynced clears error and sets loaded', () => {
    useMessageStore.getState().setFetchStatus('task-1', 'error', 'network failed');

    useMessageStore.getState().markTaskSynced('task-1');

    expect(useMessageStore.getState().fetchStatus['task-1']).toBe('loaded');
    expect(useMessageStore.getState().fetchErrors['task-1']).toBeNull();
  });

  it('hydrating task A does not affect task B', () => {
    useMessageStore
      .getState()
      .hydrateMessages('task-a', [makeMessage('a1', 'A message')]);
    useMessageStore
      .getState()
      .hydrateMessages('task-b', [makeMessage('b1', 'B message')]);

    expect(useMessageStore.getState().messagesByTaskId['task-a']).toHaveLength(1);
    expect(useMessageStore.getState().messagesByTaskId['task-b']).toHaveLength(1);
    expect(useMessageStore.getState().messagesByTaskId['task-a'][0]?.id).toBe('a1');
    expect(useMessageStore.getState().messagesByTaskId['task-b'][0]?.id).toBe('b1');
  });
});