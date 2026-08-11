import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { WindowRunResult } from "../types/run-result.js";

export async function writeRunEvent(
  logFile: string,
  result: WindowRunResult
): Promise<void> {
  await mkdir(dirname(logFile), { recursive: true });
  await appendFile(logFile, `${JSON.stringify(result)}\n`, "utf8");
}

export function buildLogFilePath(logsDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(logsDir, `${timestamp}.jsonl`);
}

export async function appendRunLogLine(
  logFile: string,
  line: string
): Promise<void> {
  await mkdir(dirname(logFile), { recursive: true });
  await appendFile(logFile, `${line}\n`, "utf8");
}

export function buildProgressLogFilePath(logsDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(logsDir, `${timestamp}.progress.log`);
}
