# Photopea MCP Server — Design Specification

**Date:** 2026-04-02
**Status:** Approved
**Language:** TypeScript (Node.js)
**Transport:** stdio (MCP) + WebSocket (bridge) + HTTP (frontend)

---

## 1. Overview

An MCP server that gives AI agents full programmatic control over Photopea, a browser-based image editor. Agents can create documents, add text/shapes/images, apply effects, manipulate layers, and export results — while the user watches a live preview in their browser.

### Goals

- Enable agents to design posters, banners, and perform photo editing through structured MCP tools
- Provide live visual feedback — the user sees every change as it happens in Photopea
- Offer both low-level primitives (full control) and high-level workflow tools (one-call operations)
- Be publishable as an open-source MCP with clean docs and easy setup

### Non-Goals

- Replacing Photopea's UI — the user can still interact with the editor freely
- Pixel-perfect visual testing — we verify outputs are valid files, not visual correctness
- Offline support — Photopea requires an internet connection

---

## 2. Architecture

```
+---------------+     stdio      +-------------------------------+
|   AI Agent    |<-------------->|     MCP Server (Node.js)      |
| (Claude, etc) |                |                               |
+---------------+                |  +---------------------------+ |
                                 |  |  Tool Handlers            | |
                                 |  |  (document, layer, text,  | |
                                 |  |   image, export, etc.)    | |
                                 |  +-----------+---------------+ |
                                 |              |                 |
                                 |  +-----------v---------------+ |
                                 |  |  Photopea Bridge          | |
                                 |  |  (script builder +        | |
                                 |  |   WebSocket server)       | |
                                 |  +-----------+---------------+ |
                                 +--------------|----------------+
                                                | WebSocket
                                 +--------------v----------------+
                                 |  Local Web Page (localhost)   |
                                 |  +---------------------------+|
                                 |  |  Bridge Client (JS)       ||
                                 |  |  postMessage <> WebSocket ||
                                 |  +-----------+---------------+|
                                 |  +-----------v---------------+|
                                 |  |  Photopea iframe          ||
                                 |  |  (www.photopea.com)       ||
                                 |  +---------------------------+|
                                 +-------------------------------+
                                         User watches here
```

### Components

1. **MCP Server** — Registers tools with the MCP protocol over stdio. Receives tool calls from the agent, translates them into Photopea scripts via the script builder, sends them through the bridge, returns results.

2. **Photopea Bridge** — The core engine. Contains two sub-modules:
   - **Script Builder** — Pure functions that translate structured tool inputs into Photopea-compatible JavaScript strings. Follows Adobe Photoshop's JavaScript API which Photopea implements.
   - **WebSocket Server** — Manages the connection to the browser client, handles request/response correlation, implements the sequential command queue.

3. **Local Web Page** — A single HTML file served on localhost. Embeds Photopea in an iframe, runs a small JS client that relays messages between WebSocket and postMessage.

4. **Photopea iframe** — The actual Photopea editor at www.photopea.com. All rendering, layer manipulation, and export happens here.

### Startup Flow

1. Agent starts MCP server via stdio
2. Server starts HTTP server (serves the web page) + WebSocket server on a local port
3. Server auto-opens `localhost:PORT` in the default browser via platform command (`open` on macOS, `xdg-open` on Linux, `start` on Windows)
4. Web page loads, embeds Photopea iframe, connects WebSocket
5. Photopea sends `"done"` when ready — bridge client relays to server
6. Server marks itself as ready — tools become operational

---

## 3. MCP Tools

35 tools organized in two tiers.

### Tier 1: Primitives — Full Control

#### Document Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `create_document` | Create a new blank document | `width`, `height`, `resolution`, `name`, `mode` (RGB/CMYK/Grayscale), `fillColor` |
| `open_file` | Open image/PSD from local path or URL | `source`, `asSmart` (boolean) |
| `get_document_info` | Return active document metadata | — (returns width, height, resolution, layer count, name, color mode) |
| `resize_document` | Resize image or canvas | `width`, `height`, `resampleMethod`, `anchor` (for canvas resize) |
| `close_document` | Close a document | `save` (boolean) |

