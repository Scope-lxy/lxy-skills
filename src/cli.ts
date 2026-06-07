import { resolve } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import {
  allocateVideosForProfiles,
  movePublishedVideoToUsed
} from "./assets/video-pool.js";
import {
  pickArticleAssetSet,
  type PickedArticleAssetSet
} from "./assets/article-image-picker.js";
import { pickRandomCover } from "./assets/cover-picker.js";
import { parsePublishCommand } from "./command/parse-publish-command.js";
import { loadConfig } from "./config/load-config.js";
import { saveConfig } from "./config/save-config.js";
import { openProfile, type OpenProfileResult } from "./ixbrowser/open-profile.js";
import { buildLogFilePath, writeRunEvent } from "./logs/run-logger.js";
import {
  publishArticle,
  type PublishArticleInput,
  type PublishArticleResult,
  type PenguinPublishPageLike
} from "./penguin/publish-article.js";
import type { RuntimeConfig } from "./config/types.js";
import type { PenguinPrePublishStateInput } from "./penguin/pre-publish-check.js";
import type { WindowRunResult } from "./types/run-result.js";

const DEFAULT_CONFIG_PATH = "config/penguinhao.config.json";

interface BrowserContextLike {
  pages(): unknown[];
}

export interface BrowserLike {
  contexts(): BrowserContextLike[];
  newPage(): Promise<unknown>;
  close(): Promise<void>;
}

interface PlaywrightLocatorLike {
  click(): Promise<void>;
  count(): Promise<number>;
  fill(value: string): Promise<void>;
  inputValue?(): Promise<string>;
  isVisible(): Promise<boolean>;
  setInputFiles(files: string | string[]): Promise<void>;
  textContent?(): Promise<string | null>;
  nth(index: number): PlaywrightLocatorLike;
}

interface PlaywrightPageLike {
  goto(
    url: string,
    options?: {
      waitUntil?: "domcontentloaded";
    }
  ): Promise<void>;
  bringToFront?(): Promise<void>;
  evaluate?<TResult, TArg = unknown>(
    pageFunction: ((arg: TArg) => TResult) | string,
    arg?: TArg
  ): Promise<TResult>;
  keyboard?: {
    press(value: string): Promise<void>;
  };
  locator(selector: string): PlaywrightLocatorLike;
  screenshot?(options: {
    path: string;
    fullPage?: boolean;
  }): Promise<unknown>;
  waitForTimeout?(timeoutMs: number): Promise<void>;
  getByRole?(
    role: string,
    options?: {
      name?: string | RegExp;
    }
  ): PlaywrightLocatorLike;
}

const TITLE_INPUT_SELECTORS = [
  'span.omui-inputautogrowing__inner[contenteditable="true"][data-placeholder*="标题"]',
  'textarea[placeholder*="标题"]',
  'input[placeholder*="标题"]',
  '[contenteditable="true"][data-placeholder*="标题"]'
] as const;

const LOGIN_REQUIRED_SELECTORS = [
  'img[alt*="二维码"]',
  'img[alt*="扫码"]',
  'button:has-text("微信登录")',
  'button:has-text("扫码登录")',
  'text=扫码登录',
  'text=微信登录',
  'text=登录企鹅号'
] as const;

const EDITOR_BODY_SELECTORS = [
  'div.ProseMirror.ExEditor-basic[contenteditable="true"]',
  '[data-exeditor-root][contenteditable="true"]',
  'div.ProseMirror[contenteditable="true"]'
] as const;

const VIDEO_TRIGGER_SELECTORS = [
  'button.exeditor-menu-basic-video',
  'button:has-text("插入视频")',
  '[data-toolbar-item-of="video"] button'
] as const;

const VIDEO_UPLOAD_INPUT_SELECTORS = [
  'input[name="Filedata"][type="file"]',
  'input[type="file"][accept*="video"]',
  'input[name*="video"][type="file"]',
  '[data-testid="video-upload-input"]'
] as const;

const VIDEO_MODAL_TITLE_SELECTORS = [
  'input[placeholder="请输入标题名称"]',
  'input[placeholder*="标题名称"]',
  '.omui-dialog input[placeholder*="标题"]'
] as const;

const VIDEO_COVER_TRIGGER_SELECTORS = [
  'button:has-text("上传封面")',
  'button:has-text("自定义封面")',
  'text=上传封面'
] as const;

const VIDEO_COVER_UPLOAD_INPUT_SELECTORS = [
  '.omui-dialog-wrapper.open input[type="file"][accept*="image"]',
  'input[type="file"][accept*="image"]',
  'input[name*="cover"][type="file"]',
  '[data-testid="video-cover-upload-input"]'
] as const;

const VIDEO_COVER_CONFIRM_SELECTORS = [
  '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary',
  '.omui-dialog-wrapper.open button:has-text("确认")',
  '.omui-dialog-wrapper.open button:has-text("完成")'
] as const;

const VIDEO_UPLOAD_PENDING_TEXTS = ["上传中", "取消上传"] as const;
const VIDEO_CONFIRM_RETRY_DELAY_MS = 2000;

const OPEN_DIALOG_SELECTORS = ['.omui-dialog-wrapper.open'] as const;
const DIALOG_CLOSE_SELECTORS = [
  '.omui-dialog-wrapper.open .omui-dialog-close',
  '.omui-dialog-wrapper.open button:has-text("取消")',
  '.omui-dialog-wrapper.open button:has-text("关闭")'
] as const;
const OPEN_DIALOG_BODY_SELECTORS = [
  '.omui-dialog-wrapper.open .omui-dialog-body',
  '.omui-dialog-wrapper.open'
] as const;

const VIDEO_UPLOAD_WAIT_ATTEMPTS = 1800;
const DRAFT_CLEAR_MAX_BACKSPACES = 80;
const DRAFT_CLEAR_CHECK_INTERVAL = 5;

const INLINE_IMAGE_TRIGGER_SELECTORS = [
  'exeditor-toolbar-button[data-toolbar-item-of="imagePlugin"]',
  'button:has-text("插入图片")',
  '[data-toolbar-item-of="imagePlugin"] button'
] as const;

const VIDEO_READY_SELECTORS = [
  '.ProseMirror div.video[data-widget="video"]',
  '.ProseMirror .video-container video',
  '[data-video-ready="true"]',
  ".video-card.is-ready",
  ".video-preview.is-ready"
] as const;

const VIDEO_COVER_READY_SELECTORS = [
  '.ProseMirror div.video[data-widget="video"] video[poster]',
  '.ProseMirror .video-container video[poster]',
  '[data-video-cover-ready="true"]',
  ".video-cover-preview img",
  ".video-cover-preview.is-ready"
] as const;

