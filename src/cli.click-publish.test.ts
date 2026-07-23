import { describe, expect, it } from "vitest";
import { createPlaywrightPageAdapter } from "./cli.js";

describe("clickPublish", () => {
  it("clicks the exact 发布 button instead of 定时发布", async () => {
    let currentUrl = "https://om.qq.com/main/creation/article";
    let clicked = false;

    const page = {
      async bringToFront() {
        return undefined;
      },
      async waitForTimeout() {
        return undefined;
      },
      async evaluate() {
        return currentUrl;
      },
      getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }) {
        expect(role).toBe("button");
        expect(options).toEqual({
          name: "发布",
          exact: true
        });

        return {
          async click() {
            clicked = true;
            currentUrl = "https://om.qq.com/main/management/articleManage";
          }
        };
      }
    };

    const publishPage = createPlaywrightPageAdapter(page as never);
    await publishPage.clickPublish();

    expect(clicked).toBe(true);
  });
});

describe("saveDraft", () => {
  it("prefers the exact 存草稿 button and waits for 保存成功", async () => {
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

        return ["存草稿", "保存草稿", "草稿"].includes(name) ? 1 : 0;
      },
      async isVisible() {
        return true;
      },
      nth() {
        return createLocator(name);
      }
    });
    const page = {
      async bringToFront() {
        return undefined;
      },
      async waitForTimeout() {
        return undefined;
      },
      getByRole(_role: string, options?: { name?: string | RegExp }) {
        return createLocator(String(options?.name ?? ""));
      },
      locator(selector: string) {
        return createLocator(selector);
      }
    };

    await createPlaywrightPageAdapter(page as never).saveDraft();

    expect(clicks).toEqual(["存草稿"]);
  });

  it("waits before checking the exact title in content management", async () => {
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
});
