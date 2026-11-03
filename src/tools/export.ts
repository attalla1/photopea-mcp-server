// src/tools/export.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import { basename, join } from "path";
import {
  buildExportImage,
  buildRunScript,
  buildUndo,
  buildRedo,
  buildCloseDocument,
  escapeString,
} from "../bridge/script-builder.js";
import { writeLocalFile, isUrl } from "../utils/file-io.js";
import { loadImageDocument } from "./image.js";

export function registerExportTools(server: McpServer, bridge: PhotopeaBridge): void {
  // 30. photopea_export_image
  server.registerTool("photopea_export_image", {
    title: "Export Image",
    description: "Export the active document to a file and save it to the local filesystem. The entire document is flattened and exported in the chosen format. Use create_document or open_file to set up the document before exporting.",
    inputSchema: {
      format: z.enum(["png", "jpg", "webp", "psd", "svg"]).describe("Output format: 'png' for lossless, 'jpg' for compressed photos, 'webp' for web, 'psd' for Photoshop, 'svg' for vector"),
      quality: z.number().min(1).max(100).optional().describe("Compression quality for JPG and WebP (1 = smallest file, 100 = best quality). Ignored for other formats."),
      outputPath: z.string().describe("Absolute local file path where the exported file will be saved (e.g. /Users/me/output.png)"),
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

  // photopea_get_preview
  server.registerTool("photopea_get_preview", {
    title: "Get Preview",
    description: "See the active document: returns a PNG snapshot, downscaled to maxSize, so you can check layout, colors and text visually. The document is not modified. Call it after visual changes, before exporting.",
    inputSchema: {
      maxSize: z.number().int().min(64).max(2048).default(1024).describe("Longest side of the preview in pixels; smaller documents are not upscaled"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    bridge.sendActivity({ type: "activity", id: "", tool: "get_preview", summary: "Preview document" });
    const result = await bridge.executeScript(buildExportImage({ format: "png", outputPath: "" }), true, params.maxSize);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to render preview" }] };
    return { content: [{ type: "image" as const, data: (result as BridgeFileResult).data.toString("base64"), mimeType: "image/png" }] };
  });

  // photopea_batch_process
  server.registerTool("photopea_batch_process", {
    title: "Batch Process",
    description: "Run the same edit over many images: opens each input, optionally runs a Photopea script on it, exports it to outputDir as <input name>.<format> (repeated names get -2, -3) and closes it. Use it for bulk resizing, format conversion or watermarking. Existing files with the same name are overwritten.",
    inputSchema: {
      inputs: z.array(z.string()).min(1).describe("URLs or absolute local file paths of the images"),
      outputDir: z.string().describe("Absolute directory path for the exported files (created if missing)"),
      format: z.enum(["png", "jpg", "webp", "psd"]).describe("Output format"),
      quality: z.number().min(1).max(100).optional().describe("Compression quality for JPG and WebP (1-100)"),
      script: z.string().optional().describe("Photopea JavaScript to run on each image before export, e.g. \"app.activeDocument.resizeImage(800, 600);\""),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async (params) => {
    const lines: string[] = [];
    const usedNames = new Set<string>();
    let failed = 0;
    for (const source of params.inputs) {
      const base = basename(isUrl(source) ? new URL(source).pathname : source).replace(/\.[^.]*$/, "") || "image";
      let name = base;
      for (let i = 2; usedNames.has(name); i++) name = `${base}-${i}`; // a/photo.png and b/photo.png must not overwrite each other
      usedNames.add(name);
      const outputPath = join(params.outputDir, `${name}.${params.format}`);
      bridge.sendActivity({ type: "activity", id: "", tool: "batch_process", summary: `${lines.length + 1}/${params.inputs.length}: ${name}` });
      const loadError = await loadImageDocument(bridge, source);
      let error = loadError;
      if (!loadError) {
        const ran = params.script ? await bridge.executeScript(buildRunScript(params.script)) : { success: true, error: null };
        const exported = ran.success ? await bridge.executeScript(buildExportImage({ format: params.format, quality: params.quality, outputPath }), true) : ran;
        error = exported.success ? null : exported.error || "Failed";
        if (!error) {
          try {
            await writeLocalFile(outputPath, (exported as BridgeFileResult).data);
          } catch (err) {
            error = (err as Error).message;
          }
        }
        await bridge.executeScript(buildCloseDocument({ save: false })); // don't pile up open documents
      }
      if (error) failed++;
      lines.push(error ? `FAILED ${source}: ${error}` : `ok ${outputPath}`);
    }
    const summary = `${params.inputs.length - failed}/${params.inputs.length} exported`;
    return { isError: failed === params.inputs.length, content: [{ type: "text" as const, text: [summary, ...lines].join("\n") }] };
  });

  // photopea_load_font
  server.registerTool("photopea_load_font", {
    title: "Load Font",
    description: "Load a custom font from a URL (TTF or OTF; Photopea cannot open WOFF2) into Photopea. The font becomes available for add_text and edit_text. Use list_fonts to find the PostScript name after loading.",
    inputSchema: {
      url: z.string().describe("URL to a .ttf or .otf font file"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (params) => {
    // Loading a font via app.open() opens it as a "document" -- we need to track the current doc and switch back
    const script = [
      `var _docName = app.activeDocument ? app.activeDocument.name : null;`,
      `app.open('${escapeString(params.url)}');`,
      `if (_docName) { app.activeDocument = app.documents.getByName(_docName); }`,
      `app.echoToOE('ok');`,
    ].join("\n");
    bridge.sendActivity({ type: "activity", id: "", tool: "load_font", summary: `Load font: ${params.url.split("/").pop()}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to load font" }] };
    return { content: [{ type: "text" as const, text: `Font loaded from: ${params.url}. Use list_fonts to find its PostScript name.` }] };
  });

  // photopea_list_fonts
  server.registerTool("photopea_list_fonts", {
    title: "List Fonts",
    description: "List available fonts in Photopea. Returns font PostScript names that can be used with add_text and edit_text.",
    inputSchema: {
      search: z.string().optional().describe("Optional search string to filter fonts by name"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const search = params.search?.toLowerCase();
    const script = search
      ? `var r=[];for(var i=0;i<app.fonts.length;i++){var n=app.fonts[i].postScriptName;if(n.toLowerCase().indexOf('${escapeString(search)}')>=0)r.push(n);}app.echoToOE(JSON.stringify(r));`
      : `var r=[];for(var i=0;i<app.fonts.length;i++){r.push(app.fonts[i].postScriptName);}app.echoToOE(JSON.stringify(r));`;
    bridge.sendActivity({ type: "activity", id: "", tool: "list_fonts", summary: `List fonts${search ? `: ${search}` : ""}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to list fonts" }] };
    const data = (result as import("../bridge/types.js").BridgeResult).data || "[]";
    return { content: [{ type: "text" as const, text: data }] };
  });

  // 33. photopea_run_script
  server.registerTool("photopea_run_script", {
    title: "Run Script",
    description: "Execute arbitrary Photopea/ExtendScript JavaScript in the Photopea environment. Use this for advanced operations not covered by other tools. Has full access to the Photopea DOM (app, activeDocument, layers). Use with caution — scripts can modify or delete any document data.",
    inputSchema: {
      script: z.string().describe("Photopea JavaScript code to execute. Must call app.echoToOE(result) to return data. Has access to the full Photopea scripting API (app, activeDocument, etc.)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const script = buildRunScript(params.script);
    bridge.sendActivity({ type: "activity", id: "", tool: "run_script", summary: "Run custom script" });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Script execution failed" }] };
    // A script that calls saveToOE gets a file back, which isn't valid text content
    if (Buffer.isBuffer(result.data)) return { content: [{ type: "text" as const, text: `Script produced a ${result.data.length}-byte file. Use photopea_export_image to save files.` }] };
    return { content: [{ type: "text" as const, text: result.data ?? "Script executed successfully" }] };
  });

  // 34. photopea_undo
  server.registerTool("photopea_undo", {
    title: "Undo",
    description: "Undo one or more recent actions in the active document. Each step reverses one operation from the history. Use after destructive operations (apply_filter, apply_adjustment, fill_selection) to revert changes.",
    inputSchema: {
      steps: z.number().int().positive().default(1).describe("Number of history steps to undo (default 1)"),
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
    description: "Redo one or more previously undone actions in the active document. Only available after using undo — the redo history is cleared when new actions are performed.",
    inputSchema: {
      steps: z.number().int().positive().default(1).describe("Number of history steps to redo (default 1)"),
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
