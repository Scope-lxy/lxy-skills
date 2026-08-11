import { describe, expect, it } from "vitest";
import { createPlaywrightPageAdapter } from "../src/cli.js";

class FakeLocator {
  constructor(
    private readonly page: FakePage,
    private readonly selector: string
  ) {}

  async click(): Promise<void> {
    this.page.handleClick(this.selector);
  }

  async count(): Promise<number> {
    return this.page.getCount(this.selector);
  }

  async fill(value: string): Promise<void> {
    this.page.handleFill(this.selector, value);
  }

  async inputValue(): Promise<string> {
    return this.page.handleInputValue(this.selector);
  }

  async isVisible(): Promise<boolean> {
    return (await this.count()) > 0;
  }

  async setInputFiles(files: string | string[]): Promise<void> {
    this.page.handleSetInputFiles(this.selector, files);
  }

  async textContent(): Promise<string | null> {
    return this.page.handleTextContent(this.selector);
  }

  nth(): FakeLocator {
    return this;
  }
}

class FakePage {
  coverTriggerClicks = 0;
  coverInputVisible = true;
  coverPickerOpened = false;
  coverFileName: string | null = null;
  dialogCoverPreviewVisible = false;
  titleValue: string;
  clearSelectedFileNameAfterUpload: boolean;

  constructor(
    titleValue: string,
    options: {
      clearSelectedFileNameAfterUpload?: boolean;
    } = {}
  ) {
    this.titleValue = titleValue;
    this.clearSelectedFileNameAfterUpload =
      options.clearSelectedFileNameAfterUpload ?? false;
  }

  async goto(): Promise<void> {
    return;
  }

  locator(selector: string): FakeLocator {
    return new FakeLocator(this, selector);
  }

  async bringToFront(): Promise<void> {
    return;
  }

  async evaluate<TResult>(
    pageFunction: ((arg?: unknown) => TResult) | string
  ): Promise<TResult> {
    const source =
      typeof pageFunction === "string" ? pageFunction : pageFunction.toString();

    if (source.includes("__ixbrowserReadVideoCoverSelectionName")) {
      return this.coverFileName as TResult;
    }

    if (source.includes("__ixbrowserHasVideoCoverPreviewSignal")) {
      return this.dialogCoverPreviewVisible as TResult;
    }

    if (source.includes("__ixbrowserReadVideoConfirmProgressState")) {
      return {
        dialogOpen: false,
        buttonPresent: false,
        buttonBusy: false
      } as TResult;
    }

    if (source.includes("window.location.href")) {
      return "https://om.qq.com/main/creation/article/publish" as TResult;
    }

    if (source.includes("tabs=") || source.includes("dialogs.length")) {
      return "fake-snapshot" as TResult;
    }

    return null as TResult;
  }

  getCount(selector: string): number {
    if (selector.includes('span.omui-inputautogrowing__inner')) {
      return 1;
    }

    if (
      selector.includes('input[placeholder="请输入标题名称"]') ||
      selector.includes('input[placeholder*="标题名称"]') ||
      selector.includes('.omui-dialog input[placeholder*="标题"]')
    ) {
      return 1;
    }

    if (selector.includes('button:has-text("上传封面")')) {
      return 1;
    }

    if (selector.includes('li.omui-tab__label:has-text("上传封面")')) {
      return 1;
    }

    if (selector.includes('input[type="file"]')) {
      return this.coverInputVisible ? 1 : 0;
    }

    if (selector.includes(".video-cover-preview img")) {
      return this.dialogCoverPreviewVisible ? 1 : 0;
    }

    if (selector.includes('.ProseMirror div.video[data-widget="video"] video[poster]')) {
      return this.dialogCoverPreviewVisible ? 1 : 0;
    }

    if (selector.includes('.ProseMirror div.video[data-widget="video"]')) {
      return 1;
    }

    return 0;
  }

  handleClick(selector: string): void {
    if (
      selector.includes('button:has-text("上传封面")') ||
      selector.includes('button:has-text("自定义封面")') ||
      selector.includes("text=上传封面")
    ) {
      this.coverTriggerClicks += 1;
      this.coverPickerOpened = true;
    }
  }

  handleFill(selector: string, value: string): void {
    if (selector.includes("标题")) {
      this.titleValue = value;
    }
  }

  handleInputValue(selector: string): string {
    if (selector.includes("标题")) {
      return this.titleValue;
    }

    return "";
  }

  handleSetInputFiles(_selector: string, files: string | string[]): void {
    const first = Array.isArray(files) ? files[0] : files;

    if (!this.coverInputVisible || typeof first !== "string") {
      throw new Error("cover input unavailable");
    }

    if (!this.coverPickerOpened) {
      return;
    }

    this.dialogCoverPreviewVisible = true;

    if (this.clearSelectedFileNameAfterUpload) {
      this.coverFileName = null;
      return;
    }

    this.coverFileName = first.split(/[\\/]/u).pop() ?? first;
  }

  handleTextContent(_selector: string): string | null {
    return null;
  }
}

describe("createPlaywrightPageAdapter", () => {
  it("reopens the cover trigger during final video metadata verification", async () => {
    const page = new FakePage("测试标题");
    const adapter = createPlaywrightPageAdapter(page);

    await expect(
      adapter.ensureVideoReady("测试标题", "C:/covers/测试封面.jpg")
    ).resolves.toBeUndefined();

    expect(page.coverTriggerClicks).toBe(1);
    expect(page.coverFileName).toBe("测试封面.jpg");
  });

  it("accepts the dialog cover preview when the input no longer exposes the file name", async () => {
    const page = new FakePage("测试标题", {
      clearSelectedFileNameAfterUpload: true
    });
    const adapter = createPlaywrightPageAdapter(page);

    await expect(
      adapter.ensureVideoReady("测试标题", "C:/covers/测试封面.jpg")
    ).resolves.toBeUndefined();

    expect(page.coverTriggerClicks).toBe(1);
    expect(page.dialogCoverPreviewVisible).toBe(true);
  });
});
