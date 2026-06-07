import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pickArticleAssetSet } from "../../src/assets/article-image-picker.js";
import { pickRandomCover } from "../../src/assets/cover-picker.js";
import {
  allocateVideosForProfiles,
  movePublishedVideoToUsed
} from "../../src/assets/video-pool.js";
import { buildLogFilePath, writeRunEvent } from "../../src/logs/run-logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("allocateVideosForProfiles", () => {
  it("allocates unique videos and derives title from filename", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-videos-"));
    writeFileSync(join(dir, "你好🥺.mp4"), "");
    writeFileSync(join(dir, "晚安❤️.mp4"), "");

    const allocation = await allocateVideosForProfiles(dir, [1, 2]);

    expect(new Set(allocation.map((item) => item.videoPath)).size).toBe(2);
    expect(allocation.map((item) => item.title).sort()).toEqual([
      "你好🥺",
      "晚安❤️"
    ]);
  });

  it("allocates older videos before newer videos", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-videos-"));
    writeFileSync(join(dir, "z-old.mp4"), "");
    await new Promise((resolve) => setTimeout(resolve, 20));
    writeFileSync(join(dir, "a-new.mp4"), "");

    const allocation = await allocateVideosForProfiles(dir, [1, 2]);

    expect(allocation.map((item) => item.title)).toEqual(["z-old", "a-new"]);
  });

  it("fails when there are not enough videos for the requested windows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-videos-"));
    writeFileSync(join(dir, "only-one.mp4"), "");

    await expect(allocateVideosForProfiles(dir, [1, 2])).rejects.toThrow(
      "可用视频数量不足"
    );
  });

  it("ignores directories that pretend to be mp4 files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-videos-"));
    writeFileSync(join(dir, "only-one.mp4"), "");
    mkdirSync(join(dir, "fake-folder.mp4"));

    await expect(allocateVideosForProfiles(dir, [1, 2])).rejects.toThrow(
      "可用视频数量不足"
    );
  });
});

describe("movePublishedVideoToUsed", () => {
  it("moves a published mp4 into the used directory", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qq-assets-"));
    const videosDir = join(rootDir, "videos");
    mkdirSync(videosDir);
    const videoPath = join(videosDir, "demo.mp4");
    writeFileSync(videoPath, "video");

    const usedPath = await movePublishedVideoToUsed(videoPath, rootDir);

    expect(usedPath).toBe(join(rootDir, "used", "demo.mp4"));
    expect(existsSync(videoPath)).toBe(false);
    expect(readFileSync(usedPath, "utf8")).toBe("video");
  });

  it("keeps an existing used video and moves the next one with a numbered name", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qq-assets-"));
    const videosDir = join(rootDir, "videos");
    const usedDir = join(rootDir, "used");
    mkdirSync(videosDir);
    mkdirSync(usedDir);
    const videoPath = join(videosDir, "demo.mp4");
    const existingUsedPath = join(usedDir, "demo.mp4");
    writeFileSync(videoPath, "new-video");
    writeFileSync(existingUsedPath, "old-video");

    const usedPath = await movePublishedVideoToUsed(videoPath, rootDir);

    expect(usedPath).toBe(join(usedDir, "demo-1.mp4"));
    expect(readFileSync(existingUsedPath, "utf8")).toBe("old-video");
    expect(readFileSync(usedPath, "utf8")).toBe("new-video");
  });

  it("does not move non-video files", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qq-assets-"));
    const textPath = join(rootDir, "readme.txt");
    writeFileSync(textPath, "notes");

    await expect(movePublishedVideoToUsed(textPath, rootDir)).rejects.toThrow(
      "只允许移动 mp4 视频"
    );
    expect(readFileSync(textPath, "utf8")).toBe("notes");
  });
});