const STRICT_EDITOR_VIDEO_READY_SELECTORS = [
  '.ProseMirror div.video[data-widget="video"]',
  '.ProseMirror .video-container video'
] as const;

const STRICT_EDITOR_VIDEO_COVER_READY_SELECTORS = [
  '.ProseMirror div.video[data-widget="video"] video[poster]',
  '.ProseMirror .video-container video[poster]'
] as const;

const INLINE_IMAGE_SELECTORS = [
  '.ProseMirror .index_module_content__cffb2914',
  '.ProseMirror .index_module_img__cffb2914',
  '[data-inline-image="true"]',
  ".article-body img"
] as const;

const INLINE_IMAGE_UPLOAD_TAB_SELECTORS = [
  '.omui-dialog-wrapper.open li.omui-tab__label:has-text("本地上传")',
  '.omui-dialog-wrapper.open .omui-tab__label:has-text("本地上传")'
] as const;

const INLINE_IMAGE_UPLOAD_INPUT_SELECTORS = [
  '.omui-dialog-wrapper.open input[type="file"][multiple]',
  '.omui-dialog-wrapper.open input[type="file"][accept*="image"][multiple]',
  '.omui-dialog-wrapper.open input[type="file"][accept*="image"]'
] as const;

const INLINE_IMAGE_CONFIRM_SELECTORS = [
  '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary',
  '.omui-dialog-wrapper.open button:has-text("确认")',
  '.omui-dialog-wrapper.open button:has-text("完成")'
] as const;

const DECLARATION_TRIGGER_SELECTORS = [
  '#articlePublish-selfDeclaration button:has-text("添加内容自主声明")',
  '#articlePublish-selfDeclaration button.omui-button--dashed',
  '#articlePublish-selfDeclaration .omui-form__content button'
] as const;

const DECLARATION_OPTION_SELECTORS = [
  'label:has-text("剧情演绎，仅供娱乐")',
  'text=剧情演绎，仅供娱乐'
] as const;

const DECLARATION_CONFIRM_SELECTORS = [
  '.omui-dialog-wrapper.open button:has-text("确认")',
  '.omui-dialog button:has-text("确认")',
  'button:has-text("确认")'
] as const;

const DECLARATION_CONFIRMED_SELECTORS = [
  'text=剧情演绎，仅供娱乐',
  '[data-declaration-value="剧情演绎，仅供娱乐"]'
] as const;

const AI_DECLARATION_PENDING_SELECTORS = [
  '#articlePublish-resourceAigcMarkInfo a',
  '#articlePublish-resourceAigcMarkInfo .ai__declaration-clseRe2- a',
  '#articlePublish-resourceAigcMarkInfo a:has-text("进行补充")'
] as const;

const AI_DECLARATION_SUBMIT_SELECTORS = [
  '.omui-dialog-wrapper.open button:has-text("提交")',
  '.omui-dialog button:has-text("提交")',
  'button:has-text("提交")'
] as const;

const AI_DECLARATION_CONFIRMED_SELECTORS = [
  'text=已完成AI生成素材声明',
  'text=已完成AI生成声明'
] as const;

const ARTICLE_COVER_TRIGGER_SELECTORS = [
  '#articlePublish-coverinfo span:has-text("更换")',
  '#articlePublish-coverinfo .omui-thumb__action span:has-text("更换")',
  '#articlePublish-coverinfo .cover-container',
  'button.addCoverBtn-cls3gyHX',
  '.articleCoverWrap-cls3i-ak button',
  'button:has-text("修改封面")',
  'button:has-text("添加封面")'
] as const;

const ARTICLE_COVER_LOCAL_TAB_SELECTORS = [
  '.omui-dialog-wrapper.open li.omui-tab__label:has-text("本地上传")',
  '.omui-dialog-wrapper.open .omui-tab__label:has-text("本地上传")'
] as const;

const ARTICLE_COVER_UPLOAD_INPUT_SELECTORS = [
  '.omui-dialog-wrapper.open input[type="file"][accept*="image"]',
  '.omui-dialog-wrapper.open input[type="file"]',
  '[data-testid="article-cover-upload-input"]'
] as const;

const ARTICLE_COVER_CONFIRM_SELECTORS = [
  '.omui-dialog-wrapper.open .omui-dialog-footer button.omui-button--primary',
  '.omui-dialog-wrapper.open button:has-text("确认")',
  '.omui-dialog-wrapper.open button:has-text("完成")'
] as const;

const ARTICLE_COVER_APPLIED_SELECTORS = [
  '[data-article-cover-applied="true"]',
  '.articleCoverWrap-cls3i-ak img',
  ".article-cover-preview img"
] as const;

type PublishArticleDependency = (
  input: Omit<PublishArticleInput, "page"> & { page: unknown }
) => Promise<PublishArticleResult>;

export interface RunCommandDependencies {
  loadConfig: (filePath: string) => Promise<RuntimeConfig>;
  saveConfig: (filePath: string, config: RuntimeConfig) => Promise<void>;
  allocateVideosForProfiles: typeof allocateVideosForProfiles;
  movePublishedVideoToUsed: typeof movePublishedVideoToUsed;
  pickRandomCover: typeof pickRandomCover;
  pickArticleAssetSet: typeof pickArticleAssetSet;
  openProfile: typeof openProfile;
  connectBrowser: (endpoint: string) => Promise<BrowserLike>;
  publishArticle: PublishArticleDependency;
  writeRunEvent: typeof writeRunEvent;
}

export interface RunCommandReport {
  summaries: string[];
  results: WindowRunResult[];
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function resolveBrowserEndpoint(result: OpenProfileResult): string {
  if (typeof result.ws === "string" && result.ws.length > 0) {
    return result.ws;
  }

  if (
    typeof result.debuggingAddress === "string" &&
    result.debuggingAddress.length > 0
  ) {
    if (/^[a-z]+:\/\//iu.test(result.debuggingAddress)) {
      return result.debuggingAddress;
    }

    return `http://${result.debuggingAddress}`;
  }

  throw new Error("ixBrowser 未返回可用连接地址");
}

async function defaultConnectBrowser(endpoint: string): Promise<BrowserLike> {
  const { chromium } = await import("playwright");
  return chromium.connectOverCDP(endpoint);
}

function isPenguinPublishPageLike(value: unknown): value is PenguinPublishPageLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.goto === "function" &&
    typeof candidate.resetDraft === "function" &&
    typeof candidate.fillTitle === "function" &&
    typeof candidate.focusEditorBody === "function" &&
    typeof candidate.moveEditorCursorToStart === "function" &&
    typeof candidate.uploadVideo === "function" &&
    typeof candidate.fillVideoTitle === "function" &&
    typeof candidate.setVideoCover === "function" &&
    typeof candidate.ensureVideoReady === "function" &&
    typeof candidate.insertArticleImages === "function" &&
    typeof candidate.setArticleCover === "function" &&
    typeof candidate.applyDeclaration === "function" &&
    typeof candidate.applyAiDeclaration === "function" &&
    typeof candidate.readPrePublishState === "function" &&
    typeof candidate.clickPublish === "function"
  );
}

