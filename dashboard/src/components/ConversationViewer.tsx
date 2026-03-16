import { useEffect, useMemo, useRef } from "react";
import type { FilteredMessage } from "../types";

type ConversationViewerProps = {
  messages: FilteredMessage[];
  isLoading: boolean;
  taskId: string | null;
};

const roleBadgeClass: Record<string, string> = {
  user: "bg-blue-500/20 text-blue-300 border-blue-400/30",
  assistant: "bg-green-500/20 text-green-300 border-green-400/30",
  system: "bg-gray-500/20 text-gray-300 border-gray-400/30",
};

function formatToolName(toolCall: any): string {
  return toolCall?.toolName ?? toolCall?.name ?? toolCall?.tool ?? "unknown_tool";
}

function formatToolParams(toolCall: any): string {
  const raw = toolCall?.params ?? toolCall?.arguments ?? toolCall?.input ?? toolCall?.args ?? {};

  try {
    const formatted = JSON.stringify(raw, null, 2);
    if (!formatted) return "{}";
    return formatted.length > 600 ? `${formatted.slice(0, 600)}...` : formatted;
  } catch {
    const fallback = String(raw);
    return fallback.length > 600 ? `${fallback.slice(0, 600)}...` : fallback;
  }
}

export function ConversationViewer({ messages, isLoading, taskId }: ConversationViewerProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  const normalizedMessages = useMemo(
    () => messages ?? [],
    [messages],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [normalizedMessages.length, taskId]);

  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-gray-800 bg-gray-950 text-gray-400">
        Select a task
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-gray-800 bg-gray-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-800 bg-gray-950">
      <div className="border-b border-gray-800 px-4 py-3 text-sm text-gray-300">Conversation</div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {normalizedMessages.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-700 bg-gray-900/60 p-4 text-sm text-gray-400">
            No messages yet.
          </div>
        ) : (
          normalizedMessages.map((message) => (
            <article key={message.id} className="space-y-2 rounded-md border border-gray-800 bg-gray-900/70 p-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClass[message.role] ?? "bg-gray-600/20 text-gray-200 border-gray-500/30"}`}
>
                  {message.role}
                </span>
                <span className="text-xs text-gray-500">{message.type}</span>
                {message.timestamp ? (
                  <span className="ml-auto text-xs text-gray-500">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                ) : null}
              </div>

              <pre className="whitespace-pre-wrap break-words text-sm text-gray-100">{message.content}</pre>

              {message.thinking ? (
                <details className="rounded-md border border-gray-700 bg-gray-800/60">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-300">
                    Thinking
                  </summary>
                  <pre className="whitespace-pre-wrap break-words border-t border-gray-700 px-3 py-2 text-xs text-gray-300">
                    {message.thinking}
                  </pre>
                </details>
              ) : null}

              {message.toolCalls && message.toolCalls.length > 0 ? (
                <details className="rounded-md border border-gray-700 bg-gray-800/60">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-300">
                    Tool Calls ({message.toolCalls.length})
                  </summary>
                  <div className="space-y-2 border-t border-gray-700 p-3">
                    {message.toolCalls.map((toolCall, index) => (
                      <details key={`${message.id}-tool-${index}`} className="rounded border border-gray-700 bg-gray-900/70">
                        <summary className="cursor-pointer px-2 py-1.5 text-xs text-cyan-300">
                          {formatToolName(toolCall)}
                        </summary>
                        <pre className="whitespace-pre-wrap break-words border-t border-gray-700 px-2 py-2 text-xs text-gray-300">
                          {formatToolParams(toolCall)}
                        </pre>
                      </details>
                    ))}
                  </div>
                </details>
              ) : null}
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}