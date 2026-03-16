import { useEffect, useMemo, useState } from "react";
import "./index.css";

import { ConversationViewer } from "./components/ConversationViewer";
import { InstanceSelector } from "./components/InstanceSelector";
import { StatusBar } from "./components/StatusBar";
import { TaskTree } from "./components/TaskTree";
import { useInstances } from "./hooks/useInstances";
import { useSSE } from "./hooks/useSSE";
import { useTaskMessages } from "./hooks/useTaskMessages";

function App() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());

  const apiBaseUrl = (window as any).__BGAGENT_API_URL__ ?? window.location.origin;

  const { tasks, stats, isConnected, error: sseError } = useSSE(apiBaseUrl);
  const {
    instances,
    isLoading: instancesLoading,
    error: instancesError,
    refresh: refreshInstances,
  } = useInstances(apiBaseUrl);
  const {
    messages,
    isLoading: messagesLoading,
    error: messagesError,
  } = useTaskMessages(selectedTaskId, apiBaseUrl);

  useEffect(() => {
    setSelectedHosts((prev) => {
      if (instances.length === 0) {
        return prev;
      }

      if (prev.size === 0) {
        return new Set(instances.map((instance) => instance.host));
      }

      const next = new Set<string>();
      for (const host of prev) {
        if (instances.some((instance) => instance.host === host)) {
          next.add(host);
        }
      }
      return next;
    });
  }, [instances]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const exists = tasks.some((task) => task.sessionID === selectedTaskId);
    if (!exists) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, tasks]);

  const visibleTasks = useMemo(() => tasks, [tasks]);

  const handleToggleHost = (host: string) => {
    setSelectedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(host)) {
        next.delete(host);
      } else {
        next.add(host);
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <StatusBar
        stats={stats}
        isConnected={isConnected}
        instanceCount={instances.length}
      />

      <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[260px,minmax(0,1fr),minmax(0,1fr)]">
        <div className="min-h-0">
          <InstanceSelector
            instances={instances}
            selectedHosts={selectedHosts}
            onToggle={handleToggleHost}
            onRefresh={refreshInstances}
          />
          {(instancesLoading || instancesError) && (
            <div className="mt-2 rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-400">
              {instancesLoading ? "Loading instances..." : instancesError}
            </div>
          )}
        </div>

        <div className="min-h-0">
          <TaskTree
            tasks={visibleTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
          {sseError && (
            <div className="mt-2 rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs text-red-300">
              {sseError}
            </div>
          )}
        </div>

        <div className="min-h-0">
          <ConversationViewer
            messages={messages}
            isLoading={messagesLoading}
            taskId={selectedTaskId}
          />
          {messagesError && (
            <div className="mt-2 rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs text-red-300">
              {messagesError}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App