function isPlaywrightPageLike(value: unknown): value is PlaywrightPageLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.goto === "function" && typeof candidate.locator === "function";
}

async function pickVisibleLocator(
  page: PlaywrightPageLike,
  selectors: readonly string[],
  description: string
): Promise<PlaywrightLocatorLike> {
  const match = await findVisibleLocatorGroup(page, selectors);

  if (match !== null) {
    return match.locator.nth(0);
  }

  throw new Error(`未找到${description}`);
}

async function waitForUiTick(page: PlaywrightPageLike): Promise<void> {
  if (typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(500);
  }
}

async function findVisibleLocatorGroup(
  page: PlaywrightPageLike,
  selectors: readonly string[]
): Promise<{ selector: string; locator: PlaywrightLocatorLike; count: number } | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = await locator.count();
      if (count === 0) {
        continue;
      }

      const firstLocator = locator.nth(0);

      try {
        if (await firstLocator.isVisible()) {
          return {
            selector,
            locator,
            count
          };
        }
      } catch {
        return {
          selector,
          locator,
          count
        };
      }
    }

    if (attempt < 19) {
      await waitForUiTick(page);
    }
  }

  return null;
}

async function findExistingLocatorGroup(
  page: PlaywrightPageLike,
  selectors: readonly string[]
): Promise<{ selector: string; locator: PlaywrightLocatorLike; count: number } | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = await locator.count();

      if (count > 0) {
        return {
          selector,
          locator,
          count
        };
      }
    }

    if (attempt < 19) {
      await waitForUiTick(page);
    }
  }

  return null;
}

async function hasExplicitVisibleSignal(
  page: PlaywrightPageLike,
  selectors: readonly string[]
): Promise<boolean> {
  return (await findVisibleLocatorGroup(page, selectors)) !== null;
}

async function bringPageToFront(page: PlaywrightPageLike): Promise<void> {
  if (typeof page.bringToFront === "function") {
    await page.bringToFront();
    return;
  }

  if (!isCdpCapablePage(page)) {
    return;
  }

  const client = await page.context().newCDPSession(page);
  await client.send("Page.bringToFront");
}

interface EditorCaretState {
  ready: boolean;
  hasSelection: boolean;
  isCollapsed: boolean;
  activeInEditor: boolean;
  selectedBlockCount: number;
}

interface EditorStartState extends EditorCaretState {
  atStart: boolean;
}

type ContentBlockKind = "video" | "image" | "empty";

interface DraftResidualState {
  videos: number;
  videoCovers: number;
  images: number;
  textLength: number;
}

async function readEditorCaretState(
  page: PlaywrightPageLike
): Promise<EditorCaretState | null> {
  if (typeof page.evaluate !== "function") {
    return null;
  }

  return page.evaluate<EditorCaretState, readonly string[]>((selectors) => {
    const editor = selectors
      .map((selector) => document.querySelector(selector))
      .find((candidate): candidate is HTMLElement => {
        return candidate instanceof HTMLElement;
      });
    const selection = window.getSelection();

    if (!(editor instanceof HTMLElement) || selection === null) {
      return {
        ready: false,
        hasSelection: false,
        isCollapsed: false,
        activeInEditor: false,
        selectedBlockCount: 0
      };
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const activeElement = document.activeElement;
    const activeInEditor =
      activeElement instanceof HTMLElement &&
      (activeElement === editor || editor.contains(activeElement));
    const anchorInEditor =
      anchorNode !== null &&
      (anchorNode === editor || editor.contains(anchorNode));
    const focusInEditor =
      focusNode !== null &&
      (focusNode === editor || editor.contains(focusNode));
    const hasSelection = selection.rangeCount > 0 && anchorInEditor && focusInEditor;
    const selectedBlockCount = editor.querySelectorAll(".excore-selected-node").length;
    const ready =
      hasSelection &&
      selection.isCollapsed &&
      activeInEditor &&
      selectedBlockCount === 0;

    return {
      ready,
      hasSelection,
      isCollapsed: selection.isCollapsed,
      activeInEditor,
      selectedBlockCount
    };
  }, EDITOR_BODY_SELECTORS);
}

async function readEditorStartState(
  page: PlaywrightPageLike
): Promise<EditorStartState | null> {
  if (typeof page.evaluate !== "function") {
    return null;
  }

  return page.evaluate<EditorStartState, readonly string[]>((selectors) => {
    const editor = selectors
      .map((selector) => document.querySelector(selector))
      .find((candidate): candidate is HTMLElement => {
        return candidate instanceof HTMLElement;
      });
    const selection = window.getSelection();

    if (!(editor instanceof HTMLElement) || selection === null) {
      return {
        ready: false,
        hasSelection: false,
        isCollapsed: false,
        activeInEditor: false,
        selectedBlockCount: 0,
        atStart: false
      };
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const activeElement = document.activeElement;
    const activeInEditor =
      activeElement instanceof HTMLElement &&
      (activeElement === editor || editor.contains(activeElement));
    const anchorInEditor =
      anchorNode !== null &&
      (anchorNode === editor || editor.contains(anchorNode));
    const focusInEditor =
      focusNode !== null &&
      (focusNode === editor || editor.contains(focusNode));
    const hasSelection = selection.rangeCount > 0 && anchorInEditor && focusInEditor;
    const selectedBlockCount = editor.querySelectorAll(".excore-selected-node").length;
    const ready =
      hasSelection &&
      selection.isCollapsed &&
      activeInEditor &&
      selectedBlockCount === 0;
    const firstParagraph = editor.querySelector("p");
    const atStart =
      ready &&
      firstParagraph !== null &&
      anchorNode !== null &&
      (anchorNode === firstParagraph || firstParagraph.contains(anchorNode)) &&
      selection.anchorOffset === 0 &&
      selection.focusOffset === 0;

    return {
      ready,
      hasSelection,
      isCollapsed: selection.isCollapsed,
      activeInEditor,
      selectedBlockCount,
      atStart
    };
  }, EDITOR_BODY_SELECTORS);
}

async function readContentBlockOrder(
  page: PlaywrightPageLike
): Promise<ContentBlockKind[] | undefined> {
  if (typeof page.evaluate !== "function") {
    return undefined;
  }

  return page.evaluate<ContentBlockKind[], readonly string[]>((selectors) => {
    const editor = selectors
      .map((selector) => document.querySelector(selector))
      .find((candidate): candidate is HTMLElement => {
        return candidate instanceof HTMLElement;
      });

    if (!(editor instanceof HTMLElement)) {
      return [];
    }

    const blocks: ContentBlockKind[] = [];

    for (const child of Array.from(editor.children)) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }

      if (
        child.matches('div.video[data-widget="video"]') ||
        child.querySelector('div.video[data-widget="video"], .video-container video')
      ) {
        blocks.push("video");
        continue;
      }

      if (
        child.querySelector(
          '.index_module_content__cffb2914, .index_module_img__cffb2914'
        )
      ) {
        blocks.push("image");
        continue;
      }

      const compactText = (child.textContent ?? "").replace(/\s+/gu, "").trim();
      const hasMedia = child.querySelector("img, video") !== null;

      if (compactText.length === 0 && !hasMedia) {
        blocks.push("empty");
      }
    }

    return blocks;
  }, EDITOR_BODY_SELECTORS);
}

