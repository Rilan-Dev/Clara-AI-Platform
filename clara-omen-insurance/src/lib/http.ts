/**
 * lib/http.ts — Production-grade Axios client for Omen Insurance Portal
 *
 * Architecture:
 *   Browser → /api/proxy/* (same-origin Next.js route, server-side)
 *             → reads httpOnly `clara_omen_token` cookie
 *             → forwards as `Authorization: Bearer <token>` to clara-backend
 *
 * The client NEVER touches the raw token — it only sends cookies automatically.
 * All authenticated requests go through the proxy which handles token injection.
 */

import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from "axios";
import { clearStoredToken, getStoredToken } from "./auth";

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
  baseURL: "/api/proxy",
  timeout: 30_000,
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

    // Attach a per-request trace ID for server-side correlation
    config.headers["x-request-id"] =
      `omen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// ─── Response interceptor ────────────────────────────────────────────────────

http.interceptors.response.use(
  (response: AxiosResponse) => response,

  (error: unknown) => {
    if (!isAxiosError(error)) {
      return Promise.reject(
        new ApiError(0, "UNKNOWN", "An unexpected error occurred.", error)
      );
    }

    // Network / connection errors (no response received)
    if (!error.response) {
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        return Promise.reject(
          new ApiError(408, "TIMEOUT", "Request timed out. Please try again.")
        );
      }
      return Promise.reject(
        new ApiError(
          502,
          "NETWORK_ERROR",
          "Cannot reach the server. Ensure clara-backend is running on port 3000."
        )
      );
    }

    const { status, data } = error.response;
    const message: string =
      (data as Record<string, string>)?.error ??
      (data as Record<string, string>)?.message ??
      `Request failed (${status})`;

    // 401 → session expired or invalid → kick to login
    if (status === 401 && typeof window !== "undefined") {
      clearStoredToken();
      window.location.href = "/login";
    }

    return Promise.reject(new ApiError(status, String(status), message, data));
  }
);

export default http;
