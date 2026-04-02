// src/tools/workflows.ts
import { z } from "zod";
import type { BridgeResult, BridgeFileResult } from "../bridge/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import {
  buildSetBackground,
  buildCreateBanner,
  buildLoadTemplate,
  buildApplyTemplateVariables,
  buildComposeLayers,
  buildExportImage,
} from "../bridge/script-builder.js";
import { writeLocalFile } from "../utils/file-io.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Color as hex string (e.g. #ff0000)");

export function registerWorkflowTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 36. photopea_set_background
  server.registerTool("photopea_set_background", {
    title: "Set Background",
    description: "Set the document background to a solid color, gradient, or image.",
    inputSchema: {
      type: z.enum(["solid", "gradient", "image"]).describe("Background type"),
      color: hexColor.optional(),
      gradient: z.object({
        colors: z.array(hexColor).min(2).describe("Gradient color stops"),
        angle: z.number().optional().describe("Gradient angle in degrees"),
      }).optional().describe("Gradient specification (for gradient type)"),
      imageSource: z.string().optional().describe("URL or local path of background image (for image type)"),
      blur: z.number().min(0).optional().describe("Gaussian blur radius for image backgrounds"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildSetBackground(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "set_background", summary: `Set ${params.type} background` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to set background" }] };
    return { content: [{ type: "text" as const, text: `Background set (${params.type})` }] };
  });

  // 37. photopea_create_banner
  server.registerTool("photopea_create_banner", {
    title: "Create Banner",
    description: "Create a complete banner graphic with title, optional subtitle, background, and accent color.",
    inputSchema: {
      width: z.number().positive().describe("Banner width in pixels"),
      height: z.number().positive().describe("Banner height in pixels"),
      title: z.string().describe("Banner title text"),
      subtitle: z.string().optional().describe("Optional subtitle text"),
      backgroundColor: hexColor.optional(),
      accentColor: hexColor.optional(),
      titleFont: z.string().optional().describe("Font name for the title"),
      titleSize: z.number().positive().optional().describe("Title font size in points"),
      titleColor: hexColor.optional(),
      backgroundImage: z.string().optional().describe("URL or local path for background image"),
      layout: z.enum(["centered", "left", "split"]).optional().describe("Banner layout style"),
      outputPath: z.string().optional().describe("If provided, export the banner to this path as PNG"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildCreateBanner(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "create_banner", summary: `Create ${params.width}x${params.height} banner: "${params.title}"` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to create banner" }] };

    if (params.outputPath) {
      const exportScript = buildExportImage({ format: "png", outputPath: params.outputPath });
      const exportResult = await bridge.executeScript(exportScript, true);
      if (exportResult.success) {
        const fileResult = exportResult as BridgeFileResult;
        await writeLocalFile(params.outputPath, fileResult.data);
      }
    }

    return { content: [{ type: "text" as const, text: `Banner created: "${params.title}" (${params.width}x${params.height})` }] };
  });

  // 38. photopea_load_template
  server.registerTool("photopea_load_template", {
    title: "Load Template",
    description: "Open a PSD or image template file and return its layer structure.",
    inputSchema: {
      source: z.string().describe("URL or local path to the template file"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildLoadTemplate(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "load_template", summary: `Load template: ${params.source}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to load template" }] };
    const templateResult = result as BridgeResult;
    return { content: [{ type: "text" as const, text: templateResult.data || "[]" }] };
  });

  // 39. photopea_apply_template_variables
  server.registerTool("photopea_apply_template_variables", {
    title: "Apply Template Variables",
    description: "Replace text layer contents in a template by layer name. Useful for personalizing templates.",
    inputSchema: {
      variables: z.record(z.string()).describe("Map of layer name to replacement text value"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildApplyTemplateVariables(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "apply_template_variables", summary: `Apply ${Object.keys(params.variables).length} template variable(s)` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to apply template variables" }] };
    return { content: [{ type: "text" as const, text: `Template variables applied: ${Object.keys(params.variables).join(", ")}` }] };
  });

  // 40. photopea_compose_layers
  server.registerTool("photopea_compose_layers", {
    title: "Compose Layers",
    description: "Compose multiple layers (text, image, shape, fill) in a single operation.",
    inputSchema: {
      layers: z.array(z.object({
        type: z.enum(["text", "image", "shape", "fill"]).describe("Layer type"),
        content: z.string().optional().describe("Text content (for text layers)"),
        source: z.string().optional().describe("Image URL or path (for image layers)"),
        x: z.number().optional().describe("X position"),
        y: z.number().optional().describe("Y position"),
        width: z.number().positive().optional().describe("Width in pixels"),
        height: z.number().positive().optional().describe("Height in pixels"),
        color: hexColor.optional(),
        size: z.number().positive().optional().describe("Font size (for text layers)"),
      })).describe("Array of layer definitions to compose"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildComposeLayers(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "compose_layers", summary: `Compose ${params.layers.length} layer(s)` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to compose layers" }] };
    return { content: [{ type: "text" as const, text: `Composed ${params.layers.length} layer(s)` }] };
  });
}
