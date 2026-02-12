import { HEARTBEAT_INTERVAL_MS, MAX_SSE_SUBSCRIBERS } from "../constants";
import type { BackgroundTask } from "../types";
import { CORS_HEADERS } from "./cors";
import type { SSEEventType, StatsResponse } from "./types";

type SSEController = ReadableStreamDefaultController<Uint8Array>;

/**
 * Manages SSE subscribers and broadcasts events to all connected clients.
 */
export class SSEBroadcaster {
  private subscribers = new Set<SSEController>();
  private encoder = new TextEncoder();

  /**
   * Add a subscriber. Returns false if at capacity.
   */
  addSubscriber(controller: SSEController): boolean {
    if (this.subscribers.size >= MAX_SSE_SUBSCRIBERS) {
      return false;
    }
    this.subscribers.add(controller);
    return true;
  }

  /**
   * Remove a subscriber.
   */
  removeSubscriber(controller: SSEController): void {
    this.subscribers.delete(controller);
  }

  /**
   * Broadcast an SSE event to all subscribers.
   */
  broadcast(eventType: SSEEventType, data: unknown): void {
    const message = this.formatSSE(eventType, data);
    const encoded = this.encoder.encode(message);

    for (const controller of this.subscribers) {
      try {
        controller.enqueue(encoded);
      } catch {
        // Client disconnected — remove
        this.subscribers.delete(controller);
      }
    }
  }

  /**
   * Send an event to a single subscriber.
   */
  sendTo(controller: SSEController, eventType: SSEEventType, data: unknown): void {
    const message = this.formatSSE(eventType, data);
    try {
      controller.enqueue(this.encoder.encode(message));
    } catch {
      this.subscribers.delete(controller);
    }
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Format data as SSE wire format:
   * event: <type>\ndata: <json>\n\n
   */
  private formatSSE(eventType: string, data: unknown): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}

/** Interface for data needed by SSE handler */
export interface SSEDataProvider {
  getAllTasks(): BackgroundTask[];
  buildStats(): StatsResponse;
}

/**
 * Handle GET /v1/events — SSE stream.
 * Sends snapshot on connect, then keeps connection open for delta events + heartbeat.
 */
export function handleSSERequest(
  req: Request,
  broadcaster: SSEBroadcaster,
  dataProvider: SSEDataProvider
): Response {
  let controller: SSEController;
  let heartbeatTimer: Timer;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;

      // Check capacity
      if (!broadcaster.addSubscriber(controller)) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: error\ndata: ${JSON.stringify({ error: "Too many connections" })}\n\n`
          )
        );
        controller.close();
        return;
      }

      // Send initial snapshot
      const snapshot = {
        tasks: dataProvider.getAllTasks(),
        stats: dataProvider.buildStats(),
      };
      broadcaster.sendTo(controller, "snapshot", snapshot);

      // Start heartbeat
      heartbeatTimer = setInterval(() => {
        try {
          broadcaster.sendTo(controller, "heartbeat", { ts: new Date().toISOString() });
        } catch {
          clearInterval(heartbeatTimer);
          broadcaster.removeSubscriber(controller);
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      clearInterval(heartbeatTimer);
      broadcaster.removeSubscriber(controller);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    },
  });
}
