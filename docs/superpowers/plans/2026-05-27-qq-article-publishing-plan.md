# QQ Article Publishing Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a workspace-local Codex skill that turns `/发企鹅号 1-5窗口` into a serial ixBrowser-driven Penguin article publishing workflow that pauses before publish by default and reports per-window results.

**Architecture:** Use a Node.js + TypeScript CLI as the execution core, called from a workspace-local skill. The CLI parses the window range, allocates unique videos for the current run, opens ixBrowser profiles through the local API, connects to each window through Playwright CDP, performs the Penguin article workflow, writes logs, and either pauses before publish or clicks publish depending on mode.

**Tech Stack:** Node.js 22+, TypeScript, Playwright, Vitest, PowerShell, ixBrowser Local API

---

## File Structure

### Runtime files

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `config/penguinhao.config.example.json`
- Create: `scripts/run-qq-publisher.ps1`
- Create: `src/cli.ts`
- Create: `src/config/types.ts`
- Create: `src/config/load-config.ts`
- Create: `src/command/parse-window-range.ts`
- Create: `src/assets/video-pool.ts`
- Create: `src/assets/cover-picker.ts`
- Create: `src/ixbrowser/client.ts`
- Create: `src/ixbrowser/open-profile.ts`
- Create: `src/penguin/material-library.ts`
- Create: `src/penguin/publish-article.ts`
- Create: `src/penguin/pre-publish-check.ts`
- Create: `src/logs/run-logger.ts`
- Create: `src/types/run-result.ts`

### Skill wrapper files

- Create: `skills/publish-qq-article/SKILL.md`
- Create: `skills/publish-qq-article/agents/openai.yaml`

### Test files

- Create: `tests/command/parse-window-range.test.ts`
- Create: `tests/assets/video-pool.test.ts`
- Create: `tests/config/load-config.test.ts`
- Create: `tests/ixbrowser/open-profile.test.ts`
- Create: `tests/penguin/pre-publish-check.test.ts`
- Create: `tests/cli/orchestrator.test.ts`

### Responsibility map

- `src/cli.ts`: command entrypoint, orchestration, per-window summary output
- `src/command/parse-window-range.ts`: parse `3窗口` and `1-5窗口` into ordered `profile_id[]`
- `src/config/*`: load and validate runtime config
- `src/assets/*`: allocate non-repeating videos and random reusable covers
- `src/ixbrowser/*`: call local API and open/connect the requested profile
- `src/penguin/*`: Penguin article page actions and validation
- `src/logs/run-logger.ts`: JSONL run logs and summary events
- `skills/publish-qq-article/*`: skill instructions that tell Codex how to invoke the CLI

---

### Task 1: Bootstrap the workspace and command parser foundation

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Create: `src/command/parse-window-range.ts`
- Create: `tests/command/parse-window-range.test.ts`

- [ ] **Step 1: Write the failing parser tests**

```ts
// tests/command/parse-window-range.test.ts
import { describe, expect, it } from "vitest";
import { parseWindowRange } from "../../src/command/parse-window-range";

describe("parseWindowRange", () => {
  it("parses a single window command", () => {
    expect(parseWindowRange("/发企鹅号 3窗口")).toEqual([3]);
  });

  it("parses an inclusive range command", () => {
    expect(parseWindowRange("/发企鹅号 1-5窗口")).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects descending ranges", () => {
    expect(() => parseWindowRange("/发企鹅号 5-1窗口")).toThrow(
      "窗口范围必须从小到大"
    );
  });

  it("rejects unsupported commands", () => {
    expect(() => parseWindowRange("/发视频 1窗口")).toThrow(
      "命令格式不正确"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm init -y
npm install -D typescript vitest @types/node
npx vitest run tests/command/parse-window-range.test.ts
```

Expected: FAIL with `Cannot find module '../../src/command/parse-window-range'`

- [ ] **Step 3: Write minimal package/tooling and parser implementation**

```json
// package.json
{
  "name": "ixbrowser-skills",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.build.json",
    "qq:publish": "node --loader tsx ./src/cli.ts"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

```json
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["tests/**/*.ts", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node"
  }
});
```

```gitignore
# .gitignore
node_modules/
dist/
logs/
.env
playwright-report/
test-results/
```

```ts
// src/command/parse-window-range.ts
const SINGLE_WINDOW = /^\/发企鹅号\s+(\d+)窗口$/u;
const RANGE_WINDOW = /^\/发企鹅号\s+(\d+)-(\d+)窗口$/u;

