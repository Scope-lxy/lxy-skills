import { writeFile } from "node:fs/promises";
import type { RuntimeConfig } from "./types.js";

export async function saveConfig(
  filePath: string,
  config: RuntimeConfig
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

