import type { FilteredMessage, MessageFilter } from "../types";

export function assignMessageIds(messages: any[]): any[] {
  return messages.map((message, index) => ({
    ...message,
    id: message?.id ?? `msg_${index}`,
  }));
}

export function filterMessages(messages: any[], filter: MessageFilter): FilteredMessage[] {
  const includeThinking = filter.includeThinking === true;
  const includeToolResults = filter.includeToolResults === true;

  const withIds = assignMessageIds(messages);

  const sinceIndex = filter.sinceMessageId
    ? withIds.findIndex((message) => message?.id === filter.sinceMessageId)
    : -1;

  const sliced = sinceIndex >= 0 ? withIds.slice(sinceIndex + 1) : withIds;

  const filtered: FilteredMessage[] = [];

  for (const message of sliced) {
    const parts = Array.isArray(message?.parts) ? message.parts : [];
    const visibleParts = parts.filter((part: any) => {
      const partType = part?.type ?? "text";
      if (partType === "thinking" && !includeThinking) {
        return false;
      }
      if (partType === "tool_result" && !includeToolResults) {
        return false;
      }
      return true;
    });

    if (visibleParts.length === 0) {
      continue;
    }

    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const toolCalls: any[] = [];

    for (const part of visibleParts) {
      const partType = part?.type ?? "text";
      const rawText = typeof part?.text === "string" ? part.text : "";

      if (partType === "text") {
        textParts.push(rawText);
      }

      if (partType === "thinking") {
        const thought =
          typeof filter.thinkingMaxChars === "number"
            ? rawText.slice(0, Math.max(0, filter.thinkingMaxChars))
            : rawText;
        thinkingParts.push(thought);
      }

      if (partType === "tool_use") {
        toolCalls.push(part);
      }
    }

    let content = textParts.join("\n");
    if (!content && thinkingParts.length > 0) {
      content = thinkingParts.join("\n");
    }
    if (!content) {
      content = visibleParts
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .filter((text: string) => text.length > 0)
        .join("\n");
    }

    filtered.push({
      id: message.id,
      role: message?.info?.role ?? "assistant",
      type: visibleParts[0]?.type ?? "text",
      content,
      thinking: thinkingParts.length > 0 ? thinkingParts.join("\n") : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: typeof message?.timestamp === "string" ? message.timestamp : undefined,
    });
  }

  if (typeof filter.messageLimit === "number" && filter.messageLimit >= 0) {
    return filtered.slice(-filter.messageLimit);
  }

  return filtered;
}