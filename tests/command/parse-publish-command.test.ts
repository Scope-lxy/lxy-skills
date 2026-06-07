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

  it("parses a development mode switch command", () => {
    expect(parsePublishCommand("/发企鹅号 开发模式")).toEqual({
      kind: "mode-switch",
      mode: "pause-before-publish"
    });
  });

  it("parses a production mode switch command from the short alias", () => {
    expect(parsePublishCommand("/发视频 正式模式")).toEqual({
      kind: "mode-switch",
      mode: "auto-publish"
    });
  });
});