async function removeEmptyEditorChildren(
  page: PlaywrightPageLike
): Promise<number> {
  if (typeof page.evaluate !== "function") {
    return 0;
  }

  const removedCount = await page.evaluate<number, readonly string[]>((selectors) => {
    const editor = selectors
      .map((selector) => document.querySelector(selector))
      .find((candidate): candidate is HTMLElement => {
        return candidate instanceof HTMLElement;
      });

    if (!(editor instanceof HTMLElement)) {
      return 0;
    }

    let removed = 0;

    for (const child of Array.from(editor.children)) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }

      const compactText = (child.textContent ?? "").replace(/\s+/gu, "").trim();
      const hasMedia =
        child.matches('div.video[data-widget="video"]') ||
        child.querySelector(
          'img, video, div.video[data-widget="video"], .video-container video, .index_module_content__cffb2914, .index_module_img__cffb2914'
        ) !== null;

      if (compactText.length === 0 && !hasMedia) {
        child.remove();
        removed += 1;
      }
    }

    if (removed > 0) {
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return removed;
  }, EDITOR_BODY_SELECTORS);

  if (removedCount > 0) {
    await waitForUiTick(page);
  }

  return removedCount;
}

async function forceClearTitleField(page: PlaywrightPageLike): Promise<boolean> {
  if (typeof page.evaluate !== "function") {
    return false;
  }

  return page.evaluate<boolean, readonly string[]>((selectors) => {
    const marker = "__ixbrowserForceClearTitle";
    void marker;

    let cleared = false;

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));

      for (const element of elements) {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          element.value = "";
          element.dispatchEvent(new InputEvent("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          cleared = true;
          continue;
        }

        if (element instanceof HTMLElement && element.isContentEditable) {
          element.textContent = "";
          element.dispatchEvent(new InputEvent("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          cleared = true;
        }
      }
    }

    return cleared;
  }, TITLE_INPUT_SELECTORS);
}

async function forceClearEditorDraft(page: PlaywrightPageLike): Promise<boolean> {
  if (typeof page.evaluate !== "function") {
    return false;
  }

  const cleared = await page.evaluate<boolean, readonly string[]>((selectors) => {
    const marker = "__ixbrowserForceClearEditorDraft";
    void marker;

    const editor = selectors
      .map((selector) => document.querySelector(selector))
      .find((candidate): candidate is HTMLElement => {
        return candidate instanceof HTMLElement;
      });

    if (!(editor instanceof HTMLElement)) {
      return false;
    }

    editor.focus();
    editor.innerHTML = "<p><br></p>";
    const selection = window.getSelection();
    const paragraph = editor.querySelector("p");

    if (selection !== null && paragraph instanceof HTMLElement) {
      const range = document.createRange();
      range.setStart(paragraph, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, EDITOR_BODY_SELECTORS);

  if (cleared) {
    await waitForUiTick(page);
  }

  return cleared;
}

async function readDraftResidualState(
  page: PlaywrightPageLike
): Promise<DraftResidualState> {
  const videos = await page
    .locator('.ProseMirror div.video[data-widget="video"]')
    .count();
  const videoCovers = await page
    .locator('.ProseMirror div.video[data-widget="video"] video[poster]')
    .count();
  const images = await page
    .locator('.ProseMirror .index_module_content__cffb2914')
    .count();
  const textLength = (
    (await readFirstTextContentIfPossible(page, EDITOR_BODY_SELECTORS)) ?? ""
  )
    .replace(/\s+/gu, "")
    .trim().length;

  return {
    videos,
    videoCovers,
    images,
    textLength
  };
}

function formatDraftResidualError(state: DraftResidualState): string {
  const details: string[] = [];

  if (state.videos > 0) {
    details.push(`残留视频=${state.videos}`);
  }

  if (state.images > 0) {
    details.push(`残留配图=${state.images}`);
  }

  if (state.textLength > 0) {
    details.push(`残留文字长度=${state.textLength}`);
  }

  if (details.length === 0) {
    return "旧草稿未清空，已停止本次发布";
  }

  return `旧草稿未清空，已停止本次发布（${details.join("；")}）`;
}

async function getVisibleSignalCount(
  page: PlaywrightPageLike,
  selectors: readonly string[]
): Promise<number> {
  const match = await findVisibleLocatorGroup(page, selectors);
  return match?.count ?? 0;
}

function isCdpCapablePage(
  page: PlaywrightPageLike
): page is PlaywrightPageLike & {
  context(): {
    newCDPSession(target: unknown): Promise<{
      send(method: string, params?: Record<string, unknown>): Promise<any>;
    }>;
  };
} {
  return typeof (page as { context?: unknown }).context === "function";
}

async function setInputFilesRobustly(
  page: PlaywrightPageLike,
  selectors: readonly string[],
  files: string | readonly string[],
  description: string
): Promise<void> {
  const normalizedFiles = Array.isArray(files) ? [...files] : [files];

  if (isCdpCapablePage(page)) {
    const client = await page.context().newCDPSession(page);
    const document = await client.send("DOM.getDocument", {
      depth: -1,
      pierce: true
    });

    for (const selector of selectors) {
      const result = await client.send("DOM.querySelector", {
        nodeId: document.root.nodeId,
        selector
      });

      if (typeof result.nodeId === "number" && result.nodeId > 0) {
        await client.send("DOM.setFileInputFiles", {
          nodeId: result.nodeId,
          files: normalizedFiles
        });
        return;
      }
    }
  }

  const match = await findExistingLocatorGroup(page, selectors);

  if (match === null) {
    throw new Error(`未找到${description}`);
  }

  await match.locator.nth(0).setInputFiles(
    normalizedFiles.length === 1 ? normalizedFiles[0] : normalizedFiles
  );
}

async function clickFirstVisibleIfPresent(
  page: PlaywrightPageLike,
  selectors: readonly string[]
): Promise<boolean> {
  const match = await findVisibleLocatorGroup(page, selectors);

  if (match === null) {
    return false;
  }

  await match.locator.nth(0).click();
  return true;
}

async function waitForSelectorsToDisappear(
  page: PlaywrightPageLike,
  selectors: readonly string[],
  description: string,
  maxAttempts = 120
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let hasMatch = false;

    for (const selector of selectors) {
      const count = await page.locator(selector).count();

      if (count > 0) {
        hasMatch = true;
        break;
      }
    }

    if (!hasMatch) {
      return;
    }

    await waitForUiTick(page);
  }

  throw new Error(`${description}未结束`);
}

async function hasAnySelector(page: PlaywrightPageLike, selectors: readonly string[]) {
  for (const selector of selectors) {
    if ((await page.locator(selector).count()) > 0) {
      return true;
    }
  }

  return false;
}

async function waitForVideoConfirmInterval(page: PlaywrightPageLike): Promise<void> {
  if (typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(VIDEO_CONFIRM_RETRY_DELAY_MS);
    return;
  }

  await waitForUiTick(page);
}

async function clickVideoConfirmUntilDialogCloses(
  page: PlaywrightPageLike
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const clicked = await clickFirstVisibleIfPresent(
      page,
      VIDEO_COVER_CONFIRM_SELECTORS
    );

    if (!clicked) {
      return false;
    }

    await waitForVideoConfirmInterval(page);

    if (!(await hasAnySelector(page, OPEN_DIALOG_SELECTORS))) {
      return true;
    }
  }

  return false;
}

async function waitForInlineImageCountIncrease(
  page: PlaywrightPageLike,
  expectedCount: number
): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const currentCount = await getVisibleSignalCount(page, INLINE_IMAGE_SELECTORS);

    if (currentCount >= expectedCount) {
      return;
    }

    await waitForUiTick(page);
  }

  const finalCount = await getVisibleSignalCount(page, INLINE_IMAGE_SELECTORS);
  throw new Error(
    `文章配图未按顺序插入（当前=${finalCount}；期望至少=${expectedCount}）`
  );
}

