import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../src/cli.js";
import type { PickedArticleAssetSet } from "../../src/assets/article-image-picker.js";
import type { WindowRunResult } from "../../src/types/run-result.js";

interface FakeLocatorSpec {
  count: number;
  countSequence?: number[];
  textContent?: string | null;
  textContentSequence?: Array<string | null>;
  visible?: boolean[];
  visibleSequence?: boolean[];
}

interface FakePageOptions {
  caretReadySequence?: boolean[];
  startReadySequence?: boolean[];
  contentBlockOrder?: Array<"video" | "image" | "empty">;
  forceClearEditorResetsDraft?: boolean;
  titleInputValue?: string;
  titleInputValueSequence?: string[];
}

function createPage(id: string) {
  return { id };
}

function createWriteRunEventMock() {
  return vi.fn(
    async (_logFile: string, _result: WindowRunResult): Promise<void> => undefined
  );
}

function createPlaywrightLikePage(
  specs: Record<string, FakeLocatorSpec>,
  actions: string[] = [],
  options: FakePageOptions = {}
) {
  const countReads = new Map<string, number>();
  const textContentReads = new Map<string, number>();
  const visibleReads = new Map<string, number>();
  const filledValues = new Map<string, string>();
  let forceClearedEditor = false;
  let uploadedVideo = false;
  const getSpec = (selector: string): FakeLocatorSpec => {
    return specs[selector] ?? { count: 0, visible: [] };
  };

  const getSequenceValue = <T>(
    reads: Map<string, number>,
    selector: string,
    sequence: T[] | undefined,
    fallback: T
  ): T => {
    if (!sequence || sequence.length === 0) {
      return fallback;
    }

    const index = reads.get(selector) ?? 0;
    reads.set(selector, index + 1);
    return sequence[Math.min(index, sequence.length - 1)] ?? fallback;
  };

  const createLocator = (selector: string, index = 0) => {
    return {
      async count() {
        const spec = getSpec(selector);

        if (options.forceClearEditorResetsDraft && forceClearedEditor) {
          if (
            selector === ".ProseMirror .index_module_content__cffb2914"
          ) {
            return 0;
          }

          if (
            selector === '.ProseMirror div.video[data-widget="video"]' ||
            selector === '.ProseMirror div.video[data-widget="video"] video[poster]'
          ) {
            return uploadedVideo ? spec.count : 0;
          }
        }

        return getSequenceValue(
          countReads,
          `${selector}:${index}`,
          spec.countSequence,
          spec.count
        );
      },
      async isVisible() {
        const spec = getSpec(selector);

        if (index >= spec.count) {
          return false;
        }

        return getSequenceValue(
          visibleReads,
          `${selector}:${index}`,
          spec.visibleSequence,
          spec.visible?.[index] ?? true
        );
      },
      async fill(value: string) {
        filledValues.set(`${selector}:${index}`, value);
        actions.push(`fill:${selector}:${index}:${value}`);
      },
      async textContent() {
        const spec = getSpec(selector);
        return getSequenceValue(
          textContentReads,
          `${selector}:${index}`,
          spec.textContentSequence,
          spec.textContent ?? null
        );
      },
      async inputValue() {
        if (options.titleInputValueSequence?.length) {
          return options.titleInputValueSequence.shift() ?? "";
        }

        if (options.titleInputValue !== undefined) {
          return options.titleInputValue;
        }

        return filledValues.get(`${selector}:${index}`) ?? "";
      },
      async setInputFiles(files: string | string[]) {
        const normalized = Array.isArray(files) ? files.join(",") : files;
        if (selector === 'input[name="Filedata"][type="file"]') {
          uploadedVideo = true;
        }
        actions.push(`setInputFiles:${selector}:${index}:${normalized}`);
      },
      async click() {
        actions.push(`click:${selector}:${index}`);
      },
      nth(nextIndex: number) {
        return createLocator(selector, nextIndex);
      }
    };
  };

  return {
    actions,
    page: {
      async goto(url: string, options?: { waitUntil?: "domcontentloaded" }) {
        actions.push(`goto:${url}:${options?.waitUntil ?? "none"}`);
      },
      async bringToFront() {
        actions.push("bringToFront");
      },
      keyboard: {
        async press(value: string) {
          actions.push(`keyboard:${value}`);
        }
      },
      async waitForTimeout(timeoutMs: number) {
        actions.push(`waitForTimeout:${timeoutMs}`);
      },
      locator(selector: string) {
        return createLocator(selector);
      },
      async evaluate(pageFunction?: unknown) {
        const source = String(pageFunction ?? "");

        if (source.includes("const blocks = []")) {
          return options.contentBlockOrder ?? ["video", "image", "image"];
        }

        if (source.includes("let removed = 0")) {
          actions.push("removeEmptyEditorChildren");
          return 3;
        }

        if (source.includes("__ixbrowserForceClearTitle")) {
          actions.push("forceClearTitle");
          return true;
        }

        if (source.includes("__ixbrowserForceClearEditorDraft")) {
          actions.push("forceClearEditorDraft");
          forceClearedEditor = true;
          uploadedVideo = false;
          return true;
        }

        const ready = getSequenceValue(
          countReads,
          "__caretReady__",
          options.caretReadySequence,
          true
        );
        const atStart = getSequenceValue(
          countReads,
          "__startReady__",
          options.startReadySequence,
          true
        );

        return {
          ready,
          hasSelection: ready,
          isCollapsed: ready,
          activeInEditor: ready,
          selectedBlockCount: ready ? 0 : 1,
          atStart
        };
      },
      getByRole(role: string, options?: { name?: string | RegExp }) {
        return createLocator(`role:${role}:${String(options?.name ?? "")}`);
      }
    }
  };
}

