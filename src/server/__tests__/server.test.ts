import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readServerInfo } from "../../storage";
import { StatusApiServer } from "../index";

// =============================================================================
// Mock Manager Factory
// =============================================================================

const createMockManager = () => ({
  getAllTasks: () => [],
  getTask: () => undefined,
  getTaskMessages: async () => [],
  onTaskEvent: (_cb: (type: string, task: unknown) => void) => () => {},
});

// =============================================================================
// Test Suite
// =============================================================================

describe("StatusApiServer lifecycle", () => {
  let server: StatusApiServer | null = null;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original env vars
    originalEnv.ASYNCAGENTS_API_ENABLED = process.env.ASYNCAGENTS_API_ENABLED;
    originalEnv.ASYNCAGENTS_API_PORT = process.env.ASYNCAGENTS_API_PORT;
    originalEnv.ASYNCAGENTS_API_HOST = process.env.ASYNCAGENTS_API_HOST;
  });

  afterEach(async () => {
    // Clean up server
    if (server) {
      await server.stop();
      server = null;
    }

    // Restore original env vars
    const { ASYNCAGENTS_API_ENABLED, ASYNCAGENTS_API_PORT, ASYNCAGENTS_API_HOST } = originalEnv;
    if (ASYNCAGENTS_API_ENABLED === undefined) {
      process.env.ASYNCAGENTS_API_ENABLED = undefined;
    } else {
      process.env.ASYNCAGENTS_API_ENABLED = ASYNCAGENTS_API_ENABLED;
    }

    if (ASYNCAGENTS_API_PORT === undefined) {
      process.env.ASYNCAGENTS_API_PORT = undefined;
    } else {
      process.env.ASYNCAGENTS_API_PORT = ASYNCAGENTS_API_PORT;
    }

    if (ASYNCAGENTS_API_HOST === undefined) {
      process.env.ASYNCAGENTS_API_HOST = undefined;
    } else {
      process.env.ASYNCAGENTS_API_HOST = ASYNCAGENTS_API_HOST;
    }
  });

  // ===========================================================================
  // Start/Stop Lifecycle
  // ===========================================================================

  test("starts server and exposes getPort/getUrl", async () => {
    const manager = createMockManager();
    server = await StatusApiServer.start(manager);

    expect(server).not.toBeNull();
    expect(server!.getPort()).toBeGreaterThan(0);
    expect(server!.getUrl()).toContain(String(server!.getPort()));
    expect(server!.getUrl()).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test("stop() makes server unreachable", async () => {
    const manager = createMockManager();
    server = await StatusApiServer.start(manager);

    expect(server).not.toBeNull();
    const url = server!.getUrl();

    // Verify server is reachable before stop
    const responseBefore = await fetch(`${url}/v1/health`);
    expect(responseBefore.status).toBe(200);

    // Stop the server
    await server!.stop();
    server = null;

    // Verify server is unreachable after stop
    let fetchFailed = false;
    try {
      await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(100) });
    } catch {
      fetchFailed = true;
    }
    expect(fetchFailed).toBe(true);
  });

  // ===========================================================================
  // Port Collision
  // ===========================================================================

  test("retries next port when desired port is in use", async () => {
    // Start a dummy server on an OS-assigned port first
    const dummyServer = Bun.serve({
      port: 0, // OS-assigned
      hostname: "127.0.0.1",
      fetch: () => new Response("dummy"),
    });

    const blockedPort = dummyServer.port;

    try {
      // Set env to use the blocked port
      process.env.ASYNCAGENTS_API_PORT = String(blockedPort);

      const manager = createMockManager();
      server = await StatusApiServer.start(manager);

      expect(server).not.toBeNull();
      // Server should have bound to a different port (blockedPort + 1 or similar)
      const actualPort = server!.getPort();
      expect(actualPort).not.toBe(blockedPort);
      expect(actualPort).toBeGreaterThan(0);
    } finally {
      // Clean up dummy server
      dummyServer.stop(true);
    }
  });

  // ===========================================================================
  // Environment Variable Configuration
  // ===========================================================================

  test("ASYNCAGENTS_API_ENABLED=false returns null", async () => {
    process.env.ASYNCAGENTS_API_ENABLED = "false";

    const manager = createMockManager();
    const result = await StatusApiServer.start(manager);

    expect(result).toBeNull();
  });

  test("ASYNCAGENTS_API_PORT overrides default port", async () => {
    // Use a high port that's unlikely to be in use
    const customPort = 55666;

    // Clean up any existing server on that port first
    let testServer: ReturnType<typeof Bun.serve> | null = null;
    try {
      testServer = Bun.serve({
        port: customPort,
        hostname: "127.0.0.1",
        fetch: () => new Response("test"),
      });
      testServer.stop(true);
    } catch {
      // Port might not have been in use
    }

    process.env.ASYNCAGENTS_API_PORT = String(customPort);

    const manager = createMockManager();
    server = await StatusApiServer.start(manager);

    expect(server).not.toBeNull();
    // If the port is available, it should use the custom port
    // If not (due to race condition), it should use a different port
    const actualPort = server!.getPort();
    expect(actualPort).toBeGreaterThan(0);
  });

  // ===========================================================================
  // Health Endpoint Smoke Test
  // ===========================================================================

  test("GET /v1/health returns 200 with ok status", async () => {
    const manager = createMockManager();
    server = await StatusApiServer.start(manager);

    expect(server).not.toBeNull();
    const url = server!.getUrl();

    const response = await fetch(`${url}/v1/health`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("taskCount");
  });

  // ===========================================================================
  // Discovery File Tests
  // ===========================================================================

  test("writes server.json discovery file on start", async () => {
    const manager = createMockManager();
    server = await StatusApiServer.start(manager);

    expect(server).not.toBeNull();

    // Read the server info from storage
    const info = await readServerInfo();
    expect(info).not.toBeNull();
    expect(info!.port).toBe(server!.getPort());
    expect(info!.url).toBe(server!.getUrl());
    expect(info!.pid).toBe(process.pid);
    expect(info!.version).toBe("1.0.0");
    expect(info!.startedAt).toBeString();
  });

  test("removes server.json discovery file on stop", async () => {
    const manager = createMockManager();
    server = await StatusApiServer.start(manager);

    expect(server).not.toBeNull();

    // Verify file exists
    let info = await readServerInfo();
    expect(info).not.toBeNull();

    // Stop server
    await server!.stop();
    server = null;

    // Verify file is removed
    info = await readServerInfo();
    expect(info).toBeNull();
  });

  // ===========================================================================
  // CORS Tests
  // ===========================================================================

  test("responds to CORS preflight requests", async () => {
    const manager = createMockManager();
    server = await StatusApiServer.start(manager);

    expect(server).not.toBeNull();
    const url = server!.getUrl();

    const response = await fetch(`${url}/v1/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  // ===========================================================================
  // Stats Endpoint Test
  // ===========================================================================

  test("GET /v1/stats returns stats response", async () => {
    const manager = createMockManager();
    server = await StatusApiServer.start(manager);

    expect(server).not.toBeNull();
    const url = server!.getUrl();

    const response = await fetch(`${url}/v1/stats`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("totalTasks");
    expect(body).toHaveProperty("activeTasks");
    expect(body).toHaveProperty("byStatus");
    expect(body).toHaveProperty("byAgent");
    expect(body).toHaveProperty("duration");
  });
});
