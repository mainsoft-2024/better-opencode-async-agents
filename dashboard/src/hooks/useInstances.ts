import { useCallback, useEffect, useState } from "react";
import type { DiscoveredInstance } from "../types";

type InstancesResponse = {
  instances: DiscoveredInstance[];
};

const POLL_INTERVAL_MS = 10_000;

function getDefaultBaseUrl(): string {
  return window.location.origin;
}

function getCurrentInstance(): DiscoveredInstance {
  const { hostname, port, protocol } = new URL(window.location.origin);
  const resolvedPort = port === "" ? (protocol === "https:" ? 443 : 80) : Number(port);

  return {
    name: "Current Instance",
    host: hostname,
    port: resolvedPort,
    metadata: {},
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

export function useInstances(baseUrl = getDefaultBaseUrl()) {
  const [instances, setInstances] = useState<DiscoveredInstance[]>(() => [getCurrentInstance()]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/v1/instances`);
      if (!response.ok) {
        throw new Error(`Failed to fetch instances (${response.status})`);
      }

      const data = (await response.json()) as InstancesResponse;
      const current = getCurrentInstance();
      setInstances(mergeInstancesWithCurrent(data.instances ?? [], current));
      setError(null);
    } catch (err) {
      setInstances([getCurrentInstance()]);
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

  return { instances, isLoading, error, refresh };
}