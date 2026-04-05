// src/tools/text.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import {
  buildAddText,
  buildEditText,
  buildAddShape,
} from "../bridge/script-builder.js";

const layerTarget = z.union([z.string(), z.number()]).describe("Layer name (string) or index (number)");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Color as hex string (e.g. #ff0000)");

export function registerTextTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 16. photopea_add_text
  server.registerTool("photopea_add_text", {
    title: "Add Text",
    description: "Add a new text layer to the active document at the specified position. The text layer becomes the active layer. Use paragraphBounds to create a text box with word wrapping, or omit for point text. Use load_font to add custom fonts, and list_fonts to find available font names.",
    inputSchema: {
      content: z.string().describe("Text content to display on the layer"),
      x: z.number().describe("X position in pixels from the left edge of the document"),
      y: z.number().describe("Y position in pixels from the top edge of the document"),
      font: z.string().optional().describe("Font PostScript name (e.g. ArialMT, Helvetica-Bold). Use list_fonts to find available names."),
      size: z.number().positive().optional().describe("Font size in points (default varies by document resolution)"),
      color: hexColor.optional(),
      alignment: z.enum(["left", "center", "right"]).optional().describe("Text alignment"),
      bold: z.boolean().optional().describe("Apply faux bold"),
      italic: z.boolean().optional().describe("Apply faux italic"),
      letterSpacing: z.number().optional().describe("Letter tracking/spacing"),
      lineHeight: z.number().optional().describe("Line height (leading)"),
      paragraphBounds: z
        .object({
          width: z.number().describe("Bounds width in pixels"),
          height: z.number().describe("Bounds height in pixels"),
        })
        .nullable()
        .optional()
        .describe("Paragraph text box bounds"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddText(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_text", summary: `Add text: "${params.content.slice(0, 40)}"` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to add text" }] };
    return { content: [{ type: "text" as const, text: `Text layer added at (${params.x}, ${params.y})` }] };
  });

  // 17. photopea_edit_text
  server.registerTool("photopea_edit_text", {
    title: "Edit Text",
    description: "Modify the content or style of an existing text layer. Only specified properties are changed — omit parameters to keep their current values. Use get_layers to find text layer names if needed.",
    inputSchema: {
      target: layerTarget,
      content: z.string().optional().describe("New text content to replace existing text"),
      font: z.string().optional().describe("New font PostScript name (use list_fonts to find available names)"),
      size: z.number().positive().optional().describe("New font size in points"),
      color: hexColor.optional(),
      alignment: z.enum(["left", "center", "right"]).optional().describe("Text alignment"),
      letterSpacing: z.number().optional().describe("Letter tracking/spacing"),
      lineHeight: z.number().optional().describe("Line height (leading)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildEditText(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "edit_text", summary: `Edit text layer: ${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to edit text" }] };
    return { content: [{ type: "text" as const, text: `Text layer edited: ${params.target}` }] };
  });

  // 18. photopea_add_shape
  server.registerTool("photopea_add_shape", {
    title: "Add Shape",
    description: "Add a vector shape layer (rectangle or ellipse) to the active document. The shape layer becomes the active layer. Shapes are non-destructive and can be resized with transform_layer without quality loss.",
    inputSchema: {
      type: z.enum(["rectangle", "ellipse"]).describe("Shape type to create"),
      bounds: z.object({
        x: z.number().describe("Left edge X position in pixels"),
        y: z.number().describe("Top edge Y position in pixels"),
        width: z.number().positive().describe("Shape width in pixels"),
        height: z.number().positive().describe("Shape height in pixels"),
      }).describe("Shape bounds"),
      fillColor: hexColor.optional(),
      strokeColor: hexColor.optional(),
      strokeWidth: z.number().positive().optional().describe("Stroke width in pixels"),
      name: z.string().optional().describe("Name for the shape layer"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddShape(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_shape", summary: `Add ${params.type} shape` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to add shape" }] };
    return { content: [{ type: "text" as const, text: `Shape (${params.type}) added` }] };
  });
}
