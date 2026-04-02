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
  buildExportImage,
  buildGetPreview,
  buildRunScript,
  buildUndo,
  buildRedo,
  buildSetBackground,
  buildCreateBanner,
  buildLoadTemplate,
  buildApplyTemplateVariables,
  buildComposeLayers,
} from "../../src/bridge/script-builder.js";

describe("hexToRgb", () => {
  it("converts hex to RGB", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#1a1a2e")).toEqual({ r: 26, g: 26, b: 46 });
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
    expect(script).toContain("close");
    expect(script).toContain("SaveOptions.SAVECHANGES");
  });

  it("buildCloseDocument without save", () => {
    const script = buildCloseDocument({ save: false });
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
});

describe("script-builder: image operations", () => {
  it("buildPlaceImage from URL", () => {
    const script = buildPlaceImage({ source: "https://example.com/photo.jpg", name: "Photo" });
    expect(script).toContain("app.open");
    expect(script).toContain("https://example.com/photo.jpg");
  });

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
  });
});

describe("script-builder: style operations", () => {
  it("buildApplyLayerStyle with drop shadow", () => {
    const script = buildApplyLayerStyle({ target: "Title", dropShadow: { color: "#000000", opacity: 75, distance: 5, size: 10 } });
    expect(script).toContain("Title");
    expect(script).toContain("DrSh");
  });

  it("buildAddGradient linear", () => {
    const script = buildAddGradient({ target: "BG", type: "linear", colors: ["#1a1a2e", "#16213e"], angle: 90 });
    expect(script).toContain("BG");
    expect(script).toContain("Grad");
  });
});

describe("script-builder: selection operations", () => {
  it("buildMakeSelection all", () => {
    expect(buildMakeSelection({ type: "all" })).toContain("selectAll");
  });

  it("buildMakeSelection rect", () => {
    const script = buildMakeSelection({ type: "rect", bounds: { x: 10, y: 10, width: 200, height: 100 } });
    expect(script).toContain("select");
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

  it("buildReplaceSmartObject", () => {
    const script = buildReplaceSmartObject({ target: "Logo", source: "https://example.com/logo.png" });
    expect(script).toContain("Logo");
    expect(script).toContain("app.open");
  });
});

describe("script-builder: export operations", () => {
  it("buildExportImage png", () => {
    const script = buildExportImage({ format: "png", outputPath: "/tmp/out.png" });
    expect(script).toContain("saveToOE");
    expect(script).toContain("png");
  });

  it("buildExportImage jpg with quality", () => {
    const script = buildExportImage({ format: "jpg", quality: 80, outputPath: "/tmp/out.jpg" });
    expect(script).toContain("jpg:80");
  });

  it("buildGetPreview with max dimensions", () => {
    const script = buildGetPreview({ maxWidth: 400, maxHeight: 300 });
    expect(script).toContain("saveToOE");
    expect(script).toContain("png");
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
  });

  it("buildRedo multiple steps", () => {
    const script = buildRedo(2);
    const matches = script.match(/Rdo|redo/gi);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("script-builder: workflow operations", () => {
  it("buildSetBackground solid", () => {
    const script = buildSetBackground({ type: "solid", color: "#1a1a2e" });
    expect(script).toContain("SolidColor");
    expect(script).toContain("Background");
  });

  it("buildSetBackground gradient", () => {
    const script = buildSetBackground({ type: "gradient", gradient: { colors: ["#1a1a2e", "#16213e"], angle: 90 } });
    expect(script).toContain("Grad");
  });

  it("buildCreateBanner", () => {
    const script = buildCreateBanner({
      width: 1920, height: 1080, title: "AI Summit 2026",
      subtitle: "The Future of AI", backgroundColor: "#1a1a2e",
      titleColor: "#ffffff", titleSize: 72, layout: "centered",
    });
    expect(script).toContain("app.documents.add");
    expect(script).toContain("1920");
    expect(script).toContain("AI Summit 2026");
    expect(script).toContain("The Future of AI");
    expect(script).toContain("LayerKind.TEXT");
  });

  it("buildLoadTemplate", () => {
    const script = buildLoadTemplate({ source: "https://example.com/template.psd" });
    expect(script).toContain("app.open");
    expect(script).toContain("echoToOE");
    expect(script).toContain("JSON.stringify");
  });

  it("buildApplyTemplateVariables", () => {
    const script = buildApplyTemplateVariables({ variables: { "Title": "New Title", "Sub": "New Sub" } });
    expect(script).toContain("Title");
    expect(script).toContain("New Title");
    expect(script).toContain("LayerKind.TEXT");
  });

  it("buildComposeLayers", () => {
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
