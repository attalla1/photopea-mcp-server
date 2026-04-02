// src/bridge/websocket-server.ts

import { createServer, type Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type {
  ActivityMessage,
  BridgeResult,
  BridgeFileResult,
  ExecuteMessage,
  LoadMessage,
  PendingRequest,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const EXPORT_TIMEOUT_MS = 60_000;

export class PhotopeaBridge {
  public readonly httpServer: HttpServer;
  public readonly wss: WebSocketServer;
  private client: WebSocket | null = null;
  private ready: boolean = false;
  private queue: PendingRequest[] = [];
  private processing: boolean = false;
  private pendingScripts: Map<string, string> = new Map();
  private port: number;

  constructor(port: number) {
    this.port = port;

    // Create bare HTTP server; route handling is added externally via the entry point
    this.httpServer = createServer();

    // Create WSS attached to the HTTP server
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on("connection", (ws: WebSocket) => {
      // Accept only one client at a time; close any previous connection
      if (this.client && this.client !== ws) {
        this.client.close();
      }
      this.client = ws;

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleClientMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        if (this.client === ws) {
          this.client = null;
          this.ready = false;
          this.rejectAllPending(new Error("Photopea client disconnected"));
        }
      });

      ws.on("error", () => {
        // Error is followed by close; handled there
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  getHttpServer(): HttpServer {
    return this.httpServer;
  }

  getPort(): number {
    return this.port;
  }

  isReady(): boolean {
    return this.client !== null && this.ready;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Attach WebSocket upgrade handler
      this.httpServer.on("upgrade", (request, socket, head) => {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit("connection", ws, request);
        });
      });

      this.httpServer.listen(this.port, "127.0.0.1", () => resolve());
      this.httpServer.once("error", reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.rejectAllPending(new Error("Bridge stopped"));

      // Close all WebSocket connections
      for (const ws of this.wss.clients) {
        ws.terminate();
      }
      this.client = null;
      this.ready = false;

      this.wss.close(() => {
        this.httpServer.close(() => resolve());
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Outgoing helpers
  // ---------------------------------------------------------------------------

  sendActivity(activity: ActivityMessage): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(activity));
    }
  }

  // ---------------------------------------------------------------------------
  // Script execution
  // ---------------------------------------------------------------------------

  executeScript(
    script: string,
    expectFiles = false
  ): Promise<BridgeResult | BridgeFileResult> {
    if (!this.isReady()) {
      return Promise.resolve<BridgeResult>({
        success: false,
        data: null,
        error: "Photopea is not connected or not ready",
      });
    }

    return new Promise<BridgeResult | BridgeFileResult>((resolve, reject) => {
      const id = randomUUID();
      const timeoutMs = expectFiles ? EXPORT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

      const timer = setTimeout(() => {
        this.pendingScripts.delete(id);
        this.queue = this.queue.filter((r) => r.id !== id);
        this.processing = false;
        resolve({
          success: false,
          data: null,
          error: `Script execution timed out after ${timeoutMs / 1000}s`,
        });
        this.processNext();
      }, timeoutMs);

      const pending: PendingRequest = { id, resolve, reject, expectFiles, timer };

      this.pendingScripts.set(id, script);
      this.queue.push(pending);
      this.processNext();
    });
  }

  // ---------------------------------------------------------------------------
  // File loading
  // ---------------------------------------------------------------------------

  loadFile(data: Buffer, filename: string): Promise<BridgeResult> {
    if (!this.isReady()) {
      return Promise.resolve<BridgeResult>({
        success: false,
        data: null,
        error: "Photopea is not connected or not ready",
      });
    }

    return new Promise<BridgeResult>((resolve) => {
      const id = randomUUID();
      const msg: LoadMessage = {
        id,
        type: "load",
        data: data.toString("base64"),
        filename,
      };

      const timer = setTimeout(() => {
        this.pendingScripts.delete(id);
        this.queue = this.queue.filter((r) => r.id !== id);
        this.processing = false;
        resolve({
          success: false,
          data: null,
          error: `loadFile timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`,
        });
        this.processNext();
      }, DEFAULT_TIMEOUT_MS);

      // loadFile uses the same queue/resolve mechanism but doesn't need a script
      // We store a placeholder so processNext can look it up
      this.pendingScripts.set(id, "__load__");

      const pending: PendingRequest = {
        id,
        resolve: resolve as (v: BridgeResult | BridgeFileResult) => void,
        reject: () => {},
        expectFiles: false,
        timer,
      };

      this.queue.push(pending);

      // Send load message directly (bypassing the normal execute path)
      // We intercept in processNext by checking for the __load__ placeholder
      if (!this.processing && this.client) {
        this.processing = true;
        this.queue.shift(); // remove the one we just added
        this.pendingScripts.delete(id);
        clearTimeout(timer);

        if (this.client.readyState === WebSocket.OPEN) {
          this.client.send(JSON.stringify(msg));

          // Wait for result — re-register as a pending request with a fresh timer
          const freshTimer = setTimeout(() => {
            this.pendingScripts.delete(id);
            this.queue = this.queue.filter((r) => r.id !== id);
            this.processing = false;
            resolve({
              success: false,
              data: null,
              error: `loadFile timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`,
            });
            this.processNext();
          }, DEFAULT_TIMEOUT_MS);

          const freshPending: PendingRequest = {
            id,
            resolve: resolve as (v: BridgeResult | BridgeFileResult) => void,
            reject: () => {},
            expectFiles: false,
            timer: freshTimer,
          };
          // Push to front of an in-flight slot (queue is empty/other items)
          this.queue.unshift(freshPending);
        } else {
          this.processing = false;
          resolve({ success: false, data: null, error: "WebSocket not open" });
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Internal queue processing
  // ---------------------------------------------------------------------------

  private processNext(): void {
    if (this.processing || this.queue.length === 0 || !this.client) {
      return;
    }

    const next = this.queue[0];
    const script = this.pendingScripts.get(next.id);

    if (script === undefined) {
      // Already handled (timeout/disconnect removed it)
      this.queue.shift();
      this.processNext();
      return;
    }

    this.processing = true;

    const msg: ExecuteMessage = {
      id: next.id,
      type: "execute",
      script,
      expectFiles: next.expectFiles,
    };

    if (this.client.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(msg));
    } else {
      // Client gone; resolve with error and continue
      clearTimeout(next.timer);
      this.queue.shift();
      this.pendingScripts.delete(next.id);
      this.processing = false;
      next.resolve({ success: false, data: null, error: "WebSocket not open" });
      this.processNext();
    }
  }

  // ---------------------------------------------------------------------------
  // Incoming message handler
  // ---------------------------------------------------------------------------

  private handleClientMessage(msg: Record<string, unknown>): void {
    if (msg.type === "status") {
      if (msg.status === "ready") {
        this.ready = true;
      }
      return;
    }

    if (msg.type === "result" || msg.type === "file") {
      const id = msg.id as string;
      const pendingIndex = this.queue.findIndex((r) => r.id === id);

      if (pendingIndex === -1) return; // Already resolved (e.g. timed out)

      const pending = this.queue[pendingIndex];
      clearTimeout(pending.timer);
      this.queue.splice(pendingIndex, 1);
      this.pendingScripts.delete(id);
      this.processing = false;

      if (msg.type === "file") {
        const result: BridgeFileResult = {
          success: (msg.success as boolean) ?? false,
          data: Buffer.from((msg.data as string) ?? "", "base64"),
          mimeType: (msg.mimeType as string) ?? "application/octet-stream",
          error: (msg.error as string | null) ?? null,
        };
        pending.resolve(result);
      } else {
        const result: BridgeResult = {
          success: (msg.success as boolean) ?? false,
          data: (msg.data as string | null) ?? null,
          error: (msg.error as string | null) ?? null,
        };
        pending.resolve(result);
      }

      this.processNext();
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private rejectAllPending(error: Error): void {
    const snapshot = [...this.queue];
    this.queue = [];
    this.processing = false;

    for (const pending of snapshot) {
      clearTimeout(pending.timer);
      this.pendingScripts.delete(pending.id);
      // Resolve (not reject) with an error result so callers don't need try/catch
      pending.resolve({
        success: false,
        data: null,
        error: error.message,
      });
    }
  }
}
