// src/tools/layer.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeResult } from "../bridge/types.js";
import {
  buildAddLayer,
  buildAddFillLayer,
  buildDeleteLayer,
  buildSelectLayer,
  buildSetLayerProperties,
  buildMoveLayer,
  buildDuplicateLayer,
  buildReorderLayer,
  buildGroupLayers,
  buildGetLayers,
  buildLayerMask,
  buildSetClippingMask,
  buildAddAdjustmentLayer,
  buildMergeLayers,
  buildSetLayerStyle,
  escapeString,
} from "../bridge/script-builder.js";

const layerTarget = z.union([z.string(), z.number()]).describe("Layer name (string) or index (number)");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Hex color, e.g. #000000");
const percent = z.number().min(0).max(100);

export function registerLayerTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 6. photopea_add_layer
  server.registerTool("photopea_add_layer", {
    title: "Add Layer",
    description: "Add a new empty layer to the active document. The new layer becomes the active layer. Use this before operations that draw onto a layer, such as fill_selection or add_gradient.",
    inputSchema: {
      name: z.string().optional().describe("Display name for the new layer in the layers panel"),
      opacity: z.number().min(0).max(100).optional().describe("Layer opacity percentage (0 = fully transparent, 100 = fully opaque, default 100)"),
      blendMode: z.string().optional().describe("Blend mode (e.g. normal, multiply, screen, overlay, darken, lighten). Defaults to normal."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddLayer(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_layer", summary: `Add layer${params.name ? `: ${params.name}` : ""}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to add layer" }] };
    return { content: [{ type: "text" as const, text: `Layer added${params.name ? `: ${params.name}` : ""}` }] };
  });

  // 7. photopea_add_fill_layer
  server.registerTool("photopea_add_fill_layer", {
    title: "Add Fill Layer",
    description: "Add a non-destructive solid color fill layer that covers the entire canvas. Unlike fill_selection, this creates a separate adjustment-style layer that can be toggled, recolored, or deleted without affecting other layers. Use set_layer_properties to change its opacity or blend mode.",
    inputSchema: {
      type: z.enum(["solid"]).describe("Fill layer type (currently only 'solid' is supported)"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Fill color as hex string (e.g. #ff0000)"),
      name: z.string().optional().describe("Display name for the fill layer in the layers panel"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddFillLayer(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_fill_layer", summary: `Add ${params.type} fill layer` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to add fill layer" }] };
    return { content: [{ type: "text" as const, text: `Fill layer (${params.type}) added` }] };
  });

  // 8. photopea_delete_layer
  server.registerTool("photopea_delete_layer", {
    title: "Delete Layer",
    description: "Permanently remove a layer from the active document by name or index. The next layer in the stack becomes active after deletion. Use get_layers to see available layers before deleting.",
    inputSchema: {
      target: layerTarget,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildDeleteLayer({ target: params.target });
    bridge.sendActivity({ type: "activity", id: "", tool: "delete_layer", summary: `Delete layer: ${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to delete layer" }] };
    return { content: [{ type: "text" as const, text: `Layer deleted: ${params.target}` }] };
  });

  // 9. photopea_select_layer
  server.registerTool("photopea_select_layer", {
    title: "Select Layer",
    description: "Set a layer as the active layer by name or index. Many tools (apply_filter, apply_adjustment, fill_selection) operate on the active layer — use this to target a specific layer first. Use get_layers to find layer names and indices.",
    inputSchema: {
      target: layerTarget,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildSelectLayer({ target: params.target });
    bridge.sendActivity({ type: "activity", id: "", tool: "select_layer", summary: `Select layer: ${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to select layer" }] };
    return { content: [{ type: "text" as const, text: `Layer selected: ${params.target}` }] };
  });

  // 10. photopea_set_layer_properties
  server.registerTool("photopea_set_layer_properties", {
    title: "Set Layer Properties",
    description: "Update one or more properties on a layer. Only specified properties are changed; others remain at their current values. Use get_layers to inspect current property values before modifying.",
    inputSchema: {
      target: layerTarget,
      opacity: z.number().min(0).max(100).optional().describe("Layer opacity percentage (0 = fully transparent, 100 = fully opaque)"),
      blendMode: z.string().optional().describe("Blend mode (e.g. normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn)"),
      visible: z.boolean().optional().describe("Layer visibility (true = visible, false = hidden)"),
      name: z.string().optional().describe("New display name for the layer"),
      locked: z.boolean().optional().describe("Whether the layer is locked (true = prevent edits, false = allow edits)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildSetLayerProperties(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "set_layer_properties", summary: `Set properties on layer: ${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to set layer properties" }] };
    return { content: [{ type: "text" as const, text: `Layer properties updated: ${params.target}` }] };
  });

  // 11. photopea_move_layer
  server.registerTool("photopea_move_layer", {
    title: "Move Layer",
    description: "Translate a layer by a relative x/y offset in pixels from its current position. Positive x moves right, positive y moves down. Use get_layers to check current layer bounds, or transform_layer for scaling and rotation.",
    inputSchema: {
      target: layerTarget,
      x: z.number().describe("Horizontal offset in pixels (positive = right, negative = left)"),
      y: z.number().describe("Vertical offset in pixels (positive = down, negative = up)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildMoveLayer(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "move_layer", summary: `Move layer ${params.target} by (${params.x}, ${params.y})` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to move layer" }] };
    return { content: [{ type: "text" as const, text: `Layer moved: ${params.target} by (${params.x}, ${params.y})` }] };
  });

  // 12. photopea_duplicate_layer
  server.registerTool("photopea_duplicate_layer", {
    title: "Duplicate Layer",
    description: "Create a copy of a layer in the active document. The duplicate becomes the active layer and is placed above the original. Use newName to distinguish the copy from the original.",
    inputSchema: {
      target: layerTarget,
      newName: z.string().optional().describe("Display name for the duplicated layer (defaults to 'original name copy')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildDuplicateLayer(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "duplicate_layer", summary: `Duplicate layer: ${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to duplicate layer" }] };
    return { content: [{ type: "text" as const, text: `Layer duplicated: ${params.target}` }] };
  });

  // 13. photopea_reorder_layer
  server.registerTool("photopea_reorder_layer", {
    title: "Reorder Layer",
    description: "Move a layer to a new position in the layer stack. Use 'top' or 'bottom' to move to the ends of the stack, or 'above'/'below' to shift one position relative to the current index. Use get_layers to see the current layer order.",
    inputSchema: {
      target: layerTarget,
      position: z.enum(["above", "below", "top", "bottom"]).describe("Target position: 'top' = front of stack, 'bottom' = back of stack, 'above' = one position up, 'below' = one position down"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildReorderLayer(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "reorder_layer", summary: `Reorder layer ${params.target} to ${params.position}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to reorder layer" }] };
    return { content: [{ type: "text" as const, text: `Layer reordered: ${params.target} to ${params.position}` }] };
  });

  // 14. photopea_group_layers
  server.registerTool("photopea_group_layers", {
    title: "Group Layers",
    description: "Group multiple layers into a layer group (folder). Layers are specified by name — use get_layers to find layer names. Grouped layers can be ungrouped later with ungroup_layers.",
    inputSchema: {
      layers: z.array(z.string()).describe("Array of layer names to include in the group (use get_layers to find names)"),
      groupName: z.string().optional().describe("Display name for the group folder in the layers panel"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildGroupLayers(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "group_layers", summary: `Group ${params.layers.length} layers` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to group layers" }] };
    return { content: [{ type: "text" as const, text: `Layers grouped${params.groupName ? `: ${params.groupName}` : ""}` }] };
  });

  // photopea_ungroup_layers
  server.registerTool("photopea_ungroup_layers", {
    title: "Ungroup Layers",
    description: "Dissolve a layer group, moving all child layers to the document root. The group folder is removed but its contents are preserved. Use get_layers to find group names.",
    inputSchema: {
      target: z.string().describe("Name of the layer group to ungroup (use get_layers to find group names)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const safe = escapeString(params.target);
    const script = [
      `var _d = app.activeDocument;`,
      `var _g = _d.layerSets.getByName('${safe}');`,
      `while (_g.layers.length > 0) { _g.layers[0].move(_d.layers[_d.layers.length - 1], ElementPlacement.PLACEBEFORE); }`,
      `_g.remove();`,
      `app.echoToOE('ok');`,
    ].join("\n");
    bridge.sendActivity({ type: "activity", id: "", tool: "ungroup_layers", summary: `Ungroup: ${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to ungroup layers" }] };
    return { content: [{ type: "text" as const, text: `Group ungrouped: ${params.target}` }] };
  });

  // 15. photopea_get_layers
  server.registerTool("photopea_get_layers", {
    title: "Get Layers",
    description: "Get the full layer tree of the active document as JSON. Returns an array of layer objects with name, type, index, visible, opacity, blendMode, and bounds properties. Groups contain nested children arrays. Use this to discover layer names and indices for other layer operations.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (_params) => {
    const script = buildGetLayers();
    bridge.sendActivity({ type: "activity", id: "", tool: "get_layers", summary: "Get layer tree" });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to get layers" }] };
    const layersResult = result as BridgeResult;
    return { content: [{ type: "text" as const, text: layersResult.data || "[]" }] };
  });

  // photopea_layer_mask
  server.registerTool("photopea_layer_mask", {
    title: "Layer Mask",
    description: "Add or delete a layer mask, which hides parts of a layer without erasing pixels. 'from_selection' shows only the current selection (use make_selection first). Acts on the target layer, or the active layer if omitted.",
    inputSchema: {
      action: z.enum(["reveal_all", "hide_all", "from_selection", "delete"]).describe("'reveal_all' adds a mask that shows everything, 'hide_all' one that hides everything, 'from_selection' one that shows the selection, 'delete' removes the mask"),
      target: layerTarget.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "layer_mask", summary: `Layer mask: ${params.action}` });
    const result = await bridge.executeScript(buildLayerMask(params));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to change layer mask" }] };
    return { content: [{ type: "text" as const, text: `Layer mask: ${params.action}` }] };
  });

  // photopea_set_clipping_mask
  server.registerTool("photopea_set_clipping_mask", {
    title: "Set Clipping Mask",
    description: "Clip a layer to the layer directly below it, so it only shows where that layer has pixels (e.g. a photo or texture confined to a text or shape). Set enabled to false to release it.",
    inputSchema: {
      target: layerTarget,
      enabled: z.boolean().default(true).describe("true clips the layer to the one below, false releases it"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "set_clipping_mask", summary: `${params.enabled ? "Clip" : "Release"} ${params.target}` });
    const result = await bridge.executeScript(buildSetClippingMask(params));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to set clipping mask" }] };
    return { content: [{ type: "text" as const, text: `Clipping ${params.enabled ? "enabled" : "released"} for ${params.target}` }] };
  });

  // photopea_add_adjustment_layer
  server.registerTool("photopea_add_adjustment_layer", {
    title: "Add Adjustment Layer",
    description: "Add a non-destructive adjustment layer above the active layer. It changes how all layers below look without touching their pixels and can be hidden or deleted later. Use apply_adjustment to change one layer's pixels instead.",
    inputSchema: {
      type: z.enum(["brightness", "hue_sat", "levels"]).describe("'brightness' uses brightness/contrast, 'hue_sat' uses hue/saturation/lightness, 'levels' uses inputMin/inputMax/gamma"),
      brightness: z.number().min(-150).max(150).optional().describe("brightness: -150..150"),
      contrast: z.number().min(-50).max(100).optional().describe("brightness: -50..100"),
      hue: z.number().min(-180).max(180).optional().describe("hue_sat: hue shift in degrees"),
      saturation: z.number().min(-100).max(100).optional().describe("hue_sat: -100..100"),
      lightness: z.number().min(-100).max(100).optional().describe("hue_sat: -100..100"),
      inputMin: z.number().int().min(0).max(253).optional().describe("levels: input black point 0..253"),
      inputMax: z.number().int().min(2).max(255).optional().describe("levels: input white point 2..255"),
      gamma: z.number().min(0.1).max(9.99).optional().describe("levels: midtone gamma, 1 = unchanged"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "add_adjustment_layer", summary: `Add ${params.type} adjustment layer` });
    const result = await bridge.executeScript(buildAddAdjustmentLayer(params));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to add adjustment layer" }] };
    return { content: [{ type: "text" as const, text: `${params.type} adjustment layer added` }] };
  });

  // photopea_merge_layers
  server.registerTool("photopea_merge_layers", {
    title: "Merge Layers",
    description: "Merge layers: 'down' merges the active layer into the one below, 'flatten' merges everything into a single background layer. Layer styles and masks get baked into pixels.",
    inputSchema: {
      mode: z.enum(["down", "flatten"]).describe("Which layers to merge"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "merge_layers", summary: `Merge layers: ${params.mode}` });
    const result = await bridge.executeScript(buildMergeLayers(params.mode));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to merge layers" }] };
    return { content: [{ type: "text" as const, text: `Layers merged (${params.mode})` }] };
  });

  // photopea_set_layer_style
  server.registerTool("photopea_set_layer_style", {
    title: "Set Layer Style",
    description: "Set a layer's effects: drop shadow, outer glow and/or stroke. Replaces the layer's existing effects; pass none to clear them. Effects stay editable and follow the layer's shape, which suits text and logos.",
    inputSchema: {
      target: layerTarget.optional(),
      dropShadow: z.object({
        color: hexColor,
        opacity: percent.optional().describe("0..100, default 75"),
        angle: z.number().optional().describe("Light angle in degrees, default 135 (shadow falls bottom-right)"),
        distance: z.number().min(0).optional().describe("Offset in pixels, default 10"),
        size: z.number().min(0).optional().describe("Blur in pixels, default 10"),
      }).optional(),
      outerGlow: z.object({
        color: hexColor,
        opacity: percent.optional().describe("0..100, default 75"),
        size: z.number().min(0).optional().describe("Glow spread in pixels, default 20"),
      }).optional(),
      stroke: z.object({
        color: hexColor,
        size: z.number().min(1).optional().describe("Width in pixels, default 3"),
        position: z.enum(["outside", "inside", "center"]).optional().describe("default outside"),
        opacity: percent.optional().describe("0..100, default 100"),
      }).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const effects = ["dropShadow", "outerGlow", "stroke"].filter((k) => params[k as keyof typeof params]);
    bridge.sendActivity({ type: "activity", id: "", tool: "set_layer_style", summary: effects.length ? `Layer style: ${effects.join(", ")}` : "Clear layer style" });
    const result = await bridge.executeScript(buildSetLayerStyle(params));
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to set layer style" }] };
    return { content: [{ type: "text" as const, text: effects.length ? `Layer style set: ${effects.join(", ")}` : "Layer style cleared" }] };
  });
}
