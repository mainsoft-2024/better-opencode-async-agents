import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TimelineEvent } from '../../types';
import { useTaskMessages } from '../../stores/messageStore';
import { parseTimelineEvents } from '../../utils/parseTimelineEvents';

// ─── Bar renderer ──────────────────────────────────────────────────────────

interface BarProps {
  event: TimelineEvent;
  leftPct: number;
  widthPct: number;
  onJumpToMessage?: (messageId: string) => void;
}

const TimelineBar = memo(function TimelineBar({ event, leftPct, widthPct, onJumpToMessage }: BarProps) {
  const [hovered, setHovered] = useState(false);

  const bgClass =
    event.status === 'running'
      ? 'bg-cyan-500/60 animate-pulse'
      : event.status === 'error'
        ? 'bg-red-500/80'
        : 'bg-green-500/80';

  const durationLabel =
    typeof event.duration === 'number'
      ? `${event.duration}ms`
      : event.status === 'running'
        ? 'running…'
        : '–';

  const truncArgs = event.args ? event.args.slice(0, 100) + (event.args.length > 100 ? '…' : '') : null;

  return (
    <div
      className="relative"
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, position: 'absolute', height: '100%' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onJumpToMessage?.(event.messageId)}
    >
      <div
        className={`h-full rounded cursor-pointer transition-opacity hover:opacity-90 ${bgClass}`}
        data-status={event.status}
      />
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 bottom-full mb-1 left-0 min-w-max max-w-xs bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-xs text-gray-100 shadow-xl pointer-events-none"
          >
            <p className="font-semibold text-white">{event.toolName}</p>
            <p className="text-gray-400">Duration: {durationLabel}</p>
            <p className="text-gray-400 capitalize">Status: {event.status}</p>
            {truncArgs && (
              <p className="text-gray-400 mt-1 font-mono text-[10px] break-all">{truncArgs}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── Skeleton rows ─────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 items-center h-6">
      <div className="h-3 bg-gray-800 rounded animate-pulse" />
      <div className="relative h-full">
        <div className="absolute inset-0 bg-gray-800 rounded animate-pulse" style={{ left: '0%', width: '40%' }} />
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export interface ToolTimelineProps {
  taskId: string;
  onJumpToMessage?: (messageId: string) => void;
  loading?: boolean;
}

export function ToolTimeline({ taskId, onJumpToMessage, loading }: ToolTimelineProps) {
  const messages = useTaskMessages(taskId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => parseTimelineEvents(messages, taskId), [messages, taskId]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest event
  useEffect(() => {
    if (events.length > 0) {
      if (typeof bottomRef.current?.scrollIntoView === 'function') {
        bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [events.length]);

  // Compute time axis
  const minTime = events.length > 0 ? Math.min(...events.map((e) => e.startTime)) : 0;
  const maxTime = events.length > 0
    ? Math.max(...events.map((e) => e.endTime ?? e.startTime + 1000))
    : 1000;
  const totalRange = Math.max(maxTime - minTime, 1);

  function getBarGeometry(event: TimelineEvent) {
    const start = event.startTime - minTime;
    const end = event.endTime != null ? event.endTime - minTime : Math.min(start + totalRange * 0.2, totalRange);
    const leftPct = (start / totalRange) * 100;
    const rawWidthPct = ((end - start) / totalRange) * 100;
    const widthPct = event.status === 'running'
      ? Math.max(rawWidthPct, 20)
      : Math.max(rawWidthPct, 2);
    return { leftPct: Math.min(leftPct, 100), widthPct: Math.min(widthPct, 100 - leftPct) };
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-gray-300 tracking-wide uppercase">Tool Timeline</span>
        {events.length > 0 && (
          <span className="ml-auto inline-flex items-center justify-center rounded-full bg-gray-800 text-gray-400 text-[10px] font-mono px-2 h-5">
            {events.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No tool calls yet
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {events.map((event) => {
                const { leftPct, widthPct } = getBarGeometry(event);
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="grid gap-2 items-center h-6"
                    style={{ gridTemplateColumns: '120px 1fr' }}
                  >
                    {/* Tool name label */}
                    <span
                      className="text-[11px] text-gray-400 truncate font-mono"
                      title={event.toolName}
                    >
                      {event.toolName}
                    </span>

                    {/* Bar area */}
                    <div className="relative h-full">
                      <TimelineBar
                        event={event}
                        leftPct={leftPct}
                        widthPct={widthPct}
                        onJumpToMessage={onJumpToMessage}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}