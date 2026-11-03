<p align="center">
  <img src="assets/photopea-icon.svg" alt="Photopea" width="120" height="120">
</p>

<h1 align="center">Photopea MCP Server</h1>

<p align="center">
  Design posters, edit photos, and transform images directly from your terminal. Powered by <a href="https://www.photopea.com">Photopea</a> -- a free, browser-based alternative to Photoshop -- connected to your AI agent via <a href="https://modelcontextprotocol.io">MCP</a>.
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/attalla1/photopea-mcp-server"><img src="https://glama.ai/mcp/servers/attalla1/photopea-mcp-server/badges/score.svg" alt="Glama score"></a>
  <a href="https://github.com/attalla1/photopea-mcp-server/actions/workflows/ci.yml"><img src="https://github.com/attalla1/photopea-mcp-server/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/photopea-mcp-server"><img src="https://img.shields.io/npm/v/photopea-mcp-server.svg" alt="npm version"></a>
  <a href="https://github.com/attalla1/photopea-mcp-server/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/photopea-mcp-server.svg" alt="node"></a>
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/attalla1/photopea-mcp-server"><img src="https://glama.ai/mcp/servers/attalla1/photopea-mcp-server/badges/card.svg" alt="photopea-mcp-server MCP server"></a>
</p>

## Demo

<p align="center">
  <img src="assets/demo.gif" alt="Demo" width="1000">
</p>

<p align="center">
  <em>Prompt used in this demo: <a href="examples/album-cover-demo.md">examples/album-cover-demo.md</a></em>
</p>

## How It Works

```mermaid
graph LR
    A[Agent] <-->|stdio| B[MCP Server]
    B <-->|WebSocket| C[Browser]
    C <-->|postMessage| D[Photopea]
```

Your agent sends editing commands through the MCP protocol. The server translates these into Photopea JavaScript API calls and executes them via a WebSocket bridge to the browser.

**Note:** A browser window will open automatically on the first tool call. This is expected -- Photopea runs entirely in the browser and the server needs it to perform image editing operations. If you close the tab, the next tool call opens it again.

## Quick Start

```bash
claude mcp add -s user photopea -- npx -y photopea-mcp-server
```

Then start a new Claude Code session and ask it to edit images. The Photopea editor will open in your browser automatically on the first tool call.

## Installation

### Claude Code

**npx (recommended):**

```bash
claude mcp add -s user photopea -- npx -y photopea-mcp-server
```

**Global install:**

```bash
npm install -g photopea-mcp-server
claude mcp add -s user photopea -- photopea-mcp-server
```

### Claude Desktop

Add to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "photopea": {
      "command": "npx",
      "args": ["-y", "photopea-mcp-server"]
    }
  }
}
```

### Cursor

Add to Cursor MCP settings (`.cursor/mcp.json` in your project or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "photopea": {
      "command": "npx",
      "args": ["-y", "photopea-mcp-server"]
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "photopea": {
      "command": "npx",
      "args": ["-y", "photopea-mcp-server"]
    }
  }
}
```

### Windsurf

Add to Windsurf MCP settings (`~/.windsurf/mcp.json`):

```json
{
  "mcpServers": {
    "photopea": {
      "command": "npx",
      "args": ["-y", "photopea-mcp-server"]
    }
  }
}
```

## Available Tools

### Document (9 tools)

| Tool | Description |
|------|-------------|
| `photopea_create_document` | Create a new document with specified dimensions and settings |
| `photopea_open_file` | Open an image from a URL or local file path |
| `photopea_get_document_info` | Get active document info (name, dimensions, resolution, color mode) |
| `photopea_resize_document` | Resize the active document (resamples content to fit) |
| `photopea_close_document` | Close the active document |
| `photopea_crop` | Crop to a rectangle |
| `photopea_resize_canvas` | Change the canvas size without scaling content, with an anchor |
| `photopea_trim` | Trim transparent or solid-color borders |
| `photopea_rotate_canvas` | Rotate and/or flip the whole document |

### Layer (16 tools)

| Tool | Description |
|------|-------------|
| `photopea_add_layer` | Add a new empty art layer |
| `photopea_add_fill_layer` | Add a solid color fill layer |
| `photopea_delete_layer` | Delete a layer by name or index |
| `photopea_select_layer` | Make a layer active by name or index |
| `photopea_set_layer_properties` | Set opacity, blend mode, visibility, name, or lock state |
| `photopea_move_layer` | Translate a layer by x/y offset |
| `photopea_duplicate_layer` | Duplicate a layer with optional new name |
| `photopea_reorder_layer` | Move a layer in the stack (above, below, top, bottom) |
| `photopea_group_layers` | Group named layers into a layer group |
| `photopea_ungroup_layers` | Ungroup a layer group |
| `photopea_get_layers` | Get the full layer tree as JSON |
| `photopea_layer_mask` | Add a reveal-all, hide-all or from-selection mask, or delete it |
| `photopea_set_clipping_mask` | Clip a layer to the layer below it |
| `photopea_add_adjustment_layer` | Non-destructive brightness/contrast, hue/saturation or levels layer |
| `photopea_merge_layers` | Merge down or flatten |
| `photopea_set_layer_style` | Drop shadow, outer glow and stroke effects |

### Text & Shape (3 tools)

| Tool | Description |
|------|-------------|
| `photopea_add_text` | Add a text layer at specified coordinates |
| `photopea_edit_text` | Edit content or style of an existing text layer |
| `photopea_add_shape` | Add a shape (rectangle or ellipse) |

### Image & Effects (10 tools)

