import { describe, expect, test } from "bun:test";
import { buildForkPreamble } from "../../prompts";
import {
  type ProcessingStats,
  type SessionMessage,
  formatMessagesAsContext,
  processMessagesForFork,
} from "../index";

// =============================================================================
// Test Helper Functions
// =============================================================================

function makeToolResultMsg(text: string, toolName?: string): SessionMessage {
  const parts: any[] = [];
  if (toolName) {
    parts.push({ type: "tool", tool: toolName, state: { input: {} } });
  }
  parts.push({ type: "tool_result", text, name: toolName });
  return { info: { role: "assistant" }, parts };
}

// =============================================================================
// A. Compaction Boundary Detection Tests
// =============================================================================

describe("compaction boundary detection", () => {
  test("no compaction markers - all messages preserved", () => {
    const messages: SessionMessage[] = [
      { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "hi" }] },
    ];
    const { messages: result, stats } = processMessagesForFork(messages);
    expect(stats.compactionDetected).toBe(false);
    expect(stats.compactionSliceIndex).toBe(-1);
    expect(result.length).toBe(2);
  });

  test("single compaction - slices from summary assistant", () => {
    const messages: SessionMessage[] = [
      { info: { role: "user" }, parts: [{ type: "text", text: "old msg 1" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "old response" }] },
      { info: { role: "user" }, parts: [{ type: "compaction", auto: true }] },
      {
        info: { role: "assistant", summary: true },
        parts: [{ type: "text", text: "Summary of conversation" }],
      },
      { info: { role: "user" }, parts: [{ type: "text", text: "new msg" }] },
    ];
    const { messages: result, stats } = processMessagesForFork(messages);
    expect(stats.compactionDetected).toBe(true);
    expect(result.length).toBe(2); // summary + new msg
    expect(result[0].parts![0].text).toBe("Summary of conversation");
  });

  test("multiple compactions - uses latest", () => {
    const messages: SessionMessage[] = [
      { info: { role: "user" }, parts: [{ type: "compaction", auto: true }] },
      {
        info: { role: "assistant", summary: true },
        parts: [{ type: "text", text: "old summary" }],
      },
      { info: { role: "user" }, parts: [{ type: "text", text: "middle" }] },
      { info: { role: "user" }, parts: [{ type: "compaction", auto: true }] },
      {
        info: { role: "assistant", summary: true },
        parts: [{ type: "text", text: "latest summary" }],
      },
      { info: { role: "user" }, parts: [{ type: "text", text: "newest" }] },
    ];
    const { messages: result, stats } = processMessagesForFork(messages);
    expect(stats.compactionDetected).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].parts![0].text).toBe("latest summary");
  });

  test("compaction marker without summary assistant - treated as no compaction", () => {
    const messages: SessionMessage[] = [
      { info: { role: "user" }, parts: [{ type: "compaction", auto: true }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "no summary" }] },
    ];
    const { messages: result, stats } = processMessagesForFork(messages);
    expect(stats.compactionDetected).toBe(false);
    expect(result.length).toBe(2);
  });
});

// =============================================================================
// B. Graduated Tier Truncation Tests
// =============================================================================

