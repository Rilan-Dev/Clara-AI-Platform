import { ApiError, createHttpClient, isApiError as isSharedApiError } from "@clara/api-client";

const http = createHttpClient({
  requestIdPrefix: "omen",
  backendUnavailableMessage: "Cannot reach the Clara backend. Ensure it is running on port 3000.",
  onUnauthorized: () => {
    window.location.href = "/login";
  },
});

export { ApiError };

export function isApiError(error: unknown): error is ApiError {
  return isSharedApiError(error);
}

export default http;