describe("pickRandomCover", () => {
  it("prefers an exactly matched cover basename for the target video", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-covers-"));
    writeFileSync(join(dir, "aaa.jpg"), "");
    writeFileSync(join(dir, "晚安❤️.jpg"), "");
    writeFileSync(join(dir, "晚安❤️_cover.png"), "");

    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(
      pickRandomCover(dir, "C:/企鹅号发布/videos/晚安❤️.mp4")
    ).resolves.toBe(join(dir, "晚安❤️.jpg"));
  });

  it("falls back to a cover whose basename contains the target video basename", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-covers-"));
    writeFileSync(join(dir, "aaa.jpg"), "");
    writeFileSync(join(dir, "晚安❤️_cover.png"), "");
    writeFileSync(join(dir, "别的视频.jpg"), "");

    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(
      pickRandomCover(dir, "C:/企鹅号发布/videos/晚安❤️.mp4")
    ).resolves.toBe(join(dir, "晚安❤️_cover.png"));
  });

  it("returns a picked image path from the covers directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-covers-"));
    writeFileSync(join(dir, "cover-a.jpg"), "");
    writeFileSync(join(dir, "cover-b.png"), "");

    vi.spyOn(Math, "random").mockReturnValue(0.75);

    await expect(
      pickRandomCover(dir, "C:/企鹅号发布/videos/not-found.mp4")
    ).resolves.toBe(join(dir, "cover-b.png"));
  });

  it("can pick a matched cover from a nested cover directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-covers-"));
    const nestedDir = join(dir, "A组");
    mkdirSync(nestedDir);
    writeFileSync(join(nestedDir, "晚安❤️.jpg"), "");

    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(
      pickRandomCover(dir, "C:/企鹅号发布/videos/晚安❤️.mp4")
    ).resolves.toBe(join(nestedDir, "晚安❤️.jpg"));
  });

  it("prefers a root cover when the same basename also exists in nested directories", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-covers-"));
    const nestedDir = join(dir, "A组");
    mkdirSync(nestedDir);
    writeFileSync(join(dir, "晚安❤️.jpg"), "");
    writeFileSync(join(nestedDir, "晚安❤️.jpg"), "");

    vi.spyOn(Math, "random").mockReturnValue(0.99);

    await expect(
      pickRandomCover(dir, "C:/企鹅号发布/videos/晚安❤️.mp4")
    ).resolves.toBe(join(dir, "晚安❤️.jpg"));
  });

  it("fails when no supported cover image exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-covers-"));
    writeFileSync(join(dir, "readme.txt"), "");

    await expect(pickRandomCover(dir)).rejects.toThrow(
      "video-covers 目录没有可用封面图"
    );
  });

  it("ignores directories that pretend to be image files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-covers-"));
    mkdirSync(join(dir, "fake-cover.jpg"));
    writeFileSync(join(dir, "readme.txt"), "");

    await expect(pickRandomCover(dir)).rejects.toThrow(
      "video-covers 目录没有可用封面图"
    );
  });
});