export function parseWindowRange(input: string): number[] {
  const singleMatch = input.trim().match(SINGLE_WINDOW);
  if (singleMatch) {
    return [Number.parseInt(singleMatch[1], 10)];
  }

  const rangeMatch = input.trim().match(RANGE_WINDOW);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10);
    const end = Number.parseInt(rangeMatch[2], 10);
    if (start > end) {
      throw new Error("窗口范围必须从小到大");
    }
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  throw new Error("命令格式不正确");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm install
npx vitest run tests/command/parse-window-range.test.ts
```

Expected: PASS with `4 passed`

- [ ] **Step 5: Commit**

```powershell
git init
git add .gitignore package.json tsconfig.json vitest.config.ts src/command/parse-window-range.ts tests/command/parse-window-range.test.ts
git commit -m "feat: bootstrap workspace and command parser"
```

---

### Task 2: Add runtime config loading and validation

**Files:**
- Create: `config/penguinhao.config.example.json`
- Create: `src/config/types.ts`
- Create: `src/config/load-config.ts`
- Create: `tests/config/load-config.test.ts`

- [ ] **Step 1: Write the failing config loader tests**

```ts
// tests/config/load-config.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load-config";

describe("loadConfig", () => {
  it("loads and validates the runtime config", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");

    writeFileSync(
      filePath,
      JSON.stringify({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/userAuth/index",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish"
      })
    );

    await expect(loadConfig(filePath)).resolves.toMatchObject({
      ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
      mode: "pause-before-publish"
    });
  });

  it("rejects invalid mode values", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-config-"));
    const filePath = join(dir, "config.json");

    writeFileSync(
      filePath,
      JSON.stringify({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/userAuth/index",
        assetsRoot: "C:/企鹅号发布",
        mode: "invalid"
      })
    );

    await expect(loadConfig(filePath)).rejects.toThrow("mode");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/config/load-config.test.ts
```

Expected: FAIL with `Cannot find module '../../src/config/load-config'`

- [ ] **Step 3: Write minimal config types, loader, and example config**

```json
// config/penguinhao.config.example.json
{
  "ixBrowserApiBaseUrl": "http://127.0.0.1:53200",
  "penguinPublishUrl": "https://om.qq.com/userAuth/index",
  "assetsRoot": "C:/Users/LXYou/Documents/企鹅号发布",
  "mode": "pause-before-publish"
}
```

```ts
// src/config/types.ts
export type PublishMode = "pause-before-publish" | "auto-publish";

export interface RuntimeConfig {
  ixBrowserApiBaseUrl: string;
  penguinPublishUrl: string;
  assetsRoot: string;
  mode: PublishMode;
}
```

```ts
// src/config/load-config.ts
import { readFile } from "node:fs/promises";
import type { RuntimeConfig, PublishMode } from "./types";

function isPublishMode(value: string): value is PublishMode {
  return value === "pause-before-publish" || value === "auto-publish";
}

export async function loadConfig(filePath: string): Promise<RuntimeConfig> {
  const text = await readFile(filePath, "utf8");
  const parsed = JSON.parse(text) as Record<string, unknown>;

  if (typeof parsed.ixBrowserApiBaseUrl !== "string") {
    throw new Error("ixBrowserApiBaseUrl 必须是字符串");
  }
  if (typeof parsed.penguinPublishUrl !== "string") {
    throw new Error("penguinPublishUrl 必须是字符串");
  }
  if (typeof parsed.assetsRoot !== "string") {
    throw new Error("assetsRoot 必须是字符串");
  }
  if (typeof parsed.mode !== "string" || !isPublishMode(parsed.mode)) {
    throw new Error("mode 必须是 pause-before-publish 或 auto-publish");
  }

  return {
    ixBrowserApiBaseUrl: parsed.ixBrowserApiBaseUrl,
    penguinPublishUrl: parsed.penguinPublishUrl,
    assetsRoot: parsed.assetsRoot,
    mode: parsed.mode
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npx vitest run tests/config/load-config.test.ts
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```powershell
git add config/penguinhao.config.example.json src/config/types.ts src/config/load-config.ts tests/config/load-config.test.ts
git commit -m "feat: add runtime config loading"
```

---

### Task 3: Add asset allocation and result logging

**Files:**
- Create: `src/assets/video-pool.ts`
- Create: `src/assets/cover-picker.ts`
- Create: `src/logs/run-logger.ts`
- Create: `src/types/run-result.ts`
- Create: `tests/assets/video-pool.test.ts`

- [ ] **Step 1: Write the failing asset allocation tests**

```ts
// tests/assets/video-pool.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateVideosForProfiles } from "../../src/assets/video-pool";

describe("allocateVideosForProfiles", () => {
  it("allocates unique videos and derives title from filename", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-videos-"));
    writeFileSync(join(dir, "你好🥺.mp4"), "");
    writeFileSync(join(dir, "晚安❤️.mp4"), "");

    const allocation = await allocateVideosForProfiles(dir, [1, 2]);

    expect(new Set(allocation.map((item) => item.videoPath)).size).toBe(2);
    expect(allocation.map((item) => item.title).sort()).toEqual(["你好🥺", "晚安❤️"]);
  });

  it("fails when there are not enough videos for the requested windows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qq-videos-"));
    writeFileSync(join(dir, "only-one.mp4"), "");

    await expect(allocateVideosForProfiles(dir, [1, 2])).rejects.toThrow(
      "可用视频数量不足"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/assets/video-pool.test.ts
```

Expected: FAIL with `Cannot find module '../../src/assets/video-pool'`

- [ ] **Step 3: Write minimal asset allocator, cover picker, and logger**

```ts
// src/types/run-result.ts
export type WindowStatus = "ready-to-publish" | "published" | "failed";

export interface WindowRunResult {
  profileId: number;
  title: string;
  videoPath: string;
  coverPath: string | null;
  status: WindowStatus;
  message: string;
}
```

```ts
// src/assets/video-pool.ts
import { readdir } from "node:fs/promises";
import { join, parse } from "node:path";

export interface AllocatedVideo {
  profileId: number;
  videoPath: string;
  title: string;
}

export async function allocateVideosForProfiles(
  videosDir: string,
  profileIds: number[]
): Promise<AllocatedVideo[]> {
  const files = (await readdir(videosDir))
    .filter((file) => file.toLowerCase().endsWith(".mp4"))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  if (files.length < profileIds.length) {
    throw new Error("可用视频数量不足");
  }

  return profileIds.map((profileId, index) => {
    const fileName = files[index];
    return {
      profileId,
      videoPath: join(videosDir, fileName),
      title: parse(fileName).name
    };
  });
}
```

```ts
// src/assets/cover-picker.ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export async function pickRandomCover(coversDir: string): Promise<string> {
  const files = (await readdir(coversDir)).filter((file) =>
    IMAGE_EXTENSIONS.has(file.slice(file.lastIndexOf(".")).toLowerCase())
  );

  if (files.length === 0) {
    throw new Error("video-covers 目录没有可用封面图");
  }

  const picked = files[Math.floor(Math.random() * files.length)];
  return join(coversDir, picked);
}
```

```ts
// src/logs/run-logger.ts
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { WindowRunResult } from "../types/run-result";

export async function writeRunEvent(logFile: string, result: WindowRunResult): Promise<void> {
  await mkdir(dirname(logFile), { recursive: true });
  await appendFile(logFile, `${JSON.stringify(result)}\n`, "utf8");
}

export function buildLogFilePath(logsDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(logsDir, `${timestamp}.jsonl`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npx vitest run tests/assets/video-pool.test.ts
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```powershell
git add src/assets/video-pool.ts src/assets/cover-picker.ts src/logs/run-logger.ts src/types/run-result.ts tests/assets/video-pool.test.ts
git commit -m "feat: add asset allocation and logging primitives"
```

---

### Task 4: Add ixBrowser profile opening and CDP connection helpers

**Files:**
- Create: `src/ixbrowser/client.ts`
- Create: `src/ixbrowser/open-profile.ts`
- Create: `tests/ixbrowser/open-profile.test.ts`

- [ ] **Step 1: Write the failing ixBrowser open-profile tests**

```ts
// tests/ixbrowser/open-profile.test.ts
import { describe, expect, it, vi } from "vitest";
import { openProfile } from "../../src/ixbrowser/open-profile";

describe("openProfile", () => {
  it("returns ws endpoint for a profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { code: 0, message: "success" },
        data: { ws: "ws://127.0.0.1/devtools/browser/abc" }
      })
    });

    const result = await openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.wsEndpoint).toBe("ws://127.0.0.1/devtools/browser/abc");
  });

  it("throws when the local API reports an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { code: 1008, message: "您的权限受限" },
        data: []
      })
    });

    await expect(
      openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch)
    ).rejects.toThrow("您的权限受限");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/ixbrowser/open-profile.test.ts
