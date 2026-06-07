import type { PublishMode } from "../config/types.js";
import { parseWindowRange } from "./parse-window-range.js";

const COMMAND_PREFIX = String.raw`\/?(?:发企鹅号|发视频)`;
const MODE_SWITCH = new RegExp(`^${COMMAND_PREFIX}\\s+(开发模式|正式模式)$`, "u");

export type PublishCommand =
  | {
      kind: "publish";
      profileIds: number[];
    }
  | {
      kind: "mode-switch";
      mode: PublishMode;
    };

export function parsePublishCommand(input: string): PublishCommand {
  const trimmedInput = input.trim();
  const modeMatch = trimmedInput.match(MODE_SWITCH);

  if (modeMatch) {
    return {
      kind: "mode-switch",
      mode:
        modeMatch[1] === "正式模式" ? "auto-publish" : "pause-before-publish"
    };
  }

  return {
    kind: "publish",
    profileIds: parseWindowRange(trimmedInput)
  };
}
