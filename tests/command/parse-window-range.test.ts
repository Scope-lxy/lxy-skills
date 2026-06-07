import { describe, expect, it } from "vitest";
import { parseWindowRange } from "../../src/command/parse-window-range.js";

describe("parseWindowRange", () => {
  it("parses a single window command", () => {
    expect(parseWindowRange("/发企鹅号 3窗口")).toEqual([3]);
  });

  it("parses a single window command for the short video alias", () => {
    expect(parseWindowRange("/发视频 3窗口")).toEqual([3]);
  });

  it("parses a short video command without slash or window suffix", () => {
    expect(parseWindowRange("发视频 1-2")).toEqual([1, 2]);
  });

  it("parses a penguin command without slash or window suffix", () => {
    expect(parseWindowRange("发企鹅号 3")).toEqual([3]);
  });

  it("parses a penguin range command without slash or window suffix", () => {
    expect(parseWindowRange("发企鹅号 1-2")).toEqual([1, 2]);
  });

  it("parses commands with surrounding whitespace", () => {
    expect(parseWindowRange("  /发企鹅号 3窗口  ")).toEqual([3]);
  });

  it("parses an inclusive range command", () => {
    expect(parseWindowRange("/发企鹅号 1-5窗口")).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses an inclusive range command for the short video alias", () => {
    expect(parseWindowRange("/发视频 1-5窗口")).toEqual([1, 2, 3, 4, 5]);
  });

  it("asks for a window number when the penguin command omits it", () => {
    expect(() => parseWindowRange("/发企鹅号")).toThrow(
      "请回复窗口号，例如：1窗口 或 1-5窗口"
    );
  });

  it("asks for a window number when the short video command omits it", () => {
    expect(() => parseWindowRange("/发视频")).toThrow(
      "请回复窗口号，例如：1窗口 或 1-5窗口"
    );
  });

  it("asks for a window number when the slashless short command omits it", () => {
    expect(() => parseWindowRange("发视频")).toThrow(
      "请回复窗口号，例如：1窗口 或 1-5窗口"
    );
  });

  it("rejects zero as a single window number", () => {
    expect(() => parseWindowRange("/发企鹅号 0窗口")).toThrow(
      "窗口编号必须大于等于 1"
    );
  });

  it("rejects ranges that start from zero", () => {
    expect(() => parseWindowRange("/发企鹅号 0-3窗口")).toThrow(
      "窗口编号必须大于等于 1"
    );
  });

  it("rejects descending ranges", () => {
    expect(() => parseWindowRange("/发企鹅号 5-1窗口")).toThrow(
      "窗口范围必须从小到大"
    );
  });

  it("rejects unsupported commands", () => {
    expect(() => parseWindowRange("/别的命令 1窗口")).toThrow("命令格式不正确");
  });
});
