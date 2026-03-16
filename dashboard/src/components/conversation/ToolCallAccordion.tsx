import { useState } from "react";
import { motion } from "framer-motion";
import useMeasure from "react-use-measure";

interface ToolCall {
  name?: string;
  id?: string;
  input?: unknown;
  output?: unknown;
  [key: string]: unknown;
}

interface ToolCallAccordionProps {
  toolCalls: ToolCall[];
  messageId: string;
}

function ToolIcon() {
  return (
    <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

interface AccordionItemProps {
  toolCall: ToolCall;
  index: number;
  messageId: string;
}

function AccordionItem({ toolCall, index, messageId }: AccordionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [ref, { height: measuredHeight }] = useMeasure();

  const toolName = toolCall.name ?? toolCall.id ?? `tool_${index}`;

  return (
    <div id={`tool-${messageId}-${index}`} className="rounded-md border border-gray-700 bg-gray-900">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
      >
        <ToolIcon />
        <span className="flex-1 font-mono font-medium text-amber-300">{toolName}</span>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-gray-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </motion.span>
      </button>

      <motion.div
        animate={{ height: isExpanded ? measuredHeight : 0 }}
        transition={{ duration: 0.2 }}
        style={{ overflow: "hidden" }}
      >
        <div ref={ref} className="space-y-2 border-t border-gray-700 p-3">
          {toolCall.input !== undefined && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Arguments</div>
              <pre className="overflow-x-auto rounded bg-gray-800 p-2 text-xs text-green-300">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.output !== undefined && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Result</div>
              <pre className="overflow-x-auto rounded bg-gray-800 p-2 text-xs text-blue-300">
                {typeof toolCall.output === "string"
                  ? toolCall.output
                  : JSON.stringify(toolCall.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function ToolCallAccordion({ toolCalls, messageId }: ToolCallAccordionProps) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="space-y-1">
      {toolCalls.map((tc, i) => (
        <AccordionItem key={i} toolCall={tc} index={i} messageId={messageId} />
      ))}
    </div>
  );
}