function createPenguinPublishPage(id: string) {
  return {
    id,
    async goto() {},
    async resetDraft() {},
    async fillTitle() {},
    async focusEditorBody() {},
    async moveEditorCursorToStart() {},
    async uploadVideo() {},
    async fillVideoTitle() {},
    async setVideoCover() {},
    async ensureVideoReady() {},
    async insertArticleImages() {},
    async setArticleCover() {},
    async applyDeclaration() {},
    async applyAiDeclaration() {},
    async readPrePublishState() {
      return {
        hasTitle: true,
        hasVideo: true,
        hasVideoCover: true,
        insertedImageCount: 2,
        declarationConfirmed: true,
        aiDeclarationConfirmed: true,
        articleCover: {
          coverApplied: true
        }
      };
    },
    async capturePrePublishEvidence(): Promise<string | null> {
      return null;
    },
    async clickPublish() {}
  };
}

function createBrowser(page: unknown = createPage("default")) {
  const close = vi.fn(async () => undefined);

  return {
    close,
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
    }
  };
}

function createArticleAssets(version = "A"): PickedArticleAssetSet {
  return {
    picture1Path: `C:/企鹅号发布/pictures/配图1-${version}版本.jpg`,
    picture2Path: `C:/企鹅号发布/pictures/配图2-${version}版本.jpg`,
    articleCoverPath: `C:/企鹅号发布/covers/封面-${version}版.jpg`,
    version,
    selectionMode: "matched-triplet"
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("runCommand", () => {
  it("returns per-window summaries in pause-before-publish mode", async () => {
    const browser1 = createBrowser(createPage("page-1"));
    const browser2 = createBrowser(createPage("page-2"));
    const writeRunEvent = createWriteRunEventMock();
    const publishArticle = vi
      .fn()
      .mockResolvedValueOnce({
        status: "ready-to-publish",
        message: "已完成，停在发布前"
      })
      .mockResolvedValueOnce({
        status: "ready-to-publish",
        message: "已完成，停在发布前"
      });
    const connectBrowser = vi
      .fn()
      .mockResolvedValueOnce(browser1)
      .mockResolvedValueOnce(browser2);

    const summary = await runCommand("/发企鹅号 1-2窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" },
        { profileId: 2, videoPath: "C:/企鹅号发布/videos/b.mp4", title: "b" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async (_baseUrl: string, profileId: number) => ({
        ws: `ws://profile-${profileId}`
      }),
      connectBrowser,
      publishArticle,
      writeRunEvent
    });

    expect(summary).toEqual([
      "1窗口：a 已完成，停在发布前",
      "2窗口：b 已完成，停在发布前"
    ]);
    expect(connectBrowser).toHaveBeenNthCalledWith(1, "ws://profile-1");
    expect(connectBrowser).toHaveBeenNthCalledWith(2, "ws://profile-2");
    expect(publishArticle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        page: { id: "page-1" },
        publishUrl: "https://om.qq.com/article/publish",
        title: "a",
        videoPath: "C:/企鹅号发布/videos/a.mp4",
        videoCoverPath: "C:/企鹅号发布/video-covers/cover.png",
        articleImagePaths: [
          "C:/企鹅号发布/pictures/配图1-A版本.jpg",
          "C:/企鹅号发布/pictures/配图2-A版本.jpg"
        ],
        articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
        mode: "pause-before-publish"
      })
    );
    expect(writeRunEvent).toHaveBeenCalledTimes(2);
    expect(writeRunEvent.mock.calls[0]?.[0]).toContain(
      join("C:/企鹅号发布", "logs")
    );
    expect(writeRunEvent.mock.calls[0]?.[1]).toMatchObject({
      profileId: 1,
      status: "ready-to-publish",
      message: "已完成，停在发布前"
    });
    expect(browser1.close).toHaveBeenCalledOnce();
    expect(browser2.close).toHaveBeenCalledOnce();
  });

  it("moves a video to used only after auto publish succeeds", async () => {
    const browser = createBrowser(createPage("page-1"));
    const writeRunEvent = createWriteRunEventMock();
    const movePublishedVideoToUsed = vi.fn(
      async () => "C:/企鹅号发布/used/a.mp4"
    );

    const summary = await runCommand("/发企鹅号 1窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "auto-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-1"
      }),
      connectBrowser: vi.fn().mockResolvedValue(browser),
      publishArticle: async () => ({
        status: "published" as const,
        message: "已自动发布"
      }),
      movePublishedVideoToUsed,
      writeRunEvent
    });

    expect(summary).toEqual(["1窗口：a 已自动发布"]);
    expect(movePublishedVideoToUsed).toHaveBeenCalledWith(
      "C:/企鹅号发布/videos/a.mp4",
      "C:/企鹅号发布"
    );
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 1,
        status: "published",
        message: "已自动发布"
      })
    );
  });

  it("does not move a video when publish stops before final confirmation", async () => {
    const movePublishedVideoToUsed = vi.fn();

    const summary = await runCommand("/发企鹅号 1窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-1"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser()),
      publishArticle: async () => ({
        status: "ready-to-publish" as const,
        message: "已完成，停在发布前"
      }),
      movePublishedVideoToUsed,
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["1窗口：a 已完成，停在发布前"]);
    expect(movePublishedVideoToUsed).not.toHaveBeenCalled();
  });

  it("reports a move failure after publishing so the video is not silently reused", async () => {
    const writeRunEvent = createWriteRunEventMock();

    const summary = await runCommand("/发企鹅号 1窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "auto-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-1"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser()),
      publishArticle: async () => ({
        status: "published" as const,
        message: "已自动发布"
      }),
      movePublishedVideoToUsed: async () => {
        throw new Error("文件被占用");
      },
      writeRunEvent
    });

    expect(summary).toEqual([
      "1窗口：a 已自动发布；移动已发布视频失败：文件被占用"
    ]);
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 1,
        status: "failed",
        message: "已自动发布；移动已发布视频失败：文件被占用"
      })
    );
  });

  it("continues later windows after a single window fails and logs the failure", async () => {
    const browser1 = createBrowser(createPage("page-1"));
    const browser2 = createBrowser(createPage("page-2"));
    const browser3 = createBrowser(createPage("page-3"));
    const writeRunEvent = createWriteRunEventMock();
    const publishArticle = vi.fn(
      async ({ title }: { title: string }) => {
        if (title === "b") {
          throw new Error("发布失败：封面上传超时");
        }

        return {
          status: "ready-to-publish" as const,
          message: "已完成，停在发布前"
        };
      }
    );

    const summary = await runCommand("/发企鹅号 1-3窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" },
        { profileId: 2, videoPath: "C:/企鹅号发布/videos/b.mp4", title: "b" },
        { profileId: 3, videoPath: "C:/企鹅号发布/videos/c.mp4", title: "c" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async (_baseUrl: string, profileId: number) => ({
        ws: `ws://profile-${profileId}`
      }),
      connectBrowser: vi
        .fn()
        .mockResolvedValueOnce(browser1)
        .mockResolvedValueOnce(browser2)
        .mockResolvedValueOnce(browser3),
      publishArticle,
      writeRunEvent
    });

    expect(summary).toEqual([
      "1窗口：a 已完成，停在发布前",
      "2窗口：b 发布失败：封面上传超时",
      "3窗口：c 已完成，停在发布前"
    ]);
    expect(publishArticle).toHaveBeenCalledTimes(3);
    expect(writeRunEvent).toHaveBeenCalledTimes(3);
    expect(writeRunEvent.mock.calls[1]?.[1]).toMatchObject({
      profileId: 2,
      title: "b",
      status: "failed",
      message: "发布失败：封面上传超时"
    });
    expect(browser1.close).toHaveBeenCalledOnce();
    expect(browser2.close).toHaveBeenCalledOnce();
    expect(browser3.close).toHaveBeenCalledOnce();
  });

  it("falls back to debuggingAddress when ws is missing", async () => {
    const connectBrowser = vi.fn().mockResolvedValue(createBrowser());

    const summary = await runCommand("/发企鹅号 5窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 5, videoPath: "C:/企鹅号发布/videos/e.mp4", title: "e" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        debuggingAddress: "127.0.0.1:9333"
      }),
      connectBrowser,
      publishArticle: async () => ({
        status: "ready-to-publish" as const,
        message: "已完成，停在发布前"
      }),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["5窗口：e 已完成，停在发布前"]);
    expect(connectBrowser).toHaveBeenCalledWith("http://127.0.0.1:9333");
  });

  it("switches to production mode without running any publish work", async () => {
    const saveConfig = vi.fn(async () => undefined);

    const summary = await runCommand("/发企鹅号 正式模式", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      saveConfig,
      allocateVideosForProfiles: async () => {
        throw new Error("不应该进入视频分配");
      },
      pickRandomCover: async () => {
        throw new Error("不应该进入封面分配");
      },
      pickArticleAssetSet: async () => {
        throw new Error("不应该进入配图分配");
      },
      openProfile: async () => {
        throw new Error("不应该打开窗口");
      },
      connectBrowser: async () => {
        throw new Error("不应该连接浏览器");
      },
      publishArticle: async () => {
        throw new Error("不应该执行发布");
      },
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["已切换到正式模式，全自动发布。"]);
    expect(saveConfig).toHaveBeenCalledWith(
      "config/penguinhao.config.json",
      expect.objectContaining({
        mode: "auto-publish"
      })
    );
  });

  it("uses the default Playwright adapter and separate upload controls in pause mode", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 2, countSequence: [0, 2] },
        '.ProseMirror div.video[data-widget="video"] video[poster]': {
          count: 2,
          countSequence: [0, 2]
        },
        'button.exeditor-menu-basic-video': { count: 1 },
        'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
        'input[placeholder="请输入标题名称"]': { count: 1 },
        'button:has-text("上传封面")': { count: 1 },
        'text=上传中': { count: 1, countSequence: [1, 1, 0] },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=剧情演绎，仅供娱乐': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        '[data-video-ready="true"]': { count: 1 },
        '[data-video-cover-ready="true"]': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      actions
    );
    const writeRunEvent = createWriteRunEventMock();

    const summary = await runCommand("/发企鹅号 8窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 8, videoPath: "C:/企鹅号发布/videos/happy.mp4", title: "happy" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover-happy.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-8"
      }),
      connectBrowser: vi
        .fn()
        .mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent
    });

    expect(summary).toEqual(["8窗口：happy 已完成，停在发布前"]);
    expect(actions).toContain(
      'click:div.ProseMirror.ExEditor-basic[contenteditable="true"]:0'
    );
    expect(actions).toContain("keyboard:Control+End");
    expect(actions).toContain("waitForTimeout:500");
    const confirmIndexes = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => {
        return action ===
          'click:.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary:0';
      })
      .map(({ index }) => index);
    const insertImageTriggerIndex = actions.indexOf(
      'click:exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]:0'
    );
    expect(actions).toContain(
      'click:exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]:0'
    );
    expect(actions).toContain("removeEmptyEditorChildren");
    const firstImageUploadAction =
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][multiple]:0:C:/企鹅号发布/pictures/配图1-A版本.jpg";
    const secondImageUploadAction =
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][multiple]:0:C:/企鹅号发布/pictures/配图2-A版本.jpg";
    expect(actions).toContain(firstImageUploadAction);
    expect(actions).toContain(secondImageUploadAction);
    const firstImageUploadIndex = actions.indexOf(firstImageUploadAction);
    const secondImageUploadIndex = actions.indexOf(secondImageUploadAction);
    const articleCoverTriggerIndex = actions.indexOf(
      'click:#articlePublish-coverinfo span:has-text("更换"):0'
    );
    const videoTriggerIndex = actions.indexOf(
      "click:button.exeditor-menu-basic-video:0"
    );
    expect(insertImageTriggerIndex).toBeLessThan(videoTriggerIndex);
    expect(actions).toContain("keyboard:ArrowLeft");
    expect(actions).toContain(
      "setInputFiles:input[name=\"Filedata\"][type=\"file\"]:0:C:/企鹅号发布/videos/happy.mp4"
    );
    expect(actions).toContain(
      "fill:input[placeholder=\"请输入标题名称\"]:0:happy"
    );
    expect(actions).toContain(
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/video-covers/cover-happy.png"
    );
    expect(secondImageUploadIndex).toBeGreaterThan(firstImageUploadIndex);
    const confirmIndexesAfterImages = confirmIndexes.filter((index) => {
      return index > firstImageUploadIndex && index < articleCoverTriggerIndex;
    });
    expect(confirmIndexesAfterImages.length).toBeGreaterThanOrEqual(2);
    expect(actions).toContain(
      'click:#articlePublish-coverinfo span:has-text("更换"):0'
    );
    expect(actions).toContain(
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/covers/封面-A版.jpg"
    );
    expect(actions).toContain(
      "click:#articlePublish-selfDeclaration button.omui-button--dashed:0"
    );
    expect(actions).toContain(
      "click:#articlePublish-resourceAigcMarkInfo a:0"
    );
    expect(actions).toContain(
      "click:.omui-dialog-wrapper.open button:has-text(\"提交\"):0"
    );
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 8,
        status: "ready-to-publish"
      })
    );
  });

  it("clicks the video confirm button twice with a delay when the upload dialog stays open", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 1, countSequence: [0, 1] },
        '.ProseMirror div.video[data-widget="video"] video[poster]': {
          count: 1,
          countSequence: [0, 1]
        },
        'button.exeditor-menu-basic-video': { count: 1 },
        'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
        'input[placeholder="请输入标题名称"]': { count: 1 },
        'button:has-text("上传封面")': { count: 1 },
        '.omui-dialog-wrapper.open': { count: 1, countSequence: [1, 0] },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=剧情演绎，仅供娱乐': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        '[data-video-ready="true"]': { count: 1 },
        '[data-video-cover-ready="true"]': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      actions
    );

    const summary = await runCommand("/发企鹅号 16窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 16, videoPath: "C:/企鹅号发布/videos/twice.mp4", title: "twice" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/twice.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-16"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["16窗口：twice 已完成，停在发布前"]);

    const videoConfirmAction =
      'click:.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary:0';
    const coverUploadIndex = actions.indexOf(
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/video-covers/twice.png"
    );
    const firstConfirmIndex = actions.indexOf(videoConfirmAction, coverUploadIndex);
    const secondConfirmIndex = actions.indexOf(
      videoConfirmAction,
      firstConfirmIndex + 1
    );

    expect(coverUploadIndex).toBeGreaterThan(-1);
    expect(firstConfirmIndex).toBeGreaterThan(-1);
    expect(secondConfirmIndex).toBeGreaterThan(firstConfirmIndex);
    expect(actions.slice(firstConfirmIndex, secondConfirmIndex + 1)).toContain(
      "waitForTimeout:2000"
    );
  });

  it("fills the video title and uploads the video cover before entering the upload wait", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 1, countSequence: [0, 1] },
        '.ProseMirror div.video[data-widget="video"] video[poster]': {
          count: 1,
          countSequence: [0, 1]
        },
        'button.exeditor-menu-basic-video': { count: 1 },
        'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
        'input[placeholder="请输入标题名称"]': { count: 1 },
        'button:has-text("上传封面")': { count: 1 },
        '.omui-dialog-wrapper.open': { count: 1, countSequence: [1, 0] },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=剧情演绎，仅供娱乐': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        '[data-video-ready="true"]': { count: 1 },
        '[data-video-cover-ready="true"]': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      actions
    );

    const summary = await runCommand("/发企鹅号 17窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 17, videoPath: "C:/企鹅号发布/videos/parallel.mp4", title: "parallel" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/parallel.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-17"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["17窗口：parallel 已完成，停在发布前"]);

    const uploadVideoIndex = actions.indexOf(
      "setInputFiles:input[name=\"Filedata\"][type=\"file\"]:0:C:/企鹅号发布/videos/parallel.mp4"
    );
    const fillVideoTitleIndex = actions.indexOf(
      'fill:input[placeholder="请输入标题名称"]:0:parallel'
    );
    const uploadVideoCoverIndex = actions.indexOf(
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/video-covers/parallel.png"
    );
    const firstWaitAfterUploadIndex = actions.findIndex((action, index) => {
      return index > uploadVideoIndex && action.startsWith("waitForTimeout:");
    });

    expect(uploadVideoIndex).toBeGreaterThan(-1);
    expect(fillVideoTitleIndex).toBeGreaterThan(uploadVideoIndex);
    expect(uploadVideoCoverIndex).toBeGreaterThan(fillVideoTitleIndex);
    expect(firstWaitAfterUploadIndex).toBeGreaterThan(uploadVideoCoverIndex);
  });

  it("reports a 30-second heartbeat while the upload dialog is still pending", async () => {
    const actions: string[] = [];
    const reportProgress = vi.fn(async () => undefined);
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 1, countSequence: [0, 1] },
        '.ProseMirror div.video[data-widget="video"] video[poster]': {
          count: 1,
          countSequence: [0, 1]
        },
        'button.exeditor-menu-basic-video': { count: 1 },
        'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
        'input[placeholder="请输入标题名称"]': { count: 1 },
        'button:has-text("上传封面")': { count: 1 },
        '.omui-dialog-wrapper.open': { count: 1, countSequence: [1, 0] },
        '.omui-dialog-wrapper.open .omui-dialog-body': {
          count: 1,
          textContentSequence: [...Array(61).fill("上传中"), "上传成功"]
        },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=剧情演绎，仅供娱乐': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        '[data-video-ready="true"]': { count: 1 },
        '[data-video-cover-ready="true"]': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      actions
    );

    const summary = await runCommand("发视频 18", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 18, videoPath: "C:/企鹅号发布/videos/heartbeat.mp4", title: "heartbeat" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/heartbeat.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-18"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock(),
      reportProgress
    });

    expect(summary).toEqual(["18窗口：heartbeat 已完成，停在发布前"]);
    expect(reportProgress).toHaveBeenCalledWith({
      profileId: 18,
      title: "heartbeat",
      message: "视频上传流程仍在进行，可能持续1-30分钟；继续等待，不要结束任务"
    });
  });

  it("brings the page to front and waits for a real editor caret before uploading video", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"] p': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 1, countSequence: [0, 1] },
        '.ProseMirror div.video[data-widget="video"] video[poster]': {
          count: 1,
          countSequence: [0, 1]
        },
        'button.exeditor-menu-basic-video': { count: 1 },
        'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
        'input[placeholder="请输入标题名称"]': { count: 1 },
        'button:has-text("上传封面")': { count: 1 },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=剧情演绎，仅供娱乐': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        '[data-video-ready="true"]': { count: 1 },
        '[data-video-cover-ready="true"]': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      actions,
      {
        caretReadySequence: [false, true],
        startReadySequence: [false, true]
      }
    );

    const summary = await runCommand("/发企鹅号 11窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 11, videoPath: "C:/企鹅号发布/videos/caret.mp4", title: "caret" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/caret.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-11"
      }),
      connectBrowser: vi
        .fn()
        .mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["11窗口：caret 已完成，停在发布前"]);
    expect(actions).toContain("bringToFront");
    expect(actions).toContain(
      'click:div.ProseMirror.ExEditor-basic[contenteditable="true"] p:0'
    );
    expect(actions.filter((action) => action === "bringToFront").length).toBeGreaterThanOrEqual(2);
  });

  it("fails before uploading video when the cursor cannot move to the start after inserting images", async () => {
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"] p': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        '[data-inline-image="true"]': { count: 2 }
      },
      [],
      {
        startReadySequence: Array(20).fill(false)
      }
    );
    const writeRunEvent = createWriteRunEventMock();

    const summary = await runCommand("/发企鹅号 12窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 12, videoPath: "C:/企鹅号发布/videos/focus.mp4", title: "focus" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/focus.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-12"
      }),
      connectBrowser: vi
        .fn()
        .mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent
    });

    expect(summary[0]).toContain("正文光标未移动到最前");
    expect(fakePage.actions).toContain(
      'click:exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]:0'
    );
    expect(fakePage.actions).not.toContain("click:button.exeditor-menu-basic-video:0");
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 12,
        status: "failed"
      })
    );
  });

  it("asks the user to log in first when the target ixBrowser window is still on the login page", async () => {
    const fakePage = createPlaywrightLikePage(
      {
        'img[alt*="二维码"]': { count: 1 }
      },
      []
    );
    const writeRunEvent = createWriteRunEventMock();

    fakePage.page.evaluate = (async (pageFunction?: unknown) => {
      const source = String(pageFunction ?? "");

      if (source.includes("window.location.href")) {
        return "https://om.qq.com/userAuth/index";
      }

      return {
        ready: true,
        hasSelection: true,
        isCollapsed: true,
        activeInEditor: true,
        selectedBlockCount: 0,
        atStart: true
      };
    }) as typeof fakePage.page.evaluate;

    const summary = await runCommand("/发企鹅号 13窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 13, videoPath: "C:/企鹅号发布/videos/login.mp4", title: "login" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/login.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-13"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent
    });

    expect(summary[0]).toContain("当前窗口未登录，请先在 ixBrowser 对应窗口完成扫码登录后重试");
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 13,
        status: "failed"
      })
    );
  });

  it("fails closed when article cover completion signals are not explicit", async () => {
    const writeRunEvent = createWriteRunEventMock();
    const fakePage = createPenguinPublishPage("page-9");
    fakePage.readPrePublishState = async () => ({
      hasTitle: true,
      hasVideo: true,
      hasVideoCover: true,
      insertedImageCount: 2,
      declarationConfirmed: true,
      aiDeclarationConfirmed: true,
      articleCover: {
        coverApplied: false
      }
    });
    fakePage.capturePrePublishEvidence = async () => "C:/企鹅号发布/logs/pre-publish-review-failed-attempt-2.png";

    const summary = await runCommand("/发企鹅号 9窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 9, videoPath: "C:/企鹅号发布/videos/closed.mp4", title: "closed" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover-closed.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-9"
      }),
      connectBrowser: vi
        .fn()
        .mockResolvedValue(createBrowser(fakePage)),
      writeRunEvent
    });

    expect(summary[0]).toContain("文章封面未设置完成");
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 9,
        status: "failed"
      })
    );
  });

  it("fails with a readable error when pictures or covers cannot produce a valid set", async () => {
    const fakePage = createPlaywrightLikePage({
      'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
      'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
      '.ProseMirror div.video[data-widget="video"]': { count: 1, countSequence: [1, 0, 1] },
      '.ProseMirror div.video[data-widget="video"] video[poster]': { count: 1 },
      'button.exeditor-menu-basic-video': { count: 1 },
      'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
      'input[placeholder="请输入标题名称"]': { count: 1 },
      'button:has-text("上传封面")': { count: 1 },
      'input[type="file"][accept*="image"]': { count: 1 },
      'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
      'li.omui-tab__label': { count: 3 },
      '.imageblock': { count: 3 },
      '.omui-dialog-footer button.omui-button--primary': { count: 1 },
      'button.addCoverBtn-cls3gyHX': { count: 1 },
      '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
      'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
      '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
      '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
      '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
      'text=已完成AI生成素材声明': {
        count: 1,
        countSequence: [...Array(20).fill(0), 1]
      },
      'text=剧情演绎，仅供娱乐': {
        count: 1,
        countSequence: [...Array(20).fill(0), 1]
      },
      "[data-material-index]": { count: 2 }
    });

    const summary = await runCommand("/发企鹅号 10窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 10, videoPath: "C:/企鹅号发布/videos/material.mp4", title: "material" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover-material.png",
      pickArticleAssetSet: async () => {
        throw new Error("pictures 目录缺少可用的配图2");
      },
      openProfile: async () => ({
        ws: "ws://profile-10"
      }),
      connectBrowser: vi
        .fn()
        .mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual([
      "10窗口：material pictures 目录缺少可用的配图2"
    ]);
  });

  it("waits for a delayed title input before continuing with the default adapter", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': {
          count: 1,
          countSequence: [0, 0, 1]
        },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 2, countSequence: [0, 2] },
        '.ProseMirror div.video[data-widget="video"] video[poster]': {
          count: 2,
          countSequence: [0, 2]
        },
        'button.exeditor-menu-basic-video': { count: 1 },
        'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
        'input[placeholder="请输入标题名称"]': { count: 1 },
        'button:has-text("上传封面")': { count: 1 },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=剧情演绎，仅供娱乐': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        '[data-video-ready="true"]': { count: 1 },
        '[data-video-cover-ready="true"]': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      actions
    );

    const summary = await runCommand("/发企鹅号 11窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 11, videoPath: "C:/企鹅号发布/videos/delay.mp4", title: "delay" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover-delay.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-11"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["11窗口：delay 已完成，停在发布前"]);
    expect(actions).toContain(
      'fill:span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]:0:delay'
    );
  });

  it("force clears title and editor leftovers before building a new draft", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"] p': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 1 },
        '.ProseMirror div.video[data-widget="video"] video[poster]': { count: 1 },
        '.ProseMirror .index_module_content__cffb2914': { count: 1 },
        'button.exeditor-menu-basic-video': { count: 1 },
        'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
        'input[placeholder="请输入标题名称"]': { count: 1 },
        'button:has-text("上传封面")': { count: 1 },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=剧情演绎，仅供娱乐': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        '[data-video-ready="true"]': { count: 1 },
        '[data-video-cover-ready="true"]': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      actions,
      {
        forceClearEditorResetsDraft: true,
        titleInputValue: "fresh"
      }
    );

    const summary = await runCommand("/发企鹅号 14窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 14, videoPath: "C:/企鹅号发布/videos/fresh.mp4", title: "fresh" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/fresh.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-14"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["14窗口：fresh 已完成，停在发布前"]);
    expect(actions).toContain("forceClearTitle");
    expect(actions).toContain("forceClearEditorDraft");
  });

  it("corrects a mismatched actual title value before the final publish check", async () => {
    const fakePage = createPlaywrightLikePage(
      {
        'input[placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"] p': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 1, countSequence: [0, 1] },
        '.ProseMirror div.video[data-widget="video"] video[poster]': {
          count: 1,
          countSequence: [0, 1]
        },
        'button.exeditor-menu-basic-video': { count: 1 },
        'input[name="Filedata"][type="file"]': { count: 1, visible: [true] },
        'input[placeholder="请输入标题名称"]': { count: 1 },
        'button:has-text("上传封面")': { count: 1 },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=剧情演绎，仅供娱乐': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        '[data-video-ready="true"]': { count: 1 },
        '[data-video-cover-ready="true"]': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      [],
      {
        forceClearEditorResetsDraft: true,
        titleInputValueSequence: [
          "正确标题",
          "正确标题",
          "被错误粘贴的标题",
          "正确标题",
          "正确标题",
          "被错误粘贴的标题"
        ]
      }
    );

    const summary = await runCommand("/发企鹅号 15窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 15, videoPath: "C:/企鹅号发布/videos/正确标题.mp4", title: "正确标题" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/title.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-15"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["15窗口：正确标题 已完成，停在发布前"]);
    expect(fakePage.actions).toContain(
      'fill:input[placeholder*="标题"]:0:正确标题'
    );
    expect(fakePage.actions).not.toContain("click:role:button:/发布/u:0");
  });
});

