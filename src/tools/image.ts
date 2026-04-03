// src/tools/image.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import {
  buildApplyAdjustment,
  buildApplyFilter,
  buildTransformLayer,
  buildAddGradient,
  buildMakeSelection,
  buildModifySelection,
  buildFillSelection,
  buildClearSelection,
  escapeString,
} from "../bridge/script-builder.js";
import { readLocalFile, fetchUrlToBuffer, isUrl } from "../utils/file-io.js";

const layerTarget = z.union([z.string(), z.number()]).describe("Layer name (string) or index (number)");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Color as hex string (e.g. #ff0000)");

export function registerImageTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 19. photopea_place_image
  server.registerTool("photopea_place_image", {
    title: "Place Image",
    description: "Place an image into the active document from a URL or local file path.",
    inputSchema: {
      source: z.string().describe("URL or local file path of image to place"),
      x: z.number().optional().describe("X position offset"),
      y: z.number().optional().describe("Y position offset"),
      width: z.number().positive().optional().describe("Resize to this width in pixels"),
      height: z.number().positive().optional().describe("Resize to this height in pixels"),
      name: z.string().optional().describe("Name for the placed layer"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const { source } = params;
    bridge.sendActivity({ type: "activity", id: "", tool: "place_image", summary: `Place image: ${source}` });

    // Step 1: Fetch the file data (server-side for both URLs and local files)
    // This avoids Photopea's async app.open(url) which sends "done" before the file loads.
    let fileData: Buffer;
    try {
      fileData = isUrl(source) ? await fetchUrlToBuffer(source) : await readLocalFile(source);
    } catch (err) {
      return { isError: true, content: [{ type: "text" as const, text: (err as Error).message }] };
    }

    // Step 2: Send ArrayBuffer to Photopea (opens as new document synchronously)
    const filename = source.split("/").pop() || "image";
    const loadResult = await bridge.loadFile(fileData, filename);
    if (!loadResult.success) return { isError: true, content: [{ type: "text" as const, text: loadResult.error || "Failed to load image" }] };

    // Step 3: Duplicate layer into target doc, close source, position in target
    {
      const lines = [
        `var _srcDoc = app.activeDocument;`,
        // Copy merged preserves transparency (unlike flatten/mergeVisible)
        `_srcDoc.selection.selectAll();`,
        `_srcDoc.selection.copy(true);`,
        `_srcDoc.close(2);`,
        `app.activeDocument.paste();`,
      ];

      const safeName = params.name ? escapeString(params.name) : "";
      // Helper to extract numeric value from bounds (may be UnitValue objects or raw numbers)
      lines.push(`function _bv(v) { return typeof v === 'object' && v !== null ? v.value || v.L || 0 : v; }`);
      if (safeName) lines.push(`app.activeDocument.activeLayer.name = '${safeName}';`);
      if (params.width || params.height) {
        lines.push(`var _b = app.activeDocument.activeLayer.bounds;`);
        lines.push(`var _cw = _bv(_b[2]) - _bv(_b[0]);`);
        lines.push(`var _ch = _bv(_b[3]) - _bv(_b[1]);`);
        if (params.width && params.height) {
          // Fit within box, preserving aspect ratio
          lines.push(`var _scale = Math.min(${params.width} / _cw, ${params.height} / _ch);`);
        } else if (params.width) {
          lines.push(`var _scale = ${params.width} / _cw;`);
        } else {
          lines.push(`var _scale = ${params.height} / _ch;`);
        }
        lines.push(`if (_cw > 0 && _ch > 0) { app.activeDocument.activeLayer.resize(_scale * 100, _scale * 100); }`);
      }
      if (params.x !== undefined || params.y !== undefined) {
        const xPos = params.x ?? 0;
        const yPos = params.y ?? 0;
        lines.push(`var _b2 = app.activeDocument.activeLayer.bounds;`);
        lines.push(`app.activeDocument.activeLayer.translate(${xPos} - _bv(_b2[0]), ${yPos} - _bv(_b2[1]));`);
      }
      lines.push(`app.echoToOE('ok');`);
      const mergeResult = await bridge.executeScript(lines.join("\n"));
      if (!mergeResult.success) return { isError: true, content: [{ type: "text" as const, text: mergeResult.error || "Failed to place image into document" }] };
    }

    return { content: [{ type: "text" as const, text: `Image placed: ${source}` }] };
  });

  // 20. photopea_apply_adjustment
  server.registerTool("photopea_apply_adjustment", {
    title: "Apply Adjustment",
    description: "Apply an image adjustment (brightness/contrast, hue/saturation, levels, or curves) to the active layer.",
    inputSchema: {
      type: z.enum(["brightness", "hue_sat", "levels", "curves"]).describe("Adjustment type"),
      settings: z.record(z.union([z.number(), z.string(), z.boolean()])).optional().describe("Adjustment settings (e.g. { brightness: 20, contrast: 10 })"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildApplyAdjustment(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "apply_adjustment", summary: `Apply ${params.type} adjustment` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to apply adjustment" }] };
    return { content: [{ type: "text" as const, text: `Adjustment applied: ${params.type}` }] };
  });

  // 21. photopea_apply_filter
  server.registerTool("photopea_apply_filter", {
    title: "Apply Filter",
    description: "Apply a filter (gaussian blur, sharpen, unsharp mask, noise, or motion blur) to the active layer.",
    inputSchema: {
      type: z.enum(["gaussian_blur", "sharpen", "unsharp_mask", "noise", "motion_blur"]).describe("Filter type"),
      settings: z.record(z.union([z.number(), z.string(), z.boolean()])).optional().describe("Filter settings (e.g. { radius: 5 })"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildApplyFilter(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "apply_filter", summary: `Apply ${params.type} filter` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to apply filter" }] };
    return { content: [{ type: "text" as const, text: `Filter applied: ${params.type}` }] };
  });

  // 22. photopea_transform_layer
  server.registerTool("photopea_transform_layer", {
    title: "Transform Layer",
    description: "Scale, rotate, or flip a layer.",
    inputSchema: {
      target: layerTarget,
      scaleX: z.number().positive().optional().describe("Horizontal scale factor (1.0 = 100%)"),
      scaleY: z.number().positive().optional().describe("Vertical scale factor (1.0 = 100%)"),
      rotation: z.number().optional().describe("Rotation in degrees (clockwise)"),
      flipH: z.boolean().optional().describe("Flip horizontally"),
      flipV: z.boolean().optional().describe("Flip vertically"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildTransformLayer(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "transform_layer", summary: `Transform layer: ${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to transform layer" }] };
    return { content: [{ type: "text" as const, text: `Layer transformed: ${params.target}` }] };
  });

  // 24. photopea_add_gradient
  server.registerTool("photopea_add_gradient", {
    title: "Add Gradient",
    description: "Apply a linear gradient fill to a layer.",
    inputSchema: {
      target: layerTarget,
      type: z.enum(["linear"]).describe("Gradient type"),
      colors: z.array(hexColor).min(2).describe("Array of hex color stops (minimum 2)"),
      angle: z.number().optional().describe("Gradient angle in degrees"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddGradient(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_gradient", summary: `Add ${params.type} gradient to: ${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to add gradient" }] };
    return { content: [{ type: "text" as const, text: `Gradient (${params.type}) applied to: ${params.target}` }] };
  });

  // 25. photopea_make_selection
  server.registerTool("photopea_make_selection", {
    title: "Make Selection",
    description: "Create a selection (all, rectangular, or elliptical) in the active document.",
    inputSchema: {
      type: z.enum(["all", "rect", "ellipse"]).describe("Selection type"),
      bounds: z.object({
        x: z.number().describe("Left edge X"),
        y: z.number().describe("Top edge Y"),
        width: z.number().positive().describe("Selection width"),
        height: z.number().positive().describe("Selection height"),
      }).optional().describe("Selection bounds (ignored for 'all' type)"),
      feather: z.number().min(0).optional().describe("Feather radius in pixels"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    if (params.type !== "all" && !params.bounds) {
      return { isError: true, content: [{ type: "text" as const, text: "bounds is required for rect and ellipse selection types" }] };
    }
    const script = buildMakeSelection(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "make_selection", summary: `Make ${params.type} selection` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to make selection" }] };
    return { content: [{ type: "text" as const, text: `Selection made: ${params.type}` }] };
  });

  // 26. photopea_modify_selection
  server.registerTool("photopea_modify_selection", {
    title: "Modify Selection",
    description: "Modify the current selection by expanding, contracting, feathering, or inverting it.",
    inputSchema: {
      action: z.enum(["expand", "contract", "feather", "invert"]).describe("Modification action"),
      amount: z.number().min(0).optional().describe("Amount in pixels (for expand, contract, feather)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildModifySelection(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "modify_selection", summary: `Modify selection: ${params.action}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to modify selection" }] };
    return { content: [{ type: "text" as const, text: `Selection modified: ${params.action}` }] };
  });

  // 27. photopea_fill_selection
  server.registerTool("photopea_fill_selection", {
    title: "Fill Selection",
    description: "Fill the current selection with a color.",
    inputSchema: {
      color: hexColor,
      opacity: z.number().min(0).max(100).optional().describe("Fill opacity (0-100)"),
      blendMode: z.string().optional().describe("Blend mode for the fill"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildFillSelection(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "fill_selection", summary: `Fill selection with ${params.color}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to fill selection" }] };
    return { content: [{ type: "text" as const, text: `Selection filled with ${params.color}` }] };
  });

  // 28. photopea_clear_selection
  server.registerTool("photopea_clear_selection", {
    title: "Clear Selection",
    description: "Deselect / clear the current selection in the active document.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (_params) => {
    const script = buildClearSelection();
    bridge.sendActivity({ type: "activity", id: "", tool: "clear_selection", summary: "Clear selection" });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to clear selection" }] };
    return { content: [{ type: "text" as const, text: "Selection cleared" }] };
  });

}