| Tool | Description |
|------|-------------|
| `photopea_place_image` | Place an image from URL or local path |
| `photopea_fill_placeholder` | Fit an image into a template's placeholder layer and clip it to its shape |
| `photopea_apply_adjustment` | Apply brightness/contrast, hue/saturation, levels, or curves |
| `photopea_apply_filter` | Apply gaussian blur, sharpen, unsharp mask, noise, or motion blur |
| `photopea_transform_layer` | Scale, rotate, or flip a layer |
| `photopea_add_gradient` | Apply a linear gradient fill |
| `photopea_make_selection` | Create a rectangular, elliptical, or full selection |
| `photopea_modify_selection` | Expand, contract, feather, or invert a selection |
| `photopea_fill_selection` | Fill the current selection with a color |
| `photopea_clear_selection` | Deselect the current selection |

### Export & Utility (8 tools)

| Tool | Description |
|------|-------------|
| `photopea_get_preview` | Return a downscaled PNG of the document so the agent can see its work |
| `photopea_export_image` | Export to PNG, JPG, WebP, PSD, or SVG |
| `photopea_batch_process` | Open many images, run a script on each, export them to a folder |
| `photopea_load_font` | Load a custom font from a URL (TTF, OTF, WOFF2) |
| `photopea_list_fonts` | List available fonts, with optional search filter |
| `photopea_run_script` | Execute arbitrary Photopea JavaScript |
| `photopea_undo` | Undo one or more actions |
| `photopea_redo` | Redo one or more actions |

## Usage Examples

Once installed, ask your agent to perform image editing tasks:

**Create a poster:**
> "Create a 1920x1080 document with a dark blue background, add the title 'Hello World' in white 72px Arial, and export it as a PNG to ~/Desktop/poster.png"

**Edit a photo:**
> "Open ~/photos/portrait.jpg, increase the brightness by 30, apply a slight gaussian blur of 2px, and export as JPG to ~/Desktop/edited.jpg"

**Composite images:**
> "Create a 1200x630 document, place ~/assets/background.png as the base layer, then place ~/assets/logo.png and move it to the top-right corner"

**Fill a template:**
> "Open ~/templates/post.psd, put ~/photos/product.jpg into the 'Photo' layer, change the 'Title' text to 'Summer Sale', check the preview, and export as PNG"

**Batch convert:**
> "Resize every JPG in ~/photos to 1200px wide and save them as WebP in ~/photos/web"

**Batch adjustments:**
> "Open ~/photos/sunset.jpg, apply hue/saturation with +20 saturation, apply an unsharp mask with amount 50 and radius 2, then export as PNG"

## Development

```bash
git clone https://github.com/attalla1/photopea-mcp-server.git
cd photopea-mcp-server
npm install
npm run build
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode with auto-reload |
| `npm test` | Run unit and integration tests |
| `npm start` | Start the server |

### Architecture

The server has four main components:

**MCP Server** (`src/server.ts`) -- Registers all 46 tools with the MCP SDK and connects via stdio transport.

**WebSocket Bridge** (`src/bridge/websocket-server.ts`) -- Manages the connection between the MCP server and the browser. Queues script execution requests and handles responses with timeouts.

**Script Builder** (`src/bridge/script-builder.ts`) -- Pure functions that translate tool parameters into Photopea JavaScript API calls. Each builder function generates a script string that Photopea can execute.

**Browser Frontend** (`src/frontend/index.html`) -- A single-page app that loads Photopea in an iframe, connects to the WebSocket bridge, and relays scripts to Photopea via `postMessage`. Returns results back through the WebSocket.

```
src/
  index.ts              # Entry point: HTTP server, browser launch, MCP startup
  server.ts             # MCP server initialization and tool registration
  bridge/
    websocket-server.ts # WebSocket bridge with request queue
    script-builder.ts   # Photopea JS code generators
    types.ts            # Protocol message types
  tools/
    document.ts         # Document and canvas operations (9 tools)
    layer.ts            # Layers, masks, adjustment layers, styles (16 tools)
    text.ts             # Text and shape operations (3 tools)
    image.ts            # Image, adjustment, filter, template operations (10 tools)
    export.ts           # Preview, export, batch and utility operations (8 tools)
  utils/
    file-io.ts          # Local file read/write, URL fetching
    platform.ts         # Port discovery, browser launch
  frontend/
    index.html          # Browser UI with Photopea iframe
```

## Security

- The MCP server talks to your agent over stdio. Its browser bridge binds to `127.0.0.1` (localhost only) and is not accessible from the network.
- The bridge only accepts WebSocket connections from its own page, and that page cannot be framed or scripted by other sites. A website open in the same browser cannot take over the session or read your files.
- The `photopea_run_script` tool executes arbitrary JavaScript inside Photopea's sandboxed iframe. It is marked as destructive, so MCP clients that honor tool annotations can ask for approval before running it.
- File operations (`open_file`, `export_image`, `place_image`) read and write files with the same permissions as the user running the server.

## Known Limitations

- Heavy scripts (e.g., gradients with many color steps) may cause the Photopea browser UI to become unresponsive. The operations still complete successfully in the background and exports will work as expected.
- Refreshing the browser page will discard all unsaved work. Export your documents before refreshing.
- Only one bridge tab is active at a time. If you open another, the newest tab takes over and the older one shows "Session moved to another tab". Documents open in the older tab are not carried over.
- The `reorder_layer` tool may cause the Photopea UI to become unresponsive. To avoid this, create layers in the desired order rather than reordering after creation.

## Requirements

- Node.js >= 18
- A modern web browser (Chrome, Firefox, Edge, Safari)

## License

MIT
