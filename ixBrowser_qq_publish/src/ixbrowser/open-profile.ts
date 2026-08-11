import {
  postIxBrowser,
  type IxBrowserRequestOptions
} from "./client.js";

interface OpenProfileData {
  ws?: string;
  debugging_address?: string;
}

export interface OpenProfileResult {
  ws?: string;
  debuggingAddress?: string;
}

type OpenProfileOptions = Omit<IxBrowserRequestOptions, "fetchImpl">;
const PROFILE_ALREADY_OPEN_ERROR_CODE = 111003;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpenProfileData(value: unknown): value is OpenProfileData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.ws === undefined || typeof value.ws === "string") &&
    (value.debugging_address === undefined ||
      typeof value.debugging_address === "string")
  );
}

function isFetchImplementation(
  value: typeof fetch | OpenProfileOptions
): value is typeof fetch {
  return typeof value === "function";
}

export async function openProfile(
  baseUrl: string,
  profileId: number,
  fetchImplOrOptions: typeof fetch | OpenProfileOptions = fetch,
  options: OpenProfileOptions = {}
): Promise<OpenProfileResult> {
  const requestOptions = isFetchImplementation(fetchImplOrOptions)
    ? { ...options, fetchImpl: fetchImplOrOptions }
    : fetchImplOrOptions;

  const openProfileBody = {
    profile_id: profileId,
    load_extensions: false,
    load_profile_info_page: false,
    cookies_backup: false,
    cookie: ""
  } as const;

  let result = await postIxBrowser<OpenProfileData>(
    baseUrl,
    "/api/v2/profile-open",
    openProfileBody,
    requestOptions
  );

  if (result.error.code === PROFILE_ALREADY_OPEN_ERROR_CODE) {
    const closeResult = await postIxBrowser<null>(
      baseUrl,
      "/api/v2/profile-close",
      {
        profile_id: profileId
      },
      requestOptions
    );

    if (closeResult.error.code !== 0) {
      throw new Error(closeResult.error.message);
    }

    result = await postIxBrowser<OpenProfileData>(
      baseUrl,
      "/api/v2/profile-open",
      openProfileBody,
      requestOptions
    );
  }

  if (result.error.code !== 0) {
    throw new Error(result.error.message);
  }

  if (!isOpenProfileData(result.data)) {
    throw new Error("ixBrowser API 响应格式不正确");
  }

  if (result.data.ws === undefined && result.data.debugging_address === undefined) {
    throw new Error("ixBrowser 未返回可用调试地址");
  }

  return {
    ws: result.data.ws,
    debuggingAddress: result.data.debugging_address
  };
}
