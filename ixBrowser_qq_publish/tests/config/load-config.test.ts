import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load-config.js";
import { saveConfig } from "../../src/config/save-config.js";

describe("loadConfig", () => {
  it("loads and validates the runtime config", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");

    const expected = {
      ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
      penguinPublishUrl: "https://om.qq.com/userAuth/index",
      assetsRoot: "C:/企鹅号发布",
      mode: "pause-before-publish"
    };

    writeFileSync(filePath, JSON.stringify(expected));

    await expect(loadConfig(filePath)).resolves.toEqual(expected);
  });

  it("rejects invalid mode values", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");

    writeFileSync(
      filePath,
      JSON.stringify({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/userAuth/index",
        assetsRoot: "C:/企鹅号发布",
        mode: "invalid"
      })
    );

    await expect(loadConfig(filePath)).rejects.toThrow("mode");
  });

  it("rejects a null root node", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");

    writeFileSync(filePath, "null");

    await expect(loadConfig(filePath)).rejects.toThrow(
      "配置文件根节点必须是对象"
    );
  });

  it("rejects an array root node", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");

    writeFileSync(filePath, "[]");

    await expect(loadConfig(filePath)).rejects.toThrow(
      "配置文件根节点必须是对象"
    );
  });

  it("rejects when a required field is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");

    writeFileSync(
      filePath,
      JSON.stringify({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/userAuth/index",
        mode: "pause-before-publish"
      })
    );

    await expect(loadConfig(filePath)).rejects.toThrow(
      "assetsRoot 必须是字符串"
    );
  });

  it("rejects when a field has the wrong type", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");

    writeFileSync(
      filePath,
      JSON.stringify({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/userAuth/index",
        assetsRoot: 123,
        mode: "pause-before-publish"
      })
    );

    await expect(loadConfig(filePath)).rejects.toThrow(
      "assetsRoot 必须是字符串"
    );
  });

  it("saves a runtime config that can be loaded back", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");
    const expected = {
      ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
      penguinPublishUrl: "https://om.qq.com/main/creation/article",
      assetsRoot: "C:/Users/LXYou/Desktop/企鹅号发布",
      mode: "auto-publish" as const
    };

    await saveConfig(filePath, expected);

    expect(readFileSync(filePath, "utf8")).toContain('"mode": "auto-publish"');
    await expect(loadConfig(filePath)).resolves.toEqual(expected);
  });
});
