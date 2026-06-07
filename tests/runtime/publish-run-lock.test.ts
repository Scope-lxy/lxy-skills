import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquirePublishRunLock } from "../../src/runtime/publish-run-lock.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("acquirePublishRunLock", () => {
  it("acquires and releases a publish lock", async () => {
    const lockDir = mkdtempSync(join(tmpdir(), "qq-publish-lock-"));

    const release = await acquirePublishRunLock(lockDir, "发视频 3", {
      pid: 1001,
      isProcessAlive: async () => true,
      now: () => new Date("2026-06-07T23:00:00.000Z")
    });

    await expect(
      acquirePublishRunLock(lockDir, "发视频 4", {
        pid: 1002,
        isProcessAlive: async (pid) => pid === 1001,
        now: () => new Date("2026-06-07T23:00:10.000Z")
      })
    ).rejects.toThrow("已有发布任务在运行");

    await release();

    const releaseAgain = await acquirePublishRunLock(lockDir, "发视频 4", {
      pid: 1002,
      isProcessAlive: async () => true,
      now: () => new Date("2026-06-07T23:00:20.000Z")
    });
    await releaseAgain();
  });

  it("replaces a stale lock left by a dead process", async () => {
    const lockDir = mkdtempSync(join(tmpdir(), "qq-publish-lock-stale-"));
    const staleLockPath = join(lockDir, "publish-run.lock.json");

    writeFileSync(
      staleLockPath,
      JSON.stringify({
        pid: 9999,
        command: "发视频 1-2",
        startedAt: "2026-06-07T22:00:00.000Z",
        token: "stale-token"
      }),
      "utf8"
    );

    const release = await acquirePublishRunLock(lockDir, "发视频 3", {
      pid: 1003,
      isProcessAlive: async () => false,
      now: () => new Date("2026-06-07T23:10:00.000Z")
    });

    await release();
  });
});