async function closeUnexpectedDialogs(page: PlaywrightPageLike): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const hasDialog = (await findExistingLocatorGroup(page, OPEN_DIALOG_SELECTORS)) !== null;

    if (!hasDialog) {
      return;
    }

    const clicked = await clickFirstVisibleIfPresent(page, DIALOG_CLOSE_SELECTORS);

    if (!clicked) {
      return;
    }

    await waitForUiTick(page);
  }
}

async function readFirstInputValueIfPossible(
  page: PlaywrightPageLike,
  selectors: readonly string[]
): Promise<string | null> {
  const match = await findExistingLocatorGroup(page, selectors);

  if (match === null) {
    return null;
  }

  const locator = match.locator.nth(0);

  if (typeof locator.inputValue !== "function") {
    return null;
  }

  try {
    return await locator.inputValue();
  } catch {
    return null;
  }
}

async function readFirstTextContentIfPossible(
  page: PlaywrightPageLike,
  selectors: readonly string[]
): Promise<string | null> {
  const match = await findExistingLocatorGroup(page, selectors);

  if (match === null) {
    return null;
  }

  const locator = match.locator.nth(0);

  if (typeof locator.textContent !== "function") {
    return null;
  }

  try {
    return await locator.textContent();
  } catch {
    return null;
  }
}

async function waitForDialogTextToClear(
  page: PlaywrightPageLike,
  dialogSelectors: readonly string[],
  pendingTexts: readonly string[],
  description: string,
  maxAttempts = 120,
  minWarmupAttempts = 6
): Promise<void> {
  let sawPendingText = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const dialogText = await readFirstTextContentIfPossible(page, dialogSelectors);

    if (dialogText === null) {
      if (sawPendingText || attempt >= minWarmupAttempts) {
        return;
      }

      await waitForUiTick(page);
      continue;
    }

    const compactText = dialogText.replace(/\s+/gu, " ").trim();
    const hasPendingText = pendingTexts.some((text) => compactText.includes(text));

    if (hasPendingText) {
      sawPendingText = true;
      await waitForUiTick(page);
      continue;
    }

    if (sawPendingText || attempt >= minWarmupAttempts) {
      return;
    }

    await waitForUiTick(page);
  }

  throw new Error(`${description}未结束`);
}

