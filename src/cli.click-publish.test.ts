import { describe, expect, it } from "vitest";
import { createPlaywrightPageAdapter } from "./cli.js";

function createSaveDraftPage(availableLabels: readonly string[]) {
  let saved = false;
  const clicks: string[] = [];

  const createLocator = (name: string) => ({
    async click() {
      clicks.push(name);
      saved = true;
    },
    async count() {
      if (name === "text=保存成功") {
        return saved ? 1 : 0;
      }

      return availableLabels.includes(name) ? 1 : 0;
    },
    async isVisible() {
      return true;
    },
    nth() {
      return createLocator(name);
    }
  });

  return {
    clicks,
    page: {
      async bringToFront() {
        return undefined;
      },
      async waitForTimeout() {
        return undefined;
      },
      getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }) {
        expect(role).toBe("button");
        expect(options?.exact).toBe(true);
        return createLocator(String(options?.name ?? ""));
      },
      locator(selector: string) {
        return createLocator(selector);
      }
    }
  };
}

describe("saveDraft", () => {
  it("prefers the exact 存草稿 button", async () => {
    const { page, clicks } = createSaveDraftPage(["存草稿", "保存草稿", "草稿"]);
    const publishPage = createPlaywrightPageAdapter(page as never);

    await publishPage.saveDraft();

    expect(clicks).toEqual(["存草稿"]);
  });

  it("falls back to 保存草稿 and 草稿 in order", async () => {
    const firstFallback = createSaveDraftPage(["保存草稿", "草稿"]);
    await createPlaywrightPageAdapter(firstFallback.page as never).saveDraft();
    expect(firstFallback.clicks).toEqual(["保存草稿"]);

    const secondFallback = createSaveDraftPage(["草稿"]);
    await createPlaywrightPageAdapter(secondFallback.page as never).saveDraft();
    expect(secondFallback.clicks).toEqual(["草稿"]);
  });

  it("confirms the exact title from the content management page", async () => {
    const actions: string[] = [];
    const titleLocator = {
      async count() {
        return 1;
      },
      async isVisible() {
        return true;
      },
      nth() {
        return titleLocator;
      }
    };
    const page = {
      async bringToFront() {
        actions.push("bringToFront");
      },
      async goto(url: string) {
        actions.push(`goto:${url}`);
      },
      async waitForTimeout(timeoutMs: number) {
        actions.push(`wait:${timeoutMs}`);
      },
      getByText(text: string, options?: { exact?: boolean }) {
        expect(text).toBe("目标标题");
        expect(options).toEqual({ exact: true });
        return titleLocator;
      }
    };

    await createPlaywrightPageAdapter(page as never).confirmSavedDraft("目标标题");

    expect(actions).toContain("wait:3000");
    expect(actions).toContain(
      "goto:https://om.qq.com/main/management/articleManage"
    );
  });

  it("rejects a draft that is absent from the content management page", async () => {
    const titleLocator = {
      async count() {
        return 0;
      },
      async isVisible() {
        return false;
      },
      nth() {
        return titleLocator;
      }
    };
    const page = {
      async bringToFront() {
        return undefined;
      },
      async goto() {
        return undefined;
      },
      async waitForTimeout() {
        return undefined;
      },
      getByText() {
        return titleLocator;
      }
    };

    await expect(
      createPlaywrightPageAdapter(page as never).confirmSavedDraft("目标标题")
    ).rejects.toThrow("内容管理列表未找到标题为“目标标题”的草稿");
  });
});
