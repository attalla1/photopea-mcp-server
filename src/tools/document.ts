// src/tools/document.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeResult } from "../bridge/types.js";
import {
  buildCreateDocument,
  buildGetDocumentInfo,
  buildResizeDocument,
  buildCloseDocument,
} from "../bridge/script-builder.js";
import { readLocalFile, isUrl } from "../utils/file-io.js";

export function registerDocumentTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 1. photopea_create_document
  server.registerTool("photopea_create_document", {
    title: "Create Document",
    description: "Create a new Photopea document with specified dimensions and settings.",
    inputSchema: {
      width: z.number().positive().describe("Document width in pixels"),
      height: z.number().positive().describe("Document height in pixels"),
      resolution: z.number().positive().default(72).describe("Resolution in DPI (default 72)"),
      name: z.string().default("Untitled").describe("Document name"),
      mode: z.enum(["RGB", "CMYK", "Grayscale", "Lab", "Bitmap"]).default("RGB").describe("Color mode"),
      fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Background fill color as hex (e.g. #ffffff)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildCreateDocument(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "create_document", summary: `Create ${params.width}x${params.height} document` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to create document" }] };
    return { content: [{ type: "text" as const, text: `Document "${params.name}" created (${params.width}x${params.height})` }] };
  });

  // 2. photopea_open_file
  server.registerTool("photopea_open_file", {
    title: "Open File",
    description: "Open an image file in Photopea from a URL or local path. Optionally open as a Smart Object.",
    inputSchema: {
      source: z.string().describe("URL or local file path to open"),
      asSmart: z.boolean().default(false).describe("Open as a Smart Object layer in the active document"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const { source, asSmart } = params;
    bridge.sendActivity({ type: "activity", id: "", tool: "open_file", summary: `Open file: ${source}` });

    if (isUrl(source)) {
      const mode = asSmart ? ", null, true" : "";
      const script = `app.open('${source.replace(/'/g, "\\'")}' ${mode});app.echoToOE('ok');`;
      const result = await bridge.executeScript(script);
      if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to open URL" }] };
    } else {
      let fileData: Buffer;
      try {
        fileData = await readLocalFile(source);
      } catch (err) {
        return { isError: true, content: [{ type: "text" as const, text: (err as Error).message }] };
      }
      const filename = source.split("/").pop() || "file";
      const result = await bridge.loadFile(fileData, filename);
      if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to load local file" }] };
    }

    return { content: [{ type: "text" as const, text: `File opened: ${source}` }] };
  });

  // 3. photopea_get_document_info
  server.registerTool("photopea_get_document_info", {
    title: "Get Document Info",
    description: "Get information about the active document (name, dimensions, resolution, layer count, color mode).",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (_params) => {
    const script = buildGetDocumentInfo();
    bridge.sendActivity({ type: "activity", id: "", tool: "get_document_info", summary: "Get document info" });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to get document info" }] };
    const data = result as BridgeResult;
    return { content: [{ type: "text" as const, text: data.data || "{}" }] };
  });

  // 4. photopea_resize_document
  server.registerTool("photopea_resize_document", {
    title: "Resize Document",
    description: "Resize the active document canvas to new dimensions.",
    inputSchema: {
      width: z.number().positive().describe("New width in pixels"),
      height: z.number().positive().describe("New height in pixels"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildResizeDocument(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "resize_document", summary: `Resize to ${params.width}x${params.height}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to resize document" }] };
    return { content: [{ type: "text" as const, text: `Document resized to ${params.width}x${params.height}` }] };
  });

  // 5. photopea_close_document
  server.registerTool("photopea_close_document", {
    title: "Close Document",
    description: "Close the active document, optionally saving changes first.",
    inputSchema: {
      save: z.boolean().default(false).describe("Whether to save changes before closing"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildCloseDocument({ save: params.save });
    bridge.sendActivity({ type: "activity", id: "", tool: "close_document", summary: `Close document (save=${params.save})` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to close document" }] };
    return { content: [{ type: "text" as const, text: "Document closed" }] };
  });
}