describe("runCli", () => {
  it("prints the current mode hint before running a publish command", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      })
    }));
    vi.doMock("../../src/config/save-config.js", () => ({
      saveConfig: async () => undefined
    }));
    vi.doMock("../../src/assets/video-pool.js", () => ({
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" }
      ],
      movePublishedVideoToUsed: async () => "C:/企鹅号发布/used/a.mp4"
    }));
    vi.doMock("../../src/assets/cover-picker.js", () => ({
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png"
    }));
    vi.doMock("../../src/assets/article-image-picker.js", () => ({
      pickArticleAssetSet: async () => createArticleAssets()
    }));
    vi.doMock("../../src/ixbrowser/open-profile.js", () => ({
      openProfile: async () => ({
        ws: "ws://profile-1"
      })
    }));
    vi.doMock("../../src/logs/run-logger.js", () => ({
      buildLogFilePath: () => "C:/企鹅号发布/logs/run.jsonl",
      writeRunEvent: async () => undefined
    }));
    vi.doMock("../../src/penguin/publish-article.js", () => ({
      publishArticle: async () => ({
        status: "ready-to-publish" as const,
        message: "已完成，停在发布前"
      })
    }));
    vi.doMock("playwright", () => ({
      chromium: {
        connectOverCDP: async () =>
          createBrowser(createPenguinPublishPage("page-1"))
      }
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runCli } = await import("../../src/cli.js");

    const exitCode = await runCli(["/发企鹅号", "1窗口"]);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "当前是开发模式，半自动发布，可切换到正式模式。"
    );
    expect(logSpy).toHaveBeenNthCalledWith(2, "1窗口：a 已完成，停在发布前");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("prints live progress before the final summary so long uploads do not look stalled", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      })
    }));
    vi.doMock("../../src/config/save-config.js", () => ({
      saveConfig: async () => undefined
    }));
    vi.doMock("../../src/assets/video-pool.js", () => ({
      allocateVideosForProfiles: async () => [
        { profileId: 3, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" }
      ],
      movePublishedVideoToUsed: async () => "C:/企鹅号发布/used/a.mp4"
    }));
    vi.doMock("../../src/assets/cover-picker.js", () => ({
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png"
    }));
    vi.doMock("../../src/assets/article-image-picker.js", () => ({
      pickArticleAssetSet: async () => createArticleAssets()
    }));
    vi.doMock("../../src/ixbrowser/open-profile.js", () => ({
      openProfile: async () => ({
        ws: "ws://profile-3"
      })
    }));
    vi.doMock("../../src/logs/run-logger.js", () => ({
      buildLogFilePath: () => "C:/企鹅号发布/logs/run.jsonl",
      writeRunEvent: async () => undefined
    }));
    vi.doMock("../../src/penguin/publish-article.js", () => ({
      publishArticle: async (input: {
        reportProgress?: (message: string) => Promise<void> | void;
      }) => {
        await input.reportProgress?.(
          "视频上传已开始，通常需要1-30分钟；继续设置视频标题和封面，等待期间不要结束任务"
        );
        await input.reportProgress?.(
          "视频标题和封面已设置，正在等待上传完成；等待期间不要结束任务"
        );
        return {
          status: "ready-to-publish" as const,
          message: "已完成，停在发布前"
        };
      }
    }));
    vi.doMock("playwright", () => ({
      chromium: {
        connectOverCDP: async () =>
          createBrowser(createPenguinPublishPage("page-3"))
      }
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runCli } = await import("../../src/cli.js");

    const exitCode = await runCli(["发视频", "3"]);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "当前是开发模式，半自动发布，可切换到正式模式。"
    );
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      "3窗口：a 视频上传已开始，通常需要1-30分钟；继续设置视频标题和封面，等待期间不要结束任务"
    );
    expect(logSpy).toHaveBeenNthCalledWith(
      3,
      "3窗口：a 视频标题和封面已设置，正在等待上传完成；等待期间不要结束任务"
    );
    expect(logSpy).toHaveBeenNthCalledWith(4, "3窗口：a 已完成，停在发布前");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("guides the user to reply with a window range when the command omits it", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runCli } = await import("../../src/cli.js");

    const exitCode = await runCli(["/发企鹅号"]);

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "请回复窗口号，例如：1窗口 或 1-5窗口"
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("accepts the short video alias in the CLI", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      })
    }));
    vi.doMock("../../src/assets/video-pool.js", () => ({
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" }
      ],
      movePublishedVideoToUsed: async () => "C:/企鹅号发布/used/a.mp4"
    }));
    vi.doMock("../../src/assets/cover-picker.js", () => ({
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png"
    }));
    vi.doMock("../../src/assets/article-image-picker.js", () => ({
      pickArticleAssetSet: async () => createArticleAssets()
    }));
    vi.doMock("../../src/ixbrowser/open-profile.js", () => ({
      openProfile: async () => ({
        ws: "ws://profile-1"
      })
    }));
    vi.doMock("../../src/logs/run-logger.js", () => ({
      buildLogFilePath: () => "C:/企鹅号发布/logs/run.jsonl",
      writeRunEvent: async () => undefined
    }));
    vi.doMock("../../src/penguin/publish-article.js", () => ({
      publishArticle: async () => ({
        status: "ready-to-publish" as const,
        message: "已完成，停在发布前"
      })
    }));
    vi.doMock("playwright", () => ({
      chromium: {
        connectOverCDP: async () =>
          createBrowser(createPenguinPublishPage("page-1"))
      }
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runCli } = await import("../../src/cli.js");

    const exitCode = await runCli(["/发视频", "1窗口"]);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith("1窗口：a 已完成，停在发布前");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("accepts a slashless range without the window suffix in the CLI", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      })
    }));
    vi.doMock("../../src/assets/video-pool.js", () => ({
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" },
        { profileId: 2, videoPath: "C:/企鹅号发布/videos/b.mp4", title: "b" }
      ],
      movePublishedVideoToUsed: async () => "C:/企鹅号发布/used/a.mp4"
    }));
    vi.doMock("../../src/assets/cover-picker.js", () => ({
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png"
    }));
    vi.doMock("../../src/assets/article-image-picker.js", () => ({
      pickArticleAssetSet: async () => createArticleAssets()
    }));
    vi.doMock("../../src/ixbrowser/open-profile.js", () => ({
      openProfile: async (_baseUrl: string, profileId: number) => ({
        ws: `ws://profile-${profileId}`
      })
    }));
    vi.doMock("../../src/logs/run-logger.js", () => ({
      buildLogFilePath: () => "C:/企鹅号发布/logs/run.jsonl",
      writeRunEvent: async () => undefined
    }));
    vi.doMock("../../src/penguin/publish-article.js", () => ({
      publishArticle: async () => ({
        status: "ready-to-publish" as const,
        message: "已完成，停在发布前"
      })
    }));
    vi.doMock("playwright", () => ({
      chromium: {
        connectOverCDP: async () =>
          createBrowser(createPenguinPublishPage("page-1"))
      }
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runCli } = await import("../../src/cli.js");

    const exitCode = await runCli(["发视频", "1-2"]);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith("1窗口：a 已完成，停在发布前");
    expect(logSpy).toHaveBeenCalledWith("2窗口：b 已完成，停在发布前");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns non-zero when a window failed even if the summary text does not contain 失败", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      })
    }));
    vi.doMock("../../src/config/save-config.js", () => ({
      saveConfig: async () => undefined
    }));
    vi.doMock("../../src/assets/video-pool.js", () => ({
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" }
      ],
      movePublishedVideoToUsed: async () => "C:/企鹅号发布/used/a.mp4"
    }));
    vi.doMock("../../src/assets/cover-picker.js", () => ({
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png"
    }));
    vi.doMock("../../src/assets/article-image-picker.js", () => ({
      pickArticleAssetSet: async () => createArticleAssets()
    }));
    vi.doMock("../../src/ixbrowser/open-profile.js", () => ({
      openProfile: async () => ({
        ws: "ws://profile-1"
      })
    }));
    vi.doMock("../../src/logs/run-logger.js", () => ({
      buildLogFilePath: () => "C:/企鹅号发布/logs/run.jsonl",
      writeRunEvent: async () => undefined
    }));
    vi.doMock("../../src/penguin/publish-article.js", () => ({
      publishArticle: async () => {
        throw new Error("封面上传超时");
      }
    }));
    vi.doMock("playwright", () => ({
      chromium: {
        connectOverCDP: async () =>
          createBrowser(createPenguinPublishPage("page-1"))
      }
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runCli } = await import("../../src/cli.js");

    const exitCode = await runCli(["/发企鹅号 1窗口"]);

    expect(exitCode).toBe(1);
    expect(logSpy).toHaveBeenCalledWith("1窗口：a 封面上传超时");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
