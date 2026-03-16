import { useEffect, useRef, useState } from "react";

import { useAgentStore } from "../stores/agentStore";
import type { SnapshotEvent, TaskDeltaEvent } from "../types";

type UseSSEResult = {
  isConnected: boolean;
  error: string | null;
};

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

export function useSSE(
  baseUrl: string = typeof window !== "undefined" ? window.location.origin : "",
): UseSSEResult {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const closeEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as SnapshotEvent;
        useAgentStore.getState().upsertTasksFromSnapshot(payload.tasks, payload.stats);
        setError(null);
      } catch {
        setError("Failed to parse snapshot event");
      }
    };

    const handleTaskDelta = (forcedStatus?: import("../types").BackgroundTask["status"]) => {
      return (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as TaskDeltaEvent;
          if (!payload.task) {
            return;
          }

          const nextTask = forcedStatus
            ? { ...payload.task, status: forcedStatus }
            : payload.task;

          useAgentStore.getState().applyTaskEvent(nextTask);
          setError(null);
        } catch {
          setError("Failed to parse task event");
        }
      };
    };

    const handleHeartbeat = (_event: MessageEvent<string>) => {
      setError((prev) => (prev === "Failed to parse heartbeat event" ? null : prev));
    };

    const scheduleReconnect = () => {
      if (stoppedRef.current || reconnectTimerRef.current !== null) {
        return;
      }

      const delay = reconnectDelayRef.current;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);

      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (stoppedRef.current || !baseUrl) {
        return;
      }

      clearReconnectTimer();
      closeEventSource();

      const source = new EventSource(`${baseUrl}/v1/events`);
      eventSourceRef.current = source;

      source.addEventListener("open", () => {
        setIsConnected(true);
        setError(null);
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
      });

      source.addEventListener("error", () => {
        setIsConnected(false);
        setError("SSE connection error");
        closeEventSource();
        scheduleReconnect();
      });

      source.addEventListener("snapshot", handleSnapshot);
      source.addEventListener("task.created", handleTaskDelta());
      source.addEventListener("task.updated", handleTaskDelta());
      source.addEventListener("task.completed", handleTaskDelta("completed"));
      source.addEventListener("task.error", handleTaskDelta("error"));
      source.addEventListener("task.cancelled", handleTaskDelta("cancelled"));
      source.addEventListener("heartbeat", handleHeartbeat);
    };

    connect();

    return () => {
      stoppedRef.current = true;
      clearReconnectTimer();
      closeEventSource();
    };
  }, [baseUrl]);

  return { isConnected, error };
}