import axios, {
  type AxiosInstance,
  type AxiosResponse,
  isAxiosError,
} from "axios";

export class ApiError extends Error {
  status: number;
  code: string;
  detail?: unknown;

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

const http: AxiosInstance = axios.create({
  timeout: 20_000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

http.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: unknown) => {
    if (!isAxiosError(error)) {
      return Promise.reject(new ApiError(0, "UNKNOWN", "Unexpected request error", error));
    }

    if (!error.response) {
      const timedOut = error.code === "ECONNABORTED" || error.message.toLowerCase().includes("timeout");

      return Promise.reject(
        new ApiError(timedOut ? 408 : 502, timedOut ? "TIMEOUT" : "NETWORK", timedOut ? "Request timed out" : "Network request failed"),
      );
    }

    const { status, data } = error.response;
    const message =
      typeof data === "object" && data !== null && "message" in data && typeof data.message === "string"
        ? data.message
        : `Request failed (${status})`;

    return Promise.reject(new ApiError(status, String(status), message, data));
  },
);

export default http;
