import { create } from 'zustand';
import type { FilteredMessage } from '../types';
import { parseTimelineEvents } from '../utils/parseTimelineEvents';

type FetchStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface MessageStore {
  messagesByTaskId: Record<string, FilteredMessage[]>;
  fetchStatus: Record<string, FetchStatus>;
  fetchErrors: Record<string, string | null>;
  hydrateMessages: (taskId: string, messages: FilteredMessage[]) => void;
  appendMessage: (taskId: string, message: FilteredMessage) => void;
  setFetchStatus: (taskId: string, status: FetchStatus, error?: string) => void;
  markTaskSynced: (taskId: string) => void;
}

export const useMessageStore = create<MessageStore>()((set) => ({
  messagesByTaskId: {},
  fetchStatus: {},
  fetchErrors: {},

  hydrateMessages: (taskId, messages) =>
    set((state) => ({
      messagesByTaskId: {
        ...state.messagesByTaskId,
        [taskId]: messages,
      },
      fetchStatus: {
        ...state.fetchStatus,
        [taskId]: 'loaded',
      },
      fetchErrors: {
        ...state.fetchErrors,
        [taskId]: null,
      },
    })),

  appendMessage: (taskId, message) =>
    set((state) => ({
      messagesByTaskId: {
        ...state.messagesByTaskId,
        [taskId]: [...(state.messagesByTaskId[taskId] ?? []), message],
      },
    })),

  setFetchStatus: (taskId, status, error) =>
    set((state) => ({
      fetchStatus: {
        ...state.fetchStatus,
        [taskId]: status,
      },
      fetchErrors: {
        ...state.fetchErrors,
        [taskId]: error ?? null,
      },
    })),

  markTaskSynced: (taskId) =>
    set((state) => ({
      fetchStatus: {
        ...state.fetchStatus,
        [taskId]: 'loaded',
      },
      fetchErrors: {
        ...state.fetchErrors,
        [taskId]: null,
      },
    })),
}));

export const useTaskMessages = (taskId: string) =>
  useMessageStore((state) => state.messagesByTaskId[taskId] ?? []);

export const useTaskFetchStatus = (taskId: string) =>
  useMessageStore((state) => state.fetchStatus[taskId] ?? 'idle');

export const useGroupedMessages = (taskId: string) =>
  useMessageStore((state) => state.messagesByTaskId[taskId] ?? []);

export const useTimelineEvents = (taskId: string) =>
  useMessageStore((state) => {
    const msgs = state.messagesByTaskId[taskId] ?? [];
    return parseTimelineEvents(msgs, taskId);
  });