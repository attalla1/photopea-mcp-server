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
  hexToRgb,
  escapeString,
  buildAddText,
  buildEditText,
  buildAddShape,
  buildApplyAdjustment,
  buildApplyFilter,
  buildTransformLayer,
  buildAddGradient,
  buildMakeSelection,
  buildModifySelection,
  buildFillSelection,
  buildClearSelection,
  buildExportImage,
  buildCrop,
  buildResizeCanvas,
  buildTrim,
  buildRotateCanvas,
  buildLayerMask,
  buildSetClippingMask,
  buildAddAdjustmentLayer,
  buildMergeLayers,
  buildSetLayerStyle,
  buildFitToLayer,
  buildRunScript,
  buildUndo,
  buildRedo,
} from "../../src/bridge/script-builder.js";

describe("hexToRgb", () => {
  it("converts hex to RGB", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#1a1a2e")).toEqual({ r: 26, g: 26, b: 46 });
  });

  it("hexToRgb with black", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });
  it("hexToRgb with white", () => {
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
  });
  it("hexToRgb with mixed case", () => {
    expect(hexToRgb("#FfAa00")).toEqual({ r: 255, g: 170, b: 0 });
  });
});

describe("escapeString", () => {
  it("escapes backslashes", () => {
    expect(escapeString("path\\to\\file")).toBe("path\\\\to\\\\file");
  });
  it("escapes single quotes", () => {
    expect(escapeString("it's a test")).toBe("it\\'s a test");
  });
  it("escapes newlines", () => {
    expect(escapeString("line1\nline2")).toBe("line1\\nline2");
  });
  it("escapes carriage returns", () => {
    expect(escapeString("line1\rline2")).toBe("line1\\rline2");
  });
  it("handles combined special characters", () => {
    expect(escapeString("it's a\nnew\\path")).toBe("it\\'s a\\nnew\\\\path");
  });
  it("returns empty string unchanged", () => {
    expect(escapeString("")).toBe("");
  });
  it("returns plain string unchanged", () => {
    expect(escapeString("hello world")).toBe("hello world");
  });
});