#### Layer Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `add_layer` | Create a new empty layer | `name`, `opacity`, `blendMode` |
| `add_fill_layer` | Solid/gradient/pattern fill layer | `type` (solid/gradient/pattern), `color`, `gradient`, `name` |
| `delete_layer` | Remove a layer | `target` (name or index) |
| `select_layer` | Set active layer | `target` (name or index) |
| `set_layer_properties` | Modify layer attributes | `target`, `opacity`, `blendMode`, `visible`, `name`, `locked` |
| `move_layer` | Reposition a layer on canvas | `target`, `x`, `y` |
| `duplicate_layer` | Duplicate a layer | `target`, `newName` |
| `reorder_layer` | Move layer in stack | `target`, `position` (above/below/top/bottom) |
| `group_layers` | Group layers into a folder | `layers[]`, `groupName` |
| `get_layers` | List all layers as a tree | — (returns tree of names, types, visibility, opacity, bounds) |

#### Shape Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `add_shape` | Draw a shape on a new layer | `type` (rectangle/ellipse/line/polygon), `bounds` ({x, y, width, height}), `fillColor`, `strokeColor`, `strokeWidth`, `cornerRadius`, `name` |

#### Text Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `add_text` | Create a text layer | `content`, `x`, `y`, `font`, `size`, `color`, `alignment`, `bold`, `italic`, `letterSpacing`, `lineHeight`, `paragraphBounds` (null = point text, set = area text) |
| `edit_text` | Modify existing text layer | `target`, `content`, `font`, `size`, `color`, `alignment`, `letterSpacing`, `lineHeight` |

#### Image and Composition Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `place_image` | Load image as a new layer | `source` (local path or URL), `x`, `y`, `width`, `height`, `name` |
| `apply_adjustment` | Add adjustment layer | `type` (brightness, curves, hue_sat, levels, color_balance, exposure, vibrance, etc.), `settings` |
| `apply_filter` | Apply filter to active layer | `type` (gaussian_blur, sharpen, noise, etc.), `settings` |
| `transform_layer` | Scale, rotate, flip | `target`, `scaleX`, `scaleY`, `rotation`, `flipH`, `flipV` |

#### Style Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `apply_layer_style` | Add layer effects | `target`, `dropShadow`, `stroke`, `outerGlow`, `innerGlow`, `bevelEmboss`, `colorOverlay`, `gradientOverlay` (each an object with its own settings) |
| `add_gradient` | Apply gradient fill/overlay | `target`, `type` (linear/radial/angular), `colors[]`, `angle`, `scale` |

#### Selection Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `make_selection` | Create a selection | `type` (all/rect/ellipse), `bounds`, `feather` |
| `modify_selection` | Adjust selection | `action` (expand/contract/feather/invert), `amount` |
| `fill_selection` | Fill selection with color | `color`, `opacity`, `blendMode` |
| `clear_selection` | Deselect | — |

#### Smart Object Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `replace_smart_object` | Swap contents of a smart object layer | `target`, `source` (local path or URL) |

#### Export Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `export_image` | Export document to file | `format` (png/jpg/webp/psd/svg), `quality` (0-1 for lossy), `outputPath` |
| `get_preview` | Get base64 thumbnail of current state | `maxWidth`, `maxHeight` |
| `batch_export` | Export multiple formats/sizes in one call | `exports[]` (each with `format`, `quality`, `outputPath`, `width`, `height`) |

#### Utility Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `run_script` | Execute raw Photopea/Photoshop JavaScript | `script` (string) |
| `undo` | Undo last action(s) | `steps` (default 1) |
| `redo` | Redo last undone action(s) | `steps` (default 1) |

### Tier 2: Workflow Tools — High-Level Operations