describe("pickArticleAssetSet", () => {
  it("picks a complete article asset group from a pictures subdirectory", async () => {
    const picturesDir = mkdtempSync(join(tmpdir(), "qq-pictures-"));
    const coversDir = mkdtempSync(join(tmpdir(), "qq-article-covers-"));
    const groupDir = join(picturesDir, "新版素材");
    mkdirSync(groupDir);
    writeFileSync(join(groupDir, "图1-新版.jpg"), "");
    writeFileSync(join(groupDir, "图2-二维码.png"), "");
    writeFileSync(join(groupDir, "文章封面.webp"), "");

    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(pickArticleAssetSet(picturesDir, coversDir)).resolves.toEqual({
      picture1Path: join(groupDir, "图1-新版.jpg"),
      picture2Path: join(groupDir, "图2-二维码.png"),
      articleCoverPath: join(groupDir, "文章封面.webp"),
      version: "新版素材",
      selectionMode: "grouped-directory"
    });
  });

  it("skips incomplete groups and randomly picks from complete groups", async () => {
    const picturesDir = mkdtempSync(join(tmpdir(), "qq-pictures-"));
    const coversDir = mkdtempSync(join(tmpdir(), "qq-article-covers-"));
    const incompleteDir = join(picturesDir, "缺封面");
    const groupADir = join(picturesDir, "A组");
    const groupBDir = join(picturesDir, "B组");
    mkdirSync(incompleteDir);
    mkdirSync(groupADir);
    mkdirSync(groupBDir);
    writeFileSync(join(incompleteDir, "图1.jpg"), "");
    writeFileSync(join(incompleteDir, "图2.jpg"), "");
    writeFileSync(join(groupADir, "图1.jpg"), "");
    writeFileSync(join(groupADir, "图2.jpg"), "");
    writeFileSync(join(groupADir, "封面.jpg"), "");
    writeFileSync(join(groupBDir, "图1.jpg"), "");
    writeFileSync(join(groupBDir, "图2.jpg"), "");
    writeFileSync(join(groupBDir, "封面.jpg"), "");

    vi.spyOn(Math, "random").mockReturnValue(0.75);

    await expect(pickArticleAssetSet(picturesDir, coversDir)).resolves.toEqual({
      picture1Path: join(groupBDir, "图1.jpg"),
      picture2Path: join(groupBDir, "图2.jpg"),
      articleCoverPath: join(groupBDir, "封面.jpg"),
      version: "B组",
      selectionMode: "grouped-directory"
    });
  });

  it("recognizes fallback A1 and A2 image names inside a complete group", async () => {
    const picturesDir = mkdtempSync(join(tmpdir(), "qq-pictures-"));
    const coversDir = mkdtempSync(join(tmpdir(), "qq-article-covers-"));
    const groupDir = join(picturesDir, "A组");
    mkdirSync(groupDir);
    writeFileSync(join(groupDir, "A1.jpg"), "");
    writeFileSync(join(groupDir, "A2.jpeg"), "");
    writeFileSync(join(groupDir, "封面.png"), "");

    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(pickArticleAssetSet(picturesDir, coversDir)).resolves.toEqual({
      picture1Path: join(groupDir, "A1.jpg"),
      picture2Path: join(groupDir, "A2.jpeg"),
      articleCoverPath: join(groupDir, "封面.png"),
      version: "A组",
      selectionMode: "grouped-directory"
    });
  });

  it("prefers explicit picture names over fallback A1 and A2 names", async () => {
    const picturesDir = mkdtempSync(join(tmpdir(), "qq-pictures-"));
    const coversDir = mkdtempSync(join(tmpdir(), "qq-article-covers-"));
    const groupDir = join(picturesDir, "A组");
    mkdirSync(groupDir);
    writeFileSync(join(groupDir, "A1.jpg"), "");
    writeFileSync(join(groupDir, "A2.jpg"), "");
    writeFileSync(join(groupDir, "图1-新版.jpg"), "");
    writeFileSync(join(groupDir, "图2-二维码.jpg"), "");
    writeFileSync(join(groupDir, "封面.jpg"), "");

    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(pickArticleAssetSet(picturesDir, coversDir)).resolves.toEqual({
      picture1Path: join(groupDir, "图1-新版.jpg"),
      picture2Path: join(groupDir, "图2-二维码.jpg"),
      articleCoverPath: join(groupDir, "封面.jpg"),
      version: "A组",
      selectionMode: "grouped-directory"
    });
  });

  it("fails when no pictures subdirectory contains a complete article asset group", async () => {
    const picturesDir = mkdtempSync(join(tmpdir(), "qq-pictures-"));
    const coversDir = mkdtempSync(join(tmpdir(), "qq-article-covers-"));
    const incompleteDir = join(picturesDir, "缺插图2");
    mkdirSync(incompleteDir);
    writeFileSync(join(incompleteDir, "图1.jpg"), "");
    writeFileSync(join(incompleteDir, "封面.jpg"), "");

    await expect(pickArticleAssetSet(picturesDir, coversDir)).rejects.toThrow(
      "pictures 目录缺少完整文章素材组"
    );
  });
});

describe("run logger", () => {
  it("builds a jsonl log path and appends one event per line", async () => {
    const logsDir = mkdtempSync(join(tmpdir(), "qq-logs-"));
    const logFile = buildLogFilePath(logsDir);

    expect(logFile.startsWith(logsDir)).toBe(true);
    expect(logFile.endsWith(".jsonl")).toBe(true);

    await writeRunEvent(logFile, {
      profileId: 1,
      title: "你好🥺",
      videoPath: "C:/企鹅号发布/videos/你好🥺.mp4",
      coverPath: "C:/企鹅号发布/video-covers/cover-a.jpg",
      status: "ready-to-publish",
      message: "已停在发布前"
    });

    const fileContent = readFileSync(logFile, "utf8");
    const lines = fileContent.trim().split("\n");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      profileId: 1,
      title: "你好🥺",
      videoPath: "C:/企鹅号发布/videos/你好🥺.mp4",
      coverPath: "C:/企鹅号发布/video-covers/cover-a.jpg",
      status: "ready-to-publish",
      message: "已停在发布前"
    });
  });
});
