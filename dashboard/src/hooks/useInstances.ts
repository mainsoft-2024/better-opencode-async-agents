import { useCallback, useEffect, useState } from "react";
import type { DiscoveredInstance } from "../types";
import { useAgentStore } from "../stores/agentStore";

type InstancesResponse = {
  instances: DiscoveredInstance[];
};

const POLL_INTERVAL_MS = 10_000;

function getDefaultBaseUrl(): string {
  return window.location.origin;
}

function getCurrentInstance(baseUrl: string): DiscoveredInstance {
  const { hostname, port, protocol } = new URL(baseUrl);
  const resolvedPort = port === "" ? (protocol === "https:" ? 443 : 80) : Number(port);

  return {
    name: "Current Instance",
    host: hostname,
    port: resolvedPort,
    metadata: {},
    instanceId: "local",
    instanceName: "Current Instance",
    directory: "",
    url: baseUrl,
  };
}

function mergeInstancesWithCurrent(
  instances: DiscoveredInstance[],
  current: DiscoveredInstance,
): DiscoveredInstance[] {
  const map = new Map<string, DiscoveredInstance>();

  for (const instance of instances) {
    map.set(`${instance.host}:${instance.port}`, instance);
  }

  map.set(`${current.host}:${current.port}`, current);

  return Array.from(map.values());
}

type UseInstancesResult = {
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useInstances(baseUrl = getDefaultBaseUrl()): UseInstancesResult {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/v1/instances`);
      if (!response.ok) {
        throw new Error(`Failed to fetch instances (${response.status})`);
      }

      const data = (await response.json()) as InstancesResponse;
      const current = getCurrentInstance(baseUrl);
      const rawInstances = data.instances ?? [];

      // Enrich discovered instances with derived fields
      const enriched: DiscoveredInstance[] = rawInstances.map((inst) => ({
        ...inst,
        instanceId: inst.metadata?.instanceId ?? inst.name,
        instanceName: inst.metadata?.instanceName ?? inst.name,
        directory: inst.metadata?.directory ?? "",
        url: `http://${inst.host}:${inst.port}`,
      }));

      const mergedInstances = mergeInstancesWithCurrent(enriched, current);
      useAgentStore.getState().setInstances(mergedInstances);
      setError(null);
    } catch (err) {
      useAgentStore.getState().setInstances([getCurrentInstance(baseUrl)]);
      setError(err instanceof Error ? err.message : "Failed to fetch instances");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  return { isLoading, error, refresh };
}