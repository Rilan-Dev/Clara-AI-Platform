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

const http: AxiosInstance = axios.create({
  timeout: 30_000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

http.interceptors.request.use((config) => {
  config.headers["x-request-id"] = `omen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

      return Promise.reject(
        new ApiError(502, "NETWORK_ERROR", "Cannot reach the Clara backend. Ensure it is running on port 3000."),
      );
    }

    const { status, data } = error.response;
    const message =
      (data as { error?: string; message?: string } | undefined)?.error ??
      (data as { error?: string; message?: string } | undefined)?.message ??
      `Request failed (${status})`;

    if (status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }

    return Promise.reject(new ApiError(status, String(status), message, data));
  },
);

export default http;
