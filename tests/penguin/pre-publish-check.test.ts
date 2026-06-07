import { describe, expect, it } from "vitest";
import {
  publishArticle,
  toVideoPublishTitle,
  type PenguinPublishPageLike
} from "../../src/penguin/publish-article.js";
import {
  type PenguinPrePublishStateInput,
  validatePrePublishReviewState,
  validatePrePublishState
} from "../../src/penguin/pre-publish-check.js";

function createReadyState() {
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
}

function createFakePage(
  actions: string[],
  stateInput:
    | PenguinPrePublishStateInput
    | PenguinPrePublishStateInput[] = createReadyState()
): PenguinPublishPageLike {
  const states = Array.isArray(stateInput) ? [...stateInput] : [stateInput];

  return {
    async goto(url, options) {
      actions.push(`goto:${url}:${options?.waitUntil ?? "none"}`);
    },
    async ensureLoggedIn() {
      actions.push("ensureLoggedIn");
    },
    async resetDraft() {
      actions.push("resetDraft");
    },
    async fillTitle(title) {
      actions.push(`fillTitle:${title}`);
    },
    async focusEditorBody() {
      actions.push("focusEditorBody");
    },
    async moveEditorCursorToStart() {
      actions.push("moveEditorCursorToStart");
    },
    async uploadVideo(videoPath) {
      actions.push(`uploadVideo:${videoPath}`);
    },
    async fillVideoTitle(title) {
      actions.push(`fillVideoTitle:${title}`);
    },
    async setVideoCover(videoCoverPath) {
      actions.push(`setVideoCover:${videoCoverPath}`);
    },
    async ensureVideoReady() {
      actions.push("ensureVideoReady");
    },
    async insertArticleImages(articleImagePaths) {
      actions.push(`insertArticleImages:${articleImagePaths.join(",")}`);
    },
    async removeEmptyContentBlocks() {
      actions.push("removeEmptyContentBlocks");
    },
    async setArticleCover(articleCoverPath) {
      actions.push(`setArticleCover:${articleCoverPath}`);
    },
    async applyDeclaration() {
      actions.push("applyDeclaration:剧情演绎，仅供娱乐");
    },
    async applyAiDeclaration() {
      actions.push("applyAiDeclaration:提交");
    },
    async readPrePublishState() {
      actions.push("readPrePublishState");
      if (states.length > 1) {
        return states.shift();
      }

      return states[0];
    },
    async capturePrePublishEvidence(label, evidenceDir) {
      actions.push(`capturePrePublishEvidence:${label}:${evidenceDir}`);
      return `${evidenceDir}/${label}.png`;
    },
    async clickPublish() {
      actions.push("clickPublish");
    }
  };
}