| Tool | Description | Key Parameters |
|---|---|---|
| `set_background` | One-call background setup | `type` (solid/gradient/image), `color`, `gradient` ({colors[], angle}), `imageSource`, `blur` |
| `create_banner` | Generate a complete banner | `width`, `height`, `title`, `subtitle`, `backgroundColor`, `accentColor`, `titleFont`, `titleSize`, `titleColor`, `backgroundImage`, `layout` (centered/left/split), `outputPath` |
| `load_template` | Open PSD and return editable layer structure | `source` — returns `{layers: [{name, type, kind, content, bounds}...]}` |
| `apply_template_variables` | Batch-update a loaded template | `variables` — JSON map of `{layerName: value}` where value is text string or image source. Detects layer type and applies accordingly. |
| `compose_layers` | Build multi-layer composition in one call | `layers[]` — ordered array of `{type: "text" | "image" | "shape" | "fill", ...props}`. Reduces many tool calls to one. |

---

## 4. WebSocket Bridge Protocol

### Message Format

All messages between MCP server and bridge client are JSON over WebSocket.

**Server to Client — execute a script:**

```json
{
  "id": "req_001",
  "type": "execute",
  "script": "app.documents.add(1920, 1080, 72, 'Banner', NewDocumentMode.RGB);",
  "expectFiles": false
}
```

**Server to Client — send a file to Photopea:**

```json
{
  "id": "req_002",
  "type": "load",
  "data": "<base64-encoded ArrayBuffer>",
  "filename": "photo.jpg"
}
```

**Client to Server — script result:**

```json
{
  "id": "req_001",
  "type": "result",
  "success": true,
  "data": "done",
  "error": null
}
```

**Client to Server — file result (from export):**

```json
{
  "id": "req_002",
  "type": "file",
  "success": true,
  "data": "<base64-encoded ArrayBuffer>",
  "mimeType": "image/png",
  "error": null
}
```

**Client to Server — status events:**

```json
{
  "type": "status",
  "status": "ready"
}
```

```json
{
  "type": "status",
  "status": "disconnected"
}
```

### Sequential Queue with Correlation

Photopea's postMessage protocol sends `"done"` when it finishes processing a message. But `echoToOE()` and `saveToOE()` send data messages before the `"done"`. Multiple rapid commands could interleave.

Solution: the bridge client maintains a FIFO queue of pending requests. Only one script executes at a time.

When a message arrives from Photopea:
- If it is a string and not `"done"` — it is an `echoToOE` result; buffer it for the current request
- If it is an ArrayBuffer — it is a `saveToOE` file result; buffer it
- If it is `"done"` — current request is complete; package buffered results, send response to server, dequeue next request

### Timeout and Reconnection

- Each request has a configurable timeout (default: 30s, export operations: 60s)
- If timeout fires: resolve with error, dequeue, move to next
- If WebSocket disconnects: reject all pending requests with connection error
- Bridge client sends heartbeat ping every 10s; server detects stale connections
- On WebSocket close, bridge client auto-reconnects with exponential backoff (1s, 2s, 4s, max 10s)

### Local File Handling

**Loading local files:**
1. MCP server reads the file from disk into a Buffer
2. Base64-encodes it
3. Sends as a `"load"` message to the bridge client
4. Bridge client decodes to ArrayBuffer and sends via postMessage to Photopea

**Exporting to local path:**
1. MCP server sends an `"execute"` with `expectFiles: true` and the `saveToOE` script
2. Bridge client receives the ArrayBuffer from Photopea
3. Base64-encodes it, sends back to MCP server as a `"file"` response
4. MCP server writes the Buffer to the specified output path on disk

---

## 5. Local Web Page / Frontend

### Layout

