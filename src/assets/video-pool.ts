import { constants } from "node:fs";
import { access, mkdir, readdir, rename, stat } from "node:fs/promises";
import { extname, join, parse } from "node:path";

export interface AllocatedVideo {
  profileId: number;
  videoPath: string;
  title: string;
}

export async function allocateVideosForProfiles(
  videosDir: string,
  profileIds: number[]
): Promise<AllocatedVideo[]> {
  const fileNames = (await readdir(videosDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
    .map((entry) => entry.name);

  const files = (
    await Promise.all(
      fileNames.map(async (fileName) => {
        const filePath = join(videosDir, fileName);
        const fileStats = await stat(filePath);

        return {
          fileName,
          createdAtMs: fileStats.birthtimeMs
        };
      })
    )
  )
    .sort((left, right) => {
      if (left.createdAtMs !== right.createdAtMs) {
        return left.createdAtMs - right.createdAtMs;
      }

      return left.fileName.localeCompare(right.fileName, "zh-CN");
    })
    .map((file) => file.fileName);

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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function movePublishedVideoToUsed(
  videoPath: string,
  assetsRoot: string
): Promise<string> {
  if (extname(videoPath).toLowerCase() !== ".mp4") {
    throw new Error("只允许移动 mp4 视频");
  }

  const usedDir = join(assetsRoot, "used");
  await mkdir(usedDir, { recursive: true });

  const parsedVideo = parse(videoPath);
  let targetPath = join(usedDir, parsedVideo.base);

  for (let index = 1; await pathExists(targetPath); index += 1) {
    targetPath = join(usedDir, `${parsedVideo.name}-${index}${parsedVideo.ext}`);
  }

  await rename(videoPath, targetPath);
  return targetPath;
}
