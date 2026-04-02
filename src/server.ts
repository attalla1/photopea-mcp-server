// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "./bridge/websocket-server.js";
import { registerDocumentTools } from "./tools/document.js";
import { registerLayerTools } from "./tools/layer.js";
import { registerTextTools } from "./tools/text.js";
import { registerImageTools } from "./tools/image.js";
import { registerExportTools } from "./tools/export.js";
import { registerWorkflowTools } from "./tools/workflows.js";

export function createServer(bridge: PhotopeaBridge): McpServer {
  const server = new McpServer({ name: "photopea-mcp-server", version: "0.1.0" });
  registerDocumentTools(server, bridge);
  registerLayerTools(server, bridge);
  registerTextTools(server, bridge);
  registerImageTools(server, bridge);
  registerExportTools(server, bridge);
  registerWorkflowTools(server, bridge);
  return server;
}
