---
created: 2026-03-16T00:00:00Z
last_updated: 2026-03-16T00:00:00Z
type: nonspec
plan_number: 1
status: pending
trigger: "Replace broken /dashboard static route with standalone CLI command bgagent-dashboard"
depends_on: none
next: TBD
---

# Plan: Standalone CLI Dashboard Command

## Background & Research

### Problem
The `/dashboard` static serving route in `src/server/index.ts` freezes OpenCode when accessed via curl or browser. The route must be removed entirely and replaced with a standalone CLI tool.

### Current /dashboard route to REMOVE — `src/server/index.ts` lines 124-140:
```ts
            // Dashboard static serving
            if (path === "/dashboard" || path.startsWith("/dashboard/")) {
              const dashboardDir = resolve(import.meta.dirname ?? __dirname, "dashboard");
              if (!existsSync(dashboardDir)) {
                return errorResponse("Dashboard not built. Run: bun run build:dashboard", 404);
              }
              let filePath = path === "/dashboard" || path === "/dashboard/"
                ? join(dashboardDir, "index.html")
                : join(dashboardDir, path.replace("/dashboard/", ""));
              if (!existsSync(filePath)) {
                filePath = join(dashboardDir, "index.html"); // SPA fallback
              }
              const file = Bun.file(filePath);
              return new Response(file, {
                headers: { ...CORS_HEADERS, "Content-Type": file.type },
              });
            }
```

### Console log to REMOVE — `src/server/index.ts` line 169:
```ts
    console.log(`[bgagent] Dashboard: ${url}/dashboard`);
```

### Server imports to CLEAN — `src/server/index.ts` lines 1-2:
```ts
import { resolve, join } from "path";
import { existsSync } from "fs";
```
After removing dashboard route, `resolve`, `join`, and `existsSync` are NO LONGER USED — remove these imports.

### server.json location and shape — `src/storage.ts` + `src/constants.ts`:
```ts
// constants.ts line 52
export const STORAGE_DIR = `${HOME_DIR}/.opencode/plugins/better-opencode-async-agents`;
// constants.ts line 123
export const SERVER_INFO_FILENAME = "server.json";

// storage.ts line 156
const SERVER_INFO_FILE = `${STORAGE_DIR}/${SERVER_INFO_FILENAME}`;

// Shape written by writeServerInfo (storage.ts lines 162-168):
{ port: number; pid: number; startedAt: string; url: string; version: string; }
```
So server.json lives at `~/.opencode/plugins/better-opencode-async-agents/server.json` and contains a `url` field like `"http://127.0.0.1:5165"`.

### CORS — `src/server/cors.ts` line 6:
```ts
"Access-Control-Allow-Origin": "*",
```
Already allows all origins, so the standalone dashboard server on a different port can call the API without CORS issues.

### Dashboard hooks baseUrl patterns:

**useSSE** — `dashboard/src/hooks/useSSE.ts` line 15-16:
```ts
export function useSSE(
  baseUrl: string = typeof window !== "undefined" ? window.location.origin : "",
): UseSSEResult {
```

**useInstances** — `dashboard/src/hooks/useInstances.ts` lines 10-12, 41:
```ts
function getDefaultBaseUrl(): string {
  return window.location.origin;
}
// ...
export function useInstances(baseUrl = getDefaultBaseUrl()) {
```

**useTaskMessages** — `dashboard/src/hooks/useTaskMessages.ts` lines 8-10:
```ts
export function useTaskMessages(
  taskId: string | null,
  baseUrl: string = window.location.origin,
) {
```

### App.tsx calls hooks WITHOUT baseUrl — `dashboard/src/App.tsx` lines 16, 22, 27:
```ts
const { tasks, stats, isConnected, error: sseError } = useSSE();
// ...
} = useInstances();
// ...
} = useTaskMessages(selectedTaskId);
```

### Dashboard build output:
- Source: `dashboard/` (Vite + React + Tailwind v4)
- Build output: `dashboard/dist/` → copied to `dist/dashboard/` by `build:all`
- npm package includes `dist/` folder, so `dist/dashboard/` is shipped

### package.json — no `bin` field yet, relevant scripts (lines 49-64):
```json
"scripts": {
    "build": "bun build src/index.ts --outdir dist --format esm --sourcemap=linked --external=bonjour-service",
    "build:types": "tsc --emitDeclarationOnly",
    "build:dashboard": "cd dashboard && bun install && bunx vite build",
    "build:all": "rm -rf dist && bun run build && bun run build:types && bun run build:dashboard && cp -r dashboard/dist dist/dashboard",
    ...
}
```

### Key constants — `src/constants.ts` lines 121-128:
```ts
export const DEFAULT_API_PORT = 5165;
export const DEFAULT_API_HOST = "127.0.0.1";
export const SERVER_INFO_FILENAME = "server.json";
export const MAX_PORT_RETRY = 10;
```

## Testing Plan (TDD - tests first)

No automated tests for this change — it's a CLI script + route removal. Verification is manual: build succeeds, typecheck passes, existing tests pass, and `node bin/dashboard.mjs` serves the dashboard.

- [ ] Verify `bun run typecheck` passes after all edits
- [ ] Verify `bun run build:all` passes after all edits
- [ ] Verify existing tests still pass (`bun test src/server/__tests__/`)
- [ ] **DO NOT** curl `http://127.0.0.1:5165/dashboard` — it will freeze OpenCode

