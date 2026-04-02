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
} from "../bridge/script-builder.js";

const layerTarget = z.union([z.string(), z.number()]).describe("Layer name (string) or index (number)");

export function registerLayerTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 6. photopea_add_layer
  server.registerTool("photopea_add_layer", {
    title: "Add Layer",
    description: "Add a new empty art layer to the active document.",
    inputSchema: {
      name: z.string().optional().describe("Name for the new layer"),
      opacity: z.number().min(0).max(100).optional().describe("Layer opacity (0-100)"),
      blendMode: z.string().optional().describe("Blend mode (e.g. normal, multiply, screen, overlay)"),
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
    description: "Add a solid color, gradient, or pattern fill layer.",
    inputSchema: {
      type: z.enum(["solid", "gradient", "pattern"]).describe("Fill type: solid, gradient, or pattern"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Fill color as hex (for solid fill)"),
      name: z.string().optional().describe("Name for the fill layer"),
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
    description: "Delete a layer from the active document by name or index.",
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
    description: "Make a layer the active layer by name or index.",
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
    description: "Set one or more properties on a layer (opacity, blend mode, visibility, name, locked).",
    inputSchema: {
      target: layerTarget,
      opacity: z.number().min(0).max(100).optional().describe("Layer opacity (0-100)"),
      blendMode: z.string().optional().describe("Blend mode (e.g. normal, multiply, screen, overlay)"),
      visible: z.boolean().optional().describe("Layer visibility"),
      name: z.string().optional().describe("New layer name"),
      locked: z.boolean().optional().describe("Whether the layer is locked"),
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
    description: "Translate a layer by a given x/y offset in pixels.",
    inputSchema: {
      target: layerTarget,
      x: z.number().describe("Horizontal offset in pixels"),
      y: z.number().describe("Vertical offset in pixels"),
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
    description: "Duplicate a layer, optionally giving the copy a new name.",
    inputSchema: {
      target: layerTarget,
      newName: z.string().optional().describe("Name for the duplicated layer"),
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
    description: "Move a layer to a new position in the layer stack (above, below, top, or bottom).",
    inputSchema: {
      target: layerTarget,
      position: z.enum(["above", "below", "top", "bottom"]).describe("Target position in layer stack"),
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
    description: "Group a set of named layers into a layer group.",
    inputSchema: {
      layers: z.array(z.string()).describe("Array of layer names to include in the group"),
      groupName: z.string().optional().describe("Name for the group"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildGroupLayers(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "group_layers", summary: `Group ${params.layers.length} layers` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to group layers" }] };
    return { content: [{ type: "text" as const, text: `Layers grouped${params.groupName ? `: ${params.groupName}` : ""}` }] };
  });

  // 15. photopea_get_layers
  server.registerTool("photopea_get_layers", {
    title: "Get Layers",
    description: "Get the full layer tree of the active document as a JSON structure.",
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
}
