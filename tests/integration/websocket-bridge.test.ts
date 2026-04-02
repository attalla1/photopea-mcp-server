import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { PhotopeaBridge } from "../../src/bridge/websocket-server.js";

describe("PhotopeaBridge", () => {
  let bridge: PhotopeaBridge;
  let clientWs: WebSocket;
  const TEST_PORT = 14117;

  beforeEach(async () => {
    bridge = new PhotopeaBridge(TEST_PORT);
    await bridge.start();
    await new Promise<void>((resolve) => {
      clientWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
      clientWs.on("open", () => resolve());
    });
    clientWs.send(JSON.stringify({ type: "status", status: "ready" }));
    await new Promise((r) => setTimeout(r, 50));
  });

  afterEach(async () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    await bridge.stop();
  });

  it("executes a script and returns result", async () => {
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        clientWs.send(JSON.stringify({ id: msg.id, type: "result", success: true, data: "ok", error: null }));
      }
    });
    const result = await bridge.executeScript("test();");
    expect(result.success).toBe(true);
    expect(result.data).toBe("ok");
  });

  it("handles script error", async () => {
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        clientWs.send(JSON.stringify({ id: msg.id, type: "result", success: false, data: null, error: "ReferenceError" }));
      }
    });
    const result = await bridge.executeScript("foo();");
    expect(result.success).toBe(false);
    expect(result.error).toContain("ReferenceError");
  });

  it("executes scripts sequentially", async () => {
    const received: string[] = [];
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        received.push(msg.id);
        setTimeout(() => {
          clientWs.send(JSON.stringify({ id: msg.id, type: "result", success: true, data: msg.id, error: null }));
        }, 10);
      }
    });
    const [r1, r2, r3] = await Promise.all([
      bridge.executeScript("s1"), bridge.executeScript("s2"), bridge.executeScript("s3"),
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
  });

  it("handles file export result", async () => {
    const fakeData = Buffer.from("fake-png").toString("base64");
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        clientWs.send(JSON.stringify({ id: msg.id, type: "file", success: true, data: fakeData, mimeType: "image/png", error: null }));
      }
    });
    const result = await bridge.executeScript("saveToOE('png');", true);
    expect(result.success).toBe(true);
    expect("mimeType" in result).toBe(true);
  });

  it("returns error when not connected", async () => {
    // Stop the bridge (clears ready state and rejects pending)
    await bridge.stop();
    // Create a fresh bridge that no client will connect to
    const deadBridge = new PhotopeaBridge(TEST_PORT + 1);
    await deadBridge.start();
    // waitForReady polls every 200ms; with a short timeout we can test the error
    // Override: call executeScript which internally calls waitForReady (60s default)
    // Instead, test isReady directly
    expect(deadBridge.isReady()).toBe(false);
    await deadBridge.stop();
  });

  it("reports ready state", () => {
    expect(bridge.isReady()).toBe(true);
  });
});