describe("script-builder: document operations", () => {
  it("buildCreateDocument with all params", () => {
    const script = buildCreateDocument({ width: 1920, height: 1080, resolution: 72, name: "Banner", mode: "RGB", fillColor: "#1a1a2e" });
    expect(script).toContain("app.documents.add(1920, 1080, 72");
    expect(script).toContain("Banner");
    expect(script).toContain("NewDocumentMode.RGB");
    expect(script).toContain("SolidColor");
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

  it("buildResizeDocument", () => {
    const script = buildResizeDocument({ width: 1024, height: 768 });
    expect(script).toContain("resizeImage");
    expect(script).toContain("1024");
    expect(script).toContain("768");
  });

  it("buildCloseDocument with save", () => {
    const script = buildCloseDocument({ save: true });
    expect(script).toContain("close(1)");
  });

  it("buildCloseDocument without save", () => {
    const script = buildCloseDocument({ save: false });
    expect(script).toContain("close(2)");
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

  it("buildSetLayerProperties", () => {
    const script = buildSetLayerProperties({ target: "Header", opacity: 50, visible: false });
    expect(script).toContain("Header");
    expect(script).toContain("opacity = 50");
    expect(script).toContain("visible = false");
  });

  it("buildMoveLayer", () => {
    const script = buildMoveLayer({ target: "Logo", x: 100, y: 200 });
    expect(script).toContain("Logo");
    expect(script).toContain("translate");
  });

  it("buildDuplicateLayer", () => {
    const script = buildDuplicateLayer({ target: "Header", newName: "Header Copy" });
    expect(script).toContain("duplicate()");
    expect(script).toContain("Header Copy");
  });

  it("buildReorderLayer to top", () => {
    const script = buildReorderLayer({ target: "Logo", position: "top" });
    expect(script).toContain("Logo");
    expect(script).toContain("move");
  });

  it("buildGroupLayers", () => {
    const script = buildGroupLayers({ layers: ["Title", "Subtitle"], groupName: "Text Group" });
    expect(script).toContain("layerSets.add()");
    expect(script).toContain("Text Group");
    expect(script).toContain("Title");
    expect(script).toContain("Subtitle");
    expect(script).toContain("move");
  });

  it("buildGetLayers returns JSON tree", () => {
    const script = buildGetLayers();
    expect(script).toContain("app.echoToOE");
    expect(script).toContain("JSON.stringify");
  });
});

describe("script-builder: text operations", () => {
  it("buildAddText with all properties", () => {
    const script = buildAddText({ content: "Hello World", x: 100, y: 200, font: "Arial", size: 48, color: "#ffffff", alignment: "center", bold: true });
    expect(script).toContain("LayerKind.TEXT");
    expect(script).toContain("Hello World");
    expect(script).toContain("Arial");
    expect(script).toContain("48");
    expect(script).toContain("Justification.CENTER");
    expect(script).toContain("position");
    expect(script).toContain("100");
    expect(script).toContain("200");
    expect(script).toContain("fauxBold");
  });

  it("buildEditText modifies existing layer", () => {
    const script = buildEditText({ target: "Title", content: "New Title", size: 72 });
    expect(script).toContain("Title");
    expect(script).toContain("New Title");
    expect(script).toContain("72");
  });
});

describe("script-builder: shape operations", () => {
  it("buildAddShape rectangle", () => {
    const script = buildAddShape({ type: "rectangle", bounds: { x: 10, y: 10, width: 200, height: 100 }, fillColor: "#3366ff", name: "Button" });
    expect(script).toContain("Button");
    expect(script).toContain("SolidColor");
    expect(script).toContain("fill");
  });

  it("buildAddShape ellipse", () => {
    const script = buildAddShape({ type: "ellipse", bounds: { x: 50, y: 50, width: 100, height: 80 }, fillColor: "#ff0000" });
    // Photopea has no selectEllipse: the ellipse is a polygon whose points span the bounds
    expect(script).toContain("selection.select([[150,90]");
    expect(script).not.toContain("selectEllipse");
    expect(script).toContain("50");
    expect(script).toContain("150"); // x + width
    expect(script).toContain("130"); // y + height
    expect(script).toContain("SolidColor");
    expect(script).toContain("fill");
  });
});

describe("script-builder: image operations", () => {
  it("buildApplyFilter gaussian blur", () => {
    const script = buildApplyFilter({ type: "gaussian_blur", settings: { radius: 5 } });
    expect(script).toContain("applyGaussianBlur");
    expect(script).toContain("5");
  });

  it("buildTransformLayer scale and rotate", () => {
    const script = buildTransformLayer({ target: "Photo", scaleX: 1.5, scaleY: 1.5, rotation: 45 });
    expect(script).toContain("resize");
    expect(script).toContain("rotate");
    expect(script).toContain("45");
    expect(script).toContain("150");
  });

  it("buildApplyAdjustment brightness", () => {
    const script = buildApplyAdjustment({ type: "brightness", settings: { brightness: 20, contrast: 10 } });
    expect(script).toContain("adjustBrightnessContrast");
    expect(script).toContain("20");
    expect(script).toContain("10");
    expect(script).toContain("echoToOE");
  });

  it("buildApplyAdjustment hue_sat", () => {
    const script = buildApplyAdjustment({ type: "hue_sat", settings: { hue: 15, saturation: 30, lightness: -5 } });
    expect(script).toContain("adjustColorBalance");
    expect(script).toContain("15");
    expect(script).toContain("30");
    expect(script).toContain("-5");
  });

  it("buildApplyAdjustment levels", () => {
    const script = buildApplyAdjustment({ type: "levels", settings: { inputMin: 10, inputMax: 240, gamma: 1.2 } });
    expect(script).toContain("adjustLevels");
    expect(script).toContain("10");
    expect(script).toContain("240");
    expect(script).toContain("1.2");
  });

  it("buildApplyAdjustment curves", () => {
    const script = buildApplyAdjustment({ type: "curves", settings: { points: "[[0,0],[128,180],[255,255]]" } });
    expect(script).toContain("adjustCurves");
    expect(script).toContain("[[0,0],[128,180],[255,255]]");
  });
});

describe("script-builder: style operations", () => {
  it("buildAddGradient linear", () => {
    const script = buildAddGradient({ target: "BG", type: "linear", colors: ["#1a1a2e", "#16213e"], angle: 90 });
    expect(script).toContain("BG");
    expect(script).toContain("SolidColor");
    expect(script).toContain("selection.fill");
    expect(script).toContain("_gc0"); // first gradient step variable
    expect(script).toContain("_gc15"); // last gradient step variable (16 steps, 0-indexed)
  });
});

describe("script-builder: selection operations", () => {
  it("buildMakeSelection all", () => {
    expect(buildMakeSelection({ type: "all" })).toContain("selectAll");
  });

  it("buildMakeSelection rect", () => {
    const script = buildMakeSelection({ type: "rect", bounds: { x: 10, y: 10, width: 200, height: 100 } });
    expect(script).toContain("selection.select(");
    expect(script).toContain("10");
    expect(script).toContain("210"); // x + width
    expect(script).toContain("110"); // y + height
    expect(script).toContain("echoToOE");
  });

  it("buildModifySelection expand", () => {
    const script = buildModifySelection({ action: "expand", amount: 5 });
    expect(script).toContain("expand");
    expect(script).toContain("5");
  });

  it("buildFillSelection", () => {
    const script = buildFillSelection({ color: "#ff0000" });
    expect(script).toContain("fill");
    expect(script).toContain("255");
  });

  it("buildClearSelection", () => {
    expect(buildClearSelection()).toContain("deselect");
  });

});

describe("script-builder: export operations", () => {
  it("buildExportImage png", () => {
    const script = buildExportImage({ format: "png", outputPath: "/tmp/out.png" });
    expect(script).toContain("saveToOE");
    expect(script).toContain("png");
  });

  it("buildExportImage jpg with quality", () => {
    // Photopea takes quality as 0-1; the tool takes 1-100
    expect(buildExportImage({ format: "jpg", quality: 80, outputPath: "/tmp/out.jpg" })).toContain("'jpg:0.8'");
    expect(buildExportImage({ format: "webp", quality: 5, outputPath: "/tmp/out.webp" })).toContain("'webp:0.05'");
  });

});

describe("script-builder: utility operations", () => {
  it("buildRunScript passes through", () => {
    expect(buildRunScript("alert('hi');")).toBe("alert('hi');");
  });

  it("buildUndo multiple steps", () => {
    const script = buildUndo(3);
    expect(script).toContain("historyStates");
    expect(script).toContain("3");
    expect(script).toContain("echoToOE");
  });

  it("buildRedo multiple steps", () => {
    const script = buildRedo(2);
    expect(script).toContain("historyStates");
    expect(script).toContain("echoToOE");
    expect(script).toContain("2");
  });
});

describe("script-builder: canvas operations", () => {
  it("buildCrop converts x/y/width/height to bounds", () => {
    expect(buildCrop({ x: 10, y: 20, width: 100, height: 50 })).toContain("crop([10, 20, 110, 70])");
  });

  it("buildResizeCanvas maps anchors to AnchorPosition", () => {
    expect(buildResizeCanvas({ width: 10, height: 20, anchor: "bottom-right" })).toContain("resizeCanvas(10, 20, AnchorPosition.BOTTOMRIGHT)");
    expect(buildResizeCanvas({ width: 10, height: 20, anchor: "top" })).toContain("AnchorPosition.TOPCENTER");
    expect(buildResizeCanvas({ width: 10, height: 20, anchor: "center" })).toContain("AnchorPosition.MIDDLECENTER");
  });

  it("buildTrim maps basis to TrimType", () => {
    expect(buildTrim("transparent")).toContain("TrimType.TRANSPARENT");
    expect(buildTrim("top-left-color")).toContain("TrimType.TOPLEFT");
  });

  it("buildRotateCanvas rotates and/or flips", () => {
    const both = buildRotateCanvas({ angle: 90, flip: "vertical" });
    expect(both).toContain("rotateCanvas(90)");
    expect(both).toContain("flipCanvas(Direction.VERTICAL)");
    expect(buildRotateCanvas({ flip: "horizontal" })).not.toContain("rotateCanvas");
  });
});

describe("script-builder: masks, adjustment layers and styles", () => {
  it("buildLayerMask adds masks with the right mode and deletes them", () => {
    expect(buildLayerMask({ action: "hide_all" })).toContain("_c('HdAl')");
    expect(buildLayerMask({ action: "from_selection" })).toContain("_c('RvlS')");
    const del = buildLayerMask({ action: "delete", target: "Photo" });
    expect(del).toContain("_c('Dlt ')");
    expect(del).not.toContain("Usng");
    expect(del).toContain("activeLayer = app.activeDocument.layers.getByName('Photo')");
  });

  it("buildSetClippingMask sets grouped", () => {
    expect(buildSetClippingMask({ target: "Photo", enabled: true })).toContain(".grouped = true");
    expect(buildSetClippingMask({ target: 0, enabled: false })).toContain("layers[0].grouped = false");
  });

  it("buildAddAdjustmentLayer puts settings in the make descriptor", () => {
    expect(buildAddAdjustmentLayer({ type: "brightness", brightness: 40 })).toContain("_t.putInteger(_c('Brgh'), 40)");
    expect(buildAddAdjustmentLayer({ type: "hue_sat", hue: 30 })).toContain("_a.putInteger(_s('hue'), 30)");
    const levels = buildAddAdjustmentLayer({ type: "levels", inputMin: 10, inputMax: 200, gamma: 1.2 });
    expect(levels).toContain("_in.putInteger(10); _in.putInteger(200)");
    expect(levels).toContain("_c('Gmm '), 1.2");
  });

  it("buildMergeLayers picks the merge call", () => {
    expect(buildMergeLayers("down")).toContain("activeLayer.merge()");
    expect(buildMergeLayers("flatten")).toContain("flatten()");
  });

  it("buildSetLayerStyle includes only the requested effects", () => {
    const style = buildSetLayerStyle({ dropShadow: { color: "#ff0000" }, stroke: { color: "#00ff00", position: "inside" } });
    expect(style).toContain("_fx.putObject(_c('DrSh')");
    expect(style).toContain("_c('Rd  '), 255");
    expect(style).toContain("_c('InsF')");
    expect(style).not.toContain("_c('OrGl')");
    const cleared = buildSetLayerStyle({});
    expect(cleared).not.toMatch(/DrSh'\)|FrFX'\)|OrGl'\)/);
    expect(cleared).toContain("_c('setd')");
  });

  it("buildFitToLayer covers or contains, and clips on request", () => {
    const cover = buildFitToLayer({ placeholder: "Frame", fit: "cover", clip: true });
    expect(cover).toContain("Math.max(");
    expect(cover).toContain("_l.grouped = true");
    const contain = buildFitToLayer({ placeholder: "Frame", fit: "contain", clip: false });
    expect(contain).toContain("Math.min(");
    expect(contain).not.toContain("grouped");
  });
});