describe("graduated tier truncation", () => {
  test("tier 1 (newest 5) - not truncated", () => {
    // Create exactly 5 tool results
    const longText = "x".repeat(6000);
    const messages = Array.from({ length: 5 }, () => makeToolResultMsg(longText));
    const { messages: result, stats } = processMessagesForFork(messages);
    expect(stats.tierDistribution.tier1).toBe(5);
    // All should be full length
    for (const msg of result) {
      const toolResult = msg.parts!.find((p) => p.type === "tool_result");
      expect(toolResult!.text!.length).toBe(6000);
    }
  });

  test("tier 2 (index 5-14) - truncated to 3000 chars", () => {
    const longText = "x".repeat(6000);
    // 6 messages: first one is tier 2, last 5 are tier 1
    const messages = Array.from({ length: 6 }, () => makeToolResultMsg(longText));
    const { messages: result, stats } = processMessagesForFork(messages);
    expect(stats.tierDistribution.tier1).toBe(5);
    expect(stats.tierDistribution.tier2).toBe(1);
    // First message should be truncated (it's the oldest = tier 2)
    const firstResult = result[0].parts!.find((p) => p.type === "tool_result");
    expect(firstResult!.text!.length).toBeLessThan(6000);
    expect(firstResult!.text!).toContain("truncated");
  });

  test("tier 3 (index 15+) - truncated to 500 chars", () => {
    const longText = "x".repeat(6000);
    // 16 messages: first is tier 3, next 10 tier 2, last 5 tier 1
    const messages = Array.from({ length: 16 }, () => makeToolResultMsg(longText));
    const { messages: result, stats } = processMessagesForFork(messages);
    expect(stats.tierDistribution.tier1).toBe(5);
    expect(stats.tierDistribution.tier2).toBe(10);
    expect(stats.tierDistribution.tier3).toBe(1);
    // First message should be heavily truncated (tier 3)
    const firstResult = result[0].parts!.find((p) => p.type === "tool_result");
    expect(firstResult!.text!.length).toBeLessThan(1000);
  });

  test("already-compacted results pass through unchanged", () => {
    const messages: SessionMessage[] = [makeToolResultMsg("[Old tool result content cleared]")];
    const { messages: result, stats } = processMessagesForFork(messages);
    expect(result[0].parts!.find((p) => p.type === "tool_result")!.text).toBe(
      "[Old tool result content cleared]"
    );
  });

  test("ask_user_questions in tier 2+ is NOT truncated (raw data preserved)", () => {
    // Create a long response that would normally be truncated
    const longText = "x".repeat(6000);
    // Create 6 messages with ask_user_questions: first is tier 2, last 5 are tier 1
    const filler = Array.from({ length: 5 }, () => makeToolResultMsg("short", "read"));
    const askUserMsg: SessionMessage = {
      info: { role: "assistant" },
      parts: [
        { type: "tool", tool: "ask_user_questions", state: { input: {} } },
        { type: "tool_result", text: longText, name: "ask_user_questions" },
      ],
    };
    const messages = [askUserMsg, ...filler];
    const { messages: result, stats } = processMessagesForFork(messages);

    // The ask_user_questions result should NOT be truncated despite being tier 2
    const askUserResult = result[0].parts!.find((p) => p.type === "tool_result")!;
    expect(askUserResult.text!.length).toBe(6000);
    expect(askUserResult.text).not.toContain("truncated");
    expect(stats.truncatedResults).toBe(0);
  });

  test("ask_user_questions in tier 3 is NOT truncated", () => {
    // Create 16 messages: first is tier 3, next 10 tier 2, last 5 tier 1
    const longText = "x".repeat(6000);
    const filler = Array.from({ length: 15 }, () => makeToolResultMsg("short", "read"));
    const askUserMsg: SessionMessage = {
      info: { role: "assistant" },
      parts: [
        { type: "tool", tool: "mcp_ask_user_questions", state: { input: {} } },
        { type: "tool_result", text: longText, name: "mcp_ask_user_questions" },
      ],
    };
    const messages = [askUserMsg, ...filler];
    const { messages: result, stats } = processMessagesForFork(messages);

    // The ask_user_questions result should NOT be truncated even in tier 3
    const askUserResult = result[0].parts!.find((p) => p.type === "tool_result")!;
    expect(askUserResult.text!.length).toBe(6000);
    expect(askUserResult.text).not.toContain("truncated");
  });

  test("normal tools in same tier ARE truncated (exception is specific)", () => {
    // Same setup as above but with a normal tool
    const longText = "x".repeat(6000);
    const filler = Array.from({ length: 5 }, () => makeToolResultMsg("short", "read"));
    const normalToolMsg: SessionMessage = {
      info: { role: "assistant" },
      parts: [
        { type: "tool", tool: "read", state: { input: {} } },
        { type: "tool_result", text: longText, name: "read" },
      ],
    };
    const messages = [normalToolMsg, ...filler];
    const { messages: result, stats } = processMessagesForFork(messages);

    // The normal read tool SHOULD be truncated in tier 2
    const readResult = result[0].parts!.find((p) => p.type === "tool_result")!;
    expect(readResult.text!.length).toBeLessThan(6000);
    expect(readResult.text).toContain("truncated");
    expect(stats.truncatedResults).toBe(1);
  });
});

// =============================================================================
// C. Smart Truncation Strategy Tests
// =============================================================================

describe("smart truncation strategy", () => {
  function makeToolResultMsgWithTool(text: string, toolName: string): SessionMessage {
    return {
      info: { role: "assistant" },
      parts: [
        { type: "tool", tool: toolName, state: { input: {} } },
        { type: "tool_result", text, name: toolName },
      ],
    };
  }

  test("bash tool uses head+tail truncation", () => {
    const text = `BASH_START\n${"x".repeat(5000)}\nBASH_END`;
    // Need 6+ messages so the oldest lands in tier 2+
    const filler = Array.from({ length: 5 }, () => makeToolResultMsg("short", "read"));
    const messages = [makeToolResultMsgWithTool(text, "mcp_bash"), ...filler];
    const { messages: result, stats } = processMessagesForFork(messages);
    const first = result[0].parts!.find((p) => p.type === "tool_result")!.text!;
    expect(first).toContain("BASH_START");
    expect(first).toContain("BASH_END");
    expect(first).toContain("truncated");
    expect(stats.headTailApplied).toBeGreaterThan(0);
  });

  test("non-keyword tool uses head-only truncation", () => {
    const text = `READ_START\n${"x".repeat(5000)}\nREAD_END`;
    const filler = Array.from({ length: 5 }, () => makeToolResultMsg("short", "read"));
    const messages = [makeToolResultMsgWithTool(text, "read"), ...filler];
    const { messages: result } = processMessagesForFork(messages);
    const first = result[0].parts!.find((p) => p.type === "tool_result")!.text!;
    expect(first).toContain("READ_START");
    expect(first).not.toContain("READ_END");
    expect(first).toContain("truncated");
  });

  test("error pattern triggers head+tail regardless of tool name", () => {
    const text = `START\n${"x".repeat(5000)}\nError: something failed`;
    const filler = Array.from({ length: 5 }, () => makeToolResultMsg("short", "read"));
    const messages = [makeToolResultMsgWithTool(text, "read"), ...filler];
    const { messages: result, stats } = processMessagesForFork(messages);
    const first = result[0].parts!.find((p) => p.type === "tool_result")!.text!;
    expect(first).toContain("START");
    expect(first).toContain("Error: something failed");
    expect(stats.headTailApplied).toBeGreaterThan(0);
  });
});

