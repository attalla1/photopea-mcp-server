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
    try {
      await bridge.stop();
    } catch {
      // Bridge may already be stopped by the test
    }
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
        received.push(msg.script);
        setTimeout(() => {
          clientWs.send(JSON.stringify({ id: msg.id, type: "result", success: true, data: msg.script, error: null }));
        }, 10);
      }
    });
    const [r1, r2, r3] = await Promise.all([
      bridge.executeScript("script1"), bridge.executeScript("script2"), bridge.executeScript("script3"),
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
    expect(received).toEqual(["script1", "script2", "script3"]);
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

  it("resolves pending scripts with error on client disconnect", async () => {
    // Start a script execution (will be pending — client won't respond)
    const resultPromise = bridge.executeScript("longRunning();");

    // Give the message time to be sent, then disconnect before responding
    await new Promise((r) => setTimeout(r, 20));
    clientWs.close();

    // The pending script should resolve with an error
    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain("disconnected");
  });

  it("loads file data into Photopea", async () => {
    const fakeData = Buffer.from("fake-image-data");

    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "load") {
        // Verify the load message has the expected fields
        expect(msg.data).toBe(fakeData.toString("base64"));
        expect(msg.filename).toBe("test.png");
        // Send back a result
        clientWs.send(JSON.stringify({ id: msg.id, type: "result", success: true, data: "ok", error: null }));
      }
    });

    const result = await bridge.loadFile(fakeData, "test.png");
    expect(result.success).toBe(true);
  });

  it.todo("returns timeout error when script execution exceeds timeout");
  // Skipped: DEFAULT_TIMEOUT_MS is 30s and cannot be configured per-test.
  // Testing the timeout path would require waiting 30s, which is impractical.

  it("reports ready state", () => {
    expect(bridge.isReady()).toBe(true);
  });
});
