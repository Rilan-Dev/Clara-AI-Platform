/**
 * lib/http.ts — Production-grade Axios client for Clara Platform Admin
 *
 * Architecture:
 *   Browser → /api/* (same-origin Next.js routes on port 3000)
 *             → Next.js middleware reads `clara_platform_token` cookie
 *             → route handlers call requireAuth() to validate the session
 *
 * All admin API calls are same-origin. The `clara_platform_token` httpOnly
 * cookie is sent automatically by the browser — no manual token handling.
 */

import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from "axios";
import { clearStoredToken, getStoredToken } from "@/lib/client-auth";
import { getApiBaseUrl } from "@/lib/runtime";

// ─── Normalised error type ────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get isUnauthorized() { return this.status === 401; }
  get isForbidden()    { return this.status === 403; }
  get isNotFound()     { return this.status === 404; }
  get isServerError()  { return this.status >= 500; }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

// ─── Singleton instance ───────────────────────────────────────────────────────

const http: AxiosInstance = axios.create({
  baseURL: `${getApiBaseUrl()}/api`,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ─── Request interceptor ──────────────────────────────────────────────────────

http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    config.headers["x-request-id"] =
      `admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// ─── Response interceptor ────────────────────────────────────────────────────

http.interceptors.response.use(
  (response: AxiosResponse) => response,

  async (error: unknown) => {
    if (!isAxiosError(error)) {
      return Promise.reject(
        new ApiError(0, "UNKNOWN", "An unexpected error occurred.", error)
      );
    }

    const config = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const method = config?.method?.toUpperCase();
    const responseStatus = error.response?.status;
    const retryable =
      !error.response ||
      responseStatus === 408 ||
      responseStatus === 429 ||
      (responseStatus !== undefined && responseStatus >= 500);

    // Only retry idempotent reads once; never duplicate mutations.
    if (config && !config._retry && retryable && (method === "GET" || method === "HEAD")) {
      config._retry = true;
      await new Promise((resolve) => setTimeout(resolve, responseStatus === 429 ? 500 : 150));
      return http.request(config);
    }

    if (!error.response) {
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        return Promise.reject(
          new ApiError(408, "TIMEOUT", "Request timed out. Please try again.")
        );
      }
      return Promise.reject(
        new ApiError(502, "NETWORK_ERROR", "Cannot reach the API.")
      );
    }

    const { status, data } = error.response;
    const message: string =
      (data as Record<string, string>)?.error ??
      (data as Record<string, string>)?.message ??
      `Request failed (${status})`;

    if (status === 401 && typeof window !== "undefined") {
      clearStoredToken();
      window.location.href = "/login";
    }

    return Promise.reject(new ApiError(status, String(status), message, data));
  }
);

export default http;