function createPlaywrightPageAdapter(page: PlaywrightPageLike): PenguinPublishPageLike {
  let baselineEditorVideoCount = 0;
  let baselineEditorVideoCoverCount = 0;

  return {
    goto(url, options) {
      return page.goto(url, options);
    },
    async ensureLoggedIn() {
      const currentUrl =
        typeof page.evaluate === "function"
          ? await page.evaluate(() => window.location.href).catch(() => "")
          : "";

      if (
        typeof currentUrl === "string" &&
        currentUrl.includes("om.qq.com/userAuth/index")
      ) {
        throw new Error("当前窗口未登录，请先在 ixBrowser 对应窗口完成扫码登录后重试");
      }

      if (await hasExplicitVisibleSignal(page, LOGIN_REQUIRED_SELECTORS)) {
        throw new Error("当前窗口未登录，请先在 ixBrowser 对应窗口完成扫码登录后重试");
      }
    },
    async resetDraft() {
      await bringPageToFront(page);
      await closeUnexpectedDialogs(page);

      const titleLocator = await findVisibleLocatorGroup(page, TITLE_INPUT_SELECTORS);

      if (titleLocator !== null) {
        await titleLocator.locator.nth(0).fill("");
      }

      await forceClearTitleField(page);

      if (!page.keyboard) {
        await forceClearEditorDraft(page);
        return;
      }

      const editor = await pickVisibleLocator(page, EDITOR_BODY_SELECTORS, "正文编辑区");
      await bringPageToFront(page);
      await editor.click();

      try {
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Delete");
      } catch {
        // ignore
      }

      try {
        await page.keyboard.press("Control+End");
      } catch {
        // ignore
      }

      try {
        await page.keyboard.press("End");
      } catch {
        // ignore
      }

      await forceClearEditorDraft(page);

      for (let attempt = 0; attempt < DRAFT_CLEAR_MAX_BACKSPACES; attempt += 1) {
        const residualState = await readDraftResidualState(page);

        if (
          residualState.videos === 0 &&
          residualState.images === 0 &&
          residualState.textLength === 0
        ) {
          baselineEditorVideoCount = residualState.videos;
          baselineEditorVideoCoverCount = residualState.videoCovers;
          return;
        }

        await bringPageToFront(page);
        await page.keyboard.press("Backspace");

        if ((attempt + 1) % DRAFT_CLEAR_CHECK_INTERVAL === 0) {
          await waitForUiTick(page);
        }
      }

      const residualState = await readDraftResidualState(page);

      if (
        residualState.videos > 0 ||
        residualState.images > 0 ||
        residualState.textLength > 0
      ) {
        throw new Error(formatDraftResidualError(residualState));
      }
    },
    async fillTitle(title) {
      await bringPageToFront(page);
      await forceClearTitleField(page);
      const locator = await pickVisibleLocator(
        page,
        TITLE_INPUT_SELECTORS,
        "可用标题输入框"
      );
      await locator.fill(title);

      const currentValue =
        (await readFirstInputValueIfPossible(page, TITLE_INPUT_SELECTORS)) ??
        (await readFirstTextContentIfPossible(page, TITLE_INPUT_SELECTORS));

      if (currentValue !== null && currentValue.trim() !== title.trim()) {
        throw new Error("标题未填入目标内容");
      }
    },
    async focusEditorBody() {
      const locator = await pickVisibleLocator(page, EDITOR_BODY_SELECTORS, "正文编辑区");
      const paragraphMatch = await findVisibleLocatorGroup(page, [
        'div.ProseMirror.ExEditor-basic[contenteditable="true"] p',
        '[data-exeditor-root][contenteditable="true"] p',
        'div.ProseMirror[contenteditable="true"] p'
      ]);

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await bringPageToFront(page);

        if (paragraphMatch !== null) {
          await paragraphMatch.locator
            .nth(Math.max(0, paragraphMatch.count - 1))
            .click();
        } else {
          await locator.click();
        }

        try {
          await page.keyboard?.press("End");
        } catch {
          // ignore
        }

        const caretState = await readEditorCaretState(page);

        if (caretState?.ready ?? true) {
          return;
        }

        await locator.click();
        await waitForUiTick(page);
      }

      throw new Error("正文光标未准备好，已自动重试恢复失败");
    },
    async moveEditorCursorToStart() {
      if (!page.keyboard) {
        throw new Error("浏览器页面不支持键盘操作，无法移动正文光标");
      }

      const locator = await pickVisibleLocator(page, EDITOR_BODY_SELECTORS, "正文编辑区");
      await locator.click();

      for (let attempt = 0; attempt < DRAFT_CLEAR_MAX_BACKSPACES; attempt += 1) {
        await bringPageToFront(page);
        await page.keyboard.press("ArrowLeft");

        if ((attempt + 1) % DRAFT_CLEAR_CHECK_INTERVAL !== 0) {
          continue;
        }

        const startState = await readEditorStartState(page);

        if (startState?.atStart ?? false) {
          return;
        }

        await waitForUiTick(page);
      }

      const finalState = await readEditorStartState(page);

      if (finalState?.atStart ?? false) {
        return;
      }

      throw new Error("正文光标未移动到最前，已自动重试恢复失败");
    },
    async uploadVideo(videoPath) {
      await bringPageToFront(page);
      const trigger = await pickVisibleLocator(
        page,
        VIDEO_TRIGGER_SELECTORS,
        "视频插入按钮"
      );
      await trigger.click();

      await setInputFilesRobustly(
        page,
        VIDEO_UPLOAD_INPUT_SELECTORS,
        videoPath,
        "可用视频上传控件"
      );
    },
    async fillVideoTitle(title) {
      await bringPageToFront(page);
      await waitForDialogTextToClear(
        page,
        OPEN_DIALOG_BODY_SELECTORS,
        VIDEO_UPLOAD_PENDING_TEXTS,
        "视频上传流程",
        VIDEO_UPLOAD_WAIT_ATTEMPTS
      );
      const locator = await pickVisibleLocator(
        page,
        VIDEO_MODAL_TITLE_SELECTORS,
        "视频标题输入框"
      );
      await locator.fill(title);

      const currentValue =
        typeof locator.inputValue === "function"
          ? await locator.inputValue().catch(() => null)
          : null;

      if (currentValue !== null && currentValue.trim().length === 0) {
        throw new Error("视频标题未填入成功");
      }
    },
    async setVideoCover(videoCoverPath) {
      await bringPageToFront(page);
      const trigger = await findVisibleLocatorGroup(
        page,
        VIDEO_COVER_TRIGGER_SELECTORS
      );

      if (trigger !== null) {
        await trigger.locator.nth(0).click();
      }

      await setInputFilesRobustly(
        page,
        VIDEO_COVER_UPLOAD_INPUT_SELECTORS,
        videoCoverPath,
        "可用视频封面上传控件"
      );
      await waitForDialogTextToClear(
        page,
        OPEN_DIALOG_BODY_SELECTORS,
        VIDEO_UPLOAD_PENDING_TEXTS,
        "视频上传流程",
        VIDEO_UPLOAD_WAIT_ATTEMPTS
      );
      if (await clickVideoConfirmUntilDialogCloses(page)) {
        return;
      }

      try {
        await waitForSelectorsToDisappear(
          page,
          OPEN_DIALOG_SELECTORS,
          "视频上传弹窗",
          60
        );
      } catch {
        const videoTitleValue = await readFirstInputValueIfPossible(
          page,
          VIDEO_MODAL_TITLE_SELECTORS
        );
        const dialogText = await readFirstTextContentIfPossible(
          page,
          OPEN_DIALOG_BODY_SELECTORS
        );
        const details: string[] = [];

        if (videoTitleValue !== null) {
          details.push(
            videoTitleValue.trim().length > 0
              ? `视频标题="${videoTitleValue}"`
              : "视频标题为空"
          );
        }

        if (typeof dialogText === "string" && dialogText.trim().length > 0) {
          const compactText = dialogText.replace(/\s+/gu, " ").trim();
          details.push(`弹窗文本=${compactText.slice(0, 120)}`);
        }

        throw new Error(
          details.length > 0
            ? `视频上传弹窗未结束（${details.join("；")}）`
            : "视频上传弹窗未结束"
        );
      }
    },
    async ensureVideoReady() {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const currentVideoCount = await page
          .locator('.ProseMirror div.video[data-widget="video"]')
          .count();
        const currentVideoCoverCount = await page
          .locator('.ProseMirror div.video[data-widget="video"] video[poster]')
          .count();

        if (
          currentVideoCount > baselineEditorVideoCount &&
          currentVideoCoverCount > baselineEditorVideoCoverCount
        ) {
          return;
        }

        await waitForUiTick(page);
      }

      const videoCount = await page
        .locator('.ProseMirror div.video[data-widget="video"]')
        .count();
      const coverCount = await page
        .locator('.ProseMirror div.video[data-widget="video"] video[poster]')
        .count();
      throw new Error(
        `视频未插入正文（视频数=${videoCount}；封面数=${coverCount}）`
      );
    },
    async insertArticleImages(articleImagePaths) {
      for (const [index, articleImagePath] of articleImagePaths.entries()) {
        await bringPageToFront(page);
        const trigger = await pickVisibleLocator(
          page,
          INLINE_IMAGE_TRIGGER_SELECTORS,
          "文章配图插入按钮"
        );
        await trigger.click();
        await clickFirstVisibleIfPresent(page, INLINE_IMAGE_UPLOAD_TAB_SELECTORS);
        await setInputFilesRobustly(
          page,
          INLINE_IMAGE_UPLOAD_INPUT_SELECTORS,
          articleImagePath,
          "文章配图本地上传控件"
        );
        const confirmButton = await pickVisibleLocator(
          page,
          INLINE_IMAGE_CONFIRM_SELECTORS,
          "文章配图确认按钮"
        );
        await confirmButton.click();
        await waitForSelectorsToDisappear(page, OPEN_DIALOG_SELECTORS, "文章配图弹窗");
        await waitForInlineImageCountIncrease(page, index + 1);
      }
    },
    async removeEmptyContentBlocks() {
      await bringPageToFront(page);
      await removeEmptyEditorChildren(page);
    },
    async setArticleCover(articleCoverPath) {
      await bringPageToFront(page);
      const trigger = await pickVisibleLocator(
        page,
        ARTICLE_COVER_TRIGGER_SELECTORS,
        "文章封面入口按钮"
      );
      await trigger.click();
      await clickFirstVisibleIfPresent(page, ARTICLE_COVER_LOCAL_TAB_SELECTORS);
      await setInputFilesRobustly(
        page,
        ARTICLE_COVER_UPLOAD_INPUT_SELECTORS,
        articleCoverPath,
        "文章封面本地上传控件"
      );
      const confirmButton = await pickVisibleLocator(
        page,
        ARTICLE_COVER_CONFIRM_SELECTORS,
        "文章封面确认按钮"
      );
      await confirmButton.click();
    },
    async applyDeclaration() {
      await bringPageToFront(page);
      if (await hasExplicitVisibleSignal(page, DECLARATION_CONFIRMED_SELECTORS)) {
        return;
      }

      const trigger = await pickVisibleLocator(
        page,
        DECLARATION_TRIGGER_SELECTORS,
        "自主声明入口按钮"
      );
      await trigger.click();

      const option = await pickVisibleLocator(
        page,
        DECLARATION_OPTION_SELECTORS,
        "剧情演绎，仅供娱乐选项"
      );
      await option.click();

      const confirmButton = await pickVisibleLocator(
        page,
        DECLARATION_CONFIRM_SELECTORS,
        "自主声明确认按钮"
      );
      await confirmButton.click();
    },
    async applyAiDeclaration() {
      await bringPageToFront(page);
      if (await hasExplicitVisibleSignal(page, AI_DECLARATION_CONFIRMED_SELECTORS)) {
        return;
      }

      const openedPendingEntry = await clickFirstVisibleIfPresent(
        page,
        AI_DECLARATION_PENDING_SELECTORS
      );

      if (!openedPendingEntry) {
        return;
      }

      const submitButton = await pickVisibleLocator(
        page,
        AI_DECLARATION_SUBMIT_SELECTORS,
        "AI声明提交按钮"
      );
      await submitButton.click();
    },
    async readPrePublishState(): Promise<PenguinPrePublishStateInput> {
      await bringPageToFront(page);
      const titleText =
        (await readFirstInputValueIfPossible(page, TITLE_INPUT_SELECTORS)) ??
        (await readFirstTextContentIfPossible(page, TITLE_INPUT_SELECTORS));

      return {
        hasTitle: await hasExplicitVisibleSignal(page, TITLE_INPUT_SELECTORS),
        hasVideo: await hasExplicitVisibleSignal(page, VIDEO_READY_SELECTORS),
        hasVideoCover: await hasExplicitVisibleSignal(
          page,
          VIDEO_COVER_READY_SELECTORS
        ),
        insertedImageCount: await getVisibleSignalCount(page, INLINE_IMAGE_SELECTORS),
        declarationConfirmed: await hasExplicitVisibleSignal(
          page,
          DECLARATION_CONFIRMED_SELECTORS
        ),
        aiDeclarationConfirmed: await hasExplicitVisibleSignal(
          page,
          AI_DECLARATION_CONFIRMED_SELECTORS
        ),
        titleText: titleText?.trim(),
        contentBlockOrder: await readContentBlockOrder(page),
        articleCover: {
          coverApplied: await hasExplicitVisibleSignal(
            page,
            ARTICLE_COVER_APPLIED_SELECTORS
          )
        }
      };
    },
    async capturePrePublishEvidence(label, evidenceDir) {
      if (typeof page.screenshot !== "function") {
        return null;
      }

      await mkdir(evidenceDir, { recursive: true });
      const filePath = join(evidenceDir, `${label}.png`);
      await page.screenshot({
        path: filePath,
        fullPage: true
      });
      return filePath;
    },
    async clickPublish() {
      if (page.getByRole) {
        await page.getByRole("button", { name: /发布/u }).click();
        return;
      }

      const locator = await pickVisibleLocator(page, [
        'button:has-text("发布")',
        '[role="button"]:has-text("发布")'
      ], "可用发布按钮");
      await locator.click();
    }
  };
}

