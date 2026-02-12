/**
 * CORS headers applied to all API responses.
 * Safe to use wildcard because server binds to 127.0.0.1 only.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Adds CORS headers to an existing Response.
 */
export function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Creates a JSON response with CORS headers.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

/**
 * Creates an error JSON response with CORS headers.
 */
export function errorResponse(error: string, status: number): Response {
  return jsonResponse({ error, status }, status);
}

/**
 * Handles CORS preflight (OPTIONS) requests.
 */
export function preflightResponse(): Response {
  return withCors(new Response(null, { status: 204 }));
}
