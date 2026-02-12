import { describe, expect, test } from "bun:test";
import {
  formatDuration,
  formatTaskStatus,
  getStatusIcon,
  shortId,
  truncateText,
  uniqueShortId,
} from "./helpers";
import type { BackgroundTask } from "./types";

describe("helpers", () => {
  describe("formatDuration", () => {
    test("formats seconds only", () => {
      const start = new Date("2024-01-01T00:00:00Z").toISOString();
      const end = new Date("2024-01-01T00:00:45Z").toISOString();
      expect(formatDuration(start, end)).toBe("45s");
    });

    test("formats minutes and seconds", () => {
      const start = new Date("2024-01-01T00:00:00Z").toISOString();
      const end = new Date("2024-01-01T00:02:30Z").toISOString();
      expect(formatDuration(start, end)).toBe("2m 30s");
    });

    test("formats hours, minutes and seconds", () => {
      const start = new Date("2024-01-01T00:00:00Z").toISOString();
      const end = new Date("2024-01-01T01:15:45Z").toISOString();
      expect(formatDuration(start, end)).toBe("1h 15m 45s");
    });

    test("uses current time when end is not provided", () => {
      const start = new Date(Date.now() - 5000).toISOString();
      const result = formatDuration(start);
      expect(result).toMatch(/^\d+s$/);
    });
  });

  describe("shortId", () => {
    test("converts full session ID to short format", () => {
      expect(shortId("ses_41e080918ffeyhQtX6E4vERe4O")).toBe("ses_41e08091");
    });

    test("handles session IDs with exactly 8 chars after prefix", () => {
      expect(shortId("ses_12345678")).toBe("ses_12345678");
    });

    test("handles session IDs with fewer than 8 chars after prefix", () => {
      expect(shortId("ses_1234")).toBe("ses_1234");
    });

    test("handles non-standard IDs by taking first 12 chars", () => {
      expect(shortId("bg_1234567890abcdef")).toBe("bg_123456789");
    });

    test("handles empty suffix after ses_ prefix", () => {
      expect(shortId("ses_")).toBe("ses_");
    });

    test("handles custom minLen parameter", () => {
      expect(shortId("ses_41e080918ffeyhQtX6E4vERe4O", 12)).toBe("ses_41e080918ffe");
    });
  });

  describe("uniqueShortId", () => {
    test("returns 8-char short ID when no collision", () => {
      const id = "ses_41e080918ffeyhQtX6E4vERe4O";
      const siblings = ["ses_99999999abcdefg"];
      expect(uniqueShortId(id, siblings)).toBe("ses_41e08091");
    });

    test("extends length when collision with sibling", () => {
      const id1 = "ses_41e080918ffeyhQtX6E4vERe4O";
      const id2 = "ses_41e08091a2bcDE3fG7hIjKlMnO";
      // id1 and id2 share first 8 suffix chars
      expect(uniqueShortId(id1, [id2])).not.toBe(uniqueShortId(id2, [id1]));
      // Both should be longer than 8 chars suffix
      expect(uniqueShortId(id1, [id2]).length).toBeGreaterThan(12);
      expect(uniqueShortId(id2, [id1]).length).toBeGreaterThan(12);
    });

    test("returns full ID if entire suffix matches other sibling", () => {
      const id1 = "ses_abcdefgh";
      const id2 = "ses_abcdefghij";
      // id2 starts with id1's full content, but id1 is unique among siblings
      // Actually id1 should get its full ID because id2 starts with it
      expect(uniqueShortId(id1, [id2])).toBe("ses_abcdefgh");
    });

    test("handles empty siblings array", () => {
      expect(uniqueShortId("ses_12345678abcdef", [])).toBe("ses_12345678");
    });

    test("handles non-standard IDs", () => {
      // non-standard IDs (not starting with "ses_") get first (minLen + 4) chars
      // "bg_" is 3 chars, so with minLen=8, we get 11 chars total
      expect(uniqueShortId("bg_1234567890abcdef", [])).toBe("bg_123456789");
    });

    test("ignores self when checking for collisions", () => {
      const id = "ses_41e080918ffeyhQtX6E4vERe4O";
      // Including the same ID in siblings should not cause a collision with itself
      expect(uniqueShortId(id, [id])).toBe("ses_41e08091");
    });

    test("handles multiple collisions requiring longer prefix", () => {
      const id1 = "ses_41e080918ffeyhQtX6E4vERe4O";
      const id2 = "ses_41e08091a2bcDE3fG7hIjKlMnO";
      const id3 = "ses_41e08091a2bcXyZ9876543210Ab";
      // All three share prefix "ses_41e08091a2bc"
      const result1 = uniqueShortId(id1, [id2, id3]);
      const result2 = uniqueShortId(id2, [id1, id3]);
      const result3 = uniqueShortId(id3, [id1, id2]);

      // All three should be unique
      expect(result1).not.toBe(result2);
      expect(result2).not.toBe(result3);
      expect(result1).not.toBe(result3);

      // All should be longer than default 8-char suffix
      expect(result1.length).toBeGreaterThan(12);
      expect(result2.length).toBeGreaterThan(12);
      expect(result3.length).toBeGreaterThan(12);
    });
  });

  describe("truncateText", () => {
    test("returns text unchanged if under maxLength", () => {
      expect(truncateText("hello", 10)).toBe("hello");
    });

    test("returns text unchanged if exactly maxLength", () => {
      expect(truncateText("hello", 5)).toBe("hello");
    });

    test("truncates and adds ellipsis if over maxLength", () => {
      expect(truncateText("hello world", 5)).toBe("hello...");
    });
  });

  describe("getStatusIcon", () => {
    test("returns correct icon for running", () => {
      expect(getStatusIcon("running")).toBe("⏳");
    });

    test("returns correct icon for completed", () => {
      expect(getStatusIcon("completed")).toBe("✓");
    });

    test("returns correct icon for error", () => {
      expect(getStatusIcon("error")).toBe("✗");
    });

    test("returns correct icon for cancelled", () => {
      expect(getStatusIcon("cancelled")).toBe("⊘");
    });

    test("returns correct icon for resumed", () => {
      expect(getStatusIcon("resumed")).toBe("↻");
    });
  });

  describe("formatTaskStatus", () => {
    const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
      sessionID: "ses_test123",
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      parentAgent: "test-agent",
      description: "Test task description",
      prompt: "Test prompt",
      agent: "explore",
      status: "running",
      startedAt: new Date().toISOString(),
      batchId: "batch_123",
      resumeCount: 0,
      isForked: false,
      ...overrides,
    });

    test("includes task ID and description", () => {
      const task = createMockTask();
      const result = formatTaskStatus(task);
      expect(result).toContain(task.sessionID);
      expect(result).toContain(task.description);
    });

    test("includes running status note for running tasks", () => {
      const task = createMockTask({ status: "running" });
      const result = formatTaskStatus(task);
      expect(result).toContain("Running");
      expect(result).toContain("still in progress");
    });

    test("includes error message for error tasks", () => {
      const task = createMockTask({ status: "error", error: "Something went wrong" });
      const result = formatTaskStatus(task);
      expect(result).toContain("Failed");
      expect(result).toContain("Something went wrong");
    });

    test("includes cancelled note for cancelled tasks", () => {
      const task = createMockTask({ status: "cancelled" });
      const result = formatTaskStatus(task);
      expect(result).toContain("Cancelled");
    });

    test("includes last tools if available", () => {
      const task = createMockTask({
        progress: {
          toolCalls: 5,
          lastTools: ["read", "write", "bash"],
          lastUpdate: new Date().toISOString(),
        },
      });
      const result = formatTaskStatus(task);
      expect(result).toContain("read → write → bash");
    });
  });
});