function normalizePublishPage(page: unknown): PenguinPublishPageLike {
  if (isPenguinPublishPageLike(page)) {
    return page;
  }

  if (isPlaywrightPageLike(page)) {
    return createPlaywrightPageAdapter(page);
  }

  throw new Error("浏览器页面对象不支持企鹅号发布流程");
}

async function runPublishArticle(
  input: Omit<PublishArticleInput, "page"> & { page: unknown }
): Promise<PublishArticleResult> {
  return publishArticle({
    ...input,
    page: normalizePublishPage(input.page)
  });
}

function getBrowserPage(browser: BrowserLike): Promise<unknown> {
  const existingPage = browser.contexts()[0]?.pages()[0];
  if (existingPage) {
    return Promise.resolve(existingPage);
  }

  return browser.newPage();
}

function formatSummary(result: WindowRunResult): string {
  return `${result.profileId}窗口：${result.title} ${result.message}`;
}

function formatModeHint(mode: RuntimeConfig["mode"]): string {
  return mode === "auto-publish"
    ? "当前是正式模式，全自动发布，可切换到开发模式。"
    : "当前是开发模式，半自动发布，可切换到正式模式。";
}

function formatModeSwitchResult(mode: RuntimeConfig["mode"]): string {
  return mode === "auto-publish"
    ? "已切换到正式模式，全自动发布。"
    : "已切换到开发模式，半自动发布。";
}

