// =============================================================================
// Fork Context Processing Utilities - 3-Stage Smart Truncation Pipeline
// =============================================================================

import {
  FORK_CHAR_BUDGET,
  FORK_CHAR_NO_REMOVAL,
  FORK_ERROR_PATTERNS,
  FORK_HEAD_RATIO,
  FORK_HEAD_TAIL_KEYWORDS,
  FORK_NO_TRUNCATION_TOOLS,
  FORK_PARAMS_TIER1,
  FORK_PARAMS_TIER2,
  FORK_PARAMS_TIER3,
  FORK_TAIL_RATIO,
  FORK_TIER1_COUNT,
  FORK_TIER2_COUNT,
  FORK_TIER2_LIMIT,
  FORK_TIER3_LIMIT,
} from "../constants";

// =============================================================================
// Exported Interfaces
// =============================================================================

export interface SessionMessage {
  info?: { role?: string; summary?: boolean };
  parts?: Array<{
    type?: string;
    text?: string;
    auto?: boolean;
    // OpenCode ToolPart fields
    tool?: string;
    state?: { input?: Record<string, unknown>; time?: { compacted?: string } };
    // Legacy fields (kept for compatibility)
    name?: string;
    id?: string;
    input?: Record<string, unknown>;
  }>;
}

export interface ProcessingStats {
  originalCount: number;
  finalCount: number;
  totalChars: number;
  truncatedResults: number;
  removedMessages: number;
  compactionDetected: boolean;
  compactionSliceIndex: number;
  tierDistribution: { tier1: number; tier2: number; tier3: number };
  headTailApplied: number;
}

// =============================================================================
// Internal Helper Functions
// =============================================================================

/**
 * Finds the compaction boundary in messages.
 * Scans messages backwards to find the latest compaction marker,
 * then finds the next assistant message with summary=true.
 * @returns Index of the summary assistant message, or -1 if not found
 */
function findCompactionBoundary(messages: SessionMessage[]): number {
  let compactionIndex = -1;

  // Scan messages backwards to find latest compaction marker
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.parts) {
      for (const part of msg.parts) {
        if (part?.type === "compaction") {
          compactionIndex = i;
          break;
        }
      }
    }
    if (compactionIndex >= 0) break;
  }

  // If no compaction found, return -1
  if (compactionIndex < 0) return -1;

  // Find the next assistant message after compaction with summary=true
  for (let i = compactionIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.info?.role === "assistant" && msg.info?.summary === true) {
      return i;
    }
  }

  // Compaction found but no summary assistant after it
  return -1;
}

/**
 * Determines the tier for a tool result based on its index from the end.
 * @param indexFromEnd - Index from the end (0 = newest)
 * @returns Tier number (1, 2, or 3)
 */
function getToolResultTier(indexFromEnd: number): 1 | 2 | 3 {
  if (indexFromEnd < FORK_TIER1_COUNT) {
    return 1;
  }
  if (indexFromEnd < FORK_TIER1_COUNT + FORK_TIER2_COUNT) {
    return 2;
  }
  return 3;
}

/**
 * Determines whether to use head+tail truncation strategy.
 * Checks tool name against keywords and result text against error patterns.
 */
