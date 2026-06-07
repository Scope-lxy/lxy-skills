export type PublishMode = "pause-before-publish" | "auto-publish";

export interface RuntimeConfig {
  ixBrowserApiBaseUrl: string;
  penguinPublishUrl: string;
  assetsRoot: string;
  mode: PublishMode;
}
