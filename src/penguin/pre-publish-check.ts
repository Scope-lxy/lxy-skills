export interface ArticleCoverPrePublishState {
  coverApplied: boolean;
}

export type PenguinContentBlockKind = "video" | "image" | "empty";

export interface PenguinPrePublishState {
  hasTitle: boolean;
  hasVideo: boolean;
  hasVideoCover: boolean;
  insertedImageCount: number;
  declarationConfirmed: boolean;
  aiDeclarationConfirmed: boolean;
  titleText?: string;
  contentBlockOrder?: PenguinContentBlockKind[];
  articleCover: ArticleCoverPrePublishState;
}

export type PenguinPrePublishStateInput =
  | {
      hasTitle?: boolean;
      hasVideo?: boolean;
      hasVideoCover?: boolean;
      insertedImageCount?: number;
      declarationConfirmed?: boolean;
      aiDeclarationConfirmed?: boolean;
      titleText?: string;
      contentBlockOrder?: PenguinContentBlockKind[];
      articleCover?: Partial<ArticleCoverPrePublishState> | null;
    }
  | null
  | undefined;

export function validatePrePublishState(
  state: PenguinPrePublishStateInput
): string[] {
  const issues: string[] = [];
  const articleCover = state?.articleCover;

  if (!state?.hasTitle) {
    issues.push("标题未填入");
  }

  if (!state?.hasVideo) {
    issues.push("视频未上传完成");
  }

  if (!state?.hasVideoCover) {
    issues.push("视频封面未设置完成");
  }

  if (state?.insertedImageCount !== 2) {
    issues.push("文章配图数量必须为 2 张");
  }

  if (!state?.declarationConfirmed) {
    issues.push("自主声明未设置为剧情演绎，仅供娱乐");
  }

  if (!state?.aiDeclarationConfirmed) {
    issues.push("AI生成声明未提交");
  }

  if (articleCover == null) {
    issues.push("文章封面状态缺失");
  }

  if (!articleCover?.coverApplied) {
    issues.push("文章封面未设置完成");
  }

  return issues;
}

export function validatePrePublishReviewState(
  state: PenguinPrePublishStateInput,
  input: {
    expectedTitle: string;
  }
): string[] {
  const issues = validatePrePublishState(state);
  const normalizedExpectedTitle = input.expectedTitle.trim();
  const normalizedActualTitle = state?.titleText?.trim();
  const blockOrder = state?.contentBlockOrder;

  if (
    typeof normalizedActualTitle === "string" &&
    normalizedActualTitle.length > 0 &&
    normalizedActualTitle !== normalizedExpectedTitle
  ) {
    issues.push("标题与目标不一致");
  }

  if (Array.isArray(blockOrder) && blockOrder.length > 0) {
    if (blockOrder[0] !== "video") {
      issues.push("正文最前面不是视频");
    }

    const emptyBlockCount = blockOrder.filter((block) => block === "empty").length;

    if (emptyBlockCount > 1) {
      issues.push("正文存在多余空行");
    } else if (blockOrder[0] === "video" && blockOrder[1] === "empty") {
      issues.push("正文视频和第一张配图之间有空行");
    } else if (emptyBlockCount === 1) {
      issues.push("正文存在多余空行");
    }

    if (
      blockOrder.length < 3 ||
      blockOrder[0] !== "video" ||
      blockOrder[1] !== "image" ||
      blockOrder[2] !== "image"
    ) {
      issues.push("正文内容顺序不正确");
    }
  }

  return issues;
}
