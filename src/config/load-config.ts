import { readFile } from "node:fs/promises";
import type { PublishMode, RuntimeConfig } from "./types.js";

function isPublishMode(value: string): value is PublishMode {
  return value === "pause-before-publish" || value === "auto-publish";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadConfig(filePath: string): Promise<RuntimeConfig> {
  const text = await readFile(filePath, "utf8");
  const parsed = JSON.parse(text) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("配置文件根节点必须是对象");
  }

  if (typeof parsed.ixBrowserApiBaseUrl !== "string") {
    throw new Error("ixBrowserApiBaseUrl 必须是字符串");
  }

  if (typeof parsed.penguinPublishUrl !== "string") {
    throw new Error("penguinPublishUrl 必须是字符串");
  }

  if (typeof parsed.assetsRoot !== "string") {
    throw new Error("assetsRoot 必须是字符串");
  }

  if (typeof parsed.mode !== "string" || !isPublishMode(parsed.mode)) {
    throw new Error("mode 必须是 pause-before-publish 或 auto-publish");
  }

  return {
    ixBrowserApiBaseUrl: parsed.ixBrowserApiBaseUrl,
    penguinPublishUrl: parsed.penguinPublishUrl,
    assetsRoot: parsed.assetsRoot,
    mode: parsed.mode
  };
}
