import type { FilteredMessage, TimelineEvent } from '../types';

function truncate(s: string, max = 500): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function parseTimelineEvents(
  messages: FilteredMessage[],
  taskId: string
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const message of messages) {
    const toolCalls: any[] = Array.isArray(message.toolCalls) ? message.toolCalls : [];
    if (toolCalls.length === 0) continue;

    const startBase = message.timestamp ? Date.parse(message.timestamp) : 0;

    toolCalls.forEach((tc, index) => {
      const toolName: string = tc?.name || tc?.type || 'unknown';
      const hasResult = tc?.result !== undefined || tc?.output !== undefined;
      const hasError = tc?.error !== undefined;

      let status: TimelineEvent['status'];
      if (hasError) {
        status = 'error';
      } else if (hasResult) {
        status = 'completed';
      } else {
        status = 'running';
      }

      const startTime = isNaN(startBase) ? 0 : startBase;
      const durationMs: number = typeof tc?.duration === 'number' ? tc.duration : 0;
      const endTime = (status === 'completed' || status === 'error') ? startTime + durationMs : undefined;
      const duration = endTime !== undefined ? endTime - startTime : undefined;

      const argsRaw = tc?.input ?? tc?.args;
      const resultRaw = tc?.result ?? tc?.output;

      const event: TimelineEvent = {
        id: `${taskId}-${message.id}-${toolName}-${index}`,
        taskId,
        messageId: message.id,
        toolName,
        status,
        startTime,
        ...(endTime !== undefined && { endTime }),
        ...(duration !== undefined && { duration }),
        ...(argsRaw !== undefined && { args: truncate(JSON.stringify(argsRaw)) }),
        ...(resultRaw !== undefined && { result: truncate(JSON.stringify(resultRaw)) }),
      };

      events.push(event);
    });
  }

  events.sort((a, b) => a.startTime - b.startTime);
  return events;
}