import { useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { AnimatePresence, motion } from "framer-motion";
import type { FilteredMessage } from "../types";
import { MessageBubble } from "./conversation/MessageBubble";
import { TypingIndicator } from "./conversation/TypingIndicator";
import { groupMessages } from "../utils/groupMessages";

type ConversationViewerProps = {
  messages: FilteredMessage[];
  isLoading: boolean;
  taskId: string | null;
  taskStatus?: string;
};

export function ConversationViewer({
  messages,
  isLoading,
  taskId,
  taskStatus,
}: ConversationViewerProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const normalizedMessages = messages ?? [];
  const groups = groupMessages(normalizedMessages);

  // ── No task selected ──
  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-gray-800 bg-gray-950 text-gray-400">
        Select a task
      </div>
    );
  }

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-gray-800 bg-gray-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col rounded-lg border border-gray-800 bg-gray-950">
      {/* Header bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-800 px-4 py-3">
        <span className="truncate text-sm text-gray-300">Conversation</span>
        {normalizedMessages.length > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {normalizedMessages.length} msg{normalizedMessages.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Empty state */}
      {groups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          No messages
        </div>
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          className="flex-1"
          data={groups}
          computeItemKey={(_, group) => group.messages[0].id}
          followOutput="smooth"
          initialTopMostItemIndex={groups.length - 1}
          atBottomStateChange={(atBottom) => setIsAtBottom(atBottom)}
          overscan={200}
          itemContent={(index, group) => (
            <div className="px-4 py-1.5">
              <MessageBubble group={group} isLatest={index === groups.length - 1} />
            </div>
          )}
          components={{
            Footer: () =>
              taskStatus === "running" ? (
                <div className="px-4 py-3">
                  <TypingIndicator />
                </div>
              ) : null,
          }}
        />
      )}

      {/* Scroll-to-latest floating button */}
      <AnimatePresence>
        {!isAtBottom && groups.length > 0 && (
          <motion.button
            key="scroll-btn"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() =>
              virtuosoRef.current?.scrollToIndex({
                index: "LAST",
                behavior: "smooth",
              })
            }
            className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-gray-300 shadow-lg hover:bg-gray-700 hover:text-white"
            aria-label="Scroll to latest"
          >
            {/* Down chevron */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}