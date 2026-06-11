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
