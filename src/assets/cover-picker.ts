import { readdir } from "node:fs/promises";
import { join, parse, relative } from "node:path";

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

export async function pickRandomCover(
  coversDir: string,
  videoPath?: string
): Promise<string> {
  const files = await readCoverCandidates(coversDir);

  if (files.length === 0) {
    throw new Error("video-covers 目录没有可用封面图");
  }

  if (typeof videoPath === "string" && videoPath.trim().length > 0) {
    const videoBaseName = normalizeName(parse(videoPath).name);
    const exactMatches = files.filter((file) => {
      return normalizeName(file.baseName) === videoBaseName;
    });

    if (exactMatches.length > 0) {
      return pickRandom(preferRootCandidates(exactMatches)).filePath;
    }

    const containingMatches = files.filter((file) => {
      return normalizeName(file.baseName).includes(videoBaseName);
    });

    if (containingMatches.length > 0) {
      return pickRandom(preferRootCandidates(containingMatches)).filePath;
    }
  }

  return pickRandom(files).filePath;
}
