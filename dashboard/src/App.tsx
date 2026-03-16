import { useCallback, useEffect } from "react";
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
import { useMultiSSE } from "./hooks/useMultiSSE";
import { useTaskMessages as useTaskMessagesHook } from "./hooks/useTaskMessages";
import { useAgentStore, useConnectionStatusMap, useInstances, useStats } from "./stores/agentStore";
import { useTaskMessages } from "./stores/messageStore";

function App() {
  const apiBaseUrl = (window as any).__BGAGENT_API_URL__ ?? window.location.origin;
  useBreakpoint();

  // Hooks — run for side effects (polling, fetching); data goes to stores
  const { isLoading: instancesLoading, error: instancesError } = useInstancesHook(apiBaseUrl);

  // Read instances from store (enriched by useInstances hook)
  const instances = useInstances();

  // Multi-SSE: connect to all discovered instances
  useMultiSSE(instances);

  // Derive overall connection status from per-instance connection map
  const connectionStatus = useConnectionStatusMap();
  const isConnected = Object.values(connectionStatus).some((s) => s === "connected");

  // Read from stores
  const stats = useStats();
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
            <InstanceSelector />
            {(instancesLoading || instancesError) && (
              <div className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-400">
                {instancesLoading ? "Loading instances..." : instancesError}
              </div>
            )}
            <AgentPane />
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