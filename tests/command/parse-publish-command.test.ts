import { describe, expect, it } from "vitest";
import { parsePublishCommand } from "../../src/command/parse-publish-command.js";

describe("parsePublishCommand", () => {
  it("parses a publish command into window ids", () => {
    expect(parsePublishCommand("/发企鹅号 2-3窗口")).toEqual({
      kind: "publish",
      profileIds: [2, 3]
    });
  });

  it("parses the short alias publish command into window ids", () => {
    expect(parsePublishCommand("/发视频 4窗口")).toEqual({
      kind: "publish",
      profileIds: [4]
    });
  });

  it("parses a slashless short alias publish command without window suffix", () => {
    expect(parsePublishCommand("发视频 1-2")).toEqual({
      kind: "publish",
      profileIds: [1, 2]
    });
  });

  it("rejects retired mode switch commands", () => {
    expect(() => parsePublishCommand("/发企鹅号 开发模式")).toThrow(
      "命令格式不正确"
    );
    expect(() => parsePublishCommand("/发视频 正式模式")).toThrow(
      "命令格式不正确"
    );
  });
});
