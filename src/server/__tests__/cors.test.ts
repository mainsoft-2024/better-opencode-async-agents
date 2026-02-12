import { describe, expect, test } from "bun:test";
import { CORS_HEADERS, errorResponse, jsonResponse, preflightResponse, withCors } from "../cors";

describe("cors", () => {
  describe("CORS_HEADERS", () => {
    test("contains all required CORS headers", () => {
      expect(CORS_HEADERS).toHaveProperty("Access-Control-Allow-Origin");
      expect(CORS_HEADERS).toHaveProperty("Access-Control-Allow-Methods");
      expect(CORS_HEADERS).toHaveProperty("Access-Control-Allow-Headers");
    });

    test("has correct values", () => {
      expect(CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
      expect(CORS_HEADERS["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
      expect(CORS_HEADERS["Access-Control-Allow-Headers"]).toBe("Content-Type");
    });
  });

  describe("withCors", () => {
    test("adds all CORS headers to an existing response", () => {
      const originalResponse = new Response("test body", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

      const response = withCors(originalResponse);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    });

    test("preserves existing headers while adding CORS headers", () => {
      const originalResponse = new Response("test body", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Custom-Header": "custom-value",
        },
      });

      const response = withCors(originalResponse);

      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    test("returns the same response object with modified headers", () => {
      const originalResponse = new Response("test");
      const response = withCors(originalResponse);
      expect(response).toBe(originalResponse);
    });
  });

  describe("jsonResponse", () => {
    test("returns response with correct content-type", () => {
      const data = { message: "test" };
      const response = jsonResponse(data);

      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    test("returns response with default 200 status", () => {
      const response = jsonResponse({});
      expect(response.status).toBe(200);
    });

    test("returns response with custom status", () => {
      const response = jsonResponse({}, 404);
      expect(response.status).toBe(404);
    });

    test("returns serialized JSON body", async () => {
      const data = { message: "hello", count: 42 };
      const response = jsonResponse(data);

      const body = await response.json();
      expect(body).toEqual(data);
    });

    test("includes CORS headers", () => {
      const response = jsonResponse({});

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    });
  });

  describe("errorResponse", () => {
    test("returns error response with correct structure", async () => {
      const response = errorResponse("Not found", 404);

      const body = await response.json();
      expect(body).toEqual({ error: "Not found", status: 404 });
    });

    test("returns correct status code", () => {
      const response = errorResponse("Bad request", 400);
      expect(response.status).toBe(400);
    });

    test("returns 500 status for server errors", () => {
      const response = errorResponse("Internal error", 500);
      expect(response.status).toBe(500);
    });

    test("includes CORS headers", () => {
      const response = errorResponse("Error", 500);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    });

    test("returns JSON content type", () => {
      const response = errorResponse("Error", 500);
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("preflightResponse", () => {
    test("returns 204 status", () => {
      const response = preflightResponse();
      expect(response.status).toBe(204);
    });

    test("returns null body", async () => {
      const response = preflightResponse();
      const body = await response.text();
      expect(body).toBe("");
    });

    test("includes CORS headers", () => {
      const response = preflightResponse();

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    });
  });
});
