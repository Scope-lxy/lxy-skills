import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../src/cli.js";
import type { PickedArticleAssetSet } from "../../src/assets/article-image-picker.js";
import type { WindowRunResult } from "../../src/types/run-result.js";

vi.mock("../../src/assets/video-pool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/assets/video-pool.js")>();

  return {
    ...actual,
    movePublishedVideoToUsed: async () => "C:/企鹅号发布/used/test.mp4"
  };
});

interface FakeLocatorSpec {
  count: number;
  countSequence?: number[];
  textContent?: string | null;
  textContentSequence?: Array<string | null>;
  clickError?: string;
  clickErrorSequence?: Array<string | null>;
  visible?: boolean[];
  visibleSequence?: boolean[];
}

interface FakePageOptions {
  articleCoverTabMode?: "local" | "content";
  articleCoverTabModeWhenOpened?: "local" | "content";
  articleCoverLocalTabClickSetsLocal?: boolean;
  caretReadySequence?: boolean[];
  articleCoverSignatureSequence?: Array<string | null>;
  startReadySequence?: boolean[];
  currentUrl?: string;
  publishSuccessUrl?: string;
  videoConfirmBusyWaitsAfterClicks?: number[];
  videoCoverTabMode?: "upload" | "system";
  videoCoverTabModeWhenOpened?: "upload" | "system";
  videoCoverLocalTabClickSetsUpload?: boolean;
  videoCoverTabModeSwitchAfterWaits?: number;
  videoModalTitleValue?: string;
  videoModalTitleValueSequence?: string[];
  videoModalTitleValueAfterWaits?: string;
  videoModalTitleValueSwitchAfterWaits?: number;
  caretBoundaryRecovery?: {
    start?: boolean;
    end?: boolean;
  };
  contentBlockOrder?: Array<"video" | "image" | "empty">;
  forceClearEditorResetsDraft?: boolean;
  forceClearEditorDispatchResetsDraft?: boolean;
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
  const clickReads = new Map<string, number>();
  const textContentReads = new Map<string, number>();
  const visibleReads = new Map<string, number>();
  const filledValues = new Map<string, string>();
  let forceClearedEditor = false;
  let forceClearedEditorViaDispatch = false;
  let waitCount = 0;
  let currentUrl = options.currentUrl ?? "https://om.qq.com/article/publish";
  let videoConfirmBusyUntilWaitCount = -1;
  let videoConfirmClickCount = 0;
  let articleCoverDialogActive = false;
  let articleCoverTabMode = options.articleCoverTabMode ?? "local";
  const articleCoverTabModeWhenOpened = options.articleCoverTabModeWhenOpened ?? "local";
  const articleCoverLocalTabClickSetsLocal =
    options.articleCoverLocalTabClickSetsLocal ?? true;
  let videoCoverTabMode = options.videoCoverTabMode ?? "upload";
  const videoCoverTabModeWhenOpened = options.videoCoverTabModeWhenOpened ?? "upload";
  const videoCoverLocalTabClickSetsUpload =
    options.videoCoverLocalTabClickSetsUpload ?? true;
  let videoCoverTabModeSwitchedAfterWait = false;
  let videoCoverPendingConfirmation = false;
  let videoCoverSelectedFileName: string | null = null;
  let currentVideoModalTitleInputValue = options.videoModalTitleValue;
  let uploadedVideo = false;
  let forcedCaretReady = false;
  let forcedStartReady = false;
  const getSpec = (selector: string): FakeLocatorSpec => {
    if (
      selector === "role:button:存草稿" ||
      selector === "text=保存成功" ||
      selector.startsWith("exact-text:")
    ) {
      return { count: 1, visible: [true] };
    }

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

        if (options.forceClearEditorResetsDraft !== false && forceClearedEditor) {
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

        if (
          options.forceClearEditorDispatchResetsDraft !== false &&
          forceClearedEditorViaDispatch
        ) {
          if (
            selector === ".ProseMirror .index_module_content__cffb2914"
          ) {
            return getSpec(selector).countSequence?.length
              ? getSequenceValue(
                  countReads,
                  `${selector}:${index}`,
                  getSpec(selector).countSequence,
                  getSpec(selector).count
                )
              : 0;
          }

          if (
            selector === '.ProseMirror div.video[data-widget="video"]' ||
            selector === '.ProseMirror div.video[data-widget="video"] video[poster]'
          ) {
            return uploadedVideo
              ? getSequenceValue(
                  countReads,
                  `${selector}:${index}`,
                  getSpec(selector).countSequence,
                  getSpec(selector).count
                )
              : 0;
          }
        }

        if (
          videoCoverPendingConfirmation &&
          selector === '.omui-dialog-wrapper.open input[type="file"][accept*="image"]'
        ) {
          return videoCoverTabMode === "system"
            ? 0
            : getSequenceValue(
                countReads,
                `${selector}:${index}`,
                spec.countSequence,
                spec.count
              );
        }

        if (
          articleCoverDialogActive &&
          !videoCoverPendingConfirmation &&
          selector === '.omui-dialog-wrapper.open input[type="file"][accept*="image"]'
        ) {
          return articleCoverTabMode === "content"
            ? 0
            : getSequenceValue(
                countReads,
                `${selector}:${index}`,
                spec.countSequence,
                spec.count
              );
        }

        if (
          videoCoverPendingConfirmation &&
          typeof selector === "string" &&
          selector.includes("上传封面") &&
          !selector.includes('aria-selected="true"') &&
          !selector.includes("--active") &&
          !selector.includes("is-active") &&
          !selector.includes('aria-current="true"') &&
          !selector.includes('data-state="active"')
        ) {
          const localTabCount = spec.count > 0 ? spec.count : 1;
          return getSequenceValue(
            countReads,
            `${selector}:${index}`,
            spec.countSequence,
            localTabCount
          );
        }

        if (
          videoCoverPendingConfirmation &&
          typeof selector === "string" &&
          selector.includes("上传封面") &&
          (selector.includes('aria-selected="true"') ||
            selector.includes("--active") ||
            selector.includes("is-active") ||
            selector.includes('aria-current="true"') ||
            selector.includes('data-state="active"'))
        ) {
          const selectedCount = spec.count > 0 ? spec.count : 1;
          return videoCoverTabMode === "upload"
            ? getSequenceValue(
                countReads,
                `${selector}:${index}`,
                spec.countSequence,
                selectedCount
              )
            : 0;
        }

        if (
          articleCoverDialogActive &&
          typeof selector === "string" &&
          selector.includes("本地上传") &&
          !selector.includes('aria-selected="true"') &&
          !selector.includes("--active") &&
          !selector.includes("is-active") &&
          !selector.includes('aria-current="true"') &&
          !selector.includes('data-state="active"')
        ) {
          const localTabCount = spec.count > 0 ? spec.count : 1;
          return getSequenceValue(
            countReads,
            `${selector}:${index}`,
            spec.countSequence,
            localTabCount
          );
        }

        if (
          articleCoverDialogActive &&
          typeof selector === "string" &&
          selector.includes("本地上传") &&
          (selector.includes('aria-selected="true"') ||
            selector.includes("--active") ||
            selector.includes("is-active") ||
            selector.includes('aria-current="true"') ||
            selector.includes('data-state="active"'))
        ) {
          const selectedCount = spec.count > 0 ? spec.count : 1;
          return articleCoverTabMode === "local"
            ? getSequenceValue(
                countReads,
                `${selector}:${index}`,
                spec.countSequence,
                selectedCount
              )
            : 0;
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

        if (
          videoCoverPendingConfirmation &&
          typeof selector === "string" &&
          selector.includes("上传封面") &&
          !selector.includes('aria-selected="true"') &&
          !selector.includes("--active") &&
          !selector.includes("is-active") &&
          !selector.includes('aria-current="true"') &&
          !selector.includes('data-state="active"')
        ) {
          return true;
        }

        if (
          videoCoverPendingConfirmation &&
          typeof selector === "string" &&
          selector.includes("上传封面") &&
          (selector.includes('aria-selected="true"') ||
            selector.includes("--active") ||
            selector.includes("is-active") ||
            selector.includes('aria-current="true"') ||
            selector.includes('data-state="active"'))
        ) {
          return videoCoverTabMode === "upload";
        }

        if (
          articleCoverDialogActive &&
          typeof selector === "string" &&
          selector.includes("本地上传") &&
          !selector.includes('aria-selected="true"') &&
          !selector.includes("--active") &&
          !selector.includes("is-active") &&
          !selector.includes('aria-current="true"') &&
          !selector.includes('data-state="active"')
        ) {
          return true;
        }

        if (
          articleCoverDialogActive &&
          typeof selector === "string" &&
          selector.includes("本地上传") &&
          (selector.includes('aria-selected="true"') ||
            selector.includes("--active") ||
            selector.includes("is-active") ||
            selector.includes('aria-current="true"') ||
            selector.includes('data-state="active"'))
        ) {
          return articleCoverTabMode === "local";
        }

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
        const isVideoModalTitleSelector =
          selector === 'input[placeholder="请输入标题名称"]' ||
          selector === 'input[placeholder*="标题名称"]' ||
          selector === '.omui-dialog input[placeholder*="标题"]';

        if (isVideoModalTitleSelector) {
          currentVideoModalTitleInputValue = value;
        }

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
        const isVideoModalTitleSelector =
          selector === 'input[placeholder="请输入标题名称"]' ||
          selector === 'input[placeholder*="标题名称"]' ||
          selector === '.omui-dialog input[placeholder*="标题"]';

        if (isVideoModalTitleSelector && options.videoModalTitleValueSequence?.length) {
          return options.videoModalTitleValueSequence.shift() ?? "";
        }

        if (isVideoModalTitleSelector && currentVideoModalTitleInputValue !== undefined) {
          return currentVideoModalTitleInputValue;
        }

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
        if (
          selector === '.omui-dialog-wrapper.open input[type="file"][accept*="image"]' &&
          videoCoverPendingConfirmation
        ) {
          videoCoverSelectedFileName = normalized.split(/[/\\]/u).pop() ?? normalized;
        }
        actions.push(`setInputFiles:${selector}:${index}:${normalized}`);
      },
      async click() {
        actions.push(`click:${selector}:${index}`);
        const spec = getSpec(selector);
        const clickError = getSequenceValue(
          clickReads,
          `${selector}:${index}`,
          spec.clickErrorSequence,
          spec.clickError ?? null
        );

        if (typeof clickError === "string" && clickError.length > 0) {
          throw new Error(clickError);
        }

        if (selector === 'button:has-text("上传封面")') {
          videoCoverPendingConfirmation = true;
          videoCoverTabMode = videoCoverTabModeWhenOpened;
        }

        if (
          selector === '.omui-dialog-wrapper.open li.omui-tab__label:has-text("上传封面")' ||
          selector === '.omui-dialog-wrapper.open .omui-tab__label:has-text("上传封面")' ||
          selector === '.omui-dialog-wrapper.open button:has-text("上传封面")'
        ) {
          if (videoCoverLocalTabClickSetsUpload) {
            videoCoverTabMode = "upload";
          }
        }

        if (
          selector === '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary' &&
          videoCoverPendingConfirmation
        ) {
          videoConfirmClickCount += 1;
          const busyWaits =
            options.videoConfirmBusyWaitsAfterClicks?.[videoConfirmClickCount - 1] ?? 0;
          if (busyWaits > 0) {
            videoConfirmBusyUntilWaitCount = waitCount + busyWaits;
          }
          videoCoverPendingConfirmation = false;
          videoCoverTabMode = "upload";
          videoCoverSelectedFileName = null;
        }

        if (
          selector === '#articlePublish-coverinfo span:has-text("更换")' ||
          selector === '#articlePublish-coverinfo .omui-thumb__action span:has-text("更换")' ||
          selector === '#articlePublish-coverinfo .cover-container' ||
          selector === 'button.addCoverBtn-cls3gyHX' ||
          selector === '.articleCoverWrap-cls3i-ak button' ||
          selector === 'button:has-text("修改封面")' ||
          selector === 'button:has-text("添加封面")'
        ) {
          articleCoverDialogActive = true;
          articleCoverTabMode = articleCoverTabModeWhenOpened;
        }

        if (
          selector === '.omui-dialog-wrapper.open li.omui-tab__label:has-text("本地上传")' ||
          selector === '.omui-dialog-wrapper.open .omui-tab__label:has-text("本地上传")'
        ) {
          if (articleCoverLocalTabClickSetsLocal) {
            articleCoverTabMode = "local";
          }
        }

        if (
          selector === '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary' &&
          articleCoverDialogActive &&
          !videoCoverPendingConfirmation
        ) {
          articleCoverDialogActive = false;
          articleCoverTabMode = "local";
        }

        if (
          options.publishSuccessUrl &&
          (selector === "role:button:发布" ||
            selector === 'button:has-text("发布")' ||
            selector === '[role="button"]:has-text("发布")')
        ) {
          currentUrl = options.publishSuccessUrl;
        }
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
        currentUrl = url;
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
        waitCount += 1;

        if (
          options.videoCoverTabModeSwitchAfterWaits !== undefined &&
          waitCount >= options.videoCoverTabModeSwitchAfterWaits &&
          !videoCoverTabModeSwitchedAfterWait &&
          videoCoverPendingConfirmation
        ) {
          videoCoverTabMode = "system";
          videoCoverTabModeSwitchedAfterWait = true;
        }

        if (
          options.videoModalTitleValueSwitchAfterWaits !== undefined &&
          waitCount >= options.videoModalTitleValueSwitchAfterWaits &&
          options.videoModalTitleValueAfterWaits !== undefined
        ) {
          currentVideoModalTitleInputValue = options.videoModalTitleValueAfterWaits;
        }
      },
      locator(selector: string) {
        return createLocator(selector);
      },
      async evaluate(pageFunction?: unknown, arg?: unknown) {
        const source = String(pageFunction ?? "");

        if (source.includes("window.location.href")) {
          return currentUrl;
        }

        if (source.includes("__ixbrowserReadVideoConfirmProgressState")) {
          return {
            dialogOpen: true,
            buttonPresent: true,
            buttonBusy:
              videoConfirmBusyUntilWaitCount >= 0 &&
              waitCount < videoConfirmBusyUntilWaitCount
          };
        }

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

        if (source.includes("__ixbrowserForceClearEditorDraftViaView")) {
          actions.push("forceClearEditorDraftViaView");
          forceClearedEditorViaDispatch = true;
          forceClearedEditor = true;
          uploadedVideo = false;
          return true;
        }

        if (source.includes("__ixbrowserForceClearEditorDraft")) {
          actions.push("forceClearEditorDraft");
          forceClearedEditor = true;
          uploadedVideo = false;
          return true;
        }

        if (source.includes("__ixbrowserReadArticleCoverSignature")) {
          return options.articleCoverSignatureSequence?.shift() ?? null;
        }

        if (source.includes("__ixbrowserReadVideoCoverSelectionName")) {
          return videoCoverPendingConfirmation && videoCoverTabMode === "upload"
            ? videoCoverSelectedFileName
            : null;
        }

        if (source.includes("__ixbrowserMoveCaretToBoundary")) {
          const boundary =
            typeof arg === "object" &&
            arg !== null &&
            "boundary" in arg &&
            (arg as { boundary?: unknown }).boundary === "start"
              ? "start"
              : "end";

          actions.push(`forceEditorCaretBoundary:${boundary}`);

          if (options.caretBoundaryRecovery?.[boundary] === true) {
            forcedCaretReady = true;
            forcedStartReady = boundary === "start";
            return true;
          }

          return false;
        }

        const ready = forcedCaretReady
          ? true
          : getSequenceValue(
              countReads,
              "__caretReady__",
              options.caretReadySequence,
              true
            );
        const atStart = forcedStartReady
          ? true
          : getSequenceValue(
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
      getByRole(
        role: string,
        options?: { name?: string | RegExp; exact?: boolean }
      ) {
        return createLocator(`role:${role}:${String(options?.name ?? "")}`);
      },
      getByText(text: string) {
        return createLocator(`exact-text:${text}`);
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
    async saveDraft() {},
    async confirmSavedDraft() {}
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
  it("returns per-window summaries after saving drafts", async () => {
    const browser1 = createBrowser(createPage("page-1"));
    const browser2 = createBrowser(createPage("page-2"));
    const writeRunEvent = createWriteRunEventMock();
    const publishArticle = vi
      .fn()
      .mockResolvedValueOnce({
        status: "draft-saved",
        message: "已存草稿"
      })
      .mockResolvedValueOnce({
        status: "draft-saved",
        message: "已存草稿"
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
      movePublishedVideoToUsed: vi.fn(async () => "C:/企鹅号发布/used/a.mp4"),
      writeRunEvent
    });

    expect(summary).toEqual([
      "1窗口：a 已存草稿",
      "2窗口：b 已存草稿"
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
        articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg"
      })
    );
    expect(writeRunEvent).toHaveBeenCalledTimes(2);
    expect(writeRunEvent.mock.calls[0]?.[0]).toContain(
      join("C:/企鹅号发布", "logs")
    );
    expect(writeRunEvent.mock.calls[0]?.[1]).toMatchObject({
      profileId: 1,
      status: "draft-saved",
      message: "已存草稿"
    });
    expect(browser1.close).toHaveBeenCalledOnce();
    expect(browser2.close).toHaveBeenCalledOnce();
  });

  it("revalidates the video title and cover before confirming upload when they drift during the wait", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': {
          count: 1
        },
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
        '.omui-dialog-wrapper.open li.omui-tab__label:has-text("上传封面")': {
          count: 1
        },
        '.omui-dialog-wrapper.open .omui-tab__label:has-text("上传封面")': {
          count: 1
        },
        '.omui-dialog-wrapper.open': {
          count: 1,
          countSequence: [...Array(80).fill(1), 0],
          textContentSequence: [...Array(60).fill("上传中"), "上传中 59.38%", "上传成功"]
        },
        '.omui-dialog-wrapper.open .omui-dialog-body': {
          count: 1,
          textContentSequence: [...Array(60).fill("上传中"), "上传中 59.38%", "上传成功"]
        },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("虚构演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        '#articlePublish-resourceAigcMarkInfo a': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("提交")': { count: 1 },
        'text=已完成AI生成素材声明': {
          count: 1,
          countSequence: [...Array(20).fill(0), 1]
        },
        'text=虚构演绎，仅供娱乐': {
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
        videoModalTitleValue: "parallel",
        videoModalTitleValueAfterWaits: "被干扰的标题",
        videoModalTitleValueSwitchAfterWaits: 3,
        videoCoverTabModeSwitchAfterWaits: 1
      }
    );

    const summary = await runCommand("/发企鹅号 17窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        {
          profileId: 17,
          videoPath: "C:/企鹅号发布/videos/parallel.mp4",
          title: "parallel"
        }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/parallel.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-17"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["17窗口：parallel 已存草稿"]);

    const titleFillAction = 'fill:input[placeholder="请输入标题名称"]:0:parallel';
    const titleFillIndices = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => action === titleFillAction)
      .map(({ index }) => index);
    const coverUploadAction =
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/video-covers/parallel.png";
    const coverUploadIndices = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => action === coverUploadAction)
      .map(({ index }) => index);
    const localTabAction =
      'click:.omui-dialog-wrapper.open li.omui-tab__label:has-text("上传封面"):0';
    const localTabIndices = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => action === localTabAction)
      .map(({ index }) => index);
    expect(titleFillIndices.length).toBeGreaterThanOrEqual(2);
    expect(coverUploadIndices).toHaveLength(0);
    expect(localTabIndices.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts a preview-only video cover state when the upload input is no longer available", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': {
          count: 1
        },
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
        '.omui-dialog-wrapper.open li.omui-tab__label:has-text("上传封面")': {
          count: 1
        },
        '.omui-dialog-wrapper.open .omui-tab__label:has-text("上传封面")': {
          count: 1
        },
        '.omui-dialog-wrapper.open li.omui-tab__label[aria-selected="true"]:has-text("上传封面")': {
          count: 1
        },
        '.omui-dialog-wrapper.open .omui-tab__label[aria-selected="true"]:has-text("上传封面")': {
          count: 1
        },
        '.omui-dialog-wrapper.open input[type="file"]': { count: 1 },
        '.omui-dialog-wrapper.open': {
          count: 1,
          countSequence: [...Array(80).fill(1), 0],
          textContentSequence: [...Array(60).fill("上传中"), "上传中 59.38%", "上传成功"]
        },
        '.omui-dialog-wrapper.open .omui-dialog-body': {
          count: 1,
          textContentSequence: [...Array(60).fill("上传中"), "上传中 59.38%", "上传成功"]
        },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '.video-cover-preview img': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': {
          count: 1
        },
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
        videoCoverTabModeWhenOpened: "system"
      }
    );

    const summary = await runCommand("/发企鹅号 21窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        {
          profileId: 21,
          videoPath: "C:/企鹅号发布/videos/preview-only.mp4",
          title: "preview-only"
        }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/preview-only.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-21"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["21窗口：preview-only 已存草稿"]);
    expect(actions).toContain(
      'click:.omui-dialog-wrapper.open li.omui-tab__label:has-text("上传封面"):0'
    );
    expect(
      actions.some((action) => action.includes("video-covers/preview-only.png"))
    ).toBe(false);
  });

  it("accepts the video cover upload tab when the upload input is visible even if the selected-state marker is missing", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': {
          count: 1
        },
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
        '.omui-dialog-wrapper.open li.omui-tab__label:has-text("上传封面")': {
          count: 1
        },
        '.omui-dialog-wrapper.open .omui-tab__label:has-text("上传封面")': {
          count: 1
        },
        '.omui-dialog-wrapper.open': {
          count: 1,
          countSequence: [1, 0]
        },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
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
        videoCoverTabModeWhenOpened: "upload",
        videoCoverLocalTabClickSetsUpload: false
      }
    );

    const summary = await runCommand("/发企鹅号 22窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        {
          profileId: 22,
          videoPath: "C:/企鹅号发布/videos/upload-input.mp4",
          title: "upload-input"
        }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/upload-input.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-22"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["22窗口：upload-input 已存草稿"]);
    expect(
      actions.some((action) => action.includes("video-covers/upload-input.png"))
    ).toBe(false);
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
        status: "draft-saved" as const,
        message: "已存草稿"
      }),
      movePublishedVideoToUsed,
      writeRunEvent
    });

    expect(summary).toEqual(["1窗口：a 已存草稿"]);
    expect(movePublishedVideoToUsed).toHaveBeenCalledWith(
      "C:/企鹅号发布/videos/a.mp4",
      "C:/企鹅号发布"
    );
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 1,
        status: "draft-saved",
        message: "已存草稿"
      })
    );
  });

  it("moves a video only after saving the draft", async () => {
    const movePublishedVideoToUsed = vi.fn(
      async () => "C:/企鹅号发布/used/a.mp4"
    );

    const summary = await runCommand("/发企鹅号 1窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
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
        status: "draft-saved" as const,
        message: "已存草稿"
      }),
      movePublishedVideoToUsed,
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["1窗口：a 已存草稿"]);
    expect(movePublishedVideoToUsed).toHaveBeenCalledWith(
      "C:/企鹅号发布/videos/a.mp4",
      "C:/企鹅号发布"
    );
  });

  it("reports a move failure after saving a draft so the video is not silently reused", async () => {
    const writeRunEvent = createWriteRunEventMock();

    const summary = await runCommand("/发企鹅号 1窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
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
        status: "draft-saved" as const,
        message: "已存草稿"
      }),
      movePublishedVideoToUsed: async () => {
        throw new Error("文件被占用");
      },
      writeRunEvent
    });

    expect(summary).toEqual([
      "1窗口：a 已存草稿；移动已存草稿视频失败：文件被占用"
    ]);
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 1,
        status: "failed",
        message: "已存草稿；移动已存草稿视频失败：文件被占用"
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
          status: "draft-saved" as const,
          message: "已存草稿"
        };
      }
    );

    const summary = await runCommand("/发企鹅号 1-3窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
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
      movePublishedVideoToUsed: vi.fn(async () => "C:/企鹅号发布/used/a.mp4"),
      writeRunEvent
    });

    expect(summary).toEqual([
      "1窗口：a 已存草稿",
      "2窗口：b 发布失败：封面上传超时",
      "3窗口：c 已存草稿"
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
        status: "draft-saved" as const,
        message: "已存草稿"
      }),
      movePublishedVideoToUsed: vi.fn(async () => "C:/企鹅号发布/used/e.mp4"),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["5窗口：e 已存草稿"]);
    expect(connectBrowser).toHaveBeenCalledWith("http://127.0.0.1:9333");
  });

  it("uses the default Playwright adapter and separate upload controls", async () => {
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
      actions,
      {
        articleCoverTabModeWhenOpened: "content"
      }
    );
    const writeRunEvent = createWriteRunEventMock();

    const summary = await runCommand("/发企鹅号 8窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
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

    expect(summary).toEqual(["8窗口：happy 已存草稿"]);
    expect(actions).toContain(
      'click:div.ProseMirror.ExEditor-basic[contenteditable="true"]:0'
    );
    expect(actions).toContain("keyboard:End");
    expect(actions).toContain("waitForTimeout:500");
    const fillTitleIndex = actions.indexOf(
      "fill:span.omui-inputautogrowing__inner[contenteditable=\"true\"][data-placeholder*=\"标题\"]:0:happy"
    );
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
    const articleCoverUploadIndex = actions.indexOf(
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/covers/封面-A版.jpg"
    );
    const declarationTriggerIndex = actions.indexOf(
      "click:#articlePublish-selfDeclaration button.omui-button--dashed:0"
    );
    const aiDeclarationEntryIndex = actions.indexOf(
      "click:#articlePublish-resourceAigcMarkInfo a:0"
    );
    const aiDeclarationSubmitIndex = actions.indexOf(
      "click:.omui-dialog-wrapper.open button:has-text(\"提交\"):0"
    );
    const removeEmptyEditorChildrenIndex = actions.indexOf("removeEmptyEditorChildren");
    const videoTriggerIndex = actions.indexOf(
      "click:button.exeditor-menu-basic-video:0"
    );
    expect(fillTitleIndex).toBeGreaterThan(-1);
    expect(articleCoverTriggerIndex).toBeGreaterThan(fillTitleIndex);
    expect(articleCoverTriggerIndex).toBeLessThan(insertImageTriggerIndex);
    expect(articleCoverUploadIndex).toBeGreaterThan(articleCoverTriggerIndex);
    expect(articleCoverUploadIndex).toBeLessThan(insertImageTriggerIndex);
    expect(declarationTriggerIndex).toBeGreaterThan(articleCoverUploadIndex);
    expect(declarationTriggerIndex).toBeLessThan(insertImageTriggerIndex);
    expect(insertImageTriggerIndex).toBeLessThan(videoTriggerIndex);
    expect(actions).toContain("forceClearEditorDraftViaView");
    expect(actions).toContain(
      "setInputFiles:input[name=\"Filedata\"][type=\"file\"]:0:C:/企鹅号发布/videos/happy.mp4"
    );
    expect(actions).toContain(
      "fill:input[placeholder=\"请输入标题名称\"]:0:happy"
    );
    expect(
      actions.some((action) => action.includes("video-covers/cover-happy.png"))
    ).toBe(false);
    expect(secondImageUploadIndex).toBeGreaterThan(firstImageUploadIndex);
    expect(actions).toContain(
      'click:#articlePublish-coverinfo span:has-text("更换"):0'
    );
    const articleCoverLocalTabAction =
      'click:.omui-dialog-wrapper.open li.omui-tab__label:has-text("本地上传"):0';
    const articleCoverLocalTabIndex = actions.indexOf(
      articleCoverLocalTabAction,
      articleCoverTriggerIndex
    );
    expect(articleCoverLocalTabIndex).toBeGreaterThan(articleCoverTriggerIndex);
    expect(articleCoverLocalTabIndex).toBeLessThan(
      articleCoverUploadIndex
    );
    expect(aiDeclarationEntryIndex).toBeGreaterThan(removeEmptyEditorChildrenIndex);
    expect(aiDeclarationSubmitIndex).toBeGreaterThan(aiDeclarationEntryIndex);
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 8,
        status: "draft-saved"
      })
    );
  });

  it("confirms a saved draft from the content management page", async () => {
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
      actions,
      {
        publishSuccessUrl: "https://om.qq.com/content/manage?tab=published"
      }
    );

    const summary = await runCommand("/发企鹅号 18窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 18, videoPath: "C:/企鹅号发布/videos/auto.mp4", title: "auto" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover-auto.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-18"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      movePublishedVideoToUsed: vi.fn(async () => "C:/企鹅号发布/used/auto.mp4"),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["18窗口：auto 已存草稿"]);
    expect(actions).toContain("click:role:button:存草稿:0");
    expect(actions).toContain(
      "goto:https://om.qq.com/main/management/articleManage:domcontentloaded"
    );
    expect(actions).toContain("waitForTimeout:3000");
  });

  it("saves a draft without leaving the editor page", async () => {
    const actions: string[] = [];
    const writeRunEvent = createWriteRunEventMock();
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

    const summary = await runCommand("/发企鹅号 19窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 19, videoPath: "C:/企鹅号发布/videos/stuck.mp4", title: "stuck" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover-stuck.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-19"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent
    });

    expect(summary).toEqual(["19窗口：stuck 已存草稿"]);
    expect(actions).toContain("click:role:button:存草稿:0");
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 19,
        status: "draft-saved"
      })
    );
  });

  it("does not depend on post-publish login redirects when saving a draft", async () => {
    const actions: string[] = [];
    const writeRunEvent = createWriteRunEventMock();
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
      actions,
      {
        publishSuccessUrl: "https://om.qq.com/userAuth/index"
      }
    );

    const summary = await runCommand("/发企鹅号 21窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 21, videoPath: "C:/企鹅号发布/videos/login-redirect.mp4", title: "login-redirect" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover-login-redirect.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-21"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent
    });

    expect(summary).toEqual(["21窗口：login-redirect 已存草稿"]);
    expect(writeRunEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profileId: 21,
        status: "draft-saved"
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

    expect(summary).toEqual(["16窗口：twice 已存草稿"]);

    const videoConfirmAction =
      'click:.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary:0';
    const firstConfirmIndex = actions.indexOf(videoConfirmAction);
    const secondConfirmIndex = actions.indexOf(
      videoConfirmAction,
      firstConfirmIndex + 1
    );

    expect(firstConfirmIndex).toBeGreaterThan(-1);
    expect(secondConfirmIndex).toBeGreaterThan(firstConfirmIndex);
    expect(
      actions
        .slice(firstConfirmIndex, secondConfirmIndex + 1)
        .filter((action) => action === "waitForTimeout:500").length
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not click video confirm twice while the first confirm is still in a busy animation state", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': {
          count: 1
        },
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
        '.omui-dialog-wrapper.open': { count: 1, countSequence: [...Array(80).fill(1), 0] },
        '.omui-dialog-wrapper.open .omui-dialog-body': {
          count: 1,
          textContentSequence: ["上传中", ...Array(70).fill("上传成功")]
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
      actions,
      {
        videoConfirmBusyWaitsAfterClicks: [30]
      }
    );

    const summary = await runCommand("/发企鹅号 26窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 26, videoPath: "C:/企鹅号发布/videos/busy.mp4", title: "busy" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/busy.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-26"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["26窗口：busy 已存草稿"]);
    const videoConfirmAction =
      'click:.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary:0';
    const fillVideoTitleIndex = actions.indexOf(
      'fill:input[placeholder="请输入标题名称"]:0:busy'
    );
    const aiDeclarationEntryIndex = actions.indexOf(
      "click:#articlePublish-resourceAigcMarkInfo a:0"
    );
    const videoConfirmClicks = actions.filter(
      (action, index) =>
        index > fillVideoTitleIndex &&
        index < aiDeclarationEntryIndex &&
        action === videoConfirmAction
    );
    expect(videoConfirmClicks).toHaveLength(1);
  });

  it("continues through the remaining publish steps after a transient video confirm click failure", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': {
          count: 1
        },
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
          textContentSequence: ["上传中", "上传成功"]
        },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': {
          count: 1,
          clickErrorSequence: [
            null,
            null,
            null,
            "locator.click: Timeout 30000ms exceeded."
          ]
        },
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

    const summary = await runCommand("发视频 19", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 19, videoPath: "C:/企鹅号发布/videos/recover.mp4", title: "recover" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/recover.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-19"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["19窗口：recover 已存草稿"]);
    expect(actions).toContain(
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/covers/封面-A版.jpg"
    );
    expect(actions).toContain(
      "click:#articlePublish-selfDeclaration button.omui-button--dashed:0"
    );
    expect(actions).toContain("click:#articlePublish-resourceAigcMarkInfo a:0");
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

    expect(summary).toEqual(["17窗口：parallel 已存草稿"]);

    const uploadVideoIndex = actions.indexOf(
      "setInputFiles:input[name=\"Filedata\"][type=\"file\"]:0:C:/企鹅号发布/videos/parallel.mp4"
    );
    const fillVideoTitleIndex = actions.indexOf(
      'fill:input[placeholder="请输入标题名称"]:0:parallel'
    );
    const uploadVideoCoverIndex = actions.indexOf(
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/video-covers/parallel.png"
    );
    const firstWaitAfterTitleIndex = actions.findIndex((action, index) => {
      return index > fillVideoTitleIndex && action.startsWith("waitForTimeout:");
    });

    expect(uploadVideoIndex).toBeGreaterThan(-1);
    expect(fillVideoTitleIndex).toBeGreaterThan(uploadVideoIndex);
    if (uploadVideoCoverIndex >= 0) {
      const firstWaitAfterCoverIndex = actions.findIndex((action, index) => {
        return index > uploadVideoCoverIndex && action.startsWith("waitForTimeout:");
      });

      expect(uploadVideoCoverIndex).toBeGreaterThan(fillVideoTitleIndex);
      expect(firstWaitAfterCoverIndex).toBeGreaterThan(uploadVideoCoverIndex);
    } else {
      expect(
        actions.some((action) => action.includes("video-covers/parallel.png"))
      ).toBe(false);
      expect(firstWaitAfterTitleIndex).toBeGreaterThan(fillVideoTitleIndex);
    }
  });

  it("reports a 30-second heartbeat with dialog progress while the upload dialog is still pending", async () => {
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
        '.omui-dialog-wrapper.open': {
          count: 1,
          countSequence: [...Array(70).fill(1), 0],
          textContentSequence: [...Array(61).fill("上传中"), "上传成功"]
        },
        '.omui-dialog-wrapper.open .omui-dialog-body': {
          count: 1,
          textContentSequence: [...Array(60).fill("上传中"), "上传中 59.38%", "上传成功"]
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

    expect(summary).toEqual(["18窗口：heartbeat 已存草稿"]);
    expect(reportProgress).toHaveBeenCalledWith({
      profileId: 18,
      title: "heartbeat",
      message: "视频上传进度 59.38%，继续等待，不要结束任务"
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

    expect(summary).toEqual(["11窗口：caret 已存草稿"]);
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
        '#articlePublish-coverinfo span:has-text("更换")': { count: 1 },
        '.omui-dialog-wrapper.open li.omui-tab__label': { count: 2 },
        '.omui-dialog-wrapper.open input[type="file"][accept*="image"]': { count: 1 },
        '[data-article-cover-applied="true"]': { count: 1 },
        '#articlePublish-selfDeclaration button.omui-button--dashed': { count: 1 },
        'label:has-text("剧情演绎，仅供娱乐")': { count: 1 },
        '.omui-dialog-wrapper.open button:has-text("确认")': { count: 1 },
        'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]': { count: 1 },
        '.omui-dialog-wrapper.open input[type="file"][multiple]': { count: 1 },
        '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary': { count: 1 },
        '[data-inline-image="true"]': { count: 2 },
        'text=剧情演绎，仅供娱乐': { count: 1, countSequence: [...Array(20).fill(0), 1] }
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

  it("reanchors the editor caret when a lingering selected image leaves the cursor out of text mode", async () => {
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
        caretReadySequence: Array(20).fill(false),
        startReadySequence: Array(20).fill(false),
        caretBoundaryRecovery: {
          end: true,
          start: true
        }
      }
    );

    const summary = await runCommand("发视频 20", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        {
          profileId: 20,
          videoPath: "C:/企鹅号发布/videos/reanchor.mp4",
          title: "reanchor"
        }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/reanchor.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-20"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["20窗口：reanchor 已存草稿"]);
    expect(actions).toContain("forceEditorCaretBoundary:end");
    expect(actions).toContain("forceEditorCaretBoundary:start");
    expect(actions).toContain("click:button.exeditor-menu-basic-video:0");
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

    expect(summary[0]).toContain("当前窗口未登录，发布状态未确认");
    expect(summary[0]).toContain("先检查企鹅号后台是否已发出");
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

    expect(summary).toEqual(["11窗口：delay 已存草稿"]);
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

    expect(summary).toEqual(["14窗口：fresh 已存草稿"]);
    const restoreWaitIndex = actions.indexOf("waitForTimeout:10000");
    const forceClearTitleIndex = actions.indexOf("forceClearTitle");
    const forceClearEditorIndex = actions.indexOf("forceClearEditorDraftViaView");
    expect(restoreWaitIndex).toBeGreaterThan(actions.indexOf("goto:https://om.qq.com/article/publish:domcontentloaded"));
    expect(restoreWaitIndex).toBeLessThan(forceClearTitleIndex);
    expect(restoreWaitIndex).toBeLessThan(forceClearEditorIndex);
    expect(actions).toContain("forceClearTitle");
    expect(actions).toContain("forceClearEditorDraftViaView");
    expect(actions).not.toContain("forceClearEditorDraft");
  });

  it("uses the editor view transaction when the DOM fallback does not clear residual draft content", async () => {
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
        forceClearEditorResetsDraft: false,
        forceClearEditorDispatchResetsDraft: true,
        titleInputValue: "fresh"
      }
    );

    const summary = await runCommand("/发企鹅号 14窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
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

    expect(summary).toEqual(["14窗口：fresh 已存草稿"]);
    expect(actions).toContain("forceClearEditorDraftViaView");
    expect(actions).not.toContain("forceClearEditorDraft");
  });

  it("keeps clearing when an old draft reappears after the first empty check", async () => {
    const actions: string[] = [];
    const fakePage = createPlaywrightLikePage(
      {
        'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]': { count: 1 },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"]': {
          count: 1,
          textContent: ""
        },
        'div.ProseMirror.ExEditor-basic[contenteditable="true"] p': { count: 1 },
        '.ProseMirror div.video[data-widget="video"]': { count: 1, countSequence: [0, 0, 0, 1, 0, 0, 0, 1] },
        '.ProseMirror div.video[data-widget="video"] video[poster]': {
          count: 1,
          countSequence: [0, 0, 0, 1, 0, 0, 0, 1]
        },
        '.ProseMirror .index_module_content__cffb2914': {
          count: 1,
          countSequence: [0, 0, 1, 0, 0, 0]
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
        '[data-inline-image="true"]': { count: 2 },
        '[data-article-cover-applied="true"]': { count: 1 }
      },
      actions,
      {
        forceClearEditorResetsDraft: false,
        titleInputValue: "fresh"
      }
    );

    const summary = await runCommand("/发企鹅号 19窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 19, videoPath: "C:/企鹅号发布/videos/fresh.mp4", title: "fresh" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/fresh.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-19"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary).toEqual(["19窗口：fresh 已存草稿"]);
    expect(
      actions.filter((action) => action === "forceClearEditorDraftViaView").length
    ).toBeGreaterThan(1);
  });

  it("fails when the article cover preview does not change after uploading", async () => {
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
        '[data-inline-image="true"]': { count: 2 }
      },
      actions,
      {
        forceClearEditorResetsDraft: true,
        titleInputValue: "cover-stuck",
        articleCoverSignatureSequence: [
          "old-cover",
          "old-cover",
          "old-cover",
          "old-cover",
          "old-cover"
        ]
      }
    );

    const summary = await runCommand("/发企鹅号 20窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 20, videoPath: "C:/企鹅号发布/videos/cover-stuck.mp4", title: "cover-stuck" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover-stuck.png",
      pickArticleAssetSet: async () => createArticleAssets(),
      openProfile: async () => ({
        ws: "ws://profile-20"
      }),
      connectBrowser: vi.fn().mockResolvedValue(createBrowser(fakePage.page)),
      writeRunEvent: createWriteRunEventMock()
    });

    expect(summary[0]).toContain("文章封面上传后预览未变化");
    expect(actions).toContain(
      "setInputFiles:.omui-dialog-wrapper.open input[type=\"file\"][accept*=\"image\"]:0:C:/企鹅号发布/covers/封面-A版.jpg"
    );
    expect(actions).not.toContain("click:role:button:发布:0");
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

    expect(summary).toEqual(["15窗口：正确标题 已存草稿"]);
    expect(fakePage.actions).toContain(
      'fill:input[placeholder*="标题"]:0:正确标题'
    );
    expect(fakePage.actions).not.toContain("click:role:button:发布:0");
  });
});