```
+------------------------------------------------------+
|  +- Status Bar -------------------------------------+ |
|  | [*] Connected  |  Document: Banner  |  1920x1080 | |
|  +--------------------------------------------------+ |
|                                                      |
|  +- Photopea iframe --------------------------------+ |
|  |                                                  | |
|  |           (full Photopea editor)                 | |
|  |                                                  | |
|  |           User can see AND interact              | |
|  |           with the editor freely                 | |
|  |                                                  | |
|  +--------------------------------------------------+ |
|                                                      |
|  +- Activity Log (collapsible) ---------------------+ |
|  | 12:01:03  create_document 1920x1080 "Banner"     | |
|  | 12:01:04  set_background gradient #1a1a2e->#16213e| |
|  | 12:01:05  add_text "AI Summit 2026"              | |
|  | 12:01:05  apply_layer_style dropShadow           | |
|  +--------------------------------------------------+ |
+------------------------------------------------------+
```

### Components

**Status Bar** (top, thin strip)
- Connection indicator: CSS-styled dot (green when connected, red when disconnected) — no emojis
- Active document name and dimensions
- Reconnect button if connection drops

**Photopea iframe** (center, approximately 85% of viewport height)
- `src="https://www.photopea.com"` — loads the full Photopea editor
- User can freely interact alongside agent automation
- No locking — agent and user can both work on the same document

**Activity Log** (bottom, collapsible panel)
- Timestamped feed of tool calls being executed
- Human-readable summaries, not raw scripts
- Collapsible to maximize the Photopea view
- Auto-scrolls to latest entry
- Capped at last 100 entries

### Frontend Tech

- Single HTML file with inline CSS and JS — no build step, no framework
- Served by the MCP server's HTTP server
- WebSocket client connects to same host on same port (HTTP upgrade)
- Dark theme that complements Photopea's UI
- Total size well under 10KB

### User Interaction Model

The user is a spectator with full editing rights:
- They watch the agent work in real time
- They can pause and manually tweak things in Photopea at any time
- The agent can continue working on top of user changes (via `get_layers` / `get_document_info` to re-sync state)
- No conflict resolution needed — Photopea is single-threaded, commands execute sequentially

### Auto-Launch

- Server picks an available port (default 4117, fallback to random if taken)
- Opens the URL in the default browser via platform-appropriate command
- If the user closes the tab and tools are called, server returns: `"Browser not connected. Please open http://localhost:PORT"`

---

## 6. Error Handling

### Error Categories

**Connection errors:**

| Scenario | Response to Agent |
|---|---|
| Browser tab not open | `"Browser not connected. Ask the user to open http://localhost:PORT"` |
| WebSocket disconnects mid-operation | `"Connection lost during operation. Retrying..."` (auto-reconnect once, then fail) |
| Photopea iframe fails to load | `"Photopea failed to load. Check internet connection."` |
| Photopea never sends initial "done" | `"Photopea did not initialize within 30s. Reload the browser tab."` |

**Script errors:**

| Scenario | Response to Agent |
|---|---|
| Script throws a JS error | `"Script error: [message]. Check parameters."` with the failed script echoed back |
| Operation on non-existent layer | `"Layer 'xyz' not found. Use get_layers to see available layers."` |
| No active document when required | `"No document open. Use create_document or open_file first."` |
| Timeout (30s default) | `"Operation timed out. The script may be too complex or Photopea is unresponsive."` |

**File I/O errors:**

| Scenario | Response to Agent |
|---|---|
| Local file not found | `"File not found: /path/to/file. Verify the path exists."` |
| Permission denied | `"Permission denied reading /path/to/file."` |
| Export path not writable | `"Cannot write to /path/to/output. Check directory exists and is writable."` |
| URL unreachable | `"Failed to fetch URL: [url]. Status: [code]."` |

### Error Design Principles

1. **Every error is actionable.** Always tell the agent what to do next.
2. **Validate before sending to Photopea.** Check parameter types, required fields, and file existence on the server side before constructing scripts.
3. **No silent failures.** If Photopea does not error on a no-op (e.g., setting text on a locked layer), document it in tool descriptions so the agent is aware.
4. **Structured error format:**

