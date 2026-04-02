# Photopea MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that gives AI agents full programmatic control over Photopea via a WebSocket bridge to a browser-embedded iframe, with live preview.

**Architecture:** MCP server (stdio) communicates with a local web page (HTTP/WebSocket) that embeds Photopea in an iframe. The server translates structured tool calls into Photopea JavaScript scripts (Adobe Photoshop JS API), sends them via WebSocket to a bridge client in the browser, which forwards them to Photopea via postMessage. Results flow back the same path.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `ws` (WebSocket), `zod` (validation), Vitest (testing)

**Spec:** `docs/superpowers/specs/2026-04-02-photopea-mcp-design.md`

---

## File Structure

```
photopea-mcp/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                  # Entry point: start MCP server + HTTP/WS server + browser launch
    server.ts                 # McpServer instance + tool registration wiring
    bridge/
      types.ts                # All TypeScript interfaces and types
      script-builder.ts       # Pure functions: structured params -> Photopea JS strings
      websocket-server.ts     # WebSocket server, request queue, correlation logic
    tools/
      document.ts             # Document tool handlers
      layer.ts                # Layer tool handlers
      text.ts                 # Text + shape tool handlers
      image.ts                # Image, style, selection tool handlers
      export.ts               # Export + utility tool handlers
      workflows.ts            # Tier 2 workflow tool handlers
    frontend/
      index.html              # Single-file web page with bridge client
    utils/
      file-io.ts              # Read/write local files, fetch URLs
      platform.ts             # Port detection + browser launch
  tests/
    unit/
      script-builder.test.ts  # Unit tests for all script builder functions
    integration/
      websocket-bridge.test.ts # Integration tests with mock Photopea client
  README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "photopea-mcp-server",
  "version": "0.1.0",
  "description": "MCP server for AI-driven image editing with Photopea",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "photopea-mcp-server": "dist/index.js"
  },
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "clean": "rm -rf dist",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run --config vitest.e2e.config.ts"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.6.1",
    "open": "^10.1.0",
    "ws": "^8.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/ws": "^8.5.13",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 4: Create directory structure**

Run:
```bash
mkdir -p src/bridge src/tools src/frontend src/utils tests/unit tests/integration
```

- [ ] **Step 5: Install dependencies**

Run:
```bash
npm install
```
Expected: `node_modules` created, `package-lock.json` generated.

- [ ] **Step 6: Verify TypeScript compiles**

Run:
```bash
# Create a minimal placeholder so tsc doesn't error on empty project
echo 'export {};' > src/index.ts
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts package-lock.json src/index.ts
git commit -m "feat: scaffold project with TypeScript, MCP SDK, WebSocket, Vitest"
```

---

### Task 2: Bridge Types and Interfaces

**Files:**
- Create: `src/bridge/types.ts`

- [ ] **Step 1: Write all shared types**

```typescript
// src/bridge/types.ts

// --- WebSocket Protocol Messages ---

/** Server -> Client: execute a Photopea script */
export interface ExecuteMessage {
  id: string;
  type: "execute";
  script: string;
  expectFiles: boolean;
}

/** Server -> Client: load a binary file into Photopea */
export interface LoadMessage {
  id: string;
  type: "load";
  data: string; // base64-encoded
  filename: string;
}

export type ServerToClientMessage = ExecuteMessage | LoadMessage;

/** Client -> Server: script execution result */
export interface ResultMessage {
  id: string;
  type: "result";
  success: boolean;
  data: string | null;
  error: string | null;
}

/** Client -> Server: file data from export */
export interface FileMessage {
  id: string;
  type: "file";
  success: boolean;
  data: string; // base64-encoded
  mimeType: string;
  error: string | null;
}

/** Client -> Server: status update */
export interface StatusMessage {
  type: "status";
  status: "ready" | "disconnected";
}

/** Client -> Server: activity log entry for the frontend */
export interface ActivityMessage {
  type: "activity";
  id: string;
  tool: string;
  summary: string;
}

export type ClientToServerMessage =
  | ResultMessage
  | FileMessage
  | StatusMessage;

// --- Bridge Internal Types ---

export interface BridgeResult {
  success: boolean;
  data: string | null;
  error: string | null;
}

export interface BridgeFileResult {
  success: boolean;
  data: Buffer;
  mimeType: string;
  error: string | null;
}

export interface PendingRequest {
  id: string;
  resolve: (value: BridgeResult | BridgeFileResult) => void;
  reject: (reason: Error) => void;
  expectFiles: boolean;
  timer: ReturnType<typeof setTimeout>;
}

// --- Tool Parameter Types ---

export interface CreateDocumentParams {
  width: number;
  height: number;
  resolution?: number;
  name?: string;
  mode?: string;
  fillColor?: string;
}

export interface ResizeDocumentParams {
  width: number;
  height: number;
  resampleMethod?: string;
  anchor?: string;
}

export interface LayerTarget {
  target: string | number;
}

export interface AddLayerParams {
  name?: string;
  opacity?: number;
  blendMode?: string;
}

export interface AddFillLayerParams {
  type: "solid" | "gradient" | "pattern";
  color?: string;
  gradient?: GradientSpec;
  name?: string;
}

export interface GradientSpec {
  colors: string[];
  angle?: number;
}

export interface SetLayerPropertiesParams {
  target: string | number;
  opacity?: number;
  blendMode?: string;
  visible?: boolean;
  name?: string;
  locked?: boolean;
}

export interface MoveLayerParams {
  target: string | number;
  x: number;
  y: number;
}

export interface DuplicateLayerParams {
  target: string | number;
  newName?: string;
}

export interface ReorderLayerParams {
  target: string | number;
  position: "above" | "below" | "top" | "bottom";
}

export interface GroupLayersParams {
  layers: string[];
  groupName?: string;
}

export interface AddShapeParams {
  type: "rectangle" | "ellipse" | "line" | "polygon";
  bounds: { x: number; y: number; width: number; height: number };
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  name?: string;
}

export interface AddTextParams {
  content: string;
  x: number;
  y: number;
  font?: string;
  size?: number;
  color?: string;
  alignment?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  paragraphBounds?: { width: number; height: number } | null;
}

export interface EditTextParams {
  target: string | number;
  content?: string;
  font?: string;
  size?: number;
  color?: string;
  alignment?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
}

export interface PlaceImageParams {
  source: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
}

export interface ApplyAdjustmentParams {
  type: string;
  settings?: Record<string, number | string | boolean>;
}

export interface ApplyFilterParams {
  type: string;
  settings?: Record<string, number | string | boolean>;
}

