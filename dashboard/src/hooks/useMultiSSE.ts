import { useEffect, useRef } from "react";

import { useAgentStore } from "../stores/agentStore";
import type { DiscoveredInstance, SnapshotEvent, TaskDeltaEvent } from "../types";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

type InstanceConnection = {
  source: EventSource;
  reconnectTimer: number | null;
  reconnectDelay: number;
  stopped: boolean;
};

export function useMultiSSE(instances: DiscoveredInstance[]): Record<string, never> {
  // Map from instanceId → active connection state
  const connectionsRef = useRef<Map<string, InstanceConnection>>(new Map());

  useEffect(() => {
    const connections = connectionsRef.current;

    const closeConnection = (instanceId: string) => {
      const conn = connections.get(instanceId);
      if (!conn) return;
      conn.stopped = true;
      if (conn.reconnectTimer !== null) {
        window.clearTimeout(conn.reconnectTimer);
        conn.reconnectTimer = null;
      }
      conn.source.close();
      connections.delete(instanceId);
    };

    const openConnection = (instance: DiscoveredInstance & { instanceId: string; url: string; instanceName: string }) => {
      const { instanceId, instanceName, url } = instance;

      const conn: InstanceConnection = {
        source: null as unknown as EventSource,
        reconnectTimer: null,
        reconnectDelay: INITIAL_RECONNECT_DELAY_MS,
        stopped: false,
      };

      connections.set(instanceId, conn);

      const connect = () => {
        if (conn.stopped) return;

        const source = new EventSource(`${url}/v1/events`);
        conn.source = source;

        source.addEventListener("open", () => {
          useAgentStore.getState().setConnectionStatus(instanceId, "connected");
          conn.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        });

        source.addEventListener("error", () => {
          useAgentStore.getState().setConnectionStatus(instanceId, "disconnected");
          source.close();
          if (!conn.stopped && conn.reconnectTimer === null) {
            const delay = conn.reconnectDelay;
            conn.reconnectTimer = window.setTimeout(() => {
              conn.reconnectTimer = null;
              connect();
            }, delay);
            conn.reconnectDelay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
          }
        });

        source.addEventListener("snapshot", (event: MessageEvent<string>) => {
          try {
            const payload = JSON.parse(event.data) as SnapshotEvent & {
              instanceId?: string;
              instanceName?: string;
            };
            const resolvedInstanceId = payload.instanceId ?? instanceId;
            const resolvedInstanceName = payload.instanceName ?? instanceName;

            useAgentStore.getState().setInstanceInfo(resolvedInstanceId, {
              instanceId: resolvedInstanceId,
              instanceName: resolvedInstanceName,
              directory: instance.directory ?? "",
              url,
              color: "", // assigned by store based on order
            });

            useAgentStore.getState().upsertTasksFromInstance(
              resolvedInstanceId,
              payload.tasks,
              payload.stats,
            );

            useAgentStore.getState().setConnectionStatus(resolvedInstanceId, "connected");
          } catch {
            // ignore parse errors
          }
        });

        const handleTaskDelta =
          (forcedStatus?: import("../types").BackgroundTask["status"]) =>
          (event: MessageEvent<string>) => {
            try {
              const payload = JSON.parse(event.data) as TaskDeltaEvent;
              if (!payload.task) return;
              const nextTask = forcedStatus
                ? { ...payload.task, status: forcedStatus }
                : payload.task;
              useAgentStore.getState().applyTaskEventFromInstance(instanceId, nextTask);
            } catch {
              // ignore parse errors
            }
          };

        source.addEventListener("task.created", handleTaskDelta());
        source.addEventListener("task.updated", handleTaskDelta());
        source.addEventListener("task.completed", handleTaskDelta("completed"));
        source.addEventListener("task.error", handleTaskDelta("error"));
        source.addEventListener("task.cancelled", handleTaskDelta("cancelled"));
      };

      useAgentStore.getState().setConnectionStatus(instanceId, "connecting");
      connect();
    };

    // Compute desired set of instanceIds
    const desiredIds = new Set(instances.map((i) => i.instanceId ?? i.name));

    // Remove stale connections
    for (const activeId of connections.keys()) {
      if (!desiredIds.has(activeId)) {
        closeConnection(activeId);
        useAgentStore.getState().removeInstance(activeId);
      }
    }

    // Open new connections
    for (const instance of instances) {
      const instanceId = instance.instanceId ?? instance.name;
      if (!connections.has(instanceId)) {
        const enriched = {
          ...instance,
          instanceId,
          instanceName: instance.instanceName ?? instance.name,
          url: instance.url ?? `http://${instance.host}:${instance.port}`,
        };
        openConnection(enriched);
      }
    }

    return () => {
      // Cleanup all on unmount
      for (const id of [...connections.keys()]) {
        closeConnection(id);
      }
    };
  }, [instances]);

  return {};
}