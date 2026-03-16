#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const dirname =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(fileURLToPath(import.meta.url));

const serverInfoPath = path.join(
  os.homedir(),
  ".opencode",
  "plugins",
  "better-opencode-async-agents",
  "server.json",
);

let apiUrl = "";
try {
  const raw = fs.readFileSync(serverInfoPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed.url !== "string" || parsed.url.length === 0) {
    throw new Error("missing url");
  }
  apiUrl = parsed.url;
} catch {
  console.error("No running bgagent server found. Start OpenCode first.");
  process.exit(1);
}

const dashboardDir = path.resolve(dirname, "..", "dist", "dashboard");
if (!fs.existsSync(dashboardDir) || !fs.statSync(dashboardDir).isDirectory()) {
  console.error("Dashboard not built. Run: npm run build:dashboard");
  process.exit(1);
}

function sendFile(res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] ?? "application/octet-stream";
    const file = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
}

function sendIndex(res) {
  try {
    const indexPath = path.join(dashboardDir, "index.html");
    const html = fs.readFileSync(indexPath, "utf8");
    const script = `<script>window.__BGAGENT_API_URL__ = ${JSON.stringify(apiUrl)};</script>`;
    const injected = html.includes("</head>")
      ? html.replace("</head>", `${script}</head>`)
      : `${script}${html}`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(injected);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Failed to load dashboard index");
  }
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    sendIndex(res);
    return;
  }

  const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const candidatePath = path.resolve(dashboardDir, requested);

  if (
    candidatePath.startsWith(dashboardDir + path.sep) &&
    fs.existsSync(candidatePath) &&
    fs.statSync(candidatePath).isFile()
  ) {
    if (path.basename(candidatePath) === "index.html") {
      sendIndex(res);
    } else {
      sendFile(res, candidatePath);
    }
    return;
  }

  sendIndex(res);
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("Failed to start dashboard server");
    process.exit(1);
  }

  const dashboardUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Dashboard: ${dashboardUrl}`);
  console.log(`API server: ${apiUrl}`);

  const quotedUrl = JSON.stringify(dashboardUrl);
  if (process.platform === "darwin") {
    exec(`open ${quotedUrl}`);
  } else if (process.platform === "linux") {
    exec(`xdg-open ${quotedUrl}`);
  } else if (process.platform === "win32") {
    exec(`start "" ${quotedUrl}`);
  }

  console.log("Press Ctrl+C to stop");
});