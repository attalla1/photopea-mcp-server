import { createServer } from "net";

export async function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(preferred, "127.0.0.1", () => {
      server.close(() => resolve(preferred));
    });
    server.on("error", () => {
      const fallback = createServer();
      fallback.listen(0, "127.0.0.1", () => {
        const addr = fallback.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        fallback.close(() => resolve(port));
      });
      fallback.on("error", reject);
    });
  });
}

export async function launchBrowser(url: string): Promise<void> {
  const open = (await import("open")).default;
  await open(url);
}
