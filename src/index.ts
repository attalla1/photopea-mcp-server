#!/usr/bin/env node
// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { PhotopeaBridge } from "./bridge/websocket-server.js";
import { createServer } from "./server.js";
import { findAvailablePort, launchBrowser } from "./utils/platform.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 4117;

async function main(): Promise<void> {
  const port = await findAvailablePort(DEFAULT_PORT);
  const bridge = new PhotopeaBridge(port);

  // Serve the frontend HTML on HTTP GET /
  const httpServer = bridge.getHttpServer();

  // Read from src/frontend so it works whether running from dist/ or src/
  const projectRoot = resolve(__dirname, "..");
  const frontendHtml = readFileSync(
    join(projectRoot, "src", "frontend", "index.html"),
    "utf-8"
  );

  httpServer.on("request", (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(frontendHtml);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await bridge.start();
  console.error(`Photopea MCP bridge running on http://127.0.0.1:${port}`);

  // Launch browser
  try {
    await launchBrowser(`http://127.0.0.1:${port}`);
    console.error("Browser launched. Waiting for Photopea to initialize...");
  } catch {
    console.error(`Could not auto-launch browser. Please open http://127.0.0.1:${port}`);
  }

  // Start MCP server over stdio
  const mcpServer = createServer(bridge);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("Photopea MCP server ready.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
