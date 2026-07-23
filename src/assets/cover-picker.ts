import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, parse, relative } from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

interface CoverCandidate {
  filePath: string;
  relativePath: string;
  baseName: string;
  isRootFile: boolean;
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase("zh-CN");
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

async function readCoverCandidates(
  coversDir: string,
  currentDir = coversDir
): Promise<CoverCandidate[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const candidates: CoverCandidate[] = [];

  for (const entry of entries) {
    const entryPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      candidates.push(...(await readCoverCandidates(coversDir, entryPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const parsed = parse(entry.name);
    if (!IMAGE_EXTENSIONS.has(parsed.ext.toLowerCase())) {
      continue;
    }

    candidates.push({
      filePath: entryPath,
      relativePath: relative(coversDir, entryPath),
      baseName: parsed.name,
      isRootFile: currentDir === coversDir
    });
  }

  return candidates.sort((left, right) => {
    if (left.isRootFile !== right.isRootFile) {
      return left.isRootFile ? -1 : 1;
    }

    return left.relativePath.localeCompare(right.relativePath, "zh-CN");
  });
}

function preferRootCandidates(
  candidates: readonly CoverCandidate[]
): readonly CoverCandidate[] {
  const rootCandidates = candidates.filter((candidate) => candidate.isRootFile);
  return rootCandidates.length > 0 ? rootCandidates : candidates;
}

function pickMatchedCover(
  candidates: readonly CoverCandidate[],
  videoPath: string
): string | null {
  const videoBaseName = normalizeName(parse(videoPath).name);
  const exactMatches = candidates.filter((candidate) => {
    return normalizeName(candidate.baseName) === videoBaseName;
  });

  if (exactMatches.length > 0) {
    return pickRandom(preferRootCandidates(exactMatches)).filePath;
  }

  const containingMatches = candidates.filter((candidate) => {
    return normalizeName(candidate.baseName).includes(videoBaseName);
  });

  return containingMatches.length > 0
    ? pickRandom(preferRootCandidates(containingMatches)).filePath
    : null;
}

export async function pickRandomCover(
  coversDir: string,
  videoPath?: string
): Promise<string> {
  if (typeof videoPath === "string" && videoPath.trim().length > 0) {
    const videoDir = dirname(videoPath);

    if (existsSync(videoDir)) {
      const localMatch = pickMatchedCover(
        await readCoverCandidates(videoDir),
        videoPath
      );

      if (localMatch !== null) {
        return localMatch;
      }
    }
  }

  const files = await readCoverCandidates(coversDir);

  if (files.length === 0) {
    throw new Error("video-covers 目录没有可用封面图");
  }

  if (typeof videoPath === "string" && videoPath.trim().length > 0) {
    const matchedCover = pickMatchedCover(files, videoPath);

    if (matchedCover !== null) {
      return matchedCover;
    }
  }

  return pickRandom(files).filePath;
}
