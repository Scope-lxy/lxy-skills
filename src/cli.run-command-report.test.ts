import { describe, expect, it } from "vitest";
import {
  runCommandReport,
  type BrowserLike,
  type RunCommandDependencies
} from "./cli.js";
import type { RuntimeConfig } from "./config/types.js";

function createTestConfig(mode: RuntimeConfig["mode"] = "auto-publish"): RuntimeConfig {
  return {
    ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
    penguinPublishUrl: "https://om.qq.com/main/creation/article",
    assetsRoot: "C:/Users/LXYou/Desktop/企鹅号发布",
    mode
  };
}

function createBrowserStub(page: unknown = {}): BrowserLike {
  return {
    contexts() {
      return [
        {
          pages() {
            return [page];
          }
        }
      ];
    },
    async newPage() {
      return page;
    },
    async close() {
      return undefined;
    }
  };
}

describe("runCommandReport", () => {
  it("reports each window as it completes and emits a final overall summary", async () => {
    const completionSummaries: string[] = [];
    const progressLines: string[] = [];
    const writtenResults: string[] = [];
    let publishCallCount = 0;

    const report = await runCommandReport("发视频 1-2", {
      async loadConfig() {
        return createTestConfig();
      },
      async saveConfig() {
        return undefined;
      },
      async allocateVideosForProfiles() {
        return [
          {
            profileId: 1,
            title: "标题1",
            videoPath: "C:/videos/1.mp4"
          },
          {
            profileId: 2,
            title: "标题2",
            videoPath: "C:/videos/2.mp4"
          }
        ];
      },
      async movePublishedVideoToUsed() {
        return "C:/used/1.mp4";
      },
      async pickRandomCover() {
        return "C:/covers/cover.jpg";
      },
      async pickArticleAssetSet() {
        return {
          picture1Path: "C:/pictures/1.jpg",
          picture2Path: "C:/pictures/2.jpg",
          articleCoverPath: "C:/pictures/cover.jpg",
          version: "test-group",
          selectionMode: "grouped-directory"
        };
      },
      async openProfile() {
        return { ws: "ws://127.0.0.1:9222/devtools/browser/test" };
      },
      async connectBrowser() {
        return createBrowserStub();
      },
      async publishArticle(input) {
        publishCallCount += 1;
        await input.reportProgress?.(`阶段${publishCallCount}`);

        if (publishCallCount === 1) {
          return {
            status: "published",
            message: "已自动发布"
          };
        }

        throw new Error("发布失败");
      },
      async writeRunEvent(_logFile, result) {
        writtenResults.push(`${result.profileId}:${result.message}`);
      },
      async appendRunLogLine(_logFile, line) {
        progressLines.push(line);
      },
      async acquirePublishRunLock() {
        return async () => undefined;
      },
      async reportProgress({ profileId, title, message }) {
        progressLines.push(`${profileId}窗口：${title} ${message}`);
      },
      async reportWindowComplete({ summary }) {
        completionSummaries.push(summary);
      }
    } satisfies Partial<RunCommandDependencies>);

    expect(completionSummaries).toEqual([
      "1窗口：标题1 已自动发布",
      "2窗口：标题2 发布失败"
    ]);
    expect(report.overallSummaryLines).toEqual([
      "本次发布完成：共 2 个窗口，成功 1 个，失败 1 个。",
      "1窗口：标题1 已自动发布",
      "2窗口：标题2 发布失败"
    ]);
    expect(writtenResults).toEqual(["1:已自动发布", "2:发布失败"]);
    expect(progressLines).toEqual([
      "1窗口：标题1 阶段1",
      "1窗口：标题1 阶段1",
      "1窗口：标题1 已自动发布",
      "2窗口：标题2 阶段2",
      "2窗口：标题2 阶段2",
      "2窗口：标题2 发布失败",
      "本次发布完成：共 2 个窗口，成功 1 个，失败 1 个。",
      "1窗口：标题1 已自动发布",
      "2窗口：标题2 发布失败"
    ]);
  });
});