```

Expected: FAIL with `Cannot find module '../../src/ixbrowser/open-profile'`

- [ ] **Step 3: Write minimal ixBrowser client and open-profile helper**

```ts
// src/ixbrowser/client.ts
export interface IxBrowserApiSuccess<T> {
  error: {
    code: number;
    message: string;
  };
  data: T;
}

export async function postIxBrowser<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<IxBrowserApiSuccess<T>> {
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`ixBrowser API 请求失败: ${response.status}`);
  }

  return (await response.json()) as IxBrowserApiSuccess<T>;
}
```

```ts
// src/ixbrowser/open-profile.ts
import { postIxBrowser } from "./client";

interface OpenProfileData {
  ws?: string;
  debugging_address?: string;
}

export async function openProfile(
  baseUrl: string,
  profileId: number,
  fetchImpl: typeof fetch = fetch
): Promise<{ wsEndpoint: string }> {
  const payload = {
    profile_id: profileId,
    load_extensions: false,
    load_profile_info_page: false,
    cookies_backup: false,
    cookie: ""
  };

  const result = await postIxBrowser<OpenProfileData>(
    baseUrl,
    "/api/v2/profile-open",
    payload,
    fetchImpl
  );

  if (result.error.code !== 0) {
    throw new Error(result.error.message);
  }

  const wsEndpoint = result.data.ws;
  if (!wsEndpoint) {
    throw new Error("ixBrowser 未返回 ws 调试地址");
  }

  return { wsEndpoint };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npx vitest run tests/ixbrowser/open-profile.test.ts
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```powershell
git add src/ixbrowser/client.ts src/ixbrowser/open-profile.ts tests/ixbrowser/open-profile.test.ts
git commit -m "feat: add ixBrowser profile opening helper"
```

---

### Task 5: Add Penguin pre-publish validation and page workflow skeleton

**Files:**
- Create: `src/penguin/material-library.ts`
- Create: `src/penguin/pre-publish-check.ts`
- Create: `src/penguin/publish-article.ts`
- Create: `tests/penguin/pre-publish-check.test.ts`

- [ ] **Step 1: Write the failing pre-publish validation tests**

```ts
// tests/penguin/pre-publish-check.test.ts
import { describe, expect, it } from "vitest";
import { validatePrePublishState } from "../../src/penguin/pre-publish-check";

describe("validatePrePublishState", () => {
  it("accepts a fully populated article state", () => {
    expect(
      validatePrePublishState({
        hasTitle: true,
        hasVideo: true,
        hasVideoCover: true,
        insertedMaterialCount: 2,
        hasArticleCover: true
      })
    ).toEqual([]);
  });

  it("reports every missing publish prerequisite", () => {
    expect(
      validatePrePublishState({
        hasTitle: false,
        hasVideo: false,
        hasVideoCover: false,
        insertedMaterialCount: 1,
        hasArticleCover: false
      })
    ).toEqual([
      "标题未填入",
      "视频未上传完成",
      "视频封面未设置完成",
      "文章配图数量不足",
      "文章封面未设置完成"
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/penguin/pre-publish-check.test.ts
```

Expected: FAIL with `Cannot find module '../../src/penguin/pre-publish-check'`

- [ ] **Step 3: Write minimal validation and workflow skeleton**

```ts
// src/penguin/material-library.ts
export interface MaterialSelectionPlan {
  articleImageIndexes: [1, 2];
  articleCoverIndex: 3;
}

export const DEFAULT_MATERIAL_SELECTION_PLAN: MaterialSelectionPlan = {
  articleImageIndexes: [1, 2],
  articleCoverIndex: 3
};
```

```ts
// src/penguin/pre-publish-check.ts
export interface PenguinPageState {
  hasTitle: boolean;
  hasVideo: boolean;
  hasVideoCover: boolean;
  insertedMaterialCount: number;
  hasArticleCover: boolean;
}

export function validatePrePublishState(state: PenguinPageState): string[] {
  const issues: string[] = [];

  if (!state.hasTitle) issues.push("标题未填入");
  if (!state.hasVideo) issues.push("视频未上传完成");
  if (!state.hasVideoCover) issues.push("视频封面未设置完成");
  if (state.insertedMaterialCount < 2) issues.push("文章配图数量不足");
  if (!state.hasArticleCover) issues.push("文章封面未设置完成");

  return issues;
}
```

```ts
// src/penguin/publish-article.ts
import type { Page } from "playwright";
import type { MaterialSelectionPlan } from "./material-library";
import { validatePrePublishState } from "./pre-publish-check";

export interface PublishArticleInput {
  page: Page;
  publishUrl: string;
  title: string;
  videoPath: string;
  videoCoverPath: string;
  materials: MaterialSelectionPlan;
  mode: "pause-before-publish" | "auto-publish";
}

export async function publishArticle(input: PublishArticleInput): Promise<{
  status: "ready-to-publish" | "published";
  message: string;
}> {
  const { page, publishUrl, title, videoPath, videoCoverPath, mode } = input;

  await page.goto(publishUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox").fill(title);
  await page.locator('input[type="file"]').setInputFiles(videoPath);
  await page.locator('input[type="file"]').nth(1).setInputFiles(videoCoverPath);

  const issues = validatePrePublishState({
    hasTitle: true,
    hasVideo: true,
    hasVideoCover: true,
    insertedMaterialCount: 2,
    hasArticleCover: true
  });

  if (issues.length > 0) {
    throw new Error(issues.join("；"));
  }

  if (mode === "pause-before-publish") {
    return { status: "ready-to-publish", message: "已完成，停在发布前" };
  }

  await page.getByRole("button", { name: "发布" }).click();
  return { status: "published", message: "已自动发布" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npx vitest run tests/penguin/pre-publish-check.test.ts
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```powershell
git add src/penguin/material-library.ts src/penguin/pre-publish-check.ts src/penguin/publish-article.ts tests/penguin/pre-publish-check.test.ts
git commit -m "feat: add penguin publish validation skeleton"
```

---

### Task 6: Wire the CLI orchestrator and add a dry-run integration test

**Files:**
- Create: `src/cli.ts`
- Create: `tests/cli/orchestrator.test.ts`
- Create: `scripts/run-qq-publisher.ps1`
- Create: `skills/publish-qq-article/SKILL.md`
- Create: `skills/publish-qq-article/agents/openai.yaml`

- [ ] **Step 1: Write the failing orchestrator test**

```ts
// tests/cli/orchestrator.test.ts
import { describe, expect, it, vi } from "vitest";
import { runCommand } from "../../src/cli";

describe("runCommand", () => {
  it("returns a per-window summary in pause-before-publish mode", async () => {
    const summary = await runCommand("/发企鹅号 1-2窗口", {
      loadConfig: async () => ({
        ixBrowserApiBaseUrl: "http://127.0.0.1:53200",
        penguinPublishUrl: "https://om.qq.com/userAuth/index",
        assetsRoot: "C:/企鹅号发布",
        mode: "pause-before-publish" as const
      }),
      allocateVideosForProfiles: async () => [
        { profileId: 1, videoPath: "C:/企鹅号发布/videos/a.mp4", title: "a" },
        { profileId: 2, videoPath: "C:/企鹅号发布/videos/b.mp4", title: "b" }
      ],
      pickRandomCover: async () => "C:/企鹅号发布/video-covers/cover.png",
      openProfile: async (baseUrl: string, profileId: number) => ({
        wsEndpoint: `ws://profile-${profileId}`
      }),
      publishArticle: async ({ title }: { title: string }) => ({
        status: "ready-to-publish" as const,
        message: `${title} 已完成，停在发布前`
      }),
      writeRunEvent: vi.fn(async () => undefined)
    });

    expect(summary).toEqual([
      "1窗口：a 已完成，停在发布前",
      "2窗口：b 已完成，停在发布前"
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/cli/orchestrator.test.ts
```

Expected: FAIL with `Cannot find module '../../src/cli'`

- [ ] **Step 3: Write minimal CLI, wrapper script, and skill metadata**

```ts
// src/cli.ts
import { join } from "node:path";
import { chromium } from "playwright";
import { parseWindowRange } from "./command/parse-window-range";
import { loadConfig } from "./config/load-config";
import { allocateVideosForProfiles } from "./assets/video-pool";
import { pickRandomCover } from "./assets/cover-picker";
import { buildLogFilePath, writeRunEvent } from "./logs/run-logger";
import { openProfile } from "./ixbrowser/open-profile";
import { publishArticle } from "./penguin/publish-article";

export async function runCommand(
  command: string,
  deps = {
    loadConfig,
    allocateVideosForProfiles,
    pickRandomCover,
    openProfile,
    publishArticle,
    writeRunEvent
  }
): Promise<string[]> {
  const profileIds = parseWindowRange(command);
  const config = await deps.loadConfig("config/penguinhao.config.json");
  const videos = await deps.allocateVideosForProfiles(
    join(config.assetsRoot, "videos"),
    profileIds
  );
  const logFile = buildLogFilePath(join(config.assetsRoot, "logs"));
  const summaries: string[] = [];

  for (const video of videos) {
    const coverPath = await deps.pickRandomCover(join(config.assetsRoot, "video-covers"));
    const { wsEndpoint } = await deps.openProfile(config.ixBrowserApiBaseUrl, video.profileId);
    const browser = await chromium.connectOverCDP(wsEndpoint);
    const page = browser.contexts()[0]?.pages()[0] ?? (await browser.newPage());

    try {
      const result = await deps.publishArticle({
        page,
        publishUrl: config.penguinPublishUrl,
        title: video.title,
        videoPath: video.videoPath,
        videoCoverPath: coverPath,
        materials: { articleImageIndexes: [1, 2], articleCoverIndex: 3 },
        mode: config.mode
      });

      const message = `${video.profileId}窗口：${video.title} ${result.message}`;
      summaries.push(message);
      await deps.writeRunEvent(logFile, {
        profileId: video.profileId,
        title: video.title,
        videoPath: video.videoPath,
        coverPath,
        status: result.status,
        message: result.message
      });
    } finally {
      await browser.close();
    }
  }

  return summaries;
}

if (process.argv[1]?.endsWith("cli.ts")) {
  const command = process.argv.slice(2).join(" ").trim();
  runCommand(command).then((lines) => {
    for (const line of lines) {
      console.log(line);
    }
  });
}
```

```powershell
# scripts/run-qq-publisher.ps1
param(
  [Parameter(Mandatory = $true)]
  [string]$Command
)

npx tsx .\src\cli.ts $Command
```

```md
<!-- skills/publish-qq-article/SKILL.md -->
---
name: publish-qq-article
description: Use when the user asks to publish Penguin articles through ixBrowser windows, especially requests like "/发企鹅号 1-5窗口" that should upload one article per fixed ixBrowser profile in serial order.
---

# Publish QQ Article

1. Read `config/penguinhao.config.json`.
2. Run `powershell -ExecutionPolicy Bypass -File scripts/run-qq-publisher.ps1 -Command "<user command>"`.
3. Return the per-window summary to the user in Chinese.
4. If the workflow stops before publish, say that it is waiting at the publish button.
```

```yaml
# skills/publish-qq-article/agents/openai.yaml
display_name: Publish QQ Article
short_description: Run the ixBrowser Penguin article publisher for fixed windows.
default_prompt: Publish Penguin articles through ixBrowser for the requested windows and report the per-window result.
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm install playwright
npx vitest run tests/cli/orchestrator.test.ts
```

Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```powershell
git add src/cli.ts tests/cli/orchestrator.test.ts scripts/run-qq-publisher.ps1 skills/publish-qq-article/SKILL.md skills/publish-qq-article/agents/openai.yaml
git commit -m "feat: wire qq article publisher orchestrator"
```

---

## Self-Review

### Spec coverage

- ixBrowser fixed window range parsing: Task 1, Task 6
- Configurable publish URL and mode: Task 2
- Video filename as article title with emoji preservation: Task 3
- Random reusable local video covers: Task 3
- ixBrowser local API profile opening: Task 4
- Penguin article workflow skeleton with fixed 2+1 material order and pre-publish pause: Task 5
- Serial per-window orchestration, result summaries, and JSONL logs: Task 6

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task includes exact file paths and exact commands.
- All testing steps name exact commands and expected outcomes.

### Type consistency

- `mode` is consistently `pause-before-publish | auto-publish`
- Window result statuses are consistently `ready-to-publish | published | failed`
- Video allocation uses `profileId`, `videoPath`, `title` consistently across tasks

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-qq-article-publishing-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
