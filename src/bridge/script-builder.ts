// src/bridge/script-builder.ts
// Pure functions that build Photopea-compatible JavaScript strings.

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
  AddTextParams,
  EditTextParams,
  AddShapeParams,
  ApplyAdjustmentParams,
  ApplyFilterParams,
  TransformLayerParams,
  AddGradientParams,
  MakeSelectionParams,
  ModifySelectionParams,
  FillSelectionParams,
  ExportImageParams,
  CropParams,
  ResizeCanvasParams,
  RotateCanvasParams,
  LayerMaskParams,
  AdjustmentLayerParams,
  LayerStyleParams,
  FitToLayerParams,
} from "./types.js";
import { ANCHORS } from "./types.js";

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/** Convert a CSS hex color string to {r, g, b} components (0-255). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

/** Escape a string for safe embedding inside single-quoted JS literals. */
export function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Emit a JS expression that resolves to a layer.
 * - string  → getByName
 * - number  → numeric index
 */
function layerRef(target: string | number): string {
  if (typeof target === "number") {
    return `app.activeDocument.layers[${target}]`;
  }
  return `app.activeDocument.layers.getByName('${escapeString(target)}')`;
}

/** Ellipse as a 64-point polygon: Photopea has no selectEllipse, but selection.select(points) works. */
function ellipsePoints(x: number, y: number, width: number, height: number): string {
  const pts = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return `[${+(x + width / 2 + (width / 2) * Math.cos(a)).toFixed(2)},${+(y + height / 2 + (height / 2) * Math.sin(a)).toFixed(2)}]`;
  });
  return `[${pts.join(",")}]`;
}

/** Map a human-readable blend mode string to the Photopea BlendMode enum value. */
function blendModeRef(mode: string): string {
  const map: Record<string, string> = {
    normal: "BlendMode.NORMAL",
    multiply: "BlendMode.MULTIPLY",
    screen: "BlendMode.SCREEN",
    overlay: "BlendMode.OVERLAY",
    darken: "BlendMode.DARKEN",
    lighten: "BlendMode.LIGHTEN",
    "color-dodge": "BlendMode.COLORDODGE",
    colordodge: "BlendMode.COLORDODGE",
    "color-burn": "BlendMode.COLORBURN",
    colorburn: "BlendMode.COLORBURN",
    "hard-light": "BlendMode.HARDLIGHT",
    hardlight: "BlendMode.HARDLIGHT",
    "soft-light": "BlendMode.SOFTLIGHT",
    softlight: "BlendMode.SOFTLIGHT",
    difference: "BlendMode.DIFFERENCE",
    exclusion: "BlendMode.EXCLUSION",
    hue: "BlendMode.HUE",
    saturation: "BlendMode.SATURATION",
    color: "BlendMode.COLOR",
    luminosity: "BlendMode.LUMINOSITY",
    dissolve: "BlendMode.DISSOLVE",
  };
  return map[mode.toLowerCase()] ?? "BlendMode.NORMAL";
}

/** Map a human-readable blend mode string to the Photopea ColorBlendMode enum value (used by selection.fill()). */
function colorBlendModeRef(mode: string): string {
  const map: Record<string, string> = {
    normal: "ColorBlendMode.NORMAL",
    multiply: "ColorBlendMode.MULTIPLY",
    screen: "ColorBlendMode.SCREEN",
    overlay: "ColorBlendMode.OVERLAY",
    darken: "ColorBlendMode.DARKEN",
    lighten: "ColorBlendMode.LIGHTEN",
    "color-dodge": "ColorBlendMode.COLORDODGE",
    colordodge: "ColorBlendMode.COLORDODGE",
    "color-burn": "ColorBlendMode.COLORBURN",
    colorburn: "ColorBlendMode.COLORBURN",
    "hard-light": "ColorBlendMode.HARDLIGHT",
    hardlight: "ColorBlendMode.HARDLIGHT",
    "soft-light": "ColorBlendMode.SOFTLIGHT",
    softlight: "ColorBlendMode.SOFTLIGHT",
    difference: "ColorBlendMode.DIFFERENCE",
    exclusion: "ColorBlendMode.EXCLUSION",
    dissolve: "ColorBlendMode.DISSOLVE",
    clear: "ColorBlendMode.CLEAR",
  };
  return map[mode.toLowerCase()] ?? "ColorBlendMode.NORMAL";
}

/** Map a color mode string to the Photopea NewDocumentMode enum value. */
function colorModeRef(mode: string): string {
  const map: Record<string, string> = {
    rgb: "NewDocumentMode.RGB",
    cmyk: "NewDocumentMode.CMYK",
    grayscale: "NewDocumentMode.GRAYSCALE",
    lab: "NewDocumentMode.LAB",
    bitmap: "NewDocumentMode.BITMAP",
  };
  return map[mode.toLowerCase()] ?? "NewDocumentMode.RGB";
}

