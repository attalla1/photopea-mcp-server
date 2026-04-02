import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

export async function readLocalFile(filePath: string): Promise<Buffer> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}. Verify the path exists.`);
  }
  return readFile(filePath);
}

export async function writeLocalFile(filePath: string, data: Buffer): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, data);
}

export async function fetchUrlToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${url}. Status: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function isUrl(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}