## Implementation Plan

### Part A: Remove /dashboard route from plugin server
- [ ] In `src/server/index.ts`, delete lines 123-140 (the `// Dashboard static serving` block including the `if (path === "/dashboard"...` through its closing `}`)
- [ ] In `src/server/index.ts`, delete line 169: `console.log(\`[bgagent] Dashboard: ${url}/dashboard\`);`
- [ ] In `src/server/index.ts`, remove unused imports: `resolve` and `join` from `"path"`, and `existsSync` from `"fs"` (lines 1-2). Check if any other code in the file uses these before removing.

### Part B: Inject API baseUrl into dashboard React app
- [ ] In `dashboard/src/App.tsx`, add a global baseUrl derivation at the top of the `App` component. Read it from `window.__BGAGENT_API_URL__` (injected by CLI) or fall back to `window.location.origin`:
  ```ts
  const apiBaseUrl = (window as any).__BGAGENT_API_URL__ ?? window.location.origin;
  ```
- [ ] Pass `apiBaseUrl` to all three hooks:
  ```ts
  const { tasks, stats, isConnected, error: sseError } = useSSE(apiBaseUrl);
  // ...
  } = useInstances(apiBaseUrl);
  // ...
  } = useTaskMessages(selectedTaskId, apiBaseUrl);
  ```

### Part C: Create `bin/dashboard.mjs` CLI script
- [ ] Create `bin/dashboard.mjs` with `#!/usr/bin/env node` shebang
- [ ] Script logic:
  1. Read `server.json` from `~/.opencode/plugins/better-opencode-async-agents/server.json`
  2. Parse it, extract `url` field (e.g. `"http://127.0.0.1:5165"`)
  3. If file not found or unreadable, print error: "No running bgagent server found. Start OpenCode first." and exit 1
  4. Resolve dashboard static dir: `path.resolve(import.meta.dirname, '..', 'dist', 'dashboard')`
  5. If dashboard dir doesn't exist, print error: "Dashboard not built. Run: npm run build:dashboard" and exit 1
  6. Start a Node.js HTTP server (use `node:http` + `node:fs`) on port 0 (OS-assigned) bound to `127.0.0.1`
  7. For `GET /` and any path not matching a static file, serve `index.html` with a `<script>` tag injected before `</head>`:
     ```html
     <script>window.__BGAGENT_API_URL__ = "http://127.0.0.1:5165";</script>
     ```
  8. For static files (`.js`, `.css`, `.svg`, etc.), serve them with correct MIME types
  9. After server starts, print: `Dashboard: http://127.0.0.1:{port}`
  10. Auto-open browser: use `child_process.exec('open URL')` on macOS, `xdg-open` on Linux, `start` on Windows
  11. Print: `API server: {apiUrl}` and `Press Ctrl+C to stop`
- [ ] The script must be pure ESM (`import` syntax), Node.js only (no Bun APIs), zero dependencies

### Part D: Register bin + update package.json
- [ ] Add `"bin"` field to `package.json`:
  ```json
  "bin": {
    "bgagent-dashboard": "./bin/dashboard.mjs"
  },
  ```
- [ ] Add `"bin"` to the `"files"` array so it's included in npm package:
  ```json
  "files": [
    "dist",
    "bin",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  ```

## Parallelization Plan

### Batch 1 (parallel) — 3 coders
- [ ] Coder A: Remove /dashboard route + unused imports from `src/server/index.ts` → files: `src/server/index.ts`
- [ ] Coder B: Update `dashboard/src/App.tsx` to read `window.__BGAGENT_API_URL__` and pass baseUrl to all hooks → files: `dashboard/src/App.tsx`
- [ ] Coder C: Create `bin/dashboard.mjs` CLI script (full implementation) → files: `bin/dashboard.mjs`

### Batch 2 (after Batch 1) — 1 coder
- [ ] Coder D: Update `package.json` — add `bin` field, add `"bin"` to `files` array → files: `package.json`

### Batch 3 (after Batch 2) — verification
- [ ] Tester: Run `bun run typecheck && bun run build:all && bun test src/server/__tests__/ src/tools/__tests__/ src/manager/__tests__/`

### Dependencies
- Batch 1 coders are fully independent (different files).
- Batch 2 must wait for Batch 1 because Coder D needs to know `bin/dashboard.mjs` exists.
- Batch 3 must wait for all edits to verify nothing is broken.

### Risk Areas
- Removing imports from `src/server/index.ts` — must verify `resolve`, `join`, `existsSync` are not used elsewhere in the file before removing.
- The `bin/dashboard.mjs` must work with plain Node.js (not Bun) since `npx` uses Node.
- MIME type mapping in the CLI static server must cover `.js`, `.css`, `.html`, `.svg`, `.png`, `.ico`, `.json`.

## Done Criteria
- [ ] `/dashboard` route completely removed from `src/server/index.ts`
- [ ] No unused imports remain in `src/server/index.ts`
- [ ] `dashboard/src/App.tsx` reads `window.__BGAGENT_API_URL__` and passes it to all 3 hooks
- [ ] `bin/dashboard.mjs` exists, is executable, reads server.json, serves static files with injected API URL, auto-opens browser
- [ ] `package.json` has `bin` field pointing to `bin/dashboard.mjs`
- [ ] `package.json` `files` includes `"bin"`
- [ ] `bun run typecheck` passes
- [ ] `bun run build:all` passes
- [ ] All existing tests pass