/** Emit JS lines that build a SolidColor object and assign it to `varName`. */
function solidColorLines(varName: string, r: number, g: number, b: number): string {
  return [
    `var ${varName} = new SolidColor();`,
    `${varName}.rgb.red = ${r};`,
    `${varName}.rgb.green = ${g};`,
    `${varName}.rgb.blue = ${b};`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Document operations
// ---------------------------------------------------------------------------

export function buildCreateDocument(params: CreateDocumentParams): string {
  const {
    width,
    height,
    resolution = 72,
    name = "Untitled",
    mode = "RGB",
    fillColor,
  } = params;

  const modeEnum = colorModeRef(mode);
  const safeName = escapeString(name);

  const lines: string[] = [];

  if (fillColor) {
    const { r, g, b } = hexToRgb(fillColor);
    lines.push(
      `var _doc = app.documents.add(${width}, ${height}, ${resolution}, '${safeName}', ${modeEnum});`
    );
    lines.push(solidColorLines("_fillColor", r, g, b));
    lines.push(`_doc.selection.selectAll();`);
    lines.push(`_doc.selection.fill(_fillColor);`);
    lines.push(`_doc.selection.deselect();`);
  } else {
    lines.push(
      `var _doc = app.documents.add(${width}, ${height}, ${resolution}, '${safeName}', ${modeEnum});`
    );
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildGetDocumentInfo(): string {
  return `
var _d = app.activeDocument;
var _info = {
  name: _d.name,
  width: _d.width,
  height: _d.height,
  resolution: _d.resolution,
  layerCount: _d.layers.length,
  colorMode: _d.mode.toString()
};
app.echoToOE(JSON.stringify(_info));
`.trim();
}

export function buildResizeDocument(params: ResizeDocumentParams): string {
  const { width, height } = params;
  return [
    `app.activeDocument.resizeImage(${width}, ${height}, null, ResampleMethod.BICUBIC);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildCloseDocument(params: { save: boolean }): string {
  // SaveOptions enum: 1 = SAVECHANGES, 2 = DONOTSAVECHANGES
  const saveOpt = params.save ? 1 : 2;
  return `app.activeDocument.close(${saveOpt});`;
}

// ---------------------------------------------------------------------------
// Layer operations
// ---------------------------------------------------------------------------

export function buildAddLayer(params: AddLayerParams): string {
  const { name, opacity, blendMode } = params;
  const lines: string[] = [];
  lines.push(`var _layer = app.activeDocument.artLayers.add();`);
  if (name !== undefined) {
    lines.push(`_layer.name = '${escapeString(name)}';`);
  }
  if (opacity !== undefined) {
    lines.push(`_layer.opacity = ${opacity};`);
  }
  if (blendMode !== undefined) {
    lines.push(`_layer.blendMode = ${blendModeRef(blendMode)};`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildAddFillLayer(params: AddFillLayerParams): string {
  const { type, color, name } = params;
  const lines: string[] = [];

  if (type === "solid" && color) {
    const { r, g, b } = hexToRgb(color);
    lines.push(solidColorLines("_fillColor", r, g, b));
    lines.push(`var _layer = app.activeDocument.artLayers.add();`);
    if (name !== undefined) {
      lines.push(`_layer.name = '${escapeString(name)}';`);
    }
    lines.push(`app.activeDocument.selection.selectAll();`);
    lines.push(`app.activeDocument.selection.fill(_fillColor);`);
    lines.push(`app.activeDocument.selection.deselect();`);
  } else {
    lines.push(`var _layer = app.activeDocument.artLayers.add();`);
    if (name !== undefined) {
      lines.push(`_layer.name = '${escapeString(name)}';`);
    }
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildDeleteLayer(params: LayerTarget): string {
  const ref = layerRef(params.target);
  return [
    `var _layer = ${ref};`,
    `_layer.remove();`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildSelectLayer(params: LayerTarget): string {
  const ref = layerRef(params.target);
  return [
    `app.activeDocument.activeLayer = ${ref};`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildSetLayerProperties(params: SetLayerPropertiesParams): string {
  const { target, opacity, blendMode, visible, name: newName, locked } = params;
  const ref = layerRef(target);
  const lines: string[] = [];
  lines.push(`var _layer = ${ref};`);
  if (newName !== undefined) {
    lines.push(`_layer.name = '${escapeString(newName)}';`);
  }
  if (opacity !== undefined) {
    lines.push(`_layer.opacity = ${opacity};`);
  }
  if (blendMode !== undefined) {
    lines.push(`_layer.blendMode = ${blendModeRef(blendMode)};`);
  }
  if (visible !== undefined) {
    lines.push(`_layer.visible = ${visible};`);
  }
  if (locked !== undefined) {
    lines.push(`_layer.allLocked = ${locked};`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildMoveLayer(params: MoveLayerParams): string {
  const { target, x, y } = params;
  const ref = layerRef(target);
  return [
    `var _layer = ${ref};`,
    `_layer.translate(${x}, ${y});`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildDuplicateLayer(params: DuplicateLayerParams): string {
  const { target, newName } = params;
  const ref = layerRef(target);
  const lines: string[] = [];
  lines.push(`var _layer = ${ref};`);
  lines.push(`var _copy = _layer.duplicate();`);
  if (newName !== undefined) {
    lines.push(`_copy.name = '${escapeString(newName)}';`);
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildReorderLayer(params: ReorderLayerParams): string {
  const { target, position } = params;
  const ref = layerRef(target);
  const lines: string[] = [];
  lines.push(`var _layer = ${ref};`);

  switch (position) {
    case "top":
      lines.push(`_layer.move(app.activeDocument, ElementPlacement.PLACEATBEGINNING);`);
      break;
    case "bottom":
      lines.push(`_layer.move(app.activeDocument, ElementPlacement.PLACEATEND);`);
      break;
    case "above":
      lines.push(`_layer.move(app.activeDocument.activeLayer, ElementPlacement.PLACEBEFORE);`);
      break;
    case "below":
      lines.push(`_layer.move(app.activeDocument.activeLayer, ElementPlacement.PLACEAFTER);`);
      break;
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildGroupLayers(params: GroupLayersParams): string {
  const { layers, groupName } = params;
  const lines: string[] = [];

  lines.push(`var _group = app.activeDocument.layerSets.add();`);
  if (groupName !== undefined) {
    lines.push(`_group.name = '${escapeString(groupName)}';`);
  }

  // Move each named layer into the group
  for (const layerName of layers) {
    const safe = escapeString(layerName);
    lines.push(
      `app.activeDocument.layers.getByName('${safe}').move(_group, ElementPlacement.PLACEATEND);`
    );
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildGetLayers(): string {
  return `
function _collectLayers(collection, depth) {
  var result = [];
  for (var i = 0; i < collection.length; i++) {
    var l = collection[i];
    var entry = {
      name: l.name,
      index: i,
      type: l.typename,
      visible: l.visible,
      opacity: l.opacity,
      bounds: {
        x: l.bounds ? l.bounds[0].value : 0,
        y: l.bounds ? l.bounds[1].value : 0,
        width: l.bounds ? (l.bounds[2].value - l.bounds[0].value) : 0,
        height: l.bounds ? (l.bounds[3].value - l.bounds[1].value) : 0
      }
    };
    if (l.layers && l.layers.length > 0) {
      entry.children = _collectLayers(l.layers, depth + 1);
    }
    result.push(entry);
  }
  return result;
}
var _tree = _collectLayers(app.activeDocument.layers, 0);
app.echoToOE(JSON.stringify(_tree));
`.trim();
}

// ---------------------------------------------------------------------------
// Text operations
// ---------------------------------------------------------------------------

/** Map a text alignment string to the Photopea Justification enum value. */
function justificationRef(alignment: string): string {
  const map: Record<string, string> = {
    left: "Justification.LEFT",
    center: "Justification.CENTER",
    right: "Justification.RIGHT",
  };
  return map[alignment.toLowerCase()] ?? "Justification.LEFT";
}

export function buildAddText(params: AddTextParams): string {
  const {
    content,
    x,
    y,
    font,
    size,
    color,
    alignment,
    bold,
    italic,
    letterSpacing,
    lineHeight,
    paragraphBounds,
  } = params;

  const lines: string[] = [];
  lines.push(`var _layer = app.activeDocument.artLayers.add();`);
  lines.push(`_layer.kind = LayerKind.TEXT;`);
  lines.push(`var _ti = _layer.textItem;`);
  lines.push(`_ti.contents = '${escapeString(content)}';`);
  lines.push(`_ti.position = [${x}, ${y}];`);

  if (font !== undefined) {
    lines.push(`_ti.font = '${escapeString(font)}';`);
  }
  if (size !== undefined) {
    lines.push(`_ti.size = ${size};`);
  }
  if (color !== undefined) {
    const { r, g, b } = hexToRgb(color);
    lines.push(solidColorLines("_textColor", r, g, b));
    lines.push(`_ti.color = _textColor;`);
  }
  if (alignment !== undefined) {
    lines.push(`_ti.justification = ${justificationRef(alignment)};`);
  }
  if (bold !== undefined) {
    lines.push(`_ti.fauxBold = ${bold};`);
  }
  if (italic !== undefined) {
    lines.push(`_ti.fauxItalic = ${italic};`);
  }
  if (letterSpacing !== undefined) {
    lines.push(`_ti.tracking = ${letterSpacing};`);
  }
  if (lineHeight !== undefined) {
    lines.push(`_ti.leading = ${lineHeight};`);
  }
  if (paragraphBounds) {
    lines.push(`_ti.kind = TextType.PARAGRAPHTEXT;`);
    lines.push(`_ti.width = ${paragraphBounds.width};`);
    lines.push(`_ti.height = ${paragraphBounds.height};`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildEditText(params: EditTextParams): string {
  const { target, content, font, size, color, alignment, letterSpacing, lineHeight } = params;
  const ref = layerRef(target);
  const lines: string[] = [];

  lines.push(`var _layer = ${ref};`);
  lines.push(`var _ti = _layer.textItem;`);

  if (content !== undefined) {
    lines.push(`_ti.contents = '${escapeString(content)}';`);
  }
  if (font !== undefined) {
    lines.push(`_ti.font = '${escapeString(font)}';`);
  }
  if (size !== undefined) {
    lines.push(`_ti.size = ${size};`);
  }
  if (color !== undefined) {
    const { r, g, b } = hexToRgb(color);
    lines.push(solidColorLines("_textColor", r, g, b));
    lines.push(`_ti.color = _textColor;`);
  }
  if (alignment !== undefined) {
    lines.push(`_ti.justification = ${justificationRef(alignment)};`);
  }
  if (letterSpacing !== undefined) {
    lines.push(`_ti.tracking = ${letterSpacing};`);
  }
  if (lineHeight !== undefined) {
    lines.push(`_ti.leading = ${lineHeight};`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Shape operations
// ---------------------------------------------------------------------------

export function buildAddShape(params: AddShapeParams): string {
  const { type, bounds, fillColor, strokeColor, strokeWidth = 1, name } = params;
  const { x, y, width, height } = bounds;
  const lines: string[] = [];

  lines.push(`var _layer = app.activeDocument.artLayers.add();`);
  if (name !== undefined) {
    lines.push(`_layer.name = '${escapeString(name)}';`);
  }

  // Build the selection based on shape type
  if (type === "ellipse") {
    lines.push(`app.activeDocument.selection.select(${ellipsePoints(x, y, width, height)});`);
  } else {
    // rectangle and polygon both use a rectangular selection via polygon points
    lines.push(
      `app.activeDocument.selection.select(` +
        `[[${x},${y}],[${x + width},${y}],[${x + width},${y + height}],[${x},${y + height}]]);`
    );
  }

  if (fillColor !== undefined) {
    const { r, g, b } = hexToRgb(fillColor);
    lines.push(solidColorLines("_shapeColor", r, g, b));
    lines.push(`app.activeDocument.selection.fill(_shapeColor);`);
  }

  if (strokeColor !== undefined) {
    const { r, g, b } = hexToRgb(strokeColor);
    lines.push(solidColorLines("_strokeColor", r, g, b));
    lines.push(`app.activeDocument.selection.stroke(_strokeColor, ${strokeWidth});`);
  }

  lines.push(`app.activeDocument.selection.deselect();`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Image operations
// ---------------------------------------------------------------------------

export function buildApplyAdjustment(params: ApplyAdjustmentParams): string {
  const { type, settings = {} } = params;
  const lines: string[] = [];
  const layer = `app.activeDocument.activeLayer`;

  switch (type) {
    case "brightness": {
      const brightness = (settings.brightness as number) ?? 0;
      const contrast = (settings.contrast as number) ?? 0;
      lines.push(`${layer}.adjustBrightnessContrast(${brightness}, ${contrast});`);
      break;
    }
    case "hue_sat": {
      const hue = (settings.hue as number) ?? 0;
      const saturation = (settings.saturation as number) ?? 0;
      const lightness = (settings.lightness as number) ?? 0;
      lines.push(`${layer}.adjustColorBalance(${hue}, ${saturation}, ${lightness});`);
      break;
    }
    case "levels": {
      const inputMin = (settings.inputMin as number) ?? 0;
      const inputMax = (settings.inputMax as number) ?? 255;
      const gamma = (settings.gamma as number) ?? 1;
      const outputMin = (settings.outputMin as number) ?? 0;
      const outputMax = (settings.outputMax as number) ?? 255;
      lines.push(
        `${layer}.adjustLevels(${inputMin}, ${inputMax}, ${gamma}, ${outputMin}, ${outputMax});`
      );
      break;
    }
    case "curves": {
      const curvePoints = typeof settings.points === "string" && /^[\[\]0-9,.\s-]+$/.test(settings.points)
        ? settings.points
        : "[[0,0],[255,255]]";
      lines.push(`${layer}.adjustCurves(${curvePoints});`);
      break;
    }
    default:
      lines.push(`// Unknown adjustment type: ${type}`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildApplyFilter(params: ApplyFilterParams): string {
  const { type, settings = {} } = params;
  const lines: string[] = [];
  const layer = `app.activeDocument.activeLayer`;

  switch (type) {
    case "gaussian_blur": {
      const radius = (settings.radius as number) ?? 2;
      lines.push(`${layer}.applyGaussianBlur(${radius});`);
      break;
    }
    case "sharpen": {
      lines.push(`${layer}.applySharpen();`);
      break;
    }
    case "unsharp_mask": {
      const amount = (settings.amount as number) ?? 50;
      const radius = (settings.radius as number) ?? 1;
      const threshold = (settings.threshold as number) ?? 0;
      lines.push(`${layer}.applyUnSharpMask(${amount}, ${radius}, ${threshold});`);
      break;
    }
    case "noise": {
      const amount = (settings.amount as number) ?? 10;
      lines.push(`${layer}.applyAddNoise(${amount});`);
      break;
    }
    case "motion_blur": {
      const angle = (settings.angle as number) ?? 0;
      const distance = (settings.distance as number) ?? 10;
      lines.push(`${layer}.applyMotionBlur(${angle}, ${distance});`);
      break;
    }
    default:
      lines.push(`// Unknown filter type: ${type}`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildTransformLayer(params: TransformLayerParams): string {
  const { target, scaleX, scaleY, rotation, flipH, flipV } = params;
  const ref = layerRef(target);
  const lines: string[] = [];

  lines.push(`var _layer = ${ref};`);
  lines.push(`app.activeDocument.activeLayer = _layer;`);

  if (scaleX !== undefined || scaleY !== undefined) {
    const sx = scaleX !== undefined ? scaleX * 100 : 100;
    const sy = scaleY !== undefined ? scaleY * 100 : 100;
    lines.push(`_layer.resize(${sx}, ${sy});`);
  }
  if (rotation !== undefined) {
    lines.push(`_layer.rotate(${rotation});`);
  }
  if (flipH) {
    lines.push(`_layer.resize(-100, 100);`);
  }
  if (flipV) {
    lines.push(`_layer.resize(100, -100);`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Style operations
// ---------------------------------------------------------------------------

export function buildAddGradient(params: AddGradientParams): string {
  const { target, colors, angle = 0 } = params;
  const ref = layerRef(target);
  const lines: string[] = [];

  lines.push(`var _layer = ${ref};`);
  lines.push(`app.activeDocument.activeLayer = _layer;`);
  lines.push(`app.activeDocument.selection.selectAll();`);

  // Simulate gradient by filling horizontal or vertical bands with interpolated colors.
  // Fewer steps = faster execution; more steps = smoother result.
  const steps = 16;
  const radians = (angle * Math.PI) / 180;
  const isVertical = Math.abs(Math.cos(radians)) > Math.abs(Math.sin(radians));

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // Interpolate between color stops
    const segmentLen = 1 / (colors.length - 1);
    const segIdx = Math.min(Math.floor(t / segmentLen), colors.length - 2);
    const segT = (t - segIdx * segmentLen) / segmentLen;
    const c1 = hexToRgb(colors[segIdx]);
    const c2 = hexToRgb(colors[segIdx + 1]);
    const r = Math.round(c1.r + (c2.r - c1.r) * segT);
    const g = Math.round(c1.g + (c2.g - c1.g) * segT);
    const b = Math.round(c1.b + (c2.b - c1.b) * segT);

    lines.push(solidColorLines(`_gc${i}`, r, g, b));

    if (isVertical) {
      const y0 = `Math.round(${i} / ${steps} * app.activeDocument.height)`;
      const y1 = `Math.round(${i + 1} / ${steps} * app.activeDocument.height)`;
      lines.push(`app.activeDocument.selection.select([[0, ${y0}], [app.activeDocument.width, ${y0}], [app.activeDocument.width, ${y1}], [0, ${y1}]]);`);
    } else {
      const x0 = `Math.round(${i} / ${steps} * app.activeDocument.width)`;
      const x1 = `Math.round(${i + 1} / ${steps} * app.activeDocument.width)`;
      lines.push(`app.activeDocument.selection.select([[${x0}, 0], [${x1}, 0], [${x1}, app.activeDocument.height], [${x0}, app.activeDocument.height]]);`);
    }
    lines.push(`app.activeDocument.selection.fill(_gc${i});`);
  }

  lines.push(`app.activeDocument.selection.deselect();`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Selection operations
// ---------------------------------------------------------------------------

export function buildMakeSelection(params: MakeSelectionParams): string {
  const { type, bounds, feather = 0 } = params;
  const lines: string[] = [];
  const sel = `app.activeDocument.selection`;

  switch (type) {
    case "all":
      lines.push(`${sel}.selectAll();`);
      break;
    case "ellipse":
      if (bounds) {
        const { x, y, width, height } = bounds;
        lines.push(`${sel}.select(${ellipsePoints(x, y, width, height)}, SelectionType.REPLACE, ${feather});`);
      }
      break;
    case "rect":
    default:
      if (bounds) {
        const { x, y, width, height } = bounds;
        lines.push(
          `${sel}.select(` +
            `[[${x},${y}],[${x + width},${y}],[${x + width},${y + height}],[${x},${y + height}]], ` +
            `SelectionType.REPLACE, ${feather});`
        );
      }
      break;
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildModifySelection(params: ModifySelectionParams): string {
  const { action, amount = 0 } = params;
  const lines: string[] = [];
  const sel = `app.activeDocument.selection`;

  switch (action) {
    case "expand":
      lines.push(`${sel}.expand(${amount});`);
      break;
    case "contract":
      lines.push(`${sel}.contract(${amount});`);
      break;
    case "feather":
      lines.push(`${sel}.feather(${amount});`);
      break;
    case "invert":
      lines.push(`${sel}.invert();`);
      break;
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildFillSelection(params: FillSelectionParams): string {
  const { color, opacity = 100, blendMode } = params;
  const { r, g, b } = hexToRgb(color);
  const lines: string[] = [];

  lines.push(solidColorLines("_selColor", r, g, b));

  if (blendMode !== undefined) {
    lines.push(
      `app.activeDocument.selection.fill(_selColor, ${colorBlendModeRef(blendMode)}, ${opacity});`
    );
  } else {
    lines.push(`app.activeDocument.selection.fill(_selColor, ColorBlendMode.NORMAL, ${opacity});`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildClearSelection(): string {
  return `app.activeDocument.selection.deselect();\napp.echoToOE('ok');`;
}

// ---------------------------------------------------------------------------
// Canvas operations
// ---------------------------------------------------------------------------

export function buildCrop(params: CropParams): string {
  const { x, y, width, height } = params;
  return `app.activeDocument.crop([${x}, ${y}, ${x + width}, ${y + height}]);\napp.echoToOE('ok');`;
}

const ANCHOR_ENUM = ["TOPLEFT", "TOPCENTER", "TOPRIGHT", "MIDDLELEFT", "MIDDLECENTER", "MIDDLERIGHT", "BOTTOMLEFT", "BOTTOMCENTER", "BOTTOMRIGHT"];

export function buildResizeCanvas(params: ResizeCanvasParams): string {
  const anchor = ANCHOR_ENUM[ANCHORS.indexOf(params.anchor)];
  return `app.activeDocument.resizeCanvas(${params.width}, ${params.height}, AnchorPosition.${anchor});\napp.echoToOE('ok');`;
}

export function buildTrim(basis: "transparent" | "top-left-color" | "bottom-right-color"): string {
  const type = { transparent: "TRANSPARENT", "top-left-color": "TOPLEFT", "bottom-right-color": "BOTTOMRIGHT" }[basis];
  return `app.activeDocument.trim(TrimType.${type}, true, true, true, true);\napp.echoToOE('ok');`;
}

export function buildRotateCanvas(params: RotateCanvasParams): string {
  const lines: string[] = [];
  if (params.angle) lines.push(`app.activeDocument.rotateCanvas(${params.angle});`);
  if (params.flip) lines.push(`app.activeDocument.flipCanvas(Direction.${params.flip.toUpperCase()});`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Masks, adjustment layers and layer styles (Action Manager descriptors)
// ---------------------------------------------------------------------------

const AM_IDS = `var _c = function (k) { return app.charIDToTypeID(k); }; var _s = function (k) { return app.stringIDToTypeID(k); };`;

function selectTarget(target?: string | number): string {
  return target === undefined ? "" : `app.activeDocument.activeLayer = ${layerRef(target)};`;
}

export function buildLayerMask(params: LayerMaskParams): string {
  const lines = [AM_IDS, selectTarget(params.target), `var _d = new ActionDescriptor();`, `var _r = new ActionReference();`];
  lines.push(`_r.putEnumerated(_c('Chnl'), _c('Chnl'), _c('Msk '));`);
  if (params.action === "delete") {
    lines.push(`_d.putReference(_c('null'), _r);`, `app.executeAction(_c('Dlt '), _d, DialogModes.NO);`);
  } else {
    const using = { reveal_all: "RvlA", hide_all: "HdAl", from_selection: "RvlS" }[params.action];
    lines.push(
      `_d.putClass(_c('Nw  '), _c('Chnl'));`,
      `_d.putReference(_c('At  '), _r);`,
      `_d.putEnumerated(_c('Usng'), _c('UsrM'), _c('${using}'));`,
      `app.executeAction(_c('Mk  '), _d, DialogModes.NO);`,
    );
  }
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildSetClippingMask(params: LayerTarget & { enabled: boolean }): string {
  return `${layerRef(params.target)}.grouped = ${params.enabled};\napp.echoToOE('ok');`;
}

export function buildAddAdjustmentLayer(params: AdjustmentLayerParams): string {
  // Settings go straight into the "make" descriptor; a separate "set" step is ignored for brightness
  let typeClass: string;
  let body: string;
  if (params.type === "brightness") {
    typeClass = `_c('BrgC')`;
    body = `_t.putInteger(_c('Brgh'), ${params.brightness ?? 0}); _t.putInteger(_c('Cntr'), ${params.contrast ?? 0}); _t.putBoolean(_s('useLegacy'), false);`;
  } else if (params.type === "hue_sat") {
    typeClass = `_s('hueSaturation')`;
    body = `_t.putBoolean(_s('colorize'), false); var _l = new ActionList(); var _a = new ActionDescriptor(); _a.putInteger(_s('hue'), ${params.hue ?? 0}); _a.putInteger(_s('saturation'), ${params.saturation ?? 0}); _a.putInteger(_s('lightness'), ${params.lightness ?? 0}); _l.putObject(_s('hueSatAdjustmentV2'), _a); _t.putList(_s('adjustment'), _l);`;
  } else {
    typeClass = `_c('Lvls')`;
    body = `var _l = new ActionList(); var _a = new ActionDescriptor(); var _ch = new ActionReference(); _ch.putEnumerated(_c('Chnl'), _c('Chnl'), _c('Cmps')); _a.putReference(_c('Chnl'), _ch); var _in = new ActionList(); _in.putInteger(${params.inputMin ?? 0}); _in.putInteger(${params.inputMax ?? 255}); _a.putList(_c('Inpt'), _in); _a.putDouble(_c('Gmm '), ${params.gamma ?? 1}); _l.putObject(_s('levelsAdjustment'), _a); _t.putList(_s('adjustment'), _l);`;
  }
  return [
    AM_IDS,
    `var _mk = new ActionDescriptor(); var _mr = new ActionReference(); _mr.putClass(_c('AdjL')); _mk.putReference(_c('null'), _mr);`,
    `var _u = new ActionDescriptor(); var _t = new ActionDescriptor();`,
    body,
    `_u.putObject(_c('Type'), ${typeClass}, _t); _mk.putObject(_c('Usng'), _c('AdjL'), _u);`,
    `app.executeAction(_c('Mk  '), _mk, DialogModes.NO);`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildMergeLayers(mode: "down" | "flatten"): string {
  const op = { down: "activeLayer.merge()", flatten: "flatten()" }[mode];
  return `app.activeDocument.${op};\napp.echoToOE('ok');`;
}

/** Replace the layer's effects with the given ones; no effects clears the style. */
export function buildSetLayerStyle(params: LayerStyleParams): string {
  const color = (v: string, hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    return `var _k = new ActionDescriptor(); _k.putDouble(_c('Rd  '), ${r}); _k.putDouble(_c('Grn '), ${g}); _k.putDouble(_c('Bl  '), ${b}); ${v}.putObject(_c('Clr '), _c('RGBC'), _k);`;
  };
  const lines = [
    AM_IDS,
    selectTarget(params.target),
    // Photopea crashes on shadow/glow descriptors that lack noise, anti-alias and contour fields
    `function _base(e, opacity) { e.putBoolean(_c('enab'), true); e.putEnumerated(_c('Md  '), _c('BlnM'), _c('Nrml')); e.putUnitDouble(_c('Opct'), _c('#Prc'), opacity); e.putUnitDouble(_c('Nose'), _c('#Prc'), 0); e.putBoolean(_c('AntA'), false);`,
    `  var tr = new ActionDescriptor(); tr.putString(_c('Nm  '), 'Linear'); var cv = new ActionList();`,
    `  var p1 = new ActionDescriptor(); p1.putDouble(_c('Hrzn'), 0); p1.putDouble(_c('Vrtc'), 0); cv.putObject(_c('CrPt'), p1);`,
    `  var p2 = new ActionDescriptor(); p2.putDouble(_c('Hrzn'), 255); p2.putDouble(_c('Vrtc'), 255); cv.putObject(_c('CrPt'), p2);`,
    `  tr.putList(_c('Crv '), cv); e.putObject(_c('TrnS'), _c('ShpC'), tr); }`,
    `var _fx = new ActionDescriptor(); _fx.putUnitDouble(_c('Scl '), _c('#Prc'), 100);`,
  ];
  const { dropShadow: ds, outerGlow: og, stroke: st } = params;
  if (ds) {
    lines.push(
      `var _e = new ActionDescriptor(); _base(_e, ${ds.opacity ?? 75}); ${color("_e", ds.color)}`,
      `_e.putBoolean(_c('uglg'), false); _e.putUnitDouble(_c('lagl'), _c('#Ang'), ${ds.angle ?? 135}); _e.putUnitDouble(_c('Dstn'), _c('#Pxl'), ${ds.distance ?? 10});`,
      `_e.putUnitDouble(_c('Ckmt'), _c('#Pxl'), 0); _e.putUnitDouble(_c('blur'), _c('#Pxl'), ${ds.size ?? 10}); _e.putBoolean(_s('layerConceals'), true);`,
      `_fx.putObject(_c('DrSh'), _c('DrSh'), _e);`,
    );
  }
  if (og) {
    lines.push(
      `var _e = new ActionDescriptor(); _base(_e, ${og.opacity ?? 75}); ${color("_e", og.color)}`,
      `_e.putUnitDouble(_c('Ckmt'), _c('#Pxl'), 0); _e.putUnitDouble(_c('blur'), _c('#Pxl'), ${og.size ?? 20}); _e.putEnumerated(_c('GlwT'), _c('BETE'), _c('SfBL')); _e.putUnitDouble(_c('ShdN'), _c('#Prc'), 0); _e.putUnitDouble(_c('Inpr'), _c('#Prc'), 50);`,
      `_fx.putObject(_c('OrGl'), _c('OrGl'), _e);`,
    );
  }
  if (st) {
    const style = { outside: "OutF", inside: "InsF", center: "CtrF" }[st.position ?? "outside"];
    lines.push(
      `var _e = new ActionDescriptor(); _e.putBoolean(_c('enab'), true); _e.putEnumerated(_c('Styl'), _c('FStl'), _c('${style}')); _e.putEnumerated(_c('PntT'), _c('FrFl'), _c('SClr'));`,
      `_e.putEnumerated(_c('Md  '), _c('BlnM'), _c('Nrml')); _e.putUnitDouble(_c('Opct'), _c('#Prc'), ${st.opacity ?? 100}); _e.putUnitDouble(_c('Sz  '), _c('#Pxl'), ${st.size ?? 3}); ${color("_e", st.color)}`,
      `_fx.putObject(_c('FrFX'), _c('FrFX'), _e);`,
    );
  }
  lines.push(
    `var _d = new ActionDescriptor(); var _r = new ActionReference(); _r.putProperty(_c('Prpr'), _c('Lefx')); _r.putEnumerated(_c('Lyr '), _c('Ordn'), _c('Trgt')); _d.putReference(_c('null'), _r);`,
    `_d.putObject(_c('T   '), _c('Lefx'), _fx); app.executeAction(_c('setd'), _d, DialogModes.NO);`,
    `app.echoToOE('ok');`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** Scale the active layer to cover/contain the placeholder's bounds, center it above the placeholder, optionally clip to it. */
export function buildFitToLayer(params: FitToLayerParams): string {
  return [
    `var _d = app.activeDocument; var _p = ${layerRef(params.placeholder)}; var _l = _d.activeLayer;`,
    // Photopea's bound values add up wrongly with "+", so convert them to plain numbers first
    `function _n(b) { return [b[0] * 1, b[1] * 1, b[2] * 1, b[3] * 1]; }`,
    `var _pb = _n(_p.bounds), _lb = _n(_l.bounds);`,
    `var _f = Math.${params.fit === "cover" ? "max" : "min"}((_pb[2] - _pb[0]) / (_lb[2] - _lb[0]), (_pb[3] - _pb[1]) / (_lb[3] - _lb[1])) * 100;`,
    `_l.resize(_f, _f, AnchorPosition.MIDDLECENTER); _lb = _n(_l.bounds);`,
    `_l.translate((_pb[0] + _pb[2] - _lb[0] - _lb[2]) / 2, (_pb[1] + _pb[3] - _lb[1] - _lb[3]) / 2);`,
    `_l.move(_p, ElementPlacement.PLACEBEFORE);`,
    params.clip ? `_l.grouped = true;` : "",
    `app.echoToOE('ok');`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Export operations
// ---------------------------------------------------------------------------

export function buildExportImage(params: ExportImageParams): string {
  const { format, quality } = params;
  const lines: string[] = [];

  // Photopea takes quality as 0-1 after the colon; the tool takes 1-100
  const formatStr = (format === "jpg" || format === "webp") && quality !== undefined ? `${format}:${quality / 100}` : format;

  lines.push(`app.activeDocument.saveToOE('${formatStr}');`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Utility operations
// ---------------------------------------------------------------------------

export function buildRunScript(script: string): string {
  return script;
}

export function buildUndo(steps: number = 1): string {
  const lines: string[] = [];
  lines.push(`var _hs = app.activeDocument.historyStates;`);
  lines.push(`var _target = Math.max(0, _hs.length - 1 - ${steps});`);
  lines.push(`app.activeDocument.activeHistoryState = _hs[_target];`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildRedo(steps: number): string {
  const lines: string[] = [];
  lines.push(`var _hs = app.activeDocument.historyStates;`);
  lines.push(`var _cur = 0;`);
  lines.push(`for (var _i = 0; _i < _hs.length; _i++) { if (_hs[_i] === app.activeDocument.activeHistoryState) { _cur = _i; break; } }`);
  lines.push(`var _target = Math.min(_hs.length - 1, _cur + ${steps});`);
  lines.push(`app.activeDocument.activeHistoryState = _hs[_target];`);
  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