describe("validatePrePublishState", () => {
  it("accepts a fully populated article state", () => {
    expect(validatePrePublishState(createReadyState())).toEqual([]);
  });

  it("reports readable issues when articleCover is missing instead of throwing TypeError", () => {
    expect(() =>
      validatePrePublishState({
        hasTitle: true,
        hasVideo: true,
        hasVideoCover: true,
        insertedImageCount: 2
      })
    ).not.toThrow(TypeError);

    expect(
      validatePrePublishState({
        hasTitle: true,
        hasVideo: true,
        hasVideoCover: true,
        insertedImageCount: 2
      })
    ).toEqual([
      "自主声明未设置为剧情演绎，仅供娱乐",
      "AI生成声明未提交",
      "文章封面状态缺失",
      "文章封面未设置完成"
    ]);
  });

  it("accepts a partially missing articleCover object in the type contract", () => {
    expect(
      validatePrePublishState({
        hasTitle: true,
        hasVideo: true,
        hasVideoCover: true,
        insertedImageCount: 2,
        declarationConfirmed: true,
        aiDeclarationConfirmed: true,
        articleCover: {
        }
      })
    ).toEqual(["文章封面未设置完成"]);
  });

  it("reports every missing publish prerequisite", () => {
    expect(
      validatePrePublishState({
        hasTitle: false,
        hasVideo: false,
        hasVideoCover: false,
        insertedImageCount: 1,
        declarationConfirmed: false,
        aiDeclarationConfirmed: false,
        articleCover: {
          coverApplied: false
        }
      })
    ).toEqual([
      "标题未填入",
      "视频未上传完成",
      "视频封面未设置完成",
      "文章配图数量必须为 2 张",
      "自主声明未设置为剧情演绎，仅供娱乐",
      "AI生成声明未提交",
      "文章封面未设置完成"
    ]);
  });

  it("reports review-only issues for title mismatch and incorrect block order", () => {
    expect(
      validatePrePublishReviewState(
        {
          ...createReadyState(),
          titleText: "错误标题",
          contentBlockOrder: ["image", "video", "image"]
        },
        {
          expectedTitle: "测试标题"
        }
      )
    ).toEqual([
      "标题与目标不一致",
      "正文最前面不是视频",
      "正文内容顺序不正确"
    ]);
  });

  it("reports a blank editor block between the video and the first image", () => {
    expect(
      validatePrePublishReviewState(
        {
          ...createReadyState(),
          contentBlockOrder: ["video", "empty", "image", "image"]
        },
        {
          expectedTitle: "测试标题"
        }
      )
    ).toEqual(["正文视频和第一张配图之间有空行", "正文内容顺序不正确"]);
  });

  it("reports every blank editor block in the final content order", () => {
    expect(
      validatePrePublishReviewState(
        {
          ...createReadyState(),
          contentBlockOrder: ["video", "empty", "image", "empty", "image", "empty"]
        },
        {
          expectedTitle: "测试标题"
        }
      )
    ).toEqual(["正文存在多余空行", "正文内容顺序不正确"]);
  });
});