function shouldUseHeadTail(toolName: string | undefined, resultText: string): boolean {
  // Check tool name against head+tail keywords
  if (toolName) {
    for (const keyword of FORK_HEAD_TAIL_KEYWORDS) {
      if (toolName.includes(keyword)) {
        return true;
      }
    }
  }

  // Check result text against error patterns
  for (const pattern of FORK_ERROR_PATTERNS) {
    if (resultText.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Truncates text using either head-only or head+tail strategy.
 */
function truncateWithStrategy(text: string, limit: number, useHeadTail: boolean): string {
  if (text.length <= limit) {
    return text;
  }

  if (useHeadTail) {
    // Head+tail mode: keep 80% from head, 20% from tail
    const headSize = Math.floor(limit * FORK_HEAD_RATIO);
    const tailSize = Math.floor(limit * FORK_TAIL_RATIO);
    const truncatedCount = text.length - headSize - tailSize;

    const head = text.slice(0, headSize);
    const tail = text.slice(-tailSize);

    return `${head}\n...[truncated ${truncatedCount} chars]...\n${tail}`;
  }
  // Head-only mode: keep first N chars
  return `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]...`;
}

/**
 * Counts total tool results across all messages.
 */
function countToolResults(messages: SessionMessage[]): number {
  let count = 0;
  for (const msg of messages) {
    if (msg.parts) {
      for (const part of msg.parts) {
        if (part.type === "tool_result") {
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Checks if a tool result has already been compacted.
 */
function isCompactedResult(text: string): boolean {
  return text.includes("[Old tool result content cleared]");
}

/**
 * Resolves the tool name for a tool_result part by scanning backwards
 * through the message parts to find the associated tool call.
 */
function resolveToolName(
  parts: NonNullable<SessionMessage["parts"]>,
  toolResultPartIndex: number
): string | undefined {
  // First check if the tool_result itself has a name/tool field
  const resultPart = parts[toolResultPartIndex];
  if (resultPart?.tool) return resultPart.tool;
  if (resultPart?.name) return resultPart.name;

  // Scan backwards to find the associated tool call
  for (let i = toolResultPartIndex - 1; i >= 0; i--) {
    const p = parts[i];
    if (p?.type === "tool") {
      return p.tool || p.name;
    }
  }
  return undefined;
}

// =============================================================================
// Exported Functions
// =============================================================================

/**
 * Processes messages for fork context using a 3-stage pipeline:
 * 1. Compaction boundary detection
 * 2. Graduated tool result truncation
 * 3. Character budget enforcement (in formatMessagesAsContext)
 */
export function processMessagesForFork(messages: SessionMessage[]): {
  messages: SessionMessage[];
  stats: ProcessingStats;
} {
  // Initialize stats
  const stats: ProcessingStats = {
    originalCount: messages.length,
    finalCount: messages.length,
    totalChars: 0,
    truncatedResults: 0,
    removedMessages: 0,
    compactionDetected: false,
    compactionSliceIndex: -1,
    tierDistribution: { tier1: 0, tier2: 0, tier3: 0 },
    headTailApplied: 0,
  };

  // Stage 1: Compaction Boundary Detection
  const sliceIndex = findCompactionBoundary(messages);
  let workingMessages: SessionMessage[];

  if (sliceIndex >= 0) {
    stats.compactionDetected = true;
    stats.compactionSliceIndex = sliceIndex;
    workingMessages = messages.slice(sliceIndex);
  } else {
    workingMessages = [...messages];
  }

  // Stage 2: Graduated Truncation
  const totalToolResults = countToolResults(workingMessages);
  let toolResultIndex = 0; // Will count from start, then calculate indexFromEnd

  const processedMessages: SessionMessage[] = [];

  for (const msg of workingMessages) {
    if (!msg.parts) {
      processedMessages.push(msg);
      continue;
    }

    const processedParts: SessionMessage["parts"] = [];
    for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
      const part = msg.parts[partIdx];

      if (!part) continue;

      if (part.type !== "tool_result" || !part.text) {
        processedParts.push(part);
        continue;
      }

      // Calculate index from end (newest = 0)
      const indexFromEnd = totalToolResults - 1 - toolResultIndex;
      toolResultIndex++;

      // Skip already-compacted results
      if (isCompactedResult(part.text)) {
        processedParts.push(part);
        continue;
      }

      // Resolve tool name once for both no-truncation check and strategy determination
      const toolName = resolveToolName(msg.parts!, partIdx);

      // Determine tier and apply truncation
      const tier = getToolResultTier(indexFromEnd);

      // Update tier distribution
      if (tier === 1) stats.tierDistribution.tier1++;
      else if (tier === 2) stats.tierDistribution.tier2++;
      else stats.tierDistribution.tier3++;

      // Tier 1: no truncation
      if (tier === 1) {
        processedParts.push(part);
        continue;
      }

      // Skip truncation for tools in the no-truncation list (raw data preserved)
      if (toolName && FORK_NO_TRUNCATION_TOOLS.some((name) => toolName.includes(name))) {
        processedParts.push(part);
        continue;
      }

      // Determine truncation strategy with resolved tool name
      const limit = tier === 2 ? FORK_TIER2_LIMIT : FORK_TIER3_LIMIT;
      const useHeadTail = shouldUseHeadTail(toolName, part.text);

      const truncatedText = truncateWithStrategy(part.text, limit, useHeadTail);

      if (truncatedText !== part.text) {
        stats.truncatedResults++;
        if (useHeadTail) {
          stats.headTailApplied++;
        }
      }

      processedParts.push({ ...part, text: truncatedText });
    }

    processedMessages.push({ ...msg, parts: processedParts });
  }

  return { messages: processedMessages, stats };
}

/**
 * Formats processed messages into a context string for injection.
 * Applies Stage 3: Character Budget Enforcement
 */
export function formatMessagesAsContext(
  messages: SessionMessage[],
  stats: ProcessingStats
): string {
  if (messages.length === 0) {
    stats.finalCount = 0;
    stats.totalChars = 0;
    return "";
  }

  // Build tool-to-tier mapping for parameter truncation
  const toolTierMap = new Map<number, 1 | 2 | 3>();
  let toolResultIndex = 0;
  const totalToolResults = countToolResults(messages);

  // First pass: map tool call indices to tiers
  for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
    const msg = messages[msgIndex];
    if (!msg?.parts) continue;

    for (let partIndex = 0; partIndex < msg.parts.length; partIndex++) {
      const part = msg.parts[partIndex];
      if (!part) continue;
      if (part.type === "tool_result") {
        const indexFromEnd = totalToolResults - 1 - toolResultIndex;
        const tier = getToolResultTier(indexFromEnd);
        // Store reference to the tool call that produced this result
        // We'll use a simple heuristic: tool calls are typically before their results
        toolTierMap.set(toolResultIndex, tier);
        toolResultIndex++;
      }
    }
  }

  // Helper to format a single message
  function formatMessage(msg: SessionMessage): string {
    const role = msg.info?.role ?? "unknown";
    const roleLabel =
      role === "user"
        ? "User"
        : role === "assistant"
          ? "Agent"
          : role.charAt(0).toUpperCase() + role.slice(1);

    const lines: string[] = [`\n${roleLabel}:`];

    if (msg.parts) {
      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          lines.push(part.text);
        } else if (part.type === "tool" && part.tool) {
          // Format tool call with tier-based parameter limits
          let paramsPreview = "";
          const input = part.state?.input;
          if (input) {
            const paramsStr = JSON.stringify(input);
            // Find this tool call's tier by looking for its result
            const limit = FORK_PARAMS_TIER3; // Default to tier 3 for safety
            paramsPreview =
              paramsStr.length > limit ? ` ${paramsStr.slice(0, limit)}...` : ` ${paramsStr}`;
          }
          lines.push(`[Tool: ${part.tool}]${paramsPreview}`);
        } else if (part.type === "tool_result" && part.text) {
          lines.push(`[Tool result]\n${part.text}`);
        }
      }
    }

    return lines.join("\n");
  }

  // Stage 3: Character Budget Enforcement
  function formatWithBudget(msgs: SessionMessage[]): { text: string; charCount: number } {
    const formatted = msgs.map(formatMessage).join("");
    const wrapped = `<inherited_context>${formatted}\n</inherited_context>`;
    return { text: wrapped, charCount: wrapped.length };
  }

  let currentMessages = messages;
  let result = formatWithBudget(currentMessages);

  // If within no-removal threshold, keep everything
  if (result.charCount <= FORK_CHAR_NO_REMOVAL) {
    stats.totalChars = result.charCount;
    stats.finalCount = currentMessages.length;
    return result.text;
  }

  // If over budget, remove oldest messages one by one
  while (result.charCount > FORK_CHAR_BUDGET && currentMessages.length > 1) {
    stats.removedMessages++;
    currentMessages = currentMessages.slice(1);
    result = formatWithBudget(currentMessages);
  }

  stats.totalChars = result.charCount;
  stats.finalCount = currentMessages.length;

  return result.text;
}