describe("runCli", () => {
  it("returns a clear error instead of starting a second publish run when another run is active", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      })
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runCli } = await import("../../src/cli.js");

    const exitCode = await runCli(["发视频", "4-5"], {
      acquirePublishRunLock: async () => {
        throw new Error("已有发布任务在运行（命令=发视频 4-5），请等待当前任务结束，不要重试");
      }
    });

    expect(exitCode).toBe(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "已有发布任务在运行（命令=发视频 4-5），请等待当前任务结束，不要重试"
    );
  });

  it("prints the saved-draft summary after running a publish command", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
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
      buildProgressLogFilePath: () => "C:/企鹅号发布/logs/run.progress.log",
      appendRunLogLine: async () => undefined,
      writeRunEvent: async () => undefined
    }));
    vi.doMock("../../src/penguin/publish-article.js", () => ({
      publishArticle: async () => ({
        status: "draft-saved" as const,
        message: "已存草稿"
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
    expect(logSpy).toHaveBeenNthCalledWith(1, "1窗口：a 已存草稿");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("prints live progress before the final summary so long uploads do not look stalled", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
      })
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
      buildProgressLogFilePath: () => "C:/企鹅号发布/logs/run.progress.log",
      appendRunLogLine: async () => undefined,
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
          status: "draft-saved" as const,
          message: "已存草稿"
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
      "3窗口：a 视频上传已开始，通常需要1-30分钟；继续设置视频标题和封面，等待期间不要结束任务"
    );
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      "3窗口：a 视频标题和封面已设置，正在等待上传完成；等待期间不要结束任务"
    );
    expect(logSpy).toHaveBeenNthCalledWith(3, "3窗口：a 已存草稿");
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
      buildProgressLogFilePath: () => "C:/企鹅号发布/logs/run.progress.log",
      appendRunLogLine: async () => undefined,
      writeRunEvent: async () => undefined
    }));
    vi.doMock("../../src/penguin/publish-article.js", () => ({
      publishArticle: async () => ({
        status: "draft-saved" as const,
        message: "已存草稿"
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
    expect(logSpy).toHaveBeenCalledWith("1窗口：a 已存草稿");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("accepts a slashless range without the window suffix in the CLI", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
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
      buildProgressLogFilePath: () => "C:/企鹅号发布/logs/run.progress.log",
      appendRunLogLine: async () => undefined,
      writeRunEvent: async () => undefined
    }));
    vi.doMock("../../src/penguin/publish-article.js", () => ({
      publishArticle: async () => ({
        status: "draft-saved" as const,
        message: "已存草稿"
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
    expect(logSpy).toHaveBeenCalledWith("1窗口：a 已存草稿");
    expect(logSpy).toHaveBeenCalledWith("2窗口：b 已存草稿");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns non-zero when a window failed even if the summary text does not contain 失败", async () => {
    vi.doMock("../../src/config/load-config.js", () => ({
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/article/publish",
        assetsRoot: "C:/企鹅号发布",
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
      buildProgressLogFilePath: () => "C:/企鹅号发布/logs/run.progress.log",
      appendRunLogLine: async () => undefined,
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
