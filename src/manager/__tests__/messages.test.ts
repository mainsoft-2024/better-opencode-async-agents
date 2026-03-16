import { describe, expect, test } from "bun:test";
import type { FilteredMessage, MessageFilter } from "../../types";
import { assignMessageIds, filterMessages } from "../messages";

type RawMessage = {
  id?: string;
  info?: { role?: "user" | "assistant" | string };
  parts?: Array<{ type?: "text" | "thinking" | "tool_result" | string; text?: string }>;
};

const createMessage = (
  role: "user" | "assistant",
  type: "text" | "thinking" | "tool_result",
  text: string
): RawMessage => ({
  info: { role },
  parts: [{ type, text }],
});

const toIds = (messages: FilteredMessage[]): string[] => messages.map((message) => message.id);

const runFilter = (messages: RawMessage[], filter: MessageFilter = {}): FilteredMessage[] =>
  filterMessages(messages as any[], filter);

describe("messages", () => {
  describe("assignMessageIds", () => {
    test("assigns msg_N IDs to messages without IDs", () => {
      const messages: RawMessage[] = [
        createMessage("user", "text", "Hello"),
        createMessage("assistant", "text", "Hi there"),
      ];

      const result = assignMessageIds(messages as any[]);

      expect(result[0]?.id).toBe("msg_0");
      expect(result[1]?.id).toBe("msg_1");
    });

    test("preserves existing IDs", () => {
      const messages: RawMessage[] = [
        { id: "msg_existing", ...createMessage("user", "text", "Hello") },
        createMessage("assistant", "text", "Hi there"),
      ];

      const result = assignMessageIds(messages as any[]);

      expect(result[0]?.id).toBe("msg_existing");
      expect(result[1]?.id).toBe("msg_1");
    });
  });

  describe("filterMessages", () => {
    test("returns all messages for an empty filter", () => {
      const messages: RawMessage[] = [
        createMessage("user", "text", "Q1"),
        createMessage("assistant", "text", "A1"),
        createMessage("user", "text", "Q2"),
      ];

      const result = runFilter(messages, {});

      expect(result).toHaveLength(3);
      expect(toIds(result)).toEqual(["msg_0", "msg_1", "msg_2"]);
      expect(result.map((message) => message.content)).toEqual(["Q1", "A1", "Q2"]);
    });

    test("maps info.role and parts fields into FilteredMessage shape", () => {
      const messages: RawMessage[] = [
        { info: { role: "user" }, parts: [{ type: "text", text: "Question" }] },
        { info: { role: "assistant" }, parts: [{ type: "text", text: "Answer" }] },
      ];

      const result = runFilter(messages, {});

      expect(result[0]?.role).toBe("user");
      expect(result[0]?.type).toBe("text");
      expect(result[0]?.content).toBe("Question");
      expect(result[1]?.role).toBe("assistant");
      expect(result[1]?.type).toBe("text");
      expect(result[1]?.content).toBe("Answer");
    });

    test("returns only messages after sinceMessageId when ID exists", () => {
      const messages: RawMessage[] = [
        createMessage("user", "text", "Q1"),
        createMessage("assistant", "text", "A1"),
        createMessage("user", "text", "Q2"),
        createMessage("assistant", "text", "A2"),
      ];

      const result = runFilter(messages, { sinceMessageId: "msg_1" });

      expect(result).toHaveLength(2);
      expect(toIds(result)).toEqual(["msg_2", "msg_3"]);
      expect(result.map((message) => message.content)).toEqual(["Q2", "A2"]);
    });

    test("returns all messages when sinceMessageId does not exist", () => {
      const messages: RawMessage[] = [
        createMessage("user", "text", "Q1"),
        createMessage("assistant", "text", "A1"),
      ];

      const result = runFilter(messages, { sinceMessageId: "msg_999" });

      expect(result).toHaveLength(2);
      expect(toIds(result)).toEqual(["msg_0", "msg_1"]);
    });

    test("filters out thinking parts when includeThinking is false (default)", () => {
      const messages: RawMessage[] = [
        createMessage("user", "text", "Q1"),
        createMessage("assistant", "thinking", "private chain of thought"),
        createMessage("assistant", "text", "A1"),
      ];

      const result = runFilter(messages, {});

      expect(result).toHaveLength(2);
      expect(result.every((message) => message.type !== "thinking")).toBe(true);
    });

    test("preserves thinking parts when includeThinking is true", () => {
      const messages: RawMessage[] = [
        createMessage("assistant", "thinking", "private chain of thought"),
        createMessage("assistant", "text", "A1"),
      ];

      const result = runFilter(messages, { includeThinking: true });

      expect(result).toHaveLength(2);
      expect(result.some((message) => message.type === "thinking")).toBe(true);
    });

    test("filters out tool_result parts when includeToolResults is false (default)", () => {
      const messages: RawMessage[] = [
        createMessage("assistant", "text", "I will run a tool"),
        createMessage("assistant", "tool_result", "tool output payload"),
        createMessage("assistant", "text", "Done"),
      ];

      const result = runFilter(messages, {});

      expect(result).toHaveLength(2);
      expect(result.every((message) => message.type !== "tool_result")).toBe(true);
    });

    test("preserves tool_result parts when includeToolResults is true", () => {
      const messages: RawMessage[] = [
        createMessage("assistant", "tool_result", "tool output payload"),
        createMessage("assistant", "text", "Done"),
      ];

      const result = runFilter(messages, { includeToolResults: true });

      expect(result).toHaveLength(2);
      expect(result.some((message) => message.type === "tool_result")).toBe(true);
    });

    test("truncates thinking content with thinkingMaxChars", () => {
      const thinkingText = "abcdefghijklmnopqrstuvwxyz";
      const messages: RawMessage[] = [
        createMessage("assistant", "thinking", thinkingText),
      ];

      const result = runFilter(messages, { includeThinking: true, thinkingMaxChars: 10 });
      const thinkingMessage = result.find((message) => message.type === "thinking");

      expect(thinkingMessage).toBeDefined();
      expect(thinkingMessage?.content.length).toBe(10);
      expect(thinkingMessage?.content).toBe("abcdefghij");
    });

    test("returns only the last N messages with messageLimit", () => {
      const messages: RawMessage[] = [
        createMessage("user", "text", "Q1"),
        createMessage("assistant", "text", "A1"),
        createMessage("user", "text", "Q2"),
        createMessage("assistant", "text", "A2"),
        createMessage("user", "text", "Q3"),
      ];

      const result = runFilter(messages, { messageLimit: 2 });

      expect(result).toHaveLength(2);
      expect(toIds(result)).toEqual(["msg_3", "msg_4"]);
      expect(result.map((message) => message.content)).toEqual(["A2", "Q3"]);
    });

    test("applies combined filters in pipeline order", () => {
      const messages: RawMessage[] = [
        createMessage("user", "text", "Q0"),
        createMessage("assistant", "thinking", "thought-1"),
        createMessage("assistant", "text", "A1"),
        createMessage("assistant", "thinking", "thought-2"),
        createMessage("assistant", "text", "A2"),
      ];

      const result = runFilter(messages, {
        sinceMessageId: "msg_0",
        includeThinking: true,
        messageLimit: 2,
      });

      expect(result).toHaveLength(2);
      expect(toIds(result)).toEqual(["msg_3", "msg_4"]);
      expect(result.map((message) => message.type)).toEqual(["thinking", "text"]);
      expect(result.map((message) => message.content)).toEqual(["thought-2", "A2"]);
    });
  });
});