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
npm run build        # Compile TypeScript
```

## License

MIT
