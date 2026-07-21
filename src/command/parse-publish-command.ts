import { parseWindowRange } from "./parse-window-range.js";

export interface PublishCommand {
  kind: "publish";
  profileIds: number[];
}

export function parsePublishCommand(input: string): PublishCommand {
  const trimmedInput = input.trim();

  return {
    kind: "publish",
    profileIds: parseWindowRange(trimmedInput)
  };
}
