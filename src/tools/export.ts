// src/tools/export.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import {
  buildExportImage,
  buildGetPreview,
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

  // 31. photopea_get_preview
  server.registerTool("photopea_get_preview", {
    title: "Get Preview",
    description: "Get a PNG preview of the active document, optionally resized, as base64 image data.",
    inputSchema: {
      maxWidth: z.number().positive().optional().describe("Maximum preview width in pixels"),
      maxHeight: z.number().positive().optional().describe("Maximum preview height in pixels"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildGetPreview(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "get_preview", summary: "Get document preview" });
    const rawResult = await bridge.executeScript(script, true);
    if (!rawResult.success) return { isError: true, content: [{ type: "text" as const, text: rawResult.error || "Failed to get preview" }] };

    const fileResult = rawResult as BridgeFileResult;
    const base64 = fileResult.data.toString("base64");
    const mimeType = fileResult.mimeType || "image/png";

    return {
      content: [
        {
          type: "image" as const,
          data: base64,
          mimeType,
        },
      ],
    };
  });

  // 32. photopea_batch_export
  server.registerTool("photopea_batch_export", {
    title: "Batch Export",
    description: "Export the active document to multiple formats/sizes at once.",
    inputSchema: {
      exports: z.array(z.object({
        format: z.enum(["png", "jpg", "webp", "psd", "svg"]).describe("Export format"),
        quality: z.number().min(1).max(100).optional().describe("JPEG quality (1-100, only for jpg)"),
        outputPath: z.string().describe("Local file path for this export"),
        width: z.number().positive().optional().describe("Resize to this width before exporting"),
        height: z.number().positive().optional().describe("Resize to this height before exporting"),
      })).describe("List of export configurations"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const results: string[] = [];
    const errors: string[] = [];

    for (const entry of params.exports) {
      let script: string;
      if (entry.width && entry.height) {
        // Duplicate, resize, export, close
        script = [
          `var _dup = app.activeDocument.duplicate();`,
          `_dup.resizeImage(${entry.width}, ${entry.height});`,
          `_dup.saveToOE('${entry.format === "jpg" && entry.quality ? `jpg:${entry.quality}` : entry.format}');`,
        ].join("\n");
      } else {
        script = buildExportImage({ format: entry.format, quality: entry.quality, outputPath: entry.outputPath });
      }
      bridge.sendActivity({ type: "activity", id: "", tool: "batch_export", summary: `Batch export as ${entry.format}` });
      const rawResult = await bridge.executeScript(script, true);

      if (!rawResult.success) {
        errors.push(`${entry.outputPath}: ${rawResult.error || "Failed"}`);
        continue;
      }

      const fileResult = rawResult as BridgeFileResult;
      try {
        await writeLocalFile(entry.outputPath, fileResult.data);
        results.push(entry.outputPath);
      } catch (err) {
        errors.push(`${entry.outputPath}: write failed — ${(err as Error).message}`);
        continue;
      }

      if (entry.width && entry.height) {
        await bridge.executeScript(`app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { isError: true, content: [{ type: "text" as const, text: `Batch export failed:\n${errors.join("\n")}` }] };
    }

    const summary = `Exported ${results.length}/${params.exports.length} files.\nSuccess:\n${results.join("\n")}${errors.length > 0 ? `\nErrors:\n${errors.join("\n")}` : ""}`;
    return { content: [{ type: "text" as const, text: summary }] };
  });

  // 33. photopea_run_script
  server.registerTool("photopea_run_script", {
    title: "Run Script",
    description: "Execute an arbitrary Photopea JavaScript script.",
    inputSchema: {
      script: z.string().describe("JavaScript code to execute in Photopea"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildRedo(params.steps);
    bridge.sendActivity({ type: "activity", id: "", tool: "redo", summary: `Redo ${params.steps} step(s)` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to redo" }] };
    return { content: [{ type: "text" as const, text: `Redid ${params.steps} step(s)` }] };
  });
}