describe("publishArticle", () => {
  it("stops before publish in pause mode after the skeleton steps", async () => {
    const actions: string[] = [];
    const page = createFakePage(actions);

    await expect(
      publishArticle({
        page,
        publishUrl: "https://om.qq.com/article/publish",
        title: "测试标题",
        videoPath: "C:/企鹅号发布/videos/demo.mp4",
        videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
        articleImagePaths: [
          "C:/企鹅号发布/pictures/配图1-A版本.jpg",
          "C:/企鹅号发布/pictures/配图2-A版本.jpg"
        ],
      articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
      mode: "pause-before-publish",
      evidenceDir: "C:/企鹅号发布/logs"
    })
    ).resolves.toEqual({
      status: "ready-to-publish",
      message: "已完成，停在发布前"
    });

    expect(actions).toEqual([
      "goto:https://om.qq.com/article/publish:domcontentloaded",
      "ensureLoggedIn",
      "resetDraft",
      "fillTitle:测试标题",
      "focusEditorBody",
      "uploadVideo:C:/企鹅号发布/videos/demo.mp4",
      "fillVideoTitle:测试标题",
      "setVideoCover:C:/企鹅号发布/video-covers/demo.jpg",
      "ensureVideoReady",
      "focusEditorBody",
      "insertArticleImages:C:/企鹅号发布/pictures/配图1-A版本.jpg,C:/企鹅号发布/pictures/配图2-A版本.jpg",
      "removeEmptyContentBlocks",
      "setArticleCover:C:/企鹅号发布/covers/封面-A版.jpg",
      "applyDeclaration:剧情演绎，仅供娱乐",
      "applyAiDeclaration:提交",
      "readPrePublishState"
    ]);
  });

  it("uploads the video before inserting images so the first image occupies the post-video paragraph", async () => {
    const actions: string[] = [];
    const page = createFakePage(actions);

    await publishArticle({
      page,
      publishUrl: "https://om.qq.com/article/publish",
      title: "测试标题",
      videoPath: "C:/企鹅号发布/videos/demo.mp4",
      videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
      articleImagePaths: [
        "C:/企鹅号发布/pictures/配图1-A版本.jpg",
        "C:/企鹅号发布/pictures/配图2-A版本.jpg"
      ],
      articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
      mode: "pause-before-publish",
      evidenceDir: "C:/企鹅号发布/logs"
    });

    expect(actions.indexOf("uploadVideo:C:/企鹅号发布/videos/demo.mp4")).toBeLessThan(
      actions.indexOf(
        "insertArticleImages:C:/企鹅号发布/pictures/配图1-A版本.jpg,C:/企鹅号发布/pictures/配图2-A版本.jpg"
      )
    );
    expect(actions.indexOf("ensureVideoReady")).toBeLessThan(
      actions.indexOf(
        "insertArticleImages:C:/企鹅号发布/pictures/配图1-A版本.jpg,C:/企鹅号发布/pictures/配图2-A版本.jpg"
      )
    );
    expect(actions.indexOf("removeEmptyContentBlocks")).toBeGreaterThan(
      actions.indexOf(
        "insertArticleImages:C:/企鹅号发布/pictures/配图1-A版本.jpg,C:/企鹅号发布/pictures/配图2-A版本.jpg"
      )
    );
  });

  it("clicks publish in auto mode after the skeleton steps", async () => {
    const actions: string[] = [];
    const page = createFakePage(actions);

    await expect(
      publishArticle({
        page,
        publishUrl: "https://om.qq.com/article/publish",
        title: "测试标题",
        videoPath: "C:/企鹅号发布/videos/demo.mp4",
        videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
        articleImagePaths: [
          "C:/企鹅号发布/pictures/配图1-A版本.jpg",
          "C:/企鹅号发布/pictures/配图2-A版本.jpg"
        ],
      articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
      mode: "auto-publish",
      evidenceDir: "C:/企鹅号发布/logs"
    })
    ).resolves.toEqual({
      status: "published",
      message: "已自动发布"
    });

    expect(actions).toEqual([
      "goto:https://om.qq.com/article/publish:domcontentloaded",
      "ensureLoggedIn",
      "resetDraft",
      "fillTitle:测试标题",
      "focusEditorBody",
      "uploadVideo:C:/企鹅号发布/videos/demo.mp4",
      "fillVideoTitle:测试标题",
      "setVideoCover:C:/企鹅号发布/video-covers/demo.jpg",
      "ensureVideoReady",
      "focusEditorBody",
      "insertArticleImages:C:/企鹅号发布/pictures/配图1-A版本.jpg,C:/企鹅号发布/pictures/配图2-A版本.jpg",
      "removeEmptyContentBlocks",
      "setArticleCover:C:/企鹅号发布/covers/封面-A版.jpg",
      "applyDeclaration:剧情演绎，仅供娱乐",
      "applyAiDeclaration:提交",
      "readPrePublishState",
      "clickPublish"
    ]);
  });

  it("truncates the video title to 32 characters while keeping the article title intact", async () => {
    const actions: string[] = [];
    const page = createFakePage(actions);

    await publishArticle({
      page,
      publishUrl: "https://om.qq.com/article/publish",
      title: "亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的💗还在想你",
      videoPath: "C:/企鹅号发布/videos/demo.mp4",
      videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
      articleImagePaths: [
        "C:/企鹅号发布/pictures/配图1-A版本.jpg",
        "C:/企鹅号发布/pictures/配图2-A版本.jpg"
      ],
      articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
      mode: "pause-before-publish",
      evidenceDir: "C:/企鹅号发布/logs"
    });

    expect(actions).toContain(
      `fillVideoTitle:${toVideoPublishTitle(
        "亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的💗还在想你"
      )}`
    );
    expect(actions).toContain(
      "fillTitle:亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的亲爱的💗还在想你"
    );
  });

  it("stops early and asks the user to log in when the target window is not logged in", async () => {
    const actions: string[] = [];
    const page = createFakePage(actions);
    page.ensureLoggedIn = async () => {
      actions.push("ensureLoggedIn");
      throw new Error("当前窗口未登录，请先在 ixBrowser 对应窗口完成扫码登录后重试");
    };

    await expect(
      publishArticle({
        page,
        publishUrl: "https://om.qq.com/article/publish",
        title: "测试标题",
        videoPath: "C:/企鹅号发布/videos/demo.mp4",
        videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
        articleImagePaths: [
          "C:/企鹅号发布/pictures/配图1-A版本.jpg",
          "C:/企鹅号发布/pictures/配图2-A版本.jpg"
        ],
        articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
        mode: "pause-before-publish",
        evidenceDir: "C:/企鹅号发布/logs"
      })
    ).rejects.toThrow("当前窗口未登录，请先在 ixBrowser 对应窗口完成扫码登录后重试");

    expect(actions).toEqual([
      "goto:https://om.qq.com/article/publish:domcontentloaded",
      "ensureLoggedIn"
    ]);
  });

  it("rebuilds the draft once when the final node review fails and then succeeds", async () => {
    const actions: string[] = [];
    const page = createFakePage(actions, [
      {
        ...createReadyState(),
        insertedImageCount: 1,
        contentBlockOrder: ["image", "video", "image"]
      },
      createReadyState()
    ]);

    await expect(
      publishArticle({
        page,
        publishUrl: "https://om.qq.com/article/publish",
        title: "测试标题",
        videoPath: "C:/企鹅号发布/videos/demo.mp4",
        videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
        articleImagePaths: [
          "C:/企鹅号发布/pictures/配图1-A版本.jpg",
          "C:/企鹅号发布/pictures/配图2-A版本.jpg"
        ],
        articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
        mode: "auto-publish",
        evidenceDir: "C:/企鹅号发布/logs"
      })
    ).resolves.toEqual({
      status: "published",
      message: "已自动发布"
    });

    expect(actions).toEqual([
      "goto:https://om.qq.com/article/publish:domcontentloaded",
      "ensureLoggedIn",
      "resetDraft",
      "fillTitle:测试标题",
      "focusEditorBody",
      "uploadVideo:C:/企鹅号发布/videos/demo.mp4",
      "fillVideoTitle:测试标题",
      "setVideoCover:C:/企鹅号发布/video-covers/demo.jpg",
      "ensureVideoReady",
      "focusEditorBody",
      "insertArticleImages:C:/企鹅号发布/pictures/配图1-A版本.jpg,C:/企鹅号发布/pictures/配图2-A版本.jpg",
      "removeEmptyContentBlocks",
      "setArticleCover:C:/企鹅号发布/covers/封面-A版.jpg",
      "applyDeclaration:剧情演绎，仅供娱乐",
      "applyAiDeclaration:提交",
      "readPrePublishState",
      "capturePrePublishEvidence:pre-publish-review-failed-attempt-1:C:/企鹅号发布/logs",
      "goto:https://om.qq.com/article/publish:domcontentloaded",
      "ensureLoggedIn",
      "resetDraft",
      "fillTitle:测试标题",
      "focusEditorBody",
      "uploadVideo:C:/企鹅号发布/videos/demo.mp4",
      "fillVideoTitle:测试标题",
      "setVideoCover:C:/企鹅号发布/video-covers/demo.jpg",
      "ensureVideoReady",
      "focusEditorBody",
      "insertArticleImages:C:/企鹅号发布/pictures/配图1-A版本.jpg,C:/企鹅号发布/pictures/配图2-A版本.jpg",
      "removeEmptyContentBlocks",
      "setArticleCover:C:/企鹅号发布/covers/封面-A版.jpg",
      "applyDeclaration:剧情演绎，仅供娱乐",
      "applyAiDeclaration:提交",
      "readPrePublishState",
      "clickPublish"
    ]);
  });

  it("rejects an unsupported mode instead of falling through to auto publish", async () => {
    const actions: string[] = [];
    const page = createFakePage(actions);

    await expect(
      publishArticle({
        page,
        publishUrl: "https://om.qq.com/article/publish",
        title: "测试标题",
        videoPath: "C:/企鹅号发布/videos/demo.mp4",
        videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
        articleImagePaths: [
          "C:/企鹅号发布/pictures/配图1-A版本.jpg",
          "C:/企鹅号发布/pictures/配图2-A版本.jpg"
        ],
        articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
        mode: "unexpected-mode" as unknown as "pause-before-publish",
        evidenceDir: "C:/企鹅号发布/logs"
      })
    ).rejects.toThrow('不支持的发布模式: "unexpected-mode"');

    expect(actions).toEqual([
      "goto:https://om.qq.com/article/publish:domcontentloaded",
      "ensureLoggedIn",
      "resetDraft",
      "fillTitle:测试标题",
      "focusEditorBody",
      "uploadVideo:C:/企鹅号发布/videos/demo.mp4",
      "fillVideoTitle:测试标题",
      "setVideoCover:C:/企鹅号发布/video-covers/demo.jpg",
      "ensureVideoReady",
      "focusEditorBody",
      "insertArticleImages:C:/企鹅号发布/pictures/配图1-A版本.jpg,C:/企鹅号发布/pictures/配图2-A版本.jpg",
      "removeEmptyContentBlocks",
      "setArticleCover:C:/企鹅号发布/covers/封面-A版.jpg",
      "applyDeclaration:剧情演绎，仅供娱乐",
      "applyAiDeclaration:提交",
      "readPrePublishState"
    ]);
  });

  it("stops immediately when the video was not inserted into the editor", async () => {
    const actions: string[] = [];
    const page = {
      ...createFakePage(actions),
      async ensureVideoReady() {
        actions.push("ensureVideoReady");
        throw new Error("视频未插入正文");
      }
    };

    await expect(
      publishArticle({
        page,
        publishUrl: "https://om.qq.com/article/publish",
        title: "测试标题",
        videoPath: "C:/企鹅号发布/videos/demo.mp4",
        videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
        articleImagePaths: [
          "C:/企鹅号发布/pictures/配图1-A版本.jpg",
          "C:/企鹅号发布/pictures/配图2-A版本.jpg"
        ],
        articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
        mode: "pause-before-publish",
        evidenceDir: "C:/企鹅号发布/logs"
      })
    ).rejects.toThrow("视频未插入正文");

    expect(actions).toEqual([
      "goto:https://om.qq.com/article/publish:domcontentloaded",
      "ensureLoggedIn",
      "resetDraft",
      "fillTitle:测试标题",
      "focusEditorBody",
      "uploadVideo:C:/企鹅号发布/videos/demo.mp4",
      "fillVideoTitle:测试标题",
      "setVideoCover:C:/企鹅号发布/video-covers/demo.jpg",
      "ensureVideoReady"
    ]);
  });

  it("stops after one automatic rebuild when the final node review still fails", async () => {
    const actions: string[] = [];
    const page = createFakePage(actions, [
      {
        ...createReadyState(),
        insertedImageCount: 1,
        contentBlockOrder: ["image", "video", "image"]
      },
      {
        ...createReadyState(),
        insertedImageCount: 1,
        contentBlockOrder: ["image", "video", "image"]
      }
    ]);

    await expect(
      publishArticle({
        page,
        publishUrl: "https://om.qq.com/article/publish",
        title: "测试标题",
        videoPath: "C:/企鹅号发布/videos/demo.mp4",
        videoCoverPath: "C:/企鹅号发布/video-covers/demo.jpg",
        articleImagePaths: [
          "C:/企鹅号发布/pictures/配图1-A版本.jpg",
          "C:/企鹅号发布/pictures/配图2-A版本.jpg"
        ],
        articleCoverPath: "C:/企鹅号发布/covers/封面-A版.jpg",
        mode: "pause-before-publish",
        evidenceDir: "C:/企鹅号发布/logs"
      })
    ).rejects.toThrow(
      "文章配图数量必须为 2 张；正文最前面不是视频；正文内容顺序不正确；已自动重试1次"
    );

    expect(actions).toContain(
      "capturePrePublishEvidence:pre-publish-review-failed-attempt-1:C:/企鹅号发布/logs"
    );
    expect(actions).toContain(
      "capturePrePublishEvidence:pre-publish-review-failed-attempt-2:C:/企鹅号发布/logs"
    );
  });
});