// =============================================================================
// D. Character Budget Enforcement Tests
// =============================================================================

describe("character budget enforcement", () => {
  test("small context - no message removal", () => {
    const messages: SessionMessage[] = [
      { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "hi" }] },
    ];
    const { messages: processed, stats } = processMessagesForFork(messages);
    const context = formatMessagesAsContext(processed, stats);
    expect(stats.removedMessages).toBe(0);
    expect(context.length).toBeLessThan(120000);
  });

  test("large context - removes oldest messages to fit budget", () => {
    // Create messages that will exceed 200k chars
    const messages: SessionMessage[] = Array.from({ length: 30 }, (_, i) => ({
      info: { role: "user" as const },
      parts: [{ type: "text", text: `Message ${i}: ${"x".repeat(10000)}` }],
    }));
    const { messages: processed, stats } = processMessagesForFork(messages);
    const context = formatMessagesAsContext(processed, stats);
    expect(stats.removedMessages).toBeGreaterThan(0);
    expect(context.length).toBeLessThanOrEqual(200000);
  });
});

// =============================================================================
// E. buildForkPreamble Tests
// =============================================================================

describe("buildForkPreamble", () => {
  test("with compaction detected", () => {
    const preamble = buildForkPreamble({
      compactionDetected: true,
      tierDistribution: { tier1: 5, tier2: 3, tier3: 2 },
      removedMessages: 0,
    });
    expect(preamble).toContain("Compaction summary included");
    expect(preamble).toContain("5 full");
    expect(preamble).toContain("3 truncated to 3000 chars");
    expect(preamble).toContain("2 truncated to 500 chars");
    expect(preamble).toContain("All messages preserved");
  });

  test("without compaction, with removed messages", () => {
    const preamble = buildForkPreamble({
      compactionDetected: false,
      tierDistribution: { tier1: 2, tier2: 0, tier3: 0 },
      removedMessages: 5,
    });
    expect(preamble).toContain("No compaction detected");
    expect(preamble).toContain("5 oldest messages removed");
  });
});

// =============================================================================
// F. formatMessagesAsContext Formatting Tests
// =============================================================================

describe("formatMessagesAsContext formatting", () => {
  test("wraps in inherited_context tags", () => {
    const messages: SessionMessage[] = [
      { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
    ];
    const stats: ProcessingStats = {
      originalCount: 1,
      finalCount: 1,
      totalChars: 0,
      truncatedResults: 0,
      removedMessages: 0,
      compactionDetected: false,
      compactionSliceIndex: -1,
      tierDistribution: { tier1: 0, tier2: 0, tier3: 0 },
      headTailApplied: 0,
    };
    const context = formatMessagesAsContext(messages, stats);
    expect(context).toContain("<inherited_context>");
    expect(context).toContain("</inherited_context>");
  });

  test("labels roles correctly", () => {
    const messages: SessionMessage[] = [
      { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "hi" }] },
    ];
    const stats: ProcessingStats = {
      originalCount: 2,
      finalCount: 2,
      totalChars: 0,
      truncatedResults: 0,
      removedMessages: 0,
      compactionDetected: false,
      compactionSliceIndex: -1,
      tierDistribution: { tier1: 0, tier2: 0, tier3: 0 },
      headTailApplied: 0,
    };
    const context = formatMessagesAsContext(messages, stats);
    expect(context).toContain("User:");
    expect(context).toContain("Agent:");
  });

  test("formats tool calls and results", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [
          { type: "tool", tool: "read", state: { input: { path: "/test" } } },
          { type: "tool_result", text: "file contents" },
        ],
      },
    ];
    const stats: ProcessingStats = {
      originalCount: 1,
      finalCount: 1,
      totalChars: 0,
      truncatedResults: 0,
      removedMessages: 0,
      compactionDetected: false,
      compactionSliceIndex: -1,
      tierDistribution: { tier1: 0, tier2: 0, tier3: 0 },
      headTailApplied: 0,
    };
    const context = formatMessagesAsContext(messages, stats);
    expect(context).toContain("[Tool: read]");
    expect(context).toContain("[Tool result]");
    expect(context).toContain("file contents");
  });
});
