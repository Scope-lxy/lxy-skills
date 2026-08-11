import type { PublishMode } from "../config/types.js";
import {
  validatePrePublishReviewState,
  type PenguinPrePublishStateInput
} from "./pre-publish-check.js";

export interface PenguinPublishPageLike {
  goto(
    url: string,
    options?: {
      waitUntil?: "domcontentloaded";
    }
  ): Promise<void>;
  ensureLoggedIn?(): Promise<void>;
  resetDraft(): Promise<void>;
  fillTitle(title: string): Promise<void>;
  focusEditorBody(): Promise<void>;
  moveEditorCursorToStart(): Promise<void>;
  uploadVideo(videoPath: string): Promise<void>;
  fillVideoTitle(title: string): Promise<void>;
  setVideoCover(videoCoverPath: string): Promise<void>;
  ensureVideoReady(
    expectedVideoTitle: string,
    videoCoverPath: string
  ): Promise<void>;
  insertArticleImages(articleImagePaths: readonly [string, string]): Promise<void>;
  removeEmptyContentBlocks?(): Promise<void>;
  setArticleCover(articleCoverPath: string): Promise<void>;
  applyDeclaration(): Promise<void>;
  applyAiDeclaration(): Promise<void>;
  readPrePublishState(): Promise<PenguinPrePublishStateInput>;
  capturePrePublishEvidence?(
    label: string,
    evidenceDir: string
  ): Promise<string | null>;
  saveDraft(): Promise<void>;
  confirmSavedDraft(title: string): Promise<void>;
  clickPublish(): Promise<void>;
}

export interface PublishArticleInput {
  page: PenguinPublishPageLike;
  publishUrl: string;
  title: string;
  videoPath: string;
  videoCoverPath: string;
  articleImagePaths: readonly [string, string];
  articleCoverPath: string;
  mode: PublishMode;
  evidenceDir?: string;
  reportProgress?: (message: string) => Promise<void> | void;
}

export interface PublishArticleResult {
  status: "draft-saved" | "published";
  message: string;
}

const MAX_VIDEO_TITLE_LENGTH = 32;
const MAX_REBUILD_ATTEMPTS = 2;
const TITLE_MISMATCH_ISSUE = "标题与目标不一致";

function assertNever(value: never): never {
  throw new Error(`不支持的发布模式: "${String(value)}"`);
}

export function toVideoPublishTitle(
  articleTitle: string,
  maxLength = MAX_VIDEO_TITLE_LENGTH
): string {
  return Array.from(articleTitle).slice(0, maxLength).join("");
}

async function buildDraft(
  page: PenguinPublishPageLike,
  input: {
    publishUrl: string;
    title: string;
    videoPath: string;
    videoCoverPath: string;
    articleImagePaths: readonly [string, string];
    articleCoverPath: string;
    reportProgress?: (message: string) => Promise<void> | void;
  }
): Promise<void> {
  const {
    publishUrl,
    title,
    videoPath,
    videoCoverPath,
    articleImagePaths,
    articleCoverPath,
    reportProgress
  } = input;
  const videoTitle = toVideoPublishTitle(title);

  await page.goto(publishUrl, { waitUntil: "domcontentloaded" });
  await page.ensureLoggedIn?.();
  await page.resetDraft();
  await page.fillTitle(title);
  await page.setArticleCover(articleCoverPath);
  await page.applyDeclaration();
  await page.focusEditorBody();
  await page.insertArticleImages(articleImagePaths);
  await page.moveEditorCursorToStart();
  await page.uploadVideo(videoPath);
  await reportProgress?.(
    "视频上传已开始，通常需要1-30分钟；继续设置视频标题和封面，等待期间不要结束任务"
  );
  await page.fillVideoTitle(videoTitle);
  await page.setVideoCover(videoCoverPath);
  await reportProgress?.(
    "视频标题和封面已设置，正在等待上传完成；等待期间不要结束任务"
  );
  await page.ensureVideoReady(videoTitle, videoCoverPath);
  await reportProgress?.("视频已插入正文，继续处理AI声明");
  await page.removeEmptyContentBlocks?.();
  await page.applyAiDeclaration();
}

async function finishPublish(
  page: PenguinPublishPageLike,
  title: string,
  mode: PublishMode
): Promise<PublishArticleResult> {
  switch (mode) {
    case "pause-before-publish":
      await page.saveDraft();
      await page.confirmSavedDraft(title);

      return {
        status: "draft-saved",
        message: "已存草稿"
      };
    case "auto-publish":
      await page.clickPublish();

      return {
        status: "published",
        message: "已自动发布"
      };
    default:
      return assertNever(mode);
  }
}

async function correctTitleAndRecheck(
  page: PenguinPublishPageLike,
  expectedTitle: string
): Promise<string[]> {
  await page.fillTitle(expectedTitle);
  const correctedState = await page.readPrePublishState();
  return validatePrePublishReviewState(correctedState, {
    expectedTitle
  });
}

export async function publishArticle(
  input: PublishArticleInput
): Promise<PublishArticleResult> {
  const {
    page,
    publishUrl,
    title,
    videoPath,
    videoCoverPath,
    articleImagePaths,
    articleCoverPath,
    mode,
    evidenceDir,
    reportProgress
  } = input;

  let lastIssues: string[] = [];
  let lastEvidencePath: string | null = null;
  let stoppedAfterTitleCorrection = false;

  for (let attempt = 0; attempt < MAX_REBUILD_ATTEMPTS; attempt += 1) {
    await buildDraft(page, {
      publishUrl,
      title,
      videoPath,
      videoCoverPath,
      articleImagePaths,
      articleCoverPath,
      reportProgress
    });

    const state = await page.readPrePublishState();
    const issues = validatePrePublishReviewState(state, {
      expectedTitle: title
    });

    if (issues.length === 0) {
      return finishPublish(page, title, mode);
    }

    if (issues.includes(TITLE_MISMATCH_ISSUE)) {
      const correctedIssues = await correctTitleAndRecheck(page, title);

      if (!correctedIssues.includes(TITLE_MISMATCH_ISSUE)) {
        if (correctedIssues.length === 0) {
          return finishPublish(page, title, mode);
        }

        lastIssues = correctedIssues;
      } else {
        lastIssues = correctedIssues;
        stoppedAfterTitleCorrection = true;
        break;
      }
    } else {
      lastIssues = issues;
    }

    if (
      typeof evidenceDir === "string" &&
      evidenceDir.trim().length > 0 &&
      typeof page.capturePrePublishEvidence === "function"
    ) {
      lastEvidencePath =
        (await page.capturePrePublishEvidence(
          `pre-publish-review-failed-attempt-${attempt + 1}`,
          evidenceDir
        )) ?? null;
    }
  }

  const detailMessage = stoppedAfterTitleCorrection
    ? lastIssues.join("；")
    : [...lastIssues, "已自动重试1次"].join("；");

  throw new Error(
    lastEvidencePath === null
      ? detailMessage
      : `${detailMessage}；现场截图=${lastEvidencePath}`
  );
}
