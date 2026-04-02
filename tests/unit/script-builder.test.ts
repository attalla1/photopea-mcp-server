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
