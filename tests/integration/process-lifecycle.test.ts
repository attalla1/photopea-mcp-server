import { it, expect, onTestFinished } from "vitest";
import { spawn } from "child_process";

it("exits when the MCP client closes stdin, so no orphaned server keeps running", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { stdio: ["pipe", "ignore", "pipe"] });
  onTestFinished(() => { child.kill(); }); // also runs on timeout, unlike finally
  await new Promise((r) => child.stderr.on("data", (d) => String(d).includes("server ready") && r(null)));
  child.stdin.end();
  const code = await new Promise((r) => child.on("exit", r));
  expect(code).toBe(0);
}, 15_000);
