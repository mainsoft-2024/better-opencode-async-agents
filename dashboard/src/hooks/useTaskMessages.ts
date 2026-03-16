import { useEffect, useRef, useState } from "react";
import type { FilteredMessage } from "../types";

type MessagesResponse = {
  messages?: FilteredMessage[];
};

export function useTaskMessages(
  taskId: string | null,
  baseUrl: string = window.location.origin,
) {
  const cacheRef = useRef<Map<string, FilteredMessage[]>>(new Map());
  const latestTaskIdRef = useRef<string | null>(taskId);
  const [messages, setMessages] = useState<FilteredMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  latestTaskIdRef.current = taskId;

  const fetchTaskMessages = async (targetTaskId: string) => {
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
      cacheRef.current.set(targetTaskId, nextMessages);

      if (latestTaskIdRef.current === targetTaskId) {
        setMessages(nextMessages);
      }
    } catch (err) {
      if (latestTaskIdRef.current === targetTaskId) {
        setError(err instanceof Error ? err.message : "Failed to fetch messages");
      }
    } finally {
      if (latestTaskIdRef.current === targetTaskId) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!taskId) {
      setMessages([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cached = cacheRef.current.get(taskId);
    if (cached) {
      setMessages(cached);
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

    void fetchTaskMessages(taskId);
  };

  return { messages, isLoading, error, refetch };
}