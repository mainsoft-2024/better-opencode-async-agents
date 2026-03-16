import { useCallback, useEffect, useState } from "react";
import "./index.css";

import { ConversationViewer } from "./components/ConversationViewer";
import { InstanceSelector } from "./components/InstanceSelector";
import { StatusBar } from "./components/StatusBar";
import { AgentPane } from "./components/agents/AgentPane";
import { FloatingPanelLayer } from "./components/floating/FloatingPanelLayer";
import { ToolTimeline } from "./components/timeline/ToolTimeline";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { useBreakpoint } from "./hooks/useBreakpoint";
import { useInstances as useInstancesHook } from "./hooks/useInstances";
import { useSSE } from "./hooks/useSSE";
import { useTaskMessages as useTaskMessagesHook } from "./hooks/useTaskMessages";
import { useAgentStore, useInstances, useStats } from "./stores/agentStore";
import { useTaskMessages } from "./stores/messageStore";

function App() {
  const apiBaseUrl = (window as any).__BGAGENT_API_URL__ ?? window.location.origin;
  useBreakpoint();

  // Hooks — run for side effects (SSE connection, polling, fetching); data goes to stores
  const { isConnected, error: sseError } = useSSE(apiBaseUrl);
  const { isLoading: instancesLoading, error: instancesError, refresh: refreshInstances } = useInstancesHook(apiBaseUrl);

  // Read from stores
  const stats = useStats();
  const instances = useInstances();
  const selectedTaskId = useAgentStore((s) => s.selectedTaskId);
  const setSelectedTask = useAgentStore((s) => s.setSelectedTask);
  const tasksById = useAgentStore((s) => s.tasksById);

  // Trigger message fetching for selected task (side effect only)
  const { isLoading: messagesLoading, error: messagesError } = useTaskMessagesHook(selectedTaskId, apiBaseUrl);

  // Read messages for selected task from message store
  const messages = useTaskMessages(selectedTaskId ?? "");

  // handleJumpToMessage — scrolls ConversationViewer to message anchor
  const handleJumpToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Clear selected task if it no longer exists
  // Sync selectedHosts when instances list changes
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedHosts((prev) => {
      if (instances.length === 0) return prev;
      if (prev.size === 0) return new Set(instances.map((i) => i.host));
      const next = new Set<string>();
      for (const host of prev) {
        if (instances.some((i) => i.host === host)) next.add(host);
      }
      return next;
    });
  }, [instances]);

  const handleToggleHost = (host: string) => {
    setSelectedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(host)) next.delete(host);
      else next.add(host);
      return next;
    });
  };

  // Clear selected task if it no longer exists
  useEffect(() => {
    if (!selectedTaskId) return;
    const exists = Boolean(tasksById[selectedTaskId]);
    if (!exists) {
      setSelectedTask(null);
    }
  }, [selectedTaskId, tasksById, setSelectedTask]);

  return (
    <>
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <DashboardLayout
        header={
          <StatusBar
            stats={stats}
            isConnected={isConnected}
            instanceCount={instances.length}
          />
        }
        sidebar={
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
            <InstanceSelector
              instances={instances}
              selectedHosts={selectedHosts}
              onToggle={handleToggleHost}
              onRefresh={refreshInstances}
            />
            {(instancesLoading || instancesError) && (
              <div className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-400">
                {instancesLoading ? "Loading instances..." : instancesError}
              </div>
            )}
            <AgentPane />
            {sseError && (
              <div className="rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs text-red-300">
                {sseError}
              </div>
            )}
          </div>
        }
        main={
          <div className="flex h-full flex-col">
            <ConversationViewer
              messages={messages}
              isLoading={messagesLoading}
              taskId={selectedTaskId}
            />
            {messagesError && (
              <div className="m-2 rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs text-red-300">
                {messagesError}
              </div>
            )}
          </div>
        }
        detail={
          <ToolTimeline
            taskId={selectedTaskId ?? ""}
            onJumpToMessage={handleJumpToMessage}
            loading={messagesLoading}
          />
        }
        bottomDrawer={
          <ToolTimeline
            taskId={selectedTaskId ?? ""}
            onJumpToMessage={handleJumpToMessage}
            loading={messagesLoading}
          />
        }
      />
    </div>
    <FloatingPanelLayer />
    </>
  );
}

export default App