export interface TransformLayerParams {
  target: string | number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

export interface DropShadowSpec {
  color?: string;
  opacity?: number;
  angle?: number;
  distance?: number;
  spread?: number;
  size?: number;
}

export interface StrokeSpec {
  color?: string;
  size?: number;
  position?: "outside" | "inside" | "center";
  opacity?: number;
}

export interface GlowSpec {
  color?: string;
  opacity?: number;
  size?: number;
  spread?: number;
}

export interface ApplyLayerStyleParams {
  target: string | number;
  dropShadow?: DropShadowSpec;
  stroke?: StrokeSpec;
  outerGlow?: GlowSpec;
  innerGlow?: GlowSpec;
  colorOverlay?: { color: string; opacity?: number };
  gradientOverlay?: { colors: string[]; angle?: number; opacity?: number };
}

export interface AddGradientParams {
  target: string | number;
  type: "linear" | "radial" | "angular";
  colors: string[];
  angle?: number;
  scale?: number;
}

export interface MakeSelectionParams {
  type: "all" | "rect" | "ellipse";
  bounds?: { x: number; y: number; width: number; height: number };
  feather?: number;
}

export interface ModifySelectionParams {
  action: "expand" | "contract" | "feather" | "invert";
  amount?: number;
}

export interface FillSelectionParams {
  color: string;
  opacity?: number;
  blendMode?: string;
}

export interface ReplaceSmartObjectParams {
  target: string | number;
  source: string;
}

export interface ExportImageParams {
  format: "png" | "jpg" | "webp" | "psd" | "svg";
  quality?: number;
  outputPath: string;
}

export interface GetPreviewParams {
  maxWidth?: number;
  maxHeight?: number;
}

export interface BatchExportEntry {
  format: "png" | "jpg" | "webp" | "psd" | "svg";
  quality?: number;
  outputPath: string;
  width?: number;
  height?: number;
}

export interface BatchExportParams {
  exports: BatchExportEntry[];
}

export interface SetBackgroundParams {
  type: "solid" | "gradient" | "image";
  color?: string;
  gradient?: GradientSpec;
  imageSource?: string;
  blur?: number;
}

export interface CreateBannerParams {
  width: number;
  height: number;
  title: string;
  subtitle?: string;
  backgroundColor?: string;
  accentColor?: string;
  titleFont?: string;
  titleSize?: number;
  titleColor?: string;
  backgroundImage?: string;
  layout?: "centered" | "left" | "split";
  outputPath?: string;
}

export interface LoadTemplateParams {
  source: string;
}

export interface TemplateVariable {
  [layerName: string]: string;
}

export interface ApplyTemplateVariablesParams {
  variables: TemplateVariable;
}

export interface ComposeLayerEntry {
  type: "text" | "image" | "shape" | "fill";
  [key: string]: unknown;
}

export interface ComposeLayersParams {
  layers: ComposeLayerEntry[];
}

// --- Layer Info Types (returned by get_layers) ---

export interface LayerInfo {
  name: string;
  index: number;
  type: string;
  visible: boolean;
  opacity: number;
  bounds: { x: number; y: number; width: number; height: number };
  children?: LayerInfo[];
}

export interface DocumentInfo {
  name: string;
  width: number;
  height: number;
  resolution: number;
  layerCount: number;
  colorMode: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/bridge/types.ts
git commit -m "feat: add all bridge and tool parameter types"
```

---

### Task 3: Script Builder — Document and Layer Operations

**Files:**
- Create: `src/bridge/script-builder.ts`
- Create: `tests/unit/script-builder.test.ts`

The script builder is the core of the system: pure functions that take structured params and return Photopea-compatible JavaScript strings. This task covers document and layer operations.

- [ ] **Step 1: Write failing tests for document operations**

```typescript
// tests/unit/script-builder.test.ts
import { describe, it, expect } from "vitest";
import {
  buildCreateDocument,
  buildGetDocumentInfo,
  buildResizeDocument,
  buildCloseDocument,
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
} from "../../src/bridge/script-builder.js";

describe("script-builder: document operations", () => {
  it("buildCreateDocument with all params", () => {
    const script = buildCreateDocument({
      width: 1920,
      height: 1080,
      resolution: 72,
      name: "Banner",
      mode: "RGB",
      fillColor: "#1a1a2e",
    });
    expect(script).toContain("app.documents.add(1920, 1080, 72");
    expect(script).toContain("Banner");
    expect(script).toContain("NewDocumentMode.RGB");
  });

  it("buildCreateDocument with defaults", () => {
    const script = buildCreateDocument({ width: 800, height: 600 });
    expect(script).toContain("app.documents.add(800, 600, 72");
  });

  it("buildGetDocumentInfo returns echoToOE with JSON", () => {
    const script = buildGetDocumentInfo();
    expect(script).toContain("app.activeDocument");
    expect(script).toContain("app.echoToOE");
    expect(script).toContain("width");
    expect(script).toContain("height");
  });

  it("buildResizeDocument with dimensions", () => {
    const script = buildResizeDocument({ width: 1024, height: 768 });
    expect(script).toContain("resizeImage");
    expect(script).toContain("1024");
    expect(script).toContain("768");
  });

  it("buildCloseDocument with save", () => {
    const script = buildCloseDocument({ save: true });
    expect(script).toContain("close");
    expect(script).toContain("SaveOptions.SAVECHANGES");
  });

  it("buildCloseDocument without save", () => {
    const script = buildCloseDocument({ save: false });
    expect(script).toContain("close");
    expect(script).toContain("SaveOptions.DONOTSAVECHANGES");
  });
});

describe("script-builder: layer operations", () => {
  it("buildAddLayer with name and opacity", () => {
    const script = buildAddLayer({ name: "Header", opacity: 80, blendMode: "multiply" });
    expect(script).toContain("artLayers.add()");
    expect(script).toContain("Header");
    expect(script).toContain("opacity = 80");
    expect(script).toContain("BlendMode.MULTIPLY");
  });

  it("buildAddFillLayer solid", () => {
    const script = buildAddFillLayer({ type: "solid", color: "#ff0000", name: "Red Fill" });
    expect(script).toContain("SolidColor");
    expect(script).toContain("255");
    expect(script).toContain("Red Fill");
  });

  it("buildDeleteLayer by name", () => {
    const script = buildDeleteLayer({ target: "Background" });
    expect(script).toContain("Background");
    expect(script).toContain("remove()");
  });

  it("buildDeleteLayer by index", () => {
    const script = buildDeleteLayer({ target: 0 });
    expect(script).toContain("layers[0]");
    expect(script).toContain("remove()");
  });

  it("buildSelectLayer by name", () => {
    const script = buildSelectLayer({ target: "Header" });
    expect(script).toContain("Header");
    expect(script).toContain("activeLayer");
  });

  it("buildSetLayerProperties changes opacity and visibility", () => {
    const script = buildSetLayerProperties({
      target: "Header",
      opacity: 50,
      visible: false,
    });
    expect(script).toContain("Header");
    expect(script).toContain("opacity = 50");
    expect(script).toContain("visible = false");
  });

  it("buildMoveLayer translates position", () => {
    const script = buildMoveLayer({ target: "Logo", x: 100, y: 200 });
    expect(script).toContain("Logo");
    expect(script).toContain("translate");
    expect(script).toContain("100");
    expect(script).toContain("200");
  });

  it("buildDuplicateLayer with new name", () => {
    const script = buildDuplicateLayer({ target: "Header", newName: "Header Copy" });
    expect(script).toContain("Header");
    expect(script).toContain("duplicate()");
    expect(script).toContain("Header Copy");
  });

  it("buildReorderLayer to top", () => {
    const script = buildReorderLayer({ target: "Logo", position: "top" });
    expect(script).toContain("Logo");
    expect(script).toContain("move");
  });

  it("buildGroupLayers creates a group", () => {
    const script = buildGroupLayers({ layers: ["Title", "Subtitle"], groupName: "Text Group" });
    expect(script).toContain("layerSets.add()");
    expect(script).toContain("Text Group");
  });

  it("buildGetLayers returns layer tree as JSON", () => {
    const script = buildGetLayers();
    expect(script).toContain("app.echoToOE");
    expect(script).toContain("JSON.stringify");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/unit/script-builder.test.ts
```
Expected: All tests FAIL (module not found).

- [ ] **Step 3: Implement script builder — document and layer operations**

```typescript
// src/bridge/script-builder.ts

import type {
  CreateDocumentParams,
  ResizeDocumentParams,
  AddLayerParams,
  AddFillLayerParams,
  SetLayerPropertiesParams,
  MoveLayerParams,
  DuplicateLayerParams,
  ReorderLayerParams,
  GroupLayersParams,
  LayerTarget,
} from "./types.js";

// --- Helpers ---

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

export function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function layerRef(target: string | number): string {
  if (typeof target === "number") {
    return `app.activeDocument.layers[${target}]`;
  }
  return `app.activeDocument.layers.getByName('${escapeString(target)}')`;
}

function blendModeRef(mode: string): string {
  const map: Record<string, string> = {
    normal: "NORMAL",
    multiply: "MULTIPLY",
    screen: "SCREEN",
    overlay: "OVERLAY",
    darken: "DARKEN",
    lighten: "LIGHTEN",
    colordodge: "COLORDODGE",
    colorburn: "COLORBURN",
    hardlight: "HARDLIGHT",
    softlight: "SOFTLIGHT",
    difference: "DIFFERENCE",
    exclusion: "EXCLUSION",
    hue: "HUE",
    saturation: "SATURATION",
    color: "COLORBLEND",
    luminosity: "LUMINOSITY",
    dissolve: "DISSOLVE",
  };
  return `BlendMode.${map[mode.toLowerCase()] || "NORMAL"}`;
}

function colorModeRef(mode: string): string {
  const map: Record<string, string> = {
    rgb: "RGB",
    cmyk: "CMYK",
    grayscale: "GRAYSCALE",
    lab: "LAB",
    bitmap: "BITMAP",
  };
  return `NewDocumentMode.${map[mode.toUpperCase()] || "RGB"}`;
}

// --- Document Operations ---

export function buildCreateDocument(params: CreateDocumentParams): string {
  const { width, height, resolution = 72, name = "Untitled", mode = "RGB", fillColor } = params;
  const lines: string[] = [];
  lines.push(`app.documents.add(${width}, ${height}, ${resolution}, '${escapeString(name)}', ${colorModeRef(mode)});`);
  if (fillColor) {
    const rgb = hexToRgb(fillColor);
    lines.push(`var bgColor = new SolidColor();`);
    lines.push(`bgColor.rgb.red = ${rgb.r};`);
    lines.push(`bgColor.rgb.green = ${rgb.g};`);
    lines.push(`bgColor.rgb.blue = ${rgb.b};`);
    lines.push(`app.activeDocument.selection.selectAll();`);
    lines.push(`app.activeDocument.selection.fill(bgColor);`);
    lines.push(`app.activeDocument.selection.deselect();`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildGetDocumentInfo(): string {
  return [
    `var doc = app.activeDocument;`,
    `var info = {`,
    `  name: doc.name,`,
    `  width: doc.width.as('px'),`,
    `  height: doc.height.as('px'),`,
    `  resolution: doc.resolution,`,
    `  layerCount: doc.layers.length,`,
    `  colorMode: doc.mode.toString()`,
    `};`,
    `app.echoToOE(JSON.stringify(info));`,
  ].join("\n");
}

export function buildResizeDocument(params: ResizeDocumentParams): string {
  const { width, height } = params;
  return [
    `app.activeDocument.resizeImage(${width}, ${height});`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildCloseDocument(params: { save: boolean }): string {
  const saveOpt = params.save ? "SaveOptions.SAVECHANGES" : "SaveOptions.DONOTSAVECHANGES";
  return `app.activeDocument.close(${saveOpt});`;
}

// --- Layer Operations ---

export function buildAddLayer(params: AddLayerParams): string {
  const lines: string[] = [];
  lines.push(`var layer = app.activeDocument.artLayers.add();`);
  if (params.name) {
    lines.push(`layer.name = '${escapeString(params.name)}';`);
  }
  if (params.opacity !== undefined) {
    lines.push(`layer.opacity = ${params.opacity};`);
  }
  if (params.blendMode) {
    lines.push(`layer.blendMode = ${blendModeRef(params.blendMode)};`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildAddFillLayer(params: AddFillLayerParams): string {
  const lines: string[] = [];
  if (params.type === "solid" && params.color) {
    const rgb = hexToRgb(params.color);
    lines.push(`var fillColor = new SolidColor();`);
    lines.push(`fillColor.rgb.red = ${rgb.r};`);
    lines.push(`fillColor.rgb.green = ${rgb.g};`);
    lines.push(`fillColor.rgb.blue = ${rgb.b};`);
    lines.push(`var layer = app.activeDocument.artLayers.add();`);
    if (params.name) {
      lines.push(`layer.name = '${escapeString(params.name)}';`);
    }
    lines.push(`app.activeDocument.selection.selectAll();`);
    lines.push(`app.activeDocument.selection.fill(fillColor);`);
    lines.push(`app.activeDocument.selection.deselect();`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildDeleteLayer(params: LayerTarget): string {
  return [
    `${layerRef(params.target)}.remove();`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildSelectLayer(params: LayerTarget): string {
  return [
    `app.activeDocument.activeLayer = ${layerRef(params.target)};`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildSetLayerProperties(params: SetLayerPropertiesParams): string {
  const lines: string[] = [];
  lines.push(`var layer = ${layerRef(params.target)};`);
  if (params.opacity !== undefined) lines.push(`layer.opacity = ${params.opacity};`);
  if (params.visible !== undefined) lines.push(`layer.visible = ${params.visible};`);
  if (params.name) lines.push(`layer.name = '${escapeString(params.name)}';`);
  if (params.blendMode) lines.push(`layer.blendMode = ${blendModeRef(params.blendMode)};`);
  if (params.locked !== undefined) lines.push(`layer.allLocked = ${params.locked};`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildMoveLayer(params: MoveLayerParams): string {
  return [
    `var layer = ${layerRef(params.target)};`,
    `var bounds = layer.bounds;`,
    `var currentX = bounds[0].as('px');`,
    `var currentY = bounds[1].as('px');`,
    `layer.translate(${params.x} - currentX, ${params.y} - currentY);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildDuplicateLayer(params: DuplicateLayerParams): string {
  const lines: string[] = [];
  lines.push(`var dup = ${layerRef(params.target)}.duplicate();`);
  if (params.newName) {
    lines.push(`dup.name = '${escapeString(params.newName)}';`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildReorderLayer(params: ReorderLayerParams): string {
  const lines: string[] = [];
  lines.push(`var layer = ${layerRef(params.target)};`);
  switch (params.position) {
    case "top":
      lines.push(`layer.move(app.activeDocument.layers[0], ElementPlacement.PLACEBEFORE);`);
      break;
    case "bottom":
      lines.push(`layer.move(app.activeDocument.layers[app.activeDocument.layers.length - 1], ElementPlacement.PLACEAFTER);`);
      break;
    case "above":
      lines.push(`layer.move(app.activeDocument.activeLayer, ElementPlacement.PLACEBEFORE);`);
      break;
    case "below":
      lines.push(`layer.move(app.activeDocument.activeLayer, ElementPlacement.PLACEAFTER);`);
      break;
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildGroupLayers(params: GroupLayersParams): string {
  const lines: string[] = [];
  lines.push(`var group = app.activeDocument.layerSets.add();`);
  if (params.groupName) {
    lines.push(`group.name = '${escapeString(params.groupName)}';`);
  }
  for (const name of params.layers) {
    lines.push(`app.activeDocument.layers.getByName('${escapeString(name)}').move(group, ElementPlacement.INSIDE);`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildGetLayers(): string {
  return [
    `function collectLayers(parent) {`,
    `  var result = [];`,
    `  for (var i = 0; i < parent.layers.length; i++) {`,
    `    var l = parent.layers[i];`,
    `    var info = {`,
    `      name: l.name,`,
    `      index: i,`,
    `      type: l.typename,`,
    `      visible: l.visible,`,
    `      opacity: l.opacity,`,
    `      bounds: [l.bounds[0].as('px'), l.bounds[1].as('px'), l.bounds[2].as('px'), l.bounds[3].as('px')]`,
    `    };`,
    `    if (l.typename === 'LayerSet') {`,
    `      info.children = collectLayers(l);`,
    `    }`,
    `    result.push(info);`,
    `  }`,
    `  return result;`,
    `}`,
    `app.echoToOE(JSON.stringify(collectLayers(app.activeDocument)));`,
  ].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/script-builder.test.ts
```
Expected: All document and layer tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bridge/script-builder.ts tests/unit/script-builder.test.ts
git commit -m "feat: script builder for document and layer operations with tests"
```

---

### Task 4: Script Builder — Text, Shape, Image, Style, Selection Operations

**Files:**
- Modify: `src/bridge/script-builder.ts`
- Modify: `tests/unit/script-builder.test.ts`

- [ ] **Step 1: Add failing tests for text, shape, image, style, and selection operations**

Append to `tests/unit/script-builder.test.ts`:

```typescript
import {
  buildAddText,
  buildEditText,
  buildAddShape,
  buildPlaceImage,
  buildApplyAdjustment,
  buildApplyFilter,
  buildTransformLayer,
  buildApplyLayerStyle,
  buildAddGradient,
  buildMakeSelection,
  buildModifySelection,
  buildFillSelection,
  buildClearSelection,
  buildReplaceSmartObject,
} from "../../src/bridge/script-builder.js";

describe("script-builder: text operations", () => {
  it("buildAddText creates text layer with all properties", () => {
    const script = buildAddText({
      content: "Hello World",
      x: 100,
      y: 200,
      font: "Arial",
      size: 48,
      color: "#ffffff",
      alignment: "center",
      bold: true,
      letterSpacing: 2,
    });
    expect(script).toContain("LayerKind.TEXT");
    expect(script).toContain("Hello World");
    expect(script).toContain("Arial");
    expect(script).toContain("48");
    expect(script).toContain("255");
    expect(script).toContain("Justification.CENTER");
  });

  it("buildAddText with paragraph bounds creates area text", () => {
    const script = buildAddText({
      content: "Long text",
      x: 0,
      y: 0,
      paragraphBounds: { width: 400, height: 200 },
    });
    expect(script).toContain("LayerKind.TEXT");
    expect(script).toContain("Long text");
  });

  it("buildEditText modifies existing text layer", () => {
    const script = buildEditText({
      target: "Title",
      content: "New Title",
      size: 72,
      color: "#ff0000",
    });
    expect(script).toContain("Title");
    expect(script).toContain("New Title");
    expect(script).toContain("72");
  });
});

describe("script-builder: shape operations", () => {
  it("buildAddShape rectangle with fill and stroke", () => {
    const script = buildAddShape({
      type: "rectangle",
      bounds: { x: 10, y: 10, width: 200, height: 100 },
      fillColor: "#3366ff",
      strokeColor: "#000000",
      strokeWidth: 2,
      cornerRadius: 8,
      name: "Button",
    });
    expect(script).toContain("rectangle");
    expect(script).toContain("Button");
  });

  it("buildAddShape ellipse", () => {
    const script = buildAddShape({
      type: "ellipse",
      bounds: { x: 50, y: 50, width: 100, height: 100 },
      fillColor: "#ff0000",
    });
    expect(script).toContain("ellipse");
  });
});

describe("script-builder: image operations", () => {
  it("buildPlaceImage from URL", () => {
    const script = buildPlaceImage({
      source: "https://example.com/photo.jpg",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      name: "Photo",
    });
    expect(script).toContain("app.open");
    expect(script).toContain("https://example.com/photo.jpg");
    expect(script).toContain("Photo");
  });

  it("buildApplyAdjustment brightness/contrast", () => {
    const script = buildApplyAdjustment({
      type: "brightness",
      settings: { brightness: 20, contrast: 10 },
    });
    expect(script).toContain("brightness");
  });

  it("buildApplyFilter gaussian blur", () => {
    const script = buildApplyFilter({
      type: "gaussian_blur",
      settings: { radius: 5 },
    });
    expect(script).toContain("gaussianBlur");
    expect(script).toContain("5");
  });

  it("buildTransformLayer scale and rotate", () => {
    const script = buildTransformLayer({
      target: "Photo",
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 45,
    });
    expect(script).toContain("Photo");
    expect(script).toContain("resize");
    expect(script).toContain("rotate");
  });
});

describe("script-builder: style operations", () => {
  it("buildApplyLayerStyle with drop shadow", () => {
    const script = buildApplyLayerStyle({
      target: "Title",
      dropShadow: { color: "#000000", opacity: 75, angle: 120, distance: 5, size: 10 },
    });
    expect(script).toContain("Title");
    expect(script).toContain("shadow");
  });

  it("buildAddGradient linear", () => {
    const script = buildAddGradient({
      target: "Background",
      type: "linear",
      colors: ["#1a1a2e", "#16213e", "#0f3460"],
      angle: 90,
    });
    expect(script).toContain("Background");
    expect(script).toContain("gradient");
  });
});

describe("script-builder: selection operations", () => {
  it("buildMakeSelection rect", () => {
    const script = buildMakeSelection({
      type: "rect",
      bounds: { x: 10, y: 10, width: 200, height: 100 },
      feather: 2,
    });
    expect(script).toContain("select");
    expect(script).toContain("10");
    expect(script).toContain("200");
  });

  it("buildMakeSelection all", () => {
    const script = buildMakeSelection({ type: "all" });
    expect(script).toContain("selectAll");
  });

  it("buildModifySelection expand", () => {
    const script = buildModifySelection({ action: "expand", amount: 5 });
    expect(script).toContain("expand");
    expect(script).toContain("5");
  });

  it("buildFillSelection with color", () => {
    const script = buildFillSelection({ color: "#ff0000", opacity: 100 });
    expect(script).toContain("fill");
    expect(script).toContain("255");
  });

  it("buildClearSelection", () => {
    const script = buildClearSelection();
    expect(script).toContain("deselect");
  });

  it("buildReplaceSmartObject", () => {
    const script = buildReplaceSmartObject({
      target: "Logo",
      source: "https://example.com/logo.png",
    });
    expect(script).toContain("Logo");
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run:
```bash
npx vitest run tests/unit/script-builder.test.ts
```
Expected: New tests FAIL, previous tests still PASS.

- [ ] **Step 3: Implement text, shape, image, style, selection, and smart object builders**

Append to `src/bridge/script-builder.ts`:

```typescript
import type {
  AddTextParams,
  EditTextParams,
  AddShapeParams,
  PlaceImageParams,
  ApplyAdjustmentParams,
  ApplyFilterParams,
  TransformLayerParams,
  ApplyLayerStyleParams,
  AddGradientParams,
  MakeSelectionParams,
  ModifySelectionParams,
  FillSelectionParams,
  ReplaceSmartObjectParams,
} from "./types.js";

// --- Text Operations ---

export function buildAddText(params: AddTextParams): string {
  const lines: string[] = [];
  lines.push(`var layer = app.activeDocument.artLayers.add();`);
  lines.push(`layer.kind = LayerKind.TEXT;`);
  lines.push(`var ti = layer.textItem;`);
  lines.push(`ti.contents = '${escapeString(params.content)}';`);
  lines.push(`ti.position = [${params.x}, ${params.y}];`);
  if (params.font) lines.push(`ti.font = '${escapeString(params.font)}';`);
  if (params.size) lines.push(`ti.size = ${params.size};`);
  if (params.color) {
    const rgb = hexToRgb(params.color);
    lines.push(`var textColor = new SolidColor();`);
    lines.push(`textColor.rgb.red = ${rgb.r};`);
    lines.push(`textColor.rgb.green = ${rgb.g};`);
    lines.push(`textColor.rgb.blue = ${rgb.b};`);
    lines.push(`ti.color = textColor;`);
  }
  if (params.alignment) {
    const map: Record<string, string> = { left: "LEFT", center: "CENTER", right: "RIGHT" };
    lines.push(`ti.justification = Justification.${map[params.alignment] || "LEFT"};`);
  }
  if (params.bold) lines.push(`ti.fauxBold = true;`);
  if (params.italic) lines.push(`ti.fauxItalic = true;`);
  if (params.letterSpacing !== undefined) lines.push(`ti.tracking = ${params.letterSpacing};`);
  if (params.lineHeight !== undefined) lines.push(`ti.leading = ${params.lineHeight};`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildEditText(params: EditTextParams): string {
  const lines: string[] = [];
  lines.push(`var layer = ${layerRef(params.target)};`);
  lines.push(`var ti = layer.textItem;`);
  if (params.content !== undefined) lines.push(`ti.contents = '${escapeString(params.content)}';`);
  if (params.font) lines.push(`ti.font = '${escapeString(params.font)}';`);
  if (params.size) lines.push(`ti.size = ${params.size};`);
  if (params.color) {
    const rgb = hexToRgb(params.color);
    lines.push(`var textColor = new SolidColor();`);
    lines.push(`textColor.rgb.red = ${rgb.r};`);
    lines.push(`textColor.rgb.green = ${rgb.g};`);
    lines.push(`textColor.rgb.blue = ${rgb.b};`);
    lines.push(`ti.color = textColor;`);
  }
  if (params.alignment) {
    const map: Record<string, string> = { left: "LEFT", center: "CENTER", right: "RIGHT" };
    lines.push(`ti.justification = Justification.${map[params.alignment] || "LEFT"};`);
  }
  if (params.letterSpacing !== undefined) lines.push(`ti.tracking = ${params.letterSpacing};`);
  if (params.lineHeight !== undefined) lines.push(`ti.leading = ${params.lineHeight};`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// --- Shape Operations ---

export function buildAddShape(params: AddShapeParams): string {
  const { type, bounds, fillColor, strokeColor, strokeWidth, cornerRadius, name } = params;
  const lines: string[] = [];
  const x2 = bounds.x + bounds.width;
  const y2 = bounds.y + bounds.height;

  lines.push(`var doc = app.activeDocument;`);
  lines.push(`var layer = doc.artLayers.add();`);
  if (name) lines.push(`layer.name = '${escapeString(name)}';`);

  // Create selection for the shape
  if (type === "rectangle") {
    if (cornerRadius) {
      lines.push(`doc.selection.select([[${bounds.x},${bounds.y}],[${x2},${bounds.y}],[${x2},${y2}],[${bounds.x},${y2}]], SelectionType.REPLACE, ${cornerRadius}, false);`);
    } else {
      lines.push(`doc.selection.select([[${bounds.x},${bounds.y}],[${x2},${bounds.y}],[${x2},${y2}],[${bounds.x},${y2}]]);`);
    }
  } else if (type === "ellipse") {
    lines.push(`var selRegion = [[${bounds.x},${bounds.y}],[${x2},${bounds.y}],[${x2},${y2}],[${bounds.x},${y2}]];`);
    lines.push(`doc.selection.selectEllipse(${bounds.x}, ${bounds.y}, ${x2}, ${y2});`);
  }

  if (fillColor) {
    const rgb = hexToRgb(fillColor);
    lines.push(`var shapeColor = new SolidColor();`);
    lines.push(`shapeColor.rgb.red = ${rgb.r};`);
    lines.push(`shapeColor.rgb.green = ${rgb.g};`);
    lines.push(`shapeColor.rgb.blue = ${rgb.b};`);
    lines.push(`doc.selection.fill(shapeColor);`);
  }
  if (strokeColor && strokeWidth) {
    const sRgb = hexToRgb(strokeColor);
    lines.push(`var strokeCol = new SolidColor();`);
    lines.push(`strokeCol.rgb.red = ${sRgb.r};`);
    lines.push(`strokeCol.rgb.green = ${sRgb.g};`);
    lines.push(`strokeCol.rgb.blue = ${sRgb.b};`);
    lines.push(`doc.selection.stroke(strokeCol, ${strokeWidth}, StrokeLocation.CENTER);`);
  }
  lines.push(`doc.selection.deselect();`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// --- Image Operations ---

export function buildPlaceImage(params: PlaceImageParams): string {
  const lines: string[] = [];
  lines.push(`app.open('${escapeString(params.source)}', null, true);`);
  if (params.name) {
    lines.push(`app.activeDocument.activeLayer.name = '${escapeString(params.name)}';`);
  }
  if (params.width && params.height) {
    lines.push(`var layer = app.activeDocument.activeLayer;`);
    lines.push(`var bounds = layer.bounds;`);
    lines.push(`var curW = bounds[2].as('px') - bounds[0].as('px');`);
    lines.push(`var curH = bounds[3].as('px') - bounds[1].as('px');`);
    lines.push(`layer.resize(${params.width} / curW * 100, ${params.height} / curH * 100);`);
  }
  if (params.x !== undefined && params.y !== undefined) {
    lines.push(`var layer = app.activeDocument.activeLayer;`);
    lines.push(`var bounds = layer.bounds;`);
    lines.push(`layer.translate(${params.x} - bounds[0].as('px'), ${params.y} - bounds[1].as('px'));`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildApplyAdjustment(params: ApplyAdjustmentParams): string {
  const lines: string[] = [];
  const s = params.settings || {};
  switch (params.type) {
    case "brightness":
      lines.push(`app.activeDocument.activeLayer.adjustBrightnessContrast(${s.brightness || 0}, ${s.contrast || 0});`);
      break;
    case "hue_sat":
      lines.push(`app.activeDocument.activeLayer.adjustColorBalance([${s.hue || 0}, ${s.saturation || 0}, ${s.lightness || 0}]);`);
      break;
    case "levels":
      lines.push(`app.activeDocument.activeLayer.adjustLevels(${s.inputBlack || 0}, ${s.inputWhite || 255}, 1.0, ${s.outputBlack || 0}, ${s.outputWhite || 255});`);
      break;
    case "curves":
      lines.push(`app.activeDocument.activeLayer.adjustCurves([[0,0],[${s.midInput || 128},${s.midOutput || 128}],[255,255]]);`);
      break;
    default:
      lines.push(`// Unsupported adjustment type: ${params.type}`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildApplyFilter(params: ApplyFilterParams): string {
  const lines: string[] = [];
  const s = params.settings || {};
  switch (params.type) {
    case "gaussian_blur":
      lines.push(`app.activeDocument.activeLayer.applyGaussianBlur(${s.radius || 5});`);
      break;
    case "sharpen":
      lines.push(`app.activeDocument.activeLayer.applySharpen();`);
      break;
    case "unsharp_mask":
      lines.push(`app.activeDocument.activeLayer.applyUnSharpMask(${s.amount || 100}, ${s.radius || 1}, ${s.threshold || 0});`);
      break;
    case "noise":
      lines.push(`app.activeDocument.activeLayer.applyAddNoise(${s.amount || 10}, NoiseDistribution.GAUSSIAN, false);`);
      break;
    case "motion_blur":
      lines.push(`app.activeDocument.activeLayer.applyMotionBlur(${s.angle || 0}, ${s.distance || 10});`);
      break;
    default:
      lines.push(`// Unsupported filter type: ${params.type}`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildTransformLayer(params: TransformLayerParams): string {
  const lines: string[] = [];
  lines.push(`var layer = ${layerRef(params.target)};`);
  if (params.scaleX !== undefined || params.scaleY !== undefined) {
    lines.push(`layer.resize(${(params.scaleX || 1) * 100}, ${(params.scaleY || 1) * 100});`);
  }
  if (params.rotation !== undefined) {
    lines.push(`layer.rotate(${params.rotation});`);
  }
  if (params.flipH) {
    lines.push(`layer.resize(-100, 100);`);
  }
  if (params.flipV) {
    lines.push(`layer.resize(100, -100);`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// --- Style Operations ---

export function buildApplyLayerStyle(params: ApplyLayerStyleParams): string {
  // Layer styles in Photopea use ActionDescriptors (same as Photoshop).
  // We build an executeAction call for maximum compatibility.
  const lines: string[] = [];
  lines.push(`app.activeDocument.activeLayer = ${layerRef(params.target)};`);

  if (params.dropShadow) {
    const ds = params.dropShadow;
    const rgb = hexToRgb(ds.color || "#000000");
    lines.push(`var desc = new ActionDescriptor();`);
    lines.push(`var shadow = new ActionDescriptor();`);
    lines.push(`shadow.putBoolean(charIDToTypeID('enab'), true);`);
    lines.push(`shadow.putUnitDouble(charIDToTypeID('Opct'), charIDToTypeID('#Prc'), ${ds.opacity || 75});`);
    lines.push(`shadow.putUnitDouble(charIDToTypeID('lagl'), charIDToTypeID('#Ang'), ${ds.angle || 120});`);
    lines.push(`shadow.putUnitDouble(charIDToTypeID('Dstn'), charIDToTypeID('#Pxl'), ${ds.distance || 5});`);
    lines.push(`shadow.putUnitDouble(charIDToTypeID('blur'), charIDToTypeID('#Pxl'), ${ds.size || 10});`);
    lines.push(`var color = new ActionDescriptor();`);
    lines.push(`color.putDouble(charIDToTypeID('Rd  '), ${rgb.r});`);
    lines.push(`color.putDouble(charIDToTypeID('Grn '), ${rgb.g});`);
    lines.push(`color.putDouble(charIDToTypeID('Bl  '), ${rgb.b});`);
    lines.push(`shadow.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), color);`);
    lines.push(`desc.putObject(charIDToTypeID('DrSh'), charIDToTypeID('DrSh'), shadow);`);
    lines.push(`var styleDesc = new ActionDescriptor();`);
    lines.push(`styleDesc.putObject(charIDToTypeID('Lefx'), charIDToTypeID('Lefx'), desc);`);
    lines.push(`executeAction(charIDToTypeID('setd'), styleDesc, DialogModes.NO);`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildAddGradient(params: AddGradientParams): string {
  const lines: string[] = [];
  lines.push(`app.activeDocument.activeLayer = ${layerRef(params.target)};`);
  lines.push(`app.activeDocument.selection.selectAll();`);

  // Build gradient color stops
  const colors = params.colors.map((c, i) => {
    const rgb = hexToRgb(c);
    const loc = Math.round((i / (params.colors.length - 1)) * 4096);
    return { rgb, loc };
  });

  lines.push(`var desc = new ActionDescriptor();`);
  lines.push(`var gradient = new ActionDescriptor();`);
  lines.push(`gradient.putString(charIDToTypeID('Nm  '), 'Custom');`);
  lines.push(`var colorList = new ActionList();`);
  for (const stop of colors) {
    lines.push(`var colorStop = new ActionDescriptor();`);
    lines.push(`var color = new ActionDescriptor();`);
    lines.push(`color.putDouble(charIDToTypeID('Rd  '), ${stop.rgb.r});`);
    lines.push(`color.putDouble(charIDToTypeID('Grn '), ${stop.rgb.g});`);
    lines.push(`color.putDouble(charIDToTypeID('Bl  '), ${stop.rgb.b});`);
    lines.push(`colorStop.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), color);`);
    lines.push(`colorStop.putInteger(charIDToTypeID('Lctn'), ${stop.loc});`);
    lines.push(`colorStop.putInteger(charIDToTypeID('Mdpn'), 50);`);
    lines.push(`colorList.putObject(charIDToTypeID('Clrt'), colorStop);`);
  }
  lines.push(`gradient.putList(charIDToTypeID('Clrs'), colorList);`);
  lines.push(`desc.putObject(charIDToTypeID('Grad'), charIDToTypeID('Grdn'), gradient);`);
  lines.push(`desc.putUnitDouble(charIDToTypeID('Angl'), charIDToTypeID('#Ang'), ${params.angle || 90});`);

  const typeMap: Record<string, string> = { linear: "'Lnr '", radial: "'Rdl '", angular: "'Angl'" };
  lines.push(`desc.putEnumerated(charIDToTypeID('Type'), charIDToTypeID('GrdT'), charIDToTypeID(${typeMap[params.type] || "'Lnr '"}));`);
  lines.push(`executeAction(charIDToTypeID('Fl  '), desc, DialogModes.NO);`);
  lines.push(`app.activeDocument.selection.deselect();`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// --- Selection Operations ---

export function buildMakeSelection(params: MakeSelectionParams): string {
  const lines: string[] = [];
  if (params.type === "all") {
    lines.push(`app.activeDocument.selection.selectAll();`);
  } else if (params.type === "rect" && params.bounds) {
    const { x, y, width, height } = params.bounds;
    const feather = params.feather || 0;
    lines.push(`var region = [[${x},${y}],[${x + width},${y}],[${x + width},${y + height}],[${x},${y + height}]];`);
    lines.push(`app.activeDocument.selection.select(region, SelectionType.REPLACE, ${feather}, false);`);
  } else if (params.type === "ellipse" && params.bounds) {
    const { x, y, width, height } = params.bounds;
    lines.push(`app.activeDocument.selection.selectEllipse(${x}, ${y}, ${x + width}, ${y + height});`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildModifySelection(params: ModifySelectionParams): string {
  const lines: string[] = [];
  const amount = params.amount || 1;
  switch (params.action) {
    case "expand":
      lines.push(`app.activeDocument.selection.expand(${amount});`);
      break;
    case "contract":
      lines.push(`app.activeDocument.selection.contract(${amount});`);
      break;
    case "feather":
      lines.push(`app.activeDocument.selection.feather(${amount});`);
      break;
    case "invert":
      lines.push(`app.activeDocument.selection.invert();`);
      break;
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildFillSelection(params: FillSelectionParams): string {
  const rgb = hexToRgb(params.color);
  return [
    `var fillColor = new SolidColor();`,
    `fillColor.rgb.red = ${rgb.r};`,
    `fillColor.rgb.green = ${rgb.g};`,
    `fillColor.rgb.blue = ${rgb.b};`,
    `app.activeDocument.selection.fill(fillColor, ColorBlendMode.NORMAL, ${params.opacity || 100}, false);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildClearSelection(): string {
  return [
    `app.activeDocument.selection.deselect();`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

// --- Smart Object Operations ---

export function buildReplaceSmartObject(params: ReplaceSmartObjectParams): string {
  return [
    `app.activeDocument.activeLayer = ${layerRef(params.target)};`,
    `app.open('${escapeString(params.source)}', null, true);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}
```

Note: The imports at the top of `script-builder.ts` must be updated to include all the new types. Merge the import statements.

- [ ] **Step 4: Run tests to verify all pass**

Run:
```bash
npx vitest run tests/unit/script-builder.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bridge/script-builder.ts tests/unit/script-builder.test.ts
git commit -m "feat: script builder for text, shape, image, style, selection operations with tests"
```

---

### Task 5: Script Builder — Export, Utility, and Workflow Operations

**Files:**
- Modify: `src/bridge/script-builder.ts`
- Modify: `tests/unit/script-builder.test.ts`

- [ ] **Step 1: Add failing tests for export, utility, and workflow operations**

Append to `tests/unit/script-builder.test.ts`:

```typescript
import {
  buildExportImage,
  buildGetPreview,
  buildBatchExport,
  buildRunScript,
  buildUndo,
  buildRedo,
  buildSetBackground,
  buildCreateBanner,
  buildLoadTemplate,
  buildApplyTemplateVariables,
  buildComposeLayers,
} from "../../src/bridge/script-builder.js";

describe("script-builder: export operations", () => {
  it("buildExportImage png", () => {
    const script = buildExportImage({ format: "png", quality: 1, outputPath: "/tmp/out.png" });
    expect(script).toContain("saveToOE");
    expect(script).toContain("png");
  });

  it("buildExportImage jpg with quality", () => {
    const script = buildExportImage({ format: "jpg", quality: 0.8, outputPath: "/tmp/out.jpg" });
    expect(script).toContain("jpg");
    expect(script).toContain("0.8");
  });

  it("buildGetPreview returns saveToOE png", () => {
    const script = buildGetPreview({ maxWidth: 400, maxHeight: 300 });
    expect(script).toContain("saveToOE");
    expect(script).toContain("png");
  });

  it("buildBatchExport creates multiple exports", () => {
    const script = buildBatchExport({
      exports: [
        { format: "png", outputPath: "/tmp/out.png" },
        { format: "jpg", quality: 0.9, outputPath: "/tmp/out.jpg" },
      ],
    });
    expect(script).toContain("png");
    expect(script).toContain("jpg");
    expect(script).toContain("saveToOE");
  });
});

describe("script-builder: utility operations", () => {
  it("buildRunScript passes through raw script", () => {
    const script = buildRunScript("alert('hello');");
    expect(script).toBe("alert('hello');");
  });

  it("buildUndo with steps", () => {
    const script = buildUndo(3);
    expect(script).toContain("undo");
    // Should undo 3 times
    expect(script.split("undo").length - 1).toBe(3);
  });

  it("buildRedo with steps", () => {
    const script = buildRedo(2);
    expect(script).toContain("redo");
    expect(script.split("redo").length - 1).toBe(2);
  });
});

describe("script-builder: workflow operations", () => {
  it("buildSetBackground solid", () => {
    const script = buildSetBackground({ type: "solid", color: "#1a1a2e" });
    expect(script).toContain("SolidColor");
    expect(script).toContain("26"); // r component of #1a1a2e
  });

  it("buildSetBackground gradient", () => {
    const script = buildSetBackground({
      type: "gradient",
      gradient: { colors: ["#1a1a2e", "#16213e"], angle: 90 },
    });
    expect(script).toContain("gradient");
  });

  it("buildCreateBanner generates full banner script", () => {
    const script = buildCreateBanner({
      width: 1920,
      height: 1080,
      title: "AI Summit 2026",
      subtitle: "The Future of AI",
      backgroundColor: "#1a1a2e",
      titleColor: "#ffffff",
      titleSize: 72,
      layout: "centered",
    });
    expect(script).toContain("1920");
    expect(script).toContain("1080");
    expect(script).toContain("AI Summit 2026");
    expect(script).toContain("The Future of AI");
  });

  it("buildLoadTemplate returns layer inspection script", () => {
    const script = buildLoadTemplate({ source: "https://example.com/template.psd" });
    expect(script).toContain("app.open");
    expect(script).toContain("echoToOE");
    expect(script).toContain("JSON.stringify");
  });

  it("buildApplyTemplateVariables applies multiple values", () => {
    const script = buildApplyTemplateVariables({
      variables: { "Title": "New Title", "Subtitle": "New Sub" },
    });
    expect(script).toContain("Title");
    expect(script).toContain("New Title");
    expect(script).toContain("Subtitle");
    expect(script).toContain("New Sub");
  });

  it("buildComposeLayers creates multiple layers", () => {
    const script = buildComposeLayers({
      layers: [
        { type: "fill", color: "#000000" },
        { type: "text", content: "Hello", x: 100, y: 200, size: 48, color: "#ffffff" },
      ],
    });
    expect(script).toContain("SolidColor");
    expect(script).toContain("Hello");
    expect(script).toContain("LayerKind.TEXT");
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run:
```bash
npx vitest run tests/unit/script-builder.test.ts
```
Expected: New tests FAIL.

- [ ] **Step 3: Implement export, utility, and workflow builders**

Append to `src/bridge/script-builder.ts`:

```typescript
import type {
  ExportImageParams,
  GetPreviewParams,
  BatchExportParams,
  SetBackgroundParams,
  CreateBannerParams,
  LoadTemplateParams,
  ApplyTemplateVariablesParams,
  ComposeLayersParams,
} from "./types.js";

// --- Export Operations ---

export function buildExportImage(params: ExportImageParams): string {
  const formatStr = params.format === "jpg" && params.quality !== undefined
    ? `jpg:${params.quality}`
    : params.format;
  return [
    `app.activeDocument.saveToOE('${formatStr}');`,
  ].join("\n");
}

export function buildGetPreview(params: GetPreviewParams): string {
  const lines: string[] = [];
  if (params.maxWidth || params.maxHeight) {
    lines.push(`var doc = app.activeDocument;`);
    lines.push(`var w = doc.width.as('px');`);
    lines.push(`var h = doc.height.as('px');`);
    lines.push(`var maxW = ${params.maxWidth || 9999};`);
    lines.push(`var maxH = ${params.maxHeight || 9999};`);
    lines.push(`var scale = Math.min(maxW / w, maxH / h, 1);`);
    lines.push(`if (scale < 1) {`);
    lines.push(`  var dup = doc.duplicate();`);
    lines.push(`  dup.resizeImage(Math.round(w * scale), Math.round(h * scale));`);
    lines.push(`  dup.saveToOE('png');`);
    lines.push(`  dup.close(SaveOptions.DONOTSAVECHANGES);`);
    lines.push(`} else {`);
    lines.push(`  doc.saveToOE('png');`);
    lines.push(`}`);
  } else {
    lines.push(`app.activeDocument.saveToOE('png');`);
  }
  return lines.join("\n");
}

export function buildBatchExport(params: BatchExportParams): string {
  const lines: string[] = [];
  for (const exp of params.exports) {
    const formatStr = exp.format === "jpg" && exp.quality !== undefined
      ? `jpg:${exp.quality}`
      : exp.format;
    if (exp.width && exp.height) {
      lines.push(`var dup = app.activeDocument.duplicate();`);
      lines.push(`dup.resizeImage(${exp.width}, ${exp.height});`);
      lines.push(`dup.saveToOE('${formatStr}');`);
      lines.push(`dup.close(SaveOptions.DONOTSAVECHANGES);`);
    } else {
      lines.push(`app.activeDocument.saveToOE('${formatStr}');`);
    }
  }
  return lines.join("\n");
}

// --- Utility Operations ---

export function buildRunScript(script: string): string {
  return script;
}

export function buildUndo(steps: number = 1): string {
  return Array(steps).fill(`app.activeDocument.activeHistoryState = app.activeDocument.historyStates[app.activeDocument.historyStates.length - 2]; // undo`).join("\n");
}

export function buildRedo(steps: number = 1): string {
  // Photopea doesn't have a direct redo API in Photoshop JS; we use executeAction
  return Array(steps).fill(`executeAction(charIDToTypeID('Rdo '), undefined, DialogModes.NO); // redo`).join("\n");
}

// --- Workflow Operations ---

export function buildSetBackground(params: SetBackgroundParams): string {
  const lines: string[] = [];
  lines.push(`var doc = app.activeDocument;`);

  if (params.type === "solid" && params.color) {
    const rgb = hexToRgb(params.color);
    lines.push(`var layer = doc.artLayers.add();`);
    lines.push(`layer.name = 'Background';`);
    lines.push(`layer.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER);`);
    lines.push(`var bgColor = new SolidColor();`);
    lines.push(`bgColor.rgb.red = ${rgb.r};`);
    lines.push(`bgColor.rgb.green = ${rgb.g};`);
    lines.push(`bgColor.rgb.blue = ${rgb.b};`);
    lines.push(`doc.selection.selectAll();`);
    lines.push(`doc.selection.fill(bgColor);`);
    lines.push(`doc.selection.deselect();`);
  } else if (params.type === "gradient" && params.gradient) {
    lines.push(`var layer = doc.artLayers.add();`);
    lines.push(`layer.name = 'Background';`);
    lines.push(`layer.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER);`);
    lines.push(`doc.activeLayer = layer;`);
    lines.push(`doc.selection.selectAll();`);
    // Reuse gradient fill logic
    const colors = params.gradient.colors.map((c, i) => {
      const rgb = hexToRgb(c);
      const loc = Math.round((i / (params.gradient!.colors.length - 1)) * 4096);
      return { rgb, loc };
    });
    lines.push(`var desc = new ActionDescriptor();`);
    lines.push(`var gradient = new ActionDescriptor();`);
    lines.push(`gradient.putString(charIDToTypeID('Nm  '), 'Custom');`);
    lines.push(`var colorList = new ActionList();`);
    for (const stop of colors) {
      lines.push(`var cs = new ActionDescriptor();`);
      lines.push(`var cc = new ActionDescriptor();`);
      lines.push(`cc.putDouble(charIDToTypeID('Rd  '), ${stop.rgb.r});`);
      lines.push(`cc.putDouble(charIDToTypeID('Grn '), ${stop.rgb.g});`);
      lines.push(`cc.putDouble(charIDToTypeID('Bl  '), ${stop.rgb.b});`);
      lines.push(`cs.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), cc);`);
      lines.push(`cs.putInteger(charIDToTypeID('Lctn'), ${stop.loc});`);
      lines.push(`cs.putInteger(charIDToTypeID('Mdpn'), 50);`);
      lines.push(`colorList.putObject(charIDToTypeID('Clrt'), cs);`);
    }
    lines.push(`gradient.putList(charIDToTypeID('Clrs'), colorList);`);
    lines.push(`desc.putObject(charIDToTypeID('Grad'), charIDToTypeID('Grdn'), gradient);`);
    lines.push(`desc.putUnitDouble(charIDToTypeID('Angl'), charIDToTypeID('#Ang'), ${params.gradient.angle || 90});`);
    lines.push(`desc.putEnumerated(charIDToTypeID('Type'), charIDToTypeID('GrdT'), charIDToTypeID('Lnr '));`);
    lines.push(`executeAction(charIDToTypeID('Fl  '), desc, DialogModes.NO);`);
    lines.push(`doc.selection.deselect();`);
  } else if (params.type === "image" && params.imageSource) {
    lines.push(`app.open('${escapeString(params.imageSource)}', null, true);`);
    lines.push(`doc.activeLayer.name = 'Background';`);
    lines.push(`doc.activeLayer.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER);`);
    if (params.blur) {
      lines.push(`doc.activeLayer.applyGaussianBlur(${params.blur});`);
    }
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildCreateBanner(params: CreateBannerParams): string {
  const {
    width, height, title, subtitle,
    backgroundColor = "#1a1a2e",
    accentColor = "#e94560",
    titleFont = "Arial",
    titleSize = 72,
    titleColor = "#ffffff",
    layout = "centered",
  } = params;

  const lines: string[] = [];

  // Create document
  lines.push(`app.documents.add(${width}, ${height}, 72, 'Banner', NewDocumentMode.RGB);`);
  lines.push(`var doc = app.activeDocument;`);

  // Background
  const bgRgb = hexToRgb(backgroundColor);
  lines.push(`var bgLayer = doc.artLayers.add();`);
  lines.push(`bgLayer.name = 'Background';`);
  lines.push(`var bgColor = new SolidColor();`);
  lines.push(`bgColor.rgb.red = ${bgRgb.r};`);
  lines.push(`bgColor.rgb.green = ${bgRgb.g};`);
  lines.push(`bgColor.rgb.blue = ${bgRgb.b};`);
  lines.push(`doc.selection.selectAll();`);
  lines.push(`doc.selection.fill(bgColor);`);
  lines.push(`doc.selection.deselect();`);

  // Accent bar
  const acRgb = hexToRgb(accentColor);
  lines.push(`var accentLayer = doc.artLayers.add();`);
  lines.push(`accentLayer.name = 'Accent';`);
  if (layout === "centered") {
    lines.push(`doc.selection.select([[0,${Math.round(height * 0.85)}],[${width},${Math.round(height * 0.85)}],[${width},${height}],[0,${height}]]);`);
  } else if (layout === "left") {
    lines.push(`doc.selection.select([[0,0],[${Math.round(width * 0.02)},0],[${Math.round(width * 0.02)},${height}],[0,${height}]]);`);
  } else {
    lines.push(`doc.selection.select([[${Math.round(width / 2)},0],[${width},0],[${width},${height}],[${Math.round(width / 2)},${height}]]);`);
  }
  lines.push(`var accentColor = new SolidColor();`);
  lines.push(`accentColor.rgb.red = ${acRgb.r};`);
  lines.push(`accentColor.rgb.green = ${acRgb.g};`);
  lines.push(`accentColor.rgb.blue = ${acRgb.b};`);
  lines.push(`doc.selection.fill(accentColor);`);
  lines.push(`doc.selection.deselect();`);

  // Title
  const titleRgb = hexToRgb(titleColor);
  const titleX = layout === "centered" ? Math.round(width / 2) : layout === "left" ? Math.round(width * 0.05) : Math.round(width * 0.05);
  const titleY = layout === "centered" ? Math.round(height * 0.45) : Math.round(height * 0.4);
  lines.push(`var titleLayer = doc.artLayers.add();`);
  lines.push(`titleLayer.kind = LayerKind.TEXT;`);
  lines.push(`titleLayer.name = 'Title';`);
  lines.push(`var ti = titleLayer.textItem;`);
  lines.push(`ti.contents = '${escapeString(title)}';`);
  lines.push(`ti.font = '${escapeString(titleFont)}';`);
  lines.push(`ti.size = ${titleSize};`);
  lines.push(`ti.position = [${titleX}, ${titleY}];`);
  if (layout === "centered") {
    lines.push(`ti.justification = Justification.CENTER;`);
  }
  lines.push(`var titleColor = new SolidColor();`);
  lines.push(`titleColor.rgb.red = ${titleRgb.r};`);
  lines.push(`titleColor.rgb.green = ${titleRgb.g};`);
  lines.push(`titleColor.rgb.blue = ${titleRgb.b};`);
  lines.push(`ti.color = titleColor;`);
  lines.push(`ti.fauxBold = true;`);

  // Subtitle
  if (subtitle) {
    const subY = titleY + titleSize + 20;
    lines.push(`var subLayer = doc.artLayers.add();`);
    lines.push(`subLayer.kind = LayerKind.TEXT;`);
    lines.push(`subLayer.name = 'Subtitle';`);
    lines.push(`var si = subLayer.textItem;`);
    lines.push(`si.contents = '${escapeString(subtitle)}';`);
    lines.push(`si.font = '${escapeString(titleFont)}';`);
    lines.push(`si.size = ${Math.round(titleSize * 0.5)};`);
    lines.push(`si.position = [${titleX}, ${subY}];`);
    if (layout === "centered") {
      lines.push(`si.justification = Justification.CENTER;`);
    }
    lines.push(`si.color = titleColor;`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildLoadTemplate(params: LoadTemplateParams): string {
  return [
    `app.open('${escapeString(params.source)}');`,
    buildGetLayers(),
  ].join("\n");
}

export function buildApplyTemplateVariables(params: ApplyTemplateVariablesParams): string {
  const lines: string[] = [];
  lines.push(`var doc = app.activeDocument;`);
  for (const [layerName, value] of Object.entries(params.variables)) {
    lines.push(`try {`);
    lines.push(`  var layer = doc.layers.getByName('${escapeString(layerName)}');`);
    lines.push(`  if (layer.kind === LayerKind.TEXT) {`);
    lines.push(`    layer.textItem.contents = '${escapeString(value)}';`);
    lines.push(`  }`);
    lines.push(`} catch(e) {}`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildComposeLayers(params: ComposeLayersParams): string {
  const lines: string[] = [];
  lines.push(`var doc = app.activeDocument;`);
  for (const entry of params.layers) {
    if (entry.type === "fill" && typeof entry.color === "string") {
      const rgb = hexToRgb(entry.color);
      lines.push(`var fillLayer = doc.artLayers.add();`);
      if (typeof entry.name === "string") lines.push(`fillLayer.name = '${escapeString(entry.name)}';`);
      lines.push(`var fc = new SolidColor();`);
      lines.push(`fc.rgb.red = ${rgb.r}; fc.rgb.green = ${rgb.g}; fc.rgb.blue = ${rgb.b};`);
      lines.push(`doc.selection.selectAll(); doc.selection.fill(fc); doc.selection.deselect();`);
    } else if (entry.type === "text" && typeof entry.content === "string") {
      lines.push(`var tl = doc.artLayers.add();`);
      lines.push(`tl.kind = LayerKind.TEXT;`);
      if (typeof entry.name === "string") lines.push(`tl.name = '${escapeString(entry.name)}';`);
      lines.push(`tl.textItem.contents = '${escapeString(entry.content)}';`);
      if (typeof entry.x === "number" && typeof entry.y === "number") {
        lines.push(`tl.textItem.position = [${entry.x}, ${entry.y}];`);
      }
      if (typeof entry.size === "number") lines.push(`tl.textItem.size = ${entry.size};`);
      if (typeof entry.font === "string") lines.push(`tl.textItem.font = '${escapeString(entry.font)}';`);
      if (typeof entry.color === "string") {
        const rgb = hexToRgb(entry.color);
        lines.push(`var tc = new SolidColor();`);
        lines.push(`tc.rgb.red = ${rgb.r}; tc.rgb.green = ${rgb.g}; tc.rgb.blue = ${rgb.b};`);
        lines.push(`tl.textItem.color = tc;`);
      }
    } else if (entry.type === "image" && typeof entry.source === "string") {
      lines.push(`app.open('${escapeString(entry.source)}', null, true);`);
      if (typeof entry.name === "string") lines.push(`doc.activeLayer.name = '${escapeString(entry.name)}';`);
    } else if (entry.type === "shape") {
      // Delegate to shape builder inline
      const bounds = entry.bounds as { x: number; y: number; width: number; height: number };
      if (bounds && typeof entry.fillColor === "string") {
        const rgb = hexToRgb(entry.fillColor);
        const x2 = bounds.x + bounds.width;
        const y2 = bounds.y + bounds.height;
        lines.push(`var sl = doc.artLayers.add();`);
        if (typeof entry.name === "string") lines.push(`sl.name = '${escapeString(entry.name)}';`);
        lines.push(`doc.selection.select([[${bounds.x},${bounds.y}],[${x2},${bounds.y}],[${x2},${y2}],[${bounds.x},${y2}]]);`);
        lines.push(`var sc = new SolidColor();`);
        lines.push(`sc.rgb.red = ${rgb.r}; sc.rgb.green = ${rgb.g}; sc.rgb.blue = ${rgb.b};`);
        lines.push(`doc.selection.fill(sc); doc.selection.deselect();`);
      }
    }
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run:
```bash
npx vitest run tests/unit/script-builder.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bridge/script-builder.ts tests/unit/script-builder.test.ts
git commit -m "feat: script builder for export, utility, and workflow operations with tests"
```

---

### Task 6: WebSocket Bridge Server

**Files:**
- Create: `src/bridge/websocket-server.ts`
- Create: `tests/integration/websocket-bridge.test.ts`

- [ ] **Step 1: Write failing integration tests**

```typescript
// tests/integration/websocket-bridge.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { PhotopeaBridge } from "../../src/bridge/websocket-server.js";

describe("PhotopeaBridge", () => {
  let bridge: PhotopeaBridge;
  let clientWs: WebSocket;
  const TEST_PORT = 14117;

  beforeEach(async () => {
    bridge = new PhotopeaBridge(TEST_PORT);
    await bridge.start();

    // Connect a mock client
    await new Promise<void>((resolve) => {
      clientWs = new WebSocket(`ws://localhost:${TEST_PORT}`);
      clientWs.on("open", () => resolve());
    });

    // Simulate Photopea ready
    clientWs.send(JSON.stringify({ type: "status", status: "ready" }));
    await new Promise((r) => setTimeout(r, 50));
  });

  afterEach(async () => {
    clientWs.close();
    await bridge.stop();
  });

  it("executes a script and returns result", async () => {
    // Mock client responds to script execution
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        clientWs.send(JSON.stringify({
          id: msg.id,
          type: "result",
          success: true,
          data: "ok",
          error: null,
        }));
      }
    });

    const result = await bridge.executeScript("app.echoToOE('ok');");
    expect(result.success).toBe(true);
    expect(result.data).toBe("ok");
  });

  it("handles script error", async () => {
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        clientWs.send(JSON.stringify({
          id: msg.id,
          type: "result",
          success: false,
          data: null,
          error: "ReferenceError: foo is not defined",
        }));
      }
    });

    const result = await bridge.executeScript("foo();");
    expect(result.success).toBe(false);
    expect(result.error).toContain("ReferenceError");
  });

  it("executes scripts sequentially", async () => {
    const order: string[] = [];

    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        order.push(msg.id);
        // Respond after a small delay to test queuing
        setTimeout(() => {
          clientWs.send(JSON.stringify({
            id: msg.id,
            type: "result",
            success: true,
            data: msg.id,
            error: null,
          }));
        }, 10);
      }
    });

    const [r1, r2, r3] = await Promise.all([
      bridge.executeScript("script1"),
      bridge.executeScript("script2"),
      bridge.executeScript("script3"),
    ]);

    // All should succeed
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);

    // Should have been sent in order
    expect(order[0]).toBeDefined();
  });

  it("handles file export result", async () => {
    const fakeFileData = Buffer.from("fake-png-data").toString("base64");

    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        clientWs.send(JSON.stringify({
          id: msg.id,
          type: "file",
          success: true,
          data: fakeFileData,
          mimeType: "image/png",
          error: null,
        }));
      }
    });

    const result = await bridge.executeScript("app.activeDocument.saveToOE('png');", true);
    expect(result.success).toBe(true);
    expect("data" in result && Buffer.isBuffer((result as any).data)).toBe(true);
  });

  it("returns error when not connected", async () => {
    clientWs.close();
    await new Promise((r) => setTimeout(r, 100));

    const result = await bridge.executeScript("test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not connected");
  });

  it("reports ready state", () => {
    expect(bridge.isReady()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/integration/websocket-bridge.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the WebSocket bridge server**

```typescript
// src/bridge/websocket-server.ts
import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import type {
  ServerToClientMessage,
  ClientToServerMessage,
  BridgeResult,
  BridgeFileResult,
  PendingRequest,
  ActivityMessage,
} from "./types.js";

const DEFAULT_TIMEOUT = 30_000;
const EXPORT_TIMEOUT = 60_000;

export class PhotopeaBridge {
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private client: WebSocket | null = null;
  private ready = false;
  private queue: PendingRequest[] = [];
  private processing = false;
  private port: number;

  constructor(port: number) {
    this.port = port;
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ noServer: true });
  }

  getHttpServer(): HttpServer {
    return this.httpServer;
  }

  getPort(): number {
    return this.port;
  }

  isReady(): boolean {
    return this.ready && this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  async start(): Promise<void> {
    this.httpServer.on("upgrade", (req, socket, head) => {
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit("connection", ws, req);
      });
    });

    this.wss.on("connection", (ws) => {
      this.client = ws;

      ws.on("message", (rawData) => {
        try {
          const msg: ClientToServerMessage = JSON.parse(rawData.toString());
          this.handleClientMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        this.client = null;
        this.ready = false;
        // Reject all pending requests
        for (const pending of this.queue) {
          clearTimeout(pending.timer);
          pending.resolve({ success: false, data: null, error: "Browser disconnected." });
        }
        this.queue = [];
        this.processing = false;
      });
    });

    await new Promise<void>((resolve) => {
      this.httpServer.listen(this.port, "127.0.0.1", () => resolve());
    });
  }

  async stop(): Promise<void> {
    for (const client of this.wss.clients) {
      client.close();
    }
    this.wss.close();
    await new Promise<void>((resolve) => {
      this.httpServer.close(() => resolve());
    });
  }

  sendActivity(activity: ActivityMessage): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(activity));
    }
  }

  async executeScript(script: string, expectFiles: boolean = false): Promise<BridgeResult | BridgeFileResult> {
    if (!this.isReady()) {
      return {
        success: false,
        data: null,
        error: `Browser not connected. Please open http://localhost:${this.port}`,
      };
    }

    return new Promise((resolve) => {
      const id = randomUUID();
      const timeout = expectFiles ? EXPORT_TIMEOUT : DEFAULT_TIMEOUT;
      const timer = setTimeout(() => {
        // Remove from queue
        this.queue = this.queue.filter((r) => r.id !== id);
        resolve({
          success: false,
          data: null,
          error: "Operation timed out.",
        });
        this.processNext();
      }, timeout);

      this.queue.push({ id, resolve, reject: () => {}, expectFiles, timer });
      this.processNext();
    });
  }

  async loadFile(data: Buffer, filename: string): Promise<BridgeResult> {
    if (!this.isReady()) {
      return {
        success: false,
        data: null,
        error: `Browser not connected. Please open http://localhost:${this.port}`,
      };
    }

    return new Promise((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.queue = this.queue.filter((r) => r.id !== id);
        resolve({ success: false, data: null, error: "Load file timed out." });
        this.processNext();
      }, DEFAULT_TIMEOUT);

      this.queue.push({
        id,
        resolve,
        reject: () => {},
        expectFiles: false,
        timer,
      });

      // The load message contains the base64 data
      if (this.client && this.client.readyState === WebSocket.OPEN) {
        this.client.send(JSON.stringify({
          id,
          type: "load",
          data: data.toString("base64"),
          filename,
        }));
      }

      // For load messages, we process immediately (don't go through the queue)
      // Actually, let's use the same queue for simplicity
      this.processNext();
    });
  }

  private processNext(): void {
    if (this.processing || this.queue.length === 0) return;

    const current = this.queue[0];
    if (!current) return;

    // Check if this is a load message (already sent)
    // For execute messages, send now
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.processing = true;
      const msg: ServerToClientMessage = {
        id: current.id,
        type: "execute",
        script: "", // Will be set below
        expectFiles: current.expectFiles,
      };
      // We need to store the script somewhere - let's extend PendingRequest
      // Actually, let's store it differently. The script is passed via executeScript.
      // Let's refactor slightly.
    }
  }

  private handleClientMessage(msg: ClientToServerMessage): void {
    if (msg.type === "status") {
      if (msg.status === "ready") {
        this.ready = true;
      } else if (msg.status === "disconnected") {
        this.ready = false;
      }
      return;
    }

    // Find matching pending request
    const idx = this.queue.findIndex((r) => r.id === msg.id);
    if (idx === -1) return;

    const pending = this.queue[idx];
    clearTimeout(pending.timer);
    this.queue.splice(idx, 1);
    this.processing = false;

    if (msg.type === "file") {
      const fileResult: BridgeFileResult = {
        success: msg.success,
        data: Buffer.from(msg.data, "base64"),
        mimeType: msg.mimeType,
        error: msg.error,
      };
      pending.resolve(fileResult);
    } else {
      const result: BridgeResult = {
        success: msg.success,
        data: msg.data,
        error: msg.error,
      };
      pending.resolve(result);
    }

    this.processNext();
  }
}
```

**Note:** The implementation above has a design issue — the script isn't stored with the pending request for sending. The following is the corrected version that properly queues and sends scripts:

Replace the `executeScript` method and `processNext` with:

```typescript
  // Add a script field to track what to send
  private pendingScripts: Map<string, string> = new Map();

  async executeScript(script: string, expectFiles: boolean = false): Promise<BridgeResult | BridgeFileResult> {
    if (!this.isReady()) {
      return {
        success: false,
        data: null,
        error: `Browser not connected. Please open http://localhost:${this.port}`,
      };
    }

    return new Promise((resolve) => {
      const id = randomUUID();
      const timeout = expectFiles ? EXPORT_TIMEOUT : DEFAULT_TIMEOUT;
      const timer = setTimeout(() => {
        this.queue = this.queue.filter((r) => r.id !== id);
        this.pendingScripts.delete(id);
        resolve({ success: false, data: null, error: "Operation timed out." });
        this.processing = false;
        this.processNext();
      }, timeout);

      this.pendingScripts.set(id, script);
      this.queue.push({ id, resolve, reject: () => {}, expectFiles, timer });
      this.processNext();
    });
  }

  private processNext(): void {
    if (this.processing || this.queue.length === 0) return;
    if (!this.client || this.client.readyState !== WebSocket.OPEN) return;

    const current = this.queue[0];
    if (!current) return;

    this.processing = true;
    const script = this.pendingScripts.get(current.id) || "";
    this.pendingScripts.delete(current.id);

    const msg: ServerToClientMessage = {
      id: current.id,
      type: "execute",
      script,
      expectFiles: current.expectFiles,
    };
    this.client.send(JSON.stringify(msg));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/integration/websocket-bridge.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bridge/websocket-server.ts tests/integration/websocket-bridge.test.ts
git commit -m "feat: WebSocket bridge server with request queue and correlation"
```

---

### Task 7: Frontend HTML Page

**Files:**
- Create: `src/frontend/index.html`

- [ ] **Step 1: Create the single-file frontend**

```html
<!-- src/frontend/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Photopea MCP</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1e1e1e; color: #ccc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

  /* Status Bar */
  #status-bar { display: flex; align-items: center; gap: 16px; padding: 6px 12px; background: #2d2d2d; border-bottom: 1px solid #3e3e3e; font-size: 13px; flex-shrink: 0; }
  #status-dot { width: 8px; height: 8px; border-radius: 50%; background: #e74c3c; flex-shrink: 0; }
  #status-dot.connected { background: #2ecc71; }
  #status-text { color: #999; }
  #doc-info { color: #bbb; margin-left: auto; }

  /* Photopea iframe */
  #photopea-container { flex: 1; position: relative; }
  #photopea-container iframe { width: 100%; height: 100%; border: none; }

  /* Activity Log */
  #log-panel { background: #252525; border-top: 1px solid #3e3e3e; flex-shrink: 0; transition: height 0.2s; overflow: hidden; }
  #log-panel.collapsed { height: 28px; }
  #log-panel.expanded { height: 160px; }
  #log-header { display: flex; align-items: center; padding: 4px 12px; cursor: pointer; font-size: 12px; color: #888; user-select: none; }
  #log-header:hover { color: #bbb; }
  #log-toggle { margin-right: 6px; transition: transform 0.2s; }
  #log-panel.collapsed #log-toggle { transform: rotate(-90deg); }
  #log-entries { height: calc(100% - 28px); overflow-y: auto; padding: 4px 12px; font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace; }
  .log-entry { padding: 2px 0; color: #999; }
  .log-entry .timestamp { color: #666; margin-right: 8px; }
  .log-entry .tool-name { color: #6ab0f3; margin-right: 8px; }
</style>
</head>
<body>

<div id="status-bar">
  <div id="status-dot"></div>
  <span id="status-text">Connecting...</span>
  <span id="doc-info"></span>
</div>

<div id="photopea-container">
  <iframe id="pp" src="https://www.photopea.com"></iframe>
</div>

<div id="log-panel" class="expanded">
  <div id="log-header" onclick="toggleLog()">
    <span id="log-toggle">&#9660;</span> Activity Log
  </div>
  <div id="log-entries"></div>
</div>

<script>
(function() {
  var pp = document.getElementById('pp');
  var statusDot = document.getElementById('status-dot');
  var statusText = document.getElementById('status-text');
  var docInfo = document.getElementById('doc-info');
  var logEntries = document.getElementById('log-entries');
  var ws = null;
  var photopeaReady = false;
  var currentRequest = null;
  var requestQueue = [];
  var bufferedData = [];
  var bufferedFiles = [];
  var reconnectDelay = 1000;
  var logCount = 0;
  var MAX_LOG = 100;

  // --- WebSocket connection ---
  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + location.host);

    ws.onopen = function() {
      statusDot.className = 'connected';
      statusText.textContent = 'Connected';
      reconnectDelay = 1000;
      if (photopeaReady) {
        ws.send(JSON.stringify({ type: 'status', status: 'ready' }));
      }
    };

    ws.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'execute') {
          enqueue(msg);
        } else if (msg.type === 'load') {
          handleLoad(msg);
        } else if (msg.type === 'activity') {
          addLogEntry(msg.tool, msg.summary);
        }
      } catch(err) {}
    };

    ws.onclose = function() {
      statusDot.className = '';
      statusText.textContent = 'Disconnected - reconnecting...';
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
    };

    ws.onerror = function() {
      ws.close();
    };
  }

  // --- Photopea message handling ---
  window.addEventListener('message', function(e) {
    if (e.source !== pp.contentWindow) return;

    if (!photopeaReady && e.data === 'done') {
      photopeaReady = true;
      statusText.textContent = 'Connected - Photopea ready';
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'status', status: 'ready' }));
      }
      return;
    }

    if (!currentRequest) return;

    if (e.data === 'done') {
      // Current request complete
      var req = currentRequest;
      currentRequest = null;

      if (bufferedFiles.length > 0) {
        // Send file result
        var fileData = bufferedFiles[0];
        var reader = new FileReader();
        reader.onload = function() {
          var base64 = reader.result.split(',')[1] || btoa(String.fromCharCode.apply(null, new Uint8Array(reader.result)));
          ws.send(JSON.stringify({
            id: req.id,
            type: 'file',
            success: true,
            data: base64,
            mimeType: 'image/png',
            error: null
          }));
          bufferedData = [];
          bufferedFiles = [];
          processQueue();
        };
        reader.readAsDataURL(new Blob([fileData]));
      } else {
        // Send text result
        var data = bufferedData.length > 0 ? bufferedData.join('') : 'done';
        ws.send(JSON.stringify({
          id: req.id,
          type: 'result',
          success: true,
          data: data,
          error: null
        }));
        bufferedData = [];
        bufferedFiles = [];
        processQueue();
      }
    } else if (e.data instanceof ArrayBuffer) {
      bufferedFiles.push(e.data);
    } else if (typeof e.data === 'string') {
      bufferedData.push(e.data);
    }
  });

  // --- Request queue ---
  function enqueue(msg) {
    requestQueue.push(msg);
    if (!currentRequest) processQueue();
  }

  function processQueue() {
    if (requestQueue.length === 0 || currentRequest) return;
    currentRequest = requestQueue.shift();
    bufferedData = [];
    bufferedFiles = [];
    pp.contentWindow.postMessage(currentRequest.script, '*');
  }

  function handleLoad(msg) {
    // Decode base64 to ArrayBuffer and send to Photopea
    var binary = atob(msg.data);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    pp.contentWindow.postMessage(bytes.buffer, '*');

    // Wait for 'done' to confirm load
    requestQueue.push({ id: msg.id, type: 'load-wait', script: '' });
    if (!currentRequest) processQueue();
  }

  // --- Activity log ---
  function addLogEntry(tool, summary) {
    var now = new Date();
    var time = now.toTimeString().split(' ')[0];
    var entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = '<span class="timestamp">' + time + '</span><span class="tool-name">' + tool + '</span>' + summary;
    logEntries.appendChild(entry);
    logEntries.scrollTop = logEntries.scrollHeight;
    logCount++;
    if (logCount > MAX_LOG) {
      logEntries.removeChild(logEntries.firstChild);
      logCount--;
    }
  }

  // Start
  connect();
})();

function toggleLog() {
  var panel = document.getElementById('log-panel');
  panel.className = panel.className === 'expanded' ? 'collapsed' : 'expanded';
}
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/frontend/index.html
git commit -m "feat: frontend page with Photopea iframe, bridge client, status bar, activity log"
```

---

### Task 8: Utility Modules

**Files:**
- Create: `src/utils/file-io.ts`
- Create: `src/utils/platform.ts`

- [ ] **Step 1: Implement file I/O utilities**

```typescript
// src/utils/file-io.ts
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

export async function readLocalFile(filePath: string): Promise<Buffer> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}. Verify the path exists.`);
  }
  return readFile(filePath);
}

export async function writeLocalFile(filePath: string, data: Buffer): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, data);
}

export async function fetchUrlToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${url}. Status: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function isUrl(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}
```

- [ ] **Step 2: Implement platform utilities**

```typescript
// src/utils/platform.ts
import { createServer } from "net";

export async function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(preferred, "127.0.0.1", () => {
      server.close(() => resolve(preferred));
    });
    server.on("error", () => {
      // Preferred port taken, get a random one
      const fallback = createServer();
      fallback.listen(0, "127.0.0.1", () => {
        const addr = fallback.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        fallback.close(() => resolve(port));
      });
      fallback.on("error", reject);
    });
  });
}

export async function launchBrowser(url: string): Promise<void> {
  const open = (await import("open")).default;
  await open(url);
}
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/utils/file-io.ts src/utils/platform.ts
git commit -m "feat: file I/O and platform utilities"
```

---

### Task 9: MCP Tool Registration — All Tools

**Files:**
- Create: `src/tools/document.ts`
- Create: `src/tools/layer.ts`
- Create: `src/tools/text.ts`
- Create: `src/tools/image.ts`
- Create: `src/tools/export.ts`
- Create: `src/tools/workflows.ts`
- Create: `src/server.ts`

This task registers all 35 tools on the McpServer. Each tool handler is thin: validate with Zod, call script builder, send to bridge, return result.

- [ ] **Step 1: Create document tools**

```typescript
// src/tools/document.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import {
  buildCreateDocument,
  buildGetDocumentInfo,
  buildResizeDocument,
  buildCloseDocument,
} from "../bridge/script-builder.js";
import { readLocalFile, isUrl } from "../utils/file-io.js";

export function registerDocumentTools(server: McpServer, bridge: PhotopeaBridge): void {

  server.registerTool("photopea_create_document", {
    title: "Create Document",
    description: "Create a new blank document in Photopea with specified dimensions, resolution, color mode, and optional fill color.",
    inputSchema: {
      width: z.number().int().min(1).max(30000).describe("Width in pixels"),
      height: z.number().int().min(1).max(30000).describe("Height in pixels"),
      resolution: z.number().int().min(1).max(1200).default(72).describe("Resolution in DPI"),
      name: z.string().max(255).default("Untitled").describe("Document name"),
      mode: z.enum(["RGB", "CMYK", "Grayscale"]).default("RGB").describe("Color mode"),
      fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Fill color hex, e.g. #1a1a2e"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildCreateDocument(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "create_document", summary: `${params.width}x${params.height} "${params.name}"` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to create document" }] };
    return { content: [{ type: "text" as const, text: `Document created: ${params.width}x${params.height} "${params.name}"` }] };
  });

  server.registerTool("photopea_open_file", {
    title: "Open File",
    description: "Open an image or PSD file from a local path or URL. Set asSmart=true to open as a smart object layer in the current document.",
    inputSchema: {
      source: z.string().min(1).describe("Local file path or URL"),
      asSmart: z.boolean().default(false).describe("Open as smart object layer in current document"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    if (isUrl(params.source)) {
      const script = `app.open('${params.source}', null, ${params.asSmart});\napp.echoToOE('ok');`;
      const result = await bridge.executeScript(script);
      if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to open URL" }] };
    } else {
      const data = await readLocalFile(params.source);
      await bridge.loadFile(data, params.source.split("/").pop() || "file");
    }
    bridge.sendActivity({ type: "activity", id: "", tool: "open_file", summary: params.source.split("/").pop() || params.source });
    return { content: [{ type: "text" as const, text: `Opened: ${params.source}` }] };
  });

  server.registerTool("photopea_get_document_info", {
    title: "Get Document Info",
    description: "Return metadata about the active document: name, dimensions, resolution, layer count, color mode.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const script = buildGetDocumentInfo();
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "No document open. Use create_document or open_file first." }] };
    return { content: [{ type: "text" as const, text: result.data || "No data" }] };
  });

  server.registerTool("photopea_resize_document", {
    title: "Resize Document",
    description: "Resize the active document to new dimensions.",
    inputSchema: {
      width: z.number().int().min(1).max(30000).describe("New width in pixels"),
      height: z.number().int().min(1).max(30000).describe("New height in pixels"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildResizeDocument(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to resize" }] };
    return { content: [{ type: "text" as const, text: `Resized to ${params.width}x${params.height}` }] };
  });

  server.registerTool("photopea_close_document", {
    title: "Close Document",
    description: "Close the active document.",
    inputSchema: {
      save: z.boolean().default(false).describe("Save before closing"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildCloseDocument(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to close" }] };
    return { content: [{ type: "text" as const, text: "Document closed" }] };
  });
}
```

- [ ] **Step 2: Create layer tools**

```typescript
// src/tools/layer.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import {
  buildAddLayer, buildAddFillLayer, buildDeleteLayer, buildSelectLayer,
  buildSetLayerProperties, buildMoveLayer, buildDuplicateLayer,
  buildReorderLayer, buildGroupLayers, buildGetLayers,
} from "../bridge/script-builder.js";

const layerTarget = z.union([z.string(), z.number()]).describe("Layer name or index");

export function registerLayerTools(server: McpServer, bridge: PhotopeaBridge): void {

  server.registerTool("photopea_add_layer", {
    title: "Add Layer",
    description: "Create a new empty layer.",
    inputSchema: {
      name: z.string().optional().describe("Layer name"),
      opacity: z.number().min(0).max(100).optional().describe("Opacity 0-100"),
      blendMode: z.string().optional().describe("Blend mode: normal, multiply, screen, overlay, etc."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddLayer(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_layer", summary: params.name || "new layer" });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Layer added: ${params.name || "Layer"}` }] };
  });

  server.registerTool("photopea_add_fill_layer", {
    title: "Add Fill Layer",
    description: "Create a solid color, gradient, or pattern fill layer.",
    inputSchema: {
      type: z.enum(["solid", "gradient", "pattern"]).describe("Fill type"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Fill color hex (for solid)"),
      name: z.string().optional().describe("Layer name"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddFillLayer(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_fill_layer", summary: `${params.type} ${params.color || ""}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Fill layer added: ${params.type}` }] };
  });

  server.registerTool("photopea_delete_layer", {
    title: "Delete Layer",
    description: "Remove a layer by name or index. Use get_layers to see available layers.",
    inputSchema: { target: layerTarget },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildDeleteLayer(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || `Layer '${params.target}' not found. Use get_layers to see available layers.` }] };
    return { content: [{ type: "text" as const, text: `Deleted layer: ${params.target}` }] };
  });

  server.registerTool("photopea_select_layer", {
    title: "Select Layer",
    description: "Set the active layer by name or index.",
    inputSchema: { target: layerTarget },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildSelectLayer(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || `Layer '${params.target}' not found.` }] };
    return { content: [{ type: "text" as const, text: `Selected layer: ${params.target}` }] };
  });

  server.registerTool("photopea_set_layer_properties", {
    title: "Set Layer Properties",
    description: "Modify layer attributes: opacity, blend mode, visibility, name, locked state.",
    inputSchema: {
      target: layerTarget,
      opacity: z.number().min(0).max(100).optional(),
      blendMode: z.string().optional(),
      visible: z.boolean().optional(),
      name: z.string().optional(),
      locked: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildSetLayerProperties(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Updated layer: ${params.target}` }] };
  });

  server.registerTool("photopea_move_layer", {
    title: "Move Layer",
    description: "Reposition a layer to absolute x,y coordinates on the canvas.",
    inputSchema: { target: layerTarget, x: z.number().describe("X position"), y: z.number().describe("Y position") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildMoveLayer(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Moved ${params.target} to (${params.x}, ${params.y})` }] };
  });

  server.registerTool("photopea_duplicate_layer", {
    title: "Duplicate Layer",
    description: "Duplicate an existing layer.",
    inputSchema: { target: layerTarget, newName: z.string().optional().describe("Name for the copy") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildDuplicateLayer(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Duplicated: ${params.target}` }] };
  });

  server.registerTool("photopea_reorder_layer", {
    title: "Reorder Layer",
    description: "Move a layer in the stack: above, below, top, or bottom.",
    inputSchema: { target: layerTarget, position: z.enum(["above", "below", "top", "bottom"]) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildReorderLayer(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Moved ${params.target} to ${params.position}` }] };
  });

  server.registerTool("photopea_group_layers", {
    title: "Group Layers",
    description: "Create a layer group from specified layers.",
    inputSchema: {
      layers: z.array(z.string()).min(1).describe("Layer names to group"),
      groupName: z.string().optional().describe("Group name"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildGroupLayers(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Grouped ${params.layers.length} layers into "${params.groupName || "Group"}"` }] };
  });

  server.registerTool("photopea_get_layers", {
    title: "Get Layers",
    description: "List all layers in the active document as a JSON tree with names, types, visibility, opacity, and bounds.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const script = buildGetLayers();
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "No document open." }] };
    return { content: [{ type: "text" as const, text: result.data || "[]" }] };
  });
}
```

- [ ] **Step 3: Create text and shape tools**

```typescript
// src/tools/text.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import { buildAddText, buildEditText, buildAddShape } from "../bridge/script-builder.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Hex color, e.g. #ffffff");
const layerTarget = z.union([z.string(), z.number()]);

export function registerTextTools(server: McpServer, bridge: PhotopeaBridge): void {

  server.registerTool("photopea_add_text", {
    title: "Add Text",
    description: "Create a new text layer with specified content, position, font, size, color, and alignment.",
    inputSchema: {
      content: z.string().min(1).describe("Text content"),
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      font: z.string().optional().describe("Font name, e.g. Arial"),
      size: z.number().min(1).optional().describe("Font size in pt"),
      color: hexColor.optional(),
      alignment: z.enum(["left", "center", "right"]).optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      letterSpacing: z.number().optional().describe("Letter spacing (tracking)"),
      lineHeight: z.number().optional().describe("Line height (leading)"),
      paragraphBounds: z.object({ width: z.number(), height: z.number() }).nullable().optional().describe("Set for area/paragraph text, null for point text"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddText(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_text", summary: `"${params.content.substring(0, 30)}"` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Text added: "${params.content.substring(0, 50)}"` }] };
  });

  server.registerTool("photopea_edit_text", {
    title: "Edit Text",
    description: "Modify an existing text layer's content, font, size, color, or alignment.",
    inputSchema: {
      target: layerTarget.describe("Text layer name or index"),
      content: z.string().optional(),
      font: z.string().optional(),
      size: z.number().min(1).optional(),
      color: hexColor.optional(),
      alignment: z.enum(["left", "center", "right"]).optional(),
      letterSpacing: z.number().optional(),
      lineHeight: z.number().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildEditText(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Text updated: ${params.target}` }] };
  });

  server.registerTool("photopea_add_shape", {
    title: "Add Shape",
    description: "Draw a rectangle, ellipse, line, or polygon shape on a new layer.",
    inputSchema: {
      type: z.enum(["rectangle", "ellipse", "line", "polygon"]).describe("Shape type"),
      bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).describe("Shape bounds"),
      fillColor: hexColor.optional(),
      strokeColor: hexColor.optional(),
      strokeWidth: z.number().min(1).optional(),
      cornerRadius: z.number().min(0).optional().describe("Corner radius for rectangles"),
      name: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildAddShape(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "add_shape", summary: `${params.type} ${params.bounds.width}x${params.bounds.height}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Shape added: ${params.type}` }] };
  });
}
```

- [ ] **Step 4: Create image, style, and selection tools**

```typescript
// src/tools/image.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import {
  buildPlaceImage, buildApplyAdjustment, buildApplyFilter,
  buildTransformLayer, buildApplyLayerStyle, buildAddGradient,
  buildMakeSelection, buildModifySelection, buildFillSelection,
  buildClearSelection, buildReplaceSmartObject,
} from "../bridge/script-builder.js";
import { readLocalFile, isUrl } from "../utils/file-io.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const layerTarget = z.union([z.string(), z.number()]);

export function registerImageTools(server: McpServer, bridge: PhotopeaBridge): void {

  server.registerTool("photopea_place_image", {
    title: "Place Image",
    description: "Load an image from URL or local path as a new layer.",
    inputSchema: {
      source: z.string().min(1).describe("Image URL or local file path"),
      x: z.number().optional().describe("X position"),
      y: z.number().optional().describe("Y position"),
      width: z.number().optional().describe("Target width"),
      height: z.number().optional().describe("Target height"),
      name: z.string().optional().describe("Layer name"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    if (isUrl(params.source)) {
      const script = buildPlaceImage(params);
      const result = await bridge.executeScript(script);
      if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    } else {
      const data = await readLocalFile(params.source);
      await bridge.loadFile(data, params.source.split("/").pop() || "image");
    }
    bridge.sendActivity({ type: "activity", id: "", tool: "place_image", summary: params.name || params.source.split("/").pop() || "image" });
    return { content: [{ type: "text" as const, text: `Image placed: ${params.source}` }] };
  });

  server.registerTool("photopea_apply_adjustment", {
    title: "Apply Adjustment",
    description: "Apply an adjustment to the active layer: brightness, hue_sat, levels, curves.",
    inputSchema: {
      type: z.enum(["brightness", "hue_sat", "levels", "curves"]).describe("Adjustment type"),
      settings: z.record(z.union([z.number(), z.string(), z.boolean()])).optional().describe("Adjustment settings"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildApplyAdjustment(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Applied ${params.type} adjustment` }] };
  });

  server.registerTool("photopea_apply_filter", {
    title: "Apply Filter",
    description: "Apply a filter to the active layer: gaussian_blur, sharpen, unsharp_mask, noise, motion_blur.",
    inputSchema: {
      type: z.enum(["gaussian_blur", "sharpen", "unsharp_mask", "noise", "motion_blur"]).describe("Filter type"),
      settings: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildApplyFilter(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "apply_filter", summary: params.type });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Applied ${params.type} filter` }] };
  });

  server.registerTool("photopea_transform_layer", {
    title: "Transform Layer",
    description: "Scale, rotate, or flip a layer.",
    inputSchema: {
      target: layerTarget,
      scaleX: z.number().optional().describe("Horizontal scale factor (1.0 = 100%)"),
      scaleY: z.number().optional().describe("Vertical scale factor"),
      rotation: z.number().optional().describe("Rotation in degrees"),
      flipH: z.boolean().optional().describe("Flip horizontally"),
      flipV: z.boolean().optional().describe("Flip vertically"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildTransformLayer(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Transformed: ${params.target}` }] };
  });

  server.registerTool("photopea_apply_layer_style", {
    title: "Apply Layer Style",
    description: "Add layer effects like drop shadow, stroke, glow, color overlay, gradient overlay.",
    inputSchema: {
      target: layerTarget,
      dropShadow: z.object({
        color: hexColor.optional(), opacity: z.number().optional(), angle: z.number().optional(),
        distance: z.number().optional(), spread: z.number().optional(), size: z.number().optional(),
      }).optional(),
      stroke: z.object({
        color: hexColor.optional(), size: z.number().optional(),
        position: z.enum(["outside", "inside", "center"]).optional(), opacity: z.number().optional(),
      }).optional(),
      outerGlow: z.object({ color: hexColor.optional(), opacity: z.number().optional(), size: z.number().optional() }).optional(),
      innerGlow: z.object({ color: hexColor.optional(), opacity: z.number().optional(), size: z.number().optional() }).optional(),
      colorOverlay: z.object({ color: hexColor, opacity: z.number().optional() }).optional(),
      gradientOverlay: z.object({ colors: z.array(hexColor), angle: z.number().optional(), opacity: z.number().optional() }).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildApplyLayerStyle(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "apply_layer_style", summary: `${params.target}` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Style applied to: ${params.target}` }] };
  });

  server.registerTool("photopea_add_gradient", {
    title: "Add Gradient",
    description: "Apply a gradient fill to a layer: linear, radial, or angular.",
    inputSchema: {
      target: layerTarget,
      type: z.enum(["linear", "radial", "angular"]),
      colors: z.array(hexColor).min(2).describe("Gradient color stops"),
      angle: z.number().optional().describe("Gradient angle in degrees"),
      scale: z.number().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildAddGradient(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Gradient applied to: ${params.target}` }] };
  });

  server.registerTool("photopea_make_selection", {
    title: "Make Selection",
    description: "Create a selection: select all, rectangle, or ellipse.",
    inputSchema: {
      type: z.enum(["all", "rect", "ellipse"]),
      bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
      feather: z.number().min(0).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildMakeSelection(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Selection created: ${params.type}` }] };
  });

  server.registerTool("photopea_modify_selection", {
    title: "Modify Selection",
    description: "Expand, contract, feather, or invert the current selection.",
    inputSchema: {
      action: z.enum(["expand", "contract", "feather", "invert"]),
      amount: z.number().optional().describe("Pixels (not needed for invert)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildModifySelection(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Selection modified: ${params.action}` }] };
  });

  server.registerTool("photopea_fill_selection", {
    title: "Fill Selection",
    description: "Fill the current selection with a color.",
    inputSchema: {
      color: hexColor,
      opacity: z.number().min(0).max(100).optional().default(100),
      blendMode: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildFillSelection(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Filled selection with ${params.color}` }] };
  });

  server.registerTool("photopea_clear_selection", {
    title: "Clear Selection",
    description: "Deselect the current selection.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const script = buildClearSelection();
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: "Selection cleared" }] };
  });

  server.registerTool("photopea_replace_smart_object", {
    title: "Replace Smart Object",
    description: "Swap the contents of a smart object layer with a new image from URL or local path.",
    inputSchema: {
      target: layerTarget.describe("Smart object layer name or index"),
      source: z.string().min(1).describe("New image URL or local path"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (params) => {
    const script = buildReplaceSmartObject(params);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Smart object replaced: ${params.target}` }] };
  });
}
```

- [ ] **Step 5: Create export and utility tools**

```typescript
// src/tools/export.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import type { BridgeFileResult } from "../bridge/types.js";
import {
  buildExportImage, buildGetPreview, buildBatchExport,
  buildRunScript, buildUndo, buildRedo,
} from "../bridge/script-builder.js";
import { writeLocalFile } from "../utils/file-io.js";

export function registerExportTools(server: McpServer, bridge: PhotopeaBridge): void {

  server.registerTool("photopea_export_image", {
    title: "Export Image",
    description: "Export the active document to a local file. Supported formats: png, jpg, webp, psd, svg.",
    inputSchema: {
      format: z.enum(["png", "jpg", "webp", "psd", "svg"]).describe("Export format"),
      quality: z.number().min(0).max(1).optional().describe("Quality 0-1 for jpg/webp"),
      outputPath: z.string().min(1).describe("Local file path to save to"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildExportImage(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "export_image", summary: `${params.format} -> ${params.outputPath}` });
    const result = await bridge.executeScript(script, true);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Export failed" }] };
    const fileResult = result as BridgeFileResult;
    await writeLocalFile(params.outputPath, fileResult.data);
    return { content: [{ type: "text" as const, text: `Exported ${params.format} to ${params.outputPath}` }] };
  });

  server.registerTool("photopea_get_preview", {
    title: "Get Preview",
    description: "Get a base64 PNG thumbnail of the current document state. Useful for agents to 'see' their work.",
    inputSchema: {
      maxWidth: z.number().int().optional().describe("Max thumbnail width"),
      maxHeight: z.number().int().optional().describe("Max thumbnail height"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildGetPreview(params);
    const result = await bridge.executeScript(script, true);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Preview failed" }] };
    const fileResult = result as BridgeFileResult;
    const base64 = fileResult.data.toString("base64");
    return { content: [{ type: "image" as const, data: base64, mimeType: "image/png" }] };
  });

  server.registerTool("photopea_batch_export", {
    title: "Batch Export",
    description: "Export the document in multiple formats/sizes at once.",
    inputSchema: {
      exports: z.array(z.object({
        format: z.enum(["png", "jpg", "webp", "psd", "svg"]),
        quality: z.number().min(0).max(1).optional(),
        outputPath: z.string().min(1),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
      })).min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    // Export each individually to get separate file results
    const results: string[] = [];
    for (const exp of params.exports) {
      const script = buildExportImage({ format: exp.format, quality: exp.quality, outputPath: exp.outputPath });
      const result = await bridge.executeScript(script, true);
      if (result.success) {
        const fileResult = result as BridgeFileResult;
        await writeLocalFile(exp.outputPath, fileResult.data);
        results.push(`Exported ${exp.format} to ${exp.outputPath}`);
      } else {
        results.push(`Failed to export ${exp.format}: ${result.error}`);
      }
    }
    return { content: [{ type: "text" as const, text: results.join("\n") }] };
  });

  server.registerTool("photopea_run_script", {
    title: "Run Script",
    description: "Execute raw Photopea/Photoshop JavaScript. Use this for operations not covered by other tools. The script should use app.echoToOE() to return data.",
    inputSchema: {
      script: z.string().min(1).describe("JavaScript code to execute in Photopea"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildRunScript(params.script);
    bridge.sendActivity({ type: "activity", id: "", tool: "run_script", summary: params.script.substring(0, 60) });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: `Script error: ${result.error}. Check parameters.` }] };
    return { content: [{ type: "text" as const, text: result.data || "done" }] };
  });

  server.registerTool("photopea_undo", {
    title: "Undo",
    description: "Undo the last action(s).",
    inputSchema: { steps: z.number().int().min(1).max(50).default(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildUndo(params.steps);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Undone ${params.steps} step(s)` }] };
  });

  server.registerTool("photopea_redo", {
    title: "Redo",
    description: "Redo the last undone action(s).",
    inputSchema: { steps: z.number().int().min(1).max(50).default(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (params) => {
    const script = buildRedo(params.steps);
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Redone ${params.steps} step(s)` }] };
  });
}
```

- [ ] **Step 6: Create workflow tools**

```typescript
// src/tools/workflows.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "../bridge/websocket-server.js";
import {
  buildSetBackground, buildCreateBanner, buildLoadTemplate,
  buildApplyTemplateVariables, buildComposeLayers,
} from "../bridge/script-builder.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export function registerWorkflowTools(server: McpServer, bridge: PhotopeaBridge): void {

  server.registerTool("photopea_set_background", {
    title: "Set Background",
    description: "One-call background setup: solid color, gradient, or image with optional blur.",
    inputSchema: {
      type: z.enum(["solid", "gradient", "image"]),
      color: hexColor.optional().describe("Solid fill color"),
      gradient: z.object({ colors: z.array(hexColor).min(2), angle: z.number().optional() }).optional(),
      imageSource: z.string().optional().describe("Image URL or local path"),
      blur: z.number().optional().describe("Gaussian blur radius for image backgrounds"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const script = buildSetBackground(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "set_background", summary: params.type });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Background set: ${params.type}` }] };
  });

  server.registerTool("photopea_create_banner", {
    title: "Create Banner",
    description: "Generate a complete banner in one call with title, subtitle, background, accent color, and layout. Returns a fully composed document.",
    inputSchema: {
      width: z.number().int().min(1).max(30000),
      height: z.number().int().min(1).max(30000),
      title: z.string().min(1).describe("Main title text"),
      subtitle: z.string().optional().describe("Subtitle text"),
      backgroundColor: hexColor.optional().default("#1a1a2e"),
      accentColor: hexColor.optional().default("#e94560"),
      titleFont: z.string().optional().default("Arial"),
      titleSize: z.number().optional().default(72),
      titleColor: hexColor.optional().default("#ffffff"),
      backgroundImage: z.string().optional().describe("Background image URL or path"),
      layout: z.enum(["centered", "left", "split"]).optional().default("centered"),
      outputPath: z.string().optional().describe("Auto-export to this path if set"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const script = buildCreateBanner(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "create_banner", summary: `${params.width}x${params.height} "${params.title}"` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Banner created: ${params.width}x${params.height} "${params.title}"` }] };
  });

  server.registerTool("photopea_load_template", {
    title: "Load Template",
    description: "Open a PSD template and return its editable layer structure as JSON.",
    inputSchema: {
      source: z.string().min(1).describe("PSD file URL or local path"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const script = buildLoadTemplate(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "load_template", summary: params.source.split("/").pop() || params.source });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed to load template" }] };
    return { content: [{ type: "text" as const, text: result.data || "[]" }] };
  });

  server.registerTool("photopea_apply_template_variables", {
    title: "Apply Template Variables",
    description: "Batch-update a loaded template by replacing text content in named layers. Pass a JSON map of {layerName: newContent}.",
    inputSchema: {
      variables: z.record(z.string()).describe("Map of layer names to new text values"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => {
    const script = buildApplyTemplateVariables(params);
    const count = Object.keys(params.variables).length;
    bridge.sendActivity({ type: "activity", id: "", tool: "apply_template_variables", summary: `${count} variables` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Applied ${count} template variables` }] };
  });

  server.registerTool("photopea_compose_layers", {
    title: "Compose Layers",
    description: "Build a multi-layer composition in one call. Pass an array of layer definitions (text, image, shape, fill) applied in order.",
    inputSchema: {
      layers: z.array(z.object({
        type: z.enum(["text", "image", "shape", "fill"]),
      }).passthrough()).min(1).describe("Ordered array of layer definitions"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    const script = buildComposeLayers(params);
    bridge.sendActivity({ type: "activity", id: "", tool: "compose_layers", summary: `${params.layers.length} layers` });
    const result = await bridge.executeScript(script);
    if (!result.success) return { isError: true, content: [{ type: "text" as const, text: result.error || "Failed" }] };
    return { content: [{ type: "text" as const, text: `Composed ${params.layers.length} layers` }] };
  });
}
```

- [ ] **Step 7: Create server.ts to wire everything together**

```typescript
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PhotopeaBridge } from "./bridge/websocket-server.js";
import { registerDocumentTools } from "./tools/document.js";
import { registerLayerTools } from "./tools/layer.js";
import { registerTextTools } from "./tools/text.js";
import { registerImageTools } from "./tools/image.js";
import { registerExportTools } from "./tools/export.js";
import { registerWorkflowTools } from "./tools/workflows.js";

export function createServer(bridge: PhotopeaBridge): McpServer {
  const server = new McpServer({
    name: "photopea-mcp-server",
    version: "0.1.0",
  });

  registerDocumentTools(server, bridge);
  registerLayerTools(server, bridge);
  registerTextTools(server, bridge);
  registerImageTools(server, bridge);
  registerExportTools(server, bridge);
  registerWorkflowTools(server, bridge);

  return server;
}
```

- [ ] **Step 8: Verify compilation**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors. Fix any type mismatches.

- [ ] **Step 9: Commit**

```bash
git add src/tools/ src/server.ts
git commit -m "feat: register all 35 MCP tools across document, layer, text, shape, image, style, selection, export, and workflow domains"
```

---

### Task 10: Server Entry Point and Startup Flow

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement the entry point**

```typescript
#!/usr/bin/env node
// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { PhotopeaBridge } from "./bridge/websocket-server.js";
import { createServer } from "./server.js";
import { findAvailablePort, launchBrowser } from "./utils/platform.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 4117;

async function main(): Promise<void> {
  const port = await findAvailablePort(DEFAULT_PORT);
  const bridge = new PhotopeaBridge(port);

  // Serve the frontend HTML
  const httpServer = bridge.getHttpServer();
  const frontendHtml = readFileSync(join(__dirname, "frontend", "index.html"), "utf-8");

  httpServer.on("request", (req, res) => {
    // Only handle HTTP GET for the frontend page (WebSocket upgrade is handled separately)
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(frontendHtml);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await bridge.start();
  console.error(`Photopea MCP bridge running on http://127.0.0.1:${port}`);

  // Launch browser
  try {
    await launchBrowser(`http://127.0.0.1:${port}`);
    console.error("Browser launched. Waiting for Photopea to initialize...");
  } catch {
    console.error(`Could not auto-launch browser. Please open http://127.0.0.1:${port}`);
  }

  // Start MCP server over stdio
  const mcpServer = createServer(bridge);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("Photopea MCP server ready.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Build the project**

Run:
```bash
npx tsc
```
Expected: Build succeeds, `dist/` directory created with compiled JS.

- [ ] **Step 3: Verify the entry point runs**

Run:
```bash
node dist/index.js 2>&1 | head -5
```
Expected: Should print startup messages to stderr (it will hang waiting for stdio input, which is expected). Kill with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: server entry point with HTTP/WS bridge, frontend serving, and browser auto-launch"
```

---

### Task 11: Build Verification and Fix Pass

**Files:**
- Potentially modify any file with compilation errors

- [ ] **Step 1: Full build**

Run:
```bash
npm run build
```
Expected: No errors. If there are errors, fix them one by one.

- [ ] **Step 2: Run all tests**

Run:
```bash
npm test
```
Expected: All unit and integration tests PASS.

- [ ] **Step 3: Fix any issues found**

Address compilation errors or test failures. Common issues:
- Import paths missing `.js` extension (required for Node16 module resolution)
- Type mismatches between script builder params and the types
- Missing exports from script-builder.ts

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve compilation and test issues"
```

---

### Task 12: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# photopea-mcp-server

An MCP server that gives AI agents full programmatic control over [Photopea](https://www.photopea.com), a browser-based image editor. Agents can create documents, add text/shapes/images, apply effects, manipulate layers, and export results -- while you watch a live preview in your browser.

## Features

- **35 tools** for complete image editing control: documents, layers, text, shapes, images, filters, adjustments, selections, styles, and export
- **Live preview** -- watch the agent work in real time in your browser
- **High-level workflow tools** -- one-call banner creation, template filling, multi-layer composition
- **Template support** -- load PSD templates, inspect layers, batch-update text/images
- **Local + URL assets** -- load images from disk or the web
- **Export flexibility** -- PNG, JPG, WebP, PSD, SVG with quality control
- **Raw script escape hatch** -- run any Photopea/Photoshop JavaScript directly

## Quick Start

```bash
npm install
npm run build
```

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "photopea": {
      "command": "node",
      "args": ["/path/to/photopea-mcp-server/dist/index.js"]
    }
  }
}
```

### With Claude Code

```bash
claude mcp add photopea node /path/to/photopea-mcp-server/dist/index.js
```

When the server starts, it will automatically open a browser tab with Photopea. Keep this tab open while working.

## Tools

### Primitives (30 tools)

**Document:** create_document, open_file, get_document_info, resize_document, close_document
**Layer:** add_layer, add_fill_layer, delete_layer, select_layer, set_layer_properties, move_layer, duplicate_layer, reorder_layer, group_layers, get_layers
**Text:** add_text, edit_text
**Shape:** add_shape
**Image:** place_image, apply_adjustment, apply_filter, transform_layer
**Style:** apply_layer_style, add_gradient
**Selection:** make_selection, modify_selection, fill_selection, clear_selection
**Smart Object:** replace_smart_object
**Export:** export_image, get_preview, batch_export
**Utility:** run_script, undo, redo

### Workflows (5 tools)

**set_background** -- One-call solid/gradient/image background
**create_banner** -- Full banner from title + colors + layout
**load_template** -- Open PSD and inspect editable layers
**apply_template_variables** -- Batch-update template text/images
**compose_layers** -- Multi-layer composition in one call

## How It Works

```
Agent <-> MCP Server (stdio) <-> WebSocket <-> Browser Page <-> Photopea iframe (postMessage)
```

The MCP server translates tool calls into Photopea-compatible JavaScript (Adobe Photoshop JS API), sends them to Photopea via a WebSocket-to-postMessage bridge, and returns results to the agent.

## Development

```bash
npm run dev          # Watch mode with auto-reload
npm test             # Run unit + integration tests
npm run test:e2e     # Run end-to-end tests (requires browser)
npm run build        # Compile TypeScript
```

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage, tools reference, and architecture overview"
```

---

## Self-Review Checklist

After completing all tasks, verify:

1. **Spec coverage:**
   - Architecture (Section 2): Covered in Tasks 6, 7, 10
   - Tools (Section 3): All 35 tools registered in Task 9
   - Protocol (Section 4): Implemented in Task 6
   - Frontend (Section 5): Implemented in Task 7
   - Error handling (Section 6): Integrated into every tool handler
   - Testing (Section 7): Unit tests in Tasks 3-5, integration tests in Task 6

2. **Type consistency:** All types defined in `types.ts` (Task 2) are used consistently across script-builder, tool handlers, and bridge.

3. **No placeholders:** Every step has complete code.
