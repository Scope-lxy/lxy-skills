import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface PublishRunLockPayload {
  pid: number;
  command: string;
  startedAt: string;
  heartbeatAt?: string;
  token: string;
}

interface PublishRunLockOptions {
  pid?: number;
  now?: () => Date;
  isProcessAlive?: (pid: number) => Promise<boolean>;
  heartbeatIntervalMs?: number;
  staleAfterMs?: number;
}

type ReleasePublishRunLock = () => Promise<void>;

const LOCK_FILE_NAME = "publish-run.lock.json";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_STALE_AFTER_MS = 2 * 60_000;

async function defaultIsProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function buildActiveRunMessage(lock: PublishRunLockPayload): string {
  return `已有发布任务在运行（命令=${lock.command}，开始于=${lock.startedAt}），请等待当前任务结束，不要重试`;
}

function isHeartbeatFresh(
  lock: PublishRunLockPayload,
  now: Date,
  staleAfterMs: number
): boolean {
  const heartbeatSource = lock.heartbeatAt ?? lock.startedAt;
  const heartbeatTime = Date.parse(heartbeatSource);

  if (!Number.isFinite(heartbeatTime)) {
    return false;
  }

  return now.getTime() - heartbeatTime <= staleAfterMs;
}

async function readExistingLock(
  lockPath: string
): Promise<PublishRunLockPayload | null> {
  try {
    const text = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(text) as Partial<PublishRunLockPayload>;

    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.command !== "string" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.token !== "string"
    ) {
      return null;
    }

    return parsed as PublishRunLockPayload;
  } catch {
    return null;
  }
}

export async function acquirePublishRunLock(
  lockDir: string,
  command: string,
  options: PublishRunLockOptions = {}
): Promise<ReleasePublishRunLock> {
  const pid = options.pid ?? process.pid;
  const now = options.now ?? (() => new Date());
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const startedAt = now().toISOString();
  const token = `${pid}:${startedAt}:${Math.random().toString(36).slice(2, 10)}`;
  const payload: PublishRunLockPayload = {
    pid,
    command,
    startedAt,
    heartbeatAt: startedAt,
    token
  };
  const lockPath = join(lockDir, LOCK_FILE_NAME);

  await mkdir(lockDir, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(lockPath, JSON.stringify(payload), {
        encoding: "utf8",
        flag: "wx"
      });

      const heartbeatTimer = setInterval(() => {
        void (async () => {
          const currentLock = await readExistingLock(lockPath);

          if (currentLock?.token !== token) {
            return;
          }

          await writeFile(
            lockPath,
            JSON.stringify({
              ...currentLock,
              heartbeatAt: now().toISOString()
            }),
            "utf8"
          ).catch(() => undefined);
        })();
      }, heartbeatIntervalMs);
      heartbeatTimer.unref?.();

      return async () => {
        clearInterval(heartbeatTimer);
        const currentLock = await readExistingLock(lockPath);

        if (currentLock?.token !== token) {
          return;
        }

        await unlink(lockPath).catch(() => undefined);
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code !== "EEXIST") {
        throw error;
      }

      const existingLock = await readExistingLock(lockPath);

      if (
        existingLock !== null &&
        (await isProcessAlive(existingLock.pid)) &&
        isHeartbeatFresh(existingLock, now(), staleAfterMs)
      ) {
        throw new Error(buildActiveRunMessage(existingLock));
      }

      await unlink(lockPath).catch(() => undefined);
    }
  }

  throw new Error("发布锁处理失败，请稍后重试");
}