const defaultDependencies: RunCommandDependencies = {
  loadConfig,
  saveConfig,
  allocateVideosForProfiles,
  movePublishedVideoToUsed,
  pickRandomCover,
  pickArticleAssetSet,
  openProfile,
  connectBrowser: defaultConnectBrowser,
  publishArticle: runPublishArticle,
  writeRunEvent
};

export async function runCommandReport(
  command: string,
  overrides: Partial<RunCommandDependencies> = {}
): Promise<RunCommandReport> {
  const deps: RunCommandDependencies = {
    ...defaultDependencies,
    ...overrides
  };
  const config = await deps.loadConfig(DEFAULT_CONFIG_PATH);
  const parsedCommand = parsePublishCommand(command);

  if (parsedCommand.kind === "mode-switch") {
    const nextConfig: RuntimeConfig = {
      ...config,
      mode: parsedCommand.mode
    };
    await deps.saveConfig(DEFAULT_CONFIG_PATH, nextConfig);

    return {
      summaries: [formatModeSwitchResult(parsedCommand.mode)],
      results: []
    };
  }

  const profileIds = parsedCommand.profileIds;
  const allocations = await deps.allocateVideosForProfiles(
    join(config.assetsRoot, "videos"),
    profileIds
  );
  const coverDir = join(config.assetsRoot, "video-covers");
  const logFile = buildLogFilePath(join(config.assetsRoot, "logs"));
  const summaries: string[] = [];
  const results: WindowRunResult[] = [];

  for (const allocation of allocations) {
    let coverPath: string | null = null;
    let articleAssets: PickedArticleAssetSet | null = null;
    let browser: BrowserLike | undefined;
    let result: WindowRunResult = {
      profileId: allocation.profileId,
      title: allocation.title,
      videoPath: allocation.videoPath,
      coverPath,
      status: "failed",
      message: "未开始执行"
    };

    try {
      coverPath = await deps.pickRandomCover(coverDir, allocation.videoPath);
      articleAssets = await deps.pickArticleAssetSet(
        join(config.assetsRoot, "pictures"),
        ""
      );
      const profile = await deps.openProfile(
        config.ixBrowserApiBaseUrl,
        allocation.profileId
      );
      const endpoint = resolveBrowserEndpoint(profile);
      browser = await deps.connectBrowser(endpoint);
      const page = await getBrowserPage(browser);
      const publishResult = await deps.publishArticle({
        page,
        publishUrl: config.penguinPublishUrl,
        title: allocation.title,
        videoPath: allocation.videoPath,
        videoCoverPath: coverPath,
        articleImagePaths: [
          articleAssets.picture1Path,
          articleAssets.picture2Path
        ],
        articleCoverPath: articleAssets.articleCoverPath,
        mode: config.mode,
        evidenceDir: join(config.assetsRoot, "logs")
      });

      result = {
        profileId: allocation.profileId,
        title: allocation.title,
        videoPath: allocation.videoPath,
        coverPath,
        status: publishResult.status,
        message: publishResult.message
      };

      if (publishResult.status === "published") {
        try {
          await deps.movePublishedVideoToUsed(
            allocation.videoPath,
            config.assetsRoot
          );
        } catch (moveError) {
          result = {
            ...result,
            status: "failed",
            message: `${publishResult.message}；移动已发布视频失败：${formatErrorMessage(moveError)}`
          };
        }
      }
    } catch (error) {
      result = {
        profileId: allocation.profileId,
        title: allocation.title,
        videoPath: allocation.videoPath,
        coverPath,
        status: "failed",
        message: formatErrorMessage(error)
      };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          result = {
            profileId: allocation.profileId,
            title: allocation.title,
            videoPath: allocation.videoPath,
            coverPath,
            status: "failed",
            message:
              result.status === "failed"
                ? `${result.message}；关闭浏览器失败：${formatErrorMessage(closeError)}`
                : `关闭浏览器失败：${formatErrorMessage(closeError)}`
          };
        }
      }
    }

    try {
      await deps.writeRunEvent(logFile, result);
    } catch (logError) {
      result = {
        ...result,
        status: "failed",
        message:
          result.status === "failed"
            ? `${result.message}；写日志失败：${formatErrorMessage(logError)}`
            : `写日志失败：${formatErrorMessage(logError)}`
      };
    }

    summaries.push(formatSummary(result));
    results.push(result);
  }

  return {
    summaries,
    results
  };
}

export async function runCommand(
  command: string,
  overrides: Partial<RunCommandDependencies> = {}
): Promise<string[]> {
  const report = await runCommandReport(command, overrides);
  return report.summaries;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const command = argv.join(" ").trim();

  if (command.length === 0) {
    console.error("请提供命令，例如：发视频 1-2");
    return 1;
  }

  try {
    const parsedCommand = parsePublishCommand(command);

    if (parsedCommand.kind === "publish") {
      const config = await loadConfig(DEFAULT_CONFIG_PATH);
      console.log(formatModeHint(config.mode));
    }

    const report = await runCommandReport(command);

    for (const summary of report.summaries) {
      console.log(summary);
    }

    return report.results.some((result) => result.status === "failed") ? 1 : 0;
  } catch (error) {
    console.error(formatErrorMessage(error));
    return 1;
  }
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === resolve(currentFilePath)) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
