import { motion } from 'framer-motion';
import type { MessageGroup } from '../../types';

// Inline fallbacks — real components created by parallel coders
let MarkdownRenderer: React.ComponentType<{ content: string }> | null = null;
let ToolCallAccordion: React.ComponentType<{ toolCalls: any[] }> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  MarkdownRenderer = require('./MarkdownRenderer').MarkdownRenderer;
} catch {
  // not yet available — fallback below
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ToolCallAccordion = require('./ToolCallAccordion').ToolCallAccordion;
} catch {
  // not yet available — fallback below
}

function FallbackMarkdown({ content }: { content: string }) {
  return <pre className="whitespace-pre-wrap break-words text-sm text-gray-100">{content}</pre>;
}

function FallbackToolCalls({ toolCalls }: { toolCalls: any[] }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-gray-400">
        {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
      </summary>
      <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-500">
        {JSON.stringify(toolCalls, null, 2)}
      </pre>
    </details>
  );
}

const ROLE_STYLES: Record<string, { avatar: string; border: string; bg: string; badge: string }> = {
  user: {
    avatar: 'bg-blue-600 text-white',
    border: 'border-blue-800/40',
    bg: 'bg-blue-950/30',
    badge: 'bg-blue-900/50 text-blue-300',
  },
  assistant: {
    avatar: 'bg-green-600 text-white',
    border: 'border-green-800/40',
    bg: 'bg-green-950/30',
    badge: 'bg-green-900/50 text-green-300',
  },
  system: {
    avatar: 'bg-gray-600 text-white',
    border: 'border-gray-700/40',
    bg: 'bg-gray-900/30',
    badge: 'bg-gray-800/50 text-gray-300',
  },
};

const DEFAULT_ROLE_STYLE = ROLE_STYLES.system;

function formatTimestamp(ts?: string): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

export interface MessageBubbleProps {
  group: MessageGroup;
  isLatest?: boolean;
}

export function MessageBubble({ group, isLatest }: MessageBubbleProps) {
  const role = group.speakerRole ?? 'system';
  const styles = ROLE_STYLES[role] ?? DEFAULT_ROLE_STYLE;
  const avatarLetter = role.charAt(0).toUpperCase();
  const firstMsgId = group.messages[0]?.id ?? '';
  const timestamp = group.startTime;

  const ContentRenderer = MarkdownRenderer ?? FallbackMarkdown;
  const ToolRenderer = ToolCallAccordion ?? FallbackToolCalls;

  return (
    <motion.div
      id={`msg-${firstMsgId}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      data-latest={isLatest || undefined}
      className={`rounded-lg border p-3 ${styles.border} ${styles.bg}`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span
          aria-label={`${role} avatar`}
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${styles.avatar}`}
        >
          {avatarLetter}
        </span>
        <span
          data-testid="role-badge"
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles.badge}`}
        >
          {role}
        </span>
        {group.speakerName && group.speakerName !== role && (
          <span data-testid="agent-name" className="text-xs text-gray-400">
            {group.speakerName}
          </span>
        )}
        {timestamp && (
          <span data-testid="timestamp" className="ml-auto text-xs text-gray-500">
            {formatTimestamp(timestamp)}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-2">
        {group.messages.map((msg) => (
          <div key={msg.id} className="space-y-1">
            {msg.content && <ContentRenderer content={msg.content} />}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <ToolRenderer toolCalls={msg.toolCalls} />
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}