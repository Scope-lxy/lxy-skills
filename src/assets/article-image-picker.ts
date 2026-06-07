import { readdir } from "node:fs/promises";
import { join, parse } from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

type ArticleAssetRole = "picture1" | "picture2" | "cover";
export type ArticleAssetSelectionMode =
  | "grouped-directory"
  | "matched-triplet"
  | "matched-pictures-mixed-cover"
  | "fully-mixed";

interface ArticleAssetCandidate {
  fileName: string;
  filePath: string;
  role: ArticleAssetRole;
  priority: number;
}

interface ArticleAssetGroup {
  groupName: string;
  candidates: ArticleAssetCandidate[];
}

export interface PickedArticleAssetSet {
  picture1Path: string;
  picture2Path: string;
  articleCoverPath: string;
  version: null | string;
  selectionMode: ArticleAssetSelectionMode;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function isSupportedImage(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(parse(fileName).ext.toLowerCase());
}

function detectExplicitPictureRole(baseName: string): ArticleAssetRole | null {
  if (/(?:配图|插图|图片|图)\s*1/u.test(baseName)) {
    return "picture1";
  }

  if (/(?:配图|插图|图片|图)\s*2/u.test(baseName)) {
    return "picture2";
  }

  return null;
}

function detectFallbackPictureRole(baseName: string): ArticleAssetRole | null {
  if (/^[a-z][\s_-]*1(?:$|\D)/iu.test(baseName)) {
    return "picture1";
  }

  if (/^[a-z][\s_-]*2(?:$|\D)/iu.test(baseName)) {
    return "picture2";
  }

  return null;
}

function detectCandidate(fileName: string, filePath: string): ArticleAssetCandidate | null {
  const baseName = parse(fileName).name;

  if (baseName.includes("封面")) {
    return {
      fileName,
      filePath,
      role: "cover",
      priority: 0
    };
  }

  const explicitRole = detectExplicitPictureRole(baseName);
  if (explicitRole !== null) {
    return {
      fileName,
      filePath,
      role: explicitRole,
      priority: 0
    };
  }

  const fallbackRole = detectFallbackPictureRole(baseName);
  if (fallbackRole !== null) {
    return {
      fileName,
      filePath,
      role: fallbackRole,
      priority: 1
    };
  }

  return null;
}

async function readArticleAssetGroups(picturesDir: string): Promise<ArticleAssetGroup[]> {
  const groupDirs = (await readdir(picturesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const groups: ArticleAssetGroup[] = [];

  for (const groupName of groupDirs) {
    const groupDir = join(picturesDir, groupName);
    const candidates = (await readdir(groupDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && isSupportedImage(entry.name))
      .map((entry) => detectCandidate(entry.name, join(groupDir, entry.name)))
      .filter((entry): entry is ArticleAssetCandidate => entry !== null)
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }

        return left.fileName.localeCompare(right.fileName, "zh-CN");
      });

    groups.push({ groupName, candidates });
  }

  return groups;
}

function hasRole(
  candidates: readonly ArticleAssetCandidate[],
  role: ArticleAssetRole
): boolean {
  return candidates.some((candidate) => candidate.role === role);
}

function pickRole(
  candidates: readonly ArticleAssetCandidate[],
  role: ArticleAssetRole
): ArticleAssetCandidate {
  const matches = candidates.filter((candidate) => candidate.role === role);
  const bestPriority = Math.min(...matches.map((candidate) => candidate.priority));
  const preferredMatches = matches.filter((candidate) => candidate.priority === bestPriority);
  return pickRandom(preferredMatches);
}

export async function pickArticleAssetSet(
  picturesDir: string,
  _coversDir: string
): Promise<PickedArticleAssetSet> {
  const groups = await readArticleAssetGroups(picturesDir);
  const completeGroups = groups.filter((group) => {
    return (
      hasRole(group.candidates, "picture1") &&
      hasRole(group.candidates, "picture2") &&
      hasRole(group.candidates, "cover")
    );
  });

  if (completeGroups.length === 0) {
    throw new Error("pictures 目录缺少完整文章素材组");
  }

  const group = pickRandom(completeGroups);

  return {
    picture1Path: pickRole(group.candidates, "picture1").filePath,
    picture2Path: pickRole(group.candidates, "picture2").filePath,
    articleCoverPath: pickRole(group.candidates, "cover").filePath,
    version: group.groupName,
    selectionMode: "grouped-directory"
  };
}
