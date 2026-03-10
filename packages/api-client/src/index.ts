import axios, { type AxiosInstance, type AxiosResponse, isAxiosError } from "axios";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function buildQueryString(params?: Record<string, string | number | undefined>) {
  if (!params) {
    return "";
  }

  const values = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");

  if (!values.length) {
    return "";
  }

  return `?${new URLSearchParams(values.map(([key, value]) => [key, String(value)])).toString()}`;
}

export function createHttpClient(options: { requestIdPrefix: string; backendUnavailableMessage: string; onUnauthorized?: () => void }) {
  const http: AxiosInstance = axios.create({
    timeout: 30_000,
    withCredentials: true,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  http.interceptors.request.use((config) => {
    config.headers["x-request-id"] = `${options.requestIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return config;
  });

  http.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: unknown) => {
      if (!isAxiosError(error)) {
        return Promise.reject(new ApiError(0, "UNKNOWN", "An unexpected request error occurred.", error));
      }

      if (!error.response) {
        if (error.code === "ECONNABORTED" || error.message?.toLowerCase().includes("timeout")) {
          return Promise.reject(new ApiError(408, "TIMEOUT", "Request timed out. Please try again."));
        }

        return Promise.reject(new ApiError(502, "NETWORK_ERROR", options.backendUnavailableMessage));
      }

      const { status, data } = error.response;
      const message =
        (data as { error?: string; message?: string } | undefined)?.error ??
        (data as { error?: string; message?: string } | undefined)?.message ??
        `Request failed (${status})`;

      if (status === 401 && typeof window !== "undefined") {
        options.onUnauthorized?.();
      }

      return Promise.reject(new ApiError(status, String(status), message, data));
    },
  );

  return http;
}

export async function* streamJsonLineEvents(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        yield JSON.parse(trimmed) as { type: string; payload?: string };
      } catch {
        continue;
      }
    }
  }
}
