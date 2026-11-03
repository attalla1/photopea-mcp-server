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
  buildFitToLayer,
  buildSelectLayer,
  escapeString,
} from "../bridge/script-builder.js";
import { readLocalFile, fetchUrlToBuffer, isUrl } from "../utils/file-io.js";

const layerTarget = z.union([z.string(), z.number()]).describe("Layer name (string) or index (number)");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Color as hex string (e.g. #ff0000)");

/** Fetch an image and open it in Photopea as its own document. Returns an error message, or null on success. */
export async function loadImageDocument(bridge: PhotopeaBridge, source: string): Promise<string | null> {
  // Fetched server-side: Photopea's async app.open(url) sends "done" before the file loads
  let fileData: Buffer;
  try {
    fileData = isUrl(source) ? await fetchUrlToBuffer(source) : await readLocalFile(source);
  } catch (err) {
    return (err as Error).message;
  }
  const loadResult = await bridge.loadFile(fileData, source.split("/").pop() || "image");
  return loadResult.success ? null : loadResult.error || "Failed to load image";
}

// Copy the loaded image document into the previously active document as a new layer.
// Copy merged preserves transparency (unlike flatten/mergeVisible).
const PASTE_AS_LAYER = [
  `var _srcDoc = app.activeDocument;`,
  `_srcDoc.selection.selectAll();`,
  `_srcDoc.selection.copy(true);`,
  `_srcDoc.close(2);`,
  `app.activeDocument.paste();`,
];

export function registerImageTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 19. photopea_place_image
  server.registerTool("photopea_place_image", {
    title: "Place Image",
    description: "Place an image into the active document from a URL or local file path. Creates a new layer with the placed image as the active layer. Use width/height to resize while preserving aspect ratio, or x/y to position the layer.",
    inputSchema: {
      source: z.string().describe("URL or absolute local file path of the image to place"),
      x: z.number().optional().describe("X position offset in pixels from the left edge"),
      y: z.number().optional().describe("Y position offset in pixels from the top edge"),
      width: z.number().positive().optional().describe("Resize to this width in pixels (preserves aspect ratio if only one dimension is set)"),
      height: z.number().positive().optional().describe("Resize to this height in pixels (preserves aspect ratio if only one dimension is set)"),
      name: z.string().optional().describe("Display name for the placed layer in the layers panel"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const { source } = params;
    bridge.sendActivity({ type: "activity", id: "", tool: "place_image", summary: `Place image: ${source}` });

    const loadError = await loadImageDocument(bridge, source);
    if (loadError) return { isError: true, content: [{ type: "text" as const, text: loadError }] };

    {
      const lines = [...PASTE_AS_LAYER];

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

  // photopea_fill_placeholder
  server.registerTool("photopea_fill_placeholder", {
    title: "Fill Placeholder",
    description: "Put an image into a template's placeholder layer: the image is scaled to cover (or fit inside) the placeholder's bounds, centered on it, placed above it and clipped to its shape. Use it for photo frames, device mockups and social post templates; use edit_text to swap the template's text.",
    inputSchema: {
      placeholder: layerTarget.describe("Placeholder layer name (string) or index (number), e.g. a shape or pixel layer marking where the image goes"),
      source: z.string().describe("URL or absolute local file path of the image"),
      fit: z.enum(["cover", "contain"]).default("cover").describe("'cover' fills the placeholder and crops overflow, 'contain' fits the whole image inside it"),
      clip: z.boolean().default(true).describe("Clip the image to the placeholder's shape"),
      name: z.string().optional().describe("Display name for the new image layer"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "fill_placeholder", summary: `Fill ${params.placeholder} with ${params.source}` });
    // Check the placeholder before pasting, so a wrong name doesn't leave a stray image layer (paste then lands right above it)
    const found = await bridge.executeScript(buildSelectLayer({ target: params.placeholder }));
    if (!found.success) return { isError: true, content: [{ type: "text" as const, text: `Placeholder layer not found: ${params.placeholder}. Use get_layers to list layer names.` }] };
    const loadError = await loadImageDocument(bridge, params.source);
    if (loadError) return { isError: true, content: [{ type: "text" as const, text: loadError }] };
    const lines = [...PASTE_AS_LAYER];
    if (params.name) lines.push(`app.activeDocument.activeLayer.name = '${escapeString(params.name)}';`);
    lines.push(buildFitToLayer(params));
    const result = await bridge.executeScript(lines.join("\n"));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to fill placeholder" }] };
    return { content: [{ type: "text" as const, text: `Placeholder ${params.placeholder} filled with ${params.source}` }] };
  });

  // 20. photopea_apply_adjustment
  server.registerTool("photopea_apply_adjustment", {
    title: "Apply Adjustment",
    description: "Apply a destructive image adjustment to the active layer's pixel data. Use select_layer to target a specific layer first. Modifies pixels directly — use undo to revert if needed.",
    inputSchema: {
      type: z.enum(["brightness", "hue_sat", "levels", "curves"]).describe("Adjustment type: 'brightness' for brightness/contrast, 'hue_sat' for hue/saturation/lightness, 'levels' for input levels, 'curves' for tone curves"),
      settings: z.record(z.union([z.number(), z.string(), z.boolean()])).optional().describe("Key-value settings for the adjustment. For brightness: { brightness: -100..100, contrast: -100..100 }. For hue_sat: { hue: -180..180, saturation: -100..100, lightness: -100..100 }. For levels: { inputMin: 0..255, inputMax: 0..255, gamma: 0.1..9.99 }"),
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
    description: "Apply a destructive filter effect to the active layer's pixel data. Use select_layer to target a specific layer first. Modifies pixels directly — use undo to revert if needed.",
    inputSchema: {
      type: z.enum(["gaussian_blur", "sharpen", "unsharp_mask", "noise", "motion_blur"]).describe("Filter type to apply to the active layer"),
      settings: z.record(z.union([z.number(), z.string(), z.boolean()])).optional().describe("Key-value settings for the filter. For gaussian_blur: { radius: pixels }. For unsharp_mask: { amount: 1-500, radius: 0.1-250, threshold: 0-255 }. For motion_blur: { angle: degrees, distance: pixels }. For noise: { amount: 1-100 }"),
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
    description: "Scale, rotate, or flip a layer in-place. Modifies the layer's pixel data destructively. Use get_layers to check current layer bounds before transforming, and undo to revert if needed.",
    inputSchema: {
      target: layerTarget,
      scaleX: z.number().positive().optional().describe("Horizontal scale factor (1.0 = no change, 0.5 = half size, 2.0 = double size)"),
      scaleY: z.number().positive().optional().describe("Vertical scale factor (1.0 = no change, 0.5 = half size, 2.0 = double size)"),
      rotation: z.number().optional().describe("Rotation angle in degrees (positive = clockwise, negative = counter-clockwise)"),
      flipH: z.boolean().optional().describe("Flip the layer horizontally (mirror left-right)"),
      flipV: z.boolean().optional().describe("Flip the layer vertically (mirror top-bottom)"),
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
    description: "Apply a linear gradient fill to a layer, replacing its current pixel content. The target layer must already exist — use add_layer to create one first. Colors are distributed evenly across the gradient.",
    inputSchema: {
      target: layerTarget,
      type: z.enum(["linear"]).describe("Gradient type (currently only 'linear' is supported)"),
      colors: z.array(hexColor).min(2).describe("Array of hex color stops distributed evenly along the gradient (minimum 2, e.g. ['#ff0000', '#0000ff'])"),
      angle: z.number().optional().describe("Gradient angle in degrees (0 = left-to-right, 90 = top-to-bottom, default 0)"),
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
    description: "Create a pixel selection region in the active document. After creating a selection, use fill_selection to fill it with color, or clear_selection to deselect. Use type 'all' to select the entire canvas, or 'rect'/'ellipse' with bounds for a specific region.",
    inputSchema: {
      type: z.enum(["all", "rect", "ellipse"]).describe("Selection shape: 'all' selects the entire canvas, 'rect' creates a rectangle, 'ellipse' creates an ellipse"),
      bounds: z.object({
        x: z.number().describe("Left edge X position in pixels"),
        y: z.number().describe("Top edge Y position in pixels"),
        width: z.number().positive().describe("Selection width in pixels"),
        height: z.number().positive().describe("Selection height in pixels"),
      }).optional().describe("Selection region bounds in pixels. Required for 'rect' and 'ellipse' types, ignored for 'all'."),
      feather: z.number().min(0).optional().describe("Soft edge radius in pixels for anti-aliased selection edges (0 = hard edge)"),
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
    description: "Modify the current active selection. Requires an existing selection created by make_selection. For expand, contract, and feather, the amount parameter specifies pixels. Invert swaps selected and unselected areas.",
    inputSchema: {
      action: z.enum(["expand", "contract", "feather", "invert"]).describe("How to modify the selection: 'expand' grows it, 'contract' shrinks it, 'feather' softens edges, 'invert' swaps selected/unselected"),
      amount: z.number().min(0).optional().describe("Modification amount in pixels (required for expand, contract, feather; ignored for invert)"),
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
    description: "Fill the current selection with a solid color on the active layer. Requires an active selection — use make_selection to create one first. Modifies pixel data on the active layer directly. Use clear_selection afterward to deselect.",
    inputSchema: {
      color: hexColor,
      opacity: z.number().min(0).max(100).optional().describe("Fill opacity percentage (0 = fully transparent, 100 = fully opaque, default 100)"),
      blendMode: z.string().optional().describe("Blend mode for the fill (e.g. normal, multiply, screen, overlay, darken, lighten). Defaults to normal."),
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
    description: "Deselect the current selection in the active document, removing the marching ants. Does not modify any pixel data. Use after fill_selection or other selection-based operations are complete.",
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
