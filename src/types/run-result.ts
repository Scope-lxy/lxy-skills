export type WindowStatus = "draft-saved" | "failed";

export interface WindowRunResult {
  profileId: number;
  title: string;
  videoPath: string;
  coverPath: string | null;
  status: WindowStatus;
  message: string;
}
