// src/tools/export.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import {
  buildExportImage,
  buildRunScript,
  buildUndo,
  buildRedo,
} from "../bridge/script-builder.js";
import { writeLocalFile } from "../utils/file-io.js";

export function registerExportTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 30. photopea_export_image
  server.registerTool("photopea_export_image", {
    title: "Export Image",
    description: "Export the active document to a file (PNG, JPG, WebP, PSD, or SVG) and save it to a local path.",
    inputSchema: {
      format: z.enum(["png", "jpg", "webp", "psd", "svg"]).describe("Export format"),
      quality: z.number().min(1).max(100).optional().describe("JPEG quality (1-100, only for jpg)"),
      outputPath: z.string().describe("Local file path where the export should be saved"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildExportImage(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "export_image", summary: `Export as ${params.format} to ${params.outputPath}` });
    const rawResult = await bridge.executeScript(script, true);
    if (!rawResult.success) return { isError: true, content: [{ type: "text" as const, text: rawResult.error || "Failed to export image" }] };

    const fileResult = rawResult as BridgeFileResult;
    try {
      await writeLocalFile(params.outputPath, fileResult.data);
    } catch (err) {
      return { isError: true, content: [{ type: "text" as const, text: `Export succeeded but failed to write file: ${(err as Error).message}` }] };
    }

    return { content: [{ type: "text" as const, text: `Image exported to: ${params.outputPath}` }] };
  });

  // 33. photopea_run_script
  server.registerTool("photopea_run_script", {
    title: "Run Script",
    description: "Execute an arbitrary Photopea JavaScript script.",
    inputSchema: {
      script: z.string().describe("JavaScript code to execute in Photopea"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const script = buildRunScript(params.script);
    bridge.sendActivity({ type: "activity", id: "", tool: "run_script", summary: "Run custom script" });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Script execution failed" }] };
    const scriptResult = result as import("../bridge/types.js").BridgeResult;
    return { content: [{ type: "text" as const, text: scriptResult.data ?? "Script executed successfully" }] };
  });

  // 34. photopea_undo
  server.registerTool("photopea_undo", {
    title: "Undo",
    description: "Undo one or more recent actions in Photopea.",
    inputSchema: {
      steps: z.number().int().positive().default(1).describe("Number of undo steps (default 1)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildUndo(params.steps);
    bridge.sendActivity({ type: "activity", id: "", tool: "undo", summary: `Undo ${params.steps} step(s)` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to undo" }] };
    return { content: [{ type: "text" as const, text: `Undid ${params.steps} step(s)` }] };
  });

  // 35. photopea_redo
  server.registerTool("photopea_redo", {
    title: "Redo",
    description: "Redo one or more previously undone actions in Photopea.",
    inputSchema: {
      steps: z.number().int().positive().default(1).describe("Number of redo steps (default 1)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildRedo(params.steps);
    bridge.sendActivity({ type: "activity", id: "", tool: "redo", summary: `Redo ${params.steps} step(s)` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to redo" }] };
    return { content: [{ type: "text" as const, text: `Redid ${params.steps} step(s)` }] };
  });
}
