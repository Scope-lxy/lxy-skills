import { afterEach, describe, expect, it, vi } from "vitest";
import { postIxBrowser } from "../../src/ixbrowser/client.js";
import { openProfile } from "../../src/ixbrowser/open-profile.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("openProfile", () => {
  it("closes and reopens the profile when ixBrowser reports it is already open", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { code: 111003, message: "The current profile is already open" },
          data: null
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { code: 0, message: "success" },
          data: null
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { code: 0, message: "success" },
          data: {
            ws: "ws://127.0.0.1/devtools/browser/reopened",
            debugging_address: "127.0.0.1:9555"
          }
        })
      });

    await expect(
      openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch)
    ).resolves.toEqual({
      ws: "ws://127.0.0.1/devtools/browser/reopened",
      debuggingAddress: "127.0.0.1:9555"
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:53200/api/v2/profile-open"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://127.0.0.1:53200/api/v2/profile-close"
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "http://127.0.0.1:53200/api/v2/profile-open"
    );
  });

  it("returns ws and debugging address for a profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { code: 0, message: "success" },
        data: {
          ws: "ws://127.0.0.1/devtools/browser/abc",
          debugging_address: "127.0.0.1:9222"
        }
      })
    });
    const controller = new AbortController();

    const result = await openProfile(
      "http://127.0.0.1:53200",
      5,
      fetchMock as typeof fetch,
      {
        timeoutMs: 3_000,
        signal: controller.signal
      }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:53200/api/v2/profile-open"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        profile_id: 5,
        load_extensions: false,
        load_profile_info_page: false,
        cookies_backup: false,
        cookie: ""
      })
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).not.toBe(controller.signal);
    expect(result).toEqual({
      ws: "ws://127.0.0.1/devtools/browser/abc",
      debuggingAddress: "127.0.0.1:9222"
    });
  });

  it("throws when the local API reports an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { code: 1008, message: "您的权限受限" },
        data: []
      })
    });

    await expect(
      openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch)
    ).rejects.toThrow("您的权限受限");
  });

  it("returns a neutral structure when only debugging address exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { code: 0, message: "success" },
        data: {
          debugging_address: "127.0.0.1:9333"
        }
      })
    });

    await expect(
      openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch)
    ).resolves.toEqual({
      ws: undefined,
      debuggingAddress: "127.0.0.1:9333"
    });
  });

  it("throws when the local API returns neither ws nor debugging address", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { code: 0, message: "success" },
        data: {}
      })
    });

    await expect(
      openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch)
    ).rejects.toThrow("ixBrowser 未返回可用调试地址");
  });

  it("throws when the local API request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500
    });

    await expect(
      openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch)
    ).rejects.toThrow("ixBrowser API 请求失败: 500");
  });

  it("throws when fetch rejects directly", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(
      openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch)
    ).rejects.toThrow("connect ECONNREFUSED");
  });

  it("throws when the local API returns an unexpected JSON structure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          ws: "ws://127.0.0.1/devtools/browser/abc"
        }
      })
    });

    await expect(
      openProfile("http://127.0.0.1:53200", 5, fetchMock as typeof fetch)
    ).rejects.toThrow("ixBrowser API 响应格式不正确");
  });
});

describe("postIxBrowser", () => {
  it("throws the configured timeout error when the request hangs", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const request = postIxBrowser(
      "http://127.0.0.1:53200",
      "/api/v2/profile-open",
      { profile_id: 5 },
      {
        fetchImpl: fetchMock as typeof fetch,
        timeoutMs: 50
      }
    );
    const rejection = expect(request).rejects.toThrow(
      "ixBrowser API 请求超时: 50ms"
    );

    await vi.advanceTimersByTimeAsync(50);

    await rejection;
  });

  it("rethrows the external abort reason when the caller cancels the request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const request = postIxBrowser(
      "http://127.0.0.1:53200",
      "/api/v2/profile-open",
      { profile_id: 5 },
      {
        fetchImpl: fetchMock as typeof fetch,
        signal: controller.signal
      }
    );
    const rejection = expect(request).rejects.toThrow("用户取消请求");

    controller.abort(new Error("用户取消请求"));

    await rejection;
  });

  it("treats string abort reasons as external cancellation even when timeout is configured", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const request = postIxBrowser(
      "http://127.0.0.1:53200",
      "/api/v2/profile-open",
      { profile_id: 5 },
      {
        fetchImpl: fetchMock as typeof fetch,
        timeoutMs: 1_000,
        signal: controller.signal
      }
    );
    const rejection = expect(request).rejects.toThrow(
      "ixBrowser API 请求已取消: 手动停止"
    );

    controller.abort("手动停止");

    await rejection;
  });
});
