const COMMAND_PREFIX = String.raw`\/?(?:发企鹅号|发视频)`;
const SINGLE_WINDOW = new RegExp(`^${COMMAND_PREFIX}\\s+(\\d+)(?:窗口)?$`, "u");
const RANGE_WINDOW = new RegExp(
  `^${COMMAND_PREFIX}\\s+(\\d+)-(\\d+)(?:窗口)?$`,
  "u"
);
const COMMAND_ONLY = new RegExp(`^${COMMAND_PREFIX}$`, "u");

const MISSING_WINDOW_HINT = "请回复窗口号，例如：1窗口 或 1-5窗口";

function parseWindowNumber(value: string): number {
  const windowNumber = Number.parseInt(value, 10);

  if (windowNumber < 1) {
    throw new Error("窗口编号必须大于等于 1");
  }

  return windowNumber;
}

export function parseWindowRange(input: string): number[] {
  const trimmedInput = input.trim();
  const singleMatch = trimmedInput.match(SINGLE_WINDOW);

  if (singleMatch) {
    return [parseWindowNumber(singleMatch[1])];
  }

  const rangeMatch = trimmedInput.match(RANGE_WINDOW);
  if (rangeMatch) {
    const start = parseWindowNumber(rangeMatch[1]);
    const end = parseWindowNumber(rangeMatch[2]);

    if (start > end) {
      throw new Error("窗口范围必须从小到大");
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  if (COMMAND_ONLY.test(trimmedInput)) {
    throw new Error(MISSING_WINDOW_HINT);
  }

  throw new Error("命令格式不正确");
}
