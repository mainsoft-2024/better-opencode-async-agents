import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgentStore } from '../../stores/agentStore';
import { useUIStore } from '../../stores/uiStore';
import { useMessageStore } from '../../stores/messageStore';
import type { FloatingPanelState } from '../../types';

interface FloatingAgentPanelProps {
  panel: FloatingPanelState;
  constraintsRef: React.RefObject<HTMLElement>;
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-cyan-400 animate-pulse',
  completed: 'bg-green-400',
  error: 'bg-red-400',
  cancelled: 'bg-gray-500',
  resumed: 'bg-blue-400',
};

function FloatingAgentPanelInner({ panel, constraintsRef }: FloatingAgentPanelProps) {
  const task = useAgentStore((s) => s.tasksById[panel.taskId] ?? null);
  const setSelectedTask = useAgentStore((s) => s.setSelectedTask);
  const updateFloatingPanel = useUIStore((s) => s.updateFloatingPanel);
  const closeFloatingPanel = useUIStore((s) => s.closeFloatingPanel);
  const floatingPanels = useUIStore((s) => s.floatingPanels);
  const messages = useMessageStore((s) => s.messagesByTaskId[panel.taskId] ?? []);

  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number; y: number } }) => {
      updateFloatingPanel(panel.id, {
        position: {
          x: panel.position.x + info.offset.x,
          y: panel.position.y + info.offset.y,
        },
      });
    },
    [panel.id, panel.position, updateFloatingPanel],
  );

  const handleBringToFront = useCallback(() => {
    const maxZIndex = floatingPanels.reduce((max, p) => Math.max(max, p.zIndex), 0);
    updateFloatingPanel(panel.id, { zIndex: maxZIndex + 1 });
  }, [panel.id, floatingPanels, updateFloatingPanel]);

  const handleToggleMinimize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateFloatingPanel(panel.id, { minimized: !panel.minimized });
    },
    [panel.id, panel.minimized, updateFloatingPanel],
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeFloatingPanel(panel.id);
    },
    [panel.id, closeFloatingPanel],
  );

  const handleFocus = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedTask(panel.taskId);
    },
    [panel.taskId, setSelectedTask],
  );

  const status = task?.status ?? 'cancelled';
  const description = task?.description ?? panel.taskId;
  const agentLabel = task?.agent ?? '?';
  const agentInitial = agentLabel.charAt(0).toUpperCase();

  return (
    <motion.div
      drag
      dragConstraints={constraintsRef}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      onClick={handleBringToFront}
      style={{
        position: 'absolute',
        left: panel.position.x,
        top: panel.position.y,
        zIndex: panel.zIndex,
        width: panel.size.width,
      }}
      className="rounded-lg shadow-2xl border border-gray-700 bg-gray-900 backdrop-blur-sm overflow-hidden"
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 cursor-grab active:cursor-grabbing select-none"
      >
        {/* Agent icon */}
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
          {agentInitial}
        </div>

        {/* Description */}
        <span className="flex-1 text-xs text-gray-200 truncate" title={description}>
          {description}
        </span>

        {/* Status dot */}
        <span
          data-testid="status-badge"
          className={`flex-shrink-0 w-2 h-2 rounded-full ${STATUS_COLORS[status] ?? 'bg-gray-500'}`}
        />

        {/* Minimize */}
        <button
          data-testid="minimize-button"
          onClick={handleToggleMinimize}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
          aria-label={panel.minimized ? 'Restore' : 'Minimize'}
        >
          {panel.minimized ? '▲' : '▼'}
        </button>

        {/* Close */}
        <button
          data-testid="close-button"
          onClick={handleClose}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-400 rounded hover:bg-gray-700 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {!panel.minimized && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 space-y-2">
              {/* Status + progress */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">Status:</span>
                <span className="text-gray-100 capitalize">{status}</span>
                {task?.progress && (
                  <span className="ml-auto text-gray-500">
                    {task.progress.toolCalls} tool calls
                  </span>
                )}
              </div>

              {/* Latest message preview */}
              {latestMessage && (
                <div
                  data-testid="latest-message"
                  className="text-xs text-gray-400 bg-gray-800 rounded px-2 py-1 line-clamp-2"
                >
                  {latestMessage.content.slice(0, 120)}
                  {latestMessage.content.length > 120 && '...'}
                </div>
              )}

              {/* Focus button */}
              <button
                data-testid="focus-button"
                onClick={handleFocus}
                className="w-full text-xs bg-indigo-700 hover:bg-indigo-600 text-white rounded px-2 py-1 transition-colors"
              >
                Focus
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const FloatingAgentPanel = React.memo(FloatingAgentPanelInner);