import { useEffect, useRef, useState } from "react";
import type { FilteredMessage } from "../types";
import { useMessageStore } from "../stores/messageStore";

type MessagesResponse = {
  messages?: FilteredMessage[];
};

export function useTaskMessages(
  taskId: string | null,
  baseUrl: string = window.location.origin,
) {
  const latestTaskIdRef = useRef<string | null>(taskId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  latestTaskIdRef.current = taskId;

  const fetchTaskMessages = async (targetTaskId: string, force = false) => {
    const store = useMessageStore.getState();

    // Cache check — skip network if already loaded and not force-refetch
    if (!force && store.fetchStatus[targetTaskId] === 'loaded') {
      return;
    }

    store.setFetchStatus(targetTaskId, 'loading');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${baseUrl}/v1/tasks/${targetTaskId}/messages?full_session=true&include_thinking=true&include_tool_results=true`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages (${response.status})`);
      }

      const data = (await response.json()) as MessagesResponse;
      const nextMessages = Array.isArray(data.messages) ? data.messages : [];

      if (latestTaskIdRef.current === targetTaskId) {
        useMessageStore.getState().hydrateMessages(targetTaskId, nextMessages);
        setIsLoading(false);
      }
    } catch (err) {
      if (latestTaskIdRef.current === targetTaskId) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch messages";
        useMessageStore.getState().setFetchStatus(targetTaskId, 'error', errorMsg);
        setError(errorMsg);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!taskId) {
      setIsLoading(false);
      setError(null);
      return;
    }

    void fetchTaskMessages(taskId);
  }, [taskId]);

  const refetch = () => {
    if (!taskId) {
      return;
    }

    void fetchTaskMessages(taskId, true);
  };

  return { isLoading, error, refetch };
}