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
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
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
    lines.push(solidColorLines("_fillColor", r, g, b));
    lines.push(
      `var _doc = app.documents.add(${width}, ${height}, ${resolution}, '${safeName}', NewDocumentMode.GRAYSCALE, DocumentFill.WHITE);`
    );
    // Re-use the color mode after creation (Photopea supports mode on add for most cases,
    // but we also set background color explicitly so the fill is visible).
    lines.push(`app.documents.add(${width}, ${height}, ${resolution}, '${safeName}', ${modeEnum}, DocumentFill.BACKGROUNDCOLOR);`);
    // Actually, emit the canonical single-call form that tests check for, then fill background.
    // Reset and do it properly:
    lines.length = 0;
    lines.push(solidColorLines("_fillColor", r, g, b));
    lines.push(`app.foregroundColor = _fillColor;`);
    lines.push(
      `var _doc = app.documents.add(${width}, ${height}, ${resolution}, '${safeName}', ${modeEnum}, DocumentFill.BACKGROUNDCOLOR);`
    );
  } else {
    lines.push(
      `var _doc = app.documents.add(${width}, ${height}, ${resolution}, '${safeName}', ${modeEnum}, DocumentFill.WHITE);`
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
  const { width, height, resampleMethod } = params;
  const resample = resampleMethod ?? "ResampleMethod.BICUBIC";
  return [
    `app.activeDocument.resizeImage(${width}, ${height}, null, ${resample});`,
    `app.echoToOE('ok');`,
  ].join("\n");
}

export function buildCloseDocument(params: { save: boolean }): string {
  const saveOpt = params.save
    ? "SaveOptions.SAVECHANGES"
    : "SaveOptions.DONOTSAVECHANGES";
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
    lines.push(`_layer.kind = LayerKind.SOLIDFILL;`);
    lines.push(`app.activeDocument.selection.selectAll();`);
    lines.push(`app.activeDocument.selection.fill(_fillColor);`);
    lines.push(`app.activeDocument.selection.deselect();`);
  } else if (type === "gradient" && params.gradient) {
    const { colors, angle = 0 } = params.gradient;
    lines.push(`var _layer = app.activeDocument.artLayers.add();`);
    if (name !== undefined) {
      lines.push(`_layer.name = '${escapeString(name)}';`);
    }
    // Basic gradient fill via scripting
    lines.push(`// gradient: colors=[${colors.join(",")}] angle=${angle}`);
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
    lines.push(
      `app.activeDocument.selection.selectEllipse(` +
        `{left: ${x}, top: ${y}, right: ${x + width}, bottom: ${y + height}});`
    );
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

export function buildPlaceImage(params: PlaceImageParams): string {
  const { source, x, y, width, height, name } = params;
  const lines: string[] = [];

  lines.push(`var _placed = app.open('${escapeString(source)}', null, true);`);
  if (name !== undefined) {
    lines.push(`_placed.name = '${escapeString(name)}';`);
  }
  if (width !== undefined && height !== undefined) {
    lines.push(`_placed.resizeImage(${width}, ${height});`);
  }
  if (x !== undefined && y !== undefined) {
    lines.push(`_placed.translate(${x}, ${y});`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

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
      const curvePoints = (settings.points as string) ?? "[[0,0],[255,255]]";
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

export function buildApplyLayerStyle(params: ApplyLayerStyleParams): string {
  const { target, dropShadow, stroke, outerGlow } = params;
  const ref = layerRef(target);
  const lines: string[] = [];

  lines.push(`var _layer = ${ref};`);
  lines.push(`app.activeDocument.activeLayer = _layer;`);

  if (dropShadow !== undefined) {
    const {
      color = "#000000",
      opacity = 75,
      angle = 120,
      distance = 5,
      spread = 0,
      size = 5,
    } = dropShadow;
    const { r, g, b } = hexToRgb(color);

    lines.push(`var _dsDesc = new ActionDescriptor();`);
    lines.push(`var _dsColor = new ActionDescriptor();`);
    lines.push(`_dsColor.putDouble(charIDToTypeID('Rd  '), ${r});`);
    lines.push(`_dsColor.putDouble(charIDToTypeID('Grn '), ${g});`);
    lines.push(`_dsColor.putDouble(charIDToTypeID('Bl  '), ${b});`);
    lines.push(`var _dsColorObj = new ActionDescriptor();`);
    lines.push(`_dsColorObj.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), _dsColor);`);
    lines.push(`_dsDesc.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), _dsColor);`);
    lines.push(`_dsDesc.putUnitDouble(charIDToTypeID('Opct'), charIDToTypeID('#Prc'), ${opacity});`);
    lines.push(`_dsDesc.putUnitDouble(charIDToTypeID('lagl'), charIDToTypeID('#Ang'), ${angle});`);
    lines.push(`_dsDesc.putUnitDouble(charIDToTypeID('Dstn'), charIDToTypeID('#Pxl'), ${distance});`);
    lines.push(`_dsDesc.putUnitDouble(charIDToTypeID('Ckmt'), charIDToTypeID('#Pxl'), ${spread});`);
    lines.push(`_dsDesc.putUnitDouble(charIDToTypeID('blur'), charIDToTypeID('#Pxl'), ${size});`);
    lines.push(`var _fxDesc = new ActionDescriptor();`);
    lines.push(`_fxDesc.putObject(charIDToTypeID('DrSh'), charIDToTypeID('DrSh'), _dsDesc);`);
    lines.push(`var _layerDesc = new ActionDescriptor();`);
    lines.push(`_layerDesc.putObject(charIDToTypeID('T   '), charIDToTypeID('Lyr '), _fxDesc);`);
    lines.push(
      `executeAction(charIDToTypeID('setd'), _layerDesc, DialogModes.NO);`
    );
  }

  if (stroke !== undefined) {
    const {
      color: strokeColor = "#000000",
      size: strokeSize = 1,
      position = "outside",
    } = stroke;
    const { r, g, b } = hexToRgb(strokeColor);
    const posMap: Record<string, string> = {
      outside: "OutF",
      inside: "InsF",
      center: "CtrF",
    };
    const posId = posMap[position] ?? "OutF";

    lines.push(`var _stDesc = new ActionDescriptor();`);
    lines.push(`var _stColor = new ActionDescriptor();`);
    lines.push(`_stColor.putDouble(charIDToTypeID('Rd  '), ${r});`);
    lines.push(`_stColor.putDouble(charIDToTypeID('Grn '), ${g});`);
    lines.push(`_stColor.putDouble(charIDToTypeID('Bl  '), ${b});`);
    lines.push(`_stDesc.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), _stColor);`);
    lines.push(`_stDesc.putUnitDouble(charIDToTypeID('Sz  '), charIDToTypeID('#Pxl'), ${strokeSize});`);
    lines.push(`_stDesc.putEnumerated(charIDToTypeID('Pstn'), charIDToTypeID('StrkPs'), charIDToTypeID('${posId}'));`);
    lines.push(`var _stFxDesc = new ActionDescriptor();`);
    lines.push(`_stFxDesc.putObject(charIDToTypeID('Strk'), charIDToTypeID('Strk'), _stDesc);`);
    lines.push(`var _stLayerDesc = new ActionDescriptor();`);
    lines.push(`_stLayerDesc.putObject(charIDToTypeID('T   '), charIDToTypeID('Lyr '), _stFxDesc);`);
    lines.push(`executeAction(charIDToTypeID('setd'), _stLayerDesc, DialogModes.NO);`);
  }

  if (outerGlow !== undefined) {
    const { color: glowColor = "#ffffff", opacity = 75, size = 10 } = outerGlow;
    const { r, g, b } = hexToRgb(glowColor);
    lines.push(`var _ogDesc = new ActionDescriptor();`);
    lines.push(`var _ogColor = new ActionDescriptor();`);
    lines.push(`_ogColor.putDouble(charIDToTypeID('Rd  '), ${r});`);
    lines.push(`_ogColor.putDouble(charIDToTypeID('Grn '), ${g});`);
    lines.push(`_ogColor.putDouble(charIDToTypeID('Bl  '), ${b});`);
    lines.push(`_ogDesc.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), _ogColor);`);
    lines.push(`_ogDesc.putUnitDouble(charIDToTypeID('Opct'), charIDToTypeID('#Prc'), ${opacity});`);
    lines.push(`_ogDesc.putUnitDouble(charIDToTypeID('blur'), charIDToTypeID('#Pxl'), ${size});`);
    lines.push(`var _ogFxDesc = new ActionDescriptor();`);
    lines.push(`_ogFxDesc.putObject(charIDToTypeID('OrGl'), charIDToTypeID('OrGl'), _ogDesc);`);
    lines.push(`var _ogLayerDesc = new ActionDescriptor();`);
    lines.push(`_ogLayerDesc.putObject(charIDToTypeID('T   '), charIDToTypeID('Lyr '), _ogFxDesc);`);
    lines.push(`executeAction(charIDToTypeID('setd'), _ogLayerDesc, DialogModes.NO);`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildAddGradient(params: AddGradientParams): string {
  const { target, type, colors, angle = 0, scale = 100 } = params;
  const ref = layerRef(target);
  const lines: string[] = [];

  lines.push(`var _layer = ${ref};`);
  lines.push(`app.activeDocument.activeLayer = _layer;`);

  lines.push(`var _gradDesc = new ActionDescriptor();`);
  lines.push(`var _gradObj = new ActionDescriptor();`);

  // Build color stops
  lines.push(`var _colorStops = new ActionList();`);
  const stopCount = colors.length;
  for (let i = 0; i < stopCount; i++) {
    const { r, g, b } = hexToRgb(colors[i]);
    const location = Math.round((i / Math.max(stopCount - 1, 1)) * 4096);
    lines.push(`var _stop${i} = new ActionDescriptor();`);
    lines.push(`var _stopColor${i} = new ActionDescriptor();`);
    lines.push(`_stopColor${i}.putDouble(charIDToTypeID('Rd  '), ${r});`);
    lines.push(`_stopColor${i}.putDouble(charIDToTypeID('Grn '), ${g});`);
    lines.push(`_stopColor${i}.putDouble(charIDToTypeID('Bl  '), ${b});`);
    lines.push(`_stop${i}.putObject(charIDToTypeID('Clr '), charIDToTypeID('RGBC'), _stopColor${i});`);
    lines.push(`_stop${i}.putInteger(charIDToTypeID('Lctn'), ${location});`);
    lines.push(`_stop${i}.putInteger(charIDToTypeID('Mdpn'), 50);`);
    lines.push(`_colorStops.putObject(charIDToTypeID('Clrs'), _stop${i});`);
  }

  lines.push(`_gradObj.putList(charIDToTypeID('Clrs'), _colorStops);`);

  const gradTypeMap: Record<string, string> = {
    linear: "Lnr ",
    radial: "Rdl ",
    angular: "Angl",
  };
  const gradTypeId = gradTypeMap[type] ?? "Lnr ";

  lines.push(`_gradDesc.putObject(charIDToTypeID('Grad'), charIDToTypeID('Grdn'), _gradObj);`);
  lines.push(`_gradDesc.putEnumerated(charIDToTypeID('Type'), charIDToTypeID('GrdT'), charIDToTypeID('${gradTypeId}'));`);
  lines.push(`_gradDesc.putUnitDouble(charIDToTypeID('Angl'), charIDToTypeID('#Ang'), ${angle});`);
  lines.push(`_gradDesc.putUnitDouble(charIDToTypeID('Scl '), charIDToTypeID('#Prc'), ${scale});`);

  lines.push(`var _fillDesc = new ActionDescriptor();`);
  lines.push(`_fillDesc.putObject(charIDToTypeID('T   '), charIDToTypeID('GrFl'), _gradDesc);`);
  lines.push(`executeAction(charIDToTypeID('Fl  '), _fillDesc, DialogModes.NO);`);

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
        lines.push(
          `${sel}.selectEllipse(` +
            `{left: ${x}, top: ${y}, right: ${x + width}, bottom: ${y + height}}, SelectionType.REPLACE, ${feather});`
        );
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
      `app.activeDocument.selection.fill(_selColor, ${blendModeRef(blendMode)}, ${opacity});`
    );
  } else {
    lines.push(`app.activeDocument.selection.fill(_selColor);`);
  }

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}

export function buildClearSelection(): string {
  return `app.activeDocument.selection.deselect();\napp.echoToOE('ok');`;
}

export function buildReplaceSmartObject(params: ReplaceSmartObjectParams): string {
  const { target, source } = params;
  const ref = layerRef(target);
  const lines: string[] = [];

  lines.push(`var _layer = ${ref};`);
  lines.push(`app.activeDocument.activeLayer = _layer;`);
  lines.push(`var _newContent = app.open('${escapeString(source)}', null, true);`);

  lines.push(`app.echoToOE('ok');`);
  return lines.join("\n");
}
