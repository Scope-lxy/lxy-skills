export interface IxBrowserApiSuccess<T> {
  error: {
    code: number;
    message: string;
  };
  data: T;
}

export interface IxBrowserRequestOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

type AbortSource = "timeout" | "external" | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIxBrowserApiSuccess<T>(value: unknown): value is IxBrowserApiSuccess<T> {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  return (
    typeof value.error.code === "number" &&
    typeof value.error.message === "string" &&
    "data" in value
  );
}

function createRequestSignal(
  timeoutMs?: number,
  signal?: AbortSignal
): {
  signal?: AbortSignal;
  cleanup: () => void;
  getAbortSource: () => AbortSource;
} {
  if (timeoutMs === undefined && !signal) {
    return {
      signal: undefined,
      cleanup: () => {},
      getAbortSource: () => undefined
    };
  }

  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  let abortSource: AbortSource;

  const abortFromSource = () => {
    abortSource = "external";
    controller.abort(signal?.reason);
  };

  if (signal) {
    if (signal.aborted) {
      abortSource = "external";
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", abortFromSource, { once: true });
    }
  }

  if (timeoutMs !== undefined) {
    timeoutHandle = setTimeout(() => {
      abortSource = "timeout";
      controller.abort(new Error(`ixBrowser API 请求超时: ${timeoutMs}ms`));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    getAbortSource: () => abortSource,
    cleanup: () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (signal) {
        signal.removeEventListener("abort", abortFromSource);
      }
    }
  };
}

export async function postIxBrowser<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  options: IxBrowserRequestOptions = {}
): Promise<IxBrowserApiSuccess<T>> {
  const { fetchImpl = fetch, timeoutMs, signal } = options;
  const requestSignal = createRequestSignal(timeoutMs, signal);

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: requestSignal.signal
    });

    if (!response.ok) {
      throw new Error(`ixBrowser API 请求失败: ${response.status}`);
    }

    const parsed = (await response.json()) as unknown;
    if (!isIxBrowserApiSuccess<T>(parsed)) {
      throw new Error("ixBrowser API 响应格式不正确");
    }

    return parsed;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError" &&
      requestSignal.signal?.aborted
    ) {
      const abortSource = requestSignal.getAbortSource();
      const reason = requestSignal.signal.reason;

      if (abortSource === "timeout") {
        if (reason instanceof Error) {
          throw reason;
        }

        throw new Error(`ixBrowser API 请求超时: ${timeoutMs}ms`);
      }

      if (abortSource === "external") {
        if (reason instanceof Error) {
          throw reason;
        }

        if (reason === undefined) {
          throw new Error("ixBrowser API 请求已取消");
        }

        throw new Error(`ixBrowser API 请求已取消: ${String(reason)}`);
      }

      if (reason instanceof Error) {
        throw reason;
      }
    }

    throw error;
  } finally {
    requestSignal.cleanup();
  }
}
