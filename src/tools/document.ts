// src/tools/document.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import { ANCHORS, type BridgeResult } from "../bridge/types.js";
import {
  buildCreateDocument,
  buildGetDocumentInfo,
  buildResizeDocument,
  buildCloseDocument,
  buildCrop,
  buildResizeCanvas,
  buildTrim,
  buildRotateCanvas,
} from "../bridge/script-builder.js";
import { readLocalFile, fetchUrlToBuffer, isUrl } from "../utils/file-io.js";

export function registerDocumentTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 1. photopea_create_document
  server.registerTool("photopea_create_document", {
    title: "Create Document",
    description: "Create a new blank document and make it the active document. This is typically the first step in a workflow. The document opens with a Background layer. Use open_file instead to edit an existing image.",
    inputSchema: {
      width: z.number().positive().describe("Document width in pixels (e.g. 1920 for full HD)"),
      height: z.number().positive().describe("Document height in pixels (e.g. 1080 for full HD)"),
      resolution: z.number().positive().default(72).describe("Resolution in DPI (72 for screen, 300 for print)"),
      name: z.string().default("Untitled").describe("Document name shown in the title bar"),
      mode: z.enum(["RGB", "CMYK", "Grayscale", "Lab", "Bitmap"]).default("RGB").describe("Color mode (use RGB for most workflows)"),
      fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Background fill color as hex (e.g. #ffffff for white, #000000 for black). Defaults to white if omitted."),
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
    description: "Open an existing image file in Photopea as a new document. Supports PSD, PNG, JPG, WebP, SVG, and other common formats. The opened file becomes the active document. Use create_document instead to start with a blank canvas.",
    inputSchema: {
      source: z.string().describe("URL or absolute local file path of the image to open (e.g. /Users/me/photo.psd or https://example.com/image.png)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const { source } = params;
    bridge.sendActivity({ type: "activity", id: "", tool: "open_file", summary: `Open file: ${source}` });

    if (isUrl(source)) {
      let fileData: Buffer;
      try {
        fileData = await fetchUrlToBuffer(source);
      } catch (err) {
        return { isError: true, content: [{ type: "text" as const, text: (err as Error).message }] };
      }
      const filename = source.split("/").pop() || "file";
      const result = await bridge.loadFile(fileData, filename);
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
    description: "Get metadata about the active document including name, width, height, resolution (DPI), layer count, and color mode. Returns JSON. Use this to check document dimensions before positioning layers or making selections.",
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
    description: "Resize the active document canvas to new pixel dimensions, resampling all layer content to fit. This is a destructive operation — all layers are scaled proportionally. Use undo to revert if needed.",
    inputSchema: {
      width: z.number().positive().describe("New document width in pixels"),
      height: z.number().positive().describe("New document height in pixels"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
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
    description: "Close the active document. Set save to true to save changes before closing. Unsaved changes are discarded if save is false. The next open document becomes active, if any.",
    inputSchema: {
      save: z.boolean().default(false).describe("Whether to save changes before closing (true = save first, false = discard unsaved changes)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildCloseDocument({ save: params.save });
    bridge.sendActivity({ type: "activity", id: "", tool: "close_document", summary: `Close document (save=${params.save})` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to close document" }] };
    return { content: [{ type: "text" as const, text: "Document closed" }] };
  });

  // photopea_crop
  server.registerTool("photopea_crop", {
    title: "Crop",
    description: "Crop the active document to a rectangle in pixels. Content outside the rectangle is discarded. Use get_document_info for the current size; use resize_canvas to add space instead.",
    inputSchema: {
      x: z.number().describe("Left edge of the crop rectangle in pixels"),
      y: z.number().describe("Top edge of the crop rectangle in pixels"),
      width: z.number().positive().describe("Width of the crop rectangle in pixels"),
      height: z.number().positive().describe("Height of the crop rectangle in pixels"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "crop", summary: `Crop to ${params.width}x${params.height} at ${params.x},${params.y}` });
    const result = await bridge.executeScript(buildCrop(params));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to crop" }] };
    return { content: [{ type: "text" as const, text: `Cropped to ${params.width}x${params.height}` }] };
  });

  // photopea_resize_canvas
  server.registerTool("photopea_resize_canvas", {
    title: "Resize Canvas",
    description: "Change the canvas size without scaling the content: larger adds empty space, smaller cuts off edges. The anchor decides which side stays fixed. Use resize_document to scale the content instead.",
    inputSchema: {
      width: z.number().positive().describe("New canvas width in pixels"),
      height: z.number().positive().describe("New canvas height in pixels"),
      anchor: z.enum(ANCHORS).default("center").describe("Where the existing content stays, e.g. 'center' adds space equally on all sides, 'top-left' adds it to the right and bottom"),
      fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Color for the added area, e.g. #ffffff for a white border. Adds a solid 'Canvas Fill' layer at the bottom. Omit for transparent."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "resize_canvas", summary: `Canvas ${params.width}x${params.height} (${params.anchor})` });
    const result = await bridge.executeScript(buildResizeCanvas(params));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to resize canvas" }] };
    return { content: [{ type: "text" as const, text: `Canvas resized to ${params.width}x${params.height}` }] };
  });

  // photopea_trim
  server.registerTool("photopea_trim", {
    title: "Trim",
    description: "Trim empty borders from the active document: transparent pixels, or pixels matching the top-left or bottom-right corner color. Useful after removing a background or before exporting an icon.",
    inputSchema: {
      basis: z.enum(["transparent", "top-left-color", "bottom-right-color"]).default("transparent").describe("What counts as empty border"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "trim", summary: `Trim ${params.basis} borders` });
    const result = await bridge.executeScript(buildTrim(params.basis));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to trim" }] };
    return { content: [{ type: "text" as const, text: "Document trimmed. Use get_document_info for the new size." }] };
  });

  // photopea_rotate_canvas
  server.registerTool("photopea_rotate_canvas", {
    title: "Rotate Canvas",
    description: "Rotate and/or flip the whole document, all layers together. Use transform_layer to rotate a single layer instead.",
    inputSchema: {
      angle: z.number().optional().describe("Clockwise rotation in degrees, e.g. 90, 180, -90"),
      flip: z.enum(["horizontal", "vertical"]).optional().describe("Mirror the document horizontally or vertically"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    if (!params.angle && !params.flip) return { isError: true, content: [{ type: "text" as const, text: "Provide angle and/or flip" }] };
    bridge.sendActivity({ type: "activity", id: "", tool: "rotate_canvas", summary: `Rotate ${params.angle ?? 0}°${params.flip ? `, flip ${params.flip}` : ""}` });
    const result = await bridge.executeScript(buildRotateCanvas(params));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to rotate canvas" }] };
    return { content: [{ type: "text" as const, text: "Canvas rotated/flipped" }] };
  });
}