```typescript
{
  isError: true,
  content: [{
    type: "text",
    text: "Layer 'header' not found. Use get_layers to see available layers."
  }]
}
```

---

## 7. Testing Strategy

### Three Testing Layers

**Layer 1: Unit Tests — Script Builder**

The script builder contains pure functions that translate tool inputs into Photopea JavaScript strings. Fully testable without a browser.

Coverage:
- Every tool generates valid Photopea JS
- Parameter validation (missing required fields, invalid types, out-of-range values)
- Edge cases (special characters in text, very large dimensions, empty strings)
- Workflow tools correctly compose multiple primitive scripts

**Layer 2: Integration Tests — WebSocket Bridge**

Test the full message flow with a mock iframe client that simulates Photopea's "done" protocol.

Coverage:
- Request/response correlation (IDs match)
- Sequential queue behavior (commands execute in order)
- Timeout handling (mock client never responds)
- File transfer round-trip (base64 encode/decode)
- Reconnection behavior
- Multiple rapid commands do not interleave

**Layer 3: End-to-End Tests — Real Photopea**

Scripted smoke tests that launch the full stack against the real Photopea iframe.

Coverage:
- Create a document, add text, export PNG — verify PNG is valid and non-empty
- Open a PSD from URL, read layers, verify structure
- `create_banner` produces a valid output file
- `apply_template_variables` on a test PSD swaps content correctly
- `get_preview` returns a valid base64 image

E2E tests run separately: `npm test` for fast tests, `npm run test:e2e` for full stack.

### Test Tooling

- **Test runner:** Vitest
- **E2E browser:** Playwright (dev dependency only, not a runtime dependency)
- **Coverage target:** 90%+ on script builder, 80%+ on bridge logic

### What We Do Not Test

- Photopea's internals
- Visual correctness of rendered output
- Network conditions beyond localhost

---

## 8. Project Structure

```
photopea-mcp/
  package.json
  tsconfig.json
  src/
    index.ts              # Entry point, MCP server setup
    server.ts             # MCP server with tool registration
    bridge/
      script-builder.ts   # Pure functions: tool inputs -> Photopea JS
      websocket-server.ts # WebSocket server + request queue
      types.ts            # Bridge message types
    tools/
      document.ts         # Document tool handlers
      layer.ts            # Layer tool handlers
      text.ts             # Text tool handlers
      shape.ts            # Shape tool handlers
      image.ts            # Image and composition tool handlers
      style.ts            # Layer style and gradient tool handlers
      selection.ts        # Selection tool handlers
      export.ts           # Export and preview tool handlers
      utility.ts          # run_script, undo, redo
      workflows.ts        # Tier 2 workflow tools
    frontend/
      index.html          # Single-file web page with inline CSS/JS
    utils/
      file-io.ts          # Local file read/write helpers
      url-fetch.ts        # URL fetching for remote assets
      port.ts             # Available port detection
      launch-browser.ts   # Platform-aware browser launch
  tests/
    unit/
      script-builder.test.ts
      parameter-validation.test.ts
    integration/
      websocket-bridge.test.ts
      file-transfer.test.ts
    e2e/
      smoke.test.ts
  README.md
```

---

## 9. Dependencies

**Runtime:**
- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `ws` — WebSocket server
- `zod` — Input validation and schema definition
- `open` — Cross-platform browser launch

**Dev:**
- `typescript`
- `vitest` — Test runner
- `playwright` — E2E tests only
- `@types/ws`

No heavy dependencies. No Puppeteer. No frameworks.

---

## 10. Open Questions (Resolved)

| Question | Resolution |
|---|---|
| Headless vs. browser-embedded? | Browser-embedded (iframe) for live preview |
| Language? | TypeScript |
| Who is the audience? | Open-source, for broad adoption |
| Input sources? | Both local files and URLs |
| Export workflow? | Both programmatic and manual |
