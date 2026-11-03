import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocket } from "ws";
import { PhotopeaBridge } from "../../src/bridge/websocket-server.js";
import { launchBrowser } from "../../src/utils/platform.js";

vi.mock("../../src/utils/platform.js", () => ({ launchBrowser: vi.fn(() => Promise.resolve()) }));

describe("PhotopeaBridge", () => {
  let bridge: PhotopeaBridge;
  let clientWs: WebSocket;
  const TEST_PORT = 14117;

  const connect = (origin = `http://127.0.0.1:${TEST_PORT}`) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`, { origin });
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  const sendReady = (ws: WebSocket) => ws.send(JSON.stringify({ type: "status", status: "ready" }));
  const tick = () => new Promise((r) => setTimeout(r, 50));

  beforeEach(async () => {
    vi.mocked(launchBrowser).mockClear();
    bridge = new PhotopeaBridge(TEST_PORT);
    await bridge.start();
    clientWs = await connect();
    sendReady(clientWs);
    await tick();
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

  it("receives an export larger than the old base64 limit as a binary frame", async () => {
    const file = Buffer.alloc(80 * 1024 * 1024, 7); // 80 MB: base64 of this overflowed the old 100 MB frame limit
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") clientWs.send(Buffer.concat([Buffer.from(msg.id), file]));
    });
    const result = await bridge.executeScript("saveToOE('psd');", true);
    expect(result.success).toBe(true);
    expect((result.data as Buffer).equals(file)).toBe(true);
  });

  it("forwards the preview size so the page can downscale the export", async () => {
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") clientWs.send(Buffer.concat([Buffer.from(msg.id), Buffer.from(String(msg.previewMaxSize))]));
    });
    const result = await bridge.executeScript("saveToOE('png');", true, 256);
    expect(String(result.data)).toBe("256");
  });

  it("fails an export that returns no file instead of reporting success", async () => {
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "execute") {
        clientWs.send(JSON.stringify({ id: msg.id, type: "result", success: true, data: "ok", error: null }));
      }
    });
    const result = await bridge.executeScript("saveToOE('psd');", true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no file/);
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

  it("rejects connections from other origins", async () => {
    await expect(connect("https://evil.example")).rejects.toThrow(/401/);
    await expect(connect()).resolves.toBeInstanceOf(WebSocket);
  });

  it("closes the replaced tab with code 4001, fails its in-flight call, and waits for the new tab", async () => {
    const closed = new Promise<number>((r) => clientWs.on("close", (code) => r(code)));
    const inFlight = bridge.executeScript("neverAnswered();");
    await tick();
    const newTab = await connect();
    expect(await closed).toBe(4001);
    expect((await inFlight).error).toMatch(/replaced/);
    expect(bridge.isReady()).toBe(false);
    sendReady(newTab);
    await tick();
    expect(bridge.isReady()).toBe(true);
    newTab.close();
  });

  it("relaunches the browser on the next call each time the tab is closed", async () => {
    let tab = clientWs;
    for (const launches of [1, 2]) {
      tab.close();
      await tick();
      const ready = bridge.waitForReady();
      expect(launchBrowser).toHaveBeenCalledTimes(launches);
      tab = await connect();
      sendReady(tab);
      await ready;
    }
    tab.close();
  });
});
