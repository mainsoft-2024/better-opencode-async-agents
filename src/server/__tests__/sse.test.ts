import { describe, expect, mock, test } from "bun:test";
import { SSEBroadcaster } from "../sse";
import type { SSEEventType } from "../types";

interface MockController {
  enqueue: ReturnType<typeof mock>;
  close: ReturnType<typeof mock>;
  error: ReturnType<typeof mock>;
  desiredSize: number;
  chunks: Uint8Array[];
}

const createMockController = (): MockController => {
  const chunks: Uint8Array[] = [];
  return {
    enqueue: mock((chunk: Uint8Array) => {
      chunks.push(chunk);
    }),
    close: mock(() => {}),
    error: mock(() => {}),
    desiredSize: 1,
    chunks,
  };
};

describe("SSEBroadcaster", () => {
  test("addSubscriber adds subscriber and returns true", () => {
    const broadcaster = new SSEBroadcaster();
    const controller = createMockController();

    const result = broadcaster.addSubscriber(
      controller as unknown as ReadableStreamDefaultController<Uint8Array>
    );

    expect(result).toBe(true);
    expect(broadcaster.getSubscriberCount()).toBe(1);
  });

  test("addSubscriber enforces MAX_SSE_SUBSCRIBERS limit and returns false when full", () => {
    const broadcaster = new SSEBroadcaster();
    const controllers: MockController[] = [];

    // Add MAX_SSE_SUBSCRIBERS controllers (50)
    for (let i = 0; i < 50; i++) {
      const controller = createMockController();
      controllers.push(controller);
      expect(
        broadcaster.addSubscriber(
          controller as unknown as ReadableStreamDefaultController<Uint8Array>
        )
      ).toBe(true);
    }

    expect(broadcaster.getSubscriberCount()).toBe(50);

    // 51st subscriber should fail
    const extraController = createMockController();
    const result = broadcaster.addSubscriber(
      extraController as unknown as ReadableStreamDefaultController<Uint8Array>
    );

    expect(result).toBe(false);
    expect(broadcaster.getSubscriberCount()).toBe(50);
  });

  test("removeSubscriber removes subscriber from set", () => {
    const broadcaster = new SSEBroadcaster();
    const controller1 = createMockController();
    const controller2 = createMockController();

    broadcaster.addSubscriber(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    broadcaster.addSubscriber(
      controller2 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(2);

    broadcaster.removeSubscriber(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>
    );

    expect(broadcaster.getSubscriberCount()).toBe(1);
  });

  test("getSubscriberCount reflects correct count after add/remove", () => {
    const broadcaster = new SSEBroadcaster();
    const controller1 = createMockController();
    const controller2 = createMockController();
    const controller3 = createMockController();

    expect(broadcaster.getSubscriberCount()).toBe(0);

    broadcaster.addSubscriber(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(1);

    broadcaster.addSubscriber(
      controller2 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(2);

    broadcaster.addSubscriber(
      controller3 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(3);

    broadcaster.removeSubscriber(
      controller2 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(2);

    broadcaster.removeSubscriber(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(1);

    broadcaster.removeSubscriber(
      controller3 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(0);
  });

  test("broadcast writes SSE wire format to all subscribers", () => {
    const broadcaster = new SSEBroadcaster();
    const controller1 = createMockController();
    const controller2 = createMockController();

    broadcaster.addSubscriber(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    broadcaster.addSubscriber(
      controller2 as unknown as ReadableStreamDefaultController<Uint8Array>
    );

    const data = { task: "test", status: "running" };
    broadcaster.broadcast("task.created" as SSEEventType, data);

    const decoder = new TextDecoder();

    expect(controller1.chunks.length).toBe(1);
    const output1 = decoder.decode(controller1.chunks[0]);
    expect(output1).toBe('event: task.created\ndata: {"task":"test","status":"running"}\n\n');

    expect(controller2.chunks.length).toBe(1);
    const output2 = decoder.decode(controller2.chunks[0]);
    expect(output2).toBe('event: task.created\ndata: {"task":"test","status":"running"}\n\n');
  });

  test("broadcast removes subscriber if enqueue throws", () => {
    const broadcaster = new SSEBroadcaster();
    const controller1 = createMockController();
    const controller2 = createMockController();

    broadcaster.addSubscriber(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    broadcaster.addSubscriber(
      controller2 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(2);

    // Make controller1 throw on enqueue
    controller1.enqueue = mock(() => {
      throw new Error("Connection closed");
    });

    broadcaster.broadcast("task.updated" as SSEEventType, { foo: "bar" });

    // controller1 should have been removed
    expect(broadcaster.getSubscriberCount()).toBe(1);

    // controller2 should still have received the message
    const decoder = new TextDecoder();
    expect(controller2.chunks.length).toBe(1);
    const output2 = decoder.decode(controller2.chunks[0]);
    expect(output2).toBe('event: task.updated\ndata: {"foo":"bar"}\n\n');
  });

  test("sendTo writes to single subscriber only", () => {
    const broadcaster = new SSEBroadcaster();
    const controller1 = createMockController();
    const controller2 = createMockController();

    broadcaster.addSubscriber(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    broadcaster.addSubscriber(
      controller2 as unknown as ReadableStreamDefaultController<Uint8Array>
    );

    const data = { message: "private" };
    broadcaster.sendTo(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>,
      "heartbeat" as SSEEventType,
      data
    );

    const decoder = new TextDecoder();

    // controller1 should have received the message
    expect(controller1.chunks.length).toBe(1);
    const output1 = decoder.decode(controller1.chunks[0]);
    expect(output1).toBe('event: heartbeat\ndata: {"message":"private"}\n\n');

    // controller2 should not have received anything
    expect(controller2.chunks.length).toBe(0);
  });

  test("sendTo removes subscriber if enqueue throws", () => {
    const broadcaster = new SSEBroadcaster();
    const controller1 = createMockController();
    const controller2 = createMockController();

    broadcaster.addSubscriber(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    broadcaster.addSubscriber(
      controller2 as unknown as ReadableStreamDefaultController<Uint8Array>
    );
    expect(broadcaster.getSubscriberCount()).toBe(2);

    // Make controller1 throw on enqueue
    controller1.enqueue = mock(() => {
      throw new Error("Connection lost");
    });

    broadcaster.sendTo(
      controller1 as unknown as ReadableStreamDefaultController<Uint8Array>,
      "task.completed" as SSEEventType,
      { foo: "baz" }
    );

    // controller1 should have been removed
    expect(broadcaster.getSubscriberCount()).toBe(1);

    // controller2 should still be present
    expect(broadcaster.getSubscriberCount()).toBe(1);
  });
});
